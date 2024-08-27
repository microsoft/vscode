/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/userDataProfilesEditor';
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventType, IDomPosition, trackFocus } from 'vs/base/browser/dom';
import { Action, IAction, Separator, SubmenuAction } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
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
import { defaultUserDataProfileIcon, IProfileTemplateInfo, IUserDataProfileService, PROFILE_FILTER } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Button, ButtonWithDropdown } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles, getInputBoxStyle, getListStyles } from 'vs/platform/theme/browser/defaultStyles';
import { editorBackground, foreground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { WorkbenchAsyncDataTree, WorkbenchList } from 'vs/platform/list/browser/listService';
import { CachedListVirtualDelegate, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
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
import { isString, isUndefined } from 'vs/base/common/types';
import { basename } from 'vs/base/common/resources';
import { RenderIndentGuides } from 'vs/base/browser/ui/tree/abstractTree';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { AbstractUserDataProfileElement, isProfileResourceChildElement, isProfileResourceTypeElement, IProfileChildElement, IProfileResourceTypeChildElement, IProfileResourceTypeElement, NewProfileElement, UserDataProfileElement, UserDataProfilesEditorModel } from 'vs/workbench/contrib/userDataProfile/browser/userDataProfilesEditorModel';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { Codicon } from 'vs/base/common/codicons';
import { Radio } from 'vs/base/browser/ui/radio/radio';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { settingsTextInputBorder } from 'vs/workbench/contrib/preferences/common/settingsEditorColorRegistry';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';

export const profilesSashBorder = registerColor('profiles.sashBorder', PANEL_BORDER, localize('profilesSashBorder', "The color of the Profiles editor splitview sash border."));

const listStyles = getListStyles({
	listActiveSelectionBackground: editorBackground,
	listActiveSelectionForeground: foreground,
	listFocusAndSelectionBackground: editorBackground,
	listFocusAndSelectionForeground: foreground,
	listFocusBackground: editorBackground,
	listFocusForeground: foreground,
	listHoverForeground: foreground,
	listHoverBackground: editorBackground,
	listHoverOutline: editorBackground,
	listFocusOutline: editorBackground,
	listInactiveSelectionBackground: editorBackground,
	listInactiveSelectionForeground: foreground,
	listInactiveFocusBackground: editorBackground,
	listInactiveFocusOutline: editorBackground,
	treeIndentGuidesStroke: undefined,
	treeInactiveIndentGuidesStroke: undefined,
});

export class UserDataProfilesEditor extends EditorPane implements IUserDataProfilesEditor {

	static readonly ID: string = 'workbench.editor.userDataProfiles';

	private container: HTMLElement | undefined;
	private splitView: SplitView<number> | undefined;
	private profilesList: WorkbenchList<AbstractUserDataProfileElement> | undefined;
	private profileWidget: ProfileWidget | undefined;

	private model: UserDataProfilesEditorModel | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
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
		this.updateStyles();
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
				},
				alwaysConsumeMouseWheel: false,
			}));
	}

	private renderNewProfileButton(parent: HTMLElement): void {
		const button = this._register(new ButtonWithDropdown(parent, {
			actions: {
				getActions: () => {
					const actions: IAction[] = [];
					if (this.model?.templates.length) {
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
		return this.model
			? this.model.templates.map(template =>
				new Action(
					`template:${template.url}`,
					template.name,
					undefined,
					true,
					() => this.createNewProfile(URI.parse(template.url))))
			: [];
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

	async createNewProfile(copyFrom?: URI | IUserDataProfile): Promise<void> {
		await this.model?.createNewProfile(copyFrom);
	}

	selectProfile(profile: IUserDataProfile): void {
		const index = this.model?.profiles.findIndex(p => p instanceof UserDataProfileElement && p.profile.id === profile.id);
		if (index !== undefined && index >= 0) {
			this.profilesList?.setSelection([index]);
		}
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
		if (this.profileWidget) {
			this.profileWidget.templates = this.model.templates;
		}
		this.updateProfilesList();
		this._register(this.model.onDidChange(element =>
			this.updateProfilesList(element)));
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
	readonly dirty: HTMLElement;
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
		const dirty = append(container, $(`span${ThemeIcon.asCSSSelector(Codicon.circleFilled)}`));
		const description = append(container, $('.profile-list-item-description'));
		append(description, $(`span${ThemeIcon.asCSSSelector(Codicon.check)}`), $('span', undefined, localize('activeProfile', "In use")));

		const actionsContainer = append(container, $('.profile-tree-item-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { label, icon, dirty, description, actionBar, disposables, elementDisposables };
	}

	renderElement(element: AbstractUserDataProfileElement, index: number, templateData: IProfileElementTemplateData, height: number | undefined) {
		templateData.elementDisposables.clear();
		templateData.label.textContent = element.name;
		templateData.label.classList.toggle('new-profile', element instanceof NewProfileElement);
		templateData.icon.className = ThemeIcon.asClassName(element.icon ? ThemeIcon.fromId(element.icon) : DEFAULT_ICON);
		templateData.dirty.classList.toggle('hide', !(element instanceof NewProfileElement));
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
		templateData.actionBar.setActions([...element.actions[0]], [...element.actions[1]]);
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
	private readonly profileTreeContainer: HTMLElement;
	private readonly buttonContainer: HTMLElement;

	private readonly profileTree: WorkbenchAsyncDataTree<AbstractUserDataProfileElement, ProfileTreeElement>;
	private readonly copyFromProfileRenderer: CopyFromProfileRenderer;
	private readonly _profileElement = this._register(new MutableDisposable<{ element: AbstractUserDataProfileElement } & IDisposable>());

	public set templates(templates: readonly IProfileTemplateInfo[]) {
		this.copyFromProfileRenderer.setTemplates(templates);
		this.profileTree.rerender();
	}

	constructor(
		parent: HTMLElement,
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const header = append(parent, $('.profile-header'));
		const title = append(header, $('.profile-title-container'));
		this.profileTitle = append(title, $(''));

		const body = append(parent, $('.profile-body'));

		const delegate = new ProfileTreeDelegate();
		const contentsRenderer = this._register(this.instantiationService.createInstance(ContentsProfileRenderer));
		this.copyFromProfileRenderer = this._register(this.instantiationService.createInstance(CopyFromProfileRenderer));
		this.profileTreeContainer = append(body, $('.profile-tree'));
		this.profileTree = this._register(this.instantiationService.createInstance(WorkbenchAsyncDataTree<AbstractUserDataProfileElement, ProfileTreeElement>,
			'ProfileEditor-Tree',
			this.profileTreeContainer,
			delegate,
			[
				this._register(this.instantiationService.createInstance(ProfileNameRenderer)),
				this._register(this.instantiationService.createInstance(ProfileIconRenderer)),
				this._register(this.instantiationService.createInstance(UseForCurrentWindowPropertyRenderer)),
				this._register(this.instantiationService.createInstance(UseAsDefaultProfileRenderer)),
				this.copyFromProfileRenderer,
				contentsRenderer,
			],
			this.instantiationService.createInstance(ProfileTreeDataSource),
			{
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(element: ProfileTreeElement | null): string {
						return element?.element ?? '';
					},
					getWidgetAriaLabel(): string {
						return '';
					},
				},
				identityProvider: {
					getId(element) {
						return element.element;
					}
				},
				expandOnlyOnTwistieClick: true,
				renderIndentGuides: RenderIndentGuides.None,
				enableStickyScroll: false,
				openOnSingleClick: false,
				setRowLineHeight: false,
				supportDynamicHeights: true,
				alwaysConsumeMouseWheel: false,
			}));

		this.profileTree.style(listStyles);

		this._register(contentsRenderer.onDidChangeContentHeight((e) => this.profileTree.updateElementHeight(e, undefined)));
		this._register(contentsRenderer.onDidChangeSelection((e) => {
			if (e.selected) {
				this.profileTree.setFocus([]);
				this.profileTree.setSelection([]);
			}
		}));

		this._register(this.profileTree.onDidChangeContentHeight((e) => {
			if (this.dimension) {
				this.layout(this.dimension);
			}
		}));

		this._register(this.profileTree.onDidChangeSelection((e) => {
			if (e.elements.length) {
				contentsRenderer.clearSelection();
			}
		}));

		this.buttonContainer = append(body, $('.profile-row-container.profile-button-container'));
	}

	private dimension: Dimension | undefined;
	layout(dimension: Dimension): void {
		this.dimension = dimension;
		const treeContentHeight = this.profileTree.contentHeight;
		const height = Math.min(treeContentHeight, dimension.height - (this._profileElement.value?.element instanceof NewProfileElement ? 116 : 54));
		this.profileTreeContainer.style.height = `${height}px`;
		this.profileTree.layout(height, dimension.width);
	}

	render(profileElement: AbstractUserDataProfileElement): void {
		if (this._profileElement.value?.element === profileElement) {
			return;
		}

		if (this._profileElement.value?.element instanceof UserDataProfileElement) {
			this._profileElement.value.element.reset();
		}
		this.profileTree.setInput(profileElement);

		const disposables = new DisposableStore();
		this._profileElement.value = { element: profileElement, dispose: () => disposables.dispose() };

		this.profileTitle.textContent = profileElement.name;
		disposables.add(profileElement.onDidChange(e => {
			if (e.name) {
				this.profileTitle.textContent = profileElement.name;
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
						if (!isUndefined(e.label)) {
							button.label = action.label;
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
						if (!isUndefined(e.label)) {
							button.label = action.label;
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

		if (profileElement instanceof NewProfileElement) {
			this.profileTree.focusFirst();
		}

		if (this.dimension) {
			this.layout(this.dimension);
		}
	}

}

type ProfileProperty = 'name' | 'icon' | 'copyFrom' | 'useForCurrent' | 'useAsDefault' | 'contents';

interface ProfileTreeElement {
	element: ProfileProperty;
	root: AbstractUserDataProfileElement;
}

class ProfileTreeDelegate extends CachedListVirtualDelegate<ProfileTreeElement> {

	getTemplateId({ element }: ProfileTreeElement) {
		return element;
	}

	hasDynamicHeight({ element }: ProfileTreeElement): boolean {
		return element === 'contents';
	}

	protected estimateHeight({ element }: ProfileTreeElement): number {
		switch (element) {
			case 'name':
				return 72;
			case 'icon':
				return 68;
			case 'copyFrom':
				return 90;
			case 'useForCurrent':
			case 'useAsDefault':
				return 68;
			case 'contents':
				return 250;
		}
	}
}

class ProfileTreeDataSource implements IAsyncDataSource<AbstractUserDataProfileElement, ProfileTreeElement> {

	hasChildren(element: AbstractUserDataProfileElement | ProfileTreeElement): boolean {
		return element instanceof AbstractUserDataProfileElement;
	}

	async getChildren(element: AbstractUserDataProfileElement | ProfileTreeElement): Promise<ProfileTreeElement[]> {
		if (element instanceof AbstractUserDataProfileElement) {
			const children: ProfileTreeElement[] = [];
			if (element instanceof NewProfileElement) {
				children.push({ element: 'name', root: element });
				children.push({ element: 'icon', root: element });
				children.push({ element: 'copyFrom', root: element });
				children.push({ element: 'contents', root: element });
			} else if (element instanceof UserDataProfileElement) {
				if (!element.profile.isDefault) {
					children.push({ element: 'name', root: element });
					children.push({ element: 'icon', root: element });
				}
				children.push({ element: 'useForCurrent', root: element });
				children.push({ element: 'useAsDefault', root: element });
				children.push({ element: 'contents', root: element });
			}
			return children;
		}
		return [];
	}
}

interface ProfileContentTreeElement {
	element: IProfileChildElement;
	root: AbstractUserDataProfileElement;
}

class ProfileContentTreeElementDelegate implements IListVirtualDelegate<ProfileContentTreeElement> {

	getTemplateId(element: ProfileContentTreeElement) {
		if (!(<IProfileResourceTypeElement>element.element).resourceType) {
			return ProfileResourceChildTreeItemRenderer.TEMPLATE_ID;
		}
		if (element.root instanceof NewProfileElement) {
			return NewProfileResourceTreeRenderer.TEMPLATE_ID;
		}
		return ExistingProfileResourceTreeRenderer.TEMPLATE_ID;
	}

	getHeight(element: ProfileContentTreeElement): number {
		return 24;
	}
}

class ProfileResourceTreeDataSource implements IAsyncDataSource<AbstractUserDataProfileElement, ProfileContentTreeElement> {

	constructor(
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
	) { }

	hasChildren(element: AbstractUserDataProfileElement | ProfileContentTreeElement): boolean {
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

	async getChildren(element: AbstractUserDataProfileElement | ProfileContentTreeElement): Promise<ProfileContentTreeElement[]> {
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

interface IProfileRendererTemplate {
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

interface IExistingProfileResourceTemplateData extends IProfileRendererTemplate {
	readonly label: HTMLElement;
	readonly radio: Radio;
	readonly actionBar: WorkbenchToolBar;
}

interface INewProfileResourceTemplateData extends IProfileRendererTemplate {
	readonly label: HTMLElement;
	readonly radio: Radio;
	readonly actionBar: WorkbenchToolBar;
}

interface IProfileResourceChildTreeItemTemplateData extends IProfileRendererTemplate {
	readonly actionBar: WorkbenchToolBar;
	readonly checkbox: Checkbox;
	readonly resourceLabel: IResourceLabel;
}

interface IProfilePropertyRendererTemplate extends IProfileRendererTemplate {
	element: ProfileTreeElement;
}

class AbstractProfileResourceTreeRenderer extends Disposable {

	protected getResourceTypeTitle(resourceType: ProfileResourceType): string {
		switch (resourceType) {
			case ProfileResourceType.Settings:
				return localize('settings', "Settings");
			case ProfileResourceType.Keybindings:
				return localize('keybindings', "Keyboard Shortcuts");
			case ProfileResourceType.Snippets:
				return localize('snippets', "Snippets");
			case ProfileResourceType.Tasks:
				return localize('tasks', "Tasks");
			case ProfileResourceType.Extensions:
				return localize('extensions', "Extensions");
		}
		return '';
	}

	disposeElement(element: ITreeNode<ProfileContentTreeElement | ProfileTreeElement, void>, index: number, templateData: IProfileRendererTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IProfileRendererTemplate): void {
		templateData.disposables.dispose();
	}
}

abstract class ProfilePropertyRenderer extends AbstractProfileResourceTreeRenderer implements ITreeRenderer<ProfileTreeElement, void, IProfilePropertyRendererTemplate> {

	abstract templateId: ProfileProperty;
	abstract renderTemplate(parent: HTMLElement): IProfilePropertyRendererTemplate;

	renderElement({ element }: ITreeNode<ProfileTreeElement, void>, index: number, templateData: IProfilePropertyRendererTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
		templateData.element = element;
	}

}

class ProfileNameRenderer extends ProfilePropertyRenderer {

	readonly templateId: ProfileProperty = 'name';

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IContextViewService private readonly contextViewService: IContextViewService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): IProfilePropertyRendererTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		let profileElement: ProfileTreeElement | undefined;

		const nameContainer = append(parent, $('.profile-row-container'));
		append(nameContainer, $('.profile-label-element', undefined, localize('name', "Name")));
		const nameInput = disposables.add(new InputBox(
			nameContainer,
			this.contextViewService,
			{
				inputBoxStyles: getInputBoxStyle({
					inputBorder: settingsTextInputBorder
				}),
				ariaLabel: localize('profileName', "Profile Name"),
				placeholder: localize('profileName', "Profile Name"),
				validationOptions: {
					validation: (value) => {
						if (!value) {
							return {
								content: localize('name required', "Profile name is required and must be a non-empty value."),
								type: MessageType.WARNING
							};
						}
						if (profileElement?.root.disabled) {
							return null;
						}
						if (!profileElement?.root.shouldValidateName()) {
							return null;
						}
						const initialName = profileElement?.root.getInitialName();
						value = value.trim();
						if (initialName !== value && this.userDataProfilesService.profiles.some(p => !p.isTransient && p.name === value)) {
							return {
								content: localize('profileExists', "Profile with name {0} already exists.", value),
								type: MessageType.WARNING
							};
						}
						return null;
					}
				}
			}
		));
		nameInput.onDidChange(value => {
			if (profileElement && value) {
				profileElement.root.name = value;
			}
		});
		const focusTracker = disposables.add(trackFocus(nameInput.inputElement));
		disposables.add(focusTracker.onDidBlur(() => {
			if (profileElement && !nameInput.value) {
				nameInput.value = profileElement.root.name;
			}
		}));

		const renderName = (profileElement: ProfileTreeElement) => {
			nameInput.value = profileElement.root.name;
			nameInput.validate();
			if (profileElement.root.disabled) {
				nameInput.disable();
			} else {
				nameInput.enable();
			}
		};

		return {
			set element(element: ProfileTreeElement) {
				profileElement = element;
				renderName(profileElement);
				elementDisposables.add(profileElement.root.onDidChange(e => {
					if (e.name || e.disabled) {
						renderName(element);
					}
					if (e.profile) {
						nameInput.validate();
					}
				}));
			},
			disposables,
			elementDisposables
		};
	}

}

class ProfileIconRenderer extends ProfilePropertyRenderer {

	readonly templateId: ProfileProperty = 'icon';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): IProfilePropertyRendererTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		let profileElement: ProfileTreeElement | undefined;

		const iconContainer = append(parent, $('.profile-row-container'));
		append(iconContainer, $('.profile-label-element', undefined, localize('icon-label', "Icon")));
		const iconValueContainer = append(iconContainer, $('.profile-icon-container'));
		const iconElement = append(iconValueContainer, $(`${ThemeIcon.asCSSSelector(DEFAULT_ICON)}`, { 'tabindex': '0', 'role': 'button', 'aria-label': localize('icon', "Profile Icon") }));

		const iconSelectBox = disposables.add(this.instantiationService.createInstance(WorkbenchIconSelectBox, { icons: ICONS, inputBoxStyles: defaultInputBoxStyles }));
		let hoverWidget: IHoverWidget | undefined;
		const showIconSelectBox = () => {
			if (profileElement?.root instanceof UserDataProfileElement && profileElement.root.profile.isDefault) {
				return;
			}
			if (profileElement?.root.disabled) {
				return;
			}
			iconSelectBox.clearInput();
			hoverWidget = this.hoverService.showHover({
				content: iconSelectBox.domNode,
				target: iconElement,
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
		disposables.add(addDisposableListener(iconElement, EventType.CLICK, (e: MouseEvent) => {
			EventHelper.stop(e, true);
			showIconSelectBox();
		}));
		disposables.add(addDisposableListener(iconElement, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				EventHelper.stop(event, true);
				showIconSelectBox();
			}
		}));
		disposables.add(addDisposableListener(iconSelectBox.domNode, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Escape)) {
				EventHelper.stop(event, true);
				hoverWidget?.dispose();
				iconElement.focus();
			}
		}));
		disposables.add(iconSelectBox.onDidSelect(selectedIcon => {
			hoverWidget?.dispose();
			iconElement.focus();
			if (profileElement) {
				profileElement.root.icon = selectedIcon.id;
			}
		}));

		append(iconValueContainer, $('.profile-description-element', undefined, localize('icon-description', "Profile icon to be shown in the activity bar")));

		const renderIcon = (profileElement: ProfileTreeElement) => {
			if (profileElement.root.icon) {
				iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(profileElement.root.icon));
			} else {
				iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(DEFAULT_ICON.id));
			}
		};

		return {
			set element(element: ProfileTreeElement) {
				profileElement = element;
				renderIcon(profileElement);
				elementDisposables.add(profileElement.root.onDidChange(e => {
					if (e.icon) {
						renderIcon(element);
					}
				}));
			},
			disposables,
			elementDisposables
		};
	}
}

class UseForCurrentWindowPropertyRenderer extends ProfilePropertyRenderer {

	readonly templateId: ProfileProperty = 'useForCurrent';

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): IProfilePropertyRendererTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		let profileElement: ProfileTreeElement | undefined;

		const useForCurrentWindowContainer = append(parent, $('.profile-row-container'));
		append(useForCurrentWindowContainer, $('.profile-label-element', undefined, localize('use for curren window', "Use for Current Window")));
		const useForCurrentWindowValueContainer = append(useForCurrentWindowContainer, $('.profile-use-for-current-container'));
		const useForCurrentWindowTitle = localize('enable for current window', "Use this profile for the current window");
		const useForCurrentWindowCheckbox = disposables.add(new Checkbox(useForCurrentWindowTitle, false, defaultCheckboxStyles));
		append(useForCurrentWindowValueContainer, useForCurrentWindowCheckbox.domNode);
		const useForCurrentWindowLabel = append(useForCurrentWindowValueContainer, $('.profile-description-element', undefined, useForCurrentWindowTitle));
		disposables.add(useForCurrentWindowCheckbox.onChange(() => {
			if (profileElement?.root instanceof UserDataProfileElement) {
				profileElement.root.toggleCurrentWindowProfile();
			}
		}));
		disposables.add(addDisposableListener(useForCurrentWindowLabel, EventType.CLICK, () => {
			if (profileElement?.root instanceof UserDataProfileElement) {
				profileElement.root.toggleCurrentWindowProfile();
			}
		}));

		const renderUseCurrentProfile = (profileElement: ProfileTreeElement) => {
			useForCurrentWindowCheckbox.checked = profileElement.root instanceof UserDataProfileElement && this.userDataProfileService.currentProfile.id === profileElement.root.profile.id;
			if (useForCurrentWindowCheckbox.checked && this.userDataProfileService.currentProfile.isDefault) {
				useForCurrentWindowCheckbox.disable();
			} else {
				useForCurrentWindowCheckbox.enable();
			}
		};

		const that = this;
		return {
			set element(element: ProfileTreeElement) {
				profileElement = element;
				renderUseCurrentProfile(profileElement);
				elementDisposables.add(that.userDataProfileService.onDidChangeCurrentProfile(e => {
					renderUseCurrentProfile(element);
				}));
			},
			disposables,
			elementDisposables
		};
	}
}

class UseAsDefaultProfileRenderer extends ProfilePropertyRenderer {

	readonly templateId: ProfileProperty = 'useAsDefault';

	renderTemplate(parent: HTMLElement): IProfilePropertyRendererTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		let profileElement: ProfileTreeElement | undefined;

		const useAsDefaultProfileContainer = append(parent, $('.profile-row-container'));
		append(useAsDefaultProfileContainer, $('.profile-label-element', undefined, localize('use for new windows', "Use for New Windows")));
		const useAsDefaultProfileValueContainer = append(useAsDefaultProfileContainer, $('.profile-use-as-default-container'));
		const useAsDefaultProfileTitle = localize('enable for new windows', "Use this profile as the default for new windows");
		const useAsDefaultProfileCheckbox = disposables.add(new Checkbox(useAsDefaultProfileTitle, false, defaultCheckboxStyles));
		append(useAsDefaultProfileValueContainer, useAsDefaultProfileCheckbox.domNode);
		const useAsDefaultProfileLabel = append(useAsDefaultProfileValueContainer, $('.profile-description-element', undefined, useAsDefaultProfileTitle));
		disposables.add(useAsDefaultProfileCheckbox.onChange(() => {
			if (profileElement?.root instanceof UserDataProfileElement) {
				profileElement.root.toggleNewWindowProfile();
			}
		}));
		disposables.add(addDisposableListener(useAsDefaultProfileLabel, EventType.CLICK, () => {
			if (profileElement?.root instanceof UserDataProfileElement) {
				profileElement.root.toggleNewWindowProfile();
			}
		}));

		const renderUseAsDefault = (profileElement: ProfileTreeElement) => {
			useAsDefaultProfileCheckbox.checked = profileElement.root instanceof UserDataProfileElement && profileElement.root.isNewWindowProfile;
		};

		return {
			set element(element: ProfileTreeElement) {
				profileElement = element;
				renderUseAsDefault(profileElement);
				elementDisposables.add(profileElement.root.onDidChange(e => {
					if (e.newWindowProfile) {
						renderUseAsDefault(element);
					}
				}));
			},
			disposables,
			elementDisposables
		};
	}
}

class CopyFromProfileRenderer extends ProfilePropertyRenderer {

	readonly templateId: ProfileProperty = 'copyFrom';

	private templates: readonly IProfileTemplateInfo[] = [];

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IContextViewService private readonly contextViewService: IContextViewService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): IProfilePropertyRendererTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		let profileElement: ProfileTreeElement | undefined;

		const copyFromContainer = append(parent, $('.profile-row-container.profile-copy-from-container'));
		append(copyFromContainer, $('.profile-label-element', undefined, localize('create from', "Copy from")));
		append(copyFromContainer, $('.profile-description-element', undefined, localize('copy from description', "Select the profile source from which you want to copy contents")));
		const copyFromSelectBox = disposables.add(this.instantiationService.createInstance(SelectBox,
			[],
			0,
			this.contextViewService,
			defaultSelectBoxStyles,
			{
				useCustomDrawn: true,
				ariaLabel: localize('copy profile from', "Copy profile from"),
			}
		));
		copyFromSelectBox.render(append(copyFromContainer, $('.profile-select-container')));

		const render = (profileElement: NewProfileElement, copyFromOptions: (ISelectOptionItem & { id?: string; source?: IUserDataProfile | URI })[]) => {
			copyFromSelectBox.setOptions(copyFromOptions);
			const id = profileElement.copyFrom instanceof URI ? profileElement.copyFrom.toString() : profileElement.copyFrom?.id;
			const index = id
				? copyFromOptions.findIndex(option => option.id === id)
				: 0;
			copyFromSelectBox.select(index);
		};

		const that = this;
		return {
			set element(element: ProfileTreeElement) {
				profileElement = element;
				if (profileElement.root instanceof NewProfileElement) {
					const newProfileElement = profileElement.root;
					let copyFromOptions = that.getCopyFromOptions(newProfileElement);
					render(newProfileElement, copyFromOptions);
					copyFromSelectBox.setEnabled(!newProfileElement.previewProfile && !newProfileElement.disabled);
					elementDisposables.add(profileElement.root.onDidChange(e => {
						if (e.copyFrom || e.copyFromInfo) {
							copyFromOptions = that.getCopyFromOptions(newProfileElement);
							render(newProfileElement, copyFromOptions);
						}
						if (e.preview || e.disabled) {
							copyFromSelectBox.setEnabled(!newProfileElement.previewProfile && !newProfileElement.disabled);
						}
					}));
					elementDisposables.add(copyFromSelectBox.onDidSelect(option => {
						newProfileElement.copyFrom = copyFromOptions[option.index].source;
					}));
				}
			},
			disposables,
			elementDisposables
		};
	}

	setTemplates(templates: readonly IProfileTemplateInfo[]): void {
		this.templates = templates;
	}

	private getCopyFromOptions(profileElement: NewProfileElement): (ISelectOptionItem & { id?: string; source?: IUserDataProfile | URI })[] {
		const separator = { text: '\u2500\u2500\u2500\u2500\u2500\u2500', isDisabled: true };
		const copyFromOptions: (ISelectOptionItem & { id?: string; source?: IUserDataProfile | URI })[] = [];

		copyFromOptions.push({ text: localize('empty profile', "None") });
		for (const [copyFromTemplate, name] of profileElement.copyFromTemplates) {
			if (!this.templates.some(template => this.uriIdentityService.extUri.isEqual(URI.parse(template.url), copyFromTemplate))) {
				copyFromOptions.push({ text: `${name} (${basename(copyFromTemplate)})`, id: copyFromTemplate.toString(), source: copyFromTemplate });
			}
		}

		if (this.templates.length) {
			copyFromOptions.push({ ...separator, decoratorRight: localize('from templates', "Profile Templates") });
			for (const template of this.templates) {
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

class ContentsProfileRenderer extends ProfilePropertyRenderer {

	readonly templateId: ProfileProperty = 'contents';

	private readonly _onDidChangeContentHeight = this._register(new Emitter<ProfileTreeElement>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	private readonly _onDidChangeSelection = this._register(new Emitter<{ element: ProfileTreeElement; selected: boolean }>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	private profilesContentTree: WorkbenchAsyncDataTree<AbstractUserDataProfileElement, ProfileContentTreeElement> | undefined;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): IProfilePropertyRendererTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		let profileElement: ProfileTreeElement | undefined;

		const configureRowContainer = append(parent, $('.profile-row-container'));
		append(configureRowContainer, $('.profile-label-element', undefined, localize('contents', "Contents")));
		const contentsDescriptionElement = append(configureRowContainer, $('.profile-description-element'));
		const contentsTreeHeader = append(configureRowContainer, $('.profile-content-tree-header'));
		const optionsLabel = $('.options-header', undefined, $('span', undefined, localize('options', "Source")));
		append(contentsTreeHeader,
			$(''),
			$('', undefined, localize('contents', "Contents")),
			optionsLabel,
			$('.actions-header', undefined, localize('actions', "Actions")),
		);

		const delegate = new ProfileContentTreeElementDelegate();
		const profilesContentTree = this.profilesContentTree = disposables.add(this.instantiationService.createInstance(WorkbenchAsyncDataTree<AbstractUserDataProfileElement, ProfileContentTreeElement>,
			'ProfileEditor-ContentsTree',
			append(configureRowContainer, $('.profile-content-tree.file-icon-themable-tree.show-file-icons')),
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
					getAriaLabel(element: ProfileContentTreeElement | null): string {
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
				alwaysConsumeMouseWheel: false,
			}));

		this.profilesContentTree.style(listStyles);

		disposables.add(toDisposable(() => this.profilesContentTree = undefined));

		disposables.add(this.profilesContentTree.onDidChangeContentHeight(height => {
			this.profilesContentTree?.layout(height);
			if (profileElement) {
				this._onDidChangeContentHeight.fire(profileElement);
			}
		}));

		disposables.add(this.profilesContentTree.onDidChangeSelection((e => {
			if (profileElement) {
				this._onDidChangeSelection.fire({ element: profileElement, selected: !!e.elements.length });
			}
		})));

		disposables.add(this.profilesContentTree.onDidOpen(async (e) => {
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

		const updateDescription = (element: ProfileTreeElement) => {
			const defaultHelpInfo = localize('default info', "- *Default:* Use contents from the Default profile\n");
			const markdown = new MarkdownString()
				.appendMarkdown(localize('contents source description', "Configure source of contents for this profile\n"));
			clearNode(contentsDescriptionElement);

			if (element.root instanceof UserDataProfileElement && element.root.profile.isDefault) {
				return;
			}

			if (element.root instanceof NewProfileElement) {
				const copyFromName = element.root.getCopyFromName();
				const optionName = copyFromName === this.userDataProfilesService.defaultProfile.name
					? localize('copy from default', "{0} (Copy)", copyFromName)
					: copyFromName;
				if (optionName) {
					markdown
						.appendMarkdown(localize('copy info', "- *{0}:* Copy contents from the {1} profile\n", optionName, copyFromName));
				}
				markdown
					.appendMarkdown(defaultHelpInfo)
					.appendMarkdown(localize('none info', "- *None:* Create empty contents\n"));
			} else if (element.root instanceof UserDataProfileElement) {
				markdown
					.appendMarkdown(defaultHelpInfo)
					.appendMarkdown(localize('current info', "- *{1}:* Use contents from the {0} profile\n", element.root.profile.name, element.root.profile.name));
			}
			append(contentsDescriptionElement, elementDisposables.add(renderMarkdown(markdown)).element);
		};

		const that = this;
		return {
			set element(element: ProfileTreeElement) {
				profileElement = element;
				updateDescription(element);
				if (element.root instanceof NewProfileElement) {
					contentsTreeHeader.classList.remove('default-profile');
				} else if (element.root instanceof UserDataProfileElement) {
					contentsTreeHeader.classList.toggle('default-profile', element.root.profile.isDefault);
				}
				profilesContentTree.setInput(profileElement.root);
				elementDisposables.add(profileElement.root.onDidChange(e => {
					if (e.copyFrom || e.copyFlags || e.flags) {
						profilesContentTree.updateChildren(element.root);
					}
					if (e.copyFromInfo) {
						updateDescription(element);
						that._onDidChangeContentHeight.fire(element);
					}
				}));
			},
			disposables,
			elementDisposables: new DisposableStore()
		};
	}

	clearSelection(): void {
		if (this.profilesContentTree) {
			this.profilesContentTree.setSelection([]);
			this.profilesContentTree.setFocus([]);
		}
	}
}

class ExistingProfileResourceTreeRenderer extends AbstractProfileResourceTreeRenderer implements ITreeRenderer<ProfileContentTreeElement, void, IExistingProfileResourceTemplateData> {

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

		const radio = disposables.add(new Radio({ items: [] }));
		append(append(container, $('.profile-resource-options-container')), radio.domNode);

		const actionsContainer = append(container, $('.profile-resource-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { label, radio, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement({ element: profileResourceTreeElement }: ITreeNode<ProfileContentTreeElement, void>, index: number, templateData: IExistingProfileResourceTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
		const { element, root } = profileResourceTreeElement;
		if (!(root instanceof UserDataProfileElement)) {
			throw new Error('ExistingProfileResourceTreeRenderer can only render existing profile element');
		}
		if (isString(element) || !isProfileResourceTypeElement(element)) {
			throw new Error('Invalid profile resource element');
		}

		const updateRadioItems = () => {
			templateData.radio.setItems([{
				text: localize('default', "Default"),
				tooltip: localize('default description', "Use {0} from the Default profile", resourceTypeTitle),
				isActive: root.getFlag(element.resourceType)
			},
			{
				text: root.name,
				tooltip: localize('current description', "Use {0} from the {1} profile", resourceTypeTitle, root.name),
				isActive: !root.getFlag(element.resourceType)
			}]);
		};

		const resourceTypeTitle = this.getResourceTypeTitle(element.resourceType);
		templateData.label.textContent = resourceTypeTitle;

		if (root instanceof UserDataProfileElement && root.profile.isDefault) {
			templateData.radio.domNode.classList.add('hide');
		} else {
			templateData.radio.domNode.classList.remove('hide');
			updateRadioItems();
			templateData.elementDisposables.add(root.onDidChange(e => {
				if (e.name) {
					updateRadioItems();
				}
			}));
			templateData.elementDisposables.add(templateData.radio.onDidSelect((index) => root.setFlag(element.resourceType, index === 0)));
		}

		templateData.actionBar.setActions(element.action ? [element.action] : []);
	}

}

class NewProfileResourceTreeRenderer extends AbstractProfileResourceTreeRenderer implements ITreeRenderer<ProfileContentTreeElement, void, INewProfileResourceTemplateData> {

	static readonly TEMPLATE_ID = 'NewProfileResourceTemplate';

	readonly templateId = NewProfileResourceTreeRenderer.TEMPLATE_ID;

	constructor(
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	renderTemplate(parent: HTMLElement): INewProfileResourceTemplateData {
		const disposables = new DisposableStore();
		const container = append(parent, $('.profile-tree-item-container.new-profile-resource-type-container'));
		const labelContainer = append(container, $('.profile-resource-type-label-container'));
		const label = append(labelContainer, $('span.profile-resource-type-label'));

		const radio = disposables.add(new Radio({ items: [] }));
		append(append(container, $('.profile-resource-options-container')), radio.domNode);

		const actionsContainer = append(container, $('.profile-resource-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { label, radio, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement({ element: profileResourceTreeElement }: ITreeNode<ProfileContentTreeElement, void>, index: number, templateData: INewProfileResourceTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
		const { element, root } = profileResourceTreeElement;
		if (!(root instanceof NewProfileElement)) {
			throw new Error('NewProfileResourceTreeRenderer can only render new profile element');
		}
		if (isString(element) || !isProfileResourceTypeElement(element)) {
			throw new Error('Invalid profile resource element');
		}

		const resourceTypeTitle = this.getResourceTypeTitle(element.resourceType);
		templateData.label.textContent = resourceTypeTitle;

		const renderRadioItems = () => {
			const options = [{
				text: localize('default', "Default"),
				tooltip: localize('default description', "Use {0} from the Default profile", resourceTypeTitle),
			},
			{
				text: localize('none', "None"),
				tooltip: localize('none description', "Create empty {0}", resourceTypeTitle)
			}];
			const copyFromName = root.getCopyFromName();
			const name = copyFromName === this.userDataProfilesService.defaultProfile.name
				? localize('copy from default', "{0} (Copy)", copyFromName)
				: copyFromName;
			if (root.copyFrom && name) {
				templateData.radio.setItems([
					{
						text: name,
						tooltip: name ? localize('copy from profile description', "Copy {0} from the {1} profile", resourceTypeTitle, name) : localize('copy description', "Copy"),
					},
					...options
				]);
				templateData.radio.setActiveItem(root.getCopyFlag(element.resourceType) ? 0 : root.getFlag(element.resourceType) ? 1 : 2);
			} else {
				templateData.radio.setItems(options);
				templateData.radio.setActiveItem(root.getFlag(element.resourceType) ? 0 : 1);
			}
		};

		if (root.copyFrom) {
			templateData.elementDisposables.add(templateData.radio.onDidSelect(index => {
				root.setFlag(element.resourceType, index === 1);
				root.setCopyFlag(element.resourceType, index === 0);
			}));
		} else {
			templateData.elementDisposables.add(templateData.radio.onDidSelect(index => {
				root.setFlag(element.resourceType, index === 0);
			}));
		}

		renderRadioItems();
		templateData.radio.setEnabled(!root.disabled);
		templateData.elementDisposables.add(root.onDidChange(e => {
			if (e.disabled) {
				templateData.radio.setEnabled(!root.disabled);
			}
			if (e.copyFrom || e.copyFromInfo) {
				renderRadioItems();
			}
		}));
		templateData.actionBar.setActions(element.action ? [element.action] : []);
	}
}

class ProfileResourceChildTreeItemRenderer extends AbstractProfileResourceTreeRenderer implements ITreeRenderer<ProfileContentTreeElement, void, IProfileResourceChildTreeItemTemplateData> {

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

		const actionsContainer = append(container, $('.profile-resource-actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar,
			actionsContainer,
			{
				hoverDelegate: disposables.add(createInstantHoverDelegate()),
				highlightToggledItems: true
			}
		));

		return { checkbox, resourceLabel, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement({ element: profileResourceTreeElement }: ITreeNode<ProfileContentTreeElement, void>, index: number, templateData: IProfileResourceChildTreeItemTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
		const { element } = profileResourceTreeElement;

		if (isString(element) || !isProfileResourceChildElement(element)) {
			throw new Error('Invalid profile resource element');
		}

		if (element.checkbox) {
			templateData.checkbox.domNode.setAttribute('tabindex', '0');
			templateData.checkbox.domNode.classList.remove('hide');
			templateData.checkbox.checked = element.checkbox.isChecked;
			templateData.checkbox.domNode.ariaLabel = element.checkbox.accessibilityInformation?.label ?? '';
			if (element.checkbox.accessibilityInformation?.role) {
				templateData.checkbox.domNode.role = element.checkbox.accessibilityInformation.role;
			}
		} else {
			templateData.checkbox.domNode.removeAttribute('tabindex');
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
		await this.model.resolve();
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

	override dispose(): void {
		for (const profile of this.model.profiles) {
			if (profile instanceof UserDataProfileElement) {
				profile.reset();
			}
		}
		super.dispose();
	}
}

export class UserDataProfilesEditorInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): boolean { return true; }
	serialize(editorInput: EditorInput): string { return ''; }
	deserialize(instantiationService: IInstantiationService): EditorInput { return instantiationService.createInstance(UserDataProfilesEditorInput); }
}
