/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBufferCell } from '@xterm/xterm';

export type XtermAttributes = Omit<IBufferCell, 'getWidth' | 'getChars' | 'getCode'> & {
	clone?(): XtermAttributes;
	hasExtendedAttrs?(): number;
};

export interface IXtermAttributeData extends XtermAttributes {
	fg: number;
	bg: number;
	extended: { underlineStyle: number };
	clone(): IXtermAttributeData;
}

export interface IXtermCellData {
	content: number;
	fg: number;
	bg: number;
	combinedData: string;
	extended: IXtermAttributeData['extended'];
}

export interface IXtermBufferLine {
	readonly length: number;
	clone(): IXtermBufferLine;
	loadCell(x: number, cell: IXtermCellData): IXtermCellData;
	setCell(x: number, cell: IXtermCellData): void;
	setCellFromCodepoint(x: number, codepoint: number, width: number, attributes: IXtermAttributeData): void;
	addCodepointToCell(x: number, codepoint: number, width: number): void;
}

export interface IXtermRenderer {
	renderRows(start: number, end: number): void;
	/** DOM renderer only: redraws link hover underlines without going through `renderRows`. */
	_setCellUnderline?(x: number, x2: number, y: number, y2: number, cols: number, enabled: boolean): void;
}

export interface IXtermCore {
	coreService: {
		isCursorHidden: boolean;
		isCursorInitialized: boolean;
	};

	viewport?: {
		readonly scrollBarWidth: number;
		_innerRefresh(): void;
	};

	_inputHandler: {
		_curAttrData: IXtermAttributeData;
		_parser: { readonly currentState: number };
	};

	_writeBuffer: {
		_pendingData: number;
	};

	/** Creates the default DOM renderer. */
	_createRenderer?(): IXtermRenderer;

	_bufferService: {
		buffer: {
			x: number;
			y: number;
			ybase: number;
			ydisp: number;
			lines: { get(y: number): IXtermBufferLine | undefined };
		};
	};

	_renderService: {
		dimensions: {
			css: {
				cell: {
					width: number;
					height: number;
				}
			}
		},
		setRenderer?(renderer: IXtermRenderer): void;
		_renderer: {
			value?: IXtermRenderer;
		};
	};
}

export interface IBufferLine {
	readonly length: number;
	getCell(x: number): { getChars(): string } | undefined;
	translateToString(trimRight?: boolean): string;
}

export interface IBufferSet {
	readonly active: {
		readonly baseY: number;
		readonly cursorY: number;
		readonly cursorX: number;
		readonly length: number;
		getLine(y: number): IBufferLine | undefined;
	};
}
