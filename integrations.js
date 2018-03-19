'use strict';

let request = require('request');
let _ = require('lodash');
let async = require('async');
let log;

function startup(logger) {
    log = logger;
}


function doLookup(entities, options, cb) {


    let lookupResults = [];

    async.each(entities, function (entityObj, next) {
        if (entityObj.isIPv4 || entityObj.isIPv6 && !entityObj.isPrivateIP) {
            _lookupEntity(entityObj, options, function (err, result) {
                if (err) {
                    next(err);
                } else {
                    lookupResults.push(result); log.debug({result: result}, "Printing out the Results");
                    next(null);
                }
            });
        } else {
            lookupResults.push({entity: entityObj, data: null}); //Cache the missed results
            next(null);
        }
    }, function (err) {
        cb(err, lookupResults);

    });
}

function validateOptions(userOptions, cb) {
    let errors = [];
    if(typeof userOptions.host.value !== 'string' ||
        (typeof userOptions.host.value === 'string' && userOptions.host.value.length === 0)){
        errors.push({
            key: 'host',
            message: 'You must provide a valid Elastichsearch Hostname.'
        })
    }

    if(typeof userOptions.index.value !== 'string' ||
        (typeof userOptions.index.value === 'string' && userOptions.index.value.length === 0)){
        errors.push({
            key: 'index',
            message: 'You must provide the Index you want searched in Elasticsearch'
        })
    }

    if(typeof userOptions.type.value !== 'string' ||
        (typeof userOptions.type.value === 'string' && userOptions.type.value.length === 0)){
        errors.push({
            key: 'type',
            message: 'You must provide the Index Type for your search'
        })
    }

    cb(null, errors);
}



function _lookupEntity(entityObj, options, cb) {
    let uri = options.host + ':' + options.port + '/' + options.index + '/' + options.type + '/_search?pretty';

    var kibana = options.uiHostname;

    let esData = {
        "query": {
            "term" : { "message" : entityObj.value }
        }
    }


    log.debug("Printing out JSON payload %j", esData);

    request({
        uri: uri,
        method: 'GET',
        json: esData
    }, function (err, response, body) {
        // check for an error
        if (err) {
            return;
        }

        log.debug("Checking body %j", body);

        if(response.statusCode === 404){
            cb(_createJsonErrorPayload("Not Found", null, '404', '2A', 'Not Found', {
                err: err
            }));
            return;
        }

        if(response.statusCode === 400){
            cb(_createJsonErrorPayload("Invalid Search, please check search parameters", null, '400', '2A', 'Bad Request', {
                err: err
            }));
            return;
        }
        if(response.statusCode === 409){
            cb(_createJsonErrorPayload("There was a conflict with your search", null, '409', '2A', 'Conflict', {
                err: err
            }));
            return;
        }
        if(response.statusCode === 503){
            cb(_createJsonErrorPayload("Service is currently unavailable for search results", null, '503', '2A', '', {
                err: err
            }));
            return;
        }
        if(response.statusCode === 500){
            cb(_createJsonErrorPayload("Internal Server error, please check your instance", null, '500', '2A', 'Internal Server Error', {
                err: err
            }));
            return;
        }

        if(response.body.hits.total === 0){
            cb(null, {
                entity: entityObj,
                data: null
            });
        }


        // The lookup results returned is an array of lookup objects with the following format
        else {cb(null, {
            // Required: This is the entity object passed into the integration doLookup method
            entity: entityObj,
            // Required: An object containing everything you want passed to the template
            data: {
                // Required: this is the string value that is displayed in the template
                entity_name: entityObj.value,
                // Required: These are the tags that are displayed in your template
                summary: ["Number of Results:" + body.hits.total],
                // Data that you want to pass back to the notification window details block
                details: {
                   hits: body.hits.total,
                   url: kibana
                }
            }
        }); }

    });
}

// function that takes the ErrorObject and passes the error message to the notification window
var _createJsonErrorPayload = function (msg, pointer, httpCode, code, title, meta) {
    return {
        errors: [
            _createJsonErrorObject(msg, pointer, httpCode, code, title, meta)
        ]
    }
};

// function that creates the Json object to be passed to the payload
var _createJsonErrorObject = function (msg, pointer, httpCode, code, title, meta) {
    let error = {
        detail: msg,
        status: httpCode.toString(),
        title: title,
        code: 'Safe_' + code.toString()
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
    startup:startup,
    doLookup: doLookup,
    validateOptions: validateOptions
};
