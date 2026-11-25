/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { LegacySafetyRules } from '../base/safetyRules';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { EditorIntegrationRules } from './editorIntegrationRules';

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

export interface NewNotebookCodeGenerationPromptState {
}
