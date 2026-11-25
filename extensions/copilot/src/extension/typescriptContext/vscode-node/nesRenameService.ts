/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import * as protocol from '../common/serverProtocol';
import { TS7NesRenameService } from './ts7/nesRenameService';
import { TS6NesRenameService } from './ts6/nesRenameService';
import { TypeScript } from './tsService';

type TextChange = {
	range: protocol.Range;
	newText?: string;
};
type RenameGroup = {
	file: vscode.Uri;
	changes: TextChange[];
};

interface NesRenameService extends vscode.Disposable {
	isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean>;
	prepare(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined, startTime: number, timeBudget: number, token: vscode.CancellationToken): Promise<protocol.PrepareNesRenameResult | protocol.CustomResponse.Failed>;
	postRename(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined, token: vscode.CancellationToken): Promise<protocol.RenameGroup[]>;
}

class NullNesRenameService implements NesRenameService {
	public dispose(): void { }

	public isActivated(): Promise<boolean> {
		return Promise.resolve(false);
	}

	public prepare(): Promise<protocol.PrepareNesRenameResult> {
		return Promise.resolve({ canRename: protocol.RenameKind.no, timedOut: false });
	}

	public postRename(): Promise<protocol.RenameGroup[]> {
		return Promise.resolve([]);
	}
}

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

	private readonly disposables: DisposableStore;
	private readonly telemetrySender: TelemetrySender;
	private nesRenameService: NesRenameService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		this.telemetrySender = new TelemetrySender(telemetryService, logService);
		this.disposables = new DisposableStore();
		this.nesRenameService = this.createNesRenameService();
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (TypeScript.affectsVersion(e) || e.affectsConfiguration(ConfigKey.TypeScript7LanguageContext.fullyQualifiedId)) {
				this.updateNesRenameService();
			}
		}));
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
			return this.prepareRename(document, position, oldName, newName, requestId, lastSymbolRename);
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
			return this.postRename(document, position, oldName, newName, lastSymbolRename);
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

			const result = await this.prepareRename(document, position, oldName, newName, 'debug', new vscode.Range(1, 7, 1, 13));
			if (result.canRename === protocol.RenameKind.yes) {
				vscode.window.showInformationMessage(`Prepare NES Rename: Can rename '${oldName}' to '${newName}'.`);
			} else if (result.canRename === protocol.RenameKind.maybe) {
				vscode.window.showWarningMessage(`Prepare NES Rename: Maybe can rename '${oldName}' to '${newName}'.`);
			} else {
				vscode.window.showErrorMessage(`Prepare NES Rename: Cannot rename '${oldName}' to '${newName}'. Reason: ${result.reason ?? 'Not provided'}`);
			}
		}));
	}

	public dispose(): void {
		this.nesRenameService.dispose();
		this.disposables.dispose();
	}

	private async prepareRename(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, requestId: string, lastSymbolRename: vscode.Range | undefined): Promise<protocol.PrepareNesRenameResult> {
		const no: protocol.PrepareNesRenameResult.No = { canRename: protocol.RenameKind.no, timedOut: false };
		const service = this.nesRenameService;
		if (!await service.isActivated(document)) {
			return no;
		}

		const startTime = Date.now();
		const timeBudget = 300;
		const tokenSource = new vscode.CancellationTokenSource();
		try {
			const body = await service.prepare(document, position, oldName, newName, lastSymbolRename, startTime, timeBudget, tokenSource.token);
			if ('error' in body) {
				this.telemetrySender.sendPrepareNesRenameFailureTelemetry(requestId, body);
				return no;
			}
			const timedOut = body.canRename === protocol.RenameKind.no ? body.timedOut : false;
			this.telemetrySender.sendPrepareNesRenameTelemetry(requestId, Date.now() - startTime, body.canRename, timedOut);
			return body;
		} catch (error) {
			const data: protocol.CustomResponse.Failed = error instanceof Error
				? { error: protocol.ErrorCode.exception, message: error.message, stack: error.stack }
				: { error: protocol.ErrorCode.exception, message: 'Unknown error' };
			this.telemetrySender.sendPrepareNesRenameFailureTelemetry(requestId, data);
			this.logService.error(`Error preparing TypeScript ${TypeScript.runsVersion7() ? '7' : '6'} NES rename:`, error);
			return no;
		} finally {
			tokenSource.dispose();
		}
	}

	private async postRename(document: vscode.TextDocument, position: vscode.Position, oldName: string, newName: string, lastSymbolRename: vscode.Range | undefined): Promise<RenameGroup[]> {
		const tokenSource = new vscode.CancellationTokenSource();
		try {
			const groups = await this.nesRenameService.postRename(document, position, oldName, newName, lastSymbolRename, tokenSource.token);
			return groups.map(group => ({
				changes: group.changes,
				file: vscode.Uri.file(group.file),
			}));
		} catch (error) {
			this.logService.error(`Error computing TypeScript ${TypeScript.runsVersion7() ? '7' : '6'} NES rename edits:`, error);
			return [];
		} finally {
			tokenSource.dispose();
		}
	}

	private async isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean> {
		return this.nesRenameService.isActivated(documentOrLanguageId);
	}

	private updateNesRenameService(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldService = this.nesRenameService;
		if (runsTS7) {
			if (oldService instanceof TS6NesRenameService) {
				this.nesRenameService = enableTS7
					? new TS7NesRenameService(this.logService)
					: new NullNesRenameService();
			} else if (oldService instanceof TS7NesRenameService && !enableTS7) {
				this.nesRenameService = new NullNesRenameService();
			} else if (oldService instanceof NullNesRenameService && enableTS7) {
				this.nesRenameService = new TS7NesRenameService(this.logService);
			}
		} else if (!(oldService instanceof TS6NesRenameService)) {
			this.nesRenameService = new TS6NesRenameService(this.logService);
		}
		if (oldService !== this.nesRenameService) {
			oldService.dispose();
		}
	}

	private createNesRenameService(): NesRenameService {
		if (!TypeScript.runsVersion7()) {
			return new TS6NesRenameService(this.logService);
		}
		return TypeScript.isVersion7SupportEnabled(this.configurationService)
			? new TS7NesRenameService(this.logService)
			: new NullNesRenameService();
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
