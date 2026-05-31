/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { INotebookSummaryTracker } from '../../../../platform/notebook/common/notebookSummaryTracker';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { ToolName } from '../../../tools/common/toolNames';


export class NotebookSummaryChange extends PromptElement {
	constructor(
		props: any,
		@IPromptPathRepresentationService protected readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@INotebookSummaryTracker private readonly notebookStateTracker: INotebookSummaryTracker,
	) {
		super(props);
	}

	public override render(_state: void, _sizing: PromptSizing) {
		const changedNotebooks = this.notebookStateTracker.listNotebooksWithChanges();
		if (!changedNotebooks.length) {
			return <></>;
		}
		changedNotebooks.forEach(nb => this.notebookStateTracker.clearState(nb));
		return (<>
			The user has potentially added/removed/reordered or executed some of the cells of the following notebooks between the last request and now.<br />
			Ignore previous summary of all these notebooks returned by the tool {ToolName.GetNotebookSummary}.<br />
			{changedNotebooks.map(nb => <>- {this.promptPathRepresentationService.getFilePath(nb.uri)}.<br /></>)}
			So be sure to use the {ToolName.GetNotebookSummary} to get the latest summary of the above notebooks.<br />
		</>);
	}
}
