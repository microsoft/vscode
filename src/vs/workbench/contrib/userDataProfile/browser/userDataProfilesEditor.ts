/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/userDataProfilesEditor';
import { $, addDisposableListener, append, Dimension, EventHelper, EventType, IDomPosition, trackFocus } from 'vs/base/browser/dom';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IUserDataProfile, IUserDataProfilesService, ProfileResourceType } from 'vs/platform/userDataProfile/common/userDataProfile';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext, IEditorSerializer, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IUserDataProfilesEditor } from 'vs/workbench/contrib/userDataProfile/common/userDataProfile';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { defaultUserDataProfileIcon, IProfileTemplateInfo, IUserDataProfileManagementService, PROFILE_FILTER } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Button, ButtonWithDropdown } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { WorkbenchAsyncDataTree, WorkbenchList } from 'vs/platform/list/browser/listService';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import { Checkbox } from 'vs/base/browser/ui/toggle/toggle';
import { DEFAULT_ICON, ICONS } from 'vs/workbench/services/userDataProfile/common/userDataProfileIcons';
import { WorkbenchIconSelectBox } from 'vs/workbench/services/userDataProfile/browser/iconSelectBox';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IHoverService, WorkbenchHoverDelegate } from 'vs/platform/hover/browser/hover';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IHoverWidget } from 'vs/base/browser/ui/hover/hover';
import { ISelectOptionItem, SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import { URI } from 'vs/base/common/uri';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { isUndefined } from 'vs/base/common/types';
import { basename } from 'vs/base/common/resources';
import { RenderIndentGuides } from 'vs/base/browser/ui/tree/abstractTree';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { IDialogService, IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { AbstractUserDataProfileElement, isProfileResourceChildElement, isProfileResourceTypeElement, IProfileChildElement, IProfileResourceTypeChildElement, IProfileResourceTypeElement, NewProfileElement, UserDataProfileElement, UserDataProfilesEditorModel } from 'vs/workbench/contrib/userDataProfile/browser/userDataProfilesEditorModel';
import { Codicon } from 'vs/base/common/codicons';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';

export const profilesSashBorder = registerColor('profiles.sashBorder', { dark: PANEL_BORDER, light: PANEL_BORDER, hcDark: PANEL_BORDER, hcLight: PANEL_BORDER }, localize('profilesSashBorder', "The color of the Profiles editor splitview sash border."));

export class UserDataProfilesEditor extends EditorPane implements IUserDataProfilesEditor {

	static readonly ID: string = 'workbench.editor.userDataProfiles';

	private container: HTMLElement | undefined;
	private splitView: SplitView<number> | undefined;
	private profilesList: WorkbenchList<AbstractUserDataProfileElement> | undefined;
	private profileWidget: ProfileWidget | undefined;

	private model: UserDataProfilesEditorModel | undefined;
	private templates: IProfileTemplateInfo[] = [];

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IUserDataProfileManagementService private readonly userDataProfileManagementService: IUserDataProfileManagementService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
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
			minimumSize: 200,
			maximumSize: 350,
			layout: (width, _, height) => {
				sidebarView.style.width = `${width}px`;
				if (height && this.profilesList) {
					const listHeight = height - 40 /* new profile button */ - 15 /* marginTop */;
					this.profilesList.getHTMLElement().style.height = `${listHeight}px`;
					this.profilesList.layout(listHeight, width);
				}
			}
		}, 300, undefined, true);
		this.splitView.addView({
			onDidChange: Event.None,
			element: contentsView,
			minimumSize: 550,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				contentsView.style.width = `${width}px`;
				if (height) {
					this.profileWidget?.layout(new Dimension(width, height));
				}
			}
		}, Sizing.Distribute, undefined, true);

		this.registerListeners();

		this.userDataProfileManagementService.getBuiltinProfileTemplates().then(templates => {
			this.templates = templates;
			this.profileWidget!.templates = templates;
		});
	}

	override updateStyles(): void {
		const borderColor = this.theme.getColor(profilesSashBorder)!;
		this.splitView?.style({ separatorBorder: borderColor });
	}

	private renderSidebar(parent: HTMLElement): void {
		// render New Profile Button
		this.renderNewProfileButton(append(parent, $('.new-profile-button')));

		// render profiles list
		const renderer = this.instantiationService.createInstance(ProfileElementRenderer);
		const delegate = new ProfileElementDelegate();
		this.profilesList = this._register(this.instantiationService.createInstance(WorkbenchList<AbstractUserDataProfileElement>, 'ProfilesList',
			append(parent, $('.profiles-list')),
			delegate,
			[renderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(profileElement: AbstractUserDataProfileElement | null): string {
						return profileElement?.name ?? '';
					},
					getWidgetAriaLabel(): string {
						return localize('profiles', "Profiles");
					}
				},
				openOnSingleClick: true,
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
			actions: {
				getActions: () => {
					const actions: IAction[] = [];
					if (this.templates.length) {
						actions.push(new SubmenuAction('from.template', localize('from template', "From Template"), this.getCreateFromTemplateActions()));
						actions.push(new Separator());
					}
					actions.push(new Action('importProfile', localize('importProfile', "Import Profile..."), undefined, true, () => this.importProfile()));
					return actions;
				}
			},
			addPrimaryActionToDropdown: false,
			contextMenuProvider: this.contextMenuService,
			supportIcons: true,
			...defaultButtonStyles
		}));
		button.label = localize('newProfile', "New Profile");
		this._register(button.onDidClick(e => this.createNewProfile()));
	}

	private getCreateFromTemplateActions(): IAction[] {
		return this.templates.map(template => new Action(`template:${template.url}`, template.name, undefined, true, async () => {
			this.createNewProfile(URI.parse(template.url));
		}));
	}

	private registerListeners(): void {
		if (this.profilesList) {
			this._register(this.profilesList.onDidChangeSelection(e => {
				const [element] = e.elements;
				if (element instanceof AbstractUserDataProfileElement) {
					this.profileWidget?.render(element);
				}
			}));
			this._register(this.profilesList.onContextMenu(e => {
				const actions: IAction[] = [];
				if (!e.element) {
					actions.push(...this.getTreeContextMenuActions());
				}
				if (e.element instanceof AbstractUserDataProfileElement) {
					actions.push(...e.element.actions[1]);
				}
				if (actions.length) {
					this.contextMenuService.showContextMenu({
						getAnchor: () => e.anchor,
						getActions: () => actions,
						getActionsContext: () => e.element
					});
				}
			}));
			this._register(this.profilesList.onMouseDblClick(e => {
				if (!e.element) {
					this.createNewProfile();
				}
			}));
		}
	}

	private getTreeContextMenuActions(): IAction[] {
		const actions: IAction[] = [];
		actions.push(new Action('newProfile', localize('newProfile', "New Profile"), undefined, true, () => this.createNewProfile()));
		const templateActions = this.getCreateFromTemplateActions();
		if (templateActions.length) {
			actions.push(new SubmenuAction('from.template', localize('new from template', "New Profile From Template"), templateActions));
		}
		actions.push(new Separator());
		actions.push(new Action('importProfile', localize('importProfile', "Import Profile..."), undefined, true, () => this.importProfile()));
		return actions;
	}

	private async importProfile(): Promise<void> {
		const disposables = new DisposableStore();
		const quickPick = disposables.add(this.quickInputService.createQuickPick());

		const updateQuickPickItems = (value?: string) => {
			const quickPickItems: IQuickPickItem[] = [];
			if (value) {
				quickPickItems.push({ label: quickPick.value, description: localize('import from url', "Import from URL") });
			}
			quickPickItems.push({ label: localize('import from file', "Select File...") });
			quickPick.items = quickPickItems;
		};

		quickPick.title = localize('import profile quick pick title', "Import from Profile Template...");
		quickPick.placeholder = localize('import profile placeholder', "Provide Profile Template URL");
		quickPick.ignoreFocusOut = true;
		disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
		updateQuickPickItems();
		quickPick.matchOnLabel = false;
		quickPick.matchOnDescription = false;
		disposables.add(quickPick.onDidAccept(async () => {
			quickPick.hide();
			const selectedItem = quickPick.selectedItems[0];
			if (!selectedItem) {
				return;
			}
			const url = selectedItem.label === quickPick.value ? URI.parse(quickPick.value) : await this.getProfileUriFromFileSystem();
			if (url) {
				this.createNewProfile(url);
			}
		}));
		disposables.add(quickPick.onDidHide(() => disposables.dispose()));
		quickPick.show();
	}

	private async createNewProfile(copyFrom?: URI | IUserDataProfile): Promise<void> {
		if (this.model?.profiles.some(p => p instanceof NewProfileElement)) {
			const result = await this.dialogService.confirm({
				type: 'info',
				message: localize('new profile exists', "A new profile is already being created. Do you want to discard it and create a new one?"),
				primaryButton: localize('discard', "Discard & Create"),
				cancelButton: localize('cancel', "Cancel")
			});
			if (!result.confirmed) {
				return;
			}
			this.model.revert();
		}
		this.model?.createNewProfile(copyFrom);
	}

	private async getProfileUriFromFileSystem(): Promise<URI | null> {
		const profileLocation = await this.fileDialogService.showOpenDialog({
			canSelectFolders: false,
			canSelectFiles: true,
			canSelectMany: false,
			filters: PROFILE_FILTER,
			title: localize('import profile dialog', "Select Profile Template File"),
		});
		if (!profileLocation) {
			return null;
		}
		return profileLocation[0];
	}

	override async setInput(input: UserDataProfilesEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.model = await input.resolve();
		this.updateProfilesList();
		this._register(this.model.onDidChange((element) => {
			this.updateProfilesList(element);
		}));
	}

	override focus(): void {
		super.focus();
		this.profilesList?.domFocus();
	}

	private updateProfilesList(elementToSelect?: AbstractUserDataProfileElement): void {
		if (!this.model) {
			return;
		}
		const currentSelectionIndex = this.profilesList?.getSelection()?.[0];
		const currentSelection = currentSelectionIndex !== undefined ? this.profilesList?.element(currentSelectionIndex) : undefined;
		this.profilesList?.splice(0, this.profilesList.length, this.model.profiles);

		if (elementToSelect) {
			this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect)]);
		} else if (currentSelection) {
			if (!this.model.profiles.includes(currentSelection)) {
				const elementToSelect = this.model.profiles.find(profile => profile.name === currentSelection.name) ?? this.model.profiles[0];
				if (elementToSelect) {
					this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect)]);
				}
			}
		} else {
			const elementToSelect = this.model.profiles.find(profile => profile.active) ?? this.model.profiles[0];
			if (elementToSelect) {
				this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect)]);
			}
		}
	}

}

