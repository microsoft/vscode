/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import Uri from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Platform } from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
const excludedPathCharactersClause = '[^\\0\\s!$`&*()+\'":;]'; // '":; are allowed in paths but they are often separators so ignore them
const escapedExcludedPathCharactersClause = '(\\\\s|\\\\!|\\\\$|\\\\`|\\\\&|\\\\*|(|)|\\+)';
/** A regex that matches paths in the form /path, ~/path, ./path, ../path */
const UNIX_LIKE_LOCAL_LINK_REGEX = new RegExp('(' + pathPrefix + '?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + '|' + escapedExcludedPathCharactersClause + ')+)+)');

const winPathPrefix = '([a-zA-Z]:|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()+\'":;]';
/** A regex that matches paths in the form c:\path, ~\path, .\path */
const WINDOWS_LOCAL_LINK_REGEX = new RegExp('(' + winPathPrefix + '?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)');

export class TerminalLinkHandler {
	constructor(
		private _platform: Platform,
		@IWorkbenchEditorService private _editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService
	) {
	}

	public get localLinkRegex(): RegExp {
		if (this._platform === Platform.Windows) {
			return WINDOWS_LOCAL_LINK_REGEX;
		}
		return UNIX_LIKE_LOCAL_LINK_REGEX;
	}

	public handleLocalLink(link: string): TPromise<void> {
		if (this._platform === Platform.Windows) {
			return this._handleWindowsLocalLink(link);
		}
		return this._handleUnixLikeLocalLink(link);
	}

	private _handleUnixLikeLocalLink(link: string): TPromise<void> {
		// Resolve ~ -> $HOME
		if (link.charAt(0) === '~') {
			if (!process.env.HOME) {
				return TPromise.as(void 0);
			}
			link = process.env.HOME + link.substring(1);
		}
		return this._handleCommonLocalLink(link);
	}

	private _handleWindowsLocalLink(link: string): TPromise<void> {
		// Resolve ~ -> %HOMEDRIVE%\%HOMEPATH%
		if (link.charAt(0) === '~') {
			if (!process.env.HOMEDRIVE || !process.env.HOMEPATH) {
				return TPromise.as(void 0);
			}
			link = `${process.env.HOMEDRIVE}\\${process.env.HOMEPATH + link.substring(1)}`;
		}
		return this._handleCommonLocalLink(link);
	}

	private _handleCommonLocalLink(link: string): TPromise<void> {
		// Resolve workspace path . / .. -> <path>/. / <path/..
		if (link.charAt(0) === '.') {
			if (!this._contextService.hasWorkspace) {
				// Abort if no workspace is open
				return TPromise.as(void 0);
			}
			link = path.join(this._contextService.getWorkspace().resource.fsPath, link);
		}

		// Clean up the path
		const resource = Uri.file(path.normalize(path.resolve(link)));

		// Open an editor if the path exists
		return pfs.fileExists(link).then(isFile => {
			if (!isFile) {
				return void 0;
			}
			return this._editorService.openEditor({ resource }).then(() => void 0);
		});
	}
}
