/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionWorkspaceEditor.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ITableRenderer, ITableVirtualDelegate } from '../../../../../base/browser/ui/table/table.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { RunOnceScheduler, Sequencer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { basename } from '../../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultInputBoxStyles, getListStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { editorBackground, foreground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IconPicker } from '../../../../services/userDataProfile/browser/iconPicker.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../accessibility/common/accessibilityCommands.js';
import { SessionWorkspaceEditorFocusedContext } from '../../common/contextkeys.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService, SessionWorkspaceError } from '../../common/sessionWorkspaces.js';
import { getSessionWorkspaceCssColor, getSessionWorkspaceIcon, isCustomSessionWorkspaceColor, SESSION_WORKSPACE_COLORS } from './sessionWorkspaceAppearance.js';
import { ISessionWorkspaceDraft, SessionWorkspaceDraftModel } from './sessionWorkspaceDraft.js';
import { SessionWorkspaceEditorInput, SessionWorkspaceEditorTarget } from './sessionWorkspaceEditorInput.js';

/**
 * The folders table draws no selection, focus or hover fill of its own, as the Profiles editor's tables, but keeps the
 * list's focus and hover outlines, so a row with the keyboard on it shows.
 */
const folderTableStyles = getListStyles({
	listActiveSelectionBackground: editorBackground,
	listActiveSelectionForeground: foreground,
	listFocusAndSelectionBackground: editorBackground,
	listFocusAndSelectionForeground: foreground,
	listFocusBackground: editorBackground,
	listFocusForeground: foreground,
	listHoverForeground: foreground,
	listHoverBackground: editorBackground,
	listInactiveSelectionBackground: editorBackground,
	listInactiveSelectionForeground: foreground,
	listInactiveFocusBackground: editorBackground,
	treeIndentGuidesStroke: undefined,
	treeInactiveIndentGuidesStroke: undefined,
	tableOddRowsBackgroundColor: editorBackground,
});

/** The width that the editor's content prefers, which the modal fits. */
export const SESSION_WORKSPACE_EDITOR_WIDTH = 640;
/** How long the editor waits for the user to stop typing a name before it renames the workspace, and its file. */
const NAME_APPLY_DELAY = 750;
/** The last custom color the user picked, which the custom swatch offers while a workspace has another color. */
const LAST_CUSTOM_COLOR_STORAGE_KEY = 'sessions.workspaceEditor.lastCustomColor';
const FOLDER_ROW_HEIGHT = 24;
const FOLDER_HEADER_HEIGHT = 30;
/** The share of the table's width the Name column takes; Path takes the rest, after the actions. */
const FOLDER_NAME_COLUMN_PERCENTAGE = 30;
/** The cells' padding on each side, which the CSS gives `.monaco-table-td`. */
const FOLDER_CELL_PADDING = 4;
const SET_DEFAULT_FOLDER_ACTION_ID = 'workspaceEditor.setDefaultFolder';
const REMOVE_FOLDER_ACTION_ID = 'workspaceEditor.removeFolder';

/** A folder of the workspace, a row of the folders table. */
interface IFolderRow {
	readonly folder: URI;
	readonly isDefault: boolean;
	/** Whether the row offers Set as Default: any folder but the default. */
	readonly canSetDefault: boolean;
	/** Whether the folder can be removed: a workspace keeps at least one folder once it exists. */
	readonly canRemove: boolean;
}

/** What the folders table's actions do, which the widget owns. */
interface IFolderRowActions {
	setDefault(folder: URI): void;
	remove(folder: URI): void;
}

interface IFolderNameTemplate {
	readonly name: HTMLElement;
	readonly tag: HTMLElement;
	readonly disposables: DisposableStore;
}

/** The folder's name, with the default folder's tag right after it. */
class FolderNameColumnRenderer implements ITableRenderer<IFolderRow, IFolderNameTemplate> {
	static readonly TEMPLATE_ID = 'name';
	readonly templateId = FolderNameColumnRenderer.TEMPLATE_ID;

	constructor(private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): IFolderNameTemplate {
		const element = DOM.append(container, DOM.$('.session-workspace-editor-name'));
		const name = DOM.append(element, DOM.$('span.session-workspace-editor-name-label'));
		const tag = DOM.append(element, DOM.$('span.session-workspace-editor-default-tag', { 'aria-hidden': 'true' }, localize('workspaceEditor.default', "Default")));
		const disposables = new DisposableStore();
		// The full name, which a narrow column truncates
		disposables.add(this.hoverService.setupDelayedHover(name, () => ({ content: name.textContent ?? '' })));
		return { name, tag, disposables };
	}

	renderElement(row: IFolderRow, _index: number, template: IFolderNameTemplate): void {
		template.name.textContent = basename(row.folder);
		template.tag.hidden = !row.isDefault;
	}

	disposeTemplate(template: IFolderNameTemplate): void {
		template.disposables.dispose();
	}
}

interface IFolderPathTemplate {
	readonly path: HTMLElement;
	/** The full path, with the computer a remote folder is on, which the hover shows. */
	hover: string;
	readonly disposables: DisposableStore;
}

class FolderPathColumnRenderer implements ITableRenderer<IFolderRow, IFolderPathTemplate> {
	static readonly TEMPLATE_ID = 'path';
	readonly templateId = FolderPathColumnRenderer.TEMPLATE_ID;

