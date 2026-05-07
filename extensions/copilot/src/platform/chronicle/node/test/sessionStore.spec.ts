/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../sessionStore';

describe('SessionStore', () => {
	let store: SessionStore;

	beforeEach(() => {
		store = new SessionStore(':memory:');
	});

	afterEach(() => {
		store.close();
	});

	it('creates schema on first access', () => {
		const stats = store.getStats();
		expect(stats.sessions).toBe(0);
		expect(stats.turns).toBe(0);
		expect(stats.checkpoints).toBe(0);
		expect(stats.files).toBe(0);
		expect(stats.refs).toBe(0);
	});

	it('upserts a session', () => {
		store.upsertSession({ id: 'session-1', branch: 'main', repository: 'owner/repo', host_type: 'vscode' });

		const session = store.getSession('session-1');
		expect(session).toBeDefined();
		expect(session!.id).toBe('session-1');
		expect(session!.branch).toBe('main');
		expect(session!.repository).toBe('owner/repo');
		expect(session!.host_type).toBe('vscode');
	});

	it('upsert merges fields with COALESCE', () => {
		store.upsertSession({ id: 'session-1', branch: 'main' });
		store.upsertSession({ id: 'session-1', repository: 'owner/repo' });

		const session = store.getSession('session-1');
		expect(session!.branch).toBe('main');
		expect(session!.repository).toBe('owner/repo');
	});

	it('upsert preserves existing summary when new summary is null', () => {
		store.upsertSession({ id: 'session-1', summary: 'Fix bug in auth' });
		store.upsertSession({ id: 'session-1', branch: 'fix-auth' });

		const session = store.getSession('session-1');
		expect(session!.summary).toBe('Fix bug in auth');
	});

	it('inserts turns and retrieves them ordered', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertTurn({ session_id: 'session-1', turn_index: 0, user_message: 'Hello', assistant_response: 'Hi!' });
		store.insertTurn({ session_id: 'session-1', turn_index: 1, user_message: 'Fix bug', assistant_response: 'Done.' });

		const turns = store.getTurns('session-1');
		expect(turns).toHaveLength(2);
		expect(turns[0].turn_index).toBe(0);
		expect(turns[0].user_message).toBe('Hello');
		expect(turns[1].turn_index).toBe(1);
		expect(turns[1].user_message).toBe('Fix bug');
	});

	it('insertTurn auto-creates session if not exists', () => {
		store.insertTurn({ session_id: 'session-new', turn_index: 0, user_message: 'test' });

		const session = store.getSession('session-new');
		expect(session).toBeDefined();
		expect(session!.id).toBe('session-new');
	});

	it('insertTurn upserts on conflict', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertTurn({ session_id: 'session-1', turn_index: 0, user_message: 'Hello' });
		store.insertTurn({ session_id: 'session-1', turn_index: 0, assistant_response: 'Hi!' });

		const turns = store.getTurns('session-1');
		expect(turns).toHaveLength(1);
		expect(turns[0].user_message).toBe('Hello');
		expect(turns[0].assistant_response).toBe('Hi!');
	});

	it('inserts and retrieves files', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertFile({ session_id: 'session-1', file_path: '/src/index.ts', tool_name: 'apply_patch', turn_index: 0 });
		store.insertFile({ session_id: 'session-1', file_path: '/src/utils.ts', tool_name: 'create_file', turn_index: 1 });

		const files = store.getFiles('session-1');
		expect(files).toHaveLength(2);
		expect(files.map(f => f.file_path)).toContain('/src/index.ts');
		expect(files.map(f => f.file_path)).toContain('/src/utils.ts');
	});

	it('insertFile ignores duplicate file paths (first wins)', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertFile({ session_id: 'session-1', file_path: '/src/index.ts', tool_name: 'apply_patch', turn_index: 0 });
		store.insertFile({ session_id: 'session-1', file_path: '/src/index.ts', tool_name: 'str_replace_editor', turn_index: 5 });

		const files = store.getFiles('session-1');
		expect(files).toHaveLength(1);
		expect(files[0].tool_name).toBe('apply_patch');
		expect(files[0].turn_index).toBe(0);
	});

	it('inserts and retrieves refs', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertRef({ session_id: 'session-1', ref_type: 'pr', ref_value: '123' });
		store.insertRef({ session_id: 'session-1', ref_type: 'commit', ref_value: 'abc123' });

		const refs = store.getRefs('session-1');
		expect(refs).toHaveLength(2);
		expect(refs.find(r => r.ref_type === 'pr')!.ref_value).toBe('123');
		expect(refs.find(r => r.ref_type === 'commit')!.ref_value).toBe('abc123');
	});

	it('insertRef ignores duplicate (session_id, ref_type, ref_value)', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertRef({ session_id: 'session-1', ref_type: 'pr', ref_value: '123', turn_index: 0 });
		store.insertRef({ session_id: 'session-1', ref_type: 'pr', ref_value: '123', turn_index: 5 });

		const refs = store.getRefs('session-1');
		expect(refs).toHaveLength(1);
	});

	it('inserts and retrieves checkpoints', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertCheckpoint({
			session_id: 'session-1',
			checkpoint_number: 0,
			title: 'Checkpoint 0',
			overview: 'Initial setup',
			work_done: 'Created project structure',
			next_steps: 'Add tests',
		});

		const stats = store.getStats();
		expect(stats.checkpoints).toBe(1);
	});

	it('getMaxTurnIndex returns -1 for no turns', () => {
		store.upsertSession({ id: 'session-1' });
		expect(store.getMaxTurnIndex('session-1')).toBe(-1);
	});

	it('getMaxTurnIndex returns highest turn index', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertTurn({ session_id: 'session-1', turn_index: 0, user_message: 'a' });
		store.insertTurn({ session_id: 'session-1', turn_index: 3, user_message: 'b' });
		store.insertTurn({ session_id: 'session-1', turn_index: 1, user_message: 'c' });

		expect(store.getMaxTurnIndex('session-1')).toBe(3);
	});

	it('runInTransaction commits on success', () => {
		store.runInTransaction(() => {
			store.upsertSession({ id: 'session-1', branch: 'main' });
			store.upsertSession({ id: 'session-2', branch: 'dev' });
		});

		expect(store.getStats().sessions).toBe(2);
	});

	it('runInTransaction rolls back on error', () => {
		try {
			store.runInTransaction(() => {
				store.upsertSession({ id: 'session-1', branch: 'main' });
				throw new Error('test error');
			});
		} catch {
			// expected
		}

		expect(store.getStats().sessions).toBe(0);
	});

	it('executeReadOnly allows SELECT queries or throws without authorizer', () => {
		store.upsertSession({ id: 'session-1', branch: 'main', repository: 'owner/repo' });

		try {
			const rows = store.executeReadOnly('SELECT id, branch FROM sessions WHERE id = \'session-1\'');
			// Authorizer available — verify results
			expect(rows).toHaveLength(1);
			expect((rows[0] as { id: string }).id).toBe('session-1');
			expect((rows[0] as { branch: string }).branch).toBe('main');
		} catch (err) {
			// Authorizer not available (Node.js < 24.2) — fail-closed is expected
			expect((err as Error).message).toContain('executeReadOnly requires SQLite authorizer support');
		}
	});

	it('FTS5 search indexes turn content', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertTurn({ session_id: 'session-1', turn_index: 0, user_message: 'How do I implement authentication?' });

		const results = store.search('authentication');
		expect(results).toHaveLength(1);
		expect(results[0].session_id).toBe('session-1');
		expect(results[0].content).toContain('authentication');
	});

	it('FTS5 search indexes checkpoint content', () => {
		store.upsertSession({ id: 'session-1' });
		store.insertCheckpoint({
			session_id: 'session-1',
			checkpoint_number: 0,
			overview: 'Implemented OAuth2 flow',
			work_done: 'Added token refresh logic',
		});

		const results = store.search('OAuth2');
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].session_id).toBe('session-1');
	});

	it('indexWorkspaceArtifact stores and searches content', () => {
		store.upsertSession({ id: 'session-1' });
		store.indexWorkspaceArtifact('session-1', '/workspace/plan.md', 'Implement user registration feature');

		const results = store.search('registration');
		expect(results).toHaveLength(1);
		expect(results[0].source_type).toBe('workspace_artifact');
	});

	it('indexWorkspaceArtifact replaces previous content for same path', () => {
		store.upsertSession({ id: 'session-1' });
		store.indexWorkspaceArtifact('session-1', '/workspace/plan.md', 'Old plan');
		store.indexWorkspaceArtifact('session-1', '/workspace/plan.md', 'New plan with registration');

		const results = store.search('registration');
		expect(results).toHaveLength(1);
		expect(results[0].content).toBe('New plan with registration');
	});

	it('getPath returns the configured path', () => {
		expect(store.getPath()).toBe(':memory:');
	});
});
