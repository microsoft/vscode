/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { dirname, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ConfirmedReason, ToolConfirmKind } from '../../chatService/chatService.js';
import {
	ILanguageModelToolConfirmationActions,
	ILanguageModelToolConfirmationContribution,
	ILanguageModelToolConfirmationRef
} from '../languageModelToolsConfirmationService.js';

export interface IExternalPathInfo {
	path: string;
	isDirectory: boolean;
}

/**
 * Confirmation contribution for read_file and list_dir tools that allows users to approve
 * accessing paths outside the workspace, with an option to allow all access
 * from a containing folder for the current chat session.
 */
export class ChatExternalPathConfirmationContribution implements ILanguageModelToolConfirmationContribution {
	readonly canUseDefaultApprovals = false;

	private readonly _sessionFolderAllowlist = new ResourceMap<ResourceSet>();

	constructor(
		private readonly _getPathInfo: (ref: ILanguageModelToolConfirmationRef) => IExternalPathInfo | undefined,
	) { }

	getPreConfirmAction(ref: ILanguageModelToolConfirmationRef): ConfirmedReason | undefined {
		const pathInfo = this._getPathInfo(ref);
		if (!pathInfo || !ref.chatSessionResource) {
			return undefined;
		}

		const allowedFolders = this._sessionFolderAllowlist.get(ref.chatSessionResource);
		if (!allowedFolders || allowedFolders.size === 0) {
			return undefined;
		}

		// Parse the file path to a URI
		let pathUri: URI;
		try {
			pathUri = URI.file(pathInfo.path);
		} catch {
			return undefined;
		}

		// Check if path is under any allowed folder
		for (const folderUri of allowedFolders) {
			if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
				return { type: ToolConfirmKind.UserAction };
			}
		}

		return undefined;
	}

	getPreConfirmActions(ref: ILanguageModelToolConfirmationRef): ILanguageModelToolConfirmationActions[] {
		const pathInfo = this._getPathInfo(ref);
		if (!pathInfo || !ref.chatSessionResource) {
			return [];
		}

		// Parse the path to a URI
		let pathUri: URI;
		try {
			pathUri = URI.file(pathInfo.path);
		} catch {
			return [];
		}

		// For directories, use the path itself; for files, use the parent directory
		const folderUri = pathInfo.isDirectory ? pathUri : dirname(pathUri);
		const sessionResource = ref.chatSessionResource;

		return [
			{
				label: localize('allowFolderSession', 'Allow this folder in this session'),
				detail: localize('allowFolderSessionDetail', 'Allow reading files from this folder without further confirmation in this chat session'),
				select: async () => {
					let folders = this._sessionFolderAllowlist.get(sessionResource);
					if (!folders) {
						folders = new ResourceSet();
						this._sessionFolderAllowlist.set(sessionResource, folders);
					}
					folders.add(folderUri);
					return true;
				}
			}
		];
	}
}
