/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as interfaces from './interfaces';
import ContentProvider from './contentProvider';
import * as path from 'path';
import { loadMessageBundle } from 'vscode-nls';
const localize = loadMessageBundle();

interface IDocumentMergeConflictNavigationResults {
	canNavigate: boolean;
	conflict?: interfaces.IDocumentMergeConflict;
}

enum NavigationDirection {
	Forwards,
	Backwards
}

export default class CommandHandler implements vscode.Disposable {

	private disposables: vscode.Disposable[] = [];
	private tracker: interfaces.IDocumentMergeConflictTracker;

	constructor(private context: vscode.ExtensionContext, trackerService: interfaces.IDocumentMergeConflictTrackerService) {
		this.tracker = trackerService.createTracker('commands');
	}

	begin() {
		this.disposables.push(
			vscode.commands.registerTextEditorCommand('merge-conflict.accept.current', this.acceptCurrent, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.accept.incoming', this.acceptIncoming, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.accept.selection', this.acceptSelection, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.accept.both', this.acceptBoth, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.accept.all-current', this.acceptAllCurrent, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.accept.all-incoming', this.acceptAllIncoming, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.accept.all-both', this.acceptAllBoth, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.next', this.navigateNext, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.previous', this.navigatePrevious, this),
			vscode.commands.registerTextEditorCommand('merge-conflict.compare', this.compare, this)
		);
	}

	acceptCurrent(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args) {
		return this.accept(interfaces.CommitType.Current, editor, edit, ...args);
	}

	acceptIncoming(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args) {
		return this.accept(interfaces.CommitType.Incoming, editor, edit, ...args);
	}

	acceptBoth(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args) {
		return this.accept(interfaces.CommitType.Both, editor, edit, ...args);
	}

	acceptAllCurrent(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args) {
		return this.acceptAll(interfaces.CommitType.Current, editor, edit);
	}

	acceptAllIncoming(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args) {
		return this.acceptAll(interfaces.CommitType.Incoming, editor, edit);
	}

	acceptAllBoth(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args) {
		return this.acceptAll(interfaces.CommitType.Both, editor, edit);
	}

