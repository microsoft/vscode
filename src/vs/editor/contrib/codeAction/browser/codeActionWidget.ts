/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ListMenuItem, BaseActionWidget, ActionShowOptions, ListItem } from 'vs/base/browser/ui/baseActionWidget/baseActionWidget';
import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IListRenderer } from 'vs/base/browser/ui/list/list';
import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { OS } from 'vs/base/common/platform';
import 'vs/css!./codeActionWidget';
import { ActionList } from 'vs/editor/contrib/codeAction/browser/actionList';
import { acceptSelectedCodeActionCommand, previewSelectedCodeActionCommand } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionSet } from 'vs/editor/contrib/codeAction/browser/codeActionUi';
import { CodeActionItem, CodeActionKind, CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/common/types';
import 'vs/editor/contrib/symbolIcons/browser/symbolIcons'; // The codicon symbol colors are defined here and must be loaded to get colors
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CodeActionKeybindingResolver } from './codeActionKeybindingResolver';

export const Context = {
	Visible: new RawContextKey<boolean>('codeActionMenuVisible', false, localize('codeActionMenuVisible', "Whether the code action list widget is visible"))
};

interface CodeActionWidgetDelegate {
	onSelectCodeAction(action: CodeActionItem, trigger: CodeActionTrigger, options: { readonly preview: boolean }): Promise<any>;
	onHide(cancelled: boolean): void;
}

enum CodeActionListItemKind {
	CodeAction = 'action',
	Header = 'header'
}

interface CodeActionListItemCodeAction extends ListMenuItem {
	readonly kind: CodeActionListItemKind.CodeAction;
	readonly item: CodeActionItem;
	readonly group: ActionGroup;
}


interface CodeActionListItemHeader extends ListMenuItem {
	readonly kind: CodeActionListItemKind.Header;
	readonly group: ActionGroup;
}
type ICodeActionMenuItem = CodeActionListItemCodeAction | CodeActionListItemHeader;

interface ICodeActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly text: HTMLElement;
	readonly keybinding: KeybindingLabel;
}

function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}

export interface ActionGroup {
	readonly kind: CodeActionKind;
	readonly title: string;
	readonly icon?: { readonly codicon: Codicon; readonly color?: string };
}

const uncategorizedCodeActionGroup = Object.freeze<ActionGroup>({ kind: CodeActionKind.Empty, title: localize('codeAction.widget.id.more', 'More Actions...') });

