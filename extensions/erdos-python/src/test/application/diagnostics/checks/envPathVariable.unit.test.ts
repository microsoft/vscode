// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as path from 'path';
import * as typemoq from 'typemoq';
import { DiagnosticSeverity } from 'vscode';
import { BaseDiagnosticsService } from '../../../../client/application/diagnostics/base';
import { EnvironmentPathVariableDiagnosticsService } from '../../../../client/application/diagnostics/checks/envPathVariable';
import { CommandOption, IDiagnosticsCommandFactory } from '../../../../client/application/diagnostics/commands/types';
import { DiagnosticCodes } from '../../../../client/application/diagnostics/constants';
import {
    DiagnosticCommandPromptHandlerServiceId,
    MessageCommandPrompt,
} from '../../../../client/application/diagnostics/promptHandler';
import {
    DiagnosticScope,
    IDiagnostic,
    IDiagnosticCommand,
    IDiagnosticFilterService,
    IDiagnosticHandlerService,
    IDiagnosticsService,
} from '../../../../client/application/diagnostics/types';
import { IApplicationEnvironment, IWorkspaceService } from '../../../../client/common/application/types';
import { IPlatformService } from '../../../../client/common/platform/types';
import { ICurrentProcess, IPathUtils } from '../../../../client/common/types';
import { EnvironmentVariables } from '../../../../client/common/variables/types';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Checks Env Path Variable', () => {
    let diagnosticService: IDiagnosticsService;
    let platformService: typemoq.IMock<IPlatformService>;
    let messageHandler: typemoq.IMock<IDiagnosticHandlerService<MessageCommandPrompt>>;
    let filterService: typemoq.IMock<IDiagnosticFilterService>;
    let procEnv: typemoq.IMock<EnvironmentVariables>;
    let appEnv: typemoq.IMock<IApplicationEnvironment>;
    let commandFactory: typemoq.IMock<IDiagnosticsCommandFactory>;
    const pathVariableName = 'Path';
    const pathDelimiter = ';';
    const extensionName = 'Some Extension Name';
    setup(() => {
        const serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        platformService = typemoq.Mock.ofType<IPlatformService>();
        platformService.setup((p) => p.pathVariableName).returns(() => pathVariableName);
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IPlatformService)))
            .returns(() => platformService.object);

        messageHandler = typemoq.Mock.ofType<IDiagnosticHandlerService<MessageCommandPrompt>>();
        serviceContainer
            .setup((s) =>
                s.get(
                    typemoq.It.isValue(IDiagnosticHandlerService),
                    typemoq.It.isValue(DiagnosticCommandPromptHandlerServiceId),
                ),
            )
            .returns(() => messageHandler.object);

        appEnv = typemoq.Mock.ofType<IApplicationEnvironment>();
        appEnv.setup((a) => a.extensionName).returns(() => extensionName);
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(IApplicationEnvironment))).returns(() => appEnv.object);

        filterService = typemoq.Mock.ofType<IDiagnosticFilterService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IDiagnosticFilterService)))
            .returns(() => filterService.object);

        commandFactory = typemoq.Mock.ofType<IDiagnosticsCommandFactory>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IDiagnosticsCommandFactory)))
            .returns(() => commandFactory.object);

        const currentProc = typemoq.Mock.ofType<ICurrentProcess>();
        procEnv = typemoq.Mock.ofType<EnvironmentVariables>();
        currentProc.setup((p) => p.env).returns(() => procEnv.object);
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(ICurrentProcess))).returns(() => currentProc.object);

        const pathUtils = typemoq.Mock.ofType<IPathUtils>();
        pathUtils.setup((p) => p.delimiter).returns(() => pathDelimiter);
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(IPathUtils))).returns(() => pathUtils.object);
        const workspaceService = typemoq.Mock.ofType<IWorkspaceService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IWorkspaceService)))
            .returns(() => workspaceService.object);
        workspaceService.setup((w) => w.getWorkspaceFolder(typemoq.It.isAny())).returns(() => undefined);

        diagnosticService = new (class extends EnvironmentPathVariableDiagnosticsService {
            public _clear() {
                while (BaseDiagnosticsService.handledDiagnosticCodeKeys.length > 0) {
                    BaseDiagnosticsService.handledDiagnosticCodeKeys.shift();
                }
            }
        })(serviceContainer.object, []);
        (diagnosticService as any)._clear();
    });

    test('Can handle EnvPathVariable diagnostics', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        diagnostic
            .setup((d) => d.code)
            .returns(() => DiagnosticCodes.InvalidEnvironmentPathVariableDiagnostic)
            .verifiable(typemoq.Times.atLeastOnce());

        const canHandle = await diagnosticService.canHandle(diagnostic.object);
        expect(canHandle).to.be.equal(true, 'Invalid value');
        diagnostic.verifyAll();
    });
    test('Can not handle non-EnvPathVariable diagnostics', async () => {
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        diagnostic
            .setup((d) => d.code)
            .returns(() => 'Something Else' as any)
            .verifiable(typemoq.Times.atLeastOnce());

        const canHandle = await diagnosticService.canHandle(diagnostic.object);
        expect(canHandle).to.be.equal(false, 'Invalid value');
        diagnostic.verifyAll();
    });
    test('Should return empty diagnostics for Mac', async () => {
        platformService.setup((p) => p.isMac).returns(() => true);
        platformService.setup((p) => p.isLinux).returns(() => false);
        platformService.setup((p) => p.isWindows).returns(() => false);
        const diagnostics = await diagnosticService.diagnose(undefined);
        expect(diagnostics).to.be.deep.equal([]);
    });
    test('Should return empty diagnostics for Linux', async () => {
        platformService.setup((p) => p.isMac).returns(() => false);
        platformService.setup((p) => p.isLinux).returns(() => true);
        platformService.setup((p) => p.isWindows).returns(() => false);
        const diagnostics = await diagnosticService.diagnose(undefined);
        expect(diagnostics).to.be.deep.equal([]);
    });
    test('Should return empty diagnostics for Windows if path variable is valid', async () => {
        platformService.setup((p) => p.isWindows).returns(() => true);
        const paths = [path.join('one', 'two', 'three'), path.join('one', 'two', 'four')].join(pathDelimiter);
        procEnv.setup((env) => env[pathVariableName]).returns(() => paths);

        const diagnostics = await diagnosticService.diagnose(undefined);

        expect(diagnostics).to.be.deep.equal([]);
    });
    // Note: On windows, when a path contains a `;` then Windows encloses the path within `"`.
    test("Should return single diagnostics for Windows if path contains '\"'", async () => {
        platformService.setup((p) => p.isWindows).returns(() => true);
        const paths = [path.join('one', 'two', 'three"'), path.join('one', 'two', 'four')].join(pathDelimiter);
        procEnv.setup((env) => env[pathVariableName]).returns(() => paths);

        const diagnostics = await diagnosticService.diagnose(undefined);

        expect(diagnostics).to.be.lengthOf(1);
        expect(diagnostics[0].code).to.be.equal(DiagnosticCodes.InvalidEnvironmentPathVariableDiagnostic);
        expect(diagnostics[0].message).to.contain(extensionName);
        expect(diagnostics[0].message).to.contain(pathVariableName);
        expect(diagnostics[0].severity).to.be.equal(DiagnosticSeverity.Warning);
        expect(diagnostics[0].scope).to.be.equal(DiagnosticScope.Global);
    });
    test('Should not return diagnostics for Windows if path ends with delimiter', async () => {
        const paths =
            [path.join('one', 'two', 'three'), path.join('one', 'two', 'four')].join(pathDelimiter) + pathDelimiter;
        platformService.setup((p) => p.isWindows).returns(() => true);
        procEnv.setup((env) => env[pathVariableName]).returns(() => paths);

        const diagnostics = await diagnosticService.diagnose(undefined);

        expect(diagnostics).to.be.lengthOf(0);
    });
    test('Should display three options in message displayed with 2 commands', async () => {
        platformService.setup((p) => p.isWindows).returns(() => true);
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
        diagnostic
            .setup((d) => d.code)
            .returns(() => DiagnosticCodes.InvalidEnvironmentPathVariableDiagnostic)
            .verifiable(typemoq.Times.atLeastOnce());
        const alwaysIgnoreCommand = typemoq.Mock.ofType<IDiagnosticCommand>();
        commandFactory
            .setup((f) =>
                f.createCommand(
                    typemoq.It.isAny(),
                    typemoq.It.isObjectWith<CommandOption<'ignore', DiagnosticScope>>({
                        type: 'ignore',
                        options: DiagnosticScope.Global,
                    }),
                ),
            )
            .returns(() => alwaysIgnoreCommand.object)
            .verifiable(typemoq.Times.once());
        const launchBrowserCommand = typemoq.Mock.ofType<IDiagnosticCommand>();
        commandFactory
            .setup((f) =>
                f.createCommand(
                    typemoq.It.isAny(),
                    typemoq.It.isObjectWith<CommandOption<'launch', string>>({ type: 'launch' }),
                ),
            )
            .returns(() => launchBrowserCommand.object)
            .verifiable(typemoq.Times.once());
        messageHandler.setup((m) => m.handle(typemoq.It.isAny(), typemoq.It.isAny())).verifiable(typemoq.Times.once());

        await diagnosticService.handle([diagnostic.object]);

        diagnostic.verifyAll();
        commandFactory.verifyAll();
        messageHandler.verifyAll();
    });
    test('Should not display a message if the diagnostic code has been ignored', async () => {
        platformService.setup((p) => p.isWindows).returns(() => true);
        const diagnostic = typemoq.Mock.ofType<IDiagnostic>();

        filterService
            .setup((f) =>
                f.shouldIgnoreDiagnostic(typemoq.It.isValue(DiagnosticCodes.InvalidEnvironmentPathVariableDiagnostic)),
            )
            .returns(() => Promise.resolve(true))
            .verifiable(typemoq.Times.once());
        diagnostic
            .setup((d) => d.code)
            .returns(() => DiagnosticCodes.InvalidEnvironmentPathVariableDiagnostic)
            .verifiable(typemoq.Times.atLeastOnce());
        commandFactory
            .setup((f) => f.createCommand(typemoq.It.isAny(), typemoq.It.isAny()))
            .verifiable(typemoq.Times.never());
        messageHandler.setup((m) => m.handle(typemoq.It.isAny(), typemoq.It.isAny())).verifiable(typemoq.Times.never());

        await diagnosticService.handle([diagnostic.object]);

        filterService.verifyAll();
        diagnostic.verifyAll();
        commandFactory.verifyAll();
        messageHandler.verifyAll();
    });
});
