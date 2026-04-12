/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual } from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { isLinux, isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ITerminalInstanceService } from '../../browser/terminal.js';
import { TerminalProfileQuickpick } from '../../browser/terminalProfileQuickpick.js';
import { TerminalProfileService } from '../../browser/terminalProfileService.js';
import { ITerminalProfileService } from '../../common/terminal.js';
import { ITerminalContributionService } from '../../common/terminalExtensionPoints.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestExtensionService } from '../../../../test/common/workbenchTestServices.js';
class TestTerminalProfileService extends TerminalProfileService {
    refreshAvailableProfiles() {
        this.hasRefreshedProfiles = this._refreshAvailableProfilesNow();
    }
    refreshAndAwaitAvailableProfiles() {
        this.refreshAvailableProfiles();
        if (!this.hasRefreshedProfiles) {
            throw new Error('has not refreshed profiles yet');
        }
        return this.hasRefreshedProfiles;
    }
}
class MockTerminalProfileService {
    constructor() {
        this.availableProfiles = [];
        this.contributedProfiles = [];
    }
    async getPlatformKey() {
        return 'linux';
    }
    getDefaultProfileName() {
        return this._defaultProfileName;
    }
    setProfiles(profiles, contributed) {
        this.availableProfiles = profiles;
        this.contributedProfiles = contributed;
    }
    setDefaultProfileName(name) {
        this._defaultProfileName = name;
    }
}
class MockQuickInputService {
    constructor() {
        this._pick = powershellPick;
    }
    async pick(picks, options, token) {
        Promise.resolve(picks);
        return this._pick;
    }
    setPick(pick) {
        this._pick = pick;
    }
}
class TestTerminalProfileQuickpick extends TerminalProfileQuickpick {
}
class TestTerminalExtensionService extends TestExtensionService {
    constructor() {
        super(...arguments);
        this._onDidChangeExtensions = new Emitter();
    }
}
class TestTerminalContributionService {
    constructor() {
        this.terminalProfiles = [];
        this.terminalCompletionProviders = [];
        this._onDidChangeTerminalCompletionProviders = new Emitter();
        this.onDidChangeTerminalCompletionProviders = this._onDidChangeTerminalCompletionProviders.event;
    }
    setProfiles(profiles) {
        this.terminalProfiles = profiles;
    }
}
class TestTerminalInstanceService {
    constructor() {
        this._profiles = new Map();
        this._hasReturnedNone = true;
    }
    async getBackend(remoteAuthority) {
        return {
            getProfiles: async () => {
                if (this._hasReturnedNone) {
                    return this._profiles.get(remoteAuthority ?? '') || [];
                }
                else {
                    this._hasReturnedNone = true;
                    return [];
                }
            }
        };
    }
    setProfiles(remoteAuthority, profiles) {
        this._profiles.set(remoteAuthority ?? '', profiles);
    }
    setReturnNone() {
        this._hasReturnedNone = false;
    }
}
class TestRemoteAgentService {
    setEnvironment(os) {
        this._os = os;
    }
    async getEnvironment() {
        return { os: this._os };
    }
}
const defaultTerminalConfig = { profiles: { windows: {}, linux: {}, osx: {} } };
let powershellProfile = {
    profileName: 'PowerShell',
    path: 'C:\\Powershell.exe',
    isDefault: true,
    icon: Codicon.terminalPowershell
};
let jsdebugProfile = {
    extensionIdentifier: 'ms-vscode.js-debug-nightly',
    icon: 'debug',
    id: 'extension.js-debug.debugTerminal',
    title: 'JavaScript Debug Terminal'
};
const powershellPick = { label: 'Powershell', profile: powershellProfile, profileName: powershellProfile.profileName };
const jsdebugPick = { label: 'Javascript Debug Terminal', profile: jsdebugProfile, profileName: jsdebugProfile.title };
suite('TerminalProfileService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let configurationService;
    let terminalInstanceService;
    let terminalProfileService;
    let remoteAgentService;
    let extensionService;
    let instantiationService;
    setup(async () => {
        configurationService = new TestConfigurationService({
            files: {},
            terminal: {
                integrated: defaultTerminalConfig
            }
        });
        instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService
        }, store);
        remoteAgentService = new TestRemoteAgentService();
        terminalInstanceService = new TestTerminalInstanceService();
        extensionService = new TestTerminalExtensionService();
        const themeService = new TestThemeService();
        const terminalContributionService = new TestTerminalContributionService();
        instantiationService.stub(IExtensionService, extensionService);
        instantiationService.stub(IConfigurationService, configurationService);
        instantiationService.stub(IRemoteAgentService, remoteAgentService);
        instantiationService.stub(ITerminalContributionService, terminalContributionService);
        instantiationService.stub(ITerminalInstanceService, terminalInstanceService);
        instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: undefined });
        instantiationService.stub(IThemeService, themeService);
        terminalProfileService = store.add(instantiationService.createInstance(TestTerminalProfileService));
        //reset as these properties are changed in each test
        powershellProfile = {
            profileName: 'PowerShell',
            path: 'C:\\Powershell.exe',
            isDefault: true,
            icon: Codicon.terminalPowershell
        };
        jsdebugProfile = {
            extensionIdentifier: 'ms-vscode.js-debug-nightly',
            icon: 'debug',
            id: 'extension.js-debug.debugTerminal',
            title: 'JavaScript Debug Terminal'
        };
        terminalInstanceService.setProfiles(undefined, [powershellProfile]);
        terminalInstanceService.setProfiles('fakeremote', []);
        terminalContributionService.setProfiles([jsdebugProfile]);
        if (isWindows) {
            remoteAgentService.setEnvironment(1 /* OperatingSystem.Windows */);
        }
        else if (isLinux) {
            remoteAgentService.setEnvironment(3 /* OperatingSystem.Linux */);
        }
        else {
            remoteAgentService.setEnvironment(2 /* OperatingSystem.Macintosh */);
        }
        configurationService.setUserConfiguration('terminal', { integrated: defaultTerminalConfig });
    });
    suite('Contributed Profiles', () => {
        test('should filter out contributed profiles set to null (Linux)', async () => {
            remoteAgentService.setEnvironment(3 /* OperatingSystem.Linux */);
            await configurationService.setUserConfiguration('terminal', {
                integrated: {
                    profiles: {
                        linux: {
                            'JavaScript Debug Terminal': null
                        }
                    }
                }
            });
            configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: 2 /* ConfigurationTarget.USER */ });
            await terminalProfileService.refreshAndAwaitAvailableProfiles();
            deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
            deepStrictEqual(terminalProfileService.contributedProfiles, []);
        });
        test('should filter out contributed profiles set to null (Windows)', async () => {
            remoteAgentService.setEnvironment(1 /* OperatingSystem.Windows */);
            await configurationService.setUserConfiguration('terminal', {
                integrated: {
                    profiles: {
                        windows: {
                            'JavaScript Debug Terminal': null
                        }
                    }
                }
            });
            configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: 2 /* ConfigurationTarget.USER */ });
            await terminalProfileService.refreshAndAwaitAvailableProfiles();
            deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
            deepStrictEqual(terminalProfileService.contributedProfiles, []);
        });
        test('should filter out contributed profiles set to null (macOS)', async () => {
            remoteAgentService.setEnvironment(2 /* OperatingSystem.Macintosh */);
            await configurationService.setUserConfiguration('terminal', {
                integrated: {
                    profiles: {
                        osx: {
                            'JavaScript Debug Terminal': null
                        }
                    }
                }
            });
            configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: 2 /* ConfigurationTarget.USER */ });
            await terminalProfileService.refreshAndAwaitAvailableProfiles();
            deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
            deepStrictEqual(terminalProfileService.contributedProfiles, []);
        });
        test('should include contributed profiles', async () => {
            await terminalProfileService.refreshAndAwaitAvailableProfiles();
            deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
            deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
        });
    });
    test('should get profiles from remoteTerminalService when there is a remote authority', async () => {
        instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: 'fakeremote' });
        terminalProfileService = store.add(instantiationService.createInstance(TestTerminalProfileService));
        await terminalProfileService.hasRefreshedProfiles;
        deepStrictEqual(terminalProfileService.availableProfiles, []);
        deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
        terminalInstanceService.setProfiles('fakeremote', [powershellProfile]);
        await terminalProfileService.refreshAndAwaitAvailableProfiles();
        deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
        deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
    });
    test('should fire onDidChangeAvailableProfiles only when available profiles have changed via user config', async () => {
        powershellProfile.icon = Codicon.lightBulb;
        let calls = [];
        store.add(terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e)));
        await configurationService.setUserConfiguration('terminal', {
            integrated: {
                profiles: {
                    windows: powershellProfile,
                    linux: powershellProfile,
                    osx: powershellProfile
                }
            }
        });
        await terminalProfileService.hasRefreshedProfiles;
        deepStrictEqual(calls, [
            [powershellProfile]
        ]);
        deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
        deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
        calls = [];
        await terminalProfileService.refreshAndAwaitAvailableProfiles();
        deepStrictEqual(calls, []);
    });
    test('should fire onDidChangeAvailableProfiles when available or contributed profiles have changed via remote/localTerminalService', async () => {
        powershellProfile.isDefault = false;
        terminalInstanceService.setProfiles(undefined, [powershellProfile]);
        const calls = [];
        store.add(terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e)));
        await terminalProfileService.hasRefreshedProfiles;
        deepStrictEqual(calls, [
            [powershellProfile]
        ]);
        deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
        deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
    });
    test('should call refreshAvailableProfiles _onDidChangeExtensions', async () => {
        extensionService._onDidChangeExtensions.fire();
        const calls = [];
        store.add(terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e)));
        await terminalProfileService.hasRefreshedProfiles;
        deepStrictEqual(calls, [
            [powershellProfile]
        ]);
        deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
        deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
    });
    suite('Profiles Quickpick', () => {
        let quickInputService;
        let mockTerminalProfileService;
        let terminalProfileQuickpick;
        setup(async () => {
            quickInputService = new MockQuickInputService();
            mockTerminalProfileService = new MockTerminalProfileService();
            instantiationService.stub(IQuickInputService, quickInputService);
            instantiationService.stub(ITerminalProfileService, mockTerminalProfileService);
            terminalProfileQuickpick = instantiationService.createInstance(TestTerminalProfileQuickpick);
        });
        test('setDefault', async () => {
            powershellProfile.isDefault = false;
            mockTerminalProfileService.setProfiles([powershellProfile], [jsdebugProfile]);
            mockTerminalProfileService.setDefaultProfileName(jsdebugProfile.title);
            const result = await terminalProfileQuickpick.showAndGetResult('setDefault');
            deepStrictEqual(result, powershellProfile.profileName);
        });
        test('setDefault to contributed', async () => {
            mockTerminalProfileService.setDefaultProfileName(powershellProfile.profileName);
            quickInputService.setPick(jsdebugPick);
            const result = await terminalProfileQuickpick.showAndGetResult('setDefault');
            const expected = {
                config: {
                    extensionIdentifier: jsdebugProfile.extensionIdentifier,
                    id: jsdebugProfile.id,
                    options: { color: undefined, icon: 'debug' },
                    title: jsdebugProfile.title,
                },
                keyMods: undefined
            };
            deepStrictEqual(result, expected);
        });
        test('createInstance', async () => {
            mockTerminalProfileService.setDefaultProfileName(powershellProfile.profileName);
            const pick = { ...powershellPick, keyMods: { alt: true, ctrlCmd: false, shift: false } };
            quickInputService.setPick(pick);
            const result = await terminalProfileQuickpick.showAndGetResult('createInstance');
            deepStrictEqual(result, { config: powershellProfile, keyMods: { alt: true, ctrlCmd: false, shift: false } });
        });
        test('createInstance with contributed', async () => {
            const pick = { ...jsdebugPick, keyMods: { alt: true, ctrlCmd: false, shift: true } };
            quickInputService.setPick(pick);
            const result = await terminalProfileQuickpick.showAndGetResult('createInstance');
            const expected = {
                config: {
                    extensionIdentifier: jsdebugProfile.extensionIdentifier,
                    id: jsdebugProfile.id,
                    options: { color: undefined, icon: 'debug' },
                    title: jsdebugProfile.title,
                },
                keyMods: { alt: true, ctrlCmd: false, shift: true }
            };
            deepStrictEqual(result, expected);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxQcm9maWxlU2VydmljZS5pbnRlZ3JhdGlvblRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIvdGVybWluYWxQcm9maWxlU2VydmljZS5pbnRlZ3JhdGlvblRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUV6QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFtQixNQUFNLHdDQUF3QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBdUIscUJBQXFCLEVBQWtDLE1BQU0sK0RBQStELENBQUM7QUFDM0osT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFFekgsT0FBTyxFQUFnQixrQkFBa0IsRUFBd0IsTUFBTSx5REFBeUQsQ0FBQztBQUdqSSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDakcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckUsT0FBTyxFQUF5Qix3QkFBd0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2pGLE9BQU8sRUFBMEIsdUJBQXVCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMzRixPQUFP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