interface IProfileElementTemplateData {
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly description: HTMLElement;
	readonly actionBar: WorkbenchToolBar;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class ProfileElementDelegate implements IListVirtualDelegate<AbstractUserDataProfileElement> {
	getHeight(element: AbstractUserDataProfileElement) {
		return 22;
	}
	getTemplateId() { return 'profileListElement'; }
}

class ProfileElementRenderer implements IListRenderer<AbstractUserDataProfileElement, IProfileElementTemplateData> {

	readonly templateId = 'profileListElement';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): IProfileElementTemplateData {

		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();

		container.classList.add('profile-list-item');
		const icon = append(container, $('.profile-list-item-icon'));
		const label = append(container, $('.profile-list-item-label'));
		const description = append(container, $('.profile-list-item-description'));
		append(description, $(`span${ThemeIcon.asCSSSelector(Codicon.check)}`));
		append(description, $('span', undefined, localize('activeProfile', "In use")));

		const actionsContainer = append(container, $('.profile-tree-item-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { label, icon, description, actionBar, disposables, elementDisposables };
	}

	renderElement(element: AbstractUserDataProfileElement, index: number, templateData: IProfileElementTemplateData, height: number | undefined) {
		templateData.elementDisposables.clear();
		templateData.label.textContent = element.name;
		templateData.label.classList.toggle('new-profile', element instanceof NewProfileElement);
		templateData.icon.className = ThemeIcon.asClassName(element.icon ? ThemeIcon.fromId(element.icon) : DEFAULT_ICON);
		templateData.description.classList.toggle('hide', !element.active);
		if (element.onDidChange) {
			templateData.elementDisposables.add(element.onDidChange(e => {
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
					templateData.description.classList.toggle('hide', !element.active);
				}
			}));
		}
		templateData.actionBar.setActions(element.actions[0] ?? []);
	}

	disposeElement(element: AbstractUserDataProfileElement, index: number, templateData: IProfileElementTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IProfileElementTemplateData): void {
		templateData.disposables.dispose();
		templateData.elementDisposables.dispose();
	}
}

class ProfileWidget extends Disposable {

