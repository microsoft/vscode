/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { ITypeScriptServiceClient } from '../typescriptService';
import TypingsStatus from '../utils/typingsStatus';

import * as Proto from '../protocol';
import * as PConst from '../protocol.const';
import * as Previewer from '../utils/previewer';
import { tsTextSpanToVsRange, vsPositionToTsFileLocation } from '../utils/typeConverters';

import * as nls from 'vscode-nls';
import { applyCodeAction } from '../utils/codeAction';
import { CommandManager, Command } from '../utils/commandManager';
import { tsCodeEditToVsTextEdit } from '../utils/workspaceEdit';

const localize = nls.loadMessageBundle();

class MyCompletionItem extends vscode.CompletionItem {
	public readonly useCodeSnippet: boolean;

	constructor(
		public readonly position: vscode.Position,
		public readonly document: vscode.TextDocument,
		line: string,
		public readonly tsEntry: Proto.CompletionEntry,
		enableDotCompletions: boolean,
		useCodeSnippetsOnMethodSuggest: boolean
	) {
		super(tsEntry.name);

		if (tsEntry.isRecommended) {
			// Make sure isRecommended property always comes first
			// https://github.com/Microsoft/vscode/issues/40325
			this.sortText = '\0' + tsEntry.sortText;
		} else if (tsEntry.source) {
			// De-prioritze auto-imports
			// https://github.com/Microsoft/vscode/issues/40311
			this.sortText = '\uffff' + tsEntry.sortText;
		} else {
			this.sortText = tsEntry.sortText;
		}

		this.kind = MyCompletionItem.convertKind(tsEntry.kind);
		this.position = position;
		this.commitCharacters = MyCompletionItem.getCommitCharacters(enableDotCompletions, !useCodeSnippetsOnMethodSuggest, tsEntry.kind);
		this.useCodeSnippet = useCodeSnippetsOnMethodSuggest && (this.kind === vscode.CompletionItemKind.Function || this.kind === vscode.CompletionItemKind.Method);

		if (tsEntry.replacementSpan) {
			this.range = tsTextSpanToVsRange(tsEntry.replacementSpan);
		}

		if (tsEntry.insertText) {
			this.insertText = tsEntry.insertText;

			if (tsEntry.replacementSpan) {
				this.range = tsTextSpanToVsRange(tsEntry.replacementSpan);
				if (this.insertText[0] === '[') { // o.x -> o['x']
					this.filterText = '.' + this.label;
				}

				// Make sure we only replace a single line at most
				if (!this.range.isSingleLine) {
					this.range = new vscode.Range(this.range.start.line, this.range.start.character, this.range.start.line, line.length);
				}
			}
		}

		if (tsEntry.kindModifiers && tsEntry.kindModifiers.match(/\boptional\b/)) {
			if (!this.insertText) {
				this.insertText = this.label;
			}

			if (!this.filterText) {
				this.filterText = this.label;
			}
			this.label += '?';
		}
	}

	public resolve(): void {
		if (!this.range) {
			// Try getting longer, prefix based range for completions that span words
			const wordRange = this.document.getWordRangeAtPosition(this.position);
			const text = this.document.getText(new vscode.Range(this.position.line, Math.max(0, this.position.character - this.label.length), this.position.line, this.position.character)).toLowerCase();
			const entryName = this.label.toLowerCase();
			for (let i = entryName.length; i >= 0; --i) {
				if (text.endsWith(entryName.substr(0, i)) && (!wordRange || wordRange.start.character > this.position.character - i)) {
					this.range = new vscode.Range(this.position.line, Math.max(0, this.position.character - i), this.position.line, this.position.character);
					break;
				}
			}
		}
	}

	private static convertKind(kind: string): vscode.CompletionItemKind {
		switch (kind) {
			case PConst.Kind.primitiveType:
			case PConst.Kind.keyword:
				return vscode.CompletionItemKind.Keyword;
			case PConst.Kind.const:
				return vscode.CompletionItemKind.Constant;
			case PConst.Kind.let:
			case PConst.Kind.variable:
			case PConst.Kind.localVariable:
			case PConst.Kind.alias:
				return vscode.CompletionItemKind.Variable;
			case PConst.Kind.memberVariable:
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
				return vscode.CompletionItemKind.Field;
			case PConst.Kind.function:
				return vscode.CompletionItemKind.Function;
			case PConst.Kind.memberFunction:
			case PConst.Kind.constructSignature:
			case PConst.Kind.callSignature:
			case PConst.Kind.indexSignature:
				return vscode.CompletionItemKind.Method;
			case PConst.Kind.enum:
				return vscode.CompletionItemKind.Enum;
			case PConst.Kind.module:
			case PConst.Kind.externalModuleName:
				return vscode.CompletionItemKind.Module;
			case PConst.Kind.class:
			case PConst.Kind.type:
				return vscode.CompletionItemKind.Class;
			case PConst.Kind.interface:
				return vscode.CompletionItemKind.Interface;
			case PConst.Kind.warning:
			case PConst.Kind.file:
			case PConst.Kind.script:
				return vscode.CompletionItemKind.File;
			case PConst.Kind.directory:
				return vscode.CompletionItemKind.Folder;
		}
		return vscode.CompletionItemKind.Property;
	}

