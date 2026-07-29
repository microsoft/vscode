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
import { ChatCheckpointFileChangesSummaryContentPart } from '../../../../browser/widget/chatContentParts/chatChangesSummaryPart.js';
import { ChatCollapsibleContentPart } from '../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { emptySessionEntryDiff, IEditSessionEntryDiff } from '../../../../common/editing/chatEditingService.js';
import { IChatChangesSummaryPart } from '../../../../common/model/chatViewModel.js';

suite('ChatCheckpointFileChangesSummaryContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates visibility and aggregate counts when file changes arrive', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const diffs = observableValue<readonly IEditSessionEntryDiff[]>('testFileChanges', []);
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => diffs,
		});

		const content: IChatChangesSummaryPart = {
			kind: 'changesSummary',
			requestId: 'request',
			sessionResource: URI.parse('chat-session://test/session'),
		};
		const part = store.add(instantiationService.createInstance(
			ChatCheckpointFileChangesSummaryContentPart,
			content,
			{} as IChatContentPartRenderContext,
		));

		const readState = () => ({
			display: part.domNode.style.display,
			files: part.domNode.querySelector('.chat-file-changes-label')?.textContent,
			additions: part.domNode.querySelector('.insertions')?.textContent,
			deletions: part.domNode.querySelector('.deletions')?.textContent,
			headerOrder: Array.from(part.domNode.querySelector('summary')?.children ?? []).map(element => element.classList.item(0)),
		});
		const states = [readState()];

		diffs.set([
			{ ...emptySessionEntryDiff(URI.file('/file1.ts'), URI.file('/file1.ts')), added: 5, removed: 2 },
			{ ...emptySessionEntryDiff(URI.file('/file2.ts'), URI.file('/file2.ts')), added: 3, removed: 1 },
		], undefined);
		states.push(readState());

		assert.deepStrictEqual(states, [
			{
				display: 'none',
				files: '0 files changed',
				additions: '+0',
				deletions: '-0',
				headerOrder: ['chat-file-changes-label', 'chat-file-changes-counts', 'chat-view-changes-icon', 'chat-file-changes-chevron'],
			},
			{
				display: '',
				files: '2 files changed',
				additions: '+8',
				deletions: '-3',
				headerOrder: ['chat-file-changes-label', 'chat-file-changes-counts', 'chat-view-changes-icon', 'chat-file-changes-chevron'],
			},
		]);
	});

	test('signals user toggles and rotates the disclosure chevron', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatResponseFileChangesService, {
			_serviceBrand: undefined,
			registerProvider: () => Disposable.None,
			getChangesForRequest: () => observableValue('testFileChanges', [
				emptySessionEntryDiff(URI.file('/file.ts'), URI.file('/file.ts'))
			]),
		});
		const part = store.add(instantiationService.createInstance(
			ChatCheckpointFileChangesSummaryContentPart,
			{
				kind: 'changesSummary',
				requestId: 'request',
				sessionResource: URI.parse('chat-session://test/session'),
			},
			{} as IChatContentPartRenderContext,
		));
		let toggleCount = 0;
		const listener = () => toggleCount++;
		part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
		store.add(toDisposable(() => part.domNode.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));

		const header = part.domNode.querySelector<HTMLElement>('summary');
		const details = part.domNode.querySelector<HTMLDetailsElement>('details');
		const chevron = part.domNode.querySelector('.chat-file-changes-chevron');
		assert.ok(header);
		assert.ok(details);
		assert.ok(chevron);
		header.click();
		details.dispatchEvent(new Event('toggle'));

		assert.deepStrictEqual({
			open: details.open,
			expandedChevron: chevron.classList.contains('expanded'),
			toggleCount,
		}, {
			open: true,
			expandedChevron: true,
			toggleCount: 1,
		});
	});
});
