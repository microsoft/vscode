/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import * as dom from 'vs/base/browser/dom';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IListEvent, IListMouseEvent, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { OS } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Codicon } from 'vs/base/common/codicons';
import 'vs/css!./actionWidget';
import { createDecorator, IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ActionSet, IActionItem, IActionKeybindingResolver } from 'vs/platform/actionWidget/common/actionWidget';

export const acceptSelectedActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedActionCommand = 'previewSelectedCodeAction';

export const ActionWidgetContextKeys = {
	Visible: new RawContextKey<boolean>('actionWidgetVisible', false, localize('actionWidgetVisible', "Whether the action widget list is visible"))
};
export interface IRenderDelegate<T extends IActionItem> {
	onHide(didCancel?: boolean): void;
	onSelect(action: IActionItem, preview?: boolean): Promise<any>;
}

export interface IActionShowOptions {
	readonly includeDisabledActions: boolean;
	readonly fromLightbulb?: boolean;
	readonly showHeaders?: boolean;
}

export interface IListMenuItem<T extends IActionItem> {
	item?: T;
	kind: ActionListItemKind;
	group?: { kind?: any; icon?: { codicon: Codicon; color?: string }; title: string };
	disabled?: boolean;
	label?: string;
}

export interface IActionList extends IDisposable {
	hide(didCancel?: boolean): void;
	focusPrevious(): void;
	focusNext(): void;
	layout(minWidth: number): void;
	acceptSelected(preview?: boolean): void;
	readonly domNode: HTMLElement;
}

export interface IActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly text: HTMLElement;
	readonly keybinding: KeybindingLabel;
}

export const enum ActionListItemKind {
	Action = 'action',
	Header = 'header'
}

interface IHeaderTemplateData {
	readonly container: HTMLElement;
	readonly text: HTMLElement;
}

export class HeaderRenderer<T extends IListMenuItem<IActionItem>> implements IListRenderer<T, IHeaderTemplateData> {

	get templateId(): string { return ActionListItemKind.Header; }

	renderTemplate(container: HTMLElement): IHeaderTemplateData {
		container.classList.add('group-header');

		const text = document.createElement('span');
		container.append(text);

		return { container, text };
	}

	renderElement(element: IListMenuItem<IActionItem>, _index: number, templateData: IHeaderTemplateData): void {
		if (!element.group) {
			return;
		}
		templateData.text.textContent = element.group?.title;
	}

	disposeTemplate(_templateData: IHeaderTemplateData): void {
		// noop
	}
}


export class ActionItemRenderer<T extends IListMenuItem<IActionItem>> implements IListRenderer<T, IActionMenuTemplateData> {

	get templateId(): string { return 'action'; }

	constructor(private readonly _keybindingResolver: IActionKeybindingResolver | undefined, @IKeybindingService private readonly _keybindingService: IKeybindingService) {
	}

	renderTemplate(container: HTMLElement): IActionMenuTemplateData {
		container.classList.add(this.templateId);

		const icon = document.createElement('div');
		icon.className = 'icon';
		container.append(icon);

		const text = document.createElement('span');
		text.className = 'title';
		container.append(text);

		const keybinding = new KeybindingLabel(container, OS);

		return { container, icon, text, keybinding };
	}

	renderElement(element: T, _index: number, data: IActionMenuTemplateData): void {
		if (element.group?.icon) {
			data.icon.className = element.group.icon.codicon.classNames;
			data.icon.style.color = element.group.icon.color ?? '';
		} else {
			data.icon.className = Codicon.lightBulb.classNames;
			data.icon.style.color = 'var(--vscode-editorLightBulb-foreground)';
		}
		if (!element.item || !element.label) {
			return;
		}
		data.text.textContent = stripNewlines(element.label);
		const binding = this._keybindingResolver?.getResolver()(element.item);
		if (binding) {
			data.keybinding.set(binding);
		}

		if (!binding) {
			dom.hide(data.keybinding.element);
		} else {
			dom.show(data.keybinding.element);
		}
		const actionTitle = this._keybindingService.lookupKeybinding(acceptSelectedActionCommand)?.getLabel();
		const previewTitle = this._keybindingService.lookupKeybinding(previewSelectedActionCommand)?.getLabel();
		data.container.classList.toggle('option-disabled', element.disabled);
		if (element.disabled) {
			data.container.title = element.label;
		} else if (actionTitle && previewTitle) {
			data.container.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", actionTitle, previewTitle);
		} else {
			data.container.title = '';
		}
	}
	disposeTemplate(_templateData: IActionMenuTemplateData): void {
		// noop
	}
}

