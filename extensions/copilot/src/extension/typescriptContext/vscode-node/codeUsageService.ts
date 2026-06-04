/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import * as protocol from '../common/serverProtocol';
import { TypeScriptServiceContribution } from './typeScriptService';

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

namespace Result {
	export interface LineRange {
		startLine: number;
		endLine: number;
	}

	export interface Container {
		kind: string;
		name: string;
		range: LineRange;
	}

	export interface CodeUsage {
		uri: vscode.Uri;
		line: number;
		containers?: Container[];
	}

	export interface CodeUsages {
		symbol: string;
		definitions?: CodeUsage[];
		references?: CodeUsage[];
		implementations?: CodeUsage[];
	}
}


export class CodeUsageContribution extends TypeScriptServiceContribution {

	constructor(
		@ILogService logService: ILogService
	) {
		super(logService);
		this.disposables.add(vscode.commands.registerCommand('github.copilot.codeUsages', async (uri: vscode.Uri | undefined, position: vscode.Position | undefined): Promise<Result.CodeUsages | null> => {
			const params = this.resolveParams(uri, position);
			if (params === undefined) {
				return null;
			}
			if (!this.isActivated(params.document)) {
				return null;
			}

			const args: CodeUsageRequestArgs = CodeUsageRequestArgs.create(params.document, params.position);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const result = await vscode.commands.executeCommand<protocol.CodeUsageResponse>('typescript.tsserverRequest', '_.copilot.codeUsages', args, CodeUsageContribution.ExecConfig, tokenSource.token);
				if (protocol.CodeUsageResponse.isError(result)) {
					return null;
				} else if (protocol.CodeUsageResponse.isOk(result)) {
					return this.asResult(result.body);
				} else {
					return null;
				}
			} catch (error) {
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

	private asResult(codeUsages: protocol.CodeUsageResponse.OK): Result.CodeUsages {
		const result: Result.CodeUsages = { symbol: codeUsages.symbol };
		if (codeUsages.definitions) {
			result.definitions = codeUsages.definitions.map(def => ({
				uri: vscode.Uri.file(def.file),
				line: def.line + 1,
				containers: def.containers ? def.containers.map(c => ({
					kind: c.kind,
					name: c.name,
					range: { startLine: c.range.start + 1, endLine: c.range.end + 1 }
				})) : undefined
			}));
		}
		if (codeUsages.references) {
			result.references = codeUsages.references.map(ref => ({
				uri: vscode.Uri.file(ref.file),
				line: ref.line + 1,
				containers: ref.containers ? ref.containers.map(c => ({
					kind: c.kind,
					name: c.name,
					range: { startLine: c.range.start + 1, endLine: c.range.end + 1 }
				})) : undefined
			}));
		}
		if (codeUsages.implementations) {
			result.implementations = codeUsages.implementations.map(impl => ({
				uri: vscode.Uri.file(impl.file),
				line: impl.line + 1,
				containers: impl.containers ? impl.containers.map(c => ({
					kind: c.kind,
					name: c.name,
					range: { startLine: c.range.start + 1, endLine: c.range.end + 1 }
				})) : undefined
			}));
		}
		return result;
	}
}
