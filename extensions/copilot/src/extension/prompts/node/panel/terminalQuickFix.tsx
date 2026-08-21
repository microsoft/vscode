/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { BasePromptElementProps, PromptElement, PromptPiece, SystemMessage, UserMessage, type PromptElementProps } from '@vscode/prompt-tsx';
import { IEnvService } from '../../../../platform/env/common/envService';
import { ITerminalService } from '../../../../platform/terminal/common/terminalService';
import { basename, join } from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { FileVariable } from './fileVariable';
import { TerminalLastCommand } from './terminalLastCommand';

export interface TerminalQuickFixFileContextPromptProps extends BasePromptElementProps {
	readonly commandLine: string;
	readonly output: string[];
}

export class TerminalQuickFixFileContextPrompt extends PromptElement<TerminalQuickFixFileContextPromptProps, any> {

	constructor(
		props: PromptElementProps<TerminalQuickFixFileContextPromptProps>,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super(props);
	}

	override render(): PromptPiece<any, any> | undefined {
		const cwd = this._terminalService.terminalLastCommand?.cwd
			? typeof this._terminalService.terminalLastCommand.cwd === 'string'
				? this._terminalService.terminalLastCommand.cwd
				: this._terminalService.terminalLastCommand.cwd.path
			: undefined;
		return (
			<>
				<SystemMessage priority={1000}>
					You are a programmer who specializes in using the command line. Your task is to respond with a list of files that you need access to in order to fix the command. Carefully consider the command line, output and current working directory in your response.<br />
					<SafetyRules />
					<ResponseTranslationRules />
					{`
You MUST respond ONLY with a JSON array in the format:

\`\`\`json
[
	{
		fileName: string
	},
	...
]
\`\`\`

Follow these rules in your response:

- Use an absolute path if you know the exact location of the file.
- Do NOT include any introduction, description or prose. Only include the paths.
`}
				</SystemMessage>
				<SystemMessage priority={1000}>
					{`Examples:

User: npm startt
Assistant:
- \`${cwd ? join(cwd, '.bin/startt') : '.bin/startt'}\`
- \`${cwd ? join(cwd, 'package.json') : 'package.json'}\`
`}
				</SystemMessage>
				<TerminalShellType priority={800} />
				<OperatingSystem priority={600} />
				<UserMessage priority={1100}>
					{!this._terminalService.terminalLastCommand
						? `The following command just failed when run in the terminal \`${this.props.commandLine}\`.

Here is the output of the command:
${(this.props.output ?? []).join()}`
						: ''}
				</UserMessage>
				<TerminalLastCommand priority={800} />
			</>
		);
	}
}
export interface TerminalQuickFixPromptProps extends BasePromptElementProps {
	readonly commandLine: string;
	readonly output: string[];
	readonly verifiedContextUris: URI[];
	readonly verifiedContextDirectoryUris: URI[];
	readonly nonExistentContextUris: URI[];
}

export interface TerminalQuickFixPromptState {
	readonly additionalContext: UserMessage[];
}

export class TerminalQuickFixPrompt extends PromptElement<TerminalQuickFixPromptProps, TerminalQuickFixPromptState> {

	constructor(
		props: PromptElementProps<TerminalQuickFixPromptProps>,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super(props);
	}

	override render(state: TerminalQuickFixPromptState): PromptPiece<any, any> | undefined {
		// A low priority is used here as file references could be very large
		const fileVariables = this.props.verifiedContextUris.map(uri => {
			return <FileVariable variableName={basename(uri.path)} variableValue={uri}></FileVariable>;
		});
		return (
			<>
				<SystemMessage priority={1000}>
					You are a programmer who specializes in using the command line. Your task is to help the user fix a command that was run in the terminal by providing a list of fixed command suggestions. Carefully consider the command line, output and current working directory in your response.<br />
					<SafetyRules />
					<ResponseTranslationRules />
					{`
You MUST respond ONLY with a JSON array containing HIGHLY RELEVANT command suggestions in the format:

\`\`\`json
[
	{
		command: string,
		description: string,
		relevance: 'low' | 'medium' | 'high'
	},
	...
]
\`\`\`

Follow these rules in your response:

- You MUST NOT suggest commands that use non-existent files.
- Under no circumstance will you include an summary, description or any prose whatsoever.
- Do NOT repeat the command and/or output.
- Provide a maximum of 10 suggestions, starting with the most relevant.
- When there is text that needs to be replaced in the suggestion, prefix the text with '{', suffix the text with '}' and use underscores instead of whitespace. Only do this when the replacement text is NOT provided.
- Avoid providing suggestions that do exactly the same thing like aliases.
- Only provide suggestions for the active shell and avoid shelling out where possible.
- The suggestions must be relevant. For example, if the command is a build command, the suggestions must look like build commands, not test commands.
- If the command is related to a particular programming language, do not include suggestions for different languages.
- NEVER suggest to change directory to the current working directory.
`}
				</SystemMessage>
				<SystemMessage priority={700}>
					{`Examples:

User: lss
Assistant:
- \`ls\`

User: clone git
Assistant:
- \`git clone {repository}\`

User: .venv/bin/activate
Context: .venv/bin/activate DOES NOT exist
Assistant:
- \`python -m venv .venv\`

User: .venv/bin/activate
Context: .venv/bin/activate exists
Assistant:
- \`source .venv/bin/activate\`
`}
				</SystemMessage>
				<TerminalShellType priority={800} />
				<OperatingSystem priority={800} />
				<PythonModuleError priority={600} />
				<UserMessage priority={1100}>
					{!this._terminalService.terminalLastCommand
						? `The following command just failed when run in the terminal \`${this.props.commandLine}\`.

Here is the output of the command:
${(this.props.output ?? []).join()}`
						: ''}
				</UserMessage>
				<TerminalLastCommand priority={800} />
				<UserMessage priority={700}>
					{`${this.props.verifiedContextDirectoryUris.length > 0 ?
						`The following directories exist:\n\n${this.props.verifiedContextDirectoryUris.map(uri => `- ${uri.path}`).join('\n')}`
						: ''}`}
				</UserMessage>
				<UserMessage priority={700}>
					{`${this.props.nonExistentContextUris.length > 0 ?
						`The following files DO NOT exist and cannot be used in the suggestion:\n\n${this.props.nonExistentContextUris.map(uri => `- ${uri.path}`).join('\n')}`
						: ''}`}
				</UserMessage>
				{...fileVariables}
			</>
		);
	}
}

class PythonModuleError extends PromptElement {
	render() {
		return (
			<>
				<SystemMessage priority={this.props.priority}>
					{`
Follow these guidelines for python:
- NEVER recommend using "pip install" directly, always recommend "python -m pip install"
- The following are pypi modules: ruff, pylint, black, autopep8, etc
- If the error is module not found, recommend installing the module using "python -m pip install" command.
- If activate is not available create an environment using "python -m venv .venv".
`}
				</SystemMessage >
			</>
		);
	}
}

class TerminalShellType extends PromptElement {

	constructor(
		props: BasePromptElementProps,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super(props);
	}

	render() {
		return (
			<>
				<UserMessage priority={this.props.priority}>
					The active terminal's shell type is: {this._terminalService.terminalShellType}
				</UserMessage >
			</>
		);
	}
}

class OperatingSystem extends PromptElement {

	constructor(
		props: BasePromptElementProps,
		@IEnvService private readonly _envService: IEnvService,
	) {
		super(props);
	}

	render() {
		return (
			<>
				<UserMessage priority={this.props.priority}>
					The active operating system is: {this._envService.OS}
				</UserMessage >
			</>
		);
	}
}
