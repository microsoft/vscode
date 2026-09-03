/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPillActionViewItem } from '../../../../../workbench/browser/chatPills.js';
import { getAgentMergeAwarePullRequestIcon, ISessionAgentMergeConfiguration } from '../../../../browser/sessionAgentMerge.js';
import { OpenIssueActionViewItem } from '../../browser/issueActions.js';
import { OpenPullRequestActionViewItem } from '../../browser/pullRequestActions.js';

interface IIssueViewItemTestHarness {
	_issuePickerVisible: boolean;
	readonly _issuesObs: { get(): readonly object[] };
	readonly _hoverService: { hideHover(force?: boolean): void };
	hasOpenDropdown(): boolean;
	_showIssuePicker(issues: readonly object[]): void;
}

interface IPullRequestViewItemTestHarness {
	_pullRequestList: object | undefined;
	readonly _pullRequestsObs: { get(): readonly { readonly icon?: ThemeIcon }[] };
	readonly _icon?: { get(): ThemeIcon };
	readonly _hoverService: { hideHover(force?: boolean): void };
	hasOpenDropdown(): boolean;
	_showPullRequestPicker(pullRequests: readonly object[]): void;
}

const openIssueViewItemOnDidClickButton = Reflect.get(OpenIssueActionViewItem.prototype, 'onDidClickButton') as (this: IIssueViewItemTestHarness) => void;
const openPullRequestViewItemOnDidClickButton = Reflect.get(OpenPullRequestActionViewItem.prototype, 'onDidClickButton') as (this: IPullRequestViewItemTestHarness) => void;
const openPullRequestViewItemGetIconElement = Reflect.get(OpenPullRequestActionViewItem.prototype, 'getIconElement') as (this: IPullRequestViewItemTestHarness) => HTMLElement;

class TestDropdownMetaActionViewItem extends ChatPillActionViewItem {

	dropdownVisible = true;
	opened = 0;
	closed = 0;

	protected override hasOpenDropdown(): boolean {
		return this.dropdownVisible;
	}

	protected override onDidClickButton(): void {
		if (this.dropdownVisible) {
			this.dropdownVisible = false;
			this.closed++;
		} else {
			this.dropdownVisible = true;
			this.opened++;
		}
	}
}

