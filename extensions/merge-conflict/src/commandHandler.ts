/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as interfaces from './interfaces';
import ContentProvider from './contentProvider';
import * as path from 'path';

// TODO: Localization
const messages = {
	cursorNotInConflict: 'Editor cursor is not within a merge conflict',
	cursorOnSplitterRange: 'Editor cursor is within the merge conflict splitter, please move it to either the "current" or "incoming" block',
	noConflicts: 'No merge conflicts found in this file',
	noOtherConflictsInThisFile: 'No other merge conflicts within this file'
};

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

	constructor(private context: vscode.ExtensionContext, private tracker: interfaces.IDocumentMergeConflictTracker) {
	}

	begin() {
		this.disposables.push(
			vscode.commands.registerTextEditorCommand('git.merge.accept.current', this.acceptCurrent, this),
			vscode.commands.registerTextEditorCommand('git.merge.accept.incoming', this.acceptIncoming, this),
			vscode.commands.registerTextEditorCommand('git.merge.accept.selection', this.acceptSelection, this),
			vscode.commands.registerTextEditorCommand('git.merge.accept.both', this.acceptBoth, this),
			vscode.commands.registerTextEditorCommand('git.merge.accept.all-current', this.acceptAllCurrent, this),
			vscode.commands.registerTextEditorCommand('git.merge.accept.all-incoming', this.acceptAllIncoming, this),
			vscode.commands.registerTextEditorCommand('git.merge.accept.all-both', this.acceptAllBoth, this),
			vscode.commands.registerTextEditorCommand('git.merge.next', this.navigateNext, this),
			vscode.commands.registerTextEditorCommand('git.merge.previous', this.navigatePrevious, this),
			vscode.commands.registerTextEditorCommand('git.merge.compare', this.compare, this)
		);
	}

	acceptCurrent(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.accept(interfaces.CommitType.Current, editor, ...args);
	}

	acceptIncoming(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.accept(interfaces.CommitType.Incoming, editor, ...args);
	}

	acceptBoth(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.accept(interfaces.CommitType.Both, editor, ...args);
	}

	acceptAllCurrent(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.acceptAll(interfaces.CommitType.Current, editor);
	}

	acceptAllIncoming(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.acceptAll(interfaces.CommitType.Incoming, editor);
	}

	acceptAllBoth(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.acceptAll(interfaces.CommitType.Both, editor);
	}

	async compare(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, conflict: interfaces.IDocumentMergeConflict | null, ...args) {
		const fileName = path.basename(editor.document.uri.fsPath);

		// No conflict, command executed from command palette
		if (!conflict) {
			conflict = await this.findConflictContainingSelection(editor);

			// Still failed to find conflict, warn the user and exit
			if (!conflict) {
				vscode.window.showWarningMessage(messages.cursorNotInConflict);
				return;
			}
		}

		let range = conflict.current.content;
		const leftUri = editor.document.uri.with({
			scheme: ContentProvider.scheme,
			query: JSON.stringify(range)
		});

		const leftTitle = `Current changes`; // (Ln ${range.start.line}${!range.isSingleLine ? `-${range.end.line}` : ''})`;

		range = conflict.incoming.content;
		const rightUri = leftUri.with({ query: JSON.stringify(range) });

		const rightTitle = `Incoming changes`; // (Ln${range.start.line}${!range.isSingleLine ? `-${range.end.line}` : ''})`;

		const title = `${fileName}: ${leftTitle} \u2194 ${rightTitle}`;
		vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
	}

	navigateNext(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.navigate(editor, NavigationDirection.Forwards);
	}

	navigatePrevious(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		return this.navigate(editor, NavigationDirection.Backwards);
	}

	async acceptSelection(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args): Promise<void> {
		let conflict = await this.findConflictContainingSelection(editor);

		if (!conflict) {
			vscode.window.showWarningMessage(messages.cursorNotInConflict);
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
			vscode.window.showWarningMessage(messages.cursorOnSplitterRange);
			return;
		}

		this.tracker.forget(editor.document);
		conflict.commitEdit(typeToAccept, editor);
	}

	dispose() {
		this.disposables.forEach(disposable => disposable.dispose());
		this.disposables = [];
	}

	private async navigate(editor: vscode.TextEditor, direction: NavigationDirection): Promise<void> {
		let navigationResult = await this.findConflictForNavigation(editor, direction);

		if (!navigationResult) {
			vscode.window.showWarningMessage(messages.noConflicts);
			return;
		}
		else if (!navigationResult.canNavigate) {
			vscode.window.showWarningMessage(messages.noOtherConflictsInThisFile);
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

	private async accept(type: interfaces.CommitType, editor: vscode.TextEditor, ...args): Promise<void> {

		let conflict: interfaces.IDocumentMergeConflict | null;

		// If launched with known context, take the conflict from that
		if (args[0] === 'known-conflict') {
			conflict = args[1];
		}
		else {
			// Attempt to find a conflict that matches the current curosr position
			conflict = await this.findConflictContainingSelection(editor);
		}

		if (!conflict) {
			vscode.window.showWarningMessage(messages.cursorNotInConflict);
			return;
		}

		// Tracker can forget as we know we are going to do an edit
		this.tracker.forget(editor.document);
		conflict.commitEdit(type, editor);
	}

	private async acceptAll(type: interfaces.CommitType, editor: vscode.TextEditor): Promise<void> {
		let conflicts = await this.tracker.getConflicts(editor.document);

		if (!conflicts || conflicts.length === 0) {
			vscode.window.showWarningMessage(messages.noConflicts);
			return;
		}

		// For get the current state of the document, as we know we are doing to do a large edit
		this.tracker.forget(editor.document);

		// Apply all changes as one edit
		await editor.edit((edit) => conflicts.forEach(conflict => {
			conflict.applyEdit(type, editor, edit);
		}));
	}

	private async findConflictContainingSelection(editor: vscode.TextEditor, conflicts?: interfaces.IDocumentMergeConflict[]): Promise<interfaces.IDocumentMergeConflict | null> {

		if (!conflicts) {
			conflicts = await this.tracker.getConflicts(editor.document);
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