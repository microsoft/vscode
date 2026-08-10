/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo, IResponseProcessorContext, StreamingMarkdownReplyInterpreter } from '../../prompt/node/intents';
import { PromptRenderer, RendererIntentInvocation } from '../../prompts/node/base/promptRenderer';
import { ExplainPrompt } from '../../prompts/node/panel/explain';


export const explainIntentPromptSnippet = 'Write an explanation for the active selection as paragraphs of text.';

class ExplainIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	protected readonly defaultQuery: string = 'Write an explanation for the code above as paragraphs of text.';

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(intent, location, endpoint);
	}

	override async buildPrompt(promptParams: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		if (promptParams.query === '') {
			promptParams = { ...promptParams, query: this.defaultQuery };
		}
		return super.buildPrompt(promptParams, progress, token);
	}

	createRenderer(promptContext: IBuildPromptContext, endpoint: IChatEndpoint, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		const editor = this.tabsAndEditorsService.activeTextEditor;
		return PromptRenderer.create(this.instantiationService, endpoint, ExplainPrompt, {
			promptContext,
			document: editor ? TextDocumentSnapshot.create(editor?.document) : undefined,
			selection: editor?.selection,
			isInlineChat: this.location === ChatLocation.Editor,
			endpoint
		});
	}
}

class InlineExplainIntentInvocation extends ExplainIntentInvocation implements IIntentInvocation {

	protected override readonly defaultQuery = explainIntentPromptSnippet;

	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const replyInterpreter = new StreamingMarkdownReplyInterpreter();
		return replyInterpreter.processResponse(context, inputStream, outputStream, token);
	}
}

export class ExplainIntent implements IIntent {

	static readonly ID = Intent.Explain;
	readonly id: string = Intent.Explain;
	readonly locations = [ChatLocation.Panel, ChatLocation.Editor, ChatLocation.Notebook];
	readonly description: string = l10n.t('Explain how the code in your active editor works');

	readonly commandInfo: IIntentSlashCommandInfo | undefined;

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);
		if (location === ChatLocation.Editor) {
			return this.instantiationService.createInstance(InlineExplainIntentInvocation, this, location, endpoint);
		}
		return this.instantiationService.createInstance(ExplainIntentInvocation, this, location, endpoint);
	}
}
