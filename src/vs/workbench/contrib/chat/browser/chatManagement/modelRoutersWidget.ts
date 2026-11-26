/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/modelRoutersWidget.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { ITreeNode, ITreeRenderer, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage, onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, disposeIfDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isDefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { ModelRouterSkillName } from '../../../../../platform/agentHost/common/modelRouterConfig.js';
import { ModelRouterSwitching } from '../../../../../platform/agentHost/common/modelRouter.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../../platform/agentHost/common/agent.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, getInputBoxStyle } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { settingsTextInputBorder } from '../../../preferences/common/settingsEditorColorRegistry.js';
import { startCopilotChatWithPrompt } from '../agentSessions/copilotChatPrompt.js';
import { IChatWidgetService } from '../chat.js';
import { getRouteSettingsLabel } from '../widget/input/modelPicker/modelPickerRouterDetails.js';
import { ModelRouterForm } from './modelRouterForm.js';
import { IOpenedModelRouter, IModelRouterItem, ModelRoutersViewModel } from './modelRoutersViewModel.js';

const $ = DOM.$;
const ROUTER_ROW_HEIGHT = 48;
const ROUTE_ROW_HEIGHT = 44;
const ROUTER_TEMPLATE_ID = 'modelRouter';
const ROUTE_TEMPLATE_ID = 'modelRouterRoute';
/** The page is padded on its right as much as the editor pads it on its left. */
const PADDING_RIGHT = 24;

interface IModelRouterEntry {
	readonly type: 'router';
	readonly item: IModelRouterItem;
}

interface IModelRouterRouteEntry {
	readonly type: 'route';
	readonly item: IModelRouterItem;
	readonly index: number;
}

type ModelRouterTreeEntry = IModelRouterEntry | IModelRouterRouteEntry;

/** A route's name, or its model when it has none. The first of several is marked as the default. */
function getRouteLabel({ item, index }: IModelRouterRouteEntry): string {
	const route = item.routes[index];
	const label = route.name ?? route.model;
	return index === 0 && item.routes.length > 1
		? localize({ key: 'modelRouters.routeDefault', comment: ['{0} is the name of a route or of a model'] }, "{0} (default)", label)
		: label;
}

/** What a route runs on and which requests it takes, such as "Claude Opus · High · Building a feature". */
function getRouteDetail({ item, index }: IModelRouterRouteEntry): string {
	const route = item.routes[index];
	return [route.name ? route.model : undefined, getRouteSettingsLabel(route), route.when].filter(isDefined).join(' \u00b7 ');
}

function getLabel(entry: ModelRouterTreeEntry): string {
	return entry.type === 'router' ? entry.item.name : getRouteLabel(entry);
}

function getDetail(entry: ModelRouterTreeEntry): string {
	return entry.type === 'router' ? entry.item.description : getRouteDetail(entry);
}

function getAriaLabel(entry: ModelRouterTreeEntry): string {
	return [getLabel(entry), getDetail(entry)].filter(Boolean).join('. ');
}

class ModelRouterTreeDelegate implements IListVirtualDelegate<ModelRouterTreeEntry> {
	getHeight(entry: ModelRouterTreeEntry): number {
		return entry.type === 'router' ? ROUTER_ROW_HEIGHT : ROUTE_ROW_HEIGHT;
	}

	getTemplateId(entry: ModelRouterTreeEntry): string {
		return entry.type === 'router' ? ROUTER_TEMPLATE_ID : ROUTE_TEMPLATE_ID;
	}
}

/** A row of the tree: a name over a line of detail. */
interface IModelRouterRowTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly detail: HTMLElement;
	readonly elementDisposables: DisposableStore;
}

function renderRowTemplate(container: HTMLElement, className: string): IModelRouterRowTemplate {
	container.classList.add('model-router-row', className);
	const text = DOM.append(container, $('.model-router-row-text'));
	return { container, label: DOM.append(text, $('.model-router-row-label')), detail: DOM.append(text, $('.model-router-row-detail')), elementDisposables: new DisposableStore() };
}

