/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { getSessionChatPillMenu, SessionChatPillKind, SessionChatPillVisibility } from '../../common/sessionChatPills.js';

suite('SessionChatPills', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('groups kinds with data ahead of those without, and omits the never-hideable Changes pill', () => {
		const menu = getSessionChatPillMenu(
			new Set([SessionChatPillKind.Changes, SessionChatPillKind.PullRequests, SessionChatPillKind.Subagents]),
			new Set([SessionChatPillKind.PullRequests]),
		);

		assert.deepStrictEqual(menu, {
			withData: [
				{ kind: SessionChatPillKind.PullRequests, label: 'Pull Requests', checked: false },
				{ kind: SessionChatPillKind.Subagents, label: 'Subagents', checked: true },
			],
			withoutData: [
				{ kind: SessionChatPillKind.Artifacts, label: 'Artifacts', checked: true },
				{ kind: SessionChatPillKind.Customizations, label: 'Customizations', checked: true },
				{ kind: SessionChatPillKind.Issues, label: 'Issues', checked: true },
				{ kind: SessionChatPillKind.Browsers, label: 'Browsers', checked: true },
			],
		});
	});

	test('offers Hide for the right-clicked pill, but never for Changes', () => {
		const kindsWithData = new Set([SessionChatPillKind.Changes, SessionChatPillKind.Issues]);

		assert.deepStrictEqual({
			issues: getSessionChatPillMenu(kindsWithData, new Set(), SessionChatPillKind.Issues).hide,
			changes: getSessionChatPillMenu(kindsWithData, new Set(), SessionChatPillKind.Changes).hide,
			noTarget: getSessionChatPillMenu(kindsWithData, new Set()).hide,
		}, {
			issues: { kind: SessionChatPillKind.Issues, label: 'Hide Issues' },
			changes: undefined,
			noTarget: undefined,
		});
	});

	test('hides customizations and subagents by default, and always shows changes', () => {
		const visibility = disposables.add(new SessionChatPillVisibility(disposables.add(new TestStorageService())));

		assert.deepStrictEqual({
			customizations: visibility.isVisible(SessionChatPillKind.Customizations, undefined),
			subagents: visibility.isVisible(SessionChatPillKind.Subagents, undefined),
			artifacts: visibility.isVisible(SessionChatPillKind.Artifacts, undefined),
			changes: visibility.isVisible(SessionChatPillKind.Changes, undefined),
		}, {
			customizations: false,
			subagents: false,
			artifacts: true,
			changes: true,
		});
	});

	test('changes cannot be hidden or toggled off', () => {
		const visibility = disposables.add(new SessionChatPillVisibility(disposables.add(new TestStorageService())));
		visibility.hide(SessionChatPillKind.Changes);
		visibility.toggle(SessionChatPillKind.Changes);

		assert.deepStrictEqual({
			visible: visibility.isVisible(SessionChatPillKind.Changes, undefined),
			hiddenKinds: [...visibility.readHiddenKinds(undefined)],
		}, {
			visible: true,
			hiddenKinds: [SessionChatPillKind.Customizations, SessionChatPillKind.Subagents],
		});
	});

	test('hides a pill, then toggles it off and on again, persisting the choice', () => {
		const storageService = disposables.add(new TestStorageService());
		const visibility = disposables.add(new SessionChatPillVisibility(storageService));

		const initiallyVisible = visibility.isVisible(SessionChatPillKind.PullRequests, undefined);
		visibility.hide(SessionChatPillKind.PullRequests);
		const afterHide = {
			pullRequests: visibility.isVisible(SessionChatPillKind.PullRequests, undefined),
			issues: visibility.isVisible(SessionChatPillKind.Issues, undefined),
			restored: disposables.add(new SessionChatPillVisibility(storageService)).isVisible(SessionChatPillKind.PullRequests, undefined),
		};
		// Hiding an already-hidden pill is a no-op, so one toggle brings it back.
		visibility.hide(SessionChatPillKind.PullRequests);
		visibility.toggle(SessionChatPillKind.PullRequests);

		assert.deepStrictEqual({
			initiallyVisible,
			afterHide,
			afterShow: visibility.isVisible(SessionChatPillKind.PullRequests, undefined),
		}, {
			initiallyVisible: true,
			afterHide: { pullRequests: false, issues: true, restored: false },
			afterShow: true,
		});
	});
});
