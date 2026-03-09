/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IObservable, IReader } from '../../../base/common/observable.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IFocusTracker } from '../../../base/browser/dom.js';

export const IUserInteractionService = createDecorator<IUserInteractionService>('userInteractionService');

export interface IModifierKeyStatus {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
}

/**
 * Used to track user UI interactions such as focus and hover states.
 * This allows mocking these interactions in tests and simulating specific states.
 */
export interface IUserInteractionService {
	readonly _serviceBrand: undefined;

	/**
	 * Reads the current modifier key status for the window containing the given element.
	 * Pass an element to determine the correct window context (for multi-window support).
	 */
	readModifierKeyStatus(element: HTMLElement | Window, reader: IReader | undefined): IModifierKeyStatus;

	/**
	 * Creates an observable that tracks whether the given element (or a descendant) has focus.
	 * The observable is disposed when the disposable store is disposed.
	 */
	createFocusTracker(element: HTMLElement | Window, store: DisposableStore): IObservable<boolean>;

	/**
	 * Creates an observable that tracks whether the given element is hovered.
	 * The observable is disposed when the disposable store is disposed.
	 */
	createHoverTracker(element: Element, store: DisposableStore): IObservable<boolean>;

	createDomFocusTracker(element: HTMLElement): IFocusTracker;
}

/**
 * Mock implementation of IUserInteractionService that can be used for testing
 * or simulating specific interaction states.
 */
export class MockUserInteractionService implements IUserInteractionService {
	readonly _serviceBrand: undefined;

	constructor(
		private readonly _simulateFocus: boolean = true,
		private readonly _simulateHover: boolean = false,
		private readonly _modifiers: IModifierKeyStatus = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
	) { }

	readModifierKeyStatus(_element: HTMLElement | Window, _reader: IReader | undefined): IModifierKeyStatus {
		return this._modifiers;
	}

	createFocusTracker(_element: HTMLElement | Window, _store: DisposableStore): IObservable<boolean> {
		return constObservable(this._simulateFocus);
	}

	createHoverTracker(_element: Element, _store: DisposableStore): IObservable<boolean> {
		return constObservable(this._simulateHover);
	}

	createDomFocusTracker(_element: HTMLElement): IFocusTracker {
		const tracker = new class extends Disposable implements IFocusTracker {
			private readonly _onDidFocus = this._register(new Emitter<void>());
			readonly onDidFocus = this._onDidFocus.event;
			private readonly _onDidBlur = this._register(new Emitter<void>());
			readonly onDidBlur = this._onDidBlur.event;
			refreshState(): void { }
			fireFocus(): void { this._onDidFocus.fire(); }
		};
		if (this._simulateFocus) {
			queueMicrotask(() => tracker.fireFocus());
		}
		return tracker;
	}
}