	private readonly profileTitle: HTMLElement;
	private readonly toolbar: WorkbenchToolBar;
	private readonly buttonContainer: HTMLElement;
	private readonly iconElement: HTMLElement;
	private readonly useAsDefaultProfileContainer: HTMLElement;
	private readonly useAsDefaultProfileCheckbox: Checkbox;
	private readonly nameInput: InputBox;
	private readonly copyFromContainer: HTMLElement;
	private readonly copyFromSelectBox: SelectBox;
	private copyFromOptions: (ISelectOptionItem & { id?: string; source?: IUserDataProfile | URI })[] = [];

	private readonly contentsTreeHeader: HTMLElement;
	private readonly inheritLabelElement: HTMLElement;
	private readonly resourcesTree: WorkbenchAsyncDataTree<AbstractUserDataProfileElement, ProfileResourceTreeElement>;

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
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const header = append(parent, $('.profile-header'));
		const title = append(header, $('.profile-title-container'));
		this.iconElement = append(title, $(`${ThemeIcon.asCSSSelector(DEFAULT_ICON)}`, { 'tabindex': '0', 'role': 'button', 'aria-label': localize('icon', "Profile Icon") }));
		this.renderIconSelectBox(this.iconElement);
		this.profileTitle = append(title, $(''));

		this.nameInput = this._register(new InputBox(
			title,
			undefined,
			{
				inputBoxStyles: defaultInputBoxStyles,
				ariaLabel: localize('profileName', "Profile Name"),
				placeholder: localize('profileName', "Profile Name"),
				validationOptions: {
					validation: (value) => {
						if (!value) {
							return {
								content: localize('name required', "Profile name is required and must be a non-empty value."),
								type: MessageType.ERROR
							};
						}
						if (this._profileElement.value?.element.disabled) {
							return null;
						}
						const initialName = this._profileElement.value?.element.getInitialName();
						value = value.trim();
						if (initialName !== value && this.userDataProfilesService.profiles.some(p => p.name === value)) {
							return {
								content: localize('profileExists', "Profile with name {0} already exists.", value),
								type: MessageType.ERROR
							};
						}
						return null;
					}
				}
			}
		));
		this.nameInput.onDidChange(value => {
			if (this._profileElement.value && value) {
				this._profileElement.value.element.name = value;
			}
		});
		const focusTracker = this._register(trackFocus(this.nameInput.inputElement));
		this._register(focusTracker.onDidBlur(() => {
			if (this._profileElement.value && !this.nameInput.value) {
				this.nameInput.value = this._profileElement.value.element.name;
			}
		}));

