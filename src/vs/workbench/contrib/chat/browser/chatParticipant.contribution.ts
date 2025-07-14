/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, isNonEmptyArray } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import { localize, localize2 } from '../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ExtensionIdentifier, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions, IViewDescriptorService } from '../../../common/views.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../services/extensions/common/extensionsRegistry.js';
import { showExtensionsWithIdsCommandId } from '../../extensions/browser/extensionsActions.js';
import { IExtension, IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IChatAgentData, IChatAgentService } from '../common/chatAgents.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IRawChatParticipantContribution } from '../common/chatParticipantContribTypes.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { ChatViewId } from './chat.js';
import { CHAT_SIDEBAR_PANEL_ID, ChatViewPane } from './chatViewPane.js';

// --- Coding Agents View Pane Class

interface IViewPaneOptions {
	readonly id: string;
	readonly title: string;
	readonly fromExtensionId?: string;
	readonly expanded?: boolean;
	readonly singleViewPaneContainerTitle?: string;
}

class CodingAgentsViewPane extends ViewPane {
	private tree: HTMLElement | undefined;
	private currentTab: 'open' | 'closed' = 'open';

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('coding-agents-view');

		// Create header with input and tabs
		this.createHeader(container);

		// Create tree container
		this.tree = document.createElement('div');
		this.tree.className = 'monaco-list monaco-list-rows';
		this.tree.setAttribute('role', 'tree');
		container.appendChild(this.tree);

