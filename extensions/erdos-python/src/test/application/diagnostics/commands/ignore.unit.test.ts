// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as typemoq from 'typemoq';
import { IgnoreDiagnosticCommand } from '../../../../client/application/diagnostics/commands/ignore';
import {
    DiagnosticScope,
    IDiagnostic,
    IDiagnosticCommand,
    IDiagnosticFilterService,
} from '../../../../client/application/diagnostics/types';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Commands Ignore', () => {
    let ignoreCommand: IDiagnosticCommand;
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    let diagnostic: typemoq.IMock<IDiagnostic>;
    setup(() => {
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>();

        diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        ignoreCommand = new IgnoreDiagnosticCommand(diagnostic.object, serviceContainer.object, DiagnosticScope.Global);
    });

    test('Invoking Command should invoke the filter Service', async () => {
        const filterService = typemoq.Mock.ofType<IDiagnosticFilterService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IDiagnosticFilterService)))
            .returns(() => filterService.object)
            .verifiable(typemoq.Times.once());
        diagnostic
            .setup((d) => d.code)
            .returns(() => 'xyz' as any)
            .verifiable(typemoq.Times.once());
        filterService
            .setup((s) => s.ignoreDiagnostic(typemoq.It.isValue('xyz'), typemoq.It.isValue(DiagnosticScope.Global)))
            .verifiable(typemoq.Times.once());

        await ignoreCommand.invoke();
        serviceContainer.verifyAll();
    });
});
