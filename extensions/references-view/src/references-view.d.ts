/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * This interface describes the shape for the references viewlet API. It includes
 * a single `setInput` function which must be called with a full implementation
 * of the `SymbolTreeInput`-interface. You can also use `getInput` function to
 * get the current `SymbolTreeInput`. To acquire this API use the default mechanics, e.g:
 *
 * ```ts
 * // get references viewlet API
 * const api = await vscode.extensions.getExtension<SymbolTree>('vscode.references-view').activate();
 *
 * // instantiate and set input which updates the view
 * const myInput: SymbolTreeInput<MyItems> = ...
 * api.setInput(myInput);
 * const currentInput = api.getInput();
 * ```
 */
export interface SymbolTree {

	/**
	 * Set the contents of the references viewlet.
	 *
	 * @param input A symbol tree input object
	 */
	setInput(input: SymbolTreeInput<unknown>): void;

	/**
	 * Get the contents of the references viewlet.
	 *
	 * @returns The current symbol tree input object
	 */
	getInput(): SymbolTreeInput<unknown> | undefined;
}

/**
 * A symbol tree input is the entry point for populating the references viewlet.
 * Inputs must be anchored at a code location, they must have a title, and they
 * must resolve to a model.
 */
export interface SymbolTreeInput<T> {

	/**
	 * The value of the `reference-list.source` context key. Use this to control
	 * input dependent commands.
	 */
	readonly contextValue: string;

	/**
	 * The (short) title of this input, like "Implementations" or "Callers Of"
	 */
	readonly title: string;

	/**
	 * The location at which this position is anchored. Locations are validated and inputs
	 * with "funny" locations might be ignored
	 */
	readonly location: vscode.Location;

	/**
	 * Resolve this input to a model that contains the actual data. When there are no result
	 * than `undefined` or `null` should be returned.
	 */
	resolve(): vscode.ProviderResult<SymbolTreeModel<T>>;

	/**
	 * This function is called when re-running from history. The symbols tree has tracked
	 * the original location of this input and that is now passed to this input. The
	 * implementation of this function should return a clone where the `location`-property
	 * uses the provided `location`
	 *
	 * @param location The location at which the new input should be anchored.
	 * @returns A new input which location is anchored at the position.
	 */
	with(location: vscode.Location): SymbolTreeInput<T>;
}

/**
 * A symbol tree model which is used to populate the symbols tree.
 */
export interface SymbolTreeModel<T> {

	/**
	 * A tree data provider which is used to populate the symbols tree.
	 */
	provider: vscode.TreeDataProvider<T>;

	/**
	 * An optional message that is displayed above the tree. Whenever the provider
	 * fires a change event this message is read again.
	 */
	message: string | undefined;

	/**
	 * Optional support for symbol navigation. When implemented, navigation commands like
	 * "Go to Next" and "Go to Previous" will be working with this model.
	 */
	navigation?: SymbolItemNavigation<T>;

	/**
	 * Optional support for editor highlights. WHen implemented, the editor will highlight
	 * symbol ranges in the source code.
	 */
	highlights?: SymbolItemEditorHighlights<T>;

	/**
	 * Optional support for drag and drop.
	 */
	dnd?: SymbolItemDragAndDrop<T>;

	/**
	 * Optional dispose function which is invoked when this model is
	 * needed anymore
	 */
	dispose?(): void;
}

/**
 * Interface to support the built-in symbol navigation.
 */
export interface SymbolItemNavigation<T> {
	/**
	 * Return the item that is the nearest to the given location or `undefined`
	 */
	nearest(uri: vscode.Uri, position: vscode.Position): T | undefined;
	/**
	 * Return the next item from the given item or the item itself.
	 */
	next(from: T): T;
	/**
	 * Return the previous item from the given item or the item itself.
	 */
	previous(from: T): T;
	/**
	 * Return the location of the given item.
	 */
	location(item: T): vscode.Location | undefined;
}

/**
 * Interface to support the built-in editor highlights.
 */
export interface SymbolItemEditorHighlights<T> {
	/**
	 * Given an item and an uri return an array of ranges to highlight.
	 */
	getEditorHighlights(item: T, uri: vscode.Uri): vscode.Range[] | undefined;
}

export interface SymbolItemDragAndDrop<T> {

	getDragUri(item: T): vscode.Uri | undefined;
}
