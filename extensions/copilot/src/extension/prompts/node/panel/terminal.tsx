/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { BasePromptElementProps, PromptElement, PromptPiece, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { LegacySafetyRules } from '../base/safetyRules';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { HistoryWithInstructions } from './conversationHistory';
import { CustomInstructions } from './customInstructions';
import { EditorIntegrationRules } from './editorIntegrationRules';
import { TerminalLastCommand } from './terminalLastCommand';

export interface TerminalPromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	osName: string;
	shellType: string;
	endpoint: IChatEndpoint;
}

export interface TerminalPromptState {
}

const enum ShellExamples {
	Sh = `
User: How do I print all files recursively within a directory?
Assistant:
\`\`\`sh
ls -lR
\`\`\``,

	Pwsh = `User: go to the foo dir
Assistant:
\`\`\`pwsh
cd .\\foo\\
\`\`\`

User: How do I delete a directory?
Assistant:
\`\`\`pwsh
Remove-Item {dir_name}
\`\`\`

User: create a file called foo
Assistant:
\`\`\`pwsh
New-Item -ItemType File -Name foo
\`\`\``,

	Bash = `User: Print all files starting with "pre"
\`\`\`bash
find . -type f -name 'pre*'
\`\`\``,

	/**
	 * Example answers that are the relevant across all shells.
	 */
	Generic = `User: How do I revert a specific commit?
Assistant:
\`\`\`sh
git revert {commit_id}
\`\`\`

User: How do I commit in git?
Assistant:
\`\`\`sh
git commit -m "{message}"
\`\`\``,

	GenericNonPwsh = `User: go to the foo dir
Assistant:
\`\`\`sh
cd foo
\`\`\``
}

export class TerminalPrompt extends PromptElement<TerminalPromptProps, TerminalPromptState> {

	override render(state: TerminalPromptState): PromptPiece<any, any> | undefined {
		const { query, history, chatVariables, } = this.props.promptContext;
		return (
			<>
				<SystemMessage priority={1000}>
					You are a programmer who specializes in using the command line. Your task is to help the Developer craft a command to run on the command line.<br />
					<CopilotIdentityRules />
					<LegacySafetyRules />
				</SystemMessage>
				<HistoryWithInstructions flexGrow={1} historyPriority={600} passPriority history={history}>
					<InstructionMessage priority={1000}>
						<EditorIntegrationRules />
						<ResponseTranslationRules />
						<br />
						Additional Rules<br />
						{`Think step by step:`}
						{`
1. Read the provided relevant workspace information (file names, project files in the project root) to understand the user's workspace.`}
						{`
2. Generate a response that clearly and accurately answers the user's question. In your response, follow the following:
    - Prefer single line commands.
    - Omit an explanation unless the suggestion is complex, if an explanation is included then be concise.
    - Provide the command suggestions using the active shell and operating system.
    - When there is text that needs to be replaced in the suggestion, prefix the text with '{', suffix the text with '}' and use underscores instead of whitespace. Only do this when the replacement text is NOT provided.
    - Say "I'm not quite sure how to do that." when you aren't confident in your explanation`}

						{isPowerShell(this.props.shellType)
							? `
    - Prefer idiomatic PowerShell over aliases for other shells or system utilities. For example use \`Stop-Process\` or \`Get-NetTCPConnection\` instead of \`kill\` or \`lsof\` respectively.
	- Only use unix utilities when there is no PowerShell equivalent.
    - Prefer cross-platform PowerShell scripting that works on any operating system.`
							: `
    - Only use a tool like python or perl when it is not possible with the shell.`}

						{`
3. At the end of the response, list all text that needs to be replaced with associated descriptions in the form of a markdown list
`.trim()}<br />
					</InstructionMessage>
					<InstructionMessage priority={700}>
						Examples:<br />
						{getShellExamples(this.props.shellType)}
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage flexGrow={1} priority={750}>
					<CustomInstructions languageId={isPowerShell(this.props.shellType) ? 'ps1' : 'bash'} chatVariables={chatVariables} />
				</UserMessage>
				<UserMessage flexGrow={1} priority={800}>
					The active terminal's shell type is:<br />
					{this.props.shellType}
				</UserMessage >
				<UserMessage flexGrow={1} priority={800}>
					The active operating system is:<br />
					{this.props.osName}
				</UserMessage >
				<TerminalLastCommand priority={801} />
				<ChatToolReferences priority={899} flexGrow={2} promptContext={this.props.promptContext} embeddedInsideUserMessage={false} />
				<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={chatVariables} query={query} embeddedInsideUserMessage={false} />
			</>
		);
	}
}

function getShellExamples(shellType: string) {
	const examples: string[] = [
		ShellExamples.Generic
	];
	// Generic
	if (!isPowerShell(shellType)) {
		examples.push(ShellExamples.GenericNonPwsh);
	}
	// Shell-specific
	switch (shellType) {
		case 'ps1':
		case 'pwsh':
		case 'powershell': {
			examples.push(ShellExamples.Pwsh);
			break;
		}
		case 'bash': {
			examples.push(ShellExamples.Bash);
			break;
		}
		default: {
			examples.push(ShellExamples.Sh);
			break;
		}
	}
	return examples.join('\n\n');
}

function isPowerShell(shellType: string) {
	return shellType === 'ps1' || shellType === 'pwsh' || shellType === 'powershell';
}
