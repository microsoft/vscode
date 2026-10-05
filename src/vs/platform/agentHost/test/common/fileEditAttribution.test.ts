/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildCancelEditAttributionResource, buildCommitEditAttributionResource, buildPrepareEditAttributionResource, FILE_EDIT_ATTRIBUTION_PROPERTY, getFileEditAttributionMarker, parseEditAttributionResource } from '../../common/fileEditAttribution.js';
import { ToolResultContentType } from '../../common/state/sessionState.js';

suite('File Edit Attribution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips prepare and commit resource requests', () => {
		const prepare = {
			resource: URI.file('C:\\repo\\file.ts'),
			trigger: 'hashChange',
			statsUuid: 'stats-1',
			isDirty: false,
			flushToken: 'flush-1',
			languageId: 'typescript',
		} as const;
		const commit = {
			flushToken: 'flush-1',
			totalModifiedCount: 42,
		};
		const cancel = { flushToken: 'flush-1' };

		const parsedPrepare = parseEditAttributionResource(buildPrepareEditAttributionResource(prepare));
		assert.deepStrictEqual({
			prepare: parsedPrepare?.kind === 'prepare' ? {
				kind: parsedPrepare.kind,
				resource: parsedPrepare.params.resource.toString(),
				trigger: parsedPrepare.params.trigger,
				statsUuid: parsedPrepare.params.statsUuid,
				isDirty: parsedPrepare.params.isDirty,
				flushToken: parsedPrepare.params.flushToken,
				languageId: parsedPrepare.params.languageId,
			} : parsedPrepare,
			commit: parseEditAttributionResource(buildCommitEditAttributionResource(commit)),
			cancel: parseEditAttributionResource(buildCancelEditAttributionResource(cancel)),
		}, {
			prepare: {
				kind: 'prepare',
				resource: prepare.resource.toString(),
				trigger: prepare.trigger,
				statsUuid: prepare.statsUuid,
				isDirty: prepare.isDirty,
				flushToken: prepare.flushToken,
				languageId: prepare.languageId,
			},
			commit: { kind: 'commit', params: commit },
			cancel: { kind: 'cancel', params: cancel },
		});
	});

	test('accepts optional chat identity but rejects malformed chat metadata', () => {
		const results = [undefined, 'hashed-chat-id', 42].map(chatSessionId => {
			const content = {
				type: ToolResultContentType.FileEdit,
				[FILE_EDIT_ATTRIBUTION_PROPERTY]: {
					version: 1,
					editId: 'edit-1',
					sequence: 1,
					beforeDigest: 'before',
					afterDigest: 'after',
					source: { conversationId: 'session-1', chatSessionId, requestId: 'turn-1', harness: 'copilotcli' },
				},
			} as const;
			return !!getFileEditAttributionMarker(content);
		});
		assert.deepStrictEqual(results, [true, true, false]);
	});
});
