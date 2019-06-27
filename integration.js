'use strict';

const request = require('request');
const _ = require('lodash');
const async = require('async');
const fs = require('fs');
const config = require('./config/config');

const entityTemplateReplacementRegex = /{{entity}}/g;
const MAX_ENTITIES_PER_LOOKUP = 10;
const MAX_PARALLEL_LOOKUPS = 5;

let log;
let requestWithDefaults;

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

  requestWithDefaults = request.defaults(defaults);
}

function doLookup(entities, options, cb) {
  let self = this;
  let lookupResults = [];
  const filteredEntities = [];
  const lookupTasks = [];

  entities.forEach((entityObj) => {
    if (entityObj.isIP) {
      if (!entityObj.isPrivateIP) {
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
  entityGroups.forEach((entityGroup) => {
    lookupTasks.push(_lookupEntityGroup.bind(self, entityGroup, summaryFields, options));
  });

  async.parallelLimit(lookupTasks, MAX_PARALLEL_LOOKUPS, (err, results) => {
    if (err) {
      log.error(err, 'Error running lookup');
      return cb(err);
    }

    results.forEach((result) => {
      lookupResults = lookupResults.concat(result);
    });

    cb(null, lookupResults);
  });
}

function onDetails(lookupObject, options, cb) {
  if (options.highlightEnabled === false) {
    return cb(null, lookupObject.data);
  }

  const documentIds = lookupObject.data.details.results.map((item) => {
    return item.hit._id;
  });

  const requestOptions = {
    uri: `${options.url}/${options.index}/_search`,
    method: 'GET',
    body: _buildOnDetailsQuery(lookupObject.entity, documentIds, options),
    json: true
  };

  if (
    typeof options.username === 'string' &&
    options.username.length > 0 &&
    typeof options.password === 'string' &&
    options.password.length > 0
  ) {
    requestOptions.auth = {
      user: options.username,
      pass: options.password
    };
    // requestOptions.headers.Authorization =
    //   'Basic ' + Buffer.from(`${options.username}:${options.password}`).toString('base64');
  }

  log.debug({ onDetailsQuery: requestOptions }, 'onDetails Request Payload');
  lookupObject.data.details.highlights = {};
  requestWithDefaults(requestOptions, function(httpErr, response, body) {
    if (httpErr) {
      return cb(httpErr);
    }

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
      lookupObject.data.details.highlights[hit._id] = resultHighlights;
    });

    log.debug({ onDetails: lookupObject.data }, 'onDetails data result');
    cb(null, lookupObject.data);
  });
}

function _buildOnDetailsQuery(entityObj, documentIds, options) {
  const highlightQuery = options.highlightQuery.replace(entityTemplateReplacementRegex, entityObj.value);
  return {
    _source: false,
    query: {
      ids: {
        type: '_doc',
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
    from: 0,
    size: 10
  };
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

  entities.forEach((entityObj) => {
    const query = options.query.replace(entityTemplateReplacementRegex, entityObj.value);
    multiSearchString += `{}\n${query}\n`;
    multiSearchQueries.push(query);
  });
  return { multiSearchString, multiSearchQueries };
}

function _getSummaryTags(searchItemResult, summaryFields) {
  const tags = new Map();

  searchItemResult.hits.hits.forEach((hit) => {
    if (!hit._source) {
      tags.set('Missing _source field', {
        field: '',
        value: 'Missing _source field'
      });
    } else {
      summaryFields.forEach((field) => {
        const summaryField = _.get(hit._source, field);
        if (summaryField) {
          tags.set(`${field}${summaryField}`, {
            field: field,
            value: summaryField
          });
        }
      });
    }
  });

  return Array.from(tags.values());
}

function _lookupEntityGroup(entityGroup, summaryFields, options, cb) {
  const queryObject = _buildDoLookupQuery(entityGroup, options);
  const requestOptions = {
    uri: `${options.url}/${options.index}/_msearch`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/x-ndjson'
    },
    body: queryObject.multiSearchString
  };

  if (options.username && options.password) {
    requestOptions.headers.Authorization =
      'Basic ' + Buffer.from(`${options.username}:${options.password}`).toString('base64');
  }

  log.debug({ requestOptions: requestOptions }, 'lookupEntityGroup Request Payload');

  requestWithDefaults(requestOptions, function(httpErr, response, body) {
    if (httpErr) {
      return cb({
        err: httpErr,
        detail: 'Error making HTTP request'
      });
    }

    const jsonBody = _parseBody(body);
    if (jsonBody === null) {
      return cb(
        _createJsonErrorPayload('JSON Parse Error of HTTP Response', null, '404', '1', 'JSON Parse Error', {
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
            hit: hit
          };
        });
        entityGroupResults.push({
          entity: entityGroup[index],
          data: {
            summary: [],
            details: {
              results: hits,
              tags: _getSummaryTags(searchItemResult, summaryFields),
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
      return _createJsonErrorPayload('Access to the resource is forbidden', null, '404', '1', 'Forbidden', {
        body: body
      });
      break;
    case 404:
      return _createJsonErrorPayload('Not Found', null, '404', '1', 'Not Found', {
        body: body
      });
      break;
    case 400:
      return _createJsonErrorPayload(
        'Invalid Search, please check search parameters',
        null,
        '400',
        '2',
        'Bad Request',
        {
          body: body
        }
      );
      break;
    case 409:
      return _createJsonErrorPayload('There was a conflict with your search', null, '409', '3', 'Conflict', {
        body: body
      });
      break;
    case 503:
      return _createJsonErrorPayload(
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
      return _createJsonErrorPayload(
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
        return _createJsonErrorPayload(
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
        return null;
      }
      break;
  }

  return _createJsonErrorPayload(
    'Unexpected HTTP Response Status Code',
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
      key: 'type',
      message: 'You must provide a valid Search Query'
    });
  }

  cb(null, errors);
}

// function that takes the ErrorObject and passes the error message to the notification window
var _createJsonErrorPayload = function(msg, pointer, httpCode, code, title, meta) {
  return {
    errors: [_createJsonErrorObject(msg, pointer, httpCode, code, title, meta)]
  };
};

// function that creates the Json object to be passed to the payload
var _createJsonErrorObject = function(msg, pointer, httpCode, code, title, meta) {
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
};

module.exports = {
  startup: startup,
  doLookup: doLookup,
  validateOptions: validateOptions,
  onDetails: onDetails
};
