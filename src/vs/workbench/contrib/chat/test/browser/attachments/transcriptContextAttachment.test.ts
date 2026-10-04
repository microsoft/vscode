/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../../platform/opener/common/opener.js';
import { openTranscriptContextAttachment } from '../../../browser/attachments/chatAttachmentWidgets.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../common/attachments/chatVariableEntries.js';

suite('TranscriptContextAttachment', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens the attachment URI externally', async () => {
		const calls: { resource: string; options: OpenInternalOptions | OpenExternalOptions | undefined }[] = [];
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: URI | string, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				calls.push({ resource: resource.toString(), options });
				return true;
			}
		}();
		const attachment: IChatRequestTranscriptContextVariableEntry = {
			kind: 'transcriptContext',
			id: 'pr',
			name: '#42 Improve sessions',
			value: '{"number":42}',
			uri: URI.parse('https://github.com/owner/repo/pull/42'),
		};

		await openTranscriptContextAttachment(openerService, attachment);

		assert.deepStrictEqual(calls, [{
			resource: 'https://github.com/owner/repo/pull/42',
			options: { openExternal: true },
		}]);
	});
});
