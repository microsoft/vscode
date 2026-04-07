/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DiffStateManager } from '../diffState';
import { ILogger } from '../../../../../platform/log/common/logService';

export const ACCEPT_DIFF_COMMAND = 'github.copilot.chat.copilotCLI.acceptDiff';
export const REJECT_DIFF_COMMAND = 'github.copilot.chat.copilotCLI.rejectDiff';

export function registerDiffCommands(logger: ILogger, diffState: DiffStateManager): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand(ACCEPT_DIFF_COMMAND, () => {
			logger.info('[DIFF] ===== ACCEPT COMMAND =====');
			const diff = diffState.getForCurrentTab();
			if (!diff) {
				logger.info('[DIFF] No active diff found for accept');
				return;
			}

			logger.info(`[DIFF] Accepting diff: ${diff.tabName}, diffId=${diff.diffId}`);
			diff.cleanup();
			diff.resolve({ status: 'SAVED', trigger: 'accepted_via_button' });
			logger.info('[DIFF] Accept command done');
		})
	);

	disposables.push(
		vscode.commands.registerCommand(REJECT_DIFF_COMMAND, () => {
			logger.info('[DIFF] ===== REJECT COMMAND =====');
			const diff = diffState.getForCurrentTab();
			if (!diff) {
				logger.info('[DIFF] No active diff found for reject');
				return;
			}
			logger.info(`[DIFF] Rejecting diff: ${diff.tabName}, diffId=${diff.diffId}`);
			diff.cleanup();
			diff.resolve({ status: 'REJECTED', trigger: 'rejected_via_button' });
			logger.info('[DIFF] Reject command done');
		})
	);

	return disposables;
}
