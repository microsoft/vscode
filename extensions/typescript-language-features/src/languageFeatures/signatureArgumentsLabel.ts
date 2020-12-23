import * as vscode from 'vscode';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import { Position } from 'vscode';

const dummy = [new vscode.SignautreArgumentsLabel('foo', new Position(1, 1))];

class TypeScriptSginatureArgumentsLabelProvider implements vscode.SignatureArgumentsLabelProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideSignatureArgumentsLabels(model: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SignautreArgumentsLabel[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		try {
			const response = await this.client.execute('provideSignatureArgumentsLabel', { file: filepath }, token);
			if (response.type !== 'response' || !response.success || !response.body) {
				return dummy;
			}

			const labels = response.body.map(label => {
				return new vscode.SignautreArgumentsLabel(label.name, new vscode.Position(
					label.position.line, label.position.offset
				))
			});
			return labels
		} catch {
			return dummy
		}
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerSignatureArgumentsLabelProvider(selector.semantic,
			new TypeScriptSginatureArgumentsLabelProvider(client));
	});
}
