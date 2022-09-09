/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IListEvent, IListMouseEvent, IListRenderer } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/action';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { CodeAction, Command } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { codeActionCommandId, CodeActionItem, CodeActionSet, fixAllCommandId, organizeImportsCommandId, refactorCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionKind, CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/browser/types';
import 'vs/editor/contrib/symbolIcons/browser/symbolIcons'; // The codicon symbol colors are defined here and must be loaded to get colors
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const Context = {
	Visible: new RawContextKey<boolean>('codeActionMenuVisible', false, localize('codeActionMenuVisible', "Whether the code action list widget is visible"))
};

export const acceptSelectedCodeActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedCodeActionCommand = 'previewSelectedCodeAction';

interface CodeActionWidgetDelegate {
	onSelectCodeAction: (action: CodeActionItem, trigger: CodeActionTrigger) => Promise<any>;
}

interface ResolveCodeActionKeybinding {
	readonly kind: CodeActionKind;
	readonly preferred: boolean;
	readonly resolvedKeybinding: ResolvedKeybinding;
}

function stripNewlines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, ' ');
}

export interface CodeActionShowOptions {
	readonly includeDisabledActions: boolean;
	readonly fromLightbulb?: boolean;
}

enum CodeActionListItemKind {
	CodeAction = 'action',
	Header = 'header'
}

interface CodeActionListItemCodeAction {
	readonly kind: CodeActionListItemKind.CodeAction;
	readonly action: CodeActionItem;
	readonly index: number;
}

interface CodeActionListItemHeader {
	readonly kind: CodeActionListItemKind.Header;
	readonly headerTitle: string;
	readonly index: number;
}

type ICodeActionMenuItem = CodeActionListItemCodeAction | CodeActionListItemHeader;

interface ICodeActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly text: HTMLElement;
	readonly icon: HTMLElement;
}

class CodeActionItemRenderer implements IListRenderer<CodeActionListItemCodeAction, ICodeActionMenuTemplateData> {
	constructor(
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) { }

	get templateId(): string { return CodeActionListItemKind.CodeAction; }

	renderTemplate(container: HTMLElement): ICodeActionMenuTemplateData {
		const iconContainer = document.createElement('div');
		iconContainer.className = 'icon-container';
		container.append(iconContainer);

		const icon = document.createElement('div');
		iconContainer.append(icon);

		const text = document.createElement('span');
		container.append(text);

		return { container, icon, text };
	}

	renderElement(element: CodeActionListItemCodeAction, _index: number, data: ICodeActionMenuTemplateData): void {
		data.text.textContent = stripNewlines(element.action.action.title);

		// Icons and Label modification based on group
		const kind = element.action.action.kind ? new CodeActionKind(element.action.action.kind) : CodeActionKind.None;
		if (CodeActionKind.SurroundWith.contains(kind)) {
			data.icon.className = Codicon.symbolArray.classNames;
		} else if (CodeActionKind.Extract.contains(kind)) {
			data.icon.className = Codicon.wrench.classNames;
		} else if (CodeActionKind.Convert.contains(kind)) {
			data.icon.className = Codicon.zap.classNames;
			data.icon.style.color = `var(--vscode-editorLightBulbAutoFix-foreground)`;
		} else if (CodeActionKind.QuickFix.contains(kind)) {
			data.icon.className = Codicon.lightBulb.classNames;
			data.icon.style.color = `var(--vscode-editorLightBulb-foreground)`;
		} else {
			data.icon.className = Codicon.lightBulb.classNames;
			data.icon.style.color = `var(--vscode-editorLightBulb-foreground)`;
		}

		// Check if action has disabled reason
		if (element.action.action.disabled) {
			data.container.title = element.action.action.disabled;
		} else {
			const updateLabel = () => {
				data.container.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", this.keybindingService.lookupKeybinding(acceptSelectedCodeActionCommand)?.getLabel(), this.keybindingService.lookupKeybinding(previewSelectedCodeActionCommand)?.getLabel());
			};
			updateLabel();
		}

		if (element.action.action.disabled) {
			data.container.classList.add('option-disabled');
			data.container.style.backgroundColor = 'transparent !important';
			data.icon.style.opacity = '0.4';
		} else {
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
		container.classList.add('group-header', 'option-disabled');

		const text = document.createElement('span');
		container.append(text);

		return { container, text };
	}

	renderElement(element: CodeActionListItemHeader, _index: number, templateData: HeaderTemplateData): void {
		templateData.text.textContent = element.headerTitle;
	}

	disposeTemplate(_templateData: HeaderTemplateData): void {
		// noop
	}
}

class CodeActionList extends Disposable {

