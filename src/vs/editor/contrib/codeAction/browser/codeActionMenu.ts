/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as dom from 'vs/base/browser/dom';
import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { IAnchor, IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IListEvent, IListRenderer } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { canceled } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, dispose, MutableDisposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { CodeAction, Command } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { codeActionCommandId, CodeActionItem, CodeActionSet, fixAllCommandId, organizeImportsCommandId, refactorCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionModel } from 'vs/editor/contrib/codeAction/browser/codeActionModel';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionKind, CodeActionTrigger, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/browser/types';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
// import { Emitter } from 'vs/base/common/event';

// const $ = dom.$;


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
	isDisabled?: boolean;
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

// export interface ICodeMenuData {
// 	selected: string;
// 	index: number;
// }

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

		const isDisabled = element.isDisabled;

		data.text.textContent = text;
		// data.detail.textContent = detail;
		// data.decoratorRight.innerText = '';

		if (!isDisabled) {
			data.root.classList.add('option-disabled');
			data.root.style.backgroundColor = 'transparent !important';
			data.root.style.color = 'rgb(204, 204, 204, 0.5)';
			data.root.style.cursor = 'default';
		} else {
			data.root.classList.remove('option-disabled');
		}

	}
	disposeTemplate(templateData: ICodeActionMenuTemplateData): void {
		templateData.disposables = dispose(templateData.disposables);
	}

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
	readonly onDidHideContextMenu = this._onDidHideContextMenu.event;

	readonly onDidSelect: Event<ISelectedCodeAction> = this._onDidSelect.event;

	private readonly _keybindingResolver: CodeActionKeybindingResolver;
	listRenderer: any;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _delegate: CodeActionWidgetDelegate,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IThemeService _themeService: IThemeService,
	) {
		super();

		this._keybindingResolver = new CodeActionKeybindingResolver({
			getKeybindings: () => keybindingService.getKeybindings()
		});

	}
	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;

	get isVisible(): boolean {
		return this._visible;
	}

	private _onListSelection(e: IListEvent<ICodeActionMenuItem>): void {
		if (e.elements.length) {
			e.elements.forEach(element => {
				if (element.isDisabled) {
					const itemAction = element;
					console.log(itemAction);
					element.action.run();
				}
				// const toCodeActionAction = (item: CodeActionItem): CodeActionAction => new CodeActionAction(itemAction, () => this._delegate.onSelectCodeAction(item, this.listTrigger));
				// console.log(toCodeActionAction);
			});
			// this.codeActionList.dispose();
			// this._editor.removeContentWidget(this);
			// this._editor.getDomNode()?.removeChild(this.parent);
			this.codeActionList.dispose();
			this._contextViewService.hideContextView();
			this.options = [];

			// this.parent.dispose();
		}
	}


	private setCodeActionMenuList() {
		this.codeActionList?.splice(0, this.codeActionList.length, this.options);
	}

	private createOption(value: string, index: number, disabled?: boolean): HTMLOptionElement {
		const option = document.createElement('option');
		option.value = value;
		option.text = value;
		option.disabled = !!disabled;

		return option;
	}

	private renderCodeActionMenuList(element: HTMLElement, inputArray: IAction[]): IDisposable {
		// if (this.codeActionList) {
		// 	return;
		// }

		const renderDisposables = new DisposableStore();

		const renderMenu = document.createElement('div');
		renderMenu.style.backgroundColor = 'rgb(48, 48, 49)';
		renderMenu.style.border = '1px black';
		renderMenu.style.borderRadius = '5px';
		renderMenu.style.color = 'rgb(204, 204, 204)';
		renderMenu.style.boxShadow = 'rgb(0,0,0,0.36) 0px 2px 8px';
		renderMenu.style.width = '350px';
		renderMenu.style.height = '200px';
		renderMenu.id = 'testRedSquare';

		element.appendChild(renderMenu);

		this.listRenderer = new CodeMenuRenderer();

		this.codeActionList = new List('test', renderMenu, {
			getHeight(element) {
				return 23;
			},
			getTemplateId(element) {
				return 'test';
			}
		}, [this.listRenderer],

		);


		if (this.codeActionList) {
			renderDisposables.add(this.codeActionList.onDidChangeSelection(e => this._onListSelection(e)));
		}


		inputArray.forEach((item, index) => {
			// const tooltip = item.tooltip ? item.tooltip : '';
			this.options.push(<ICodeActionMenuItem>{ title: item.label, detail: item.tooltip, action: inputArray[index], isDisabled: item.enabled });
		});

		this.codeActionList?.splice(0, this.codeActionList.length, this.options);
		this.codeActionList.layout(180);
		return renderDisposables;

	}


	public async show(trigger: CodeActionTrigger, codeActions: CodeActionSet, at: IAnchor | IPosition, options: CodeActionShowOptions): Promise<void> {
		const actionsToShow = options.includeDisabledActions ? codeActions.allActions : codeActions.validActions;
		if (!actionsToShow.length) {
			this._visible = false;
			return;
		}

		// this.showActions = actionsToShow;

		//Some helper that will make a call to this.getMenuActions()

		if (!this._editor.getDomNode()) {
			// cancel when editor went off-dom
			this._visible = false;
			throw canceled();
		}

		this._visible = true;
		this._showingActions.value = codeActions;

		const menuActions = this.getMenuActions(trigger, actionsToShow, codeActions.documentation);

		// this.menuAction = menuActions;


		const anchor = Position.isIPosition(at) ? this._toCoords(at) : at || { x: 0, y: 0 };
		// this.loc = anchor;


		const resolver = this._keybindingResolver.getResolver();

		const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM);

		this._contextViewService.showContextView({
			getAnchor: () => anchor,
			render: (container: HTMLElement) => this.renderCodeActionMenuList(container, menuActions),
			onHide: (didCancel) => {
				console.log(didCancel);
				this._visible = false;
				this._editor.focus();
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
		const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
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
