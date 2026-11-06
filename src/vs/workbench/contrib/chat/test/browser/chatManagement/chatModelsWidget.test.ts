/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IAction, Separator } from '../../../../../../base/common/actions.js';
import { ILanguageModelChatMetadata, ILanguageModelProviderDescriptor, ILanguageModelsService } from '../../../common/languageModels.js';
import { buildAddModelsDropdownActions, ChatModelsWidget, getModelHoverContent } from '../../../browser/chatManagement/chatModelsWidget.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { NullLanguageModelsService } from '../../common/languageModels.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IEditorProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { ILanguageModel } from '../../../browser/chatManagement/chatModelsViewModel.js';
import { ChatAgentLocation } from '../../../common/constants.js';

function createModel(overrides: Partial<ILanguageModelChatMetadata> = {}): ILanguageModel {
	return {
		metadata: {
			extension: new ExtensionIdentifier('github.copilot'),
			id: 'gpt-4',
			name: 'GPT-4',
			family: 'gpt-4',
			version: '1.0',
			vendor: 'copilot',
			maxInputTokens: 8192,
			maxOutputTokens: 4096,
			isUserSelectable: true,
			isDefaultForLocation: {
				[ChatAgentLocation.Chat]: false
			},
			...overrides
		},
		identifier: 'copilot-gpt-4',
		provider: {
			vendor: { vendor: 'copilot', displayName: 'GitHub Copilot', isDefault: true },
			group: { name: 'GitHub Copilot' }
		},
	} as ILanguageModel;
}

function createVendor(vendor: string, displayName: string, deprecation?: { link?: string }): ILanguageModelProviderDescriptor {
	return { vendor, displayName, isDefault: false, deprecation } as ILanguageModelProviderDescriptor;
}

