/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatData, ISessionData, SessionStatus } from '../../common/sessionData.js';
import { groupByWorkspace, sortSessions, SessionsSorting } from '../../browser/views/sessionsList.js';

function createSession(id: string, opts: {
	workspaceLabel?: string;
	createdAt?: Date;
	updatedAt?: Date;
	isArchived?: boolean;
}): ISessionData {
	const createdAt = opts.createdAt ?? new Date();
	const updatedAt = opts.updatedAt ?? createdAt;
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt,
		workspace: observableValue(`workspace-${id}`, opts.workspaceLabel ? {
			label: opts.workspaceLabel,
			icon: Codicon.folder,
			repositories: [],
			requiresWorkspaceTrust: false,
		} : undefined),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, updatedAt),
		status: observableValue(`status-${id}`, SessionStatus.Completed),
		changes: observableValue(`changes-${id}`, []),
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived: observableValue(`isArchived-${id}`, opts.isArchived ?? false),
		isRead: observableValue(`isRead-${id}`, true),
		description: observableValue(`description-${id}`, undefined),
		lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
		pullRequest: observableValue(`pullRequest-${id}`, undefined),
		chats: observableValue<readonly IChatData[]>(`chats-${id}`, []),
		activeChat: observableValue<IChatData>(`activeChat-${id}`, undefined!),
	};
}

suite('Sessions - SessionsList Helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('groupByWorkspace', () => {

		test('groups are sorted alphabetically regardless of insertion order', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zebra' }),
				createSession('2', { workspaceLabel: 'Apple' }),
				createSession('3', { workspaceLabel: 'Mango' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Apple', 'Mango', 'Zebra']);
		});

		test('sessions without workspace are grouped under "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Beta' }),
				createSession('2', {}),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Beta', 'Unknown']);
		});

		test('multiple sessions in same workspace are grouped together', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Repo-B' }),
				createSession('2', { workspaceLabel: 'Repo-A' }),
				createSession('3', { workspaceLabel: 'Repo-B' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Repo-A', 'Repo-B']);
			assert.strictEqual(groups[0].sessions.length, 1);
			assert.strictEqual(groups[1].sessions.length, 2);
		});

		test('"No Workspace" appears after workspaces that sort alphabetically later', () => {
			const sessions = [
				createSession('1', {}),
				createSession('2', { workspaceLabel: 'Zulu' }),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Zulu', 'Unknown']);
		});

		test('empty workspace label is treated as "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zulu' }),
				createSession('2', { workspaceLabel: '' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Zulu', 'Unknown']);
			assert.strictEqual(groups[1].sessions.length, 1);
		});

		test('group ids are prefixed with workspace:', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'MyProject' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.strictEqual(groups[0].id, 'workspace:MyProject');
		});
	});

	suite('sortSessions', () => {

		test('sorts by createdAt descending when sorting is Created', () => {
			const sessions = [
				createSession('old', { createdAt: new Date('2024-01-01') }),
				createSession('new', { createdAt: new Date('2024-06-01') }),
				createSession('mid', { createdAt: new Date('2024-03-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['new', 'mid', 'old']);
		});

		test('sorts by updatedAt descending when sorting is Updated', () => {
			const sessions = [
				createSession('a', { createdAt: new Date('2024-06-01'), updatedAt: new Date('2024-07-01') }),
				createSession('b', { createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-09-01') }),
				createSession('c', { createdAt: new Date('2024-03-01'), updatedAt: new Date('2024-08-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Updated);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['b', 'c', 'a']);
		});
	});
});
