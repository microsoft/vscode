// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { ExtensionContext } from 'vscode';
import { BaseDiagnosticsService } from '../../../../client/application/diagnostics/base';
import {
    PylanceDefaultDiagnostic,
    PylanceDefaultDiagnosticService,
    PYLANCE_PROMPT_MEMENTO,
} from '../../../../client/application/diagnostics/checks/pylanceDefault';
import { DiagnosticCodes } from '../../../../client/application/diagnostics/constants';
import { MessageCommandPrompt } from '../../../../client/application/diagnostics/promptHandler';
import {
    IDiagnostic,
    IDiagnosticFilterService,
    IDiagnosticHandlerService,
} from '../../../../client/application/diagnostics/types';
import { IExtensionContext } from '../../../../client/common/types';
import { Common, Diagnostics } from '../../../../client/common/utils/localize';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Pylance informational prompt', () => {
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    let diagnosticService: PylanceDefaultDiagnosticService;
    let filterService: typemoq.IMock<IDiagnosticFilterService>;
    let messageHandler: typemoq.IMock<IDiagnosticHandlerService<MessageCommandPrompt>>;
    let context: typemoq.IMock<IExtensionContext>;
    let memento: typemoq.IMock<ExtensionContext['globalState']>;

    setup(() => {
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        filterService = typemoq.Mock.ofType<IDiagnosticFilterService>();
        messageHandler = typemoq.Mock.ofType<IDiagnosticHandlerService<MessageCommandPrompt>>();
        context = typemoq.Mock.ofType<IExtensionContext>();
        memento = typemoq.Mock.ofType<ExtensionContext['globalState']>();

        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IDiagnosticFilterService)))
            .returns(() => filterService.object);
        context.setup((c) => c.globalState).returns(() => memento.object);

        diagnosticService = new (class extends PylanceDefaultDiagnosticService {
            // eslint-disable-next-line class-methods-use-this
            public _clear() {
                while (BaseDiagnosticsService.handledDiagnosticCodeKeys.length > 0) {
                    BaseDiagnosticsService.handledDiagnosticCodeKeys.shift();
                }
            }
        })(serviceContainer.object, context.object, messageHandler.object, []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (diagnosticService as any)._clear();
    });

    teardown(() => {
        context.reset();
        memento.reset();
    });

    function setupMementos(version?: string, promptShown?: boolean) {
        diagnosticService.initialMementoValue = version;
        memento.setup((m) => m.get(PYLANCE_PROMPT_MEMENTO)).returns(() => promptShown);
    }

    test("Should display message if it's an existing installation of the extension and the prompt has not been shown yet", async () => {
        setupMementos('1.0.0', undefined);

        const diagnostics = await diagnosticService.diagnose(undefined);

        assert.deepStrictEqual(diagnostics, [
            new PylanceDefaultDiagnostic(Diagnostics.pylanceDefaultMessage, undefined),
        ]);
    });

    test("Should return empty diagnostics if it's an existing installation of the extension and the prompt has been shown before", async () => {
        setupMementos('1.0.0', true);

        const diagnostics = await diagnosticService.diagnose(undefined);

        assert.deepStrictEqual(diagnostics, []);
    });

    test("Should return empty diagnostics if it's a fresh installation of the extension", async () => {
        setupMementos(undefined, undefined);

        const diagnostics = await diagnosticService.diagnose(undefined);

        assert.deepStrictEqual(diagnostics, []);
    });

    test('Should display a prompt when handling the diagnostic code', async () => {
        const diagnostic = new PylanceDefaultDiagnostic(DiagnosticCodes.PylanceDefaultDiagnostic, undefined);
        let messagePrompt: MessageCommandPrompt | undefined;

        messageHandler
            .setup((f) => f.handle(typemoq.It.isValue(diagnostic), typemoq.It.isAny()))
            .callback((_d, prompt: MessageCommandPrompt) => {
                messagePrompt = prompt;
            })
            .returns(() => Promise.resolve())
            .verifiable(typemoq.Times.once());

        await diagnosticService.handle([diagnostic]);

        filterService.verifyAll();
        messageHandler.verifyAll();

        assert.notDeepStrictEqual(messagePrompt, undefined);
        assert.notDeepStrictEqual(messagePrompt!.onClose, undefined);
        assert.deepStrictEqual(messagePrompt!.commandPrompts, [{ prompt: Common.ok }]);
    });

    test('Should return empty diagnostics if the diagnostic code has been ignored', async () => {
        const diagnostic = new PylanceDefaultDiagnostic(DiagnosticCodes.PylanceDefaultDiagnostic, undefined);

        filterService
            .setup((f) => f.shouldIgnoreDiagnostic(typemoq.It.isValue(DiagnosticCodes.PylanceDefaultDiagnostic)))
            .returns(() => Promise.resolve(true))
            .verifiable(typemoq.Times.once());

        messageHandler.setup((f) => f.handle(typemoq.It.isAny(), typemoq.It.isAny())).verifiable(typemoq.Times.never());

        await diagnosticService.handle([diagnostic]);

        filterService.verifyAll();
        messageHandler.verifyAll();
    });

    test('PylanceDefaultDiagnosticService can handle PylanceDefaultDiagnostic diagnostics', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        diagnostic
            .setup((d) => d.code)
            .returns(() => DiagnosticCodes.PylanceDefaultDiagnostic)
            .verifiable(typemoq.Times.atLeastOnce());

        const canHandle = await diagnosticService.canHandle(diagnostic.object);

        expect(canHandle).to.be.equal(true, 'Invalid value');
        diagnostic.verifyAll();
    });

    test('PylanceDefaultDiagnosticService cannot handle non-PylanceDefaultDiagnostic diagnostics', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        diagnostic
            .setup((d) => d.code)
            .returns(() => DiagnosticCodes.EnvironmentActivationInPowerShellWithBatchFilesNotSupportedDiagnostic)
            .verifiable(typemoq.Times.atLeastOnce());

        const canHandle = await diagnosticService.canHandle(diagnostic.object);

        expect(canHandle).to.be.equal(false, 'Invalid value');
        diagnostic.verifyAll();
    });
});
