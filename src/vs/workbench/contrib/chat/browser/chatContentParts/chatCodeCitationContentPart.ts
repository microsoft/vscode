/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatTreeItem } from '../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { getCodeCitationsMessage } from '../../common/chatModel.js';
import { IChatCodeCitations, IChatRendererContent } from '../../common/chatViewModel.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

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
