/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../workbench/contrib/sessions/browser/media/sidebarActionButton.css';
import '../../../../workbench/contrib/sessions/browser/media/customizationsToolbar.css';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IAICustomizationItemsModel } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IAgentHostToolSetEnablementService, isCopilotCliSessionType } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { BaseActionViewItem, IActionViewItemOptions, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { AICustomizationMcpServerCountService, IAICustomizationMcpServerCountService } from '../../../../workbench/contrib/sessions/browser/customizationMcpServerCount.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IOpenAICustomizationsCommandOptions, OPEN_AI_CUSTOMIZATIONS_COMMAND_ID } from '../../../../workbench/contrib/sessions/browser/customizationsConstants.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ICustomizationItemConfig, readCustomizationCount, CUSTOMIZATION_ITEMS } from '../../../../workbench/contrib/sessions/browser/customizationItems.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ChatCustomizationsLocation, ChatCustomizationsLocationContext, resolveChatCustomizationsLocation } from '../../../../workbench/contrib/chat/common/customizationsLocation.js';
import { SESSIONS_SIDEBAR_CUSTOMIZATIONS_AT_BOTTOM_SETTING, SESSIONS_SIDEBAR_CUSTOMIZATIONS_CATEGORIES_SETTING, SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING, SessionsSidebarCustomizationsCategories } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ChatCustomizationsActionViewItem, ChatCustomizationsHover } from '../../../../workbench/contrib/chat/browser/aiCustomization/chatCustomizationsHover.js';
import { observeVisibleSectionBadge, observeVisibleSectionsBadge } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationSectionBadges.js';
import { ChatCustomizationsTelemetry } from '../../../../workbench/contrib/chat/browser/aiCustomization/chatCustomizationsTelemetry.js';
import { ICustomizationMigrationService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/customizationMigrationService.js';
import { getIgnoredCustomizationMigrationGroups } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationIgnoredGroups.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';

/**
 * Per-section context key indicating whether the active harness exposes
 * the section in the sidebar customizations toolbar. Driven by
 * `IHarnessDescriptor.hiddenSections` and consumed via the menu `when`
 * clause registered alongside each customization action.
 */
function customizationSectionVisibleKey(section: string): string {
	return `sessionsCustomizationSectionVisible.${section}`;
}

/**
 * Offers a customization item, and its command, if any, where AI features are
 * enabled and the active harness exposes the item's section.
 */
function customizationItemWhen(config: ICustomizationItemConfig, section: string): ContextKeyExpression | undefined {
	const sectionVisibleWhen = ContextKeyExpr.has(customizationSectionVisibleKey(section));
	return config.when
		? ContextKeyExpr.and(ChatContextKeys.enabled, sectionVisibleWhen, config.when)
		: ContextKeyExpr.and(ChatContextKeys.enabled, sectionVisibleWhen);
}

const CUSTOMIZATION_OVERVIEW_ITEM: ICustomizationItemConfig = {
	id: OPEN_AI_CUSTOMIZATIONS_COMMAND_ID,
	label: localize('overview', "Overview"),
	icon: Codicon.home,
};

const CUSTOMIZATIONS_REDUCED = ContextKeyExpr.equals(`config.${SESSIONS_SIDEBAR_CUSTOMIZATIONS_CATEGORIES_SETTING}`, SessionsSidebarCustomizationsCategories.Reduced);

/** Whether the reduced Customizations section shows the categories that it hides by default. */
const CUSTOMIZATIONS_SHOW_MORE_STORAGE_KEY = 'agentSessions.customizationsShortcuts.showMore';
const CustomizationsShowMoreContext = new RawContextKey<boolean>('sessionsCustomizationsShowMore', false);
/** Whether any of the categories that the reduced Customizations section hides by default is available. */
const CustomizationsMoreAvailableContext = new RawContextKey<boolean>('sessionsCustomizationsMoreAvailable', false);

export const SHOW_MORE_CUSTOMIZATIONS_COMMAND_ID = 'sessions.customizations.showMore';
export const SHOW_LESS_CUSTOMIZATIONS_COMMAND_ID = 'sessions.customizations.showLess';

// More shows the categories after those that the reduced section always shows, followed by Less.
const MORE_CUSTOMIZATIONS_ORDER = CUSTOMIZATION_ITEMS.length + 1;
const SHOW_MORE_OR_LESS_ORDER = 2 * MORE_CUSTOMIZATIONS_ORDER;

async function openCustomizationOverviewPage(editorService: IEditorService, harnessService: ICustomizationHarnessService, focusedSessionHostService: IFocusedSessionHostService, workspaceService: IAICustomizationWorkspaceService, options?: IOpenAICustomizationsCommandOptions, targetSession?: ISession, targetResource?: URI): Promise<void> {
	const session = targetSession ?? (targetResource ? undefined : focusedSessionHostService.focusedHost.get().session.get());
	const resource = targetResource ?? session?.resource;
	if (resource) {
		harnessService.setActiveSession(resource);
	}
	workspaceService.setActiveSessionResource?.(targetResource);

	const input = AICustomizationManagementEditorInput.getOrCreate();
	const targetLabels = workspaceService.activeTargetLabels?.get();
	input.setTargetLabels(
		targetLabels?.harness ?? harnessService.getActiveDescriptor().label,
		targetLabels?.workspace ?? workspaceService.activeProjectLabel.get(),
		targetLabels?.environment,
	);
	const pane = await editorService.openEditor(input, { pinned: true });
	if (pane instanceof AICustomizationManagementEditor) {
		if (options?.migration) {
			await pane.startCustomizationMigration();
		} else {
			pane.showWelcomePage();
		}
	}
}

async function openCustomizationSectionPage(editorService: IEditorService, harnessService: ICustomizationHarnessService, focusedSessionHostService: IFocusedSessionHostService, workspaceService: IAICustomizationWorkspaceService, section: typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection]): Promise<void> {
	const session = focusedSessionHostService.focusedHost.get().session.get();
	if (session) {
		harnessService.setActiveSession(session.resource);
	}
	workspaceService.setActiveSessionResource?.(undefined);

	const input = AICustomizationManagementEditorInput.getOrCreate();
	const targetLabels = workspaceService.activeTargetLabels?.get();
	input.setTargetLabels(
		targetLabels?.harness ?? harnessService.getActiveDescriptor().label,
		targetLabels?.workspace ?? workspaceService.activeProjectLabel.get(),
		targetLabels?.environment,
	);
	const pane = await editorService.openEditor(input, { pinned: true });
	if (pane instanceof AICustomizationManagementEditor) {
		pane.selectSectionById(section);
	}
}

