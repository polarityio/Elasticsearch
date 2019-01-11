# Polarity Elasticsearch Integration

Polarity's Elasticsearch integration can search your ES instance using a user provided search and return results via the Polarity Overlay Window or HUD.  Similar to Kibana, the integration will return highlighted document fields as well as the full `_source` field.  In addition, a table and JSON view are also provided. .

![53fb5dff-e139-4c47-a1d8-481f8b927df7](https://user-images.githubusercontent.com/306319/51043062-c28a6d00-158b-11e9-810d-4ae13c714841.GIF)

> Note that by default the ES integration will receive ALL entity types.  It is important that you select the "Manage Integration Data" option and turn off entity types you do not want sent to your ES integration.

## Elasticsearch Integration Options

### Elasticsearch URL


URL for your Elasticsearch REST API including the schema and port if applicable (e.g., https://elastic.prod:9200)

```
https://elastic.prod:9200
```

### Username

Elasticsearch account username (Leave this blank if you are not using Basic Auth via Shield)

### Password

Elasticsearch account password (Leave this blank if you are not using Basic Auth via Shield)

### Index for Elasticsearch

Comma delimited list of Elasticsearch indexes you want searched for results (no spaces between commas)

```
kibana_sample_data_logs,kibana_sample_data_flights
```

### Search Query

The search query to execute as JSON. The top level property should be a `query` object and must be a valid JSON search request when sent to the ES `_search` REST endpoint.  The search query can make use of the templated variable `{{entity}}` which will be replaced by the entity recognized on the user's screen.

As an example, with the search query is defined as:

```
{"query": { "simple_query_string": { "query": "\"{{entity}}\"" } }, "from": 0, "size": 10, "sort": [ {"timestamp": "desc" } ] } }
```

If the user has the IP 8.8.8.8 on their screen the integration will execute the following query:

```
{"query": { "simple_query_string": { "query": "\"8.8.8.8\"" } }, "from": 0, "size": 10, "sort": [ {"timestamp": "desc" } ] } }
```

### Enable Highlighting

If checked, the integration will display highlighted search terms via the Elasticsearch Highlighter.  For more information on the Elasticsearch Highlighter please see the following documentation: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-highlighting.html

### Highlight Query

The highlighter query to execute when a user clicks to view additional details. The top level property should be a `query` object. This query should typically match the query portion of your `Search Query`. Highlighting will attempt to highlight against all fields and will return the first 10 results. Only runs if the `Enable Highlighting` option is checked

```
{"query": { "simple_query_string": { "query": "\"{{entity}}\"" } } }
```

### Summary Fields

Comma delimited list of "_source" fields to include as part of the summary (no spaces between commas). These fields must be returned by your search query.  Defaults to `index`.

### Document Title Field

"_source" field to use as the title for each returned document in the details template. This field must be returned by your search query.  Defaults to `timestamp`.

### Kibana URL

URL for your Elasticsearch Kibana interface including the schema and port if applicable (e.g., https://elastic.prod:9243/app/kibana).  If left blank no link to Kibana will be provided.

> Note that this link is not yet able to link directly to a returned document id but only takes you to the Kibana web interface.

```
https://elastic.prod:9243/app/kibana
```

## Installation Instructions

Installation instructions for integrations are provided on the [PolarityIO GitHub Page](https://polarityio.github.io/).

## Polarity

Polarity is a memory-augmentation platform that improves and accelerates analyst decision making.  For more information about the Polarity platform please see:

https://polarity.io/