		// Initial render
		this.renderAgents();
	}

	private createHeader(container: HTMLElement): void {
		// Header section
		const header = document.createElement('div');
		header.className = 'pane-header';
		header.style.padding = '8px 16px';

		// Tabs section
		const tabsContainer = document.createElement('div');
		tabsContainer.className = 'monaco-action-bar';
		tabsContainer.style.display = 'flex';
		tabsContainer.style.borderBottom = '1px solid var(--vscode-contrastBorder)';
		tabsContainer.style.marginBottom = '8px';

		const openTab = document.createElement('div');
		openTab.className = 'action-item';
		openTab.style.padding = '8px 12px';
		openTab.style.cursor = 'pointer';
		openTab.style.borderBottom = this.currentTab === 'open' ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent';
		openTab.textContent = 'Open ';
		const openBadge = document.createElement('span');
		openBadge.className = 'monaco-count-badge';
		openBadge.style.marginLeft = '6px';
		openBadge.textContent = '7';
		openTab.appendChild(openBadge);

		const closedTab = document.createElement('div');
		closedTab.className = 'action-item';
		closedTab.style.padding = '8px 12px';
		closedTab.style.cursor = 'pointer';
		closedTab.style.borderBottom = this.currentTab === 'closed' ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent';
		closedTab.textContent = 'Closed ';
		const closedBadge = document.createElement('span');
		closedBadge.className = 'monaco-count-badge';
		closedBadge.style.marginLeft = '6px';
		closedBadge.textContent = '3';
		closedTab.appendChild(closedBadge);

		// Tab click handlers
		openTab.addEventListener('click', () => {
			this.currentTab = 'open';
			openTab.style.borderBottom = '2px solid var(--vscode-focusBorder)';
			closedTab.style.borderBottom = '2px solid transparent';
			this.renderAgents();
		});

		closedTab.addEventListener('click', () => {
			this.currentTab = 'closed';
			openTab.style.borderBottom = '2px solid transparent';
			closedTab.style.borderBottom = '2px solid var(--vscode-focusBorder)';
			this.renderAgents();
		});

		tabsContainer.appendChild(openTab);
		tabsContainer.appendChild(closedTab);

		header.appendChild(tabsContainer);
		container.appendChild(header);
	}

	private renderAgents(): void {
		if (!this.tree) {
			return;
		}

		// Clear tree
		while (this.tree.firstChild) {
			this.tree.removeChild(this.tree.firstChild);
		}

		const agents = this.currentTab === 'open' ? this.getOpenAgents() : this.getClosedAgents();

		agents.forEach((agent, index) => {
			const item = document.createElement('div');
			item.className = 'monaco-list-row';
			item.style.display = 'flex';
			item.style.alignItems = 'flex-start';
			item.style.padding = '12px 16px';
			item.style.borderBottom = '1px solid var(--vscode-list-inactiveSelectionBackground)';
			item.style.cursor = 'pointer';
			item.style.position = 'relative';

			// Status indicator
			const statusIcon = document.createElement('div');
			statusIcon.style.width = '8px';
			statusIcon.style.height = '8px';
			statusIcon.style.marginTop = '6px';
			statusIcon.style.marginRight = '12px';
			statusIcon.style.borderRadius = '50%';
			statusIcon.style.backgroundColor = this.getStatusColor(agent.status);
			statusIcon.style.flexShrink = '0';

			// Content container
			const content = document.createElement('div');
			content.style.flex = '1';
			content.style.display = 'flex';
			content.style.flexDirection = 'column';
			content.style.gap = '4px';

			// Title
			const title = document.createElement('div');
			title.style.fontWeight = '500';
			title.style.fontSize = '13px';
			title.style.lineHeight = '18px';
			title.style.color = 'var(--vscode-foreground)';
			title.textContent = agent.title;

			// Details
			const details = document.createElement('div');
			details.style.fontSize = '11px';
			details.style.lineHeight = '16px';
			details.style.color = 'var(--vscode-descriptionForeground)';
			details.textContent = `${agent.repo} • started ${agent.time} • ${agent.revisions} • ${agent.badge}`;

			content.appendChild(title);
			content.appendChild(details);

			item.appendChild(statusIcon);
			item.appendChild(content);

			// Hover effects
			item.addEventListener('mouseenter', () => {
				item.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
			});
			item.addEventListener('mouseleave', () => {
				item.style.backgroundColor = 'transparent';
			});

			// Click handler
			item.addEventListener('click', () => {
				console.log(`Clicked agent: ${agent.title}`);
			});

			this.tree!.appendChild(item);
		});
	}

	private getStatusColor(status: string): string {
		switch (status) {
			case 'ready': return '#22863a';
			case 'pending': return '#f66a0a';
			case 'completed': return '#6f42c1';
			case 'cancelled': return 'var(--vscode-descriptionForeground)';
			default: return 'var(--vscode-descriptionForeground)';
		}
	}

	private getOpenAgents() {
		return [
			{
				title: 'Update server port configuration from 7001 to 8000',
				repo: 'osortega/simple-server',
				status: 'ready',
				time: '3d ago',
				revisions: '1 revision',
				badge: 'Ready for review'
			},
			{
				title: 'Change server port from 7000 to 7001 in index.js',
				repo: 'osortega/simple-server',
				status: 'ready',
				time: '1w ago',
				revisions: '1 revision',
				badge: 'Ready for review'
			},
			{
				title: 'Change server port from 7000 to 8000',
				repo: 'osortega/simple-server',
				status: 'ready',
				time: '1w ago',
				revisions: '1 revision',
				badge: 'Ready for review'
			},
			{
				title: 'Change server port from 6000 to 7000',
				repo: 'osortega/simple-server',
				status: 'ready',
				time: '1w ago',
				revisions: '1 revision',
				badge: 'Ready for review'
			},
			{
				title: 'Change server port from 3002 to 5001',
				repo: 'osortega/simple-server',
				status: 'ready',
				time: '1w ago',
				revisions: '3 revisions',
				badge: 'Ready for review'
			},
			{
				title: 'Add user authentication to login endpoint',
				repo: 'osortega/simple-server',
				status: 'pending',
				time: '2d ago',
				revisions: '2 revisions',
				badge: 'In progress'
			},
			{
				title: 'Change server port from 3001 to 3000',
				repo: 'osortega/simple-server',
				status: 'ready',
				time: '1w ago',
				revisions: '2 revisions',
				badge: 'Ready for review'
			}
		];
	}

	private getClosedAgents() {
		return [
			{
				title: '[WIP] Port Change Request',
				repo: 'osortega/simple-server',
				status: 'cancelled',
				time: '1w ago',
				revisions: '1 revision',
				badge: 'Cancelled'
			},
			{
				title: 'Fix database connection timeout',
				repo: 'osortega/simple-server',
				status: 'completed',
				time: '2w ago',
				revisions: '4 revisions',
				badge: 'Completed'
			},
			{
				title: 'Migrate to TypeScript configuration',
				repo: 'osortega/simple-server',
				status: 'completed',
				time: '3w ago',
				revisions: '6 revisions',
				badge: 'Completed'
			}
		];
	}
}

// --- Chat Container &  View Registration

const chatViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: CHAT_SIDEBAR_PANEL_ID,
	title: localize2('chat.viewContainer.label', "Chat"),
	icon: Codicon.commentDiscussion,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [CHAT_SIDEBAR_PANEL_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: CHAT_SIDEBAR_PANEL_ID,
	hideIfEmpty: true,
	order: 100,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });

