/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { BasePromptElementProps } from '@vscode/prompt-tsx';
import type { CancellationToken, ChatResponseProgressPart, ChatResponseReferencePart, ChatResponseStream, ChatResult, Progress } from 'vscode';
import { IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { IIntent, IIntentInvocation, IResponseProcessorContext, NoopReplyInterpreter, ReplyInterpreter, ReplyInterpreterMetaData } from '../../../prompt/node/intents';
import { PromptElementCtor } from '../../../prompts/node/base/promptElement';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';

export class InlineFixIntentInvocation implements IIntentInvocation {

	private replyInterpreter: ReplyInterpreter | null = null;

	constructor(
		readonly intent: IIntent,
		readonly location: ChatLocation,
		readonly endpoint: IChatEndpoint,
		private readonly prompt: PromptElementCtor<InlineFixProps, unknown>,
		private readonly documentContext: IDocumentContext,
		private readonly features: IInlineFixFeatures,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async buildPrompt(
		promptContext: IBuildPromptContext,
		progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>,
		token: CancellationToken
	) {
		const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, this.prompt, {
			documentContext: this.documentContext,
			promptContext,
			features: this.features,
		});
		const result = await renderer.render(progress, token);
		this.replyInterpreter = result.metadata.get(ReplyInterpreterMetaData)?.replyInterpreter ?? (result.hasIgnoredFiles ? new NoopReplyInterpreter() : null);
		return result;
	}

	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: ChatResponseStream, token: CancellationToken): Promise<ChatResult | void> {
		if (!this.replyInterpreter) {
			throw new Error('Could not process response without a reply interpreter.');
		}
		return this.replyInterpreter.processResponse(context, inputStream, outputStream, token);
	}
}

export interface IInlineFixFeatures {
	readonly useWorkspaceChunksFromSelection: boolean;
	readonly useWorkspaceChunksFromDiagnostics: boolean;
}

export interface InlineFixProps extends BasePromptElementProps {
	readonly documentContext: IDocumentContext;
	readonly promptContext: IBuildPromptContext;
	readonly features: IInlineFixFeatures;
}
