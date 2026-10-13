/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { BasePromptElementProps } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { IIntent, IIntentInvocation } from '../../../prompt/node/intents';
import { PromptElementCtor } from '../../../prompts/node/base/promptElement';
import { PromptRenderer, RendererIntentInvocation } from '../../../prompts/node/base/promptRenderer';
import { PanelChatBasePrompt } from '../../../prompts/node/panel/panelChatBasePrompt';

export interface GenericBasePromptElementProps extends BasePromptElementProps {
	readonly documentContext?: IDocumentContext;
	readonly promptContext: IBuildPromptContext;
}

export class GenericPanelIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		private readonly prompt: PromptElementCtor<GenericBasePromptElementProps, any> = PanelChatBasePrompt,
		private readonly documentContext: IDocumentContext | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(intent, location, endpoint);
	}

	createRenderer(
		promptContext: IBuildPromptContext,
		endpoint: IChatEndpoint,
		progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart>,
		token: vscode.CancellationToken
	) {
		return PromptRenderer.create(this.instantiationService, endpoint, this.prompt, {
			documentContext: this.documentContext,
			promptContext
		});
	}
}
