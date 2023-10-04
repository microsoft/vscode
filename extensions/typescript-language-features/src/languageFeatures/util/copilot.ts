/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from '../../commands/commandManager';
import { nulToken } from '../../utils/cancellation';
import type * as Proto from '../../tsServer/protocol/protocol';
import * as typeConverters from '../../typeConverters';
import { ITypeScriptServiceClient } from '../../typescriptService';

export class EditorChatFollowUp implements Command {
	public static readonly ID = '_typescript.quickFix.editorChatReplacement2';
	public readonly id = EditorChatFollowUp.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
	) { }

	async execute({ message, document, expand }: EditorChatFollowUp_Args) {
		const initialRange =
			expand.kind === 'navtree-function'
				? await findScopeEndLineFromNavTree(
					this.client,
					document,
					expand.pos.line
				)
				: expand.kind === 'refactor-info'
					? await findEditScope(
						this.client,
						document,
						expand.refactor.edits.flatMap((e) => e.textChanges)
					)
					: expand.kind === 'code-action'
						? await findEditScope(
							this.client,
							document,
							expand.action.changes.flatMap((c) => c.textChanges)
						)
						: expand.range;
		await vscode.commands.executeCommand('vscode.editorChat.start', {
			initialRange,
			message,
			autoSend: true,
		});
	}
}
export interface EditorChatFollowUp_Args {
	readonly message: string;
	readonly document: vscode.TextDocument;
	readonly expand: Expand;
}

export class CompositeCommand implements Command {
	public static readonly ID = '_typescript.compositeCommand';
	public readonly id = CompositeCommand.ID;

	public async execute(...commands: vscode.Command[]): Promise<void> {
		for (const command of commands) {
			await vscode.commands.executeCommand(
				command.command,
				...(command.arguments ?? [])
			);
		}
	}
}

export type Expand =
	| { kind: 'none'; readonly range: vscode.Range }
	| { kind: 'navtree-function'; readonly pos: vscode.Position }
	| { kind: 'refactor-info'; readonly refactor: Proto.RefactorEditInfo }
	| { kind: 'code-action'; readonly action: Proto.CodeAction };

function findScopeEndLineFromNavTreeWorker(
	startLine: number,
	navigationTree: Proto.NavigationTree[]
): vscode.Range | undefined {
	for (const node of navigationTree) {
		const range = typeConverters.Range.fromTextSpan(node.spans[0]);
		if (startLine === range.start.line) {
			return range;
		} else if (
			startLine > range.start.line &&
			startLine <= range.end.line &&
			node.childItems
		) {
			return findScopeEndLineFromNavTreeWorker(startLine, node.childItems);
		}
	}
	return undefined;
}

async function findScopeEndLineFromNavTree(
	client: ITypeScriptServiceClient,
	document: vscode.TextDocument,
	startLine: number
) {
	const filepath = client.toOpenTsFilePath(document);
	if (!filepath) {
		return;
	}
	const response = await client.execute(
		'navtree',
		{ file: filepath },
		nulToken
	);
	if (response.type !== 'response' || !response.body?.childItems) {
		return;
	}
	return findScopeEndLineFromNavTreeWorker(startLine, response.body.childItems);
}

async function findEditScope(
	client: ITypeScriptServiceClient,
	document: vscode.TextDocument,
	edits: Proto.CodeEdit[]
): Promise<vscode.Range> {
	let first = typeConverters.Position.fromLocation(edits[0].start);
	let firstEdit = edits[0];
	let lastEdit = edits[0];
	let last = typeConverters.Position.fromLocation(edits[0].start);
	for (const edit of edits) {
		const start = typeConverters.Position.fromLocation(edit.start);
		const end = typeConverters.Position.fromLocation(edit.end);
		if (start.compareTo(first) < 0) {
			first = start;
			firstEdit = edit;
		}
		if (end.compareTo(last) > 0) {
			last = end;
			lastEdit = edit;
		}
	}
	const text = document.getText();
	const startIndex = text.indexOf(firstEdit.newText);
	const start = startIndex > -1 ? document.positionAt(startIndex) : first;
	const endIndex = text.lastIndexOf(lastEdit.newText);
	const end =
		endIndex > -1
			? document.positionAt(endIndex + lastEdit.newText.length)
			: last;
	const expandEnd = await findScopeEndLineFromNavTree(
		client,
		document,
		end.line
	);
	return new vscode.Range(start, expandEnd?.end ?? end);
}
