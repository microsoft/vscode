/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import * as PConst from '../protocol.const';
import { CachedResponse } from '../tsServer/cachedResponse';
import { ITypeScriptServiceClient } from '../typescriptService';
import { ConfigurationDependentRegistration } from '../utils/dependentRegistration';
import { TypeScriptReferencesCodeLensProvider } from './referencesCodeLens';
import { getSymbolRange } from './baseCodeLensProvider';

class TypeScriptReferencesCodeLensOnAllFunctionsProvider extends TypeScriptReferencesCodeLensProvider {
	protected extractSymbol(
		document: vscode.TextDocument,
		item: Proto.NavigationTree,
	): vscode.Range | null {
		if (item.kind === PConst.Kind.function) {
			return getSymbolRange(document, item);
		}

		return null;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	modeId: string,
	client: ITypeScriptServiceClient,
	cachedResponse: CachedResponse<Proto.NavTreeResponse>,
) {
	return new ConfigurationDependentRegistration(modeId, 'referencesCodeLens.showOnAllFunctions', () => {
		return vscode.languages.registerCodeLensProvider(selector,
			new TypeScriptReferencesCodeLensOnAllFunctionsProvider(client, cachedResponse));
	});
}
