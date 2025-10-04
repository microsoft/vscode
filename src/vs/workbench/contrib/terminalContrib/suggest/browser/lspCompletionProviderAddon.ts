/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { Disposable, IReference } from '../../../../../base/common/lifecycle.js';
import { ITerminalCompletionProvider, type TerminalCompletionList } from './terminalCompletionService.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITerminalCompletion, mapLspKindToTerminalKind, TerminalCompletionItemKind } from './terminalCompletionItem.js';
import { IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionItemLabel, CompletionItemProvider, CompletionTriggerKind, CompletionItem, CompletionItemKind } from '../../../../../editor/common/languages.js';
import { LspTerminalModelContentProvider } from './lspTerminalModelContentProvider.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';

export class LspCompletionProviderAddon extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	readonly id = 'lsp';
	readonly isBuiltin = true;
	readonly triggerCharacters?: string[];
	private _provider: CompletionItemProvider;
	private _textVirtualModel: IReference<IResolvedTextEditorModel>;
	private _lspTerminalModelContentProvider: LspTerminalModelContentProvider;

	constructor(
		provider: CompletionItemProvider,
		textVirtualModel: IReference<IResolvedTextEditorModel>,
		lspTerminalModelContentProvider: LspTerminalModelContentProvider,
	) {
		super();
		this._provider = provider;
		this._textVirtualModel = textVirtualModel;
		this._lspTerminalModelContentProvider = lspTerminalModelContentProvider;
		this.triggerCharacters = provider.triggerCharacters ? [...provider.triggerCharacters, ' ', '('] : [' ', '('];
	}

	activate(terminal: Terminal): void {
		// console.log('activate');
	}

	async provideCompletions(value: string, cursorPosition: number, allowFallbackCompletions: false, token: CancellationToken): Promise<ITerminalCompletion[] | TerminalCompletionList<ITerminalCompletion> | undefined> {

		// Apply edit for non-executed current commandline --> Pretend we are typing in the real-document.
		this._lspTerminalModelContentProvider.trackPromptInputToVirtualFile(value);

		const textBeforeCursor = value.substring(0, cursorPosition);
		const lines = textBeforeCursor.split('\n');
		const column = lines[lines.length - 1].length + 1;

		// Get line from virtualDocument, not from terminal
		const lineNum = this._textVirtualModel.object.textEditorModel.getLineCount();
		const positionVirtualDocument = new Position(lineNum, column);

		const completions: ITerminalCompletion[] = [];
		if (this._provider && this._provider._debugDisplayName !== 'wordbasedCompletions') {

			const result = await this._provider.provideCompletionItems(this._textVirtualModel.object.textEditorModel, positionVirtualDocument, { triggerKind: CompletionTriggerKind.TriggerCharacter }, token);
			for (const item of (result?.suggestions || [])) {
				// Filter out shell commands from Python completions
				if (isShellCommand(item)) {
					continue;
				}

				// TODO: Support more terminalCompletionItemKind for [different LSP providers](https://github.com/microsoft/vscode/issues/249479)
				const convertedKind = item.kind ? mapLspKindToTerminalKind(item.kind) : TerminalCompletionItemKind.Method;
				const completionItemTemp = createCompletionItemPython(cursorPosition, textBeforeCursor, convertedKind, 'lspCompletionItem', undefined);
				const terminalCompletion: ITerminalCompletion = {
					label: item.label,
					provider: `lsp:${item.extensionId?.value}`,
					detail: item.detail,
					documentation: item.documentation,
					kind: convertedKind,
					replacementIndex: completionItemTemp.replacementIndex,
					replacementLength: completionItemTemp.replacementLength,
				};

				// Store unresolved item and provider for lazy resolution if needed
				if (this._provider.resolveCompletionItem && (!item.detail || !item.documentation)) {
					terminalCompletion._unresolvedItem = item;
					terminalCompletion._resolveProvider = this._provider;
				}

				completions.push(terminalCompletion);
			}
		}

		return completions;
	}
}

export function createCompletionItemPython(
	cursorPosition: number,
	prefix: string,
	kind: TerminalCompletionItemKind,
	label: string | CompletionItemLabel,
	detail: string | undefined
): TerminalCompletionItem {
	const lastWord = getLastWord(prefix);

	return {
		label,
		detail: detail ?? '',
		replacementIndex: cursorPosition - lastWord.length,
		replacementLength: lastWord.length,
		kind: kind ?? TerminalCompletionItemKind.Method
	};
}

