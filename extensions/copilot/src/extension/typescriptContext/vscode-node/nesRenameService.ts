/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import * as protocol from '../common/serverProtocol';

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
			oldName: oldName,
			newName: newName,
			lastSymbolRename: lastSymbolRename ? {
				start: { line: lastSymbolRename.start.line + 1, character: lastSymbolRename.start.character + 1 },
				end: { line: lastSymbolRename.end.line + 1, character: lastSymbolRename.end.character + 1 }
			} : undefined,
			startTime: startTime,
			timeBudget: timeBudget
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
			oldName: oldName,
			newName: newName,
			lastSymbolRename: lastSymbolRename ? {
				start: { line: lastSymbolRename.start.line + 1, character: lastSymbolRename.start.character + 1 },
				end: { line: lastSymbolRename.end.line + 1, character: lastSymbolRename.end.character + 1 }
			} : undefined
		};
	}
}

type TextChange = {
	range: protocol.Range;
	newText?: string;
}
type RenameGroup = {
	file: vscode.Uri;
	changes: TextChange[];
};

class TelemetrySender {

	private readonly telemetryService: ITelemetryService;
	private readonly logService: ILogService;

	constructor(telemetryService: ITelemetryService, logService: ILogService) {
		this.telemetryService = telemetryService;
		this.logService = logService;
	}

