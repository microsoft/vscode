/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { ICustomizationMigrationAvailabilityService } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationAvailabilityService.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, IAgentHostToolSetEnablementService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { Menus } from '../../../browser/menus.js';
import { agentIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, hookIcon, toolsIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { ActionViewItem, IActionViewItemOptions, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { $, append, reset } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { SessionIsCreatedContext } from '../../../common/contextkeys.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { OPEN_CUSTOMIZATIONS_COMMAND_ID } from '../../../common/customizations.js';

export interface ICustomizationItemConfig {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly section?: typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection];
	/** If set, count comes from `IAICustomizationItemsModel.getCount(modelSection)`. */
	readonly modelSection?: ItemsModelSection;
	readonly isMcp?: boolean;
	readonly isPlugins?: boolean;
	readonly isTools?: boolean;
	/** Additional `when` clause beyond the standard harness-visibility gate. */
	readonly when?: ContextKeyExpression;
}

/**
 * Per-section context key indicating whether the active harness exposes
 * the section in the sidebar customizations toolbar. Driven by
 * `IHarnessDescriptor.hiddenSections` and consumed via the menu `when`
 * clause registered alongside each customization action.
 */
function customizationSectionVisibleKey(section: string): string {
	return `sessionsCustomizationSectionVisible.${section}`;
}

const CUSTOMIZATION_OVERVIEW_ITEM: ICustomizationItemConfig = {
	id: OPEN_CUSTOMIZATIONS_COMMAND_ID,
	label: localize('overview', "Overview"),
	icon: Codicon.home,
};

const CUSTOMIZATION_ENTRY_POINTS_ENABLED = ContextKeyExpr.equals(`config.${ChatConfiguration.CustomizationEntryPoints}`, true);
const CUSTOMIZATION_ENTRY_POINTS_DISABLED = ContextKeyExpr.equals(`config.${ChatConfiguration.CustomizationEntryPoints}`, false);

export const CUSTOMIZATION_ITEMS: ICustomizationItemConfig[] = [
	{
		id: 'sessions.customization.plugins',
		label: localize('plugins', "Plugins"),
		icon: pluginIcon,
		section: AICustomizationManagementSection.Plugins,
		isPlugins: true,
	},
	{
		id: 'sessions.customization.mcpServers',
		label: localize('mcpServers', "MCP Servers"),
		icon: mcpServerIcon,
		section: AICustomizationManagementSection.McpServers,
		isMcp: true,
	},
	{
		id: 'sessions.customization.skills',
		label: localize('skills', "Skills"),
		icon: skillIcon,
		section: AICustomizationManagementSection.Skills,
		modelSection: AICustomizationManagementSection.Skills,
	},
	{
		id: 'sessions.customization.instructions',
		label: localize('instructions', "Instructions"),
		icon: instructionsIcon,
		section: AICustomizationManagementSection.Instructions,
		modelSection: AICustomizationManagementSection.Instructions,
	},
	{
		id: 'sessions.customization.agents',
		label: localize('agents', "Agents"),
		icon: agentIcon,
		section: AICustomizationManagementSection.Agents,
		modelSection: AICustomizationManagementSection.Agents,
	},
	{
		id: 'sessions.customization.hooks',
		label: localize('hooks', "Hooks"),
		icon: hookIcon,
		section: AICustomizationManagementSection.Hooks,
		modelSection: AICustomizationManagementSection.Hooks,
	},
	{
		id: 'sessions.customization.tools',
		label: localize('tools', "Tools"),
		icon: toolsIcon,
		section: AICustomizationManagementSection.Tools,
		isTools: true,
	},
	{
		id: 'sessions.customization.harnessSettings',
		label: localize('harnessSettings', "Codex"),
		icon: Codicon.openai,
		section: AICustomizationManagementSection.HarnessSettings,
	},
];

export async function openCustomizationOverviewPage(editorService: IEditorService, harnessService: ICustomizationHarnessService, sessionsService: ISessionsService, session?: IActiveSession): Promise<void> {
	if (session) {
		sessionsService.setActive(session);
	}
	const targetSession = session ?? sessionsService.activeSession.get();
	if (targetSession) {
		harnessService.setActiveSession(targetSession.resource);
	}

	const input = AICustomizationManagementEditorInput.getOrCreate();
	input.setTargetLabels(harnessService.getActiveDescriptor().label, targetSession?.workspace.get()?.folders[0]?.name);
	const pane = await editorService.openEditor(input, { pinned: true });
	if (pane instanceof AICustomizationManagementEditor) {
		pane.showWelcomePage();
	}
}

async function openCustomizationSectionPage(editorService: IEditorService, harnessService: ICustomizationHarnessService, sessionsService: ISessionsService, section: typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection]): Promise<void> {
	const session = sessionsService.activeSession.get();
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
export class CustomizationLinkViewItem extends ActionViewItem {

	private readonly _viewItemDisposables: DisposableStore;
	private _button: Button | undefined;
	private _countContainer: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _config: ICustomizationItemConfig,
		@IAICustomizationItemsModel private readonly _itemsModel: IAICustomizationItemsModel,
		@IMcpService private readonly _mcpService: IMcpService,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService private readonly _toolEnablementService: IAgentHostToolSetEnablementService,
	) {
		super(undefined, action, { ...options, icon: false, label: false });
		this._viewItemDisposables = this._register(new DisposableStore());
	}

	protected override getTooltip(): string | undefined {
		return undefined;
	}

	override render(container: HTMLElement): void {
		super.render(container);
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

		this._viewItemDisposables.add(this._button.onDidClick(() => {
			this._action.run();
		}));

		// Count container (inside button, floating right)
		this._countContainer = append(this._button.element, $('span.customization-link-counts'));

		this._viewItemDisposables.add(autorun(reader => {
			const count = this._readCount(reader);
			if (this._countContainer) {
				this._renderTotalCount(this._countContainer, count);
			}
		}));
	}

	private _readCount(reader: Parameters<Parameters<typeof autorun>[0]>[0]): number {
		if (this._config.modelSection) {
			return this._itemsModel.getCount(this._config.modelSection).read(reader);
		}
		if (this._config.isMcp) {
			return this._mcpService.servers.read(reader).length;
		}
		if (this._config.isPlugins) {
			return this._itemsModel.getPluginCount().read(reader);
		}
		if (this._config.isTools) {
			const state = this._toolEnablementService.observe(AGENT_HOST_COPILOT_CLI_SESSION_TYPE).read(reader);
			const toolSets = this._toolsService.toolSets.read(reader);
			return countEnabledCustomizationTools(toolSets, state, reader);
		}
		return 0;
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

function isActiveSessionContext(context: unknown): context is IActiveSession {
	return typeof context === 'object' && context !== null && 'sessionId' in context && 'resource' in context && 'workspace' in context;
}

class CustomizationsToolbarActionViewItem extends ActionViewItem {
	private readonly session = observableValue<IActiveSession | undefined>(this, undefined);
	private tooltip = '';

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@ISessionsService sessionsService: ISessionsService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@ICustomizationMigrationAvailabilityService migrationAvailabilityService: ICustomizationMigrationAvailabilityService,
	) {
		super(undefined, action, { ...options, icon: true, label: true });

		this._register(autorun(reader => {
			const session = this.session.read(reader);
			const activeSession = sessionsService.activeSession.read(reader);
			harnessService.activeHarness.read(reader);
			harnessService.availableHarnesses.read(reader);
			const isActiveSession = session?.sessionId === activeSession?.sessionId;
			const harnessLabel = session
				? isActiveSession
					? harnessService.getActiveDescriptor().label
					: harnessService.findHarnessById(findHarnessIdForSession(session, harnessService) ?? '')?.label
				: undefined;
			const workspaceLabel = session?.workspace.read(reader)?.folders[0]?.name;
			const hasMigrations = isActiveSession && migrationAvailabilityService.candidateCount.read(reader) > 0;
			this.updatePresentation(harnessLabel, workspaceLabel, hasMigrations);
		}));
	}

	override setActionContext(context: unknown): void {
		super.setActionContext(context);
		this.session.set(isActiveSessionContext(context) ? context : undefined, undefined);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('sessions-customize-toolbar-action');
	}

	protected override getTooltip(): string {
		return this.tooltip;
	}

	protected override updateLabel(): void {
		if (this.label) {
			const text = $('span.sessions-customize-toolbar-label');
			text.textContent = localize('customizeActionLabel', "Customize");
			reset(this.label, text);
		}
	}

	private updatePresentation(harnessLabel: string | undefined, workspaceLabel: string | undefined, hasMigrations: boolean): void {
		let tooltip: string;
		if (harnessLabel && workspaceLabel) {
			tooltip = localize('customizeHarnessForWorkspace', "Customize {0} for {1}", harnessLabel, workspaceLabel);
		} else if (harnessLabel) {
			tooltip = localize('customizeHarness', "Customize {0}", harnessLabel);
		} else if (workspaceLabel) {
			tooltip = localize('customizeWorkspace', "Customize for {0}", workspaceLabel);
		} else {
			tooltip = localize('openCustomizationsTooltip', "Open Customizations");
		}
		this.tooltip = hasMigrations
			? localize('customizeMigrationsAvailable', "{0}, migrations available", tooltip)
			: tooltip;
		this.updateTooltip();
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
				const supported = config.section !== AICustomizationManagementSection.HarnessSettings || activeHarness === SessionType.AgentHostCodex;
				visibilityKeys.get(config.section)!.set(!hidden.has(config.section) && supported);
			}
		}));

		this._register(actionViewItemService.register(Menus.SidebarCustomizations, CUSTOMIZATION_OVERVIEW_ITEM.id, (action, options) => {
			return instantiationService.createInstance(CustomizationLinkViewItem, action, options, CUSTOMIZATION_OVERVIEW_ITEM);
		}, undefined));
		this._register(actionViewItemService.register(Menus.SessionBarToolbar, CUSTOMIZATION_OVERVIEW_ITEM.id, (action, options) => {
			return instantiationService.createInstance(CustomizationsToolbarActionViewItem, action, options);
		}, undefined));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: CUSTOMIZATION_OVERVIEW_ITEM.id,
					title: localize('openCustomizations', "Open Customizations"),
					icon: Codicon.tools,
					precondition: ChatContextKeys.enabled,
					menu: [{
						id: Menus.SidebarCustomizations,
						group: 'navigation',
						order: 0,
						when: ContextKeyExpr.and(ChatContextKeys.enabled, CUSTOMIZATION_ENTRY_POINTS_DISABLED),
					}, {
						id: Menus.SessionBarToolbar,
						group: 'navigation',
						order: 10,
						when: ContextKeyExpr.and(SessionIsCreatedContext, ChatContextKeys.enabled, CUSTOMIZATION_ENTRY_POINTS_ENABLED),
					}, {
						id: Menus.SessionHeaderContext,
						group: '2_edit',
						order: 2,
						when: ContextKeyExpr.and(SessionIsCreatedContext, ChatContextKeys.enabled, CUSTOMIZATION_ENTRY_POINTS_ENABLED),
					}],
				});
			}
			async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
				await openCustomizationOverviewPage(
					accessor.get(IEditorService),
					accessor.get(ICustomizationHarnessService),
					accessor.get(ISessionsService),
					session,
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

			const sectionVisibleWhen = ContextKeyExpr.has(customizationSectionVisibleKey(section));
			const combinedWhen = config.when
				? ContextKeyExpr.and(ChatContextKeys.enabled, CUSTOMIZATION_ENTRY_POINTS_DISABLED, sectionVisibleWhen, config.when)
				: ContextKeyExpr.and(ChatContextKeys.enabled, CUSTOMIZATION_ENTRY_POINTS_DISABLED, sectionVisibleWhen);

			// Register the action with menu item
			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: config.id,
						title: config.label,
						menu: {
							id: Menus.SidebarCustomizations,
							group: 'navigation',
							order: index + 1,
							when: combinedWhen,
						}
					});
				}
				async run(accessor: ServicesAccessor): Promise<void> {
					const editorService = accessor.get(IEditorService);
					const harnessService = accessor.get(ICustomizationHarnessService);
					const sessionsService = accessor.get(ISessionsService);
					await openCustomizationSectionPage(editorService, harnessService, sessionsService, section);
				}
			}));
		}
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
		@ISessionsService sessionsService: ISessionsService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
	) {
		super();

		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
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
