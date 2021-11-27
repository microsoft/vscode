/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, IBufferLine, IBufferRange } from 'xterm';
import { getXtermLineContent, convertLinkRangeToBuffer } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalBaseLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalBaseLinkProvider';
import { ITerminalExternalLinkProvider, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';

/**
 * An adapter to convert a simple external link provider into an internal link provider that
 * manages link lifecycle, hovers, etc. and gets registered in xterm.js.
 */
export class TerminalExternalLinkProviderAdapter extends TerminalBaseLinkProvider {
	private get _xterm(): Terminal {
		return (this._terminal as any)._xterm;
	}

	constructor(
		private readonly _terminal: ITerminalInstance,
		private readonly _externalLinkProvider: ITerminalExternalLinkProvider,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
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

		const lineContent = getXtermLineContent(this._xterm.buffer.active, startLine, endLine, this._xterm.cols);
		if (lineContent.trim().length === 0) {
			return [];
		}

		const externalLinks = await this._externalLinkProvider.provideLinks(this._terminal, lineContent);
		if (!externalLinks) {
			return [];
		}

		return externalLinks.map(link => {
			const bufferRange = convertLinkRangeToBuffer(lines, this._xterm.cols, {
				startColumn: link.startIndex + 1,
				startLineNumber: 1,
				endColumn: link.startIndex + link.length + 1,
				endLineNumber: 1
			}, startLine);
			const matchingText = lineContent.substr(link.startIndex, link.length) || '';
			return this._instantiationService.createInstance(CustomTerminalLink,
				this._terminal,
				bufferRange,
				matchingText,
				this._xterm.buffer.active.viewportY,
				true,
				link.label,
				link.activate,
			);
		});
	}
}

class CustomTerminalLink extends TerminalLink {
	constructor(
		_terminal: ITerminalInstance,
		range: IBufferRange,
		text: string,
		_viewportY: number,
		_isHighConfidenceLink: boolean,
		public readonly label: string | undefined,
		protected readonly _action: (text: string) => void,
		@IConfigurationService _configurationService: IConfigurationService,
		@IInstantiationService _instantiationService: IInstantiationService,
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
		this._action(this.text);
	}

	protected override _getHoverText(): IMarkdownString | null {
		if (this.label) {
			return new MarkdownString(`[${this.label}](${this.text}) (${this._getClickLabel})`, true);
		}
		else {
			return null;
		}
	}
}
