// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import * as TypeMoq from 'typemoq';

import { WorkspaceConfiguration } from 'vscode';
import { LanguageServerType } from '../../../client/activation/types';
import { IApplicationEnvironment } from '../../../client/common/application/types';
import { WorkspaceService } from '../../../client/common/application/workspace';
import { PythonSettings } from '../../../client/common/configSettings';
import { InterpreterPathService } from '../../../client/common/interpreterPathService';
import { PersistentStateFactory } from '../../../client/common/persistentState';
import {
    IAutoCompleteSettings,
    IExperiments,
    IInterpreterSettings,
    ITerminalSettings,
} from '../../../client/common/types';
import { noop } from '../../../client/common/utils/misc';
import * as EnvFileTelemetry from '../../../client/telemetry/envFileTelemetry';
import { ITestingSettings } from '../../../client/testing/configuration/types';
import { MockAutoSelectionService } from '../../mocks/autoSelector';
import { MockMemento } from '../../mocks/mementos';
import { untildify } from '../../../client/common/helpers';
import { MockExtensions } from '../../mocks/extensions';

suite('Python Settings', async () => {
    class CustomPythonSettings extends PythonSettings {
        public update(pythonSettings: WorkspaceConfiguration) {
            return super.update(pythonSettings);
        }
        public initialize() {
            noop();
        }
    }
    let config: TypeMoq.IMock<WorkspaceConfiguration>;
    let expected: CustomPythonSettings;
    let settings: CustomPythonSettings;
    let extensions: MockExtensions;
    setup(() => {
        sinon.stub(EnvFileTelemetry, 'sendSettingTelemetry').returns();
        config = TypeMoq.Mock.ofType<WorkspaceConfiguration>(undefined, TypeMoq.MockBehavior.Loose);

        const workspaceService = new WorkspaceService();
        const workspaceMemento = new MockMemento();
        const globalMemento = new MockMemento();
        extensions = new MockExtensions();
        const persistentStateFactory = new PersistentStateFactory(globalMemento, workspaceMemento);
        expected = new CustomPythonSettings(
            undefined,
            new MockAutoSelectionService(),
            workspaceService,
            new InterpreterPathService(persistentStateFactory, workspaceService, [], {
                remoteName: undefined,
            } as IApplicationEnvironment),
            { defaultLSType: LanguageServerType.Jedi },
            extensions,
        );
        settings = new CustomPythonSettings(
            undefined,
            new MockAutoSelectionService(),
            workspaceService,
            new InterpreterPathService(persistentStateFactory, workspaceService, [], {
                remoteName: undefined,
            } as IApplicationEnvironment),
            { defaultLSType: LanguageServerType.Jedi },
            extensions,
        );
        expected.defaultInterpreterPath = 'python';
    });

    teardown(() => {
        sinon.restore();
    });

    function initializeConfig(sourceSettings: PythonSettings) {
        // string settings
        for (const name of [
            'pythonPath',
            'venvPath',
            'activeStateToolPath',
            'condaPath',
            'pipenvPath',
            'envFile',
            'poetryPath',
            'pixiToolPath',
            'defaultInterpreterPath',
        ]) {
            config
                .setup((c) => c.get<string>(name))

                .returns(() => (sourceSettings as any)[name]);
        }
        for (const name of ['venvFolders']) {
            config
                .setup((c) => c.get<string[]>(name))

                .returns(() => (sourceSettings as any)[name]);
        }

        // boolean settings
        for (const name of ['globalModuleInstallation']) {
            config
                .setup((c) => c.get<boolean>(name))

                .returns(() => (sourceSettings as any)[name]);
        }

        // Language server type settings
        config.setup((c) => c.get<LanguageServerType>('languageServer')).returns(() => sourceSettings.languageServer);

        // "any" settings

        config.setup((c) => c.get<any[]>('devOptions')).returns(() => sourceSettings.devOptions);

        // complex settings
        config.setup((c) => c.get<IInterpreterSettings>('interpreter')).returns(() => sourceSettings.interpreter);
        config.setup((c) => c.get<IAutoCompleteSettings>('autoComplete')).returns(() => sourceSettings.autoComplete);
        config.setup((c) => c.get<ITestingSettings>('testing')).returns(() => sourceSettings.testing);
        config.setup((c) => c.get<ITerminalSettings>('terminal')).returns(() => sourceSettings.terminal);
        config.setup((c) => c.get<IExperiments>('experiments')).returns(() => sourceSettings.experiments);
    }

    function testIfValueIsUpdated(settingName: string, value: any) {
        test(`${settingName} updated`, async () => {
            expected.pythonPath = 'python3';
            (expected as any)[settingName] = value;
            initializeConfig(expected);

            settings.update(config.object);

            expect((settings as any)[settingName]).to.be.equal((expected as any)[settingName]);
            config.verifyAll();
        });
    }

    suite('String settings', async () => {
        [
            'venvPath',
            'activeStateToolPath',
            'condaPath',
            'pipenvPath',
            'envFile',
            'poetryPath',
            'pixiToolPath',
            'defaultInterpreterPath',
        ].forEach(async (settingName) => {
            testIfValueIsUpdated(settingName, 'stringValue');
        });
    });

    suite('Boolean settings', async () => {
        ['globalModuleInstallation'].forEach(async (settingName) => {
            testIfValueIsUpdated(settingName, true);
        });
    });

    test('Interpreter settings object', () => {
        initializeConfig(expected);
        config
            .setup((c) => c.get<string>('condaPath'))
            .returns(() => expected.condaPath)
            .verifiable(TypeMoq.Times.once());

        settings.update(config.object);

        expect(settings.interpreter).to.deep.equal({
            infoVisibility: 'onPythonRelated',
        });
        config.verifyAll();
    });

    test('condaPath updated', () => {
        expected.pythonPath = 'python3';
        expected.condaPath = 'spam';
        initializeConfig(expected);
        config
            .setup((c) => c.get<string>('condaPath'))
            .returns(() => expected.condaPath)
            .verifiable(TypeMoq.Times.once());

        settings.update(config.object);

        expect(settings.condaPath).to.be.equal(expected.condaPath);
        config.verifyAll();
    });

    test('condaPath (relative to home) updated', async () => {
        expected.pythonPath = 'python3';
        expected.condaPath = path.join('~', 'anaconda3', 'bin', 'conda');
        initializeConfig(expected);
        config
            .setup((c) => c.get<string>('condaPath'))
            .returns(() => expected.condaPath)
            .verifiable(TypeMoq.Times.once());

        settings.update(config.object);

        expect(settings.condaPath).to.be.equal(untildify(expected.condaPath));
        config.verifyAll();
    });

    function testLanguageServer(
        languageServer: LanguageServerType,
        expectedValue: LanguageServerType,
        isDefault: boolean,
    ) {
        test(languageServer, () => {
            expected.pythonPath = 'python3';
            expected.languageServer = languageServer;
            initializeConfig(expected);
            config
                .setup((c) => c.get<LanguageServerType>('languageServer'))
                .returns(() => expected.languageServer)
                .verifiable(TypeMoq.Times.once());

            settings.update(config.object);

            expect(settings.languageServer).to.be.equal(expectedValue);
            expect(settings.languageServerIsDefault).to.be.equal(isDefault);
            config.verifyAll();
        });
    }

    suite('languageServer settings', async () => {
        const values = [
            { ls: LanguageServerType.Jedi, expected: LanguageServerType.Jedi, default: false },
            { ls: LanguageServerType.JediLSP, expected: LanguageServerType.Jedi, default: false },
            { ls: LanguageServerType.Microsoft, expected: LanguageServerType.Jedi, default: true },
            { ls: LanguageServerType.Node, expected: LanguageServerType.Node, default: false },
            { ls: LanguageServerType.None, expected: LanguageServerType.None, default: false },
        ];

        values.forEach((v) => {
            testLanguageServer(v.ls, v.expected, v.default);
        });

        testLanguageServer('invalid' as LanguageServerType, LanguageServerType.Jedi, true);
    });

    function testPyreflySettings(pyreflyInstalled: boolean, pyreflyDisabled: boolean, languageServerDisabled: boolean) {
        test(`pyrefly ${pyreflyInstalled ? 'installed' : 'not installed'} and ${
            pyreflyDisabled ? 'disabled' : 'enabled'
        }`, () => {
            if (pyreflyInstalled) {
                extensions.extensionIdsToFind = ['meta.pyrefly'];
            } else {
                extensions.extensionIdsToFind = [];
            }
            config.setup((c) => c.get<boolean>('pyrefly.disableLanguageServices')).returns(() => pyreflyDisabled);

            config
                .setup((c) => c.get<string>('languageServer'))
                .returns(() => undefined)
                .verifiable(TypeMoq.Times.once());

            settings.update(config.object);

            if (languageServerDisabled) {
                expect(settings.languageServer).to.equal(LanguageServerType.None);
            } else {
                expect(settings.languageServer).not.to.equal(LanguageServerType.None);
            }
            expect(settings.languageServerIsDefault).to.equal(true);
            config.verifyAll();
        });
    }

    suite('pyrefly languageServer settings', async () => {
        const values = [
            { pyreflyInstalled: true, pyreflyDisabled: false, languageServerDisabled: true },
            { pyreflyInstalled: true, pyreflyDisabled: true, languageServerDisabled: false },
            { pyreflyInstalled: false, pyreflyDisabled: true, languageServerDisabled: false },
            { pyreflyInstalled: false, pyreflyDisabled: false, languageServerDisabled: false },
        ];

        values.forEach((v) => {
            testPyreflySettings(v.pyreflyInstalled, v.pyreflyDisabled, v.languageServerDisabled);
        });
    });

    function testExperiments(enabled: boolean) {
        expected.pythonPath = 'python3';

        expected.experiments = {
            enabled,
            optInto: [],
            optOutFrom: [],
        };
        initializeConfig(expected);
        config
            .setup((c) => c.get<IExperiments>('experiments'))
            .returns(() => expected.experiments)
            .verifiable(TypeMoq.Times.once());

        settings.update(config.object);

        for (const key of Object.keys(expected.experiments)) {
            expect((settings.experiments as any)[key]).to.be.deep.equal((expected.experiments as any)[key]);
        }
        config.verifyAll();
    }
    test('Experiments (not enabled)', () => testExperiments(false));

    test('Experiments (enabled)', () => testExperiments(true));
});