const chatViewDescriptor: IViewDescriptor[] = [{
	id: ChatViewId,
	containerIcon: chatViewContainer.icon,
	containerTitle: chatViewContainer.title.value,
	singleViewPaneContainerTitle: chatViewContainer.title.value,
	name: localize2('chat.viewContainer.label', "Chat"),
	canToggleVisibility: false,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: CHAT_SIDEBAR_PANEL_ID,
		title: chatViewContainer.title,
		mnemonicTitle: localize({ key: 'miToggleChat', comment: ['&& denotes a mnemonic'] }, "&&Chat"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
			}
		},
		order: 1
	},
	ctorDescriptor: new SyncDescriptor(ChatViewPane, [{ location: ChatAgentLocation.Panel }]),
	when: ContextKeyExpr.or(
		ContextKeyExpr.and(
			ChatContextKeys.Setup.hidden.negate(),
			ChatContextKeys.Setup.disabled.negate() // do not pretend a working Chat view if extension is explicitly disabled
		),
		ContextKeyExpr.and(
			ChatContextKeys.Setup.installed,
			ChatContextKeys.Setup.disabled.negate() // do not pretend a working Chat view if extension is explicitly disabled
		),
		ChatContextKeys.panelParticipantRegistered,
		ChatContextKeys.extensionInvalid
	)
}];
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(chatViewDescriptor, chatViewContainer);

// --- Coding Agents Container & View Registration

const codingAgentsViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.panel.codingAgents',
	title: localize2('codingAgents.viewContainer.label', "Coding Agents"),
	icon: Codicon.robot,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.panel.codingAgents', { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'workbench.panel.codingAgents',
	hideIfEmpty: true,
	order: 101,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: false, doNotRegisterOpenCommand: false });

