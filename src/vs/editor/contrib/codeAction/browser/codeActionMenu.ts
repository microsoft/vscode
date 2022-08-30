/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IListEvent, IListMouseEvent, IListRenderer } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { canceled } from 'vs/base/common/errors';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, MutableDisposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./media/action';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { CodeAction, Command } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { codeActionCommandId, CodeActionItem, CodeActionSet, fixAllCommandId, organizeImportsCommandId, refactorCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionKind, CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/browser/types';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import 'vs/base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import 'vs/editor/contrib/symbolIcons/browser/symbolIcons'; // The codicon symbol colors are defined here and must be loaded to get colors
import { Codicon } from 'vs/base/common/codicons';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';

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
export interface ICodeActionMenuItem {
	action: IAction;
	isSeparator: boolean;
	isEnabled: boolean;
	isDocumentation: boolean;
	isHeader: boolean;
	headerTitle: string;
	index: number;
	disposables?: IDisposable[];
	params: ICodeActionMenuParameters;
}

export interface ICodeActionMenuParameters {
	options: CodeActionShowOptions;
	trigger: CodeActionTrigger;
	anchor: { x: number; y: number };
	menuActions: IAction[];
	codeActions: CodeActionSet;
	visible: boolean;
	showDisabled: boolean;
	menuObj: CodeActionMenu;

}

export interface ICodeMenuOptions {
	useCustomDrawn?: boolean;
	ariaLabel?: string;
	ariaDescription?: string;
	minBottomMargin?: number;
	optionsAsChildren?: boolean;
}

interface ICodeActionMenuTemplateData {
	readonly root: HTMLElement;
	readonly text: HTMLElement;
	readonly disposables: DisposableStore;
	readonly icon: HTMLElement;
}

enum TemplateIds {
	Header = 'header',
	Separator = 'separator',
	Base = 'base',
}

const codeActionLineHeight = 24;
const headerLineHeight = 26;

// TODO: Take a look at user storage for this so it is preserved across windows and on reload.
let showDisabled = false;

class CodeActionItemRenderer implements IListRenderer<ICodeActionMenuItem, ICodeActionMenuTemplateData> {
	constructor(
		private readonly acceptKeybindings: [string, string],
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) { }

	get templateId(): string { return TemplateIds.Base; }

	renderTemplate(container: HTMLElement): ICodeActionMenuTemplateData {
		const iconContainer = document.createElement('div');
		iconContainer.className = 'icon-container';
		container.append(iconContainer);

		const icon = document.createElement('div');
		iconContainer.append(icon);

		const text = document.createElement('span');
		container.append(text);

		return {
			root: container,
			icon,
			text,
			disposables: new DisposableStore(),
		};
	}

