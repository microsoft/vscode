/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Gesture } from '../../../../base/browser/touch.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IListContextMenuEvent, IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { Orientation } from '../../../../base/browser/ui/splitview/splitview.js';
import { Action } from '../../../../base/common/actions.js';
import { equals } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import * as resources from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Constants } from '../../../../base/common/uint.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize, localize2 } from '../../../../nls.js';
import { getActionBarActions, getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenu, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { TextEditorSelectionRevealType } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IEditorPane } from '../../../common/editor.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { BREAKPOINTS_VIEW_ID, BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_BREAKPOINT_HAS_MODES, CONTEXT_BREAKPOINT_INPUT_FOCUSED, CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES, CONTEXT_BREAKPOINT_ITEM_TYPE, CONTEXT_BREAKPOINT_SUPPORTS_CONDITION, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_IN_DEBUG_MODE, CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, DEBUG_SCHEME, DataBreakpointSetType, DataBreakpointSource, DebuggerString, IBaseBreakpoint, IBreakpoint, IBreakpointEditorContribution, IBreakpointUpdateData, IDataBreakpoint, IDataBreakpointInfoResponse, IDebugModel, IDebugService, IEnablement, IExceptionBreakpoint, IFunctionBreakpoint, IInstructionBreakpoint, State } from '../common/debug.js';
import { Breakpoint, DataBreakpoint, ExceptionBreakpoint, FunctionBreakpoint, InstructionBreakpoint } from '../common/debugModel.js';
import { DisassemblyViewInput } from '../common/disassemblyViewInput.js';
import * as icons from './debugIcons.js';
import { DisassemblyView } from './disassemblyView.js';

const $ = dom.$;

function createCheckbox(disposables: DisposableStore): HTMLInputElement {
	const checkbox = <HTMLInputElement>$('input');
	checkbox.type = 'checkbox';
	checkbox.tabIndex = -1;
	disposables.add(Gesture.ignoreTarget(checkbox));

	return checkbox;
}

const MAX_VISIBLE_BREAKPOINTS = 9;
export function getExpandedBodySize(model: IDebugModel, sessionId: string | undefined, countLimit: number): number {
	const length = model.getBreakpoints().length + model.getExceptionBreakpointsForSession(sessionId).length + model.getFunctionBreakpoints().length + model.getDataBreakpoints().length + model.getInstructionBreakpoints().length;
	return Math.min(countLimit, length) * 22;
}
type BreakpointItem = IBreakpoint | IFunctionBreakpoint | IDataBreakpoint | IExceptionBreakpoint | IInstructionBreakpoint;

interface InputBoxData {
	breakpoint: IFunctionBreakpoint | IExceptionBreakpoint | IDataBreakpoint;
	type: 'condition' | 'hitCount' | 'name';
}

function getModeKindForBreakpoint(breakpoint: IBreakpoint) {
	const kind = breakpoint instanceof Breakpoint ? 'source' : breakpoint instanceof InstructionBreakpoint ? 'instruction' : 'exception';
	return kind;
}

export class BreakpointsView extends ViewPane {

	private list!: WorkbenchList<BreakpointItem>;
	private needsRefresh = false;
	private needsStateChange = false;
	private ignoreLayout = false;
	private menu: IMenu;
	private breakpointItemType: IContextKey<string | undefined>;
	private breakpointIsDataBytes: IContextKey<boolean | undefined>;
	private breakpointHasMultipleModes: IContextKey<boolean>;
	private breakpointSupportsCondition: IContextKey<boolean>;
	private _inputBoxData: InputBoxData | undefined;
	breakpointInputFocused: IContextKey<boolean>;
	private autoFocusedIndex = -1;

