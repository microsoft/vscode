/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssistantMessage, BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, Raw, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type { Uri } from 'vscode';
import { getTextPart } from '../../../../platform/chat/common/globalStringUtils';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { INotebookSection } from '../../../../util/common/notebooks';
import { isNonEmptyArray } from '../../../../util/vs/base/common/arrays';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { LegacySafetyRules } from '../base/safetyRules';
import { JupyterNotebookRules } from '../notebook/commonPrompts';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { EditorIntegrationRules } from './editorIntegrationRules';
import { CodeBlock } from './safeElements';

export interface NewNotebookPlanningPromptProps extends BasePromptElementProps {
	promptContext: IBuildPromptContext;
	endpoint: IChatEndpoint;
}

export interface NewNotebookPlanningPromptState {
}

export class NewNotebookPlanningPrompt extends PromptElement<NewNotebookPlanningPromptProps, NewNotebookPlanningPromptState> {
	override async prepare(): Promise<NewNotebookPlanningPromptState> {
		return {};
	}

	override render(state: NewNotebookPlanningPromptState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		return (
			<>
				<><SystemMessage priority={1000}>
					You are an AI that creates a detailed content outline for a Jupyter notebook on a given topic.<br />
					<CopilotIdentityRules />
					<LegacySafetyRules />
					<EditorIntegrationRules />
					<ResponseTranslationRules />
					<br />
					Additional Rules<br />
					DO NOT include Introduction or Conclusion section in the outline!<br />
					Focus only on sections that will need code!<br />
					{[
						'',
						'Generate the outline as two parts:',
						'- First part is markdown bullet list of section titles',
						'- Second part is the JSON data that will validate against this JSON schema, wrap the response in code block. We assume that a code block begins with \`\`\`[optionally the language] and ends with \`\`\`',
						'',
						'The JSON schema is:',
						'{',
						'  "$schema": "http://json-schema.org/draft-07/schema#",',
						'  "type": "object",',
						'  "properties": {',
						'	"description": {',
						'	  "type": "string"',
						'	},',
						'	"sections": {',
						'	  "type": "array",',
						'	  "items": {',
						'		"type": "object",',
						'		"properties": {',
						'		  "title": {',
						'			"type": "string"',
						'		  },',
						'		  "content": {',
						'			"type": "string"',
						'		  }',
						'		},',
						'		"required": ["title", "content"]',
						'	  }',
						'	}',
						'  },',
						'  "required": ["sections"]',
						'}'
					].join('\n')}
					{[
						'',
						'Examples:',
						'',
						'Below you will find a set of examples of what you should respond with. Please follow these examples as closely as possible.',
						'',
						'## Valid notebook creation question',
						'',
						'user: Creating Random Arrays with Numpy',
						'',
						'assistant: Here\'s an outline for a Jupyter notebook that creates Random Arrays with Numpy:',
						'',
						'* **Import Required Libraries**',
						'* **Create Random Arrays**',
						'* **Seed the Random Number Generator**',
						'* **Generate Random Integers**',
						'',
						'\`\`\`json',
						'{',
						'  "description": "A Jupyter notebook that creates Random Arrays with Numpy.",',
						'  "sections": [',
						'    {',
						'      "title": "Import Required Libraries",',
						'      "content": "Import the necessary libraries, including NumPy."',
						'    },',
						'    {',
						'      "title": "Create Random Arrays",',
						'      "content": "Use NumPy to create random arrays of various shapes and sizes, including 1D, 2D, and 3D arrays."',
						'    },',
						'    {',
						'      "title": "Seed the Random Number Generator",',
						'      "content": "Use the seed() function to seed the random number generator for reproducibility."',
						'    },',
						'	{',
						'	  "title": "Generate Random Integers",',
						'	  "content": "Use the randint() function to generate random integers within a specified range."',
						'	}',
						'  ]',
						'}',
						'\`\`\`'].join('\n')
					}
				</SystemMessage></>

				<ChatToolReferences priority={899} flexGrow={2} promptContext={this.props.promptContext} embeddedInsideUserMessage={false} />
				{this.props.promptContext.chatVariables && Object.keys(this.props.promptContext.chatVariables).length > 0 ? (
					<ChatVariablesAndQuery flexGrow={2} priority={900} chatVariables={this.props.promptContext.chatVariables} query={this.props.promptContext.query} embeddedInsideUserMessage={false} />
				) : (
					<UserMessage priority={900}>
						{this.props.promptContext.query}
					</UserMessage >
				)}
			</>
		);
	}
}

export interface NewNotebookCodeGenerationPromptProps extends BasePromptElementProps {
	history?: readonly Raw.ChatMessage[];
	description: string;
	section: INotebookSection;
	existingCode: string;
	languageId: string;
	uri: Uri;
}

export interface NewNotebookCodeGenerationPromptState {
}