	renderElement(element: ICodeActionMenuItem, index: number, templateData: ICodeActionMenuTemplateData): void {
		const data: ICodeActionMenuTemplateData = templateData;

		const text = element.action.label;
		element.isEnabled = element.action.enabled;

		if (element.action instanceof CodeActionAction) {
			const openedFromString = (element.params?.options.fromLightbulb) ? CodeActionTriggerSource.Lightbulb : element.params?.trigger.triggerAction;

			// Check documentation type
			element.isDocumentation = element.action.action.kind === CodeActionMenu.documentationID;

			if (element.isDocumentation) {
				element.isEnabled = false;
				data.root.classList.add('documentation');

				const container = data.root;

				const actionbarContainer = dom.append(container, dom.$('.codeActionWidget-action-bar'));

				const reRenderAction = showDisabled ?
					<IAction>{
						id: 'hideMoreCodeActions',
						label: localize('hideMoreCodeActions', 'Hide Disabled'),
						enabled: true,
						run: () => CodeActionMenu.toggleDisabledOptions(element.params)
					} :
					<IAction>{
						id: 'showMoreCodeActions',
						label: localize('showMoreCodeActions', 'Show Disabled'),
						enabled: true,
						run: () => CodeActionMenu.toggleDisabledOptions(element.params)
					};

				const actionbar = new ActionBar(actionbarContainer);
				data.disposables.add(actionbar);

				if (openedFromString === CodeActionTriggerSource.Refactor && (element.params.codeActions.validActions.length > 0 || element.params.codeActions.allActions.length === element.params.codeActions.validActions.length)) {
					actionbar.push([element.action, reRenderAction], { icon: false, label: true });
				} else {
					actionbar.push([element.action], { icon: false, label: true });
				}
			} else {
				data.text.textContent = text;

				// Icons and Label modifaction based on group
				const group = element.action.action.kind;
				if (CodeActionKind.SurroundWith.contains(new CodeActionKind(String(group)))) {
					data.icon.className = Codicon.symbolArray.classNames;
				} else if (CodeActionKind.Extract.contains(new CodeActionKind(String(group)))) {
					data.icon.className = Codicon.wrench.classNames;
				} else if (CodeActionKind.Convert.contains(new CodeActionKind(String(group)))) {
					data.icon.className = Codicon.zap.classNames;
					data.icon.style.color = `var(--vscode-editorLightBulbAutoFix-foreground)`;
				} else if (CodeActionKind.QuickFix.contains(new CodeActionKind(String(group)))) {
					data.icon.className = Codicon.lightBulb.classNames;
					data.icon.style.color = `var(--vscode-editorLightBulb-foreground)`;
				} else {
					data.icon.className = Codicon.lightBulb.classNames;
					data.icon.style.color = `var(--vscode-editorLightBulb-foreground)`;
				}

				// Check if action has disabled reason
				if (element.action.action.disabled) {
					data.root.title = element.action.action.disabled;
				} else {
					const updateLabel = () => {
						const [accept, preview] = this.acceptKeybindings;

						data.root.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", this.keybindingService.lookupKeybinding(accept)?.getLabel(), this.keybindingService.lookupKeybinding(preview)?.getLabel());

					};
					updateLabel();
				}
			}
		}

		if (!element.isEnabled) {
			data.root.classList.add('option-disabled');
			data.root.style.backgroundColor = 'transparent !important';
			data.icon.style.opacity = '0.4';
		} else {
			data.root.classList.remove('option-disabled');
		}
	}

	disposeTemplate(templateData: ICodeActionMenuTemplateData): void {
		templateData.disposables.dispose();
	}
}


interface HeaderTemplateData {
	readonly root: HTMLElement;
	readonly text: HTMLElement;
}

class HeaderRenderer implements IListRenderer<ICodeActionMenuItem, HeaderTemplateData> {

	get templateId(): string { return TemplateIds.Header; }

	renderTemplate(container: HTMLElement): HeaderTemplateData {
		container.classList.add('group-header', 'option-disabled');

		const text = document.createElement('span');
		container.append(text);

		return {
			root: container,
			text,
		};
	}

	renderElement(element: ICodeActionMenuItem, _index: number, templateData: HeaderTemplateData): void {
		templateData.text.textContent = element.headerTitle;
		element.isEnabled = false;
	}

	disposeTemplate(_templateData: HeaderTemplateData): void {
		// noop
	}
}

class SeparatorRenderer implements IListRenderer<ICodeActionMenuItem, void> {

	get templateId(): string { return TemplateIds.Separator; }

	renderTemplate(container: HTMLElement): void {
		container.classList.add('separator');
		container.style.height = '10px';
	}

	renderElement(_element: ICodeActionMenuItem, _index: number, _templateData: void): void {
		// noop
	}

	disposeTemplate(_templateData: void): void {
		// noop
	}
}

export class CodeActionMenu extends Disposable implements IEditorContribution {
	private readonly _showingActions = this._register(new MutableDisposable<CodeActionSet>());
	private codeActionList = this._register(new MutableDisposable<List<ICodeActionMenuItem>>());
	private options: ICodeActionMenuItem[] = [];
	private _visible: boolean = false;
	private _ctxMenuWidgetVisible: IContextKey<boolean>;
	private viewItems: ICodeActionMenuItem[] = [];
	private focusedEnabledItem: number | undefined;
	private currSelectedItem: number | undefined;
	private hasSeparator: boolean = false;
	private block?: HTMLElement;
	private pointerBlock?: HTMLElement;

	public static readonly documentationID: string = '_documentation';

	public static readonly ID: string = 'editor.contrib.codeActionMenu';

	public static get(editor: ICodeEditor): CodeActionMenu | null {
		return editor.getContribution<CodeActionMenu>(CodeActionMenu.ID);
	}