function renderRow(entry: ModelRouterTreeEntry, template: IModelRouterRowTemplate, hoverService: IHoverService): void {
	template.elementDisposables.clear();
	const label = getLabel(entry);
	const detail = getDetail(entry);
	template.label.textContent = label;
	template.detail.textContent = detail;
	// Each is cut to one line, so the rest is in its hover.
	template.elementDisposables.add(hoverService.setupDelayedHoverAtMouse(template.label, { content: label }));
	template.elementDisposables.add(hoverService.setupDelayedHoverAtMouse(template.detail, { content: detail }));
}

class ModelRouterRouteRenderer implements ITreeRenderer<ModelRouterTreeEntry, void, IModelRouterRowTemplate> {
	readonly templateId = ROUTE_TEMPLATE_ID;

	constructor(private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): IModelRouterRowTemplate {
		return renderRowTemplate(container, 'model-router-route-row');
	}

	renderElement(node: ITreeNode<ModelRouterTreeEntry>, _index: number, template: IModelRouterRowTemplate): void {
		renderRow(node.element, template, this.hoverService);
	}

	disposeTemplate(template: IModelRouterRowTemplate): void {
		template.elementDisposables.dispose();
	}
}

interface IModelRouterTemplate extends IModelRouterRowTemplate {
	readonly switchingLabel: HTMLElement;
	readonly switching: Switch;
	readonly moreActions: ActionBar;
	readonly templateDisposables: DisposableStore;
	routerId: string | undefined;
}

/** A control of a router's row that has the keyboard focus. */
interface IModelRouterFocusedControl {
	readonly routerId: string;
	/** The route switching switch. Otherwise the router's menu. */
	readonly isSwitch: boolean;
}

/** What a router's row can do. */
interface IModelRouterRowActions {
	canSetSwitching(item: IModelRouterItem): boolean;
	setSwitching(item: IModelRouterItem, switching: ModelRouterSwitching): void;
	showMenu(item: IModelRouterItem, anchor: HTMLElement): void;
}

class ModelRouterRenderer implements ITreeRenderer<ModelRouterTreeEntry, void, IModelRouterTemplate> {
	readonly templateId = ROUTER_TEMPLATE_ID;

	private readonly templates = new Set<IModelRouterTemplate>();
	private focusedRouterId: string | undefined;

