/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class StableEditorScrollState {
    static capture(editor) {
        if (editor.getScrollTop() === 0 || editor.hasPendingScrollAnimation()) {
            // Never mess with the scroll top if the editor is at the top of the file or if there is a pending scroll animation
            return new StableEditorScrollState(editor.getScrollTop(), editor.getContentHeight(), null, 0, null);
        }
        let visiblePosition = null;
        let visiblePositionScrollDelta = 0;
        const visibleRanges = editor.getVisibleRanges();
        if (visibleRanges.length > 0) {
            visiblePosition = visibleRanges[0].getStartPosition();
            const visiblePositionScrollTop = editor.getTopForPosition(visiblePosition.lineNumber, visiblePosition.column);
            visiblePositionScrollDelta = editor.getScrollTop() - visiblePositionScrollTop;
        }
        return new StableEditorScrollState(editor.getScrollTop(), editor.getContentHeight(), visiblePosition, visiblePositionScrollDelta, editor.getPosition());
    }
    constructor(_initialScrollTop, _initialContentHeight, _visiblePosition, _visiblePositionScrollDelta, _cursorPosition) {
        this._initialScrollTop = _initialScrollTop;
        this._initialContentHeight = _initialContentHeight;
        this._visiblePosition = _visiblePosition;
        this._visiblePositionScrollDelta = _visiblePositionScrollDelta;
        this._cursorPosition = _cursorPosition;
    }
    restore(editor) {
        if (this._initialContentHeight === editor.getContentHeight() && this._initialScrollTop === editor.getScrollTop()) {
            // The editor's content height and scroll top haven't changed, so we don't need to do anything
            return;
        }
        if (this._visiblePosition) {
            const visiblePositionScrollTop = editor.getTopForPosition(this._visiblePosition.lineNumber, this._visiblePosition.column);
            editor.setScrollTop(visiblePositionScrollTop + this._visiblePositionScrollDelta);
        }
    }
    restoreRelativeVerticalPositionOfCursor(editor) {
        if (this._initialContentHeight === editor.getContentHeight() && this._initialScrollTop === editor.getScrollTop()) {
            // The editor's content height and scroll top haven't changed, so we don't need to do anything
            return;
        }
        const currentCursorPosition = editor.getPosition();
        if (!this._cursorPosition || !currentCursorPosition) {
            return;
        }
        const offset = editor.getTopForLineNumber(currentCursorPosition.lineNumber) - editor.getTopForLineNumber(this._cursorPosition.lineNumber);
        editor.setScrollTop(editor.getScrollTop() + offset, 1 /* ScrollType.Immediate */);
    }
}
export class StableEditorBottomScrollState {
    static capture(editor) {
        if (editor.hasPendingScrollAnimation()) {
            // Never mess with the scroll if there is a pending scroll animation
            return new StableEditorBottomScrollState(editor.getScrollTop(), editor.getContentHeight(), null, 0);
        }
        let visiblePosition = null;
        let visiblePositionScrollDelta = 0;
        const visibleRanges = editor.getVisibleRanges();
        if (visibleRanges.length > 0) {
            visiblePosition = visibleRanges.at(-1).getEndPosition();
            const visiblePositionScrollBottom = editor.getBottomForLineNumber(visiblePosition.lineNumber);
            visiblePositionScrollDelta = visiblePositionScrollBottom - editor.getScrollTop();
        }
        return new StableEditorBottomScrollState(editor.getScrollTop(), editor.getContentHeight(), visiblePosition, visiblePositionScrollDelta);
    }
    constructor(_initialScrollTop, _initialContentHeight, _visiblePosition, _visiblePositionScrollDelta) {
        this._initialScrollTop = _initialScrollTop;
        this._initialContentHeight = _initialContentHeight;
        this._visiblePosition = _visiblePosition;
        this._visiblePositionScrollDelta = _visiblePositionScrollDelta;
    }
    restore(editor) {
        if (this._initialContentHeight === editor.getContentHeight() && this._initialScrollTop === editor.getScrollTop()) {
            // The editor's content height and scroll top haven't changed, so we don't need to do anything
            return;
        }
        if (this._visiblePosition) {
            const visiblePositionScrollBottom = editor.getBottomForLineNumber(this._visiblePosition.lineNumber);
            editor.setScrollTop(visiblePositionScrollBottom - this._visiblePositionScrollDelta, 1 /* ScrollType.Immediate */);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhYmxlRWRpdG9yU2Nyb2xsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvc3RhYmxlRWRpdG9yU2Nyb2xsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBTWhHLE1BQU0sT0FBTyx1QkFBdUI7SUFFNUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFtQjtRQUN4QyxJQUFJLE1BQU0sQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLHlCQUF5QixFQUFFLEVBQUUsQ0FBQztZQUN2RSxtSEFBbUg7WUFDbkgsT0FBTyxJQUFJLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JHLENBQUM7UUFFRCxJQUFJLGVBQWUsR0FBb0IsSUFBSSxDQUFDO1FBQzVDLElBQUksMEJBQTBCLEdBQUcsQ0FBQyxDQUFDO1FBQ25DLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ2hELElBQUksYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUM5QixlQUFlLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDdEQsTUFBTSx3QkFBd0IsR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUMsZUFBZSxDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUcsMEJBQTBCLEdBQUcsTUFBTSxDQUFDLFlBQVksRUFBRSxHQUFHLHdCQUF3QixDQUFDO1FBQy9FLENBQUM7UUFDRCxPQUFPLElBQUksdUJBQXVCLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLGVBQWUsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztJQUN6SixDQUFDO0lBRUQsWUFDa0IsaUJBQXlCLEVBQ3pCLHFCQUE2QixFQUM3QixnQkFBaUMsRUFDakMsMkJBQW1DLEVBQ25DLGVBQWdDO1FBSmhDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBUTtRQUN6QiwwQkFBcUIsR0FBckIscUJBQXFCLENBQVE7UUFDN0IscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFpQjtRQUNqQyxnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQVE7UUFDbkMsb0JBQWUsR0FBZixlQUFlLENBQWlCO0lBRWxELENBQUM7SUFFTSxPQUFPLENBQUMsTUFBbUI7UUFDakMsSUFBSSxJQUFJLENBQUMscUJBQXFCLEtBQUssTUFBTSxDQUFDLGdCQUFnQixFQUFFLElBQUksSUFBSSxDQUFDLGlCQUFpQixLQUFLLE1BQU0sQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDO1lBQ2xILDhGQUE4RjtZQUM5RixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDM0IsTUFBTSx3QkFBd0IsR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUgsTUFBTSxDQUFDLFlBQVksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUNsRixDQUFDO0lBQ0YsQ0FBQztJQUVNLHVDQUF1QyxDQUFDLE1BQW1CO1FBQ2pFLElBQUksSUFBSSxDQUFDLHFCQUFxQixLQUFLLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsS0FBSyxNQUFNLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztZQUNsSCw4RkFBOEY7WUFDOUYsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUVuRCxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDckQsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsbUJBQW1CLENBQUMscUJBQXFCLENBQUMsVUFBVSxDQUFDLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUksTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLEdBQUcsTUFBTSwrQkFBdUIsQ0FBQztJQUMzRSxDQUFDO0NBQ0Q7QUFHRCxNQUFNLE9BQU8sNkJBQTZCO0lBRWxDLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBbUI7UUFDeEMsSUFBSSxNQUFNLENBQUMseUJBQXlCLEVBQUUsRUFBRSxDQUFDO1lBQ3hDLG9FQUFvRTtZQUNwRSxPQUFPLElBQUksNkJBQTZCLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyRyxDQUFDO1FBRUQsSUFBSSxlQUFlLEdBQW9CLElBQUksQ0FBQztRQUM1QyxJQUFJLDBCQUEwQixHQUFHLENBQUMsQ0FBQztRQUNuQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUNoRCxJQUFJLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUIsZUFBZSxHQUFHLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN6RCxNQUFNLDJCQUEyQixHQUFHLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDOUYsMEJBQTBCLEdBQUcsMkJBQTJCLEdBQUcsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xGLENBQUM7UUFDRCxPQUFPLElBQUksNkJBQTZCLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxFQUFFLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLGVBQWUsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0lBQ3pJLENBQUM7SUFFRCxZQUNrQixpQkFBeUIsRUFDekIscUJBQTZCLEVBQzdCLGdCQUFpQyxFQUNqQywyQkFBbUM7UUFIbkMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFRO1FBQ3pCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBUTtRQUM3QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWlCO1FBQ2pDLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBUTtJQUVyRCxDQUFDO0lBRU0sT0FBTyxDQUFDLE1BQW1CO1FBQ2pDLElBQUksSUFBSSxDQUFDLHFCQUFxQixLQUFLLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLElBQUksQ0FBQyxpQkFBaUIsS0FBSyxNQUFNLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztZQUNsSCw4RkFBOEY7WUFDOUYsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzNCLE1BQU0sMkJBQTJCLEdBQUcsTUFBTSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNwRyxNQUFNLENBQUMsWUFBWSxDQUFDLDJCQUEyQixHQUFHLElBQUksQ0FBQywyQkFBMkIsK0JBQXVCLENBQUM7UUFDM0csQ0FBQztJQUNGLENBQUM7Q0FDRCJ9