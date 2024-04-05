/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableMap, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { localize, localize2 } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { getHistoryAction, getOpenChatEditorAction } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { getNewChatAction } from 'vs/workbench/contrib/chat/browser/actions/chatClearActions';
import { getMoveToEditorAction, getMoveToNewWindowAction } from 'vs/workbench/contrib/chat/browser/actions/chatMoveActions';
import { getQuickChatActionForProvider } from 'vs/workbench/contrib/chat/browser/actions/chatQuickInputActions';
import { CHAT_SIDEBAR_PANEL_ID, ChatViewPane, IChatViewOptions } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { ChatAgentLocation, IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatContributionService, IChatProviderContribution, IRawChatParticipantContribution, IRawChatProviderContribution } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
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
					description: localize('chatParticipantName', "User-facing display name for this chat participant. The user will use '@' with this name to invoke the participant."),
					type: 'string'
				},
				description: {
					description: localize('chatParticipantDescription', "A description of this chat participant, shown in the UI."),
					type: 'string'
				},
				isDefault: {
					markdownDescription: localize('chatParticipantIsDefaultDescription', "**Only** allowed for extensions that have the `defaultChatParticipant` proposal."),
					type: 'boolean',
				},
				isSticky: {
					description: localize('chatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
					type: 'boolean'
				},
				defaultImplicitVariables: {
					markdownDescription: '**Only** allowed for extensions that have the `chatParticipantAdditions` proposal. The names of the variables that are invoked by default',
					type: 'array',
					items: {
						type: 'string'
					}
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
								description: localize('chatCommandSampleRequest', "When the user clicks this command in `/help`, this text will be submitted to this participant."),
								type: 'string'
							},
							isSticky: {
								description: localize('chatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
								type: 'boolean'
							},
							defaultImplicitVariables: {
								markdownDescription: localize('defaultImplicitVariables', "**Only** allowed for extensions that have the `chatParticipantAdditions` proposal. The names of the variables that are invoked by default"),
								type: 'array',
								items: {
									type: 'string'
								}
							},
						}
					}
				},
				locations: {
					markdownDescription: localize('chatLocationsDescription', "Locations in which this chat participant is available."),
					type: 'array',
					default: ['panel'],
					items: {
						type: 'string',
						enum: ['panel', 'terminal', 'notebook']
					}

				}
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

	private readonly disposables = new DisposableStore();
	private _welcomeViewDescriptor?: IViewDescriptor;
	private _viewContainer: ViewContainer;
	private _registrationDisposables = new Map<string, IDisposable>();
	private _participantRegistrationDisposables = new DisposableMap<string>();

	constructor(
		@IChatContributionService private readonly _chatContributionService: IChatContributionService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService private readonly contextService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
	) {
		this._viewContainer = this.registerViewContainer();
		this.registerListeners();
		this.handleAndRegisterChatExtensions();
	}

	private registerListeners() {
		this.contextService.onDidChangeContext(e => {

			if (!this.productService.chatWelcomeView) {
				return;
			}

			const showWelcomeViewConfigKey = 'workbench.chat.experimental.showWelcomeView';
			const keys = new Set([showWelcomeViewConfigKey]);
			if (e.affectsSome(keys)) {
				const contextKeyExpr = ContextKeyExpr.equals(showWelcomeViewConfigKey, true);
				const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
				if (this.contextService.contextMatchesRules(contextKeyExpr)) {
					const viewId = this._chatContributionService.getViewIdForProvider(this.productService.chatWelcomeView.welcomeViewId);

					this._welcomeViewDescriptor = {
						id: viewId,
						name: { original: this.productService.chatWelcomeView.welcomeViewTitle, value: this.productService.chatWelcomeView.welcomeViewTitle },
						containerIcon: this._viewContainer.icon,
						ctorDescriptor: new SyncDescriptor(ChatViewPane, [<IChatViewOptions>{ providerId: this.productService.chatWelcomeView.welcomeViewId }]),
						canToggleVisibility: false,
						canMoveView: true,
						order: 100
					};
					viewsRegistry.registerViews([this._welcomeViewDescriptor], this._viewContainer);

					viewsRegistry.registerViewWelcomeContent(viewId, {
						content: this.productService.chatWelcomeView.welcomeViewContent,
					});
				} else if (this._welcomeViewDescriptor) {
					viewsRegistry.deregisterViews([this._welcomeViewDescriptor], this._viewContainer);
				}
			}
		}, null, this.disposables);
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
					if (providerDescriptor.isDefault && !isProposedApiEnabled(extension.description, 'defaultChatParticipant')) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: defaultChatParticipant.`);
						continue;
					}

					if (providerDescriptor.defaultImplicitVariables && !isProposedApiEnabled(extension.description, 'chatParticipantAdditions')) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
						continue;
					}

					if (!providerDescriptor.id || !providerDescriptor.name) {
						this.logService.error(`Extension '${extension.description.identifier.value}' CANNOT register participant without both id and name.`);
						continue;
					}

					this._participantRegistrationDisposables.set(
						getParticipantKey(extension.description.identifier, providerDescriptor.name),
						this._chatAgentService.registerAgent(
							providerDescriptor.id,
							{
								extensionId: extension.description.identifier,
								id: providerDescriptor.id,
								description: providerDescriptor.description,
								metadata: {
									isSticky: providerDescriptor.isSticky,
								},
								name: providerDescriptor.name,
								isDefault: providerDescriptor.isDefault,
								defaultImplicitVariables: providerDescriptor.defaultImplicitVariables,
								locations: isNonEmptyArray(providerDescriptor.locations) ?
									providerDescriptor.locations.map(ChatAgentLocation.fromRaw) :
									[ChatAgentLocation.Panel],
								slashCommands: providerDescriptor.commands ?? []
							} satisfies IChatAgentData));
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

	private registerChatProvider(providerDescriptor: IRawChatProviderContribution): IDisposable {
		// Register View
		const viewId = this._chatContributionService.getViewIdForProvider(providerDescriptor.id);
		const viewDescriptor: IViewDescriptor[] = [{
			id: viewId,
			containerIcon: this._viewContainer.icon,
			containerTitle: this._viewContainer.title.value,
			singleViewPaneContainerTitle: this._viewContainer.title.value,
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

function getParticipantKey(extensionId: ExtensionIdentifier, participantName: string): string {
	return `${extensionId.value}_${participantName}`;
}

export class ChatContributionService implements IChatContributionService {
	declare _serviceBrand: undefined;

	private _registeredProviders = new Map<string, IChatProviderContribution>();

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

	public get registeredProviders(): IChatProviderContribution[] {
		return Array.from(this._registeredProviders.values());
	}
}
