/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { VSCodeAPIContextElement } from '../../context/node/resolvers/extensionApi';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';

interface IVSCodeAPIToolParams {
	query: string;
}

class VSCodeAPITool implements vscode.LanguageModelTool<IVSCodeAPIToolParams> {
	public static readonly toolName = ToolName.VSCodeAPI;

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IVSCodeAPIToolParams>, token: CancellationToken) {

		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				await renderPromptElementJSON(this.instantiationService, VSCodeAPIContextElement, { query: options.input.query }, options.tokenizationOptions, token))]);
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IVSCodeAPIToolParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const query = `"${options.input.query}"`;
		return {
			invocationMessage: l10n.t`Searching VS Code API for ${query}`,
			pastTenseMessage: l10n.t`Searched VS Code API for ${query}`
		};
	}
}

ToolRegistry.registerTool(VSCodeAPITool);
