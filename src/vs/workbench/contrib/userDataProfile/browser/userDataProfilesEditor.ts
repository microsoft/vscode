/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/userDataProfilesEditor';
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventType, IDomPosition } from 'vs/base/browser/dom';
import { Action, IAction } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { isUserDataProfile, IUserDataProfile, IUserDataProfilesService, UseDefaultProfileFlags } from 'vs/platform/userDataProfile/common/userDataProfile';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext, IEditorSerializer, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IUserDataProfilesEditor } from 'vs/workbench/contrib/userDataProfile/common/userDataProfile';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { defaultUserDataProfileIcon, IProfileTemplateInfo, IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Button, ButtonWithDropdown } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IObjectTreeElement, ITreeNode, ITreeRenderer, ObjectTreeElementCollapseState } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Checkbox } from 'vs/base/browser/ui/toggle/toggle';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { DEFAULT_ICON, ICONS } from 'vs/workbench/services/userDataProfile/common/userDataProfileIcons';
import { WorkbenchIconSelectBox } from 'vs/workbench/services/userDataProfile/browser/iconSelectBox';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IHoverWidget } from 'vs/base/browser/ui/hover/hover';
import { ISelectOptionItem, SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { URI } from 'vs/base/common/uri';
import { equals } from 'vs/base/common/objects';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';

export const profilesSashBorder = registerColor('profiles.sashBorder', { dark: PANEL_BORDER, light: PANEL_BORDER, hcDark: PANEL_BORDER, hcLight: PANEL_BORDER }, localize('profilesSashBorder', "The color of the Profiles editor splitview sash border."));

function getContentElements(content: string): HTMLElement[] {
	const elements: HTMLSpanElement[] = [];
	for (let segment of renderLabelWithIcons(content)) {
		if (typeof (segment) === 'string') {
			segment = segment.trim();

			// Ignore empty segment
			if (segment === '') {
				continue;
			}

			// Convert string segments to <span> nodes
			const node = document.createElement('span');
			node.textContent = segment;
			elements.push(node);
		} else {
			elements.push(segment);
		}
	}

	return elements;
}

interface IProfileElement {
	readonly onDidChange?: Event<{
		readonly name?: boolean;
		readonly icon?: boolean;
		readonly flags?: boolean;
		readonly active?: boolean;
	}>;
	readonly name: string;
	readonly icon?: string;
	readonly isActive?: boolean;
}

abstract class AbstractUserDataProfileElement extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<{
		readonly name?: boolean;
		readonly icon?: boolean;
		readonly flags?: boolean;
		readonly active?: boolean;
	}>());
	readonly onDidChange = this._onDidChange.event;

	protected _name = '';
	get name(): string { return this._name; }
	set name(label: string) {
		if (this._name !== label) {
			this._name = label;
			this._onDidChange.fire({ name: true });
		}
	}

	protected _icon: string | undefined;
	get icon(): string | undefined { return this._icon; }
	set icon(icon: string | undefined) {
		if (this._icon !== icon) {
			this._icon = icon;
			this._onDidChange.fire({ icon: true });
		}
	}

	protected _flags: UseDefaultProfileFlags | undefined;
	get flags(): UseDefaultProfileFlags | undefined { return this._flags; }
	set flags(flags: UseDefaultProfileFlags | undefined) {
		if (!equals(this._flags, flags)) {
			this._flags = flags;
			this._onDidChange.fire({ flags: true });
		}
	}

	private _isActive: boolean = false;
	get isActive(): boolean { return this._isActive; }
	set isActive(active: boolean) {
		if (this._isActive !== active) {
			this._isActive = active;
			this._onDidChange.fire({ active: true });
		}
	}

	abstract readonly isDirty: boolean;
	abstract readonly primaryAction: IAction;
	abstract readonly secondaryActions: IAction[];
}

class UserDataProfileElement extends AbstractUserDataProfileElement implements IProfileElement {

