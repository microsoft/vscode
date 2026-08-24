/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { ChatAttachmentModel } from '../../../chat/browser/attachments/chatAttachmentModel.js';
import { IChatAttachmentResolveService } from '../../../chat/browser/attachments/chatAttachmentResolveService.js';
import { getAgentHostAttachmentRange } from '../../browser/inlineChatController.js';

suite('InlineChatController', () => {
	const store = new DisposableStore();
	let model: ITextModel;
	let attachmentModel: ChatAttachmentModel;

	setup(() => {
		model = store.add(createTextModel('first line\nsecond line\nthird line'));
		attachmentModel = store.add(new ChatAttachmentModel(
			new class extends mock<IFileService>() { },
			new class extends mock<ISharedWebContentExtractorService>() { },
			new class extends mock<IChatAttachmentResolveService>() { },
		));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the cursor line for empty Agent Host attachment selections', () => {
		const uri = URI.file('/test/target.ts');
		const entry = attachmentModel.asFileVariableEntry(uri, getAgentHostAttachmentRange(model, new Selection(2, 10, 2, 10)));

		assert.deepStrictEqual({
			attachment: isLocation(entry.value) ? entry.value : undefined,
			noSelection: getAgentHostAttachmentRange(model, null),
		}, {
			attachment: {
				uri,
				range: new Range(2, 1, 2, 12),
			},
			noSelection: undefined,
		});
	});

	test('preserves non-empty Agent Host attachment selections', () => {
		const selection = new Selection(3, 4, 1, 2);
		const uri = URI.file('/test/target.ts');

		assert.deepStrictEqual(
			attachmentModel.asFileVariableEntry(uri, getAgentHostAttachmentRange(model, selection)).value,
			{ uri, range: selection },
		);
	});
});
