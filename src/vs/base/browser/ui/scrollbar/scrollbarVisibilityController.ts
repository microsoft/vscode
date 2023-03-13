/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { TimeoutTimer } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

export class ScrollbarVisibilityController extends Disposable {
	private _visibility: ScrollbarVisibility;
	private _visibleClassName: string;
	private _invisibleClassName: string;
	private _domNode: FastDomNode<HTMLElement> | null;
	private _rawShouldBeVisible: boolean;
	private _shouldBeVisible: boolean;
	private _isNeeded: boolean;
	private _isVisible: boolean;
	private _revealTimer: TimeoutTimer;

	constructor(visibility: ScrollbarVisibility, visibleClassName: string, invisibleClassName: string) {
		super();
		this._visibility = visibility;
		this._visibleClassName = visibleClassName;
		this._invisibleClassName = invisibleClassName;
		this._domNode = null;
		this._isVisible = false;
		this._isNeeded = false;
		this._rawShouldBeVisible = false;
		this._shouldBeVisible = false;
		this._revealTimer = this._register(new TimeoutTimer());
	}

	get shouldBeVisible(): boolean {
		return this._shouldBeVisible;
	}

	get isVisible(): boolean {
		return this._isVisible;
	}

	get visibility() {
		return this._visibility;
	}

	get visibileClassName(): string {
		return this._visibleClassName;
	}

	get invisibleClassName(): string {
		return this._invisibleClassName;
	}

	public setVisibility(visibility: ScrollbarVisibility): void {
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
		// console.log('Inside of setVisibility');
		if (this._visibility !== visibility) {
			this._visibility = visibility;
			this._updateShouldBeVisible();
		}
	}

	// ----------------- Hide / Reveal

	public setShouldBeVisible(rawShouldBeVisible: boolean): void {
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
		// console.log('Inside of setShouldBeVisible of ScrollbarVisibilityController');
		// console.log('rawShouldBeVisible: ', rawShouldBeVisible);
		this._rawShouldBeVisible = rawShouldBeVisible;
		this._updateShouldBeVisible();
	}

	private _applyVisibilitySetting(): boolean {
		if (this._visibility === ScrollbarVisibility.Hidden) {
			return false;
		}
		if (this._visibility === ScrollbarVisibility.Visible) {
			return true;
		}
		return this._rawShouldBeVisible;
	}

	private _updateShouldBeVisible(): void {
		const shouldBeVisible = this._applyVisibilitySetting();
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
		// console.log('Inside of _updateShouldBeVisible of ScrollbarVisibilityController');
		// console.log('this._shouldBeVisible: ', this._shouldBeVisible);
		// console.log('shouldBeVisible: ', shouldBeVisible);
		if (this._shouldBeVisible !== shouldBeVisible) {
			this._shouldBeVisible = shouldBeVisible;
			this.ensureVisibility();
		}
	}

	public setIsNeeded(isNeeded: boolean): void {
		if (this._isNeeded !== isNeeded) {
			this._isNeeded = isNeeded;
			this.ensureVisibility();
		}
	}

	public setDomNode(domNode: FastDomNode<HTMLElement>): void {
		this._domNode = domNode;
		// console.log('Inside of setDomNode of ScrollbarVisibilityController');
		this._domNode.setClassName(this._invisibleClassName);

		// Now that the flags & the dom node are in a consistent state, ensure the Hidden/Visible configuration
		this.setShouldBeVisible(false);
	}

	public ensureVisibility(): void {
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
		// console.log('Inside of ensureVisibility of ScrollbarVisibilityController');
		if (!this._isNeeded) {
			// Nothing to be rendered
			// console.log('is not neeeded');
			this._hide(false);
			return;
		}

		if (this._shouldBeVisible) {
			// console.log('revealing');
			this._reveal();
		} else {
			// console.log('hiding');
			this._hide(true);
		}
	}

	private _reveal(): void {
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
		// console.log('Inside of _reveal of ScrollbarVisibilityController');
		if (this._isVisible) {
			// console.log('Early return because visible');
			return;
		}
		this._isVisible = true;

		// The CSS animation doesn't play otherwise
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
		// console.log('set the visible class name');
		// console.log('this._visibleClassName : ', this._visibleClassName);
		this._revealTimer.setIfNotSet(() => {
			this._domNode?.setClassName(this._visibleClassName);
		}, 0);
		// this._domNode?.setClassName(this._visibleClassName);
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
	}

	private _hide(withFadeAway: boolean): void {
		// console.log('this._domNode?.domNode.className: ', this._domNode?.domNode.className);
		// console.log('Inside of _hide of ScrollbarVisibilityController');
		this._revealTimer.cancel();
		if (!this._isVisible) {
			// console.log('Early return because not visible');
			return;
		}
		this._isVisible = false;
		// console.log('set the invisible class name');
		this._domNode?.setClassName(this._invisibleClassName + (withFadeAway ? ' fade' : ''));
	}
}
