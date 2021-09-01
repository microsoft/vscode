/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, IViewportRange, IBufferLine } from 'xterm';
import { ILinkComputerTarget, LinkComputer } from 'vs/editor/common/modes/linkComputer';
import { getXtermLineContent, convertLinkRangeToBuffer } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { TerminalLink, OPEN_FILE_LABEL, FOLDER_IN_WORKSPACE_LABEL, FOLDER_NOT_IN_WORKSPACE_LABEL } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { TerminalBaseLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalBaseLinkProvider';
import { XtermLinkMatcherHandler } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { Schemas } from 'vs/base/common/network';

export class TerminalProtocolLinkProvider extends TerminalBaseLinkProvider {
	private _linkComputerTarget: ILinkComputerTarget | undefined;

	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent | undefined, uri: string) => void,
		private readonly _wrapLinkHandler: (handler: (event: MouseEvent | undefined, link: string) => void) => XtermLinkMatcherHandler,
		private readonly _tooltipCallback: (link: TerminalLink, viewportRange: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => void,
		private readonly _validationCallback: (link: string, callback: (result: { uri: URI, isDirectory: boolean } | undefined) => void) => void,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IHostService private readonly _hostService: IHostService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService
	) {
		super();
	}

	protected async _provideLinks(y: number): Promise<TerminalLink[]> {
		let startLine = y - 1;
		let endLine = startLine;

		const lines: IBufferLine[] = [
			this._xterm.buffer.active.getLine(startLine)!
		];

		while (startLine >= 0 && this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
			lines.unshift(this._xterm.buffer.active.getLine(startLine - 1)!);
			startLine--;
		}

		while (endLine < this._xterm.buffer.active.length && this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
			lines.push(this._xterm.buffer.active.getLine(endLine + 1)!);
			endLine++;
		}

		this._linkComputerTarget = new TerminalLinkAdapter(this._xterm, startLine, endLine);
		const links = LinkComputer.computeLinks(this._linkComputerTarget);

		const result: TerminalLink[] = [];
		for (const link of links) {
			const bufferRange = convertLinkRangeToBuffer(lines, this._xterm.cols, link.range, startLine);

			// Check if the link is within the mouse position
			const uri = link.url
				? (typeof link.url === 'string' ? URI.parse(link.url) : link.url)
				: undefined;

			if (!uri) {
				continue;
			}

			const linkText = link.url?.toString() || '';

			// Handle http links
			if (uri.scheme !== Schemas.file) {
				result.push(this._instantiationService.createInstance(TerminalLink,
					this._xterm,
					bufferRange,
					linkText,
					this._xterm.buffer.active.viewportY,
					this._activateCallback,
					this._tooltipCallback,
					true,
					undefined
				));
				continue;
			}

			// Handle files and folders
			const validatedLink = await new Promise<TerminalLink | undefined>(r => {
				this._validationCallback(linkText, (result) => {
					if (result) {
						const label = result.isDirectory
							? (this._isDirectoryInsideWorkspace(result.uri) ? FOLDER_IN_WORKSPACE_LABEL : FOLDER_NOT_IN_WORKSPACE_LABEL)
							: OPEN_FILE_LABEL;
						const activateCallback = this._wrapLinkHandler((event: MouseEvent | undefined, text: string) => {
							if (result.isDirectory) {
								this._handleLocalFolderLink(result.uri);
							} else {
								this._activateCallback(event, linkText);
							}
						});
						r(this._instantiationService.createInstance(
							TerminalLink,
							this._xterm,
							bufferRange,
							linkText,
							this._xterm.buffer.active.viewportY,
							activateCallback,
							this._tooltipCallback,
							true,
							label
						));
					} else {
						r(undefined);
					}
				});
			});
			if (validatedLink) {
				result.push(validatedLink);
			}
		}
		return result;
	}

	private async _handleLocalFolderLink(uri: URI): Promise<void> {
		// If the folder is within one of the window's workspaces, focus it in the explorer
		if (this._isDirectoryInsideWorkspace(uri)) {
			await this._commandService.executeCommand('revealInExplorer', uri);
			return;
		}

		// Open a new window for the folder
		this._hostService.openWindow([{ folderUri: uri }], { forceNewWindow: true });
	}

	private _isDirectoryInsideWorkspace(uri: URI) {
		const folders = this._workspaceContextService.getWorkspace().folders;
		for (let i = 0; i < folders.length; i++) {
			if (this._uriIdentityService.extUri.isEqualOrParent(uri, folders[i].uri)) {
				return true;
			}
		}
		return false;
	}
}

class TerminalLinkAdapter implements ILinkComputerTarget {
	constructor(
		private _xterm: Terminal,
		private _lineStart: number,
		private _lineEnd: number
	) { }

	getLineCount(): number {
		return 1;
	}

	getLineContent(): string {
		return getXtermLineContent(this._xterm.buffer.active, this._lineStart, this._lineEnd, this._xterm.cols);
	}
}