	constructor(private readonly labelService: ILabelService, private readonly hoverService: IHoverService) { }

	/** The computer that the folder is on: its remote host, or Local. */
	getHostLabel(folder: URI): string {
		return folder.authority ? this.labelService.getHostLabel(folder.scheme, folder.authority) || folder.authority : localize('workspaceEditor.localHost', "Local");
	}

	renderTemplate(container: HTMLElement): IFolderPathTemplate {
		const element = DOM.append(container, DOM.$('.session-workspace-editor-path'));
		const path = DOM.append(element, DOM.$('span.session-workspace-editor-path-label'));
		const disposables = new DisposableStore();
		const template: IFolderPathTemplate = { path, hover: '', disposables };
		disposables.add(this.hoverService.setupDelayedHover(path, () => ({ content: template.hover })));
		return template;
	}

	renderElement(row: IFolderRow, _index: number, template: IFolderPathTemplate): void {
		const label = this.labelService.getUriLabel(row.folder, { relative: false });
		template.path.textContent = label;
		// The table does not show the computer a folder is on; the hover does, for a remote folder
		template.hover = row.folder.authority ? localize('workspaceEditor.folderOnHost', "{0} on {1}", label, this.getHostLabel(row.folder)) : label;
	}

	disposeTemplate(template: IFolderPathTemplate): void {
		template.disposables.dispose();
	}
}

/** Set as Default: a text action drawn as a pill, which its label's class styles. */
class SetDefaultFolderActionViewItem extends ActionViewItem {
	constructor(action: IAction, options: IActionViewItemOptions) {
		super(undefined, action, { ...options, icon: false, label: true });
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.label?.classList.add('session-workspace-editor-set-default');
	}
}

interface IFolderActionsTemplate {
	readonly actionBar: ActionBar;
	readonly elementDisposables: DisposableStore;
	readonly disposables: DisposableStore;
}

class FolderActionsColumnRenderer implements ITableRenderer<IFolderRow, IFolderActionsTemplate> {
	static readonly TEMPLATE_ID = 'actions';
	readonly templateId = FolderActionsColumnRenderer.TEMPLATE_ID;

	constructor(private readonly actions: IFolderRowActions) { }

	/** The bar of a folder's actions, which the widget also measures the column's width with. */
	static createActionBar(container: HTMLElement): ActionBar {
		return new ActionBar(container, {
			actionViewItemProvider: (action, options) => action.id === SET_DEFAULT_FOLDER_ACTION_ID ? new SetDefaultFolderActionViewItem(action, options) : undefined,
		});
	}

	renderTemplate(container: HTMLElement): IFolderActionsTemplate {
		const disposables = new DisposableStore();
		const actionBar = disposables.add(FolderActionsColumnRenderer.createActionBar(DOM.append(container, DOM.$('.session-workspace-editor-folder-actions'))));
		return { actionBar, elementDisposables: disposables.add(new DisposableStore()), disposables };
	}

	renderElement(row: IFolderRow, _index: number, template: IFolderActionsTemplate): void {
		template.elementDisposables.clear();
		template.actionBar.clear();
		if (row.canSetDefault) {
			template.actionBar.push(template.elementDisposables.add(new Action(SET_DEFAULT_FOLDER_ACTION_ID, localize('workspaceEditor.setDefault', "Set as Default"), undefined, true, async () => this.actions.setDefault(row.folder))), { icon: false, label: true });
		}
		const remove = template.elementDisposables.add(new Action(REMOVE_FOLDER_ACTION_ID, localize('workspaceEditor.removeFolder', "Remove Folder"), ThemeIcon.asClassName(Codicon.closeSmall), row.canRemove, async () => this.actions.remove(row.folder)));
		if (!row.canRemove) {
			remove.tooltip = localize('workspaceEditor.removeLastFolder', "Remove Folder (a workspace needs at least one folder)");
		}
		template.actionBar.push(remove, { icon: true, label: false });
	}

	disposeTemplate(template: IFolderActionsTemplate): void {
		template.disposables.dispose();
	}
}

/**
 * The Workspace editor's contents, as the Profiles editor shows a profile: the workspace's Name, Icon, Color and
 * Folders. Changes to an existing workspace apply as the user makes them, while it is valid: it has a name and a folder.
 * A new workspace is created once the user chooses Create.
 */
export class SessionWorkspaceEditorWidget extends Disposable {

	private readonly _onDidChangeName = this._register(new Emitter<string>());
	readonly onDidChangeName = this._onDidChangeName.event;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	/** Fires when the content's height, which {@link contentHeight} measures, may have changed, such as with its folders. */
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	private readonly _onDidRequestClose = this._register(new Emitter<void>());
	/** Fires when the user is done with a new workspace: created it, or cancelled. */
	readonly onDidRequestClose = this._onDidRequestClose.event;

	private readonly _onDidApply = this._register(new Emitter<IRecentSessionWorkspace>());
	/** Fires with the workspace as applied, also when the editor created it. */
	readonly onDidApply = this._onDidApply.event;

