/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement } from '@vscode/prompt-tsx';
import { ITodoListContextProvider } from '../../prompt/node/todoListContextProvider';
import { Tag } from '../../prompts/node/base/tag';

export interface TodoListContextPromptProps extends BasePromptElementProps {
	sessionResource?: string;
}

/**
 * A wrapper prompt element that provides todo list context
 */
export class TodoListContextPrompt extends PromptElement<TodoListContextPromptProps> {
	constructor(
		props: any,
		@ITodoListContextProvider private readonly todoListContextProvider: ITodoListContextProvider,
	) {
		super(props);
	}

	async render() {
		const sessionResource = this.props.sessionResource;
		if (!sessionResource) {
			return null;
		}
		const todoContext = await this.todoListContextProvider.getCurrentTodoContext(sessionResource);
		if (!todoContext) {
			return null;
		}
		return (
			<Tag name='todoList'>
				{todoContext}
			</Tag>
		);
	}
}
