/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILocalTerminalService, ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestExtensionService } from 'vs/workbench/test/common/workbenchTestServices';
import { TerminalProfileService } from 'vs/workbench/contrib/terminal/browser/terminalProfileService';
import { TestRemoteAgentService } from 'vs/workbench/services/remote/test/common/testServices';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';
import { IExtensionTerminalProfile, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { strictEqual } from 'assert';
import { IRemoteTerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { isWindows } from 'vs/base/common/platform';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';


class TestTerminalProfileService extends TerminalProfileService {
	override refreshAvailableProfiles(): void {
		this._refreshAvailableProfilesNow();
	}
}


class TestTerminalContributionService implements ITerminalContributionService {
	_serviceBrand: undefined;
	terminalProfiles: readonly IExtensionTerminalProfile[] = [];
	setProfiles(profiles: IExtensionTerminalProfile[]): void {
		this.terminalProfiles = profiles;
	}
}

class TestRemoteTerminalService implements Partial<IRemoteTerminalService> {
	async getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return [];
	}
}

class TestLocalTerminalService implements Partial<ILocalTerminalService> {
	async getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]> {
		return [];
	}
}

const defaultTerminalConfig: Partial<ITerminalConfiguration> = {
	fontFamily: 'monospace',
	fontWeight: 'normal',
	fontWeightBold: 'normal',
	gpuAcceleration: 'off',
	scrollback: 1000,
	fastScrollSensitivity: 2,
	mouseWheelScrollSensitivity: 1
};

suite('TerminalProfileService', () => {
	let configurationService: TestConfigurationService;
	let terminalProfileService: TestTerminalProfileService;

	setup(async () => {
		configurationService = new TestConfigurationService({
			terminal: {
				integrated: defaultTerminalConfig
			}
		});

		let instantiationService = new TestInstantiationService();
		let terminalContributionService = new TestTerminalContributionService();
		let remoteAgentService = new TestRemoteAgentService();
		let extensionService = new TestExtensionService();
		let localTerminalService = new TestLocalTerminalService();
		let remoteTerminalService = new TestRemoteTerminalService();
		let contextKeyService = new MockContextKeyService();

		let configHelper = instantiationService.createInstance(TerminalConfigHelper, configurationService);
		// terminalProfileService = instantiationService.createInstance(TestTerminalProfileService);
		terminalProfileService = new TestTerminalProfileService(contextKeyService, configurationService, terminalContributionService, extensionService, remoteAgentService, configHelper, remoteTerminalService as IRemoteTerminalService, localTerminalService as ILocalTerminalService);
	});

	test('should provide updated profiles when config changes', () => {
		test('should filter out contributed profiles set to null', async () => {
			if (isWindows) {
				await configurationService.setUserConfiguration('terminal', {
					integrated: {
						...defaultTerminalConfig, profiles: {
							windows: {
								'JavaScript Debug Terminal': null
							}
						}
					}
				});
				configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
				terminalProfileService.refreshAvailableProfiles();
				strictEqual(terminalProfileService.availableProfiles, []);
			}
		});
	});
});
