/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { GitChangeType } from './models/file';
import { FileChange, PullRequest } from './treeItems';

export class Resource {
	static icons: any;

	static initialize(context: vscode.ExtensionContext) {
		Resource.icons = {
			light: {
				Modified: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-modified.svg')),
				Added: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-added.svg')),
				Deleted: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-deleted.svg')),
				Renamed: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-renamed.svg')),
				Copied: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-copied.svg')),
				Untracked: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-untrackedt.svg')),
				Ignored: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-ignored.svg')),
				Conflict: context.asAbsolutePath(path.join('resources', 'icons', 'light', 'status-conflict.svg')),
			},
			dark: {
				Modified: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-modified.svg')),
				Added: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-added.svg')),
				Deleted: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-deleted.svg')),
				Renamed: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-renamed.svg')),
				Copied: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-copied.svg')),
				Untracked: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-untracked.svg')),
				Ignored: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-ignored.svg')),
				Conflict: context.asAbsolutePath(path.join('resources', 'icons', 'dark', 'status-conflict.svg'))
			}
		};
	}

	static getFileStatusUri(element: FileChange): vscode.Uri | { light: vscode.Uri, dark: vscode.Uri } {
		let iconUri: vscode.Uri;
		let iconDarkUri: vscode.Uri;

		switch (element.status) {
			case GitChangeType.ADD:
				iconUri = vscode.Uri.parse(Resource.icons.light.Added);
				iconDarkUri = vscode.Uri.parse(Resource.icons.dark.Added);
				break;
			case GitChangeType.COPY:
				iconUri = vscode.Uri.parse(Resource.icons.light.Copied);
				iconDarkUri = vscode.Uri.parse(Resource.icons.dark.Copied);
				break;
			case GitChangeType.DELETE:
				iconUri = vscode.Uri.parse(Resource.icons.light.Deleted);
				iconDarkUri = vscode.Uri.parse(Resource.icons.dark.Deleted);
				break;
			case GitChangeType.MODIFY:
				iconUri = vscode.Uri.parse(Resource.icons.light.Modified);
				iconDarkUri = vscode.Uri.parse(Resource.icons.dark.Modified);
				break;
			case GitChangeType.RENAME:
				iconUri = vscode.Uri.parse(Resource.icons.light.Renamed);
				iconDarkUri = vscode.Uri.parse(Resource.icons.dark.Renamed);
				break;
		}

		return {
			light: iconUri,
			dark: iconDarkUri
		};
	}

	static getGravatarUri(pr: PullRequest, size: number = 64): vscode.Uri {
		let key = pr.prItem.user.avatar_url;
		let gravatar = vscode.Uri.parse(`${key}&s=${size}`);

		// hack, to ensure queries are not wrongly encoded.
		const originalToStringFn = gravatar.toString;
		gravatar.toString = function (skipEncoding?: boolean | undefined) {
			return originalToStringFn.call(gravatar, true);
		};

		return gravatar;
	}
}
