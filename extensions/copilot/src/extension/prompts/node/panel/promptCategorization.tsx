/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { generateTaxonomyPrompt } from '../../../prompt/common/promptCategorizationTaxonomy';
import { SafetyRules } from '../base/safetyRules';
import { CurrentEditor } from './currentEditor';
import { WorkspaceStructure } from './workspace/workspaceStructure';

// Re-export types for consumers
export type { PromptClassification, PromptIntent, PromptDomain, PromptScope } from '../../../prompt/common/promptCategorizationTaxonomy';

export interface PromptCategorizationProps extends BasePromptElementProps {
	userRequest: string;
}

export class PromptCategorizationPrompt extends PromptElement<PromptCategorizationProps> {
	override async render(_state: void, sizing: PromptSizing) {
		const systemPrompt = [
			'You are an expert classifier for AI coding assistant prompts. Classify developer requests in context of their workspace and active file across domain, intent, time estimate, and scope.',
			'You MUST use the categorize_prompt tool to provide your classification.',
			generateTaxonomyPrompt(),
		].join('\n\n') + '\n\n';

		return (
			<>
				<SystemMessage priority={1000}>
					{systemPrompt}
					<SafetyRules />
				</SystemMessage>
				<UserMessage priority={900}>
					<WorkspaceStructure priority={600} flexGrow={0} maxSize={Math.min(300, Math.floor(sizing.tokenBudget * 0.1))} /><br />
					<CurrentEditor priority={600} flexGrow={0} /><br />
					User message:<br />
					{this.props.userRequest}
				</UserMessage>
			</>
		);
	}
}
