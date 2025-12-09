/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import type { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HistoryInputBox, IHistoryInputOptions } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Widget } from '../../../../base/browser/ui/widget.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelDeltaDecoration, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ContextScopedHistoryInputBox } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { showHistoryKeybindingHint } from '../../../../platform/history/browser/historyWidgetKeybindingHint.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { asCssVariable, badgeBackground, badgeForeground, contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { isWorkspaceFolder, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { settingsEditIcon, settingsScopeDropDownIcon } from './preferencesIcons.js';

export class FolderSettingsActionViewItem extends BaseActionViewItem {

	private _folder: IWorkspaceFolder | null;
	private _folderSettingCounts = new Map<string, number>();

	private container!: HTMLElement;
	private anchorElement!: HTMLElement;
	private anchorElementHover!: IManagedHover;
	private labelElement!: HTMLElement;
	private detailsElement!: HTMLElement;
	private dropDownElement!: HTMLElement;

	constructor(
		action: IAction,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(null, action);
		const workspace = this.contextService.getWorkspace();
		this._folder = workspace.folders.length === 1 ? workspace.folders[0] : null;
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.onWorkspaceFoldersChanged()));
	}

	get folder(): IWorkspaceFolder | null {
		return this._folder;
	}

	set folder(folder: IWorkspaceFolder | null) {
		this._folder = folder;
		this.update();
	}

	setCount(settingsTarget: URI, count: number): void {
		const workspaceFolder = this.contextService.getWorkspaceFolder(settingsTarget);
		if (!workspaceFolder) {
			throw new Error('unknown folder');
		}
		const folder = workspaceFolder.uri;
		this._folderSettingCounts.set(folder.toString(), count);
		this.update();
	}

	override render(container: HTMLElement): void {
		this.element = container;

		this.container = container;
		this.labelElement = DOM.$('.action-title');
		this.detailsElement = DOM.$('.action-details');
		this.dropDownElement = DOM.$('.dropdown-icon.hide' + ThemeIcon.asCSSSelector(settingsScopeDropDownIcon));
		this.anchorElement = DOM.$('a.action-label.folder-settings', {
			role: 'button',
			'aria-haspopup': 'true',
			'tabindex': '0'
		}, this.labelElement, this.detailsElement, this.dropDownElement);
		this.anchorElementHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.anchorElement, ''));
		this._register(DOM.addDisposableListener(this.anchorElement, DOM.EventType.MOUSE_DOWN, e => DOM.EventHelper.stop(e)));
		this._register(DOM.addDisposableListener(this.anchorElement, DOM.EventType.CLICK, e => this.onClick(e)));
		this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_UP, e => this.onKeyUp(e)));

		DOM.append(this.container, this.anchorElement);

		this.update();
	}

	private onKeyUp(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
			case KeyCode.Space:
				this.onClick(event);
				return;
		}
	}

	override onClick(event: DOM.EventLike): void {
		DOM.EventHelper.stop(event, true);
		if (!this.folder || this._action.checked) {
			this.showMenu();
		} else {
			this._action.run(this._folder);
		}
	}

	protected override updateEnabled(): void {
		this.update();
	}

	protected override updateChecked(): void {
		this.update();
	}

	private onWorkspaceFoldersChanged(): void {
		const oldFolder = this._folder;
		const workspace = this.contextService.getWorkspace();
		if (oldFolder) {
			this._folder = workspace.folders.filter(folder => isEqual(folder.uri, oldFolder.uri))[0] || workspace.folders[0];
		}
		this._folder = this._folder ? this._folder : workspace.folders.length === 1 ? workspace.folders[0] : null;

		this.update();

		if (this._action.checked) {
			this._action.run(this._folder);
		}
	}

	private update(): void {
		let total = 0;
		this._folderSettingCounts.forEach(n => total += n);

		const workspace = this.contextService.getWorkspace();
		if (this._folder) {
			this.labelElement.textContent = this._folder.name;
			this.anchorElementHover.update(this._folder.name);
			const detailsText = this.labelWithCount(this._action.label, total);
			this.detailsElement.textContent = detailsText;
			this.dropDownElement.classList.toggle('hide', workspace.folders.length === 1 || !this._action.checked);
		} else {
			const labelText = this.labelWithCount(this._action.label, total);
			this.labelElement.textContent = labelText;
			this.detailsElement.textContent = '';
			this.anchorElementHover.update(this._action.label);
			this.dropDownElement.classList.remove('hide');
		}

		this.anchorElement.classList.toggle('checked', this._action.checked);
		this.container.classList.toggle('disabled', !this._action.enabled);
	}

	private showMenu(): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => this.container,
			getActions: () => this.getDropdownMenuActions(),
			getActionViewItem: () => undefined,
			onHide: () => {
				this.anchorElement.blur();
			}
		});
	}

	private getDropdownMenuActions(): IAction[] {
		const actions: IAction[] = [];
		const workspaceFolders = this.contextService.getWorkspace().folders;
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && workspaceFolders.length > 0) {
			actions.push(...workspaceFolders.map((folder, index) => {
				const folderCount = this._folderSettingCounts.get(folder.uri.toString());
				return {
					id: 'folderSettingsTarget' + index,
					label: this.labelWithCount(folder.name, folderCount),
					tooltip: this.labelWithCount(folder.name, folderCount),
					checked: !!this.folder && isEqual(this.folder.uri, folder.uri),
					enabled: true,
					class: undefined,
					run: () => this._action.run(folder)
				};
			}));
		}
		return actions;
	}

	private labelWithCount(label: string, count: number | undefined): string {
		// Append the count if it's >0 and not undefined
		if (count) {
			label += ` (${count})`;
		}

		return label;
	}
}

