/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IContextViewService } from '../../../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../../../platform/contextview/browser/contextViewService.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { IHoverService } from '../../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../../../../platform/layout/browser/layoutService.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { StateType } from '../../../../../../../../platform/update/common/update.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { ITabbedModelPickerContext, TabbedModelPicker } from '../../../../../browser/widget/input/modelPicker/modelPickerTabbedWidget.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../common/languageModels.js';
import '../../../../../browser/widget/input/modelPicker/media/modelPicker.css';

function createModel(id: string, vendor = 'copilot'): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${vendor}/${id}`,
		metadata: {
			extension: new ExtensionIdentifier('test.models'),
			id,
			name: id,
			vendor,
			version: '1.0',
			family: id,
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: {},
			configurationSchema: id === 'auto' ? {
				properties: {
					tier: { type: 'string', group: 'navigation', enum: ['eco', 'balanced', 'max'], default: 'balanced' },
				},
			} : undefined,
		},
	};
}

suite('TabbedModelPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const auto = createModel('auto');
	const manual = createModel('gpt-5');
	const local = createModel('local', 'ollama');

	function createPicker(selectedModelId = manual.identifier, models = [auto, manual, local]) {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILayoutService, upcastPartial<ILayoutService>({
			mainContainer: document.body,
			activeContainer: document.body,
			getContainer: () => document.body,
			onDidLayoutContainer: Event.None,
		}));
		const contextView = disposables.add(instantiationService.createInstance(ContextViewService));
		instantiationService.set(IContextViewService, contextView);
		instantiationService.set(IAccessibilityService, new TestAccessibilityService());
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		instantiationService.set(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ entitlement: ChatEntitlement.Free }));
		instantiationService.stub(ILanguageModelsService, upcastPartial<ILanguageModelsService>({
			getVendors: () => [
				{ vendor: 'copilot', displayName: 'GitHub Copilot', isDefault: true, configuration: undefined, managementCommand: undefined, when: undefined },
				{ vendor: 'ollama', displayName: 'Ollama', isDefault: false, configuration: undefined, managementCommand: undefined, when: undefined },
			],
			getLanguageModelGroups: () => [],
		}));
		const anchor = dom.append(document.body, dom.$('button'));
		anchor.style.cssText = 'position: fixed; top: 400px; left: 20px; width: 120px; height: 20px;';
		disposables.add(toDisposable(() => anchor.remove()));
		const picker = disposables.add(instantiationService.createInstance(TabbedModelPicker));
		const selections: string[] = [];
		let manageCount = 0;
		let context: ITabbedModelPickerContext = {
			models,
			selectedModelId,
			recentModelIds: [manual.identifier],
			pinnedModelIds: [],
			controlModels: {},
			configurationAccess: {
				getModelConfiguration: () => undefined,
				setModelConfiguration: async () => { },
				getModelConfigurationActions: () => [],
			},
			isUBB: false,
			showManageModels: true,
			unavailableContext: { show: false, currentVSCodeVersion: '1.140.0', manageSettingsUrl: undefined, updateStateType: StateType.Idle },
			onUnavailableLinkClick: () => { },
			providerPlaceholders: [],
			onSelect: model => {
				selections.push(model.identifier);
				context = { ...context, selectedModelId: model.identifier };
			},
			onTogglePin: undefined,
			onManageModels: () => { manageCount++; },
			onDidToggleOtherModels: () => { },
			onConfigurationChanged: () => { },
			cacheBreakHint: undefined,
		};
		picker.show(anchor, context);
		return {
			picker,
			selections,
			get manageCount() { return manageCount; },
			get popup() { return contextView.getContextViewElement().querySelector<HTMLElement>('.chat-model-picker-widget')!; },
			get body() { return this.popup.querySelector<HTMLElement>('.tabbed-action-list-body')!; },
			get toggle() { return this.popup.querySelector<HTMLButtonElement>('[role="switch"]')!; },
			reopen: () => { picker.hide(); picker.show(anchor, context); },
		};
	}

	test('Auto collapses the manual controls and restores the previous model without moving the footer', () => {
		const view = createPicker(local.identifier);
		const expandedHeight = view.popup.offsetHeight;
		const footerTop = view.toggle.getBoundingClientRect().top;
		view.toggle.click();
		const collapsed = {
			bodyHeight: view.body.offsetHeight,
			inert: view.body.inert,
			focused: dom.isActiveElement(view.toggle),
			footerStayedAnchored: Math.abs(view.toggle.getBoundingClientRect().top - footerTop) < 1,
		};
		view.toggle.click();

		assert.deepStrictEqual({
			collapsed,
			selections: view.selections,
			restoredHeight: view.popup.offsetHeight,
			footerStayedAnchored: Math.abs(view.toggle.getBoundingClientRect().top - footerTop) < 1,
			inert: view.body.inert,
			focused: dom.isActiveElement(view.toggle),
			visible: view.picker.isVisible,
		}, {
			collapsed: { bodyHeight: 0, inert: true, focused: true, footerStayedAnchored: true },
			selections: [auto.identifier, local.identifier],
			restoredHeight: expandedHeight,
			footerStayedAnchored: true,
			inert: false,
			focused: true,
			visible: true,
		});
	});

	test('opening with Auto selected focuses its switch and hides the manual controls', () => {
		const view = createPicker(auto.identifier);
		assert.deepStrictEqual({
			height: view.body.offsetHeight,
			inert: view.body.inert,
			focused: dom.isActiveElement(view.toggle),
			checked: view.toggle.getAttribute('aria-checked'),
			animations: view.body.getAnimations().length,
		}, { height: 0, inert: true, focused: true, checked: 'true', animations: 0 });
	});

	test('activating an Auto tier collapses the body without stealing tier focus', async () => {
		const view = createPicker();
		const tier = view.popup.querySelector<HTMLElement>('.chat-model-picker-auto-tiers [role="radio"]')!;
		tier.focus();
		tier.click();
		await timeout(0);

		assert.deepStrictEqual({
			selections: view.selections,
			height: view.body.offsetHeight,
			focused: dom.isActiveElement(tier),
			visible: view.picker.isVisible,
		}, { selections: [auto.identifier], height: 0, focused: true, visible: true });
	});

	test('collapsing and reopening preserves Auto, and expanding restores search', () => {
		const view = createPicker();
		view.popup.querySelector<HTMLElement>('[data-id="search"]')!.click();
		const input = view.popup.querySelector<HTMLInputElement>('input')!;
		input.value = 'local';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		view.toggle.click();
		view.toggle.click();
		const restoredSearch = view.popup.querySelector<HTMLInputElement>('input')?.value;
		view.toggle.click();
		view.reopen();

		assert.deepStrictEqual({
			restoredSearch,
			height: view.body.offsetHeight,
			inert: view.body.inert,
			focused: dom.isActiveElement(view.toggle),
		}, { restoredSearch: 'local', height: 0, inert: true, focused: true });
	});

	test('Auto-only accounts keep the provider controls reachable', () => {
		const view = createPicker(auto.identifier, [auto]);
		view.toggle.click();
		const checked = view.toggle.getAttribute('aria-checked');
		const inert = view.body.inert;
		view.popup.querySelector<HTMLElement>('[data-id="addProvider"]')!.click();

		assert.deepStrictEqual({
			checked,
			inert,
			selections: view.selections,
			manageCount: view.manageCount,
		}, { checked: 'true', inert: false, selections: [], manageCount: 1 });
	});

	test('pickers without Auto leave the model controls expanded', () => {
		const view = createPicker(manual.identifier, [manual]);
		assert.deepStrictEqual({
			expanded: view.body.offsetHeight > 0,
			inert: view.body.inert,
			hasFooter: !!view.popup.querySelector('.tabbed-action-list-footer'),
		}, { expanded: true, inert: false, hasFooter: false });
	});
});
