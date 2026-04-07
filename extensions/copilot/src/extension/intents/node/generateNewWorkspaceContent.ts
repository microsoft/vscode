/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { FileContentsPrompt, NewWorkspaceContentsPromptProps, ProjectSpecificationPrompt } from '../../prompts/node/panel/newWorkspace/newWorkspaceContents';


abstract class NewWorkspaceContentGenerator {

	constructor(
		private readonly promptType: typeof FileContentsPrompt | typeof ProjectSpecificationPrompt,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	public async generate(promptArgs: NewWorkspaceContentsPromptProps, token: CancellationToken): Promise<string> {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = PromptRenderer.create(this.instantiationService, endpoint, this.promptType, promptArgs);
		const prompt = await promptRenderer.render();

		const fetchResult = await endpoint
			.makeChatRequest(
				'newWorkspaceContentGenerator',
				prompt.messages,
				undefined,
				token,
				ChatLocation.Other,
				undefined,
				undefined,
			);

		return fetchResult.type === ChatFetchResponseType.Success ?
			(promptArgs.filePath ? this.parseContents(promptArgs.filePath, fetchResult.value) : fetchResult.value) :
			'';
	}

	protected abstract parseContents(filePath: string, chatResponse: string): string;
}

export class ProjectSpecificationGenerator extends NewWorkspaceContentGenerator {
	constructor(
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(ProjectSpecificationPrompt, endpointProvider, instantiationService);
	}

	protected override parseContents(chatResponse: string, filePath?: string | undefined): string {
		throw new Error('Method not implemented.');
	}
}

export class FileContentsGenerator extends NewWorkspaceContentGenerator {
	constructor(
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(FileContentsPrompt, endpointProvider, instantiationService);
	}

	protected parseContents(filePath: string, chatResponse: string,): string {
		function safeParse(str: string, regex: RegExp) {
			try {
				const match = regex.exec(str.trim());
				if (match && match.length > 2) {
					return match[2];
				}
			} catch (ex) {
				console.error(ex);
			}

			return str;
		}

		if (filePath.endsWith('.md')) {
			// If returned as a markdown codeblock, strip the codeblock markers
			const fromCodeblock = safeParse(chatResponse, /^```([a-zA-Z]+)?\s*([\s\S]+?)\s*```$/);
			// If returned as bare text, remove any text before the first header
			const [preamble, ...withoutPreamble] = fromCodeblock.split('#');
			if (preamble.length) {
				return ['', ...withoutPreamble].join('#');
			}
			return fromCodeblock;
		} else {
			return safeParse(chatResponse, /```([^\n]+)?\s*\n([\s\S]+?)\s*```/g);
		}
	}
}
