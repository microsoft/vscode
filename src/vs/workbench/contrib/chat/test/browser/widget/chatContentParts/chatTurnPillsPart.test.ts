/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, IDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, IChatResponseFileChangesService } from '../../../../browser/chatResponseFileChangesService.js';
import { ChangesSummaryFileListPool } from '../../../../browser/widget/chatContentParts/chatChangesSummaryPart.js';
import { ChatCollapsibleContentPart } from '../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatTurnPillsContentPart, IChatTurnPillsDisclosureState } from '../../../../browser/widget/chatContentParts/chatTurnPillsPart.js';
import { emptySessionEntryDiff, IEditSessionEntryDiff } from '../../../../common/editing/chatEditingService.js';
import { IChatTurnPillsPart } from '../../../../common/model/chatViewModel.js';

suite('ChatTurnPillsContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps transient empty changes and clears authoritative empty changes', () => {
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
			store.add(instantiationService.createInstance(ChangesSummaryFileListPool, undefined)),
			{ open: false },
		));

		const readState = () => ({
			hidden: part.domNode.hidden,
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
		diffs.set(AUTHORITATIVE_EMPTY_CHAT_RESPONSE_FILE_CHANGES, undefined);
		states.push(readState());

		assert.deepStrictEqual(states, [
			{ hidden: true, files: '0 files changed', additions: '+0', deletions: '-0' },
			{ hidden: false, files: '2 files changed', additions: '+8', deletions: '-3' },
			{ hidden: false, files: '2 files changed', additions: '+8', deletions: '-3' },
			{ hidden: true, files: '0 files changed', additions: '+0', deletions: '-0' },
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
			store.add(instantiationService.createInstance(ChangesSummaryFileListPool, undefined)),
			{ open: false },
		));

		const readState = () => ({
			hidden: part.domNode.hidden,
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
				hidden: false,
				files: '2 files changed',
				additions: '+8',
				deletions: '-3',
				ariaLabel: 'View turn changes: 2 files changed, 8 lines added, 3 lines deleted',
				hasDisclosure: true,
				hasPreview: false,
			},
			after: {
				hidden: true,
				files: '0 files changed',
				additions: '+0',
				deletions: '-0',
				ariaLabel: 'View turn changes: 0 files changed, 0 lines added, 0 lines deleted',
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
			store.add(instantiationService.createInstance(ChangesSummaryFileListPool, undefined)),
			{ open: false },
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
			collapsed: { open: false, expandedChevron: false, ariaExpanded: 'false', rows: 0, toggleCount: 0, openChangesCount: 0 },
			expanded: { open: true, expandedChevron: true, ariaExpanded: 'true', rows: 2, toggleCount: 1, openChangesCount: 0 },
			afterCountsClick: { open: true, expandedChevron: true, ariaExpanded: 'true', rows: 2, toggleCount: 1, openChangesCount: 1 },
		});
	});

	function setUpTurnChanges() {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => observableValue<readonly IEditSessionEntryDiff[]>('turnChanges', [
				{ ...emptySessionEntryDiff(URI.file('/file1.ts'), URI.file('/file1.ts')), added: 5, removed: 2 },
				{ ...emptySessionEntryDiff(URI.file('/file2.ts'), URI.file('/file2.ts')), added: 3, removed: 1 },
			]),
			getFileEditsForRequest: () => undefined,
			getChangeStatsForRequest: () => undefined,
			openChangesForRequest: () => { },
		});

		const modelService = instantiationService.get(IModelService);
		const modelAddedListeners = new Set<IDisposable>();
		const onModelAdded: IModelService['onModelAdded'] = (listener, thisArgs, disposables) => {
			const subscription = modelService.onModelAdded(listener, thisArgs);
			const tracked = toDisposable(() => {
				modelAddedListeners.delete(tracked);
				subscription.dispose();
			});
			modelAddedListeners.add(tracked);
			if (Array.isArray(disposables)) {
				disposables.push(tracked);
			} else {
				disposables?.add(tracked);
			}
			return tracked;
		};
		instantiationService.set(IModelService, new Proxy(modelService, {
			get: (target, property) => property === 'onModelAdded' ? onModelAdded : Reflect.get(target, property),
		}));

		const listPool = store.add(instantiationService.createInstance(ChangesSummaryFileListPool, undefined));
		let requestCount = 0;
		const createPart = (requestId = `request${requestCount++}`, isLastTurn = false, disclosureState: IChatTurnPillsDisclosureState = { open: false }) => instantiationService.createInstance(
			ChatTurnPillsContentPart,
			{
				kind: 'turnPills',
				requestId,
				sessionResource: URI.parse('vscode-chat-session://agent-host/session'),
				isLastTurn,
			},
			{} as IChatContentPartRenderContext,
			listPool,
			disclosureState,
		);
		return { listPool, createPart, modelAddedListenerCount: () => modelAddedListeners.size };
	}

	function expand(part: ChatTurnPillsContentPart, open = true): void {
		const details = part.domNode.querySelector<HTMLDetailsElement>('details')!;
		details.open = open;
		details.dispatchEvent(new Event('toggle'));
	}

	const fileList = (part: ChatTurnPillsContentPart) => part.domNode.querySelector('.chat-summary-list');

	test('renders collapsed parts without changed-file lists or global model listeners', () => {
		const { createPart, modelAddedListenerCount } = setUpTurnChanges();
		const parts = [store.add(createPart())];
		const readState = () => ({
			lists: parts.filter(fileList).length,
			modelAddedListeners: modelAddedListenerCount(),
		});
		const afterOne = readState();
		while (parts.length < 300) {
			parts.push(store.add(createPart()));
		}

		assert.deepStrictEqual({ afterOne, afterMany: readState() }, {
			afterOne: { lists: 0, modelAddedListeners: 0 },
			afterMany: { lists: 0, modelAddedListeners: 0 },
		});
	});

	test('renders the changed-file list once on first expand, shares global model listeners, and reuses released lists', () => {
		const { listPool, createPart, modelAddedListenerCount } = setUpTurnChanges();
		const first = createPart();
		const second = store.add(createPart());
		const readState = (part: ChatTurnPillsContentPart) => ({
			rows: part.domNode.querySelectorAll('.monaco-list-row').length,
			modelAddedListeners: modelAddedListenerCount(),
		});

		expand(first);
		const firstList = fileList(first);
		const firstExpanded = readState(first);
		expand(first, false);
		expand(first);
		const reexpandedSameList = fileList(first) === firstList;
		expand(second);
		const secondExpanded = readState(second);
		first.dispose();
		const firstDisposed = { list: fileList(first), modelAddedListeners: modelAddedListenerCount() };
		const third = store.add(createPart());
		expand(third);
		const thirdReusesFirstList = fileList(third) === firstList;
		listPool.dispose();

		assert.deepStrictEqual({
			firstExpanded,
			reexpandedSameList,
			secondExpanded,
			firstDisposed,
			thirdReusesFirstList,
			afterPoolDisposed: modelAddedListenerCount(),
		}, {
			firstExpanded: { rows: 2, modelAddedListeners: 1 },
			reexpandedSameList: true,
			secondExpanded: { rows: 2, modelAddedListeners: 1 },
			firstDisposed: { list: null, modelAddedListeners: 1 },
			thirdReusesFirstList: true,
			afterPoolDisposed: 0,
		});
	});

	test('keeps the turn expanded with its changed-file list when it is rebuilt as no longer the last turn', () => {
		const { createPart } = setUpTurnChanges();
		const disclosureState: IChatTurnPillsDisclosureState = { open: false };
		const lastTurn = createPart('request', true, disclosureState);
		expand(lastTurn);
		const stateAfterExpand = { ...disclosureState };
		lastTurn.dispose();

		const rebuilt = store.add(createPart('request', false, disclosureState));
		const readState = () => ({
			open: rebuilt.domNode.querySelector<HTMLDetailsElement>('details')!.open,
			ariaExpanded: rebuilt.domNode.querySelector('summary')!.getAttribute('aria-expanded'),
			rows: rebuilt.domNode.querySelectorAll('.monaco-list-row').length,
		});
		const afterRebuild = readState();
		expand(rebuilt, false);

		assert.deepStrictEqual({ stateAfterExpand, afterRebuild, stateAfterCollapse: { ...disclosureState } }, {
			stateAfterExpand: { open: true },
			afterRebuild: { open: true, ariaExpanded: 'true', rows: 2 },
			stateAfterCollapse: { open: false },
		});
	});
});
