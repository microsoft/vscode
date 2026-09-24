/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ModelPickerActionItem } from '../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionContext, SessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ModelPicker } from '../../browser/modelPicker.js';
import { INewChatModelPickerService, NewChatModelPickerService } from '../../browser/newChatModelPicker.js';
import { ISessionModelSelection } from '../../browser/sessionModelSelection.js';
import { createModelSelectionState, EMPTY_MODEL_SELECTION_STATE, hasSelectableModel, hasSendableModelSelection, normalizeModelPickerOptions } from '../../browser/sessionModelPickerState.js';

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

suite('ModelPicker controls', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('exposes the rendered picker and its existing operations without a session', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const modelPickers = new NewChatModelPickerService();
		const selectedModels: string[] = [];
		let opens = 0;
		let disposed = 0;
		instantiationService.stub(ISessionContext, new SessionContext(constObservable(undefined)));
		instantiationService.stub(ISessionModelSelection, {
			state: constObservable(EMPTY_MODEL_SELECTION_STATE),
			selectModel: id => { selectedModels.push(id); return true; },
		});
		instantiationService.stub(ITelemetryService, {});
		instantiationService.stub(IChatPetService, {});
		instantiationService.stub(INewChatModelPickerService, modelPickers);
		instantiationService.stub(IWorkspaceTrustManagementService, {
			onDidChangeTrust: Event.None,
			workspaceTrustInitialized: Promise.resolve(),
		});
		instantiationService.stub(IChatEntitlementService, {
			onDidChangeEntitlement: Event.None,
			onDidChangeSentiment: Event.None,
			onDidChangeAnonymous: Event.None,
		});
		instantiationService.stubInstance(ModelPickerActionItem, {
			render: () => { },
			openModelPicker: () => opens++,
			setEnabled: () => { },
			isRestrictedMode: () => false,
			isSetupRequired: () => false,
			dispose: () => disposed++,
		});
		const picker = disposables.add(instantiationService.createInstance(ModelPicker, constObservable(false)));
		const control = modelPickers.activePicker;
		assert.ok(control);
		const beforeRender = control.getDomNode();
		const first = document.createElement('div');
		const second = document.createElement('div');
		picker.render(first);
		const firstMatches = control.getDomNode() === first;
		picker.render(second);
		control.open();
		const switched = control.switchToModel('vendor/model');
		const secondMatches = control.getDomNode() === second;
		picker.dispose();

		assert.deepStrictEqual({
			beforeRender, firstMatches, secondMatches, opens, switched, selectedModels, disposed,
			activePicker: modelPickers.activePicker,
		}, {
			beforeRender: undefined, firstMatches: true, secondMatches: true, opens: 1, switched: true,
			selectedModels: ['vendor/model'], disposed: 1, activePicker: undefined,
		});
	});
});