const codingAgentsViewDescriptor: IViewDescriptor[] = [{
	id: 'workbench.view.codingAgents',
	containerIcon: codingAgentsViewContainer.icon,
	containerTitle: codingAgentsViewContainer.title.value,
	singleViewPaneContainerTitle: codingAgentsViewContainer.title.value,
	name: localize2('codingAgents.viewContainer.label', "Coding Agents"),
	canToggleVisibility: true,
	canMoveView: true,
	openCommandActionDescriptor: {
		id: 'workbench.action.openCodingAgentsView',
		title: codingAgentsViewContainer.title,
		mnemonicTitle: localize({ key: 'miToggleCodingAgents', comment: ['&& denotes a mnemonic'] }, "&&Coding Agents"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR
		},
		order: 2
	},
	ctorDescriptor: new SyncDescriptor(CodingAgentsViewPane),
	when: ContextKeyExpr.true()
}];
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews(codingAgentsViewDescriptor, codingAgentsViewContainer);

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
					pattern: '^[\\w-]+$'
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
				disambiguation: {
					description: localize('chatParticipantDisambiguation', "Metadata to help with automatically routing user questions to this chat participant."),
					type: 'array',
					items: {
						additionalProperties: false,
						type: 'object',
						defaultSnippets: [{ body: { category: '', description: '', examples: [] } }],
						required: ['category', 'description', 'examples'],
						properties: {
							category: {
								markdownDescription: localize('chatParticipantDisambiguationCategory', "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
								type: 'string'
							},
							description: {
								description: localize('chatParticipantDisambiguationDescription', "A detailed description of the kinds of questions that are suitable for this chat participant."),
								type: 'string'
							},
							examples: {
								description: localize('chatParticipantDisambiguationExamples', "A list of representative example questions that are suitable for this chat participant."),
								type: 'array'
							},
						}
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
								description: localize('chatCommandSampleRequest', "When the user clicks this command in `/help`, this text will be submitted to the participant."),
								type: 'string'
							},
							isSticky: {
								description: localize('chatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
								type: 'boolean'
							},
							disambiguation: {
								description: localize('chatCommandDisambiguation', "Metadata to help with automatically routing user questions to this chat command."),
								type: 'array',
								items: {
									additionalProperties: false,
									type: 'object',
									defaultSnippets: [{ body: { category: '', description: '', examples: [] } }],
									required: ['category', 'description', 'examples'],
									properties: {
										category: {
											markdownDescription: localize('chatCommandDisambiguationCategory', "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
											type: 'string'
										},
										description: {
											description: localize('chatCommandDisambiguationDescription', "A detailed description of the kinds of questions that are suitable for this chat command."),
											type: 'string'
										},
										examples: {
											description: localize('chatCommandDisambiguationExamples', "A list of representative example questions that are suitable for this chat command."),
											type: 'array'
										},
									}
								}
							}
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

	private _participantRegistrationDisposables = new DisposableMap<string>();

	constructor(
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
	) {
		this.handleAndRegisterChatExtensions();
	}

	private handleAndRegisterChatExtensions(): void {
		chatParticipantExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const providerDescriptor of extension.value) {
					if (!providerDescriptor.name?.match(/^[\w-]+$/)) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with invalid name: ${providerDescriptor.name}. Name must match /^[\\w-]+$/.`);
						continue;
					}

					if (providerDescriptor.fullName && strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter(providerDescriptor.fullName)) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains ambiguous characters: ${providerDescriptor.fullName}.`);
						continue;
					}

					// Spaces are allowed but considered "invisible"
					if (providerDescriptor.fullName && strings.InvisibleCharacters.containsInvisibleCharacter(providerDescriptor.fullName.replace(/ /g, ''))) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains invisible characters: ${providerDescriptor.fullName}.`);
						continue;
					}

					if ((providerDescriptor.isDefault || providerDescriptor.modes) && !isProposedApiEnabled(extension.description, 'defaultChatParticipant')) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: defaultChatParticipant.`);
						continue;
					}

					if (providerDescriptor.locations && !isProposedApiEnabled(extension.description, 'chatParticipantAdditions')) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
						continue;
					}

					if (!providerDescriptor.id || !providerDescriptor.name) {
						extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant without both id and name.`);
						continue;
					}

					const participantsDisambiguation: {
						category: string;
						description: string;
						examples: string[];
					}[] = [];

					if (providerDescriptor.disambiguation?.length) {
						participantsDisambiguation.push(...providerDescriptor.disambiguation.map((d) => ({
							...d, category: d.category ?? d.categoryName
						})));
					}

					try {
						const store = new DisposableStore();
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
								modes: providerDescriptor.modes ?? [ChatModeKind.Ask],
								slashCommands: providerDescriptor.commands ?? [],
								disambiguation: coalesce(participantsDisambiguation.flat()),
							} satisfies IChatAgentData));

						this._participantRegistrationDisposables.set(
							getParticipantKey(extension.description.identifier, providerDescriptor.id),
							store
						);
					} catch (e) {
						extension.collector.error(`Failed to register participant ${providerDescriptor.id}: ${toErrorMessage(e, true)}`);
					}
				}
			}

			for (const extension of delta.removed) {
				for (const providerDescriptor of extension.value) {
					this._participantRegistrationDisposables.deleteAndDispose(getParticipantKey(extension.description.identifier, providerDescriptor.id));
				}
			}
		});
	}
}

function getParticipantKey(extensionId: ExtensionIdentifier, participantName: string): string {
	return `${extensionId.value}_${participantName}`;
}

export class ChatCompatibilityNotifier extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatCompatNotifier';

	private registeredWelcomeView = false;

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		// It may be better to have some generic UI for this, for any extension that is incompatible,
		// but this is only enabled for Copilot Chat now and it needs to be obvious.
		const isInvalid = ChatContextKeys.extensionInvalid.bindTo(contextKeyService);
		this._register(Event.runAndSubscribe(
			extensionsWorkbenchService.onDidChangeExtensionsNotification,
			() => {
				const notification = extensionsWorkbenchService.getExtensionsNotification();
				const chatExtension = notification?.extensions.find(ext => ExtensionIdentifier.equals(ext.identifier.id, this.productService.defaultChatAgent?.chatExtensionId));
				if (chatExtension) {
					isInvalid.set(true);
					this.registerWelcomeView(chatExtension);
				} else {
					isInvalid.set(false);
				}
			}
		));
	}

	private registerWelcomeView(chatExtension: IExtension) {
		if (this.registeredWelcomeView) {
			return;
		}

		this.registeredWelcomeView = true;
		const showExtensionLabel = localize('showExtension', "Show Extension");
		const mainMessage = localize('chatFailErrorMessage', "Chat failed to load because the installed version of the Copilot Chat extension is not compatible with this version of {0}. Please ensure that the Copilot Chat extension is up to date.", this.productService.nameLong);
		const commandButton = `[${showExtensionLabel}](command:${showExtensionsWithIdsCommandId}?${encodeURIComponent(JSON.stringify([[this.productService.defaultChatAgent?.chatExtensionId]]))})`;
		const versionMessage = `Copilot Chat version: ${chatExtension.version}`;
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		this._register(viewsRegistry.registerViewWelcomeContent(ChatViewId, {
			content: [mainMessage, commandButton, versionMessage].join('\n\n'),
			when: ChatContextKeys.extensionInvalid,
		}));
	}
}

class ChatParticipantDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {
	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.chatParticipants;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const nonDefaultContributions = manifest.contributes?.chatParticipants?.filter(c => !c.isDefault) ?? [];
		if (!nonDefaultContributions.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('participantName', "Name"),
			localize('participantFullName', "Full Name"),
			localize('participantDescription', "Description"),
			localize('participantCommands', "Commands"),
		];

		const rows: IRowData[][] = nonDefaultContributions.map(d => {
			return [
				'@' + d.name,
				d.fullName,
				d.description ?? '-',
				d.commands?.length ? new MarkdownString(d.commands.map(c => `- /` + c.name).join('\n')) : '-'
			];
		});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'chatParticipants',
	label: localize('chatParticipants', "Chat Participants"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ChatParticipantDataRenderer),
});
