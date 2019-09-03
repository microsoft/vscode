/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface XTermCore {
	_onScroll: IEventEmitter<number>;
	_onKey: IEventEmitter<{ key: string }>;

	_charSizeService: {
		width: number;
		height: number;
	};

	_coreService: {
		triggerDataEvent(data: string, wasUserInput?: boolean): void;
	};

	_renderService: {
		_renderer: {
			_renderLayers: any[];
		};
		_onIntersectionChange: any;
	};

	// TODO: Remove below once a synchronous write API is added
	// The below are only used in tests
	writeBuffer: string[];
	_innerWrite(): void;
}

export interface IEventEmitter<T> {
	fire(e: T): void;
}
