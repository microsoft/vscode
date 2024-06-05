/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import { LanguageDescription } from '../configuration/languageDescription';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';
import FileConfigurationManager from './fileConfigurationManager';
import { conditionalRegistration, requireGlobalConfiguration } from './util/dependentRegistration';

class TypeScriptFormattingProvider implements vscode.DocumentRangeFormattingEditProvider, vscode.OnTypeFormattingEditProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingOptionsManager: FileConfigurationManager
	) { }

	public async provideDocumentRangeFormattingEdits(
		document: vscode.TextDocument,
		range: vscode.Range,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken
	): Promise<vscode.TextEdit[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		await this.formattingOptionsManager.ensureConfigurationOptions(document, options, token);

		const args = typeConverters.Range.toFormattingRequestArgs(file, range);
		const response = await this.client.execute('format', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		return response.body.map(typeConverters.TextEdit.fromCodeEdit);
	}

	public async provideOnTypeFormattingEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		ch: string,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken
	): Promise<vscode.TextEdit[]> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return [];
		}

		await this.formattingOptionsManager.ensureConfigurationOptions(document, options, token);

		const args: Proto.FormatOnKeyRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			key: ch
		};
		const response = await this.client.execute('formatonkey', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		const result: vscode.TextEdit[] = [];
		for (const edit of response.body) {
			const textEdit = typeConverters.TextEdit.fromCodeEdit(edit);
			const range = textEdit.range;
			// Work around for https://github.com/microsoft/TypeScript/issues/6700.
			// Check if we have an edit at the beginning of the line which only removes white spaces and leaves
			// an empty line. Drop those edits
			if (range.start.character === 0 && range.start.line === range.end.line && textEdit.newText === '') {
				const lText = document.lineAt(range.start.line).text;
				// If the edit leaves something on the line keep the edit (note that the end character is exclusive).
				// Keep it also if it removes something else than whitespace
				if (lText.trim().length > 0 || lText.length > range.end.character) {
					result.push(textEdit);
				}
			} else {
				result.push(textEdit);
			}
		}
		return result;
	}
}

export function register(
	selector: DocumentSelector,
	language: LanguageDescription,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager
) {
	return conditionalRegistration([
		requireGlobalConfiguration(language.id, 'format.enable'),
	], () => {
		const formattingProvider = new TypeScriptFormattingProvider(client, fileConfigurationManager);
		return vscode.Disposable.from(
			vscode.languages.registerOnTypeFormattingEditProvider(selector.syntax, formattingProvider, ';', '}', '\n'),
			vscode.languages.registerDocumentRangeFormattingEditProvider(selector.syntax, formattingProvider),
		);
	});
}
