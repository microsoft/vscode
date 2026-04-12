/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OS } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ConfigurationManager } from '../../browser/debugConfigurationManager.js';
import { DebugConfigurationProviderTriggerKind } from '../../common/debug.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TestRemoteAgentService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
suite('debugConfigurationManager', () => {
    const configurationProviderType = 'custom-type';
    let _debugConfigurationManager;
    let disposables;
    let instantiationService;
    let contextService;
    const adapterManager = {
        getDebugAdapterDescriptor(session, config) {
            return Promise.resolve(undefined);
        },
        activateDebuggers(activationEvent, debugType) {
            return Promise.resolve();
        },
        get onDidDebuggersExtPointRead() {
            return Event.None;
        }
    };
    const preferencesService = {
        userSettingsResource: URI.file('/tmp/settings.json')
    };
    const configurationService = new TestConfigurationService();
    let remoteAgentService;
    function createConfigurationManager() {
        instantiationService.stub(IWorkspaceContextService, contextService);
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IRemoteAgentService, remoteAgentService);
        instantiationService.stub(IPreferencesService, preferencesService);
        return disposables.add(instantiationService.createInstance(ConfigurationManager, adapterManager));
    }
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = workbenchInstantiationService(undefined, disposables);
        contextService = new TestContextService();
        remoteAgentService = new TestRemoteAgentService();
        _debugConfigurationManager = createConfigurationManager();
    });
    teardown(() => disposables.dispose());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('resolves configuration based on type', async () => {
        disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
            type: configurationProviderType,
            resolveDebugConfiguration: (folderUri, config, token) => {
                assert.strictEqual(config.type, configurationProviderType);
                return Promise.resolve({
                    ...config,
                    configurationResolved: true
                });
            },
            triggerKind: DebugConfigurationProviderTriggerKind.Initial
        }));
        const initialConfig = {
            type: configurationProviderType,
            request: 'launch',
            name: 'configName',
        };
        const resultConfig = await _debugConfigurationManager.resolveConfigurationByProviders(undefined, configurationProviderType, initialConfig, CancellationToken.None);
        // eslint-disable-next-line local/code-no-any-casts
        assert.strictEqual(resultConfig.configurationResolved, true, 'Configuration should be updated by test provider');
    });
    test('resolves configuration from second provider if type changes', async () => {
        const secondProviderType = 'second-provider';
        disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
            type: configurationProviderType,
            resolveDebugConfiguration: (folderUri, config, token) => {
                assert.strictEqual(config.type, configurationProviderType);
                return Promise.resolve({
                    ...config,
                    type: secondProviderType
                });
            },
            triggerKind: DebugConfigurationProviderTriggerKind.Initial
        }));
        disposables.add(_debugConfigurationManager.registerDebugConfigurationProvider({
            type: secondProviderType,
            resolveDebugConfiguration: (folderUri, config, token) => {
                assert.strictEqual(config.type, secondProviderType);
                return Promise.resolve({
                    ...config,
                    configurationResolved: true
                });
            },
            triggerKind: DebugConfigurationProviderTriggerKind.Initial
        }));
        const initialConfig = {
            type: configurationProviderType,
            request: 'launch',
            name: 'configName',
        };
        const resultConfig = await _debugConfigurationManager.resolveConfigurationByProviders(undefined, configurationProviderType, initialConfig, CancellationToken.None);
        assert.strictEqual(resultConfig.type, secondProviderType);
        // eslint-disable-next-line local/code-no-any-casts
        assert.strictEqual(resultConfig.configurationResolved, true, 'Configuration should be updated by test provider');
    });
    test('uses remote target OS when computing visible configurations', async () => {
        class LinuxRemoteAgentService extends TestRemoteAgentService {
            async getEnvironment() {
                return {
                    pid: 1,
                    connectionToken: 'token',
                    appRoot: URI.file('/remote/app'),
                    execPath: '/remote/app/node',
                    tmpDir: URI.file('/remote/tmp'),
                    settingsPath: URI.file('/remote/settings.json'),
                    mcpResource: URI.file('/remote/mcp.json'),
                    logsPath: URI.file('/remote/logs'),
                    extensionHostLogsPath: URI.file('/remote/ext-logs'),
                    globalStorageHome: URI.file('/remote/global-storage'),
                    workspaceStorageHome: URI.file('/remote/workspace-storage'),
                    localHistoryHome: URI.file('/remote/local-history'),
                    userHome: URI.file('/remote/home'),
                    os: 3 /* OperatingSystem.Linux */,
                    arch: 'x64',
                    marks: [],
                    useHostProxy: false,
                    profiles: {
                        all: [],
                        home: URI.file('/remote/profiles')
                    },
                    isUnsupportedGlibc: false
                };
            }
        }
        remoteAgentService = new LinuxRemoteAgentService();
        contextService = new TestContextService();
        configurationService.setUserConfiguration('launch', {
            version: '0.2.0',
            configurations: [
                { type: 'node', request: 'launch', name: 'visible', presentation: { hidden: false } },
                { type: 'node', request: 'launch', name: 'linux-hidden', linux: { presentation: { hidden: true } } }
            ]
        });
        disposables.delete(_debugConfigurationManager);
        _debugConfigurationManager = createConfigurationManager();
        if (OS !== 3 /* OperatingSystem.Linux */) {
            await Event.toPromise(_debugConfigurationManager.onDidSelectConfiguration);
        }
        assert.deepStrictEqual(_debugConfigurationManager.getAllConfigurations().map(({ name }) => name), ['visible']);
    });
    teardown(() => disposables.clear());
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdDb25maWd1cmF0aW9uTWFuYWdlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvdGVzdC9icm93c2VyL2RlYnVnQ29uZmlndXJhdGlvbk1hbmFnZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQW1CLEVBQUUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUV6SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNsRixPQUFPLEVBQUUscUNBQXFDLEVBQW9FLE1BQU0sdUJBQXVCLENBQUM7QUFDaEosT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDL0YsT0FBTyxFQUE2QixzQkFBc0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxD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