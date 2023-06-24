'use strict';

const request = require('postman-request');
const _ = require('lodash');
const Bottleneck = require('bottleneck');
const fs = require('fs');
const config = require('./config/config');

const entityTemplateReplacementRegex = /{{entity}}/g;
const MAX_ENTITIES_PER_LOOKUP = 10;

let log;
let requestWithDefaults;
let limiter = null;
let summaryFieldsCompiled = null;
let detailFieldsCompiled = null;
let previousSummaryFields = null;
let previousDetailFields = null;

function startup(logger) {
  log = logger;

  const defaults = {};

  if (typeof config.request.cert === 'string' && config.request.cert.length > 0) {
    defaults.cert = fs.readFileSync(config.request.cert);
  }

  if (typeof config.request.key === 'string' && config.request.key.length > 0) {
    defaults.key = fs.readFileSync(config.request.key);
  }

  if (typeof config.request.passphrase === 'string' && config.request.passphrase.length > 0) {
    defaults.passphrase = config.request.passphrase;
  }

  if (typeof config.request.ca === 'string' && config.request.ca.length > 0) {
    defaults.ca = fs.readFileSync(config.request.ca);
  }

  if (typeof config.request.proxy === 'string' && config.request.proxy.length > 0) {
    defaults.proxy = config.request.proxy;
  }

  if (typeof config.request.rejectUnauthorized === 'boolean') {
    defaults.rejectUnauthorized = config.request.rejectUnauthorized;
  }

  if (typeof config.request.secureProtocol === 'string' && config.request.secureProtocol.length > 0) {
    defaults.secureProtocol = config.request.secureProtocol;
  }

  requestWithDefaults = request.defaults(defaults);
}

function _setupLimiter(options) {
  limiter = new Bottleneck({
    maxConcurrent: Number.parseInt(options.maxConcurrent, 10),
    highWater: 100, // no more than 100 lookups can be queued up
    strategy: Bottleneck.strategy.OVERFLOW,
    minTime: Number.parseInt(options.minTime, 10)
  });
}

/**
 * Returns the appropriate auth headers that should be added any requests
 * @param options, user options for the integration
 * @param headers, additional headers you want added to the returned header object
 * @returns {{Authorization: string}|{}}
 */
function getAuthHeader(options, headers = {}) {
  if (options.username && options.password) {
    return {
      ...headers,
      Authorization: `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`
    };
  } else if (options.apiKey) {
    return {
      ...headers,
      Authorization: `ApiKey ${options.apiKey}`
    };
  } else {
    return {
      ...headers
    };
  }
}

function parseErrorToReadableJSON(error) {
  return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
}

