/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatCustomizations.css';
import { IManagedHoverContent, IManagedHoverOptions, IManagedHoverTooltipMarkdownString } from '../../../../../base/browser/ui/hover/hover.js';
import { reset } from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { raceCancellation } from '../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { IObservable, IReader, autorun, constObservable, derived, observableSignal } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { isObject } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ChatConfiguration } from '../../common/constants.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { getMcpServerDisplayLabel, IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { McpCommandIds } from '../../../mcp/common/mcpCommandIds.js';
import { IAICustomizationItemsModel } from './aiCustomizationItemsModel.js';
import { AgentHostMcpServer, getEffectiveMcpServerCounts } from './mcpServerCount.js';
import { IChatWidgetService } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CustomizationMigrationState } from './customizationMigrationState.js';
import { hookIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon } from './aiCustomizationIcons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICustomizationMigrationService } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { getIgnoredCustomizationMigrationGroups } from './customizationMigrationIgnoredGroups.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { ChatCustomizationsLocation } from '../../common/customizationsLocation.js';
import { ChatCustomizationsTelemetry, CustomizationsHoverTarget } from './chatCustomizationsTelemetry.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { openLinkFromMarkdown } from '../../../../../platform/markdown/browser/markdownRenderer.js';

const hoverCommands = [AICustomizationManagementCommands.OpenEditor, McpCommandIds.AuthenticateAgentHostServer, 'workbench.action.openSettings'];

export class ChatCustomizationsHover {
	private readonly telemetry: ChatCustomizationsTelemetry;
	private readonly linkTargets = new Map<string, CustomizationsHoverTarget>();
	private hoverToken: CancellationToken | undefined;
	private shownToken: CancellationToken | undefined;

	constructor(
		@IAICustomizationItemsModel private readonly itemsModel: IAICustomizationItemsModel,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@IAICustomizationWorkspaceService private readonly workspaceService: IAICustomizationWorkspaceService,
		@IMcpService private readonly mcpService: IMcpService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICustomizationMigrationService private readonly migrationService: ICustomizationMigrationService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		this.telemetry = instantiationService.createInstance(ChatCustomizationsTelemetry);
	}

	logButtonClicked(location: Exclude<ChatCustomizationsLocation, 'auto'>): void {
		this.telemetry.logInteraction('buttonClicked', location);
	}

	getHoverOptions(location: Exclude<ChatCustomizationsLocation, 'auto'>): IManagedHoverOptions {
		return {
			trapFocus: true,
			additionalClasses: ['chat-customizations-hover'],
			onDidShow: () => {
				// Loading and its resolved content are one managed hover request.
				if (this.hoverToken && !this.hoverToken.isCancellationRequested && this.shownToken !== this.hoverToken) {
					this.shownToken = this.hoverToken;
					this.telemetry.logInteraction('hoverShown', location);
				}
			},
			linkHandler: url => {
				const target = this.linkTargets.get(url);
				if (target) {
					this.telemetry.logInteraction('hoverInteracted', location, target);
				}
				void openLinkFromMarkdown(this.openerService, url, { enabledCommands: hoverCommands });
			},
		};
	}

	getSessionResource(context?: unknown, reader?: IReader): URI {
		return this.getExplicitSessionResource(context) ?? this.harnessService.activeSessionResource.read(reader);
	}

	getExplicitSessionResource(context?: unknown): URI | undefined {
		if (isObject(context)) {
			const widgetContext: unknown = Reflect.get(context, 'widget');
			if (widgetContext) {
				const widget = this.chatWidgetService.getAllWidgets().find(widget => widget === widgetContext);
				if (widget?.input.pendingDelegationTarget) {
					return this.harnessService.getSessionResourceForHarness(widget.input.pendingDelegationTarget);
				}
				if (widget?.viewModel) {
					return widget.viewModel.sessionResource;
				}
			}
			const sessionResource: unknown = Reflect.get(context, 'sessionResource');
			if (URI.isUri(sessionResource)) {
				return sessionResource;
			}
			const resource: unknown = Reflect.get(context, 'resource');
			if (URI.isUri(resource)) {
				return resource;
			}
		}
		return undefined;
	}

