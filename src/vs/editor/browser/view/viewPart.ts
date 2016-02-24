/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {IRenderingContext, IViewContext, IViewPart} from 'vs/editor/browser/editorBrowser';

export interface IRunner {
	(): void;
}

export class ViewPart extends ViewEventHandler implements IViewPart {

	_context:IViewContext;
	private _modificationBeforeRenderingRunners:IRunner[];
	private _modificationRunners:IRunner[];

	constructor(context:IViewContext) {
		super();
		this._context = context;
		this._context.addEventHandler(this);
		this._modificationBeforeRenderingRunners = [];
		this._modificationRunners = [];
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
		this._modificationBeforeRenderingRunners = [];
		this._modificationRunners = [];
	}

	/**
	 * Modify the DOM right before when the orchestrated rendering occurs.
	 */
	_requestModificationFrameBeforeRendering(runner:IRunner): void {
		this._modificationBeforeRenderingRunners.push(runner);
	}

	/**
	 * Modify the DOM when the orchestrated rendering occurs.
	 */
	_requestModificationFrame(runner:IRunner): void {
		this._modificationRunners.push(runner);
	}

	public onBeforeForcedLayout(): void {
		if (this._modificationBeforeRenderingRunners.length > 0) {
			for (var i = 0; i < this._modificationBeforeRenderingRunners.length; i++) {
				this._modificationBeforeRenderingRunners[i]();
			}
			this._modificationBeforeRenderingRunners = [];
		}
	}

	public onReadAfterForcedLayout(ctx:IRenderingContext): void {
		if (!this.shouldRender) {
			return;
		}
		this._render(ctx);
	}

	public onWriteAfterForcedLayout(): void {
		if (!this.shouldRender) {
			return;
		}
		this.shouldRender = false;

		this._executeModificationRunners();
	}

	_executeModificationRunners(): void {
		if (this._modificationRunners.length > 0) {
			for (var i = 0; i < this._modificationRunners.length; i++) {
				this._modificationRunners[i]();
			}
			this._modificationRunners = [];
		}
	}

	_render(ctx:IRenderingContext): void {
		throw new Error('Implement me!');
	}
}