	private static getCommitCharacters(
		enableDotCompletions: boolean,
		enableCallCompletions: boolean,
		kind: string
	): string[] | undefined {
		switch (kind) {
			case PConst.Kind.memberGetAccessor:
			case PConst.Kind.memberSetAccessor:
			case PConst.Kind.constructSignature:
			case PConst.Kind.callSignature:
			case PConst.Kind.indexSignature:
			case PConst.Kind.enum:
			case PConst.Kind.interface:
				return enableDotCompletions ? ['.'] : undefined;

			case PConst.Kind.module:
			case PConst.Kind.alias:
			case PConst.Kind.const:
			case PConst.Kind.let:
			case PConst.Kind.variable:
			case PConst.Kind.localVariable:
			case PConst.Kind.memberVariable:
			case PConst.Kind.class:
			case PConst.Kind.function:
			case PConst.Kind.memberFunction:
				return enableDotCompletions ? (enableCallCompletions ? ['.', '('] : ['.']) : undefined;
		}

		return undefined;
	}
}

class ApplyCompletionCodeActionCommand implements Command {
	public static readonly ID = '_typescript.applyCompletionCodeAction';
	public readonly id = ApplyCompletionCodeActionCommand.ID;

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(_file: string, codeActions: Proto.CodeAction[]): Promise<boolean> {
		if (codeActions.length === 0) {
			return true;
		}

		if (codeActions.length === 1) {
			return applyCodeAction(this.client, codeActions[0]);
		}

		interface MyQuickPickItem extends vscode.QuickPickItem {
			index: number;
		}

		const selection = await vscode.window.showQuickPick<MyQuickPickItem>(
			codeActions.map((action, i): MyQuickPickItem => ({
				label: action.description,
				description: '',
				index: i
			})), {
				placeHolder: localize('selectCodeAction', 'Select code action to apply')
			}
		);

		if (!selection) {
			return false;
		}

		const action = codeActions[selection.index];
		if (!action) {
			return false;
		}
		return applyCodeAction(this.client, action);
	}
}

interface CompletionConfiguration {
	readonly useCodeSnippetsOnMethodSuggest: boolean;
	readonly nameSuggestions: boolean;
	readonly quickSuggestionsForPaths: boolean;
	readonly autoImportSuggestions: boolean;
}

namespace CompletionConfiguration {
	export const useCodeSnippetsOnMethodSuggest = 'useCodeSnippetsOnMethodSuggest';
	export const nameSuggestions = 'nameSuggestions';
	export const quickSuggestionsForPaths = 'quickSuggestionsForPaths';
	export const autoImportSuggestions = 'autoImportSuggestions.enabled';

	export function getConfigurationForResource(
		resource: vscode.Uri
	): CompletionConfiguration {
		// TS settings are shared by both JS and TS.
		const typeScriptConfig = vscode.workspace.getConfiguration('typescript', resource);
		return {
			useCodeSnippetsOnMethodSuggest: typeScriptConfig.get<boolean>(CompletionConfiguration.useCodeSnippetsOnMethodSuggest, false),
			quickSuggestionsForPaths: typeScriptConfig.get<boolean>(CompletionConfiguration.quickSuggestionsForPaths, true),
			autoImportSuggestions: typeScriptConfig.get<boolean>(CompletionConfiguration.autoImportSuggestions, true),
			nameSuggestions: vscode.workspace.getConfiguration('javascript', resource).get(CompletionConfiguration.nameSuggestions, true)
		};
	}
}

