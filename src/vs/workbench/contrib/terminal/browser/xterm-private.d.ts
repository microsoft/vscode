/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */

import { IBufferCell } from 'xterm';

export type XtermAttributes = Omit<IBufferCell, 'getWidth' | 'getChars' | 'getCode'> & { clone?(): XtermAttributes };

export interface IXtermCore {
	viewport?: {
		_innerRefresh(): void;
	};
	_onKey: IEventEmitter<{ key: string }>;

	_charSizeService: {
		width: number;
		height: number;
	};

	_coreService: {
		triggerDataEvent(data: string, wasUserInput?: boolean): void;
	};

	_inputHandler: {
		_curAttrData: XtermAttributes;
	};

	_renderService: {
		dimensions: {
			actualCellWidth: number;
			actualCellHeight: number;
		},
		_renderer: {
			_renderLayers?: any[];
		};
		_onIntersectionChange: any;
	};
}

export interface IEventEmitter<T> {
	fire(e: T): void;
}
