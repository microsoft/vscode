/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
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
