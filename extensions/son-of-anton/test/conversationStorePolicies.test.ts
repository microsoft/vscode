/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConversationStore } from '../src/chat/ConversationStore';
import type { ChatMessage } from '../src/chat/ChatPanel';

// ── Fake VS Code ExtensionContext with in-memory Memento ──────────────────────

class FakeMemento implements vscode.Memento {
	private readonly data = new Map<string, unknown>();

	keys(): readonly string[] {
		return Array.from(this.data.keys());
	}

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		return (this.data.has(key) ? this.data.get(key) : defaultValue) as T | undefined;
	}

	update(key: string, value: unknown): Thenable<void> {
		if (value === undefined) {
			this.data.delete(key);
		} else {
			this.data.set(key, value);
		}
		return Promise.resolve();
	}

	setKeysForSync(_keys: readonly string[]): void {
		// no-op
	}
}

function makeContext(): {
	context: vscode.ExtensionContext;
	globalState: FakeMemento;
	workspaceState: FakeMemento;
} {
	const globalState = new FakeMemento();
	const workspaceState = new FakeMemento();
	const context = {
		globalState,
		workspaceState,
	} as unknown as vscode.ExtensionContext;
	return { context, globalState, workspaceState };
}

function userMsg(content: string, ts = Date.now()): ChatMessage {
	return { role: 'user', content, timestamp: ts };
}