	private hintContainer: IconLabel | undefined;
	private hintDelayer: RunOnceScheduler;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private readonly debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IConfigurationService configurationService: IConfigurationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@ILabelService private readonly labelService: ILabelService,
		@IMenuService menuService: IMenuService,
		@IHoverService hoverService: IHoverService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.menu = menuService.createMenu(MenuId.DebugBreakpointsContext, contextKeyService);
		this._register(this.menu);
		this.breakpointItemType = CONTEXT_BREAKPOINT_ITEM_TYPE.bindTo(contextKeyService);
		this.breakpointIsDataBytes = CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES.bindTo(contextKeyService);
		this.breakpointHasMultipleModes = CONTEXT_BREAKPOINT_HAS_MODES.bindTo(contextKeyService);
		this.breakpointSupportsCondition = CONTEXT_BREAKPOINT_SUPPORTS_CONDITION.bindTo(contextKeyService);
		this.breakpointInputFocused = CONTEXT_BREAKPOINT_INPUT_FOCUSED.bindTo(contextKeyService);
		this._register(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
		this._register(this.debugService.getViewModel().onDidFocusSession(() => this.onBreakpointsChange()));
		this._register(this.debugService.onDidChangeState(() => this.onStateChange()));
		this.hintDelayer = this._register(new RunOnceScheduler(() => this.updateBreakpointsHint(true), 4000));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.element.classList.add('debug-pane');
		container.classList.add('debug-breakpoints');
		const delegate = new BreakpointsDelegate(this);

		this.list = this.instantiationService.createInstance(WorkbenchList, 'Breakpoints', container, delegate, [
			this.instantiationService.createInstance(BreakpointsRenderer, this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType),
			new ExceptionBreakpointsRenderer(this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType, this.debugService, this.hoverService),
			new ExceptionBreakpointInputRenderer(this, this.debugService, this.contextViewService),
			this.instantiationService.createInstance(FunctionBreakpointsRenderer, this.menu, this.breakpointSupportsCondition, this.breakpointItemType),
			new FunctionBreakpointInputRenderer(this, this.debugService, this.contextViewService, this.hoverService, this.labelService),
			this.instantiationService.createInstance(DataBreakpointsRenderer, this.menu, this.breakpointHasMultipleModes, this.breakpointSupportsCondition, this.breakpointItemType, this.breakpointIsDataBytes),
			new DataBreakpointInputRenderer(this, this.debugService, this.contextViewService, this.hoverService, this.labelService),
			this.instantiationService.createInstance(InstructionBreakpointsRenderer),
		], {
			identityProvider: { getId: (element: IEnablement) => element.getId() },
			multipleSelectionSupport: false,
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: IEnablement) => e },
			accessibilityProvider: new BreakpointsAccessibilityProvider(this.debugService, this.labelService),
			overrideStyles: this.getLocationBasedColors().listOverrideStyles
		}) as WorkbenchList<BreakpointItem>;

		CONTEXT_BREAKPOINTS_FOCUSED.bindTo(this.list.contextKeyService);

		this._register(this.list.onContextMenu(this.onListContextMenu, this));

		this._register(this.list.onMouseMiddleClick(async ({ element }) => {
			if (element instanceof Breakpoint) {
				await this.debugService.removeBreakpoints(element.getId());
			} else if (element instanceof FunctionBreakpoint) {
				await this.debugService.removeFunctionBreakpoints(element.getId());
			} else if (element instanceof DataBreakpoint) {
				await this.debugService.removeDataBreakpoints(element.getId());
			} else if (element instanceof InstructionBreakpoint) {
				await this.debugService.removeInstructionBreakpoints(element.instructionReference, element.offset);
			}
		}));

		this._register(this.list.onDidOpen(async e => {
			if (!e.element) {
				return;
			}

			if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.button === 1) { // middle click
				return;
			}

			if (e.element instanceof Breakpoint) {
				openBreakpointSource(e.element, e.sideBySide, e.editorOptions.preserveFocus || false, e.editorOptions.pinned || !e.editorOptions.preserveFocus, this.debugService, this.editorService);
			}
			if (e.element instanceof InstructionBreakpoint) {
				const disassemblyView = await this.editorService.openEditor(DisassemblyViewInput.instance);
				// Focus on double click
				(disassemblyView as DisassemblyView).goToInstructionAndOffset(e.element.instructionReference, e.element.offset, dom.isMouseEvent(e.browserEvent) && e.browserEvent.detail === 2);
			}
			if (dom.isMouseEvent(e.browserEvent) && e.browserEvent.detail === 2 && e.element instanceof FunctionBreakpoint && e.element !== this.inputBoxData?.breakpoint) {
				// double click
				this.renderInputBox({ breakpoint: e.element, type: 'name' });
			}
		}));

		this.list.splice(0, this.list.length, this.elements);

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				if (this.needsRefresh) {
					this.onBreakpointsChange();
				}

				if (this.needsStateChange) {
					this.onStateChange();
				}
			}
		}));

		const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id)!);
		this._register(containerModel.onDidChangeAllViewDescriptors(() => {
			this.updateSize();
		}));
	}

	protected override renderHeaderTitle(container: HTMLElement, title: string): void {
		super.renderHeaderTitle(container, title);

		const iconLabelContainer = dom.append(container, $('span.breakpoint-warning'));
		this.hintContainer = this._register(new IconLabel(iconLabelContainer, {
			supportIcons: true, hoverDelegate: {
				showHover: (options, focus?) => this.hoverService.showInstantHover({ content: options.content, target: this.hintContainer!.element }, focus),
				delay: this.configurationService.getValue<number>('workbench.hover.delay')
			}
		}));
		dom.hide(this.hintContainer.element);
	}

	override focus(): void {
		super.focus();
		this.list?.domFocus();
	}

	renderInputBox(data: InputBoxData | undefined): void {
		this._inputBoxData = data;
		this.onBreakpointsChange();
		this._inputBoxData = undefined;
	}

	get inputBoxData(): InputBoxData | undefined {
		return this._inputBoxData;
	}

	protected override layoutBody(height: number, width: number): void {
		if (this.ignoreLayout) {
			return;
		}

		super.layoutBody(height, width);
		this.list?.layout(height, width);
		try {
			this.ignoreLayout = true;
			this.updateSize();
		} finally {
			this.ignoreLayout = false;
		}
	}

	private onListContextMenu(e: IListContextMenuEvent<IEnablement>): void {
		const element = e.element;
		const type = element instanceof Breakpoint ? 'breakpoint' : element instanceof ExceptionBreakpoint ? 'exceptionBreakpoint' :
			element instanceof FunctionBreakpoint ? 'functionBreakpoint' : element instanceof DataBreakpoint ? 'dataBreakpoint' :
				element instanceof InstructionBreakpoint ? 'instructionBreakpoint' : undefined;
		this.breakpointItemType.set(type);
		const session = this.debugService.getViewModel().focusedSession;
		const conditionSupported = element instanceof ExceptionBreakpoint ? element.supportsCondition : (!session || !!session.capabilities.supportsConditionalBreakpoints);
		this.breakpointSupportsCondition.set(conditionSupported);
		this.breakpointIsDataBytes.set(element instanceof DataBreakpoint && element.src.type === DataBreakpointSetType.Address);
		this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes(getModeKindForBreakpoint(element as IBreakpoint)).length > 1);

		const { secondary } = getContextMenuActions(this.menu.getActions({ arg: e.element, shouldForwardArgs: false }), 'inline');

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => secondary,
			getActionsContext: () => element
		});
	}

	private updateSize(): void {
		const containerModel = this.viewDescriptorService.getViewContainerModel(this.viewDescriptorService.getViewContainerByViewId(this.id)!);

		// Adjust expanded body size
		const sessionId = this.debugService.getViewModel().focusedSession?.getId();
		this.minimumBodySize = this.orientation === Orientation.VERTICAL ? getExpandedBodySize(this.debugService.getModel(), sessionId, MAX_VISIBLE_BREAKPOINTS) : 170;
		this.maximumBodySize = this.orientation === Orientation.VERTICAL && containerModel.visibleViewDescriptors.length > 1 ? getExpandedBodySize(this.debugService.getModel(), sessionId, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
	}

	private updateBreakpointsHint(delayed = false): void {
		if (!this.hintContainer) {
			return;
		}

		const currentType = this.debugService.getViewModel().focusedSession?.configuration.type;
		const dbg = currentType ? this.debugService.getAdapterManager().getDebugger(currentType) : undefined;
		const message = dbg?.strings?.[DebuggerString.UnverifiedBreakpoints];
		const debuggerHasUnverifiedBps = message && this.debugService.getModel().getBreakpoints().filter(bp => {
			if (bp.verified || !bp.enabled) {
				return false;
			}

			const langId = this.languageService.guessLanguageIdByFilepathOrFirstLine(bp.uri);
			return langId && dbg.interestedInLanguage(langId);
		});

		if (message && debuggerHasUnverifiedBps?.length && this.debugService.getModel().areBreakpointsActivated()) {
			if (delayed) {
				const mdown = new MarkdownString(undefined, { isTrusted: true }).appendMarkdown(message);
				this.hintContainer.setLabel('$(warning)', undefined, { title: { markdown: mdown, markdownNotSupportedFallback: message } });
				dom.show(this.hintContainer.element);
			} else {
				this.hintDelayer.schedule();
			}
		} else {
			dom.hide(this.hintContainer.element);
		}
	}

	private onBreakpointsChange(): void {
		if (this.isBodyVisible()) {
			this.updateSize();
			if (this.list) {
				const lastFocusIndex = this.list.getFocus()[0];
				// Check whether focused element was removed
				const needsRefocus = lastFocusIndex && !this.elements.includes(this.list.element(lastFocusIndex));
				this.list.splice(0, this.list.length, this.elements);
				this.needsRefresh = false;
				if (needsRefocus) {
					this.list.focusNth(Math.min(lastFocusIndex, this.list.length - 1));
				}
			}
			this.updateBreakpointsHint();
		} else {
			this.needsRefresh = true;
		}
	}

	private onStateChange(): void {
		if (this.isBodyVisible()) {
			this.needsStateChange = false;
			const thread = this.debugService.getViewModel().focusedThread;
			let found = false;
			if (thread && thread.stoppedDetails && thread.stoppedDetails.hitBreakpointIds && thread.stoppedDetails.hitBreakpointIds.length > 0) {
				const hitBreakpointIds = thread.stoppedDetails.hitBreakpointIds;
				const elements = this.elements;
				const index = elements.findIndex(e => {
					const id = e.getIdFromAdapter(thread.session.getId());
					return typeof id === 'number' && hitBreakpointIds.indexOf(id) !== -1;
				});
				if (index >= 0) {
					this.list.setFocus([index]);
					this.list.setSelection([index]);
					found = true;
					this.autoFocusedIndex = index;
				}
			}
			if (!found) {
				// Deselect breakpoint in breakpoint view when no longer stopped on it #125528
				const focus = this.list.getFocus();
				const selection = this.list.getSelection();
				if (this.autoFocusedIndex >= 0 && equals(focus, selection) && focus.indexOf(this.autoFocusedIndex) >= 0) {
					this.list.setFocus([]);
					this.list.setSelection([]);
				}
				this.autoFocusedIndex = -1;
			}
			this.updateBreakpointsHint();
		} else {
			this.needsStateChange = true;
		}
	}

	private get elements(): BreakpointItem[] {
		const model = this.debugService.getModel();
		const sessionId = this.debugService.getViewModel().focusedSession?.getId();
		const elements = (<ReadonlyArray<IEnablement>>model.getExceptionBreakpointsForSession(sessionId)).concat(model.getFunctionBreakpoints()).concat(model.getDataBreakpoints()).concat(model.getBreakpoints()).concat(model.getInstructionBreakpoints());

		return elements as BreakpointItem[];
	}
}

class BreakpointsDelegate implements IListVirtualDelegate<BreakpointItem> {

	constructor(private view: BreakpointsView) {
		// noop
	}

	getHeight(_element: BreakpointItem): number {
		return 22;
	}

	getTemplateId(element: BreakpointItem): string {
		if (element instanceof Breakpoint) {
			return BreakpointsRenderer.ID;
		}
		if (element instanceof FunctionBreakpoint) {
			const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
			if (!element.name || (inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId())) {
				return FunctionBreakpointInputRenderer.ID;
			}

			return FunctionBreakpointsRenderer.ID;
		}
		if (element instanceof ExceptionBreakpoint) {
			const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
			if (inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
				return ExceptionBreakpointInputRenderer.ID;
			}
			return ExceptionBreakpointsRenderer.ID;
		}
		if (element instanceof DataBreakpoint) {
			const inputBoxBreakpoint = this.view.inputBoxData?.breakpoint;
			if (inputBoxBreakpoint && inputBoxBreakpoint.getId() === element.getId()) {
				return DataBreakpointInputRenderer.ID;
			}

			return DataBreakpointsRenderer.ID;
		}
		if (element instanceof InstructionBreakpoint) {
			return InstructionBreakpointsRenderer.ID;
		}

		return '';
	}
}

interface IBaseBreakpointTemplateData {
	breakpoint: HTMLElement;
	name: HTMLElement;
	checkbox: HTMLInputElement;
	context: BreakpointItem;
	actionBar: ActionBar;
	templateDisposables: DisposableStore;
	elementDisposables: DisposableStore;
	badge: HTMLElement;
}

interface IBaseBreakpointWithIconTemplateData extends IBaseBreakpointTemplateData {
	icon: HTMLElement;
}

interface IBreakpointTemplateData extends IBaseBreakpointWithIconTemplateData {
	filePath: HTMLElement;
}

interface IExceptionBreakpointTemplateData extends IBaseBreakpointTemplateData {
	condition: HTMLElement;
}

