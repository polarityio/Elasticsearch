module.exports = {
  name: 'Elasticsearch',
  acronym: 'ES',
  defaultColor: 'light-gray',
  logging: { level: 'info' },
  entityTypes: ['*'],
  styles: ['./styles/es.less'],
  block: {
    component: {
      file: './component/es.js'
    },
    template: {
      file: './templates/es.hbs'
    }
  },
  summary: {
    component: {
      file: './component/es-summary.js'
    },
    template: {
      file: './templates/es-summary.hbs'
    }
  },
  request: {
    // Provide the path to your certFile. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    cert: '',
    // Provide the path to your private key. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    key: '',
    // Provide the key passphrase if required.  Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    passphrase: '',
    // Provide the Certificate Authority. Leave an empty string to ignore this option.
    // Relative paths are relative to the integration's root directory
    ca: '',
    // An HTTP proxy to be used. Supports proxy Auth with Basic Auth, identical to support for
    // the url parameter (by embedding the auth info in the uri)
    proxy: '',
    /**
     * If set to false, the integration will ignore SSL errors.  This will allow the integration to connect
     * to servers without valid SSL certificates.  Please note that we do NOT recommending setting this
     * to false in a production environment.
     */
    rejectUnauthorized: true,
    // Some ES server may require that you force TLS1.2 to be used.  To do this, set the `secureProtocol`
    // property to 'TLSv1_2_method'.
    secureProtocol: ''
  },
  options: [
    {
      key: 'url',
      name: 'Elasticsearch URL',
      description:
        'URL for your Elasticsearch REST API including the schema and port if applicable (e.g., https://elastic.prod:9200)',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'kibanaUrl',
      name: 'Kibana URL',
      description:
        'URL for your Elasticsearch Kibana interface including the schema and port if applicable (e.g., https://elastic.prod:9243/app/kibana).  If left blank no link to Kibana will be shown.',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'username',
      name: 'Username',
      description: 'Elasticsearch account username (Leave this blank if you are not using Basic Auth via Shield)',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'password',
      name: 'Password',
      description: 'Elasticsearch account password (Leave this blank if you are not using Basic Auth via Shield)',
      default: '',
      type: 'password',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'apiKey',
      name: 'API Key',
      description:
        'Elasticsearch API Key in Base64 format. Leave this blank if you are using Basic Auth via X-Pack (i.e., if you have a username and password) or have no authentication setup.',
      default: '',
      type: 'password',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'index',
      name: 'Index for Elasticsearch',
      description:
        'Comma delimited list of Elasticsearch indexes you want searched for results (no spaces between commas)',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'query',
      name: 'Search Query',
      description:
        'The search query to execute as JSON.  The top level property should be a `query` object and must be a valid JSON search request when sent to the ES `_search` REST endpoint.',
      default:
        '{"query": { "simple_query_string": { "query": "\\"{{entity}}\\"" } }, "from": 0, "size": 10, "sort": [ {"timestamp": "desc" } ] } }',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'highlightEnabled',
      name: 'Enable Highlighting',
      description:
        'If checked, the integration will display highlighted search terms via the Elasticsearch Highlighter.',
      default: false,
      type: 'boolean',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'highlightQuery',
      name: 'Highlight Query',
      description:
        'The highlighter query to execute when a user clicks to view additional details. The top level property should be a `query` object. This query should typically match the query portion of your `Search Query`.  Highlighting will attempt to highlight against all fields and will return the first 10 results.  Only runs if the `Enable Highlighting` option is checked',
      default: '{"query": { "simple_query_string": { "query": "\\"{{entity}}\\"" } } }',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'defaultPageSize',
      name: 'Page Size',
      description: 'The number of results to display per page.  This value must be between 1 and 100. Defaults to 10.',
      default: 10,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'summaryFields',
      name: 'Summary Fields',
      description:
        'Comma delimited list of field names to include as part of the summary tags.  JSON dot notation can be used to target nested attributes including fields inside the `_source` attribute. Fields must be returned by your search query to be displayed.  You can change the label for your fields by prepending the label to the field path and separating it with a colon (i.e., "<label>:<json path>").  If left blank, a result count will be shown. This option should be set to "Only Admins can View and Edit".',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'maxSummaryTags',
      name: 'Maximum Number of Summary Tags',
      description:
        'The maximum number of summary tags to display in the Overlay Window before showing a count.  If set to 0, all tags will be shown.',
      default: 5,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'detailFields',
      name: 'Details Fields',
      description:
        'Comma delimited list of field names to include as part of the details block.  JSON dot notation can be used to target nested attributes including fields inside the `_source` attribute. Fields must be returned by your search query to be displayed.  You can change the label for your fields by prepending the label to the field path and separating it with a colon (i.e., "<label>:<json path>").  If left blank, all fields will be shown. This option should be set to "Only Admins can View and Edit".',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'documentTitleField',
      name: 'Document Title Field',
      description:
        '"_source" field to use as the title for each returned document in the details template.  This field must be returned by your search query.',
      default: '',
      type: 'text',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'maxConcurrent',
      name: 'Max Concurrent Search Requests',
      description:
        'Maximum number of concurrent search requests (defaults to 10).  Integration must be restarted after changing this option.',
      default: 10,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'minTime',
      name: 'Minimum Time Between Searches',
      description:
        'Minimum amount of time in milliseconds between each entity search (defaults to 50).  Integration must be restarted after changing this option.',
      default: 50,
      type: 'number',
      userCanEdit: false,
      adminOnly: true
    },
    {
      key: 'searchPrivateIps',
      name: 'Search Private IPs',
      description: 'If checked, the integration will search private IPs.',
      default: true,
      type: 'boolean',
      userCanEdit: false,
      adminOnly: true
    }
  ]
};
