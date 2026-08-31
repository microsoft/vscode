/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { CompletionItem, CompletionItemKind } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IChatInputCompletionItem, IChatSessionsService, isAgentHostTarget } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { AgentHostInputCompletionsBase } from '../../../../workbench/contrib/chat/browser/widget/input/editor/agentHostInputCompletionsBase.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class AutomationInputCompletions extends AgentHostInputCompletionsBase<void, string> {

	private readonly registration = this._register(new MutableDisposable());

	constructor(
		private readonly editor: ICodeEditor,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super(languageFeaturesService, chatSessionsService);

		let currentScheme: string | undefined;
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.automationSession.read(reader);
			const scheme = session ? getChatSessionType(session.resource) : undefined;
			if (scheme === currentScheme) {
				return;
			}
			currentScheme = scheme;
			this.registration.clear();
			if (scheme && isAgentHostTarget(scheme)) {
				void this.registerForScheme(scheme);
			}
		}));
	}

	private async registerForScheme(scheme: string): Promise<void> {
		const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
		if (!triggerCharacters?.length) {
			return;
		}

		const session = this.sessionsManagementService.automationSession.get();
		const editorUri = this.editor.getModel()?.uri;
		if (!session || getChatSessionType(session.resource) !== scheme || !editorUri) {
			return;
		}

		this.registration.value = this._registerProvider(
			{ scheme: editorUri.scheme, hasAccessToAllModels: true },
			`automationInputCompletions[${scheme}]`,
			triggerCharacters,
			scheme,
		);
	}

	protected override _resolveContext(model: ITextModel, scheme: string): { sessionResource: URI; context: void } | undefined {
		const session = this.sessionsManagementService.automationSession.get();
		if (model !== this.editor.getModel() || !session || getChatSessionType(session.resource) !== scheme) {
			return undefined;
		}
		return { sessionResource: session.resource, context: undefined };
	}

	protected override _buildItem(position: Position, item: IChatInputCompletionItem): CompletionItem | undefined {
		if (item.attachment.kind !== 'skill' && !(item.attachment.kind === 'command' && item.attachment.isSkill)) {
			return undefined;
		}
		return {
			label: { label: item.label ?? item.insertText, description: item.attachment.description },
			insertText: item.insertText,
			filterText: item.insertText,
			range: AutomationInputCompletions.computeRange(position, item),
			documentation: item.attachment.description,
			kind: CompletionItemKind.Text,
		};
	}
}
