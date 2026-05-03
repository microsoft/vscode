/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IEnvService } from '../../../platform/env/common/envService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { ITerminalService } from '../../../platform/terminal/common/terminalService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../prompt/node/intents';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { TerminalPrompt } from '../../prompts/node/panel/terminal';


export class TerminalIntent implements IIntent {
	static readonly ID = Intent.Terminal;
	readonly locations = [ChatLocation.Panel, ChatLocation.Terminal];
	readonly id = TerminalIntent.ID;
	readonly description = l10n.t('Ask how to do something in the terminal');
	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: false
	};

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);
		return this.instantiationService.createInstance(TerminalIntentInvocation, this, endpoint, location);
	}
}

class TerminalIntentInvocation implements IIntentInvocation {

	constructor(
		readonly intent: TerminalIntent,
		readonly endpoint: IChatEndpoint,
		readonly location: ChatLocation,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEnvService private readonly envService: IEnvService,
		@ITerminalService private readonly terminalService: ITerminalService,
	) { }

	async buildPrompt(promptContext: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		const osName = this.envService.OS;
		const shellType = this.terminalService.terminalShellType;

		const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, TerminalPrompt, {
			promptContext,
			osName,
			shellType,
			endpoint: this.endpoint
		});

		const result = await renderer.render(progress, token);

		return result;
	}
}