	compare(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, conflict: interfaces.IDocumentMergeConflict | null, ...args) {
		const fileName = path.basename(editor.document.uri.fsPath);

		// No conflict, command executed from command palette
		if (!conflict) {
			conflict = this.findConflictContainingSelection(editor);

			// Still failed to find conflict, warn the user and exit
			if (!conflict) {
				vscode.window.showWarningMessage(localize('cursorNotInConflict', 'Editor cursor is not within a merge conflict'));
				return;
			}
		}

		let range = conflict.current.content;
		const leftUri = editor.document.uri.with({
			scheme: ContentProvider.scheme,
			query: JSON.stringify(range)
		});

		range = conflict.incoming.content;
		const rightUri = leftUri.with({ query: JSON.stringify(range) });

		const title = localize('compareChangesTitle', '{0}: Current Changes ⟷ Incoming Changes', fileName);

		// Temporary fix for edits attempting to be applied to a disposed TextEditor.
		// If the diff window opens over the top of this window, at some later point
		// vscode core will attempt to apply edits to a non-visble, disposed editor,
		// even though we don't actually use the edit builder.
		// We need to return from this method, and execute the diff command lazily.
		setTimeout(() => vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title), 200);
	}

	navigateNext(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.navigate(editor, NavigationDirection.Forwards);
	}

	navigatePrevious(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.navigate(editor, NavigationDirection.Backwards);
	}

	acceptSelection(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args) {
		let conflict = this.findConflictContainingSelection(editor);

		if (!conflict) {
			vscode.window.showWarningMessage(localize('cursorNotInConflict', 'Editor cursor is not within a merge conflict'));
			return;
		}

		let typeToAccept: interfaces.CommitType;

		// Figure out if the cursor is in current or incoming, we do this by seeing if
		// the active position is before or after the range of the splitter. We can
		// use this trick as the previous check in findConflictByActiveSelection will
		// ensure it's within the conflict range, so we don't falsely identify "current"
		// or "incoming" if outside of a conflict range.
		if (editor.selection.active.isBefore(conflict.splitter.start)) {
			typeToAccept = interfaces.CommitType.Current;
		}
		else if (editor.selection.active.isAfter(conflict.splitter.end)) {
			typeToAccept = interfaces.CommitType.Incoming;
		}
		else {
			vscode.window.showWarningMessage(localize('cursorOnSplitterRange', 'Editor cursor is within the merge conflict splitter, please move it to either the "current" or "incoming" block'));
			return;
		}

		this.tracker.forget(editor.document);
		conflict.commitEdit(typeToAccept, editor, edit);
	}

	dispose() {
		this.disposables.forEach(disposable => disposable.dispose());
		this.disposables = [];
	}

	private async navigate(editor: vscode.TextEditor, direction: NavigationDirection): Promise<void> {
		let navigationResult = await this.findConflictForNavigation(editor, direction);

		if (!navigationResult) {
			vscode.window.showWarningMessage(localize('noConflicts', 'No merge conflicts found in this file'));
			return;
		}
		else if (!navigationResult.canNavigate) {
			vscode.window.showWarningMessage(localize('noOtherConflictsInThisFile', 'No other merge conflicts within this file'));
			return;
		}
		else if (!navigationResult.conflict) {
			// TODO: Show error message?
			return;
		}

		// Move the selection to the first line of the conflict
		editor.selection = new vscode.Selection(navigationResult.conflict.range.start, navigationResult.conflict.range.start);
		editor.revealRange(navigationResult.conflict.range, vscode.TextEditorRevealType.Default);
	}

	private accept(type: interfaces.CommitType, editor: vscode.TextEditor, edit: vscode.TextEditorEdit | undefined, ...args) {

		let conflict: interfaces.IDocumentMergeConflict | null;

		// If launched with known context, take the conflict from that
		if (args[0] === 'known-conflict') {
			conflict = args[1];
		}
		else {
			// Attempt to find a conflict that matches the current curosr position
			conflict = this.findConflictContainingSelection(editor);
		}

		if (!conflict) {
			vscode.window.showWarningMessage(localize('cursorNotInConflict', 'Editor cursor is not within a merge conflict'));
			return;
		}

		// Tracker can forget as we know we are going to do an edit
		this.tracker.forget(editor.document);
		conflict.commitEdit(type, editor, edit);
	}

	private acceptAll(type: interfaces.CommitType, editor: vscode.TextEditor, edit: vscode.TextEditorEdit | undefined) {
		let conflicts = this.tracker.getConflictsSync(editor.document);

		if (!conflicts || conflicts.length === 0) {
			vscode.window.showWarningMessage(localize('noConflicts', 'No merge conflicts found in this file'));
			return;
		}

		// For get the current state of the document, as we know we are doing to do a large edit
		this.tracker.forget(editor.document);

		// Generate a "callback" that applies the specified action to all conflicts with the document
		const allConflictsEdit = (edit) => conflicts.forEach(conflict => {
			conflict.applyEdit(type, editor, edit);
		});

		// We got an edit from the command system, use that.
		if (edit) {
			allConflictsEdit(edit);
			return;
		}

		// No edit supplied, generate one
		editor.edit(allConflictsEdit);
	}

	private findConflictContainingSelection(editor: vscode.TextEditor, conflicts?: interfaces.IDocumentMergeConflict[]): interfaces.IDocumentMergeConflict | null {

		if (!conflicts) {
			conflicts = this.tracker.getConflictsSync(editor.document);
		}

		if (!conflicts || conflicts.length === 0) {
			return null;
		}

		for (let i = 0; i < conflicts.length; i++) {
			if (conflicts[i].range.contains(editor.selection.active)) {
				return conflicts[i];
			}
		}

		return null;
	}

	private async findConflictForNavigation(editor: vscode.TextEditor, direction: NavigationDirection, conflicts?: interfaces.IDocumentMergeConflict[]): Promise<IDocumentMergeConflictNavigationResults | null> {
		if (!conflicts) {
			conflicts = await this.tracker.getConflicts(editor.document);
		}

		if (!conflicts || conflicts.length === 0) {
			return null;
		}

		let selection = editor.selection.active;
		if (conflicts.length === 1) {
			if (conflicts[0].range.contains(selection)) {
				return {
					canNavigate: false
				};
			}

			return {
				canNavigate: true,
				conflict: conflicts[0]
			};
		}

		let predicate: (conflict) => boolean;
		let fallback: () => interfaces.IDocumentMergeConflict;

		if (direction === NavigationDirection.Forwards) {
			predicate = (conflict) => selection.isBefore(conflict.range.start);
			fallback = () => conflicts![0];
		} else if (direction === NavigationDirection.Backwards) {
			predicate = (conflict) => selection.isAfter(conflict.range.start);
			fallback = () => conflicts![conflicts!.length - 1];
		} else {
			throw new Error(`Unsupported direction ${direction}`);
		}

		for (let i = 0; i < conflicts.length; i++) {
			if (predicate(conflicts[i]) && !conflicts[i].range.contains(selection)) {
				return {
					canNavigate: true,
					conflict: conflicts[i]
				};
			}
		}

		// Went all the way to the end, return the head
		return {
			canNavigate: true,
			conflict: fallback()
		};
	}
}