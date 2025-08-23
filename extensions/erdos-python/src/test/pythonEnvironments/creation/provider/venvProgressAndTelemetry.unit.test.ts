// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as sinon from 'sinon';
import * as typemoq from 'typemoq';
import {
    VENV_CREATED_MARKER,
    VenvProgressAndTelemetry,
} from '../../../../client/pythonEnvironments/creation/provider/venvProgressAndTelemetry';
import { CreateEnvironmentProgress } from '../../../../client/pythonEnvironments/creation/types';
import * as telemetry from '../../../../client/telemetry';
import { CreateEnv } from '../../../../client/common/utils/localize';

suite('Venv Progress and Telemetry', () => {
    let sendTelemetryEventStub: sinon.SinonStub;
    let progressReporterMock: typemoq.IMock<CreateEnvironmentProgress>;

    setup(() => {
        sendTelemetryEventStub = sinon.stub(telemetry, 'sendTelemetryEvent');
        progressReporterMock = typemoq.Mock.ofType<CreateEnvironmentProgress>();
    });

    teardown(() => {
        sinon.restore();
    });

    test('Ensure telemetry event and progress are sent', async () => {
        const progressReporter = progressReporterMock.object;
        progressReporterMock
            .setup((p) => p.report({ message: CreateEnv.Venv.created }))
            .returns(() => undefined)
            .verifiable(typemoq.Times.once());

        const progressAndTelemetry = new VenvProgressAndTelemetry(progressReporter);
        progressAndTelemetry.process(VENV_CREATED_MARKER);
        assert.isTrue(sendTelemetryEventStub.calledOnce);
        progressReporterMock.verifyAll();
    });

    test('Do not trigger telemetry event the second time', async () => {
        const progressReporter = progressReporterMock.object;
        progressReporterMock
            .setup((p) => p.report({ message: CreateEnv.Venv.created }))
            .returns(() => undefined)
            .verifiable(typemoq.Times.once());

        const progressAndTelemetry = new VenvProgressAndTelemetry(progressReporter);
        progressAndTelemetry.process(VENV_CREATED_MARKER);
        progressAndTelemetry.process(VENV_CREATED_MARKER);
        assert.isTrue(sendTelemetryEventStub.calledOnce);
        progressReporterMock.verifyAll();
    });
});