function doLookup(entities, options, cb) {
  const filteredEntities = [];
  let errors = [];
  let errorCount = 0;
  let lookupResults = [];
  let numConnectionResets = 0;
  let numThrottled = 0;
  let numProtoErrors = 0;
  let numApiKeyLimitedReached = 0;

  if (limiter === null) {
    _setupLimiter(options);
  }

  try {
    if (previousDetailFields === null || previousDetailFields !== options.detailFields) {
      detailFieldsCompiled = _compileFieldsOption(options.detailFields);
    }

    if (previousSummaryFields === null || previousSummaryFields !== options.summaryFields) {
      summaryFieldsCompiled = _compileFieldsOption(options.summaryFields, false);
    }
  } catch (compileError) {
    return cb({
      detail: compileError.message
    });
  }

  entities.forEach((entityObj) => {
    if (entityObj.isIP) {
      if (!entityObj.isPrivateIP || options.searchPrivateIps) {
        filteredEntities.push(entityObj);
      }
    } else {
      filteredEntities.push(entityObj);
    }
  });

  if (filteredEntities.length === 0) {
    return cb(null, []);
  }

  const summaryFields = options.summaryFields.split(',');
  log.trace({ options }, 'options');
  const entityGroups = _.chunk(filteredEntities, MAX_ENTITIES_PER_LOOKUP);

  if (entityGroups.length === 0) {
    return cb(null, []);
  }

  entityGroups.forEach((entityGroup) => {
    limiter.submit(_lookupEntityGroup, entityGroup, summaryFields, options, (err, results) => {
      const searchLimitObject = reachedSearchLimit(err, results);

      if (searchLimitObject) {
        // Tracking for logging purposes
        if (searchLimitObject.isProtoError) numProtoErrors++;
        if (searchLimitObject.isConnectionReset || searchLimitObject.isGatewayTimeout) numConnectionResets++;
        if (searchLimitObject.maxRequestQueueLimitHit) numThrottled++;
        if (searchLimitObject.apiKeyLimitReached) numApiKeyLimitedReached++;

        entityGroup.forEach((entity) => {
          lookupResults.push({
            entity,
            isVolatile: true, // prevent limit reached results from being cached
            data: {
              summary: ['Search limit reached'],
              details: {
                ...searchLimitObject,
                results: []
              }
            }
          });
        });
      } else if (err) {
        // a regular error occurred that is not a search limit related error
        errors.push(parseErrorToReadableJSON(err));
        // this error is returned for all the entities in the entity group so we need to count that entire group
        // as having errors
        errorCount += entityGroup.length;
      } else {
        // no search limit error and no regular error so create a normal lookup object
        results.forEach((result) => {
          lookupResults = lookupResults.concat(result);
        });
      }

      // Check if we got all our results back from the limiter
      if (lookupResults.length + errorCount >= filteredEntities.length) {
        if (numConnectionResets > 0 || numThrottled > 0 || numProtoErrors > 0) {
          log.warn(
            {
              numEntitiesLookedUp: entities.length,
              numConnectionResets: numConnectionResets,
              numLookupsThrottled: numThrottled,
              numProtoErrors,
              numApiKeyLimitedReached
            },
            'Lookup Limit Reached'
          );
        }

        if (errors.length > 0) {
          log.error({ errors }, 'doLookup errors');
          cb({
            detail:
              Array.isArray(errors) && errors.length > 0 && errors[0].detail
                ? errors[0].detail
                : 'Error running search',
            errors
          });
        } else {
          log.trace({ lookupResults }, 'Lookup Results');
          cb(null, lookupResults);
        }
      }
    });
  });
}

function reachedSearchLimit(err, results) {
  const maxRequestQueueLimitHit =
    ((err === null || typeof err === 'undefined') && _.isEmpty(results)) ||
    (err && err.message === 'This job has been dropped by Bottleneck');

  let statusCode = Number.parseInt(_.get(err, 'errors.0.status', 0), 10);
  const isGatewayTimeout = statusCode === 502 || statusCode === 504 || statusCode === 500;
  const isConnectionReset = _.get(err, 'err.code', '') === 'ECONNRESET';
  const isProtoError = _.get(err, 'err.code', '') === 'EPROTO';

  if (maxRequestQueueLimitHit || isConnectionReset || isGatewayTimeout || isProtoError) {
    return {
      maxRequestQueueLimitHit,
      isConnectionReset,
      isGatewayTimeout,
      isProtoError
    };
  }

  return null;
}

function loadHighlights(entity, documentIds, options, cb) {
  const highlights = {};

  const requestOptions = {
    uri: `${options.url}/${options.index}/_search`,
    method: 'GET',
    body: _buildOnDetailsQuery(entity, documentIds, options),
    headers: getAuthHeader(options),
    json: true
  };

  log.debug({ onMessageQuery: requestOptions }, 'onMessage Request Payload');
  requestWithDefaults(requestOptions, function (httpErr, response, body) {
    if (httpErr) {
      return cb({
        detail: 'Encountered an error loading highlights',
        error: httpErr
      });
    }

    if (body && body.hits && Array.isArray(body.hits.hits)) {
      body.hits.hits.forEach((hit) => {
        const resultHighlights = [];
        if (hit.highlight) {
          for (const [fieldName, fieldValues] of Object.entries(hit.highlight)) {
            if (!fieldName.endsWith('.keyword')) {
              resultHighlights.push({
                fieldName,
                fieldValues
              });
            }
          }
        }
        highlights[hit._id] = resultHighlights;
      });
    } else {
      log.error({ body }, 'Error processing highlight results');
      return cb({
        detail: 'Error processing highlight results'
      });
    }

    log.debug({ onDetails: highlights }, 'onMessage highlights data result');
    cb(null, {
      highlights
    });
  });
}

