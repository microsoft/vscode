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

	public setVisibility(visibility: ScrollbarVisibility): void {
		if (this._visibility !== visibility) {
			this._visibility = visibility;
			this._updateShouldBeVisible();
		}
	}

	// ----------------- Hide / Reveal

	public setShouldBeVisible(rawShouldBeVisible: boolean, isStickyLine?: boolean): void {
		this._rawShouldBeVisible = rawShouldBeVisible;
		this._updateShouldBeVisible(isStickyLine);
	}

	private _applyVisibilitySetting(isStickyLine?: boolean): boolean {
		if (isStickyLine) {
			console.log('this._visibility : ', this._visibility);
		}

		if (this._visibility === ScrollbarVisibility.Hidden) {
			return false;
		}
		if (this._visibility === ScrollbarVisibility.Visible) {
			return true;
		}
		return this._rawShouldBeVisible;
	}

	private _updateShouldBeVisible(isStickyLine?: boolean): void {
		let shouldBeVisible = this._applyVisibilitySetting(isStickyLine);

		if (isStickyLine) {
			console.log('this._shouldBeVisible : ', this._shouldBeVisible);
			console.log('shouldBeVisible : ', shouldBeVisible);
			shouldBeVisible = true;
		}
		if (this._shouldBeVisible !== shouldBeVisible) {
			this._shouldBeVisible = shouldBeVisible;
			this.ensureVisibility(isStickyLine);
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
		this._domNode.setClassName(this._invisibleClassName);

		// Now that the flags & the dom node are in a consistent state, ensure the Hidden/Visible configuration
		this.setShouldBeVisible(false);
	}

	public ensureVisibility(isStickyLine?: boolean): void {

		if (isStickyLine) {
			console.log('this._isNeeded : ', this._isNeeded);
			console.log('this._shouldBeVisible : ', this._shouldBeVisible);
		}

		if (!isStickyLine && !this._isNeeded) {
			// Nothing to be rendered
			this._hide(false, isStickyLine);
			return;
		}

		if (this._shouldBeVisible) {
			this._reveal(isStickyLine);
		} else {
			this._hide(true, isStickyLine);
		}
	}

	private _reveal(isStickyLine?: boolean): void {
		if (isStickyLine) {
			console.log('inside or _reveal');
			console.log('this._isVisible : ', this._isVisible);
		}
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;
		if (isStickyLine) {
			console.log('this._isVisible : ', this._isVisible);
			console.log('this._visibleClassName : ', this._visibleClassName);
		}

		// The CSS animation doesn't play otherwise
		this._revealTimer.setIfNotSet(() => {
			this._domNode?.setClassName(this._visibleClassName, isStickyLine);
		}, 0);
	}

	private _hide(withFadeAway: boolean, isStickyLine?: boolean): void {
		if (isStickyLine) {
			console.log('inside of _hide');
			console.log('this._isVisible : ', this._isVisible);
		}
		this._revealTimer.cancel();
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._domNode?.setClassName(this._invisibleClassName + (withFadeAway ? ' fade' : ''));
	}
}