	private readonly model: SessionWorkspaceDraftModel;
	/** The workspace as last applied, `undefined` until a new workspace is created. */
	private workspace: IRecentSessionWorkspace | undefined;
	private applied: ISessionWorkspaceDraft | undefined;
	private readonly applies = new Sequencer();
	/** Whether the editor creates a new workspace once the user chooses Create, rather than applying changes as made. */
	private readonly isNew: boolean;
	/** Whether a new workspace is to be created, as the user chose Create. */
	private createRequested = false;
	/** Whether the workspace is being created, which disables Create and Cancel. Closing the editor still creates it. */
	private creating = false;
	/** Whether a new workspace shows what it still needs: once the user tried to create it, or left its name. */
	private validationShown: boolean;
	private readonly createButton: Button | undefined;
	private readonly cancelButton: Button | undefined;
	/** Why Create is disabled, for screen readers: what the workspace still needs. */
	private readonly createReason: HTMLElement | undefined;
	private readonly nameApply = this._register(new RunOnceScheduler(() => this.apply(), NAME_APPLY_DELAY));
	private readonly iconPicker: IconPicker;

	private readonly scrollable: DomScrollableElement;
	private readonly body: HTMLElement;
	private readonly nameInput: InputBox;
	private readonly iconButton: HTMLElement;
	private readonly foldersTable: WorkbenchTable<IFolderRow>;
	private readonly addFolderButton: Button;
	private readonly foldersMessage: HTMLElement;
	private readonly tableContainer: HTMLElement;
	/** Row actions as wide as a row's widest, Set as Default and Remove Folder, which the actions column is measured by. */
	private readonly folderActionsProbe: HTMLElement;
	private folderActionsWidth = 0;
	private readonly _onDidChangeFolderActionsWidth = this._register(new Emitter<void>());

