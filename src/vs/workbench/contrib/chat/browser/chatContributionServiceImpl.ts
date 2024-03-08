/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { localize, localize2 } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { getHistoryAction, getOpenChatEditorAction } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { getNewChatAction } from 'vs/workbench/contrib/chat/browser/actions/chatClearActions';
import { getMoveToEditorAction, getMoveToNewWindowAction } from 'vs/workbench/contrib/chat/browser/actions/chatMoveActions';
import { getQuickChatActionForProvider } from 'vs/workbench/contrib/chat/browser/actions/chatQuickInputActions';
import { CHAT_SIDEBAR_PANEL_ID, ChatViewPane, IChatViewOptions } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { IChatContributionService, IChatParticipantContribution, IChatProviderContribution, IRawChatParticipantContribution, IRawChatProviderContribution } from 'vs/workbench/contrib/chat/common/chatContributionService';
import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';

const chatExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatProviderContribution[]>({
	extensionPoint: 'interactiveSession',
	jsonSchema: {
		description: localize('vscode.extension.contributes.interactiveSession', 'Contributes an Interactive Session provider'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { id: '', program: '', runtime: '' } }],
			required: ['id', 'label'],
			properties: {
				id: {
					description: localize('vscode.extension.contributes.interactiveSession.id', "Unique identifier for this Interactive Session provider."),
					type: 'string'
				},
				label: {
					description: localize('vscode.extension.contributes.interactiveSession.label', "Display name for this Interactive Session provider."),
					type: 'string'
				},
				icon: {
					description: localize('vscode.extension.contributes.interactiveSession.icon', "An icon for this Interactive Session provider."),
					type: 'string'
				},
				when: {
					description: localize('vscode.extension.contributes.interactiveSession.when', "A condition which must be true to enable this Interactive Session provider."),
					type: 'string'
				},
			}
		}
	},
	activationEventsGenerator: (contributions: IRawChatProviderContribution[], result: { push(item: string): void }) => {
		for (const contrib of contributions) {
			result.push(`onInteractiveSession:${contrib.id}`);
		}
	},
});

const chatParticipantExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatParticipantContribution[]>({
	extensionPoint: 'chatParticipants',
	jsonSchema: {
		description: localize('vscode.extension.contributes.chatParticipant', 'Contributes a Chat Participant'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { name: '', description: '' } }],
			required: ['name'],
			properties: {
				name: {
					description: localize('chatParticipantName', "Unique name for this Chat Participant."),
					type: 'string'
				},
				description: {
					description: localize('chatParticipantDescription', "A description of this Chat Participant, shown in the UI."),
					type: 'string'
				},
				isDefault: {
					markdownDescription: localize('chatParticipantIsDefaultDescription', "**Only** allowed for extensions that have the `defaultChatParticipant` proposal."),
					type: 'boolean',
				},
				commands: {
					markdownDescription: localize('chatCommandsDescription', "Commands available for this Chat Participant, which the user can invoke with a `/`."),
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
								description: localize('chatCommandDescription', "A description of this command."),
								type: 'string'
							},
							sampleRequest: {
								description: localize('chatCommandDescription', "A description of this command."),
								type: 'string'
							},
							isSticky: {
								description: localize('chatCommandDescription', "A description of this command."),
								type: 'boolean'
							},
						}
					}
				}
			}
		}
	},
	activationEventsGenerator: (contributions: IRawChatParticipantContribution[], result: { push(item: string): void }) => {
		for (const contrib of contributions) {
			result.push(`onChatParticipant:${contrib.name}`);
		}
	},
});