	constructor(
		readonly profile: IUserDataProfile,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
	) {
		super();
		this._name = profile.name;
		this._icon = profile.icon;
		this.flags = profile.useDefaultFlags;
		this.isActive = this.userDataProfileService.currentProfile.id === profile.id;
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => {
			this.isActive = this.userDataProfileService.currentProfile.id === profile.id;
		}));

		this._register(this.userDataProfilesService.onDidChangeProfiles(() => {
			const profile = this.userDataProfilesService.profiles.find(p => p.id === this.profile.id);
			if (profile) {
				this._name = profile.name;
				this._icon = profile.icon;
				this.flags = profile.useDefaultFlags;
			}
		}));
	}

	get isDirty(): boolean {
		if (this.name !== this.profile.name) {
			return true;
		}
		if (this.icon !== this.profile.icon) {
			return true;
		}
		if (!equals(this.flags, this.profile.useDefaultFlags)) {
			return true;
		}
		return false;
	}

	private async save(): Promise<void> {
		if (!this.isDirty) {
			return;
		}
		const useDefaultFlags: UseDefaultProfileFlags | undefined = this.flags
			? this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.globalState && this.flags.extensions ? undefined : this.flags
			: undefined;

		await this.userDataProfileManagementService.updateProfile(this.profile, {
			name: this.name,
			icon: this.icon,
			useDefaultFlags: this.profile.useDefaultFlags && !useDefaultFlags ? {} : useDefaultFlags
		});
	}

	readonly primaryAction = new Action('userDataProfile.save', localize('save', "Save"), undefined, true, () => this.save());
	readonly secondaryActions: IAction[] = [
		new Action('userDataProfile.delete', localize('delete', "Delete"), undefined, true, () => this.userDataProfileManagementService.removeProfile(this.profile))
	];

	// protected validate(): boolean {
	// 	if (!profile && this.userDataProfilesService.profiles.some(p => p.name === quickPick.value)) {
	// 		quickPick.validationMessage = localize('profileExists', "Profile with name {0} already exists.", quickPick.value);
	// 		quickPick.severity = Severity.Warning;
	// 		return;
	// 	}
	// 	if (resources.every(resource => !resource.picked)) {
	// 		quickPick.validationMessage = localize('invalid configurations', "The profile should contain at least one configuration.");
	// 		quickPick.severity = Severity.Warning;
	// 		return;
	// 	}
	// }
}

class NewProfileElement extends AbstractUserDataProfileElement implements IProfileElement {

	copyFrom: IUserDataProfile | URI | undefined;
	readonly primaryAction = new Action('userDataProfile.create', localize('create', "Create & Apply"), undefined, true, () => this.save());
	readonly secondaryActions: IAction[] = [];
	readonly isDirty = true;

	constructor(
		name: string,
		@IUserDataProfileImportExportService private readonly userDataProfileImportExportService: IUserDataProfileImportExportService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
	) {
		super();
		this._name = name;
	}

	private async save(): Promise<void> {
		const useDefaultFlags: UseDefaultProfileFlags | undefined = this.flags
			? this.flags.settings && this.flags.keybindings && this.flags.tasks && this.flags.globalState && this.flags.extensions ? undefined : this.flags
			: undefined;

		if (this.copyFrom instanceof URI) {
			// this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createFromTemplate', createProfileTelemetryData);
			await this.userDataProfileImportExportService.importProfile(this.copyFrom, { mode: 'apply', name: this.name, useDefaultFlags, icon: this.icon ? this.icon : undefined });
		} else if (isUserDataProfile(this.copyFrom)) {
			// this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createFromProfile', createProfileTelemetryData);
			await this.userDataProfileImportExportService.createFromProfile(this.copyFrom, this.name, { useDefaultFlags, icon: this.icon ? this.icon : undefined });
		} else {
			// this.telemetryService.publicLog2<CreateProfileInfoEvent, CreateProfileInfoClassification>('userDataProfile.createEmptyProfile', createProfileTelemetryData);
			await this.userDataProfileManagementService.createAndEnterProfile(this.name, { useDefaultFlags, icon: this.icon ? this.icon : undefined });
		}
	}
}

