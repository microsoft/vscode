/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatResponseFileChangesService } from '../../../../browser/chatResponseFileChangesService.js';
import { ChatCollapsibleContentPart } from '../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
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
				hasDisclosure: true,
				hasPreview: false,
			},
			after: {
				display: 'none',
				files: '0 files changed',
				additions: '+0',
				deletions: '-0',
				ariaLabel: 'View all file changes: 0 files changed, 0 lines added, 0 lines deleted',
				hasDisclosure: true,
				hasPreview: false,
			},
		});
	});

	test('expands the changed files list from the header without opening the changes', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		let openChangesCount = 0;
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => observableValue<readonly IEditSessionEntryDiff[]>('turnChanges', [
				{ ...emptySessionEntryDiff(URI.file('/file1.ts'), URI.file('/file1.ts')), added: 5, removed: 2 },
				{ ...emptySessionEntryDiff(URI.file('/file2.ts'), URI.file('/file2.ts')), added: 3, removed: 1 },
			]),
			getFileEditsForRequest: () => undefined,
			getChangeStatsForRequest: () => undefined,
			openChangesForRequest: () => { openChangesCount++; },
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

		let toggleCount = 0;
		const listener = () => toggleCount++;
		part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
		store.add(toDisposable(() => part.domNode.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));

		const details = part.domNode.querySelector<HTMLDetailsElement>('details');
		const header = part.domNode.querySelector<HTMLElement>('summary');
		const counts = part.domNode.querySelector<HTMLElement>('.chat-file-changes-counts');
		const chevron = part.domNode.querySelector('.chat-file-changes-chevron');
		assert.ok(details && header && counts && chevron);

		const readState = () => ({
			open: details.open,
			expandedChevron: chevron.classList.contains('expanded'),
			ariaExpanded: header.getAttribute('aria-expanded'),
			rows: part.domNode.querySelectorAll('.chat-summary-list .monaco-list-row').length,
			toggleCount,
			openChangesCount,
		});
		const collapsed = readState();

		// `<details>` does not toggle on a synthetic click, so mirror what the browser does.
		header.click();
		details.open = true;
		details.dispatchEvent(new Event('toggle'));
		const expanded = readState();

		// The counts button opens the changes view instead of toggling the disclosure.
		counts.click();

		assert.deepStrictEqual({ collapsed, expanded, afterCountsClick: readState() }, {
			collapsed: { open: false, expandedChevron: false, ariaExpanded: 'false', rows: 2, toggleCount: 0, openChangesCount: 0 },
			expanded: { open: true, expandedChevron: true, ariaExpanded: 'true', rows: 2, toggleCount: 1, openChangesCount: 0 },
			afterCountsClick: { open: true, expandedChevron: true, ariaExpanded: 'true', rows: 2, toggleCount: 1, openChangesCount: 1 },
		});
	});
});
