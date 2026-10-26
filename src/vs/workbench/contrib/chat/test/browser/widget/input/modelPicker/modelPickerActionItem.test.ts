/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../../base/browser/dom.js';
import { isManagedHoverTooltipMarkdownString } from '../../../../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { IAction } from '../../../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { isMarkdownString } from '../../../../../../../../base/common/htmlContent.js';
import { ResolvedKeybinding } from '../../../../../../../../base/common/keybindings.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService, IConfigurationValue } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUpdateService } from '../../../../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestWorkspaceTrustManagementService } from '../../../../../../../test/common/workbenchTestServices.js';
import { ModelPickerActionItem, IModelPickerDelegate } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ModelPickerWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { IModelPickerComparison, IModelPickerComparisonState } from '../../../../../browser/widget/input/modelPicker/modelPickerComparison.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../common/languageModels.js';
import { SessionType } from '../../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../../common/constants.js';
import { NullLanguageModelsService } from '../../../../common/languageModels.js';
import '../../../../../browser/widget/media/chat.css';

suite('ModelPickerActionItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(name: string): ILanguageModelChatMetadataAndIdentifier {
		return {
			identifier: `copilot/${name}`,
			metadata: upcastPartial<ILanguageModelChatMetadata>({
				id: name,
				name,
				vendor: 'copilot',
				family: name,
				version: '1.0',
				maxInputTokens: 256000,
				maxOutputTokens: 8192,
				isDefaultForLocation: {},
				configurationSchema: {
					properties: {
						reasoningEffort: { type: 'string', group: 'navigation', enum: ['medium', 'high'], enumItemLabels: ['Medium', 'High'], default: 'high' },
						contextSize: { type: 'number', group: 'tokens', enum: [128000, 256000], enumItemLabels: ['128K', '256K'], default: 256000 },
					},
				},
			}),
		};
	}

	/**
	 * Renders the real picker as the chat input toolbar does, with the model's
	 * name followed by its thinking effort / context size readout. By default the
	 * name has no icon, so it keeps its label even when the picker is compact.
	 */
	function renderPicker(model: ILanguageModelChatMetadataAndIdentifier, options: { readonly compact?: boolean; readonly minimal?: boolean; readonly comparison?: IModelPickerComparison; readonly comparisonBusy?: IObservable<boolean>; readonly comparisonKeybindingLabel?: string; readonly itemWidth?: number; readonly models?: readonly ILanguageModelChatMetadataAndIdentifier[]; readonly showModelIcon?: boolean; readonly configurationService?: TestConfigurationService } = {}) {
		const models = options.models ? [...options.models] : [model];
		let modelReads = 0;
		const modelsChanged = disposables.add(new Emitter<string>());
		const compact = observableValue('compact', options.compact ?? false);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override readonly onDidChangeLanguageModels = modelsChanged.event;
			override getLanguageModelIds() { return models.map(candidate => candidate.identifier); }
		}());
		instantiationService.stub(IProductService, {});
		const entitlementService = new TestChatEntitlementService();
		entitlementService.entitlement = ChatEntitlement.Pro;
		instantiationService.stub(IChatEntitlementService, entitlementService);
		instantiationService.stub(IUpdateService, {});
		instantiationService.stub(IUriIdentityService, {});
		instantiationService.stub(IDefaultAccountService, {});
		instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
		instantiationService.stub(IWorkspaceTrustRequestService, {});
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IConfigurationService, options.configurationService ?? new TestConfigurationService());

		const action: IAction = { id: 'test.modelPicker', label: '', tooltip: '', class: undefined, enabled: true, run: async () => { } };
		const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', model);
		const delegate: IModelPickerDelegate = {
			comparison: options.comparison,
			comparisonBusy: options.comparisonBusy,
			currentModel,
			setModel: () => { },
			setModelProgrammatically: () => { },
			getModels: () => { modelReads++; return models; },
			getPresentationOptions: () => ({
				showManageModelsAction: false,
				showUnavailableFeatured: false,
				showAutoModel: true,
				showModelIcon: options.showModelIcon ?? false,
			}),
		};
		const item = disposables.add(new ModelPickerActionItem(
			action,
			delegate,
			{ compact, minimal: constObservable(options.minimal ?? false) },
			instantiationService,
			new MockContextKeyService(),
			new class extends MockKeybindingService {
				override lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
					return options.comparisonKeybindingLabel && commandId === options.comparison?.startCommandId
						? upcastPartial<ResolvedKeybinding>({ getLabel: () => options.comparisonKeybindingLabel! })
						: undefined;
				}
			}(),
		));

		const session = append(mainWindow.document.body, $('.interactive-session'));
		disposables.add(toDisposable(() => session.remove()));
		session.style.setProperty('--vscode-spacing-size20', '2px');
		session.style.setProperty('--vscode-spacing-size60', '6px');
		const toolbar = append(session, $('.chat-input-toolbar'));
		toolbar.style.display = 'flex';
		const container = append(toolbar, $('.action-item'));
		if (options.itemWidth !== undefined) {
			container.style.width = `${options.itemWidth}px`;
		}
		const beforeInitialRender = modelReads;
		item.render(container);
		const initialRenderReads = modelReads - beforeInitialRender;

		const name = container.querySelector<HTMLElement>('.model-picker-name')!;
		const label = name.querySelector<HTMLElement>('.chat-input-picker-label');
		const configuration = container.querySelector<HTMLElement>('.model-picker-config')!;
		return {
			item,
			currentModel,
			compact,
			initialRenderReads,
			getModelReadCount: () => modelReads,
			setModels: (updatedModels: readonly ILanguageModelChatMetadataAndIdentifier[]) => {
				models.splice(0, models.length, ...updatedModels);
				modelsChanged.fire('copilot');
			},
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
			getHoverContents: () => item['_getHoverContents'](),
			domNode: container.querySelector<HTMLElement>('.model-picker-split')!,
			minimumWidth: item.minimumWidth,
			container: container.getBoundingClientRect(),
			name: name.getBoundingClientRect(),
			label: label?.getBoundingClientRect() ?? name.getBoundingClientRect(),
			labelTruncated: !!label && label.scrollWidth > label.clientWidth,
			configuration: configuration.getBoundingClientRect(),
			sections: [name, configuration].map(button => ({
				padding: mainWindow.getComputedStyle(button).padding,
				height: button.getBoundingClientRect().height,
			})),
		};
	}

	function createManagedConfiguration(policyDefault?: string) {
		const policy = new TestConfigurationService({ [ChatConfiguration.DefaultModel]: policyDefault });
		const configuration = new class extends TestConfigurationService {
			override inspect<T>(key: string): IConfigurationValue<T> {
				const result = super.inspect<T>(key);
				const policyValue = policy.getValue<T>(key);
				return { ...result, policyValue, value: policyValue ?? result.value };
			}
		}({ [ChatConfiguration.DefaultModel]: 'Second' });
		disposables.add(policy.onDidChangeConfigurationEmitter);
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const changePolicy = async (value: string | undefined) => {
			await policy.setUserConfiguration(ChatConfiguration.DefaultModel, value);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === ChatConfiguration.DefaultModel,
			}));
		};
		return { configuration, changePolicy };
	}

	for (const policyDefault of [undefined, '', '   ', 'First']) {
		test(`reads the catalog once per label render with policy ${JSON.stringify(policyDefault)}`, () => {
			const { configuration } = createManagedConfiguration(policyDefault);
			const { compact, initialRenderReads, getModelReadCount, getHoverContents, domNode } = renderPicker(createModel('First'), { configurationService: configuration });
			const beforeRender = getModelReadCount();
			compact.set(true, undefined);
			const renderReads = getModelReadCount() - beforeRender;
			const beforeHover = getModelReadCount();
			getHoverContents();
			assert.deepStrictEqual({
				initialRenderReads,
				renderReads,
				hoverReads: getModelReadCount() - beforeHover,
				description: domNode.querySelector<HTMLElement>('.model-picker-name')!.ariaDescription,
			}, {
				initialRenderReads: 1,
				renderReads: 1,
				hoverReads: 2,
				description: policyDefault === 'First' ? 'Your organization sets First as the default for new chats. You can choose another model for this chat.' : '',
			});
		});
	}

	test('refreshes the rendered organization default when models arrive and disappear', () => {
		const first = createModel('First');
		const second = createModel('Second');
		const { configuration } = createManagedConfiguration('First');
		const { setModels, getHoverContents, domNode } = renderPicker(second, { configurationService: configuration });
		const button = domNode.querySelector<HTMLElement>('.model-picker-name')!;
		const read = () => ({ description: button.ariaDescription, hover: getHoverContents() });
		const absent = read();
		setModels([first, second]);
		const arrived = read();
		setModels([second]);
		const description = 'Your organization sets First as the default for new chats. You can choose another model for this chat.';
		assert.deepStrictEqual({ absent, arrived, removed: read() }, {
			absent: { description: '', hover: 'Models • Second' },
			arrived: { description, hover: `Models • Second\n\n${description}` },
			removed: { description: '', hover: 'Models • Second' },
		});
	});

	for (const policyDefault of [undefined, 'First']) {
		test(`prefers the host-advertised model default over local policy ${JSON.stringify(policyDefault)}`, () => {
			const first = createModel('First');
			const second = createModel('Second');
			const managedSecond = { ...second, metadata: { ...second.metadata, managedModelDefaults: { model: true, keys: [] } } };
			const { configuration } = createManagedConfiguration(policyDefault);
			const { setModels, getHoverContents, domNode, initialRenderReads, currentModel } = renderPicker(first, { models: [first, managedSecond], configurationService: configuration });
			const button = domNode.querySelector<HTMLElement>('.model-picker-name')!;
			const read = () => ({ description: button.ariaDescription, hover: getHoverContents() });
			const managed = read();
			setModels([first, { ...second, metadata: { ...second.metadata, managedModelDefaults: { model: false, keys: ['reasoningEffort'] } } }]);
			const hostDescription = 'Your organization sets Second as the default for new chats. You can choose another model for this chat.';
			const fallbackDescription = policyDefault ? 'Your organization sets First as the default for new chats. You can choose another model for this chat.' : '';
			assert.deepStrictEqual({ managed, configurationOnly: read(), initialRenderReads, selected: currentModel.get()?.identifier }, {
				managed: { description: hostDescription, hover: `Models • First\n\n${hostDescription}` },
				configurationOnly: { description: fallbackDescription, hover: fallbackDescription ? `Models • First\n\n${fallbackDescription}` : 'Models • First' },
				initialRenderReads: 1,
				selected: first.identifier,
			});
		});
	}

	test('explains the organization default without claiming it selected the current model', () => {
		const first = createModel('First');
		const second = createModel('Second');
		const { configuration } = createManagedConfiguration('First');
		const { getHoverContents, domNode, currentModel } = renderPicker(second, { models: [first, second], configurationService: configuration });
		const button = domNode.querySelector<HTMLElement>('.model-picker-name')!;
		const read = () => ({ label: button.ariaLabel, description: button.ariaDescription, hover: getHoverContents() });
		const differentChoice = read();
		currentModel.set(first, undefined);
		const description = 'Your organization sets First as the default for new chats. You can choose another model for this chat.';
		assert.deepStrictEqual({ differentChoice, sameChoice: read(), saved: configuration.inspect(ChatConfiguration.DefaultModel).userValue }, {
			differentChoice: { label: 'Models, Second', description, hover: `Models • Second\n\n${description}` },
			sameChoice: { label: 'Models, First', description, hover: `Models • First\n\n${description}` },
			saved: 'Second',
		});
	});

	test('refreshes the closed picker explanation when policy arrives, changes and is removed', async () => {
		const first = createModel('First');
		const second = createModel('Second');
		const { configuration, changePolicy } = createManagedConfiguration();
		const { getHoverContents, domNode, currentModel } = renderPicker(second, { models: [first, second], configurationService: configuration });
		const button = domNode.querySelector<HTMLElement>('.model-picker-name')!;
		const read = () => ({ description: button.ariaDescription, hover: getHoverContents() });
		const initial = read();
		await changePolicy('First');
		const arrived = read();
		await changePolicy('Second');
		const changed = read();
		await changePolicy('Unavailable');
		const unavailable = read();
		await changePolicy(undefined);
		const firstDescription = 'Your organization sets First as the default for new chats. You can choose another model for this chat.';
		const secondDescription = 'Your organization sets Second as the default for new chats. You can choose another model for this chat.';
		assert.deepStrictEqual({ initial, arrived, changed, unavailable, removed: read(), selected: currentModel.get()?.identifier }, {
			initial: { description: '', hover: 'Models • Second' },
			arrived: { description: firstDescription, hover: `Models • Second\n\n${firstDescription}` },
			changed: { description: secondDescription, hover: `Models • Second\n\n${secondDescription}` },
			unavailable: { description: '', hover: 'Models • Second' },
			removed: { description: '', hover: 'Models • Second' },
			selected: second.identifier,
		});
	});

	test('does not describe a model comparison as using the organization default', () => {
		const { configuration } = createManagedConfiguration('First');
		const { getHoverContents, domNode } = renderPicker(createModel('First'), {
			configurationService: configuration,
			comparison: upcastPartial<IModelPickerComparison>({
				available: constObservable(true), summary: constObservable('3 Attempts'), state: constObservable(undefined),
			}),
		});
		assert.deepStrictEqual({
			description: domNode.querySelector<HTMLElement>('.model-picker-name')!.ariaDescription,
			hover: getHoverContents(),
		}, { description: '', hover: 'Models • 3 Attempts' });
	});

	test('composer label follows committed comparison summary, not working selections', () => {
		const summary = observableValue<string | undefined>('summary', undefined);
		const state = observableValue<IModelPickerComparisonState | undefined>('draft', undefined);
		const { domNode } = renderPicker(createModel('First'), {
			comparison: upcastPartial<IModelPickerComparison>({ available: constObservable(true), summary, state }),
		});
		const label = () => ({
			text: domNode.querySelector('.model-picker-name .chat-input-picker-label')?.textContent,
			compare: !!domNode.querySelector('.codicon-compare'),
			ariaLabel: domNode.querySelector('.model-picker-name')?.getAttribute('aria-label'),
		});
		const initial = label();
		state.set({
			title: 'Attempts', description: 'Select models.', summary: '10 Attempts', selectedModelIds: ['model'],
			multiple: true, maxSelections: 10, canGoBack: false, canGoNext: true, canFinish: false,
		}, undefined);
		const duringSetup = label();
		summary.set('3 Attempts', undefined);
		const committed = label();
		state.set(undefined, undefined);
		const dismissed = label();
		summary.set(undefined, undefined);
		assert.deepStrictEqual({ initial, duringSetup, committed, dismissed, reset: label() }, {
			initial: { text: 'First', compare: false, ariaLabel: 'Models, First' },
			duringSetup: { text: 'First', compare: false, ariaLabel: 'Models, First' },
			committed: { text: undefined, compare: true, ariaLabel: 'Models, 3 Attempts' },
			dismissed: { text: undefined, compare: true, ariaLabel: 'Models, 3 Attempts' },
			reset: { text: 'First', compare: false, ariaLabel: 'Models, First' },
		});
	});

	test('composer uses one compare icon and preserves variant names in its accessible label and hover', () => {
		const model = createModel('First');
		const { domNode, getHoverContents } = renderPicker(model, {
			compact: true,
			showModelIcon: true,
			comparison: upcastPartial<IModelPickerComparison>({
				available: constObservable(true),
				summary: constObservable('First, First Max'),
				state: constObservable(undefined),
			}),
		});

		assert.deepStrictEqual({
			label: domNode.querySelector('.chat-input-picker-label')?.textContent,
			compareIcons: domNode.querySelectorAll('.model-picker-name > .codicon-compare').length,
			icons: domNode.querySelectorAll('.model-picker-name > .codicon').length,
			ariaLabel: domNode.querySelector('.model-picker-name')?.getAttribute('aria-label'),
			hover: getHoverContents(),
		}, {
			label: undefined,
			compareIcons: 1,
			icons: 1,
			ariaLabel: 'Models, First, First Max',
			hover: 'Models • First, First Max',
		});
	});

	test('composer replaces the compare icon with progress in the same compact control', () => {
		const busy = observableValue('comparisonBusy', false);
		const { domNode, item } = renderPicker(createModel('First'), {
			compact: true,
			showModelIcon: true,
			comparisonBusy: busy,
			comparison: upcastPartial<IModelPickerComparison>({
				available: constObservable(true),
				summary: constObservable('3 Attempts'),
				state: constObservable(undefined),
			}),
		});
		const state = () => ({
			compare: domNode.querySelectorAll('.model-picker-name > .codicon-compare').length,
			loading: domNode.querySelectorAll('.model-picker-name > .codicon-loading-compact').length,
			busy: domNode.classList.contains('comparison-busy'),
			minimumWidth: item.minimumWidth,
			ariaLabel: domNode.querySelector('.model-picker-name')?.getAttribute('aria-label'),
		});
		const idle = state();
		busy.set(true, undefined);
		const sending = state();
		busy.set(false, undefined);

		assert.deepStrictEqual({ idle, sending, settled: state() }, {
			idle: { compare: 1, loading: 0, busy: false, minimumWidth: 22, ariaLabel: 'Models, 3 Attempts' },
			sending: { compare: 0, loading: 1, busy: true, minimumWidth: 22, ariaLabel: 'Models, 3 Attempts' },
			settled: { compare: 1, loading: 0, busy: false, minimumWidth: 22, ariaLabel: 'Models, 3 Attempts' },
		});
	});

	for (const presentation of [
		{ name: 'expanded', compact: false, minimal: false, showModelIcon: true },
		{ name: 'compact', compact: true, minimal: false, showModelIcon: true },
		{ name: 'minimal', compact: false, minimal: true, showModelIcon: true },
		{ name: 'without model icons', compact: false, minimal: false, showModelIcon: false },
	]) {
		test(`composer uses one compare icon for a distinct-model comparison (${presentation.name})`, () => {
			const first = createModel('First');
			const second = createModel('Second');
			const { domNode } = renderPicker(first, {
				compact: presentation.compact,
				minimal: presentation.minimal,
				models: [first, second],
				showModelIcon: presentation.showModelIcon,
				comparison: upcastPartial<IModelPickerComparison>({
					available: constObservable(true),
					summary: constObservable('First, Second'),
					state: constObservable(undefined),
				}),
			});

			assert.deepStrictEqual({
				compareIcons: domNode.querySelectorAll('.model-picker-name > .codicon-compare').length,
				icons: domNode.querySelectorAll('.model-picker-name > .codicon').length,
				label: domNode.querySelector('.chat-input-picker-label')?.textContent,
				ariaLabel: domNode.querySelector('.model-picker-name')?.getAttribute('aria-label'),
			}, {
				compareIcons: 1,
				icons: 1,
				label: undefined,
				ariaLabel: 'Models, First, Second',
			});
		});
	}

	test('hover describes the committed comparison instead of one model', () => {
		const { item } = renderPicker(createModel('First'), {
			comparison: upcastPartial<IModelPickerComparison>({
				available: constObservable(true),
				summary: constObservable('3 Attempts'),
				state: constObservable(undefined),
				label: 'Compare Models',
				startCommandId: 'test.compareModels',
			}),
			comparisonKeybindingLabel: 'Ctrl+Alt+M',
		});

		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers
		assert.strictEqual(item['_getHoverContents'](), 'Models • 3 Attempts\n\nCompare Models (Ctrl+Alt+M)');
	});

	test('hover advertises comparison without a shortcut when the command is unbound', () => {
		const { getHoverContents } = renderPicker(createModel('First'), {
			comparison: upcastPartial<IModelPickerComparison>({
				available: constObservable(true),
				summary: constObservable(undefined),
				state: constObservable(undefined),
				label: 'Compare Models',
				startCommandId: 'test.compareModels',
			}),
		});

		assert.strictEqual(getHoverContents(), 'Models • First\n\nCompare Models');
	});

	test('a chat on Copilot Fusion or a HydraFusion model shown as a Fusion tier names it in its label and describes Fusion in its hover', () => {
		const auto = createModel('auto');
		const fusion: ILanguageModelChatMetadataAndIdentifier = {
			...auto,
			metadata: {
				...auto.metadata, name: 'Copilot Fusion', autoModelFusion: true, autoModelProviderTiers: true,
				configurationSchema: { properties: { tier: { type: 'string', group: 'navigation', title: 'Effort Level', enum: ['balance', 'hydrafusion', 'hydrafusion-max'], enumItemLabels: ['Standard', 'High', 'Max'], default: 'balance' } } },
			},
		};
		const max = createModel('hydrafusion-max');
		const hydraFusionMax: ILanguageModelChatMetadataAndIdentifier = { ...max, metadata: { ...max.metadata, name: 'HydraFusion Max', modelGroup: { id: 'copilotcli' }, configurationSchema: undefined } };
		const read = (selected: ILanguageModelChatMetadataAndIdentifier) => {
			const { domNode, getHoverContents } = renderPicker(selected, { models: [fusion, hydraFusionMax] });
			const hover = getHoverContents();
			return {
				label: domNode.querySelector('.chat-input-picker-label')?.textContent,
				hover: isManagedHoverTooltipMarkdownString(hover) && isMarkdownString(hover.markdown) ? { markdown: hover.markdown.value, fallback: hover.markdownNotSupportedFallback } : hover,
			};
		};
		const description = 'Copilot Fusion selects a single model or orchestrates multiple models to complete your task.';
		const learnMore = '[Learn more](https://docs.github.com/en/early-access/copilot/hydrafusion)';
		assert.deepStrictEqual({ fusion: read(fusion), hydraFusionMax: read(hydraFusionMax) }, {
			fusion: {
				label: 'Copilot Fusion',
				hover: { markdown: `Models • Copilot Fusion\n\n${description} ${learnMore}`, fallback: `Models • Copilot Fusion\n\n${description}` },
			},
			hydraFusionMax: {
				label: 'Copilot Fusion',
				hover: { markdown: `Models • Copilot Fusion Max\n\n${description} ${learnMore}`, fallback: `Models • Copilot Fusion Max\n\n${description}` },
			},
		});
	});

	test('a directly selected on-device model reads "<model> · On-device", as in the Copilot CLI and app', () => {
		const model = createModel('MAI Code 1.1 Flash');
		const { domNode } = renderPicker({ ...model, metadata: { ...model.metadata, id: 'vscode-on-device/MAI-Code-1.1-Flash', targetChatSessionType: SessionType.AgentHostCopilot } });
		assert.deepStrictEqual({
			label: domNode.querySelector('.chat-input-picker-label')?.textContent,
			ariaLabel: domNode.querySelector('.model-picker-name')?.getAttribute('aria-label'),
		}, {
			label: 'MAI Code 1.1 Flash \u00b7 On-device',
			ariaLabel: 'Models, MAI Code 1.1 Flash \u00b7 On-device',
		});
	});

	test('includes the gap in the minimum width only when the configuration section is visible', () => {
		const model = createModel('A model name long enough to reach its minimum width');
		const states = [true, false].map(showConfiguration => {
			// Without configuration or a known context window there is nothing to read out.
			const picker = renderPicker(showConfiguration ? model : {
				...model,
				metadata: { ...model.metadata, configurationSchema: undefined, maxInputTokens: 0, maxOutputTokens: 0 },
			}, { itemWidth: 100 });
			const configuration = picker.domNode.querySelector<HTMLElement>('.model-picker-config')!;
			return {
				configurationVisible: configuration.offsetWidth > 0,
				minimumWidthBeyondSections: picker.minimumWidth - 90 - configuration.getBoundingClientRect().width,
			};
		});

		assert.deepStrictEqual(states, [
			{ configurationVisible: true, minimumWidthBeyondSections: 2 },
			{ configurationVisible: false, minimumWidthBeyondSections: 0 },
		]);
	});

	test('preserves fractional configuration widths when sizing a short model name', () => {
		const picker = renderPicker(createModel('o3'));

		assert.strictEqual(picker.minimumWidth, picker.name.width + picker.configuration.width + 2);
	});

	test('hovering either half highlights the full model picker', () => {
		const { domNode } = renderPicker(createModel('o3'));
		domNode.closest('.interactive-session')!.classList.add('monaco-workbench');
		domNode.style.setProperty('--vscode-toolbar-hoverBackground', '#123456');
		domNode.style.setProperty('--vscode-toolbar-activeBackground', '#654321');
		const buttons = Array.from(domNode.querySelectorAll<HTMLElement>('.model-picker-section'));
		const states = buttons.map(hoveredButton => {
			domNode.classList.add('hovered');
			hoveredButton.classList.add('hovered');
			const state = {
				group: mainWindow.getComputedStyle(domNode).backgroundColor,
				hovered: mainWindow.getComputedStyle(hoveredButton).backgroundColor,
				other: mainWindow.getComputedStyle(buttons.find(button => button !== hoveredButton)!).backgroundColor,
			};
			hoveredButton.classList.remove('hovered');
			domNode.classList.remove('hovered');
			return state;
		});
		assert.deepStrictEqual({
			states,
			atRest: mainWindow.getComputedStyle(domNode).backgroundColor,
		}, {
			states: buttons.map(() => ({ group: 'rgb(18, 52, 86)', hovered: 'rgb(101, 67, 33)', other: 'rgba(0, 0, 0, 0)' })),
			atRest: 'rgba(0, 0, 0, 0)',
		});
	});

	test('centers both model and configuration sections', () => {
		const picker = renderPicker(createModel('o3'));
		assert.deepStrictEqual({
			sections: picker.sections,
			gap: picker.configuration.left - picker.name.right,
		}, {
			sections: [{ padding: '0px 6px', height: 22 }, { padding: '0px 6px', height: 22 }],
			gap: 2,
		});
	});

	test('renders and opens the owned widget and disposes it with the action item', () => {
		const widgetElement = $('button');
		const anchors: (HTMLElement | undefined)[] = [];
		const contextViewLayers: (number | undefined)[] = [];
		const selections: string[] = [];
		const models: ILanguageModelChatMetadataAndIdentifier[] = [
			{ identifier: 'copilot:gpt', metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'gpt', isUserSelectable: true }) },
			{ identifier: 'openai:gpt', metadata: upcastPartial<ILanguageModelChatMetadata>({ id: 'gpt', isUserSelectable: false }) },
		];
		let enabled = true;
		let disposed = 0;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stubInstance(ModelPickerWidget, {
			onDidChangeSelection: Event.None,
			onDidChangeMinimumWidth: Event.None,
			domNode: widgetElement,
			nameButton: widgetElement,
			canOpenWithFilter: () => enabled,
			minimumWidth: 60,
			setSelectedModel: () => { },
			setCompact: () => { },
			setContextViewLayer: layer => contextViewLayers.push(layer),
			render: container => container.appendChild(widgetElement),
			show: anchor => anchors.push(anchor),
			dispose: () => disposed++,
		});
		const action: IAction = { id: 'test.modelPicker', label: '', tooltip: '', class: undefined, enabled: true, run: async () => { } };
		const delegate: IModelPickerDelegate = {
			currentModel: constObservable(undefined),
			setModel: model => selections.push(model.identifier),
			setModelProgrammatically: () => { },
			getModels: () => models,
			getPresentationOptions: () => ({
				showManageModelsAction: false,
				showUnavailableFeatured: false,
				showAutoModel: true,
				showModelIcon: true,
			}),
		};
		const item = disposables.add(new ModelPickerActionItem(
			action,
			delegate,
			{ compact: constObservable(false), contextViewLayer: 1 },
			instantiationService,
			new MockContextKeyService(),
			new MockKeybindingService(),
		));
		const first = $('div');
		const second = $('div');

		item.render(first);
		item.render(second);
		item.openModelPicker();
		item.show(second);
		assert.deepStrictEqual(selections, [], 'opening the picker does not select a model');
		const control = item.getModelPickerControl()!;
		const accepted = [control.select('copilot:gpt'), control.select('gpt'), control.select('openai:gpt')];
		enabled = false;
		accepted.push(control.select('copilot:gpt'));
		assert.deepStrictEqual({ accepted, selections, disabledControl: item.getModelPickerControl() }, {
			accepted: [true, false, false, false], selections: ['copilot:gpt'], disabledControl: undefined,
		});
		const rendered = { first: first.childElementCount, second: second.contains(widgetElement) };
		item.dispose();

		assert.deepStrictEqual({
			rendered,
			defaultAnchor: anchors[0] === widgetElement,
			explicitAnchor: anchors[1] === second,
			contextViewLayers,
			disposed,
		}, {
			rendered: { first: 0, second: true },
			defaultAnchor: true,
			explicitAnchor: true,
			contextViewLayers: [1],
			disposed: 1,
		});
	});

	test('sizes a short model name to its label rather than the minimum label width', () => {
		const expanded = renderPicker(createModel('o3'));
		// Narrower than the picker, so the name shrinks to its minimum width.
		const long = renderPicker(createModel('A model name long enough to be truncated'), { itemWidth: 100 });

		const spacing = (picker: typeof expanded) => ({
			spaceBeforeConfiguration: Math.floor(picker.configuration.left - picker.label.right),
			spaceAfterConfiguration: Math.floor(picker.container.right - picker.configuration.right),
		});
		assert.deepStrictEqual({
			expanded: spacing(expanded),
			long: {
				nameWidth: Math.floor(long.name.width),
				labelTruncated: long.labelTruncated,
			},
		}, {
			expanded: { spaceBeforeConfiguration: 8, spaceAfterConfiguration: 0 },
			long: { nameWidth: 90, labelTruncated: true },
		});
	});
});
