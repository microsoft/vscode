/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { MultirootWorkspaceStructure } from '../../prompts/node/panel/workspace/workspaceStructure';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation } from './toolUtils';

interface IReadProjectStructureTool { }

class ReadProjectStructureTool implements vscode.LanguageModelTool<IReadProjectStructureTool> {

	public static readonly toolName = ToolName.ReadProjectStructure;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IReadProjectStructureTool>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		checkCancellation(token);
		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				await renderPromptElementJSON(this.instantiationService, MultirootWorkspaceStructure, { maxSize: 1000 }, options.tokenizationOptions, token))]);
	}

	prepareInvocation?(options: vscode.LanguageModelToolInvocationPrepareOptions<IReadProjectStructureTool>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Reading project structure`,
			pastTenseMessage: l10n.t`Read project structure`
		};
	}
}

ToolRegistry.registerTool(ReadProjectStructureTool);
