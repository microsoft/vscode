// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert } from 'chai';
import * as sinon from 'sinon';
import { ExperimentationTelemetry } from '../../../client/common/experiments/telemetry';
import * as Telemetry from '../../../client/telemetry';

suite('Experimentation telemetry', () => {
    const event = 'SomeEventName';

    let telemetryEvents: { eventName: string; properties: object }[] = [];
    let sendTelemetryEventStub: sinon.SinonStub;
    let setSharedPropertyStub: sinon.SinonStub;
    let experimentTelemetry: ExperimentationTelemetry;
    let eventProperties: Map<string, string>;

    setup(() => {
        sendTelemetryEventStub = sinon.stub(Telemetry, 'sendTelemetryEvent').callsFake(((
            eventName: string,
            _,
            properties: object,
        ) => {
            const telemetry = { eventName, properties };
            telemetryEvents.push(telemetry);
        }) as typeof Telemetry.sendTelemetryEvent);
        setSharedPropertyStub = sinon.stub(Telemetry, 'setSharedProperty');

        eventProperties = new Map<string, string>();
        eventProperties.set('foo', 'one');
        eventProperties.set('bar', 'two');

        experimentTelemetry = new ExperimentationTelemetry();
    });

    teardown(() => {
        telemetryEvents = [];
        sinon.restore();
    });

    test('Calling postEvent should send a telemetry event', () => {
        experimentTelemetry.postEvent(event, eventProperties);

        sinon.assert.calledOnce(sendTelemetryEventStub);
        assert.strictEqual(telemetryEvents.length, 1);
        assert.deepEqual(telemetryEvents[0], {
            eventName: event,
            properties: {
                foo: 'one',
                bar: 'two',
            },
        });
    });

    test('Shared properties should be set for all telemetry events', () => {
        const shared = { key: 'shared', value: 'three' };

        experimentTelemetry.setSharedProperty(shared.key, shared.value);

        sinon.assert.calledOnce(setSharedPropertyStub);
    });
});
