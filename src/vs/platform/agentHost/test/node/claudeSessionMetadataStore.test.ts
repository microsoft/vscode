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
import { MessageKind, TurnState, type Turn } from '../../common/state/sessionState.js';

function createStore(disposables: Pick<import('../../../../base/common/lifecycle.js').DisposableStore, 'add'>, sessionDataService: ISessionDataService = createSessionDataService()): ClaudeSessionMetadataStore {
	const services = new ServiceCollection([ISessionDataService, sessionDataService]);
	const instantiationService = disposables.add(new InstantiationService(services));
	return instantiationService.createInstance(ClaudeSessionMetadataStore);
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

	test('write then read round-trips the working-directory set', async () => {
		const store = createStore(disposables);

		await store.write(SESSION_URI, {
			workingDirectories: [URI.file('/a'), URI.file('/b'), URI.file('/c')],
		});

		const overlay = await store.read(SESSION_URI);

		assert.deepStrictEqual(
			overlay.workingDirectories?.map(d => d.toString()),
			[URI.file('/a').toString(), URI.file('/b').toString(), URI.file('/c').toString()],
		);
	});

	test('read returns undefined workingDirectories when none were persisted', async () => {
		const store = createStore(disposables);

		await store.write(SESSION_URI, { permissionMode: 'plan' });
		const overlay = await store.read(SESSION_URI);

		assert.strictEqual(overlay.workingDirectories, undefined);
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

	test('known-session detection ignores absent and empty sidecars', async () => {
		const emptyDatabase = new TestSessionDatabase();
		const absent = createStore(disposables, createNullSessionDataService());
		const present = createStore(disposables, createSessionDataService(emptyDatabase));

		const absentResult = await absent.hasKnownSession(SESSION_URI);
		const emptyResult = await present.hasKnownSession(SESSION_URI);
		await emptyDatabase.setMetadata('agentHost.workspaceless', 'false');

		assert.deepStrictEqual([absentResult, emptyResult, await present.hasKnownSession(SESSION_URI)], [false, false, true]);
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

	test('model codec preserves source and primitive options but drops structured config values', async () => {
		const db = new TestSessionDatabase();
		await db.setMetadata('claude.model', JSON.stringify({ id: 'm', modelSourceId: 'anthropic', config: { thinking: 'high', context: 42, enabled: true, reset: null, nested: {} } }));
		const store = createStore(disposables, createSessionDataService(db));

		const overlay = await store.read(SESSION_URI);

		assert.deepStrictEqual(overlay.model, { id: 'm', modelSourceId: 'anthropic', config: { thinking: 'high', context: 42, enabled: true, reset: null } });
	});

	test('normalizes old stored selections and persists only the standard source shape', async () => {
		const db = new TestSessionDatabase();
		await db.setMetadata('claude.model', JSON.stringify({ id: '@provider=anthropic:claude-haiku', config: { thinking: 'high' } }));
		const store = createStore(disposables, createSessionDataService(db));
		const overlay = await store.read(SESSION_URI);
		await store.write(SESSION_URI, { model: { id: '@provider=copilot:claude-opus-4.6' } });
		assert.deepStrictEqual({
			model: overlay.model,
			persisted: JSON.parse(await db.getMetadata('claude.model') ?? 'null'),
		}, {
			model: { id: 'claude-haiku', modelSourceId: 'anthropic', config: { thinking: 'high' } },
			persisted: { id: 'claude-opus-4.6', modelSourceId: 'copilot' },
		});
	});

	test('invalid stored sources fail rather than losing the qualifier', async () => {
		const db = new TestSessionDatabase();
		const store = createStore(disposables, createSessionDataService(db));
		for (const model of [
			{ id: 'm', modelSourceId: 7 },
			{ id: 'm', modelSourceId: 'missing' },
			{ modelSourceId: 'anthropic' },
			{ id: '@provider=anthropic:%ZZ' },
		]) {
			await db.setMetadata('claude.model', JSON.stringify(model));
			await assert.rejects(store.read(SESSION_URI), /model.source|model source/);
		}
	});

	test('restores each recorded turn selection independently of the latest model or catalog', async () => {
		const db = new TestSessionDatabase();
		const store = createStore(disposables, createSessionDataService(db));
		const native = { id: 'shared', modelSourceId: 'anthropic' };
		const proxy = { id: 'shared', modelSourceId: 'copilot' };
		await store.writeTurnModel(SESSION_URI, 'native-turn', native);
		await store.writeTurnModel(SESSION_URI, 'proxy-turn', proxy);
		await store.write(SESSION_URI, { model: { id: 'new-current-model', modelSourceId: 'copilot' } });
		const turns: Turn[] = ['native-turn', 'proxy-turn', 'older-unknown'].map(id => ({
			id, state: TurnState.Complete, message: { text: id, origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined,
		}));
		const restored = await store.restoreTurnModels(SESSION_URI, turns);
		assert.deepStrictEqual({
			models: restored.map(turn => turn.message.model),
			historyIds: await Promise.all(['native-turn', 'proxy-turn'].map(id => db.getTurnEventId(id))),
		}, { models: [native, proxy, undefined], historyIds: ['native-turn', 'proxy-turn'] });
	});

	test('corrupt structured model metadata never becomes a bare model ID', async () => {
		const db = new TestSessionDatabase();
		const store = createStore(disposables, createSessionDataService(db));
		for (const raw of ['{"id":"shared","modelSourceId":"anthropic"', '{}', '[]', '"@provider=anthropic:shared']) {
			await db.setMetadata('claude.model', raw);
			await assert.rejects(store.read(SESSION_URI), /Invalid stored Claude model-source selection/);
		}
	});

	test('forks copy only inherited turn selections and truncation removes obsolete selections', async () => {
		const sourceDatabase = new TestSessionDatabase();
		const destinationDatabase = new TestSessionDatabase();
		const sourceService = createSessionDataService(sourceDatabase);
		const destinationService = createSessionDataService(destinationDatabase);
		const store = createStore(disposables, {
			...sourceService,
			openDatabase: session => session.toString() === SESSION_URI.toString() ? sourceService.openDatabase(session) : destinationService.openDatabase(session),
			tryOpenDatabase: session => session.toString() === SESSION_URI.toString() ? sourceService.tryOpenDatabase(session) : destinationService.tryOpenDatabase(session),
		});
		const destination = URI.parse('ahp-chat:/fork');
		const native = { id: 'shared', modelSourceId: 'anthropic' };
		const proxy = { id: 'shared', modelSourceId: 'copilot' };
		await store.writeTurnModel(SESSION_URI, 'native', native);
		await store.writeTurnModel(SESSION_URI, 'proxy', proxy);
		await sourceDatabase.setMetadata('claude.permissionMode', 'plan');
		await store.copyTurnModels(SESSION_URI, destination, ['native', 'unknown']);
		await store.retainTurnModels(SESSION_URI, ['native']);
		const afterTruncation = await sourceDatabase.getMetadataByPrefix('claude.turn.model.');
		const inherited = await destinationDatabase.getMetadataByPrefix('claude.turn.model.');
		await store.retainTurnModels(SESSION_URI, []);
		assert.deepStrictEqual({
			afterTruncation, inherited,
			afterClear: await sourceDatabase.getMetadataByPrefix('claude.turn.model.'),
			unrelated: await sourceDatabase.getMetadata('claude.permissionMode'),
		}, {
			afterTruncation: { 'claude.turn.model.native': JSON.stringify(native) },
			inherited: { 'claude.turn.model.native': JSON.stringify(native) },
			afterClear: {},
			unrelated: 'plan',
		});
	});

	test('project maps SDK info onto IAgentChatMetadata (minus chat)', async () => {
		const store = createStore(disposables);
		const sdkInfo = makeSdkInfo({ sessionId: 'abc', summary: 'sdk-summary', customTitle: 'custom', cwd: '/repo' });

		const projected = store.project(sdkInfo);

		assert.deepStrictEqual({
			startTime: projected.startTime,
			modifiedTime: projected.modifiedTime,
			summary: projected.summary,
			workingDirectory: projected.workingDirectories?.[0]?.toString(),
		}, {
			startTime: 1000,
			modifiedTime: 2000,
			summary: 'custom',
			workingDirectory: URI.file('/repo').toString(),
		});
	});

	test('project falls back to SDK summary when no customTitle, omits workingDirectory when no cwd', async () => {
		const store = createStore(disposables);
		const sdkInfo = makeSdkInfo({ summary: 'fallback', customTitle: undefined, cwd: undefined });

		const projected = store.project(sdkInfo);

		assert.deepStrictEqual({
			summary: projected.summary,
			workingDirectory: projected.workingDirectories?.[0],
		}, {
			summary: 'fallback',
			workingDirectory: undefined,
		});
	});
});