	constructor(
		container: HTMLElement,
		target: SessionWorkspaceEditorTarget,
		@ISessionWorkspacesService private readonly workspacesService: ISessionWorkspacesService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ILabelService private readonly labelService: ILabelService,
		@IHoverService private readonly hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextViewService contextViewService: IContextViewService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		const isEqual = (a: URI, b: URI) => uriIdentityService.extUri.isEqual(a, b);
		const initial: ISessionWorkspaceDraft = target.kind === 'edit'
			? { name: target.workspace.name, folders: target.workspace.folders, icon: target.workspace.icon, color: target.workspace.color }
			: { name: '', folders: [] };
		this.model = new SessionWorkspaceDraftModel(initial, target.kind === 'edit', isEqual);
		if (target.kind === 'edit') {
			this.workspace = target.workspace;
			this.applied = this.model.draft;
		}
		this.isNew = target.kind === 'new';
		this.validationShown = !this.isNew;
		this.iconPicker = this._register(instantiationService.createInstance(IconPicker));

		const body = this.body = DOM.$('.session-workspace-editor-body');
		this.scrollable = this._register(new DomScrollableElement(body, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		DOM.append(container, DOM.append(DOM.$('.session-workspace-editor'), this.scrollable.getDomNode()));

		// Name
		const nameRow = this.renderRow(body, localize('workspaceEditor.name', "Name"), undefined, this.isNew);
		this.nameInput = this._register(new InputBox(nameRow, contextViewService, {
			inputBoxStyles: defaultInputBoxStyles,
			placeholder: localize('workspaceEditor.namePlaceholder', "Workspace name"),
			ariaLabel: this.withHelpHint(this.isNew ? localize('workspaceEditor.nameRequiredAria', "Workspace Name, required") : localize('workspaceEditor.nameAria', "Workspace Name")),
			validationOptions: {
				validation: value => value.trim() || !this.validationShown ? null : { content: localize('workspaceEditor.nameRequired', "A workspace needs a name."), type: MessageType.ERROR },
			},
		}));
		this.nameInput.value = this.model.name;
		this._register(this.nameInput.onDidChange(value => {
			if (value !== this.model.name) {
				this.model.setName(value);
				this.fireName();
				this.updateCreateButton();
				this.nameApply.schedule();
			}
		}));
		if (this.isNew) {
			this.nameInput.inputElement.setAttribute('aria-required', 'true');
		}
		this._register(DOM.addDisposableListener(this.nameInput.inputElement, DOM.EventType.BLUR, () => {
			if (this.isNew) {
				this.showValidation();
			}
			this.flushName();
		}));
		this._register(DOM.addStandardDisposableListener(this.nameInput.inputElement, DOM.EventType.KEY_DOWN, event => {
			if (event.equals(KeyCode.Enter)) {
				if (this.isNew && !this.workspace) {
					// Enter tries Create, which shows what the workspace still needs
					void this.create();
				} else {
					this.flushName();
				}
			}
		}));

		// Icon
		const iconRow = this.renderRow(body, localize('workspaceEditor.icon', "Icon"));
		const iconContainer = DOM.append(iconRow, DOM.$('.session-workspace-editor-icon-container'));
		this.iconButton = DOM.append(iconContainer, DOM.$('.session-workspace-editor-icon', { role: 'button', tabindex: '0', 'aria-haspopup': 'listbox' }));
		this._register(this.hoverService.setupDelayedHover(this.iconButton, { content: localize('workspaceEditor.changeIcon', "Change Icon") }));
		this._register(DOM.addDisposableListener(this.iconButton, DOM.EventType.CLICK, () => void this.pickIcon()));
		this._register(DOM.addStandardDisposableListener(this.iconButton, DOM.EventType.KEY_DOWN, event => {
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(event, true);
				void this.pickIcon();
			}
		}));
		DOM.append(iconContainer, DOM.$('span.session-workspace-editor-description', undefined, localize('workspaceEditor.iconDescription', "Icon shown in the sessions list")));

		// Color
		this.renderColors(this.renderRow(body, localize('workspaceEditor.color', "Color"), 'session-workspace-editor-color-label'));

		// Folders
		const foldersRow = this.renderRow(body, localize('workspaceEditor.folders', "Folders"), undefined, this.isNew);
		DOM.append(foldersRow, DOM.$('.session-workspace-editor-description', undefined, localize('workspaceEditor.foldersDescription', "Sessions of this workspace work in its folders, starting in its default folder.")));
		const tableContainer = this.tableContainer = DOM.append(foldersRow, DOM.$('.session-workspace-editor-folders-table'));
		const actionsWidth = () => this.folderActionsWidth;
		const folderPathRenderer = new FolderPathColumnRenderer(this.labelService, this.hoverService);
		this.foldersTable = this._register(instantiationService.createInstance(WorkbenchTable<IFolderRow>,
			'SessionWorkspaceEditor-Folders',
			tableContainer,
			new class implements ITableVirtualDelegate<IFolderRow> {
				readonly headerRowHeight = FOLDER_HEADER_HEIGHT;
				getHeight() { return FOLDER_ROW_HEIGHT; }
			},
			[
				{ label: localize('workspaceEditor.nameColumn', "Name"), tooltip: '', weight: 3, templateId: FolderNameColumnRenderer.TEMPLATE_ID, project: (row: IFolderRow) => row },
				{ label: localize('workspaceEditor.pathColumn', "Path"), tooltip: '', weight: 7, templateId: FolderPathColumnRenderer.TEMPLATE_ID, project: (row: IFolderRow) => row },
				// Only as wide as Set as Default's pill and Remove Folder, as measured
				{ label: '', tooltip: '', weight: 1, get minimumWidth() { return actionsWidth(); }, get maximumWidth() { return actionsWidth(); }, onDidChangeWidthConstraints: this._onDidChangeFolderActionsWidth.event, templateId: FolderActionsColumnRenderer.TEMPLATE_ID, project: (row: IFolderRow) => row },
			],
			[
				new FolderNameColumnRenderer(this.hoverService),
				folderPathRenderer,
				new FolderActionsColumnRenderer({ setDefault: folder => this.setDefaultFolder(folder), remove: folder => this.removeFolder(folder) }),
			],
			{
				horizontalScrolling: false,
				alwaysConsumeMouseWheel: false,
				openOnSingleClick: false,
				multipleSelectionSupport: false,
				accessibilityProvider: {
					getAriaLabel: (row: IFolderRow) => {
						const path = this.labelService.getUriLabel(row.folder, { relative: false });
						const host = folderPathRenderer.getHostLabel(row.folder);
						return row.isDefault
							? localize('workspaceEditor.defaultFolderAria', "{0} on {1}, default folder", path, host)
							: localize('workspaceEditor.folderAria', "{0} on {1}", path, host);
					},
					getWidgetAriaLabel: () => this.isNew ? localize('workspaceEditor.foldersRequiredAria', "Folders, required") : localize('workspaceEditor.foldersAria', "Folders"),
				},
				identityProvider: { getId: (row: IFolderRow) => row.folder.toString() },
			}));
		this.foldersTable.style(folderTableStyles);
		// Under the headers, while there is no folder
		DOM.append(tableContainer, DOM.$('.session-workspace-editor-folders-empty', { style: `top: ${FOLDER_HEADER_HEIGHT}px; height: ${FOLDER_ROW_HEIGHT}px;` }, localize('workspaceEditor.noFolders', "No folders yet")));
		this.folderActionsProbe = DOM.append(tableContainer, DOM.$('.session-workspace-editor-folder-actions-probe', { 'aria-hidden': 'true' }));
		const probe = this._register(FolderActionsColumnRenderer.createActionBar(this.folderActionsProbe));
		probe.push(this._register(new Action(SET_DEFAULT_FOLDER_ACTION_ID, localize('workspaceEditor.setDefault', "Set as Default"))), { icon: false, label: true });
		probe.push(this._register(new Action(REMOVE_FOLDER_ACTION_ID, localize('workspaceEditor.removeFolder', "Remove Folder"), ThemeIcon.asClassName(Codicon.closeSmall))), { icon: true, label: false });
		this.foldersMessage = DOM.append(foldersRow, DOM.$('.session-workspace-editor-message', { role: 'status' }));
		const addFolder = this.addFolderButton = this._register(new Button(DOM.append(foldersRow, DOM.$('.session-workspace-editor-add-folder')), { ...defaultButtonStyles, secondary: true }));
		addFolder.label = localize('workspaceEditor.addFolder', "Add Folder...");
		this._register(addFolder.onDidClick(() => void this.addFolders()));

		// A new workspace is created once the user chooses Create, in the order the platform's dialogs have their buttons
		if (this.isNew) {
			const footer = DOM.append(body, DOM.$('.session-workspace-editor-footer'));
			const cancel = this.cancelButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
			cancel.label = localize('workspaceEditor.cancel', "Cancel");
			this._register(cancel.onDidClick(() => {
				if (!this.creating) {
					this._onDidRequestClose.fire();
				}
			}));
			const create = this.createButton = this._register(new Button(footer, defaultButtonStyles));
			create.label = localize('workspaceEditor.create', "Create");
			this._register(create.onDidClick(() => void this.create()));
			// A disabled Create keeps its Tab stop and says why when the keyboard or pointer reaches it
			this.createReason = DOM.append(footer, DOM.$('span.session-workspace-editor-create-reason', { id: 'session-workspace-editor-create-reason' }));
			create.element.setAttribute('aria-describedby', this.createReason.id);
			for (const type of [DOM.EventType.FOCUS, DOM.EventType.MOUSE_ENTER]) {
				this._register(DOM.addDisposableListener(create.element, type, () => {
					if (!create.enabled) {
						this.showValidation();
					}
				}));
			}
			if (isWindows) {
				footer.insertBefore(create.element, cancel.element);
			}
		}

		this._register(this.themeService.onDidColorThemeChange(() => this.renderIconButton()));
		this.fireName();
		this.renderIconButton();
		this.renderFolders();
	}

	focus(): void {
		this.nameInput.focus();
	}

	/** The height the content takes at its width, unscrolled, which the modal fits. */
	get contentHeight(): number {
		return Math.ceil(this.body.getBoundingClientRect().height);
	}

	layout(dimension: DOM.Dimension): void {
		this.scrollable.getDomNode().style.height = `${dimension.height}px`;
		this.layoutFolders();
		this.scrollable.scanDomNode();
	}

	/** Applies what the user changed and waits for it, as when the editor closes. */
	async flush(): Promise<void> {
		if (this.nameApply.isScheduled()) {
			this.nameApply.cancel();
			await this.apply();
		}
		await this.applies.queue(async () => undefined);
	}

	/** The Name field, which has focus when the editor opens, says how to open accessibility help, unless turned off. */
	private withHelpHint(label: string): string {
		if (!this.configurationService.getValue(AccessibilityVerbositySettingId.SessionWorkspaceEditor)) {
			return label;
		}
		const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
		return keybinding
			? localize('workspaceEditor.nameAriaWithHelp', "{0}, use {1} for accessibility help", label, keybinding)
			: localize('workspaceEditor.nameAriaWithHelpCommand', "{0}, run the command Open Accessibility Help for accessibility help", label);
	}

	private renderRow(body: HTMLElement, label: string, labelId?: string, required?: boolean): HTMLElement {
		const row = DOM.append(body, DOM.$('.session-workspace-editor-row'));
		const labelElement = DOM.append(row, DOM.$('.session-workspace-editor-label', labelId ? { id: labelId } : undefined, label));
		if (required) {
			// The controls say they are required to screen readers
			DOM.append(labelElement, DOM.$('span.session-workspace-editor-required', { 'aria-hidden': 'true' }, '*'));
		}
		return row;
	}

	private updateCreateButton(): void {
		if (this.createButton && this.createReason) {
			this.createButton.enabled = this.model.isValid && !this.creating;
			if (this.creating) {
				this.createButton.label = localize('workspaceEditor.creating', "Creating...");
			}
			if (this.cancelButton) {
				this.cancelButton.enabled = !this.creating;
			}
			this.createReason.textContent = [
				this.model.name.trim() ? undefined : localize('workspaceEditor.nameRequired', "A workspace needs a name."),
				this.model.folders.length ? undefined : localize('workspaceEditor.foldersRequired', "Add a folder: a workspace needs at least one."),
			].filter(reason => !!reason).join(' ');
		}
	}

	/** Shows what a new workspace still needs: a name, and a folder. */
	private showValidation(): void {
		if (!this.validationShown) {
			this.validationShown = true;
			this.nameInput.validate();
			this.renderFolders();
		}
	}

	/** Creates the new workspace, once it has a name and a folder, and closes the editor; else shows what it needs. */
	private async create(): Promise<void> {
		if (this.creating) {
			return;
		}
		this.showValidation();
		if (!this.model.isValid) {
			return;
		}
		this.createRequested = true;
		this.creating = true;
		this.updateCreateButton();
		try {
			await this.apply();
		} finally {
			this.creating = false;
			if (this.createButton) {
				this.createButton.label = localize('workspaceEditor.create', "Create");
			}
		}
		if (this._store.isDisposed) {
			return;
		}
		if (this.workspace) {
			this._onDidRequestClose.fire();
		} else {
			// Creating failed, which the user was told
			this.createRequested = false;
			this.updateCreateButton();
		}
	}

	/** The modal's title shows the name. */
	private fireName(): void {
		this._onDidChangeName.fire(this.model.name.trim());
	}

	private renderIconButton(): void {
		const icon = getSessionWorkspaceIcon(this.model.icon);
		DOM.clearNode(this.iconButton);
		const element = DOM.append(this.iconButton, renderIcon(icon));
		element.setAttribute('aria-hidden', 'true');
		element.style.color = getSessionWorkspaceCssColor(this.model.color, this.themeService.getColorTheme()) ?? '';
		this.iconButton.setAttribute('aria-label', localize('workspaceEditor.iconAria', "Workspace Icon: {0}", icon.id));
	}

	/**
	 * The Color row: Default, the colors a workspace's icon can have, and its custom color, as a radio group that arrow
	 * keys move and select in, as native radio buttons do, with Tab reaching the selected one. The custom color is a split
	 * button: its dot, a swatch of the radio group once there is one, and the palette, a button of its own that picks
	 * another through the system's color panel. The last custom color picked stays, as the editor stores it.
	 */
	private renderColors(row: HTMLElement): void {
		const line = DOM.append(row, DOM.$('.session-workspace-editor-color'));
		const group = DOM.append(line, DOM.$('.session-workspace-editor-swatches', { role: 'radiogroup', 'aria-labelledby': 'session-workspace-editor-color-label' }));
		const renderSwatch = (label: string) => {
			const element = DOM.append(group, DOM.$('.session-workspace-editor-swatch', { role: 'radio', 'aria-label': label }));
			this._register(this.hoverService.setupDelayedHover(element, () => ({ content: element.getAttribute('aria-label') ?? label })));
			return element;
		};
		const fixed = [
			{ id: undefined, label: localize('workspaceEditor.defaultColor', "Default") },
			...SESSION_WORKSPACE_COLORS,
		].map(choice => {
			const element = renderSwatch(choice.label);
			const swatch = DOM.append(element, renderIcon(choice.id ? Codicon.circleFilled : Codicon.circleSlash));
			swatch.setAttribute('aria-hidden', 'true');
			if (choice.id) {
				swatch.style.color = asCssVariable(choice.id);
			}
			return { id: (): string | undefined => choice.id, element };
		});

		// The custom color: the workspace's, else the last one the user picked
		const ownColor = this.model.color && isCustomSessionWorkspaceColor(this.model.color) ? this.model.color : undefined;
		const lastColor = this.storageService.get(LAST_CUSTOM_COLOR_STORAGE_KEY, StorageScope.PROFILE);
		let customColor = ownColor ?? (lastColor && isCustomSessionWorkspaceColor(lastColor) ? lastColor : undefined);
		// One box of two parts, as a split button: the custom color's dot, ringed so that any color shows, then the palette
		const split = DOM.append(group, DOM.$('.session-workspace-editor-custom-split', { role: 'presentation' }));
		const customElement = DOM.append(split, DOM.$('.session-workspace-editor-swatch.custom', { role: 'radio' }));
		this._register(this.hoverService.setupDelayedHover(customElement, () => ({ content: customElement.getAttribute('aria-label') ?? '' })));
		const customDot = DOM.append(customElement, DOM.$('span.session-workspace-editor-custom-dot', { 'aria-hidden': 'true' }));
		const chooseLabel = localize('workspaceEditor.chooseCustomColor', "Choose Custom Color...");
		const palette = DOM.append(split, DOM.$('.session-workspace-editor-custom-palette', { role: 'button', tabindex: '0', 'aria-haspopup': 'dialog', 'aria-label': chooseLabel }));
		this._register(this.hoverService.setupDelayedHover(palette, { content: chooseLabel }));
		DOM.append(palette, renderIcon(Codicon.symbolColor)).setAttribute('aria-hidden', 'true');
		const custom = { id: (): string | undefined => customColor, element: customElement };
		const all = [...fixed, custom];
		const radios = () => customColor ? all : fixed;

		const update = () => {
			const choices = radios();
			// Without a custom color, only the palette shows
			customElement.hidden = !customColor;
			customElement.setAttribute('aria-label', customColor ? localize('workspaceEditor.customColorSet', "Custom Color, {0}", customColor) : '');
			customDot.style.backgroundColor = customColor ?? '';
			const checkedIndex = choices.findIndex(choice => choice.id() === this.model.color);
			for (const choice of all) {
				const index = choices.indexOf(choice);
				if (index < 0) {
					choice.element.removeAttribute('aria-checked');
					choice.element.tabIndex = -1;
					continue;
				}
				choice.element.setAttribute('aria-checked', String(index === checkedIndex));
				choice.element.tabIndex = index === Math.max(checkedIndex, 0) ? 0 : -1;
			}
			this.renderIconButton();
		};
		const select = (index: number) => {
			const choice = radios()[index];
			this.model.setColor(choice.id());
			update();
			choice.element.focus();
			void this.apply();
		};

		// The system's color panel, through a native color input
		const inputContainer = DOM.append(line, DOM.$('.session-workspace-editor-color-input-container'));
		const input = DOM.append(inputContainer, DOM.$<HTMLInputElement>('input.session-workspace-editor-color-input', { type: 'color', tabindex: '-1', 'aria-hidden': 'true' }));
		const pickCustomColor = () => {
			input.value = customColor ?? '#3794ff';
			input.click();
		};
		// The color previews as the user moves through the panel, and applies once they pick it
		this._register(DOM.addDisposableListener(input, 'input', () => {
			customColor = input.value.toLowerCase();
			this.model.setColor(customColor);
			update();
		}));
		this._register(DOM.addDisposableListener(input, 'change', () => {
			customColor = input.value.toLowerCase();
			this.storageService.store(LAST_CUSTOM_COLOR_STORAGE_KEY, customColor, StorageScope.PROFILE, StorageTarget.USER);
			this.model.setColor(customColor);
			update();
			void this.apply();
		}));
		// The palette picks a color; Left Arrow goes back to the colors
		this._register(DOM.addDisposableListener(palette, DOM.EventType.CLICK, () => pickCustomColor()));
		this._register(DOM.addDisposableListener(palette, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
				DOM.EventHelper.stop(event, true);
				pickCustomColor();
			} else if (event.equals(KeyCode.LeftArrow)) {
				DOM.EventHelper.stop(event, true);
				radios().find(choice => choice.element.tabIndex === 0)?.element.focus();
			}
		}));

