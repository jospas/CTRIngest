# Robot Log Ingester

This project demonstrates how to ingest log and CSV data, transforming into Parquet and storing back in S3.

## How do I build?

To build the project, check out and run:

    npm install

## How do I deploy?

Use serverless to deploy the project:

    serverless deploy <--profile profile> <--stage stage>

## Where do I upload data?

Upload raw data to ingest into the S3 bucket created during deployment:

    <stage>-bot-ingest-<region>-<account number>

Use the following prefix for log data:

    raw/logs/

Use the following prefix for csv data:

    raw/csv/

## Where is processed data stored?

Processed data is written back into the S3 bucket and can be found:

    processed/csv/robot=robotid/when=when/

    processed/logs/robot=robotid/when=when/

## How do I configured column names?

Edit the configuration files:

    config/csv_ingest.json

and

    config/log_ingest.json

As more bots are added, you may need to expand these configuration files to account for new fields. The system ignores new fields by default.

## How do I create Athena tables?

Ingest a small amount of data and then create a manually executed Glue crawler for csv and one for log data and crawl with the database name:

    botlogs<stage>

Crawl the following paths in each bot:

    csv: processed/csv/

and

    logs: processed/logs/

Running the crawler will produce two tables:

    botlogs<stage>.csv

and

    botlogs<stage>.logs

Alternatively you could use the following schema and edit the S3 path:

    CREATE EXTERNAL TABLE `logs`(
      `message` string, 
      `level` string, 
      `logtype` string, 
      `timestamp` string, 
      `fingerprint` string, 
      `windowsidentity` string, 
      `machinename` string, 
      `processname` string, 
      `filename` string, 
      `jobid` string, 
      `robotname` string, 
      `totalexecutiontimeinseconds` string, 
      `totalexecutiontime` string, 
      `businessprocessname` string)
    PARTITIONED BY ( 
      `robot` string, 
      `when` string)
    ROW FORMAT SERDE 
      'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe' 
    STORED AS INPUTFORMAT 
      'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat' 
    OUTPUTFORMAT 
      'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat'
    LOCATION
      's3://<stage>-bot-ingest-ap-southeast-2-<account id>/processed/logs/'
    TBLPROPERTIES (
      'CrawlerSchemaDeserializerVersion'='1.0', 
      'CrawlerSchemaSerializerVersion'='1.0', 
      'UPDATED_BY_CRAWLER'='Bot Logs', 
      'averageRecordSize'='1106', 
      'classification'='parquet', 
      'compressionType'='none', 
      'objectCount'='1', 
      'recordCount'='1', 
      'sizeKey'='1978', 
      'typeOfData'='file')

    CREATE EXTERNAL TABLE `csv`(
      `botprocessdate` string, 
      `weekcommencingdate` string, 
      `starttimestamp` string, 
      `endtimestamp` string, 
      `validexception` string, 
      `successful` string, 
      `businessexception` string, 
      `systemexception` string, 
      `rulesummary` string, 
      `ruledetail` string, 
      `botid` string, 
      `policynumber` string, 
      `regonumber` string, 
      `finalchangeincost` string, 
      `overrideamount` string)
    PARTITIONED BY ( 
      `robot` string, 
      `when` string)
    ROW FORMAT SERDE 
      'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe' 
    STORED AS INPUTFORMAT 
      'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat' 
    OUTPUTFORMAT 
      'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat'
    LOCATION
      's3://<stage>-bot-ingest-ap-southeast-2-<account id>/processed/csv/'
    TBLPROPERTIES (
      'CrawlerSchemaDeserializerVersion'='1.0', 
      'CrawlerSchemaSerializerVersion'='1.0', 
      'UPDATED_BY_CRAWLER'='Bot CSV', 
      'averageRecordSize'='52', 
      'classification'='parquet', 
      'compressionType'='none', 
      'objectCount'='2', 
      'recordCount'='393', 
      'sizeKey'='22739', 
      'typeOfData'='file')

## How can I update Glue partitions

The Lambda function attempts to update Athena partitions using this approach via the Glue API:

https://medium.com/@tobinc/automatically-adding-partitions-to-aws-glue-using-node-lambda-only-a992c124973b

To enable auto partitioning, change the environment variable for both Lambda functions to:

    CREATE_PARTITIONS: 'true'

## Enhancements

Failed S3 bucket events could be pushed to an SQS dead letter queue for triage.