export type SettingsTarget = ConfigurationTarget.APPLICATION | ConfigurationTarget.USER_LOCAL | ConfigurationTarget.USER_REMOTE | ConfigurationTarget.WORKSPACE | URI;

export interface ISettingsTargetsWidgetOptions {
	enableRemoteSettings?: boolean;
}

export class SettingsTargetsWidget extends Widget {

	private settingsSwitcherBar!: ActionBar;
	private userLocalSettings!: Action;
	private userRemoteSettings!: Action;
	private workspaceSettings!: Action;
	private folderSettingsAction!: Action;
	private folderSettings!: FolderSettingsActionViewItem;
	private options: ISettingsTargetsWidgetOptions;

	private _settingsTarget: SettingsTarget | null = null;

	private readonly _onDidTargetChange = this._register(new Emitter<SettingsTarget>());
	readonly onDidTargetChange: Event<SettingsTarget> = this._onDidTargetChange.event;

	constructor(
		parent: HTMLElement,
		options: ISettingsTargetsWidgetOptions | undefined,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILabelService private readonly labelService: ILabelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		super();
		this.options = options ?? {};
		this.create(parent);
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.onWorkbenchStateChanged()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
	}

	private resetLabels() {
		const remoteAuthority = this.environmentService.remoteAuthority;
		const hostLabel = remoteAuthority && this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority);
		this.userLocalSettings.label = localize('userSettings', "User");
		this.userRemoteSettings.label = localize('userSettingsRemote', "Remote") + (hostLabel ? ` [${hostLabel}]` : '');
		this.workspaceSettings.label = localize('workspaceSettings', "Workspace");
		this.folderSettingsAction.label = localize('folderSettings', "Folder");
	}

	private create(parent: HTMLElement): void {
		const settingsTabsWidget = DOM.append(parent, DOM.$('.settings-tabs-widget'));
		this.settingsSwitcherBar = this._register(new ActionBar(settingsTabsWidget, {
			orientation: ActionsOrientation.HORIZONTAL,
			focusOnlyEnabledItems: true,
			ariaLabel: localize('settingsSwitcherBarAriaLabel', "Settings Switcher"),
			ariaRole: 'tablist',
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => action.id === 'folderSettings' ? this.folderSettings : undefined
		}));

		this.userLocalSettings = this._register(new Action('userSettings', '', '.settings-tab', true, () => this.updateTarget(ConfigurationTarget.USER_LOCAL)));
		this.userLocalSettings.tooltip = localize('userSettings', "User");

		this.userRemoteSettings = this._register(new Action('userSettingsRemote', '', '.settings-tab', true, () => this.updateTarget(ConfigurationTarget.USER_REMOTE)));
		const remoteAuthority = this.environmentService.remoteAuthority;
		const hostLabel = remoteAuthority && this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority);
		this.userRemoteSettings.tooltip = localize('userSettingsRemote', "Remote") + (hostLabel ? ` [${hostLabel}]` : '');

		this.workspaceSettings = this._register(new Action('workspaceSettings', '', '.settings-tab', false, () => this.updateTarget(ConfigurationTarget.WORKSPACE)));

		this.folderSettingsAction = this._register(new Action('folderSettings', '', '.settings-tab', false, async folder => {
			this.updateTarget(isWorkspaceFolder(folder) ? folder.uri : ConfigurationTarget.USER_LOCAL);
		}));
		this.folderSettings = this._register(this.instantiationService.createInstance(FolderSettingsActionViewItem, this.folderSettingsAction));

		this.resetLabels();
		this.update();

		this.settingsSwitcherBar.push([this.userLocalSettings, this.userRemoteSettings, this.workspaceSettings, this.folderSettingsAction]);
	}

	get settingsTarget(): SettingsTarget | null {
		return this._settingsTarget;
	}

	set settingsTarget(settingsTarget: SettingsTarget | null) {
		this._settingsTarget = settingsTarget;
		this.userLocalSettings.checked = ConfigurationTarget.USER_LOCAL === this.settingsTarget;
		this.userRemoteSettings.checked = ConfigurationTarget.USER_REMOTE === this.settingsTarget;
		this.workspaceSettings.checked = ConfigurationTarget.WORKSPACE === this.settingsTarget;
		if (this.settingsTarget instanceof URI) {
			this.folderSettings.action.checked = true;
			this.folderSettings.folder = this.contextService.getWorkspaceFolder(this.settingsTarget as URI);
		} else {
			this.folderSettings.action.checked = false;
		}
	}

	setResultCount(settingsTarget: SettingsTarget, count: number): void {
		if (settingsTarget === ConfigurationTarget.WORKSPACE) {
			let label = localize('workspaceSettings', "Workspace");
			if (count) {
				label += ` (${count})`;
			}

			this.workspaceSettings.label = label;
		} else if (settingsTarget === ConfigurationTarget.USER_LOCAL) {
			let label = localize('userSettings', "User");
			if (count) {
				label += ` (${count})`;
			}

			this.userLocalSettings.label = label;
		} else if (settingsTarget instanceof URI) {
			this.folderSettings.setCount(settingsTarget, count);
		}
	}

	updateLanguageFilterIndicators(filter: string | undefined) {
		this.resetLabels();
		if (filter) {
			const languageToUse = this.languageService.getLanguageName(filter);
			if (languageToUse) {
				const languageSuffix = ` [${languageToUse}]`;
				this.userLocalSettings.label += languageSuffix;
				this.userRemoteSettings.label += languageSuffix;
				this.workspaceSettings.label += languageSuffix;
				this.folderSettingsAction.label += languageSuffix;
			}
		}
	}

	private onWorkbenchStateChanged(): void {
		this.folderSettings.folder = null;
		this.update();
		if (this.settingsTarget === ConfigurationTarget.WORKSPACE && this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			this.updateTarget(ConfigurationTarget.USER_LOCAL);
		}
	}

	updateTarget(settingsTarget: SettingsTarget): Promise<void> {
		const isSameTarget = this.settingsTarget === settingsTarget ||
			settingsTarget instanceof URI &&
			this.settingsTarget instanceof URI &&
			isEqual(this.settingsTarget, settingsTarget);

		if (!isSameTarget) {
			this.settingsTarget = settingsTarget;
			this._onDidTargetChange.fire(this.settingsTarget);
		}

		return Promise.resolve(undefined);
	}

	private async update(): Promise<void> {
		this.settingsSwitcherBar.domNode.classList.toggle('empty-workbench', this.contextService.getWorkbenchState() === WorkbenchState.EMPTY);
		this.userRemoteSettings.enabled = !!(this.options.enableRemoteSettings && this.environmentService.remoteAuthority);
		this.workspaceSettings.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
		this.folderSettings.action.enabled = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.contextService.getWorkspace().folders.length > 0;

		this.workspaceSettings.tooltip = localize('workspaceSettings', "Workspace");
	}
}

