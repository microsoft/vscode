/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { PromptRenderer } from '../../../extension/prompts/node/base/promptRenderer';
import { Tag } from '../../../extension/prompts/node/base/tag';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';

export const IAIEvaluationService = createServiceIdentifier<IAIEvaluationService>('IAIEvaluationService');

/**
 * A service used in testing to evaluate if a response meets a given criteria.
 */
export interface IAIEvaluationService {

	_serviceBrand: undefined;

	evaluate(response: string, criteria: string, token: CancellationToken): Promise<EvaluationResult>;
}

export interface EvaluationResult {
	readonly errorMessage?: string;
}


export class AIEvaluationService implements IAIEvaluationService {
	_serviceBrand: undefined;

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
	}

	async evaluate(response: string, criteria: string, token: CancellationToken): Promise<EvaluationResult> {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = PromptRenderer.create(this.instantiationService, endpoint, EvaluationPrompt, {
			response, criteria
		});
		const prompt = await promptRenderer.render();
		const fetchResult = await endpoint.makeChatRequest(
			'testEvaluation',
			prompt.messages,
			undefined,
			token,
			ChatLocation.Other
		);
		if (fetchResult.type === 'success') {
			return this.parseReply(fetchResult.value);
		}
		throw new Error('Failed to evaluate response');
	}

	private parseReply(reply: string): EvaluationResult {
		const lines = reply.split('\n');
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();
			if (line.startsWith('PASS')) {
				return {};
			} else if (line.startsWith('FAIL')) {
				return { errorMessage: line.substring(5).trim() };
			}
		}
		throw new Error('Failed to evaluate input, no PASS or FAIL line found');
	}
}

export interface EvaluationPromptProps extends BasePromptElementProps {
	readonly response: string;
	readonly criteria: string;
}

export class EvaluationPrompt extends PromptElement<EvaluationPromptProps> {

	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		return (
			<>
				<SystemMessage priority={1001}>
					You are a world class examiner and must decide whether a response fulfills a given criteria<br />
					<br />
					Think step by step:<br />
					1. Examine the provided response and criteria.<br />
					2. Evaluate whether the response addresses the criteria adequately.<br />
					3. If the evaluation is negative, end your reply with a line that starts with 'FAIL', followed by a single sentence explaining why.<br />
					4. If the evaluation is positive, end your reply with a line that starts with 'PASS, followed by a single sentence explaining why.<br />
					5. Do not add any additional feedback or comments after the line with 'FAIL' or 'PASS'<br />
					<br />
					Focus on being clear, helpful, and thorough.<br />
				</SystemMessage>
				<UserMessage flexGrow={1}>
					<Tag name='response' priority={100}>
						{this.props.response}
					</Tag>
					<Tag name='criteria' priority={100}>
						{this.props.criteria}
					</Tag>
					Please reply with your evaluation of whether the response meets the criteria. Finish your reply with a line that starts with "PASS" or "FAIL" followed by a single sentence that explains why. Do not add any additional feedback or comments after the line with "FAIL" or "PASS".
				</UserMessage>
			</>
		);
	}
}