export const IActionWidgetService = createDecorator<IActionWidgetService>('actionWidgetService');
export interface IActionWidgetService {
	readonly _serviceBrand: undefined;
	show(user: string, toMenuItems: (inputQuickFixes: readonly any[], showHeaders: boolean) => IListMenuItem<IActionItem>[], delegate: IRenderDelegate<any>, actions: ActionSet<any>, anchor: IAnchor, container: HTMLElement | undefined, options: IActionShowOptions): Promise<void>;
	hide(): void;
	isVisible: boolean;
	acceptSelected(preview?: boolean): void;
	focusPrevious(): void;
	focusNext(): void;
}

export class ActionWidgetService extends Disposable implements IActionWidgetService {
	declare readonly _serviceBrand: undefined;
	get isVisible() { return ActionWidgetContextKeys.Visible.getValue(this._contextKeyService) || false; }
	private _showDisabled = false;
	private _currentShowingContext?: {
		readonly user: string;
		readonly toMenuItems: (inputItems: readonly any[], showHeaders: boolean) => IListMenuItem<any>[];
		readonly options: IActionShowOptions;
		readonly anchor: IAnchor;
		readonly container: HTMLElement | undefined;
		readonly actions: ActionSet<unknown>;
		readonly delegate: IRenderDelegate<any>;
		readonly resolver?: IActionKeybindingResolver;
	};
	private _list = this._register(new MutableDisposable<ActionList<any>>());
	constructor(@ICommandService readonly _commandService: ICommandService,
		@IContextViewService readonly contextViewService: IContextViewService,
		@IKeybindingService  readonly keybindingService: IKeybindingService,
		@ITelemetryService readonly _telemetryService: ITelemetryService,
		@IContextKeyService readonly _contextKeyService: IContextKeyService,
		@IInstantiationService readonly _instantiationService: IInstantiationService) {
		super();

	}

	async show(user: string, toMenuItems: (inputQuickFixes: readonly IActionItem[], showHeaders: boolean) => IListMenuItem<IActionItem>[], delegate: IRenderDelegate<any>, actions: ActionSet<any>, anchor: IAnchor, container: HTMLElement | undefined, options: IActionShowOptions, resolver?: IActionKeybindingResolver): Promise<void> {
		this._currentShowingContext = undefined;
		const visibleContext = ActionWidgetContextKeys.Visible.bindTo(this._contextKeyService);
		const list = this._instantiationService.createInstance(ActionList, user, actions.allActions, true, delegate, resolver, toMenuItems);

		const actionsToShow = options.includeDisabledActions && (this._showDisabled || actions.validActions.length === 0) ? actions.allActions : actions.validActions;
		if (!actionsToShow.length) {
			visibleContext.reset();
			return;
		}

		this._currentShowingContext = { user, toMenuItems, delegate, actions, anchor, container, options, resolver };

		this.contextViewService.showContextView({
			getAnchor: () => anchor,
			render: (container: HTMLElement) => {
				visibleContext.set(true);
				return this._renderWidget(container, list, actions, options);
			},
			onHide: (didCancel) => {
				visibleContext.reset();
				return this._onWidgetClosed(didCancel);
			},
		}, container, false);
	}

	acceptSelected(preview?: boolean) {
		this._list.value?.acceptSelected(preview);
	}

	focusPrevious() {
		this._list?.value?.focusPrevious();
	}

	focusNext() {
		this._list?.value?.focusNext();
	}

	hide() {
		this._list.value?.hide();
		this._list.clear();
	}

	clear() {
		this._list.clear();
	}