	private readonly codeActionLineHeight = 24;
	private readonly headerLineHeight = 26;

	public readonly domNode: HTMLElement;

	private readonly list: List<ICodeActionMenuItem>;

	private readonly allMenuItems: ICodeActionMenuItem[];
	private readonly viewItems: readonly CodeActionListItemCodeAction[];
	private focusedEnabledItem?: number;
	private currSelectedItem?: number;

	constructor(
		codeActions: readonly CodeActionItem[],
		showHeaders: boolean,
		private readonly onDidSelect: (action: CodeActionItem) => void,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();

		this.domNode = document.createElement('div');
		this.domNode.classList.add('codeActionList');

		this.list = this._register(new List('codeActionWidget', this.domNode, {
			getHeight: element => element.kind === CodeActionListItemKind.Header ? this.headerLineHeight : this.codeActionLineHeight,
			getTemplateId: element => element.kind,
		}, [
			new CodeActionItemRenderer(keybindingService),
			new HeaderRenderer(),
		], {
			keyboardSupport: false,
			accessibilityProvider: {
				getAriaLabel: element => {
					if (element.kind === CodeActionListItemKind.CodeAction) {
						let label = stripNewlines(element.action.action.title);
						if (element.action.action.disabled) {
							label = localize({ key: 'customCodeActionWidget.labels', comment: ['Code action labels for accessibility.'] }, "{0}, Disabled Reason: {1}", label, element.action.action.disabled);
						}
						return label;
					}
					return null;
				},
				getWidgetAriaLabel: () => localize({ key: 'customCodeActionWidget', comment: ['A Code Action Option'] }, "Code Action Widget"),
				getRole: () => 'option',
				getWidgetRole: () => 'code-action-widget'
			}
		}));

		this._register(this.list.onMouseClick(e => this.onListClick(e)));
		this._register(this.list.onMouseOver(e => this.onListHover(e)));
		this._register(this.list.onDidChangeFocus(() => this.list.domFocus()));
		this._register(this.list.onDidChangeSelection(e => this.onListSelection(e)));

		this.allMenuItems = this.toMenuItems(codeActions, showHeaders);
		this.viewItems = this.allMenuItems.filter(item => item.kind === CodeActionListItemKind.CodeAction && !item.action.action.disabled) as CodeActionListItemCodeAction[];
		this.list.splice(0, this.list.length, this.allMenuItems);

		if (this.viewItems.length >= 1) {
			this.focusedEnabledItem = 0;
			this.currSelectedItem = this.viewItems[0].index;
			this.list.setFocus([this.currSelectedItem]);
		}
	}

	public layout(minWidth: number): number {
		// Updating list height, depending on how many separators and headers there are.
		const numHeaders = this.allMenuItems.filter(item => item.kind === CodeActionListItemKind.Header).length;
		const height = this.allMenuItems.length * this.codeActionLineHeight;
		const heightWithHeaders = height + numHeaders * this.headerLineHeight - numHeaders * this.codeActionLineHeight;
		this.list.layout(heightWithHeaders);

		// For finding width dynamically (not using resize observer)
		const itemWidths: number[] = this.allMenuItems.map((_, index): number => {
			const element = document.getElementById(this.list.getElementID(index));
			if (element) {
				const textPadding = 10;
				const iconPadding = 10;
				return [...element.children].reduce((p, c) => p + c.clientWidth, 0) + (textPadding * 2) + iconPadding;
			}
			return 0;
		});

		// resize observer - can be used in the future since list widget supports dynamic height but not width
		const width = Math.max(...itemWidths, minWidth);
		this.list.layout(heightWithHeaders, width);

		this.domNode.style.height = `${heightWithHeaders}px`;

		this.list.domFocus();
		return width;
	}

	public focusPrevious() {
		if (typeof this.focusedEnabledItem === 'undefined') {
			this.focusedEnabledItem = this.viewItems[0].index;
		} else if (this.viewItems.length < 1) {
			return;
		}

		const startIndex = this.focusedEnabledItem;
		let item: ICodeActionMenuItem;

		do {
			this.focusedEnabledItem = this.focusedEnabledItem - 1;
			if (this.focusedEnabledItem < 0) {
				this.focusedEnabledItem = this.viewItems.length - 1;
			}
			item = this.viewItems[this.focusedEnabledItem];
			this.list.setFocus([item.index]);
			this.currSelectedItem = item.index;
		} while (this.focusedEnabledItem !== startIndex && item.action.action.disabled);
	}

