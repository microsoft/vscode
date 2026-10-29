/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISession, ISessionCreationReference } from '../../../sessions/common/session.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { SessionsProjectsService } from '../../browser/sessionsProjectsService.js';
import { buildProjectKickoff } from '../../common/sessionsProjects.js';

class TestSession extends mock<ISession>() {
	override readonly resource: URI;
	override readonly createdBySession: IObservable<ISessionCreationReference | undefined>;
	constructor(override readonly sessionId: string, createdBy?: string) {
		super();
		this.resource = URI.parse(`test-session:/${sessionId}`);
		this.createdBySession = observableValue(this, createdBy ? { session: URI.parse(`test-session:/${createdBy}`) } : undefined);
	}
}

suite('SessionsProjectsService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(sessions: TestSession[], storage = store.add(new InMemoryStorageService())) {
		const sent: ISendRequestOptions[] = [];
		const management = new class extends mock<ISessionsManagementService>() {
			override async createAndSendQuickChatRequest(options: ISendRequestOptions): Promise<ISession> {
				sent.push(options);
				const coordinator = new TestSession(`coordinator-${sent.length}`);
				sessions.push(coordinator);
				return coordinator;
			}
			override getSession(resource: URI) {
				return sessions.find(session => session.resource.toString() === resource.toString());
			}
		};
		return { service: store.add(new SessionsProjectsService(management, storage, new NullLogService())), sent, storage };
	}

	test('creates a project by starting its coordinator with the project brief, and restores it', async () => {
		const sessions: TestSession[] = [];
		const { service, sent, storage } = createService(sessions);
		const repositories = [{ key: 'github:microsoft/vscode', label: 'vscode', folderUri: URI.file('/src/vscode'), providerId: 'local' }];
		const project = await service.createProject({ name: ' Agents polish ', repositories, firstMessage: 'Tidy the sidebar.' });
		service.selectProject(project!.id);

		const restored = createService(sessions, storage).service;
		assert.deepStrictEqual({
			sent: sent.map(options => ({ title: options.title, query: options.query })),
			restored: restored.projects.get().map(p => ({ id: p.id, name: p.name, coordinator: p.coordinator.toString(), repositories: p.repositories.map(r => ({ ...r, folderUri: r.folderUri?.toString() })) })),
			selected: restored.selectedProject.get()?.id,
		}, {
			sent: [{ title: 'Agents polish', query: buildProjectKickoff('Agents polish', repositories, 'Tidy the sidebar.') }],
			restored: [{ id: project!.id, name: 'Agents polish', coordinator: 'test-session:/coordinator-1', repositories: [{ key: 'github:microsoft/vscode', label: 'vscode', folderUri: 'file:///src/vscode', providerId: 'local' }] }],
			selected: project!.id,
		});
	});

	test('a session belongs to the project whose coordinator started it, directly or through other sessions', async () => {
		const sessions: TestSession[] = [];
		const { service } = createService(sessions);
		const project = await service.createProject({ name: 'P', repositories: [], firstMessage: 'Go.' });
		const child = new TestSession('child', 'coordinator-1');
		const grandchild = new TestSession('grandchild', 'child');
		const unrelated = new TestSession('unrelated');
		const cycleA = new TestSession('cycle-a', 'cycle-b');
		const cycleB = new TestSession('cycle-b', 'cycle-a');
		sessions.push(child, grandchild, unrelated, cycleA, cycleB);

		assert.deepStrictEqual(
			[sessions[0], child, grandchild, unrelated, cycleA].map(session => service.getProjectForSession(session)?.id),
			[project!.id, project!.id, project!.id, undefined, undefined],
		);
	});

	test('removing a project forgets it and clears the scope, keeping its sessions', async () => {
		const sessions: TestSession[] = [];
		const { service } = createService(sessions);
		const project = await service.createProject({ name: 'P', repositories: [], firstMessage: 'Go.' });
		service.selectProject(project!.id);
		service.removeProject(project!.id);

		assert.deepStrictEqual({ projects: service.projects.get().length, selected: service.selectedProject.get(), sessions: sessions.length }, { projects: 0, selected: undefined, sessions: 1 });
	});

	test('the project brief lists repositories before the first task', () => {
		assert.deepStrictEqual(buildProjectKickoff('Docs', [
			{ key: 'github:microsoft/vscode-docs', label: 'vscode-docs', folderUri: URI.file('/src/vscode-docs') },
			{ key: 'github:microsoft/vscode', label: 'vscode' },
		], '  Update the release notes.  ').split('\n'), [
			'You are the coordinator for the project "Docs". Keep this project\'s shared context in this conversation.',
			'',
			'Repositories:',
			`- vscode-docs (${URI.file('/src/vscode-docs').fsPath})`,
			'- vscode',
			'',
			'When work belongs in one of these repositories and you can start sessions, start a focused session in that repository for it, then summarize the outcome here.',
			'',
			'Update the release notes.',
		]);
	});
});
