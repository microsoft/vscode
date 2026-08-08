/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { IPromptPathRepresentationService } from '../../../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';

export class WorkspaceFoldersHint extends PromptElement {
	constructor(
		props: BasePromptElementProps,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	public override render(state: void, sizing: PromptSizing) {
		const workspaceFolders = this._workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 1) {
			return <>The user has the following folder open: {this._promptPathRepresentationService.getFilePath(workspaceFolders[0])}.</>;
		} else if (workspaceFolders.length > 0) {
			return <>The user has the following folders open: {workspaceFolders.map(folder => this._promptPathRepresentationService.getFilePath(folder)).join(', ')}.</>;
		}
	}
}
