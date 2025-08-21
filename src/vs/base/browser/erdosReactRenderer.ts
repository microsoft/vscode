/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../common/event.js';
import { Disposable } from '../common/lifecycle.js';

/**
 * Position of an element.
 */
export interface IElementPosition {
	x: number;
	y: number;
}

/**
 * Size of an element.
 */
export interface ISize {
	width: number;
	height: number;
}

/**
 * Interface for React component containers.
 */
export interface IReactComponentContainer {
	readonly width: number;
	readonly height: number;
	readonly containerVisible: boolean;
	readonly onSizeChanged: Event<ISize>;
	readonly onPositionChanged: Event<IElementPosition>;
	readonly onVisibilityChanged: Event<boolean>;
	readonly onSaveScrollPosition: Event<void>;
	readonly onRestoreScrollPosition: Event<void>;
	readonly onFocused: Event<void>;
	takeFocus(): void;
}

/**
 * Placeholder React renderer for Erdos components.
 */
export class ErdosReactRenderer extends Disposable {
	constructor(private container: HTMLElement) {
		super();
	}

	render(component: any): void {
		// TODO: Implement React rendering when React is available
		this.container.innerHTML = '<div>React component placeholder</div>';
	}
}
