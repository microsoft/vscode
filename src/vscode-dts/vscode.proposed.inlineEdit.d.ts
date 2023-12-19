/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export class InlineEdit {
		/**
		 * The position of the edit.
		 */
		position: Position;

		/**
		 * The new text for this edit.
		 */
		text: string;

		/**
		 * An optional range that will be replaced by the text of the inline edit.
		 */
		replaceRange?: Range;

		/**
		 * An optional command that will be executed after applying the inline edit.
		 */
		accepted?: Command;

		/**
		 * An optional command that will be executed after rejecting the inline edit.
		 */
		rejected?: Command;

		/**
		 * Creates a new inline edit.
		 *
		 * @param position The position of the edit.
		 * @param text The new text for this edit.
		 * @param replaceRange An optional range that will be replaced by the text of the inline edit.
		 */
		constructor(position: Position, text: string, replaceRange?: Range);
	}

	export interface InlineEditContext {
		/**
		 * Describes how the inline edit was triggered.
		 */
		triggerKind: InlineEditTriggerKind;
	}

	export enum InlineEditTriggerKind {
		/**
		 * Completion was triggered explicitly by a user gesture.
		 * Return multiple completion items to enable cycling through them.
		 */
		Invoke = 0,

		/**
		 * Completion was triggered automatically while editing.
		 * It is sufficient to return a single completion item in this case.
		 */
		Automatic = 1,
	}

	export interface TextEditor {

		/**
		 * Add an inline edit to the text editor.
		 * If the edit already exists, it will be replaced with the new one.
		 *
		 * @param edit The {@link InlineEdit} to add.
		 */
		setInlineEdit(edit: InlineEdit, context: InlineEditContext): void;
	}
}