	getProjectRoot(sessionResource: URI, reader?: IReader): URI | undefined {
		return isEqual(sessionResource, this.harnessService.activeSessionResource.read(reader))
			? this.workspaceService.activeProjectRoot.read(reader)
			: this.agentHostCustomizationService.getClientWorkingDirectoryUris(sessionResource)[0];
	}

	getManagedContent(note?: string, context?: () => unknown): IManagedHoverTooltipMarkdownString {
		return {
			markdown: token => {
				this.hoverToken = token;
				return this.getContent(token, context?.(), note);
			},
			markdownNotSupportedFallback: note ?? localize('customizationsHover.title', "Session Customizations"),
		};
	}

	async getContent(token: CancellationToken, context?: unknown, note?: string): Promise<MarkdownString | undefined> {
		const sessionResource = this.getSessionResource(context);
		const active = isEqual(sessionResource, this.harnessService.activeSessionResource.get());
		const descriptor = active ? this.harnessService.getActiveDescriptor() : this.harnessService.getDescriptorForSession(sessionResource);
		if (!descriptor) {
			return new MarkdownString().appendText(localize('customizationsHover.loading', "Customizations are still loading."));
		}
		const scope = active ? undefined : this.itemsModel.createSessionModel(sessionResource);
		try {
			const itemsModel = scope?.model ?? this.itemsModel;
			const hidden = new Set(descriptor.hiddenSections);
			const sections = [AICustomizationManagementSection.Plugins, AICustomizationManagementSection.Skills, AICustomizationManagementSection.Instructions, AICustomizationManagementSection.Hooks]
				.filter(section => !hidden.has(section));
			const ignoredGroups = getIgnoredCustomizationMigrationGroups(this.storageService, getChatSessionType(sessionResource), this.getProjectRoot(sessionResource));
			const discovery = await raceCancellation(Promise.all([
				this.migrationService.computeMigrationHint(sessionResource, token, ignoredGroups),
				Promise.all(sections.map(section => itemsModel.whenSectionLoaded(section))),
			]), token);
			if (!discovery || token.isCancellationRequested) {
				return undefined;
			}
			if (!isEqual(sessionResource, this.getSessionResource(context))) {
				return this.getContent(token, context, note);
			}
			const [migrationHint] = discovery;
			const migrationCount = migrationHint?.counts.reduce((total, entry) => total + entry.count, 0) ?? 0;
			const linkTargets = new Map<string, CustomizationsHoverTarget>();
			const commandLink = (target: { readonly section?: AICustomizationManagementSection; readonly migration?: boolean; readonly showDiscover?: boolean }, telemetryTarget: CustomizationsHoverTarget) => {
				const link = `command:${AICustomizationManagementCommands.OpenEditor}?${encodeURIComponent(JSON.stringify([{ ...target, sessionResource, ...(target.migration ? { migrationHint } : {}) }]))}`;
				linkTargets.set(link, telemetryTarget);
				return link;
			};
			const content = new MarkdownString('', { supportThemeIcons: true, supportHtml: true, isTrusted: { enabledCommands: hoverCommands } });
			content.appendMarkdown(`**${localize('customizationsHover.title', "Session Customizations")}**\n\n`);
			const projectRoot = this.getProjectRoot(sessionResource);
			const projectLabel = active ? this.workspaceService.activeProjectLabel.get() : projectRoot ? basename(projectRoot) : undefined;
			content.appendText(projectLabel
				? localize('customizationsHover.context', "{0} \u00b7 {1}", descriptor.label, projectLabel)
				: descriptor.label);
			content.appendMarkdown('\n\n');
			let hasSections = false;
			const appendSection = (section: AICustomizationManagementSection & CustomizationsHoverTarget, icon: ThemeIcon, label: string, count: () => number) => {
				if (!hidden.has(section)) {
					if (!hasSections) {
						content.appendMarkdown(`| ${localize('customizationsHover.type', "Type")} | ${localize('customizationsHover.available', "Available")} |\n| :--- | ---: |\n`);
						hasSections = true;
					}
					content.appendMarkdown('| ');
					content.appendLink(commandLink({ section }, section), `$(${icon.id})${label}`);
					content.appendMarkdown(` | ${count()} |\n`);
				}
			};
			appendSection(AICustomizationManagementSection.Plugins, pluginIcon, localize('customizationsHover.plugins', "Plugins"), () => itemsModel.getPluginCount().get());
			let authRequiredServers: readonly AgentHostMcpServer[] = [];
			if (!hidden.has(AICustomizationManagementSection.McpServers)) {
				const counts = getEffectiveMcpServerCounts(
					this.mcpService.servers.get(),
					this.agentHostCustomizationService.getMcpServers(sessionResource),
					undefined,
					descriptor.hiddenMcpServerCollectionIds,
				);
				authRequiredServers = counts.authRequiredServers;
				appendSection(AICustomizationManagementSection.McpServers, mcpServerIcon, localize('customizationsHover.mcp', "MCP Servers"), () => counts.total);
			}
			appendSection(AICustomizationManagementSection.Skills, skillIcon, localize('customizationsHover.skills', "Skills"), () => itemsModel.getCount(AICustomizationManagementSection.Skills).get());
			appendSection(AICustomizationManagementSection.Instructions, instructionsIcon, localize('customizationsHover.instructions', "Instructions"), () => itemsModel.getCount(AICustomizationManagementSection.Instructions).get());
			appendSection(AICustomizationManagementSection.Hooks, hookIcon, localize('customizationsHover.hooks', "Hooks"), () => itemsModel.getCount(AICustomizationManagementSection.Hooks).get());
			if (migrationCount || authRequiredServers.length) {
				content.appendMarkdown(`\n\n**${localize('customizationsHover.attention', "Needs attention")}**\n\n`);
				if (migrationCount) {
					content.appendMarkdown(`- $(${Codicon.warning.id}) `);
					content.appendLink(commandLink({ migration: true }, 'migrations'), migrationCount === 1
						? localize('customizationsHover.migrationSingle', "1 customization needs migration")
						: localize('customizationsHover.migrationsCount', "{0} customizations need migration", migrationCount),
						localize('customizationsHover.reviewMigrations', "Review Migrations"));
					content.appendMarkdown('\n');
				}
				if (authRequiredServers.length) {
					content.appendMarkdown(`- $(${Codicon.key.id}) `);
					const names = authRequiredServers.slice(0, 2).map(getMcpServerDisplayLabel).join(', ');
					const serverNames = authRequiredServers.length > 2
						? localize('customizationsHover.moreServers', "{0}, +{1} more", names, authRequiredServers.length - 2)
						: names;
					content.appendLink(commandLink({ section: AICustomizationManagementSection.McpServers }, 'mcpServers'), authRequiredServers.length === 1
						? localize('customizationsHover.authenticationSingle', "1 MCP server requires sign-in")
						: localize('customizationsHover.authentication', "{0} MCP servers require sign-in", authRequiredServers.length),
						localize('customizationsHover.manageMcp', "Manage MCP Servers: {0}", serverNames));
					content.appendMarkdown(' *');
					for (const [index, server] of authRequiredServers.slice(0, 2).entries()) {
						if (index > 0) {
							content.appendMarkdown(',&nbsp;');
						}
						const label = getMcpServerDisplayLabel(server);
						const link = `command:${McpCommandIds.AuthenticateAgentHostServer}?${encodeURIComponent(JSON.stringify([sessionResource, server.id]))}`;
						linkTargets.set(link, 'mcpAuthentication');
						content.appendLink(
							link,
							new MarkdownString().appendText(label).value,
							localize('customizationsHover.signInToServer', "Sign In to {0}", label),
						);
					}
					if (authRequiredServers.length > 2) {
						content.appendText(localize('customizationsHover.remainingServers', ", +{0} more", authRequiredServers.length - 2));
					}
					content.appendMarkdown('*\n');
				}
			}
			if (note && !migrationCount) {
				content.appendMarkdown('\n\n');
				content.appendText(note);
			}
			content.appendMarkdown('\n\n---\n\n');
			content.appendLink(commandLink({ showDiscover: true }, 'browseAdditional'), `$(${Codicon.add.id})${localize('customizationsHover.browseAdditional', "Browse Additional")}`);
			content.appendMarkdown(' ');
			const locationLabel = localize('customizationsHover.location', "Change Button Location...");
			const gearLabel = new MarkdownString();
			gearLabel.appendMarkdown(`$(${Codicon.settingsGear.id})<span>`);
			gearLabel.appendText(locationLabel);
			gearLabel.appendMarkdown('</span>');
			const settingsLink = `command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify([ChatConfiguration.ChatCustomizationsLocation]))}`;
			linkTargets.set(settingsLink, 'locationSetting');
			content.appendLink(settingsLink, gearLabel.value, locationLabel);
			this.linkTargets.clear();
			for (const [link, target] of linkTargets) {
				this.linkTargets.set(link, target);
			}
			return content;
		} finally {
			scope?.dispose();
		}
	}
}