class UserDataProfilesEditorModel extends EditorModel {

	private static INSTANCE: UserDataProfilesEditorModel | undefined;
	static getInstance(instantiationService: IInstantiationService): UserDataProfilesEditorModel {
		if (!UserDataProfilesEditorModel.INSTANCE) {
			UserDataProfilesEditorModel.INSTANCE = instantiationService.createInstance(UserDataProfilesEditorModel);
		}
		return UserDataProfilesEditorModel.INSTANCE;
	}

	private _profiles: AbstractUserDataProfileElement[] = [];
	get profiles(): AbstractUserDataProfileElement[] {
		return this._profiles.sort((a, b) => {
			if (a instanceof UserDataProfileElement && a.profile.isDefault) {
				return -1;
			}
			if (b instanceof UserDataProfileElement && b.profile.isDefault) {
				return 1;
			}
			return a.name.localeCompare(b.name);
		});
	}

	private newProfileElement: NewProfileElement | undefined;

	private _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		for (const profile of userDataProfilesService.profiles) {
			this._profiles.push(this._register(instantiationService.createInstance(UserDataProfileElement, profile)));
		}
		this._register(toDisposable(() => this._profiles.splice(0, this._profiles.length)));
		this._register(userDataProfilesService.onDidChangeProfiles(e => {
			for (const profile of e.added) {
				if (profile.name === this.newProfileElement?.name) {
					this._profiles.splice(this._profiles.indexOf(this.newProfileElement), 1)[0]?.dispose();
					this.newProfileElement = undefined;
				}
				this._profiles.push(this._register(instantiationService.createInstance(UserDataProfileElement, profile)));
			}
			for (const profile of e.removed) {
				const index = this._profiles.findIndex(p => p instanceof UserDataProfileElement && p.profile.id === profile.id);
				if (index !== -1) {
					this._profiles.splice(index, 1)[0]?.dispose();
				}
			}
			this._onDidChange.fire();
		}));
	}

	createNewProfile(): IProfileElement {
		if (!this.newProfileElement) {
			this.newProfileElement = this.instantiationService.createInstance(NewProfileElement, localize('untitled', "Untitled"));
			this._profiles.push(this.newProfileElement);
			this._onDidChange.fire();
		}
		return this.newProfileElement;
	}
}

export class UserDataProfilesEditor extends EditorPane implements IUserDataProfilesEditor {

	static readonly ID: string = 'workbench.editor.userDataProfiles';

	private container: HTMLElement | undefined;
	private splitView: SplitView<number> | undefined;
	private profilesTree: WorkbenchObjectTree<IProfileElement> | undefined;
	private profileWidget: ProfileWidget | undefined;

