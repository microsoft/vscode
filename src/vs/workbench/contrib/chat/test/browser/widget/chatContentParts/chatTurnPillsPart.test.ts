/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatResponseFileChangesService } from '../../../../browser/chatResponseFileChangesService.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatTurnPillsContentPart } from '../../../../browser/widget/chatContentParts/chatTurnPillsPart.js';
import { emptySessionEntryDiff, IEditSessionEntryDiff } from '../../../../common/editing/chatEditingService.js';
import { IChatTurnPillsPart } from '../../../../common/model/chatViewModel.js';

suite('ChatTurnPillsContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the turn changes summary once it has been shown', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('turnChanges', []);
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => diffs,
			getFileEditsForRequest: () => undefined,
			getChangeStatsForRequest: () => undefined,
			openChangesForRequest: () => { },
		});

		const content: IChatTurnPillsPart = {
			kind: 'turnPills',
			requestId: 'request',
			sessionResource: URI.parse('vscode-chat-session://agent-host/session'),
			isLastTurn: true,
		};
		const part = store.add(instantiationService.createInstance(
			ChatTurnPillsContentPart,
			content,
			{} as IChatContentPartRenderContext,
		));

		const readState = () => ({
			display: part.domNode.style.display,
			files: part.domNode.querySelector('.chat-file-changes-label')?.textContent,
			additions: part.domNode.querySelector('.insertions')?.textContent,
			deletions: part.domNode.querySelector('.deletions')?.textContent,
		});
		const states = [readState()];

		diffs.set([
			{ ...emptySessionEntryDiff(URI.file('/file1.ts'), URI.file('/file1.ts')), added: 5, removed: 2 },
			{ ...emptySessionEntryDiff(URI.file('/file2.ts'), URI.file('/file2.ts')), added: 3, removed: 1 },
		], undefined);
		states.push(readState());

		// The changeset recompute at turn end briefly reports no files.
		diffs.set([], undefined);
		states.push(readState());

		assert.deepStrictEqual(states, [
			{ display: 'none', files: '0 files changed', additions: '+0', deletions: '-0' },
			{ display: '', files: '2 files changed', additions: '+8', deletions: '-3' },
			{ display: '', files: '2 files changed', additions: '+8', deletions: '-3' },
		]);
	});

	test('renders only authoritative changed-file and line counts', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const stats = observableValue('turnChangeStats', { files: 2, insertions: 8, deletions: 3 });
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => observableValue('fallbackTurnChanges', [
				{ ...emptySessionEntryDiff(URI.file('/outside.md'), URI.file('/outside.md')), added: 100, removed: 50 },
			]),
			getFileEditsForRequest: () => {
				throw new Error('outside-workspace file edits must not be rendered');
			},
			getChangeStatsForRequest: () => stats,
			openChangesForRequest: () => { },
		});

		const part = store.add(instantiationService.createInstance(
			ChatTurnPillsContentPart,
			{
				kind: 'turnPills',
				requestId: 'request',
				sessionResource: URI.parse('vscode-chat-session://agent-host/session'),
				isLastTurn: true,
			},
			{} as IChatContentPartRenderContext,
		));

		const readState = () => ({
			display: part.domNode.style.display,
			files: part.domNode.querySelector('.chat-file-changes-label')?.textContent,
			additions: part.domNode.querySelector('.insertions')?.textContent,
			deletions: part.domNode.querySelector('.deletions')?.textContent,
			ariaLabel: part.domNode.querySelector('.chat-file-changes-counts')?.getAttribute('aria-label'),
			hasDisclosure: part.domNode.querySelector('details') !== null,
			hasPreview: part.domNode.querySelector('.chat-turn-preview') !== null,
		});
		const before = readState();
		stats.set({ files: 0, insertions: 0, deletions: 0 }, undefined);

		assert.deepStrictEqual({ before, after: readState() }, {
			before: {
				display: '',
				files: '2 files changed',
				additions: '+8',
				deletions: '-3',
				ariaLabel: 'View all file changes: 2 files changed, 8 lines added, 3 lines deleted',
				hasDisclosure: false,
				hasPreview: false,
			},
			after: {
				display: 'none',
				files: '0 files changed',
				additions: '+0',
				deletions: '-0',
				ariaLabel: 'View all file changes: 0 files changed, 0 lines added, 0 lines deleted',
				hasDisclosure: false,
				hasPreview: false,
			},
		});
	});
});
