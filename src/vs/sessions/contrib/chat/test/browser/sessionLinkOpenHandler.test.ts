/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IOpenerService, type OpenExternalOptions, type OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { isGitHubIssueOrPullRequestLink, registerOpenGitHubLinksInExternalBrowser } from '../../browser/sessionLinkOpenHandler.js';

suite('Sessions - Link Open Handler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes GitHub issue and pull request links', () => {
		assert.deepStrictEqual({
			issue: isGitHubIssueOrPullRequestLink('https://github.com/microsoft/vscode/issues/338472'),
			issueComment: isGitHubIssueOrPullRequestLink('https://www.github.com/microsoft/vscode/issues/338472#issuecomment-1'),
			pullRequest: isGitHubIssueOrPullRequestLink('https://github.com/microsoft/vscode/pull/338472/files'),
			repository: isGitHubIssueOrPullRequestLink('https://github.com/microsoft/vscode'),
			invalidNumber: isGitHubIssueOrPullRequestLink('https://github.com/microsoft/vscode/issues/0'),
			differentHost: isGitHubIssueOrPullRequestLink('https://example.com/microsoft/vscode/issues/338472'),
		}, {
			issue: true,
			issueComment: true,
			pullRequest: true,
			repository: false,
			invalidNumber: false,
			differentHost: false,
		});
	});

	test('opens modified GitHub issue and pull request link activations in the external browser', () => {
		const opened: { readonly resource: string; readonly options: OpenInternalOptions | OpenExternalOptions | undefined }[] = [];
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: URI | string, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
				opened.push({ resource: resource.toString(), options });
				return true;
			}
		};
		const container = dom.$('div');
		const pullRequestLink = dom.append(container, dom.$('a', { 'data-href': 'https://github.com/microsoft/vscode/pull/338472' }));
		const pullRequestLabel = dom.append(pullRequestLink, dom.$('span', undefined, 'Pull request'));
		const issueLink = dom.append(container, dom.$('a', { 'data-href': 'https://github.com/microsoft/vscode/issues/338472' }));
		const repository = dom.append(container, dom.$('a', { 'data-href': 'https://github.com/microsoft/vscode' }));
		disposables.add(registerOpenGitHubLinksInExternalBrowser(container, openerService));

		pullRequestLabel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
		repository.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
		pullRequestLabel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
		const ctrlRightClick = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, ctrlKey: true });
		issueLink.dispatchEvent(ctrlRightClick);
		issueLink.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
		pullRequestLink.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', metaKey: true }));

		assert.deepStrictEqual({
			opened,
			ctrlRightClickPrevented: ctrlRightClick.defaultPrevented,
		}, {
			opened: [
				{
					resource: 'https://github.com/microsoft/vscode/pull/338472',
					options: { openExternal: true, allowContributedOpeners: false, fromUserGesture: true },
				},
				{
					resource: 'https://github.com/microsoft/vscode/issues/338472',
					options: { openExternal: true, allowContributedOpeners: false, fromUserGesture: true },
				},
				{
					resource: 'https://github.com/microsoft/vscode/pull/338472',
					options: { openExternal: true, allowContributedOpeners: false, fromUserGesture: true },
				},
			],
			ctrlRightClickPrevented: false,
		});
	});
});