	private model: UserDataProfilesEditorModel | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(UserDataProfilesEditor.ID, group, telemetryService, themeService, storageService);
	}

	layout(dimension: Dimension, position?: IDomPosition | undefined): void {
		if (this.container && this.splitView) {
			const height = dimension.height - 20;
			this.splitView.layout(this.container?.clientWidth, height);
			this.splitView.el.style.height = `${height}px`;
		}
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('.profiles-editor'));

		const sidebarView = append(this.container, $('.sidebar-view'));
		const sidebarContainer = append(sidebarView, $('.sidebar-container'));

		const contentsView = append(this.container, $('.contents-view'));
		const contentsContainer = append(contentsView, $('.contents-container'));
		this.profileWidget = this._register(this.instantiationService.createInstance(ProfileWidget, contentsContainer));

		this.splitView = new SplitView(this.container, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true
		});

		this.renderSidebar(sidebarContainer);
		this.splitView.addView({
			onDidChange: Event.None,
			element: sidebarView,
			minimumSize: 175,
			maximumSize: 300,
			layout: (width, _, height) => {
				sidebarView.style.width = `${width}px`;
				if (height && this.profilesTree) {
					this.profilesTree.getHTMLElement().style.height = `${height - 38}px`;
					this.profilesTree.layout(height - 38, width);
				}
			}
		}, 250, undefined, true);
		this.splitView.addView({
			onDidChange: Event.None,
			element: contentsView,
			minimumSize: 500,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				contentsView.style.width = `${width}px`;
			}
		}, Sizing.Distribute, undefined, true);

		const borderColor = this.theme.getColor(profilesSashBorder)!;
		this.splitView.style({ separatorBorder: borderColor });

		this.registerListeners();

		this.userDataProfileManagementService.getBuiltinProfileTemplates().then(templates => this.profileWidget!.templates = templates);
	}

	private renderSidebar(parent: HTMLElement): void {
		// render New Profile Button
		this.renderNewProfileButton(append(parent, $('.new-profile-button')));

		// render profiles and templates tree
		const renderer = this.instantiationService.createInstance(ProfileTreeElementRenderer);
		const delegate = new ProfileTreeElementDelegate();
		this.profilesTree = this._register(this.instantiationService.createInstance(WorkbenchObjectTree<IProfileElement>, 'ProfilesTree',
			append(parent, $('.profiles-tree')),
			delegate,
			[renderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(extensionFeature: IProfileElement | null): string {
						return extensionFeature?.name ?? '';
					},
					getWidgetAriaLabel(): string {
						return localize('profiles', "Profiles");
					}
				},
				openOnSingleClick: true,
				enableStickyScroll: false,
				identityProvider: {
					getId(e) {
						if (e instanceof UserDataProfileElement) {
							return e.profile.id;
						}
						return e.name;
					}
				}
			}));
	}

	private renderNewProfileButton(parent: HTMLElement): void {
		const button = this._register(new ButtonWithDropdown(parent, {
			actions: [
				new Action('importProfile', localize('importProfile', "Import Profile..."))
			],
			addPrimaryActionToDropdown: false,
			contextMenuProvider: this.contextMenuService,
			supportIcons: true,
			...defaultButtonStyles
		}));
		button.label = `$(add) ${localize('newProfile', "New Profile")}`;
		this._register(button.onDidClick(e => {
			if (this.model) {
				const element = this.model.createNewProfile();
				this.updateProfilesTree(element);
			}
		}));
	}

	private registerListeners(): void {
		if (this.profilesTree) {
			this._register(this.profilesTree.onDidChangeSelection(e => {
				const [element] = e.elements;
				if (element instanceof AbstractUserDataProfileElement) {
					this.profileWidget?.render(element);
				}
			}));

			this._register(this.profilesTree.onContextMenu(e => {
				if (e.element instanceof AbstractUserDataProfileElement) {
					this.contextMenuService.showContextMenu({
						getAnchor: () => e.anchor,
						getActions: () => e.element instanceof AbstractUserDataProfileElement ? e.element.secondaryActions : [],
						getActionsContext: () => e.element
					});
				}
			}));
		}
	}

	override async setInput(input: UserDataProfilesEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.model = await input.resolve();
		this._register(this.model.onDidChange(() => this.updateProfilesTree()));
		this.updateProfilesTree();
	}

	override focus(): void {
		super.focus();
		this.profilesTree?.domFocus();
	}

	private async updateProfilesTree(elementToSelect?: IProfileElement): Promise<void> {
		if (!this.model) {
			return;
		}
		const profileElements: IObjectTreeElement<IProfileElement>[] = this.model.profiles.map(element => ({ element }));
		this.profilesTree?.setChildren(null, [
			{
				element: { name: localize('profiles', "Profiles") },
				children: profileElements,
				collapsible: false,
				collapsed: ObjectTreeElementCollapseState.Expanded
			}
		]);
		if (elementToSelect) {
			this.profilesTree?.setSelection([elementToSelect]);
		} else if (!this.profilesTree?.getSelection().length) {
			const elementToSelect = this.model.profiles.find(profile => profile.isActive) ?? this.model.profiles[0];
			if (elementToSelect) {
				this.profilesTree?.setSelection([elementToSelect]);
			}
		}
	}

}

