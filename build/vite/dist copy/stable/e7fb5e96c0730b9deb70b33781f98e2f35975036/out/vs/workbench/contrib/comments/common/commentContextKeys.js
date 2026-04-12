/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export var CommentContextKeys;
(function (CommentContextKeys) {
    /**
     * A context key that is set when the active cursor is in a commenting range.
     */
    CommentContextKeys.activeCursorHasCommentingRange = new RawContextKey('activeCursorHasCommentingRange', false, {
        description: nls.localize('hasCommentingRange', "Whether the position at the active cursor has a commenting range"),
        type: 'boolean'
    });
    /**
     * A context key that is set when the active cursor is in the range of an existing comment.
     */
    CommentContextKeys.activeCursorHasComment = new RawContextKey('activeCursorHasComment', false, {
        description: nls.localize('hasComment', "Whether the position at the active cursor has a comment"),
        type: 'boolean'
    });
    /**
     * A context key that is set when the active editor has commenting ranges.
     */
    CommentContextKeys.activeEditorHasCommentingRange = new RawContextKey('activeEditorHasCommentingRange', false, {
        description: nls.localize('editorHasCommentingRange', "Whether the active editor has a commenting range"),
        type: 'boolean'
    });
    /**
     * A context key that is set when the workspace has either comments or commenting ranges.
     */
    CommentContextKeys.WorkspaceHasCommenting = new RawContextKey('workspaceHasCommenting', false, {
        description: nls.localize('hasCommentingProvider', "Whether the open workspace has either comments or commenting ranges."),
        type: 'boolean'
    });
    /**
     * A context key that is set when the comment thread has no comments.
     */
    CommentContextKeys.commentThreadIsEmpty = new RawContextKey('commentThreadIsEmpty', false, { type: 'boolean', description: nls.localize('commentThreadIsEmpty', "Set when the comment thread has no comments") });
    /**
     * A context key that is set when the comment has no input.
     */
    CommentContextKeys.commentIsEmpty = new RawContextKey('commentIsEmpty', false, { type: 'boolean', description: nls.localize('commentIsEmpty', "Set when the comment has no input") });
    /**
     * The context value of the comment.
     */
    CommentContextKeys.commentContext = new RawContextKey('comment', undefined, { type: 'string', description: nls.localize('comment', "The context value of the comment") });
    /**
     * The context value of the comment thread.
     */
    CommentContextKeys.commentThreadContext = new RawContextKey('commentThread', undefined, { type: 'string', description: nls.localize('commentThread', "The context value of the comment thread") });
    /**
     * The comment controller id associated with a comment thread.
     */
    CommentContextKeys.commentControllerContext = new RawContextKey('commentController', undefined, { type: 'string', description: nls.localize('commentController', "The comment controller id associated with a comment thread") });
    /**
     * The comment widget is focused.
     */
    CommentContextKeys.commentFocused = new RawContextKey('commentFocused', false, { type: 'boolean', description: nls.localize('commentFocused', "Set when the comment is focused") });
    /**
     * A context key that is set when a comment widget is visible in the editor.
     */
    CommentContextKeys.commentWidgetVisible = new RawContextKey('commentWidgetVisible', false, { type: 'boolean', description: nls.localize('commentWidgetVisible', "Set when a comment widget is visible in the editor") });
    /**
     * A context key that is set when commenting is enabled.
     */
    CommentContextKeys.commentingEnabled = new RawContextKey('commentingEnabled', true, {
        description: nls.localize('commentingEnabled', "Whether commenting functionality is enabled"),
        type: 'boolean'
    });
})(CommentContextKeys || (CommentContextKeys = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudENvbnRleHRLZXlzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvY29tbW9uL2NvbW1lbnRDb250ZXh0S2V5cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUdyRixNQUFNLEtBQVcsa0JBQWtCLENBd0VsQztBQXhFRCxXQUFpQixrQkFBa0I7SUFFbEM7O09BRUc7SUFDVSxpREFBOEIsR0FBRyxJQUFJLGFBQWEsQ0FBVSxnQ0FBZ0MsRUFBRSxLQUFLLEVBQUU7UUFDakgsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsa0VBQWtFLENBQUM7UUFDbkgsSUFBSSxFQUFFLFNBQVM7S0FDZixDQUFDLENBQUM7SUFFSDs7T0FFRztJQUNVLHlDQUFzQixHQUFHLElBQUksYUFBYSxDQUFVLHdCQUF3QixFQUFFLEtBQUssRUFBRTtRQUNqRyxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUseURBQXlELENBQUM7UUFDbEcsSUFBSSxFQUFFLFNBQVM7S0FDZixDQUFDLENBQUM7SUFFSDs7T0FFRztJQUNVLGlEQUE4QixHQUFHLElBQUksYUFBYSxDQUFVLGdDQUFnQyxFQUFFLEtBQUssRUFBRTtRQUNqSCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxrREFBa0QsQ0FBQztRQUN6RyxJQUFJLEVBQUUsU0FBUztLQUNmLENBQUMsQ0FBQztJQUVIOztPQUVHO0lBQ1UseUNBQXNCLEdBQUcsSUFBSSxhQUFhLENBQVUsd0JBQXdCLEVBQUUsS0FBSyxFQUFFO1FBQ2pHLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLHNFQUFzRSxDQUFDO1FBQzFILElBQUksRUFBRSxTQUFTO0tBQ2YsQ0FBQyxDQUFDO0lBRUg7O09BRUc7SUFDVSx1Q0FBb0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSxzQkFBc0IsRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLDZDQUE2QyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3JOOztPQUVHO0lBQ1UsaUNBQWMsR0FBRyxJQUFJLGFBQWEsQ0FBVSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLG1DQUFtQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3pMOztPQUVHO0lBQ1UsaUNBQWMsR0FBRyxJQUFJLGFBQWEsQ0FBUyxTQUFTLEVBQUUsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsa0NBQWtDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDNUs7O09BRUc7SUFDVSx1Q0FBb0IsR0FBRyxJQUFJLGFBQWEsQ0FBUyxlQUFlLEVBQUUsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUseUNBQXlDLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDck07O09BRUc7SUFDVSwyQ0FBd0IsR0FBRyxJQUFJLGFBQWEsQ0FBUyxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLDREQUE0RCxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXBPOztPQUVHO0lBQ1UsaUNBQWMsR0FBRyxJQUFJLGFBQWEsQ0FBVSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLGlDQUFpQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXZMOztPQUVHO0lBQ1UsdUNBQW9CLEdBQUcsSUFBSSxhQUFhLENBQVUsc0JBQXNCLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxvREFBb0QsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUU1Tjs7T0FFRztJQUNVLG9DQUFpQixHQUFHLElBQUksYUFBYSxDQUFVLG1CQUFtQixFQUFFLElBQUksRUFBRTtRQUN0RixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSw2Q0FBNkMsQ0FBQztRQUM3RixJQUFJLEVBQUUsU0FBUztLQUNmLENBQUMsQ0FBQztBQUNKLENBQUMsRUF4RWdCLGtCQUFrQixLQUFsQixrQkFBa0IsUUF3RWxDIn0=