	public sendPrepareNesRenameTelemetry(requestId: string, timeTaken: number, canRename: protocol.RenameKind, timedOut: boolean): void {
		/* __GDPR__
			"typescript-context-plugin.nesRename.prepare.ok" : {
				"owner": "dirkb",
				"comment": "Telemetry for copilot inline completion context in success case",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
				"canRename": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether NES rename can be performed" },
				"timedOut": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the request timed out" },
				"timeTaken": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Time taken to prepare NES rename in ms", "isMeasurement": true  }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.nesRename.prepare.ok',
			{
				requestId: requestId,
				canRename: canRename.toString(),
				timedOut: timedOut.toString()
			},
			{
				timeTaken: timeTaken
			}
		);
		this.logService.info(`NES Rename Prepare: canRename=${canRename}, timeTaken=${timeTaken}, timedOut=${timedOut}`);
	}

	public sendPrepareNesRenameFailureTelemetry(requestId: string, data: { error: protocol.ErrorCode; message: string; stack?: string }): void {
		/* __GDPR__
			"typescript-context-plugin.nesRename.prepare.failed" : {
				"owner": "dirkb",
				"comment": "Telemetry for copilot inline completion context in failure case",
				"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request correlation id" },
				"code": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The failure code" },
				"message": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The failure message" },
				"stack": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "The failure stack" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent(
			'typescript-context-plugin.nesRename.prepare.failed',
			{
				requestId: requestId,
				code: data.error,
				message: data.message,
				stack: data.stack ?? 'Not available'
			}
		);
	}
}


export class NesRenameContribution implements vscode.Disposable {

	private _isActivated: Promise<boolean> | undefined;
	private disposables: DisposableStore;
	private readonly telemetrySender: TelemetrySender;

	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	constructor(
		@ITelemetryService readonly telemetryService: ITelemetryService,
		@ILogService readonly logService: ILogService,
	) {
		this.telemetrySender = new TelemetrySender(telemetryService, logService);
		this.disposables = new DisposableStore();
		this.disposables.add(vscode.commands.registerCommand('github.copilot.nes.prepareRename', async (uri: vscode.Uri | undefined, position: vscode.Position | undefined, oldName: string | undefined, newName: string | undefined, requestId: string | undefined, lastSymbolRename: vscode.Range | undefined): Promise<protocol.PrepareNesRenameResult> => {
			const no: protocol.PrepareNesRenameResult.No = { canRename: protocol.RenameKind.no, timedOut: false };
			const params = this.resolvePrepareParams(uri, position, oldName, newName, requestId);
			if (params === undefined) {
				return no;
			}
			const document = params.document;
			position = params.position;
			oldName = params.oldName;
			newName = params.newName;
			requestId = params.requestId;

			const activated = await this.isActivated(document);
			if (!activated) {
				return no;
			}

			const startTime = Date.now();
			const args: PrepareNesRenameRequestArgs = PrepareNesRenameRequestArgs.create(document, position, oldName, newName, lastSymbolRename, startTime, 300);

			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const result = await vscode.commands.executeCommand<protocol.PrepareNesRenameResponse>('typescript.tsserverRequest', '_.copilot.prepareNesRename', args, NesRenameContribution.ExecConfig, tokenSource.token);
				if (protocol.PrepareNesRenameResponse.isError(result)) {
					this.telemetrySender.sendPrepareNesRenameFailureTelemetry(requestId, result.body);
					return no;
				} else if (protocol.PrepareNesRenameResponse.isOk(result)) {
					const timedOut = result.body.canRename === protocol.RenameKind.no ? result.body.timedOut : false;
					this.telemetrySender.sendPrepareNesRenameTelemetry(requestId, Date.now() - startTime, result.body.canRename, timedOut);
					return result.body;
				} else {
					return no;
				}
			} finally {
				tokenSource.dispose();
			}
		}));
		this.disposables.add(vscode.commands.registerCommand('github.copilot.nes.postRename', async (uri: vscode.Uri | undefined, position: vscode.Position | undefined, oldName: string | undefined, newName: string | undefined, lastSymbolRename: vscode.Range | undefined): Promise<RenameGroup[]> => {
			const params = this.resolveRenameParams(uri, position, oldName, newName);
			if (params === undefined) {
				return [];
			}
			const document = params.document;
			position = params.position;
			oldName = params.oldName;
			newName = params.newName;
			const args: NesRenameRequestArgs = NesRenameRequestArgs.create(document, position, oldName, newName, lastSymbolRename);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const result = await vscode.commands.executeCommand<protocol.NesRenameResponse>('typescript.tsserverRequest', '_.copilot.postNesRename', args, NesRenameContribution.ExecConfig, tokenSource.token);
				if (protocol.NesRenameResponse.isError(result)) {
					return [];
				} else if (protocol.NesRenameResponse.isOk(result)) {
					return result.body.groups.map(group => ({
						changes: group.changes,
						file: vscode.Uri.file(group.file)
					}));
				} else {
					return [];
				}
			} finally {
				tokenSource.dispose();
			}
		}));
		this.disposables.add(vscode.commands.registerCommand('github.copilot.debug.validateNesRename', async () => {
			const params = await this.getUserParams();
			if (params === undefined) {
				return;
			}
			const { document, position, oldName, newName } = params;
			const activated = await this.isActivated(document);
			if (!activated) {
				vscode.window.showErrorMessage('TypeScript NES Rename plugin is not activated.');
				return;
			}

			const args: PrepareNesRenameRequestArgs = PrepareNesRenameRequestArgs.create(document, position, oldName, newName, new vscode.Range(1, 7, 1, 13), Date.now(), 300);
			const tokenSource = new vscode.CancellationTokenSource();
			try {
				const result = await vscode.commands.executeCommand<protocol.PrepareNesRenameResponse>('typescript.tsserverRequest', '_.copilot.prepareNesRename', args, NesRenameContribution.ExecConfig, tokenSource.token);
				if (protocol.PrepareNesRenameResponse.isError(result)) {
					vscode.window.showErrorMessage(`Prepare NES Rename error: ${result.message}`);
				} else if (protocol.PrepareNesRenameResponse.isOk(result)) {
					const body = result.body;
					if (body.canRename === protocol.RenameKind.yes) {
						vscode.window.showInformationMessage(`Prepare NES Rename: Can rename '${oldName}' to '${newName}'.`);
					} else if (body.canRename === protocol.RenameKind.maybe) {
						vscode.window.showWarningMessage(`Prepare NES Rename: Maybe can rename '${oldName}' to '${newName}'.`);
					} else {
						vscode.window.showErrorMessage(`Prepare NES Rename: Cannot rename '${oldName}' to '${newName}'. Reason: ${body.reason ?? 'Not provided'}`);
					}
				}
			} finally {
				tokenSource.dispose();
			}
		}));
	}

	public dispose(): void {
		this.disposables.dispose();
	}

	private async isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean> {
		const languageId = typeof documentOrLanguageId === 'string' ? documentOrLanguageId : documentOrLanguageId.languageId;
		if (languageId !== 'typescript' && languageId !== 'typescriptreact') {
			return false;
		}
		if (this._isActivated === undefined) {
			this._isActivated = this.doIsTypeScriptActivated(languageId);
		}
		return this._isActivated;
	}

	private async doIsTypeScriptActivated(languageId: string): Promise<boolean> {
		let activated = false;

		try {
			// Check that the TypeScript extension is installed and runs in the same extension host.
			const typeScriptExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
			if (typeScriptExtension === undefined) {
				return false;
			}

			// Make sure the TypeScript extension is activated.
			await typeScriptExtension.activate();

			// Send a ping request to see if the TS server plugin got installed correctly.
			const response: protocol.PingResponse | undefined = await vscode.commands.executeCommand('typescript.tsserverRequest', '_.copilot.ping', NesRenameContribution.ExecConfig, CancellationToken.None);
			if (response !== undefined) {
				if (response.body?.kind === 'ok') {
					this.logService.info('TypeScript server plugin activated.');
					activated = true;
				} else {
					this.logService.error('TypeScript server plugin not activated:', response.body?.message ?? 'Message not provided.');
				}
			} else {
				this.logService.error('TypeScript server plugin not activated:', 'No ping response received.');
			}
		} catch (error) {
			this.logService.error('Error pinging TypeScript server plugin:', error);
		}

		return activated;
	}

	private resolvePrepareParams(uri: vscode.Uri | undefined, position: vscode.Position | undefined, oldName: string | undefined, newName: string | undefined, requestId: string | undefined): { document: vscode.TextDocument; position: vscode.Position; oldName: string; newName: string; requestId: string } | undefined {
		if (uri === undefined) {
			return undefined;
		}
		const document = this.getDocument(uri);
		if (document !== undefined && position !== undefined && typeof oldName === 'string' && typeof newName === 'string' && typeof requestId === 'string') {
			return { document, position, oldName, newName, requestId };
		} else {
			return undefined;
		}
	}

	private resolveRenameParams(uri: vscode.Uri | undefined, position: vscode.Position | undefined, oldName: string | undefined, newName: string | undefined): { document: vscode.TextDocument; position: vscode.Position; oldName: string; newName: string } | undefined {
		if (uri === undefined) {
			return undefined;
		}
		const document = this.getDocument(uri);
		if (document !== undefined && position !== undefined && typeof oldName === 'string' && typeof newName === 'string') {
			return { document, position, oldName, newName };
		} else {
			return undefined;
		}
	}

	private getDocument(uri: vscode.Uri, token?: vscode.CancellationToken): vscode.TextDocument | undefined {
		let document: vscode.TextDocument | undefined;
		if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
			document = vscode.window.activeTextEditor.document;
		} else {
			document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
		}
		return document;
	}

	private async getUserParams(): Promise<{ document: vscode.TextDocument; position: vscode.Position; oldName: string; newName: string } | undefined> {
		if (vscode.window.activeTextEditor === undefined) {
			return undefined;
		}
		const document = vscode.window.activeTextEditor.document;
		const position = vscode.window.activeTextEditor.selection.active;
		const wordRange = document.getWordRangeAtPosition(position);
		if (wordRange === undefined) {
			return undefined;
		}
		const oldName = document.getText(wordRange);
		const newName = await vscode.window.showInputBox({ prompt: 'Enter the new name for NES rename' });
		if (newName === undefined || newName.length === 0) {
			return undefined;
		}
		return { document, position, oldName, newName };
	}
}