/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { IAction } from '../../../../../../../../base/common/actions.js';
import { Event } from '../../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
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
import { IModelPickerWorkflow, IModelPickerWorkflowState } from '../../../../../browser/widget/input/modelPicker/modelPickerWorkflow.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../common/languageModels.js';
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
	 * name followed by its thinking effort / context size readout. The name has
	 * no icon, so it keeps its label even when the picker is compact.
	 */
	function renderPicker(model: ILanguageModelChatMetadataAndIdentifier, options: { readonly compact?: boolean; readonly itemWidth?: number; readonly workflow?: IModelPickerWorkflow } = {}) {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, {});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override getLanguageModelIds() { return [model.identifier]; }
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
		instantiationService.stub(IConfigurationService, new TestConfigurationService());

		const action: IAction = { id: 'test.modelPicker', label: '', tooltip: '', class: undefined, enabled: true, run: async () => { } };
		const delegate: IModelPickerDelegate = {
			workflow: options.workflow,
			currentModel: constObservable(model),
			setModel: () => { },
			setModelProgrammatically: () => { },
			getModels: () => [model],
			getPresentationOptions: () => ({
				showManageModelsAction: false,
				showUnavailableFeatured: false,
				showAutoModel: true,
				showModelIcon: false,
			}),
		};
		const item = disposables.add(new ModelPickerActionItem(
			action,
			delegate,
			{ compact: constObservable(options.compact ?? false) },
			instantiationService,
			new MockContextKeyService(),
			new MockKeybindingService(),
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
		item.render(container);

		const name = container.querySelector<HTMLElement>('.model-picker-name')!;
		const label = name.querySelector<HTMLElement>('.chat-input-picker-label')!;
		const configuration = container.querySelector<HTMLElement>('.model-picker-config')!;
		return {
			domNode: container.querySelector<HTMLElement>('.model-picker-split')!,
			minimumWidth: item.minimumWidth,
			container: container.getBoundingClientRect(),
			name: name.getBoundingClientRect(),
			label: label.getBoundingClientRect(),
			labelTruncated: label.scrollWidth > label.clientWidth,
			configuration: configuration.getBoundingClientRect(),
			sections: [name, configuration].map(button => ({
				padding: mainWindow.getComputedStyle(button).padding,
				height: button.getBoundingClientRect().height,
			})),
		};
	}

	test('composer label follows committed workflow summary, not working selections', () => {
		const summary = observableValue<string | undefined>('summary', undefined);
		const state = observableValue<IModelPickerWorkflowState | undefined>('draft', undefined);
		const { domNode } = renderPicker(createModel('First'), {
			workflow: upcastPartial<IModelPickerWorkflow>({ available: constObservable(true), summary, state }),
		});
		const label = () => domNode.querySelector('.chat-input-picker-label')?.textContent;
		const initial = label();
		state.set({
			title: 'Attempts', description: 'Select models.', summary: '10 Attempts', selectedModelIds: ['model'],
			multiple: true, maxSelections: 10, canGoBack: false, canGoNext: true, canFinish: false,
		}, undefined);
		const duringSetup = label();
		summary.set('3 Attempts', undefined);
		const committed = label();
		state.set(undefined, undefined);
		assert.deepStrictEqual({ initial, duringSetup, committed, dismissed: label() }, {
			initial: 'First', duringSetup: 'First', committed: '3 Attempts', dismissed: '3 Attempts',
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
