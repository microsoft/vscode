/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IListEvent, IListRenderer } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { canceled } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, dispose, MutableDisposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./media/action';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { CodeAction, Command } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { codeActionCommandId, CodeActionItem, CodeActionSet, fixAllCommandId, organizeImportsCommandId, refactorCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionModel } from 'vs/editor/contrib/codeAction/browser/codeActionModel';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionKind, CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/browser/types';
import { ICancelEvent } from 'vs/editor/contrib/suggest/browser/suggestModel';
import { localize } from 'vs/nls';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { historyNavigationVisible } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
// import { Emitter } from 'vs/base/common/event';

// const $ = dom.$;

export const Context = {
	Visible: new RawContextKey<boolean>('codeActionMenuWidgetIsVisible', false, localize('codeActionMenuWidgetIsVisible', "Whether the Code Action Menu is visible.")),
	// HasFocusedSuggestion: new RawContextKey<boolean>('suggestWidgetHasFocusedSuggestion', false, localize('suggestWidgetHasSelection', "Whether any suggestion is focused")),
	// DetailsVisible: new RawContextKey<boolean>('suggestWidgetDetailsVisible', false, localize('suggestWidgetDetailsVisible', "Whether suggestion details are visible")),
	// MultipleSuggestions: new RawContextKey<boolean>('suggestWidgetMultipleSuggestions', false, localize('suggestWidgetMultipleSuggestions', "Whether there are multiple suggestions to pick from")),
	// MakesTextEdit: new RawContextKey<boolean>('suggestionMakesTextEdit', true, localize('suggestionMakesTextEdit', "Whether inserting the current suggestion yields in a change or has everything already been typed")),
	// AcceptSuggestionsOnEnter: new RawContextKey<boolean>('acceptSuggestionOnEnter', true, localize('acceptSuggestionOnEnter', "Whether suggestions are inserted when pressing Enter")),
	// HasInsertAndReplaceRange: new RawContextKey<boolean>('suggestionHasInsertAndReplaceRange', false, localize('suggestionHasInsertAndReplaceRange', "Whether the current suggestion has insert and replace behaviour")),
	// InsertMode: new RawContextKey<'insert' | 'replace'>('suggestionInsertMode', undefined, { type: 'string', description: localize('suggestionInsertMode', "Whether the default behaviour is to insert or replace") }),
	// CanResolve: new RawContextKey<boolean>('suggestionCanResolve', false, localize('suggestionCanResolve', "Whether the current suggestion supports to resolve further details")),
};

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
	title: string;
	detail: string;
	action: IAction;
	decoratorRight?: string;
	isSeparator?: boolean;
	isEnabled?: boolean;
	disposables?: IDisposable[];
}

export interface ICodeMenuOptions {
	useCustomDrawn?: boolean;
	ariaLabel?: string;
	ariaDescription?: string;
	minBottomMargin?: number;
	optionsAsChildren?: boolean;
}

export interface ICodeActionMenuTemplateData {
	root: HTMLElement;
	text: HTMLElement;
	detail: HTMLElement;
	decoratorRight: HTMLElement;
	disposables: IDisposable[];
}

const TEMPLATE_ID = 'test';
class CodeMenuRenderer implements IListRenderer<ICodeActionMenuItem, ICodeActionMenuTemplateData> {
	get templateId(): string { return TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): ICodeActionMenuTemplateData {
		const data: ICodeActionMenuTemplateData = Object.create(null);
		data.disposables = [];
		data.root = container;
		data.text = document.createElement('span');
		// data.detail = document.createElement('');
		// data.decoratorRight = document.createElement('');
		container.append(data.text);
		// container.append(data.detail);

		// data.text = dom.append(container, $('span'));
		// data.detail = dom.append(container, $('span'));
		// data.decoratorRight = dom.append(container, $('span'));

		return data;
	}
	renderElement(element: ICodeActionMenuItem, index: number, templateData: ICodeActionMenuTemplateData): void {
		const data: ICodeActionMenuTemplateData = templateData;

		const text = element.title;
		const detail = element.detail;

		const isEnabled = element.isEnabled;
		const isSeparator = element.isSeparator;

		data.text.textContent = text;
		// data.detail.textContent = detail;
		// data.decoratorRight.innerText = '';

		if (!isEnabled) {
			data.root.classList.add('option-disabled');
			data.root.style.backgroundColor = 'transparent !important';
			data.root.style.color = 'rgb(204, 204, 204, 0.5)';
			data.root.style.cursor = 'default';
		} else {
			data.root.classList.remove('option-disabled');
		}

		if (isSeparator) {
			data.root.classList.add('separator');
			data.root.style.height = '10px';
		}

	}
	disposeTemplate(templateData: ICodeActionMenuTemplateData): void {
		templateData.disposables = dispose(templateData.disposables);
	}

