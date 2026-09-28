/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { isGitHubIssueOrPullRequestUrl } from '../../../../platform/github/common/githubUrl.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

export function registerOpenGitHubLinksInExternalBrowser(container: HTMLElement, openerService: IOpenerService, resolveGitHubBaseUrl: () => string | undefined): IDisposable {
	const store = new DisposableStore();
	const openLink = (event: MouseEvent | KeyboardEvent): void => {
		if (!isHTMLElement(event.target)) {
			return;
		}

		const href = event.target.closest<HTMLElement>('a[data-href]')?.dataset.href;
		if (!href || !isGitHubIssueOrPullRequestUrl(href, resolveGitHubBaseUrl())) {
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();
		void openerService.open(href, {
			openExternal: true,
			allowContributedOpeners: false,
			fromUserGesture: true,
		}).catch(onUnexpectedError);
	};

	store.add(addDisposableListener(container, EventType.CLICK, event => {
		if ((event.ctrlKey || event.metaKey) && event.button === 0) {
			openLink(event);
		}
	}, true));
	store.add(addDisposableListener(container, EventType.CONTEXT_MENU, event => {
		if (event.ctrlKey && event.button === 0) {
			openLink(event);
		}
	}, true));
	store.add(addDisposableListener(container, EventType.KEY_DOWN, event => {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			openLink(event);
		}
	}, true));
	return store;
}
