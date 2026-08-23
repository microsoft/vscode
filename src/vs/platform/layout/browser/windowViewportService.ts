/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, onDidUnregisterWindow } from '../../../base/browser/dom.js';
import { getWindowViewportState, IWindowViewportState, IWindowViewportTarget } from '../../../base/browser/windowViewport.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export interface IWindowViewportChangeEvent {
	readonly state: IWindowViewportState;
	readonly layoutDimensionChanged: boolean;
	readonly visualDimensionChanged: boolean;
	readonly visualOffsetChanged: boolean;
	readonly visualScaleChanged: boolean;
}

export interface IWindowViewport {
	/**
	 * Current viewport state. Consumers that subscribe to {@link onDidChange}
	 * should read this first when they need an initial value.
	 */
	readonly state: IObservable<IWindowViewportState>;

	/**
	 * Fires after the viewport state changes. This event does not fire an
	 * initial value.
	 */
	readonly onDidChange: Event<IWindowViewportChangeEvent>;
}

export const IWindowViewportService = createDecorator<IWindowViewportService>('windowViewportService');

export interface IWindowViewportService {
	readonly _serviceBrand: undefined;
	getViewport(targetWindow: IWindowViewportTarget): IWindowViewport;
}

class WindowViewport extends Disposable implements IWindowViewport {

	private readonly _state: ISettableObservable<IWindowViewportState>;
	readonly state: IObservable<IWindowViewportState>;

	private readonly _onDidChange = this._register(new Emitter<IWindowViewportChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	constructor(private readonly targetWindow: IWindowViewportTarget) {
		super();

		this._state = observableValue<IWindowViewportState>(this, getWindowViewportState(targetWindow));
		this.state = this._state;

		const update = () => this.update();
		this._register(addDisposableListener(targetWindow, EventType.RESIZE, update));

		if (targetWindow.visualViewport) {
			this._register(addDisposableListener(targetWindow.visualViewport, EventType.RESIZE, update));
			this._register(addDisposableListener(targetWindow.visualViewport, EventType.SCROLL, update));
		}
	}

	private update(): void {
		const previous = this._state.get();
		const state = getWindowViewportState(this.targetWindow);
		const layoutDimensionChanged = previous.layoutWidth !== state.layoutWidth || previous.layoutHeight !== state.layoutHeight;
		const visualDimensionChanged = previous.visualWidth !== state.visualWidth || previous.visualHeight !== state.visualHeight;
		const visualOffsetChanged = previous.visualOffsetLeft !== state.visualOffsetLeft || previous.visualOffsetTop !== state.visualOffsetTop;
		const visualScaleChanged = previous.visualScale !== state.visualScale;

		if (!layoutDimensionChanged && !visualDimensionChanged && !visualOffsetChanged && !visualScaleChanged) {
			return;
		}

		this._state.set(state, undefined);
		this._onDidChange.fire({ state, layoutDimensionChanged, visualDimensionChanged, visualOffsetChanged, visualScaleChanged });
	}
}

export class WindowViewportService extends Disposable implements IWindowViewportService {

	declare readonly _serviceBrand: undefined;

	private readonly viewports = this._register(new DisposableMap<IWindowViewportTarget, WindowViewport>());

	constructor() {
		super();
		this._register(onDidUnregisterWindow(targetWindow => this.viewports.deleteAndDispose(targetWindow)));
	}

	getViewport(targetWindow: IWindowViewportTarget): IWindowViewport {
		let viewport = this.viewports.get(targetWindow);
		if (!viewport) {
			viewport = new WindowViewport(targetWindow);
			this.viewports.set(targetWindow, viewport);
		}
		return viewport;
	}
}

registerSingleton(IWindowViewportService, WindowViewportService, InstantiationType.Delayed);
