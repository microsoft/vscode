/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IMarkdownString, isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { Separator } from '../../../../../../base/common/actions.js';
import { ILanguageModelChatMetadata, ILanguageModelProviderDescriptor } from '../../../common/languageModels.js';
import { buildAddModelsDropdownActions, getModelAriaLabel, getModelHoverContent, getModelNameHoverContent, TokenLimitsColumnRenderer } from '../../../browser/chatManagement/chatModelsWidget.js';
import { ILanguageModel, ILanguageModelEntry } from '../../../browser/chatManagement/chatModelsViewModel.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';

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

	suite('context size', () => {

		function renderContextSize(model: ILanguageModel) {
			const hovers: string[] = [];
			const hoverService: IHoverService = {
				...NullHoverService,
				setupDelayedHoverAtMouse: (_target, options) => {
					const content = (typeof options === 'function' ? options() : options).content;
					hovers.push(isMarkdownString(content) ? content.value : String(content));
					return Disposable.None;
				}
			};
			const renderer = new TokenLimitsColumnRenderer(hoverService);
			const row = document.createElement('div');
			const templateData = renderer.renderTemplate(DOM.append(row, DOM.$('div')));
			const entry: ILanguageModelEntry = { type: 'model', id: model.identifier, templateId: TokenLimitsColumnRenderer.TEMPLATE_ID, model };
			renderer.renderElement(entry, 0, templateData);
			const cell = Array.from(templateData.tokenLimitsElement.querySelectorAll('.token-limit-item'), item => item.textContent);
			renderer.disposeTemplate(templateData);
			return {
				cell,
				cellHover: hovers.join(''),
				modelHover: getModelHoverContent(model).value.split('\n').find(line => line.startsWith('Context Size')),
				ariaLabel: getModelAriaLabel(model).split('. ').find(part => part.startsWith('Context size')),
			};
		}

		test('uses the declared context window and falls back to input and output budgets', () => {
			const results = [
				{ maxInputTokens: 77_000, maxOutputTokens: 8_192, maxContextWindowTokens: 65_536 },
				{ maxInputTokens: 8_192, maxOutputTokens: 4_096 },
				{ maxInputTokens: undefined, maxOutputTokens: undefined, maxContextWindowTokens: 100_000 },
				{ maxInputTokens: undefined, maxOutputTokens: undefined },
				{ maxInputTokens: 8_192, maxOutputTokens: 4_096, maxContextWindowTokens: 0 },
			].map(limits => renderContextSize(createModel(limits)));

			assert.deepStrictEqual(results, [
				{ cell: ['66K'], cellHover: 'Context Size: 66K', modelHover: 'Context Size: 66K', ariaLabel: 'Context size: 66K tokens' },
				{ cell: ['12K'], cellHover: 'Context Size: 12K', modelHover: 'Context Size: 12K', ariaLabel: 'Context size: 12K tokens' },
				{ cell: ['100K'], cellHover: 'Context Size: 100K', modelHover: 'Context Size: 100K', ariaLabel: 'Context size: 100K tokens' },
				{ cell: [], cellHover: '', modelHover: undefined, ariaLabel: undefined },
				{ cell: [], cellHover: '', modelHover: undefined, ariaLabel: undefined },
			]);
		});
	});

	suite('getModelHoverContent with untrusted metadata', () => {

		const commandLink = 'x [y](command:test.injected) z';
		const commandAutolink = 'x <command:test.injected> z';
		const bareLinks = 'x https://example.com www.example.org user@example.com z';
		const themeIcon = 'x $(sync) z';
		const lineBreaks = 'x\n\n[y](command:test.injected)\n\n# z';
		const payloads = { commandLink, commandAutolink, bareLinks, themeIcon, lineBreaks };

		function render(markdown: IMarkdownString) {
			const element = store.add(renderMarkdown(markdown)).element;
			return {
				links: Array.from(element.getElementsByTagName('a'), link => link.dataset.href),
				icons: element.getElementsByClassName('codicon').length,
				headings: element.getElementsByTagName('h1').length,
				text: element.textContent ?? '',
			};
		}

		function literalText(value: string): string {
			return value.replace(/\n/g, ' ');
		}

		const statusIcon = Codicon.info;

		for (const [payloadName, payload] of Object.entries(payloads)) {
			for (const field of ['name', 'id', 'version', 'tooltip'] as const) {
				for (const [hoverName, getHover] of [['model hover', getModelHoverContent], ['name hover', getModelNameHoverContent]] as const) {
					test(`${hoverName} renders ${payloadName} in ${field} as plain text`, () => {
						const rendered = render(getHover(createModel({ tooltip: 'Tooltip', statusIcon, [field]: payload })));

						assert.deepStrictEqual({
							links: rendered.links,
							icons: rendered.icons,
							headings: rendered.headings,
							showsPayload: rendered.text.includes(literalText(payload)),
						}, {
							links: [],
							icons: 1,
							headings: 0,
							showsPayload: true,
						});
					});
				}
			}

			test(`model hover renders ${payloadName} in pricing as plain text`, () => {
				const rendered = render(getModelHoverContent(createModel({ pricing: payload })));

				assert.deepStrictEqual({
					links: rendered.links,
					icons: rendered.icons,
					headings: rendered.headings,
					showsPayload: rendered.text.includes(literalText(payload)),
				}, {
					links: [],
					icons: 0,
					headings: 0,
					showsPayload: true,
				});
			});

			test(`model hover renders ${payloadName} in edit tools as plain text`, () => {
				const rendered = render(getModelHoverContent(createModel({ capabilities: { editTools: [payload] } })));

				assert.deepStrictEqual({
					links: rendered.links,
					icons: rendered.icons,
					headings: rendered.headings,
					showsPayload: rendered.text.includes(literalText(payload)),
				}, {
					links: [],
					icons: 0,
					headings: 0,
					showsPayload: true,
				});
			});
		}

		test('renders the id of a model whose id and version are equal as plain text', () => {
			const rendered = render(getModelNameHoverContent(createModel({ id: commandLink, version: commandLink })));

			assert.deepStrictEqual({ links: rendered.links, showsPayload: rendered.text.includes(commandLink) }, { links: [], showsPayload: true });
		});

		test('does not turn an unusual status icon id into a link', () => {
			const rendered = render(getModelNameHoverContent(createModel({ tooltip: 'Tooltip', statusIcon: { id: '[y](command:test.injected' } })));

			assert.deepStrictEqual(rendered.links, []);
		});

		test('does not enable any command', () => {
			assert.deepStrictEqual({
				modelHover: getModelHoverContent(createModel()).isTrusted,
				nameHover: getModelNameHoverContent(createModel()).isTrusted,
			}, {
				modelHover: { enabledCommands: [] },
				nameHover: { enabledCommands: [] },
			});
		});

		test('keeps rendering ordinary metadata', () => {
			const model = createModel({ name: 'Llama 3.2 (Ollama)', id: 'llama3.2:latest', version: '2024-09-25', tooltip: 'Contributed by Ollama @ localhost', statusIcon, pricing: '1x' });

			const hover = render(getModelHoverContent(model));
			const nameHover = render(getModelNameHoverContent(model));

			assert.deepStrictEqual({
				links: [...hover.links, ...nameHover.links],
				icons: [hover.icons, nameHover.icons],
				text: [hover.text.includes('Llama 3.2 (Ollama)'), hover.text.includes('llama3.2:latest@2024-09-25'), hover.text.includes('Contributed by Ollama @ localhost'), hover.text.includes('Pricing: 1x')],
			}, {
				links: [],
				icons: [1, 1],
				text: [true, true, true, true],
			});
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
});
