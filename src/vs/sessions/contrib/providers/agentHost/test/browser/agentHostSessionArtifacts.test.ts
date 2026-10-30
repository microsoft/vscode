/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { fromAgentHostUri, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
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

	test('maps persisted Windows file paths without interpreting the drive as a URI scheme', () => {
		const fileUri = URI.file('C:/Users/test/.copilot/session-state/sdk-session/files/report.md');
		const authority = 'remote-host';
		const result = partitionSessionArtifacts(withSessionArtifacts(undefined, [
			{ id: 'backslashes', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: 'C:\\Users\\test\\.copilot\\session-state\\sdk-session\\files\\report.md' },
			{ id: 'slashes', type: SessionArtifactType.File, label: 'Report', isArtifact: false, uri: 'C:/Users/test/.copilot/session-state/sdk-session/files/report.md' },
			{ id: 'uri', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: fileUri.toString() },
		]), uri => toAgentHostUri(uri, authority));

		assert.deepStrictEqual(result.entries.map(({ artifact }) => ({ id: artifact.id, uri: artifact.uri?.toString() })), [
			{ id: 'uri', uri: toAgentHostUri(fileUri, authority).toString() },
			{ id: 'slashes', uri: toAgentHostUri(fileUri, authority).toString() },
			{ id: 'backslashes', uri: toAgentHostUri(fileUri, authority).toString() },
		]);
	});

	test('maps persisted UNC file paths while preserving their server authority', () => {
		const fileUri = URI.parse('file://server/share/report.md');
		const authority = 'remote-host';
		const result = partitionSessionArtifacts(withSessionArtifacts(undefined, [
			{ id: 'backslashes', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: '\\\\server\\share\\report.md' },
			{ id: 'slashes', type: SessionArtifactType.File, label: 'Report', isArtifact: false, uri: '//server/share/report.md' },
			{ id: 'uri', type: SessionArtifactType.File, label: 'Report', isArtifact: true, uri: fileUri.toString() },
		]), uri => toAgentHostUri(uri, authority));

		assert.deepStrictEqual(result.entries.map(({ artifact }) => ({
			id: artifact.id,
			uri: artifact.uri?.toString(),
			original: artifact.uri && fromAgentHostUri(artifact.uri).toString(),
		})), ['uri', 'slashes', 'backslashes'].map(id => ({
			id,
			uri: toAgentHostUri(fileUri, authority).toString(),
			original: fileUri.toString(),
		})));
	});

});
