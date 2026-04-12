/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derivedWithSetter, observableValue } from '../../../../../base/common/observable.js';
export class SashLayout {
    resetSash() {
        this._sashRatio.set(undefined, undefined);
    }
    constructor(_options, dimensions) {
        this._options = _options;
        this.dimensions = dimensions;
        this.sashLeft = derivedWithSetter(this, reader => {
            const ratio = this._sashRatio.read(reader) ?? this._options.splitViewDefaultRatio.read(reader);
            return this._computeSashLeft(ratio, reader);
        }, (value, tx) => {
            const contentWidth = this.dimensions.width.get();
            this._sashRatio.set(value / contentWidth, tx);
        });
        this._sashRatio = observableValue(this, undefined);
    }
    /** @pure */
    _computeSashLeft(desiredRatio, reader) {
        const contentWidth = this.dimensions.width.read(reader);
        const midPoint = Math.floor(this._options.splitViewDefaultRatio.read(reader) * contentWidth);
        const sashLeft = this._options.enableSplitViewResizing.read(reader) ? Math.floor(desiredRatio * contentWidth) : midPoint;
        const MINIMUM_EDITOR_WIDTH = 100;
        if (contentWidth <= MINIMUM_EDITOR_WIDTH * 2) {
            return midPoint;
        }
        if (sashLeft < MINIMUM_EDITOR_WIDTH) {
            return MINIMUM_EDITOR_WIDTH;
        }
        if (sashLeft > contentWidth - MINIMUM_EDITOR_WIDTH) {
            return contentWidth - MINIMUM_EDITOR_WIDTH;
        }
        return sashLeft;
    }
}
export class DiffEditorSash extends Disposable {
    constructor(_domNode, _dimensions, _enabled, _boundarySashes, sashLeft, _resetSash) {
        super();
        this._domNode = _domNode;
        this._dimensions = _dimensions;
        this._enabled = _enabled;
        this._boundarySashes = _boundarySashes;
        this.sashLeft = sashLeft;
        this._resetSash = _resetSash;
        this._sash = this._register(new Sash(this._domNode, {
            getVerticalSashTop: (_sash) => 0,
            getVerticalSashLeft: (_sash) => this.sashLeft.get(),
            getVerticalSashHeight: (_sash) => this._dimensions.height.get(),
        }, { orientation: 0 /* Orientation.VERTICAL */ }));
        this._startSashPosition = undefined;
        this._register(this._sash.onDidStart(() => {
            this._startSashPosition = this.sashLeft.get();
        }));
        this._register(this._sash.onDidChange((e) => {
            this.sashLeft.set(this._startSashPosition + (e.currentX - e.startX), undefined);
        }));
        this._register(this._sash.onDidEnd(() => this._sash.layout()));
        this._register(this._sash.onDidReset(() => this._resetSash()));
        this._register(autorun(reader => {
            const sashes = this._boundarySashes.read(reader);
            if (sashes) {
                this._sash.orthogonalEndSash = sashes.bottom;
            }
        }));
        this._register(autorun(reader => {
            /** @description DiffEditorSash.layoutSash */
            const enabled = this._enabled.read(reader);
            this._sash.state = enabled ? 3 /* SashState.Enabled */ : 0 /* SashState.Disabled */;
            this.sashLeft.read(reader);
            this._dimensions.height.read(reader);
            this._sash.layout();
        }));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvclNhc2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9jb21wb25lbnRzL2RpZmZFZGl0b3JTYXNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBNEMsSUFBSSxFQUFhLE1BQU0sNkNBQTZDLENBQUM7QUFDeEgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBNkMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR2xKLE1BQU0sT0FBTyxVQUFVO0lBV2YsU0FBUztRQUNmLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsWUFDa0IsUUFBMkIsRUFDNUIsVUFBdUU7UUFEdEUsYUFBUSxHQUFSLFFBQVEsQ0FBbUI7UUFDNUIsZUFBVSxHQUFWLFVBQVUsQ0FBNkQ7UUFoQnhFLGFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUU7WUFDM0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDL0YsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzdDLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsRUFBRTtZQUNoQixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNq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