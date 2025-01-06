/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBufferCell } from '@xterm/xterm';

export type XtermAttributes = Omit<IBufferCell, 'getWidth' | 'getChars' | 'getCode'> & { clone?(): XtermAttributes };

export interface IXtermCore {
	viewport?: {
		readonly scrollBarWidth: number;
		// eslint-disable-next-line @typescript-eslint/naming-convention
		_innerRefresh(): void;
	};

	_inputHandler: {
		_curAttrData: XtermAttributes;
	};

	_renderService: {
		dimensions: {
			css: {
				cell: {
					width: number;
					height: number;
				};
			};
		};
		_renderer: {
			value?: unknown;
		};
	};
}
