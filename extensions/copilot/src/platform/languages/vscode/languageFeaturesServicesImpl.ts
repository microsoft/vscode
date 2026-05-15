/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILanguageFeaturesService } from '../common/languageFeaturesService';

export class LanguageFeaturesServiceImpl implements ILanguageFeaturesService {

	declare readonly _serviceBrand: undefined;

	constructor() { }

	async getDefinitions(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		return await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, position);
	}

	async getImplementations(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		return await vscode.commands.executeCommand('vscode.executeImplementationProvider', uri, position);
	}

	async getReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
		return await vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, position);
	}

	async getWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		return await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', query);
	}

	async getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
		return await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
	}

	getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
		return vscode.languages.getDiagnostics(uri);
	}
}
