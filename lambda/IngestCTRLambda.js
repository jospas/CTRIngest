
var fs = require('fs');
var path = require('path');
var parquet = require('parquetjs');

var AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION}); 
var s3 = new AWS.S3(); 
const glue = new AWS.Glue();

var storageDescriptor;

/**
 * Processes S3 object events, converting input CTR records to parquet
 */
exports.handler = async function(event, context) 
{
  try
  {
    var ingestConfig = loadIngestConfig('config/ctr_ingest.json');
    var state = createState(event);

    await ingest(state, ingestConfig);

    console.log('[INFO] successfully ingested: ', JSON.stringify(state, null, '  '));

    return state;
  }
  catch (error)
  {
    console.log('[ERROR] failed to handle event', error);
    throw error;
  }
};

/**
 * Creates function state
 */
function createState(event)
{
  var state = 
  {
    inputBucket: getBucket(event),
    inputKey: getKey(event),
    outputBucket: process.env.OUTPUT_BUCKET,
    outputPrefix: process.env.OUTPUT_PREFIX,
    rowGroupSize: +process.env.ROW_GROUP_SIZE,
    rows: 0,
    outputs: []
  };

  state.localRawFile = '/tmp/' + path.basename(state.inputKey);

  return state;
}

/**
 * Loads ingest configuration
 */
function loadIngestConfig(configFile)
{
  try
  {
    return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  }
  catch (error)
  {
    console.log(('[ERROR] failed to load config file: ' + configFile, error));
    throw error;
  }
}

/**
 * Fetches the input bucket
 */
function getBucket(event)
{
  return event.Records[0].s3.bucket.name;
}

/**
 * Fetches the input key
 */
function getKey(event)
{
  return decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
}

/**
 * Fetches source CTR record
 */
async function getSource(state)
{
  try
  {
    var params = {
      Bucket: state.inputBucket,
      Key: state.inputKey
    };

    console.log('[INFO] Fetching: %j', params);

    const response = await s3.getObject(params).promise();
    const fileContent = response.Body.toString('utf-8');
    return JSON.parse(fileContent);
  }
  catch (error)
  {
    console.log('[ERROR] failed to download source CTR from S3', error);
    throw error;
  }
}

/**
 * Uploads a completed processed file
 */
async function uploadProcessedFile(state, writerContext)
{
  try
  {
    console.log('[INFO] uploading file: ' + writerContext.outputFile);
    const fileContent = fs.readFileSync(writerContext.outputFile);

    // Setting up S3 upload parameters
    const params = {
      Bucket: state.outputBucket,
      Key: writerContext.outputKey,
      Body: fileContent
    };

    await s3.upload(params).promise();

    console.log('[INFO] upload is complete');
  }
  catch (error)
  {
    throw error;
  }
}

/**
 * Downloads a log file locally, processes it row by row, 
 * transforming column names as data is written to local partitioned
 * parquet files and then uploaded into S3
 */
async function ingest(state, ingestConfig)
{
  try
  {
    console.log('[INFO] processing: ' + JSON.stringify(state, null, '  '));

    var sourceCTR = await getSource(state);

    var schema = createSchema(ingestConfig);
  

    var row = {};

    row.ContactId = sourceCTR.ContactId;
    row.ConnectedTimestamp = sourceCTR.ConnectedToSystemTimestamp;
    row.DisconnectedTimestamp = sourceCTR.DisconnectTimestamp;
    row.SystemEndpoint = sourceCTR.SystemEndpoint.Address;
    row.CustomerEndpoint = sourceCTR.CustomerEndpoint.Address;

    for (var i = 0; i < ingestConfig.fields.length; i++)
    {
      var field = ingestConfig.fields[i];

      if (sourceCTR.Attributes[field.input] !== undefined)
      {
        row[field.output] = sourceCTR.Attributes[field.input];
      }
      else
      {
        row[field.output] = '0';
      }
    }

    var key = row.ContactId;
    var when = row.ConnectedTimestamp.substring(0, 10);

    let writerContext = {
      outputFile: '/tmp/' + key + '.snappy.parquet',
      outputKey: `${state.outputPrefix}/when=${when}/${key}.snappy.parquet`,
      createPartitions: (process.env.CREATE_PARTITIONS === 'true'),
      rows: 0
    };

    writerContext.partitionKeyValues = [ `when=${when}` ];
    writerContext.partitionValues = [ when ];
    var writer = await parquet.ParquetWriter.openFile(schema, writerContext.outputFile);
    writer.setRowGroupSize(state.rowGroupSize);
    await writer.appendRow(row);
    await writer.close();
    await uploadProcessedFile(state, writerContext);
    await createPartition(writerContext);
    fs.unlinkSync(writerContext.outputFile);
  }
  catch (error)
  {
    console.log('[ERROR] failed to ingest', error);
    throw error;
  }
}

/**
 * Create a partition if it doesn't already exist
 */
async function createPartition(writerContext)
{
  if (!writerContext.createPartitions)
  {
    return false;
  }

  try
  {
    var params = 
    {
      DatabaseName: process.env.DATABASE_NAME,
      TableName: process.env.TABLE_NAME,
      PartitionValues: writerContext.partitionValues
    };
    var result = await glue.getPartition(params).promise();
    return false;
  }
  catch (error)
  {
    /**
     * An error likely means a new partition is required
     */
    if (!storageDescriptor)
    {
      var params = 
      {
        DatabaseName: process.env.DATABASE_NAME,
        Name: process.env.TABLE_NAME,
      };

      var table = await glue.getTable(params).promise();
      storageDescriptor = table.Table.StorageDescriptor;
    }

    if (error.code === 'EntityNotFoundException')
    {
      var params = 
      {
        DatabaseName: process.env.DATABASE_NAME,
        TableName: process.env.TABLE_NAME,
        PartitionInput: {
          StorageDescriptor: {
            ...storageDescriptor,
            Location: `${storageDescriptor.Location}${writerContext.partitionKeyValues.join('/')}/`
          },
          Values: writerContext.partitionValues
        }
      };
      await glue.createPartition(params).promise();
      return true;
    }
  }
}

/**
 * Create a parquet schema
 */
function createSchema(ingestConfig)
{
  var schemaInternals = {};

  schemaInternals['ContactId'] = {
    type: 'UTF8', 
    compression: 'SNAPPY'
  };

  schemaInternals['ConnectedTimestamp'] = {
    type: 'UTF8', 
    compression: 'SNAPPY'
  };

  schemaInternals['DisconnectedTimestamp'] = {
    type: 'UTF8', 
    compression: 'SNAPPY'
  };

  schemaInternals['SystemEndpoint'] = {
    type: 'UTF8', 
    compression: 'SNAPPY'
  };

  schemaInternals['CustomerEndpoint'] = {
    type: 'UTF8', 
    compression: 'SNAPPY'
  };

  ingestConfig.fields.forEach((field) => {
    schemaInternals[field.output] = {
      type: 'UTF8', 
      compression: 'SNAPPY'
    }
  });

  return new parquet.ParquetSchema(schemaInternals);  
}