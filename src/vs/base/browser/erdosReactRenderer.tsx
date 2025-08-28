/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { Event } from '../common/event.js';
import { Disposable, IDisposable } from '../common/lifecycle.js';
import { ErdosReactServices } from './erdosReactServices.js';
import { ErdosReactServicesContext } from './erdosReactRendererContext.js';

export interface ISize {
	width: number;
	height: number;
}

export interface IElementPosition {
	x: number;
	y: number;
}

export interface IReactComponentContainer {
	readonly width: number;
	readonly height: number;
	readonly containerVisible: boolean;
	takeFocus(): void;
	focusChanged?(focused: boolean): void;
	visibilityChanged?(visible: boolean): void;
	readonly onFocused: Event<void>;
	readonly onSizeChanged: Event<ISize>;
	readonly onVisibilityChanged: Event<boolean>;
	readonly onSaveScrollPosition: Event<void>;
	readonly onRestoreScrollPosition: Event<void>;
}

export class ErdosReactRenderer extends Disposable {
	private _root?: Root;

	constructor(container: HTMLElement) {
		super();
		this._root = createRoot(container);
	}

	public override dispose(): void {
		if (this._root) {
			this._root.unmount();
			this._root = undefined;
		}
		super.dispose();
	}

	public render(reactElement: ReactElement) {
		if (this._root) {
			this._root.render(
				<ErdosReactServicesContext.Provider value={ErdosReactServices.services}>
					{reactElement}
				</ErdosReactServicesContext.Provider>
			);
		}
	}

	public register(disposable: IDisposable) {
		this._register(disposable);
	}

	public destroy() {
		if (this._root) {
			this._root.unmount();
			this._root = undefined;
		}
	}
}