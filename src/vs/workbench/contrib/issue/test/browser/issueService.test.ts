/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { BrowserIssueService } from '../../browser/issueService.js';
import { TestExtensionService } from '../../../../services/extensions/test/common/extensionHostTestUtils.js';

suite('BrowserIssueService external browser support', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should use IOpenerService for external URLs', async () => {
		let openedUrl: string | undefined;
		let openedOptions: any;
		
		const mockOpenerService = new class extends mock<IOpenerService>() {
			override async open(resource: any, options?: any) {
				openedUrl = resource;
				openedOptions = options;
				return true;
			}
		};

		const configService = new TestConfigurationService({
			'issueReporter.experimental.webReporter': false
		});

		const extensionService = new TestExtensionService();
		
		const issueService = new BrowserIssueService(
			extensionService,
			{ reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new' } as any, // productService
			{ openReporter: async () => {} } as any, // issueFormService  
			{ getColorTheme: () => ({}) } as any, // themeService
			{ getCurrentExperiments: async () => [] } as any, // experimentService
			{ isWorkspaceTrusted: () => true } as any, // workspaceTrustManagementService
			{ isPure: async () => ({ isPure: true }) } as any, // integrityService
			{ getInstalled: async () => [] } as any, // extensionManagementService
			{ isEnabled: () => true } as any, // extensionEnablementService
			{ getSessions: async () => [] } as any, // authenticationService
			configService,
			mockOpenerService
		);

		await issueService.openReporter({});

		// Verify that IOpenerService.open was called with the correct parameters
		assert(openedUrl?.includes('github.com/microsoft/vscode/issues/new'), 'Should open GitHub issue URL');
		assert.strictEqual(openedOptions?.openExternal, true, 'Should set openExternal to true');
	});
});