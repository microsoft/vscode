/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITerminalConfiguration, ITerminalBackend } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestExtensionService } from 'vs/workbench/test/common/workbenchTestServices';
import { TerminalProfileService } from 'vs/workbench/contrib/terminal/browser/terminalProfileService';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';
import { IExtensionTerminalProfile, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { isLinux, isWindows, OperatingSystem } from 'vs/base/common/platform';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Codicon } from 'vs/base/common/codicons';
import { deepStrictEqual } from 'assert';
import { Emitter } from 'vs/base/common/event';

class TestTerminalProfileService extends TerminalProfileService {
	hasRefreshedProfiles: Promise<void> | undefined;
	override refreshAvailableProfiles(): void {
		this.hasRefreshedProfiles = this._refreshAvailableProfilesNow();
	}
	refreshAndAwaitAvailableProfiles(): Promise<void> {
		this.refreshAvailableProfiles();
		if (!this.hasRefreshedProfiles) {
			throw new Error('has not refreshed profiles yet');
		}
		return this.hasRefreshedProfiles;
	}
}

class TestTerminalExtensionService extends TestExtensionService {
	readonly _onDidChangeExtensions = new Emitter<void>();
}

class TestTerminalContributionService implements ITerminalContributionService {
	_serviceBrand: undefined;
	terminalProfiles: readonly IExtensionTerminalProfile[] = [];
	setProfiles(profiles: IExtensionTerminalProfile[]): void {
		this.terminalProfiles = profiles;
	}
}

class TestTerminalInstanceService implements Partial<ITerminalInstanceService> {
	private _profiles: Map<string, ITerminalProfile[]> = new Map();
	private _hasReturnedNone = true;
	getBackend(remoteAuthority: string | undefined): ITerminalBackend {
		return {
			getProfiles: async () => {
				if (this._hasReturnedNone) {
					return this._profiles.get(remoteAuthority ?? '') || [];
				} else {
					this._hasReturnedNone = true;
					return [];
				}
			}
		} as Partial<ITerminalBackend> as any;
	}
	setProfiles(remoteAuthority: string | undefined, profiles: ITerminalProfile[]) {
		this._profiles.set(remoteAuthority ?? '', profiles);
	}
	setReturnNone() {
		this._hasReturnedNone = false;
	}
}

class TestRemoteAgentService implements Partial<IRemoteAgentService> {
	private _os: OperatingSystem | undefined;
	setEnvironment(os: OperatingSystem) {
		this._os = os;
	}
	async getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		return { os: this._os } as IRemoteAgentEnvironment;
	}
}

const defaultTerminalConfig: Partial<ITerminalConfiguration> = { profiles: { windows: {}, linux: {}, osx: {} } };
let powershellProfile = {
	profileName: 'PowerShell',
	path: 'C:\\Powershell.exe',
	isDefault: true,
	icon: ThemeIcon.asThemeIcon(Codicon.terminalPowershell)
};
let jsdebugProfile = {
	extensionIdentifier: 'ms-vscode.js-debug-nightly',
	icon: 'debug',
	id: 'extension.js-debug.debugTerminal',
	title: 'JavaScript Debug Terminal'
};


