/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import * as languages from '../../../../editor/common/languages.js';
import { peekViewBorder } from '../../../../editor/contrib/peekView/browser/peekView.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { getCommentThreadStateBorderColor } from './commentColors.js';
import { CommentGlyphWidget } from './commentGlyphWidget.js';
import { ICommentService } from './commentService.js';

export enum CommentWidgetFocus {
	None = 0,
	Widget = 1,
	Editor = 2
}

/**
 * A comment thread shown in a code editor, independent of how it is presented
 * (between the lines of the editor or floating above them).
 */
export interface ICommentThreadEditorWidget extends IDisposable {
	readonly editor: ICodeEditor;
	readonly uniqueOwner: string;
	readonly commentThread: languages.CommentThread;
	readonly expanded: boolean | undefined;
	readonly onDidChangeExpandedState: Event<boolean>;
	readonly onDidClose: Event<unknown>;

	display(range: IRange | undefined, shouldReveal: boolean): Promise<void>;
	update(commentThread: languages.CommentThread<IRange>): Promise<void>;
	reveal(commentUniqueId?: number, focus?: CommentWidgetFocus): void;
	expand(setActive?: boolean): void;
	collapse(confirm?: boolean): Promise<boolean>;
	collapseAndFocusRange(): Promise<void>;
	getGlyphPosition(): number;
	getPendingComments(): { newComment: languages.PendingComment | undefined; edits: { [key: number]: languages.PendingComment } };
	setPendingComment(pending: languages.PendingComment): void;
	submitComment(): Promise<void>;
}

export function getCommentThreadWidgetStateColor(state: languages.CommentThreadState | undefined, theme: IColorTheme): Color | undefined {
	return getCommentThreadStateBorderColor(state, theme) ?? theme.getColor(peekViewBorder);
}

/**
 * Check if a comment thread has any draft comments
 */
export function commentThreadHasDraft(commentThread: languages.CommentThread): boolean {
	const comments = commentThread.comments;
	if (!comments) {
		return false;
	}
	return comments.some(comment => comment.state === languages.CommentState.Draft);
}

/**
 * Creates the gutter glyph for a comment thread. The glyph tracks edits to the document, and the
 * thread's range is shifted to follow it.
 */
export function createCommentThreadGlyph(editor: ICodeEditor, range: IRange, getCommentThread: () => languages.CommentThread<IRange>, store: DisposableStore): CommentGlyphWidget {
	const glyph = new CommentGlyphWidget(editor, range.endLineNumber);
	const commentThread = getCommentThread();
	glyph.setThreadState(commentThread.state, commentThreadHasDraft(commentThread));
	store.add(glyph.onDidChangeLineNumber(lineNumber => {
		const thread = getCommentThread();
		if (!thread.range) {
			return;
		}
		const shift = lineNumber - thread.range.endLineNumber;
		thread.range = new Range(thread.range.startLineNumber + shift, thread.range.startColumn, thread.range.endLineNumber + shift, thread.range.endColumn);
	}));
	return glyph;
}

/**
 * Before a new comment is submitted, update the range of the thread template in case the
 * thread moved as a result of editor changes.
 */
export async function updateCommentThreadTemplateRange(commentService: ICommentService, uniqueOwner: string, commentThread: languages.CommentThread<IRange>, newPosition: IPosition | undefined): Promise<void> {
	if ((commentThread.comments && commentThread.comments.length) || !newPosition) {
		return;
	}

	const originalRange = commentThread.range;
	if (!originalRange) {
		return;
	}

	let range: Range;
	if (newPosition.lineNumber !== originalRange.endLineNumber) {
		// The widget could have moved as a result of editor changes.
		// We need to try to calculate the new, more correct, range for the comment.
		const distance = newPosition.lineNumber - originalRange.endLineNumber;
		range = new Range(originalRange.startLineNumber + distance, originalRange.startColumn, originalRange.endLineNumber + distance, originalRange.endColumn);
	} else {
		range = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.endColumn);
	}
	await commentService.updateCommentThreadTemplate(uniqueOwner, commentThread.commentThreadHandle, range);
}

/**
 * Asks the user to confirm collapsing a comment thread that has unsubmitted comments, as
 * configured by `comments.thread.confirmOnCollapse`.
 */
export async function confirmCommentThreadCollapse(hasUnsubmittedComments: boolean, configurationService: IConfigurationService, dialogService: IDialogService): Promise<boolean> {
	const confirmSetting = configurationService.getValue<'whenHasUnsubmittedComments' | 'never'>('comments.thread.confirmOnCollapse');

	if (confirmSetting === 'whenHasUnsubmittedComments' && hasUnsubmittedComments) {
		const result = await dialogService.confirm({
			message: nls.localize('confirmCollapse', "Collapsing this comment thread will discard unsubmitted comments. Are you sure you want to discard these comments?"),
			primaryButton: nls.localize('discard', "Discard"),
			type: Severity.Warning,
			checkbox: { label: nls.localize('neverAskAgain', "Never ask me again"), checked: false }
		});
		if (result.checkboxChecked) {
			await configurationService.updateValue('comments.thread.confirmOnCollapse', 'never');
		}
		return result.confirmed;
	}
	return true;
}
