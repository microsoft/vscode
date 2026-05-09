/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';


type ParsedUserQuery = {
	/**
	 * File reference to test.
	 */
	fileToTest?: string;
	/**
	 * Symbols in {fileToTest} to generate tests for.
	 * Can be undefined if cannot be identified from user query.
	 */
	symbolsToTest?: string[];
};

export class UserQueryParser {
	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) { }

	public async parse(query: string): Promise<ParsedUserQuery | null> {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			Prompt,
			{ query }
		);
		const renderResult = await promptRenderer.render();
		const r = await endpoint.makeChatRequest(
			'testGenParseUserQuery',
			renderResult.messages,
			undefined,
			CancellationToken.None,
			ChatLocation.Other
		);
		return r.type === 'success' ? this.processResponse(r.value) : null;
	}

	private processResponse(response: string) {

		// remove first (1-based) and last lines of response if they're backticks (```)
		const lines = response.split(/\r\n|\r|\n/).filter(s => s !== '');
		if (lines.at(0) !== '```') {
			lines.splice(0, 1);
			if (lines.at(-1) === '```') {
				lines.splice(lines.length - 1, 1);
			}
			response = lines.join('\n');
		}

		let parsedJson: unknown;
		try {
			parsedJson = JSON.parse(response);
		} catch (e) {
			this.logService.error(`Failed to parse user query response\nResponse:\n${response}\nError:\n${e}`);
			return null;
		}
		return this.isParsedUserQuery(parsedJson) ? parsedJson : null;
	}

	private isParsedUserQuery(obj: unknown): obj is ParsedUserQuery {
		if (typeof obj !== 'object' || obj === null) {
			return false;
		}

		const parsedUserQuery = obj as ParsedUserQuery;

		if (parsedUserQuery.fileToTest !== undefined && typeof parsedUserQuery.fileToTest !== 'string') {
			return false;
		}

		if (parsedUserQuery.symbolsToTest !== undefined) {
			if (!Array.isArray(parsedUserQuery.symbolsToTest)) {
				return false;
			}
			for (const symbol of parsedUserQuery.symbolsToTest) {
				if (typeof symbol !== 'string') {
					return false;
				}
			}
		}

		return true;
	}

}

type Props = PromptElementProps<{
	query: string;
}>;

class Prompt extends PromptElement<Props> {

	constructor(
		props: PromptElementProps<{ query: string }>,
	) {
		super(props);
	}

	override render(state: void, sizing: PromptSizing) {

		const { query } = this.props;

		const format = `
You are a helpful assistant that parses user queries.
The user is a software developer that is asking an AI programming assistant to generate tests.
Your job is to parse the user query into a JSON object of the following shape:

\`\`\`typescript
{
	/**
	 * File reference to test.
	 */
	fileToTest?: string;
	/**
	 * Symbols in {fileToTest} to generate tests for.
	 * Can be undefined if cannot be identified from user query.
	 */
	symbolsToTest?: string[];
}
\`\`\`

You must return a JSON object of the given shape.
`;
		return (<>
			<SystemMessage>
				{format}
			</SystemMessage>
			<UserMessage>
				User query: {query}<br />
				Parsed query:<br />
			</UserMessage>
		</>);
	}
}
