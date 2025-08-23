// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { DebugConfiguration, Uri } from 'vscode';
import { PythonDebugConfigurationService } from '../../../../client/debugger/extension/configuration/debugConfigurationService';
import { IDebugConfigurationResolver } from '../../../../client/debugger/extension/configuration/types';
import { AttachRequestArguments, LaunchRequestArguments } from '../../../../client/debugger/types';

suite('Debugging - Configuration Service', () => {
    let attachResolver: typemoq.IMock<IDebugConfigurationResolver<AttachRequestArguments>>;
    let launchResolver: typemoq.IMock<IDebugConfigurationResolver<LaunchRequestArguments>>;
    let configService: TestPythonDebugConfigurationService;

    class TestPythonDebugConfigurationService extends PythonDebugConfigurationService {}
    setup(() => {
        attachResolver = typemoq.Mock.ofType<IDebugConfigurationResolver<AttachRequestArguments>>();
        launchResolver = typemoq.Mock.ofType<IDebugConfigurationResolver<LaunchRequestArguments>>();
        configService = new TestPythonDebugConfigurationService(attachResolver.object, launchResolver.object);
    });
    test('Should use attach resolver when passing attach config', async () => {
        const config = ({
            request: 'attach',
        } as DebugConfiguration) as AttachRequestArguments;
        const folder = { name: '1', index: 0, uri: Uri.parse('1234') };
        const expectedConfig = { yay: 1 };

        attachResolver
            .setup((a) =>
                a.resolveDebugConfiguration(typemoq.It.isValue(folder), typemoq.It.isValue(config), typemoq.It.isAny()),
            )
            .returns(() => Promise.resolve((expectedConfig as unknown) as AttachRequestArguments))
            .verifiable(typemoq.Times.once());
        launchResolver
            .setup((a) => a.resolveDebugConfiguration(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
            .verifiable(typemoq.Times.never());

        const resolvedConfig = await configService.resolveDebugConfiguration(folder, config as DebugConfiguration);

        expect(resolvedConfig).to.deep.equal(expectedConfig);
        attachResolver.verifyAll();
        launchResolver.verifyAll();
    });
    [{ request: 'launch' }, { request: undefined }].forEach((config) => {
        test(`Should use launch resolver when passing launch config with request=${config.request}`, async () => {
            const folder = { name: '1', index: 0, uri: Uri.parse('1234') };
            const expectedConfig = { yay: 1 };

            launchResolver
                .setup((a) =>
                    a.resolveDebugConfiguration(
                        typemoq.It.isValue(folder),
                        typemoq.It.isValue((config as DebugConfiguration) as LaunchRequestArguments),
                        typemoq.It.isAny(),
                    ),
                )
                .returns(() => Promise.resolve((expectedConfig as unknown) as LaunchRequestArguments))
                .verifiable(typemoq.Times.once());
            attachResolver
                .setup((a) => a.resolveDebugConfiguration(typemoq.It.isAny(), typemoq.It.isAny(), typemoq.It.isAny()))
                .verifiable(typemoq.Times.never());

            const resolvedConfig = await configService.resolveDebugConfiguration(folder, config as DebugConfiguration);

            expect(resolvedConfig).to.deep.equal(expectedConfig);
            attachResolver.verifyAll();
            launchResolver.verifyAll();
        });
    });
});