suite('TerminalProfileService', () => {
	let configurationService: TestConfigurationService;
	let terminalInstanceService: TestTerminalInstanceService;
	let terminalProfileService: TestTerminalProfileService;
	let remoteAgentService: TestRemoteAgentService;
	let extensionService: TestTerminalExtensionService;
	let environmentService: IWorkbenchEnvironmentService;
	let instantiationService: TestInstantiationService;

	setup(async () => {
		configurationService = new TestConfigurationService({ terminal: { integrated: defaultTerminalConfig } });
		remoteAgentService = new TestRemoteAgentService();
		terminalInstanceService = new TestTerminalInstanceService();
		extensionService = new TestTerminalExtensionService();
		environmentService = { configuration: {}, remoteAuthority: undefined } as IWorkbenchEnvironmentService;
		instantiationService = new TestInstantiationService();

		let terminalContributionService = new TestTerminalContributionService();
		let contextKeyService = new MockContextKeyService();

		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IExtensionService, extensionService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		instantiationService.stub(ITerminalContributionService, terminalContributionService);
		instantiationService.stub(ITerminalInstanceService, terminalInstanceService);
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);

		terminalProfileService = instantiationService.createInstance(TestTerminalProfileService);

		//reset as these properties are changed in each test
		powershellProfile = {
			profileName: 'PowerShell',
			path: 'C:\\Powershell.exe',
			isDefault: true,
			icon: ThemeIcon.asThemeIcon(Codicon.terminalPowershell)
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
			remoteAgentService.setEnvironment(OperatingSystem.Windows);
		} else if (isLinux) {
			remoteAgentService.setEnvironment(OperatingSystem.Linux);
		} else {
			remoteAgentService.setEnvironment(OperatingSystem.Macintosh);
		}
		configurationService.setUserConfiguration('terminal', { integrated: defaultTerminalConfig });
	});
	suite('Contributed Profiles', () => {
		test('should filter out contributed profiles set to null (Linux)', async () => {
			remoteAgentService.setEnvironment(OperatingSystem.Linux);
			await configurationService.setUserConfiguration('terminal', {
				integrated: {
					profiles: {
						linux: {
							'JavaScript Debug Terminal': null
						}
					}
				}
			});
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
			await terminalProfileService.refreshAndAwaitAvailableProfiles();
			deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
			deepStrictEqual(terminalProfileService.contributedProfiles, []);
		});
		test('should filter out contributed profiles set to null (Windows)', async () => {
			remoteAgentService.setEnvironment(OperatingSystem.Windows);
			await configurationService.setUserConfiguration('terminal', {
				integrated: {
					profiles: {
						windows: {
							'JavaScript Debug Terminal': null
						}
					}
				}
			});
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
			await terminalProfileService.refreshAndAwaitAvailableProfiles();
			deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
			deepStrictEqual(terminalProfileService.contributedProfiles, []);
		});
		test('should filter out contributed profiles set to null (macOS)', async () => {
			remoteAgentService.setEnvironment(OperatingSystem.Macintosh);
			await configurationService.setUserConfiguration('terminal', {
				integrated: {
					profiles: {
						osx: {
							'JavaScript Debug Terminal': null
						}
					}
				}
			});
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
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
		environmentService = { configuration: {}, remoteAuthority: 'fakeremote' } as IWorkbenchEnvironmentService;
		instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
		terminalProfileService = instantiationService.createInstance(TestTerminalProfileService);
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(terminalProfileService.availableProfiles, []);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
		terminalInstanceService.setProfiles('fakeremote', [powershellProfile]);
		await terminalProfileService.refreshAndAwaitAvailableProfiles();
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
	});

	test('should fire onDidChangeAvailableProfiles only when available profiles have changed via user config', async () => {
		powershellProfile.icon = ThemeIcon.asThemeIcon(Codicon.lightBulb);
		let calls: ITerminalProfile[][] = [];
		terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e));
		await configurationService.setUserConfiguration('terminal', {
			integrated: {
				profiles: {
					windows: powershellProfile,
					linux: powershellProfile,
					osx: powershellProfile
				}
			}
		});
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
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
		const calls: ITerminalProfile[][] = [];
		terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e));
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(calls, [
			[powershellProfile]
		]);
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
	});

	test('should call refreshAvailableProfiles _onDidChangeExtensions', async () => {
		extensionService._onDidChangeExtensions.fire();
		const calls: ITerminalProfile[][] = [];
		terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e));
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(calls, [
			[powershellProfile]
		]);
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
	});
	test('should call refreshAvailableProfiles again if no profiles are returned from local/remoteTerminalService', async () => {
		terminalInstanceService.setReturnNone();
		const calls: ITerminalProfile[][] = [];
		terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e));
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(calls, [
			[powershellProfile]
		]);
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
	});
});
