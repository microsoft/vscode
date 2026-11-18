/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInputOptions, IQuickInputService } from '../../../../../../../platform/quickinput/common/quickInput.js';
import { IUrlApprovalSettings } from '../../../../../../../platform/url/common/urlApprovalPatterns.js';
import { IPreferencesService } from '../../../../../../services/preferences/common/preferences.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { ChatUrlFetchingConfirmationContribution } from '../../../../common/tools/builtinTools/chatUrlFetchingConfirmation.js';

suite('ChatUrlFetchingConfirmationContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('toggles request approval for retained URL patterns without overwriting newer approvals', async () => {
		const setting = ChatConfiguration.AutoApprovedUrls;
		const configurationService = new TestConfigurationService({
			[setting]: {
				'first.example': { approveRequest: true, approveResponse: false },
				'second.example': true,
			}
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		sinon.stub(configurationService, 'updateValue').callsFake((key, value) => configurationService.setUserConfiguration(key, value));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IQuickInputService, {});
		instantiationService.stub(IPreferencesService, {});
		const contribution = instantiationService.createInstance(ChatUrlFetchingConfirmationContribution, () => undefined);
		const [first, second] = contribution.getManageActions();
		await first.onDidChangeChecked!(false);
		await second.onDidChangeChecked!(false);
		const unchecked = configurationService.getValue(setting);
		await configurationService.setUserConfiguration(setting, { 'new.example': { approveResponse: true } });
		await first.onDidChangeChecked!(true);
		const restored = configurationService.getValue(setting);
		await second.onDidTriggerItemButton!(second.buttons![0]);
		const afterDelete = configurationService.getValue(setting);
		await first.onDidTriggerItemButton!(first.buttons![0]);

		assert.deepStrictEqual({ unchecked, restored, afterDelete, approvals: configurationService.getValue(setting) }, {
			unchecked: { 'second.example': { approveRequest: false, approveResponse: true } },
			restored: {
				'new.example': { approveResponse: true },
				'first.example': { approveRequest: true, approveResponse: false },
			},
			afterDelete: restored,
			approvals: { 'new.example': { approveResponse: true } },
		});
	});

	test('overrides default URL patterns instead of copying or deleting them', async () => {
		const setting = ChatConfiguration.AutoApprovedUrls;
		const defaultValue = { 'default.example': true };
		let userValue: Record<string, unknown> = { 'user.example': true };
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		sinon.stub(configurationService, 'getValue').callsFake(() => ({ ...defaultValue, ...userValue }));
		sinon.stub(configurationService, 'inspect').callsFake(() => ({ value: { ...defaultValue, ...userValue }, defaultValue, userValue }));
		sinon.stub(configurationService, 'updateValue').callsFake(async (_key, value) => { userValue = value as Record<string, unknown>; });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IQuickInputService, {});
		instantiationService.stub(IPreferencesService, {});
		const contribution = instantiationService.createInstance(ChatUrlFetchingConfirmationContribution, () => undefined);
		const defaultItem = () => contribution.getManageActions().find(item => item.label === 'default.example')!;
		const states: [boolean | 'mixed' | undefined, Record<string, unknown>][] = [[defaultItem().checked, userValue]];
		await defaultItem().onDidChangeChecked!(false);
		states.push([defaultItem().checked, userValue]);
		await defaultItem().onDidChangeChecked!(true);
		states.push([defaultItem().checked, userValue]);
		await defaultItem().onDidTriggerItemButton!(defaultItem().buttons![0]);
		states.push([defaultItem().checked, userValue]);

		assert.deepStrictEqual({ setting, states }, {
			setting,
			states: [
				[true, { 'user.example': true }],
				[false, { 'user.example': true, 'default.example': { approveRequest: false, approveResponse: true } }],
				[true, { 'user.example': true }],
				[false, { 'user.example': true, 'default.example': false }],
			],
		});
	});

	for (const target of [ConfigurationTarget.WORKSPACE, ConfigurationTarget.WORKSPACE_FOLDER]) {
		test(`edits URL patterns at configuration target ${target} using its latest value`, async () => {
			const userValue = { 'user.example': true };
			let workspaceValue: Record<string, boolean | IUrlApprovalSettings> = { 'scoped.example': true };
			let workspaceFolderValue: Record<string, boolean | IUrlApprovalSettings> | undefined = target === ConfigurationTarget.WORKSPACE_FOLDER
				? { 'scoped.example': { approveRequest: true, approveResponse: false } }
				: undefined;
			const writes: { target: ConfigurationTarget | undefined; approvals: Record<string, boolean | IUrlApprovalSettings> }[] = [];
			const configurationService = new TestConfigurationService();
			store.add(configurationService.onDidChangeConfigurationEmitter);
			sinon.stub(configurationService, 'updateValue').callsFake(async (_key: string, value: unknown, writeTarget?: unknown) => {
				const approvals = value as Record<string, boolean | IUrlApprovalSettings>;
				writes.push({ target: writeTarget as ConfigurationTarget | undefined, approvals });
				if (writeTarget === ConfigurationTarget.WORKSPACE_FOLDER) {
					workspaceFolderValue = approvals;
				} else if (writeTarget === ConfigurationTarget.WORKSPACE) {
					workspaceValue = approvals;
				}
			});
			sinon.stub(configurationService, 'getValue').callsFake(() => ({ ...userValue, ...workspaceValue, ...workspaceFolderValue }));
			sinon.stub(configurationService, 'inspect').callsFake(() => ({ userValue, workspaceValue, workspaceFolderValue }));
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IQuickInputService, {});
			instantiationService.stub(IPreferencesService, {});
			const contribution = instantiationService.createInstance(ChatUrlFetchingConfirmationContribution, () => undefined);
			const item = contribution.getManageActions().find(item => item.label === 'scoped.example')!;
			if (workspaceFolderValue) {
				workspaceFolderValue = { ...workspaceFolderValue, 'new.example': true };
			} else {
				workspaceValue = { ...workspaceValue, 'new.example': true };
			}
			await item.onDidChangeChecked!(false);
			const unchecked = contribution.getManageActions().find(item => item.label === 'scoped.example')!.checked;
			await item.onDidTriggerItemButton!(item.buttons![0]);

			assert.deepStrictEqual({ unchecked, writes, userValue }, {
				unchecked: false,
				writes: [
					{
						target, approvals: target === ConfigurationTarget.WORKSPACE
							? { 'scoped.example': { approveRequest: false, approveResponse: true }, 'new.example': true }
							: { 'scoped.example': false, 'new.example': true }
					},
					{ target, approvals: { 'new.example': true } },
				],
				userValue: { 'user.example': true },
			});
		});
	}

	test('adding an existing default URL pattern preserves response approval', async () => {
		const defaultValue = { 'default.example': true, 'response.example': { approveResponse: true } };
		let userValue: Record<string, boolean | IUrlApprovalSettings> = {};
		const writes: { value: Record<string, boolean | IUrlApprovalSettings>; target: ConfigurationTarget | undefined }[] = [];
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		sinon.stub(configurationService, 'updateValue').callsFake(async (_key: string, value: unknown, target?: unknown) => {
			userValue = value as Record<string, boolean | IUrlApprovalSettings>;
			writes.push({ value: userValue, target: target as ConfigurationTarget | undefined });
		});
		sinon.stub(configurationService, 'getValue').callsFake(() => ({ ...defaultValue, ...userValue }));
		sinon.stub(configurationService, 'inspect').callsFake(() => ({ defaultValue, userValue }));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		const inputs = Object.keys(defaultValue);
		instantiationService.stub(IQuickInputService, { input: async () => inputs.shift() });
		instantiationService.stub(IPreferencesService, {});
		const contribution = instantiationService.createInstance(ChatUrlFetchingConfirmationContribution, () => undefined);
		const addItem = contribution.getManageActions().find(item => item.label === 'Add URL Pattern...')!;
		await addItem.onDidOpen!();
		await addItem.onDidOpen!();

		assert.deepStrictEqual(writes, [
			{ value: { 'default.example': { approveRequest: true, approveResponse: true } }, target: ConfigurationTarget.USER },
			{ value: { 'default.example': { approveRequest: true, approveResponse: true }, 'response.example': { approveRequest: true, approveResponse: true } }, target: ConfigurationTarget.USER },
		]);
	});

	test('adds request-only URL patterns while preserving existing response approvals', async () => {
		const setting = ChatConfiguration.AutoApprovedUrls;
		const configurationService = new TestConfigurationService({
			[setting]: {
				'existing.example': { approveRequest: false, approveResponse: true },
				'boolean.example': true,
				'blocked.example': false,
				'unrelated.example': { approveRequest: true, approveResponse: false },
			}
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const update = sinon.stub(configurationService, 'updateValue').callsFake((key, value) => configurationService.setUserConfiguration(key, value));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		const inputs = [' example.com ', 'existing.example', 'boolean.example', 'blocked.example', undefined, '   '];
		let inputOptions: IInputOptions | undefined;
		instantiationService.stub(IQuickInputService, {
			input: async options => {
				inputOptions = options;
				return inputs.shift();
			}
		});
		instantiationService.stub(IPreferencesService, {});
		const contribution = instantiationService.createInstance(ChatUrlFetchingConfirmationContribution, () => undefined);
		const items = contribution.getManageActions();
		const addItem = items.find(item => item.label === 'Add URL Pattern...')!;
		for (let index = 0; index < 6; index++) {
			await addItem.onDidOpen!();
		}

		assert.deepStrictEqual({
			actions: items.slice(-2).map(item => [item.label, item.pickable]),
			approvals: configurationService.inspect(setting).userValue,
			writeCount: update.callCount,
			userSettingsOnly: update.args.every(arguments_ => arguments_.at(-1) === ConfigurationTarget.USER),
			validation: await Promise.all(['', '   ', 'example.com'].map(value => inputOptions?.validateInput?.(value))),
		}, {
			actions: [['Add URL Pattern...', false], ['More Options...', false]],
			approvals: {
				'existing.example': { approveRequest: true, approveResponse: true },
				'boolean.example': { approveRequest: true, approveResponse: true },
				'blocked.example': { approveRequest: true, approveResponse: false },
				'unrelated.example': { approveRequest: true, approveResponse: false },
				'example.com': { approveRequest: true, approveResponse: false },
			},
			writeCount: 4,
			userSettingsOnly: true,
			validation: ['Enter a domain or URL pattern.', 'Enter a domain or URL pattern.', undefined],
		});
	});
});
