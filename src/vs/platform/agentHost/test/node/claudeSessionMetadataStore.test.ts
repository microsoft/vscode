/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ClaudeSessionMetadataStore } from '../../node/claude/claudeSessionMetadataStore.js';
import { createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

function createStore(disposables: Pick<import('../../../../base/common/lifecycle.js').DisposableStore, 'add'>, sessionDataService: ISessionDataService = createSessionDataService()): ClaudeSessionMetadataStore {
	const services = new ServiceCollection([ISessionDataService, sessionDataService]);
	const instantiationService = disposables.add(new InstantiationService(services));
	return instantiationService.createInstance(ClaudeSessionMetadataStore, 'claude');
}

function makeSdkInfo(overrides: Partial<SDKSessionInfo> = {}): SDKSessionInfo {
	return {
		sessionId: 'sess-1',
		summary: 'a summary',
		customTitle: undefined,
		cwd: '/work',
		createdAt: 1000,
		lastModified: 2000,
		messageCount: 0,
		...overrides,
	} as SDKSessionInfo;
}

const SESSION_URI = URI.parse('claude:/sess-1');

suite('ClaudeSessionMetadataStore', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('write then read round-trips all overlay fields', async () => {
		const store = createStore(disposables);

		await store.write(SESSION_URI, {
			customizationDirectory: URI.file('/custom'),
			model: { id: 'claude-opus-4-6', config: { thinking: 'medium' } },
			permissionMode: 'acceptEdits',
		});

		const overlay = await store.read(SESSION_URI);

		assert.deepStrictEqual({
			customizationDirectory: overlay.customizationDirectory?.toString(),
			modelId: overlay.model?.id,
			modelConfig: overlay.model?.config,
			permissionMode: overlay.permissionMode,
		}, {
			customizationDirectory: URI.file('/custom').toString(),
			modelId: 'claude-opus-4-6',
			modelConfig: { thinking: 'medium' },
			permissionMode: 'acceptEdits',
		});
	});

	test('write skips undefined fields (only-write-on-defined)', async () => {
		const db = new TestSessionDatabase();
		const store = createStore(disposables, createSessionDataService(db));

		await store.write(SESSION_URI, { permissionMode: 'plan' });
		const overlay = await store.read(SESSION_URI);

		assert.deepStrictEqual({
			customizationDirectory: overlay.customizationDirectory,
			model: overlay.model,
			permissionMode: overlay.permissionMode,
		}, {
			customizationDirectory: undefined,
			model: undefined,
			permissionMode: 'plan',
		});
	});

	test('read returns empty overlay when no DB is present (external CLI session)', async () => {
		const store = createStore(disposables, createNullSessionDataService());

		const overlay = await store.read(SESSION_URI);

		assert.deepStrictEqual(overlay, {});
	});

	test('read narrows malformed permissionMode to undefined', async () => {
		const db = new TestSessionDatabase();
		await db.setMetadata('claude.permissionMode', 'not-a-mode');
		const store = createStore(disposables, createSessionDataService(db));

		const overlay = await store.read(SESSION_URI);

		assert.strictEqual(overlay.permissionMode, undefined);
	});

	test('read tolerates legacy plain-string model entries (pre-codec)', async () => {
		const db = new TestSessionDatabase();
		await db.setMetadata('claude.model', 'claude-sonnet-4');
		const store = createStore(disposables, createSessionDataService(db));

		const overlay = await store.read(SESSION_URI);

		assert.deepStrictEqual(overlay.model, { id: 'claude-sonnet-4' });
	});

	test('model codec drops non-string config values (defense-in-depth)', async () => {
		const db = new TestSessionDatabase();
		await db.setMetadata('claude.model', JSON.stringify({ id: 'm', config: { thinking: 'high', bogus: 42, also: null } }));
		const store = createStore(disposables, createSessionDataService(db));

		const overlay = await store.read(SESSION_URI);

		assert.deepStrictEqual(overlay.model, { id: 'm', config: { thinking: 'high' } });
	});

	test('project combines SDK info with overlay onto IAgentSessionMetadata', async () => {
		const store = createStore(disposables);
		const sdkInfo = makeSdkInfo({ sessionId: 'abc', summary: 'sdk-summary', customTitle: 'custom', cwd: '/repo' });

		const projected = store.project(sdkInfo, {
			customizationDirectory: URI.file('/custom'),
			model: { id: 'claude-opus-4-6' },
		});

		assert.deepStrictEqual({
			session: projected.session.toString(),
			startTime: projected.startTime,
			modifiedTime: projected.modifiedTime,
			summary: projected.summary,
			workingDirectory: projected.workingDirectory?.toString(),
			customizationDirectory: projected.customizationDirectory?.toString(),
			model: projected.model,
		}, {
			session: 'claude:/abc',
			startTime: 1000,
			modifiedTime: 2000,
			summary: 'custom',
			workingDirectory: URI.file('/repo').toString(),
			customizationDirectory: URI.file('/custom').toString(),
			model: { id: 'claude-opus-4-6' },
		});
	});

	test('project falls back to SDK summary when no customTitle, omits workingDirectory when no cwd', async () => {
		const store = createStore(disposables);
		const sdkInfo = makeSdkInfo({ summary: 'fallback', customTitle: undefined, cwd: undefined });

		const projected = store.project(sdkInfo, {});

		assert.deepStrictEqual({
			summary: projected.summary,
			workingDirectory: projected.workingDirectory,
			customizationDirectory: projected.customizationDirectory,
			model: projected.model,
		}, {
			summary: 'fallback',
			workingDirectory: undefined,
			customizationDirectory: undefined,
			model: undefined,
		});
	});
});
