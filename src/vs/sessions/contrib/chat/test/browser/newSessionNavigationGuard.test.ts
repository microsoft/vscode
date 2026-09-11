/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewSessionComposer, NewSessionWorkspacePreselectionSource } from '../../browser/newSessionComposerService.js';
import { NewSessionNavigationGuard } from '../../browser/newSessionNavigationGuard.js';

suite('New session navigation guard', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function session(sessionId: string, created: boolean): IActiveSession {
		return new class extends mock<IActiveSession>() {
			override readonly sessionId = sessionId;
			override readonly isCreated = constObservable(created);
		}();
	}

	function setupGuard(automatic = false, initialSession?: IActiveSession) {
		const active = observableValue<IActiveSession | undefined>('active', initialSession);
		const hasInput = observableValue('hasInput', false);
		const composer = {
			hasInput,
			workspacePreselectionSource: NewSessionWorkspacePreselectionSource.RecentWorkspace,
			animatePrompt: async () => true,
			showPromptOptions: () => true,
		};
		const composers = observableValue<INewSessionComposer | undefined>('composer', composer);
		const guard = store.add(new NewSessionNavigationGuard(active, composers, automatic));
		return { active, hasInput, composer, composers, guard };
	}

	test('permits an automatic draft appearing while launch waits for setup or providers', () => {
		const { active, guard } = setupGuard(true);
		active.set(session('remembered-folder', false), undefined);
		assert.strictEqual(guard.canNavigate, true);
	});

	test('input cancels a pending selection permanently, even if the text is cleared again', () => {
		const { hasInput, guard } = setupGuard(true);
		hasInput.set(true, undefined);
		hasInput.set(false, undefined);
		assert.strictEqual(guard.canNavigate, false);
	});

	test('a newly mounted composer with a restored draft cancels the pending selection', () => {
		const { composers, composer, guard } = setupGuard(true);
		composers.set({ ...composer, hasInput: constObservable(true) }, undefined);
		assert.strictEqual(guard.token.isCancellationRequested, true);
	});

	test('rechecks a newer explicit folder selection before a late provider is applied', () => {
		const { composer, guard } = setupGuard(true);
		composer.workspacePreselectionSource = NewSessionWorkspacePreselectionSource.User;
		assert.strictEqual(guard.canNavigate, false);
	});

	test('opening an existing session wins over a delayed launch', () => {
		const { active, guard } = setupGuard(true);
		active.set(session('existing-conversation', true), undefined);
		assert.strictEqual(guard.token.isCancellationRequested, true);
	});

	test('explicit recovery may leave a user-picked folder but not override a subsequent choice', () => {
		const { active, composer, guard } = setupGuard(false, session('wrong-folder', false));
		composer.workspacePreselectionSource = NewSessionWorkspacePreselectionSource.User;
		const before = guard.canNavigate;
		active.set(session('newer-folder', false), undefined);
		assert.deepStrictEqual({ before, after: guard.canNavigate }, { before: true, after: false });
	});

	test('the intended folderless composer activation does not cancel itself', () => {
		const { active, guard } = setupGuard(false, session('existing-conversation', true));
		guard.openComposer(() => active.set(session('pending-draft', false), undefined));
		const before = guard.canNavigate;
		active.set(session('newer-conversation', true), undefined);
		assert.deepStrictEqual({ before, after: guard.canNavigate }, { before: true, after: false });
	});

	test('disposal cancels pending trust or setup work', () => {
		const { guard } = setupGuard();
		guard.dispose();
		assert.strictEqual(guard.token.isCancellationRequested, true);
	});
});
