/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import * as protocol from '../common/serverProtocol';
import { ExecutionTarget, TypeScriptServiceContribution, type ExecConfig } from './typeScriptService';

type CodeUsageRequestArgs = Omit<protocol.CodeUsageRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
};

namespace CodeUsageRequestArgs {
	export function create(document: vscode.TextDocument, position: vscode.Position): CodeUsageRequestArgs {
		return {
			file: vscode.Uri.file(document.fileName),
			line: position.line + 1,
			offset: position.character + 1
		};
	}
}

export class CodeUsageContribution extends TypeScriptServiceContribution {

	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	constructor(
		@ILogService logService: ILogService
	) {
		super(logService);
		this.disposables.add(vscode.commands.registerCommand('github.copilot.codeUsages', async (uri: vscode.Uri | undefined, position: vscode.Position | undefined): Promise<protocol.CodeUsages | null> => {
			const params = this.resolveParams(uri, position);
			if (params === undefined) {
				throw new Error('Failed to resolve code usage parameters.');
			}

			const args: CodeUsageRequestArgs = CodeUsageRequestArgs.create(params.document, params.position);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const result = await vscode.commands.executeCommand<protocol.CodeUsageResponse>('typescript.tsserverRequest', '_.copilot.codeUsages', args, CodeUsageContribution.ExecConfig, tokenSource.token);
				if (protocol.CodeUsageResponse.isError(result)) {
					return null;
				} else if (protocol.CodeUsageResponse.isOk(result)) {
					return result.body;
				} else {
					return null;
				}
			} catch (error) {
				console.error('Error occurred while fetching code usages:', error);
				return null;
			} finally {
				tokenSource.dispose();
			}
		}));
	}

	private resolveParams(uri: vscode.Uri | undefined, position: vscode.Position | undefined): { document: vscode.TextDocument; position: vscode.Position } | undefined {
		if (uri === undefined) {
			return undefined;
		}
		const document = this.getDocument(uri);
		if (document !== undefined && position !== undefined) {
			return { document, position };
		} else {
			return undefined;
		}
	}
}
