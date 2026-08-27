/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SESSION_META_ARTIFACTS_KEY } from '../../common/sessionArtifacts.js';
import { SESSION_META_CREATED_BY_SESSION_KEY, SESSION_META_EHCLI_ADOPTABLE_KEY, SESSION_META_EHCLI_ADOPTED_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_GIT_KEY, SESSION_META_GITHUB_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, SESSION_META_WORKSPACELESS_KEY } from '../../common/state/sessionState.js';
import {
	AGENT_HOST_CATALOG_ARTIFACT_LIMIT,
	AGENT_HOST_CATALOG_CHILD_LIMIT,
	AGENT_HOST_CATALOG_PAYLOAD_VERSION,
	AgentHostCatalogData,
	decodeAgentHostCatalogPayload,
	encodeAgentHostCatalogPayload,
	hashAgentHostCatalogPayload,
	reviveAgentHostCatalogData,
} from '../../node/agentHostCatalogProjection.js';

function createData(): AgentHostCatalogData {
	return {
		modifiedTime: 1720000000000,
		summary: 'Implement opaque catalog payload',
		titleSource: 'user',
		isRead: true,
		isArchived: false,
		project: {
			uri: 'file:///workspace',
			displayName: 'workspace',
		},
		isChatBacking: false,
		workingDirectories: ['file:///workspace', 'file:///workspace/secondary'],
		changes: {
			additions: 12,
			deletions: 4,
			files: 2,
		},
		_meta: {
			[SESSION_META_MULTI_ROOT_KEY]: {
				workspaceFile: 'file:///workspace/project.code-workspace',
			},
			[SESSION_META_FOLDER_PICKER_KEY]: {
				hidden: true,
				primary: 'file:///workspace',
			},
			[SESSION_META_GITHUB_KEY]: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				issueUrls: ['https://github.com/microsoft/vscode/issues/2'],
			},
			[SESSION_META_GIT_KEY]: {
				hasGitHubRemote: true,
				branchName: 'feature/catalog',
				incomingChanges: 2,
			},
			[SESSION_META_SOURCE_CONTROL_KEY]: {
				merge: { commit: '0123456789abcdef' },
				latestOutcome: 'merge',
			},
			[SESSION_META_ARTIFACTS_KEY]: [{
				id: 'artifact-1',
				type: 'pullRequest',
				label: 'Catalog payload',
				isArtifact: true,
				link: 'https://github.com/microsoft/vscode/pull/1',
			}],
			[SESSION_META_CREATED_BY_SESSION_KEY]: {
				session: 'agent-session://test/parent',
				chat: 'agent-chat://test/parent/default',
				turnId: 'turn-1',
			},
			[SESSION_META_WORKSPACELESS_KEY]: true,
			[SESSION_META_EHCLI_ADOPTABLE_KEY]: true,
			[SESSION_META_EHCLI_ADOPTED_KEY]: true,
		},
		chats: [{
			uri: 'agent-chat://test/session/default',
			order: 0,
			kind: 'default',
			summary: 'Main',
			titleSource: 'auto',
			origin: { kind: 'default', metadata: { b: 2, a: 1 } },
		}, {
			uri: 'agent-chat://test/session/peer',
			order: 1,
			kind: 'peer',
			summary: 'Peer',
			titleSource: 'agent',
			origin: { kind: 'subagent' },
		}],
	};
}

function encode(data: AgentHostCatalogData = createData()) {
	const result = encodeAgentHostCatalogPayload(data);
	assert.strictEqual(result.ok, true);
	return result.value;
}

