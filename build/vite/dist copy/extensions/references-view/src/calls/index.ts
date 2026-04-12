/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SymbolsTree } from '../tree';
import { ContextKey } from '../utils';
import { CallItem, CallsDirection, CallsTreeInput } from './model';

export function register(tree: SymbolsTree, context: vscode.ExtensionContext): void {

	const direction = new RichCallsDirection(context.workspaceState, CallsDirection.Incoming);

	function showCallHierarchy() {
		if (vscode.window.activeTextEditor) {
			const input = new CallsTreeInput(new vscode.Location(vscode.window.activeTextEditor.document.uri, vscode.window.activeTextEditor.selection.active), direction.value);
			tree.setInput(input);
		}
	}

	function setCallsDirection(value: CallsDirection, anchor: CallItem | unknown) {
		direction.value = value;

		let newInput: CallsTreeInput | undefined;
		const oldInput = tree.getInput();
		if (anchor instanceof CallItem) {
			newInput = new CallsTreeInput(new vscode.Location(anchor.item.uri, anchor.item.selectionRange.start), direction.value);
		} else if (oldInput instanceof CallsTreeInput) {
			newInput = new CallsTreeInput(oldInput.location, direction.value);
		}
		if (newInput) {
			tree.setInput(newInput);
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('references-view.showCallHierarchy', showCallHierarchy),
		vscode.commands.registerCommand('references-view.showOutgoingCalls', (item: CallItem | unknown) => setCallsDirection(CallsDirection.Outgoing, item)),
		vscode.commands.registerCommand('references-view.showIncomingCalls', (item: CallItem | unknown) => setCallsDirection(CallsDirection.Incoming, item)),
		vscode.commands.registerCommand('references-view.removeCallItem', removeCallItem)
	);
}

function removeCallItem(item: CallItem | unknown): void {
	if (item instanceof CallItem) {
		item.remove();
	}
}

class RichCallsDirection {

	private static _key = 'references-view.callHierarchyMode';

	private _ctxMode = new ContextKey<'showIncoming' | 'showOutgoing'>('references-view.callHierarchyMode');

	constructor(
		private _mem: vscode.Memento,
		private _value: CallsDirection = CallsDirection.Outgoing,
	) {
		const raw = _mem.get<number>(RichCallsDirection._key);
		if (typeof raw === 'number' && raw >= 0 && raw <= 1) {
			this.value = raw;
		} else {
			this.value = _value;
		}
	}

	get value() {
		return this._value;
	}

	set value(value: CallsDirection) {
		this._value = value;
		this._ctxMode.set(this._value === CallsDirection.Incoming ? 'showIncoming' : 'showOutgoing');
		this._mem.update(RichCallsDirection._key, value);
	}
}
