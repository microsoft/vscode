/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import { IPromptWorkspaceLabels } from '../../../context/node/resolvers/promptWorkspaceLabels';
import { EmbeddedInsideUserMessage, embeddedInsideUserMessageDefault } from '../base/promptElement';
import { Tag } from '../base/tag';

export interface ProjectLabelsProps extends BasePromptElementProps, EmbeddedInsideUserMessage {
}

export class ProjectLabels extends PromptElement<ProjectLabelsProps, void> {

	constructor(
		props: ProjectLabelsProps,
		@IPromptWorkspaceLabels private readonly workspaceLabels: IPromptWorkspaceLabels,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		await this.workspaceLabels.collectContext();
		const labels = this.workspaceLabels.labels;
		if (labels.length === 0) {
			return undefined;
		}

		if (this.props.embeddedInsideUserMessage ?? embeddedInsideUserMessageDefault) {
			return (
				<Tag name='projectLabels' priority={this.props.priority}>
					{this._render(labels)}
				</Tag>
			);
		}

		return (
			<UserMessage priority={this.props.priority}>
				{this._render(labels)}
			</UserMessage >
		);
	}

	private _render(labels: string[]) {
		return (
			<>
				I am working on a project of the following nature:<br />
				{labels.reduce((prev, curr) => `${prev}\n- ${curr}`, '').trim()}
			</>
		);
	}
}
