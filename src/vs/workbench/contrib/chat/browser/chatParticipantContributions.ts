/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { localize, localize2 } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { CHAT_VIEW_ID } from 'vs/workbench/contrib/chat/browser/chat';
import { CHAT_SIDEBAR_PANEL_ID, ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { ChatAgentLocation, IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IRawChatParticipantContribution } from 'vs/workbench/contrib/chat/common/chatParticipantContribTypes';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';

const chatParticipantExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatParticipantContribution[]>({
	extensionPoint: 'chatParticipants',
	jsonSchema: {
		description: localize('vscode.extension.contributes.chatParticipant', 'Contributes a chat participant'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { name: '', description: '' } }],
			required: ['name', 'id'],
			properties: {
				id: {
					description: localize('chatParticipantId', "A unique id for this chat participant."),
					type: 'string'
				},
				name: {
					description: localize('chatParticipantName', "User-facing name for this chat participant. The user will use '@' with this name to invoke the participant. Name must not contain whitespace."),
					type: 'string',
					pattern: '^[\\w0-9_-]+$'
				},
				fullName: {
					markdownDescription: localize('chatParticipantFullName', "The full name of this chat participant, which is shown as the label for responses coming from this participant. If not provided, {0} is used.", '`name`'),
					type: 'string'
				},
				description: {
					description: localize('chatParticipantDescription', "A description of this chat participant, shown in the UI."),
					type: 'string'
				},
				isSticky: {
					description: localize('chatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
					type: 'boolean'
				},
				sampleRequest: {
					description: localize('chatSampleRequest', "When the user clicks this participant in `/help`, this text will be submitted to the participant."),
					type: 'string'
				},
				when: {
					description: localize('chatParticipantWhen', "A condition which must be true to enable this participant."),
					type: 'string'
				},
				commands: {
					markdownDescription: localize('chatCommandsDescription', "Commands available for this chat participant, which the user can invoke with a `/`."),
					type: 'array',
					items: {
						additionalProperties: false,
						type: 'object',
						defaultSnippets: [{ body: { name: '', description: '' } }],
						required: ['name'],
						properties: {
							name: {
								description: localize('chatCommand', "A short name by which this command is referred to in the UI, e.g. `fix` or * `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
								type: 'string'
							},
							description: {
								description: localize('chatCommandDescription', "A description of this command."),
								type: 'string'
							},
							when: {
								description: localize('chatCommandWhen', "A condition which must be true to enable this command."),
								type: 'string'
							},
							sampleRequest: {
								description: localize('chatCommandSampleRequest', "When the user clicks this command in `/help`, this text will be submitted to the participant."),
								type: 'string'
							},
							isSticky: {
								description: localize('chatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
								type: 'boolean'
							},
						}
					}
				},
			}
		}
	},
	activationEventsGenerator: (contributions: IRawChatParticipantContribution[], result: { push(item: string): void }) => {
		for (const contrib of contributions) {
			result.push(`onChatParticipant:${contrib.id}`);
		}
	},
});

export class ChatExtensionPointHandler implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatExtensionPointHandler';

	private _viewContainer: ViewContainer;
	private _participantRegistrationDisposables = new DisposableMap<string>();

	constructor(
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@ILogService private readonly logService: ILogService,
	) {
		this._viewContainer = this.registerViewContainer();
		this.handleAndRegisterChatExtensions();
	}

	private handleAndRegisterChatExtensions(): void {
		chatParticipantExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const providerDescriptor of extension.value) {
					if (!providerDescriptor.name.match(/^[\w0-9_-]+$/)) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with invalid name: ${providerDescriptor.name}. Name must match /^[\\w0-9_-]+$/.`);
						continue;
					}

					if (providerDescriptor.fullName && strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter(providerDescriptor.fullName)) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains ambiguous characters: ${providerDescriptor.fullName}.`);
						continue;
					}

					// Spaces are allowed but considered "invisible"
					if (providerDescriptor.fullName && strings.InvisibleCharacters.containsInvisibleCharacter(providerDescriptor.fullName.replace(/ /g, ''))) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains invisible characters: ${providerDescriptor.fullName}.`);
						continue;
					}

					if (providerDescriptor.isDefault && !isProposedApiEnabled(extension.description, 'defaultChatParticipant')) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: defaultChatParticipant.`);
						continue;
					}

					if ((providerDescriptor.defaultImplicitVariables || providerDescriptor.locations) && !isProposedApiEnabled(extension.description, 'chatParticipantAdditions')) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
						continue;
					}

					if (!providerDescriptor.id || !providerDescriptor.name) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant without both id and name.`);
						continue;
					}

					const store = new DisposableStore();
					if (providerDescriptor.isDefault && (!providerDescriptor.locations || providerDescriptor.locations?.includes(ChatAgentLocation.Panel))) {
						store.add(this.registerDefaultParticipantView(providerDescriptor));
					}

					store.add(this._chatAgentService.registerAgent(
						providerDescriptor.id,
						{
							extensionId: extension.description.identifier,
							publisherDisplayName: extension.description.publisherDisplayName ?? extension.description.publisher, // May not be present in OSS
							extensionPublisherId: extension.description.publisher,
							extensionDisplayName: extension.description.displayName ?? extension.description.name,
							id: providerDescriptor.id,
							description: providerDescriptor.description,
							when: providerDescriptor.when,
							metadata: {
								isSticky: providerDescriptor.isSticky,
								sampleRequest: providerDescriptor.sampleRequest,
							},
							name: providerDescriptor.name,
							fullName: providerDescriptor.fullName,
							isDefault: providerDescriptor.isDefault,
							locations: isNonEmptyArray(providerDescriptor.locations) ?
								providerDescriptor.locations.map(ChatAgentLocation.fromRaw) :
								[ChatAgentLocation.Panel],
							slashCommands: providerDescriptor.commands ?? []
						} satisfies IChatAgentData));

					this._participantRegistrationDisposables.set(
						getParticipantKey(extension.description.identifier, providerDescriptor.id),
						store
					);
				}
			}

			for (const extension of delta.removed) {
				for (const providerDescriptor of extension.value) {
					this._participantRegistrationDisposables.deleteAndDispose(getParticipantKey(extension.description.identifier, providerDescriptor.name));
				}
			}
		});
	}

	private registerViewContainer(): ViewContainer {
		// Register View Container
		const title = localize2('chat.viewContainer.label', "Chat");
		const icon = Codicon.commentDiscussion;
		const viewContainerId = CHAT_SIDEBAR_PANEL_ID;
		const viewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
			id: viewContainerId,
			title,
			icon,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [viewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: viewContainerId,
			hideIfEmpty: true,
			order: 100,
		}, ViewContainerLocation.Sidebar);

		return viewContainer;
	}

	private hasRegisteredDefaultParticipantView = false;
	private registerDefaultParticipantView(defaultParticipantDescriptor: IRawChatParticipantContribution): IDisposable {
		if (this.hasRegisteredDefaultParticipantView) {
			this.logService.warn(`Tried to register a second default chat participant view for "${defaultParticipantDescriptor.id}"`);
			return Disposable.None;
		}

		// Register View
		const name = defaultParticipantDescriptor.fullName ?? defaultParticipantDescriptor.name;
		const viewDescriptor: IViewDescriptor[] = [{
			id: CHAT_VIEW_ID,
			containerIcon: this._viewContainer.icon,
			containerTitle: this._viewContainer.title.value,
			singleViewPaneContainerTitle: this._viewContainer.title.value,
			name: { value: name, original: name },
			canToggleVisibility: false,
			canMoveView: true,
			ctorDescriptor: new SyncDescriptor(ChatViewPane),
		}];
		this.hasRegisteredDefaultParticipantView = true;
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(viewDescriptor, this._viewContainer);

		return toDisposable(() => {
			this.hasRegisteredDefaultParticipantView = false;
			Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).deregisterViews(viewDescriptor, this._viewContainer);
		});
	}
}

function getParticipantKey(extensionId: ExtensionIdentifier, participantName: string): string {
	return `${extensionId.value}_${participantName}`;
}
