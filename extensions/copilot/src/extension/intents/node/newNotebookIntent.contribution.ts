/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IntentLinkificationOptions, IResponseProcessorContext } from '../../prompt/node/intents';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { NewNotebookPlanningPrompt } from '../../prompts/node/panel/newNotebook';
import { NewNotebookResponseProcessor } from './newNotebookIntent';


export class NewNotebookIntent implements IIntent {
	static readonly ID = Intent.NewNotebook;
	readonly id: string = Intent.NewNotebook;
	readonly description = l10n.t('Create a new Jupyter Notebook');
	readonly locations = [ChatLocation.Panel];

	readonly commandInfo = {
		allowsEmptyArgs: false,
		yieldsTo: [
			{ command: 'fix' },
			{ command: 'explain' },
			{ command: 'workspace' },
			{ command: 'tests' },
		],
		defaultEnablement: true,
		sampleRequest: l10n.t('How do I create a notebook to load data from a csv file?')
	};

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);

		return this.instantiationService.createInstance(NewNotebookPlanningInvocation, this, endpoint, location, invocationContext.request.prompt);
	}
}

class NewNotebookPlanningInvocation implements IIntentInvocation {

	readonly linkification: IntentLinkificationOptions = { disable: true };

	private context: IBuildPromptContext | undefined;

	constructor(
		readonly intent: NewNotebookIntent,
		readonly endpoint: IChatEndpoint,
		readonly location: ChatLocation,
		readonly query: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async buildPrompt(promptContext: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		this.context = promptContext;

		const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, NewNotebookPlanningPrompt, {
			promptContext,
			endpoint: this.endpoint,
		});

		return await renderer.render(progress, token);
	}

	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		outputStream.markdown(l10n.t('Creating a new notebook:\n'));

		const responseProcessor = this.instantiationService.createInstance(NewNotebookResponseProcessor, this.endpoint, this.context);

		return responseProcessor.processResponse(context, inputStream, outputStream, token);
	}
}
