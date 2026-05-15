/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IAICustomizationItemsModel, ItemsModelSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { Menus } from '../../../browser/menus.js';
import { agentIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, hookIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun } from '../../../../base/common/observable.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';

/**
 * Setting key that controls how the Customizations section in the Agents
 * sidebar is presented and what happens when an entry is clicked.
 *
 * This setting is registered (and only meaningful) in the Agents app.
 */
export const SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING = 'sessions.customizations.sidebarMode';

/**
 * Presentation/click behavior for the Customizations section in the Agents sidebar.
 * See {@link SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING}.
 */
export enum SessionsCustomizationsSidebarMode {
	/** One item per category; click opens the welcome page. */
	Welcome = 'welcome',
	/** One item per category; click deep-links to that category. */
	Section = 'section',
	/** A single "Customizations" entry that opens the welcome page. */
	Single = 'single',
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING]: {
			type: 'string',
			tags: ['preview'],
			enum: [
				SessionsCustomizationsSidebarMode.Welcome,
				SessionsCustomizationsSidebarMode.Section,
				SessionsCustomizationsSidebarMode.Single,
			],
			enumDescriptions: [
				localize('sessions.customizations.sidebarMode.welcome', "Show one item per customization category. Clicking a category opens the Customizations welcome page."),
				localize('sessions.customizations.sidebarMode.section', "Show one item per customization category. Clicking a category deep-links to that category's section in the Customizations editor."),
				localize('sessions.customizations.sidebarMode.single', "Show a single \"Customizations\" entry instead of one item per category. Clicking it opens the Customizations welcome page."),
			],
			description: localize('sessions.customizations.sidebarMode', "Controls how the Customizations section in the Agents sidebar is presented and what happens when an entry is clicked."),
			default: SessionsCustomizationsSidebarMode.Welcome,
		},
	},
});

export interface ICustomizationItemConfig {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly section: typeof AICustomizationManagementSection[keyof typeof AICustomizationManagementSection];
	/** If set, count comes from `IAICustomizationItemsModel.getCount(modelSection)`. */
	readonly modelSection?: ItemsModelSection;
	readonly isMcp?: boolean;
	readonly isPlugins?: boolean;
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

export const CUSTOMIZATION_ITEMS: ICustomizationItemConfig[] = [
	{
		id: 'sessions.customization.agents',
		label: localize('agents', "Agents"),
		icon: agentIcon,
		section: AICustomizationManagementSection.Agents,
		modelSection: AICustomizationManagementSection.Agents,
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
		id: 'sessions.customization.hooks',
		label: localize('hooks', "Hooks"),
		icon: hookIcon,
		section: AICustomizationManagementSection.Hooks,
		modelSection: AICustomizationManagementSection.Hooks,
	},
	{
		id: 'sessions.customization.mcpServers',
		label: localize('mcpServers', "MCP Servers"),
		icon: mcpServerIcon,
		section: AICustomizationManagementSection.McpServers,
		isMcp: true,
	},
	{
		id: 'sessions.customization.plugins',
		label: localize('plugins', "Plugins"),
		icon: pluginIcon,
		section: AICustomizationManagementSection.Plugins,
		isPlugins: true,
	},
];

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
			const key = new RawContextKey<boolean>(customizationSectionVisibleKey(config.section), true).bindTo(contextKeyService);
			visibilityKeys.set(config.section, key);
		}
		this._register(autorun(reader => {
			harnessService.activeHarness.read(reader);
			harnessService.availableHarnesses.read(reader);
			const descriptor = harnessService.getActiveDescriptor();
			const hidden = new Set(descriptor.hiddenSections ?? []);
			for (const config of CUSTOMIZATION_ITEMS) {
				visibilityKeys.get(config.section)!.set(!hidden.has(config.section));
			}
		}));

		for (const [index, config] of CUSTOMIZATION_ITEMS.entries()) {
			// Register the custom ActionViewItem for this action
			this._register(actionViewItemService.register(Menus.SidebarCustomizations, config.id, (action, options) => {
				return instantiationService.createInstance(CustomizationLinkViewItem, action, options, config);
			}, undefined));

			const sectionVisibleWhen = ContextKeyExpr.has(customizationSectionVisibleKey(config.section));

			// Register the action with menu item
			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: config.id,
						title: localize2('customizationAction', '{0}', config.label),
						menu: {
							id: Menus.SidebarCustomizations,
							group: 'navigation',
							order: index + 1,
							when: sectionVisibleWhen,
						}
					});
				}
				async run(accessor: ServicesAccessor): Promise<void> {
					const editorService = accessor.get(IEditorService);
					const harnessService = accessor.get(ICustomizationHarnessService);
					const sessionsManagementService = accessor.get(ISessionsManagementService);
					const configurationService = accessor.get(IConfigurationService);
					const harnessId = findHarnessIdForSession(sessionsManagementService.activeSession.get(), harnessService);
					if (harnessId) {
						harnessService.setActiveHarness(harnessId);
					}
					const input = AICustomizationManagementEditorInput.getOrCreate();
					const pane = await editorService.openEditor(input, { pinned: true });
					if (pane instanceof AICustomizationManagementEditor) {
						const mode = configurationService.getValue<string>(SESSIONS_CUSTOMIZATIONS_SIDEBAR_MODE_SETTING);
						if (mode === SessionsCustomizationsSidebarMode.Section) {
							pane.selectSectionById(config.section);
						} else {
							// 'welcome' (default) and 'single' both land on the welcome page.
							pane.showWelcomePage();
						}
					}
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
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
	) {
		super();

		this._register(autorun(reader => {
			const session = sessionsManagementService.activeSession.read(reader);
			if (!session) {
				return;
			}
			// Re-read available harnesses so we re-run when an external harness
			// (e.g. agent host, CLI) registers asynchronously after the session
			// has already been selected.
			harnessService.availableHarnesses.read(reader);
			const harnessId = findHarnessIdForSession(session, harnessService);
			if (harnessId) {
				harnessService.setActiveHarness(harnessId);
			}
		}));
	}
}

registerWorkbenchContribution2(ActiveSessionHarnessSyncContribution.ID, ActiveSessionHarnessSyncContribution, WorkbenchPhase.AfterRestored);
