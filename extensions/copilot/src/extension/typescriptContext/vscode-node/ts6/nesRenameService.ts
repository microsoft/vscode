/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import * as protocol from '../../common/serverProtocol';

enum ExecutionTarget {
	Semantic,
	Syntax
}

type ExecConfig = {
	readonly lowPriority?: boolean;
	readonly nonRecoverable?: boolean;
	readonly cancelOnResourceChange?: vscode.Uri;
	readonly executionTarget?: ExecutionTarget;
};

type PrepareNesRenameRequestArgs = Omit<protocol.PrepareNesRenameRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
};

namespace PrepareNesRenameRequestArgs {
	export function create(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined, startTime: number, timeBudget: number): PrepareNesRenameRequestArgs {
		return {
			file: vscode.Uri.file(document.fileName),
			line: position.line + 1,
			offset: position.character + 1,
			oldName,
			newName,
			lastSymbolRename: lastSymbolRename ? {
				start: { line: lastSymbolRename.start.line + 1, character: lastSymbolRename.start.character + 1 },
				end: { line: lastSymbolRename.end.line + 1, character: lastSymbolRename.end.character + 1 },
			} : undefined,
			startTime,
			timeBudget,
		};
	}
}

type NesRenameRequestArgs = Omit<protocol.NesRenameRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
};

namespace NesRenameRequestArgs {
	export function create(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined): NesRenameRequestArgs {
		return {
			file: vscode.Uri.file(document.fileName),
			line: position.line + 1,
			offset: position.character + 1,
			oldName,
			newName,
			lastSymbolRename: lastSymbolRename ? {
				start: { line: lastSymbolRename.start.line + 1, character: lastSymbolRename.start.character + 1 },
				end: { line: lastSymbolRename.end.line + 1, character: lastSymbolRename.end.character + 1 },
			} : undefined,
		};
	}
}

export class TS6NesRenameService implements vscode.Disposable {
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	private isActivatedPromise: Promise<boolean> | undefined;

	constructor(private readonly logService: ILogService) { }

	public dispose(): void { }

	public async isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean> {
		const languageId = typeof documentOrLanguageId === 'string' ? documentOrLanguageId : documentOrLanguageId.languageId;
		if (languageId !== 'typescript' && languageId !== 'typescriptreact') {
			return false;
		}
		this.isActivatedPromise ??= this.doIsTypeScriptActivated();
		return this.isActivatedPromise;
	}

	public async prepare(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined, startTime: number, timeBudget: number, token: vscode.CancellationToken): Promise<protocol.PrepareNesRenameResult | protocol.CustomResponse.Failed> {
		const args = PrepareNesRenameRequestArgs.create(document, position, oldName, newName, lastSymbolRename, startTime, timeBudget);
		const response = await vscode.commands.executeCommand<protocol.PrepareNesRenameResponse>('typescript.tsserverRequest', '_.copilot.prepareNesRename', args, TS6NesRenameService.ExecConfig, token);
		if (protocol.PrepareNesRenameResponse.isError(response)) {
			return response.body;
		}
		if (protocol.PrepareNesRenameResponse.isOk(response)) {
			return response.body;
		}
		return { canRename: protocol.RenameKind.no, timedOut: false };
	}

	public async postRename(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined, token: vscode.CancellationToken): Promise<protocol.RenameGroup[]> {
		const args = NesRenameRequestArgs.create(document, position, oldName, newName, lastSymbolRename);
		const response = await vscode.commands.executeCommand<protocol.NesRenameResponse>('typescript.tsserverRequest', '_.copilot.postNesRename', args, TS6NesRenameService.ExecConfig, token);
		return protocol.NesRenameResponse.isOk(response) ? response.body.groups : [];
	}

	private async doIsTypeScriptActivated(): Promise<boolean> {
		try {
			const typeScriptExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
			if (typeScriptExtension === undefined) {
				return false;
			}
			await typeScriptExtension.activate();

			const response: protocol.PingResponse | undefined = await vscode.commands.executeCommand('typescript.tsserverRequest', '_.copilot.ping', TS6NesRenameService.ExecConfig, CancellationToken.None);
			if (response?.body?.kind === 'ok') {
				this.logService.info('TypeScript server plugin activated.');
				return true;
			}
			const message = response === undefined ? 'No ping response received.' : response.body?.message ?? 'Message not provided.';
			this.logService.error('TypeScript server plugin not activated:', message);
		} catch (error) {
			this.logService.error('Error pinging TypeScript server plugin:', error);
		}
		return false;
	}
}
