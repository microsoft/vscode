/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';

// Extracts the "yam" from "- yam" or "yam" or "* yam" 🍠
const LIST_RE = /\s*(?:. )?([a-z0-9_-]+)\s*/;

export interface ILanguageToolsProvider {
	readonly _serviceBrand: undefined;

	getToolsForLanguages(languages: string[], token: CancellationToken): Promise<{ ok: boolean; commands: string[] }>;
}

export const ILanguageToolsProvider = createServiceIdentifier<ILanguageToolsProvider>('ILanguageToolsProvider');

export class LanguageToolsProvider {
	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
	}

	public async getToolsForLanguages(languages: string[], token: CancellationToken) {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-base');
		const promptRenderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			ToolLanguagesPrompt,
			{ languages }
		);

		const prompt = await promptRenderer.render(undefined, token);
		const fetchResult = await endpoint.makeChatRequest(
			'debugCommandIdentifier',
			prompt.messages,
			undefined,
			token,
			ChatLocation.Other
		);

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return { ok: false, commands: [] };
		}

		return {
			ok: true,
			commands: fetchResult.value
				.split('\n')
				.map(s => LIST_RE.exec(s)?.[1])
				.filter((s): s is string => !!s),
		};
	}
}


class ToolLanguagesPrompt extends PromptElement<{ languages: string[] } & BasePromptElementProps, void> {
	override render(_state: void, _sizing: PromptSizing): PromptPiece {
		return (
			<>
				<SystemMessage priority={10}>
					You are an AI programming assistant that is specialized for usage of command-line tools developers use to build software.<br />
					I'm working on software in the given following languages. Please list the names of common command-line tools I might use to build and test my software.<br />
					Do NOT list tools that don't run my code, such as those used only for linting. For example, if I ask for JavaScript, the list should include tools like node, npx, and mocha, but not eslint.<br />
					Be thorough! Try to give a list of *at least* 10 such tools.<br />
					Print these tools out as a list, separated by commas. Do NOT print any additional explanation or context.
					<br />
					<TextChunk priority={8}>
						# Example<br />
						## User: <br />
						- python<br />
						- rust<br />
						## Response:<br />
						- python<br />
						- pip<br />
						- cargo<br />
						- rustc<br />
					</TextChunk>
				</SystemMessage>
				<UserMessage priority={9}>
					<TextChunk breakOnWhitespace flexGrow={1}>
						The languages I'm working in are:<br />
						{this.props.languages.join('\n -')}
					</TextChunk>
				</UserMessage>
			</>
		);
	}
}