	// disposeElement(elementData: ICodeActionMenuItem) {
	// 	elementData.dispoables = dispose(elementData.disposables);
	// }

}

interface ISelectedCodeAction {
	action: CodeActionAction;
	index: number;
	model: CodeActionModel;
}


export class CodeActionMenu extends Disposable {

	private codeActionList!: List<ICodeActionMenuItem>;
	private options: ICodeActionMenuItem[] = [];
	private _visible: boolean = false;
	private readonly _showingActions = this._register(new MutableDisposable<CodeActionSet>());
	private readonly _disposables = new DisposableStore();
	private readonly _onDidSelect = new Emitter<ISelectedCodeAction>();
	private readonly _onDidHideContextMenu = new Emitter<void>();
	// private readonly _onDidCancel = new Emitter<ICancelEvent>();
	readonly onDidHideContextMenu = this._onDidHideContextMenu.event;
	private readonly _ctxMenuWidgetIsFocused?: IContextKey<boolean>;
	private readonly _ctxMenuWidgetVisible: IContextKey<boolean>;
	private element!: HTMLElement;


	// private _onDidCancel = this._register(new Emitter<void>({ onFirstListenerAdd: () => this.cancelHasListener = true }));
	// readonly onDidCancel = this._onDidCancel.event;

	// readonly onDidSelect: Event<ISelectedCodeAction> = this._onDidSelect.event;