/**
 * Custom ActionViewItem for each customization link in the toolbar.
 * Renders icon + label + a single count badge driven by the same
 * observables that feed the customizations editor — so the badge always
 * matches the editor's count exactly.
 */
export class CustomizationLinkViewItem extends BaseActionViewItem {

	private readonly _viewItemDisposables: DisposableStore;
	protected _button: Button | undefined;
	private _countContainer: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _config: ICustomizationItemConfig,
		@IAICustomizationItemsModel private readonly _itemsModel: IAICustomizationItemsModel,
		@IAICustomizationMcpServerCountService private readonly _mcpServerCountService: IAICustomizationMcpServerCountService,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService private readonly _toolEnablementService: IAgentHostToolSetEnablementService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
		this._viewItemDisposables = this._register(new DisposableStore());
	}

	protected override getTooltip(): string | undefined {
		return undefined;
	}

	/**
	 * The categories whose customizations the item counts.
	 */
	protected getCountedConfigs(): readonly ICustomizationItemConfig[] {
		return [this._config];
	}

	/**
	 * The description of the item's suggestion badge while it has one.
	 */
	protected observeBadge(): IObservable<string | undefined> | undefined {
		const section = this._config.section;
		return section && this.instantiationService.invokeFunction(accessor => observeVisibleSectionBadge(accessor, section));
	}

	protected onButtonClick(): void {
		if (this._config.id === CUSTOMIZATION_OVERVIEW_ITEM.id) {
			this.instantiationService.createInstance(ChatCustomizationsTelemetry).logInteraction('buttonClicked', 'sidebar');
		}
		this.actionRunner.run(this._action, this._context);
	}

	override render(container: HTMLElement): void {
		this._viewItemDisposables.clear();
		this.element = container;
		container.classList.add('customization-link-widget', 'sidebar-action');

		// Button (left) - uses supportIcons to render codicon in label
		const buttonContainer = append(container, $('.customization-link-button-container'));
		this._button = this._viewItemDisposables.add(new Button(buttonContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this._button.element.classList.add('customization-link-button', 'sidebar-action-button');
		this._button.label = `$(${this._config.icon.id}) ${this._config.label}`;
		this.updateEnabled();

		this._viewItemDisposables.add(this._button.onDidClick(() => this.onButtonClick()));

		// Count container (inside button, floating right)
		this._countContainer = append(this._button.element, $('span.customization-link-counts'));

		const countedConfigs = this.getCountedConfigs();
		this._viewItemDisposables.add(autorun(reader => {
			let count = 0;
			for (const config of countedConfigs) {
				count += readCustomizationCount(config, reader, this._itemsModel, this._mcpServerCountService, this._toolsService, this._toolEnablementService);
			}
			if (this._countContainer) {
				this._renderTotalCount(this._countContainer, count);
			}
		}));

		const badge = this.observeBadge();
		if (badge) {
			this._renderBadge(this._button, badge);
		}
	}

	private _renderBadge(button: Button, description: IObservable<string | undefined>): void {
		const badge = append(button.element, $('span.ai-customization-suggestion-badge.hidden', { role: 'img' }));
		this._viewItemDisposables.add(autorun(reader => {
			const content = description.read(reader);
			badge.classList.toggle('hidden', content === undefined);
			if (content !== undefined) {
				badge.setAttribute('aria-label', content);
				reader.store.add(this._hoverService.setupDelayedHover(button.element, { content }));
			} else {
				badge.removeAttribute('aria-label');
			}
		}));
	}

	override focus(): void {
		if (this._button) {
			this._button.element.tabIndex = 0;
			this._button.focus();
		}
	}

	override blur(): void {
		if (this._button) {
			this._button.element.blur();
			this._button.element.tabIndex = -1;
		}
	}

	override setFocusable(focusable: boolean): void {
		if (this.element) {
			this.element.tabIndex = -1;
		}
		if (this._button) {
			this._button.element.tabIndex = focusable ? 0 : -1;
		}
	}

	protected override updateEnabled(): void {
		if (this._button) {
			this._button.enabled = this._action.enabled;
		}
	}

	private _renderTotalCount(container: HTMLElement, count: number): void {
		container.textContent = '';
		container.classList.toggle('hidden', count === 0);
		if (count > 0) {
			const badge = append(container, $('span.source-count-badge'));
			const num = append(badge, $('span.source-count-num'));
			num.textContent = `${count}`;
		}
	}
}

/**
 * The More or Less row of the reduced Customizations section, which shows or hides in place the categories that the
 * section hides by default. More counts the customizations of those that are available, and shows the badge of the
 * first of them that has one.
 */
export class CustomizationsMoreViewItem extends CustomizationLinkViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _expanded: boolean,
		private readonly _moreConfigs: readonly ICustomizationItemConfig[],
		@IAICustomizationItemsModel itemsModel: IAICustomizationItemsModel,
		@IAICustomizationMcpServerCountService mcpServerCountService: IAICustomizationMcpServerCountService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService toolEnablementService: IAgentHostToolSetEnablementService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(action, options, { id: action.id, label: action.label, icon: _expanded ? Codicon.chevronUp : Codicon.ellipsis }, itemsModel, mcpServerCountService, toolsService, toolEnablementService, hoverService, instantiationService);
	}

	protected override getCountedConfigs(): readonly ICustomizationItemConfig[] {
		return this._expanded ? [] : this._moreConfigs;
	}

	protected override observeBadge(): IObservable<string | undefined> | undefined {
		if (this._expanded) {
			return undefined;
		}
		const sections = new Set(this._moreConfigs.flatMap(config => config.section ? [config.section] : []));
		return this.instantiationService.invokeFunction(accessor => observeVisibleSectionsBadge(accessor, sections));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._button?.element.setAttribute('aria-expanded', String(this._expanded));
	}
}

