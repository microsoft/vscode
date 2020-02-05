/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IDimension } from 'vs/editor/common/editorCommon';

export class ElementSizeObserver extends Disposable {

	private readonly referenceDomElement: HTMLElement | null;
	private readonly changeCallback: () => void;
	private width: number;
	private height: number;
	private resizeObserver: any;

	constructor(referenceDomElement: HTMLElement | null, dimension: IDimension | undefined, changeCallback: () => void) {
		super();
		this.referenceDomElement = referenceDomElement;
		this.changeCallback = changeCallback;
		this.width = -1;
		this.height = -1;
		this.resizeObserver = null;
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
		if (this.resizeObserver === null) {
			this.resizeObserver = new MutationObserver(this.mutationObserve.bind(this));
			this.resizeObserver.observe(this.referenceDomElement, {
				attributes: true,
				childList: true,
				characterData: true,
				subtree: true
			});
			window.addEventListener('resize', this.windowObserve.bind(this));
		}
	}

	public stopObserving(): void {
		if (this.resizeObserver !== null) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
			window.removeEventListener('resize', this.windowObserve.bind(this));
		}
	}

	public observe(dimension?: IDimension): void {
		this.measureReferenceDomElement(true, dimension);
	}

	private mutationObserve(mutations: MutationRecord[], observer: MutationObserver): void {
		this.measureReferenceDomElement(true);
	}

	private windowObserve(): void {
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
