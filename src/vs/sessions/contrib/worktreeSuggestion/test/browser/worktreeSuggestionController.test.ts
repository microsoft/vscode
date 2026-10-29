/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { SessionInputPickerVisibility } from '../../../../services/sessions/common/sessionPickerVisibility.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { WorktreeSuggestionVariant } from '../../common/worktreeSuggestion.js';
import { WorktreeSuggestionController } from '../../browser/worktreeSuggestionController.js';
import { IWorktreeSuggestionService, WorktreeSpotlightChoice } from '../../browser/worktreeSuggestionService.js';
import { TestWorktreeSuggestionService } from './worktreeSuggestionTestUtils.js';

suite('WorktreeSuggestionController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createController(variant: WorktreeSuggestionVariant, options: { isolationPicker?: boolean } = {}) {
		const service = new TestWorktreeSuggestionService(variant);
		const session = new class extends mock<IActiveSession>() { override readonly sessionId = 'draft'; }();
		const composer: string[] = [];
		const onDidChangeInput = store.add(new Emitter<void>());
		let input = '';
		const pickerVisibility = store.add(new SessionInputPickerVisibility());
		pickerVisibility.setVisible('worktree', options.isolationPicker ?? true);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorktreeSuggestionService, service);
		// Attached, so that focus can move between the hint and the input.
		const container = mainWindow.document.body.appendChild(document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const controller = store.add(instantiationService.createInstance(WorktreeSuggestionController, container, {
			session: constObservable(session),
			pickerVisibility,
			visible: constObservable(true),
			getInputValue: () => input,
			onDidChangeInput: onDidChangeInput.event,
			focusInput: () => composer.push('focusInput'),
			revealIsolationPicker: () => composer.push('revealIsolationPicker'),
			openIsolationPicker: () => composer.push('openIsolationPicker'),
		}));
		const hint = container.querySelector<HTMLElement>('.new-session-worktree-suggestion')!;
		return {
			controller,
			service,
			pickerVisibility,
			composer,
			type: (text: string) => {
				input = text;
				onDidChangeInput.fire();
			},
			hint: () => hint.style.display === 'none' ? undefined : hint.querySelector('.new-session-worktree-suggestion-message')?.textContent,
			clickUseWorktree: () => hint.querySelector<HTMLElement>('.monaco-button')!.click(),
			clickClose: () => hint.querySelector<HTMLElement>('.monaco-action-bar .action-label')!.click(),
			/** Presses Escape on the focused Use Worktree button, which handles Escape itself. */
			pressEscape: () => {
				const button = hint.querySelector<HTMLElement>('.monaco-button')!;
				button.focus();
				button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			},
			closeLabel: () => hint.querySelector<HTMLElement>('.monaco-action-bar .action-label')!.getAttribute('aria-label'),
			buttonLabel: () => hint.querySelector<HTMLElement>('.monaco-button')!.textContent,
		};
	}

	test('reports that a suggestion would appear in every arm, once the isolation picker shows Branch', () => {
		const reports = Object.fromEntries([WorktreeSuggestionVariant.Off, WorktreeSuggestionVariant.SpotlightOnSend, WorktreeSuggestionVariant.InlineHint, WorktreeSuggestionVariant.UncommittedFilesCount].map(variant => {
			const { service, pickerVisibility } = createController(variant, { isolationPicker: false });
			const before = service.wouldShowReports;
			pickerVisibility.setVisible('worktree', true);
			return [variant, { before, after: service.wouldShowReports > 0 }];
		}));

		const expected = { before: 0, after: true };
		assert.deepStrictEqual(reports, { off: expected, spotlightOnSend: expected, inlineHint: expected, uncommittedFilesCount: expected });
	});

	test('the inline hint opens the isolation picker for the user to choose, hides for the session on Escape, and closes for good', () => {
		const escaped = createController(WorktreeSuggestionVariant.InlineHint);
		escaped.type('Add a dark theme');
		const shown = { message: escaped.hint(), button: escaped.buttonLabel() };
		escaped.clickUseWorktree();
		escaped.pressEscape();

		const closed = createController(WorktreeSuggestionVariant.InlineHint);
		closed.type('Add a dark theme');
		const closeLabel = closed.closeLabel();
		closed.clickClose();
		closed.type('Add a light theme');

		assert.deepStrictEqual({
			beforeTyping: createController(WorktreeSuggestionVariant.InlineHint).hint(),
			shown,
			escaped: { hint: escaped.hint(), composer: escaped.composer, calls: escaped.service.calls, closedForGood: escaped.service.isHintClosed(undefined) },
			closeLabel,
			closed: { hint: closed.hint(), calls: closed.service.calls, closedForGood: closed.service.isHintClosed(undefined) },
		}, {
			beforeTyping: undefined,
			shown: { message: 'main has 3 uncommitted files. Worktrees allow agents to run on a separate copy of the files.', button: 'Use Worktree' },
			escaped: { hint: undefined, composer: ['openIsolationPicker', 'focusInput'], calls: ['shown:inlineHint', 'opened:inlineHint', 'declined:inlineHint'], closedForGood: false },
			closeLabel: 'Close and Don\'t Show Again',
			closed: { hint: undefined, calls: ['shown:inlineHint', 'hintClosed'], closedForGood: true },
		});
	});

	test('the spotlight asks once, as the request is sent, and switches to a new worktree before sending when chosen', async () => {
		const send = async (choice: WorktreeSpotlightChoice | undefined, options: { query?: string; available?: boolean; variant?: WorktreeSuggestionVariant } = {}) => {
			const { controller, service, composer } = createController(options.variant ?? WorktreeSuggestionVariant.SpotlightOnSend);
			service.spotlightChoice = choice;
			service.spotlightAvailable = options.available ?? true;
			const sends = await controller.confirmBeforeSend(options.query ?? 'Add a dark theme');
			return { sends, calls: service.calls, composer };
		};

		assert.deepStrictEqual({
			sendInWorktree: await send(WorktreeSpotlightChoice.Worktree),
			send: await send(WorktreeSpotlightChoice.Branch),
			notShown: await send(undefined),
			alreadyShown: await send(WorktreeSpotlightChoice.Worktree, { available: false }),
			command: await send(WorktreeSpotlightChoice.Worktree, { query: '/compact' }),
			otherArm: await send(WorktreeSpotlightChoice.Worktree, { variant: WorktreeSuggestionVariant.InlineHint }),
		}, {
			sendInWorktree: { sends: true, calls: ['spotlight:worktree', 'useWorktree:spotlightOnSend'], composer: ['revealIsolationPicker'] },
			send: { sends: true, calls: ['spotlight:branch'], composer: ['revealIsolationPicker'] },
			notShown: { sends: true, calls: ['spotlight:notShown'], composer: ['revealIsolationPicker'] },
			alreadyShown: { sends: true, calls: [], composer: [] },
			command: { sends: true, calls: [], composer: [] },
			otherArm: { sends: true, calls: [], composer: [] },
		});
	});
});