		const actionsContainer = append(header, $('.profile-actions-container'));
		this.buttonContainer = append(actionsContainer, $('.profile-button-container'));
		this.toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: this._register(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		const body = append(parent, $('.profile-body'));

		this.copyFromContainer = append(body, $('.profile-copy-from-container'));
		append(this.copyFromContainer, $('.profile-copy-from-label', undefined, localize('create from', "Copy from")));
		this.copyFromSelectBox = this._register(this.instantiationService.createInstance(SelectBox,
			[],
			0,
			this.contextViewService,
			defaultSelectBoxStyles,
			{
				useCustomDrawn: true,
				ariaLabel: localize('copy profile from', "Copy profile from"),
			}
		));
		this.copyFromSelectBox.render(append(this.copyFromContainer, $('.profile-select-container')));

		this.useAsDefaultProfileContainer = append(body, $('.profile-use-as-default-container'));
		const useAsDefaultProfileTitle = localize('enable for new windows', "Use this profile as default for new windows");
		this.useAsDefaultProfileCheckbox = this._register(new Checkbox(useAsDefaultProfileTitle, false, defaultCheckboxStyles));
		append(this.useAsDefaultProfileContainer, this.useAsDefaultProfileCheckbox.domNode);
		const useAsDefaultProfileLabel = append(this.useAsDefaultProfileContainer, $('.profile-use-as-default-label', undefined, useAsDefaultProfileTitle));
		this._register(this.useAsDefaultProfileCheckbox.onChange(() => {
			if (this._profileElement.value?.element instanceof UserDataProfileElement) {
				this._profileElement.value.element.toggleNewWindowProfile();
			}
		}));
		this._register(addDisposableListener(useAsDefaultProfileLabel, EventType.CLICK, () => {
			if (this._profileElement.value?.element instanceof UserDataProfileElement) {
				this._profileElement.value.element.toggleNewWindowProfile();
			}
		}));

		this.contentsTreeHeader = append(body, $('.profile-content-tree-header'));
		this.inheritLabelElement = $('.inherit-label', undefined, localize('default profile', "Use Default Profile"));
		append(this.contentsTreeHeader,
			$(''),
			$(''),
			this.inheritLabelElement,
			$('.actions-label', undefined, localize('actions', "Actions")),
		);
		const delegate = new ProfileResourceTreeElementDelegate();
		this.resourcesTree = this._register(this.instantiationService.createInstance(WorkbenchAsyncDataTree<AbstractUserDataProfileElement, ProfileResourceTreeElement>,
			'ProfileEditor-ResourcesTree',
			append(body, $('.profile-content-tree.file-icon-themable-tree.show-file-icons')),
			delegate,
			[
				this.instantiationService.createInstance(ExistingProfileResourceTreeRenderer),
				this.instantiationService.createInstance(NewProfileResourceTreeRenderer),
				this.instantiationService.createInstance(ProfileResourceChildTreeItemRenderer),
			],
			this.instantiationService.createInstance(ProfileResourceTreeDataSource),
			{
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(element: ProfileResourceTreeElement | null): string {
						if ((<IProfileResourceTypeElement>element?.element).resourceType) {
							return (<IProfileResourceTypeElement>element?.element).resourceType;
						}
						if ((<IProfileResourceTypeChildElement>element?.element).label) {
							return (<IProfileResourceTypeChildElement>element?.element).label;
						}
						return '';
					},
					getWidgetAriaLabel(): string {
						return '';
					},
				},
				identityProvider: {
					getId(element) {
						if (element?.element.handle) {
							return element.element.handle;
						}
						return '';
					}
				},
				expandOnlyOnTwistieClick: true,
				renderIndentGuides: RenderIndentGuides.None,
				enableStickyScroll: false,
				openOnSingleClick: false,
			}));
		this._register(this.resourcesTree.onDidOpen(async (e) => {
			if (!e.browserEvent) {
				return;
			}
			if (e.browserEvent.target && (e.browserEvent.target as HTMLElement).classList.contains(Checkbox.CLASS_NAME)) {
				return;
			}
			if (e.element?.element.action) {
				await e.element.element.action.run();
			}
		}));
	}