export class ChatCustomizationsActionViewItem extends MenuEntryActionViewItem {
	private readonly contextChanged = observableSignal(this);
	private readonly migrationAvailable: IObservable<boolean>;

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		private readonly hover: ChatCustomizationsHover,
		private readonly location: Exclude<ChatCustomizationsLocation, 'auto'>,
		migrationAvailable: IObservable<boolean> | undefined,
		private readonly showLabel = false,
		private readonly badge: IObservable<string | undefined> = constObservable(undefined),
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
		this.options.label = showLabel;
		this.migrationAvailable = migrationAvailable ?? this._register(instantiationService.createInstance(CustomizationMigrationState, derived(this, reader => {
			this.contextChanged.read(reader);
			const sessionResource = this.hover.getSessionResource(this._context, reader);
			return { sessionResource, projectRoot: this.hover.getProjectRoot(sessionResource, reader) };
		}))).available;
	}

	override setActionContext(context: unknown): void {
		super.setActionContext(context);
		this.contextChanged.trigger(undefined);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._register(this.actionRunner.onWillRun(event => {
			if (event.action === this.action) {
				this.hover.logButtonClicked(this.location);
			}
		}));
		container.classList.add('chat-customizations-action-item');
		if (this.showLabel) {
			container.classList.add('customization-link-widget');
			this.label?.classList.add('monaco-button', 'monaco-text-button', 'sidebar-action-button');
		}
		this._register(autorun(reader => {
			container.classList.toggle('migration-available', this.migrationAvailable.read(reader) || this.badge.read(reader) !== undefined);
			this.updateTooltip();
		}));
	}

	protected override updateLabel(): void {
		if (this.showLabel && this.label) {
			reset(this.label, ...renderLabelWithIcons(`$(${Codicon.extensions.id}) ${this._commandAction.label}`));
		} else {
			super.updateLabel();
		}
	}

	protected override getTooltip(): string {
		if (this.migrationAvailable.get()) {
			return localize('customizationsHover.migrationsLabel', "{0} (Migrations Available)", super.getTooltip());
		}
		const badge = this.badge.get();
		return badge !== undefined
			? localize('customizationsHover.badgeLabel', "{0}, {1}", super.getTooltip(), badge)
			: super.getTooltip();
	}

	protected override getHoverContents(): IManagedHoverContent {
		return this.hover.getManagedContent(this.migrationAvailable.get()
			? localize('customizationsHover.migrations', "Some customizations need an update to keep working.")
			: this.badge.get(), () => this._context);
	}

	protected override getHoverOptions(): IManagedHoverOptions {
		return this.hover.getHoverOptions(this.location);
	}

}
