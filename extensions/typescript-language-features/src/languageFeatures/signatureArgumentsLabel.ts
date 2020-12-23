import * as vscode from 'vscode';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import FileConfigurationManager from './fileConfigurationManager';
import { Position } from 'vscode';

class TypeScriptSginatureArgumentsLabelProvider implements vscode.SignatureArgumentsLabelProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager
	) {
		if (this.client && this.fileConfigurationManager) {
			// nothing
		}
		vscode.window.showInformationMessage("Loaded")
	}

	provideSignatureArgumentsLabels(model: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SignatureArgumentsLabelList> {
		if (model && token) {
			// void
		}

		vscode.window.showInformationMessage("Provided")
		return {
			signatures: [
				{
					arguments: [
						{
							name: 'foo',
							positions: [
								new Position(1, 1)
							]
						}
					]
				}
			],
			dispose() {
				// nothing
			}
		}
	}

}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerSignatureArgumentsLabelProvider(selector.semantic,
			new TypeScriptSginatureArgumentsLabelProvider(client, fileConfigurationManager));
	});
}
