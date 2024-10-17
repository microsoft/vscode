/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import * as lifecycle from '../../../../base/common/lifecycle.js';
import { URI as uri } from '../../../../base/common/uri.js';
import './media/breakpointWidget.css';
import { IActiveCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorCommand, ServicesAccessor, registerEditorCommand } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption, IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { CompletionContext, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { CompletionOptions, provideSuggestionItems } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { defaultButtonStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, CONTEXT_IN_BREAKPOINT_WIDGET, BreakpointWidgetContext as Context, DEBUG_SCHEME, IBreakpoint, IBreakpointEditorContribution, IBreakpointUpdateData, IDebugService } from '../common/debug.js';

const $ = dom.$;
const IPrivateBreakpointWidgetService = createDecorator<IPrivateBreakpointWidgetService>('privateBreakpointWidgetService');
interface IPrivateBreakpointWidgetService {
	readonly _serviceBrand: undefined;
	close(success: boolean): void;
}
const DECORATION_KEY = 'breakpointwidgetdecoration';

function isPositionInCurlyBracketBlock(input: IActiveCodeEditor): boolean {
	const model = input.getModel();
	const bracketPairs = model.bracketPairs.getBracketPairsInRange(Range.fromPositions(input.getPosition()));
	return bracketPairs.some(p => p.openingBracketInfo.bracketText === '{');
}

function createDecorations(theme: IColorTheme, placeHolder: string): IDecorationOptions[] {
	const transparentForeground = theme.getColor(editorForeground)?.transparent(0.4);
	return [{
		range: {
			startLineNumber: 0,
			endLineNumber: 0,
			startColumn: 0,
			endColumn: 1
		},
		renderOptions: {
			after: {
				contentText: placeHolder,
				color: transparentForeground ? transparentForeground.toString() : undefined
			}
		}
	}];
}

export class BreakpointWidget extends ZoneWidget implements IPrivateBreakpointWidgetService {
	declare readonly _serviceBrand: undefined;

	private selectContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private selectBreakpointContainer!: HTMLElement;
	private input!: IActiveCodeEditor;
	private selectBreakpointBox!: SelectBox;
	private selectModeBox?: SelectBox;
	private toDispose: lifecycle.IDisposable[];
	private conditionInput = '';
	private hitCountInput = '';
	private logMessageInput = '';
	private modeInput?: DebugProtocol.BreakpointMode;
	private breakpoint: IBreakpoint | undefined;
	private context: Context;
	private heightInPx: number | undefined;
	private triggeredByBreakpointInput: IBreakpoint | undefined;

	constructor(editor: ICodeEditor, private lineNumber: number, private column: number | undefined, context: Context | undefined,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IDebugService private readonly debugService: IDebugService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILabelService private readonly labelService: ILabelService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IHoverService private readonly hoverService: IHoverService
	) {
		super(editor, { showFrame: true, showArrow: false, frameWidth: 1, isAccessible: true });

		this.toDispose = [];
		const model = this.editor.getModel();
		if (model) {
			const uri = model.uri;
			const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber: this.lineNumber, column: this.column, uri });
			this.breakpoint = breakpoints.length ? breakpoints[0] : undefined;
		}

		if (context === undefined) {
			if (this.breakpoint && !this.breakpoint.condition && !this.breakpoint.hitCondition && this.breakpoint.logMessage) {
				this.context = Context.LOG_MESSAGE;
			} else if (this.breakpoint && !this.breakpoint.condition && this.breakpoint.hitCondition) {
				this.context = Context.HIT_COUNT;
			} else if (this.breakpoint && this.breakpoint.triggeredBy) {
				this.context = Context.TRIGGER_POINT;
			} else {
				this.context = Context.CONDITION;
			}
		} else {
			this.context = context;
		}

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(e => {
			if (this.breakpoint && e && e.removed && e.removed.indexOf(this.breakpoint) >= 0) {
				this.dispose();
			}
		}));
		this.codeEditorService.registerDecorationType('breakpoint-widget', DECORATION_KEY, {});

		this.create();
	}

	private get placeholder(): string {
		const acceptString = this.keybindingService.lookupKeybinding(AcceptBreakpointWidgetInputAction.ID)?.getLabel() || 'Enter';
		const closeString = this.keybindingService.lookupKeybinding(CloseBreakpointWidgetCommand.ID)?.getLabel() || 'Escape';
		switch (this.context) {
			case Context.LOG_MESSAGE:
				return nls.localize('breakpointWidgetLogMessagePlaceholder', "Message to log when breakpoint is hit. Expressions within {} are interpolated. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
			case Context.HIT_COUNT:
				return nls.localize('breakpointWidgetHitCountPlaceholder', "Break when hit count condition is met. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
			default:
				return nls.localize('breakpointWidgetExpressionPlaceholder', "Break when expression evaluates to true. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
		}
	}

	private getInputValue(breakpoint: IBreakpoint | undefined): string {
		switch (this.context) {
			case Context.LOG_MESSAGE:
				return breakpoint && breakpoint.logMessage ? breakpoint.logMessage : this.logMessageInput;
			case Context.HIT_COUNT:
				return breakpoint && breakpoint.hitCondition ? breakpoint.hitCondition : this.hitCountInput;
			default:
				return breakpoint && breakpoint.condition ? breakpoint.condition : this.conditionInput;
		}
	}

	private rememberInput(): void {
		if (this.context !== Context.TRIGGER_POINT) {
			const value = this.input.getModel().getValue();
			switch (this.context) {
				case Context.LOG_MESSAGE:
					this.logMessageInput = value;
					break;
				case Context.HIT_COUNT:
					this.hitCountInput = value;
					break;
				default:
					this.conditionInput = value;
			}
		}
	}

	private setInputMode(): void {
		if (this.editor.hasModel()) {
			// Use plaintext language for log messages, otherwise respect underlying editor language #125619
			const languageId = this.context === Context.LOG_MESSAGE ? PLAINTEXT_LANGUAGE_ID : this.editor.getModel().getLanguageId();
			this.input.getModel().setLanguage(languageId);
		}
	}

	override show(rangeOrPos: IRange | IPosition): void {
		const lineNum = this.input.getModel().getLineCount();
		super.show(rangeOrPos, lineNum + 1);
	}

	fitHeightToContent(): void {
		const lineNum = this.input.getModel().getLineCount();
		this._relayout(lineNum + 1);
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('breakpoint-widget');
		const selectBox = new SelectBox([
			{ text: nls.localize('expression', "Expression") },
			{ text: nls.localize('hitCount', "Hit Count") },
			{ text: nls.localize('logMessage', "Log Message") },
			{ text: nls.localize('triggeredBy', "Wait for Breakpoint") },
		] satisfies ISelectOptionItem[], this.context, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize('breakpointType', 'Breakpoint Type') });
		this.selectContainer = $('.breakpoint-select-container');
		selectBox.render(dom.append(container, this.selectContainer));
		selectBox.onDidSelect(e => {
			this.rememberInput();
			this.context = e.index;
			this.updateContextInput();
		});

		this.createModesInput(container);

		this.inputContainer = $('.inputContainer');
		this.toDispose.push(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.inputContainer, this.placeholder));
		this.createBreakpointInput(dom.append(container, this.inputContainer));

		this.input.getModel().setValue(this.getInputValue(this.breakpoint));
		this.toDispose.push(this.input.getModel().onDidChangeContent(() => {
			this.fitHeightToContent();
		}));
		this.input.setPosition({ lineNumber: 1, column: this.input.getModel().getLineMaxColumn(1) });

		this.createTriggerBreakpointInput(container);

		this.updateContextInput();
		// Due to an electron bug we have to do the timeout, otherwise we do not get focus
		setTimeout(() => this.focusInput(), 150);
	}

	private createModesInput(container: HTMLElement) {
		const modes = this.debugService.getModel().getBreakpointModes('source');
		if (modes.length <= 1) {
			return;
		}

		const sb = this.selectModeBox = new SelectBox(
			[
				{ text: nls.localize('bpMode', 'Mode'), isDisabled: true },
				...modes.map(mode => ({ text: mode.label, description: mode.description })),
			],
			modes.findIndex(m => m.mode === this.breakpoint?.mode) + 1,
			this.contextViewService,
			defaultSelectBoxStyles,
		);
		this.toDispose.push(sb);
		this.toDispose.push(sb.onDidSelect(e => {
			this.modeInput = modes[e.index - 1];
		}));

		const modeWrapper = $('.select-mode-container');
		const selectionWrapper = $('.select-box-container');
		dom.append(modeWrapper, selectionWrapper);
		sb.render(selectionWrapper);
		dom.append(container, modeWrapper);
	}

	private createTriggerBreakpointInput(container: HTMLElement) {
		const breakpoints = this.debugService.getModel().getBreakpoints().filter(bp => bp !== this.breakpoint && !bp.logMessage);
		const breakpointOptions: ISelectOptionItem[] = [
			{ text: nls.localize('noTriggerByBreakpoint', 'None'), isDisabled: true },
			...breakpoints.map(bp => ({
				text: `${this.labelService.getUriLabel(bp.uri, { relative: true })}: ${bp.lineNumber}`,
				description: nls.localize('triggerByLoading', 'Loading...')
			})),
		];

		const index = breakpoints.findIndex((bp) => this.breakpoint?.triggeredBy === bp.getId());
		for (const [i, bp] of breakpoints.entries()) {
			this.textModelService.createModelReference(bp.uri).then(ref => {
				try {
					breakpointOptions[i + 1].description = ref.object.textEditorModel.getLineContent(bp.lineNumber).trim();
				} finally {
					ref.dispose();
				}
			}).catch(() => {
				breakpointOptions[i + 1].description = nls.localize('noBpSource', 'Could not load source.');
			});
		}

		const selectBreakpointBox = this.selectBreakpointBox = new SelectBox(breakpointOptions, index + 1, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize('selectBreakpoint', 'Select breakpoint') });
		selectBreakpointBox.onDidSelect(e => {
			if (e.index === 0) {
				this.triggeredByBreakpointInput = undefined;
			} else {
				this.triggeredByBreakpointInput = breakpoints[e.index - 1];
			}
		});
		this.toDispose.push(selectBreakpointBox);
		this.selectBreakpointContainer = $('.select-breakpoint-container');
		this.toDispose.push(dom.addDisposableListener(this.selectBreakpointContainer, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Escape)) {
				this.close(false);
			}
		}));

		const selectionWrapper = $('.select-box-container');
		dom.append(this.selectBreakpointContainer, selectionWrapper);
		selectBreakpointBox.render(selectionWrapper);

		dom.append(container, this.selectBreakpointContainer);

		const closeButton = new Button(this.selectBreakpointContainer, defaultButtonStyles);
		closeButton.label = nls.localize('ok', "Ok");
		this.toDispose.push(closeButton.onDidClick(() => this.close(true)));
		this.toDispose.push(closeButton);
	}

	private updateContextInput() {
		if (this.context === Context.TRIGGER_POINT) {
			this.inputContainer.hidden = true;
			this.selectBreakpointContainer.hidden = false;
		} else {
			this.inputContainer.hidden = false;
			this.selectBreakpointContainer.hidden = true;
			this.setInputMode();
			const value = this.getInputValue(this.breakpoint);
			this.input.getModel().setValue(value);
			this.focusInput();
		}
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {
		this.heightInPx = heightInPixel;
		this.input.layout({ height: heightInPixel, width: widthInPixel - 113 });
		this.centerInputVertically();
	}

	protected override _onWidth(widthInPixel: number): void {
		if (typeof this.heightInPx === 'number') {
			this._doLayout(this.heightInPx, widthInPixel);
		}
	}

	private createBreakpointInput(container: HTMLElement): void {
		const scopedContextKeyService = this.contextKeyService.createScoped(container);
		this.toDispose.push(scopedContextKeyService);

		const scopedInstatiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService],
			[IPrivateBreakpointWidgetService, this]
		));
		this.toDispose.push(scopedInstatiationService);

		const options = this.createEditorOptions();
		const codeEditorWidgetOptions = getSimpleCodeEditorWidgetOptions();
		this.input = <IActiveCodeEditor>scopedInstatiationService.createInstance(CodeEditorWidget, container, options, codeEditorWidgetOptions);
		CONTEXT_IN_BREAKPOINT_WIDGET.bindTo(scopedContextKeyService).set(true);
		const model = this.modelService.createModel('', null, uri.parse(`${DEBUG_SCHEME}:${this.editor.getId()}:breakpointinput`), true);
		if (this.editor.hasModel()) {
			model.setLanguage(this.editor.getModel().getLanguageId());
		}
		this.input.setModel(model);
		this.setInputMode();
		this.toDispose.push(model);
		const setDecorations = () => {
			const value = this.input.getModel().getValue();
			const decorations = !!value ? [] : createDecorations(this.themeService.getColorTheme(), this.placeholder);
			this.input.setDecorationsByType('breakpoint-widget', DECORATION_KEY, decorations);
		};
		this.input.getModel().onDidChangeContent(() => setDecorations());
		this.themeService.onDidColorThemeChange(() => setDecorations());

		this.toDispose.push(this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'breakpointWidget',
			provideCompletionItems: (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken): Promise<CompletionList> => {
				let suggestionsPromise: Promise<CompletionList>;
				const underlyingModel = this.editor.getModel();
				if (underlyingModel && (this.context === Context.CONDITION || (this.context === Context.LOG_MESSAGE && isPositionInCurlyBracketBlock(this.input)))) {
					suggestionsPromise = provideSuggestionItems(this.languageFeaturesService.completionProvider, underlyingModel, new Position(this.lineNumber, 1), new CompletionOptions(undefined, new Set<CompletionItemKind>().add(CompletionItemKind.Snippet)), _context, token).then(suggestions => {

						let overwriteBefore = 0;
						if (this.context === Context.CONDITION) {
							overwriteBefore = position.column - 1;
						} else {
							// Inside the currly brackets, need to count how many useful characters are behind the position so they would all be taken into account
							const value = this.input.getModel().getValue();
							while ((position.column - 2 - overwriteBefore >= 0) && value[position.column - 2 - overwriteBefore] !== '{' && value[position.column - 2 - overwriteBefore] !== ' ') {
								overwriteBefore++;
							}
						}

						return {
							suggestions: suggestions.items.map(s => {
								s.completion.range = Range.fromPositions(position.delta(0, -overwriteBefore), position);
								return s.completion;
							})
						};
					});
				} else {
					suggestionsPromise = Promise.resolve({ suggestions: [] });
				}

				return suggestionsPromise;
			}
		}));

		this.toDispose.push(this._configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('editor.fontSize') || e.affectsConfiguration('editor.lineHeight')) {
				this.input.updateOptions(this.createEditorOptions());
				this.centerInputVertically();
			}
		}));
	}

	private createEditorOptions(): IEditorOptions {
		const editorConfig = this._configurationService.getValue<IEditorOptions>('editor');
		const options = getSimpleEditorOptions(this._configurationService);
		options.fontSize = editorConfig.fontSize;
		options.fontFamily = editorConfig.fontFamily;
		options.lineHeight = editorConfig.lineHeight;
		options.fontLigatures = editorConfig.fontLigatures;
		options.ariaLabel = this.placeholder;
		return options;
	}

	private centerInputVertically() {
		if (this.container && typeof this.heightInPx === 'number') {
			const lineHeight = this.input.getOption(EditorOption.lineHeight);
			const lineNum = this.input.getModel().getLineCount();
			const newTopMargin = (this.heightInPx - lineNum * lineHeight) / 2;
			this.inputContainer.style.marginTop = newTopMargin + 'px';
		}
	}

	close(success: boolean): void {
		if (success) {
			// if there is already a breakpoint on this location - remove it.

			let condition: string | undefined = undefined;
			let hitCondition: string | undefined = undefined;
			let logMessage: string | undefined = undefined;
			let triggeredBy: string | undefined = undefined;
			let mode: string | undefined = undefined;
			let modeLabel: string | undefined = undefined;

			this.rememberInput();

			if (this.conditionInput || this.context === Context.CONDITION) {
				condition = this.conditionInput;
			}
			if (this.hitCountInput || this.context === Context.HIT_COUNT) {
				hitCondition = this.hitCountInput;
			}
			if (this.logMessageInput || this.context === Context.LOG_MESSAGE) {
				logMessage = this.logMessageInput;
			}
			if (this.selectModeBox) {
				mode = this.modeInput?.mode;
				modeLabel = this.modeInput?.label;
			}
			if (this.context === Context.TRIGGER_POINT) {
				// currently, trigger points don't support additional conditions:
				condition = undefined;
				hitCondition = undefined;
				logMessage = undefined;
				triggeredBy = this.triggeredByBreakpointInput?.getId();
			}

			if (this.breakpoint) {
				const data = new Map<string, IBreakpointUpdateData>();
				data.set(this.breakpoint.getId(), {
					condition,
					hitCondition,
					logMessage,
					triggeredBy,
					mode,
					modeLabel,
				});
				this.debugService.updateBreakpoints(this.breakpoint.originalUri, data, false).then(undefined, onUnexpectedError);
			} else {
				const model = this.editor.getModel();
				if (model) {
					this.debugService.addBreakpoints(model.uri, [{
						lineNumber: this.lineNumber,
						column: this.column,
						enabled: true,
						condition,
						hitCondition,
						logMessage,
						triggeredBy,
						mode,
						modeLabel,
					}]);
				}
			}
		}

		this.dispose();
	}

	private focusInput() {
		if (this.context === Context.TRIGGER_POINT) {
			this.selectBreakpointBox.focus();
		} else {
			this.input.focus();
		}
	}

	override dispose(): void {
		super.dispose();
		this.input.dispose();
		lifecycle.dispose(this.toDispose);
		setTimeout(() => this.editor.focus(), 0);
	}
}

class AcceptBreakpointWidgetInputAction extends EditorCommand {
	static ID = 'breakpointWidget.action.acceptInput';
	constructor() {
		super({
			id: AcceptBreakpointWidgetInputAction.ID,
			precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
			kbOpts: {
				kbExpr: CONTEXT_IN_BREAKPOINT_WIDGET,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		accessor.get(IPrivateBreakpointWidgetService).close(true);
	}
}

class CloseBreakpointWidgetCommand extends EditorCommand {
	static ID = 'closeBreakpointWidget';
	constructor() {
		super({
			id: CloseBreakpointWidgetCommand.ID,
			precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape],
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const debugContribution = editor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
		if (debugContribution) {
			// if focus is in outer editor we need to use the debug contribution to close
			return debugContribution.closeBreakpointWidget();
		}

		accessor.get(IPrivateBreakpointWidgetService).close(false);
	}
}

registerEditorCommand(new AcceptBreakpointWidgetInputAction());
registerEditorCommand(new CloseBreakpointWidgetCommand());
