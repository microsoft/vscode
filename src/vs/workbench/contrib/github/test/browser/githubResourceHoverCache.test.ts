/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toAction } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatPillEntry } from '../../../../browser/chatPills.js';
import { IGitHubResourceHover } from '../../browser/githubResourceHover.js';
import { GitHubResourceHoverCache } from '../../browser/githubResourceHoverCache.js';

suite('GitHubResourceHoverCache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createContainer(): HTMLElement {
		const container = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		return container;
	}

	function createHover(title: string): IGitHubResourceHover {
		const element = $('div');
		const button = append(element, $('button', undefined, title));
		return { element, tabbableElements: [button] };
	}

	async function render(presentation: ReturnType<GitHubResourceHoverCache['get']>, density: 'default' | 'compact'): Promise<HTMLElement> {
		if (density === 'default' && isManagedHoverTooltipHTMLElement(presentation.pillHover)) {
			return presentation.pillHover.element(CancellationToken.None);
		}
		const content = presentation.hover?.content;
		const element = typeof content === 'function' ? content() : content;
		if (!(element instanceof HTMLElement)) {
			throw new Error('Expected an HTML hover');
		}
		return element;
	}

	for (const density of ['default', 'compact'] as const) {
		test(`preserves the open ${density} snapshot and focus, then renders fresh data on reopening`, async () => {
			const cache = store.add(new GitHubResourceHoverCache());
			const container = createContainer();
			const entry: IChatPillEntry = { id: 'pr', label: 'Original', open: () => { } };
			const first = cache.get('owner/repo/1', entry, () => createHover('Original'));
			const element = append(container, await render(first, density));
			const button = element.querySelector('button')!;
			button.focus();

			const refreshed = cache.get('owner/repo/1', { ...entry, label: 'Updated' }, () => createHover('Updated'));
			const activeElement = await render(refreshed, density);
			const whileOpen = {
				samePillHover: first.pillHover === refreshed.pillHover,
				sameDropdownHover: first.hover === refreshed.hover,
				sameElement: element === activeElement,
				sameControl: activeElement.querySelector('button') === button,
				focusPreserved: mainWindow.document.activeElement === button,
				title: activeElement.textContent,
			};
			element.remove();
			const reopened = append(container, await render(refreshed, density));

			assert.deepStrictEqual({
				whileOpen,
				reopenedTitle: reopened.textContent,
				reopenedTabbableTitle: density === 'compact' ? refreshed.hover?.getTabbableElements?.()[0].textContent : undefined,
			}, {
				whileOpen: {
					samePillHover: true, sameDropdownHover: true, sameElement: true,
					sameControl: true, focusPreserved: true, title: 'Original',
				},
				reopenedTitle: 'Updated',
				reopenedTabbableTitle: density === 'compact' ? 'Updated' : undefined,
			});
		});

		test(`completes initial ${density} metadata in place and ignores subsequent refreshes`, async () => {
			const cache = store.add(new GitHubResourceHoverCache());
			const container = createContainer();
			const entry: IChatPillEntry = { id: 'pr', label: 'Recorded title', open: () => { } };
			const first = cache.get('owner/repo/1', entry, undefined);
			const element = append(container, await render(first, density));
			const resolved = cache.get('owner/repo/1', entry, () => createHover('Resolved'));
			const resolvedTitle = element.textContent;
			cache.get('owner/repo/1', entry, () => createHover('Later update'));

			assert.deepStrictEqual({
				sameDescriptor: first.pillHover === resolved.pillHover,
				sameElement: element === await render(resolved, density),
				resolvedTitle,
				snapshotTitle: element.textContent,
			}, { sameDescriptor: true, sameElement: true, resolvedTitle: 'Resolved', snapshotTitle: 'Resolved' });
		});

		test(`does not fill a dismissed ${density} hover when metadata arrives`, async () => {
			const cache = store.add(new GitHubResourceHoverCache());
			const container = createContainer();
			const entry: IChatPillEntry = { id: 'pr', label: 'Recorded title', open: () => { } };
			const first = cache.get('owner/repo/1', entry, undefined);
			const dismissed = append(container, await render(first, density));
			dismissed.remove();
			const resolved = cache.get('owner/repo/1', entry, () => createHover('Resolved'));
			const dismissedTitle = dismissed.textContent;
			const reopened = await render(resolved, density);

			assert.deepStrictEqual({ dismissedTitle, reopenedTitle: reopened.textContent }, {
				dismissedTitle: 'Recorded title', reopenedTitle: 'Resolved',
			});
		});
	}

	test('retains footer action identities with current callbacks and evicts removed entries and scopes', async () => {
		const cache = store.add(new GitHubResourceHoverCache());
		const calls: string[] = [];
		const entry = (label: string): IChatPillEntry => ({
			id: 'pr', label, open: () => { },
			toolbarActions: [toAction({ id: 'copy', label: 'Copy URL', run: () => calls.push(label) })],
			promotedAction: toAction({ id: 'remove', label: `Remove ${label}`, run: () => calls.push(`remove ${label}`) }),
		});
		cache.retain(new Set(['owner/repo/1']), 'session-1');
		const first = cache.get('owner/repo/1', entry('Original'), () => createHover('Original'));
		const updated = cache.get('owner/repo/1', entry('Updated'), () => createHover('Updated'));
		await first.toolbarActions?.[0].run();
		await first.promotedAction?.run();
		cache.retain(new Set());
		const afterRemoval = cache.get('owner/repo/1', entry('Restored'), () => createHover('Restored'));
		cache.retain(new Set(['owner/repo/1']), 'session-2');
		const afterScopeChange = cache.get('owner/repo/1', entry('Other session'), () => createHover('Other session'));

		assert.deepStrictEqual({
			sameCopy: first.toolbarActions?.[0] === updated.toolbarActions?.[0],
			sameRemove: first.promotedAction === updated.promotedAction,
			removeLabel: first.promotedAction?.label,
			calls,
			evicted: first.pillHover !== afterRemoval.pillHover,
			newScope: afterRemoval.pillHover !== afterScopeChange.pillHover,
		}, {
			sameCopy: true, sameRemove: true, removeLabel: 'Remove Updated',
			calls: ['Updated', 'remove Updated'], evicted: true, newScope: true,
		});
	});
});