	private readonly _keybindingResolver: CodeActionKeybindingResolver;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _delegate: CodeActionWidgetDelegate,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IThemeService _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this._keybindingResolver = new CodeActionKeybindingResolver({
			getKeybindings: () => keybindingService.getKeybindings()
		});

		this._ctxMenuWidgetVisible = Context.Visible.bindTo(this._contextKeyService);
	}

	get isVisible(): boolean {
		return this._visible;
	}

	/**
	 * Checks if the settings have enabled the new code action widget.
	 */
	private isCodeActionWidgetEnabled(model: ITextModel): boolean {
		return this._configurationService.getValue('editor.useCustomCodeActionMenu', {
			resource: model.uri
		});
	}

	/**
	* Checks if the setting has disabled/enabled headers in the code action widget.
	*/
	private isCodeActionWidgetHeadersShown(model: ITextModel): boolean {
		return this._configurationService.getValue('editor.customCodeActionMenu.showHeaders', {
			resource: model.uri
		});
	}

	private _onListSelection(e: IListEvent<ICodeActionMenuItem>): void {
		if (e.elements.length) {
			e.elements.forEach(element => {
				if (element.isEnabled) {
					element.action.run();
					this.hideCodeActionWidget();
				}
			});
		}
	}

	private _onListHover(e: IListMouseEvent<ICodeActionMenuItem>): void {
		if (!e.element) {
			this.currSelectedItem = undefined;
			this.codeActionList.value?.setFocus([]);
		} else {
			if (e.element?.isEnabled) {
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
		if (e.element) {
			if (!e.element.isEnabled) {
				this.currSelectedItem = undefined;
				this.codeActionList.value?.setFocus([]);
			}
		}
	}

	/**
	 * Renders the code action widget given the provided actions.
	 */
	private renderCodeActionMenuList(element: HTMLElement, inputArray: IAction[], params: ICodeActionMenuParameters): IDisposable {
		const renderDisposables = new DisposableStore();
		const renderMenu = document.createElement('div');

		// Render invisible div to block mouse interaction in the rest of the UI
		const menuBlock = document.createElement('div');
		this.block = element.appendChild(menuBlock);
		this.block.classList.add('context-view-block');
		this.block.style.position = 'fixed';
		this.block.style.cursor = 'initial';
		this.block.style.left = '0';
		this.block.style.top = '0';
		this.block.style.width = '100%';
		this.block.style.height = '100%';
		this.block.style.zIndex = '-1';

		renderDisposables.add(dom.addDisposableListener(this.block, dom.EventType.MOUSE_DOWN, e => e.stopPropagation()));

		renderMenu.id = 'codeActionMenuWidget';
		renderMenu.classList.add('codeActionMenuWidget');

		element.appendChild(renderMenu);

		this.codeActionList.value = new List('codeActionWidget', renderMenu, {
			getHeight(element) {
				if (element.isSeparator) {
					return 10;
				} else if (element.isHeader) {
					return headerLineHeight;
				} else {
					return codeActionLineHeight;
				}
			},
			getTemplateId(element) {
				if (element.isHeader) {
					return TemplateIds.Header;
				} else if (element.isSeparator) {
					return TemplateIds.Separator;
				} else {
					return TemplateIds.Base;
				}
			}
		}, [
			new CodeActionItemRenderer([acceptSelectedCodeActionCommand, previewSelectedCodeActionCommand], this.keybindingService),
			new HeaderRenderer(),
			new SeparatorRenderer(),
		], {
			keyboardSupport: false,
			accessibilityProvider: {
				getAriaLabel: element => {
					if (element.action instanceof CodeActionAction) {
						let label = element.action.label;
						if (!element.action.enabled) {
							if (element.action instanceof CodeActionAction) {
								label = localize({ key: 'customCodeActionWidget.labels', comment: ['Code action labels for accessibility.'] }, "{0}, Disabled Reason: {1}", label, element.action.action.disabled);
							}
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
		this.pointerBlock = element.appendChild(pointerBlockDiv);
		this.pointerBlock.classList.add('context-view-pointerBlock');
		this.pointerBlock.style.position = 'fixed';
		this.pointerBlock.style.cursor = 'initial';
		this.pointerBlock.style.left = '0';
		this.pointerBlock.style.top = '0';
		this.pointerBlock.style.width = '100%';
		this.pointerBlock.style.height = '100%';
		this.pointerBlock.style.zIndex = '2';

		// Removes block on click INSIDE widget or ANY mouse movement
		renderDisposables.add(dom.addDisposableListener(this.pointerBlock, dom.EventType.POINTER_MOVE, () => this.pointerBlock?.remove()));
		renderDisposables.add(dom.addDisposableListener(this.pointerBlock, dom.EventType.MOUSE_DOWN, () => this.pointerBlock?.remove()));

		renderDisposables.add(this.codeActionList.value.onMouseClick(e => this._onListClick(e)));
		renderDisposables.add(this.codeActionList.value.onMouseOver(e => this._onListHover(e)));
		renderDisposables.add(this.codeActionList.value.onDidChangeFocus(() => this.codeActionList.value?.domFocus()));
		renderDisposables.add(this.codeActionList.value.onDidChangeSelection(e => this._onListSelection(e)));
		renderDisposables.add(this._editor.onDidLayoutChange(() => this.hideCodeActionWidget()));

		const model = this._editor.getModel();

		if (!model) {
			return renderDisposables;
		}

		let numHeaders = 0;
		const totalActionEntries: (IAction | string)[] = [];

		// Checks if headers are disabled.
		if (!this.isCodeActionWidgetHeadersShown(model)) {
			totalActionEntries.push(...inputArray);

		} else {
			// Filters and groups code actions by their group
			const menuEntries: IAction[][] = [];

			// Code Action Groups
			const quickfixGroup: IAction[] = [];
			const extractGroup: IAction[] = [];
			const convertGroup: IAction[] = [];
			const surroundGroup: IAction[] = [];
			const sourceGroup: IAction[] = [];
			const separatorGroup: IAction[] = [];
			const documentationGroup: IAction[] = [];
			const otherGroup: IAction[] = [];

			inputArray.forEach((item) => {
				if (item instanceof CodeActionAction) {
					const optionKind = item.action.kind;

					if (CodeActionKind.SurroundWith.contains(new CodeActionKind(String(optionKind)))) {
						surroundGroup.push(item);
					} else if (CodeActionKind.QuickFix.contains(new CodeActionKind(String(optionKind)))) {
						quickfixGroup.push(item);
					} else if (CodeActionKind.Extract.contains(new CodeActionKind(String(optionKind)))) {
						extractGroup.push(item);
					} else if (CodeActionKind.Convert.contains(new CodeActionKind(String(optionKind)))) {
						convertGroup.push(item);
					} else if (CodeActionKind.Source.contains(new CodeActionKind(String(optionKind)))) {
						sourceGroup.push(item);
					} else if (optionKind === CodeActionMenu.documentationID) {
						documentationGroup.push(item);
					} else {
						// Pushes all the other actions to the "Other" group
						otherGroup.push(item);
					}

				} else if (item.id === `vs.actions.separator`) {
					separatorGroup.push(item);
				}
			});

			menuEntries.push(quickfixGroup, extractGroup, convertGroup, surroundGroup, sourceGroup, otherGroup, separatorGroup, documentationGroup);

			const menuEntriesToPush = (menuID: string, entry: IAction[]) => {
				totalActionEntries.push(menuID);
				totalActionEntries.push(...entry);
				numHeaders++;
			};
			// Creates flat list of all menu entries with headers as separators
			menuEntries.forEach(entry => {
				if (entry.length > 0 && entry[0] instanceof CodeActionAction) {
					const firstAction = entry[0].action.kind;
					if (CodeActionKind.SurroundWith.contains(new CodeActionKind(String(firstAction)))) {
						menuEntriesToPush(localize('codeAction.widget.id.surround', 'Surround With...'), entry);
					} else if (CodeActionKind.QuickFix.contains(new CodeActionKind(String(firstAction)))) {
						menuEntriesToPush(localize('codeAction.widget.id.quickfix', 'Quick Fix...'), entry);
					} else if (CodeActionKind.Extract.contains(new CodeActionKind(String(firstAction)))) {
						menuEntriesToPush(localize('codeAction.widget.id.extract', 'Extract...'), entry);
					} else if (CodeActionKind.Convert.contains(new CodeActionKind(String(firstAction)))) {
						menuEntriesToPush(localize('codeAction.widget.id.convert', 'Convert...'), entry);
					} else if (CodeActionKind.Source.contains(new CodeActionKind(String(firstAction)))) {
						menuEntriesToPush(localize('codeAction.widget.id.source', 'Source Action...'), entry);

					} else if (firstAction === CodeActionMenu.documentationID) {
						totalActionEntries.push(...entry);
					} else {
						// Takes and flattens all the `other` actions
						menuEntriesToPush(localize('codeAction.widget.id.more', 'More Actions...'), entry);
					}
				} else {
					// case for separator - separators are not codeActionAction typed
					totalActionEntries.push(...entry);
				}

			});

		}

		// Populating the list widget and tracking enabled options.
		totalActionEntries.forEach((item, index) => {
			if (typeof item === `string`) {
				const menuItem = <ICodeActionMenuItem>{ isEnabled: false, isSeparator: false, index, isHeader: true, headerTitle: item };
				this.options.push(menuItem);
			} else {
				const currIsSeparator = item.class === 'separator';

				if (currIsSeparator) {
					// set to true forever because there is a separator
					this.hasSeparator = true;
				}

				const menuItem = <ICodeActionMenuItem>{ action: item, isEnabled: item.enabled, isSeparator: currIsSeparator, index, params };
				if (item.enabled) {
					this.viewItems.push(menuItem);
				}
				this.options.push(menuItem);
			}
		});

		this.codeActionList.value.splice(0, this.codeActionList.value.length, this.options);

		// Updating list height, depending on how many separators and headers there are.
		const height = this.hasSeparator ? (totalActionEntries.length - 1) * codeActionLineHeight + 10 : totalActionEntries.length * codeActionLineHeight;
		const heightWithHeaders = height + numHeaders * headerLineHeight - numHeaders * codeActionLineHeight;
		renderMenu.style.height = String(heightWithHeaders) + 'px';
		this.codeActionList.value.layout(heightWithHeaders);

		// For finding width dynamically (not using resize observer)
		const arr: number[] = [];
		this.options.forEach((item, index) => {
			if (!this.codeActionList.value) {
				return;
			}
			const element = document.getElementById(this.codeActionList.value?.getElementID(index))?.querySelector('span')?.offsetWidth;
			arr.push(element ?? 0);
		});

		// resize observer - can be used in the future since list widget supports dynamic height but not width
		let maxWidth = Math.max(...arr);

		// If there are no actions, the minimum width is the width of the list widget's action bar.
		if (params.trigger.triggerAction === CodeActionTriggerSource.Refactor && maxWidth < 230) {
			maxWidth = 230;
		}

		// 52 is the additional padding for the list widget (26 left, 26 right)
		renderMenu.style.width = maxWidth + 52 + 5 + 'px';
		this.codeActionList.value?.layout(heightWithHeaders, maxWidth);

		// List selection
		if (this.viewItems.length < 1 || this.viewItems.every(item => item.isDocumentation)) {
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
		this._ctxMenuWidgetVisible.set(true);

		return renderDisposables;
	}

	/**
	 * Focuses on the previous item in the list using the list widget.
	 */
	protected focusPrevious() {
		if (typeof this.focusedEnabledItem === 'undefined') {
			this.focusedEnabledItem = this.viewItems[0].index;
		} else if (this.viewItems.length < 1) {
			return false;
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
		} while (this.focusedEnabledItem !== startIndex && ((!item.isEnabled) || item.action.id === Separator.ID));

		return true;
	}

	/**
	 * Focuses on the next item in the list using the list widget.
	 */
	protected focusNext() {
		if (typeof this.focusedEnabledItem === 'undefined') {
			this.focusedEnabledItem = this.viewItems.length - 1;
		} else if (this.viewItems.length < 1) {
			return false;
		}

		const startIndex = this.focusedEnabledItem;
		let item: ICodeActionMenuItem;

		do {
			this.focusedEnabledItem = (this.focusedEnabledItem + 1) % this.viewItems.length;
			item = this.viewItems[this.focusedEnabledItem];
			this.codeActionList.value?.setFocus([item.index]);
			this.currSelectedItem = item.index;
		} while (this.focusedEnabledItem !== startIndex && ((!item.isEnabled) || item.action.id === Separator.ID));

		return true;
	}

	public navigateListWithKeysUp() {
		this.focusPrevious();
	}

	public navigateListWithKeysDown() {
		this.focusNext();
	}

	public onEnterSet() {
		if (typeof this.currSelectedItem === 'number') {
			this.codeActionList.value?.setSelection([this.currSelectedItem]);
		}
	}

	override dispose() {
		super.dispose();
	}

	hideCodeActionWidget() {
		this._ctxMenuWidgetVisible.reset();
		this.options = [];
		this.viewItems = [];
		this.focusedEnabledItem = 0;
		this.currSelectedItem = undefined;
		this.hasSeparator = false;
		this._contextViewService.hideContextView();
	}

	codeActionTelemetry(openedFromString: CodeActionTriggerSource, didCancel: boolean, CodeActions: CodeActionSet) {
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
	private showContextViewHelper(params: ICodeActionMenuParameters, menuActions: IAction[]) {
		this._contextViewService.showContextView({
			getAnchor: () => params.anchor,
			render: (container: HTMLElement) => this.renderCodeActionMenuList(container, menuActions, params),
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
	public static toggleDisabledOptions(params: ICodeActionMenuParameters): void {
		params.menuObj.hideCodeActionWidget();

		showDisabled = !showDisabled;

		const actionsToShow = showDisabled ? params.codeActions.allActions : params.codeActions.validActions;

		const menuActions = params.menuObj.getMenuActions(params.trigger, actionsToShow, params.codeActions.documentation);

		params.menuObj.showContextViewHelper(params, menuActions);
	}

	public async show(trigger: CodeActionTrigger, codeActions: CodeActionSet, at: IAnchor | IPosition, options: CodeActionShowOptions): Promise<void> {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		let actionsToShow = options.includeDisabledActions ? codeActions.allActions : codeActions.validActions;

		// If there are no refactorings, we should still show the menu and only displayed disabled actions without `enable` button.
		if (trigger.triggerAction === CodeActionTriggerSource.Refactor && codeActions.validActions.length > 0) {
			actionsToShow = showDisabled ? codeActions.allActions : codeActions.validActions;
		}

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

		const menuActions = this.getMenuActions(trigger, actionsToShow, codeActions.documentation);

		const anchor = Position.isIPosition(at) ? this._toCoords(at) : at || { x: 0, y: 0 };

		const params = <ICodeActionMenuParameters>{ options, trigger, codeActions, anchor, menuActions, showDisabled: true, visible: this._visible, menuObj: this };
		const resolver = this._keybindingResolver.getResolver();

		const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM);


		if (this.isCodeActionWidgetEnabled(model)) {
			this.showContextViewHelper(params, menuActions);
		} else {
			this._contextMenuService.showContextMenu({
				domForShadowRoot: useShadowDOM ? this._editor.getDomNode()! : undefined,
				getAnchor: () => anchor,
				getActions: () => menuActions,
				onHide: (didCancel) => {
					const openedFromString = (options.fromLightbulb) ? CodeActionTriggerSource.Lightbulb : trigger.triggerAction;
					this.codeActionTelemetry(openedFromString, didCancel, codeActions);
					this._visible = false;
					this._editor.focus();
				},
				autoSelectFirstItem: true,
				getKeyBinding: action => action instanceof CodeActionAction ? resolver(action.action) : undefined,
			});
		}
	}

	private getMenuActions(
		trigger: CodeActionTrigger,
		actionsToShow: readonly CodeActionItem[],
		documentation: readonly Command[]
	): IAction[] {
		const toCodeActionAction = (item: CodeActionItem): CodeActionAction => new CodeActionAction(item.action, () => this._delegate.onSelectCodeAction(item, trigger));
		const result: IAction[] = actionsToShow
			.map(toCodeActionAction);

		const allDocumentation: Command[] = [...documentation];

		const model = this._editor.getModel();
		if (model && result.length) {
			for (const provider of this._languageFeaturesService.codeActionProvider.all(model)) {
				if (provider._getAdditionalMenuItems) {
					allDocumentation.push(...provider._getAdditionalMenuItems({ trigger: trigger.type, only: trigger.filter?.include?.value }, actionsToShow.map(item => item.action)));
				}
			}
		}

		if (allDocumentation.length) {
			result.push(new Separator(), ...allDocumentation.map(command => toCodeActionAction(new CodeActionItem({
				title: command.title,
				command: command,
				kind: CodeActionMenu.documentationID
			}, undefined))));
		}

		return result;
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
