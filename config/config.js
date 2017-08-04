module.exports = {
    "name": "Elasticsearch",
    "acronym":"ES",
    "logging": { level: 'debug'},
    "entityTypes": ['IPv4', 'IPv6'],
    "styles": [
        "./styles/es.less"
    ],
    "block": {
        "component": {
            "file": "./component/es.js"
        },
        "template": {
            "file": "./template/es.hbs"
        }
    },
    "options":[
        {
            "key"          : "host",
            "name"         : "Elasticsearch Host",
            "description"  : "URL for Elasticsearch instance, please do not include https:// in your url",
            "default"      : "",
            "type"         : "text",
            "userCanEdit" : true,
            "adminOnly"    : false
        },
        {
            "key"          : "port",
            "name"         : "Port for Elasticsearch rest service - default for Elasticsearch is 9200",
            "description"  : "",
            "default"      : "9200",
            "type"         : "text",
            "userCanEdit" : true,
            "adminOnly"    : false
        },
        {
            "key"          : "username",
            "name"         : "Username",
            "description"  : "Elasticsearch Account Username",
            "default"      : "",
            "type"         : "text",
            "userCanEdit" : true,
            "adminOnly"    : false
        },
        {
            "key"          : "password",
            "name"         : "Password",
            "description"  : "Elasticsearch account password",
            "default"      : "",
            "type"         : "password",
            "userCanEdit" : true,
            "adminOnly"    : false
        },
        {
            "key"          : "index",
            "name"         : "Index for Elasticsearch",
            "description"  : "Elasticsearch index you want searched for results",
            "default"      : "",
            "type"         : "text",
            "userCanEdit" : true,
            "adminOnly"    : false
        },
        {
            "key"          : "type",
            "name"         : "Type",
            "description"  : "Index type that you want searched",
            "default"      : "",
            "type"         : "text",
            "userCanEdit" : true,
            "adminOnly"    : false
        },
        {
            "key"          : "uiHostname",
            "name"         : "UI Hostname",
            "description"  : "UI Hostname of the Kibana instance you are running",
            "default"      : "",
            "type"         : "text",
            "userCanEdit" : true,
            "adminOnly"    : false
        }
    ]
};