interface IProfileTreeElementTemplateData {
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly description: HTMLElement;
	readonly disposables: DisposableStore;
}

class ProfileTreeElementDelegate implements IListVirtualDelegate<IProfileElement> {
	getHeight(element: IProfileElement) {
		return 30;
	}
	getTemplateId() { return 'profileTreeElement'; }
}

class ProfileTreeElementRenderer implements ITreeRenderer<IProfileElement, void, IProfileTreeElementTemplateData> {

	readonly templateId = 'profileTreeElement';

	renderTemplate(container: HTMLElement): IProfileTreeElementTemplateData {
		container.classList.add('profile-tree-item');
		const icon = append(container, $('.profile-tree-item-icon'));
		const label = append(container, $('.profile-tree-item-label'));
		const description = append(container, $('.profile-tree-item-description'));
		return { label, icon, description, disposables: new DisposableStore() };
	}

	renderElement({ element }: ITreeNode<IProfileElement, void>, index: number, templateData: IProfileTreeElementTemplateData, height: number | undefined): void {
		templateData.disposables.clear();
		templateData.label.textContent = element.name;
		if (element.icon) {
			templateData.icon.className = ThemeIcon.asClassName(ThemeIcon.fromId(element.icon));
		} else {
			templateData.icon.className = 'hide';
		}
		clearNode(templateData.description);
		if (element.isActive) {
			append(templateData.description, ...getContentElements(localize('activeProfile', "$(check) Active")));
		}
		if (element.onDidChange) {
			templateData.disposables.add(element.onDidChange(e => {
				if (e.name) {
					templateData.label.textContent = element.name;
				}
				if (e.icon) {
					if (element.icon) {
						templateData.icon.className = ThemeIcon.asClassName(ThemeIcon.fromId(element.icon));
					} else {
						templateData.icon.className = 'hide';
					}
				}
				if (e.active) {
					clearNode(templateData.description);
					if (element.isActive) {
						append(templateData.description, ...getContentElements(localize('activeProfile', "$(check) Active")));
					}
				}
			}));
		}
	}

	disposeTemplate(templateData: IProfileTreeElementTemplateData): void {
		templateData.disposables.dispose();
	}
}

class ProfileWidget extends Disposable {

	private readonly profileTitle: HTMLElement;
	private readonly buttonContainer: HTMLElement;
	private readonly iconElement: HTMLElement;
	private readonly nameContainer: HTMLElement;
	private readonly nameInput: InputBox;
	private readonly copyFromContainer: HTMLElement;
	private readonly selectBox: SelectBox;

	private readonly settings: Checkbox;
	private readonly useDefaultSettingsElement: HTMLElement;
	private readonly keybindings: Checkbox;
	private readonly useDefaultKeybindingsElement: HTMLElement;
	private readonly tasks: Checkbox;
	private readonly useDefaultTasksElement: HTMLElement;
	private readonly globalState: Checkbox;
	private readonly useDefaultGlobalStateElement: HTMLElement;
	private readonly extensions: Checkbox;
	private readonly useDefaultExtensionsElement: HTMLElement;

	private _templates: IProfileTemplateInfo[] = [];
	public set templates(templates: IProfileTemplateInfo[]) {
		this._templates = templates;
		this.renderSelectBox();
	}

	private readonly _profileElement = this._register(new MutableDisposable<{ element: AbstractUserDataProfileElement } & IDisposable>());

