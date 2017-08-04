# Polarity Elasticsearch Integration

Polarity's Elasticsearch integration allows a user to connect to an Elasticsearch instance. The integration returns the number of records for an IP that are present for a given entity. A user can also link out to their Kibana instance to view more information.

![image](https://user-images.githubusercontent.com/22529325/28972966-bf8d9e4e-78ff-11e7-8788-6706f691113c.png)

## Elasticsearch Integration Options

### Hostname

This setting is the hostname of your Elasicsearch instance. Please do not include the Scheme or Port if there is one. For example:

```
www.elasticsearchinstance.com
```

### Port

The default for port for Elasticsearch is 9200. If you have changed your port when setting up your instance, please change the port here.

### Username

Username set for an individual user or if you have a generic RestAPI user, you can set it here. It is only required if you have established credentials on your Elasticsearch instance

### Password

Password set for the individual user or generic user. It is only required if you have established credentials on your Elasticsearch instance

### Index

Provide the Index with Elasticsearch that you want to search against.

### Type

Provide the type of index that you are performing your searches against.


### UI Hostname

This the exact hostname that you go to in order to access the Splunk User-Interface. If there is a port or a protocal used, please ensure they are included.  For example:

```
https://www.mykibana.com
```

## Installation Instructions

Installation instructions for integrations are provided on the [PolarityIO GitHub Page](https://polarityio.github.io/).

## Polarity

Polarity is a memory-augmentation platform that improves and accelerates analyst decision making.  For more information about the Polarity platform please see:

https://polarity.io/