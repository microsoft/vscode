/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableFromPromise } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IChatSessionsService, SessionType } from '../../../../chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../chat/common/constants.js';
import { IChatAgentService } from '../../../../chat/common/participants/chatAgents.js';
import { CloudAutomationStore } from './cloudAutomationStore.js';
import { CloudAutomationTaskConversations } from './cloudAutomationTaskConversations.js';

/** Provides existing run conversations only in windows without an extension declaring the Cloud session type. */
export class CloudAutomationTaskRegistration extends Disposable {
	private controller: CloudAutomationTaskConversations | undefined;
	private readonly extensionOwnsCloud: IObservable<boolean>;
	private readonly cloudEnabled: IObservable<boolean>;
	private readonly extensionsReady: Promise<boolean>;

	constructor(
		automations: CloudAutomationStore,
		@IExtensionService extensions: IExtensionService,
		@IConfigurationService configuration: IConfigurationService,
		@IChatSessionsService sessions: IChatSessionsService,
		@IChatAgentService agents: IChatAgentService,
		@ILogService log: ILogService,
	) {
		super();
		const type = SessionType.CopilotCloud;
		this.extensionsReady = extensions.whenInstalledExtensionsRegistered();
		const ready = observableFromPromise(this.extensionsReady);
		this.extensionOwnsCloud = observableFromEvent(this, extensions.onDidChangeExtensions, () => extensions.extensions.some(extension =>
			extension.contributes?.chatSessions?.some(entry => entry.type === type || entry.alternativeIds?.includes(type))));
		this.cloudEnabled = observableConfigValue('github.copilot.chat.cloudAgent.enabled', true, configuration);
		const access = derived(this, reader => ready.read(reader).value && !this.extensionOwnsCloud.read(reader) && this.cloudEnabled.read(reader)
			? automations.taskAccess.read(reader) : undefined);
		this._register(autorun(reader => {
			const current = access.read(reader);
			if (!current || sessions.getChatSessionContribution(type) || agents.getAgent(type, true)) {
				return;
			}
			const controller = reader.store.add(new CloudAutomationTaskConversations(current, log));
			this.controller = controller;
			reader.store.add(toDisposable(() => this.controller = undefined));
			const displayName = localize('cloudAutomationTask.agent', "Cloud");
			const description = localize('cloudAutomationTask.description', "Continue an existing GitHub cloud automation run.");
			reader.store.add(sessions.registerChatSessionContribution({
				type, name: 'cloud', displayName, description, hideFromSessionTypePicker: true, supportsDelegation: false, requiresCopilotSignIn: true,
			}));
			reader.store.add(sessions.registerChatSessionContentProvider(type, controller));
			reader.store.add(sessions.registerChatSessionItemController(type, controller));
			reader.store.add(agents.registerDynamicAgent({
				id: type, name: 'cloud', fullName: displayName, description, extensionId: new ExtensionIdentifier('vscode.cloud-automations'),
				extensionDisplayName: displayName, extensionVersion: undefined, extensionPublisherId: 'vscode', isCore: true,
				locations: [ChatAgentLocation.Chat], modes: [ChatModeKind.Agent], metadata: { themeIcon: Codicon.cloud }, slashCommands: [], disambiguation: [],
			}, {
				invoke: async (request, progress, history, token) => {
					if (this.controller !== controller || !controller.hasOpened(request.sessionResource)) {
						throw new Error(localize('cloudAutomationTask.existingOnly', "Open an existing cloud automation run to reply."));
					}
					const session = await sessions.getOrCreateChatSession(request.sessionResource, token);
					if (this.controller !== controller || !session.requestHandler) {
						throw new Error(localize('cloudAutomationTask.unavailable', "The automation run is no longer available."));
					}
					await session.requestHandler(request, progress, history, token);
					return {};
				},
			}));
		}));
	}

	/** Undefined delegates to the extension; false never falls back to activation or to creating a chat. */
	async resolve(resource: URI): Promise<boolean | undefined> {
		await this.extensionsReady;
		if (!this.cloudEnabled.get()) {
			return false;
		}
		if (this.extensionOwnsCloud.get()) {
			return undefined;
		}
		return !!await this.controller?.resolveChatSessionItem(resource, CancellationToken.None);
	}
}