interface IFunctionBreakpointTemplateData extends IBaseBreakpointWithIconTemplateData {
	condition: HTMLElement;
}

interface IDataBreakpointTemplateData extends IBaseBreakpointWithIconTemplateData {
	accessType: HTMLElement;
	condition: HTMLElement;
}

interface IInstructionBreakpointTemplateData extends IBaseBreakpointWithIconTemplateData {
	address: HTMLElement;
}

interface IFunctionBreakpointInputTemplateData {
	inputBox: InputBox;
	checkbox: HTMLInputElement;
	icon: HTMLElement;
	breakpoint: IFunctionBreakpoint;
	templateDisposables: DisposableStore;
	elementDisposables: DisposableStore;
	type: 'hitCount' | 'condition' | 'name';
	updating?: boolean;
}

interface IDataBreakpointInputTemplateData {
	inputBox: InputBox;
	checkbox: HTMLInputElement;
	icon: HTMLElement;
	breakpoint: IDataBreakpoint;
	elementDisposables: DisposableStore;
	templateDisposables: DisposableStore;
	type: 'hitCount' | 'condition' | 'name';
	updating?: boolean;
}

interface IExceptionBreakpointInputTemplateData {
	inputBox: InputBox;
	checkbox: HTMLInputElement;
	currentBreakpoint?: IExceptionBreakpoint;
	templateDisposables: DisposableStore;
	elementDisposables: DisposableStore;
}

const breakpointIdToActionBarDomeNode = new Map<string, HTMLElement>();
class BreakpointsRenderer implements IListRenderer<IBreakpoint, IBreakpointTemplateData> {

	constructor(
		private menu: IMenu,
		private breakpointHasMultipleModes: IContextKey<boolean>,
		private breakpointSupportsCondition: IContextKey<boolean>,
		private breakpointItemType: IContextKey<string | undefined>,
		@IDebugService private readonly debugService: IDebugService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService
	) {
		// noop
	}

	static readonly ID = 'breakpoints';

	get templateId() {
		return BreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IBreakpointTemplateData {
		const data: IBreakpointTemplateData = Object.create(null);
		data.elementDisposables = new DisposableStore();
		data.templateDisposables = new DisposableStore();
		data.templateDisposables.add(data.elementDisposables);

		data.breakpoint = dom.append(container, $('.breakpoint'));

		data.icon = $('.icon');
		data.checkbox = createCheckbox(data.templateDisposables);

		data.templateDisposables.add(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.icon);
		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));

		data.filePath = dom.append(data.breakpoint, $('span.file-path'));
		data.actionBar = new ActionBar(data.breakpoint);
		data.templateDisposables.add(data.actionBar);
		const badgeContainer = dom.append(data.breakpoint, $('.badge-container'));
		data.badge = dom.append(badgeContainer, $('span.line-number.monaco-count-badge'));

