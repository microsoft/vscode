/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IChatProgressMessage, IChatTask } from 'vs/workbench/contrib/chat/common/chatService';

export class ChatProgressContentPart extends Disposable {
	public readonly element: HTMLElement;

	constructor(
		progress: IChatProgressMessage | IChatTask,
		showSpinner: boolean,
		renderer: MarkdownRenderer,
	) {
		super();

		if (showSpinner) {
			// TODO@roblourens is this the right place for this?
			// this step is in progress, communicate it to SR users
			alert(progress.content.value);
		}
		const codicon = showSpinner ? ThemeIcon.modify(Codicon.loading, 'spin').id : Codicon.check.id;
		const markdown = new MarkdownString(`$(${codicon}) ${progress.content.value}`, {
			supportThemeIcons: true
		});
		const result = this._register(renderer.render(markdown));
		result.element.classList.add('progress-step');

		this.element = result.element;
	}
}
