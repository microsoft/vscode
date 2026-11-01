/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export type DropPosition = 'before' | 'after';

export interface OutlineMoveSymbol {
	name: string;
	kind: number;
	range: vscode.Range;
}

export interface MoveValidationResult {
	allowed: boolean;
	reason?: string;
}

export interface MoveSymbolRequest {
	document: vscode.TextDocument;
	source: OutlineMoveSymbol;
	target: OutlineMoveSymbol;
	sourceParent?: OutlineMoveSymbol;
	targetParent?: OutlineMoveSymbol;
	dropPosition: DropPosition;
}

export interface SymbolMoveEngine {
	canMove(request: MoveSymbolRequest): MoveValidationResult;
	buildEdit(request: MoveSymbolRequest): vscode.WorkspaceEdit | undefined;
}
