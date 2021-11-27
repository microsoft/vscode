/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, IBufferLine } from 'xterm';
import { getXtermLineContent, convertLinkRangeToBuffer } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { posix, win32 } from 'vs/base/common/path';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalBaseLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalBaseLinkProvider';
import { matchAllLocalLinks, winDrivePrefix } from 'vs/workbench/contrib/terminal/browser/links/localLinkHelpers';
import { IFileService } from 'vs/platform/files/common/files';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { FileTerminalLink } from 'vs/workbench/contrib/terminal/browser/links/fileTerminalLink';
import { FolderTerminalLink } from 'vs/workbench/contrib/terminal/browser/links/folderTerminalLink';

const MAX_LENGTH = 2000;

interface IPath {
	join(...paths: string[]): string;
	normalize(path: string): string;
	sep: '\\' | '/';
}

export class TerminalValidatedLocalLinkProvider extends TerminalBaseLinkProvider {
	private get _xterm(): Terminal {
		return (this._terminal as any)._xterm;
	}

	constructor(
		private readonly _terminal: ITerminalInstance,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	protected async _provideLinks(y: number): Promise<TerminalLink[]> {
		const result: TerminalLink[] = [];
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

		let text = getXtermLineContent(this._xterm.buffer.active, startLine, endLine, this._xterm.cols);
		if (text.length > MAX_LENGTH) {
			return [];
		}

		// As xterm reads from DOM, space in that case is non-breaking space
		// ASCII code 160, so replace it here to ASCII code 32.
		// TODO: is it still true? it was assumption for some regex, but I don't see it being followed in git diff code below...
		text = text.replace(/\u00A0/g, ' ');

		for (const match of matchAllLocalLinks(text, this._terminal.os || OS)) {
			// Adjust the link range to exclude a/ and b/ if it looks like a git diff
			if (
				// --- a/foo/bar
				// +++ b/foo/bar
				(match.index === 4 && (text.startsWith('--- a/') || text.startsWith('+++ b/'))) ||
				// diff --git a/foo/bar b/foo/bar
				(text.startsWith('diff --git') && (match.path.startsWith('a/') || match.path.startsWith('b/')))
			) {
				match.path = match.path.substring(2);
			}

			// Preprocess path (including normalization)
			const preprocessedPath = this._preprocessPath(match.path);
			if (!preprocessedPath) {
				continue;
			}

			// Skip meaningless paths
			if (preprocessedPath === '/' || preprocessedPath === './') {
				continue;
			}

			// Convert the link text's string index into a wrapped buffer range
			const bufferRange = convertLinkRangeToBuffer(lines, this._xterm.cols, {
				startColumn: match.index + 1,
				startLineNumber: 1,
				endColumn: match.index + match.label.length + 1,
				endLineNumber: 1
			}, startLine);

			// Validate the if file/folder exist, if so, create proper link.
			const resolved = await this._resolvePath(preprocessedPath);
			if (resolved) {
				if (resolved.isDirectory) {
					result.push(this._instantiationService.createInstance(FolderTerminalLink,
						this._terminal,
						bufferRange,
						match.label,
						this._xterm.buffer.active.viewportY,
						true,
						resolved.uri
					));
				}
				else {
					result.push(this._instantiationService.createInstance(FileTerminalLink,
						this._terminal,
						bufferRange,
						match.label,
						this._xterm.buffer.active.viewportY,
						true,
						resolved.uri,
						match.line,
						match.column,
					));
				}
			}
		}
		return result;
	}

	private get _osPath(): IPath {
		if ((this._terminal.os || OS) === OperatingSystem.Windows) {
			return win32;
		}
		return posix;
	}

	protected _preprocessPath(path: string): string | null {
		if (path.charAt(0) === '~') {
			// Resolve ~ -> userHome
			if (!this._terminal.userHome) {
				return null;
			}
			path = this._osPath.join(this._terminal.userHome, path.substring(1));
		} else if (path.charAt(0) !== '/' && path.charAt(0) !== '~') {
			// Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
			if (this._terminal.os === OperatingSystem.Windows) {
				if (!path.match('^' + winDrivePrefix) && !path.startsWith('\\\\?\\')) {
					if (!this._terminal.cwd) {
						// Abort if no workspace is open
						return null;
					}
					path = this._osPath.join(this._terminal.cwd, path);
				}
				else {
					// Remove \\?\ from paths so that they share the same underlying
					// uri and don't open multiple tabs for the same file
					path = path.replace(/^\\\\\?\\/, '');
				}
			} else {
				if (!this._terminal.cwd) {
					// Abort if no workspace is open
					return null;
				}
				path = this._osPath.join(this._terminal.cwd, path);
			}
		}
		path = this._osPath.normalize(path);

		return path;
	}

	private async _resolvePath(path: string): Promise<{ uri: URI, isDirectory: boolean } | undefined> {
		try {
			let uri: URI;
			if (this._terminal.remoteAuthority) {
				uri = URI.from({
					scheme: Schemas.vscodeRemote,
					authority: this._terminal.remoteAuthority,
					path,
				});
			} else {
				uri = URI.file(path);
			}

			try {
				const stat = await this._fileService.resolve(uri);
				return { uri, isDirectory: stat.isDirectory };
			}
			catch (e) {
				// Does not exist
				return undefined;
			}
		} catch {
			// Errors in parsing the path
			return undefined;
		}
	}
}
