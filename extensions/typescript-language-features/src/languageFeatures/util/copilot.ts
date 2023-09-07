import * as vscode from 'vscode';
import { Command } from '../../commands/commandManager';
import { nulToken } from '../../utils/cancellation';
import type * as Proto from '../../tsServer/protocol/protocol';
import * as typeConverters from '../../typeConverters';
import { ITypeScriptServiceClient } from '../../typescriptService';

export class EditorChatReplacementCommand2 implements Command {
	public static readonly ID = '_typescript.quickFix.editorChatReplacement2';
	public readonly id = EditorChatReplacementCommand2.ID;
	constructor(
		private readonly client: ITypeScriptServiceClient,
	) {
	}
	async execute({ message, document, expand }: EditorChatReplacementCommand2.Args) {
		// TODO: "this code" is not specific; might get better results with a more specific referent
		// TODO: Doesn't work in JS files? Is this the span-finder's fault? Try falling back to startLine plus something.
		// TODO: Need to emit jsdoc in JS files once it's working at all
		// TODO: When there are "enough" types around, leave off the "Add separate interfaces when possible" because it's not helpful.
		//       (brainstorming: enough non-primitives, or evidence of type aliases in the same file, or imported)
		const initialRange = expand.kind === 'navtree-function' ? await findScopeEndLineFromNavTree(this.client, document, expand.pos.line)
		    : expand.kind === 'identifier' ? findScopeEndMarker(document, expand.range.start, expand.marker)
			: expand.kind === 'refactor-info' ? await findEditScope(this.client, document, expand.refactor.edits.flatMap(e => e.textChanges))
			: expand.kind === 'code-action' ? await findEditScope(this.client, document, expand.action.changes.flatMap(c => c.textChanges))
			: expand.range;
		if (initialRange) {
			console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n" + message
				+ `\nWith context(${expand}): ` + document.getText().slice(document.offsetAt(initialRange.start), document.offsetAt(initialRange.end))
				+ "\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~")
		}
		await vscode.commands.executeCommand('vscode.editorChat.start', { initialRange, message, autoSend: true });
	}
}
export namespace EditorChatReplacementCommand2 {
	export interface Args {
		readonly message: string;
		readonly document: vscode.TextDocument;
		readonly expand: Expand;
	}
}

export namespace ChatPanelFollowup {
	export interface Args {
		readonly prompt: string;
		readonly document: vscode.TextDocument;
		readonly range: vscode.Range;
		readonly expand: Expand;
		readonly marker?: string;
		readonly refactor?: Proto.RefactorEditInfo;
	}
	// assuming there is an ast to walk, I'm convinced I can do a more consistent job than the navtree code.
}
export class ChatPanelFollowup implements Command {
	public readonly id = ChatPanelFollowup.ID;
	public static readonly ID: string = '_typescript.refactor.chatPanelFollowUp';

	constructor(private readonly client: ITypeScriptServiceClient) {
	}

	async execute({ prompt, document, range, expand, marker }: ChatPanelFollowup.Args) {
		console.log("-------------------------------" + prompt + "------------------------------")
		const enclosingRange = expand.kind === 'navtree-function' ? await findScopeEndLineFromNavTree(this.client, document, range.start.line)
		    : expand.kind === 'identifier' ? findScopeEndMarker(document, range.start, marker!)
			: range;
		vscode.interactive.sendInteractiveRequestToProvider('copilot', { message: prompt, autoSend: true, initialRange: enclosingRange } as any)
	}
}

export class CompositeCommand implements Command {
	public static readonly ID = '_typescript.compositeCommand';
	public readonly id = CompositeCommand.ID;

	public async execute(...commands: vscode.Command[]): Promise<void> {
		for (const command of commands) {
			await vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
		}
	}
}

export type Expand = { kind: 'none', readonly range: vscode.Range }
	| { kind: "navtree-function", readonly pos: vscode.Position }
	| { kind: 'refactor-info', readonly refactor: Proto.RefactorEditInfo }
	| { kind: 'code-action', readonly action: Proto.CodeAction }
	| { kind: "identifier", readonly range: vscode.Range, readonly marker: string };

function findScopeEndLineFromNavTreeWorker(startLine: number, navigationTree: Proto.NavigationTree[]): vscode.Range | undefined {
	for (const node of navigationTree) {
		const range = typeConverters.Range.fromTextSpan(node.spans[0]);
		if (startLine === range.start.line) {
			return range;
		} else if (startLine > range.start.line && startLine <= range.end.line && node.childItems) {
			return findScopeEndLineFromNavTreeWorker(startLine, node.childItems);
		}
	}
	return undefined;
}

async function findScopeEndLineFromNavTree(client: ITypeScriptServiceClient, document: vscode.TextDocument, startLine: number) {
		const filepath = client.toOpenTsFilePath(document);
		if (!filepath) {
			return;
		}
		const response = await client.execute('navtree', { file: filepath }, nulToken);
		if (response.type !== 'response' || !response.body?.childItems) {
			return;
		}
		return findScopeEndLineFromNavTreeWorker(startLine, response.body.childItems);
}

function findScopeEndMarker(document: vscode.TextDocument, start: vscode.Position, marker: string): vscode.Range {
	const text = document.getText();
	const offset = text.indexOf(marker, text.indexOf(marker)) + marker.length
	// TODO: Expand to the end of whatever marker is. (OR, chain to findScopeEndLineFromnavTree)
	return new vscode.Range(start, document.positionAt(offset))
}

async function findEditScope(client: ITypeScriptServiceClient, document: vscode.TextDocument, edits: Proto.CodeEdit[]): Promise<vscode.Range> {
	let first = typeConverters.Position.fromLocation(edits[0].start)
	let firstEdit = edits[0]
	let lastEdit = edits[0]
	let last = typeConverters.Position.fromLocation(edits[0].start)
	for (const edit of edits) {
		const start = typeConverters.Position.fromLocation(edit.start)
		const end = typeConverters.Position.fromLocation(edit.end)
		if (start.compareTo(first) < 0) {
			first = start
			firstEdit = edit
		}
		if (end.compareTo(last) > 0) {
			last = end
			lastEdit = edit
		}
	}
	const text = document.getText()
	let startIndex = text.indexOf(firstEdit.newText)
	let start = startIndex > -1 ? document.positionAt(startIndex) : first
	let endIndex = text.lastIndexOf(lastEdit.newText)
	let end = endIndex > -1 ? document.positionAt(endIndex + lastEdit.newText.length) : last
	const expandEnd = await findScopeEndLineFromNavTree(client, document, end.line)
	return new vscode.Range(start, expandEnd?.end ?? end)
}