class SessionsCustomizationsActionViewItemFactory {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	create(action: MenuItemAction, options: IActionViewItemOptions, location: 'sidebar' | 'chatToolbar' | 'chatInput'): ChatCustomizationsActionViewItem {
		return this.instantiationService.createInstance(
			ChatCustomizationsActionViewItem, action, options,
			this.instantiationService.createInstance(ChatCustomizationsHover),
			location, undefined, location === 'sidebar', this.instantiationService.invokeFunction(observeVisibleSectionsBadge),
		);
	}
}

// --- Register actions and view items --- //

export class CustomizationsToolbarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsCustomizationsToolbar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const location = ChatCustomizationsLocationContext.bindTo(contextKeyService);
		const updateLocation = () => location.set(resolveChatCustomizationsLocation(
			configurationService.getValue<ChatCustomizationsLocation>(ChatConfiguration.ChatCustomizationsLocation),
			true,
			configurationService.getValue<boolean>(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING) && !configurationService.getValue<boolean>(SESSIONS_SIDEBAR_CUSTOMIZATIONS_AT_BOTTOM_SETTING),
		));
		updateLocation();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsLocation) || event.affectsConfiguration(SESSIONS_SIDEBAR_SEPARATE_NAVIGATION_SETTING) || event.affectsConfiguration(SESSIONS_SIDEBAR_CUSTOMIZATIONS_AT_BOTTOM_SETTING)) {
				updateLocation();
			}
		}));
		const openCustomizations = 'sessions.openCustomizationsAtLocation';
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: openCustomizations,
					title: localize('customizationsEntryPoint', "Customizations"),
					precondition: ChatContextKeys.enabled,
				});
			}
			async run(accessor: ServicesAccessor, context?: unknown): Promise<void> {
				const hostService = accessor.get(IFocusedSessionHostService);
				const editorService = accessor.get(IEditorService);
				const harnessService = accessor.get(ICustomizationHarnessService);
				const workspaceService = accessor.get(IAICustomizationWorkspaceService);
				const sessionsService = accessor.get(ISessionsManagementService);
				const hover = accessor.get(IInstantiationService).createInstance(ChatCustomizationsHover);
				const explicitResource = hover.getExplicitSessionResource(context);
				const resource = explicitResource ?? hover.getSessionResource();
				const target = sessionsService.getSession(resource) ?? sessionsService.getSessionForChatResource(resource)?.session;
				const ignored = getIgnoredCustomizationMigrationGroups(accessor.get(IStorageService), getChatSessionType(resource), hover.getProjectRoot(resource));
				const hint = await accessor.get(ICustomizationMigrationService).computeMigrationHint(resource, CancellationToken.None, ignored);
				await openCustomizationOverviewPage(editorService, harnessService, hostService, workspaceService, { migration: !!hint }, target, explicitResource);
			}
		}));
		for (const menu of [Menus.SessionBarToolbar, Menus.NewSessionGlobalToolbar, Menus.SidebarCustomizationsEntryPoint, MenuId.ChatExecute]) {
			const sidebar = menu === Menus.SidebarCustomizationsEntryPoint;
			const input = menu === MenuId.ChatExecute;
			const when = ContextKeyExpr.and(ChatContextKeys.enabled, ChatCustomizationsLocationContext.isEqualTo(input ? 'chatInput' : sidebar ? 'sidebar' : 'chatToolbar'));
			this._register(MenuRegistry.appendMenuItem(menu, {
				command: {
					id: openCustomizations,
					title: localize('customizationsEntryPoint', "Customizations"),
					icon: sidebar ? undefined : Codicon.extensions,
				},
				group: 'navigation',
				order: input ? -12 : 6,
				when: input
					? ContextKeyExpr.and(when, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.inQuickChat.negate(), ChatContextKeys.currentlyEditing.negate())
					: when,
			}));
			this._register(actionViewItemService.register(menu, openCustomizations, (action, options, scopedInstantiationService) => action instanceof MenuItemAction
				? scopedInstantiationService.createInstance(SessionsCustomizationsActionViewItemFactory).create(action, options, input ? 'chatInput' : sidebar ? 'sidebar' : 'chatToolbar')
				: undefined, undefined));
		}

		// Per-section visibility context keys, kept in sync with the active
		// harness's `hiddenSections`. Each customization action's menu entry
		// is gated on its key so that harnesses (e.g. Claude, AHP) which
		// don't support a customization type don't surface its row.
		const visibilityKeys = new Map<string, IContextKey<boolean>>();
		for (const config of CUSTOMIZATION_ITEMS) {
			if (!config.section) {
				continue;
			}
			const key = new RawContextKey<boolean>(customizationSectionVisibleKey(config.section), true).bindTo(contextKeyService);
			visibilityKeys.set(config.section, key);
		}
		this._register(autorun(reader => {
			const activeHarness = harnessService.activeHarness.read(reader);
			harnessService.availableHarnesses.read(reader);
			const descriptor = harnessService.getActiveDescriptor();
			const hidden = new Set(descriptor.hiddenSections ?? []);
			for (const config of CUSTOMIZATION_ITEMS) {
				if (!config.section) {
					continue;
				}
				const supported = config.section === AICustomizationManagementSection.HarnessSettings
					? activeHarness === SessionType.AgentHostCodex
					: config.section === AICustomizationManagementSection.Canvases
						? isCopilotCliSessionType(activeHarness)
						: true;
				visibilityKeys.get(config.section)!.set(!hidden.has(config.section) && supported);
			}
		}));

		// Command enablement context keys, kept in sync with where the sidebar offers the item.
		for (const config of CUSTOMIZATION_ITEMS) {
			const enablementContextKey = config.command?.enablementContextKey;
			if (!config.section || !enablementContextKey) {
				continue;
			}
			const when = customizationItemWhen(config, config.section);
			const whenKeys = new Set(when?.keys());
			const enabled = new RawContextKey<boolean>(enablementContextKey, false).bindTo(contextKeyService);
			const update = () => enabled.set(!when || contextKeyService.contextMatchesRules(when));
			update();
			this._register(contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(whenKeys)) {
					update();
				}
			}));
		}

		this._register(actionViewItemService.register(Menus.SidebarCustomizations, CUSTOMIZATION_OVERVIEW_ITEM.id, (action, options) => {
			return instantiationService.createInstance(CustomizationLinkViewItem, action, options, CUSTOMIZATION_OVERVIEW_ITEM);
		}, undefined));

		// More and Less show and hide in place the categories that the reduced section hides by default, and the
		// section remembers which of them was used last.
		const moreItems = CUSTOMIZATION_ITEMS.flatMap(config => config.section && !config.showWhenReduced ? [{ config, when: customizationItemWhen(config, config.section) }] : []);
		const moreAvailable = CustomizationsMoreAvailableContext.bindTo(contextKeyService);
		const moreAvailableKeys = new Set(moreItems.flatMap(item => item.when?.keys() ?? []));
		const updateMoreAvailable = () => moreAvailable.set(moreItems.some(item => contextKeyService.contextMatchesRules(item.when)));
		updateMoreAvailable();
		this._register(contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(moreAvailableKeys)) {
				updateMoreAvailable();
			}
		}));
		const showMore = CustomizationsShowMoreContext.bindTo(contextKeyService);
		const updateShowMore = () => showMore.set(storageService.getBoolean(CUSTOMIZATIONS_SHOW_MORE_STORAGE_KEY, StorageScope.PROFILE, false));
		updateShowMore();
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, CUSTOMIZATIONS_SHOW_MORE_STORAGE_KEY, this._store)(updateShowMore));
		for (const expanded of [false, true]) {
			const id = expanded ? SHOW_LESS_CUSTOMIZATIONS_COMMAND_ID : SHOW_MORE_CUSTOMIZATIONS_COMMAND_ID;
			this._register(actionViewItemService.register(Menus.SidebarCustomizations, id, (action, options) => instantiationService.createInstance(
				CustomizationsMoreViewItem, action, options, expanded,
				moreItems.filter(item => contextKeyService.contextMatchesRules(item.when)).map(item => item.config),
			), undefined));
			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id,
						title: expanded ? localize('lessCustomizations', "Less") : localize('moreCustomizations', "More"),
						precondition: ChatContextKeys.enabled,
						menu: {
							id: Menus.SidebarCustomizations,
							group: 'navigation',
							order: SHOW_MORE_OR_LESS_ORDER,
							when: ContextKeyExpr.and(ChatContextKeys.enabled, CUSTOMIZATIONS_REDUCED, CustomizationsMoreAvailableContext, expanded ? CustomizationsShowMoreContext : CustomizationsShowMoreContext.negate()),
						},
					});
				}
				run(accessor: ServicesAccessor): void {
					accessor.get(IStorageService).store(CUSTOMIZATIONS_SHOW_MORE_STORAGE_KEY, !expanded, StorageScope.PROFILE, StorageTarget.USER);
				}
			}));
		}

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: CUSTOMIZATION_OVERVIEW_ITEM.id,
					title: CUSTOMIZATION_OVERVIEW_ITEM.label,
					precondition: ChatContextKeys.enabled,
					menu: {
						id: Menus.SidebarCustomizations,
						group: 'navigation',
						order: 0,
						when: ChatContextKeys.enabled,
					}
				});
			}
			async run(accessor: ServicesAccessor, options?: IOpenAICustomizationsCommandOptions): Promise<void> {
				await openCustomizationOverviewPage(
					accessor.get(IEditorService),
					accessor.get(ICustomizationHarnessService),
					accessor.get(IFocusedSessionHostService),
					accessor.get(IAICustomizationWorkspaceService),
					options,
				);
			}
		}));

		for (const [index, config] of CUSTOMIZATION_ITEMS.entries()) {
			if (!config.section) {
				continue;
			}
			const section = config.section;
			// Register the custom ActionViewItem for this action
			this._register(actionViewItemService.register(Menus.SidebarCustomizations, config.id, (action, options) => {
				return instantiationService.createInstance(CustomizationLinkViewItem, action, options, config);
			}, undefined));

			const combinedWhen = customizationItemWhen(config, section);

			// Register the action with menu item
			this._register(registerAction2(class extends Action2 {
				constructor() {
					const order = index + 1;
					const menu = config.showWhenReduced
						? { id: Menus.SidebarCustomizations, group: 'navigation', order, when: combinedWhen }
						: [
							{ id: Menus.SidebarCustomizations, group: 'navigation', order, when: ContextKeyExpr.and(combinedWhen, CUSTOMIZATIONS_REDUCED.negate()) },
							{ id: Menus.SidebarCustomizations, group: 'navigation', order: MORE_CUSTOMIZATIONS_ORDER + order, when: ContextKeyExpr.and(combinedWhen, CUSTOMIZATIONS_REDUCED, CustomizationsShowMoreContext) },
						];
					super(config.command ? {
						id: config.id,
						title: config.command.title,
						category: config.command.category,
						f1: true,
						// Offers the command where the sidebar offers the item. Its keybinding is registered on load, below.
						precondition: combinedWhen,
						menu,
					} : {
						id: config.id,
						title: config.label,
						menu,
					});
				}
				async run(accessor: ServicesAccessor): Promise<void> {
					const editorService = accessor.get(IEditorService);
					const harnessService = accessor.get(ICustomizationHarnessService);
					await openCustomizationSectionPage(editorService, harnessService, accessor.get(IFocusedSessionHostService), accessor.get(IAICustomizationWorkspaceService), section);
				}
			}));
		}
	}
}

