/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { Menus } from '../../../../browser/menus.js';
import { IsPhoneLayoutContext, SessionUsesCombinedConfigPickerContext } from '../../../../common/contextkeys.js';
import { ModelPicker, ModelPickerActionViewItem } from '../../browser/modelPicker.js';
import { createModelSelectionState, hasSelectableModel, hasSendableModelSelection, normalizeModelPickerOptions } from '../../browser/sessionModelPickerState.js';

const aModel = { identifier: 'copilot-gpt-4o', metadata: {} } as ILanguageModelChatMetadataAndIdentifier;

suite('ModelPicker selectability', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns true when models are available', () => {
		assert.strictEqual(hasSelectableModel([aModel], normalizeModelPickerOptions({
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: false,
			showManageModelsAction: false,
			showAutoModel: false,
		})), true);
	});

	test('returns false when empty and Auto is unavailable', () => {
		assert.strictEqual(hasSelectableModel([], normalizeModelPickerOptions({
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: false,
			showManageModelsAction: false,
			showAutoModel: false,
		})), false);
	});

	test('returns true when empty and Auto support is omitted', () => {
		assert.strictEqual(hasSelectableModel([], normalizeModelPickerOptions({
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: false,
			showManageModelsAction: false,
		})), true);
	});

	test('allows an unresolved selection only when Auto is available', () => {
		const pendingSelection = { reference: 'pending-model' };
		const options = {
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: false,
			showManageModelsAction: false,
		};
		const autoOptions = normalizeModelPickerOptions({ ...options, showAutoModel: true });
		const explicitModelOptions = normalizeModelPickerOptions({ ...options, showAutoModel: false });

		assert.deepStrictEqual({
			auto: hasSendableModelSelection(createModelSelectionState([], autoOptions, undefined, pendingSelection)),
			explicitModel: hasSendableModelSelection(createModelSelectionState([], explicitModelOptions, undefined, pendingSelection)),
		}, {
			auto: true,
			explicitModel: false,
		});
	});
});

suite('ModelPicker automation toolbar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes the model picker inside the automation prompt with AI and phone gating', () => {
		const item = MenuRegistry.getMenuItems(Menus.AutomationsDialogInputToolbar).find(item => isIMenuItem(item) && item.command.id === 'sessions.modelPicker');
		assert.ok(item && isIMenuItem(item));
		const context = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const enabledKey = ChatContextKeys.enabled.bindTo(context);
		const inDialogKey = ChatContextKeys.inAutomationsDialog.bindTo(context);
		const phoneKey = IsPhoneLayoutContext.bindTo(context);
		const combinedKey = SessionUsesCombinedConfigPickerContext.bindTo(context);
		const visible = (enabled: boolean, inDialog: boolean, phone: boolean, combined: boolean) => {
			enabledKey.set(enabled);
			inDialogKey.set(inDialog);
			phoneKey.set(phone);
			combinedKey.set(combined);
			return context.contextMatchesRules(item.when);
		};
		assert.deepStrictEqual({
			desktop: visible(true, true, false, true),
			phone: visible(true, true, true, false),
			combinedPhone: visible(true, true, true, true),
			aiDisabled: visible(false, true, false, false),
			outsideDialog: visible(true, false, false, false),
		}, {
			desktop: true,
			phone: true,
			combinedPhone: false,
			aiDisabled: false,
			outsideDialog: false,
		});
	});

	test('preserves responsive state and opens the registered model picker from its anchor', () => {
		const compact = observableValue('compact', false);
		const anchor = document.createElement('div');
		let openedAt: HTMLElement | undefined;
		const picker = new class extends mock<ModelPicker>() {
			override show(element?: HTMLElement): void { openedAt = element; }
			override dispose(): void { }
		}();
		const item = disposables.add(new ModelPickerActionViewItem(picker, compact));
		item.setCompact(true);
		item.show(anchor);
		assert.deepStrictEqual({ compact: compact.get(), itemCompact: item.isCompact(), openedAt }, {
			compact: true, itemCompact: true, openedAt: anchor,
		});
	});
});
