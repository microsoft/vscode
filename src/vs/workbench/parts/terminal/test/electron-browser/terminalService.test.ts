/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import { TerminalService } from 'vs/workbench/parts/terminal/electron-browser/terminalService';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';

suite('Workbench - TerminalService', () => {
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let service: TerminalService;

	setup(() => {
		configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('terminal', {
			integrated: {
				setLocaleVariables: false
			}
		});
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IContextKeyService, { createKey: () => null });
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IInstantiationService, instantiationService);
		instantiationService.stub(IPanelService, {});
		instantiationService.stub(IPartService, {});
		instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => null });
		service = instantiationService.createInstance(TerminalService);
	});

	suite('createInstance', () => {
		test('should return the new instance', () => {
			assert.ok(service.createInstance() instanceof TerminalInstance);
		});

		test('should register the new instance on the terminal service', () => {
			const instance = service.createInstance();
			assert.deepEqual(service.terminalInstances, [instance]);
		});

		test('should only automatically set the first instance as the active instance', () => {
			const first = service.createInstance();
			assert.equal(service.getActiveInstance(), first);

			service.createInstance();
			assert.equal(service.getActiveInstance(), first);
		});
	});
});