export interface SearchOptions extends IHistoryInputOptions {
	focusKey?: IContextKey<boolean>;
	showResultCount?: boolean;
	ariaLive?: string;
	ariaLabelledBy?: string;
}

export class SearchWidget extends Widget {

	domNode!: HTMLElement;

	private countElement!: HTMLElement;
	private searchContainer!: HTMLElement;
	inputBox!: HistoryInputBox;
	private controlsDiv!: HTMLElement;

	private readonly _onDidChange: Emitter<string> = this._register(new Emitter<string>());
	public get onDidChange(): Event<string> { return this._onDidChange.event; }

	private readonly _onFocus: Emitter<void> = this._register(new Emitter<void>());
	public get onFocus(): Event<void> { return this._onFocus.event; }

	constructor(parent: HTMLElement, protected options: SearchOptions,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService protected readonly keybindingService: IKeybindingService
	) {
		super();
		this.create(parent);
	}

	private create(parent: HTMLElement) {
		this.domNode = DOM.append(parent, DOM.$('div.settings-header-widget'));
		this.createSearchContainer(DOM.append(this.domNode, DOM.$('div.settings-search-container')));
		this.controlsDiv = DOM.append(this.domNode, DOM.$('div.settings-search-controls'));

		if (this.options.showResultCount) {
			this.countElement = DOM.append(this.controlsDiv, DOM.$('.settings-count-widget'));

			this.countElement.style.backgroundColor = asCssVariable(badgeBackground);
			this.countElement.style.color = asCssVariable(badgeForeground);
			this.countElement.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
		}

		this.inputBox.inputElement.setAttribute('aria-live', this.options.ariaLive || 'off');
		if (this.options.ariaLabelledBy) {
			this.inputBox.inputElement.setAttribute('aria-labelledBy', this.options.ariaLabelledBy);
		}
		const focusTracker = this._register(DOM.trackFocus(this.inputBox.inputElement));
		this._register(focusTracker.onDidFocus(() => this._onFocus.fire()));

		const focusKey = this.options.focusKey;
		if (focusKey) {
			this._register(focusTracker.onDidFocus(() => focusKey.set(true)));
			this._register(focusTracker.onDidBlur(() => focusKey.set(false)));
		}
	}

