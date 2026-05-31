/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as calls from './calls';
import * as references from './references';
import { SymbolTree, SymbolTreeInput } from './references-view';
import { SymbolsTree } from './tree';
import * as types from './types';

export function activate(context: vscode.ExtensionContext): SymbolTree {

	const tree = new SymbolsTree();

	references.register(tree, context);
	calls.register(tree, context);
	types.register(tree, context);

	function setInput(input: SymbolTreeInput<unknown>) {
		tree.setInput(input);
	}

	function getInput(): SymbolTreeInput<unknown> | undefined {
		return tree.getInput();
	}

	return { setInput, getInput };
}
