/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssistantMessage, BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, Raw, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { getTextPart } from '../../../../../platform/chat/common/globalStringUtils';
import { CopilotIdentityRules } from '../../base/copilotIdentity';
import { ResponseTranslationRules } from '../../base/responseTranslationRules';
import { SafetyRules } from '../../base/safetyRules';

export interface NewWorkspaceContentsPromptProps extends BasePromptElementProps {
	query: string;
	fileTreeStr: string;
	history?: Raw.ChatMessage[];
	filePath?: string;
	projectSpecification?: string;
	relavantFiles?: Map<string, string>;
}

export class FileContentsPrompt extends PromptElement<NewWorkspaceContentsPromptProps> {

	override render(): PromptPiece<any, any> | undefined {
		return (
			<>
				{this.props.history && <NewWorkspaceConversationHistory messages={this.props.history} />}
				<SystemMessage priority={1000}>
					You are a VS Code assistant. Your job is to generate the contents of a file in a project when given the user description, specification and tree structure of the project that a user wants to create. <br />
					<br />
					Additional Rules<br />
					Think step by step and give me contents for just the file requested by the user. The code should not contain bugs.<br />
					If the user has asked for modifications to an existing file, please use the File path and File contents provided below if applicable.<br />
					If the file is supposed to be empty, please respond with a code comment saying that this file is intentionally left blank.<br />
					Do not include comments in json files.<br />
					Do not use code blocks or backticks.<br />
					Do not include product names such as Visual Studio in the comments.<br />
				</SystemMessage>
				{this.props.relavantFiles && this.props.relavantFiles.size > 0 && <><UserMessage priority={500}>
					Below, you will find a list of file paths and their contents previously used<br />
					{Array.from(this.props.relavantFiles).map(([key, value]) => {
						return `File path: ${key}\nFile contents: ${value}\n`;
					}).join('\n')}
				</UserMessage></>}
				<UserMessage priority={900}>
					Generate the contents of the file: {this.props.filePath} <br />
					This is the project tree structure:<br />
					\`\`\`filetree' <br />
					{this.props.fileTreeStr}<br />
					\`\`\`<br />
					The project should adhere to the following specification:<br />
					{this.props.projectSpecification}<br />
				</UserMessage >
			</>
		);
	}
}

export class ProjectSpecificationPrompt extends PromptElement<NewWorkspaceContentsPromptProps> {

	override render(): PromptPiece<any, any> | undefined {
		return (
			<>
				{this.props.history && <NewWorkspaceConversationHistory messages={this.props.history} />}
				<SystemMessage priority={1000}>
					You are a VS Code assistant. Your job is to generate the project specification when given the user description and file tree structure of the project that a user wants to create. <br />
					<CopilotIdentityRules />
					<SafetyRules />
					<ResponseTranslationRules />
					<br />
					Additional Rules<br />
					Think step by step and respond with a text description that lists and summarizes each file inside this project.<br />
					List the classes, types, interfaces, functions, and constants it exports and imports if it is a code file.<br />
					Consider filenames and file extensions when determining the programming languages used in the project.
					List any special configurations or settings required for configuration files such as package.json or tsconfig.json to help compile the project successfully<br />
					You should be as specific as possible when listing the public properties and methods for each exported class.<br />
					Do not use code blocks or backticks. Do not include any text before or after the file contents.<br />
					Do not include comments in json files.<br />
					Do not use code blocks or backticks.<br />
					Do not include product names such as Visual Studio in the comments.<br />
					Below you will find a set of examples of what you should respond with. Please follow these examples as closely as possible.<br />
					<br />
					## Valid question<br />
					User: I want to set up the following project: Create a TypeScript Express app<br />
					This is the project tree structure:<br />
					\`\`\`markdown <br />
					my-express-app<br />
					├── src<br />
					│   ├── app.ts<br />
					│   ├── controllers<br />
					│   │   └── index.ts<br />
					│   ├── routes<br />
					│   │   └── index.ts<br />
					│   └── types<br />
					│       └── index.ts<br />
					├── package.json<br />
					├── tsconfig.json<br />
					└── README.md<br />
					\`\`\`<br />
					## Valid response<br />
					Assistant: The project has the following files:<br />
					\`src/app.ts\`: This file is the entry point of the application. It creates an instance of the express app and sets up middleware and routes.<br />
					\`src/controllers/index.ts\`: This file exports a class \`IndexController\` which has a method \`getIndex\` that handles the root route of the application.<br />
					\`src/routes/index.ts\`: This file exports a function \`setRoutes\` which sets up the routes for the application. It uses the \`IndexController\` to handle the root route.<br />
					\`src/types/index.ts\`: This file exports interfaces \`Request\` and \`Response\` which extend the interfaces from the \`express\` library.<br />
					\`tsconfig.json\`: This file is the configuration file for TypeScript. It specifies the compiler options and the files to include in the compilation.<br />
					\`package.json\`: This file is the configuration file for npm. It lists the dependencies and scripts for the project.<br />
					\`README.md\`: This file contains the documentation for the project.<br />
				</SystemMessage>
				<UserMessage priority={900}>
					I want to set up the following project: {this.props.query}<br />
					This is the project tree structure:<br />
					\`\`\`markdown' <br />
					{this.props.fileTreeStr}<br />
					\`\`\`<br />
				</UserMessage >
			</>
		);
	}
}

interface NewWorkspaceConversationHistoryProps extends BasePromptElementProps {
	messages: Raw.ChatMessage[];
}

class NewWorkspaceConversationHistory extends PromptElement<NewWorkspaceConversationHistoryProps> {
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const history: (UserMessage | AssistantMessage | SystemMessage)[] = [];

		for (const curr of this.props.messages) {
			switch (curr.role) {
				case Raw.ChatRole.User:
					history.push(<UserMessage priority={600}>{getTextPart(curr.content)}</UserMessage>);
					break;
				case Raw.ChatRole.System:
					history.push(<AssistantMessage priority={800}>{getTextPart(curr.content)}</AssistantMessage>);
					break;
				default:
					break;
			}
		}
		return (<>{history}</>);
	}
}
