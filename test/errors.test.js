const nock = require('nock');
const { doLookup, startup } = require('../integration');
const url = 'https://elastic.com';
const options = {
  url,
  apiKey: '12345',
  index: 'index',
  query: '',
  summaryFields: 'index',
  highlightEnabled: false,
  highlightQuery: '',
  maxConcurrent: 10,
  minTime: 1
};

const ip = {
  type: 'IPv4',
  value: '8.8.8.8',
  isPrivateIP: false,
  isIPv4: true
};

const Logger = {
  trace: (args, msg) => {
    console.info(msg, args);
  },
  info: (args, msg) => {
    console.info(msg, args);
  },
  error: (args, msg) => {
    console.info(msg, args);
  },
  debug: (args, msg) => {
    console.info(msg, args);
  },
  warn: (args, msg) => {
    console.info(msg, args);
  }
};

beforeAll(() => {
  startup(Logger);
})

test('502 response should result in `isGatewayTimeout`', (done) => {
  const scope = nock(url).get(/.*/).reply(502, '{}');
  doLookup([ip], options, (err, lookupResults) => {
    console.info(JSON.stringify(lookupResults, null, 4));
    expect(lookupResults.length).toBe(1);
    const summary = lookupResults[0].data.details.summary;
    expect(summary.maxRequestQueueLimitHit).toBe(false);
    expect(summary.isConnectionReset).toBe(false);
    expect(summary.isGatewayTimeout).toBe(true);
    expect(summary.isProtoError).toBe(false);
    done();
  });
});

test('504 response should result in `isGatewayTimeout`', (done) => {
  const scope = nock(url).get(/.*/).reply(504, '{}');
  doLookup([ip], options, (err, lookupResults) => {
    //console.info(JSON.stringify(lookupResults, null, 4));
    expect(lookupResults.length).toBe(1);
    const summary = lookupResults[0].data.details.summary;
    expect(summary.maxRequestQueueLimitHit).toBe(false);
    expect(summary.isConnectionReset).toBe(false);
    expect(summary.isGatewayTimeout).toBe(true);
    expect(summary.isProtoError).toBe(false);
    done();
  });
});


test('500 response should result in `isGatewayTimeout`', (done) => {
  const scope = nock(url).get(/.*/).reply(500, '{}');
  doLookup([ip], options, (err, lookupResults) => {
    //console.info(JSON.stringify(lookupResults, null, 4));
    expect(lookupResults.length).toBe(1);
    const summary = lookupResults[0].data.details.summary;
    expect(summary.maxRequestQueueLimitHit).toBe(false);
    expect(summary.isConnectionReset).toBe(false);
    expect(summary.isGatewayTimeout).toBe(true);
    expect(summary.isProtoError).toBe(false);
    done();
  });
});

test('ECONNRESET response should result in `isConnectionReset`', (done) => {
  const scope = nock(url).get(/.*/).replyWithError({code: 'ECONNRESET'});
  doLookup([ip], options, (err, lookupResults) => {
    //console.info(JSON.stringify(lookupResults, null, 4));
    expect(lookupResults.length).toBe(1);
    const summary = lookupResults[0].data.details.summary;
    expect(summary.maxRequestQueueLimitHit).toBe(false);
    expect(summary.isConnectionReset).toBe(true);
    expect(summary.isGatewayTimeout).toBe(false);
    expect(summary.isProtoError).toBe(false);
    done();
  });
});

test('EPROTO response should result in `isProtoError`', (done) => {
  const scope = nock(url).get(/.*/).replyWithError({code: 'EPROTO'});
  doLookup([ip], options, (err, lookupResults) => {
    //console.info(JSON.stringify(lookupResults, null, 4));
    expect(lookupResults.length).toBe(1);
    const summary = lookupResults[0].data.details.summary;
    expect(summary.maxRequestQueueLimitHit).toBe(false);
    expect(summary.isConnectionReset).toBe(false);
    expect(summary.isGatewayTimeout).toBe(false);
    expect(summary.isProtoError).toBe(true);
    done();
  });
});

test('400 response should return a normal integration error', (done) => {
  const scope = nock(url).get(/.*/).reply(400, '{}');
  doLookup([ip], options, (err, lookupResults) => {
    console.info(JSON.stringify(err, null, 4));
    expect(err.length).toBe(1);
    expect(err[0].errors[0].status).toBe('400');
    done();
  });
});