	constructor(
		private readonly actions: IModelRouterRowActions,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IModelRouterTemplate {
		const templateDisposables = new DisposableStore();
		const row = renderRowTemplate(container, 'model-router-router-row');
		const actions = DOM.append(container, $('.model-router-row-actions'));
		// Named, as a bare switch would read as turning the router itself on and off.
		const switchingLabel = DOM.append(actions, $('span.model-router-switching-label', { 'aria-hidden': 'true' }, localize('modelRouters.switching', "Route switching")));
		const switching = templateDisposables.add(new Switch({ ariaLabel: '' }));
		actions.appendChild(switching.domNode);
		const moreActions = templateDisposables.add(new ActionBar(actions));
		// A click or a key press on an action is not one on the row, which would open the router's file.
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.MOUSE_DOWN, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.CLICK, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.DBLCLICK, event => event.stopPropagation()));
		templateDisposables.add(DOM.addDisposableListener(actions, DOM.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.stopPropagation();
			}
		}));
		const template: IModelRouterTemplate = { ...row, switchingLabel, switching, moreActions, templateDisposables, routerId: undefined };
		this.templates.add(template);
		return template;
	}

	renderElement(node: ITreeNode<ModelRouterTreeEntry>, _index: number, template: IModelRouterTemplate): void {
		const item = node.element.item;
		renderRow(node.element, template, this.hoverService);
		template.container.classList.toggle('has-warning', item.hasWarning);
		template.routerId = item.id;

		const canSwitch = this.actions.canSetSwitching(item);
		template.switching.checked = item.switching === 'auto';
		template.switching.disabled = !canSwitch;
		template.switchingLabel.classList.toggle('disabled', !canSwitch);
		this.describeSwitching(template.switching, item);
		template.elementDisposables.add(template.switching.onChange(checked => {
			this.describeSwitching(template.switching, item);
			this.actions.setSwitching(item, checked ? 'auto' : 'first-turn');
		}));

		template.moreActions.clear();
		template.moreActions.push(template.elementDisposables.add(new Action(
			'modelRouter.moreActions',
			localize('modelRouters.moreActions', "More Actions for {0}", item.name),
			ThemeIcon.asClassName(Codicon.ellipsis),
			true,
			async () => this.actions.showMenu(item, template.moreActions.getContainer()),
		)), { icon: true, label: false });
		this.updateTabOrder(template);
	}

	private describeSwitching(control: Switch, item: IModelRouterItem): void {
		control.setAriaLabel(
			control.checked
				? localize('modelRouters.switchingOff', "Turn Off Route Switching for {0}", item.name)
				: localize('modelRouters.switchingOn', "Turn On Route Switching for {0}", item.name),
			item.switching === undefined
				? localize('modelRouters.switchingUnavailable', "This router has no routes to switch between.")
				: localize('modelRouters.switchingHover', "When on, a chat moves to another route when the work clearly changes. When off, it keeps the route picked for its first message."),
		);
	}

	/** Puts only the focused router's actions in the tab order. */
	setFocusedRouter(routerId: string | undefined): void {
		this.focusedRouterId = routerId;
		for (const template of this.templates) {
			this.updateTabOrder(template);
		}
	}

	/** The router whose switch or menu has the keyboard focus. */
	getFocusedControl(): IModelRouterFocusedControl | undefined {
		const focused = DOM.getActiveElement();
		for (const template of this.templates) {
			if (template.routerId !== undefined && DOM.isAncestor(focused, template.container)) {
				return { routerId: template.routerId, isSwitch: DOM.isAncestor(focused, template.switching.domNode) };
			}
		}
		return undefined;
	}

	/** Gives the keyboard focus to a router's switch or menu. False when it did not take it: the router has no row, or its switch is turned off. */
	focusControl({ routerId, isSwitch }: IModelRouterFocusedControl): boolean {
		for (const template of this.templates) {
			if (template.routerId === routerId) {
				if (isSwitch) {
					template.switching.domNode.focus();
				} else {
					template.moreActions.focus();
				}
				return DOM.isAncestor(DOM.getActiveElement(), template.container);
			}
		}
		return false;
	}

	private updateTabOrder(template: IModelRouterTemplate): void {
		const focused = template.routerId !== undefined && template.routerId === this.focusedRouterId;
		template.switching.domNode.tabIndex = focused ? 0 : -1;
		template.moreActions.setFocusable(focused);
	}

	disposeElement(_node: ITreeNode<ModelRouterTreeEntry>, _index: number, template: IModelRouterTemplate): void {
		template.elementDisposables.clear();
		template.routerId = undefined;
	}

	disposeTemplate(template: IModelRouterTemplate): void {
		this.templates.delete(template);
		template.elementDisposables.dispose();
		template.templateDisposables.dispose();
	}
}

/** What the routers get from the editor that shows them. */
interface IModelRoutersWidgetHost {
	/**
	 * Gets the editor out of the way of what the routers open next, such as a file or a chat, which a modal editor
	 * would cover. Resolves to false when the editor stays where it is, and the routers then open nothing.
	 */
	beforeNavigate(): Promise<boolean>;
}

/**
 * The model routers of this window's own Copilot agent, each with the routes it picks between, and the form
 * for a new one. The view model has what it shows and does; the editor that shows it is its host.
 */
export class ModelRoutersWidget extends Disposable {

	readonly element = $('.model-routers-widget');

	private readonly viewModel: ModelRoutersViewModel;
	private readonly listPage: HTMLElement;
	private readonly searchInput: InputBox;
	private readonly treeContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<ModelRouterTreeEntry>;
	private readonly emptyState: HTMLElement;
	private readonly emptyTitle: HTMLElement;
	private readonly emptyDetail: HTMLElement;
	/** Takes the place of the list while a new router is being entered. */
	private readonly formPage: HTMLElement;
	private readonly form = this._register(new MutableDisposable<DisposableStore>());
	private openForm: ModelRouterForm | undefined;
	private size: { readonly height: number; readonly width: number } | undefined;
	private readonly routerRenderer: ModelRouterRenderer;
	/** Counts the forms asked for, so that a router read for one that is no longer wanted is dropped. */
	private formRequest = 0;

