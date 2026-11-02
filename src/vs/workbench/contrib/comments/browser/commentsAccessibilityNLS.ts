/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToggleTabFocusModeAction } from '../../../../editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode.js';
import { localize } from '../../../../nls.js';
import { CommentCommandId } from '../common/commentCommandIds.js';

export namespace CommentAccessibilityHelpNLS {
	export const intro = localize('intro', "The editor contains commentable range(s). Some useful commands include:");
	export const tabFocus = localize('introWidget', "This widget contains a text area, for composition of new comments, and actions, that can be tabbed to once tab moves focus mode has been enabled with the command Toggle Tab Key Moves Focus{0}.", `<keybinding:${ToggleTabFocusModeAction.ID}>`);
	export const commentCommands = localize('commentCommands', "Some useful comment commands include:");
	export const escape = localize('escape', "- Dismiss Comment{0}.", `<keybinding:${CommentCommandId.Hide}>`);
	export const nextRange = localize('next', "- Go to Next Commenting Range{0}.", `<keybinding:${CommentCommandId.NextRange}>`);
	export const previousRange = localize('previous', "- Go to Previous Commenting Range{0}.", `<keybinding:${CommentCommandId.PreviousRange}>`);
	export const nextCommentThread = localize('nextCommentThreadKb', "- Go to Next Comment Thread{0}.", `<keybinding:${CommentCommandId.NextThread}>`);
	export const previousCommentThread = localize('previousCommentThreadKb', "- Go to Previous Comment Thread{0}.", `<keybinding:${CommentCommandId.PreviousThread}>`);
	export const nextCommentedRange = localize('nextCommentedRangeKb', "- Go to Next Commented Range{0}.", `<keybinding:${CommentCommandId.NextCommentedRange}>`);
	export const previousCommentedRange = localize('previousCommentedRangeKb', "- Go to Previous Commented Range{0}.", `<keybinding:${CommentCommandId.PreviousCommentedRange}>`);
	export const addComment = localize('addCommentNoKb', "- Add Comment on Current Selection{0}.", `<keybinding:${CommentCommandId.Add}>`);
	export const submitComment = localize('submitComment', "- Submit Comment{0}.", `<keybinding:${CommentCommandId.Submit}>`);
}