registerSingleton(IAICustomizationMcpServerCountService, AICustomizationMcpServerCountService, InstantiationType.Delayed);

// Registered on load rather than with the toolbar's commands: the keybinding service
// does not pick up keybindings registered after it first resolves keybindings.
for (const config of CUSTOMIZATION_ITEMS) {
	if (config.section && config.command?.keybinding) {
		const enablementContextKey = config.command.enablementContextKey;
		KeybindingsRegistry.registerKeybindingRule({
			id: config.id,
			primary: config.command.keybinding,
			weight: KeybindingWeight.WorkbenchContrib,
			// Where the sidebar offers the item, like the command's precondition.
			when: enablementContextKey ? ContextKeyExpr.has(enablementContextKey) : customizationItemWhen(config, config.section),
		});
	}
}

registerWorkbenchContribution2(CustomizationsToolbarContribution.ID, CustomizationsToolbarContribution, WorkbenchPhase.AfterRestored);

/**
 * Returns the harness id that matches a given session, or `undefined` if no
 * harness is registered for it.
 *
 * The session's `resource.scheme` is the per-host harness id (e.g. local AHP
 * uses `agent-host-${provider}` and remote AHP uses `remote-${authority}-${provider}`),
 * while {@link ISession.sessionType} is the agent provider name shared across
 * hosts (e.g. `copilotcli`). Lookup therefore prefers the resource scheme so
 * that an AHP remote session selects its remote harness rather than the local
 * harness with the same `sessionType`. The `sessionType` is kept as a fallback
 * for harnesses whose id matches it directly.
 */
