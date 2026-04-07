/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { isHiddenModelB } from '../../../../../platform/endpoint/common/chatModelCapabilities';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { GPT5CopilotIdentityRule } from '../../base/copilotIdentity';
import { InstructionMessage } from '../../base/instructionMessage';
import { ResponseTranslationRules } from '../../base/responseTranslationRules';
import { Gpt5SafetyRule } from '../../base/safetyRules';
import { Tag } from '../../base/tag';
import { DefaultAgentPromptProps, getEditingReminder, ReminderInstructionsProps } from '../defaultAgentInstructions';

import { FileLinkificationInstructions } from '../fileLinkificationInstructions';
import { CopilotIdentityRulesConstructor, IAgentPrompt, PromptRegistry, ReminderInstructionsConstructor, SafetyRulesConstructor, SystemPrompt } from '../promptRegistry';

class HiddenModelBPrompt extends PromptElement<DefaultAgentPromptProps> {
	async render(state: void, sizing: PromptSizing) {
		return <InstructionMessage>
			<Tag name='coding_agent_instructions'>
				You are a coding agent running in VS Code.<br />
				<br />
			</Tag>
			<ResponseTranslationRules />
			<FileLinkificationInstructions />
		</InstructionMessage >;
	}
}

class HiddenModelBPromptResolver implements IAgentPrompt {

	static async matchesModel(endpoint: IChatEndpoint): Promise<boolean> {
		return isHiddenModelB(endpoint);
	}

	static readonly familyPrefixes = [];

	resolveSystemPrompt(endpoint: IChatEndpoint): SystemPrompt | undefined {
		return HiddenModelBPrompt;
	}

	resolveReminderInstructions(endpoint: IChatEndpoint): ReminderInstructionsConstructor | undefined {
		return undefined;
	}

	resolveCopilotIdentityRules(endpoint: IChatEndpoint): CopilotIdentityRulesConstructor | undefined {
		return GPT5CopilotIdentityRule;
	}

	resolveSafetyRules(endpoint: IChatEndpoint): SafetyRulesConstructor | undefined {
		return Gpt5SafetyRule;
	}
}

export class HiddenModelBReminderInstructions extends PromptElement<ReminderInstructionsProps> {
	async render(state: void, sizing: PromptSizing) {
		return <>
			You are an agent—keep going until the user's query is completely resolved before ending your turn. ONLY stop if solved or genuinely blocked.<br />
			Take action when possible; the user expects you to do useful work without unnecessary questions.<br />
			After any parallel, read-only context gathering, give a concise progress update and what's next.<br />
			Avoid repetition across turns: don't restate unchanged plans or sections (like the todo list) verbatim; provide delta updates or only the parts that changed.<br />
			Tool batches: You MUST preface each batch with a one-sentence why/what/outcome preamble.<br />
			Progress cadence: After 3 to 5 tool calls, or when you create/edit &gt; ~3 files in a burst, report progress.<br />
			Requirements coverage: Read the user's ask in full and think carefully. Do not omit a requirement. If something cannot be done with available tools, note why briefly and propose a viable alternative.<br />
			{getEditingReminder(this.props.hasEditFileTool, this.props.hasReplaceStringTool, false /* useStrongReplaceStringHint */, this.props.hasMultiReplaceStringTool)}
		</>;
	}
}
PromptRegistry.registerPrompt(HiddenModelBPromptResolver);
