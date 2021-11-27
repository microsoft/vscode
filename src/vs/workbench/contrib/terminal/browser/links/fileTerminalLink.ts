/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { URI } from 'vs/base/common/uri';
import { IBufferRange } from 'xterm';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';

const OPEN_FILE_LABEL = localize('openFile', 'Open file in editor');

/**
 * Represents terminal link for local file.
 * Provided by `TerminalValidatedLinkProvider`.
 */
export class FileTerminalLink extends TerminalLink {
	constructor(
		_terminal: ITerminalInstance,
		range: IBufferRange,
		text: string,
		_viewportY: number,
		_isHighConfidenceLink: boolean,
		readonly uri: URI,
		readonly line: number,
		readonly column: number,
		@IConfigurationService _configurationService: IConfigurationService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
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
	}

	override action() {
		const selection: ITextEditorSelection = {
			startLineNumber: this.line,
			startColumn: this.column,
		};
		this._editorService.openEditor({
			resource: this.uri,
			options: { pinned: true, selection, revealIfOpened: true }
		});
	}

	protected override _getHoverText(): IMarkdownString {
		const lineAndColumn = this.line === 1 && this.column === 1 ? '' : `:${this.line}:${this.column}`;
		return new MarkdownString(`[${this._getLabel()}](${this.uri.toString()}${lineAndColumn}) (${this._getClickLabel})`, true);
	}

	protected _getLabel() {
		return OPEN_FILE_LABEL;
	}
}