	private renderIconSelectBox(iconContainer: HTMLElement): void {
		const iconSelectBox = this._register(this.instantiationService.createInstance(WorkbenchIconSelectBox, { icons: ICONS, inputBoxStyles: defaultInputBoxStyles }));
		let hoverWidget: IHoverWidget | undefined;
		const showIconSelectBox = () => {
			if (this._profileElement.value?.element instanceof UserDataProfileElement && this._profileElement.value.element.profile.isDefault) {
				return;
			}
			if (this._profileElement.value?.element.disabled) {
				return;
			}
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
		this.copyFromSelectBox.setOptions(this.getCopyFromOptions());
		this._register(this.copyFromSelectBox.onDidSelect(option => {
			if (this._profileElement.value?.element instanceof NewProfileElement) {
				this._profileElement.value.element.copyFrom = this.copyFromOptions[option.index].source;
			}
		}));
	}

	layout(dimension: Dimension): void {
		this.resourcesTree.layout(dimension.height - 34 - 20 - 25 - 20, dimension.width);
	}

	render(profileElement: AbstractUserDataProfileElement): void {
		this.resourcesTree.setInput(profileElement);

		const disposables = new DisposableStore();
		this._profileElement.value = { element: profileElement, dispose: () => disposables.dispose() };

		this.renderProfileElement(profileElement);
		disposables.add(profileElement.onDidChange(e => this.renderProfileElement(profileElement)));

		const profile = profileElement instanceof UserDataProfileElement ? profileElement.profile : undefined;
		this.profileTitle.classList.toggle('hide', !profile?.isDefault);
		this.nameInput.element.classList.toggle('hide', !!profile?.isDefault);

		disposables.add(profileElement.onDidChange(e => {
			if (e.flags || e.copyFrom || e.copyFlags || e.disabled) {
				const viewState = this.resourcesTree.getViewState();
				this.resourcesTree.setInput(profileElement, {
					...viewState,
					expanded: viewState.expanded?.map(e => e)
				});
			}
		}));

		const [primaryTitleButtons, secondatyTitleButtons] = profileElement.titleButtons;
		if (primaryTitleButtons?.length || secondatyTitleButtons?.length) {
			this.buttonContainer.classList.remove('hide');

			if (secondatyTitleButtons?.length) {
				for (const action of secondatyTitleButtons) {
					const button = disposables.add(new Button(this.buttonContainer, {
						...defaultButtonStyles,
						secondary: true
					}));
					button.label = action.label;
					button.enabled = action.enabled;
					disposables.add(button.onDidClick(() => this.editorProgressService.showWhile(action.run())));
					disposables.add(action.onDidChange((e) => {
						if (!isUndefined(e.enabled)) {
							button.enabled = action.enabled;
						}
					}));
				}
			}

			if (primaryTitleButtons?.length) {
				for (const action of primaryTitleButtons) {
					const button = disposables.add(new Button(this.buttonContainer, {
						...defaultButtonStyles
					}));
					button.label = action.label;
					button.enabled = action.enabled;
					disposables.add(button.onDidClick(() => this.editorProgressService.showWhile(action.run())));
					disposables.add(action.onDidChange((e) => {
						if (!isUndefined(e.enabled)) {
							button.enabled = action.enabled;
						}
					}));
					disposables.add(profileElement.onDidChange(e => {
						if (e.message) {
							button.setTitle(profileElement.message ?? action.label);
							button.element.classList.toggle('error', !!profileElement.message);
						}
					}));
				}
			}

		} else {
			this.buttonContainer.classList.add('hide');
		}

		this.toolbar.setActions(profileElement.titleActions[0].slice(0), profileElement.titleActions[1].slice(0));

		if (profileElement instanceof NewProfileElement) {
			this.nameInput.focus();
			this.nameInput.select();
		}
	}

	private renderProfileElement(profileElement: AbstractUserDataProfileElement): void {
		this.profileTitle.textContent = profileElement.name;
		this.nameInput.value = profileElement.name;
		this.nameInput.validate();
		if (profileElement.disabled) {
			this.nameInput.disable();
		} else {
			this.nameInput.enable();
		}
		if (profileElement.icon) {
			this.iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(profileElement.icon));
		} else {
			this.iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(DEFAULT_ICON.id));
		}
		if (profileElement instanceof NewProfileElement) {
			this.contentsTreeHeader.classList.add('new-profile');
			this.inheritLabelElement.textContent = localize('options', "Options");
			this.useAsDefaultProfileContainer.classList.add('hide');
			this.copyFromContainer.classList.remove('hide');
			this.copyFromOptions = this.getCopyFromOptions();
			const id = profileElement.copyFrom instanceof URI ? profileElement.copyFrom.toString() : profileElement.copyFrom?.id;
			const index = id
				? this.copyFromOptions.findIndex(option => option.id === id)
				: 0;
			if (index !== -1) {
				this.copyFromSelectBox.setOptions(this.copyFromOptions);
				this.copyFromSelectBox.setEnabled(!profileElement.previewProfile && !profileElement.disabled);
				this.copyFromSelectBox.select(index);
			} else {
				this.copyFromSelectBox.setOptions([{ text: basename(profileElement.copyFrom as URI) }]);
				this.copyFromSelectBox.setEnabled(false);
			}
		} else if (profileElement instanceof UserDataProfileElement) {
			this.contentsTreeHeader.classList.remove('new-profile');
			this.inheritLabelElement.textContent = profileElement.profile.isDefault ? '' : localize('default profile', "Use Default Profile");
			this.useAsDefaultProfileContainer.classList.remove('hide');
			this.useAsDefaultProfileCheckbox.checked = profileElement.isNewWindowProfile;
			this.copyFromContainer.classList.add('hide');
		}
	}

	private getCopyFromOptions(): (ISelectOptionItem & { id?: string; source?: IUserDataProfile | URI })[] {
		const separator = { text: '\u2500\u2500\u2500\u2500\u2500\u2500', isDisabled: true };
		const copyFromOptions: (ISelectOptionItem & { id?: string; source?: IUserDataProfile | URI })[] = [];
		copyFromOptions.push({ text: localize('empty profile', "None") });
		if (this._templates.length) {
			copyFromOptions.push({ ...separator, decoratorRight: localize('from templates', "Profile Templates") });
			for (const template of this._templates) {
				copyFromOptions.push({ text: template.name, id: template.url, source: URI.parse(template.url) });
			}
		}
		copyFromOptions.push({ ...separator, decoratorRight: localize('from existing profiles', "Existing Profiles") });
		for (const profile of this.userDataProfilesService.profiles) {
			copyFromOptions.push({ text: profile.name, id: profile.id, source: profile });
		}
		return copyFromOptions;
	}
}