	public focusNext() {
		if (typeof this.focusedEnabledItem === 'undefined') {
			this.focusedEnabledItem = this.viewItems.length - 1;
		} else if (this.viewItems.length < 1) {
			return;
		}

		const startIndex = this.focusedEnabledItem;
		let item: ICodeActionMenuItem;

		do {
			this.focusedEnabledItem = (this.focusedEnabledItem + 1) % this.viewItems.length;
			item = this.viewItems[this.focusedEnabledItem];
			this.list.setFocus([item.index]);
			this.currSelectedItem = item.index;
		} while (this.focusedEnabledItem !== startIndex && item.action.action.disabled);
	}

	public onEnterSet() {
		if (typeof this.currSelectedItem === 'number') {
			this.list.setSelection([this.currSelectedItem]);
		}
	}

	private onListSelection(e: IListEvent<ICodeActionMenuItem>): void {
		for (const element of e.elements) {
			if (element.kind === CodeActionListItemKind.CodeAction && !element.action.action.disabled) {
				this.onDidSelect(element.action);
			}
		}
	}

	private onListHover(e: IListMouseEvent<ICodeActionMenuItem>): void {
		if (!e.element) {
			this.currSelectedItem = undefined;
			this.list.setFocus([]);
		} else {
			if (e.element.kind === CodeActionListItemKind.CodeAction && !e.element.action.action.disabled) {
				this.list.setFocus([e.element.index]);
				this.focusedEnabledItem = this.viewItems.indexOf(e.element);
				this.currSelectedItem = e.element.index;
			} else {
				this.currSelectedItem = undefined;
				this.list.setFocus([e.element.index]);
			}
		}
	}

	private onListClick(e: IListMouseEvent<ICodeActionMenuItem>): void {
		if (e.element && e.element.kind === CodeActionListItemKind.CodeAction && e.element.action.action.disabled) {
			this.currSelectedItem = undefined;
			this.list.setFocus([]);
		}
	}

	private toMenuItems(inputCodeActions: readonly CodeActionItem[], showHeaders: boolean): ICodeActionMenuItem[] {
		if (!showHeaders) {
			return inputCodeActions.map((action, index): ICodeActionMenuItem => ({ kind: CodeActionListItemKind.CodeAction, action, index }));
		}

		// Groups code actions by their kind
		const quickfixGroup: CodeActionItem[] = [];
		const extractGroup: CodeActionItem[] = [];
		const convertGroup: CodeActionItem[] = [];
		const surroundGroup: CodeActionItem[] = [];
		const sourceGroup: CodeActionItem[] = [];
		const otherGroup: CodeActionItem[] = [];

		for (const action of inputCodeActions) {
			const kind = action.action.kind ? new CodeActionKind(action.action.kind) : CodeActionKind.None;
			if (CodeActionKind.SurroundWith.contains(kind)) {
				surroundGroup.push(action);
			} else if (CodeActionKind.QuickFix.contains(kind)) {
				quickfixGroup.push(action);
			} else if (CodeActionKind.Extract.contains(kind)) {
				extractGroup.push(action);
			} else if (CodeActionKind.Convert.contains(kind)) {
				convertGroup.push(action);
			} else if (CodeActionKind.Source.contains(kind)) {
				sourceGroup.push(action);
			} else {
				otherGroup.push(action);
			}
		}

		const menuEntries: ReadonlyArray<{ title: string; actions: CodeActionItem[] }> = [
			{ title: localize('codeAction.widget.id.quickfix', 'Quick Fix...'), actions: quickfixGroup },
			{ title: localize('codeAction.widget.id.extract', 'Extract...'), actions: extractGroup },
			{ title: localize('codeAction.widget.id.convert', 'Convert...'), actions: convertGroup },
			{ title: localize('codeAction.widget.id.surround', 'Surround With...'), actions: surroundGroup },
			{ title: localize('codeAction.widget.id.source', 'Source Action...'), actions: sourceGroup },
			{ title: localize('codeAction.widget.id.more', 'More Actions...'), actions: otherGroup },
		];

		const allMenuItems: ICodeActionMenuItem[] = [];
		for (const menuEntry of menuEntries) {
			if (menuEntry.actions.length) {
				allMenuItems.push({ kind: CodeActionListItemKind.Header, headerTitle: menuEntry.title, index: allMenuItems.length });
				for (const action of menuEntry.actions) {
					allMenuItems.push({ kind: CodeActionListItemKind.CodeAction, action, index: allMenuItems.length });
				}
			}
		}

		return allMenuItems;
	}
}

// TODO: Take a look at user storage for this so it is preserved across windows and on reload.
let showDisabled = false;

export class CodeActionMenu extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.codeActionMenu';