function onMessage(payload, options, cb) {
  switch (payload.action) {
    case 'HIGHLIGHT':
      if (options.highlightEnabled) {
        options._fromIndex = payload.from;
        loadHighlights(payload.entity, payload.documentIds, options, cb);
      } else {
        cb(null, {});
      }
      break;
    case 'SEARCH':
      options._fromIndex = payload.from;
      doLookup([payload.entity], options, (searchErr, lookupResults) => {
        if (searchErr) {
          log.error({ searchErr }, 'Error running search');
          return cb(searchErr);
        }

        const lookupResult = lookupResults[0];

        // This was a miss so we return empty results which will then
        // display a message to the user telling them there is no data
        // for this particular search.
        if (lookupResult.data === null) {
          return cb(null, {
            details: {
              results: []
            }
          });
        }

        const documentIds = _.get(lookupResult, 'data.details.results', []).map((item) => {
          return item.hit._id;
        });

        if (documentIds.length > 0) {
          loadHighlights(payload.entity, documentIds, options, (highlightErr, highlightResult) => {
            if (highlightErr) {
              log.error({ highlightErr }, 'Error loading highlights');
              return cb(highlightErr);
            }
            lookupResult.data.details.highlights = highlightResult.highlights;
            cb(null, {
              details: lookupResult.data.details
            });
          });
        } else {
          cb(null, {
            details: lookupResult.data.details
          });
        }
      });
      break;
  }
}

/**
 * Used to escape double quotes in entities and remove any newlines
 * @param entityValue
 * @returns {*}
 */
function escapeEntityValue(entityValue) {
  const escapedValue = entityValue
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/\\/, '\\\\')
    .replace(/"/g, '\\"');
  log.trace({ entityValue, escapedValue }, 'Escaped Entity Value');
  return escapedValue;
}

function _buildOnDetailsQuery(entityObj, documentIds, options) {
  const { queryString, from, size } = _getQueryWithPaging(options.highlightQuery, options.defaultPageSize, options._fromIndex);

  const highlightQuery = queryString.replace(entityTemplateReplacementRegex, escapeEntityValue(entityObj.value));

  return {
    _source: false,
    query: {
      ids: {
        values: documentIds
      }
    },
    highlight: {
      fields: {
        '*': {}
      },
      highlight_query: JSON.parse(highlightQuery).query,
      pre_tags: ['<span class="highlight">'],
      post_tags: ['</span>'],
      encoder: 'html',
      fragment_size: 200
    },
    from,
    size
  };
}

function _getQueryWithPaging(queryString, pageSize, fromIndex = 0) {
  const queryObject = JSON.parse(queryString);

  if (!queryObject.from) {
    queryObject.from = fromIndex;
  }

  if (!queryObject.size) {
    queryObject.size = pageSize;
  }

  return { queryString: JSON.stringify(queryObject), from: queryObject.from, size: queryObject.size };
}

/**
 * Returns an elasticsearch query that uses the multi-search format:
 *
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/search-multi-search.html
 *
 * @param entities
 * @param options
 * @returns {Object}
 * @private
 */
function _buildDoLookupQuery(entities, options) {
  let multiSearchString = '';
  const multiSearchQueries = [];
  const { queryString, from, size } = _getQueryWithPaging(options.query, options.defaultPageSize, options._fromIndex);

  entities.forEach((entityObj) => {
    const query = queryString.replace(entityTemplateReplacementRegex, escapeEntityValue(entityObj.value));
    multiSearchString += `{}\n${query}\n`;
    multiSearchQueries.push(query);
  });
  return { multiSearchString, multiSearchQueries, from, size };
}

function _getDetailBlockValues(hitResult) {
  let values = [];

  detailFieldsCompiled.forEach((rule) => {
    let value = _.get(hitResult, rule.path, null);
    if (value !== null) {
      values.push({
        label: rule.label,
        value
      });
    }
  });

  return values;
}