suite('ChatModelsWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('getModelHoverContent', () => {

		test('includes cost fields when all four are present', () => {
			const model = createModel({
				inputCost: 4,
				outputCost: 14,
				cacheCost: 1,
				cacheWriteCost: 2
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('4 credits per 1M tokens'));
			assert.ok(value.includes('Output Cost'));
			assert.ok(value.includes('14 credits per 1M tokens'));
			assert.ok(value.includes('Cache Read Cost'));
			assert.ok(value.includes('1 credit per 1M tokens'));
			assert.ok(value.includes('Cache Write Cost'));
			assert.ok(value.includes('2 credits per 1M tokens'));
		});

		test('includes only present cost fields', () => {
			const model = createModel({
				inputCost: 3,
				outputCost: 12
				// cacheCost and cacheWriteCost intentionally omitted
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('3 credits per 1M tokens'));
			assert.ok(value.includes('Output Cost'));
			assert.ok(value.includes('12 credits per 1M tokens'));
			assert.ok(!value.includes('Cache Read Cost'));
			assert.ok(!value.includes('Cache Write Cost'));
		});

		test('omits cost section when no cost fields are set', () => {
			const model = createModel({});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(!value.includes('Input Cost'));
			assert.ok(!value.includes('Output Cost'));
			assert.ok(!value.includes('Cache Read Cost'));
			assert.ok(!value.includes('Cache Write Cost'));
			assert.ok(!value.includes('credits per 1M tokens'));
			assert.ok(!value.includes('credit per 1M tokens'));
		});

		test('includes pricing text when set', () => {
			const model = createModel({ pricing: '1x' });

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Pricing'));
			assert.ok(value.includes('1x'));
		});

		test('includes both pricing and cost fields when both are present', () => {
			const model = createModel({
				pricing: '1x',
				inputCost: 4,
				outputCost: 14,
				cacheCost: 1
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Pricing'));
			assert.ok(value.includes('1x'));
			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('4 credits per 1M tokens'));
		});

		test('handles zero cost values', () => {
			const model = createModel({
				inputCost: 0,
				outputCost: 0,
				cacheCost: 0
			});

			const markdown = getModelHoverContent(model);
			const value = markdown.value;

			assert.ok(value.includes('Input Cost'));
			assert.ok(value.includes('0 credits per 1M tokens'));
		});
	});

	suite('buildAddModelsDropdownActions', () => {

		test('returns no actions when adding models is not supported', () => {
			const vendors = [createVendor('acme', 'Acme')];
			let vendorRunCount = 0;

			const actions = buildAddModelsDropdownActions(
				vendors,
				false,
				() => { vendorRunCount++; },
			);

			assert.deepStrictEqual({
				ids: actions.map(a => a.id),
				vendorRunCount,
			}, {
				ids: [],
				vendorRunCount: 0,
			});
		});

		test('returns configurable vendor actions sorted with custom vendors pinned at the end', async () => {
			const vendors = [
				createVendor('zebra', 'Zebra'),
				createVendor('acme', 'Acme'),
				createVendor('customoai', 'OpenAI Compatible (Deprecated)'),
				createVendor('customendpoint', 'Custom Endpoint'),
			];
			const ran: string[] = [];

			const actions = buildAddModelsDropdownActions(
				vendors,
				true,
				v => { ran.push(v.vendor); },
			);

			// Execute every non-separator action to capture which path each one runs.
			for (const action of actions) {
				if (!(action instanceof Separator)) {
					await action.run();
				}
			}

			assert.deepStrictEqual({
				shape: actions.map(a => a instanceof Separator ? 'separator' : a.id),
				ran,
			}, {
				shape: ['enable-acme', 'enable-zebra', 'enable-customoai', 'separator', 'enable-customendpoint'],
				ran: ['acme', 'zebra', 'customoai', 'customendpoint'],
			});
		});

		test('prepends GitHub Copilot sign-in when signed out', async () => {
			const ran: string[] = [];
			const actions = buildAddModelsDropdownActions(
				[createVendor('anthropic', 'Anthropic')],
				true,
				vendor => { ran.push(vendor.vendor); },
				() => { ran.push('copilot'); },
			);

			for (const action of actions) {
				if (!(action instanceof Separator)) {
					await action.run();
				}
			}

			assert.deepStrictEqual({
				actions: actions.map(action => action instanceof Separator ? 'separator' : `${action.id}:${action.label}`),
				ran,
			}, {
				actions: ['signIn-github-copilot:GitHub Copilot', 'separator', 'enable-anthropic:Anthropic'],
				ran: ['copilot', 'anthropic'],
			});
		});

		test('offers GitHub Copilot sign-in when BYOK model addition is unavailable', () => {
			const actions = buildAddModelsDropdownActions(
				[createVendor('anthropic', 'Anthropic')],
				false,
				() => assert.fail('vendor action should not run'),
				() => { },
			);

			assert.deepStrictEqual(
				actions.map(action => action instanceof Separator ? 'separator' : `${action.id}:${action.label}`),
				['signIn-github-copilot:GitHub Copilot'],
			);
		});

		test('with no configurable vendors: no actions are returned', async () => {
			const actions = buildAddModelsDropdownActions(
				[],
				true,
				() => assert.fail('vendor run should not be called'),
			);

			assert.deepStrictEqual(
				actions.map(a => a instanceof Separator ? 'separator' : a.id),
				[],
			);
		});

		test('with configurable vendors: vendor actions are separated from the pinned custom endpoint vendor', async () => {
			const vendors = [
				createVendor('acme', 'Acme'),
				createVendor('customendpoint', 'Custom Endpoint'),
			];
			const ran: string[] = [];

			const actions = buildAddModelsDropdownActions(
				vendors,
				true,
				v => { ran.push(v.vendor); },
			);
			for (const action of actions) {
				if (!(action instanceof Separator)) {
					await action.run();
				}
			}

			assert.deepStrictEqual({
				shape: actions.map(a => a instanceof Separator ? 'separator' : a.id),
				ran,
			}, {
				shape: ['enable-acme', 'separator', 'enable-customendpoint'],
				ran: ['acme', 'customendpoint'],
			});
		});

		test('sinks deprecated providers to the end of the sorted list', () => {
			const vendors = [
				createVendor('zebra', 'Zebra'),
				createVendor('ollama', 'Ollama (Deprecated)', { link: 'vscode:extension/Ollama.ollama' }),
				createVendor('acme', 'Acme'),
				createVendor('customoai', 'OpenAI Compatible (Deprecated)'),
				createVendor('customendpoint', 'Custom Endpoint'),
			];

			const actions = buildAddModelsDropdownActions(vendors, true, () => { });

			assert.deepStrictEqual(
				actions.map(a => a instanceof Separator ? 'separator' : a.id),
				['enable-acme', 'enable-zebra', 'enable-ollama', 'enable-customoai', 'separator', 'enable-customendpoint'],
			);
		});
	});

	test('the Add Models button follows the active service without losing BYOK actions or rebuilding for unrelated sentiment', async () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IUserInteractionService, new MockUserInteractionService());
		const changed = store.add(new Emitter<void>());
		const entitlement = {
			onDidChangeSentiment: changed.event,
			onDidChangeEntitlement: Event.None,
			onDidChangeUsageBasedBilling: Event.None,
			sentiment: {} as IChatSentiment,
			quotas: { usageBasedBilling: true },
			clientByokEnabled: true,
			isInternal: false,
			entitlement: ChatEntitlement.Free,
		};
		instantiation.stub(IChatEntitlementService, entitlement);
		const configured: string[] = [];
		const vendors = ['acme', 'customendpoint'].map(vendor => ({ ...createVendor(vendor, vendor), managementCommand: 'configure' }));
		instantiation.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override getVendors() { return vendors; }
			override async configureLanguageModelsProviderGroup(vendor: string) { configured.push(vendor); }
		}());
		instantiation.stub(IDefaultAccountService, { currentDefaultAccount: null, onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
		instantiation.stub(IExtensionsWorkbenchService, {});
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async command => { commands.push(command); } });
		let loading: Promise<unknown> = Promise.resolve();
		instantiation.stub(IEditorProgressService, { showWhile: async promise => { loading = promise; await promise; } });
		let actions: readonly IAction[] = [];
		instantiation.stub(IContextMenuService, { showContextMenu: delegate => { actions = delegate.getActions?.() ?? []; } });
		const widget = store.add(instantiation.createInstance(ChatModelsWidget));
		DOM.append(document.body, widget.element);
		store.add(toDisposable(() => widget.element.remove()));
		await loading;
		const snapshot = () => {
			widget.element.querySelector<HTMLElement>('.models-add-model-button')!.click();
			return {
				actions: actions.map(action => action instanceof Separator ? 'separator' : action.id),
				credits: widget.element.textContent!.includes('Cost (Credits per 1M Tokens)'),
			};
		};
		const gateOff = snapshot();
		entitlement.sentiment = { copilotService: 'm365' };
		changed.fire();
		const m365 = snapshot();
		await actions.find(action => action.id === 'enable-acme')!.run();
		const table = widget.element.querySelector('.monaco-table');
		entitlement.sentiment = { copilotService: 'm365', later: true };
		changed.fire();
		const sameTable = !!table && table === widget.element.querySelector('.monaco-table');
		entitlement.sentiment = {};
		changed.fire();
		const lost = snapshot();
		await actions.find(action => action.id === 'signIn-github-copilot')!.run();
		entitlement.sentiment = { copilotService: 'github' };
		changed.fire();
		const github = snapshot();

		const githubActions = ['signIn-github-copilot', 'separator', 'enable-acme', 'separator', 'enable-customendpoint'];
		assert.deepStrictEqual({ gateOff, m365, lost, github, sameTable, configured, commands }, {
			gateOff: { actions: githubActions, credits: true },
			m365: { actions: ['enable-acme', 'separator', 'enable-customendpoint'], credits: false },
			lost: { actions: githubActions, credits: true },
			github: { actions: githubActions, credits: true },
			sameTable: true,
			configured: ['acme'],
			commands: ['workbench.action.chat.triggerSetup'],
		});
	});
});