suite('GitHub Reference Action View Items', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves an open dropdown for primary activation while allowing secondary dismissal', () => {
		const store = new DisposableStore();
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);

		try {
			const action = store.add(new Action('test', 'Test'));
			const viewItem = store.add(new TestDropdownMetaActionViewItem(undefined, action, {}));
			viewItem.render(container);
			let ancestorMouseDowns = 0;
			store.add(addDisposableListener(container, EventType.MOUSE_DOWN, () => ancestorMouseDowns++));
			store.add(addDisposableListener(mainWindow.document, EventType.MOUSE_DOWN, () => viewItem.dropdownVisible = false));
			const button = container.querySelector<HTMLElement>('.chat-pill-button')!;

			button.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
			button.dispatchEvent(new MouseEvent(EventType.CLICK, { bubbles: true }));

			const afterPrimaryClick = {
				ancestorMouseDowns,
				opened: viewItem.opened,
				closed: viewItem.closed,
				dropdownVisible: viewItem.dropdownVisible,
			};
			viewItem.dropdownVisible = true;
			button.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 2 }));

			assert.deepStrictEqual({
				afterPrimaryClick,
				ancestorMouseDowns,
				dropdownVisible: viewItem.dropdownVisible,
			}, {
				afterPrimaryClick: {
					ancestorMouseDowns: 1,
					opened: 0,
					closed: 1,
					dropdownVisible: false,
				},
				ancestorMouseDowns: 2,
				dropdownVisible: false,
			});
		} finally {
			store.dispose();
			container.remove();
		}
	});

	test('clicking an open issues list closes it instead of reopening it', () => {
		const events: string[] = [];
		const harness: IIssueViewItemTestHarness = {
			_issuePickerVisible: false,
			_issuesObs: { get: () => [{}, {}] },
			_hoverService: { hideHover: force => events.push(`hide:${force}`) },
			hasOpenDropdown() {
				return this._issuePickerVisible;
			},
			_showIssuePicker() {
				events.push('show');
				this._issuePickerVisible = true;
			},
		};

		openIssueViewItemOnDidClickButton.call(harness);
		openIssueViewItemOnDidClickButton.call(harness);

		assert.deepStrictEqual(events, ['show', 'hide:true']);
	});

	test('clicking an open pull request list closes it instead of reopening it', () => {
		const events: string[] = [];
		const harness: IPullRequestViewItemTestHarness = {
			_pullRequestList: undefined,
			_pullRequestsObs: { get: () => [{}, {}] },
			_hoverService: { hideHover: force => events.push(`hide:${force}`) },
			hasOpenDropdown() {
				return !!this._pullRequestList;
			},
			_showPullRequestPicker() {
				events.push('show');
				this._pullRequestList = {};
			},
		};

		openPullRequestViewItemOnDidClickButton.call(harness);
		openPullRequestViewItemOnDidClickButton.call(harness);

		assert.deepStrictEqual(events, ['show', 'hide:true']);
	});

	test('Agent Merge shows the open pull request icon instead of blocker variants', () => {
		const agentMerge = (overrides: Partial<ISessionAgentMergeConfiguration['actions']> = {}): ISessionAgentMergeConfiguration => ({
			enabled: true,
			actions: {
				addressReviews: true,
				fixCI: true,
				resolveConflicts: true,
				mergePullRequest: 'never',
				mergeMethod: 'auto',
				replyAttribution: true,
				...overrides,
			},
		});
		let icon = getAgentMergeAwarePullRequestIcon(Codicon.gitPullRequestError, agentMerge(), { hasFailingChecks: true });
		const harness: IPullRequestViewItemTestHarness = {
			_pullRequestList: undefined,
			_pullRequestsObs: { get: () => [{ icon }] },
			_icon: { get: () => icon },
			_hoverService: { hideHover() { } },
			hasOpenDropdown: () => false,
			_showPullRequestPicker() { },
		};
		const iconId = () => [...openPullRequestViewItemGetIconElement.call(harness).classList]
			.find(className => className.startsWith('codicon-git-pull-request'));

		const failingCI = iconId();
		icon = getAgentMergeAwarePullRequestIcon(Codicon.gitPullRequestError, agentMerge({ addressReviews: false }), { hasFailingChecks: true, hasUnresolvedComments: true });
		const unhandledReviewAlongsideCI = iconId();
		icon = getAgentMergeAwarePullRequestIcon(Codicon.gitPullRequestError, agentMerge(), {});
		const unknownBlocker = iconId();
		icon = getAgentMergeAwarePullRequestIcon(Codicon.gitPullRequestError, agentMerge({ fixCI: false }), { hasFailingChecks: true });
		const failingCIDisabled = iconId();
		icon = getAgentMergeAwarePullRequestIcon(Codicon.gitPullRequestComment, agentMerge());
		const reviewComments = iconId();
		icon = getAgentMergeAwarePullRequestIcon(Codicon.gitPullRequestComment, agentMerge({ addressReviews: false }));

		assert.deepStrictEqual({
			failingCI,
			unhandledReviewAlongsideCI,
			unknownBlocker,
			failingCIDisabled,
			reviewComments,
			reviewsDisabled: iconId(),
		}, {
			failingCI: 'codicon-git-pull-request',
			unhandledReviewAlongsideCI: 'codicon-git-pull-request-error',
			unknownBlocker: 'codicon-git-pull-request-error',
			failingCIDisabled: 'codicon-git-pull-request-error',
			reviewComments: 'codicon-git-pull-request',
			reviewsDisabled: 'codicon-git-pull-request-comment',
		});
	});
});
