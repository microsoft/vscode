/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/soloSettingsEditor.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

interface SoloSettingsNavItem {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly active?: boolean;
	readonly external?: boolean;
}

interface SoloSettingsButtonRow {
	readonly title: string;
	readonly description: string;
	readonly buttonLabel: string;
	readonly command: string;
	readonly commandArgs?: unknown[];
}

interface SoloSettingsToggleRow {
	readonly title: string;
	readonly description: string;
	readonly setting: string;
	readonly enabledValue: unknown;
	readonly disabledValue: unknown;
	readonly defaultValue: boolean;
}

export class SoloSettingsEditor extends EditorPane {

	static readonly ID = 'workbench.editor.soloSettings';

	private readonly disposables = this._register(new DisposableStore());
	private root!: HTMLElement;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(SoloSettingsEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.root = DOM.append(parent, DOM.$('.solo-settings-editor'));
		this.render();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration('window.customTitleBarVisibility') ||
				e.affectsConfiguration('workbench.statusBar.visible') ||
				e.affectsConfiguration('window.commandCenter') ||
				e.affectsConfiguration('window.menuBarVisibility')
			) {
				this.render();
			}
		}));
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.render();
	}

	layout(): void {
		// CSS handles the page layout.
	}

	private render(): void {
		if (!this.root) {
			return;
		}

		this.disposables.clear();
		DOM.clearNode(this.root);

		const shell = DOM.append(this.root, DOM.$('.solo-settings-shell'));
		this.renderSidebar(DOM.append(shell, DOM.$('aside.solo-settings-sidebar')));
		this.renderMain(DOM.append(shell, DOM.$('main.solo-settings-main')));
	}

	private renderSidebar(container: HTMLElement): void {
		const profile = DOM.append(container, DOM.$('.solo-settings-profile'));
		DOM.append(profile, DOM.$('.solo-settings-lockup'));
		DOM.append(profile, DOM.$('.solo-settings-profile-plan', undefined, localize('soloSettingsProfilePlan', "Bring your own models")));

		const search = DOM.append(container, DOM.$('input.solo-settings-search')) as HTMLInputElement;
		search.type = 'search';
		search.placeholder = localize('soloSettingsSearchPlaceholder', "Search settings");
		search.setAttribute('aria-label', localize('soloSettingsSearchAria', "Search Solo settings"));

		const groups: SoloSettingsNavItem[][] = [
			[
				{ label: localize('soloSettingsGeneral', "General"), icon: Codicon.settingsGear, active: true },
				{ label: localize('soloSettingsEditorSettings', "Editor Settings"), icon: Codicon.settings, external: true },
			],
			[
				{ label: localize('soloSettingsPlanUsage', "Plan & Usage"), icon: Codicon.graph },
				{ label: localize('soloSettingsAgents', "Agents"), icon: Codicon.sparkle },
				{ label: localize('soloSettingsTab', "Tab"), icon: Codicon.layout },
				{ label: localize('soloSettingsModels', "Models"), icon: Codicon.symbolClass },
				{ label: localize('soloSettingsCloudAgents', "Cloud Agents"), icon: Codicon.cloud },
			],
			[
				{ label: localize('soloSettingsPlugins', "Plugins"), icon: Codicon.extensions },
				{ label: localize('soloSettingsRulesSkills', "Rules, Skills, Subagents"), icon: Codicon.listTree },
				{ label: localize('soloSettingsTools', "Tools & MCPs"), icon: Codicon.tools },
				{ label: localize('soloSettingsHooks', "Hooks"), icon: Codicon.debugAlt },
				{ label: localize('soloSettingsIndexing', "Indexing & Docs"), icon: Codicon.book },
				{ label: localize('soloSettingsNetwork', "Network"), icon: Codicon.globe },
				{ label: localize('soloSettingsBeta', "Beta"), icon: Codicon.beaker },
			],
			[
				{ label: localize('soloSettingsDocs', "Docs"), icon: Codicon.book, external: true },
			],
		];

		for (const group of groups) {
			const section = DOM.append(container, DOM.$('.solo-settings-nav-section'));
			for (const item of group) {
				const navItem = DOM.append(section, DOM.$('button.solo-settings-nav-item')) as HTMLButtonElement;
				navItem.type = 'button';
				navItem.classList.toggle('active', !!item.active);
				navItem.disabled = !item.active && !item.external;
				const icon = DOM.append(navItem, DOM.$('span.solo-settings-nav-icon'));
				icon.className = `solo-settings-nav-icon ${ThemeIcon.asClassName(item.icon)}`;
				DOM.append(navItem, DOM.$('span', undefined, item.label));
				if (item.external) {
					const external = DOM.append(navItem, DOM.$('span.solo-settings-nav-external'));
					external.className = `solo-settings-nav-external ${ThemeIcon.asClassName(Codicon.linkExternal)}`;
				}
				if (item.label === localize('soloSettingsEditorSettings', "Editor Settings")) {
					this.disposables.add(DOM.addDisposableListener(navItem, DOM.EventType.CLICK, () => this.commandService.executeCommand('workbench.action.openSettings2')));
				}
			}
		}
	}

	private renderMain(container: HTMLElement): void {
		DOM.append(container, DOM.$('h1.solo-settings-title', undefined, localize('soloSettingsTitle', "General")));
		this.renderSection(container, undefined, [
			{
				title: localize('soloSettingsAccountTitle', "Solo Account"),
				description: localize('soloSettingsAccountDescription', "Manage your Solo account and connected services."),
				buttonLabel: localize('soloSettingsOpen', "Open"),
				command: 'workbench.action.openSettings2',
				commandArgs: [{ query: '@tag:sync' }]
			},
		]);

		this.renderSelectSection(container);

		this.renderSection(container, localize('soloSettingsPreferences', "Preferences"), [
			{
				title: localize('soloSettingsEditorSettingsTitle', "Editor Settings"),
				description: localize('soloSettingsEditorSettingsDescription', "Configure font, formatting, minimap and more."),
				buttonLabel: localize('soloSettingsOpen', "Open"),
				command: 'workbench.action.openSettings2',
			},
			{
				title: localize('soloSettingsKeyboardTitle', "Keyboard Shortcuts"),
				description: localize('soloSettingsKeyboardDescription', "Configure keyboard shortcuts."),
				buttonLabel: localize('soloSettingsOpen', "Open"),
				command: 'workbench.action.openGlobalKeybindings',
			},
			{
				title: localize('soloSettingsImportTitle', "Import Settings from VS Code"),
				description: localize('soloSettingsImportDescription', "Import settings, extensions, and keybindings from VS Code."),
				buttonLabel: localize('soloSettingsImport', "Import"),
				command: 'workbench.action.openSettings2',
				commandArgs: [{ query: 'settings sync import' }]
			},
			{
				title: localize('soloSettingsResetDontAskTitle', "Reset \"Don't Ask Again\" Dialogs"),
				description: localize('soloSettingsResetDontAskDescription', "See warnings and tips that you've hidden."),
				buttonLabel: localize('soloSettingsShow', "Show"),
				command: 'workbench.action.openSettings2',
				commandArgs: [{ query: 'do not ask' }]
			},
		]);

		this.renderLayoutSection(container);

		this.renderToggleSection(container, localize('soloSettingsNotifications', "Notifications"), [
			{
				title: localize('soloSettingsSystemNotificationsTitle', "System Notifications"),
				description: localize('soloSettingsSystemNotificationsDescription', "Show system notifications when agents complete or need attention."),
				setting: 'window.commandCenter',
				enabledValue: true,
				disabledValue: false,
				defaultValue: true
			},
			{
				title: localize('soloSettingsMenuBarTitle', "Menu Bar Icon"),
				description: localize('soloSettingsMenuBarDescription', "Show Solo controls in the menu bar."),
				setting: 'window.menuBarVisibility',
				enabledValue: 'compact',
				disabledValue: 'hidden',
				defaultValue: true
			},
		]);
	}

	private renderSelectSection(container: HTMLElement): void {
		const section = DOM.append(container, DOM.$('section.solo-settings-section'));
		DOM.append(section, DOM.$('h2.solo-settings-section-title', undefined, localize('soloSettingsPRPreferences', "PR Preferences")));
		const card = DOM.append(section, DOM.$('.solo-settings-card'));
		const row = DOM.append(card, DOM.$('.solo-settings-row'));
		const text = DOM.append(row, DOM.$('.solo-settings-row-text'));
		DOM.append(text, DOM.$('.solo-settings-row-title', undefined, localize('soloSettingsPRDestinationTitle', "Preferred PR destination")));
		DOM.append(text, DOM.$('.solo-settings-row-description', undefined, localize('soloSettingsPRDestinationDescription', "Choose where PR links open across web, the desktop app and IDE.")));
		const select = DOM.append(row, DOM.$('select.solo-settings-select')) as HTMLSelectElement;
		for (const label of ['GitHub', 'Solo']) {
			const option = DOM.append(select, DOM.$('option')) as HTMLOptionElement;
			option.value = label.toLowerCase();
			option.textContent = label;
		}
	}

	private renderLayoutSection(container: HTMLElement): void {
		const section = DOM.append(container, DOM.$('section.solo-settings-section'));
		DOM.append(section, DOM.$('h2.solo-settings-section-title', undefined, localize('soloSettingsLayout', "Layout")));
		const card = DOM.append(section, DOM.$('.solo-settings-card'));

		const layoutRow = DOM.append(card, DOM.$('.solo-settings-row.solo-settings-layout-row'));
		const text = DOM.append(layoutRow, DOM.$('.solo-settings-row-text'));
		DOM.append(text, DOM.$('.solo-settings-row-title', undefined, localize('soloSettingsWindowLayoutTitle', "Window Layout")));
		DOM.append(text, DOM.$('.solo-settings-row-description', undefined, localize('soloSettingsWindowLayoutDescription', "Switch between Agent and Editor default layouts.")));
		const choices = DOM.append(layoutRow, DOM.$('.solo-settings-layout-choices'));
		this.renderLayoutChoice(choices, localize('soloSettingsAgentLayout', "Agent"), false);
		this.renderLayoutChoice(choices, localize('soloSettingsEditorLayout', "Editor"), true);

		this.renderToggleRows(card, [
			{
				title: localize('soloSettingsTitleBarTitle', "Title Bar"),
				description: localize('soloSettingsTitleBarDescription', "Show title bar in agent layout."),
				setting: 'window.customTitleBarVisibility',
				enabledValue: 'auto',
				disabledValue: 'never',
				defaultValue: true
			},
			{
				title: localize('soloSettingsStatusBarTitle', "Status Bar"),
				description: localize('soloSettingsStatusBarDescription', "Show status bar at the bottom of the window."),
				setting: 'workbench.statusBar.visible',
				enabledValue: true,
				disabledValue: false,
				defaultValue: true
			},
		]);
	}

	private renderLayoutChoice(container: HTMLElement, label: string, active: boolean): void {
		const button = DOM.append(container, DOM.$('button.solo-settings-layout-choice')) as HTMLButtonElement;
		button.type = 'button';
		button.classList.toggle('active', active);
		DOM.append(button, DOM.$('.solo-settings-layout-preview'));
		DOM.append(button, DOM.$('span', undefined, label));
	}

	private renderToggleSection(container: HTMLElement, title: string, rows: SoloSettingsToggleRow[]): void {
		const section = DOM.append(container, DOM.$('section.solo-settings-section'));
		DOM.append(section, DOM.$('h2.solo-settings-section-title', undefined, title));
		this.renderToggleRows(DOM.append(section, DOM.$('.solo-settings-card')), rows);
	}

	private renderSection(container: HTMLElement, title: string | undefined, rows: SoloSettingsButtonRow[]): void {
		const section = DOM.append(container, DOM.$('section.solo-settings-section'));
		if (title) {
			DOM.append(section, DOM.$('h2.solo-settings-section-title', undefined, title));
		}
		const card = DOM.append(section, DOM.$('.solo-settings-card'));
		for (const row of rows) {
			const rowElement = DOM.append(card, DOM.$('.solo-settings-row'));
			const text = DOM.append(rowElement, DOM.$('.solo-settings-row-text'));
			DOM.append(text, DOM.$('.solo-settings-row-title', undefined, row.title));
			DOM.append(text, DOM.$('.solo-settings-row-description', undefined, row.description));
			const button = DOM.append(rowElement, DOM.$('button.solo-settings-button', undefined, row.buttonLabel)) as HTMLButtonElement;
			button.type = 'button';
			this.disposables.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.commandService.executeCommand(row.command, ...(row.commandArgs ?? []))));
		}
	}

	private renderToggleRows(container: HTMLElement, rows: SoloSettingsToggleRow[]): void {
		for (const row of rows) {
			const rowElement = DOM.append(container, DOM.$('.solo-settings-row'));
			const text = DOM.append(rowElement, DOM.$('.solo-settings-row-text'));
			DOM.append(text, DOM.$('.solo-settings-row-title', undefined, row.title));
			DOM.append(text, DOM.$('.solo-settings-row-description', undefined, row.description));
			const toggle = DOM.append(rowElement, DOM.$('button.solo-settings-toggle')) as HTMLButtonElement;
			toggle.type = 'button';
			const isEnabled = this.getToggleValue(row);
			toggle.classList.toggle('checked', isEnabled);
			toggle.setAttribute('aria-pressed', String(isEnabled));
			toggle.setAttribute('aria-label', row.title);
			DOM.append(toggle, DOM.$('span.solo-settings-toggle-knob'));
			this.disposables.add(DOM.addDisposableListener(toggle, DOM.EventType.CLICK, async () => {
				await this.configurationService.updateValue(row.setting, isEnabled ? row.disabledValue : row.enabledValue, ConfigurationTarget.USER);
			}));
		}
	}

	private getToggleValue(row: SoloSettingsToggleRow): boolean {
		const value = this.configurationService.getValue(row.setting);
		if (typeof row.enabledValue === 'boolean') {
			return typeof value === 'boolean' ? value : row.defaultValue;
		}
		return value === row.enabledValue || (value === undefined && row.defaultValue);
	}
}
