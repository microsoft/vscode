/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { JavaScriptMethodExtractEngine } from '../refactor/javascriptMethodExtractEngine';
import { DropPosition, MoveSymbolRequest } from '../refactor/types';

interface SerializedRange {
	start: {
		line: number;
		character: number;
	};
	end: {
		line: number;
		character: number;
	};
}

interface SerializedOutlineMoveSymbol {
	name: string;
	kind: number;
	range: SerializedRange;
}

interface MoveSymbolCommandArgs {
	uri: vscode.Uri;
	source: SerializedOutlineMoveSymbol;
	target: SerializedOutlineMoveSymbol;
	sourceParent?: SerializedOutlineMoveSymbol;
	targetParent?: SerializedOutlineMoveSymbol;
	position: DropPosition;
}

function reviveRange(range: SerializedRange): vscode.Range {
	return new vscode.Range(
		new vscode.Position(range.start.line, range.start.character),
		new vscode.Position(range.end.line, range.end.character)
	);
}

function reviveSymbol(symbol: SerializedOutlineMoveSymbol | undefined) {
	if (!symbol) {
		return undefined;
	}

	return {
		name: symbol.name,
		kind: symbol.kind,
		range: reviveRange(symbol.range)
	};
}

export function registerMoveSymbolCommand(
	context: vscode.ExtensionContext
): void {
	const disposable = vscode.commands.registerCommand(
		'outline.moveSymbol',
		async (args: MoveSymbolCommandArgs) => {
			const document = await vscode.workspace.openTextDocument(args.uri);

			const request: MoveSymbolRequest = {
				document,
				source: reviveSymbol(args.source)!,
				target: reviveSymbol(args.target)!,
				sourceParent: reviveSymbol(args.sourceParent),
				targetParent: reviveSymbol(args.targetParent),
				dropPosition: args.position
			};

			const engine = new JavaScriptMethodExtractEngine();
			const validation = engine.canMove(request);

			if (!validation.allowed) {
				if (validation.reason) {
					vscode.window.showWarningMessage(validation.reason);
				}
				return;
			}

			const edit = engine.buildEdit(request);

			if (!edit) {
				vscode.window.showErrorMessage(
					'Could not build the symbol move edit.'
				);
				return;
			}

			const applied = await vscode.workspace.applyEdit(edit);

			if (!applied) {
				vscode.window.showErrorMessage(
					'Failed to apply the symbol move.'
				);
			}
		}
	);

	context.subscriptions.push(disposable);
}
