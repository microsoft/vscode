// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';

import { assert } from 'chai';
import * as sinon from 'sinon';
import { anyString, instance, mock, when } from 'ts-mockito';
import { Uri } from 'vscode';
import { IWorkspaceService } from '../../client/common/application/types';
import { WorkspaceService } from '../../client/common/application/workspace';
import { FileSystem } from '../../client/common/platform/fileSystem';
import { IFileSystem } from '../../client/common/platform/types';
import * as Telemetry from '../../client/telemetry';
import { EventName } from '../../client/telemetry/constants';
import {
    EnvFileTelemetryTests,
    sendActivationTelemetry,
    sendFileCreationTelemetry,
    sendSettingTelemetry,
} from '../../client/telemetry/envFileTelemetry';

suite('Env file telemetry', () => {
    const defaultEnvFileValue = 'someDefaultValue';
    const resource = Uri.parse('foo');

    let telemetryEvent: { eventName: EventName; hasCustomEnvPath: boolean } | undefined;
    let sendTelemetryStub: sinon.SinonStub;
    let workspaceService: IWorkspaceService;
    let fileSystem: IFileSystem;

    setup(() => {
        fileSystem = mock(FileSystem);
        workspaceService = mock(WorkspaceService);

        const mockWorkspaceConfig = {
            inspect: () => ({
                defaultValue: defaultEnvFileValue,
            }),
        };

        when(workspaceService.getConfiguration('python')).thenReturn(mockWorkspaceConfig as any);

        const mockSendTelemetryEvent = ((
            eventName: EventName,
            _: number | undefined,
            { hasCustomEnvPath }: { hasCustomEnvPath: boolean },
        ) => {
            telemetryEvent = {
                eventName,
                hasCustomEnvPath,
            };
        }) as typeof Telemetry.sendTelemetryEvent;

        sendTelemetryStub = sinon.stub(Telemetry, 'sendTelemetryEvent').callsFake(mockSendTelemetryEvent);
    });

    teardown(() => {
        telemetryEvent = undefined;
        sinon.restore();
        EnvFileTelemetryTests.resetState();
    });

    test('Setting telemetry should be sent with hasCustomEnvPath at true if the python.envFile setting is different from the default value', () => {
        sendSettingTelemetry(instance(workspaceService), 'bar');

        sinon.assert.calledOnce(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, { eventName: EventName.ENVFILE_WORKSPACE, hasCustomEnvPath: true });
    });

    test('Setting telemetry should not be sent if a telemetry event has already been sent', () => {
        EnvFileTelemetryTests.setState({ telemetrySent: true });

        sendSettingTelemetry(instance(workspaceService), 'bar');

        sinon.assert.notCalled(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, undefined);
    });

    test('Setting telemetry should not be sent if the python.envFile setting is the same as the default value', () => {
        EnvFileTelemetryTests.setState({ defaultSetting: defaultEnvFileValue });

        sendSettingTelemetry(instance(workspaceService), defaultEnvFileValue);

        sinon.assert.notCalled(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, undefined);
    });

    test('File creation telemetry should be sent if no telemetry event has been sent before', () => {
        sendFileCreationTelemetry();

        sinon.assert.calledOnce(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, { eventName: EventName.ENVFILE_WORKSPACE, hasCustomEnvPath: false });
    });

    test('File creation telemetry should not be sent if a telemetry event has already been sent', () => {
        EnvFileTelemetryTests.setState({ telemetrySent: true });

        sendFileCreationTelemetry();

        sinon.assert.notCalled(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, undefined);
    });

    test('Activation telemetry should be sent if no telemetry event has been sent before, and a .env file exists', async () => {
        when(fileSystem.fileExists(anyString())).thenResolve(true);

        await sendActivationTelemetry(instance(fileSystem), instance(workspaceService), resource);

        sinon.assert.calledOnce(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, { eventName: EventName.ENVFILE_WORKSPACE, hasCustomEnvPath: false });
    });

    test('Activation telemetry should not be sent if a telemetry event has already been sent', async () => {
        EnvFileTelemetryTests.setState({ telemetrySent: true });

        await sendActivationTelemetry(instance(fileSystem), instance(workspaceService), resource);

        sinon.assert.notCalled(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, undefined);
    });

    test('Activation telemetry should not be sent if no .env file exists', async () => {
        when(fileSystem.fileExists(anyString())).thenResolve(false);

        await sendActivationTelemetry(instance(fileSystem), instance(workspaceService), resource);

        sinon.assert.notCalled(sendTelemetryStub);
        assert.deepEqual(telemetryEvent, undefined);
    });
});
