/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ILogService } from '../../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart } from '../../../../../vscodeTypes';
import { ToolName } from '../../../../tools/common/toolNames';
import { IToolsService } from '../../../../tools/common/toolsService';
import { ClaudeToolPermissionContext, ClaudeToolPermissionResult, IClaudeToolPermissionHandler } from '../claudeToolPermission';
import { registerToolPermissionHandler } from '../claudeToolPermissionRegistry';
import { ClaudeToolNames, ExitPlanModeInput } from '../claudeTools';

const ApproveButton = l10n.t('Approve');
const DenyButton = l10n.t('Deny');

/**
 * Handler for the ExitPlanMode tool.
 * Shows a confirmation dialog with Claude's plan and Approve/Deny buttons.
 */
export class ExitPlanModeToolHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.ExitPlanMode> {
	public readonly toolNames = [ClaudeToolNames.ExitPlanMode] as const;

	constructor(
		@IToolsService private readonly toolsService: IToolsService,
		@ILogService private readonly logService: ILogService
	) { }

	public async handle(
		_toolName: ClaudeToolNames.ExitPlanMode,
		input: ExitPlanModeInput,
		{ toolInvocationToken }: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult> {
		try {
			const result = await this.toolsService.invokeTool(ToolName.CoreConfirmationToolWithOptions, {
				input: {
					title: l10n.t('Ready to code?'),
					message: l10n.t("Here is Claude's plan:\n\n{0}", input.plan ?? ''),
					// Use buttons instead of a simple confirmation because we do not want
					// auto-approve options for this tool.
					buttons: [ApproveButton, DenyButton]
				},
				toolInvocationToken
			}, CancellationToken.None);

			const firstResultPart = result.content.at(0);
			if (firstResultPart instanceof LanguageModelTextPart && firstResultPart.value === ApproveButton) {
				return {
					behavior: 'allow',
					updatedInput: input
				};
			}
		} catch (e) {
			this.logService.warn(`[ExitPlanMode] Failed to invoke confirmation tool: ${e?.message ?? e}`);
			return {
				behavior: 'deny',
				message: 'Failed to show plan confirmation'
			};
		}

		return {
			behavior: 'deny',
			message: 'The user declined the plan, maybe ask why?'
		};
	}
}

// Self-register the handler
registerToolPermissionHandler(
	[ClaudeToolNames.ExitPlanMode],
	ExitPlanModeToolHandler
);
