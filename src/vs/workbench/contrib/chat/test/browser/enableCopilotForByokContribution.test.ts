/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { EnablementState } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { ensureCopilotEnabledForByok } from '../../browser/enableCopilotForByokContribution.js';
import { ChatConfiguration } from '../../common/constants.js';

suite('ensureCopilotEnabledForByok', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const chatExtensionId = product.defaultChatAgent?.chatExtensionId ?? 'GitHub.copilot-chat';

	test('enables globally disabled chat extension and clears chat.disableAIFeatures', async () => {
		const configurationService = disposables.add(new TestConfigurationService({
			[ChatConfiguration.AIDisabled]: true,
		}));

		let enablementState = EnablementState.DisabledGlobally;
		let updateRunningExtensionsCalled = false;
		let setEnablementCalled = false;

		const localExtension = {
			identifier: { id: chatExtensionId },
			local: {},
		};

		await ensureCopilotEnabledForByok({
			configurationService,
			logService: new NullLogService(),
			extensionsWorkbenchService: {
				queryLocal: async () => { },
				local: [localExtension as never],
				setEnablement: async (_extensions, state) => {
					setEnablementCalled = true;
					enablementState = state;
					return [true];
				},
				updateRunningExtensions: async () => {
					updateRunningExtensionsCalled = true;
				},
			} as never,
			extensionEnablementService: {
				isEnabled: () => enablementState === EnablementState.EnabledGlobally,
				canChangeEnablement: () => true,
			} as never,
		});

		assert.strictEqual(configurationService.getValue(ChatConfiguration.AIDisabled), false);
		assert.strictEqual(setEnablementCalled, true);
		assert.strictEqual(enablementState, EnablementState.EnabledGlobally);
		assert.strictEqual(updateRunningExtensionsCalled, true);
	});

	test('no-op when chat extension is already enabled', async () => {
		const configurationService = disposables.add(new TestConfigurationService());

		let setEnablementCalled = false;

		await ensureCopilotEnabledForByok({
			configurationService,
			logService: new NullLogService(),
			extensionsWorkbenchService: {
				queryLocal: async () => { },
				local: [{
					identifier: { id: chatExtensionId },
					local: {},
				}],
				setEnablement: async () => {
					setEnablementCalled = true;
					return [true];
				},
				updateRunningExtensions: async () => {
					throw new Error('should not restart extension host');
				},
			} as never,
			extensionEnablementService: {
				isEnabled: () => true,
				canChangeEnablement: () => true,
			} as never,
		});

		assert.strictEqual(setEnablementCalled, false);
	});

	test('no-op when chat extension is not installed locally', async () => {
		let setEnablementCalled = false;

		await ensureCopilotEnabledForByok({
			configurationService: disposables.add(new TestConfigurationService()),
			logService: new NullLogService(),
			extensionsWorkbenchService: {
				queryLocal: async () => { },
				local: [],
				setEnablement: async () => {
					setEnablementCalled = true;
					return [true];
				},
				updateRunningExtensions: async () => { },
			} as never,
			extensionEnablementService: {
				isEnabled: () => false,
				canChangeEnablement: () => true,
			} as never,
		});

		assert.strictEqual(setEnablementCalled, false);
	});

});