function _getSummaryTags(searchItemResult, options) {
  let tags = [];
  let uniqueValues = new Set();

  searchItemResult.hits.hits.forEach((result) => {
    summaryFieldsCompiled.forEach((rule) => {
      let value = _.get(result, rule.path, null);
      let alreadyExists = uniqueValues.has(normalizeSummaryTagValue(value));

      if (!alreadyExists) {
        if (value !== null) {
          if (rule.label.length > 0) {
            tags.push(`${rule.label}: ${value}`);
          } else {
            tags.push(value);
          }

          uniqueValues.add(normalizeSummaryTagValue(value));
        }
      }
    });
  });

  if (tags.length > options.maxSummaryTags && options.maxSummaryTags > 0) {
    let length = tags.length;
    tags = tags.slice(0, options.maxSummaryTags);
    tags.push(`+${length - options.maxSummaryTags} more`);
  }

  return tags;
}

function normalizeSummaryTagValue(value) {
  if (value !== null && typeof value === 'string') {
    return value.toLowerCase().trim();
  }
  return value;
}

function CompileException(message) {
  this.message = message;
}

function _compileFieldsOption(fields, useDefaultLabels = true) {
  const compiledFields = [];

  fields.split(',').forEach((field) => {
    let tokens = field.split(':');
    let label;
    let fieldPath;

    if (tokens.length !== 1 && tokens.length !== 2) {
      throw new CompileException(
        `Invalid field "${field}".  Field should be of the format "<label>:<json path>" or "<json path>"`
      );
    }

    if (tokens.length === 1) {
      // no label
      fieldPath = tokens[0].trim();
      label = useDefaultLabels ? tokens[0].trim() : '';
    } else if (tokens.length === 2) {
      // label specified
      fieldPath = tokens[1].trim();
      label = tokens[0].trim();
    }

    compiledFields.push({
      label,
      path: fieldPath
    });
  });

  return compiledFields;
}

function _lookupEntityGroup(entityGroup, summaryFields, options, cb) {
  const queryObject = _buildDoLookupQuery(entityGroup, options);
  const requestOptions = {
    uri: `${options.url}/${options.index}/_msearch`,
    method: 'GET',
    headers: getAuthHeader(options, {
      'Content-Type': 'application/x-ndjson'
    }),
    body: queryObject.multiSearchString
  };

  log.debug({ requestOptions: requestOptions }, 'lookupEntityGroup Request Payload');

  requestWithDefaults(requestOptions, function (httpErr, response, body) {
    if (httpErr) {
      return cb({
        err: httpErr,
        detail: 'Error making HTTP request'
      });
    }

    const jsonBody = _parseBody(body);
    if (jsonBody === null) {
      return cb(
        _createJsonErrorObject('JSON Parse Error of HTTP Response', null, '404', '1', 'JSON Parse Error', {
          body: body
        })
      );
    }

    const restError = _handleRestErrors(response, jsonBody);
    if (restError) {
      return cb(restError);
    }

    const entityGroupResults = [];

    jsonBody.responses.forEach((searchItemResult, index) => {
      if (_isMiss(searchItemResult)) {
        entityGroupResults.push({
          entity: entityGroup[index],
          data: null
        });
      } else {
        // wrap the hit in another object so that the font-end integration component can inject properties to track
        // various states without mutating the raw hit result returned from ES.  The raw hit result is stored in `hit`
        const hits = searchItemResult.hits.hits.map((hit) => {
          return {
            hit: hit,
            // details contains key-value pairs to be displayed in the details block
            details: _getDetailBlockValues(hit, options)
          };
        });
        entityGroupResults.push({
          entity: entityGroup[index],
          data: {
            summary: [],
            details: {
              totalResults: searchItemResult.hits.total.value,
              from: queryObject.from,
              size: queryObject.size,
              results: hits,
              tags: _getSummaryTags(searchItemResult, options),
              queries: queryObject.multiSearchQueries
            }
          }
        });
      }
    });

    cb(null, entityGroupResults);
  });
}

/**
 * Body is not parsed into JSON for us because the request we make is not JSON.  As a result,
 * we have to parse body ourselves.
 * @private
 */