	constructor(
		parent: HTMLElement,
		@IHoverService private readonly hoverService: IHoverService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const header = append(parent, $('.profile-header'));
		const title = append(header, $('.profile-title'));
		append(title, $('span', undefined, localize('profile', "Profile: ")));
		this.profileTitle = append(title, $('span'));
		this.buttonContainer = append(header, $('.profile-button-container'));

		const body = append(parent, $('.profile-body'));

		this.nameContainer = append(body, $('.profile-name-container'));
		this.iconElement = append(this.nameContainer, $(`${ThemeIcon.asCSSSelector(DEFAULT_ICON)}`, { 'tabindex': '0', 'role': 'button', 'aria-label': localize('icon', "Profile Icon") }));
		this.renderIconSelectBox(this.iconElement);

		this.nameInput = this._register(new InputBox(
			this.nameContainer,
			undefined,
			{
				inputBoxStyles: defaultInputBoxStyles,
				ariaLabel: localize('profileName', "Profile Name"),
				placeholder: localize('profileName', "Profile Name"),
			}
		));
		this.nameInput.onDidChange(value => {
			if (this._profileElement.value) {
				this._profileElement.value.element.name = value;
			}
		});

		this.copyFromContainer = append(body, $('.profile-copy-from-container'));
		append(this.copyFromContainer, $('.profile-copy-from-label', undefined, localize('create from', "Copy from:")));
		this.selectBox = this._register(this.instantiationService.createInstance(SelectBox,
			[],
			0,
			this.contextViewService,
			defaultSelectBoxStyles,
			{
				useCustomDrawn: true,
				ariaLabel: localize('copy profile from', "Copy profile from"),
			}
		));
		this.selectBox.render(append(this.copyFromContainer, $('.profile-select-container')));

		const settingsContainer = append(body, $('.profile-flags-container'));
		this.settings = this._register(new Checkbox(localize('settings', "Settings"), false, defaultCheckboxStyles));
		append(settingsContainer, this.settings.domNode);
		append(settingsContainer, $('', undefined, localize('settings', "Settings")));
		this.useDefaultSettingsElement = append(settingsContainer, $('span.hide.useDefaultProfile', undefined, localize('use default profile', "Using Default Profile")));
		this._register(this.settings.onChange(() => {
			if (this._profileElement.value) {
				this._profileElement.value.element.flags = {
					...this._profileElement.value.element.flags,
					settings: !this.settings.checked,
				};
			}
			this.useDefaultSettingsElement.classList.toggle('hide', this.settings.checked);
		}));

		const keybindingsContainer = append(body, $('.profile-flags-container'));
		this.keybindings = this._register(new Checkbox(localize('keybindings', "Keyboard Shortcuts"), false, defaultCheckboxStyles));
		append(keybindingsContainer, this.keybindings.domNode);
		append(keybindingsContainer, $('', undefined, localize('keybindings', "Keyboard Shortcuts")));
		this.useDefaultKeybindingsElement = append(keybindingsContainer, $('span.hide.useDefaultProfile', undefined, localize('use default profile', "Using Default Profile")));
		this._register(this.keybindings.onChange(() => {
			if (this._profileElement.value) {
				this._profileElement.value.element.flags = {
					...this._profileElement.value.element.flags,
					keybindings: !this.keybindings.checked,
				};
			}
			this.useDefaultKeybindingsElement.classList.toggle('hide', this.keybindings.checked);
		}));

		const tasksContainer = append(body, $('.profile-flags-container'));
		this.tasks = this._register(new Checkbox(localize('tasks', "User Tasks"), false, defaultCheckboxStyles));
		append(tasksContainer, this.tasks.domNode);
		append(tasksContainer, $('', undefined, localize('tasks', "User Tasks")));
		this.useDefaultTasksElement = append(tasksContainer, $('span.hide.useDefaultProfile', undefined, localize('use default profile', "Using Default Profile")));
		this._register(this.tasks.onChange(() => {
			if (this._profileElement.value) {
				this._profileElement.value.element.flags = {
					...this._profileElement.value.element.flags,
					tasks: !this.tasks.checked,
				};
			}
			this.useDefaultTasksElement.classList.toggle('hide', this.tasks.checked);
		}));

		const globalStateContainer = append(body, $('.profile-flags-container'));
		this.globalState = this._register(new Checkbox(localize('globalState', "UI State"), false, defaultCheckboxStyles));
		append(globalStateContainer, this.globalState.domNode);
		append(globalStateContainer, $('', undefined, localize('globalState', "UI State")));
		this.useDefaultGlobalStateElement = append(globalStateContainer, $('span.hide.useDefaultProfile', undefined, localize('use default profile', "Using Default Profile")));
		this._register(this.globalState.onChange(() => {
			if (this._profileElement.value) {
				this._profileElement.value.element.flags = {
					...this._profileElement.value.element.flags,
					globalState: !this.globalState.checked,
				};
			}
			this.useDefaultGlobalStateElement.classList.toggle('hide', this.globalState.checked);
		}));

		const extensionsContainer = append(body, $('.profile-flags-container'));
		this.extensions = this._register(new Checkbox(localize('extensions', "Extensions"), false, defaultCheckboxStyles));
		append(extensionsContainer, this.extensions.domNode);
		append(extensionsContainer, $('', undefined, localize('extensions', "Extensions")));
		this.useDefaultExtensionsElement = append(extensionsContainer, $('span.hide.useDefaultProfile', undefined, localize('use default profile', "Using Default Profile")));
		this._register(this.extensions.onChange(() => {
			if (this._profileElement.value) {
				this._profileElement.value.element.flags = {
					...this._profileElement.value.element.flags,
					extensions: !this.extensions.checked,
				};
			}
			this.useDefaultExtensionsElement.classList.toggle('hide', this.extensions.checked);
		}));
	}