suite('AgentHostCatalogProjection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('derives the data type from validators and round trips canonical payload and hash', () => {
		const typedData: AgentHostCatalogData = createData();
		const encoded = encode(typedData);
		const decoded = decodeAgentHostCatalogPayload(encoded.payload);

		assert.deepStrictEqual({
			decoded,
			payload: encoded.payload,
			hash: encoded.payloadHash,
		}, {
			decoded: {
				ok: true,
				value: { data: typedData, payload: encoded.payload },
			},
			payload: '{"data":{"_meta":{"agentHost/createdBySession":{"chat":"agent-chat://test/parent/default","session":"agent-session://test/parent","turnId":"turn-1"},"agentHost/sessionArtifacts":[{"id":"artifact-1","isArtifact":true,"label":"Catalog payload","link":"https://github.com/microsoft/vscode/pull/1","type":"pullRequest"}],"ehcliAdoptable":true,"ehcliAdopted":true,"git":{"branchName":"feature/catalog","hasGitHubRemote":true,"incomingChanges":2},"github":{"issueUrls":["https://github.com/microsoft/vscode/issues/2"],"owner":"microsoft","pullRequestUrls":["https://github.com/microsoft/vscode/pull/1"],"repo":"vscode"},"multiRoot":{"workspaceFile":"file:///workspace/project.code-workspace"},"vscode.folderPicker":{"hidden":true,"primary":"file:///workspace"},"vscode.sourceControl":{"latestOutcome":"merge","merge":{"commit":"0123456789abcdef"}},"workspaceless":true},"changes":{"additions":12,"deletions":4,"files":2},"chats":[{"kind":"default","order":0,"origin":{"kind":"default","metadata":{"a":1,"b":2}},"summary":"Main","titleSource":"auto","uri":"agent-chat://test/session/default"},{"kind":"peer","order":1,"origin":{"kind":"subagent"},"summary":"Peer","titleSource":"agent","uri":"agent-chat://test/session/peer"}],"isArchived":false,"isChatBacking":false,"isRead":true,"modifiedTime":1720000000000,"project":{"displayName":"workspace","uri":"file:///workspace"},"summary":"Implement opaque catalog payload","titleSource":"user","workingDirectories":["file:///workspace","file:///workspace/secondary"]},"payloadVersion":1}',
			hash: hashAgentHostCatalogPayload(encoded.payload),
		});
	});

	test('normalizes order and strips unknown properties without a SQL schema change', () => {
		const source = JSON.parse(encode().payload);
		source.futureEnvelopeField = 'ignored';
		source.data.futureOptionalPayloadField = { nested: true };
		source.data.project.futureProjectField = 'ignored';
		source.data._meta.futureMetaKey = { nested: true };
		source.data.chats.reverse();

		const decoded = decodeAgentHostCatalogPayload(JSON.stringify(source));

		assert.strictEqual(decoded.ok, true);
		assert.deepStrictEqual({
			hasFutureEnvelopeField: decoded.value.payload.includes('futureEnvelopeField'),
			hasFuturePayloadField: decoded.value.payload.includes('futureOptionalPayloadField'),
			hasFutureProjectField: decoded.value.payload.includes('futureProjectField'),
			hasFutureMetaKey: decoded.value.payload.includes('futureMetaKey'),
			chatOrder: decoded.value.data.chats.map(chat => chat.order),
		}, {
			hasFutureEnvelopeField: false,
			hasFuturePayloadField: false,
			hasFutureProjectField: false,
			hasFutureMetaKey: false,
			chatOrder: [0, 1],
		});

		test('retains detached-head state and the newest bounded artifact suffix', () => {
			const data = createData();
			const artifacts = Array.from({ length: AGENT_HOST_CATALOG_ARTIFACT_LIMIT + 2 }, (_, index) => ({
				id: `artifact-${index}`,
				type: 'file' as const,
				label: `Artifact ${index}`,
				uri: index === AGENT_HOST_CATALOG_ARTIFACT_LIMIT + 1 ? `src/${index}.ts` : `file:///workspace/${index}`,
			}));
			const encoded = encode({
				...data,
				_meta: {
					...data._meta,
					[SESSION_META_GIT_KEY]: { isDetachedHead: true },
					[SESSION_META_ARTIFACTS_KEY]: artifacts,
				},
			});

			assert.deepStrictEqual({
				git: encoded.data._meta?.[SESSION_META_GIT_KEY],
				artifacts: encoded.data._meta?.[SESSION_META_ARTIFACTS_KEY],
			}, {
				git: { isDetachedHead: true },
				artifacts: artifacts.slice(-AGENT_HOST_CATALOG_ARTIFACT_LIMIT),
			});
		});
	});

	test('rejects missing fields, wrong types, bounds, duplicate children, and invalid URIs', () => {
		const valid = JSON.parse(encode().payload);
		const cases = [
			{ ...valid, data: { ...valid.data, modifiedTime: undefined } },
			{ ...valid, data: { ...valid.data, isRead: 'true' } },
			{ ...valid, data: { ...valid.data, summary: 'x'.repeat(1025) } },
			{ ...valid, data: { ...valid.data, workingDirectories: Array.from({ length: AGENT_HOST_CATALOG_CHILD_LIMIT + 1 }, (_, index) => `file:///workspace/${index}`) } },
			{ ...valid, data: { ...valid.data, workingDirectories: ['file:///workspace', 'file:///workspace'] } },
			{ ...valid, data: { ...valid.data, project: { uri: 'not a uri', displayName: 'invalid' } } },
			{ ...valid, data: { ...valid.data, chats: [{ ...valid.data.chats[0], uri: 'not a uri' }] } },
			{ ...valid, data: { ...valid.data, _meta: { [SESSION_META_GIT_KEY]: 'not an object' } } },
			{ ...valid, data: { ...valid.data, _meta: { [SESSION_META_FOLDER_PICKER_KEY]: { hidden: false, primary: 'file:///workspace' } } } },
		];

		assert.deepStrictEqual(cases.map(value => {
			const decoded = decodeAgentHostCatalogPayload(JSON.stringify(value));
			return decoded.ok ? 'ok' : decoded.reason;
		}), [
			'invalid',
			'invalid',
			'invalid',
			'invalid',
			'invalid',
			'invalid',
			'invalid',
			'invalid',
			'invalid',
		]);
	});

	test('classifies old payload versions as outdated before structural validation', () => {
		const payload = JSON.parse(encode().payload);
		payload.payloadVersion = AGENT_HOST_CATALOG_PAYLOAD_VERSION - 1;
		payload.data = {};

		const decoded = decodeAgentHostCatalogPayload(JSON.stringify(payload));

		assert.deepStrictEqual(decoded.ok ? 'ok' : decoded.reason, 'outdated');
	});

	test('revives every serialized URI in one place', () => {
		const data = createData();
		const revived = reviveAgentHostCatalogData(data);

		assert.deepStrictEqual({
			project: revived.project?.uri.toString(),
			workingDirectories: revived.workingDirectories.map(uri => uri.toString()),
			chats: revived.chats.map(chat => chat.uri.toString()),
		}, {
			project: data.project?.uri,
			workingDirectories: data.workingDirectories,
			chats: data.chats.map(chat => chat.uri),
		});
	});
});
