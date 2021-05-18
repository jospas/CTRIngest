# CTR Ingest

This project demonstrates how to ingest Amazon Connect CTR records into S3, transforming into Parquet and storing back in S3.

## How do I build?

To build the project, check out and run:

    npm install

## How do I deploy?

Use serverless to deploy the project:

    serverless deploy <--profile profile> <--stage stage>

## Where do I upload data?

Upload raw data to ingest into the S3 bucket created during deployment:

    <stage>-ctr-ingest-<region>-<account number>

Use the following prefix for CTR records:

    input/ctr/

## Where is processed data stored?

Processed data is written back into the S3 bucket and can be found:

    processed/ctr/when=when/

## How do I configured column names?

Edit the attributes to extract here:

    config/ctr_ingest.json

As more attributes are added, you may need to expand these configuration files to account for new fields. The system ignores new fields by default.

## How do I create Athena tables?

Ingest a small amount of data and then create a manually executed Glue crawler for csv and one for log data and crawl with the database name:

    ctr<stage>

Crawl the following paths in each bot:

    processed/ctr/

Running the crawler will produce a single table:

    ctr<stage>.ctr

Alternatively you could use the following schema and edit the S3 path:

    CREATE EXTERNAL TABLE `ctr`(
      `contactid` string, 
      `connectedtimestamp` string, 
      `disconnectedtimestamp` string, 
      `systemendpoint` string, 
      `customerendpoint` string, 
      // Example columns below
      `rp_ivrcontain` string, 
      `rp_modemreset` string, 
      `rp_verified` string)
    PARTITIONED BY ( 
      `when` string)
    ROW FORMAT SERDE 
      'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe' 
    STORED AS INPUTFORMAT 
      'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat' 
    OUTPUTFORMAT 
      'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat'
    LOCATION
      's3://<stage-ctr-ingest-<region>-<accountid>/processed/ctr/'
    TBLPROPERTIES (
      'CrawlerSchemaDeserializerVersion'='1.0', 
      'CrawlerSchemaSerializerVersion'='1.0', 
      'UPDATED_BY_CRAWLER'='CTR', 
      'averageRecordSize'='611', 
      'classification'='parquet', 
      'compressionType'='none', 
      'objectCount'='1', 
      'recordCount'='1', 
      'sizeKey'='1174', 
      'typeOfData'='file')

## How can I update Glue partitions

The Lambda function attempts to update Athena partitions using this approach via the Glue API:

https://medium.com/@tobinc/automatically-adding-partitions-to-aws-glue-using-node-lambda-only-a992c124973b

To enable auto partitioning, change the environment variable for both Lambda functions to:

    CREATE_PARTITIONS: 'true'

## Enhancements

Failed S3 bucket events could be pushed to an SQS dead letter queue for triage.

