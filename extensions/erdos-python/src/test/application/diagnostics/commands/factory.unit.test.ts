// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { DiagnosticsCommandFactory } from '../../../../client/application/diagnostics/commands/factory';
import { IgnoreDiagnosticCommand } from '../../../../client/application/diagnostics/commands/ignore';
import { LaunchBrowserCommand } from '../../../../client/application/diagnostics/commands/launchBrowser';
import { IDiagnosticsCommandFactory } from '../../../../client/application/diagnostics/commands/types';
import { DiagnosticScope, IDiagnostic } from '../../../../client/application/diagnostics/types';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Commands Factory', () => {
    let commandFactory: IDiagnosticsCommandFactory;
    setup(() => {
        const serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        commandFactory = new DiagnosticsCommandFactory(serviceContainer.object);
    });

    test('Test creation of Ignore Command', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();

        const command = commandFactory.createCommand(diagnostic.object, {
            type: 'ignore',
            options: DiagnosticScope.Global,
        });
        expect(command).to.be.instanceOf(IgnoreDiagnosticCommand);
    });

    test('Test creation of Launch Browser Command', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();

        const command = commandFactory.createCommand(diagnostic.object, { type: 'launch', options: 'x' });
        expect(command).to.be.instanceOf(LaunchBrowserCommand);
    });
});
