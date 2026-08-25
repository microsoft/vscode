/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { withChatSurfaceMeta } from '../../../../platform/agentHost/common/meta/agentChatSurfaceMeta.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatModelReference, IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../chat/common/constants.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../chat/common/chatSessionsService.js';

export const IInlineChatSessionResolver = createDecorator<IInlineChatSessionResolver>('inlineChatSessionResolver');

/** Result of resolving the chat model used by the editor inline chat surface. */
export interface IInlineChatSessionResolution {
	readonly modelRef: IChatModelReference;
	/**
	 * The chat session contribution the widget must lock to so requests carry
	 * `agentIdSilent` and reach the Agent Host agent instead of the default inline
	 * participant. `undefined` for a local fallback session, which must stay on the
	 * legacy extension-host agent.
	 */
	readonly lockToAgent: ResolvedChatSessionsExtensionPoint | undefined;
}

/** Resolves the chat model reference used by the editor inline chat surface. */
export interface IInlineChatSessionResolver {
	readonly _serviceBrand: undefined;
	resolve(token: CancellationToken, languageId: string | undefined, targetUri: URI): Promise<IInlineChatSessionResolution | undefined>;
}

/** Builds the Agent Host metadata for an editor inline chat session. */
export function getInlineChatSessionMeta(languageId: string | undefined, targetUri: URI): Record<string, unknown> {
	return withChatSurfaceMeta(undefined, { surface: 'editorInline', languageId, targetUri: targetUri.toString() })!;
}

/** Applies editor inline chat-specific Agent Host and local-session fallback policy. */
export class InlineChatSessionResolver implements IInlineChatSessionResolver {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	async resolve(token: CancellationToken, languageId: string | undefined, targetUri: URI): Promise<IInlineChatSessionResolution | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const meta = getInlineChatSessionMeta(languageId, targetUri);
		let modelRef: IChatModelReference | undefined;
		const agentHostEnabled = this._configurationService.getValue<boolean>(ChatConfiguration.InlineChatAgentHostEnabled) === true;
		const contribution = agentHostEnabled ? this._chatSessionsService.getChatSessionContribution(SessionType.AgentHostCopilot) : undefined;
		if (contribution?.locations?.includes(ChatAgentLocation.EditorInline)) {
			try {
				const item = await this._chatSessionsService.createNewChatSessionItem(SessionType.AgentHostCopilot, {
					prompt: '',
					isEphemeral: true,
					_meta: meta,
				}, token);
				modelRef = item && await this._chatService.acquireOrLoadSession(item.resource, ChatAgentLocation.EditorInline, token, 'InlineChatSessionResolver#resolve');
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					throw error;
				}
				onUnexpectedError(error);
			}
		}

		if (token.isCancellationRequested) {
			modelRef?.dispose();
			return undefined;
		}

		if (modelRef) {
			return { modelRef, lockToAgent: contribution };
		}

		modelRef = this._chatService.startNewLocalSession(ChatAgentLocation.EditorInline, { canUseTools: false /* SEE https://github.com/microsoft/vscode/issues/279946 */ });
		if (token.isCancellationRequested) {
			modelRef.dispose();
			return undefined;
		}
		return { modelRef, lockToAgent: undefined };
	}
}
