/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

export function isGitHubIssueOrPullRequestLink(href: string): boolean {
	let uri: URI;
	try {
		uri = URI.parse(href);
	} catch {
		return false;
	}

	if ((uri.scheme !== Schemas.http && uri.scheme !== Schemas.https)
		|| (uri.authority.toLowerCase() !== 'github.com' && uri.authority.toLowerCase() !== 'www.github.com')) {
		return false;
	}

	const segments = uri.path.split('/').filter(Boolean);
	if (segments.length < 4 || (segments[2] !== 'issues' && segments[2] !== 'pull') || !/^\d+$/.test(segments[3])) {
		return false;
	}

	const number = Number(segments[3]);
	return Number.isSafeInteger(number) && number > 0;
}

export function registerOpenGitHubLinksInExternalBrowser(container: HTMLElement, openerService: IOpenerService): IDisposable {
	const store = new DisposableStore();
	const openLink = (event: MouseEvent | KeyboardEvent): void => {
		if (!isHTMLElement(event.target)) {
			return;
		}

		const href = event.target.closest<HTMLElement>('a[data-href]')?.dataset.href;
		if (!href || !isGitHubIssueOrPullRequestLink(href)) {
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
