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
	public static readonly ID = '_typescript.quickFix.editorChatReplacement';
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
	public static readonly ID = "_typescript.quickFix.editorChatReplacement";
	public readonly id = EditorChatReplacementCommand2.ID;
	constructor(
		private readonly client: ITypeScriptServiceClient,
	) {
	}
	async execute({ message, document, rangeOrSelection }: EditorChatReplacementCommand2.Args) {
		// TODO: "this code" is not specific; might get better results with a more specific referent
		// TODO: Doesn't work in JS files? Is this the span-finder's fault? Try falling back to startLine plus something.
		// TODO: Need to emit jsdoc in JS files once it's working at all
		// TODO: When there are "enough" types around, leave off the "Add separate interfaces when possible" because it's not helpful.
		//       (brainstorming: enough non-primitives, or evidence of type aliases in the same file, or imported)
		const initialRange = await findScopeEndLineFromNavTree(this.client, document, rangeOrSelection.start.line)
		await vscode.commands.executeCommand('vscode.editorChat.start', { initialRange, message, autoSend: true });
	}
}
export namespace EditorChatReplacementCommand2 {
	export interface Args {
		readonly message: string;
		readonly document: vscode.TextDocument;
		readonly rangeOrSelection: vscode.Range | vscode.Selection;
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

export function findScopeEndLineFromNavTreeWorker(startLine: number, navigationTree: Proto.NavigationTree[]): vscode.Range | undefined {
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

export async function findScopeEndLineFromNavTree(client: ITypeScriptServiceClient, document: vscode.TextDocument, startLine: number) {
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

export namespace ChatPanelFollowup {
	export interface Args {
		readonly prompt: string;
		readonly document: vscode.TextDocument;
		readonly range: vscode.Range;
		readonly expand: Expand;
	}
	// assuming there is an ast to walk, I'm convinced I can do a more consistent job than the navtree code.
	export type Expand = 'none' | 'navtree-function' | 'statement' | 'ast-statement'
}
export class ChatPanelFollowup implements Command {
	public readonly id = ChatPanelFollowup.ID;
	public static readonly ID: string = '_typescript.refactor.chatPanelFollowUp';

	constructor(private readonly client: ITypeScriptServiceClient) {
	}

	async execute({ prompt, document, range, expand }: ChatPanelFollowup.Args) {
		console.log("-------------------------------" + prompt + "------------------------------")
		const enclosingRange = expand === 'navtree-function' && findScopeEndLineFromNavTree(this.client, document, range.start.line) || range;
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

