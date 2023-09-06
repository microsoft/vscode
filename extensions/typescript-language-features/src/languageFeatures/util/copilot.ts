import * as vscode from 'vscode';
import { Command } from '../../commands/commandManager';
import { nulToken } from '../../utils/cancellation';
import { DiagnosticsManager } from '../diagnostics';
import type * as Proto from '../../tsServer/protocol/protocol';
import * as typeConverters from '../../typeConverters';
import { ITypeScriptServiceClient } from '../../typescriptService';

// TODO: quick fix version needs to delete the diagnostic (because maybe the followup interferes with it?)
// so it needs a diagnostic manager and a diagnostic. The refactor version doesn't need this
// (there is tiny bits of code overall so maybe there's a different way to write this)
export namespace EditorChatReplacementCommand1 {
	export type Args = {
		readonly message: string;
		readonly document: vscode.TextDocument;
		readonly diagnostic: vscode.Diagnostic;
	};
}
export class EditorChatReplacementCommand1 implements Command {
	public static readonly ID = '_typescript.quickFix.editorChatReplacement1';
	public readonly id = EditorChatReplacementCommand1.ID;

	constructor( private readonly client: ITypeScriptServiceClient, private readonly diagnosticManager: DiagnosticsManager) {
	}

	async execute({ message, document, diagnostic }: EditorChatReplacementCommand1.Args) {
		this.diagnosticManager.deleteDiagnostic(document.uri, diagnostic);
		const initialRange = await findScopeEndLineFromNavTree(this.client, document, diagnostic.range.start.line);
		await vscode.commands.executeCommand('vscode.editorChat.start', { initialRange, message, autoSend: true });
	}
}
export class EditorChatReplacementCommand2 implements Command {
	public static readonly ID = '_typescript.quickFix.editorChatReplacement2';
	public readonly id = EditorChatReplacementCommand2.ID;
	constructor(
		private readonly client: ITypeScriptServiceClient,
	) {
	}
	async execute({ message, document, range: range, expand, marker, refactor }: EditorChatReplacementCommand2.Args) {
		// TODO: "this code" is not specific; might get better results with a more specific referent
		// TODO: Doesn't work in JS files? Is this the span-finder's fault? Try falling back to startLine plus something.
		// TODO: Need to emit jsdoc in JS files once it's working at all
		// TODO: When there are "enough" types around, leave off the "Add separate interfaces when possible" because it's not helpful.
		//       (brainstorming: enough non-primitives, or evidence of type aliases in the same file, or imported)
		const initialRange = expand === 'navtree-function' ? await findScopeEndLineFromNavTree(this.client, document, range.start.line)
		    : expand === 'identifier' ? findScopeEndMarker(document, range.start, marker!)
			: expand === 'refactor-info' ? findRefactorScope(document, refactor!)
			: range;
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
		readonly range: vscode.Range;
		readonly expand: Expand;
		readonly marker?: string;
		readonly refactor?: Proto.RefactorEditInfo;
	}
}

export class EditorChatFollowUp implements Command {

	id: string = '_typescript.quickFix.editorChatFollowUp';

	constructor(private readonly prompt: string, private readonly document: vscode.TextDocument, private readonly range: vscode.Range, private readonly client: ITypeScriptServiceClient) {
	}

	async execute() {
		const initialRange = await findScopeEndLineFromNavTree(this.client, this.document, this.range.start.line);
		await vscode.commands.executeCommand('vscode.editorChat.start', { initialRange, message: this.prompt, autoSend: true });
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
		const enclosingRange = expand === 'navtree-function' ? await findScopeEndLineFromNavTree(this.client, document, range.start.line)
		    : expand === 'identifier' ? findScopeEndMarker(document, range.start, marker!)
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

export type Expand = 'none' | 'navtree-function' | 'identifier' | 'refactor-info' | 'statement' | 'ast-statement'

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

function findRefactorScope(document: vscode.TextDocument, refactor: Proto.RefactorEditInfo): vscode.Range {
	let first = typeConverters.Position.fromLocation(refactor.edits[0].textChanges[0].start)
	let firstChange = refactor.edits[0].textChanges[0]
	let lastChange = refactor.edits[0].textChanges[0]
	let last = typeConverters.Position.fromLocation(refactor.edits[0].textChanges[0].start)
	for (const edit of refactor.edits) {
		for (const change of edit.textChanges) {
			const start = typeConverters.Position.fromLocation(change.start)
			const end = typeConverters.Position.fromLocation(change.end)
			if (start.compareTo(first) < 0) {
				first = start
				firstChange = change
			}
			if (end.compareTo(last) > 0) {
				last = end
				lastChange = change
			}
		}
	}
	const text = document.getText()
	let startIndex = text.indexOf(firstChange.newText)
	let start = startIndex > -1 ? document.positionAt(startIndex) : first
	let endIndex = text.lastIndexOf(lastChange.newText)
	let end = endIndex > -1 ? document.positionAt(endIndex + lastChange.newText.length) : last
	return new vscode.Range(start, end)
}