export function findHarnessIdForSession(session: ISession | undefined, harnessService: ICustomizationHarnessService): string | undefined {
	if (!session) {
		return undefined;
	}
	const schemeId = session.resource.scheme;
	if (harnessService.findHarnessById(schemeId)) {
		return schemeId;
	}
	if (harnessService.findHarnessById(session.sessionType)) {
		return session.sessionType;
	}
	return undefined;
}

/**
 * Keeps the active customization harness in sync with the currently active
 * session. This drives the customizations sidebar (counts, filtering) and the
 * customizations editor so they reflect the harness that matches the session
 * the user is interacting with.
 *
 * This covers two cases identically:
 *  - opening / navigating into an existing session
 *  - selecting "New session in {workspace}" (which sets a pending active
 *    session before the user has sent the first request)
 */
export class ActiveSessionHarnessSyncContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsActiveHarnessSync';

	constructor(
		@IFocusedSessionHostService focusedSessionHostService: IFocusedSessionHostService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
	) {
		super();

		this._register(autorun(reader => {
			const session = focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			if (!session) {
				return;
			}
			// Re-read available harnesses so we re-run when an external harness
			// (e.g. agent host, CLI) registers asynchronously after the session
			// has already been selected.
			harnessService.availableHarnesses.read(reader);
			harnessService.setActiveSession(session.resource);
		}));
	}
}

registerWorkbenchContribution2(ActiveSessionHarnessSyncContribution.ID, ActiveSessionHarnessSyncContribution, WorkbenchPhase.AfterRestored);
