/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  SumAggregator,
  HistogramAggregator,
  LastValueAggregator,
  MeterProvider,
  CounterMetric,
  HistogramMetric,
  UpDownCounterMetric,
  ObservableGaugeMetric,
} from '@opentelemetry/sdk-metrics-base';
import { diag, DiagLogLevel } from '@opentelemetry/api';
import * as assert from 'assert';
import { Attributes } from '@opentelemetry/api-metrics';
import { PrometheusSerializer } from '../src/PrometheusSerializer';
import { PrometheusAttributesBatcher } from '../src/PrometheusAttributesBatcher';
import { ExactProcessor } from './ExactProcessor';
import { mockedHrTimeMs, mockAggregator } from './util';

const attributes = {
  foo1: 'bar1',
  foo2: 'bar2',
};

describe('PrometheusSerializer', () => {
  describe('constructor', () => {
    it('should construct a serializer', () => {
      const serializer = new PrometheusSerializer();
      assert(serializer instanceof PrometheusSerializer);
    });
  });

  describe('serialize a metric record', () => {
    describe('with SumAggregator', () => {
      mockAggregator(SumAggregator);

      it('should serialize metric record with sum aggregator', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test');
        const counter = meter.createCounter('test_total') as CounterMetric;
        counter.add(1, attributes);

        const records = await counter.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          `test_total{foo1="bar1",foo2="bar2"} 1 ${mockedHrTimeMs}\n`
        );
      });

      it('serialize metric record with sum aggregator without timestamp', async () => {
        const serializer = new PrometheusSerializer(undefined, false);

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test');
        const counter = meter.createCounter('test_total') as CounterMetric;
        counter.add(1, attributes);

        const records = await counter.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(result, 'test_total{foo1="bar1",foo2="bar2"} 1\n');
      });
    });

    describe('with LastValueAggregator', () => {
      mockAggregator(LastValueAggregator);

      it('should serialize metric record with LastValue aggregator', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(LastValueAggregator),
        }).getMeter('test');
        const observableGauge = meter.createObservableGauge(
          'test',
          {},
          observableResult => {
            observableResult.observe(1, attributes);
          }
        ) as ObservableGaugeMetric;
        await meter.collect();
        const records = await observableGauge.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          `test{foo1="bar1",foo2="bar2"} 1 ${mockedHrTimeMs}\n`
        );
      });

      it('serialize metric record with sum aggregator without timestamp', async () => {
        const serializer = new PrometheusSerializer(undefined, false);

        const meter = new MeterProvider({
          processor: new ExactProcessor(LastValueAggregator),
        }).getMeter('test');
        const observableGauge = meter.createObservableGauge(
          'test',
          {},
          observableResult => {
            observableResult.observe(1, attributes);
          }
        ) as ObservableGaugeMetric;
        await meter.collect();
        const records = await observableGauge.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(result, 'test{foo1="bar1",foo2="bar2"} 1\n');
      });
    });

    describe('with HistogramAggregator', () => {
      mockAggregator(HistogramAggregator);

      it('should serialize metric record with sum aggregator', async () => {
        const serializer = new PrometheusSerializer();

        const processor = new ExactProcessor(HistogramAggregator, [1, 10, 100]);
        const meter = new MeterProvider({ processor }).getMeter('test');
        const histogram = meter.createHistogram('test', {
          description: 'foobar',
        }) as HistogramMetric;

        histogram.record(5, attributes);

        const records = await histogram.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          `test_count{foo1="bar1",foo2="bar2"} 1 ${mockedHrTimeMs}\n` +
            `test_sum{foo1="bar1",foo2="bar2"} 5 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="1"} 0 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="10"} 1 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="100"} 1 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="+Inf"} 1 ${mockedHrTimeMs}\n`
        );
      });

      it('should serialize metric record with sum aggregator, boundaries defined in constructor', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider().getMeter('test');
        const histogram = meter.createHistogram('test', {
          description: 'foobar',
          boundaries: [1, 10, 100],
        }) as HistogramMetric;
        histogram.record(5, attributes);

        const records = await histogram.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          `test_count{foo1="bar1",foo2="bar2"} 1 ${mockedHrTimeMs}\n` +
            `test_sum{foo1="bar1",foo2="bar2"} 5 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="1"} 0 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="10"} 1 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="100"} 1 ${mockedHrTimeMs}\n` +
            `test_bucket{foo1="bar1",foo2="bar2",le="+Inf"} 1 ${mockedHrTimeMs}\n`
        );
      });

      it('serialize metric record with sum aggregator without timestamp', async () => {
        const serializer = new PrometheusSerializer(undefined, false);

        const processor = new ExactProcessor(HistogramAggregator, [1, 10, 100]);
        const meter = new MeterProvider({ processor }).getMeter('test');
        const histogram = meter.createHistogram('test', {
          description: 'foobar',
        }) as HistogramMetric;
        histogram.record(5, attributes);

        const records = await histogram.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          'test_count{foo1="bar1",foo2="bar2"} 1\n' +
            'test_sum{foo1="bar1",foo2="bar2"} 5\n' +
            'test_bucket{foo1="bar1",foo2="bar2",le="1"} 0\n' +
            'test_bucket{foo1="bar1",foo2="bar2",le="10"} 1\n' +
            'test_bucket{foo1="bar1",foo2="bar2",le="100"} 1\n' +
            'test_bucket{foo1="bar1",foo2="bar2",le="+Inf"} 1\n'
        );
      });
    });
  });

  describe('serialize a checkpoint set', () => {
    describe('with SumAggregator', () => {
      mockAggregator(SumAggregator);

      it('should serialize metric record with sum aggregator', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test');
        const processor = new PrometheusAttributesBatcher();
        const counter = meter.createCounter('test_total', {
          description: 'foobar',
        }) as CounterMetric;
        counter.add(1, { val: '1' });
        counter.add(1, { val: '2' });

        const records = await counter.getMetricRecord();
        records.forEach(it => processor.process(it));
        const checkPointSet = processor.checkPointSet();

        const result = serializer.serialize(checkPointSet);
        assert.strictEqual(
          result,
          '# HELP test_total foobar\n' +
            '# TYPE test_total counter\n' +
            `test_total{val="1"} 1 ${mockedHrTimeMs}\n` +
            `test_total{val="2"} 1 ${mockedHrTimeMs}\n`
        );
      });

      it('serialize metric record with sum aggregator without timestamp', async () => {
        const serializer = new PrometheusSerializer(undefined, false);

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test');
        const processor = new PrometheusAttributesBatcher();
        const counter = meter.createCounter('test_total', {
          description: 'foobar',
        }) as CounterMetric;
        counter.add(1, { val: '1' });
        counter.add(1, { val: '2' });

        const records = await counter.getMetricRecord();
        records.forEach(it => processor.process(it));
        const checkPointSet = processor.checkPointSet();

        const result = serializer.serialize(checkPointSet);
        assert.strictEqual(
          result,
          '# HELP test_total foobar\n' +
            '# TYPE test_total counter\n' +
            'test_total{val="1"} 1\n' +
            'test_total{val="2"} 1\n'
        );
      });
    });

    describe('with LastValueAggregator', () => {
      mockAggregator(LastValueAggregator);

      it('serialize metric record with LastValue aggregator', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(LastValueAggregator),
        }).getMeter('test');
        const processor = new PrometheusAttributesBatcher();
        const observableGauge = meter.createObservableGauge(
          'test',
          {
            description: 'foobar',
          },
          observableResult => {
            observableResult.observe(1, attributes);
          }
        ) as ObservableGaugeMetric;
        await meter.collect();
        const records = await observableGauge.getMetricRecord();
        records.forEach(it => processor.process(it));
        const checkPointSet = processor.checkPointSet();

        const result = serializer.serialize(checkPointSet);
        assert.strictEqual(
          result,
          '# HELP test foobar\n' +
            '# TYPE test gauge\n' +
            `test{foo1="bar1",foo2="bar2"} 1 ${mockedHrTimeMs}\n`
        );
      });
    });

    describe('with HistogramAggregator', () => {
      mockAggregator(HistogramAggregator);

      it('serialize metric record with HistogramAggregator aggregator, cumulative', async () => {
        const serializer = new PrometheusSerializer();

        const processor = new ExactProcessor(HistogramAggregator, [1, 10, 100]);
        const meter = new MeterProvider({ processor }).getMeter('test');
        const histogram = meter.createHistogram('test', {
          description: 'foobar',
        }) as HistogramMetric;
        histogram.record(5, { val: '1' });
        histogram.record(50, { val: '1' });
        histogram.record(120, { val: '1' });

        histogram.record(5, { val: '2' });

        const records = await histogram.getMetricRecord();
        const attributeBatcher = new PrometheusAttributesBatcher();
        records.forEach(it => attributeBatcher.process(it));
        const checkPointSet = attributeBatcher.checkPointSet();

        const result = serializer.serialize(checkPointSet);
        assert.strictEqual(
          result,
          '# HELP test foobar\n' +
            '# TYPE test histogram\n' +
            `test_count{val="1"} 3 ${mockedHrTimeMs}\n` +
            `test_sum{val="1"} 175 ${mockedHrTimeMs}\n` +
            `test_bucket{val="1",le="1"} 0 ${mockedHrTimeMs}\n` +
            `test_bucket{val="1",le="10"} 1 ${mockedHrTimeMs}\n` +
            `test_bucket{val="1",le="100"} 2 ${mockedHrTimeMs}\n` +
            `test_bucket{val="1",le="+Inf"} 3 ${mockedHrTimeMs}\n` +
            `test_count{val="2"} 1 ${mockedHrTimeMs}\n` +
            `test_sum{val="2"} 5 ${mockedHrTimeMs}\n` +
            `test_bucket{val="2",le="1"} 0 ${mockedHrTimeMs}\n` +
            `test_bucket{val="2",le="10"} 1 ${mockedHrTimeMs}\n` +
            `test_bucket{val="2",le="100"} 1 ${mockedHrTimeMs}\n` +
            `test_bucket{val="2",le="+Inf"} 1 ${mockedHrTimeMs}\n`
        );
      });
    });
  });

  describe('validate against metric conventions', () => {
    mockAggregator(SumAggregator);

    it('should rename metric of type counter when name misses _total suffix', async () => {
      const serializer = new PrometheusSerializer();

      const meter = new MeterProvider({
        processor: new ExactProcessor(SumAggregator),
      }).getMeter('test');
      const counter = meter.createCounter('test') as CounterMetric;
      counter.add(1);

      const records = await counter.getMetricRecord();
      const record = records[0];

      const result = serializer.serializeRecord(record.descriptor.name, record);
      assert.strictEqual(result, `test_total 1 ${mockedHrTimeMs}\n`);
    });

    it('should not warn for counter metrics with correct name', async () => {
      let calledArgs: any[] = [];
      const dummyLogger = {
        verbose: () => {},
        debug: (...args: any[]) => {
          calledArgs = args;
        },
        info: () => {},
        warn: () => {},
        error: () => {},
      };
      diag.setLogger(dummyLogger, DiagLogLevel.ALL);
      calledArgs = [];
      const serializer = new PrometheusSerializer();

      const meter = new MeterProvider({
        processor: new ExactProcessor(SumAggregator),
      }).getMeter('test');
      const counter = meter.createCounter('test_total') as CounterMetric;
      counter.add(1);

      const records = await counter.getMetricRecord();
      const record = records[0];

      const result = serializer.serializeRecord(record.descriptor.name, record);
      assert.strictEqual(result, `test_total 1 ${mockedHrTimeMs}\n`);
      assert.deepStrictEqual(calledArgs, []);
    });
  });

  describe('serialize non-normalized values', () => {
    describe('with SumAggregator', () => {
      mockAggregator(SumAggregator);

      it('should serialize records without attributes', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test');
        const counter = meter.createCounter('test_total') as CounterMetric;
        counter.add(1);

        const records = await counter.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(result, `test_total 1 ${mockedHrTimeMs}\n`);
      });

      it('should serialize non-string attribute values', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test');
        const counter = meter.createCounter('test_total') as CounterMetric;
        counter.add(1, ({
          object: {},
          NaN: NaN,
          null: null,
          undefined: undefined,
        } as unknown) as Attributes);
        const records = await counter.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          `test_total{object="[object Object]",NaN="NaN",null="null",undefined="undefined"} 1 ${mockedHrTimeMs}\n`
        );
      });

      it('should serialize non-finite values', async () => {
        const serializer = new PrometheusSerializer();
        const cases = [
          [NaN, 'Nan'],
          [-Infinity, '-Inf'],
          [+Infinity, '+Inf'],
        ] as [number, string][];

        for (const esac of cases) {
          const meter = new MeterProvider({
            processor: new ExactProcessor(SumAggregator),
          }).getMeter('test');
          const counter = meter.createUpDownCounter(
            'test'
          ) as UpDownCounterMetric;
          counter.add(esac[0], attributes);
          const records = await counter.getMetricRecord();
          const record = records[0];

          const result = serializer.serializeRecord(
            record.descriptor.name,
            record
          );
          assert.strictEqual(
            result,
            `test{foo1="bar1",foo2="bar2"} ${esac[1]} ${mockedHrTimeMs}\n`
          );
        }
      });

      it('should escape backslash (\\), double-quote ("), and line feed (\\n) in attribute values', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test');
        const counter = meter.createCounter('test_total') as CounterMetric;
        counter.add(1, ({
          backslash: '\u005c', // \ => \\ (\u005c\u005c)
          doubleQuote: '\u0022', // " => \" (\u005c\u0022)
          lineFeed: '\u000a', // ↵ => \n (\u005c\u006e)
          backslashN: '\u005c\u006e', // \n => \\n (\u005c\u005c\u006e)
          backslashDoubleQuote: '\u005c\u0022', // \" => \\\" (\u005c\u005c\u005c\u0022)
          backslashLineFeed: '\u005c\u000a', // \↵ => \\\n (\u005c\u005c\u005c\u006e)
        } as unknown) as Attributes);
        const records = await counter.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          'test_total{' +
            'backslash="\u005c\u005c",' +
            'doubleQuote="\u005c\u0022",' +
            'lineFeed="\u005c\u006e",' +
            'backslashN="\u005c\u005c\u006e",' +
            'backslashDoubleQuote="\u005c\u005c\u005c\u0022",' +
            'backslashLineFeed="\u005c\u005c\u005c\u006e"' +
            `} 1 ${mockedHrTimeMs}\n`
        );
      });

      it('should sanitize attribute names', async () => {
        const serializer = new PrometheusSerializer();

        const meter = new MeterProvider({
          processor: new ExactProcessor(SumAggregator),
        }).getMeter('test_total');
        const counter = meter.createCounter('test') as CounterMetric;
        // if you try to use a attribute name like account-id prometheus will complain
        // with an error like:
        // error while linting: text format parsing error in line 282: expected '=' after label name, found '-'
        counter.add(1, ({
          'account-id': '123456',
        } as unknown) as Attributes);
        const records = await counter.getMetricRecord();
        const record = records[0];

        const result = serializer.serializeRecord(
          record.descriptor.name,
          record
        );
        assert.strictEqual(
          result,
          `test_total{account_id="123456"} 1 ${mockedHrTimeMs}\n`
        );
      });
    });
  });
});
