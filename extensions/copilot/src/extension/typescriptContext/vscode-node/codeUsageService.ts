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
import { ExecutionTarget, TypeScriptServiceContribution, type ExecConfig } from './typeScriptService';


export class CodeUsageContribution extends TypeScriptServiceContribution {

	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	constructor(
		@ILogService logService: ILogService
	) {
		super(logService);
		this.disposables.add(vscode.commands.registerCommand('github.copilot.codeUsage', async (uri: vscode.Uri | undefined, position: vscode.Position | undefined, requestId: string | undefined): Promise<protocol.CodeUsageResult> => {
			const no: protocol.CodeUsageResult.No = { canProvideCodeUsage: false, timedOut: false };
	}
}
