/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { fromAgentHostUri, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { type ISessionFileDiff } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { diffsToChanges } from '../../browser/agentHostDiffs.js';

suite('AgentHostDiffs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps deleted git blob content URI to label-friendly Agent Host URI', () => {
		const repoRelativePath = 'src/deleted.ts';
		const originalContentUri = URI.from({
			scheme: 'git-blob',
			authority: encodeHex(VSBuffer.fromString('session-db://session-123')),
			path: `/abc123/${encodeHex(VSBuffer.fromString(repoRelativePath))}/deleted.ts`,
		});
		const diff: ISessionFileDiff = {
			before: {
				uri: `file:///workspaces/demo/${repoRelativePath}`,
				content: { uri: originalContentUri.toString() },
			},
			diff: { added: 0, removed: 10 },
		};

		const [change] = diffsToChanges([diff], uri => toAgentHostUri(uri, 'remotehost'));

		assert.deepStrictEqual({
			uri: change.uri.toString(),
			originalUri: change.originalUri?.toString(),
			originalPath: change.originalUri?.path,
			originalQuery: change.originalUri?.query,
			modifiedUri: change.modifiedUri?.toString(),
			unwrappedOriginalUri: change.originalUri && fromAgentHostUri(change.originalUri).toString(),
		}, {
			uri: 'vscode-agent-host://remotehost/file/-/workspaces/demo/src/deleted.ts',
			originalUri: `vscode-agent-host://remotehost/git-blob/${encodeHex(VSBuffer.fromString('session-db://session-123'))}/src/deleted.ts?original%3Dgit-blob%253A%252F%252F73657373696f6e2d64623a2f2f73657373696f6e2d313233%252Fabc123%252F7372632f64656c657465642e7473%252Fdeleted.ts`,
			originalPath: `/git-blob/${encodeHex(VSBuffer.fromString('session-db://session-123'))}/src/deleted.ts`,
			originalQuery: 'original=git-blob%3A%2F%2F73657373696f6e2d64623a2f2f73657373696f6e2d313233%2Fabc123%2F7372632f64656c657465642e7473%2Fdeleted.ts',
			modifiedUri: undefined,
			unwrappedOriginalUri: originalContentUri.toString(),
		});
	});
});
