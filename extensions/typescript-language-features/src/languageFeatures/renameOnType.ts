/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Kind } from '../protocol.const';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import { DocumentSelector } from '../utils/documentSelector';
import * as typeConverters from '../utils/typeConverters';


class TypeScriptOnTypeRenameProvider implements vscode.OnTypeRenameRangeProvider {

	private static enabledKinds = new Set<string>([
		Kind.let, Kind.const, Kind.localVariable, Kind.parameter, Kind.typeParameter
	]);

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideOnTypeRenameRanges(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.OnTypeRenameRanges | undefined> {
		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return undefined;
		}
		const args = typeConverters.Position.toFileLocationRequestArgs(file, position);
		//

		const quickInfoResponse = await this.client.interruptGetErr(() => this.client.execute('quickinfo', args, token));
		if (quickInfoResponse.type !== 'response' || !quickInfoResponse.body) {
			return undefined;
		}

		if (!TypeScriptOnTypeRenameProvider.enabledKinds.has(quickInfoResponse.body.kind)) {
			return undefined;
		}

		const renameResponse = await this.client.execute('rename', args, token);
		if (!renameResponse || renameResponse.type !== 'response' || !renameResponse.body) {
			return undefined;
		}

		if (renameResponse.body.locs.length !== 1 || renameResponse.body.locs[0].file !== file) {
			return undefined; // not a local?
		}

		const ranges = renameResponse.body.locs[0].locs.map(typeConverters.Range.fromTextSpan);
		if (ranges.length <= 1) {
			return undefined; // not enough usages
		}
		return new vscode.OnTypeRenameRanges(ranges);
	}

}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient
): vscode.Disposable {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.EnhancedSyntax, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerOnTypeRenameRangeProvider(selector.syntax,
			new TypeScriptOnTypeRenameProvider(client));
	});
}