interface ProfileResourceTreeElement {
	element: IProfileChildElement;
	root: AbstractUserDataProfileElement;
}

class ProfileResourceTreeElementDelegate implements IListVirtualDelegate<ProfileResourceTreeElement> {
	getTemplateId(element: ProfileResourceTreeElement) {
		if (!(<IProfileResourceTypeElement>element.element).resourceType) {
			return ProfileResourceChildTreeItemRenderer.TEMPLATE_ID;
		}
		if (element.root instanceof NewProfileElement) {
			return NewProfileResourceTreeRenderer.TEMPLATE_ID;
		}
		return ExistingProfileResourceTreeRenderer.TEMPLATE_ID;
	}
	getHeight(element: ProfileResourceTreeElement) {
		return 22;
	}
}

class ProfileResourceTreeDataSource implements IAsyncDataSource<AbstractUserDataProfileElement, ProfileResourceTreeElement> {

	constructor(
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
	) { }

	hasChildren(element: AbstractUserDataProfileElement | ProfileResourceTreeElement): boolean {
		if (element instanceof AbstractUserDataProfileElement) {
			return true;
		}
		if ((<IProfileResourceTypeElement>element.element).resourceType) {
			if ((<IProfileResourceTypeElement>element.element).resourceType !== ProfileResourceType.Extensions && (<IProfileResourceTypeElement>element.element).resourceType !== ProfileResourceType.Snippets) {
				return false;
			}
			if (element.root instanceof NewProfileElement) {
				const resourceType = (<IProfileResourceTypeElement>element.element).resourceType;
				if (element.root.getFlag(resourceType)) {
					return true;
				}
				if (!element.root.hasResource(resourceType)) {
					return false;
				}
				if (element.root.copyFrom === undefined) {
					return false;
				}
				if (!element.root.getCopyFlag(resourceType)) {
					return false;
				}
			}
			return true;
		}
		return false;
	}

	async getChildren(element: AbstractUserDataProfileElement | ProfileResourceTreeElement): Promise<ProfileResourceTreeElement[]> {
		if (element instanceof AbstractUserDataProfileElement) {
			const children = await element.getChildren();
			return children.map(e => ({ element: e, root: element }));
		}
		if ((<IProfileResourceTypeElement>element.element).resourceType) {
			const progressRunner = this.editorProgressService.show(true, 500);
			try {
				const extensions = await element.root.getChildren((<IProfileResourceTypeElement>element.element).resourceType);
				return extensions.map(e => ({ element: e, root: element.root }));
			} finally {
				progressRunner.done();
			}
		}
		return [];
	}
}

interface IProfileResourceTemplateData {
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	readonly actionBar: WorkbenchToolBar;
}

interface IExistingProfileResourceTemplateData extends IProfileResourceTemplateData {
	readonly label: HTMLElement;
	readonly inheritContainer: HTMLElement;
	readonly checkbox: Checkbox;
}

