/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TimeoutTimer } from '../../../common/async.js';
import { Disposable } from '../../../common/lifecycle.js';
export class ScrollbarVisibilityController extends Disposable {
    constructor(visibility, visibleClassName, invisibleClassName) {
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
    setVisibility(visibility) {
        if (this._visibility !== visibility) {
            this._visibility = visibility;
            this._updateShouldBeVisible();
        }
    }
    // ----------------- Hide / Reveal
    setShouldBeVisible(rawShouldBeVisible) {
        this._rawShouldBeVisible = rawShouldBeVisible;
        this._updateShouldBeVisible();
    }
    _applyVisibilitySetting() {
        if (this._visibility === 2 /* ScrollbarVisibility.Hidden */) {
            return false;
        }
        if (this._visibility === 3 /* ScrollbarVisibility.Visible */) {
            return true;
        }
        return this._rawShouldBeVisible;
    }
    _updateShouldBeVisible() {
        const shouldBeVisible = this._applyVisibilitySetting();
        if (this._shouldBeVisible !== shouldBeVisible) {
            this._shouldBeVisible = shouldBeVisible;
            this.ensureVisibility();
        }
    }
    setIsNeeded(isNeeded) {
        if (this._isNeeded !== isNeeded) {
            this._isNeeded = isNeeded;
            this.ensureVisibility();
        }
    }
    setDomNode(domNode) {
        this._domNode = domNode;
        this._domNode.setClassName(this._invisibleClassName);
        // Now that the flags & the dom node are in a consistent state, ensure the Hidden/Visible configuration
        this.setShouldBeVisible(false);
    }
    ensureVisibility() {
        if (!this._isNeeded) {
            // Nothing to be rendered
            this._hide(false);
            return;
        }
        if (this._shouldBeVisible) {
            this._reveal();
        }
        else {
            this._hide(true);
        }
    }
    _reveal() {
        if (this._isVisible) {
            return;
        }
        this._isVisible = true;
        // The CSS animation doesn't play otherwise
        this._revealTimer.setIfNotSet(() => {
            this._domNode?.setClassName(this._visibleClassName);
        }, 0);
    }
    _hide(withFadeAway) {
        this._revealTimer.cancel();
        if (!this._isVisible) {
            return;
        }
        this._isVisible = false;
        this._domNode?.setClassName(this._invisibleClassName + (withFadeAway ? ' fade' : ''));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Nyb2xsYmFyVmlzaWJpbGl0eUNvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGJhclZpc2liaWxpdHlDb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHMUQsTUFBTSxPQUFPLDZCQUE4QixTQUFRLFVBQVU7SUFXNUQsWUFBWSxVQUErQixFQUFFLGdCQUF3QixFQUFFLGtCQUEwQjtRQUNoRyxLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO1FBQzlCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQztRQUMxQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsa0JBQWtCLENBQUM7UUFDOUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDckIsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDeEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztRQUNqQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1FBQzlCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFlBQVksRUFBRSxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVNLGFBQWEsQ0FBQyxVQUErQjtRQUNuRCxJQUFJLElBQUksQ0FBQyxXQUFXLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDckMsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7WUFDOUIsSUFBSSxD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