/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { noBreakWhitespace } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import './inlineProgressWidget.css';
import { Range } from '../../../common/core/range.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
const inlineProgressDecoration = ModelDecorationOptions.register({
    description: 'inline-progress-widget',
    stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
    showIfCollapsed: true,
    after: {
        content: noBreakWhitespace,
        inlineClassName: 'inline-editor-progress-decoration',
        inlineClassNameAffectsLetterSpacing: true,
    }
});
class InlineProgressWidget extends Disposable {
    static { this.baseId = 'editor.widget.inlineProgressWidget'; }
    constructor(typeId, editor, range, title, delegate) {
        super();
        this.typeId = typeId;
        this.editor = editor;
        this.range = range;
        this.delegate = delegate;
        this.allowEditorOverflow = false;
        this.suppressMouseDown = true;
        this.create(title);
        this.editor.addContentWidget(this);
        this.editor.layoutContentWidget(this);
    }
    create(title) {
        this.domNode = dom.$('.inline-progress-widget');
        this.domNode.role = 'button';
        this.domNode.title = title;
        const iconElement = dom.$('span.icon');
        this.domNode.append(iconElement);
        iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
        const updateSize = () => {
            const lineHeight = this.editor.getOption(75 /* EditorOption.lineHeight */);
            this.domNode.style.height = `${lineHeight}px`;
            this.domNode.style.width = `${Math.ceil(0.8 * lineHeight)}px`;
        };
        updateSize();
        this._register(this.editor.onDidChangeConfiguration(c => {
            if (c.hasChanged(61 /* EditorOption.fontSize */) || c.hasChanged(75 /* EditorOption.lineHeight */)) {
                updateSize();
            }
        }));
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, e => {
            this.delegate.cancel();
        }));
    }
    getId() {
        return InlineProgressWidget.baseId + '.' + this.typeId;
    }
    getDomNode() {
        return this.domNode;
    }
    getPosition() {
        return {
            position: { lineNumber: this.range.startLineNumber, column: this.range.startColumn },
            preference: [0 /* ContentWidgetPositionPreference.EXACT */]
        };
    }
    dispose() {
        super.dispose();
        this.editor.removeContentWidget(this);
    }
}
let InlineProgressManager = class InlineProgressManager extends Disposable {
    constructor(id, _editor, _instantiationService) {
        super();
        this.id = id;
        this._editor = _editor;
        this._instantiationService = _instantiationService;
        /** Delay before showing the progress widget */
        this._showDelay = 500; // ms
        this._showPromise = this._register(new MutableDisposable());
        this._currentWidget = this._register(new MutableDisposable());
        this._operationIdPool = 0;
        this._currentDecorations = _editor.createDecorationsCollection();
    }
    dispose() {
        super.dispose();
        this._currentDecorations.clear();
    }
    async showWhile(position, title, promise, delegate, delayOverride) {
        const operationId = this._operationIdPool++;
        this._currentOperation = operationId;
        this.clear();
        this._showPromise.value = disposableTimeout(() => {
            const range = Range.fromPositions(position);
            const decorationIds = this._currentDecorations.set([{
                    range: range,
                    options: inlineProgressDecoration,
                }]);
            if (decorationIds.length > 0) {
                this._currentWidget.value = this._instantiationService.createInstance(InlineProgressWidget, this.id, this._editor, range, title, delegate);
            }
        }, delayOverride ?? this._showDelay);
        try {
            return await promise;
        }
        finally {
            if (this._currentOperation === operationId) {
                this.clear();
                this._currentOperation = undefined;
            }
        }
    }
    clear() {
        this._showPromise.clear();
        this._currentDecorations.clear();
        this._currentWidget.clear();
    }
};
InlineProgressManager = __decorate([
    __param(2, IInstantiationService)
], InlineProgressManager);
export { InlineProgressManager };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lUHJvZ3Jlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVQcm9ncmVzcy9icm93c2VyL2lubGluZVByb2dyZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDckUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyw0QkFBNEIsQ0FBQztBQUlwQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHdEQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsTUFBTSx3QkFBd0IsR0FBRyxzQkFBc0IsQ0FBQyxRQUFRLENBQUM7SUFDaEUsV0FBVyxFQUFFLHdCQUF3QjtJQUNyQyxVQUFVLDREQUFvRDtJQUM5RCxlQUFlLEVBQUUsSUFBSTtJQUNyQixLQUFLLEVBQUU7UUFDTixPQUFPLEVBQUUsaUJBQWlCO1FBQzFCLGVBQWUsRUFBRSxtQ0FBbUM7UUFDcEQsbUNBQW1DLEVBQUUsSUFBSTtLQUN6QztDQUNELENBQUMsQ0FBQztBQUdILE1BQU0sb0JBQXFCLFNBQVEsVUFBVTthQUNwQixXQUFNLEdBQUcsb0NBQW9DLEFBQXZDLENBQXdDO0lBT3RFLFlBQ2tCLE1BQWMsRUFDZCxNQUFtQixFQUNuQixLQUFZLEVBQzdCLEtBQWEsRUFDSSxRQUFnQztRQUVqRCxLQUFLLEVBQUUsQ0FBQztRQU5TLFdBQU0sR0FBTixNQUFNLENBQVE7UUFDZCxXQUFNLEdBQU4sTUFBTSxDQUFhO1FBQ25CLFVBQUssR0FBTCxLQUFLLENBQU87UUFFWixhQUFRLEdBQVIsUUFBUSxDQUF3QjtRQVZsRCx3QkFBbUIsR0FBRyxLQUFLLENBQUM7UUFDNUIsc0JBQWlCLEdBQUcsSUFBSSxDQUFDO1FBYXhCLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNuQyxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFTyxNQUFNLENBQUMsS0FBYTtRQUMzQixJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNoRCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxRQUFRLENBQUM7UUFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBRTNCLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFakMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFFbkcsTUFBTSxVQUFVLEdBQUcsR0FBRyxFQUFFO1lBQ3ZCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxrQ0FBeUIsQ0FBQztZQUNsRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsR0FBRyxVQUFVLElBQUksQ0FBQztZQUM5QyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDO1FBQy9ELENBQUMsQ0FBQztRQUNGLFVBQVUsRUFBRSxDQUFDO1FBRWIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3ZELElBQUksQ0FBQyxDQUFDLFVBQVUsZ0NBQXVCLElBQUksQ0FBQyxDQUFDLFVBQVUsa0NBQXlCLEVBQUUsQ0FBQztnQkFDbEYsVUFBVSxFQUFFLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDL0UsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN4QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLG9CQUFvQixDQUFDLE1BQU0sR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztJQUN4RCxDQUFDO0lBRUQsVUFBVTtRQUNULE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNyQixDQUFDO0lBRUQsV0FBVztRQUNWLE9BQU87WUFDTixRQUFRLEVBQUUsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFO1lBQ3BGLFVBQVUsRUFBRSwrQ0FBdUM7U0FDbkQsQ0FBQztJQUNILENBQUM7SUFFUSxPQUFPO1FBQ2YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdkMsQ0FBQzs7QUFPSyxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLFVBQVU7SUFZcEQsWUFDa0IsRUFBVSxFQUNWLE9BQW9CLEVBQ2QscUJBQTZEO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBSlMsT0FBRSxHQUFGLEVBQUUsQ0FBUTtRQUNWLFlBQU8sR0FBUCxPQUFPLENBQWE7UUFDRywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBYnJGLCtDQUErQztRQUM5QixlQUFVLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSztRQUN2QixpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFHdkQsbUJBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQXdCLENBQUMsQ0FBQztRQUV4RixxQkFBZ0IsR0FBRyxDQUFDLENBQUM7UUFVNUIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLE9BQU8sQ0FBQywyQkFBMkIsRUFBRSxDQUFDO0lBQ2xFLENBQUM7SUFFZSxPQUFPO1FBQ3RCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNoQixJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDbEMsQ0FBQztJQUVNLEtBQUssQ0FBQyxTQUFTLENBQUksUUFBbUIsRUFBRSxLQUFhLEVBQUUsT0FBbUIsRUFBRSxRQUFnQyxFQUFFLGFBQXNCO1FBQzFJLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQzVDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxXQUFXLENBQUM7UUFFckMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBRWIsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsaUJBQWlCLENBQUMsR0FBRyxFQUFFO1lBQ2hELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDNUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNuRCxLQUFLLEVBQUUsS0FBSztvQkFDWixPQUFPLEVBQUUsd0JBQXdCO2lCQUNqQyxDQUFDLENBQUMsQ0FBQztZQUVKLElBQUksYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM1SSxDQUFDO1FBQ0YsQ0FBQyxFQUFFLGFBQWEsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFckMsSUFBSSxDQUFDO1lBQ0osT0FBTyxNQUFNLE9BQU8sQ0FBQztRQUN0QixDQUFDO2dCQUFTLENBQUM7WUFDVixJQUFJLElBQUksQ0FBQyxpQkFBaUIsS0FBSyxXQUFXLEVBQUUsQ0FBQztnQkFDNUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNiLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUM7WUFDcEMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSztRQUNaLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDMUIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2pDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDN0IsQ0FBQztDQUNELENBQUE7QUE1RFkscUJBQXFCO0lBZS9CLFdBQUEscUJBQXFCLENBQUE7R0FmWCxxQkFBcUIsQ0E0RGpDIn0=