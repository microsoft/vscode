/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface IComment {
	user: string;
	body: string;
	created_at: string;
	updated_at: string;
	html_url: string;
	pull_request_url: string;
}

export function getComments(): IComment[] {
	return [
		{
			user: 'isidorn',
			body: `The proper way to do all this action command business is the following:\r\n* Have a command that is self contained and does the actual work\r\n* Use the command everywhere except Action Bar\r\n* For the Action Bar instatiate an Action that will only use the commandService to execute the command\r\n\r\nThat patter is cleanest and we use it all over the place (especially explorer).\r\nIf you do not want to tackle it in this PR then you can create a debt item.`,
			created_at: '2018-03-22T09:13:21Z',
			updated_at: '2018-03-26T18:27:15Z',
			html_url: 'https://github.com/Microsoft/vscode/pull/46311#discussion_r176348736',
			pull_request_url: 'https://api.github.com/repos/Microsoft/vscode/pulls/46311'
		},
		{
			user: 'roblourens',
			body: `This works fine and we have it for instance in debug land.\r\nHowever this is an old way to do this - it is a sort of bridge between comands and actions.\r\n\r\nSince all your things could be commands this can than be much simpliar without any action items and things like that.\r\nI suggest to look here for an inspiration on how to do it if all you guys are commands\r\nhttps://github.com/Microsoft/vscode/blob/roblou/searchContextMenu/src/vs/workbench/parts/files/electron-browser/views/openEditorsView.ts#L312`,
			created_at: '2018-03-22T09:20:05Z',
			updated_at: '2018-03-26T18:27:15Z',
			html_url: 'https://github.com/Microsoft/vscode/pull/46311#discussion_r176350585',
			pull_request_url: 'https://api.github.com/repos/Microsoft/vscode/pulls/46311',

		}
	];
}