interface INewProfileResourceTemplateData extends IProfileResourceTemplateData {
	readonly label: HTMLElement;
	readonly selectContainer: HTMLElement;
	readonly selectBox: SelectBox;
}

interface IProfileResourceChildTreeItemTemplateData extends IProfileResourceTemplateData {
	readonly checkbox: Checkbox;
	readonly resourceLabel: IResourceLabel;
}

class AbstractProfileResourceTreeRenderer extends Disposable {

	protected getResourceTypeTitle(resourceType: ProfileResourceType): string {
		switch (resourceType) {
			case ProfileResourceType.Settings:
				return localize('settings', "Settings");
			case ProfileResourceType.Keybindings:
				return localize('keybindings', "Keyboard Shortcuts");
			case ProfileResourceType.Snippets:
				return localize('snippets', "User Snippets");
			case ProfileResourceType.Tasks:
				return localize('tasks', "User Tasks");
			case ProfileResourceType.Extensions:
				return localize('extensions', "Extensions");
		}
		return '';
	}

	disposeElement(element: ITreeNode<ProfileResourceTreeElement, void>, index: number, templateData: IProfileResourceTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IProfileResourceTemplateData): void {
		templateData.disposables.dispose();
	}
}


class ExistingProfileResourceTreeRenderer extends AbstractProfileResourceTreeRenderer implements ITreeRenderer<ProfileResourceTreeElement, void, IExistingProfileResourceTemplateData> {

	static readonly TEMPLATE_ID = 'ExistingProfileResourceTemplate';

