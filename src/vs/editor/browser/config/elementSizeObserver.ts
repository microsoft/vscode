/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { IDimension } from 'vs/editor/common/editorCommon';

export class ElementSizeObserver extends Disposable {

	private measureReferenceDomElementToken: number = -1;

	private width: number = -1;
	private height: number = -1;

	constructor(private referenceDomElement: HTMLElement, private changeCallback: () => void) {
		super();
		this.measureReferenceDomElement(false);
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
		if (this.measureReferenceDomElementToken === -1) {
			this.measureReferenceDomElementToken = setInterval(() => this.measureReferenceDomElement(true), 100);
		}
	}

	public stopObserving(): void {
		if (this.measureReferenceDomElementToken !== -1) {
			clearInterval(this.measureReferenceDomElementToken);
			this.measureReferenceDomElementToken = -1;
		}
	}

	public observe(dimension?: IDimension): void {
		this.measureReferenceDomElement(true, dimension);
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