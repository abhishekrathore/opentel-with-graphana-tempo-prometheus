const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// 🔧 Set up Prometheus metrics exporter
const prometheusExporter = new PrometheusExporter(
  { port: 9464, startServer: true },
  () => console.log('Prometheus scrape endpoint: http://localhost:9464/metrics')
);

// 🔧 Define resource attributes
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'node-api',
});

// 🔧 Set up the NodeSDK with proper error handling
const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({ 
    url: 'http://otel-collector:4318/v1/traces',
    headers: {
      'Content-Type': 'application/json',
    },
  }),
  metricReader: prometheusExporter,
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': {
      enabled: false,
    },
  })],
});

// Start SDK synchronously
try {
  sdk.start();
  console.log('✅ OpenTelemetry initialized successfully');
} catch (error) {
  console.error('❌ Error initializing OpenTelemetry:', error);
  process.exit(1);
}

function startServer() {
  const express = require('express');
  const app = express();

  // Add some manual tracing to test
  const { trace } = require('@opentelemetry/api');
  const tracer = trace.getTracer('node-api');

  app.get('/api/hello', (req, res) => {
    const span = tracer.startSpan('hello-endpoint');
    
    try {
      console.log('📊 Processing /api/hello request');
      span.setAttributes({
        'http.method': req.method,
        'http.url': req.url,
        'custom.message': 'Hello from OTel!'
      });
      
      res.json({ 
        message: 'Hello OTel!', 
        timestamp: new Date().toISOString(),
        traceId: span.spanContext().traceId 
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'node-api' });
  });

  app.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Server running on http://0.0.0.0:3000');
    console.log('🔍 Try: curl http://localhost:3000/api/hello');
  });
}

// Start the server immediately
startServer();