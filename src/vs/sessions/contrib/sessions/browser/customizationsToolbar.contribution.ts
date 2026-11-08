/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../workbench/contrib/sessions/browser/media/sidebarActionButton.css';
import '../../../../workbench/contrib/sessions/browser/media/customizationsToolbar.css';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
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
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun } from '../../../../base/common/observable.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { IFocusedSessionHostService } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { AICustomizationMcpServerCountService, IAICustomizationMcpServerCountService } from '../../../../workbench/contrib/sessions/browser/customizationMcpServerCount.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IOpenAICustomizationsCommandOptions, OPEN_AI_CUSTOMIZATIONS_COMMAND_ID } from '../../../../workbench/contrib/sessions/browser/customizationsConstants.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getExtensionSuggestionsBadgeDescription, IAgentsWindowExtensionSuggestionsService } from '../../../../workbench/contrib/sessions/browser/agentsWindowExtensionSuggestions.js';
import { ICustomizationItemConfig, readCustomizationCount, CUSTOMIZATION_ITEMS } from '../../../../workbench/contrib/sessions/browser/customizationItems.js';

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

async function openCustomizationOverviewPage(editorService: IEditorService, harnessService: ICustomizationHarnessService, focusedSessionHostService: IFocusedSessionHostService, options?: IOpenAICustomizationsCommandOptions): Promise<void> {
	const session = focusedSessionHostService.focusedHost.get().session.get();
	if (session) {
		harnessService.setActiveSession(session.resource);
	}

	const input = AICustomizationManagementEditorInput.getOrCreate();
	input.setTargetLabels(harnessService.getActiveDescriptor().label, session?.workspace.get()?.folders[0]?.name);
	const pane = await editorService.openEditor(input, { pinned: true });
	if (pane instanceof AICustomizationManagementEditor) {
		if (options?.migration) {
			await pane.startCustomizationMigration();
		} else {
			pane.showWelcomePage();
		}
	}
}

async function openCustomizationSectionPage(editorService: IEditorService, harnessService: ICustomizationHarnessService, focusedSessionHostService: IFocusedSessionHostService, section: typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection]): Promise<void> {
	const session = focusedSessionHostService.focusedHost.get().session.get();
	if (session) {
		harnessService.setActiveSession(session.resource);
	}

	const input = AICustomizationManagementEditorInput.getOrCreate();
	input.setTargetLabels(harnessService.getActiveDescriptor().label, session?.workspace.get()?.folders[0]?.name);
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
	private _button: Button | undefined;
	private _countContainer: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _config: ICustomizationItemConfig,
		@IAICustomizationItemsModel private readonly _itemsModel: IAICustomizationItemsModel,
		@IAICustomizationMcpServerCountService private readonly _mcpServerCountService: IAICustomizationMcpServerCountService,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService private readonly _toolEnablementService: IAgentHostToolSetEnablementService,
		@IAgentsWindowExtensionSuggestionsService private readonly _extensionSuggestionsService: IAgentsWindowExtensionSuggestionsService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(undefined, action, options);
		this._viewItemDisposables = this._register(new DisposableStore());
	}

	protected override getTooltip(): string | undefined {
		return undefined;
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

		this._viewItemDisposables.add(this._button.onDidClick(() => {
			this.actionRunner.run(this._action, this._context);
		}));

		// Count container (inside button, floating right)
		this._countContainer = append(this._button.element, $('span.customization-link-counts'));

		this._viewItemDisposables.add(autorun(reader => {
			const count = readCustomizationCount(this._config, reader, this._itemsModel, this._mcpServerCountService, this._toolsService, this._toolEnablementService);
			if (this._countContainer) {
				this._renderTotalCount(this._countContainer, count);
			}
		}));

		if (this._config.showsExtensionSuggestions) {
			this._renderExtensionSuggestionsBadge(this._button);
		}
	}

	private _renderExtensionSuggestionsBadge(button: Button): void {
		const description = getExtensionSuggestionsBadgeDescription();
		const badge = append(button.element, $('span.ai-customization-suggestion-badge.hidden', { role: 'img', 'aria-label': description }));
		this._viewItemDisposables.add(autorun(reader => {
			const visible = this._extensionSuggestionsService.showBadge.read(reader);
			badge.classList.toggle('hidden', !visible);
			if (visible) {
				reader.store.add(this._hoverService.setupDelayedHover(button.element, { content: description }));
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

// --- Register actions and view items --- //

export class CustomizationsToolbarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsCustomizationsToolbar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

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
					const menu = {
						id: Menus.SidebarCustomizations,
						group: 'navigation',
						order: index + 1,
						when: combinedWhen,
					};
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
					await openCustomizationSectionPage(editorService, harnessService, accessor.get(IFocusedSessionHostService), section);
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