	readonly templateId = ExistingProfileResourceTreeRenderer.TEMPLATE_ID;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): IExistingProfileResourceTemplateData {
		const disposables = new DisposableStore();
		const container = append(parent, $('.profile-tree-item-container.existing-profile-resource-type-container'));
		const label = append(container, $('.profile-resource-type-label'));

		const inheritContainer = append(container, $('.inherit-container'));
		const checkbox = disposables.add(new Checkbox('', false, defaultCheckboxStyles));
		append(inheritContainer, checkbox.domNode);

		const actionsContainer = append(container, $('.profile-tree-item-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { checkbox, label, inheritContainer, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement({ element: profileResourceTreeElement }: ITreeNode<ProfileResourceTreeElement, void>, index: number, templateData: IExistingProfileResourceTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
		const { element, root } = profileResourceTreeElement;
		if (!(root instanceof UserDataProfileElement)) {
			throw new Error('ExistingProfileResourceTreeRenderer can only render existing profile element');
		}
		if (!isProfileResourceTypeElement(element)) {
			throw new Error('Invalid profile resource element');
		}

		templateData.label.textContent = this.getResourceTypeTitle(element.resourceType);
		if (root instanceof UserDataProfileElement && root.profile.isDefault) {
			templateData.checkbox.domNode.classList.add('hide');
		} else {
			templateData.checkbox.domNode.classList.remove('hide');
			templateData.checkbox.checked = root.getFlag(element.resourceType);
			templateData.elementDisposables.add(templateData.checkbox.onChange(() => root.setFlag(element.resourceType, templateData.checkbox.checked)));
		}

		templateData.actionBar.setActions(element.action ? [element.action] : []);
	}

}

class NewProfileResourceTreeRenderer extends AbstractProfileResourceTreeRenderer implements ITreeRenderer<ProfileResourceTreeElement, void, INewProfileResourceTemplateData> {

	static readonly TEMPLATE_ID = 'NewProfileResourceTemplate';

	readonly templateId = NewProfileResourceTreeRenderer.TEMPLATE_ID;

	constructor(
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): INewProfileResourceTemplateData {
		const disposables = new DisposableStore();
		const container = append(parent, $('.profile-tree-item-container.new-profile-resource-type-container'));
		const labelContainer = append(container, $('.profile-resource-type-label-container'));
		const label = append(labelContainer, $('span.profile-resource-type-label'));
		const selectBox = this._register(this.instantiationService.createInstance(SelectBox,
			[],
			0,
			this.contextViewService,
			defaultSelectBoxStyles,
			{
				useCustomDrawn: true,
			}
		));
		const selectContainer = append(container, $('.profile-select-container'));
		selectBox.render(selectContainer);

		const actionsContainer = append(container, $('.profile-tree-item-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { label, selectContainer, selectBox, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement({ element: profileResourceTreeElement }: ITreeNode<ProfileResourceTreeElement, void>, index: number, templateData: INewProfileResourceTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
		const { element, root } = profileResourceTreeElement;
		if (!(root instanceof NewProfileElement)) {
			throw new Error('NewProfileResourceTreeRenderer can only render new profile element');
		}
		if (!isProfileResourceTypeElement(element)) {
			throw new Error('Invalid profile resource element');
		}
		templateData.label.textContent = this.getResourceTypeTitle(element.resourceType);
		if (root.copyFrom && root.hasResource(element.resourceType)) {
			const copyFromName = root.getCopyFromName();
			templateData.selectBox.setOptions([
				{ text: localize('empty', "Empty") },
				{ text: copyFromName ? localize('copy from', "Copy ({0})", copyFromName) : localize('copy', "Copy") },
				{ text: localize('default', "Use Default Profile") }
			]);
			templateData.selectBox.select(root.getCopyFlag(element.resourceType) ? 1 : root.getFlag(element.resourceType) ? 2 : 0);
			templateData.elementDisposables.add(templateData.selectBox.onDidSelect(option => {
				root.setFlag(element.resourceType, option.index === 2);
				root.setCopyFlag(element.resourceType, option.index === 1);
			}));
		} else {
			templateData.selectBox.setOptions([
				{ text: localize('empty', "Empty") },
				{ text: localize('default', "Use Default Profile") }
			]);
			templateData.selectBox.select(root.getFlag(element.resourceType) ? 1 : 0);
			templateData.elementDisposables.add(templateData.selectBox.onDidSelect(option => {
				root.setFlag(element.resourceType, option.index === 1);
			}));
		}
		templateData.selectBox.setEnabled(!root.disabled);
		templateData.actionBar.setActions(element.action ? [element.action] : []);
	}
}

class ProfileResourceChildTreeItemRenderer extends AbstractProfileResourceTreeRenderer implements ITreeRenderer<ProfileResourceTreeElement, void, IProfileResourceChildTreeItemTemplateData> {

	static readonly TEMPLATE_ID = 'ProfileResourceChildTreeItemTemplate';

	readonly templateId = ProfileResourceChildTreeItemRenderer.TEMPLATE_ID;
	private readonly labels: ResourceLabels;
	private readonly hoverDelegate: IHoverDelegate;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.labels = instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
		this.hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'mouse', false, {}));
	}

	renderTemplate(parent: HTMLElement): IProfileResourceChildTreeItemTemplateData {
		const disposables = new DisposableStore();
		const container = append(parent, $('.profile-tree-item-container.profile-resource-child-container'));
		const checkbox = disposables.add(new Checkbox('', false, defaultCheckboxStyles));
		append(container, checkbox.domNode);
		const resourceLabel = disposables.add(this.labels.create(container, { hoverDelegate: this.hoverDelegate }));

		const actionsContainer = append(container, $('.profile-tree-item-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { checkbox, resourceLabel, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement({ element: profileResourceTreeElement }: ITreeNode<ProfileResourceTreeElement, void>, index: number, templateData: IProfileResourceChildTreeItemTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
		const { element } = profileResourceTreeElement;

		if (!isProfileResourceChildElement(element)) {
			throw new Error('Invalid profile resource element');
		}

		if (element.checkbox) {
			templateData.checkbox.domNode.classList.remove('hide');
			templateData.checkbox.checked = element.checkbox.isChecked;
			templateData.checkbox.domNode.ariaLabel = element.checkbox.accessibilityInformation?.label ?? '';
			if (element.checkbox.accessibilityInformation?.role) {
				templateData.checkbox.domNode.role = element.checkbox.accessibilityInformation.role;
			}
		} else {
			templateData.checkbox.domNode.classList.add('hide');
		}

		templateData.resourceLabel.setResource(
			{
				name: element.resource ? basename(element.resource) : element.label,
				resource: element.resource
			},
			{
				forceLabel: true,
				icon: element.icon,
				hideIcon: !element.resource && !element.icon,
			});
		templateData.actionBar.setActions(element.action ? [element.action] : []);
	}

}

export class UserDataProfilesEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.userDataProfiles';
	readonly resource = undefined;

	private readonly model: UserDataProfilesEditorModel;

	private _dirty: boolean = false;
	get dirty(): boolean { return this._dirty; }
	set dirty(dirty: boolean) {
		if (this._dirty !== dirty) {
			this._dirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.model = UserDataProfilesEditorModel.getInstance(this.instantiationService);
		this._register(this.model.onDidChange(e => this.dirty = this.model.profiles.some(profile => profile instanceof NewProfileElement)));
	}

	override get typeId(): string { return UserDataProfilesEditorInput.ID; }
	override getName(): string { return localize('userDataProfiles', "Profiles"); }
	override getIcon(): ThemeIcon | undefined { return defaultUserDataProfileIcon; }

	override async resolve(): Promise<UserDataProfilesEditorModel> {
		return this.model;
	}

	override isDirty(): boolean {
		return this.dirty;
	}

	override async save(): Promise<EditorInput> {
		await this.model.saveNewProfile();
		return this;
	}

	override async revert(): Promise<void> {
		this.model.revert();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean { return otherInput instanceof UserDataProfilesEditorInput; }
}

export class UserDataProfilesEditorInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): boolean { return true; }
	serialize(editorInput: EditorInput): string { return ''; }
	deserialize(instantiationService: IInstantiationService): EditorInput { return instantiationService.createInstance(UserDataProfilesEditorInput); }
}
