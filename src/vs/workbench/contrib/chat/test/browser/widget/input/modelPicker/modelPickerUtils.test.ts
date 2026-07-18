/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../../platform/extensions/common/extensions.js';
import { isAutoModel } from '../../../../../browser/widget/input/modelPicker/modelPickerUtils.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../common/languageModels.js';

function model(identifier: string, metadataId: string): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier,
		metadata: {
			extension: new ExtensionIdentifier('test.extension'),
			id: metadataId,
			name: identifier,
			vendor: 'copilot',
			version: '1.0',
			family: 'test',
			maxInputTokens: 1,
			maxOutputTokens: 1,
			isDefaultForLocation: {},
		},
	};
}

suite('ModelPickerUtils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses canonical Auto model detection', () => {
		assert.deepStrictEqual({
			metadataAuto: isAutoModel(model('provider/other', 'auto')),
			canonicalIdentifier: isAutoModel(model('copilot/auto', 'missing-auto-id')),
			ordinary: isAutoModel(model('copilot/gpt', 'gpt')),
		}, {
			metadataAuto: true,
			canonicalIdentifier: true,
			ordinary: false,
		});
	});
});