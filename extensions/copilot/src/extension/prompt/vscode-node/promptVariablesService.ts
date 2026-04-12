/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatLanguageModelToolReference, ChatPromptReference } from 'vscode';
import * as vscode from 'vscode';
import { IChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { getToolName } from '../../tools/common/toolNames';
import { IPromptVariablesService } from '../node/promptVariablesService';

/**
 * Known template variables that can be resolved at runtime.
 * Each entry maps a placeholder name (without the `{{ }}` delimiters) to a
 * resolver that produces the replacement string, or `undefined` if the
 * variable cannot be resolved in the current context.
 */
type VariableResolver = (sessionId: string | undefined, debugTargetSessionIds: readonly string[] | undefined) => string | undefined;

export class PromptVariablesServiceImpl implements IPromptVariablesService {

	declare readonly _serviceBrand: undefined;

	private readonly _resolvers: ReadonlyMap<string, VariableResolver>;

	constructor(
		@IChatDebugFileLoggerService private readonly chatDebugFileLoggerService: IChatDebugFileLoggerService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
	) {
		this._resolvers = new Map<string, VariableResolver>([
			['VSCODE_USER_PROMPTS_FOLDER', () => {
				const globalStorageUri = this.extensionContext.globalStorageUri;
				const userFolderUri = vscode.Uri.joinPath(globalStorageUri, '..', '..');
				const userPromptsFolderUri = vscode.Uri.joinPath(userFolderUri, 'prompts');
				return userPromptsFolderUri.fsPath;
			}],
			['VSCODE_TARGET_SESSION_LOG', (sessionId, debugTargetSessionIds) => {
				if (debugTargetSessionIds && debugTargetSessionIds.length > 0) {
					return debugTargetSessionIds.map(id => {
						const sessionDir = this.chatDebugFileLoggerService.getSessionDir(id);
						return sessionDir ? this.promptPathRepresentationService.getFilePath(sessionDir) : undefined;
					}).filter((path): path is string => path !== undefined).join(', ');
				}
				if (!sessionId) {
					return undefined;
				}
				const sessionDir = this.chatDebugFileLoggerService.getSessionDir(sessionId);
				if (!sessionDir) {
					return undefined;
				}
				return this.promptPathRepresentationService.getFilePath(sessionDir);
			}],
		]);
	}

	async resolveVariablesInPrompt(message: string, variables: ChatPromptReference[]): Promise<{ message: string }> {
		for (const variable of this._reverseSortRefsWithRange(variables)) {
			message = message.slice(0, variable.range[0]) + `[#${variable.name}](#${variable.name}-context)` + message.slice(variable.range[1]);
		}

		return { message };
	}

	async resolveToolReferencesInPrompt(message: string, toolReferences: ChatLanguageModelToolReference[]): Promise<string> {
		// It's part of the extension API contract that these are in reverse order by range, but we sort it to be sure

		let previousRange: [start: number, end: number] | undefined;
		for (const toolReference of this._reverseSortRefsWithRange(toolReferences)) {
			// Tool sets are passed as all the tools as references with the same ranges. For now, just ignore tool references that have the same range.
			// The tools are sorted by range, so we only need to look at the previous one.
			const range = toolReference.range;
			if (previousRange && range[0] === previousRange[0] && range[1] === previousRange[1]) {
				continue;
			}
			const toolName = getToolName(toolReference.name);
			message = message.slice(0, toolReference.range[0]) + `'${toolName}'` + message.slice(toolReference.range[1]);
			previousRange = range;
		}
		return message;
	}

	buildTemplateVariablesContext(sessionId: string | undefined, debugTargetSessionIds?: readonly string[]): string {
		const entries: [string, string][] = [];
		for (const [name, resolve] of this._resolvers) {
			const value = resolve(sessionId, debugTargetSessionIds);
			if (value !== undefined) {
				entries.push([name, value]);
			}
		}
		if (entries.length === 0) {
			return '';
		}
		const lines = entries.map(([name, value]) => `- ${name}: ${value}`);
		return [
			'The following template variables are available for this session:',
			...lines,
			'When a skill or instruction references {{VSCODE_VARIABLE_NAME}}, substitute the corresponding value above.',
		].join('\n');
	}

	private _reverseSortRefsWithRange<T extends { range?: [number, number] }>(refs: T[]): (T & { range: [number, number] })[] {
		const refsWithRange = refs.filter(ref => !!ref.range) as (T & { range: [number, number] })[];
		return refsWithRange.sort((a, b) => b.range[0] - a.range[0]);
	}
}