	private createSearchContainer(searchContainer: HTMLElement) {
		this.searchContainer = searchContainer;
		const searchInput = DOM.append(this.searchContainer, DOM.$('div.settings-search-input'));
		this.inputBox = this._register(this.createInputBox(searchInput));
		this._register(this.inputBox.onDidChange(value => this._onDidChange.fire(value)));
	}

	protected createInputBox(parent: HTMLElement): HistoryInputBox {
		const showHistoryHint = () => showHistoryKeybindingHint(this.keybindingService);
		return new ContextScopedHistoryInputBox(parent, this.contextViewService, { ...this.options, showHistoryHint }, this.contextKeyService);
	}

	showMessage(message: string): void {
		// Avoid setting the aria-label unnecessarily, the screenreader will read the count every time it's set, since it's aria-live:assertive. #50968
		if (this.countElement && message !== this.countElement.textContent) {
			this.countElement.textContent = message;
			this.inputBox.inputElement.setAttribute('aria-label', message);
			this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + 'px';
		}
	}

	layout(dimension: DOM.Dimension) {
		if (dimension.width < 400) {
			this.countElement?.classList.add('hide');

			this.inputBox.inputElement.style.paddingRight = '0px';
		} else {
			this.countElement?.classList.remove('hide');

			this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + 'px';
		}
	}

	private getControlsWidth(): number {
		const countWidth = this.countElement ? DOM.getTotalWidth(this.countElement) : 0;
		return countWidth + 20;
	}

	focus() {
		this.inputBox.focus();
		if (this.getValue()) {
			this.inputBox.select();
		}
	}

	hasFocus(): boolean {
		return this.inputBox.hasFocus();
	}

	clear() {
		this.inputBox.value = '';
	}

	getValue(): string {
		return this.inputBox.value;
	}

	setValue(value: string): string {
		return this.inputBox.value = value;
	}

	override dispose(): void {
		this.options.focusKey?.set(false);
		super.dispose();
	}
}

export class EditPreferenceWidget<T> extends Disposable {

	private _line: number = -1;
	private _preferences: T[] = [];

	private readonly _editPreferenceDecoration: IEditorDecorationsCollection;

	private readonly _onClick = this._register(new Emitter<IEditorMouseEvent>());
	readonly onClick: Event<IEditorMouseEvent> = this._onClick.event;

	constructor(private editor: ICodeEditor) {
		super();
		this._editPreferenceDecoration = this.editor.createDecorationsCollection();
		this._register(this.editor.onMouseDown((e: IEditorMouseEvent) => {
			if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.detail.isAfterLines || !this.isVisible()) {
				return;
			}
			this._onClick.fire(e);
		}));
	}

	get preferences(): T[] {
		return this._preferences;
	}

	getLine(): number {
		return this._line;
	}

	show(line: number, hoverMessage: string, preferences: T[]): void {
		this._preferences = preferences;
		const newDecoration: IModelDeltaDecoration[] = [];
		this._line = line;
		newDecoration.push({
			options: {
				description: 'edit-preference-widget-decoration',
				glyphMarginClassName: ThemeIcon.asClassName(settingsEditIcon),
				glyphMarginHoverMessage: new MarkdownString().appendText(hoverMessage),
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			},
			range: {
				startLineNumber: line,
				startColumn: 1,
				endLineNumber: line,
				endColumn: 1
			}
		});
		this._editPreferenceDecoration.set(newDecoration);
	}

	hide(): void {
		this._editPreferenceDecoration.clear();
	}

	isVisible(): boolean {
		return this._editPreferenceDecoration.length > 0;
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}