export class ChatExtensionPointHandler implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatExtensionPointHandler';

	private _viewContainer: ViewContainer;
	private _registrationDisposables = new Map<string, IDisposable>();

	constructor(
		@IChatContributionService readonly _chatContributionService: IChatContributionService
	) {
		this._viewContainer = this.registerViewContainer();
		this.handleAndRegisterChatExtensions();
	}

	private handleAndRegisterChatExtensions(): void {
		chatExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionDisposable = new DisposableStore();
				for (const providerDescriptor of extension.value) {
					this.registerChatProvider(providerDescriptor);
					this._chatContributionService.registerChatProvider(providerDescriptor);
				}
				this._registrationDisposables.set(extension.description.identifier.value, extensionDisposable);
			}

			for (const extension of delta.removed) {
				const registration = this._registrationDisposables.get(extension.description.identifier.value);
				if (registration) {
					registration.dispose();
					this._registrationDisposables.delete(extension.description.identifier.value);
				}

				for (const providerDescriptor of extension.value) {
					this._chatContributionService.deregisterChatProvider(providerDescriptor.id);
				}
			}
		});

		chatParticipantExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const providerDescriptor of extension.value) {
					this._chatContributionService.registerChatParticipant({ ...providerDescriptor, extensionId: extension.description.identifier });
				}
			}

			for (const extension of delta.removed) {
				for (const providerDescriptor of extension.value) {
					this._chatContributionService.deregisterChatParticipant({ ...providerDescriptor, extensionId: extension.description.identifier });
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

	private registerChatProvider(providerDescriptor: IRawChatProviderContribution): IDisposable {
		// Register View
		const viewId = this._chatContributionService.getViewIdForProvider(providerDescriptor.id);
		const viewDescriptor: IViewDescriptor[] = [{
			id: viewId,
			containerIcon: this._viewContainer.icon,
			containerTitle: this._viewContainer.title.value,
			name: { value: providerDescriptor.label, original: providerDescriptor.label },
			canToggleVisibility: false,
			canMoveView: true,
			ctorDescriptor: new SyncDescriptor(ChatViewPane, [<IChatViewOptions>{ providerId: providerDescriptor.id }]),
			when: ContextKeyExpr.deserialize(providerDescriptor.when)
		}];
		Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(viewDescriptor, this._viewContainer);

		// Per-provider actions

		// Actions in view title
		const disposables = new DisposableStore();
		disposables.add(registerAction2(getHistoryAction(viewId, providerDescriptor.id)));
		disposables.add(registerAction2(getNewChatAction(viewId, providerDescriptor.id)));
		disposables.add(registerAction2(getMoveToEditorAction(viewId, providerDescriptor.id)));
		disposables.add(registerAction2(getMoveToNewWindowAction(viewId, providerDescriptor.id)));

		// "Open Chat" Actions
		disposables.add(registerAction2(getOpenChatEditorAction(providerDescriptor.id, providerDescriptor.label, providerDescriptor.when)));
		disposables.add(registerAction2(getQuickChatActionForProvider(providerDescriptor.id, providerDescriptor.label)));

		return {
			dispose: () => {
				Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).deregisterViews(viewDescriptor, this._viewContainer);
				Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).deregisterViewContainer(this._viewContainer);
				disposables.dispose();
			}
		};
	}
}

registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);

function getParticipantKey(participant: IChatParticipantContribution): string {
	return `${participant.extensionId.value}_${participant.name}`;
}

export class ChatContributionService implements IChatContributionService {
	declare _serviceBrand: undefined;

	private _registeredProviders = new Map<string, IChatProviderContribution>();
	private _registeredParticipants = new Map<string, IChatParticipantContribution>();

	constructor(
	) { }

	public getViewIdForProvider(providerId: string): string {
		return ChatViewPane.ID + '.' + providerId;
	}

	public registerChatProvider(provider: IChatProviderContribution): void {
		this._registeredProviders.set(provider.id, provider);
	}

	public deregisterChatProvider(providerId: string): void {
		this._registeredProviders.delete(providerId);
	}

	public registerChatParticipant(participant: IChatParticipantContribution): void {
		this._registeredParticipants.set(getParticipantKey(participant), participant);
	}

	public deregisterChatParticipant(participant: IChatParticipantContribution): void {
		this._registeredParticipants.delete(getParticipantKey(participant));
	}

	public get registeredProviders(): IChatProviderContribution[] {
		return Array.from(this._registeredProviders.values());
	}

	public get registeredParticipants(): IChatParticipantContribution[] {
		return Array.from(this._registeredParticipants.values());
	}
}
