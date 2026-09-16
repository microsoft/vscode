/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { partitionSessionArtifacts } from '../../browser/agentHostSessionArtifacts.js';

suite('Agent Host Session Artifacts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps host file URIs while preserving resource URIs', () => {
		const fileUri = URI.file('/remote/artifacts/report.png');
		const resourceUri = URI.parse('https://example.com/report');
		const connectionAuthority = 'remote-host';
		const result = partitionSessionArtifacts(withSessionArtifacts(undefined, [
			{ id: 'file', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: fileUri.toString() },
			{ id: 'resource', type: SessionArtifactType.Resource, label: 'Dashboard', isArtifact: true, uri: resourceUri.toString() },
		]), uri => toAgentHostUri(uri, connectionAuthority));

		assert.deepStrictEqual(Object.fromEntries(result.entries.map(({ artifact }) => [artifact.id, artifact.uri?.toString()])), {
			resource: resourceUri.toString(),
			file: toAgentHostUri(fileUri, connectionAuthority).toString(),
		});
	});
});
