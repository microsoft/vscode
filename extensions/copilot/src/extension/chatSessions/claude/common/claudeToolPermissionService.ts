/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { IEnterpriseManagedPolicyService } from '../../../../platform/configuration/common/enterpriseManagedPolicyService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService, createDecorator } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart } from '../../../../vscodeTypes';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import {
	ClaudeToolPermissionContext,
	ClaudeToolPermissionResult,
	IClaudeToolConfirmationParams,
	IClaudeToolPermissionHandler
} from './claudeToolPermission';
import { getToolPermissionHandlerRegistry } from './claudeToolPermissionRegistry';
import { ClaudeToolInputMap, ClaudeToolNames } from './claudeTools';

export const IClaudeToolPermissionService = createDecorator<IClaudeToolPermissionService>('claudeToolPermissionService');

export interface IClaudeToolPermissionService {
	readonly _serviceBrand: undefined;

	/**
	 * Check if a tool can be used, showing confirmation if needed.
	 * @param toolName The name of the Claude tool
	 * @param input The tool input parameters
	 * @param context Context including the tool invocation token
	 * @returns Permission result (allow with updated input, or deny with message)
	 */
	canUseTool(
		toolName: string,
		input: Record<string, unknown>,
		context: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult>;
}

/**
 * Default deny message when user declines a tool
 */
const DenyToolMessage = 'The user declined to run the tool';
const EnterpriseToolDeniedMessage = 'This tool is blocked by enterprise managed settings.';
const EnterpriseNetworkFetchDeniedMessage = 'Network fetching through the shell is blocked by enterprise managed settings.';

const managedToolNameToClaudeToolNames: ReadonlyMap<string, readonly ClaudeToolNames[]> = new Map([
	['web_fetch', [ClaudeToolNames.WebFetch]],
	['fetch_webpage', [ClaudeToolNames.WebFetch]],
	['web_search', [ClaudeToolNames.WebSearch]],
	['run_terminal', [ClaudeToolNames.Bash]],
	['run_in_terminal', [ClaudeToolNames.Bash]],
	['read_file', [ClaudeToolNames.Read]],
	['view', [ClaudeToolNames.Read]],
	['grep', [ClaudeToolNames.Grep]],
	['grep_search', [ClaudeToolNames.Grep]],
	['glob', [ClaudeToolNames.Glob]],
	['file_search', [ClaudeToolNames.Glob]],
	['list_dir', [ClaudeToolNames.LS]],
	['create', [ClaudeToolNames.Write]],
	['create_file', [ClaudeToolNames.Write]],
	['edit', [ClaudeToolNames.Edit, ClaudeToolNames.MultiEdit]],
	['str_replace', [ClaudeToolNames.Edit, ClaudeToolNames.MultiEdit]],
	['replace_string_in_file', [ClaudeToolNames.Edit, ClaudeToolNames.MultiEdit]],
	['vscode_askQuestions', [ClaudeToolNames.AskUserQuestion]],
]);

const webFetchManagedToolNames = new Set(['web_fetch', 'fetch_webpage']);
const shellNetworkFetchCommandRegex = /(^|[\s;&|()])(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/i;

function mapManagedToolNamesToClaudeToolNames(toolNames: readonly string[] | undefined): Set<ClaudeToolNames> {
	const mapped = new Set<ClaudeToolNames>();
	for (const toolName of toolNames ?? []) {
		for (const claudeToolName of managedToolNameToClaudeToolNames.get(toolName) ?? []) {
			mapped.add(claudeToolName);
		}
	}
	return mapped;
}

function isNetworkFetchShellCommand(input: Record<string, unknown>): boolean {
	const command = input.command;
	return typeof command === 'string' && shellNetworkFetchCommandRegex.test(command);
}

export class ClaudeToolPermissionService implements IClaudeToolPermissionService {
	declare readonly _serviceBrand: undefined;

	private readonly _handlerCache = new Map<ClaudeToolNames, IClaudeToolPermissionHandler>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IToolsService private readonly toolsService: IToolsService,
		@IEnterpriseManagedPolicyService private readonly enterpriseManagedPolicyService: IEnterpriseManagedPolicyService,
	) { }

	public async canUseTool(
		toolName: string,
		input: Record<string, unknown>,
		context: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult> {
		const enterpriseDecision = await this._checkEnterpriseToolPolicy(toolName, input);
		if (enterpriseDecision) {
			return enterpriseDecision;
		}

		if (context.permissionMode === 'bypassPermissions') {
			// Bypass mode: allow all tools without confirmation
			return { behavior: 'allow', updatedInput: input };
		}

		const handler = this._getHandler(toolName as ClaudeToolNames);

		// If handler has full custom implementation, use it
		if (handler?.handle) {
			return handler.handle(toolName as ClaudeToolNames, input as ClaudeToolInputMap[ClaudeToolNames], context);
		}

		// Check auto-approve (handler-specific or permission mode based)
		if (handler?.canAutoApprove) {
			const canAutoApprove = await handler.canAutoApprove(toolName as ClaudeToolNames, input as ClaudeToolInputMap[ClaudeToolNames], context);
			if (canAutoApprove) {
				return { behavior: 'allow', updatedInput: input };
			}
		}

		// Get confirmation params (custom or default)
		const confirmationParams = handler?.getConfirmationParams
			? handler.getConfirmationParams(toolName as ClaudeToolNames, input as ClaudeToolInputMap[ClaudeToolNames])
			: this._getDefaultConfirmationParams(toolName, input);

		// Show confirmation dialog
		return this._showConfirmation(confirmationParams, input, context);
	}

	private _getHandler(toolName: ClaudeToolNames): IClaudeToolPermissionHandler | undefined {
		// Check cache first
		if (this._handlerCache.has(toolName)) {
			return this._handlerCache.get(toolName);
		}

		// Find registration for this tool
		const registration = getToolPermissionHandlerRegistry().find(r => r.toolNames.includes(toolName));
		if (!registration) {
			return undefined;
		}

		// Create handler instance
		const handler = this.instantiationService.createInstance(registration.ctor);
		// Cache for all tool names this handler supports
		for (const name of registration.toolNames) {
			this._handlerCache.set(name, handler);
		}

		return handler;
	}

	private _getDefaultConfirmationParams(toolName: string, input: Record<string, unknown>): IClaudeToolConfirmationParams {
		return {
			title: l10n.t('Use {0}?', toolName),
			message: `\`\`\`\n${JSON.stringify(input, null, 2)}\n\`\`\``
		};
	}

	private async _showConfirmation(
		params: IClaudeToolConfirmationParams,
		input: Record<string, unknown>,
		context: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult> {
		try {
			const result = await this.toolsService.invokeTool(ToolName.CoreConfirmationTool, {
				input: params,
				toolInvocationToken: context.toolInvocationToken,
			}, CancellationToken.None);

			const firstResultPart = result.content.at(0);
			if (firstResultPart instanceof LanguageModelTextPart && firstResultPart.value === 'yes') {
				return {
					behavior: 'allow',
					updatedInput: input
				};
			}
		} catch { }

		return {
			behavior: 'deny',
			message: DenyToolMessage
		};
	}

	private async _checkEnterpriseToolPolicy(toolName: string, input: Record<string, unknown>): Promise<ClaudeToolPermissionResult | undefined> {
		const toolAccessPolicy = await this.enterpriseManagedPolicyService.getEffectiveToolAccessPolicy();
		if (!toolAccessPolicy) {
			return undefined;
		}

		const allowedClaudeToolNames = mapManagedToolNamesToClaudeToolNames(toolAccessPolicy.toolAllowList);
		const deniedClaudeToolNames = mapManagedToolNamesToClaudeToolNames(toolAccessPolicy.toolDenyList);
		const currentToolName = toolName as ClaudeToolNames;

		if (toolAccessPolicy.toolAllowList && !allowedClaudeToolNames.has(currentToolName)) {
			return {
				behavior: 'deny',
				message: EnterpriseToolDeniedMessage,
			};
		}

		if (deniedClaudeToolNames.has(currentToolName)) {
			return {
				behavior: 'deny',
				message: EnterpriseToolDeniedMessage,
			};
		}

		if (currentToolName === ClaudeToolNames.Bash
			&& toolAccessPolicy.toolDenyList?.some(tool => webFetchManagedToolNames.has(tool))
			&& isNetworkFetchShellCommand(input)) {
			return {
				behavior: 'deny',
				message: EnterpriseNetworkFetchDeniedMessage,
			};
		}

		return undefined;
	}
}
