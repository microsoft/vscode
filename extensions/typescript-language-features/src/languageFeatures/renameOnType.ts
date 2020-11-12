/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { flatten } from '../utils/arrays';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import { DocumentSelector } from '../utils/documentSelector';
import * as typeConverters from '../utils/typeConverters';


class TypeScriptOnTypeRenameProvider implements vscode.OnTypeRenameProvider {

	private static enabledKinds = new Set<string>([
		'let', 'const', 'local var', 'parameter'
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

		const highlightsResponse = await this.client.interruptGetErr(() => this.client.execute('documentHighlights', { ...args, filesToSearch: [file] }, token));
		if (highlightsResponse.type !== 'response' || !highlightsResponse.body) {
			return undefined;
		}

		const ranges = flatten(
			highlightsResponse.body
				.filter(highlight => highlight.file === file)
				.map(highlight => highlight.highlightSpans.map(typeConverters.Range.fromTextSpan)));

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
		return vscode.languages.registerOnTypeRenameProvider(selector.syntax,
			new TypeScriptOnTypeRenameProvider(client));
	});
}
