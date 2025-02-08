/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum CommentCommandId {
	Add = 'workbench.action.addComment',
	FocusCommentOnCurrentLine = 'workbench.action.focusCommentOnCurrentLine',
	NextThread = 'editor.action.nextCommentThreadAction',
	PreviousThread = 'editor.action.previousCommentThreadAction',
	NextCommentedRange = 'editor.action.nextCommentedRangeAction',
	PreviousCommentedRange = 'editor.action.previousCommentedRangeAction',
	NextRange = 'editor.action.nextCommentingRange',
	PreviousRange = 'editor.action.previousCommentingRange',
	ToggleCommenting = 'workbench.action.toggleCommenting',
	Submit = 'editor.action.submitComment',
	Hide = 'workbench.action.hideComment',
	CollapseAll = 'workbench.action.collapseAllComments',
	ExpandAll = 'workbench.action.expandAllComments',
	ExpandUnresolved = 'workbench.action.expandUnresolvedComments'
}
