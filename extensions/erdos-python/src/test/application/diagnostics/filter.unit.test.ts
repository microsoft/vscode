// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { DiagnosticFilterService, FilterKeys } from '../../../client/application/diagnostics/filter';
import { DiagnosticScope, IDiagnosticFilterService } from '../../../client/application/diagnostics/types';
import { IPersistentState, IPersistentStateFactory } from '../../../client/common/types';
import { IServiceContainer } from '../../../client/ioc/types';

suite('Application Diagnostics - Filter', () => {
    let globalState: typemoq.IMock<IPersistentState<string[]>>;
    let workspaceState: typemoq.IMock<IPersistentState<string[]>>;

    [
        { name: 'Global', scope: DiagnosticScope.Global, state: () => globalState, otherState: () => workspaceState },
        {
            name: 'Workspace',
            scope: DiagnosticScope.WorkspaceFolder,
            state: () => workspaceState,
            otherState: () => globalState,
        },
    ].forEach((item) => {
        let serviceContainer: typemoq.IMock<IServiceContainer>;
        let filterService: IDiagnosticFilterService;

        setup(() => {
            globalState = typemoq.Mock.ofType<IPersistentState<string[]>>();
            workspaceState = typemoq.Mock.ofType<IPersistentState<string[]>>();

            serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
            const stateFactory = typemoq.Mock.ofType<IPersistentStateFactory>();

            stateFactory
                .setup((f) =>
                    f.createGlobalPersistentState<string[]>(
                        typemoq.It.isValue(FilterKeys.GlobalDiagnosticFilter),
                        typemoq.It.isValue([]),
                    ),
                )
                .returns(() => globalState.object);
            stateFactory
                .setup((f) =>
                    f.createWorkspacePersistentState<string[]>(
                        typemoq.It.isValue(FilterKeys.WorkspaceDiagnosticFilter),
                        typemoq.It.isValue([]),
                    ),
                )
                .returns(() => workspaceState.object);
            serviceContainer
                .setup((s) => s.get(typemoq.It.isValue(IPersistentStateFactory)))
                .returns(() => stateFactory.object);

            filterService = new DiagnosticFilterService(serviceContainer.object);
        });

        test(`ignoreDiagnostic must save codes in ${item.name} Persistent State`, async () => {
            const code = 'xyz';
            item.state()
                .setup((g) => g.value)
                .returns(() => [])
                .verifiable(typemoq.Times.once());
            item.state()
                .setup((g) => g.updateValue(typemoq.It.isValue([code])))
                .verifiable(typemoq.Times.once());

            item.otherState()
                .setup((g) => g.value)
                .verifiable(typemoq.Times.never());
            item.otherState()
                .setup((g) => g.updateValue(typemoq.It.isAny()))
                .verifiable(typemoq.Times.never());

            await filterService.ignoreDiagnostic(code, item.scope);

            item.state().verifyAll();
        });
        test("shouldIgnoreDiagnostic should return 'false' when code does not exist in any State", async () => {
            const code = 'xyz';
            item.state()
                .setup((g) => g.value)
                .returns(() => [])
                .verifiable(typemoq.Times.once());
            item.otherState()
                .setup((g) => g.value)
                .returns(() => [])
                .verifiable(typemoq.Times.once());

            const ignore = await filterService.shouldIgnoreDiagnostic(code);

            expect(ignore).to.be.equal(false, 'Incorrect value');
            item.state().verifyAll();
        });
        test(`shouldIgnoreDiagnostic should return \'true\' when code exist in ${item.name} State`, async () => {
            const code = 'xyz';
            item.state()
                .setup((g) => g.value)
                .returns(() => ['a', 'b', 'c', code])
                .verifiable(typemoq.Times.once());
            item.otherState()
                .setup((g) => g.value)
                .returns(() => [])
                .verifiable(typemoq.Times.once());

            const ignore = await filterService.shouldIgnoreDiagnostic(code);

            expect(ignore).to.be.equal(true, 'Incorrect value');
            item.state().verifyAll();
        });

        test("shouldIgnoreDiagnostic should return 'true' when code exist in any State", async () => {
            const code = 'xyz';
            item.state()
                .setup((g) => g.value)
                .returns(() => [])
                .verifiable(typemoq.Times.atLeast(0));
            item.otherState()
                .setup((g) => g.value)
                .returns(() => ['a', 'b', 'c', code])
                .verifiable(typemoq.Times.atLeast(0));

            const ignore = await filterService.shouldIgnoreDiagnostic(code);

            expect(ignore).to.be.equal(true, 'Incorrect value');
            item.state().verifyAll();
        });

        test(`ignoreDiagnostic must append codes in ${item.name} Persistent State`, async () => {
            const code = 'xyz';
            const currentState = ['a', 'b', 'c'];
            item.state()
                .setup((g) => g.value)
                .returns(() => currentState)
                .verifiable(typemoq.Times.atLeastOnce());
            item.state()
                .setup((g) => g.updateValue(typemoq.It.isAny()))
                .callback((value) => {
                    expect(value).to.deep.equal(currentState.concat([code]));
                })
                .verifiable(typemoq.Times.atLeastOnce());

            item.otherState()
                .setup((g) => g.value)
                .verifiable(typemoq.Times.never());
            item.otherState()
                .setup((g) => g.updateValue(typemoq.It.isAny()))
                .verifiable(typemoq.Times.never());

            await filterService.ignoreDiagnostic(code, item.scope);

            item.state().verifyAll();
        });
    });
});
