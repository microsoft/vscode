/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { ConfigurationDependentRegistration } from '../utils/dependentRegistration';
import * as typeConverters from '../utils/typeConverters';
import FileConfigurationManager from './fileConfigurationManager';

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
		const file = this.client.toPath(document.uri);
		if (!file) {
			return undefined;
		}

		await this.formattingOptionsManager.ensureConfigurationOptions(document, options, token);

		let edits: Proto.CodeEdit[];
		try {
			const args = typeConverters.Range.toFormattingRequestArgs(file, range);
			const { body } = await this.client.execute('format', args, token);
			if (!body) {
				return undefined;
			}
			edits = body;
		} catch {
			return undefined;
		}

		return edits.map(typeConverters.TextEdit.fromCodeEdit);
	}

	public async provideOnTypeFormattingEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		ch: string,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken
	): Promise<vscode.TextEdit[]> {
		const file = this.client.toPath(document.uri);
		if (!file) {
			return [];
		}

		await this.formattingOptionsManager.ensureConfigurationOptions(document, options, token);

		const args: Proto.FormatOnKeyRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			key: ch
		};
		try {
			const { body } = await this.client.execute('formatonkey', args, token);
			const edits = body;
			const result: vscode.TextEdit[] = [];
			if (!edits) {
				return result;
			}
			for (const edit of edits) {
				const textEdit = typeConverters.TextEdit.fromCodeEdit(edit);
				const range = textEdit.range;
				// Work around for https://github.com/Microsoft/TypeScript/issues/6700.
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
		} catch {
			// noop
		}
		return [];
	}
}

export function register(
	selector: vscode.DocumentSelector,
	modeId: string,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager
) {
	return new ConfigurationDependentRegistration(modeId, 'format.enable', () => {
		const formattingProvider = new TypeScriptFormattingProvider(client, fileConfigurationManager);
		return vscode.Disposable.from(
			vscode.languages.registerOnTypeFormattingEditProvider(selector, formattingProvider, ';', '}', '\n'),
			vscode.languages.registerDocumentRangeFormattingEditProvider(selector, formattingProvider),
		);
	});
}