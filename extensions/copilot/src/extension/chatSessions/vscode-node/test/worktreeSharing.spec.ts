/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Uri } from 'vscode';
import { mock } from '../../../../util/common/test/simpleMock';
import { IChatSessionMetadataStore } from '../../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../common/chatSessionWorkspaceFolderService';
import { getBlockingSiblingSessionsForFolder } from '../worktreeSharing';

class TestMetadataStore extends mock<IChatSessionMetadataStore>() {
	sessionIdsForFolder: string[] = [];
	parentBySessionId = new Map<string, Awaited<ReturnType<IChatSessionMetadataStore['getSessionParentId']>>>();
	archivedBySessionId = new Map<string, boolean>();

	override getSessionIdsForFolder = vi.fn(() => this.sessionIdsForFolder);
	override getSessionParentId = vi.fn(async (sessionId: string) => this.parentBySessionId.get(sessionId));
	override getSessionArchived = vi.fn(async (sessionId: string) => this.archivedBySessionId.get(sessionId) ?? false);
}

class TestWorkspaceFolderService extends mock<IChatSessionWorkspaceFolderService>() {
	associatedSessions: string[] = [];
	override getAssociatedSessions = vi.fn(() => this.associatedSessions);
}

describe('getBlockingSiblingSessionsForFolder', () => {
	const folder = Uri.file('/workspace/repo');
	let metadataStore: TestMetadataStore;
	let workspaceFolderService: TestWorkspaceFolderService;

	beforeEach(() => {
		metadataStore = new TestMetadataStore();
		workspaceFolderService = new TestWorkspaceFolderService();
	});

	it('returns no blockers when only the excluded session matches', async () => {
		metadataStore.sessionIdsForFolder = ['session-1'];

		const blockers = await getBlockingSiblingSessionsForFolder(folder, 'session-1', metadataStore, workspaceFolderService);

		expect(blockers).toEqual([]);
		expect(metadataStore.getSessionParentId).not.toHaveBeenCalled();
		expect(metadataStore.getSessionArchived).not.toHaveBeenCalled();
	});

	it('filters out archived and sub-session siblings', async () => {
		metadataStore.sessionIdsForFolder = ['excluded', 'active', 'archived', 'sub', 'forked'];
		workspaceFolderService.associatedSessions = ['sub'];
		metadataStore.archivedBySessionId.set('archived', true);
		metadataStore.parentBySessionId.set('sub', { parentSessionId: 'parent', kind: 'sub-session' });
		metadataStore.parentBySessionId.set('forked', { parentSessionId: 'parent', kind: 'forked' });

		const blockers = await getBlockingSiblingSessionsForFolder(folder, 'excluded', metadataStore, workspaceFolderService);

		expect(blockers.sort()).toEqual(['active', 'forked']);
	});

	it('de-duplicates session ids across metadata and workspace associated sessions', async () => {
		metadataStore.sessionIdsForFolder = ['excluded', 'shared', 'metadata-only'];
		workspaceFolderService.associatedSessions = ['shared', 'workspace-only', 'excluded'];

		const blockers = await getBlockingSiblingSessionsForFolder(folder, 'excluded', metadataStore, workspaceFolderService);

		expect(blockers.sort()).toEqual(['metadata-only', 'shared', 'workspace-only']);
		expect(metadataStore.getSessionArchived).toHaveBeenCalledTimes(3);
		expect(metadataStore.getSessionParentId).toHaveBeenCalledTimes(3);
	});
});
