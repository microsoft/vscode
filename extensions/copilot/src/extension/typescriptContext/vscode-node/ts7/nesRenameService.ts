/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as inspector from 'node:inspector';

import type { Project, Snapshot } from '@typescript/native/unstable/async';
import type { SourceFile } from '@typescript/native/unstable/ast';
import * as vscode from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import * as protocol from '../../common/serverProtocol';
import { nesRename, prepareNesRename } from './api';
import { TypeScript7Api } from './ts7Api';
import { PrepareNesRenameResult } from './nesRenameValidator';
import { CancellationTokenWithTimer, OperationCanceledException } from './typescripts';

type ProjectState = {
	readonly project: Project;
	readonly sourceFile: SourceFile;
};

export class TS7NesRenameService implements vscode.Disposable {
	private readonly disposables = new DisposableStore();
	private readonly nativeApi: TypeScript7Api;
	private readonly isDebugging: boolean;

	constructor(logService: ILogService) {
		this.nativeApi = this.disposables.add(new TypeScript7Api(logService));
		this.isDebugging = inspector.url() !== undefined;
	}

	public dispose(): void {
		this.disposables.dispose();
	}

	public async isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean> {
		const languageId = typeof documentOrLanguageId === 'string' ? documentOrLanguageId : documentOrLanguageId.languageId;
		return (languageId === 'typescript' || languageId === 'typescriptreact') && await this.nativeApi.getApi() !== undefined;
	}

	public async prepare(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined, startTime: number, timeBudget: number, token: vscode.CancellationToken): Promise<protocol.PrepareNesRenameResult> {
		const no: protocol.PrepareNesRenameResult.No = { canRename: protocol.RenameKind.no, timedOut: false };
		const api = await this.nativeApi.getApi();
		if (api === undefined || token.isCancellationRequested) {
			return no;
		}
		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot({ openFiles: [{ uri: document.uri.toString() }] });
		try {
			const state = await this.getProjectState(snapshot, document);
			if (state === undefined) {
				return no;
			}
			const cancellationToken = new CancellationTokenWithTimer(token, startTime, timeBudget, this.isDebugging);
			const result = new PrepareNesRenameResult();
			try {
				const offset = state.sourceFile.getPositionOfLineAndCharacter(position.line, position.character);
				await prepareNesRename(result, api, snapshot, state.project, state.sourceFile, offset, oldName, newName, toRange(lastSymbolRename), cancellationToken);
			} catch (error) {
				if (error instanceof OperationCanceledException) {
					result.setCanRename(protocol.RenameKind.no, 'Operation canceled');
				} else {
					throw error;
				}
			}
			result.setTimedOut(cancellationToken.isTimedOut());
			return result.toJsonResponse();
		} finally {
			await snapshot.dispose();
		}
	}

	public async postRename(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined, token: vscode.CancellationToken): Promise<protocol.RenameGroup[]> {
		const api = await this.nativeApi.getApi();
		if (api === undefined || token.isCancellationRequested) {
			return [];
		}
		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot({ openFiles: [{ uri: document.uri.toString() }] });
		try {
			const state = await this.getProjectState(snapshot, document);
			if (state === undefined) {
				return [];
			}
			const cancellationToken = new CancellationTokenWithTimer(token, Date.now(), Number.MAX_VALUE, this.isDebugging);
			try {
				const offset = state.sourceFile.getPositionOfLineAndCharacter(position.line, position.character);
				return await nesRename(api, snapshot, state.project, state.sourceFile, offset, oldName, newName, toRange(lastSymbolRename), cancellationToken);
			} catch (error) {
				if (error instanceof OperationCanceledException) {
					return [];
				}
				throw error;
			}
		} finally {
			await snapshot.dispose();
		}
	}

	private async getProjectState(snapshot: Snapshot, document: vscode.TextDocument): Promise<ProjectState | undefined> {
		const identifier = { uri: document.uri.toString() };
		const project = await snapshot.getDefaultProjectForFile(identifier);
		const sourceFile = await project?.program.getSourceFile(identifier);
		if (project === undefined || sourceFile === undefined || sourceFile.text !== document.getText()) {
			return undefined;
		}
		return { project, sourceFile };
	}
}

function toRange(range: vscode.Range | undefined): protocol.Range | undefined {
	return range === undefined ? undefined : {
		start: { line: range.start.line, character: range.start.character },
		end: { line: range.end.line, character: range.end.character },
	};
}
