// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as TypeMoq from 'typemoq';
import * as path from 'path';
import { TextEditor, Selection, Position, TextDocument, Uri } from 'vscode';
import { SemVer } from 'semver';
import { assert, expect } from 'chai';
import * as fs from '../../../client/common/platform/fs-paths';
import {
    IActiveResourceService,
    IApplicationShell,
    ICommandManager,
    IDocumentManager,
} from '../../../client/common/application/types';
import { IProcessService, IProcessServiceFactory } from '../../../client/common/process/types';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { IConfigurationService, IExperimentService, IPythonSettings } from '../../../client/common/types';
import { CodeExecutionHelper } from '../../../client/terminals/codeExecution/helper';
import { IServiceContainer } from '../../../client/ioc/types';
import { ICodeExecutionHelper } from '../../../client/terminals/types';
import { Commands, EXTENSION_ROOT_DIR } from '../../../client/common/constants';
import { EnvironmentType, PythonEnvironment } from '../../../client/pythonEnvironments/info';
import { PYTHON_PATH, getPythonSemVer } from '../../common';
import { Architecture } from '../../../client/common/utils/platform';
import { ProcessService } from '../../../client/common/process/proc';
import { l10n } from '../../mocks/vsc';
import { ReplType } from '../../../client/repl/types';

const TEST_FILES_PATH = path.join(EXTENSION_ROOT_DIR, 'src', 'test', 'python_files', 'terminalExec');

