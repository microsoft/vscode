/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { CompletionItem, CompletionItemKind } from '../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { getCompletionAction } from '../../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { Registry } from '../../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../../../../common/contributions.js';
import { LifecyclePhase } from '../../../../../../services/lifecycle/common/lifecycle.js';
import { IChatInputCompletionItem, IChatSessionsService, isAgentHostTarget } from '../../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { CHAT_QUESTION_ANSWER_SCHEME, getChatQuestionAnswerSessionResource } from '../../chatContentParts/chatQuestionAnswerEditor.js';
import { AgentHostInputCompletionsBase } from './agentHostInputCompletionsBase.js';

/**
 * Delegates completions in chat question carousel answer editors to the agent host
 * of the session the question belongs to. Answers are plain text, so accepted
 * completions only insert text and never add references or attachments.
 */
export class AgentHostQuestionAnswerCompletions extends AgentHostInputCompletionsBase<void, string> {

	/** Per-scheme registrations of the Monaco completion provider. */
	private readonly _registrations = this._register(new DisposableMap<string>());

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
	) {
		super(languageFeaturesService, chatSessionsService);

		for (const scheme of this._chatSessionsService.getContentProviderSchemes()) {
			void this._registerForScheme(scheme);
		}
		this._register(this._chatSessionsService.onDidChangeContentProviderSchemes(({ added, removed }) => {
			for (const scheme of removed) {
				this._registrations.deleteAndDispose(scheme);
			}
			for (const scheme of added) {
				void this._registerForScheme(scheme);
			}
		}));
	}

	private async _registerForScheme(scheme: string): Promise<void> {
		if (!isAgentHostTarget(scheme)) {
			return;
		}
		const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
		if (!triggerCharacters || triggerCharacters.length === 0) {
			return;
		}

		// The provider may have been removed while awaiting the trigger characters.
		if (!this._chatSessionsService.getContentProviderSchemes().includes(scheme)) {
			return;
		}

		this._registrations.set(scheme, this._registerProvider(
			{ scheme: CHAT_QUESTION_ANSWER_SCHEME, hasAccessToAllModels: true },
			`agentHostQuestionAnswerCompletions[${scheme}]`,
			triggerCharacters,
			scheme,
		));
	}

	protected override _resolveContext(model: ITextModel, scheme: string): { sessionResource: URI; context: void } | undefined {
		const sessionResource = getChatQuestionAnswerSessionResource(model.uri);
		// Only respond when the session is handled by the content provider that
		// registered this Monaco provider, to avoid duplicate suggestions.
		if (!sessionResource || getChatSessionType(sessionResource) !== scheme) {
			return undefined;
		}
		return { sessionResource, context: undefined };
	}

	protected override _buildItem(position: Position, item: IChatInputCompletionItem): CompletionItem | undefined {
		const attachment = item.attachment;
		if (attachment.kind === 'command' && getCompletionAction(attachment._meta)) {
			return undefined;
		}
		if (attachment.kind === 'resource') {
			return {
				label: { label: attachment.displayName ?? item.insertText, description: attachment.uri.path },
				insertText: item.insertText,
				filterText: item.insertText,
				range: AgentHostQuestionAnswerCompletions.computeRange(position, item),
				kind: attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
			};
		}
		return AgentHostQuestionAnswerCompletions.buildTextCompletionItem(position, item);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentHostQuestionAnswerCompletions, LifecyclePhase.Eventually);
