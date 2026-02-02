/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireMinVersion } from './util/dependentRegistration';

class SmartSelection implements vscode.SelectionRangeProvider {
	public static readonly minVersion = API.v350;

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideSelectionRanges(
		document: vscode.TextDocument,
		positions: vscode.Position[],
		token: vscode.CancellationToken,
	): Promise<vscode.SelectionRange[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		const args: Proto.SelectionRangeRequestArgs = {
			file,
			locations: positions.map(typeConverters.Position.toLocation)
		};
		const response = await this.client.execute('selectionRange', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}
		return response.body.map(SmartSelection.convertSelectionRange);
	}

	private static convertSelectionRange(
		selectionRange: Proto.SelectionRange
	): vscode.SelectionRange {
		return new vscode.SelectionRange(
			typeConverters.Range.fromTextSpan(selectionRange.textSpan),
			selectionRange.parent ? SmartSelection.convertSelectionRange(selectionRange.parent) : undefined,
		);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireMinVersion(client, SmartSelection.minVersion),
	], () => {
		return vscode.languages.registerSelectionRangeProvider(selector.syntax, new SmartSelection(client));
	});
}