	private readonly _keybindingResolver: CodeActionKeybindingResolver;
	listRenderer: any;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _delegate: CodeActionWidgetDelegate,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IThemeService _themeService: IThemeService,
	) {
		super();

		this._keybindingResolver = new CodeActionKeybindingResolver({
			getKeybindings: () => keybindingService.getKeybindings()
		});

		this._ctxMenuWidgetVisible = Context.Visible.bindTo(_contextKeyService);

		if (this.codeActionList && !this.codeActionList.isDOMFocused()) {
			this.dispose();
		}

		// this._register(onSelectDropDownKeyDown.filter(e => e.keyCode === KeyCode.Escape).on(e => this.onEscape(e), this));

		// this.onDidCancel(() => this._contextViewService.hideContextView(true));

	}

	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;



	get isVisible(): boolean {
		return this._visible;
	}

	private _onListSelection(e: IListEvent<ICodeActionMenuItem>): void {
		if (e.elements.length) {
			e.elements.forEach(element => {
				if (element.isEnabled) {
					const itemAction = element;
					console.log(itemAction);
					element.action.run();
				}
			});
			this.dispose();
		}
	}

	private _onListFocus(e: IListEvent<ICodeActionMenuItem>): void {

		this._ctxMenuWidgetIsFocused?.set(true);
		const item = e.elements[0];
		const index = e.indexes[0];

	}

	// private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
	// 	if (this.codeActionList.getDOMNode().contains(mouseEvent.target.element)) {
	// 		// Clicking inside details
	// 		this.element.click();
	// 		this.element.onmouseleave = () => this.element.classList.remove('pointer');
	// 		this._details.widget.domNode.focus();
	// 	} else {
	// 		// Clicking outside details and inside suggest
	// 		if (this.element.domNode.contains(mouseEvent.target.element)) {
	// 			this.editor.focus();
	// 		}
	// 	}
	// }

	private renderCodeActionMenuList(element: HTMLElement, inputArray: IAction[]): IDisposable {
		const renderDisposables = new DisposableStore();
		const renderMenu = document.createElement('div');
		this.element = element;

		// Menu.initializeOrUpdateStyleSheet(renderMenu, {});

		// renderMenu.style.backgroundColor = 'rgb(48, 48, 49)';
		// renderMenu.style.border = '1px black';
		// renderMenu.style.borderRadius = '5px';
		// renderMenu.style.color = 'rgb(204, 204, 204)';
		// renderMenu.style.boxShadow = 'rgb(0,0,0,0.36) 0px 2px 8px';
		// renderMenu.style.width = '350px';

		this.listRenderer = new CodeMenuRenderer();

		const height = inputArray.length * 25;
		renderMenu.style.height = String(height) + 'px';


		renderMenu.id = 'testMenu';
		renderMenu.classList.add('testMenu');

		element.appendChild(renderMenu);

		this.codeActionList = new List('test', renderMenu, {
			getHeight(element) {
				return 25;
			},
			getTemplateId(element) {
				return 'test';
			}
		}, [this.listRenderer],
		);

		if (this.codeActionList) {
			renderDisposables.add(this.codeActionList.onDidChangeSelection(e => this._onListSelection(e)));
			renderDisposables.add(this.codeActionList.onDidChangeFocus(e => this._onListFocus(e)));
		}

		inputArray.forEach((item, index) => {
			this.options.push(<ICodeActionMenuItem>{ title: item.label, detail: item.tooltip, action: inputArray[index], isEnabled: item.enabled, isSeparator: item.class === 'separator' });
		});

		this.codeActionList.splice(0, this.codeActionList.length, this.options);
		this.codeActionList.layout(height);
		this.codeActionList.domFocus();
		this.codeActionList.getHTMLElement().style.border = 'none !important';

		const focusTracker = dom.trackFocus(element);
		const blurListener = focusTracker.onDidBlur(() => {
			this.dispose();
			this._contextViewService.hideContextView({ source: this });
		});

		renderDisposables.add(blurListener);
		renderDisposables.add(focusTracker);

		this._ctxMenuWidgetVisible.set(true);
		return renderDisposables;

	}

	override dispose() {
		this._ctxMenuWidgetVisible.reset();
		this.codeActionList.dispose();
		this.options = [];
		this._contextViewService.hideContextView();
		this._disposables.dispose();
	}

	public async show(trigger: CodeActionTrigger, codeActions: CodeActionSet, at: IAnchor | IPosition, options: CodeActionShowOptions): Promise<void> {
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

		const menuActions = this.getMenuActions(trigger, actionsToShow, codeActions.documentation);

		const anchor = Position.isIPosition(at) ? this._toCoords(at) : at || { x: 0, y: 0 };

		const resolver = this._keybindingResolver.getResolver();

		const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM);

		this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: (container: HTMLElement) => this.renderCodeActionMenuList(container, menuActions),
			onHide: (didCancel) => {
				console.log(didCancel);
				this._visible = false;
				this._editor.focus();

				// TODO: Telemetry to be added
			},
		},
			//this._editor.getDomNode(), if we use shadow dom ( + shadow dom param)
		);


		// this._contextMenuService.showContextMenu({
		// 	domForShadowRoot: useShadowDOM ? this._editor.getDomNode()! : undefined,
		// 	getAnchor: () => anchor,
		// 	getActions: () => menuActions,
		// 	onHide: (didCancel) => {
		// 		const openedFromString = (options.fromLightbulb) ? CodeActionTriggerSource.Lightbulb : trigger.triggerAction;

		// 		type ApplyCodeActionEvent = {
		// 			codeActionFrom: CodeActionTriggerSource;
		// 			validCodeActions: number;
		// 			cancelled: boolean;
		// 		};

		// 		type ApplyCodeEventClassification = {
		// 			codeActionFrom: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of action used to opened the code action.' };
		// 			validCodeActions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The total number of valid actions that are highlighted and can be used.' };
		// 			cancelled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The indicator if the menu was selected or cancelled.' };
		// 			owner: 'mjbvz';
		// 			comment: 'Event used to gain insights into how code actions are being triggered';
		// 		};

		// 		this._telemetryService.publicLog2<ApplyCodeActionEvent, ApplyCodeEventClassification>('codeAction.applyCodeAction', {
		// 			codeActionFrom: openedFromString,
		// 			validCodeActions: codeActions.validActions.length,
		// 			cancelled: didCancel,

		// 		});

		// 		this._visible = false;
		// 		this._editor.focus();
		// 	},
		// 	autoSelectFirstItem: true,
		// 	getKeyBinding: action => action instanceof CodeActionAction ? resolver(action.action) : undefined,
		// });
	}

	/**
	 *
	 * Comments about menu:
	 *
	 * flyout might be too big, not used anywhere else
	 *
	 * making the editor editable
	 *
	 * better view in the refactor preview pane
	 *
	 * should we be showing all the refactor options? should we only show options that are valid, like in the
	 * lightbulb action
	 *
	 *
	 */

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

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'codeActionMenu.selectEditor',
	weight: KeybindingWeight.WorkbenchContrib + 1,
	primary: KeyCode.Escape,
	when: ContextKeyExpr.and(Context.Visible),
	handler(accessor) {
		console.log('hello hi');
	}
});