	private _renderWidget(element: HTMLElement, list: ActionList<any>, actions: ActionSet<any>, options: IActionShowOptions): IDisposable {
		const widget = document.createElement('div');
		widget.classList.add('action-widget');
		element.appendChild(widget);

		this._list.value = list;
		if (this._list.value) {
			widget.appendChild(this._list.value.domNode);
		} else {
			throw new Error('List has no value');
		}
		const renderDisposables = new DisposableStore();

		// Invisible div to block mouse interaction in the rest of the UI
		const menuBlock = document.createElement('div');
		const block = element.appendChild(menuBlock);
		block.classList.add('context-view-block');
		renderDisposables.add(dom.addDisposableListener(block, dom.EventType.MOUSE_DOWN, e => e.stopPropagation()));

		// Invisible div to block mouse interaction with the menu
		const pointerBlockDiv = document.createElement('div');
		const pointerBlock = element.appendChild(pointerBlockDiv);
		pointerBlock.classList.add('context-view-pointerBlock');

		// Removes block on click INSIDE widget or ANY mouse movement
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.MOUSE_DOWN, () => pointerBlock.remove()));

		// Action bar
		let actionBarWidth = 0;
		if (!options.fromLightbulb) {
			const actionBar = this._createActionBar('.action-widget-action-bar', actions, options);
			if (actionBar) {
				widget.appendChild(actionBar.getContainer().parentElement!);
				renderDisposables.add(actionBar);
				actionBarWidth = actionBar.getContainer().offsetWidth;
			}
		}

		const width = this._list.value?.layout(actionBarWidth);
		widget.style.width = `${width}px`;

		const focusTracker = renderDisposables.add(dom.trackFocus(element));
		renderDisposables.add(focusTracker.onDidBlur(() => this.hide()));

		return renderDisposables;
	}

	private _createActionBar(className: string, inputActions: ActionSet<any>, options: IActionShowOptions): ActionBar | undefined {
		const actions = this._getActionBarActions(inputActions, options);
		if (!actions.length) {
			return undefined;
		}

		const container = dom.$(className);
		const actionBar = new ActionBar(container);
		actionBar.push(actions, { icon: false, label: true });
		return actionBar;
	}
	private _getActionBarActions(actions: ActionSet<any>, options: IActionShowOptions): IAction[] {
		const resultActions = actions.documentation.map((command): IAction => ({
			id: command.id,
			label: command.title,
			tooltip: command.tooltip ?? '',
			class: undefined,
			enabled: true,
			run: () => this._commandService.executeCommand(command.id, ...(command.commandArguments ?? [])),
		}));

		if (options.includeDisabledActions && actions.validActions.length > 0 && actions.allActions.length !== actions.validActions.length) {
			resultActions.push(this._showDisabled ? {
				id: 'hideMoreActions',
				label: localize('hideMoreActions', 'Hide Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => this._toggleShowDisabled(false)
			} : {
				id: 'showMoreActions',
				label: localize('showMoreActions', 'Show Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => this._toggleShowDisabled(true)
			});
		}
		return resultActions;
	}
	/**
	 * Toggles whether the disabled actions in the action widget are visible or not.
	 */
	private _toggleShowDisabled(newShowDisabled: boolean): void {
		const previousCtx = this._currentShowingContext;

		this.hide();

		this._showDisabled = newShowDisabled;

		if (previousCtx) {
			this.show(previousCtx.user, previousCtx.toMenuItems, previousCtx.delegate, previousCtx.actions, previousCtx.anchor, previousCtx.container, previousCtx.options, previousCtx.resolver);
		}
	}

	private _onWidgetClosed(didCancel?: boolean): void {
		this._currentShowingContext = undefined;
		this._list.value?.hide(didCancel);
	}

}
registerSingleton(IActionWidgetService, ActionWidgetService, InstantiationType.Delayed);

export class ActionList<T extends IActionItem> extends Disposable implements IActionList {

	readonly domNode: HTMLElement;
	private readonly _list: List<IListMenuItem<IActionItem>>;

	private readonly _actionLineHeight = 24;
	private readonly _headerLineHeight = 26;

	private readonly _allMenuItems: IListMenuItem<IActionItem>[];

	private focusCondition(element: IListMenuItem<IActionItem>): boolean {
		return !element.disabled && element.kind === ActionListItemKind.Action;
	}

	constructor(
		user: string,
		items: readonly T[],
		showHeaders: boolean,
		private readonly _delegate: IRenderDelegate<T>,
		resolver: IActionKeybindingResolver | undefined,
		toMenuItems: (inputActions: readonly T[], showHeaders: boolean) => IListMenuItem<T>[],
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		this.domNode = document.createElement('div');
		this.domNode.classList.add('actionList');
		const virtualDelegate: IListVirtualDelegate<IListMenuItem<IActionItem>> = {
			getHeight: element => element.kind === 'header' ? this._headerLineHeight : this._actionLineHeight,
			getTemplateId: element => element.kind
		};
		this._list = new List(user, this.domNode, virtualDelegate, [new ActionItemRenderer<IListMenuItem<IActionItem>>(resolver, this._keybindingService), new HeaderRenderer()], {
			keyboardSupport: true,
			accessibilityProvider: {
				getAriaLabel: element => {
					if (element.kind === 'action') {
						let label = element.label ? stripNewlines(element?.label) : '';
						if (element.disabled) {
							label = localize({ key: 'customQuickFixWidget.labels', comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
						}
						return label;
					}
					return null;
				},
				getWidgetAriaLabel: () => localize({ key: 'customQuickFixWidget', comment: [`An action widget option`] }, "Action Widget"),
				getRole: () => 'option',
				getWidgetRole: () => user
			},
		});

		this._register(this._list.onMouseClick(e => this.onListClick(e)));
		this._register(this._list.onMouseOver(e => this.onListHover(e)));
		this._register(this._list.onDidChangeFocus(() => this._list.domFocus()));
		this._register(this._list.onDidChangeSelection(e => this.onListSelection(e)));

		this._allMenuItems = toMenuItems(items, showHeaders);
		this._list.splice(0, this._list.length, this._allMenuItems);
		this.focusNext();
	}

	hide(didCancel?: boolean): void {
		this._delegate.onHide(didCancel);
		this._contextViewService.hideContextView();
	}

	layout(minWidth: number): number {
		// Updating list height, depending on how many separators and headers there are.
		const numHeaders = this._allMenuItems.filter(item => item.kind === 'header').length;
		const height = this._allMenuItems.length * this._actionLineHeight;
		const heightWithHeaders = height + numHeaders * this._headerLineHeight - numHeaders * this._actionLineHeight;
		this._list.layout(heightWithHeaders);

		// For finding width dynamically (not using resize observer)
		const itemWidths: number[] = this._allMenuItems.map((_, index): number => {
			const element = document.getElementById(this._list.getElementID(index));
			if (element) {
				element.style.width = 'auto';
				const width = element.getBoundingClientRect().width;
				element.style.width = '';
				return width;
			}
			return 0;
		});

		// resize observer - can be used in the future since list widget supports dynamic height but not width
		const width = Math.max(...itemWidths, minWidth);
		this._list.layout(heightWithHeaders, width);

		this.domNode.style.height = `${heightWithHeaders}px`;

		this._list.domFocus();
		return width;
	}

	focusPrevious() {
		this._list.focusPrevious(1, true, undefined, this.focusCondition);
	}

	focusNext() {
		this._list.focusNext(1, true, undefined, this.focusCondition);
	}

	acceptSelected(preview?: boolean) {
		const focused = this._list.getFocus();
		if (focused.length === 0) {
			return;
		}

		const focusIndex = focused[0];
		const element = this._list.element(focusIndex);
		if (!this.focusCondition(element)) {
			return;
		}

		const event = new UIEvent(preview ? 'previewSelectedCodeAction' : 'acceptSelectedCodeAction');
		this._list.setSelection([focusIndex], event);
	}

	private onListSelection(e: IListEvent<IListMenuItem<IActionItem>>): void {
		if (!e.elements.length) {
			return;
		}

		const element = e.elements[0];
		if (element.item && this.focusCondition(element)) {
			this._delegate.onSelect(element.item, e.browserEvent?.type === 'previewSelectedEventType');
		} else {
			this._list.setSelection([]);
		}
	}

	private onListHover(e: IListMouseEvent<IListMenuItem<IActionItem>>): void {
		this._list.setFocus(typeof e.index === 'number' ? [e.index] : []);
	}

	private onListClick(e: IListMouseEvent<IListMenuItem<IActionItem>>): void {
		if (e.element && this.focusCondition(e.element)) {
			this._list.setFocus([]);
		}
	}
}

export function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}

const weight = KeybindingWeight.EditorContrib + 1000;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'hideCodeActionWidget',
			title: {
				value: localize('hideCodeActionWidget.title', "Hide action widget"),
				original: 'Hide action widget'
			},
			precondition: ActionWidgetContextKeys.Visible,
			keybinding: {
				weight,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IActionWidgetService).hide();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectPrevCodeAction',
			title: {
				value: localize('selectPrevCodeAction.title', "Select previous action"),
				original: 'Select previous action'
			},
			precondition: ActionWidgetContextKeys.Visible,
			keybinding: {
				weight,
				primary: KeyCode.UpArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
				mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] },
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IActionWidgetService).focusPrevious();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectNextCodeAction',
			title: {
				value: localize('selectNextCodeAction.title', "Select next action"),
				original: 'Select next action'
			},
			precondition: ActionWidgetContextKeys.Visible,
			keybinding: {
				weight,
				primary: KeyCode.DownArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
				mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IActionWidgetService).focusNext();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: acceptSelectedActionCommand,
			title: {
				value: localize('acceptSelected.title', "Accept selected action"),
				original: 'Accept selected action'
			},
			precondition: ActionWidgetContextKeys.Visible,
			keybinding: {
				weight,
				primary: KeyCode.Enter,
				secondary: [KeyMod.CtrlCmd | KeyCode.Period],
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IActionWidgetService).acceptSelected();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: previewSelectedActionCommand,
			title: {
				value: localize('previewSelected.title', "Preview selected action"),
				original: 'Preview selected action'
			},
			precondition: ActionWidgetContextKeys.Visible,
			keybinding: {
				weight,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IActionWidgetService).acceptSelected(true);
	}
});

