/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILocalTerminalService, ITerminalConfigHelper, ITerminalConfiguration, TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewDescriptor, IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Emitter } from 'vs/base/common/event';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TestContextService, TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { TerminalProfileService } from 'vs/workbench/contrib/terminal/browser/terminalProfileService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TestRemoteAgentService } from 'vs/workbench/services/remote/test/common/testServices';
import { TestEnvironmentService } from 'vs/workbench/test/browser/workbenchTestServices';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';
import { IExtensionTerminalProfile, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { strictEqual } from 'assert';
import { IRemoteTerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';


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

class TestViewDescriptorService implements Partial<IViewDescriptorService> {
	private _location = ViewContainerLocation.Panel;
	private _onDidChangeLocation = new Emitter<{ views: IViewDescriptor[], from: ViewContainerLocation, to: ViewContainerLocation }>();
	onDidChangeLocation = this._onDidChangeLocation.event;
	getViewLocationById(id: string) {
		return this._location;
	}
	moveTerminalToLocation(to: ViewContainerLocation) {
		const oldLocation = this._location;
		this._location = to;
		this._onDidChangeLocation.fire({
			views: [
				{ id: TERMINAL_VIEW_ID } as any
			],
			from: oldLocation,
			to
		});
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
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let themeService: TestThemeService;
	let viewDescriptorService: TestViewDescriptorService;
	let contextKeyService: TestContextService;
	let configHelper: ITerminalConfigHelper;
	let terminalProfileService: TestTerminalProfileService;
	let terminalContributionService: TestTerminalContributionService;

	setup(() => {
		configurationService = new TestConfigurationService({
			editor: {
				fastScrollSensitivity: 2,
				mouseWheelScrollSensitivity: 1
			} as Partial<IEditorOptions>,
			terminal: {
				integrated: defaultTerminalConfig
			}
		});
		instantiationService = new TestInstantiationService();
		themeService = new TestThemeService();
		viewDescriptorService = new TestViewDescriptorService();
		terminalContributionService = new TestTerminalContributionService();

		let remoteAgentService = new TestRemoteAgentService();
		let extensionService = new TestExtensionService();
		let localTerminalService = new TestLocalTerminalService();
		let remoteTerminalService = new TestRemoteTerminalService();

		configHelper = instantiationService.createInstance(TerminalConfigHelper);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IThemeService, themeService);
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IEnvironmentService, TestEnvironmentService);
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(ILogService, new NullLogService());

		terminalProfileService = instantiationService.createInstance(TestTerminalProfileService, terminalContributionService, configHelper, extensionService, remoteAgentService, remoteTerminalService, localTerminalService);
	});

	test('should ', () => {
		test('should ', async () => {
			await configurationService.setUserConfiguration('terminal', { integrated: { ...defaultTerminalConfig, gpuAcceleration: 'auto' } });
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as any);
			strictEqual(terminalProfileService.availableProfiles, []);
		});
	});
});
