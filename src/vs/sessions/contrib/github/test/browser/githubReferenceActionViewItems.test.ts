/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OpenIssueActionViewItem } from '../../browser/issueActions.js';
import { OpenPullRequestActionViewItem } from '../../browser/pullRequestActions.js';

interface IIssueViewItemTestHarness {
	_issuePickerVisible: boolean;
	readonly _issuesObs: { get(): readonly object[] };
	readonly _hoverService: { hideHover(force?: boolean): void };
	_showIssuePicker(issues: readonly object[]): void;
}

interface IPullRequestViewItemTestHarness {
	_pullRequestList: object | undefined;
	readonly _pullRequestsObs: { get(): readonly object[] };
	readonly _hoverService: { hideHover(force?: boolean): void };
	_showPullRequestPicker(pullRequests: readonly object[]): void;
}

const openIssueViewItemOnDidClickButton = Reflect.get(OpenIssueActionViewItem.prototype, 'onDidClickButton') as (this: IIssueViewItemTestHarness) => void;
const openPullRequestViewItemOnDidClickButton = Reflect.get(OpenPullRequestActionViewItem.prototype, 'onDidClickButton') as (this: IPullRequestViewItemTestHarness) => void;

suite('GitHub Reference Action View Items', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('clicking an open issues list closes it instead of reopening it', () => {
		const events: string[] = [];
		const harness: IIssueViewItemTestHarness = {
			_issuePickerVisible: false,
			_issuesObs: { get: () => [{}, {}] },
			_hoverService: { hideHover: force => events.push(`hide:${force}`) },
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
			_showPullRequestPicker() {
				events.push('show');
				this._pullRequestList = {};
			},
		};

		openPullRequestViewItemOnDidClickButton.call(harness);
		openPullRequestViewItemOnDidClickButton.call(harness);

		assert.deepStrictEqual(events, ['show', 'hide:true']);
	});
});
