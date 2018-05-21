/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderTimelineEvent, getStatus, renderComment } from './pullRequestOverviewRenderer';

declare var acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

function handleMessage(event: any) {
	const message = event.data; // The json data that the extension sent
	switch (message.command) {
		case 'pr.initialize':
			renderPullRequest(message.pullrequest);
			break;
		case 'pr.update':
			updatePullRequest(message.pullrequest);
			break;
		case 'checked-out':
			updateCheckoutButton(true);
			break;
		case 'append-comment':
			appendComment(message.value);
		default:
			break;
	}
}

window.addEventListener('message', handleMessage);

function renderPullRequest(pullRequest: any) {
	document.getElementById('pullrequest')!.innerHTML = pullRequest.events.map(renderTimelineEvent).join('');
	setTitleHTML(pullRequest);
	setTextArea();
	updateCheckoutButton(pullRequest.isCurrentlyCheckedOut);

	addEventListeners();
}

function updatePullRequest(pullRequest: any) {
	if (pullRequest.state || pullRequest.body || pullRequest.author || pullRequest.title) {
		setTitleHTML(pullRequest);
	}
}

function setTitleHTML(pr: any) {
	document.getElementById('title')!.innerHTML = `
			<div class="prIcon"><svg width="64" height="64" class="octicon octicon-git-compare" viewBox="0 0 14 16" version="1.1" aria-hidden="true"><path fill="#FFFFFF" fill-rule="evenodd" d="M5 12H4c-.27-.02-.48-.11-.69-.31-.21-.2-.3-.42-.31-.69V4.72A1.993 1.993 0 0 0 2 1a1.993 1.993 0 0 0-1 3.72V11c.03.78.34 1.47.94 2.06.6.59 1.28.91 2.06.94h1v2l3-3-3-3v2zM2 1.8c.66 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2C1.35 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2zm11 9.48V5c-.03-.78-.34-1.47-.94-2.06-.6-.59-1.28-.91-2.06-.94H9V0L6 3l3 3V4h1c.27.02.48.11.69.31.21.2.3.42.31.69v6.28A1.993 1.993 0 0 0 12 15a1.993 1.993 0 0 0 1-3.72zm-1 2.92c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"></path></svg></div>
			<div class="details">
				<div class="overview-title">
					<h2>${pr.title} (<a href=${pr.url}>#${pr.number}</a>) </h2> <button id="checkout" aria-live="polite"><svg class="octicon octicon-desktop-download" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M4 6h3V0h2v6h3l-4 4-4-4zm11-4h-4v1h4v8H1V3h4V2H1c-.55 0-1 .45-1 1v9c0 .55.45 1 1 1h5.34c-.25.61-.86 1.39-2.34 2h8c-1.48-.61-2.09-1.39-2.34-2H15c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1z"></path></svg>Checkout Pull Request</button>
				</div>
				<div>
					<div class="status">${getStatus(pr.state)}</div>
					<img class="avatar" src="${pr.author.avatarUrl}" alt="">
					<strong class="author"><a href="${pr.author.html_url}">${pr.author.login}</a></strong>
				</div>
				<div class="comment-body">
					${pr.body}
				</div>
			</div>
		`;
}

function addEventListeners() {
	document.getElementById('checkout')!.addEventListener('click', () => {
		(<HTMLButtonElement>document.getElementById('checkout')).disabled = true;
		vscode.postMessage({
			command: 'pr.checkout'
		});
	});

	document.getElementById('reply-button')!.addEventListener('click', () => {
		(<HTMLButtonElement>document.getElementById('reply-button')).disabled = true;
		vscode.postMessage({
			command: 'pr.comment',
			text: (<HTMLTextAreaElement>document.getElementById('commentTextArea')!).value
		});
		(<HTMLTextAreaElement>document.getElementById('commentTextArea')!).value = '';
	});

	document.getElementById('close-button')!.addEventListener('click', () => {
		(<HTMLButtonElement>document.getElementById('close-button')).disabled = true;
		vscode.postMessage({
			command: 'pr.close'
		});
	});
}

function appendComment(comment: any) {
	let newComment = renderComment(comment);
	document.getElementById('pullrequest')!.insertAdjacentHTML('beforeend', newComment);
}

function updateCheckoutButton(isCheckedOut: boolean) {
	const checkoutButton = (<HTMLButtonElement>document.getElementById('checkout'));
	checkoutButton.disabled = isCheckedOut;
	const checkoutIcon = '<svg class="octicon octicon-desktop-download" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M4 6h3V0h2v6h3l-4 4-4-4zm11-4h-4v1h4v8H1V3h4V2H1c-.55 0-1 .45-1 1v9c0 .55.45 1 1 1h5.34c-.25.61-.86 1.39-2.34 2h8c-1.48-.61-2.09-1.39-2.34-2H15c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1z"></path></svg>';
	const activeIcon = '<svg class="octicon octicon-check" viewBox="0 0 12 16" version="1.1" width="12" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M12 5l-8 8-4-4 1.5-1.5L4 10l6.5-6.5L12 5z"></path></svg>';
	checkoutButton.innerHTML = isCheckedOut ? `${activeIcon} Currently Active` : `${checkoutIcon} Checkout Pull Request`;
}

function setTextArea() {
	(<HTMLTextAreaElement>document.getElementById('commentTextArea')!).placeholder = 'Leave a comment';
	(<HTMLButtonElement>document.getElementById('reply-button')!).textContent = 'Comment';
	(<HTMLButtonElement>document.getElementById('close-button')!).textContent = 'Close pull request';
}