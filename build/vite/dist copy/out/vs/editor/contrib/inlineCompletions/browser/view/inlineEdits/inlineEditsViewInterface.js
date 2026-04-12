/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindow } from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
export var InlineEditTabAction;
(function (InlineEditTabAction) {
    InlineEditTabAction["Jump"] = "jump";
    InlineEditTabAction["Accept"] = "accept";
    InlineEditTabAction["Inactive"] = "inactive";
})(InlineEditTabAction || (InlineEditTabAction = {}));
export class InlineEditClickEvent {
    static create(event, alternativeAction = false) {
        return new InlineEditClickEvent(new StandardMouseEvent(getWindow(event), event), alternativeAction);
    }
    constructor(event, alternativeAction = false) {
        this.event = event;
        this.alternativeAction = alternativeAction;
    }
}
// TODO: Move this out of here as it is also includes ghosttext
export var InlineCompletionViewKind;
(function (InlineCompletionViewKind) {
    InlineCompletionViewKind["GhostText"] = "ghostText";
    InlineCompletionViewKind["Custom"] = "custom";
    InlineCompletionViewKind["SideBySide"] = "sideBySide";
    InlineCompletionViewKind["Deletion"] = "deletion";
    InlineCompletionViewKind["InsertionInline"] = "insertionInline";
    InlineCompletionViewKind["InsertionMultiLine"] = "insertionMultiLine";
    InlineCompletionViewKind["WordReplacements"] = "wordReplacements";
    InlineCompletionViewKind["LineReplacement"] = "lineReplacement";
    InlineCompletionViewKind["Collapsed"] = "collapsed";
    InlineCompletionViewKind["JumpTo"] = "jumpTo";
})(InlineCompletionViewKind || (InlineCompletionViewKind = {}));
export class InlineCompletionViewData {
    constructor(cursorColumnDistance, cursorLineDistance, lineCountOriginal, lineCountModified, characterCountOriginal, characterCountModified, disjointReplacements, sameShapeReplacements) {
        this.cursorColumnDistance = cursorColumnDistance;
        this.cursorLineDistance = cursorLineDistance;
        this.lineCountOriginal = lineCountOriginal;
        this.lineCountModified = lineCountModified;
        this.characterCountOriginal = characterCountOriginal;
        this.characterCountModified = characterCountModified;
        this.disjointReplacements = disjointReplacements;
        this.sameShapeReplacements = sameShapeReplacements;
        this.longDistanceHintVisible = undefined;
        this.longDistanceHintDistance = undefined;
    }
    setLongDistanceViewData(lineNumber, inlineEditLineNumber) {
        this.longDistanceHintVisible = true;
        this.longDistanceHintDistance = Math.abs(inlineEditLineNumber - lineNumber);
    }
    getData() {
        return {
            cursorColumnDistance: this.cursorColumnDistance,
            cursorLineDistance: this.cursorLineDistance,
            lineCountOriginal: this.lineCountOriginal,
            lineCountModified: this.lineCountModified,
            characterCountOriginal: this.characterCountOriginal,
            characterCountModified: this.characterCountModified,
            disjointReplacements: this.disjointReplacements,
            sameShapeReplacements: this.sameShapeReplacements,
            longDistanceHintVisible: this.longDistanceHintVisible,
            longDistanceHintDistance: this.longDistanceHintDistance
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbEUsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFJL0YsTUFBTSxDQUFOLElBQVksbUJBSVg7QUFKRCxXQUFZLG1CQUFtQjtJQUM5QixvQ0FBYSxDQUFBO0lBQ2Isd0NBQWlCLENBQUE7SUFDakIsNENBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQUpXLG1CQUFtQixLQUFuQixtQkFBbUIsUUFJOUI7QUFFRCxNQUFNLE9BQU8sb0JBQW9CO0lBQ2hDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBZ0MsRUFBRSxvQkFBNkIsS0FBSztRQUNqRixPQUFPLElBQUksb0JBQW9CLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUNyRyxDQUFDO0lBQ0QsWUFDaUIsS0FBa0IsRUFDbEIsb0JBQTZCLEtBQUs7UUFEbEMsVUFBSyxHQUFMLEtBQUssQ0FBYTtRQUNsQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQWlCO0lBQy9DLENBQUM7Q0FDTDtBQVFELCtEQUErRDtBQUMvRCxNQUFNLENBQU4sSUFBWSx3QkFXWDtBQVhELFdBQVksd0JBQXdCO0lBQ25DLG1EQUF1QixDQUFBO0lBQ3ZCLDZDQUFpQixDQUFBO0lBQ2pCLHFEQUF5QixDQUFBO0lBQ3pCLGlEQUFxQixDQUFBO0lBQ3JCLCtEQUFtQyxDQUFBO0lBQ25DLHFFQUF5QyxDQUFBO0lBQ3pDLGlFQUFxQyxDQUFBO0lBQ3JDLCtEQUFtQyxDQUFBO0lBQ25DLG1EQUF1QixDQUFBO0lBQ3ZCLDZDQUFpQixDQUFBO0FBQ2xCLENBQUMsRUFYVyx3QkFBd0IsS0FBeEIsd0JBQXdCLFFBV25DO0FBRUQsTUFBTSxPQUFPLHdCQUF3QjtJQUtwQyxZQUNpQixvQkFBNEIsRUFDNUIsa0JBQTBCLEVBQzFCLGlCQUF5QixFQUN6QixpQkFBeUIsRUFDekIsc0JBQThCLEVBQzlCLHNCQUE4QixFQUM5QixvQkFBNEIsRUFDNUIscUJBQStCO1FBUC9CLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBUTtRQUM1Qix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQVE7UUFDMUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFRO1FBQ3pCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBUTtRQUN6QiwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQVE7UUFDOUIsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUFRO1FBQzlCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBUTtRQUM1QiwwQkFBcUIsR0FBckIscUJBQXFCLENBQVU7UUFYekMsNEJBQXVCLEdBQXdCLFNBQVMsQ0FBQztRQUN6RCw2QkFBd0IsR0FBdUIsU0FBUyxDQUFDO0lBVzVELENBQUM7SUFFTCx1QkFBdUIsQ0FBQyxVQUFrQixFQUFFLG9CQUE0QjtRQUN2RSxJQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDO1FBQ3BDLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLFVBQVUsQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFFRCxPQUFPO1FBQ04sT0FBTztZQUNOLG9CQUFvQixFQUFFLElBQUksQ0FBQyxvQkFBb0I7WUFDL0Msa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGtCQUFrQjtZQUMzQyxpQkFBaUIsRUFBRSxJQUFJLENBQUMsaUJBQWlCO1lBQ3pDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxpQkFBaUI7WUFDekMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLHNCQUFzQjtZQUNuRCxzQkFBc0IsRUFBRSxJQUFJLENBQUMsc0JBQXNCO1lBQ25ELG9CQUFvQixFQUFFLElBQUksQ0FBQyxvQkFBb0I7WUFDL0MscUJBQXFCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQjtZQUNqRCx1QkFBdUIsRUFBRSxJQUFJLENBQUMsdUJBQXVCO1lBQ3JELHdCQUF3QixFQUFFLElBQUksQ0FBQyx3QkFBd0I7U0FDdkQsQ0FBQztJQUNILENBQUM7Q0FDRCJ9