	public static get(editor: ICodeEditor): CodeActionMenu | null {
		return editor.getContribution<CodeActionMenu>(CodeActionMenu.ID);
	}

	private readonly codeActionList = this._register(new MutableDisposable<CodeActionList>());

	private currentShowingContext?: {
		readonly options: CodeActionShowOptions;
		readonly trigger: CodeActionTrigger;
		readonly anchor: IAnchor;
		readonly codeActions: CodeActionSet;
	};
	private _ctxMenuWidgetVisible: IContextKey<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _delegate: CodeActionWidgetDelegate,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._ctxMenuWidgetVisible = Context.Visible.bindTo(this._contextKeyService);
	}

	get isVisible(): boolean {
		return !!this.currentShowingContext;
	}

	public async show(trigger: CodeActionTrigger, codeActions: CodeActionSet, anchor: IAnchor, options: CodeActionShowOptions): Promise<void> {
		this.currentShowingContext = undefined;
		if (!this._editor.hasModel() || !this._editor.getDomNode()) {
			return;
		}

		const actionsToShow = options.includeDisabledActions && (showDisabled || codeActions.validActions.length === 0) ? codeActions.allActions : codeActions.validActions;
		if (!actionsToShow.length) {
			return;
		}

		this.currentShowingContext = { trigger, codeActions, anchor, options };

		this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: (container: HTMLElement) => this.renderWidget(container, trigger, codeActions, options, actionsToShow),
			onHide: (didCancel: boolean) => this.onWidgetClosed(trigger, options, codeActions, didCancel),
		}, this._editor.getDomNode()!, false);
	}

	/**
	 * Focuses on the previous item in the list using the list widget.
	 */
	public focusPrevious() {
		this.codeActionList.value?.focusPrevious();
	}

	/**
	 * Focuses on the next item in the list using the list widget.
	 */
	public focusNext() {
		this.codeActionList.value?.focusNext();
	}

	public onEnterSet() {
		this.codeActionList.value?.onEnterSet();
	}

	public hideCodeActionWidget() {
		this._ctxMenuWidgetVisible.reset();
		this.codeActionList.clear();
		this._contextViewService.hideContextView();
	}

	private shouldShowHeaders(): boolean {
		const model = this._editor.getModel();
		return this._configurationService.getValue('editor.codeActionWidget.showHeaders', { resource: model?.uri });
	}

	private renderWidget(element: HTMLElement, trigger: CodeActionTrigger, codeActions: CodeActionSet, options: CodeActionShowOptions, showingCodeActions: readonly CodeActionItem[]): IDisposable {
		const renderDisposables = new DisposableStore();

		const widget = document.createElement('div');
		widget.classList.add('codeActionWidget');
		element.appendChild(widget);

		this.codeActionList.value = new CodeActionList(
			showingCodeActions,
			this.shouldShowHeaders(),
			action => {
				this.hideCodeActionWidget();
				this._delegate.onSelectCodeAction(action, trigger);
			},
			this._keybindingService);

		widget.appendChild(this.codeActionList.value.domNode);

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
			const actionBar = this.createActionBar(trigger, showingCodeActions, codeActions, options);
			if (actionBar) {
				widget.appendChild(actionBar.getContainer().parentElement!);
				renderDisposables.add(actionBar);
				actionBarWidth = actionBar.getContainer().offsetWidth;
			}
		}

		const width = this.codeActionList.value.layout(actionBarWidth);
		widget.style.width = `${width}px`;

		renderDisposables.add(this._editor.onDidLayoutChange(() => this.hideCodeActionWidget()));

		const focusTracker = renderDisposables.add(dom.trackFocus(element));
		renderDisposables.add(focusTracker.onDidBlur(() => {
			this.hideCodeActionWidget();
		}));

		this._ctxMenuWidgetVisible.set(true);

		return renderDisposables;
	}

	/**
	 * Toggles whether the disabled actions in the code action widget are visible or not.
	 */
	private toggleShowDisabled(newShowDisabled: boolean): void {
		const previouslyShowingActions = this.currentShowingContext;

		this.hideCodeActionWidget();

		showDisabled = newShowDisabled;

		if (previouslyShowingActions) {
			this.show(previouslyShowingActions.trigger, previouslyShowingActions.codeActions, previouslyShowingActions.anchor, previouslyShowingActions.options);
		}
	}

	private onWidgetClosed(trigger: CodeActionTrigger, options: CodeActionShowOptions, codeActions: CodeActionSet, didCancel: boolean): void {
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
			cancelled: didCancel,
		});

		this.currentShowingContext = undefined;
		this._editor.focus();
	}

	private createActionBar(trigger: CodeActionTrigger, inputCodeActions: readonly CodeActionItem[], codeActions: CodeActionSet, options: CodeActionShowOptions): ActionBar | undefined {
		const actions = this.getActionBarActions(trigger, inputCodeActions, codeActions, options);
		if (!actions.length) {
			return undefined;
		}

		const container = dom.$('.codeActionWidget-action-bar');
		const actionBar = new ActionBar(container);
		actionBar.push(actions, { icon: false, label: true });
		return actionBar;
	}

	private getActionBarActions(trigger: CodeActionTrigger, inputCodeActions: readonly CodeActionItem[], codeActions: CodeActionSet, options: CodeActionShowOptions): IAction[] {
		const actions = this.getDocumentationActions(trigger, inputCodeActions, codeActions.documentation);

		if (options.includeDisabledActions && codeActions.validActions.length > 0 && codeActions.allActions.length !== codeActions.validActions.length) {
			actions.push(showDisabled ? {
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

	private getDocumentationActions(
		trigger: CodeActionTrigger,
		actionsToShow: readonly CodeActionItem[],
		documentation: readonly Command[],
	): IAction[] {
		const allDocumentation: Command[] = [...documentation];

		const model = this._editor.getModel();
		if (model && actionsToShow.length) {
			for (const provider of this._languageFeaturesService.codeActionProvider.all(model)) {
				if (provider._getAdditionalMenuItems) {
					allDocumentation.push(...provider._getAdditionalMenuItems({ trigger: trigger.type, only: trigger.filter?.include?.value }, actionsToShow.map(item => item.action)));
				}
			}
		}

		return allDocumentation.map((command): IAction => ({
			id: command.id,
			label: command.title,
			tooltip: command.tooltip ?? '',
			class: undefined,
			enabled: true,
			run: () => this._commandService.executeCommand(command.id, ...(command.arguments ?? [])),
		}));
	}
}

export class CodeActionKeybindingResolver {
	private static readonly codeActionCommands: readonly string[] = [
		refactorCommandId,
		codeActionCommandId,
		sourceActionCommandId,
		organizeImportsCommandId,
		fixAllCommandId
	];

	constructor(
		private readonly _keybindingProvider: {
			getKeybindings(): readonly ResolvedKeybindingItem[];
		},
	) { }

	public getResolver(): (action: CodeAction) => ResolvedKeybinding | undefined {
		// Lazy since we may not actually ever read the value
		const allCodeActionBindings = new Lazy<readonly ResolveCodeActionKeybinding[]>(() =>
			this._keybindingProvider.getKeybindings()
				.filter(item => CodeActionKeybindingResolver.codeActionCommands.indexOf(item.command!) >= 0)
				.filter(item => item.resolvedKeybinding)
				.map((item): ResolveCodeActionKeybinding => {
					// Special case these commands since they come built-in with VS Code and don't use 'commandArgs'
					let commandArgs = item.commandArgs;
					if (item.command === organizeImportsCommandId) {
						commandArgs = { kind: CodeActionKind.SourceOrganizeImports.value };
					} else if (item.command === fixAllCommandId) {
						commandArgs = { kind: CodeActionKind.SourceFixAll.value };
					}

					return {
						resolvedKeybinding: item.resolvedKeybinding!,
						...CodeActionCommandArgs.fromUser(commandArgs, {
							kind: CodeActionKind.None,
							apply: CodeActionAutoApply.Never
						})
					};
				}));

		return (action) => {
			if (action.kind) {
				const binding = this.bestKeybindingForCodeAction(action, allCodeActionBindings.getValue());
				return binding?.resolvedKeybinding;
			}
			return undefined;
		};
	}

	private bestKeybindingForCodeAction(
		action: CodeAction,
		candidates: readonly ResolveCodeActionKeybinding[],
	): ResolveCodeActionKeybinding | undefined {
		if (!action.kind) {
			return undefined;
		}
		const kind = new CodeActionKind(action.kind);

		return candidates
			.filter(candidate => candidate.kind.contains(kind))
			.filter(candidate => {
				if (candidate.preferred) {
					// If the candidate keybinding only applies to preferred actions, the this action must also be preferred
					return action.isPreferred;
				}
				return true;
			})
			.reduceRight((currentBest, candidate) => {
				if (!currentBest) {
					return candidate;
				}
				// Select the more specific binding
				return currentBest.kind.contains(candidate.kind) ? candidate : currentBest;
			}, undefined as ResolveCodeActionKeybinding | undefined);
	}
}