export default class TypeScriptCompletionItemProvider implements vscode.CompletionItemProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly typingsStatus: TypingsStatus,
		commandManager: CommandManager
	) {
		commandManager.register(new ApplyCompletionCodeActionCommand(this.client));
	}

	public async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[]> {
		if (this.typingsStatus.isAcquiringTypings) {
			return Promise.reject<vscode.CompletionItem[]>({
				label: localize(
					{ key: 'acquiringTypingsLabel', comment: ['Typings refers to the *.d.ts typings files that power our IntelliSense. It should not be localized'] },
					'Acquiring typings...'),
				detail: localize(
					{ key: 'acquiringTypingsDetail', comment: ['Typings refers to the *.d.ts typings files that power our IntelliSense. It should not be localized'] },
					'Acquiring typings definitions for IntelliSense.')
			});
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		const line = document.lineAt(position.line);
		const completionConfiguration = CompletionConfiguration.getConfigurationForResource(document.uri);

		if (!this.shouldTrigger(context, completionConfiguration, line, position)) {
			return [];
		}

		const args: Proto.CompletionsRequestArgs = {
			...vsPositionToTsFileLocation(file, position),
			includeExternalModuleExports: completionConfiguration.autoImportSuggestions,
			includeInsertTextCompletions: true
		};

		let msg: Proto.CompletionEntry[] | undefined = undefined;
		try {
			const response = await this.client.execute('completions', args, token);
			msg = response.body;
			if (!msg) {
				return [];
			}
		} catch {
			return [];
		}

		const enableDotCompletions = this.shouldEnableDotCompletions(document, position);

		const completionItems: vscode.CompletionItem[] = [];
		for (const element of msg) {
			if (element.kind === PConst.Kind.warning && !completionConfiguration.nameSuggestions) {
				continue;
			}
			if (!completionConfiguration.autoImportSuggestions && element.hasAction) {
				continue;
			}
			const item = new MyCompletionItem(position, document, line.text, element, enableDotCompletions, completionConfiguration.useCodeSnippetsOnMethodSuggest);
			completionItems.push(item);
		}

		return completionItems;
	}

	public async resolveCompletionItem(
		item: vscode.CompletionItem,
		token: vscode.CancellationToken
	): Promise<vscode.CompletionItem | undefined> {
		if (!(item instanceof MyCompletionItem)) {
			return undefined;
		}

		const filepath = this.client.normalizePath(item.document.uri);
		if (!filepath) {
			return undefined;
		}

		item.resolve();

		const args: Proto.CompletionDetailsRequestArgs = {
			...vsPositionToTsFileLocation(filepath, item.position),
			entryNames: [
				item.tsEntry.source ? { name: item.tsEntry.name, source: item.tsEntry.source } : item.tsEntry.name
			]
		};

		let response: Proto.CompletionDetailsResponse;
		try {
			response = await this.client.execute('completionEntryDetails', args, token);
		} catch {
			return item;
		}

		const details = response.body;
		if (!details || !details.length || !details[0]) {
			return item;
		}
		const detail = details[0];
		item.detail = detail.displayParts.length ? Previewer.plain(detail.displayParts) : undefined;
		item.documentation = this.getDocumentation(detail, item);

		const { command, additionalTextEdits } = this.getCodeActions(detail, filepath);
		item.command = command;
		item.additionalTextEdits = additionalTextEdits;

		if (detail && item.useCodeSnippet) {
			const shouldCompleteFunction = await this.isValidFunctionCompletionContext(filepath, item.position);
			if (shouldCompleteFunction) {
				item.insertText = this.snippetForFunctionCall(item, detail);
			}
		}

		return item;
	}

	private getCodeActions(
		detail: Proto.CompletionEntryDetails,
		filepath: string
	): { command?: vscode.Command, additionalTextEdits?: vscode.TextEdit[] } {
		if (!detail.codeActions || !detail.codeActions.length) {
			return {};
		}

		// Try to extract out the additionalTextEdits for the current file.
		// Also check if we still have to apply other workspace edits and commands
		// using a vscode command
		const additionalTextEdits: vscode.TextEdit[] = [];
		let hasReaminingCommandsOrEdits = false;
		for (const tsAction of detail.codeActions) {
			if (tsAction.commands) {
				hasReaminingCommandsOrEdits = true;
			}

			// Apply all edits in the current file using `additionalTextEdits`
			if (tsAction.changes) {
				for (const change of tsAction.changes) {
					if (change.fileName === filepath) {
						additionalTextEdits.push(...change.textChanges.map(tsCodeEditToVsTextEdit));
					} else {
						hasReaminingCommandsOrEdits = true;
					}
				}
			}
		}

		let command: vscode.Command | undefined = undefined;
		if (hasReaminingCommandsOrEdits) {
			// Create command that applies all edits not in the current file.
			command = {
				title: '',
				command: ApplyCompletionCodeActionCommand.ID,
				arguments: [filepath, detail.codeActions.map((x): Proto.CodeAction => ({
					commands: x.commands,
					description: x.description,
					changes: x.changes.filter(x => x.fileName !== filepath)
				}))]
			};
		}

		return {
			command,
			additionalTextEdits: additionalTextEdits.length ? additionalTextEdits : undefined
		};
	}

	private shouldEnableDotCompletions(
		document: vscode.TextDocument,
		position: vscode.Position
	): boolean {
		// TODO: Workaround for https://github.com/Microsoft/TypeScript/issues/13456
		// Only enable dot completions when previous character is an identifier.
		// Prevents incorrectly completing while typing spread operators.
		if (position.character > 1) {
			const preText = document.getText(new vscode.Range(
				position.line, 0,
				position.line, position.character - 1));
			return preText.match(/[a-z_$\)\]\}]\s*$/ig) !== null;
		}

		return true;
	}

	private shouldTrigger(
		context: vscode.CompletionContext,
		config: CompletionConfiguration,
		line: vscode.TextLine,
		position: vscode.Position
	): boolean {
		if (context.triggerCharacter === '"' || context.triggerCharacter === '\'') {
			if (!config.quickSuggestionsForPaths) {
				return false;
			}

			// make sure we are in something that looks like the start of an import
			const pre = line.text.slice(0, position.character);
			if (!pre.match(/\b(from|import)\s*["']$/) && !pre.match(/\b(import|require)\(['"]$/)) {
				return false;
			}
		}

		if (context.triggerCharacter === '/') {
			if (!config.quickSuggestionsForPaths) {
				return false;
			}

			// make sure we are in something that looks like an import path
			const pre = line.text.slice(0, position.character);
			if (!pre.match(/\b(from|import)\s*["'][^'"]*$/) && !pre.match(/\b(import|require)\(['"][^'"]*$/)) {
				return false;
			}
		}

		if (context.triggerCharacter === '@') {
			// make sure we are in something that looks like the start of a jsdoc comment
			const pre = line.text.slice(0, position.character);
			if (!pre.match(/^\s*\*[ ]?@/) && !pre.match(/\/\*\*+[ ]?@/)) {
				return false;
			}
		}

		return true;
	}

	private getDocumentation(
		detail: Proto.CompletionEntryDetails,
		item: MyCompletionItem
	): vscode.MarkdownString | undefined {
		const documentation = new vscode.MarkdownString();
		if (detail.source) {
			const importPath = `'${Previewer.plain(detail.source)}'`;
			const autoImportLabel = localize('autoImportLabel', 'Auto import from {0}', importPath);
			item.detail = `${autoImportLabel}\n${item.detail}`;
		}
		Previewer.addMarkdownDocumentation(documentation, detail.documentation, detail.tags);

		return documentation.value.length ? documentation : undefined;
	}

	private async isValidFunctionCompletionContext(
		filepath: string,
		position: vscode.Position
	): Promise<boolean> {
		// Workaround for https://github.com/Microsoft/TypeScript/issues/12677
		// Don't complete function calls inside of destructive assigments or imports
		try {
			const infoResponse = await this.client.execute('quickinfo', vsPositionToTsFileLocation(filepath, position));
			const info = infoResponse.body;
			switch (info && info.kind) {
				case 'var':
				case 'let':
				case 'const':
				case 'alias':
					return false;
				default:
					return true;
			}
		} catch (e) {
			return true;
		}
	}

	private snippetForFunctionCall(
		item: vscode.CompletionItem,
		detail: Proto.CompletionEntryDetails
	): vscode.SnippetString {
		let hasOptionalParameters = false;
		let hasAddedParameters = false;

		const snippet = new vscode.SnippetString();
		const methodName = detail.displayParts.find(part => part.kind === 'methodName');
		snippet.appendText((methodName && methodName.text) || item.label || item.insertText as string);
		snippet.appendText('(');

		let parenCount = 0;
		let i = 0;
		for (; i < detail.displayParts.length; ++i) {
			const part = detail.displayParts[i];
			// Only take top level paren names
			if (part.kind === 'parameterName' && parenCount === 1) {
				const next = detail.displayParts[i + 1];
				// Skip optional parameters
				const nameIsFollowedByOptionalIndicator = next && next.text === '?';
				if (!nameIsFollowedByOptionalIndicator) {
					if (hasAddedParameters) {
						snippet.appendText(', ');
					}
					hasAddedParameters = true;
					snippet.appendPlaceholder(part.text);
				}
				hasOptionalParameters = hasOptionalParameters || nameIsFollowedByOptionalIndicator;
			} else if (part.kind === 'punctuation') {
				if (part.text === '(') {
					++parenCount;
				} else if (part.text === ')') {
					--parenCount;
				} else if (part.text === '...' && parenCount === 1) {
					// Found rest parmeter. Do not fill in any further arguments
					hasOptionalParameters = true;
					break;
				}
			}
		}
		if (hasOptionalParameters) {
			snippet.appendTabstop();
		}
		snippet.appendText(')');
		snippet.appendTabstop(0);
		return snippet;
	}
}
