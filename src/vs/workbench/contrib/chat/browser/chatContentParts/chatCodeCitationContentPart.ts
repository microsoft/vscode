/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { IChatCodeCitations, IChatRendererContent } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class ChatCodeCitationContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		citations: IChatCodeCitations,
		context: IChatContentPartRenderContext,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();

		const label = citations.citations.length > 1 ?
			localize('codeCitationsPlural', "This code matches {0} references in public repositories", citations.citations.length) :
			localize('codeCitation', "This code matches 1 reference in a public repository", citations.citations.length);
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
		button.label = localize('viewReferences', "View references");
		this._register(button.onDidClick(() => {
			const citationText = citations.citations.map(c => `# [${c.license}]\n${c.value.toString()}\n\n\`\`\`\n${c.snippet}\n\`\`\`\n\n`).join('\n');
			this.editorService.openEditor({ resource: URI.from({ scheme: Schemas.untitled, path: 'Code references' }), contents: citationText, languageId: 'markdown' });
		}));
		this.domNode = elements.root;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'codeCitations';
	}
}
