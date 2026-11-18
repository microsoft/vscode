/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';


export const ILanguageFeaturesService = createServiceIdentifier<ILanguageFeaturesService>('ILanguageFeaturesService');

export interface ILanguageFeaturesService {
	_serviceBrand: undefined;
	getDefinitions(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]>;
	getImplementations(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]>;
	getReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]>;
	getWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]>;
	getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]>;
	getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[];
}

export class NoopLanguageFeaturesService implements ILanguageFeaturesService {
	_serviceBrand: undefined;
	getDocumentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
		return Promise.resolve([]);
	}
	getDefinitions(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		return Promise.resolve([]);
	}
	getImplementations(uri: vscode.Uri, position: vscode.Position): Promise<(vscode.LocationLink | vscode.Location)[]> {
		return Promise.resolve([]);
	}
	getReferences(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
		return Promise.resolve([]);
	}
	getWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		return Promise.resolve([]);
	}
	getDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
		return [];
	}
}

export function isLocationLink(thing: unknown): thing is vscode.LocationLink {
	return typeof thing === 'object' && thing !== null && 'targetUri' in thing;
}
