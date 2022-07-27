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
import { Disposable, dispose, MutableDisposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
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

export const Context = {
	Visible: new RawContextKey<boolean>('CodeActionMenuVisible', false, localize('CodeActionMenuVisible', "Whether the code action list widget is visible"))
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
	isEnabled: boolean;
	isDocumentation: boolean;
	index: number;
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

const TEMPLATE_ID = 'codeActionWidget';
const codeActionLineHeight = 26;

class CodeMenuRenderer implements IListRenderer<ICodeActionMenuItem, ICodeActionMenuTemplateData> {

	constructor(
		private readonly acceptKeybindings: [string, string],
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) { }

	get templateId(): string { return TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): ICodeActionMenuTemplateData {
		const data: ICodeActionMenuTemplateData = Object.create(null);
		data.disposables = [];
		data.root = container;
		data.text = document.createElement('span');
		// data.detail = document.createElement('');
		container.append(data.text);
		// container.append(data.detail);

		return data;
	}
	renderElement(element: ICodeActionMenuItem, index: number, templateData: ICodeActionMenuTemplateData): void {
		const data: ICodeActionMenuTemplateData = templateData;

		const text = element.title;
		// const detail = element.detail;

		const isEnabled = element.isEnabled;
		const isSeparator = element.isSeparator;
		const isDocumentation = element.isDocumentation;

		data.text.textContent = text;
		// data.detail.textContent = detail;

		if (!isEnabled) {
			data.root.classList.add('option-disabled');
			data.root.style.backgroundColor = 'transparent !important';
		} else {
			data.root.classList.remove('option-disabled');
		}

		if (isSeparator) {
			data.root.classList.add('separator');
			data.root.style.height = '10px';
		}

		if (!isDocumentation) {
			const updateLabel = () => {
				const [accept, preview] = this.acceptKeybindings;
				data.root.title = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Refactor, Shift+F2 to Preview"'] }, "{0} to Refactor, {1} to Preview", this.keybindingService.lookupKeybinding(accept)?.getLabel(), this.keybindingService.lookupKeybinding(preview)?.getLabel());
				// data.root.title = this.keybindingService.lookupKeybinding(accept)?.getLabel() + ' to Refactor, ' + this.keybindingService.lookupKeybinding(preview)?.getLabel() + ' to Preview';
			};
			updateLabel();
		}

	}
	disposeTemplate(templateData: ICodeActionMenuTemplateData): void {
		templateData.disposables = dispose(templateData.disposables);
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
	private currSelectedItem: number = 0;
	private hasSeperator: boolean = false;
	private block?: HTMLElement;

	public static readonly documentationID: string = '_documentation';

	public static readonly ID: string = 'editor.contrib.codeActionMenu';

	public static get(editor: ICodeEditor): CodeActionMenu | null {
		return editor.getContribution<CodeActionMenu>(CodeActionMenu.ID);
	}

	private readonly _keybindingResolver: CodeActionKeybindingResolver;
	private listRenderer: CodeMenuRenderer;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _delegate: CodeActionWidgetDelegate,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
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
		this.listRenderer = new CodeMenuRenderer([`onEnterSelectCodeAction`, `onEnterSelectCodeActionWithPreview`], keybindingService);
	}

	get isVisible(): boolean {
		return this._visible;
	}

	private isCodeActionWidgetEnabled(model: ITextModel): boolean {
		return this._configurationService.getValue('editor.experimental.useCustomCodeActionMenu', {
			resource: model.uri
		});
	}

	private _onListSelection(e: IListEvent<ICodeActionMenuItem>): void {
		if (e.elements.length) {
			e.elements.forEach(element => {
				if (element.isEnabled) {
					element.action.run();
				}
			});
			this.hideCodeActionWidget();
		}
	}


	private _onListHover(e: IListMouseEvent<ICodeActionMenuItem>): void {
		if (!e.element) {
			this.codeActionList.value?.setFocus([]);
		} else {
			if (e.element?.isEnabled) {
				this.codeActionList.value?.setFocus([e.element.index]);
				this.focusedEnabledItem = this.viewItems.indexOf(e.element);
				this.currSelectedItem = e.element.index;
			}
		}
	}

	private renderCodeActionMenuList(element: HTMLElement, inputArray: IAction[]): IDisposable {
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
				}
				return codeActionLineHeight;
			},
			getTemplateId(element) {
				return 'codeActionWidget';
			}
		}, [this.listRenderer], { keyboardSupport: false }
		);

		renderDisposables.add(this.codeActionList.value.onMouseOver(e => this._onListHover(e)));
		renderDisposables.add(this.codeActionList.value.onDidChangeFocus(e => this.codeActionList.value?.domFocus()));
		renderDisposables.add(this.codeActionList.value.onDidChangeSelection(e => this._onListSelection(e)));
		renderDisposables.add(this._editor.onDidLayoutChange(e => this.hideCodeActionWidget()));


		// Populating the list widget and tracking enabled options.
		inputArray.forEach((item, index) => {
			const currIsSeparator = item.class === 'separator';
			let isDocumentation = false;
			if (item instanceof CodeActionAction) {
				isDocumentation = item.action.kind === CodeActionMenu.documentationID;
			}

			if (currIsSeparator) {
				// set to true forever
				this.hasSeperator = true;
			}
			const menuItem = <ICodeActionMenuItem>{ title: item.label, detail: item.tooltip, action: inputArray[index], isEnabled: item.enabled, isSeparator: currIsSeparator, index, isDocumentation };
			if (item.enabled) {
				this.viewItems.push(menuItem);
			}
			this.options.push(menuItem);
		});

		this.codeActionList.value.splice(0, this.codeActionList.value.length, this.options);

		const height = this.hasSeperator ? (inputArray.length - 1) * codeActionLineHeight + 10 : inputArray.length * codeActionLineHeight;
		renderMenu.style.height = String(height) + 'px';
		this.codeActionList.value.layout(height);

		// For finding width dynamically (not using resize observer)
		const arr: number[] = [];
		this.options.forEach((item, index) => {
			if (!this.codeActionList.value) {
				return;
			}
			const element = document.getElementById(this.codeActionList.value?.getElementID(index))?.getElementsByTagName('span')[0].offsetWidth;
			arr.push(Number(element));
		});

		// resize observer - can be used in the future since list widget supports dynamic height but not width
		const maxWidth = Math.max(...arr);

		// 40 is the additional padding for the list widget (20 left, 20 right)
		renderMenu.style.width = maxWidth + 52 + 'px';
		this.codeActionList.value?.layout(height, maxWidth);

		// List selection
		if (this.viewItems.length < 1 || this.viewItems.every(item => item.isDocumentation)) {
			this.currSelectedItem = 0;
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
			// this._contextViewService.hideContextView({ source: this });
		});
		renderDisposables.add(blurListener);
		renderDisposables.add(focusTracker);
		this._ctxMenuWidgetVisible.set(true);

		return renderDisposables;
	}

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
		this.codeActionList.value?.setSelection([this.currSelectedItem]);
	}

	override dispose() {
		super.dispose();
	}

	hideCodeActionWidget() {
		this._ctxMenuWidgetVisible.reset();
		this.options = [];
		this.viewItems = [];
		this.focusedEnabledItem = 0;
		this.currSelectedItem = 0;
		this.hasSeperator = false;
		this._contextViewService.hideContextView({ source: this });
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

		const menuActions = this.getMenuActions(trigger, actionsToShow, codeActions.documentation);

		const anchor = Position.isIPosition(at) ? this._toCoords(at) : at || { x: 0, y: 0 };
		const resolver = this._keybindingResolver.getResolver();

		const useShadowDOM = this._editor.getOption(EditorOption.useShadowDOM);


		if (this.isCodeActionWidgetEnabled(model)) {
			this._contextViewService.showContextView({
				getAnchor: () => anchor,
				render: (container: HTMLElement) => this.renderCodeActionMenuList(container, menuActions),
				onHide: (didCancel) => {
					const openedFromString = (options.fromLightbulb) ? CodeActionTriggerSource.Lightbulb : trigger.triggerAction;
					this.codeActionTelemetry(openedFromString, didCancel, codeActions);
					this._visible = false;
					this._editor.focus();
				},
			},
				this._editor.getDomNode()!, false,
			);
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
