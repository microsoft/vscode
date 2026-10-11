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

	test('maps host file artifact and reference URIs while preserving resource URIs', () => {
		const artifactFileUri = URI.file('/remote/artifacts/report.png');
		const referenceFileUri = URI.file('/remote/references/input.png');
		const resourceUri = URI.parse('https://example.com/report');
		const connectionAuthority = 'remote-host';
		const result = partitionSessionArtifacts(withSessionArtifacts(undefined, [
			{ id: 'artifact-file', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: artifactFileUri.toString() },
			{ id: 'reference-file', type: SessionArtifactType.File, label: 'Input', isArtifact: false, uri: referenceFileUri.toString() },
			{ id: 'resource', type: SessionArtifactType.Resource, label: 'Dashboard', isArtifact: true, uri: resourceUri.toString() },
		]), uri => toAgentHostUri(uri, connectionAuthority));

		assert.deepStrictEqual(Object.fromEntries(result.entries.map(({ artifact }) => [artifact.id, artifact.uri?.toString()])), {
			resource: resourceUri.toString(),
			'reference-file': toAgentHostUri(referenceFileUri, connectionAuthority).toString(),
			'artifact-file': toAgentHostUri(artifactFileUri, connectionAuthority).toString(),
		});
	});

	test('preserves each artifact owner in the session-wide projection', () => {
		const defaultChat = URI.parse('remote-chat:/session/default');
		const peerChat = URI.parse('remote-chat:/session/peer');
		const result = partitionSessionArtifacts(withSessionArtifacts(undefined, [
			{ id: 'default', type: SessionArtifactType.Website, label: 'Default', isArtifact: true, link: 'https://example.com/default', chat: defaultChat.toString() },
			{ id: 'peer', type: SessionArtifactType.Website, label: 'Peer', isArtifact: true, link: 'https://example.com/peer', chat: peerChat.toString() },
		]));

		assert.deepStrictEqual(result.entries.map(({ artifact }) => ({ id: artifact.id, chat: artifact.chat?.toString() })), [
			{ id: 'peer', chat: peerChat.toString() },
			{ id: 'default', chat: defaultChat.toString() },
		]);
	});

});
