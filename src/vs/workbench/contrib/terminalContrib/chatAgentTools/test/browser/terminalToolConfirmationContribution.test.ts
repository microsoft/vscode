/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInputOptions, IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { TerminalToolConfirmationContribution } from '../../browser/terminalToolConfirmationContribution.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('TerminalToolConfirmationContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('manages user command rules without changing their matching scope', async () => {
		const setting = TerminalChatAgentToolsSettingId.AutoApprove;
		const configurationService = new TestConfigurationService({
			[setting]: {
				git: true,
				rm: false,
				'/deploy/': { approve: false, matchCommandLine: true },
				node: { approve: true, matchCommandLine: false },
				ignored: null,
			}
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const update = sinon.stub(configurationService, 'updateValue').callsFake((key, value) => configurationService.setUserConfiguration(key, value));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		const inputs = [' npm test ', undefined, '   ', '/test/'];
		let inputOptions: IInputOptions | undefined;
		instantiationService.stub(IQuickInputService, {
			input: async options => {
				inputOptions = options;
				return inputs.shift();
			}
		});
		const settingsQueries: (string | undefined)[] = [];
		instantiationService.stub(IPreferencesService, {
			openUserSettings: async options => {
				settingsQueries.push(options?.query);
				return undefined;
			}
		});
		const contribution = instantiationService.createInstance(TerminalToolConfirmationContribution);
		const items = contribution.getManageActions();
		const initialItems = items.map(item => [item.label, item.description, item.checked, item.pickable, item.buttons?.map(button => button.tooltip)]);
		for (const item of items.slice(0, 4)) {
			await item.onDidChangeChecked!(!item.checked);
		}
		const toggledRules = configurationService.inspect(setting).userValue;
		const removeItem = items[1];
		await removeItem.onDidTriggerItemButton!(removeItem.buttons![0]);
		const addItem = items[4];
		for (let index = 0; index < 4; index++) {
			await addItem.onDidOpen!();
		}
		await items[5].onDidOpen!();

		assert.deepStrictEqual({
			initialItems,
			toggledRules,
			rules: configurationService.inspect(setting).userValue,
			writeCount: update.callCount,
			userSettingsOnly: update.args.every(arguments_ => arguments_.at(-1) === ConfigurationTarget.USER),
			validation: await Promise.all(['', '   ', 'npm test'].map(value => inputOptions?.validateInput?.(value))),
			settingsQueries,
		}, {
			initialItems: [
				['git', 'Auto-approved', true, undefined, ['Delete']],
				['rm', 'Requires approval', false, undefined, ['Delete']],
				['/deploy/', 'Requires approval, full command line', false, undefined, ['Delete']],
				['node', 'Auto-approved', true, undefined, ['Delete']],
				['Add Command Rule...', undefined, undefined, false, undefined],
				['More Options...', 'Open settings', undefined, false, undefined],
			],
			toggledRules: {
				git: false,
				rm: true,
				'/deploy/': { approve: true, matchCommandLine: true },
				node: { approve: false, matchCommandLine: false },
				ignored: null,
			},
			rules: {
				git: false,
				'/deploy/': { approve: true, matchCommandLine: true },
				node: { approve: false, matchCommandLine: false },
				ignored: null,
				'npm test': true,
				'/test/': true,
			},
			writeCount: 7,
			userSettingsOnly: true,
			validation: ['Enter a command prefix or regular expression.', 'Enter a command prefix or regular expression.', undefined],
			settingsQueries: [setting],
		});
	});
});
