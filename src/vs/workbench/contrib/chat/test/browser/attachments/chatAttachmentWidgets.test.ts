/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { isCopilotPreviewFeaturesDisabledForModel } from '../../../browser/attachments/chatAttachmentWidgets.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';

function createModel(vendor: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		metadata: {
			vendor,
		},
	} as ILanguageModelChatMetadataAndIdentifier;
}

suite('chatAttachmentWidgets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies disabled Copilot preview features only to Copilot models', () => {
		assert.strictEqual(isCopilotPreviewFeaturesDisabledForModel(createModel(COPILOT_VENDOR_ID), true), true);
		assert.strictEqual(isCopilotPreviewFeaturesDisabledForModel(createModel('custom-vendor'), true), false);
	});

	test('does not disable image attachments without a disabled Copilot preview policy', () => {
		assert.strictEqual(isCopilotPreviewFeaturesDisabledForModel(createModel(COPILOT_VENDOR_ID), false), false);
		assert.strictEqual(isCopilotPreviewFeaturesDisabledForModel(createModel(COPILOT_VENDOR_ID), undefined), false);
		assert.strictEqual(isCopilotPreviewFeaturesDisabledForModel(undefined, true), false);
	});
});