function getLastWord(prefix: string): string {
	if (prefix.endsWith(' ')) {
		return '';
	}

	if (prefix.endsWith('.')) {
		return '';
	}

	const lastSpaceIndex = prefix.lastIndexOf(' ');
	const lastDotIndex = prefix.lastIndexOf('.');
	const lastParenIndex = prefix.lastIndexOf('(');

	// Get the maximum index (most recent delimiter)
	const lastDelimiterIndex = Math.max(lastSpaceIndex, lastDotIndex, lastParenIndex);

	// If no delimiter found, return the entire prefix
	if (lastDelimiterIndex === -1) {
		return prefix;
	}

	// Return the substring after the last delimiter
	return prefix.substring(lastDelimiterIndex + 1);
}

export interface TerminalCompletionItem {
	/**
	 * The label of the completion.
	 */
	label: string | CompletionItemLabel;

	/**
	 * The index of the start of the range to replace.
	 */
	replacementIndex: number;

	/**
	 * The length of the range to replace.
	 */
	replacementLength: number;

	/**
	 * The completion's detail which appears on the right of the list.
	 */
	detail?: string;

	/**
	 * A human-readable string that represents a doc-comment.
	 */
	documentation?: string | MarkdownString;

	/**
	 * The completion's kind. Note that this will map to an icon.
	 */
	kind?: TerminalCompletionItemKind;
}

/**
 * Determines if a completion item represents a shell command that should be filtered out
 * from Python REPL completions.
 */
function isShellCommand(item: CompletionItem): boolean {
	const label = typeof item.label === 'string' ? item.label : item.label.label;
	
	// Filter out common shell commands and package managers that should not appear in Python REPL
	const shellCommands = [
		// Package managers and build tools
		'npm', 'yarn', 'pnpm', 'pip', 'pip3', 'pipenv', 'poetry', 'conda',
		'maven', 'gradle', 'make', 'cmake', 'ninja',
		
		// Version control
		'git', 'svn', 'hg', 'bzr',
		
		// Network tools
		'curl', 'wget', 'ssh', 'scp', 'rsync', 'ftp', 'sftp',
		
		// File operations (common commands)
		'ls', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'cat', 'grep', 'find', 'sed', 'awk',
		'chmod', 'chown', 'ln', 'du', 'df', 'tar', 'zip', 'unzip',
		
		// System tools
		'sudo', 'ps', 'kill', 'killall', 'top', 'htop', 'which', 'whereis',
		'systemctl', 'service', 'crontab',
		
		// Container and cloud tools
		'docker', 'podman', 'kubectl', 'helm', 'terraform', 'ansible',
		'aws', 'gcloud', 'azure',
		
		// Programming language tools (excluding Python)
		'node', 'deno', 'bun', 'go', 'rust', 'cargo', 'ruby', 'gem',
		'java', 'javac', 'scala', 'kotlin', 'swift',
		'gcc', 'g++', 'clang', 'clang++',
		
		// Specific commands from the issue
		'addgnurhome', 'kernelophys-support', 'linux-update-symlinks', 'x86_64-linux-gnu-gp-display-html'
	];
	
	// Check if the label matches a known shell command
	if (shellCommands.includes(label)) {
		return true;
	}
	
	// Additional heuristics for shell-like completions
	if (item.kind === CompletionItemKind.Text || item.kind === CompletionItemKind.Variable) {
		const detail = item.detail?.toLowerCase() || '';
		
		// Filter out items that are explicitly shell commands
		if (detail.includes('command') || detail.includes('executable') || 
			detail.includes('script') || detail.includes('binary')) {
			return true;
		}
		
		// Filter out items with hyphenated names that look like shell commands (but be conservative)
		// Only filter if they're long and look like system tools, but allow Python modules
		if (label.includes('-') && label.length > 8 && 
			(detail.includes('tool') || detail.includes('system') || detail === '')) {
			return true;
		}
		
		// Filter out items that look like file paths
		if (label.startsWith('/') || label.includes('./') || label.includes('../')) {
			return true;
		}
	}
	
	// Don't filter Python-related completions, even if they have other kinds
	if (item.kind === CompletionItemKind.Module || 
		item.kind === CompletionItemKind.Class ||
		item.kind === CompletionItemKind.Method ||
		item.kind === CompletionItemKind.Function ||
		item.kind === CompletionItemKind.Keyword) {
		return false;
	}
	
	return false;
}