const codeActionGroups = Object.freeze<ActionGroup[]>([
	{ kind: CodeActionKind.QuickFix, title: localize('codeAction.widget.id.quickfix', 'Quick Fix...') },
	{ kind: CodeActionKind.RefactorExtract, title: localize('codeAction.widget.id.extract', 'Extract...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.RefactorInline, title: localize('codeAction.widget.id.inline', 'Inline...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.RefactorRewrite, title: localize('codeAction.widget.id.convert', 'Rewrite...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.RefactorMove, title: localize('codeAction.widget.id.move', 'Move...'), icon: { codicon: Codicon.wrench } },
	{ kind: CodeActionKind.SurroundWith, title: localize('codeAction.widget.id.surround', 'Surround With...'), icon: { codicon: Codicon.symbolSnippet } },
	{ kind: CodeActionKind.Source, title: localize('codeAction.widget.id.source', 'Source Action...'), icon: { codicon: Codicon.symbolFile } },
	uncategorizedCodeActionGroup,
]);

class CodeActionItemRenderer implements IListRenderer<CodeActionListItemCodeAction, ICodeActionMenuTemplateData> {
	constructor(
		private readonly keybindingResolver: CodeActionKeybindingResolver,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) { }

	get templateId(): string { return CodeActionListItemKind.CodeAction; }

	renderTemplate(container: HTMLElement): ICodeActionMenuTemplateData {
		container.classList.add('code-action');

		const icon = document.createElement('div');
		icon.className = 'icon';
		container.append(icon);

		const text = document.createElement('span');
		text.className = 'title';
		container.append(text);

		const keybinding = new KeybindingLabel(container, OS);

		return { container, icon, text, keybinding };
	}

	renderElement(element: CodeActionListItemCodeAction, _index: number, data: ICodeActionMenuTemplateData): void {
		if (element.group.icon) {
			data.icon.className = element.group.icon.codicon.classNames;
			data.icon.style.color = element.group.icon.color ?? '';
		} else {
			data.icon.className = Codicon.lightBulb.classNames;
			data.icon.style.color = 'var(--vscode-editorLightBulb-foreground)';
		}

		data.text.textContent = stripNewlines(element.item.action.title);

		const binding = this.keybindingResolver.getResolver()(element.item.action);
		data.keybinding.set(binding);
		if (!binding) {
			dom.hide(data.keybinding.element);
		} else {
			dom.show(data.keybinding.element);
		}

		if (element.item.action.disabled) {
			data.container.title = element.item.action.disabled;
			data.container.classList.add('option-disabled');
		} else {
			data.container.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", this.keybindingService.lookupKeybinding(acceptSelectedCodeActionCommand)?.getLabel(), this.keybindingService.lookupKeybinding(previewSelectedCodeActionCommand)?.getLabel());
			data.container.classList.remove('option-disabled');
		}
	}

	disposeTemplate(_templateData: ICodeActionMenuTemplateData): void {
		// noop
	}
}

interface HeaderTemplateData {
	readonly container: HTMLElement;
	readonly text: HTMLElement;
}

class HeaderRenderer implements IListRenderer<CodeActionListItemHeader, HeaderTemplateData> {

	get templateId(): string { return CodeActionListItemKind.Header; }

	renderTemplate(container: HTMLElement): HeaderTemplateData {
		container.classList.add('group-header');

		const text = document.createElement('span');
		container.append(text);

		return { container, text };
	}

	renderElement(element: CodeActionListItemHeader, _index: number, templateData: HeaderTemplateData): void {
		templateData.text.textContent = element.group.title;
	}

	disposeTemplate(_templateData: HeaderTemplateData): void {
		// noop
	}
}

class CodeActionList extends ActionList<CodeActionListItemCodeAction | CodeActionListItemHeader> {

	constructor(
		codeActions: readonly CodeActionItem[],
		showHeaders: boolean,
		onDidSelect: (action: ListItem, options: { readonly preview: boolean }) => void,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextViewService contextViewService: IContextViewService
	) {
		super({
			user: 'codeActionWidget',
			renderers: [
				new CodeActionItemRenderer(new CodeActionKeybindingResolver(keybindingService), keybindingService),
				new HeaderRenderer(),
			],
			options: {
				keyboardSupport: false,
				accessibilityProvider: {
					getAriaLabel: element => {
						if (element.kind === CodeActionListItemKind.CodeAction) {
							let label = stripNewlines(element.item.action.title);
							if (element.item.action.disabled) {
								label = localize({ key: 'customCodeActionWidget.labels', comment: ['Code action labels for accessibility.'] }, "{0}, Disabled Reason: {1}", label, element.item.action.disabled);
							}
							return label;
						}
						return null;
					},
					getWidgetAriaLabel: () => localize({ key: 'customCodeActionWidget', comment: ['A Code Action Option'] }, "Code Action Widget"),
					getRole: () => 'option',
					getWidgetRole: () => 'code-action-widget'
				},
			}
		}, codeActions, showHeaders, acceptSelectedCodeActionCommand, (element: CodeActionListItemCodeAction | CodeActionListItemHeader) => { return element.kind === CodeActionListItemKind.CodeAction && !element.item.action.disabled; }, onDidSelect, contextViewService);
	}

	public toMenuItems(inputCodeActions: readonly CodeActionItem[], showHeaders: boolean): ICodeActionMenuItem[] {
		if (!showHeaders) {
			return inputCodeActions.map((action): ICodeActionMenuItem => ({ kind: CodeActionListItemKind.CodeAction, item: action, group: uncategorizedCodeActionGroup }));
		}

		// Group code actions
		const menuEntries = codeActionGroups.map(group => ({ group, actions: [] as CodeActionItem[] }));

		for (const action of inputCodeActions) {
			const kind = action.action.kind ? new CodeActionKind(action.action.kind) : CodeActionKind.None;
			for (const menuEntry of menuEntries) {
				if (menuEntry.group.kind.contains(kind)) {
					menuEntry.actions.push(action);
					break;
				}
			}
		}

		const allMenuItems: ICodeActionMenuItem[] = [];
		for (const menuEntry of menuEntries) {
			if (menuEntry.actions.length) {
				allMenuItems.push({ kind: CodeActionListItemKind.Header, group: menuEntry.group });
				for (const action of menuEntry.actions) {
					allMenuItems.push({ kind: CodeActionListItemKind.CodeAction, item: action, group: menuEntry.group });
				}
			}
		}

		return allMenuItems;
	}
}

export class CodeActionWidget extends BaseActionWidget<CodeActionItem> {

	private static _instance?: CodeActionWidget;

	public static get INSTANCE(): CodeActionWidget | undefined { return this._instance; }

	public static getOrCreateInstance(instantiationService: IInstantiationService): BaseActionWidget<CodeActionItem> {
		if (!this._instance) {
			this._instance = instantiationService.createInstance(CodeActionWidget);
		}
		return this._instance;
	}

	private currentShowingContext?: {
		readonly options: ActionShowOptions;
		readonly trigger: CodeActionTrigger;
		readonly anchor: IAnchor;
		readonly container: HTMLElement | undefined;
		readonly codeActions: CodeActionSet;
		readonly delegate: CodeActionWidgetDelegate;
	};

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
	}

	get isVisible(): boolean {
		return !!this.currentShowingContext;
	}

	public async show(trigger: CodeActionTrigger, codeActions: CodeActionSet, anchor: IAnchor, container: HTMLElement | undefined, options: ActionShowOptions, delegate: CodeActionWidgetDelegate): Promise<void> {
		this.currentShowingContext = undefined;
		const visibleContext = Context.Visible.bindTo(this._contextKeyService);

		const actionsToShow = options.includeDisabledActions && (this.showDisabled || codeActions.validActions.length === 0) ? codeActions.allActions : codeActions.validActions;
		if (!actionsToShow.length) {
			visibleContext.reset();
			return;
		}

		this.currentShowingContext = { trigger, codeActions, anchor, container, delegate, options };

		this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: (container: HTMLElement) => {
				visibleContext.set(true);
				return this.renderWidget(container, trigger, codeActions, options, actionsToShow, delegate);
			},
			onHide: (didCancel: boolean) => {
				visibleContext.reset();
				return this.onWidgetClosed(trigger, options, codeActions, didCancel, delegate);
			},
		}, container, false);
	}

	public acceptSelected(options?: { readonly preview?: boolean }) {
		this.list.value?.acceptSelected(options);
	}

	private renderWidget(element: HTMLElement, trigger: CodeActionTrigger, codeActions: CodeActionSet, options: ActionShowOptions, showingCodeActions: readonly CodeActionItem[], delegate: CodeActionWidgetDelegate): IDisposable {
		const renderDisposables = new DisposableStore();

		const widget = document.createElement('div');
		widget.classList.add('codeActionWidget');
		element.appendChild(widget);
		const onDidSelect = (action: ListItem, options: { readonly preview: boolean }) => {
			this.hide();
			delegate.onSelectCodeAction(action as CodeActionItem, trigger, options);
		};
		this.list.value = new CodeActionList(
			showingCodeActions,
			options.showHeaders ?? true,
			onDidSelect,
			this._keybindingService,
			this._contextViewService);

		widget.appendChild(this.list.value.domNode);

		// Invisible div to block mouse interaction in the rest of the UI
		const menuBlock = document.createElement('div');
		const block = element.appendChild(menuBlock);
		block.classList.add('context-view-block');
		block.style.position = 'fixed';
		block.style.cursor = 'initial';
		block.style.left = '0';
		block.style.top = '0';
		block.style.width = '100%';
		block.style.height = '100%';
		block.style.zIndex = '-1';
		renderDisposables.add(dom.addDisposableListener(block, dom.EventType.MOUSE_DOWN, e => e.stopPropagation()));

		// Invisible div to block mouse interaction with the menu
		const pointerBlockDiv = document.createElement('div');
		const pointerBlock = element.appendChild(pointerBlockDiv);
		pointerBlock.classList.add('context-view-pointerBlock');
		pointerBlock.style.position = 'fixed';
		pointerBlock.style.cursor = 'initial';
		pointerBlock.style.left = '0';
		pointerBlock.style.top = '0';
		pointerBlock.style.width = '100%';
		pointerBlock.style.height = '100%';
		pointerBlock.style.zIndex = '2';

		// Removes block on click INSIDE widget or ANY mouse movement
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
		renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.MOUSE_DOWN, () => pointerBlock.remove()));

		// Action bar
		let actionBarWidth = 0;
		if (!options.fromLightbulb) {
			const actionBar = this.createActionBar(codeActions, options);
			if (actionBar) {
				widget.appendChild(actionBar.getContainer().parentElement!);
				renderDisposables.add(actionBar);
				actionBarWidth = actionBar.getContainer().offsetWidth;
			}
		}

		const width = this.list.value.layout(actionBarWidth);
		widget.style.width = `${width}px`;

		const focusTracker = renderDisposables.add(dom.trackFocus(element));
		renderDisposables.add(focusTracker.onDidBlur(() => this.hide()));

		return renderDisposables;
	}

	/**
	 * Toggles whether the disabled actions in the code action widget are visible or not.
	 */
	private toggleShowDisabled(newShowDisabled: boolean): void {
		const previousCtx = this.currentShowingContext;

		this.hide();

		this.showDisabled = newShowDisabled;

		if (previousCtx) {
			this.show(previousCtx.trigger, previousCtx.codeActions, previousCtx.anchor, previousCtx.container, previousCtx.options, previousCtx.delegate);
		}
	}

	private onWidgetClosed(trigger: CodeActionTrigger, options: ActionShowOptions, codeActions: CodeActionSet, cancelled: boolean, delegate: CodeActionWidgetDelegate): void {
		type ApplyCodeActionEvent = {
			codeActionFrom: CodeActionTriggerSource;
			validCodeActions: number;
			cancelled: boolean;
		};

		type ApplyCodeEventClassification = {
			codeActionFrom: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of action used to opened the code action.' };
			validCodeActions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The total number of valid actions that are highlighted and can be used.' };
			cancelled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The indicator if the menu was selected or cancelled.' };
			owner: 'mjbvz';
			comment: 'Event used to gain insights into how code actions are being triggered';
		};

		this._telemetryService.publicLog2<ApplyCodeActionEvent, ApplyCodeEventClassification>('codeAction.applyCodeAction', {
			codeActionFrom: options.fromLightbulb ? CodeActionTriggerSource.Lightbulb : trigger.triggerAction,
			validCodeActions: codeActions.validActions.length,
			cancelled: cancelled,
		});

		this.currentShowingContext = undefined;

		delegate.onHide(cancelled);
	}

	private createActionBar(codeActions: CodeActionSet, options: ActionShowOptions): ActionBar | undefined {
		const actions = this.getActionBarActions(codeActions, options);
		if (!actions.length) {
			return undefined;
		}

		const container = dom.$('.codeActionWidget-action-bar');
		const actionBar = new ActionBar(container);
		actionBar.push(actions, { icon: false, label: true });
		return actionBar;
	}

	private getActionBarActions(codeActions: CodeActionSet, options: ActionShowOptions): IAction[] {
		const actions = codeActions.documentation.map((command): IAction => ({
			id: command.id,
			label: command.title,
			tooltip: command.tooltip ?? '',
			class: undefined,
			enabled: true,
			run: () => this._commandService.executeCommand(command.id, ...(command.arguments ?? [])),
		}));

		if (options.includeDisabledActions && codeActions.validActions.length > 0 && codeActions.allActions.length !== codeActions.validActions.length) {
			actions.push(this.showDisabled ? {
				id: 'hideMoreCodeActions',
				label: localize('hideMoreCodeActions', 'Hide Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => this.toggleShowDisabled(false)
			} : {
				id: 'showMoreCodeActions',
				label: localize('showMoreCodeActions', 'Show Disabled'),
				enabled: true,
				tooltip: '',
				class: undefined,
				run: () => this.toggleShowDisabled(true)
			});
		}

		return actions;
	}
}
