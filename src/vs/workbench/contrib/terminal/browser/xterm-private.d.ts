/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBufferCell, IEvent } from '@xterm/xterm';

export type XtermAttributes = Omit<IBufferCell, 'getWidth' | 'getChars' | 'getCode'> & {
	clone?(): XtermAttributes;
	hasExtendedAttrs?(): number;
};

export interface IXtermCore {
	coreService: {
		isCursorHidden: boolean;
		onUserInput: IEvent<void>;
	};

	_bufferService: {
		buffer: {
			setWrapped(lineIndex: number, isWrapped: boolean): void;
		};
	};

	viewport?: {
		readonly scrollBarWidth: number;
		_innerRefresh(): void;
	};

	_inputHandler: {
		_curAttrData: XtermAttributes;
	};

	_writeBuffer: {
		_pendingData: number;
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
		_renderer: {
			value?: unknown;
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