	private renderIconSelectBox(iconContainer: HTMLElement): void {
		const iconSelectBox = this._register(this.instantiationService.createInstance(WorkbenchIconSelectBox, { icons: ICONS, inputBoxStyles: defaultInputBoxStyles }));
		let hoverWidget: IHoverWidget | undefined;
		const showIconSelectBox = () => {
			iconSelectBox.clearInput();
			hoverWidget = this.hoverService.showHover({
				content: iconSelectBox.domNode,
				target: iconContainer,
				position: {
					hoverPosition: HoverPosition.BELOW,
				},
				persistence: {
					sticky: true,
				},
				appearance: {
					showPointer: true,
				},
			}, true);

			if (hoverWidget) {
				iconSelectBox.layout(new Dimension(486, 260));
				iconSelectBox.focus();
			}
		};
		this._register(addDisposableListener(iconContainer, EventType.CLICK, (e: MouseEvent) => {
			EventHelper.stop(e, true);
			showIconSelectBox();
		}));
		this._register(addDisposableListener(iconContainer, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				EventHelper.stop(event, true);
				showIconSelectBox();
			}
		}));
		this._register(addDisposableListener(iconSelectBox.domNode, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Escape)) {
				EventHelper.stop(event, true);
				hoverWidget?.dispose();
				iconContainer.focus();
			}
		}));
		this._register(iconSelectBox.onDidSelect(selectedIcon => {
			hoverWidget?.dispose();
			iconContainer.focus();
			if (this._profileElement.value) {
				this._profileElement.value.element.icon = selectedIcon.id;
			}
		}));
	}

	private renderSelectBox(): void {
		const separator = { text: '\u2500\u2500\u2500\u2500\u2500\u2500', isDisabled: true };
		const profileOptions: (ISelectOptionItem & { id?: string; source?: IUserDataProfile | URI })[] = [];
		profileOptions.push({ text: localize('empty profile', "None") });
		if (this._templates.length) {
			profileOptions.push({ ...separator, decoratorRight: localize('from templates', "Profile Templates") });
			for (const template of this._templates) {
				profileOptions.push({ text: template.name, id: template.url, source: URI.parse(template.url) });
			}
		}
		profileOptions.push({ ...separator, decoratorRight: localize('from existing profiles', "Existing Profiles") });
		for (const profile of this.userDataProfilesService.profiles) {
			profileOptions.push({ text: profile.name, id: profile.id, source: profile });
		}
		this.selectBox.setOptions(profileOptions);
		this._register(this.selectBox.onDidSelect(option => {
			if (this._profileElement.value?.element instanceof NewProfileElement) {
				this._profileElement.value.element.copyFrom = profileOptions[option.index].source;
			}
		}));
	}

	render(profileElement: AbstractUserDataProfileElement): void {
		const disposables = new DisposableStore();
		this._profileElement.value = { element: profileElement, dispose: () => disposables.dispose() };

		this.renderProfileElement(profileElement);
		disposables.add(profileElement.onDidChange(e => this.renderProfileElement(profileElement)));

		const profile = profileElement instanceof UserDataProfileElement ? profileElement.profile : undefined;
		this.copyFromContainer.classList.toggle('hide', !!profile);
		this.nameContainer.classList.toggle('hide', !!profile?.isDefault);
		this.buttonContainer.classList.toggle('hide', !!profile?.isDefault);

		if (profile?.isDefault) {
			this.settings.disable();
			this.keybindings.disable();
			this.tasks.disable();
			this.globalState.disable();
			this.extensions.disable();
		} else {
			this.settings.enable();
			this.keybindings.enable();
			this.tasks.enable();
			this.globalState.enable();
			this.extensions.enable();
		}

		let button: Button | ButtonWithDropdown;
		if (profileElement.secondaryActions.length) {
			button = disposables.add(new ButtonWithDropdown(this.buttonContainer, {
				actions: profileElement.secondaryActions,
				addPrimaryActionToDropdown: false,
				contextMenuProvider: this.contextMenuService,
				supportIcons: true,
				...defaultButtonStyles
			}));
		} else {
			button = disposables.add(new Button(this.buttonContainer, {
				supportIcons: true,
				...defaultButtonStyles
			}));
		}
		button.label = profileElement.primaryAction.label;
		disposables.add(button.onDidClick(() => profileElement.primaryAction.run()));
		this.nameInput.focus();
	}

	private renderProfileElement(profileElement: AbstractUserDataProfileElement): void {
		this.profileTitle.textContent = profileElement.name;
		this.nameInput.value = profileElement.name;
		if (profileElement.icon) {
			this.iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(profileElement.icon));
		} else {
			this.iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(DEFAULT_ICON.id));
		}
		this.settings.checked = !profileElement.flags?.settings;
		this.useDefaultSettingsElement.classList.toggle('hide', this.settings.checked);
		this.keybindings.checked = !profileElement.flags?.keybindings;
		this.useDefaultKeybindingsElement.classList.toggle('hide', this.keybindings.checked);
		this.tasks.checked = !profileElement.flags?.tasks;
		this.useDefaultTasksElement.classList.toggle('hide', this.tasks.checked);
		this.globalState.checked = !profileElement.flags?.globalState;
		this.useDefaultGlobalStateElement.classList.toggle('hide', this.globalState.checked);
		this.extensions.checked = !profileElement.flags?.extensions;
		this.useDefaultExtensionsElement.classList.toggle('hide', this.extensions.checked);
	}
}

export class UserDataProfilesEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.userDataProfiles';
	readonly resource = undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	override get typeId(): string { return UserDataProfilesEditorInput.ID; }
	override getName(): string { return localize('userDataProfiles', "Profiles"); }
	override getIcon(): ThemeIcon | undefined { return defaultUserDataProfileIcon; }

	override async resolve(): Promise<UserDataProfilesEditorModel> {
		return UserDataProfilesEditorModel.getInstance(this.instantiationService);
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean { return otherInput instanceof UserDataProfilesEditorInput; }
}

export class UserDataProfilesEditorInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): boolean { return true; }
	serialize(editorInput: EditorInput): string { return ''; }
	deserialize(instantiationService: IInstantiationService): EditorInput { return instantiationService.createInstance(UserDataProfilesEditorInput); }
}
