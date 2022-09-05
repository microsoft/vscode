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
import { Action, IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { canceled } from 'vs/base/common/errors';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/action';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { CodeAction, Command } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
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
import { IThemeService } from 'vs/platform/theme/common/themeService';

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

class CodeActionAction extends Action {
	constructor(
		public readonly action: CodeAction,
		callback: () => Promise<void>,
	) {
		super(action.command ? action.command.id : action.title, stripNewlines(action.title), undefined, !action.disabled, callback);
	}
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
	readonly action: CodeActionAction;
	readonly index: number;
	readonly params: ICodeActionMenuParameters;
}

interface CodeActionListItemHeader {
	readonly kind: CodeActionListItemKind.Header;
	readonly headerTitle: string;
	readonly index: number;
}

type ICodeActionMenuItem = CodeActionListItemCodeAction | CodeActionListItemHeader;

export interface ICodeActionMenuParameters {
	readonly options: CodeActionShowOptions;
	readonly trigger: CodeActionTrigger;
	readonly anchor: { x: number; y: number };
	readonly menuActions: IAction[];
	readonly documentationActions: readonly Command[];
	readonly codeActions: CodeActionSet;
	readonly visible: boolean;
	readonly showDisabled: boolean;
}

interface ICodeActionMenuTemplateData {
	readonly container: HTMLElement;
	readonly text: HTMLElement;
	readonly icon: HTMLElement;
}

const codeActionLineHeight = 24;
const headerLineHeight = 26;

// TODO: Take a look at user storage for this so it is preserved across windows and on reload.
let showDisabled = false;

class CodeActionItemRenderer implements IListRenderer<CodeActionListItemCodeAction, ICodeActionMenuTemplateData> {
	constructor(
		private readonly acceptKeybindings: [string, string],
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
		data.text.textContent = element.action.label;

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
				const [accept, preview] = this.acceptKeybindings;
				data.container.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", this.keybindingService.lookupKeybinding(accept)?.getLabel(), this.keybindingService.lookupKeybinding(preview)?.getLabel());
			};
			updateLabel();
		}

		if (!element.action.enabled) {
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


export class CodeActionMenu extends Disposable implements IEditorContribution {

	private readonly _showingActions = this._register(new MutableDisposable<CodeActionSet>());
	private codeActionList = this._register(new MutableDisposable<List<ICodeActionMenuItem>>());

	private _visible: boolean = false;
	private _ctxMenuWidgetVisible: IContextKey<boolean>;
	private viewItems: readonly CodeActionListItemCodeAction[] = [];
	private focusedEnabledItem: number | undefined;
	private currSelectedItem: number | undefined;

	public static readonly ID: string = 'editor.contrib.codeActionMenu';

	public static get(editor: ICodeEditor): CodeActionMenu | null {
		return editor.getContribution<CodeActionMenu>(CodeActionMenu.ID);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _delegate: CodeActionWidgetDelegate,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IThemeService _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this._ctxMenuWidgetVisible = Context.Visible.bindTo(this._contextKeyService);
	}

	get isVisible(): boolean {
		return this._visible;
	}

	/**
	* Checks if the setting has disabled/enabled headers in the code action widget.
	*/
	private isCodeActionWidgetHeadersShown(model: ITextModel): boolean {
		return this._configurationService.getValue('editor.codeActionWidget.showHeaders', {
			resource: model.uri
		});
	}

	private _onListSelection(e: IListEvent<ICodeActionMenuItem>): void {
		let didSelect = false;
		for (const element of e.elements) {
			if (element.kind === CodeActionListItemKind.CodeAction) {
				didSelect = true;
				element.action.run();
			}
		}

		if (didSelect) {
			this.hideCodeActionWidget();
		}
	}

	private _onListHover(e: IListMouseEvent<ICodeActionMenuItem>): void {
		if (!e.element) {
			this.currSelectedItem = undefined;
			this.codeActionList.value?.setFocus([]);
		} else {
			if (e.element.kind === CodeActionListItemKind.CodeAction && e.element.action.enabled) {
				this.codeActionList.value?.setFocus([e.element.index]);
				this.focusedEnabledItem = this.viewItems.indexOf(e.element);
				this.currSelectedItem = e.element.index;
			} else {
				this.currSelectedItem = undefined;
				this.codeActionList.value?.setFocus([e.element.index]);
			}
		}
	}

	private _onListClick(e: IListMouseEvent<ICodeActionMenuItem>): void {
		if (e.element && e.element.kind === CodeActionListItemKind.CodeAction && !e.element.action.enabled) {
			this.currSelectedItem = undefined;
			this.codeActionList.value?.setFocus([]);
		}
	}

	/**
	 * Renders the code action widget given the provided actions.
	 */
	private renderCodeActionMenuList(element: HTMLElement, inputCodeActions: readonly CodeActionAction[], inputDocumentation: readonly Command[], params: ICodeActionMenuParameters): IDisposable {
		const renderDisposables = new DisposableStore();

		const model = this._editor.getModel();
		if (!model) {
			return renderDisposables;
		}

		const widget = document.createElement('div');
		widget.classList.add('codeActionWidget');
		element.appendChild(widget);

		// Render invisible div to block mouse interaction in the rest of the UI
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

		const codeActionList = document.createElement('div');
		codeActionList.classList.add('codeActionList');
		widget.appendChild(codeActionList);

		this.codeActionList.value = new List('codeActionWidget', codeActionList, {
			getHeight(element) {
				return element.kind === CodeActionListItemKind.Header ? headerLineHeight : codeActionLineHeight;
			},
			getTemplateId: element => element.kind,
		}, [
			new CodeActionItemRenderer([acceptSelectedCodeActionCommand, previewSelectedCodeActionCommand], this.keybindingService),
			new HeaderRenderer(),
		], {
			keyboardSupport: false,
			accessibilityProvider: {
				getAriaLabel: element => {
					if (element.kind === CodeActionListItemKind.CodeAction) {
						let label = element.action.label;
						if (!element.action.enabled) {
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
		});

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

		renderDisposables.add(this.codeActionList.value.onMouseClick(e => this._onListClick(e)));
		renderDisposables.add(this.codeActionList.value.onMouseOver(e => this._onListHover(e)));
		renderDisposables.add(this.codeActionList.value.onDidChangeFocus(() => this.codeActionList.value?.domFocus()));
		renderDisposables.add(this.codeActionList.value.onDidChangeSelection(e => this._onListSelection(e)));
		renderDisposables.add(this._editor.onDidLayoutChange(() => this.hideCodeActionWidget()));

		let numHeaders = 0;
		const allMenuItems: ICodeActionMenuItem[] = [];

		// Checks if headers are disabled.
		if (!this.isCodeActionWidgetHeadersShown(model)) {
			const items = inputCodeActions.map((item, index): ICodeActionMenuItem => ({ kind: CodeActionListItemKind.CodeAction, action: item, index, params }));
			allMenuItems.push(...items);
		} else {
			// Filters and groups code actions by their group

			// Code Action Groups
			const quickfixGroup: CodeActionAction[] = [];
			const extractGroup: CodeActionAction[] = [];
			const convertGroup: CodeActionAction[] = [];
			const surroundGroup: CodeActionAction[] = [];
			const sourceGroup: CodeActionAction[] = [];
			const otherGroup: CodeActionAction[] = [];

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
					// Pushes all the other actions to the "Other" group
					otherGroup.push(action);
				}
			}

			const menuEntries: ReadonlyArray<{ title: string; actions: CodeActionAction[] }> = [
				{ title: localize('codeAction.widget.id.quickfix', 'Quick Fix...'), actions: quickfixGroup },
				{ title: localize('codeAction.widget.id.extract', 'Extract...'), actions: extractGroup },
				{ title: localize('codeAction.widget.id.convert', 'Convert...'), actions: convertGroup },
				{ title: localize('codeAction.widget.id.surround', 'Surround With...'), actions: surroundGroup },
				{ title: localize('codeAction.widget.id.source', 'Source Action...'), actions: sourceGroup },
				{ title: localize('codeAction.widget.id.more', 'More Actions...'), actions: otherGroup },
			];

			for (const menuEntry of menuEntries) {
				if (menuEntry.actions.length) {
					allMenuItems.push({ kind: CodeActionListItemKind.Header, headerTitle: menuEntry.title, index: allMenuItems.length });
					for (const action of menuEntry.actions) {
						allMenuItems.push({ kind: CodeActionListItemKind.CodeAction, action, params, index: allMenuItems.length });
					}
					numHeaders++;
				}
			}
		}

		this.viewItems = allMenuItems.filter(item => item.kind === CodeActionListItemKind.CodeAction && item.action.enabled) as CodeActionListItemCodeAction[];
		this.codeActionList.value.splice(0, this.codeActionList.value.length, allMenuItems);

		// Updating list height, depending on how many separators and headers there are.
		const height = allMenuItems.length * codeActionLineHeight;
		const heightWithHeaders = height + numHeaders * headerLineHeight - numHeaders * codeActionLineHeight;
		this.codeActionList.value.layout(heightWithHeaders);

		// List selection
		if (this.viewItems.length < 1) {
			this.currSelectedItem = undefined;
		} else {
			this.focusedEnabledItem = 0;
			this.currSelectedItem = this.viewItems[0].index;
			this.codeActionList.value.setFocus([this.currSelectedItem]);
		}

		// List Focus
		this.codeActionList.value.domFocus();
		const focusTracker = dom.trackFocus(element);
		const blurListener = focusTracker.onDidBlur(() => {
			this.hideCodeActionWidget();
		});
		renderDisposables.add(blurListener);
		renderDisposables.add(focusTracker);

		// Action bar
		let actionBarWidth = 0;
		if (!params?.options.fromLightbulb) {
			const actions = inputDocumentation.map((doc): IAction => ({
				id: doc.id,
				label: doc.title,
				tooltip: doc.tooltip ?? '',
				class: undefined,
				enabled: true,
				run: () => this.commandService.executeCommand(doc.id, ...(doc.arguments ?? [])),
			}));

			if (params.options.includeDisabledActions && params.codeActions.validActions.length > 0 && params.codeActions.allActions.length !== params.codeActions.validActions.length) {
				actions.push(showDisabled ? {
					id: 'hideMoreCodeActions',
					label: localize('hideMoreCodeActions', 'Hide Disabled'),
					enabled: true,
					tooltip: '',
					class: undefined,
					run: () => this.toggleDisabledOptions(params, false)
				} : {
					id: 'showMoreCodeActions',
					label: localize('showMoreCodeActions', 'Show Disabled'),
					enabled: true,
					tooltip: '',
					class: undefined,
					run: () => this.toggleDisabledOptions(params, true)
				});
			}

			if (actions.length) {
				const actionbarContainer = dom.append(widget, dom.$('.codeActionWidget-action-bar'));
				const actionbar = renderDisposables.add(new ActionBar(actionbarContainer));
				actionbar.push(actions, { icon: false, label: true });
				actionBarWidth = actionbarContainer.offsetWidth;
			}
		}

		// For finding width dynamically (not using resize observer)
		const itemWidths: number[] = allMenuItems.map((_, index): number => {
			if (!this.codeActionList.value) {
				return 0;
			}
			const element = document.getElementById(this.codeActionList.value?.getElementID(index));
			if (element) {
				const textPadding = 10;
				const iconPadding = 10;
				return [...element.children].reduce((p, c) => p + c.clientWidth, 0) + (textPadding * 2) + iconPadding;
			}
			return 0;
		});

		// resize observer - can be used in the future since list widget supports dynamic height but not width
		const width = Math.max(...itemWidths, actionBarWidth);
		widget.style.width = width + 'px';
		this.codeActionList.value?.layout(heightWithHeaders, width);

		codeActionList.style.height = `${heightWithHeaders}px`;

		this._ctxMenuWidgetVisible.set(true);

		return renderDisposables;
	}

	/**
	 * Focuses on the previous item in the list using the list widget.
	 */
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
			this.codeActionList.value?.setFocus([item.index]);
			this.currSelectedItem = item.index;
		} while (this.focusedEnabledItem !== startIndex && !item.action.enabled);
	}

	/**
	 * Focuses on the next item in the list using the list widget.
	 */
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
			this.codeActionList.value?.setFocus([item.index]);
			this.currSelectedItem = item.index;
		} while (this.focusedEnabledItem !== startIndex && !item.action.enabled);
	}

	public onEnterSet() {
		if (typeof this.currSelectedItem === 'number') {
			this.codeActionList.value?.setSelection([this.currSelectedItem]);
		}
	}

	public hideCodeActionWidget() {
		this._ctxMenuWidgetVisible.reset();
		this.viewItems = [];
		this.focusedEnabledItem = 0;
		this.currSelectedItem = undefined;
		this._contextViewService.hideContextView();
	}

	private codeActionTelemetry(openedFromString: CodeActionTriggerSource, didCancel: boolean, CodeActions: CodeActionSet) {
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
			codeActionFrom: openedFromString,
			validCodeActions: CodeActions.validActions.length,
			cancelled: didCancel,
		});
	}

	/**
	 * Helper function to create a context view item using code action `params`.
	 */
	private showContextViewHelper(params: ICodeActionMenuParameters, menuActions: readonly CodeActionAction[], documentation: readonly Command[]) {
		this._contextViewService.showContextView({
			getAnchor: () => params.anchor,
			render: (container: HTMLElement) => this.renderCodeActionMenuList(container, menuActions, documentation, params),
			onHide: (didCancel: boolean) => {
				const openedFromString = (params.options.fromLightbulb) ? CodeActionTriggerSource.Lightbulb : params.trigger.triggerAction;
				this.codeActionTelemetry(openedFromString, didCancel, params.codeActions);
				this._visible = false;
				this._editor.focus();
			},
		},
			this._editor.getDomNode()!, false,
		);
	}

	/**
	 * Toggles whether the disabled actions in the code action widget are visible or not.
	 */
	public toggleDisabledOptions(params: ICodeActionMenuParameters, newShowDisabled: boolean): void {
		this.hideCodeActionWidget();

		showDisabled = newShowDisabled;

		const actionsToShow = showDisabled ? params.codeActions.allActions : params.codeActions.validActions;

		const menuActions = this.getMenuActions(params.trigger, actionsToShow);
		const documentationActions = this.getDocumentation(params.trigger, actionsToShow, params.codeActions.documentation);

		this.showContextViewHelper(params, menuActions, documentationActions);
	}

	public async show(trigger: CodeActionTrigger, codeActions: CodeActionSet, at: IAnchor | IPosition, options: CodeActionShowOptions): Promise<void> {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const actionsToShow = options.includeDisabledActions ? codeActions.allActions : codeActions.validActions;
		if (!actionsToShow.length) {
			this._visible = false;
			return;
		}

		if (!this._editor.getDomNode()) {
			// cancel when editor went off-dom
			this._visible = false;
			throw canceled();
		}

		this._visible = true;
		this._showingActions.value = codeActions;

		const menuActions = this.getMenuActions(trigger, actionsToShow);
		const documentationActions = this.getDocumentation(trigger, actionsToShow, codeActions.documentation);
		const anchor = Position.isIPosition(at) ? this._toCoords(at) : at;

		const params: ICodeActionMenuParameters = { options, trigger, codeActions, anchor, menuActions, documentationActions, showDisabled, visible: this._visible };
		this.showContextViewHelper(params, menuActions, documentationActions);
	}

	private getMenuActions(
		trigger: CodeActionTrigger,
		actionsToShow: readonly CodeActionItem[]
	): CodeActionAction[] {
		return actionsToShow.map(item => new CodeActionAction(item.action, () => this._delegate.onSelectCodeAction(item, trigger)));
	}

	private getDocumentation(
		trigger: CodeActionTrigger,
		actionsToShow: readonly CodeActionItem[],
		documentation: readonly Command[],
	): Command[] {
		const allDocumentation: Command[] = [...documentation];

		const model = this._editor.getModel();
		if (model && actionsToShow.length) {
			for (const provider of this._languageFeaturesService.codeActionProvider.all(model)) {
				if (provider._getAdditionalMenuItems) {
					allDocumentation.push(...provider._getAdditionalMenuItems({ trigger: trigger.type, only: trigger.filter?.include?.value }, actionsToShow.map(item => item.action)));
				}
			}
		}

		return allDocumentation;
	}

	private _toCoords(position: IPosition): { x: number; y: number } {
		if (!this._editor.hasModel()) {
			return { x: 0, y: 0 };
		}
		this._editor.revealPosition(position, ScrollType.Immediate);
		this._editor.render();

		// Translate to absolute editor position
		const cursorCoords = this._editor.getScrolledVisiblePosition(position);
		const editorCoords = dom.getDomNodePagePosition(this._editor.getDomNode());
		const x = editorCoords.left + cursorCoords.left;
		const y = editorCoords.top + cursorCoords.top + cursorCoords.height;

		return { x, y };
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
