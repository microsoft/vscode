/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILocalTerminalService, IOffProcessTerminalService, ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestExtensionService } from 'vs/workbench/test/common/workbenchTestServices';
import { TerminalProfileService } from 'vs/workbench/contrib/terminal/browser/terminalProfileService';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';
import { IExtensionTerminalProfile, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { IRemoteTerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { isLinux, isWindows, OperatingSystem } from 'vs/base/common/platform';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TestEnvironmentService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Codicon } from 'vs/base/common/codicons';
import { deepStrictEqual } from 'assert';
class TestTerminalProfileService extends TerminalProfileService {
	hasRefreshedProfiles: Promise<void> | undefined;

	override refreshAvailableProfiles(): void {
		this.hasRefreshedProfiles = this._refreshAvailableProfilesNow();
	}
}
class TestTerminalContributionService implements ITerminalContributionService {
	_serviceBrand: undefined;
	terminalProfiles: readonly IExtensionTerminalProfile[] = [];
	setProfiles(profiles: IExtensionTerminalProfile[]): void {
		this.terminalProfiles = profiles;
	}
}

class TestOffProcessTerminalService implements Partial<IOffProcessTerminalService> {
	private _profiles: ITerminalProfile[] = [];
	async getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return this._profiles;
	}
	setProfiles(profiles: ITerminalProfile[]) {
		this._profiles = profiles;
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

suite('TerminalProfileService', () => {
	let configurationService: TestConfigurationService;
	let terminalProfileService: TestTerminalProfileService;
	let remoteAgentService: TestRemoteAgentService;

	setup(async () => {
		configurationService = new TestConfigurationService({ terminal: { integrated: defaultTerminalConfig } });
		remoteAgentService = new TestRemoteAgentService();

		let instantiationService = new TestInstantiationService();
		let terminalContributionService = new TestTerminalContributionService();
		let extensionService = new TestExtensionService();
		let localTerminalService = new TestOffProcessTerminalService();
		let remoteTerminalService = new TestOffProcessTerminalService();
		let contextKeyService = new MockContextKeyService();

		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IExtensionService, extensionService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		instantiationService.stub(ITerminalContributionService, terminalContributionService);
		instantiationService.stub(ILocalTerminalService, localTerminalService);
		instantiationService.stub(IRemoteTerminalService, remoteTerminalService);
		instantiationService.stub(IWorkbenchEnvironmentService, TestEnvironmentService);
		terminalProfileService = instantiationService.createInstance(TestTerminalProfileService);
		localTerminalService.setProfiles([{
			profileName: 'PowerShell',
			path: 'C:\\Powershell.exe',
			isDefault: true,
			icon: ThemeIcon.asThemeIcon(Codicon.terminalPowershell)
		}]);
		remoteTerminalService.setProfiles([]);
		terminalContributionService.setProfiles([{
			extensionIdentifier: 'ms-vscode.js-debug-nightly',
			icon: 'debug',
			id: 'extension.js-debug.debugTerminal',
			title: 'JavaScript Debug Terminal'
		}]);
		if (isWindows) {
			remoteAgentService.setEnvironment(OperatingSystem.Windows);
		} else if (isLinux) {
			remoteAgentService.setEnvironment(OperatingSystem.Linux);
		} else {
			remoteAgentService.setEnvironment(OperatingSystem.Macintosh);
		}
	});

	test('should filter out contributed profiles set to null', async () => {
		await configurationService.setUserConfiguration('terminal', {
			integrated: {
				profiles: {
					windows: {
						'JavaScript Debug Terminal': null
					},
					linux: {
						'JavaScript Debug Terminal': null
					},
					osx: {
						'JavaScript Debug Terminal': null
					}
				}
			}
		});
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
		terminalProfileService.refreshAvailableProfiles();
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(terminalProfileService.availableProfiles, [{
			profileName: 'PowerShell',
			path: 'C:\\Powershell.exe',
			isDefault: true,
			icon: ThemeIcon.asThemeIcon(Codicon.terminalPowershell)
		}]);
		deepStrictEqual(terminalProfileService.contributedProfiles, []);
	});
	test('should include contributed profiles', async () => {
		configurationService.setUserConfiguration('terminal', { integrated: defaultTerminalConfig });
		terminalProfileService.refreshAvailableProfiles();
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(terminalProfileService.availableProfiles, [{
			profileName: 'PowerShell',
			path: 'C:\\Powershell.exe',
			isDefault: true,
			icon: ThemeIcon.asThemeIcon(Codicon.terminalPowershell)
		}]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [{
			extensionIdentifier: 'ms-vscode.js-debug-nightly',
			icon: 'debug',
			id: 'extension.js-debug.debugTerminal',
			title: 'JavaScript Debug Terminal'
		}]);
	});
});
