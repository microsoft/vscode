/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, IViewportRange, IBufferLine, IBufferRange } from 'xterm';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { localize } from 'vs/nls';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ISearchService } from 'vs/workbench/services/search/common/search';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { XtermLinkMatcherHandler } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { TerminalBaseLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalBaseLinkProvider';
import { normalize } from 'vs/base/common/path';
import { convertLinkRangeToBuffer, getXtermLineContent } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { isWindows } from 'vs/base/common/platform';

const MAX_LENGTH = 2000;

export class TerminalWordLinkProvider extends TerminalBaseLinkProvider {
	private readonly _fileQueryBuilder = this._instantiationService.createInstance(QueryBuilder);

	constructor(
		private readonly _xterm: Terminal,
		private readonly _wrapLinkHandler: (handler: (event: MouseEvent | undefined, link: string) => void) => XtermLinkMatcherHandler,
		private readonly _tooltipCallback: (link: TerminalLink, viewportRange: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => void,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISearchService private readonly _searchService: ISearchService,
		@IEditorService private readonly _editorService: IEditorService
	) {
		super();
	}

	protected _provideLinks(y: number): TerminalLink[] {
		// Dispose of all old links if new links are provides, links are only cached for the current line
		const links: TerminalLink[] = [];
		const wordSeparators = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).wordSeparators;
		const activateCallback = this._wrapLinkHandler((_, link) => this._activate(link));

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

		const text = getXtermLineContent(this._xterm.buffer.active, startLine, endLine, this._xterm.cols);
		if (text === '' || text.length > MAX_LENGTH) {
			return [];
		}

		const words: Word[] = this._parseWords(text, wordSeparators);

		for (const word of words) {
			if (word.text === '') {
				continue;
			}
			const bufferRange = convertLinkRangeToBuffer
				(
					lines,
					this._xterm.cols,
					{
						startColumn: word.startIndex + 1,
						startLineNumber: 1,
						endColumn: word.endIndex + 1,
						endLineNumber: 1
					},
					startLine
				);
			links.push(this._createTerminalLink(word.text, activateCallback, bufferRange));
		}
		return links;
	}

	private _parseWords(text: string, separators: string): Word[] {
		const words: Word[] = [];

		const wordSeparators: string[] = separators.split('');
		const characters = text.split('');

		let startIndex = 0;
		for (let i = 0; i < text.length; i++) {
			if (wordSeparators.includes(characters[i])) {
				words.push({ startIndex, endIndex: i, text: text.substring(startIndex, i) });
				startIndex = i + 1;
			}
		}
		if (startIndex < text.length) {
			words.push({ startIndex, endIndex: text.length, text: text.substring(startIndex) });
		}

		return words;
	}

	private _createTerminalLink(text: string, activateCallback: XtermLinkMatcherHandler, bufferRange: IBufferRange): TerminalLink {
		// Remove trailing colon if there is one so the link is more useful
		if (text.length > 0 && text.charAt(text.length - 1) === ':') {
			text = text.slice(0, -1);
			bufferRange.end.x--;
		}
		return this._instantiationService.createInstance(TerminalLink,
			this._xterm,
			bufferRange,
			text,
			this._xterm.buffer.active.viewportY,
			activateCallback,
			this._tooltipCallback,
			false,
			localize('searchWorkspace', 'Search workspace')
		);
	}

	private async _activate(link: string) {
		// Normalize the link and remove any leading ./ or ../ since quick access doesn't understand
		// that format
		link = normalize(link).replace(/^(\.+[\\/])+/, '');

		// If any of the names of the folders in the workspace matches
		// a prefix of the link, remove that prefix and continue
		this._workspaceContextService.getWorkspace().folders.forEach((folder) => {
			if (link.substr(0, folder.name.length + 1) === folder.name + (isWindows ? '\\' : '/')) {
				link = link.substring(folder.name.length + 1);
				return;
			}
		});

		const sanitizedLink = link.replace(/:\d+(:\d+)?$/, '');
		const results = await this._searchService.fileSearch(
			this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
				// Remove optional :row:col from the link as openEditor supports it
				filePattern: sanitizedLink,
				maxResults: 2
			})
		);

		// If there was exactly one match, open it
		if (results.results.length === 1) {
			const match = link.match(/:(\d+)?(:(\d+))?$/);
			const startLineNumber = match?.[1];
			const startColumn = match?.[3];
			await this._editorService.openEditor({
				resource: results.results[0].resource,
				options: {
					pinned: true,
					revealIfOpened: true,
					selection: startLineNumber ? {
						startLineNumber: parseInt(startLineNumber),
						startColumn: startColumn ? parseInt(startColumn) : 0
					} : undefined
				}
			});
			return;
		}

		// Fallback to searching quick access
		this._quickInputService.quickAccess.show(link);
	}
}

interface Word {
	startIndex: number;
	endIndex: number;
	text: string;
}
