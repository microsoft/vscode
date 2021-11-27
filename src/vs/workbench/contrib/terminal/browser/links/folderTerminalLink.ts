/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { URI } from 'vs/base/common/uri';
import { IBufferRange } from 'xterm';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';

const FOLDER_IN_WORKSPACE_LABEL = localize('focusFolder', 'Focus folder in explorer');
const FOLDER_NOT_IN_WORKSPACE_LABEL = localize('openFolder', 'Open folder in new window');

/**
 * Represents terminal link for local folder.
 * Provided by `TerminalValidatedLinkProvider`.
 */
export class FolderTerminalLink extends TerminalLink {
	protected _insideWorkspace: boolean;

	constructor(
		_terminal: ITerminalInstance,
		range: IBufferRange,
		text: string,
		_viewportY: number,
		_isHighConfidenceLink: boolean,
		readonly uri: URI,
		@IConfigurationService _configurationService: IConfigurationService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IHostService private readonly _hostService: IHostService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService
	) {
		super(
			_terminal,
			range,
			text,
			_viewportY,
			_isHighConfidenceLink,
			_configurationService,
			_instantiationService,
		);

		this._insideWorkspace = this._isDirectoryInsideWorkspace();
	}

	override action() {
		// If the folder is within one of the window's workspaces, focus it in the explorer
		if (this._insideWorkspace) {
			this._commandService.executeCommand('revealInExplorer', this.uri);
			return;
		}

		// Open a new window for the folder
		this._hostService.openWindow([{ folderUri: this.uri }], { forceNewWindow: true });
	}

	protected override _getHoverText(): IMarkdownString {
		return new MarkdownString(`[${this._getLabel()}](${this.uri.toString()}) (${this._getClickLabel})`, true);
	}

	protected _getLabel() {
		return this._insideWorkspace
			? FOLDER_IN_WORKSPACE_LABEL
			: FOLDER_NOT_IN_WORKSPACE_LABEL;
	}

	private _isDirectoryInsideWorkspace() {
		const folders = this._workspaceContextService.getWorkspace().folders;
		for (let i = 0; i < folders.length; i++) {
			if (this._uriIdentityService.extUri.isEqualOrParent(this.uri, folders[i].uri)) {
				return true;
			}
		}
		return false;
	}
}
