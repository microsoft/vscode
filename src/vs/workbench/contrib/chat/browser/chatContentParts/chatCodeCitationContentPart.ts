/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { getCodeCitationsMessage } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatCodeCitations, IChatRendererContent } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

type ChatCodeCitationOpenedClassification = {
	owner: 'roblourens';
	comment: 'Indicates when a user opens chat code citations';
};

export class ChatCodeCitationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		citations: IChatCodeCitations,
		context: IChatContentPartRenderContext,
		@IEditorService private readonly editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		const label = getCodeCitationsMessage(citations.citations);
		const elements = dom.h('.chat-code-citation-message@root', [
			dom.h('span.chat-code-citation-label@label'),
			dom.h('.chat-code-citation-button-container@button'),
		]);
		elements.label.textContent = label + ' - ';
		const button = this._register(new Button(elements.button, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		}));
		button.label = localize('viewMatches', "View matches");
		this._register(button.onDidClick(() => {
			const citationText = `# Code Citations\n\n` + citations.citations.map(c => `## License: ${c.license}\n${c.value.toString()}\n\n\`\`\`\n${c.snippet}\n\`\`\`\n\n`).join('\n');
			this.editorService.openEditor({ resource: undefined, contents: citationText, languageId: 'markdown' });
			this.telemetryService.publicLog2<{}, ChatCodeCitationOpenedClassification>('openedChatCodeCitations');
		}));
		this.domNode = elements.root;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'codeCitations';
	}
}