function assistantMsg(content: string, ts = Date.now()): ChatMessage {
	return { role: 'assistant', content, timestamp: ts };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('ConversationStore — Phase 47', () => {

	test('create() returns a record with a fresh id and placeholder title', () => {
		const { context } = makeContext();
		const store = new ConversationStore(context);
		const record = store.create();

		assert.deepStrictEqual(
			{
				hasId: typeof record.summary.id === 'string' && record.summary.id.length > 0,
				title: record.summary.title,
				messageCount: record.summary.messageCount,
				isUuidShape: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(record.summary.id),
			},
			{ hasId: true, title: 'New conversation', messageCount: 0, isUuidShape: true },
		);
		store.dispose();
	});

	test('update() derives a title from the first user message', () => {
		const { context } = makeContext();
		const store = new ConversationStore(context);
		const record = store.create();

		store.update(record.summary.id, [userMsg('How do I configure ESLint?'), assistantMsg('You configure...')]);

		const reloaded = store.load(record.summary.id);
		assert.strictEqual(reloaded?.summary.title, 'How do I configure ESLint?');
		store.dispose();
	});

	test('update() persists lastMode and round-trips it across loads', () => {
		const { context } = makeContext();
		const store = new ConversationStore(context);
		const record = store.create();

		store.update(record.summary.id, [userMsg('design first')], 'anton', 'plan');

		const reloaded = store.load(record.summary.id);
		assert.deepStrictEqual(
			{
				lastMode: reloaded?.summary.lastMode,
				lastSpecialist: reloaded?.summary.lastSpecialist,
			},
			{ lastMode: 'plan', lastSpecialist: 'anton' },
		);
		store.dispose();
	});

	test('list() returns conversations newest-first by updatedAt', async () => {
		const { context } = makeContext();
		const store = new ConversationStore(context);
		const a = store.create();
		await new Promise(r => setTimeout(r, 5));
		const b = store.create();
		await new Promise(r => setTimeout(r, 5));
		const c = store.create();

		const ids = store.list().map(s => s.id);
		assert.deepStrictEqual(ids, [c.summary.id, b.summary.id, a.summary.id]);
		store.dispose();
	});

	test('caps at 50 conversations — creating 51 evicts the oldest', () => {
		const { context, globalState } = makeContext();
		const store = new ConversationStore(context);

		const first = store.create();
		// Backdate so it has the lowest updatedAt and gets pruned first.
		const index = (globalState.get<Array<{ id: string; updatedAt: number; createdAt: number }>>(
			'sota.conversations.index',
		) ?? []).map(s => (s.id === first.summary.id ? { ...s, updatedAt: 1, createdAt: 1 } : s));
		void globalState.update('sota.conversations.index', index);

		for (let i = 0; i < 50; i++) {
			store.create();
		}

		const list = store.list();
		const evictedRecord = globalState.get<unknown>(`sota.conversations.${first.summary.id}`);
		assert.deepStrictEqual(
			{ count: list.length, evictedPresent: list.some(s => s.id === first.summary.id), bodyCleared: evictedRecord === undefined },
			{ count: 50, evictedPresent: false, bodyCleared: true },
		);
		store.dispose();
	});

	test('caps at 500 messages per conversation — pushing 501 drops the oldest', () => {
		const { context } = makeContext();
		const store = new ConversationStore(context);
		const record = store.create();

		const messages: ChatMessage[] = [];
		for (let i = 0; i < 501; i++) {
			messages.push(userMsg(`message-${i}`, Date.now() + i));
		}
		store.update(record.summary.id, messages);

		const reloaded = store.load(record.summary.id);
		assert.deepStrictEqual(
			{
				count: reloaded?.messages.length,
				firstContent: reloaded?.messages[0]?.content,
				lastContent: reloaded?.messages[reloaded.messages.length - 1]?.content,
			},
			{ count: 500, firstContent: 'message-1', lastContent: 'message-500' },
		);
		store.dispose();
	});

	test('delete() removes the summary AND the per-conversation message body', () => {
		const { context, globalState } = makeContext();
		const store = new ConversationStore(context);
		const record = store.create();
		store.update(record.summary.id, [userMsg('hi')]);

		store.delete(record.summary.id);

		assert.deepStrictEqual(
			{
				inList: store.list().some(s => s.id === record.summary.id),
				bodyCleared: globalState.get<unknown>(`sota.conversations.${record.summary.id}`) === undefined,
				loadResult: store.load(record.summary.id),
			},
			{ inList: false, bodyCleared: true, loadResult: undefined },
		);
		store.dispose();
	});

	test('rename() updates the summary title and refreshes updatedAt', async () => {
		const { context } = makeContext();
		const store = new ConversationStore(context);
		const record = store.create();
		const beforeTs = record.summary.updatedAt;
		await new Promise(r => setTimeout(r, 5));

		store.rename(record.summary.id, '  Custom Title  ');

		const summary = store.list().find(s => s.id === record.summary.id);
		assert.deepStrictEqual(
			{ title: summary?.title, updated: (summary?.updatedAt ?? 0) > beforeTs },
			{ title: 'Custom Title', updated: true },
		);
		store.dispose();
	});

	test('migration imports the legacy CONVERSATION_STORAGE_KEY on first construction and clears it', () => {
		const { context, globalState, workspaceState } = makeContext();
		const legacy: ChatMessage[] = [userMsg('legacy question'), assistantMsg('legacy answer')];
		void workspaceState.update('sota.chatHistory', legacy);

		const store = new ConversationStore(context);

		const list = store.list();
		assert.deepStrictEqual(
			{
				count: list.length,
				title: list[0]?.title,
				legacyCleared: workspaceState.get<unknown>('sota.chatHistory') === undefined,
				migrationFlag: globalState.get<boolean>('sota.conversations.migrated'),
			},
			{ count: 1, title: 'legacy question', legacyCleared: true, migrationFlag: true },
		);
		store.dispose();
	});

	test('migration runs at most once — re-instantiating with the flag set is a no-op', () => {
		const { context, globalState, workspaceState } = makeContext();
		void workspaceState.update('sota.chatHistory', [userMsg('would-be reimport')]);
		void globalState.update('sota.conversations.migrated', true);

		const store = new ConversationStore(context);

		assert.strictEqual(store.list().length, 0);
		store.dispose();
	});

	test('onDidChange fires for create / update / rename / delete', () => {
		const { context } = makeContext();
		const store = new ConversationStore(context);

		let count = 0;
		store.onDidChange(() => { count += 1; });

		const r = store.create();
		store.update(r.summary.id, [userMsg('hi')]);
		store.rename(r.summary.id, 'Renamed');
		store.delete(r.summary.id);

		assert.strictEqual(count, 4);
		store.dispose();
	});
});
