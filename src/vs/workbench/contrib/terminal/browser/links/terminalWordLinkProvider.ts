/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, ILinkProvider, IViewportRange, IBufferCellPosition, ILink } from 'xterm';
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

export class TerminalWordLinkProvider implements ILinkProvider {
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
	}

	public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
		const start: IBufferCellPosition = { x: position.x, y: position.y };
		const end: IBufferCellPosition = { x: position.x, y: position.y };

		// TODO: Support wrapping
		// Expand to the left until a word separator is hit
		const line = this._xterm.buffer.active.getLine(position.y - 1)!;
		let text = '';
		start.x++; // The hovered cell is considered first
		for (let x = position.x; x > 0; x--) {
			const cell = line.getCell(x - 1);
			if (!cell) {
				break;
			}
			const char = cell.getChars();
			const config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
			if (cell.getWidth() !== 0 && config.wordSeparators.indexOf(char) >= 0) {
				break;
			}
			start.x = x;
			text = char + text;
		}

		// No links were found (the hovered cell is whitespace)
		if (text.length === 0) {
			callback(undefined);
			return;
		}

		// Expand to the right until a word separator is hit
		for (let x = position.x + 1; x <= line.length; x++) {
			const cell = line.getCell(x - 1);
			if (!cell) {
				break;
			}
			const char = cell.getChars();
			const config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
			if (cell.getWidth() !== 0 && config.wordSeparators.indexOf(char) >= 0) {
				break;
			}
			end.x = x;
			text += char;
		}

		const activateCallback = this._wrapLinkHandler((_, link) => this._activate(link));
		callback(new TerminalLink({ start, end }, text, this._xterm.buffer.active.viewportY, activateCallback, this._tooltipCallback, false, localize('searchWorkspace', 'Search workspace'), this._configurationService));
	}

	private async _activate(link: string) {
		const results = await this._searchService.fileSearch(
			this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
				filePattern: link,
				maxResults: 2
			})
		);

		// If there was exactly one match, open it
		if (results.results.length === 1) {
			const match = results.results[0];
			await this._editorService.openEditor({ resource: match.resource, options: { pinned: true } });
			return;
		}

		// Fallback to searching quick access
		this._quickInputService.quickAccess.show(link);
	}
}
