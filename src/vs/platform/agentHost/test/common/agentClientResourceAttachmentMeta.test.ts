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

	test('retains ownership only with client-held proof for the unchanged attachment URI', () => {
		const original: MessageResourceAttachment = { type: MessageAttachmentKind.Resource, uri: 'file:///source/a.ts', label: 'a.ts', _meta: { opaque: false } };
		const attachment = withClientResourceAttachment(original, 'client');
		const tokens = new Map([[original.uri, 'client']]);
		assert.deepStrictEqual({
			original,
			opaque: attachment._meta?.opaque,
			owner: readClientResourceAttachmentUri(attachment, tokens),
			other: readClientResourceAttachmentUri(attachment, new Map([[original.uri, 'other']])),
			missing: readClientResourceAttachmentUri(attachment, undefined),
			snapshot: readClientResourceAttachmentUri({ ...attachment, uri: 'file:///attachments/snapshot.ts' }, tokens),
			fabricated: readClientResourceAttachmentUri(withClientResourceAttachment({ ...original, uri: 'file:///secret/key' }, 'client'), tokens),
			invalid: [undefined, null, [], 'client', { token: 'client', uri: 123 }].map(metadata => readClientResourceAttachmentUri({
				...original, _meta: { 'vscode.agentHost.clientResourceAttachment': metadata },
			}, tokens)),
		}, {
			original: { type: MessageAttachmentKind.Resource, uri: 'file:///source/a.ts', label: 'a.ts', _meta: { opaque: false } },
			opaque: false,
			owner: 'file:///source/a.ts',
			other: undefined,
			missing: undefined,
			snapshot: undefined,
			fabricated: undefined,
			invalid: [undefined, undefined, undefined, undefined, undefined],
		});
	});
});
