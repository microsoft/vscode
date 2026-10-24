/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readClientResourceAttachmentUri, withClientResourceAttachment } from '../../common/meta/agentClientResourceAttachmentMeta.js';
import { MessageAttachmentKind, type MessageResourceAttachment } from '../../common/state/protocol/state.js';

suite('AgentClientResourceAttachmentMeta', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('retains ownership only for the originating client and unchanged attachment URI', () => {
		const original: MessageResourceAttachment = { type: MessageAttachmentKind.Resource, uri: 'file:///source/a.ts', label: 'a.ts', _meta: { opaque: false } };
		const attachment = withClientResourceAttachment(original, 'client');
		assert.deepStrictEqual({
			original,
			opaque: attachment._meta?.opaque,
			owner: readClientResourceAttachmentUri(attachment, 'client'),
			other: readClientResourceAttachmentUri(attachment, 'other'),
			missing: readClientResourceAttachmentUri(attachment, undefined),
			snapshot: readClientResourceAttachmentUri({ ...attachment, uri: 'file:///attachments/snapshot.ts' }, 'client'),
			invalid: [undefined, null, [], 'client', { clientId: 'client', uri: 123 }].map(metadata => readClientResourceAttachmentUri({
				...original, _meta: { 'vscode.agentHost.clientResourceAttachment': metadata },
			}, 'client')),
		}, {
			original: { type: MessageAttachmentKind.Resource, uri: 'file:///source/a.ts', label: 'a.ts', _meta: { opaque: false } },
			opaque: false,
			owner: 'file:///source/a.ts',
			other: undefined,
			missing: undefined,
			snapshot: undefined,
			invalid: [undefined, undefined, undefined, undefined, undefined],
		});
	});
});