	constructor(
		private readonly host: IModelRoutersWidgetHost,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService contextViewService: IContextViewService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IEditorService private readonly editorService: IEditorService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this.viewModel = this._register(instantiationService.createInstance(ModelRoutersViewModel));

		this.listPage = DOM.append(this.element, $('.model-routers-list'));
		DOM.append(this.listPage, $('p.model-routers-description')).textContent = localize({ key: 'modelRouters.description', comment: ['{0} is the name of a skill, which follows a slash as a chat command does'] }, "A model router sends each chat to the route that best matches your request. Vague or overlapping routes send chats to the wrong model, so run the /{0} skill on a new router to tighten its wording.", ModelRouterSkillName);

		const searchRow = DOM.append(this.listPage, $('.model-routers-search-and-button-container'));
		this.searchInput = this._register(new InputBox(DOM.append(searchRow, $('.model-routers-search-container')), contextViewService, {
			placeholder: localize('modelRouters.search', "Type to search..."),
			ariaLabel: localize('modelRouters.searchAriaLabel', "Search Model Routers"),
			inputBoxStyles: getInputBoxStyle({ inputBorder: settingsTextInputBorder }),
		}));
		this._register(this.searchInput.onDidChange(() => this.render()));
		const addButton = this._register(new Button(searchRow, { ...defaultButtonStyles, supportIcons: true }));
		addButton.label = `$(add) ${localize('modelRouters.add', "Add Router")}`;
		addButton.element.classList.add('model-routers-add-button');
		if (!this.viewModel.canWriteFiles) {
			addButton.setTitle(localize('modelRouters.addWithSkill', "The routers of a remote agent are files on its machine, so a chat with the model router skill adds one there."));
		}
		this._register(addButton.onDidClick(() => this.viewModel.canWriteFiles ? this.showForm(undefined) : this.runModelRouterSkill('').catch(onUnexpectedError)));

		this.treeContainer = DOM.append(this.listPage, $('.model-routers-tree'));
		const routerRenderer = this.routerRenderer = new ModelRouterRenderer({
			canSetSwitching: item => this.viewModel.canSetSwitching(item),
			setSwitching: (item, switching) => this.setSwitching(item, switching),
			showMenu: (item, anchor) => this.showRouterMenu(item, anchor),
		}, hoverService);
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<ModelRouterTreeEntry>,
			'ModelRoutersTree',
			this.treeContainer,
			new ModelRouterTreeDelegate(),
			[routerRenderer, new ModelRouterRouteRenderer(hoverService)],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				openOnSingleClick: false,
				identityProvider: { getId: entry => entry.type === 'router' ? entry.item.id : `${entry.item.id}/${entry.index}` },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('modelRouters.listLabel', "Model Routers"),
					getAriaLabel: getAriaLabel,
				},
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: getLabel },
			},
		));
		this._register(this.tree.onDidOpen(event => {
			if (event.element) {
				this.openRouter(event.element.item).catch(onUnexpectedError);
			}
		}));
		this._register(this.tree.onContextMenu(event => {
			if (event.element) {
				this.showRouterMenu(event.element.item, event.anchor);
			}
		}));
		this._register(this.tree.onDidChangeFocus(event => {
			this.tree.setSelection([...event.elements]);
			const entry = event.elements[0];
			routerRenderer.setFocusedRouter(entry?.type === 'router' ? entry.item.id : undefined);
		}));

		this.emptyState = DOM.append(this.listPage, $('.model-routers-empty'));
		this.emptyTitle = DOM.append(this.emptyState, $('.model-routers-empty-title'));
		this.emptyDetail = DOM.append(this.emptyState, $('.model-routers-empty-detail'));
		this.formPage = DOM.append(this.element, $('.model-routers-form-page'));
		this.formPage.style.display = 'none';

		this._register(this.viewModel.onDidChange(() => this.render()));
		this.render();
	}

	layout(height: number, width: number): void {
		this.size = { height, width };
		this.formPage.style.height = `${height}px`;
		if (this.openForm) {
			this.openForm.layout();
			return;
		}
		if (this.treeContainer.style.display === 'none') {
			return;
		}
		this.searchInput.layout();
		const treeHeight = Math.max(0, height - (this.treeContainer.getBoundingClientRect().top - this.element.getBoundingClientRect().top));
		this.treeContainer.style.height = `${treeHeight}px`;
		this.tree.layout(treeHeight, width - PADDING_RIGHT);
	}

	focus(): void {
		if (this.openForm) {
			this.openForm.focus();
		} else {
			this.searchInput.focus();
		}
	}

	/** Whether the form for a router is showing in place of the routers. */
	get isShowingForm(): boolean {
		return !!this.openForm;
	}

	/** The routers that are listed, which a search narrows down, as text. */
	getAccessibilityContent(): string {
		const routers = this.viewModel.search(this.searchInput.value.trim());
		return [
			localize('modelRouters.title', "Model Routers"),
			...(routers.length ? [] : [this.emptyTitle.textContent ?? '']),
			...routers.flatMap(item => [
				getAriaLabel({ type: 'router', item }),
				...(item.switching ? [item.switching === 'auto'
					? localize('modelRouters.accessibleSwitchingOn', "Route switching is on.")
					: localize('modelRouters.accessibleSwitchingOff', "Route switching is off.")] : []),
				...item.routes.map((_route, index) => getAriaLabel({ type: 'route', item, index })),
			]),
		].join('\n\n');
	}

	private render(): void {
		if (this.form.value) {
			return;
		}
		const query = this.searchInput.value.trim();
		const routers = this.viewModel.search(query);
		const isEmpty = routers.length === 0;
		this.emptyState.style.display = isEmpty ? '' : 'none';
		this.treeContainer.style.display = isEmpty ? 'none' : '';
		if (isEmpty) {
			this.emptyTitle.textContent = query ? localize('modelRouters.noMatches', "No Matching Model Routers") : localize('modelRouters.none', "No Model Routers");
			this.emptyDetail.textContent = query ? localize('modelRouters.noMatchesDetail', "Try a different search.") : localize('modelRouters.noneDetail', "Add a router to pick the model for a chat from routes you write.");
		}
		// Rows are reused as the tree is rebuilt, so a focused switch or menu could end up being another router's.
		const focusedControl = this.routerRenderer.getFocusedControl();
		this.tree.setChildren(null, routers.map(item => ({
			element: { type: 'router', item },
			collapsible: item.routes.length > 0,
			// A search shows the routes it may have matched.
			collapsed: query ? ObjectTreeElementCollapseState.Expanded : ObjectTreeElementCollapseState.PreserveOrExpanded,
			children: item.routes.map((_route, index) => ({ element: { type: 'route', item, index } })),
		})));
		if (focusedControl && !this.routerRenderer.focusControl(focusedControl)) {
			this.tree.domFocus();
		}
		if (this.size) {
			this.layout(this.size.height, this.size.width);
		}
	}

	/** Shows the form in place of the list, for the router read from its file or for a new one. */
	private showForm(existing: IOpenedModelRouter | undefined): void {
		this.formRequest++;
		const store = this.form.value = new DisposableStore();
		DOM.clearNode(this.formPage);
		const form = this.openForm = store.add(this.instantiationService.createInstance(ModelRouterForm, this.formPage, this.viewModel, existing));
		store.add(form.onDidCancel(() => this.hideForm()));
		store.add(form.onDidSave(file => {
			this.hideForm();
			status(existing ? localize('modelRouters.saved', "Saved {0}", basename(file)) : localize('modelRouters.created', "Created {0}", basename(file)));
		}));
		this.listPage.style.display = 'none';
		this.formPage.style.display = '';
		form.focus();
	}

	private hideForm(): void {
		this.formRequest++;
		this.openForm = undefined;
		this.form.clear();
		DOM.clearNode(this.formPage);
		this.formPage.style.display = 'none';
		this.listPage.style.display = '';
		this.render();
		this.searchInput.focus();
	}

	/** A router's menu: changing it here or in its file, then what the model router skill can do with it. A router without a file has none. */
	private showRouterMenu(item: IModelRouterItem, anchor: ReturnType<IContextMenuDelegate['getAnchor']>): void {
		if (!item.file) {
			return;
		}
		const fileName = basename(item.file);
		const action = (id: string, label: string, run: () => Promise<void>): Action => new Action(id, label, undefined, true, run);
		const withSkill = [action('modelRouter.editWithAI', localize('modelRouters.editWithAI', "Edit with AI..."), () => this.runModelRouterSkill(localize({ key: 'modelRouters.editRequest', comment: ['{0} is a file name. The user finishes the sentence, so it ends with a comma and a space.'] }, "In {0}, ", fileName)))];
		if (item.hasWarning) {
			withSkill.push(action('modelRouter.fix', localize('modelRouters.fix', "Fix with AI"), () => this.runModelRouterSkill(localize({ key: 'modelRouters.fixRequest', comment: ['{0} is a file name'] }, "Fix {0}", fileName))));
		}
		const open = [action('modelRouter.openFile', localize('modelRouters.openFile', "Open File"), () => this.openRouterFile(item))];
		if (this.viewModel.canEdit(item)) {
			open.unshift(action('modelRouter.edit', localize('modelRouters.edit', "Edit..."), () => this.editRouter(item)));
		}
		const actions = Separator.join(open, withSkill);
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => disposeIfDisposable(actions),
		});
	}

	/** The row follows once the agent has read the file again. When the file cannot be written, the row goes back to what the file says. */
	private async setSwitching(item: IModelRouterItem, switching: ModelRouterSwitching): Promise<void> {
		try {
			await this.viewModel.setSwitching(item, switching);
		} catch (error) {
			this.notificationService.error(localize('modelRouters.switchingFailed', "Route switching could not be changed for {0}. {1}", item.name, getErrorMessage(error)));
			this.render();
		}
	}

	/** Starts a chat with the model router skill, followed by `request` when there is one. */
	private async runModelRouterSkill(request: string): Promise<void> {
		if (await this.host.beforeNavigate()) {
			// The routers are this window's own Copilot agent's, whichever agent the session that is showing has.
			await startCopilotChatWithPrompt(`/${ModelRouterSkillName} ${request}`, !!this.environmentService.isSessionsWindow, this.commandService, this.chatWidgetService, COPILOT_CLI_AGENT_PROVIDER_ID);
		}
	}

	/** What Enter and a double click do: the router opens in the form, or as its file when the form cannot change it. */
	private async openRouter(item: IModelRouterItem): Promise<void> {
		if (!this.viewModel.canEdit(item)) {
			return this.openRouterFile(item);
		}
		const error = await this.readForForm(item);
		// A router the agent warns about can have a file that does not read as one, which is opened to be put right.
		if (error !== undefined && item.hasWarning) {
			return this.openRouterFile(item);
		}
		this.showEditError(item, error);
	}

	private async editRouter(item: IModelRouterItem): Promise<void> {
		this.showEditError(item, await this.readForForm(item));
	}

	private showEditError(item: IModelRouterItem, error: string | undefined): void {
		if (error !== undefined) {
			this.notificationService.error(localize('modelRouters.editFailed', "{0} could not be opened to edit. {1}", item.name, error));
		}
	}

	/** Reads a router's file and shows it in the form. Resolves to what is wrong when the file cannot be read as a router. */
	private async readForForm(item: IModelRouterItem): Promise<string | undefined> {
		const request = ++this.formRequest;
		let read: IOpenedModelRouter | undefined;
		let problem: string | undefined;
		try {
			read = await this.viewModel.readRouter(item);
		} catch (error) {
			problem = getErrorMessage(error);
		}
		// Another form was asked for, or the routers were closed, while the file was read: what was read is dropped, and so is what went wrong with it.
		if (request !== this.formRequest || this._store.isDisposed) {
			return undefined;
		}
		if (read) {
			this.showForm(read);
		}
		return problem;
	}

	private async openRouterFile(item: IModelRouterItem): Promise<void> {
		if (item.file && await this.host.beforeNavigate()) {
			await this.editorService.openEditor({ resource: item.file, options: { pinned: true } });
		}
	}
}