		return data;
	}

	renderElement(breakpoint: IBreakpoint, index: number, data: IBreakpointTemplateData): void {
		data.context = breakpoint;
		data.breakpoint.classList.toggle('disabled', !this.debugService.getModel().areBreakpointsActivated());

		data.name.textContent = resources.basenameOrAuthority(breakpoint.uri);
		let badgeContent = breakpoint.lineNumber.toString();
		if (breakpoint.column) {
			badgeContent += `:${breakpoint.column}`;
		}
		if (breakpoint.modeLabel) {
			badgeContent = `${breakpoint.modeLabel}: ${badgeContent}`;
		}
		data.badge.textContent = badgeContent;
		data.filePath.textContent = this.labelService.getUriLabel(resources.dirname(breakpoint.uri), { relative: true });
		data.checkbox.checked = breakpoint.enabled;

		const { message, icon } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), breakpoint, this.labelService, this.debugService.getModel());
		data.icon.className = ThemeIcon.asClassName(icon);
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.breakpoint, breakpoint.message || message || ''));

		const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
		if (debugActive && !breakpoint.verified) {
			data.breakpoint.classList.add('disabled');
		}

		const session = this.debugService.getViewModel().focusedSession;
		this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
		this.breakpointItemType.set('breakpoint');
		this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes('source').length > 1);
		const { primary } = getActionBarActions(this.menu.getActions({ arg: breakpoint, shouldForwardArgs: true }), 'inline');
		data.actionBar.clear();
		data.actionBar.push(primary, { icon: true, label: false });
		breakpointIdToActionBarDomeNode.set(breakpoint.getId(), data.actionBar.domNode);
	}

	disposeElement(a: IBreakpoint, index: number, template: IBreakpointTemplateData): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(templateData: IBreakpointTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class ExceptionBreakpointsRenderer implements IListRenderer<IExceptionBreakpoint, IExceptionBreakpointTemplateData> {

	constructor(
		private menu: IMenu,
		private breakpointHasMultipleModes: IContextKey<boolean>,
		private breakpointSupportsCondition: IContextKey<boolean>,
		private breakpointItemType: IContextKey<string | undefined>,
		private debugService: IDebugService,
		private readonly hoverService: IHoverService,
	) {
		// noop
	}

	static readonly ID = 'exceptionbreakpoints';

	get templateId() {
		return ExceptionBreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IExceptionBreakpointTemplateData {
		const data: IExceptionBreakpointTemplateData = Object.create(null);
		data.elementDisposables = new DisposableStore();
		data.templateDisposables = new DisposableStore();
		data.templateDisposables.add(data.elementDisposables);
		data.breakpoint = dom.append(container, $('.breakpoint'));

		data.checkbox = createCheckbox(data.templateDisposables);
		data.templateDisposables.add(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));
		data.condition = dom.append(data.breakpoint, $('span.condition'));
		data.breakpoint.classList.add('exception');

		data.actionBar = new ActionBar(data.breakpoint);
		data.templateDisposables.add(data.actionBar);
		const badgeContainer = dom.append(data.breakpoint, $('.badge-container'));
		data.badge = dom.append(badgeContainer, $('span.line-number.monaco-count-badge'));

		return data;
	}

	renderElement(exceptionBreakpoint: IExceptionBreakpoint, index: number, data: IExceptionBreakpointTemplateData): void {
		data.context = exceptionBreakpoint;
		data.name.textContent = exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`;
		const exceptionBreakpointtitle = exceptionBreakpoint.verified ? (exceptionBreakpoint.description || data.name.textContent) : exceptionBreakpoint.message || localize('unverifiedExceptionBreakpoint', "Unverified Exception Breakpoint");
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.breakpoint, exceptionBreakpointtitle));
		data.breakpoint.classList.toggle('disabled', !exceptionBreakpoint.verified);
		data.checkbox.checked = exceptionBreakpoint.enabled;
		data.condition.textContent = exceptionBreakpoint.condition || '';
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.condition, localize('expressionCondition', "Expression condition: {0}", exceptionBreakpoint.condition)));

		if (exceptionBreakpoint.modeLabel) {
			data.badge.textContent = exceptionBreakpoint.modeLabel;
			data.badge.style.display = 'block';
		} else {
			data.badge.style.display = 'none';
		}

		this.breakpointSupportsCondition.set((exceptionBreakpoint as ExceptionBreakpoint).supportsCondition);
		this.breakpointItemType.set('exceptionBreakpoint');
		this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes('exception').length > 1);
		const { primary } = getActionBarActions(this.menu.getActions({ arg: exceptionBreakpoint, shouldForwardArgs: true }), 'inline');
		data.actionBar.clear();
		data.actionBar.push(primary, { icon: true, label: false });
		breakpointIdToActionBarDomeNode.set(exceptionBreakpoint.getId(), data.actionBar.domNode);
	}

	disposeElement(element: IExceptionBreakpoint, index: number, templateData: IExceptionBreakpointTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IExceptionBreakpointTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class FunctionBreakpointsRenderer implements IListRenderer<FunctionBreakpoint, IFunctionBreakpointTemplateData> {

	constructor(
		private menu: IMenu,
		private breakpointSupportsCondition: IContextKey<boolean>,
		private breakpointItemType: IContextKey<string | undefined>,
		@IDebugService private readonly debugService: IDebugService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService
	) {
		// noop
	}

	static readonly ID = 'functionbreakpoints';

	get templateId() {
		return FunctionBreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IFunctionBreakpointTemplateData {
		const data: IFunctionBreakpointTemplateData = Object.create(null);
		data.elementDisposables = new DisposableStore();
		data.templateDisposables = new DisposableStore();
		data.templateDisposables.add(data.elementDisposables);
		data.breakpoint = dom.append(container, $('.breakpoint'));

		data.icon = $('.icon');
		data.checkbox = createCheckbox(data.templateDisposables);
		data.templateDisposables.add(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.icon);
		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));
		data.condition = dom.append(data.breakpoint, $('span.condition'));

		data.actionBar = new ActionBar(data.breakpoint);
		data.templateDisposables.add(data.actionBar);
		const badgeContainer = dom.append(data.breakpoint, $('.badge-container'));
		data.badge = dom.append(badgeContainer, $('span.line-number.monaco-count-badge'));

		return data;
	}

	renderElement(functionBreakpoint: FunctionBreakpoint, _index: number, data: IFunctionBreakpointTemplateData): void {
		data.context = functionBreakpoint;
		data.name.textContent = functionBreakpoint.name;
		const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), functionBreakpoint, this.labelService, this.debugService.getModel());
		data.icon.className = ThemeIcon.asClassName(icon);
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.icon, message ? message : ''));
		data.checkbox.checked = functionBreakpoint.enabled;
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.breakpoint, message ? message : ''));
		if (functionBreakpoint.condition && functionBreakpoint.hitCondition) {
			data.condition.textContent = localize('expressionAndHitCount', "Condition: {0} | Hit Count: {1}", functionBreakpoint.condition, functionBreakpoint.hitCondition);
		} else {
			data.condition.textContent = functionBreakpoint.condition || functionBreakpoint.hitCondition || '';
		}

		if (functionBreakpoint.modeLabel) {
			data.badge.textContent = functionBreakpoint.modeLabel;
			data.badge.style.display = 'block';
		} else {
			data.badge.style.display = 'none';
		}

		// Mark function breakpoints as disabled if deactivated or if debug type does not support them #9099
		const session = this.debugService.getViewModel().focusedSession;
		data.breakpoint.classList.toggle('disabled', (session && !session.capabilities.supportsFunctionBreakpoints) || !this.debugService.getModel().areBreakpointsActivated());
		if (session && !session.capabilities.supportsFunctionBreakpoints) {
			data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.breakpoint, localize('functionBreakpointsNotSupported', "Function breakpoints are not supported by this debug type")));
		}

		this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
		this.breakpointItemType.set('functionBreakpoint');
		const { primary } = getActionBarActions(this.menu.getActions({ arg: functionBreakpoint, shouldForwardArgs: true }), 'inline');
		data.actionBar.clear();
		data.actionBar.push(primary, { icon: true, label: false });
		breakpointIdToActionBarDomeNode.set(functionBreakpoint.getId(), data.actionBar.domNode);
	}

	disposeElement(element: FunctionBreakpoint, index: number, templateData: IFunctionBreakpointTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IFunctionBreakpointTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class DataBreakpointsRenderer implements IListRenderer<DataBreakpoint, IDataBreakpointTemplateData> {

	constructor(
		private menu: IMenu,
		private breakpointHasMultipleModes: IContextKey<boolean>,
		private breakpointSupportsCondition: IContextKey<boolean>,
		private breakpointItemType: IContextKey<string | undefined>,
		private breakpointIsDataBytes: IContextKey<boolean | undefined>,
		@IDebugService private readonly debugService: IDebugService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService
	) {
		// noop
	}

	static readonly ID = 'databreakpoints';

	get templateId() {
		return DataBreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IDataBreakpointTemplateData {
		const data: IDataBreakpointTemplateData = Object.create(null);
		data.breakpoint = dom.append(container, $('.breakpoint'));
		data.elementDisposables = new DisposableStore();
		data.templateDisposables = new DisposableStore();
		data.templateDisposables.add(data.elementDisposables);

		data.icon = $('.icon');
		data.checkbox = createCheckbox(data.templateDisposables);
		data.templateDisposables.add(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.icon);
		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));
		data.accessType = dom.append(data.breakpoint, $('span.access-type'));
		data.condition = dom.append(data.breakpoint, $('span.condition'));

		data.actionBar = new ActionBar(data.breakpoint);
		data.templateDisposables.add(data.actionBar);
		const badgeContainer = dom.append(data.breakpoint, $('.badge-container'));
		data.badge = dom.append(badgeContainer, $('span.line-number.monaco-count-badge'));

		return data;
	}

	renderElement(dataBreakpoint: DataBreakpoint, _index: number, data: IDataBreakpointTemplateData): void {
		data.context = dataBreakpoint;
		data.name.textContent = dataBreakpoint.description;
		const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), dataBreakpoint, this.labelService, this.debugService.getModel());
		data.icon.className = ThemeIcon.asClassName(icon);
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.icon, message ? message : ''));
		data.checkbox.checked = dataBreakpoint.enabled;
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.breakpoint, message ? message : ''));

		if (dataBreakpoint.modeLabel) {
			data.badge.textContent = dataBreakpoint.modeLabel;
			data.badge.style.display = 'block';
		} else {
			data.badge.style.display = 'none';
		}

		// Mark data breakpoints as disabled if deactivated or if debug type does not support them
		const session = this.debugService.getViewModel().focusedSession;
		data.breakpoint.classList.toggle('disabled', (session && !session.capabilities.supportsDataBreakpoints) || !this.debugService.getModel().areBreakpointsActivated());
		if (session && !session.capabilities.supportsDataBreakpoints) {
			data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.breakpoint, localize('dataBreakpointsNotSupported', "Data breakpoints are not supported by this debug type")));
		}
		if (dataBreakpoint.accessType) {
			const accessType = dataBreakpoint.accessType === 'read' ? localize('read', "Read") : dataBreakpoint.accessType === 'write' ? localize('write', "Write") : localize('access', "Access");
			data.accessType.textContent = accessType;
		} else {
			data.accessType.textContent = '';
		}
		if (dataBreakpoint.condition && dataBreakpoint.hitCondition) {
			data.condition.textContent = localize('expressionAndHitCount', "Condition: {0} | Hit Count: {1}", dataBreakpoint.condition, dataBreakpoint.hitCondition);
		} else {
			data.condition.textContent = dataBreakpoint.condition || dataBreakpoint.hitCondition || '';
		}

		this.breakpointSupportsCondition.set(!session || !!session.capabilities.supportsConditionalBreakpoints);
		this.breakpointHasMultipleModes.set(this.debugService.getModel().getBreakpointModes('data').length > 1);
		this.breakpointItemType.set('dataBreakpoint');
		this.breakpointIsDataBytes.set(dataBreakpoint.src.type === DataBreakpointSetType.Address);
		const { primary } = getActionBarActions(this.menu.getActions({ arg: dataBreakpoint, shouldForwardArgs: true }), 'inline');
		data.actionBar.clear();
		data.actionBar.push(primary, { icon: true, label: false });
		breakpointIdToActionBarDomeNode.set(dataBreakpoint.getId(), data.actionBar.domNode);
		this.breakpointIsDataBytes.reset();
	}

	disposeElement(element: DataBreakpoint, index: number, templateData: IDataBreakpointTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IBaseBreakpointWithIconTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class InstructionBreakpointsRenderer implements IListRenderer<IInstructionBreakpoint, IInstructionBreakpointTemplateData> {

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService
	) {
		// noop
	}

	static readonly ID = 'instructionBreakpoints';

	get templateId() {
		return InstructionBreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IInstructionBreakpointTemplateData {
		const data: IInstructionBreakpointTemplateData = Object.create(null);
		data.elementDisposables = new DisposableStore();
		data.templateDisposables = new DisposableStore();
		data.templateDisposables.add(data.elementDisposables);
		data.breakpoint = dom.append(container, $('.breakpoint'));

		data.icon = $('.icon');
		data.checkbox = createCheckbox(data.templateDisposables);
		data.templateDisposables.add(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.icon);
		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));

		data.address = dom.append(data.breakpoint, $('span.file-path'));
		data.actionBar = new ActionBar(data.breakpoint);
		data.templateDisposables.add(data.actionBar);
		const badgeContainer = dom.append(data.breakpoint, $('.badge-container'));
		data.badge = dom.append(badgeContainer, $('span.line-number.monaco-count-badge'));

		return data;
	}

	renderElement(breakpoint: IInstructionBreakpoint, index: number, data: IInstructionBreakpointTemplateData): void {
		data.context = breakpoint;
		data.breakpoint.classList.toggle('disabled', !this.debugService.getModel().areBreakpointsActivated());

		data.name.textContent = '0x' + breakpoint.address.toString(16);
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.name, localize('debug.decimal.address', "Decimal Address: {0}", breakpoint.address.toString())));
		data.checkbox.checked = breakpoint.enabled;

		const { message, icon } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), breakpoint, this.labelService, this.debugService.getModel());
		data.icon.className = ThemeIcon.asClassName(icon);
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.breakpoint, breakpoint.message || message || ''));

		const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
		if (debugActive && !breakpoint.verified) {
			data.breakpoint.classList.add('disabled');
		}

		if (breakpoint.modeLabel) {
			data.badge.textContent = breakpoint.modeLabel;
			data.badge.style.display = 'block';
		} else {
			data.badge.style.display = 'none';
		}
	}


	disposeElement(element: IInstructionBreakpoint, index: number, templateData: IInstructionBreakpointTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IInstructionBreakpointTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class FunctionBreakpointInputRenderer implements IListRenderer<IFunctionBreakpoint, IFunctionBreakpointInputTemplateData> {

	constructor(
		private view: BreakpointsView,
		private debugService: IDebugService,
		private contextViewService: IContextViewService,
		private readonly hoverService: IHoverService,
		private labelService: ILabelService
	) { }

	static readonly ID = 'functionbreakpointinput';

	get templateId() {
		return FunctionBreakpointInputRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IFunctionBreakpointInputTemplateData {
		const template: IFunctionBreakpointInputTemplateData = Object.create(null);
		const toDispose = new DisposableStore();

		const breakpoint = dom.append(container, $('.breakpoint'));
		template.icon = $('.icon');
		template.checkbox = createCheckbox(toDispose);

		dom.append(breakpoint, template.icon);
		dom.append(breakpoint, template.checkbox);
		this.view.breakpointInputFocused.set(true);
		const inputBoxContainer = dom.append(breakpoint, $('.inputBoxContainer'));


		const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles });

		toDispose.add(inputBox);

		const wrapUp = (success: boolean) => {
			template.updating = true;
			try {
				this.view.breakpointInputFocused.set(false);
				const id = template.breakpoint.getId();

				if (success) {
					if (template.type === 'name') {
						this.debugService.updateFunctionBreakpoint(id, { name: inputBox.value });
					}
					if (template.type === 'condition') {
						this.debugService.updateFunctionBreakpoint(id, { condition: inputBox.value });
					}
					if (template.type === 'hitCount') {
						this.debugService.updateFunctionBreakpoint(id, { hitCondition: inputBox.value });
					}
				} else {
					if (template.type === 'name' && !template.breakpoint.name) {
						this.debugService.removeFunctionBreakpoints(id);
					} else {
						this.view.renderInputBox(undefined);
					}
				}
			} finally {
				template.updating = false;
			}
		};

		toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
			const isEscape = e.equals(KeyCode.Escape);
			const isEnter = e.equals(KeyCode.Enter);
			if (isEscape || isEnter) {
				e.preventDefault();
				e.stopPropagation();
				wrapUp(isEnter);
			}
		}));
		toDispose.add(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
			if (!template.updating) {
				wrapUp(!!inputBox.value);
			}
		}));

		template.inputBox = inputBox;
		template.elementDisposables = new DisposableStore();
		template.templateDisposables = toDispose;
		template.templateDisposables.add(template.elementDisposables);
		return template;
	}

	renderElement(functionBreakpoint: FunctionBreakpoint, _index: number, data: IFunctionBreakpointInputTemplateData): void {
		data.breakpoint = functionBreakpoint;
		data.type = this.view.inputBoxData?.type || 'name'; // If there is no type set take the 'name' as the default
		const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), functionBreakpoint, this.labelService, this.debugService.getModel());

		data.icon.className = ThemeIcon.asClassName(icon);
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.icon, message ? message : ''));
		data.checkbox.checked = functionBreakpoint.enabled;
		data.checkbox.disabled = true;
		data.inputBox.value = functionBreakpoint.name || '';

		let placeholder = localize('functionBreakpointPlaceholder', "Function to break on");
		let ariaLabel = localize('functionBreakPointInputAriaLabel', "Type function breakpoint.");
		if (data.type === 'condition') {
			data.inputBox.value = functionBreakpoint.condition || '';
			placeholder = localize('functionBreakpointExpressionPlaceholder', "Break when expression evaluates to true");
			ariaLabel = localize('functionBreakPointExpresionAriaLabel', "Type expression. Function breakpoint will break when expression evaluates to true");
		} else if (data.type === 'hitCount') {
			data.inputBox.value = functionBreakpoint.hitCondition || '';
			placeholder = localize('functionBreakpointHitCountPlaceholder', "Break when hit count is met");
			ariaLabel = localize('functionBreakPointHitCountAriaLabel', "Type hit count. Function breakpoint will break when hit count is met.");
		}
		data.inputBox.setAriaLabel(ariaLabel);
		data.inputBox.setPlaceHolder(placeholder);

		setTimeout(() => {
			data.inputBox.focus();
			data.inputBox.select();
		}, 0);
	}

	disposeElement(element: IFunctionBreakpoint, index: number, templateData: IFunctionBreakpointInputTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IFunctionBreakpointInputTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class DataBreakpointInputRenderer implements IListRenderer<IDataBreakpoint, IDataBreakpointInputTemplateData> {

	constructor(
		private view: BreakpointsView,
		private debugService: IDebugService,
		private contextViewService: IContextViewService,
		private readonly hoverService: IHoverService,
		private labelService: ILabelService
	) { }

	static readonly ID = 'databreakpointinput';

	get templateId() {
		return DataBreakpointInputRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IDataBreakpointInputTemplateData {
		const template: IDataBreakpointInputTemplateData = Object.create(null);
		const toDispose = new DisposableStore();

		const breakpoint = dom.append(container, $('.breakpoint'));
		template.icon = $('.icon');
		template.checkbox = createCheckbox(toDispose);

		dom.append(breakpoint, template.icon);
		dom.append(breakpoint, template.checkbox);
		this.view.breakpointInputFocused.set(true);
		const inputBoxContainer = dom.append(breakpoint, $('.inputBoxContainer'));


		const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { inputBoxStyles: defaultInputBoxStyles });
		toDispose.add(inputBox);

		const wrapUp = (success: boolean) => {
			template.updating = true;
			try {
				this.view.breakpointInputFocused.set(false);
				const id = template.breakpoint.getId();

				if (success) {
					if (template.type === 'condition') {
						this.debugService.updateDataBreakpoint(id, { condition: inputBox.value });
					}
					if (template.type === 'hitCount') {
						this.debugService.updateDataBreakpoint(id, { hitCondition: inputBox.value });
					}
				} else {
					this.view.renderInputBox(undefined);
				}
			} finally {
				template.updating = false;
			}
		};

		toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
			const isEscape = e.equals(KeyCode.Escape);
			const isEnter = e.equals(KeyCode.Enter);
			if (isEscape || isEnter) {
				e.preventDefault();
				e.stopPropagation();
				wrapUp(isEnter);
			}
		}));
		toDispose.add(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
			if (!template.updating) {
				wrapUp(!!inputBox.value);
			}
		}));

		template.inputBox = inputBox;
		template.elementDisposables = new DisposableStore();
		template.templateDisposables = toDispose;
		template.templateDisposables.add(template.elementDisposables);
		return template;
	}

	renderElement(dataBreakpoint: DataBreakpoint, _index: number, data: IDataBreakpointInputTemplateData): void {
		data.breakpoint = dataBreakpoint;
		data.type = this.view.inputBoxData?.type || 'condition'; // If there is no type set take the 'condition' as the default
		const { icon, message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), dataBreakpoint, this.labelService, this.debugService.getModel());

		data.icon.className = ThemeIcon.asClassName(icon);
		data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.icon, message ?? ''));
		data.checkbox.checked = dataBreakpoint.enabled;
		data.checkbox.disabled = true;
		data.inputBox.value = '';
		let placeholder = '';
		let ariaLabel = '';
		if (data.type === 'condition') {
			data.inputBox.value = dataBreakpoint.condition || '';
			placeholder = localize('dataBreakpointExpressionPlaceholder', "Break when expression evaluates to true");
			ariaLabel = localize('dataBreakPointExpresionAriaLabel', "Type expression. Data breakpoint will break when expression evaluates to true");
		} else if (data.type === 'hitCount') {
			data.inputBox.value = dataBreakpoint.hitCondition || '';
			placeholder = localize('dataBreakpointHitCountPlaceholder', "Break when hit count is met");
			ariaLabel = localize('dataBreakPointHitCountAriaLabel', "Type hit count. Data breakpoint will break when hit count is met.");
		}
		data.inputBox.setAriaLabel(ariaLabel);
		data.inputBox.setPlaceHolder(placeholder);

		setTimeout(() => {
			data.inputBox.focus();
			data.inputBox.select();
		}, 0);
	}

	disposeElement(element: IDataBreakpoint, index: number, templateData: IDataBreakpointInputTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IDataBreakpointInputTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class ExceptionBreakpointInputRenderer implements IListRenderer<IExceptionBreakpoint, IExceptionBreakpointInputTemplateData> {

	constructor(
		private view: BreakpointsView,
		private debugService: IDebugService,
		private contextViewService: IContextViewService,
	) {
		// noop
	}

	static readonly ID = 'exceptionbreakpointinput';

	get templateId() {
		return ExceptionBreakpointInputRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IExceptionBreakpointInputTemplateData {
		const toDispose = new DisposableStore();

		const breakpoint = dom.append(container, $('.breakpoint'));
		breakpoint.classList.add('exception');
		const checkbox = createCheckbox(toDispose);

		dom.append(breakpoint, checkbox);
		this.view.breakpointInputFocused.set(true);
		const inputBoxContainer = dom.append(breakpoint, $('.inputBoxContainer'));
		const inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			ariaLabel: localize('exceptionBreakpointAriaLabel', "Type exception breakpoint condition"),
			inputBoxStyles: defaultInputBoxStyles
		});


		toDispose.add(inputBox);
		const wrapUp = (success: boolean) => {
			if (!templateData.currentBreakpoint) {
				return;
			}

			this.view.breakpointInputFocused.set(false);
			let newCondition = templateData.currentBreakpoint.condition;
			if (success) {
				newCondition = inputBox.value !== '' ? inputBox.value : undefined;
			}
			this.debugService.setExceptionBreakpointCondition(templateData.currentBreakpoint, newCondition);
		};

		toDispose.add(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
			const isEscape = e.equals(KeyCode.Escape);
			const isEnter = e.equals(KeyCode.Enter);
			if (isEscape || isEnter) {
				e.preventDefault();
				e.stopPropagation();
				wrapUp(isEnter);
			}
		}));
		toDispose.add(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
			// Need to react with a timeout on the blur event due to possible concurent splices #56443
			setTimeout(() => {
				wrapUp(true);
			});
		}));

		const elementDisposables = new DisposableStore();
		toDispose.add(elementDisposables);

		const templateData: IExceptionBreakpointInputTemplateData = {
			inputBox,
			checkbox,
			templateDisposables: toDispose,
			elementDisposables: new DisposableStore(),
		};

		return templateData;
	}

	renderElement(exceptionBreakpoint: ExceptionBreakpoint, _index: number, data: IExceptionBreakpointInputTemplateData): void {
		const placeHolder = exceptionBreakpoint.conditionDescription || localize('exceptionBreakpointPlaceholder', "Break when expression evaluates to true");
		data.inputBox.setPlaceHolder(placeHolder);
		data.currentBreakpoint = exceptionBreakpoint;
		data.checkbox.checked = exceptionBreakpoint.enabled;
		data.checkbox.disabled = true;
		data.inputBox.value = exceptionBreakpoint.condition || '';
		setTimeout(() => {
			data.inputBox.focus();
			data.inputBox.select();
		}, 0);
	}

	disposeElement(element: IExceptionBreakpoint, index: number, templateData: IExceptionBreakpointInputTemplateData): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IExceptionBreakpointInputTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

class BreakpointsAccessibilityProvider implements IListAccessibilityProvider<BreakpointItem> {

	constructor(
		private readonly debugService: IDebugService,
		private readonly labelService: ILabelService
	) { }

	getWidgetAriaLabel(): string {
		return localize('breakpoints', "Breakpoints");
	}

	getRole(): AriaRole {
		return 'checkbox';
	}

	isChecked(breakpoint: IEnablement) {
		return breakpoint.enabled;
	}

	getAriaLabel(element: BreakpointItem): string | null {
		if (element instanceof ExceptionBreakpoint) {
			return element.toString();
		}

		const { message } = getBreakpointMessageAndIcon(this.debugService.state, this.debugService.getModel().areBreakpointsActivated(), element as IBreakpoint | IDataBreakpoint | IFunctionBreakpoint, this.labelService, this.debugService.getModel());
		const toString = element.toString();

		return message ? `${toString}, ${message}` : toString;
	}
}

export function openBreakpointSource(breakpoint: IBreakpoint, sideBySide: boolean, preserveFocus: boolean, pinned: boolean, debugService: IDebugService, editorService: IEditorService): Promise<IEditorPane | undefined> {
	if (breakpoint.uri.scheme === DEBUG_SCHEME && debugService.state === State.Inactive) {
		return Promise.resolve(undefined);
	}

	const selection = breakpoint.endLineNumber ? {
		startLineNumber: breakpoint.lineNumber,
		endLineNumber: breakpoint.endLineNumber,
		startColumn: breakpoint.column || 1,
		endColumn: breakpoint.endColumn || Constants.MAX_SAFE_SMALL_INTEGER
	} : {
		startLineNumber: breakpoint.lineNumber,
		startColumn: breakpoint.column || 1,
		endLineNumber: breakpoint.lineNumber,
		endColumn: breakpoint.column || Constants.MAX_SAFE_SMALL_INTEGER
	};

	return editorService.openEditor({
		resource: breakpoint.uri,
		options: {
			preserveFocus,
			selection,
			revealIfOpened: true,
			selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport,
			pinned
		}
	}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
}

export function getBreakpointMessageAndIcon(state: State, breakpointsActivated: boolean, breakpoint: BreakpointItem, labelService: ILabelService, debugModel: IDebugModel): { message?: string; icon: ThemeIcon; showAdapterUnverifiedMessage?: boolean } {
	const debugActive = state === State.Running || state === State.Stopped;

	const breakpointIcon = breakpoint instanceof DataBreakpoint ? icons.dataBreakpoint : breakpoint instanceof FunctionBreakpoint ? icons.functionBreakpoint : breakpoint.logMessage ? icons.logBreakpoint : icons.breakpoint;

	if (!breakpoint.enabled || !breakpointsActivated) {
		return {
			icon: breakpointIcon.disabled,
			message: breakpoint.logMessage ? localize('disabledLogpoint', "Disabled Logpoint") : localize('disabledBreakpoint', "Disabled Breakpoint"),
		};
	}

	const appendMessage = (text: string): string => {
		return ('message' in breakpoint && breakpoint.message) ? text.concat(', ' + breakpoint.message) : text;
	};

	if (debugActive && breakpoint instanceof Breakpoint && breakpoint.pending) {
		return {
			icon: icons.breakpoint.pending
		};
	}

	if (debugActive && !breakpoint.verified) {
		return {
			icon: breakpointIcon.unverified,
			message: ('message' in breakpoint && breakpoint.message) ? breakpoint.message : (breakpoint.logMessage ? localize('unverifiedLogpoint', "Unverified Logpoint") : localize('unverifiedBreakpoint', "Unverified Breakpoint")),
			showAdapterUnverifiedMessage: true
		};
	}

	if (breakpoint instanceof DataBreakpoint) {
		if (!breakpoint.supported) {
			return {
				icon: breakpointIcon.unverified,
				message: localize('dataBreakpointUnsupported', "Data breakpoints not supported by this debug type"),
			};
		}

		return {
			icon: breakpointIcon.regular,
			message: breakpoint.message || localize('dataBreakpoint', "Data Breakpoint")
		};
	}

	if (breakpoint instanceof FunctionBreakpoint) {
		if (!breakpoint.supported) {
			return {
				icon: breakpointIcon.unverified,
				message: localize('functionBreakpointUnsupported', "Function breakpoints not supported by this debug type"),
			};
		}
		const messages: string[] = [];
		messages.push(breakpoint.message || localize('functionBreakpoint', "Function Breakpoint"));
		if (breakpoint.condition) {
			messages.push(localize('expression', "Condition: {0}", breakpoint.condition));
		}
		if (breakpoint.hitCondition) {
			messages.push(localize('hitCount', "Hit Count: {0}", breakpoint.hitCondition));
		}

		return {
			icon: breakpointIcon.regular,
			message: appendMessage(messages.join('\n'))
		};
	}

	if (breakpoint instanceof InstructionBreakpoint) {
		if (!breakpoint.supported) {
			return {
				icon: breakpointIcon.unverified,
				message: localize('instructionBreakpointUnsupported', "Instruction breakpoints not supported by this debug type"),
			};
		}
		const messages: string[] = [];
		if (breakpoint.message) {
			messages.push(breakpoint.message);
		} else if (breakpoint.instructionReference) {
			messages.push(localize('instructionBreakpointAtAddress', "Instruction breakpoint at address {0}", breakpoint.instructionReference));
		} else {
			messages.push(localize('instructionBreakpoint', "Instruction breakpoint"));
		}

		if (breakpoint.hitCondition) {
			messages.push(localize('hitCount', "Hit Count: {0}", breakpoint.hitCondition));
		}

		return {
			icon: breakpointIcon.regular,
			message: appendMessage(messages.join('\n'))
		};
	}

	// can change this when all breakpoint supports dependent breakpoint condition
	let triggeringBreakpoint: IBreakpoint | undefined;
	if (breakpoint instanceof Breakpoint && breakpoint.triggeredBy) {
		triggeringBreakpoint = debugModel.getBreakpoints().find(bp => bp.getId() === breakpoint.triggeredBy);
	}

	if (breakpoint.logMessage || breakpoint.condition || breakpoint.hitCondition || triggeringBreakpoint) {
		const messages: string[] = [];
		let icon = breakpoint.logMessage ? icons.logBreakpoint.regular : icons.conditionalBreakpoint.regular;
		if (!breakpoint.supported) {
			icon = icons.debugBreakpointUnsupported;
			messages.push(localize('breakpointUnsupported', "Breakpoints of this type are not supported by the debugger"));
		}

		if (breakpoint.logMessage) {
			messages.push(localize('logMessage', "Log Message: {0}", breakpoint.logMessage));
		}
		if (breakpoint.condition) {
			messages.push(localize('expression', "Condition: {0}", breakpoint.condition));
		}
		if (breakpoint.hitCondition) {
			messages.push(localize('hitCount', "Hit Count: {0}", breakpoint.hitCondition));
		}
		if (triggeringBreakpoint) {
			messages.push(localize('triggeredBy', "Hit after breakpoint: {0}", `${labelService.getUriLabel(triggeringBreakpoint.uri, { relative: true })}: ${triggeringBreakpoint.lineNumber}`));
		}

		return {
			icon,
			message: appendMessage(messages.join('\n'))
		};
	}

	const message = ('message' in breakpoint && breakpoint.message) ? breakpoint.message : breakpoint instanceof Breakpoint && labelService ? labelService.getUriLabel(breakpoint.uri) : localize('breakpoint', "Breakpoint");
	return {
		icon: breakpointIcon.regular,
		message
	};
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.addFunctionBreakpointAction',
			title: {
				...localize2('addFunctionBreakpoint', "Add Function Breakpoint"),
				mnemonicTitle: localize({ key: 'miFunctionBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Function Breakpoint..."),
			},
			f1: true,
			icon: icons.watchExpressionsAddFuncBreakpoint,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.equals('view', BREAKPOINTS_VIEW_ID)
			}, {
				id: MenuId.MenubarNewBreakpointMenu,
				group: '1_breakpoints',
				order: 3,
				when: CONTEXT_DEBUGGERS_AVAILABLE
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const viewService = accessor.get(IViewsService);
		await viewService.openView(BREAKPOINTS_VIEW_ID);
		debugService.addFunctionBreakpoint();
	}
});

abstract class MemoryBreakpointAction extends Action2 {
	async run(accessor: ServicesAccessor, existingBreakpoint?: IDataBreakpoint): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const session = debugService.getViewModel().focusedSession;
		if (!session) {
			return;
		}

		let defaultValue = undefined;
		if (existingBreakpoint && existingBreakpoint.src.type === DataBreakpointSetType.Address) {
			defaultValue = `${existingBreakpoint.src.address} + ${existingBreakpoint.src.bytes}`;
		}

		const quickInput = accessor.get(IQuickInputService);
		const notifications = accessor.get(INotificationService);
		const range = await this.getRange(quickInput, defaultValue);
		if (!range) {
			return;
		}

		let info: IDataBreakpointInfoResponse | undefined;
		try {
			info = await session.dataBytesBreakpointInfo(range.address, range.bytes);
		} catch (e) {
			notifications.error(localize('dataBreakpointError', "Failed to set data breakpoint at {0}: {1}", range.address, e.message));
		}

		if (!info?.dataId) {
			return;
		}

		let accessType: DebugProtocol.DataBreakpointAccessType = 'write';
		if (info.accessTypes && info.accessTypes?.length > 1) {
			const accessTypes = info.accessTypes.map(type => ({ label: type }));
			const selectedAccessType = await quickInput.pick(accessTypes, { placeHolder: localize('dataBreakpointAccessType', "Select the access type to monitor") });
			if (!selectedAccessType) {
				return;
			}

			accessType = selectedAccessType.label;
		}

		const src: DataBreakpointSource = { type: DataBreakpointSetType.Address, ...range };
		if (existingBreakpoint) {
			await debugService.removeDataBreakpoints(existingBreakpoint.getId());
		}

		await debugService.addDataBreakpoint({
			description: info.description,
			src,
			canPersist: true,
			accessTypes: info.accessTypes,
			accessType: accessType,
			initialSessionData: { session, dataId: info.dataId }
		});
	}

	private getRange(quickInput: IQuickInputService, defaultValue?: string) {
		return new Promise<{ address: string; bytes: number } | undefined>(resolve => {
			const disposables = new DisposableStore();
			const input = disposables.add(quickInput.createInputBox());
			input.prompt = localize('dataBreakpointMemoryRangePrompt', "Enter a memory range in which to break");
			input.placeholder = localize('dataBreakpointMemoryRangePlaceholder', 'Absolute range (0x1234 - 0x1300) or range of bytes after an address (0x1234 + 0xff)');
			if (defaultValue) {
				input.value = defaultValue;
				input.valueSelection = [0, defaultValue.length];
			}
			disposables.add(input.onDidChangeValue(e => {
				const err = this.parseAddress(e, false);
				input.validationMessage = err?.error;
			}));
			disposables.add(input.onDidAccept(() => {
				const r = this.parseAddress(input.value, true);
				if ('error' in r) {
					input.validationMessage = r.error;
				} else {
					resolve(r);
				}
				input.dispose();
			}));
			disposables.add(input.onDidHide(() => {
				resolve(undefined);
				disposables.dispose();
			}));
			input.ignoreFocusOut = true;
			input.show();
		});
	}

	private parseAddress(range: string, isFinal: false): { error: string } | undefined;
	private parseAddress(range: string, isFinal: true): { error: string } | { address: string; bytes: number };
	private parseAddress(range: string, isFinal: boolean): { error: string } | { address: string; bytes: number } | undefined {
		const parts = /^(\S+)\s*(?:([+-])\s*(\S+))?/.exec(range);
		if (!parts) {
			return { error: localize('dataBreakpointAddrFormat', 'Address should be a range of numbers the form "[Start] - [End]" or "[Start] + [Bytes]"') };
		}

		const isNum = (e: string) => isFinal ? /^0x[0-9a-f]*|[0-9]*$/i.test(e) : /^0x[0-9a-f]+|[0-9]+$/i.test(e);
		const [, startStr, sign = '+', endStr = '1'] = parts;

		for (const n of [startStr, endStr]) {
			if (!isNum(n)) {
				return { error: localize('dataBreakpointAddrStartEnd', 'Number must be a decimal integer or hex value starting with \"0x\", got {0}', n) };
			}
		}

		if (!isFinal) {
			return;
		}

		const start = BigInt(startStr);
		const end = BigInt(endStr);
		const address = `0x${start.toString(16)}`;
		if (sign === '-') {
			return { address, bytes: Number(start - end) };
		}

		return { address, bytes: Number(end) };
	}
}

registerAction2(class extends MemoryBreakpointAction {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.addDataBreakpointOnAddress',
			title: {
				...localize2('addDataBreakpointOnAddress', "Add Data Breakpoint at Address"),
				mnemonicTitle: localize({ key: 'miDataBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Data Breakpoint..."),
			},
			f1: true,
			icon: icons.watchExpressionsAddDataBreakpoint,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 11,
				when: ContextKeyExpr.and(CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, ContextKeyExpr.equals('view', BREAKPOINTS_VIEW_ID))
			}, {
				id: MenuId.MenubarNewBreakpointMenu,
				group: '1_breakpoints',
				order: 4,
				when: CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED
			}]
		});
	}
});

registerAction2(class extends MemoryBreakpointAction {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.editDataBreakpointOnAddress',
			title: localize2('editDataBreakpointOnAddress', "Edit Address..."),
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				when: ContextKeyExpr.and(CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, CONTEXT_BREAKPOINT_ITEM_IS_DATA_BYTES),
				group: 'navigation',
				order: 15,
			}]
		});
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.toggleBreakpointsActivatedAction',
			title: localize2('activateBreakpoints', 'Toggle Activate Breakpoints'),
			f1: true,
			icon: icons.breakpointsActivate,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 20,
				when: ContextKeyExpr.equals('view', BREAKPOINTS_VIEW_ID)
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const debugService = accessor.get(IDebugService);
		debugService.setBreakpointsActivated(!debugService.getModel().areBreakpointsActivated());
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.removeBreakpoint',
			title: localize('removeBreakpoint', "Remove Breakpoint"),
			icon: Codicon.removeClose,
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				group: '3_modification',
				order: 10,
				when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo('exceptionBreakpoint')
			}, {
				id: MenuId.DebugBreakpointsContext,
				group: 'inline',
				order: 20,
				when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo('exceptionBreakpoint')
			}]
		});
	}

	async run(accessor: ServicesAccessor, breakpoint: IBaseBreakpoint): Promise<void> {
		const debugService = accessor.get(IDebugService);
		if (breakpoint instanceof Breakpoint) {
			await debugService.removeBreakpoints(breakpoint.getId());
		} else if (breakpoint instanceof FunctionBreakpoint) {
			await debugService.removeFunctionBreakpoints(breakpoint.getId());
		} else if (breakpoint instanceof DataBreakpoint) {
			await debugService.removeDataBreakpoints(breakpoint.getId());
		} else if (breakpoint instanceof InstructionBreakpoint) {
			await debugService.removeInstructionBreakpoints(breakpoint.instructionReference, breakpoint.offset);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.removeAllBreakpoints',
			title: {
				...localize2('removeAllBreakpoints', "Remove All Breakpoints"),
				mnemonicTitle: localize({ key: 'miRemoveAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Remove &&All Breakpoints"),
			},
			f1: true,
			icon: icons.breakpointsRemoveAll,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 30,
				when: ContextKeyExpr.equals('view', BREAKPOINTS_VIEW_ID)
			}, {
				id: MenuId.DebugBreakpointsContext,
				group: '3_modification',
				order: 20,
				when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo('exceptionBreakpoint'))
			}, {
				id: MenuId.MenubarDebugMenu,
				group: '5_breakpoints',
				order: 3,
				when: CONTEXT_DEBUGGERS_AVAILABLE
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const debugService = accessor.get(IDebugService);
		debugService.removeBreakpoints();
		debugService.removeFunctionBreakpoints();
		debugService.removeDataBreakpoints();
		debugService.removeInstructionBreakpoints();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.enableAllBreakpoints',
			title: {
				...localize2('enableAllBreakpoints', "Enable All Breakpoints"),
				mnemonicTitle: localize({ key: 'miEnableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "&&Enable All Breakpoints"),
			},
			f1: true,
			precondition: CONTEXT_DEBUGGERS_AVAILABLE,
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				group: 'z_commands',
				order: 10,
				when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo('exceptionBreakpoint'))
			}, {
				id: MenuId.MenubarDebugMenu,
				group: '5_breakpoints',
				order: 1,
				when: CONTEXT_DEBUGGERS_AVAILABLE
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		await debugService.enableOrDisableBreakpoints(true);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.disableAllBreakpoints',
			title: {
				...localize2('disableAllBreakpoints', "Disable All Breakpoints"),
				mnemonicTitle: localize({ key: 'miDisableAllBreakpoints', comment: ['&& denotes a mnemonic'] }, "Disable A&&ll Breakpoints"),
			},
			f1: true,
			precondition: CONTEXT_DEBUGGERS_AVAILABLE,
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				group: 'z_commands',
				order: 20,
				when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo('exceptionBreakpoint'))
			}, {
				id: MenuId.MenubarDebugMenu,
				group: '5_breakpoints',
				order: 2,
				when: CONTEXT_DEBUGGERS_AVAILABLE
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		await debugService.enableOrDisableBreakpoints(false);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.debug.viewlet.action.reapplyBreakpointsAction',
			title: localize2('reapplyAllBreakpoints', 'Reapply All Breakpoints'),
			f1: true,
			precondition: CONTEXT_IN_DEBUG_MODE,
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				group: 'z_commands',
				order: 30,
				when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo('exceptionBreakpoint'))
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		await debugService.setBreakpointsActivated(true);
	}
});

registerAction2(class extends ViewAction<BreakpointsView> {
	constructor() {
		super({
			id: 'debug.editBreakpoint',
			viewId: BREAKPOINTS_VIEW_ID,
			title: localize('editCondition', "Edit Condition..."),
			icon: Codicon.edit,
			precondition: CONTEXT_BREAKPOINT_SUPPORTS_CONDITION,
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				when: CONTEXT_BREAKPOINT_ITEM_TYPE.notEqualsTo('functionBreakpoint'),
				group: 'navigation',
				order: 10
			}, {
				id: MenuId.DebugBreakpointsContext,
				group: 'inline',
				order: 10
			}]
		});
	}

	async runInView(accessor: ServicesAccessor, view: BreakpointsView, breakpoint: ExceptionBreakpoint | Breakpoint | FunctionBreakpoint | DataBreakpoint): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const editorService = accessor.get(IEditorService);
		if (breakpoint instanceof Breakpoint) {
			const editor = await openBreakpointSource(breakpoint, false, false, true, debugService, editorService);
			if (editor) {
				const codeEditor = editor.getControl();
				if (isCodeEditor(codeEditor)) {
					codeEditor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(breakpoint.lineNumber, breakpoint.column);
				}
			}
		} else if (breakpoint instanceof FunctionBreakpoint) {
			const contextMenuService = accessor.get(IContextMenuService);
			const actions: Action[] = [new Action('breakpoint.editCondition', localize('editCondition', "Edit Condition..."), undefined, true, async () => view.renderInputBox({ breakpoint, type: 'condition' })),
			new Action('breakpoint.editCondition', localize('editHitCount', "Edit Hit Count..."), undefined, true, async () => view.renderInputBox({ breakpoint, type: 'hitCount' }))];
			const domNode = breakpointIdToActionBarDomeNode.get(breakpoint.getId());

			if (domNode) {
				contextMenuService.showContextMenu({
					getActions: () => actions,
					getAnchor: () => domNode,
					onHide: () => dispose(actions)
				});
			}
		} else {
			view.renderInputBox({ breakpoint, type: 'condition' });
		}
	}
});


registerAction2(class extends ViewAction<BreakpointsView> {
	constructor() {
		super({
			id: 'debug.editFunctionBreakpoint',
			viewId: BREAKPOINTS_VIEW_ID,
			title: localize('editBreakpoint', "Edit Function Condition..."),
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				group: 'navigation',
				order: 10,
				when: CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo('functionBreakpoint')
			}]
		});
	}

	runInView(_accessor: ServicesAccessor, view: BreakpointsView, breakpoint: IFunctionBreakpoint) {
		view.renderInputBox({ breakpoint, type: 'name' });
	}
});

registerAction2(class extends ViewAction<BreakpointsView> {
	constructor() {
		super({
			id: 'debug.editFunctionBreakpointHitCount',
			viewId: BREAKPOINTS_VIEW_ID,
			title: localize('editHitCount', "Edit Hit Count..."),
			precondition: CONTEXT_BREAKPOINT_SUPPORTS_CONDITION,
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				group: 'navigation',
				order: 20,
				when: ContextKeyExpr.or(CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo('functionBreakpoint'), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo('dataBreakpoint'))
			}]
		});
	}

	runInView(_accessor: ServicesAccessor, view: BreakpointsView, breakpoint: IFunctionBreakpoint) {
		view.renderInputBox({ breakpoint, type: 'hitCount' });
	}
});

registerAction2(class extends ViewAction<BreakpointsView> {
	constructor() {
		super({
			id: 'debug.editBreakpointMode',
			viewId: BREAKPOINTS_VIEW_ID,
			title: localize('editMode', "Edit Mode..."),
			menu: [{
				id: MenuId.DebugBreakpointsContext,
				group: 'navigation',
				order: 20,
				when: ContextKeyExpr.and(
					CONTEXT_BREAKPOINT_HAS_MODES,
					ContextKeyExpr.or(CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo('breakpoint'), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo('exceptionBreakpoint'), CONTEXT_BREAKPOINT_ITEM_TYPE.isEqualTo('instructionBreakpoint'))
				)
			}]
		});
	}

	async runInView(accessor: ServicesAccessor, view: BreakpointsView, breakpoint: IBreakpoint) {
		const debugService = accessor.get(IDebugService);
		const kind = getModeKindForBreakpoint(breakpoint);
		const modes = debugService.getModel().getBreakpointModes(kind);
		const picked = await accessor.get(IQuickInputService).pick(
			modes.map(mode => ({ label: mode.label, description: mode.description, mode: mode.mode })),
			{ placeHolder: localize('selectBreakpointMode', "Select Breakpoint Mode") }
		);

		if (!picked) {
			return;
		}

		if (kind === 'source') {
			const data = new Map<string, IBreakpointUpdateData>();
			data.set(breakpoint.getId(), { mode: picked.mode, modeLabel: picked.label });
			debugService.updateBreakpoints(breakpoint.originalUri, data, false);
		} else if (breakpoint instanceof InstructionBreakpoint) {
			debugService.removeInstructionBreakpoints(breakpoint.instructionReference, breakpoint.offset);
			debugService.addInstructionBreakpoint({ ...breakpoint.toJSON(), mode: picked.mode, modeLabel: picked.label });
		} else if (breakpoint instanceof ExceptionBreakpoint) {
			breakpoint.mode = picked.mode;
			breakpoint.modeLabel = picked.label;
			debugService.setExceptionBreakpointCondition(breakpoint, breakpoint.condition); // no-op to trigger a re-send
		}
	}
});
