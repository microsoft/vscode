/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { isNotebookCellOrNotebookChatInput } from '../../../util/common/notebooks';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { GenericPanelIntentInvocation } from '../../context/node/resolvers/genericPanelIntentInvocation';
import { IInlineFixFeatures, InlineFixIntentInvocation, InlineFixProps } from '../../context/node/resolvers/inlineFixIntentInvocation';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo } from '../../prompt/node/intents';
import { PromptElementCtor } from '../../prompts/node/base/promptElement';
import { InlineFix3Prompt } from '../../prompts/node/inline/inlineChatFix3Prompt';
import { InlineFixNotebookPrompt } from '../../prompts/node/inline/inlineChatNotebookFixPrompt';
import { PanelChatFixPrompt } from '../../prompts/node/panel/panelChatFixPrompt';
import { ContributedToolName } from '../../tools/common/toolNames';


export class FixIntent implements IIntent {

	static readonly ID = Intent.Fix;
	readonly id = Intent.Fix;
	readonly locations = [ChatLocation.Editor, ChatLocation.Panel, ChatLocation.Notebook];
	readonly description = l10n.t('Propose a fix for the problems in the selected code');

	readonly commandInfo: IIntentSlashCommandInfo = { toolEquivalent: ContributedToolName.GetErrors };

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const { location, documentContext, request } = invocationContext;
		if (!documentContext) {
			throw new Error('Open a file to fix an issue');
		}

		if (location === ChatLocation.Panel) {
			const endpoint = await this.endpointProvider.getChatEndpoint(request);
			return this.instantiationService.createInstance(GenericPanelIntentInvocation, this, location, endpoint, PanelChatFixPrompt, invocationContext.documentContext);
		}
		const attempt = request.attempt;
		const endpoint = await this.endpointProvider.getChatEndpoint(request);

		let prompt: PromptElementCtor<InlineFixProps, unknown>;
		if (isNotebookCellOrNotebookChatInput(documentContext.document.uri)) {
			prompt = InlineFixNotebookPrompt;
		} else {
			prompt = InlineFix3Prompt;
		}

		const useWorkspaceChunksOnRetry = attempt > 1;
		const features: IInlineFixFeatures = {
			useWorkspaceChunksFromSelection: useWorkspaceChunksOnRetry,
			useWorkspaceChunksFromDiagnostics: false
		};
		return this.instantiationService.createInstance(InlineFixIntentInvocation, this, location, endpoint, prompt, documentContext, features);
	}
}