		for (const choice of all) {
			const indexOf = () => radios().indexOf(choice);
			this._register(DOM.addDisposableListener(choice.element, DOM.EventType.CLICK, () => select(indexOf())));
			this._register(DOM.addDisposableListener(choice.element, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const event = new StandardKeyboardEvent(e);
				const index = indexOf();
				if (index < 0) {
					return;
				}
				const count = radios().length;
				const next = event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow) ? (index + 1) % count
					: event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow) ? (index - 1 + count) % count
						: event.equals(KeyCode.Home) ? 0
							: event.equals(KeyCode.End) ? count - 1
								: event.equals(KeyCode.Space) || event.equals(KeyCode.Enter) ? index
									: undefined;
				if (next !== undefined) {
					DOM.EventHelper.stop(event, true);
					select(next);
				}
			}));
		}
		update();
	}

	/** Picks the icon with the shared icon picker: an icon, or the default icon when the user resets it. */
	private async pickIcon(): Promise<void> {
		const icon = await this.iconPicker.pickIcons(localize('workspaceEditor.pickIcon', "Change Workspace Icon"));
		if (icon === undefined || this._store.isDisposed) {
			return;
		}
		this.model.setIcon(icon?.id);
		this.renderIconButton();
		this.iconButton.focus();
		status(icon
			? localize('workspaceEditor.iconSet', "Workspace icon set to {0}", icon.id)
			: localize('workspaceEditor.iconReset', "Workspace icon reset to the default"));
		void this.apply();
	}

	private renderFolders(): void {
		const folders = this.model.folders;
		this.foldersTable.splice(0, this.foldersTable.length, folders.map((folder, index) => ({
			folder,
			// One folder needs no tag
			isDefault: index === 0 && folders.length > 1,
			canSetDefault: index > 0,
			canRemove: this.isNew || folders.length > 1,
		})));
		this.tableContainer.classList.toggle('empty', folders.length === 0);
		this.foldersMessage.textContent = folders.length || !this.validationShown ? '' : localize('workspaceEditor.foldersRequired', "Add a folder: a workspace needs at least one.");
		this.updateCreateButton();
		this.layoutFolders();
		this.scrollable.scanDomNode();
		this._onDidChangeContentHeight.fire();
	}

	/**
	 * Lays out the table at the width of its row, so that it never reaches past the content and clips its actions column.
	 * The actions column is as wide as its actions, Name takes {@link FOLDER_NAME_COLUMN_PERCENTAGE}% and Path the rest.
	 */
	private layoutFolders(): void {
		const actionsWidth = Math.ceil(this.folderActionsProbe.getBoundingClientRect().width);
		if (actionsWidth && actionsWidth + 2 * FOLDER_CELL_PADDING !== this.folderActionsWidth) {
			this.folderActionsWidth = actionsWidth + 2 * FOLDER_CELL_PADDING;
			this._onDidChangeFolderActionsWidth.fire();
		}
		const width = this.tableContainer.parentElement?.clientWidth;
		// An empty table keeps a row's height, for No folders yet
		this.foldersTable.layout(Math.max(this.foldersTable.length, 1) * FOLDER_ROW_HEIGHT + FOLDER_HEADER_HEIGHT, width || undefined);
		if (width) {
			this.foldersTable.resizeColumn(0, FOLDER_NAME_COLUMN_PERCENTAGE);
		}
	}

	private setDefaultFolder(folder: URI): void {
		const hadFocus = this.foldersHaveFocus();
		this.model.setDefaultFolder(folder);
		this.renderFolders();
		if (hadFocus) {
			this.focusFolderRow(0); // the default folder is first
		}
		status(localize('workspaceEditor.defaultSet', "{0} is the default folder", basename(folder)));
		void this.apply();
	}

	private removeFolder(folder: URI): void {
		const hadFocus = this.foldersHaveFocus();
		const index = this.model.folders.findIndex(candidate => this.uriIdentityService.extUri.isEqual(candidate, folder));
		this.model.removeFolder(folder);
		this.renderFolders();
		if (hadFocus) {
			this.focusFolderRow(Math.min(index, this.foldersTable.length - 1));
		}
		this.syncName();
		status(localize('workspaceEditor.removed', "Removed {0}", basename(folder)));
		void this.apply();
	}

	private foldersHaveFocus(): boolean {
		return DOM.isAncestorOfActiveElement(this.tableContainer);
	}

	/**
	 * Keeps the keyboard in the table after a row's action re-renders its rows, which removes the focused action: on the
	 * given row, or on Add Folder once there is none.
	 */
	private focusFolderRow(index: number): void {
		if (index < 0) {
			this.addFolderButton.focus();
			return;
		}
		this.foldersTable.setFocus([index]);
		this.foldersTable.domFocus();
	}

	private async addFolders(): Promise<void> {
		const folders = await this.fileDialogService.showOpenDialog({
			title: localize('workspaceEditor.addFolderTitle', "Add Folder to Workspace"),
			openLabel: localize({ key: 'workspaceEditor.select', comment: ['&& denotes a mnemonic'] }, "&&Select"),
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: true,
		});
		if (!folders?.length || this._store.isDisposed) {
			return;
		}
		const added = this.model.addFolders(folders);
		if (!added.length) {
			return;
		}
		this.renderFolders();
		this.syncName();
		status(localize('workspaceEditor.added', "Added {0}", added.map(folder => basename(folder)).join(', ')));
		void this.apply();
	}

	/** Until the user names a new workspace, its name follows its default folder. */
	private syncName(): void {
		if (!this.model.nameEdited && this.nameInput.value !== this.model.name) {
			this.nameInput.value = this.model.name;
			this.fireName();
		}
	}

	private flushName(): void {
		if (this.nameApply.isScheduled()) {
			this.nameApply.cancel();
			void this.apply();
		}
	}

	/**
	 * Applies the workspace as the user changed it, one change at a time: creates a new workspace once the user chose
	 * Create, and updates it after. Nothing is applied while the workspace is invalid.
	 */
	private apply(): Promise<void> {
		this.nameApply.cancel();
		return this.applies.queue(async () => {
			if (!this.model.isValid || this._store.isDisposed) {
				return;
			}
			if (this.isNew && !this.workspace && !this.createRequested) {
				return;
			}
			const draft = this.model.draft;
			try {
				let workspace: IRecentSessionWorkspace;
				if (!this.workspace || !this.applied) {
					workspace = await this.workspacesService.createWorkspace(draft.name, draft.folders, { icon: draft.icon, color: draft.color });
				} else {
					const update = this.model.getUpdate(this.applied);
					if (!update) {
						return;
					}
					workspace = await this.workspacesService.updateWorkspace(this.workspace.uri, update);
				}
				this.workspace = workspace;
				this.applied = draft;
				this._onDidApply.fire(workspace);
			} catch (error) {
				this.logService.error(error);
				// A refusal of the workspaces service explains itself; any other error stays in the log
				this.notificationService.error(error instanceof SessionWorkspaceError ? error.message : this.workspace
					? localize('workspaceEditor.saveFailed', "Could not save the workspace '{0}'. See the log for details.", draft.name)
					: localize('workspaceEditor.createFailed', "Could not create the workspace '{0}'. See the log for details.", draft.name));
			}
		});
	}
}

