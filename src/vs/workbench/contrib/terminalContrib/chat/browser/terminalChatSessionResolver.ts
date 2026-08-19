/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { withChatSurfaceMeta } from '../../../../../platform/agentHost/common/meta/agentChatSurfaceMeta.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatModelReference, IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../chat/common/constants.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../chat/common/chatSessionsService.js';

export const ITerminalChatSessionResolver = createDecorator<ITerminalChatSessionResolver>('terminalChatSessionResolver');

/** Result of resolving the chat model used by the terminal chat surface. */
export interface ITerminalChatSessionResolution {
	readonly modelRef: IChatModelReference;
	/**
	 * The chat session contribution the widget must lock to so requests carry
	 * `agentIdSilent` and reach the Agent Host agent instead of the default
	 * terminal participant. `undefined` for a local fallback session, which
	 * must stay on the legacy extension-host agent.
	 */
	readonly lockToAgent: ResolvedChatSessionsExtensionPoint | undefined;
}

/** Resolves the chat model reference used by the terminal chat surface. */
export interface ITerminalChatSessionResolver {
	readonly _serviceBrand: undefined;
	resolve(token: CancellationToken, shellType: string | undefined, os: OperatingSystem): Promise<ITerminalChatSessionResolution | undefined>;
}

/** Builds the Agent Host metadata for a terminal chat session. */
export function getTerminalChatSessionMeta(shellType: string | undefined, os: OperatingSystem): Record<string, unknown> {
	return withChatSurfaceMeta(undefined, {
		surface: 'terminal',
		shellType,
		osName: getOperatingSystemName(os),
	})!;
}

function getOperatingSystemName(os: OperatingSystem): string {
	switch (os) {
		case OperatingSystem.Windows:
			return 'Windows';
		case OperatingSystem.Macintosh:
			return 'macOS';
		case OperatingSystem.Linux:
			return 'Linux';
	}
}

/** Applies terminal-specific Agent Host and local-session fallback policy. */
export class TerminalChatSessionResolver implements ITerminalChatSessionResolver {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IChatService private readonly _chatService: IChatService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	async resolve(token: CancellationToken, shellType: string | undefined, os: OperatingSystem): Promise<ITerminalChatSessionResolution | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const meta = getTerminalChatSessionMeta(shellType, os);
		let modelRef: IChatModelReference | undefined;
		const agentHostEnabled = this._configurationService.getValue<boolean>(ChatConfiguration.TerminalAgentHostEnabled) === true;
		const contribution = agentHostEnabled ? this._chatSessionsService.getChatSessionContribution(SessionType.AgentHostCopilot) : undefined;
		if (contribution?.locations?.includes(ChatAgentLocation.Terminal)) {
			try {
				const item = await this._chatSessionsService.createNewChatSessionItem(SessionType.AgentHostCopilot, {
					prompt: '',
					isEphemeral: true,
					_meta: meta,
				}, token);
				modelRef = item && await this._chatService.acquireOrLoadSession(item.resource, ChatAgentLocation.Terminal, token, 'TerminalChatSessionResolver#resolve');
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

		modelRef = this._chatService.startNewLocalSession(ChatAgentLocation.Terminal);
		if (token.isCancellationRequested) {
			modelRef.dispose();
			return undefined;
		}
		return { modelRef, lockToAgent: undefined };
	}
}
