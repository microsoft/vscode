/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderTimelineEvent, getStatus } from './pullRequestOverviewRenderer';

// declare var acquireVsCodeApi: any;
// const vscode = acquireVsCodeApi();

function handleMessage(event: any) {
	const message = event.data; // The json data that the extension sent
	switch (message.command) {
		case 'initialize':
			document.getElementById('pullrequest')!.innerHTML = message.pullrequest.events.map(renderTimelineEvent).join('');
			setTitleHTML(message.pullrequest);
			break;
		default:
			break;
	}
}

window.addEventListener('message', handleMessage);


function setTitleHTML(pr: any) {
	document.getElementById('title')!.innerHTML = `
			<div class="prIcon"><svg width="64" height="64" class="octicon octicon-git-compare" viewBox="0 0 14 16" version="1.1" aria-hidden="true"><path fill="#FFFFFF" fill-rule="evenodd" d="M5 12H4c-.27-.02-.48-.11-.69-.31-.21-.2-.3-.42-.31-.69V4.72A1.993 1.993 0 0 0 2 1a1.993 1.993 0 0 0-1 3.72V11c.03.78.34 1.47.94 2.06.6.59 1.28.91 2.06.94h1v2l3-3-3-3v2zM2 1.8c.66 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2C1.35 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2zm11 9.48V5c-.03-.78-.34-1.47-.94-2.06-.6-.59-1.28-.91-2.06-.94H9V0L6 3l3 3V4h1c.27.02.48.11.69.31.21.2.3.42.31.69v6.28A1.993 1.993 0 0 0 12 15a1.993 1.993 0 0 0 1-3.72zm-1 2.92c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"></path></svg></div>
			<div class="details">
				<div>
					<h2>${pr.title} (<a href=${pr.html_url}>#${pr.number}</a>) </h2>
				</div>
				<div>
					<div class="status">${getStatus(pr)}</div>
					<img class="avatar" src="${pr.author.avatar_url}">
					<strong class="author"><a href="${pr.author.html_url}">${pr.author.login}</a></strong>
				</div>
				<div class="comment-body">
					${pr.body}
				</div>
			</div>
		`;
}