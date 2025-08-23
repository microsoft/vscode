// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { expect } from 'chai';
import rewiremock from 'rewiremock';
import * as sinon from 'sinon';
import * as fs from '../../client/common/platform/fs-paths';

import {
    _resetSharedProperties,
    clearTelemetryReporter,
    sendTelemetryEvent,
    setSharedProperty,
} from '../../client/telemetry';

suite('Telemetry', () => {
    const oldValueOfVSC_PYTHON_UNIT_TEST = process.env.VSC_PYTHON_UNIT_TEST;
    const oldValueOfVSC_PYTHON_CI_TEST = process.env.VSC_PYTHON_CI_TEST;
    let readJSONSyncStub: sinon.SinonStub;

    class Reporter {
        public static eventName: string[] = [];
        public static properties: Record<string, string>[] = [];
        public static measures: {}[] = [];
        public static exception: Error | undefined;

        public static clear() {
            Reporter.eventName = [];
            Reporter.properties = [];
            Reporter.measures = [];
        }
        public sendTelemetryEvent(eventName: string, properties?: {}, measures?: {}) {
            Reporter.eventName.push(eventName);
            Reporter.properties.push(properties!);
            Reporter.measures.push(measures!);
        }
        public sendTelemetryErrorEvent(eventName: string, properties?: {}, measures?: {}) {
            this.sendTelemetryEvent(eventName, properties, measures);
        }
        public sendTelemetryException(_error: Error, _properties?: {}, _measures?: {}): void {
            throw new Error('sendTelemetryException is unsupported');
        }
    }

    setup(() => {
        process.env.VSC_PYTHON_UNIT_TEST = undefined;
        process.env.VSC_PYTHON_CI_TEST = undefined;
        readJSONSyncStub = sinon.stub(fs, 'readJSONSync');
        readJSONSyncStub.returns({ enableTelemetry: true });
        clearTelemetryReporter();
        Reporter.clear();
    });
    teardown(() => {
        process.env.VSC_PYTHON_UNIT_TEST = oldValueOfVSC_PYTHON_UNIT_TEST;
        process.env.VSC_PYTHON_CI_TEST = oldValueOfVSC_PYTHON_CI_TEST;
        rewiremock.disable();
        _resetSharedProperties();
        sinon.restore();
    });

    test('Send Telemetry', () => {
        rewiremock.enable();
        rewiremock('@vscode/extension-telemetry').with({ default: Reporter });

        const eventName = 'Testing';
        const properties = { hello: 'world', foo: 'bar' };
        const measures = { start: 123, end: 987 };

        sendTelemetryEvent(eventName as any, measures, properties as any);

        expect(Reporter.eventName).to.deep.equal([eventName]);
        expect(Reporter.measures).to.deep.equal([measures]);
        expect(Reporter.properties).to.deep.equal([properties]);
    });
    test('Send Telemetry with no properties', () => {
        rewiremock.enable();
        rewiremock('@vscode/extension-telemetry').with({ default: Reporter });

        const eventName = 'Testing';

        sendTelemetryEvent(eventName as any);

        expect(Reporter.eventName).to.deep.equal([eventName]);
        expect(Reporter.measures).to.deep.equal([undefined], 'Measures should be empty');
        expect(Reporter.properties).to.deep.equal([{}], 'Properties should be empty');
    });
    test('Send Telemetry with shared properties', () => {
        rewiremock.enable();
        rewiremock('@vscode/extension-telemetry').with({ default: Reporter });

        const eventName = 'Testing';
        const properties = { hello: 'world', foo: 'bar' };
        const measures = { start: 123, end: 987 };
        const expectedProperties = { ...properties, one: 'two' };

        setSharedProperty('one' as any, 'two' as any);

        sendTelemetryEvent(eventName as any, measures, properties as any);

        expect(Reporter.eventName).to.deep.equal([eventName]);
        expect(Reporter.measures).to.deep.equal([measures]);
        expect(Reporter.properties).to.deep.equal([expectedProperties]);
    });
    test('Shared properties will replace existing ones', () => {
        rewiremock.enable();
        rewiremock('@vscode/extension-telemetry').with({ default: Reporter });

        const eventName = 'Testing';
        const properties = { hello: 'world', foo: 'bar' };
        const measures = { start: 123, end: 987 };
        const expectedProperties = { ...properties, foo: 'baz' };

        setSharedProperty('foo' as any, 'baz' as any);

        sendTelemetryEvent(eventName as any, measures, properties as any);

        expect(Reporter.eventName).to.deep.equal([eventName]);
        expect(Reporter.measures).to.deep.equal([measures]);
        expect(Reporter.properties).to.deep.equal([expectedProperties]);
    });
    test('Send Exception Telemetry', () => {
        rewiremock.enable();
        const error = new Error('Boo');
        rewiremock('@vscode/extension-telemetry').with({ default: Reporter });

        const eventName = 'Testing';
        const measures = { start: 123, end: 987 };
        const properties = { hello: 'world', foo: 'bar' };

        sendTelemetryEvent(eventName as any, measures, properties as any, error);

        const expectedProperties = {
            ...properties,
            errorName: error.name,
            errorStack: error.stack,
        };

        expect(Reporter.eventName).to.deep.equal([eventName]);
        expect(Reporter.properties).to.deep.equal([expectedProperties]);
        expect(Reporter.measures).to.deep.equal([measures]);
    });
});