suite('REPL - Smart Send', async () => {
    let documentManager: TypeMoq.IMock<IDocumentManager>;
    let applicationShell: TypeMoq.IMock<IApplicationShell>;

    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let commandManager: TypeMoq.IMock<ICommandManager>;

    let processServiceFactory: TypeMoq.IMock<IProcessServiceFactory>;
    let configurationService: TypeMoq.IMock<IConfigurationService>;

    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let codeExecutionHelper: ICodeExecutionHelper;
    let experimentService: TypeMoq.IMock<IExperimentService>;

    let processService: TypeMoq.IMock<IProcessService>;
    let activeResourceService: TypeMoq.IMock<IActiveResourceService>;

    let document: TypeMoq.IMock<TextDocument>;
    let pythonSettings: TypeMoq.IMock<IPythonSettings>;

    const workingPython: PythonEnvironment = {
        path: PYTHON_PATH,
        version: new SemVer('3.6.6-final'),
        sysVersion: '1.0.0.0',
        sysPrefix: 'Python',
        displayName: 'Python',
        envType: EnvironmentType.Unknown,
        architecture: Architecture.x64,
    };

    // suite set up only run once for each suite. Very start
    // set up --- before each test
    // tests -- actual tests
    // tear down -- run after each test
    // suite tear down only run once at the very end.

    // all object that is common to every test. What each test needs
    setup(() => {
        documentManager = TypeMoq.Mock.ofType<IDocumentManager>();
        applicationShell = TypeMoq.Mock.ofType<IApplicationShell>();
        processServiceFactory = TypeMoq.Mock.ofType<IProcessServiceFactory>();
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        commandManager = TypeMoq.Mock.ofType<ICommandManager>();
        configurationService = TypeMoq.Mock.ofType<IConfigurationService>();
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        experimentService = TypeMoq.Mock.ofType<IExperimentService>();
        processService = TypeMoq.Mock.ofType<IProcessService>();
        activeResourceService = TypeMoq.Mock.ofType<IActiveResourceService>();
        pythonSettings = TypeMoq.Mock.ofType<IPythonSettings>();
        const resource = Uri.parse('a');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        processService.setup((x: any) => x.then).returns(() => undefined);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IDocumentManager)))
            .returns(() => documentManager.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IApplicationShell)))
            .returns(() => applicationShell.object);
        processServiceFactory
            .setup((p) => p.create(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(processService.object));
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IProcessServiceFactory)))
            .returns(() => processServiceFactory.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IInterpreterService)))
            .returns(() => interpreterService.object);
        serviceContainer.setup((c) => c.get(TypeMoq.It.isValue(ICommandManager))).returns(() => commandManager.object);
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IConfigurationService)))
            .returns(() => configurationService.object);
        serviceContainer
            .setup((s) => s.get(TypeMoq.It.isValue(IExperimentService)))
            .returns(() => experimentService.object);
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(workingPython));
        serviceContainer
            .setup((c) => c.get(TypeMoq.It.isValue(IActiveResourceService)))
            .returns(() => activeResourceService.object);
        activeResourceService.setup((a) => a.getActiveResource()).returns(() => resource);

        pythonSettings
            .setup((s) => s.REPL)
            .returns(() => ({
                enableREPLSmartSend: true,
                REPLSmartSend: true,
                sendToNativeREPL: false,
            }));

        configurationService.setup((x) => x.getSettings(TypeMoq.It.isAny())).returns(() => pythonSettings.object);

        codeExecutionHelper = new CodeExecutionHelper(serviceContainer.object);
        document = TypeMoq.Mock.ofType<TextDocument>();
    });

    test('Cursor is not moved when explicit selection is present', async () => {
        const activeEditor = TypeMoq.Mock.ofType<TextEditor>();
        const firstIndexPosition = new Position(0, 0);
        const selection = TypeMoq.Mock.ofType<Selection>();
        const wholeFileContent = await fs.readFile(path.join(TEST_FILES_PATH, `sample_smart_selection.py`), 'utf8');

        selection.setup((s) => s.anchor).returns(() => firstIndexPosition);
        selection.setup((s) => s.active).returns(() => firstIndexPosition);
        selection.setup((s) => s.isEmpty).returns(() => false);
        activeEditor.setup((e) => e.selection).returns(() => selection.object);

        documentManager.setup((d) => d.activeTextEditor).returns(() => activeEditor.object);
        document.setup((d) => d.getText(TypeMoq.It.isAny())).returns(() => wholeFileContent);
        const actualProcessService = new ProcessService();

        const { execObservable } = actualProcessService;

        processService
            .setup((p) => p.execObservable(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns((file, args, options) => execObservable.apply(actualProcessService, [file, args, options]));

        await codeExecutionHelper.normalizeLines('my_dict = {', ReplType.terminal, wholeFileContent);

        commandManager
            .setup((c) => c.executeCommand('cursorMove', TypeMoq.It.isAny()))
            .callback((_, arg2) => {
                assert.deepEqual(arg2, {
                    to: 'down',
                    by: 'line',
                    value: 3,
                });
                return Promise.resolve();
            })
            .verifiable(TypeMoq.Times.never());

        commandManager
            .setup((c) => c.executeCommand('cursorEnd'))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.never());

        commandManager.verifyAll();
    });

    const pythonTestVersion = await getPythonSemVer();

    if (pythonTestVersion && pythonTestVersion.minor < 13) {
        test('Smart send should perform smart selection and move cursor - Python < 3.13', async () => {
            configurationService
                .setup((c) => c.getSettings(TypeMoq.It.isAny()))
                .returns({
                    REPL: {
                        REPLSmartSend: true,
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);

            const activeEditor = TypeMoq.Mock.ofType<TextEditor>();
            const firstIndexPosition = new Position(0, 0);
            const selection = TypeMoq.Mock.ofType<Selection>();
            const wholeFileContent = await fs.readFile(path.join(TEST_FILES_PATH, `sample_smart_selection.py`), 'utf8');

            selection.setup((s) => s.anchor).returns(() => firstIndexPosition);
            selection.setup((s) => s.active).returns(() => firstIndexPosition);
            selection.setup((s) => s.isEmpty).returns(() => true);
            activeEditor.setup((e) => e.selection).returns(() => selection.object);

            documentManager.setup((d) => d.activeTextEditor).returns(() => activeEditor.object);
            document.setup((d) => d.getText(TypeMoq.It.isAny())).returns(() => wholeFileContent);
            const actualProcessService = new ProcessService();

            const { execObservable } = actualProcessService;

            processService
                .setup((p) => p.execObservable(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns((file, args, options) => execObservable.apply(actualProcessService, [file, args, options]));

            const actualSmartOutput = await codeExecutionHelper.normalizeLines(
                'my_dict = {',
                ReplType.terminal,
                wholeFileContent,
            );

            // my_dict = {  <----- smart shift+enter here
            //     "key1": "value1",
            //     "key2": "value2"
            // } <---- cursor should be here afterwards, hence offset 3
            commandManager
                .setup((c) => c.executeCommand('cursorMove', TypeMoq.It.isAny()))
                .callback((_, arg2) => {
                    assert.deepEqual(arg2, {
                        to: 'down',
                        by: 'line',
                        value: 3,
                    });
                    return Promise.resolve();
                })
                .verifiable(TypeMoq.Times.once());

            commandManager
                .setup((c) => c.executeCommand('cursorEnd'))
                .returns(() => Promise.resolve())
                .verifiable(TypeMoq.Times.once());

            const expectedSmartOutput = 'my_dict = {\n    "key1": "value1",\n    "key2": "value2"\n}\n';
            expect(actualSmartOutput).to.be.equal(expectedSmartOutput);
            commandManager.verifyAll();
        });
    }

    // Do not perform smart selection when there is explicit selection
    test('Smart send should not perform smart selection when there is explicit selection', async () => {
        const activeEditor = TypeMoq.Mock.ofType<TextEditor>();
        const firstIndexPosition = new Position(0, 0);
        const selection = TypeMoq.Mock.ofType<Selection>();
        const wholeFileContent = await fs.readFile(path.join(TEST_FILES_PATH, `sample_smart_selection.py`), 'utf8');

        selection.setup((s) => s.anchor).returns(() => firstIndexPosition);
        selection.setup((s) => s.active).returns(() => firstIndexPosition);
        selection.setup((s) => s.isEmpty).returns(() => false);
        activeEditor.setup((e) => e.selection).returns(() => selection.object);

        documentManager.setup((d) => d.activeTextEditor).returns(() => activeEditor.object);
        document.setup((d) => d.getText(TypeMoq.It.isAny())).returns(() => wholeFileContent);
        const actualProcessService = new ProcessService();

        const { execObservable } = actualProcessService;

        processService
            .setup((p) => p.execObservable(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns((file, args, options) => execObservable.apply(actualProcessService, [file, args, options]));

        const actualNonSmartResult = await codeExecutionHelper.normalizeLines(
            'my_dict = {',
            ReplType.terminal,
            wholeFileContent,
        );
        const expectedNonSmartResult = 'my_dict = {\n\n'; // Standard for previous normalization logic
        expect(actualNonSmartResult).to.be.equal(expectedNonSmartResult);
    });

    test('Smart Send should provide warning when code is not valid', async () => {
        configurationService
            .setup((c) => c.getSettings(TypeMoq.It.isAny()))
            .returns({
                REPL: {
                    REPLSmartSend: true,
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

        const activeEditor = TypeMoq.Mock.ofType<TextEditor>();
        const firstIndexPosition = new Position(0, 0);
        const selection = TypeMoq.Mock.ofType<Selection>();
        const wholeFileContent = await fs.readFile(
            path.join(TEST_FILES_PATH, `sample_invalid_smart_selection.py`),
            'utf8',
        );

        selection.setup((s) => s.anchor).returns(() => firstIndexPosition);
        selection.setup((s) => s.active).returns(() => firstIndexPosition);
        selection.setup((s) => s.isEmpty).returns(() => true);
        activeEditor.setup((e) => e.selection).returns(() => selection.object);

        documentManager.setup((d) => d.activeTextEditor).returns(() => activeEditor.object);
        document.setup((d) => d.getText(TypeMoq.It.isAny())).returns(() => wholeFileContent);
        const actualProcessService = new ProcessService();

        const { execObservable } = actualProcessService;

        processService
            .setup((p) => p.execObservable(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns((file, args, options) => execObservable.apply(actualProcessService, [file, args, options]));

        await codeExecutionHelper.normalizeLines('my_dict = {', ReplType.terminal, wholeFileContent);

        applicationShell
            .setup((a) =>
                a.showWarningMessage(
                    l10n.t(
                        'Python is unable to parse the code provided. Please turn off Smart Send if you wish to always run line by line or explicitly select code to force run. [logs](command:{0}) for more details.',
                        Commands.ViewOutput,
                    ),
                    'Switch to line-by-line',
                ),
            )
            .verifiable(TypeMoq.Times.once());
    });
});
