/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IDimension } from 'vs/editor/common/editorCommon';
import * as dom from 'vs/base/browser/dom';

export class ElementSizeObserver extends Disposable {

	private readonly referenceDomElement: HTMLElement | null;
	private readonly changeCallback: () => void;
	private width: number;
	private height: number;
	private mutationObserver: MutationObserver | null;
	private windowSizeListener: IDisposable | null;

	constructor(referenceDomElement: HTMLElement | null, dimension: IDimension | undefined, changeCallback: () => void) {
		super();
		this.referenceDomElement = referenceDomElement;
		this.changeCallback = changeCallback;
		this.width = -1;
		this.height = -1;
		this.mutationObserver = null;
		this.windowSizeListener = null;
		this.measureReferenceDomElement(false, dimension);
	}

	public dispose(): void {
		this.stopObserving();
		super.dispose();
	}

	public getWidth(): number {
		return this.width;
	}

	public getHeight(): number {
		return this.height;
	}

	public startObserving(): void {
		if (!this.mutationObserver && this.referenceDomElement) {
			this.mutationObserver = new MutationObserver(() => this._onDidMutate());
			this.mutationObserver.observe(this.referenceDomElement, {
				attributes: true,
			});
		}
		if (!this.windowSizeListener) {
			this.windowSizeListener = dom.addDisposableListener(window, 'resize', () => this._onDidResizeWindow());
		}
	}

	public stopObserving(): void {
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
		if (this.windowSizeListener) {
			this.windowSizeListener.dispose();
			this.windowSizeListener = null;
		}
	}

	public observe(dimension?: IDimension): void {
		this.measureReferenceDomElement(true, dimension);
	}

	private _onDidMutate(): void {
		this.measureReferenceDomElement(true);
	}

	private _onDidResizeWindow(): void {
		this.measureReferenceDomElement(true);
	}

	private measureReferenceDomElement(callChangeCallback: boolean, dimension?: IDimension): void {
		let observedWidth = 0;
		let observedHeight = 0;
		if (dimension) {
			observedWidth = dimension.width;
			observedHeight = dimension.height;
		} else if (this.referenceDomElement) {
			observedWidth = this.referenceDomElement.clientWidth;
			observedHeight = this.referenceDomElement.clientHeight;
		}
		observedWidth = Math.max(5, observedWidth);
		observedHeight = Math.max(5, observedHeight);
		if (this.width !== observedWidth || this.height !== observedHeight) {
			this.width = observedWidth;
			this.height = observedHeight;
			if (callChangeCallback) {
				this.changeCallback();
			}
		}
	}

}