function _parseBody(body) {
  if (body) {
    try {
      return JSON.parse(body);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function _isMiss(responseObject) {
  if (
    responseObject &&
    responseObject.hits &&
    Array.isArray(responseObject.hits.hits) &&
    responseObject.hits.hits.length > 0
  ) {
    return false;
  }
  return true;
}

/**
 * HTTP Error Codes taken from:
 * https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/errors.html
 * @param response
 * @param body
 * @returns {*}
 * @private
 */
function _handleRestErrors(response, body) {
  switch (response.statusCode) {
    case 403:
      return _createJsonErrorObject('Access to the resource is forbidden', null, '404', '1', 'Forbidden', {
        body: body
      });
      break;
    case 404:
      return _createJsonErrorObject('Not Found', null, '404', '1', 'Not Found', {
        body: body
      });
      break;
    case 400:
      return _createJsonErrorObject('Invalid Search, please check search parameters', null, '400', '2', 'Bad Request', {
        body: body
      });
      break;
    case 409:
      return _createJsonErrorObject('There was a conflict with your search', null, '409', '3', 'Conflict', {
        body: body
      });
      break;
    case 503:
      return _createJsonErrorObject(
        'Service is currently unavailable for search results',
        null,
        '503',
        '4',
        'Service Unavailable',
        {
          body: body
        }
      );
    case 500:
      return _createJsonErrorObject(
        'Internal Server error, please check your instance',
        null,
        '500',
        '5',
        'Internal Server Error',
        {
          body: body
        }
      );
      break;
    case 200:
      if (!Array.isArray(body.responses)) {
        return _createJsonErrorObject(
          'Unexpected Response Payload Format.  "body.responses" should be an array',
          null,
          response.statusCode,
          '6',
          'Unexpected HTTP Error',
          {
            body: body
          }
        );
      } else {
        const hasQueryError = body.responses.find((response) => {
          return typeof response.error !== 'undefined';
        });
        if (hasQueryError) {
          return _createJsonErrorObject(
            'Search query error encoutered.  Please check your Search Query syntax.',
            null,
            response.statusCode,
            '7',
            'There is an error with the search query.',
            {
              body: body
            }
          );
        }
      }

      return null;
      break;
  }

  return _createJsonErrorObject(
    `Unexpected HTTP Response Status Code: ${response.statusCode}`,
    null,
    response.statusCode,
    '7',
    'Unexpected HTTP Error',
    {
      body: body
    }
  );
}

function validateOptions(userOptions, cb) {
  let errors = [];
  if (
    typeof userOptions.url.value !== 'string' ||
    (typeof userOptions.url.value === 'string' && userOptions.url.value.length === 0)
  ) {
    errors.push({
      key: 'host',
      message: 'You must provide a valid Elasticsearch URL.'
    });
  }

  if (
    typeof userOptions.index.value !== 'string' ||
    (typeof userOptions.index.value === 'string' && userOptions.index.value.length === 0)
  ) {
    errors.push({
      key: 'index',
      message: 'You must provide the Index you want searched in Elasticsearch'
    });
  }

  if (
    typeof userOptions.query.value !== 'string' ||
    (typeof userOptions.query.value === 'string' && userOptions.query.value.length === 0)
  ) {
    errors.push({
      key: 'query',
      message: 'You must provide a Search Query'
    });
  } else {
    try {
      JSON.parse(userOptions.query.value);
    } catch (e) {
      errors.push({
        key: 'query',
        message:
          'You must provide a valid JSON Search Query.  Ensure the query is valid JSON notation. (Hint: check for missing opening or closing braces, parens and brackets.)'
      });
    }
  }

  if (userOptions.highlightEnabled.value === true) {
    try {
      JSON.parse(userOptions.highlightQuery.value);
    } catch (e) {
      errors.push({
        key: 'highlightQuery',
        message:
          'You must provide a valid JSON Search Query for the Highlight Query.  Ensure the query is valid JSON notation. (Hint: check for missing/extra opening or closing braces, parens and brackets.)'
      });
    }
  }

  cb(null, errors);
}

// function that creates the Json object to be passed to the payload
function _createJsonErrorObject(msg, pointer, httpCode, code, title, meta) {
  let error = {
    detail: msg,
    status: httpCode.toString(),
    title: title,
    code: 'ES_' + code.toString()
  };

  if (pointer) {
    error.source = {
      pointer: pointer
    };
  }

  if (meta) {
    error.meta = meta;
  }

  return error;
}

module.exports = {
  startup,
  doLookup,
  validateOptions,
  onMessage
};