export class NewNotebookCodeGenerationPrompt extends PromptElement<NewNotebookCodeGenerationPromptProps, NewNotebookCodeGenerationPromptState> {
	override async prepare(): Promise<NewNotebookPlanningPromptState> {
		return {};
	}
	override render(state: NewNotebookCodeGenerationPromptState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		return (
			<>
				<>
					{isNonEmptyArray(this.props.history) && <GenerateNotebookConversationHistory messages={this.props.history} />}
					<SystemMessage priority={1000}>
						You are an AI that writes Python code for a single section of a Jupyter notebook.<br />
						<CopilotIdentityRules />
						<LegacySafetyRules />
						<ResponseTranslationRules />
						<JupyterNotebookRules />
						When dealing with Jupyter Notebook, do not generate CELL INDEX in the code blocks in your answer, it is only used to help you understand the context.<br />

						Your output should be valid Python code with inline comments.<br />
						You should return the code directly without any explantion.<br />
						You should not print message to explain the code or purpose of the code.<br />
						You should return the code directly, without wrapping it inside \`\`\`.<br />

						Please make sure that the new code is syntactically valid Python code. It can be validated by running it in a Python interpreter.<br />
						For example, it should pass the validation through builtin module codeop \`codeop.compile_command(statement)\`.<br />
					</SystemMessage>
					<UserMessage priority={900}>
						Overall topic of the notebook: {this.props.description}<br />
						Title of the notebook section: {this.props.section.title}<br />
						Description of the notebok section: {this.props.section.content}<br />
						Given this information, write all the code for this section and this section only.<br />
						The request to generate the outline of the notebook is already completed.<br />
						Here is the request details for the outline generation:<br />
						<br />
						Code in the notebook so far:<br />
						<CodeBlock uri={this.props.uri} languageId={this.props.languageId} code={this.props.existingCode} />
						<br />
						Please make sure the new code you generate works fine with the code above.<br />
					</UserMessage>
				</>
			</>
		);
	}
}
interface GenerateNotebookConversationHistoryProps extends BasePromptElementProps {
	messages: readonly Raw.ChatMessage[];
}

class GenerateNotebookConversationHistory extends PromptElement<GenerateNotebookConversationHistoryProps> {
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const history: (UserMessage | AssistantMessage | SystemMessage)[] = [];

		for (const curr of this.props.messages) {
			switch (curr.role) {
				case Raw.ChatRole.User:
					history.push(<UserMessage priority={800}>{getTextPart(curr.content)}</UserMessage>);
					break;
				case Raw.ChatRole.Assistant:
					history.push(<AssistantMessage priority={800}>{getTextPart(curr.content)}</AssistantMessage>);
					break;
				case Raw.ChatRole.System:
					history.push(<SystemMessage priority={100}>{getTextPart(curr.content)}</SystemMessage>);
					break;
				default:
					break;
			}
		}

		return (<>{history}</>);
	}
}


export interface NewNotebookCodeImprovementPromptProps extends BasePromptElementProps {
	description: string;
	section: INotebookSection;
	existingCode: string;
	code: string;
	languageId: string;
	uri: Uri;
}

export interface NewNotebookCodeImprovementPromptState {
}

export class NewNotebookCodeImprovementPrompt extends PromptElement<NewNotebookCodeImprovementPromptProps, NewNotebookCodeImprovementPromptState> {
	override async prepare(): Promise<NewNotebookCodeImprovementPromptState> {
		return {};
	}
	override render(state: NewNotebookCodeImprovementPromptState, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		return (
			<>
				<>
					<SystemMessage priority={1000}>
						You are an AI that improves Python code with respect to readability and performance for a single section of a Jupyter notebook.<br />
						<CopilotIdentityRules />
						<LegacySafetyRules />
						<ResponseTranslationRules />
						You MUST return Python code as your answer.<br />
						DO NOT explain in inline comments for your the improvements.<br />
						You should not print messages to explain the code or purpose of the code.<br />
						Make sure the new code you generate works fine with the code above.<br />
						Make sure if a module is already imported in the code above, it can be used in the new code directly without importing it again. For the same reason, if a variable is defined above, it can be used in new code as well. <br />
						Make sure to return the code only - don't give an explanation of the improvements.<br />
					</SystemMessage>
					<UserMessage priority={900}>
						Overall topic of the notebook: {this.props.description}<br />
						Title of the notebook section: {this.props.section.title}<br />
						Description of the notebook section: {this.props.section.content}<br />
						Code in the notebook so far:<br />
						<br />
						<CodeBlock uri={this.props.uri} languageId={this.props.languageId} code={this.props.existingCode} />
						<br />
						Given this information, suggest improvements for the following code:<br />
						<br />
						{this.props.code}<br />
						<br />
					</UserMessage>
				</>
			</>
		);
	}
}