/** The Workspace editor, which opens in a modal that fits its content: see {@link SessionWorkspaceEditorWidget}. */
export class SessionWorkspaceEditor extends EditorPane {

	static readonly ID = 'sessions.editor.workspace';

	private readonly _onDidChangePreferredContentSize = this._register(new Emitter<void>());
	readonly onDidChangePreferredContentSize = this._onDidChangePreferredContentSize.event;

	private container: HTMLElement | undefined;
	/** The widget of the input shown, with its bindings to that input, which outlive the input's last apply. */
	private current: { readonly widget: SessionWorkspaceEditorWidget; readonly input: SessionWorkspaceEditorInput; readonly bindings: DisposableStore } | undefined;
	private dimension: DOM.Dimension | undefined;
	private contentHeight: number | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(SessionWorkspaceEditor.ID, group, telemetryService, themeService, storageService);
	}

	/** The content's height, measured once it is shown, at the editor's width. */
	get preferredContentSize(): { readonly width: number; readonly height: number } | undefined {
		return this.contentHeight === undefined ? undefined : { width: SESSION_WORKSPACE_EDITOR_WIDTH, height: this.contentHeight };
	}

	protected override createEditor(parent: HTMLElement): void {
		const container = this.container = DOM.append(parent, DOM.$('.session-workspace-editor-pane'));
		// Accessibility help, Alt+F1, explains the editor while it has focus
		const focused = SessionWorkspaceEditorFocusedContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(DOM.trackFocus(container));
		this._register(focusTracker.onDidFocus(() => focused.set(true)));
		this._register(focusTracker.onDidBlur(() => focused.set(false)));
		this._register(toDisposable(() => focused.reset()));
	}

	override async setInput(input: SessionWorkspaceEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested || !this.container) {
			return;
		}
		this.release();
		DOM.clearNode(this.container);
		const bindings = new DisposableStore();
		const widget = this.instantiationService.createInstance(SessionWorkspaceEditorWidget, this.container, input.target);
		bindings.add(widget.onDidChangeName(name => input.setName(name)));
		bindings.add(widget.onDidApply(workspace => input.didApply(workspace)));
		bindings.add(widget.onDidRequestClose(() => void this.group.closeEditor(input)));
		bindings.add(widget.onDidChangeContentHeight(() => this.measure()));
		this.current = { widget, input, bindings };
		if (this.dimension) {
			widget.layout(this.dimension);
		}
		this.measure();
	}

	/** Tells the modal the content's height, which the folders and validation messages change. */
	private measure(): void {
		const height = this.current?.widget.contentHeight;
		if (height && height !== this.contentHeight) {
			this.contentHeight = height;
			this._onDidChangePreferredContentSize.fire();
		}
	}

	override clearInput(): void {
		this.release();
		this.contentHeight = undefined;
		super.clearInput();
	}

	/** Lets go of the shown input: a name still being typed applies, and reaches the input, before the widget goes. */
	private release(): void {
		const current = this.current;
		this.current = undefined;
		if (current) {
			current.input.trackApply(current.widget.flush().finally(() => {
				current.bindings.dispose();
				current.widget.dispose();
			}));
		}
	}

	override focus(): void {
		super.focus();
		this.current?.widget.focus();
	}

	override layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.current?.widget.layout(dimension);
		this.measure();
	}

	override dispose(): void {
		this.release();
		super.dispose();
	}
}
