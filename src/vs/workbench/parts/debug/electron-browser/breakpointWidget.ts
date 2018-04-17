/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/breakpointWidget';
import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { SelectBox } from 'vs/base/browser/ui/selectBox/selectBox';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { Position } from 'vs/editor/common/core/position';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDebugService, IBreakpoint, BreakpointWidgetContext as Context, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, DEBUG_SCHEME, IDebugEditorContribution, EDITOR_CONTRIBUTION_ID, CONTEXT_IN_BREAKPOINT_WIDGET } from 'vs/workbench/parts/debug/common/debug';
import { attachSelectBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SimpleDebugEditor } from 'vs/workbench/parts/debug/electron-browser/simpleDebugEditor';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IModelService } from 'vs/editor/common/services/modelService';
import uri from 'vs/base/common/uri';
import { SuggestRegistry, ISuggestResult, SuggestContext } from 'vs/editor/common/modes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITextModel } from 'vs/editor/common/model';
import { wireCancellationToken } from 'vs/base/common/async';
import { provideSuggestionItems } from 'vs/editor/contrib/suggest/suggest';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { transparent, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';

const $ = dom.$;
const IPrivateBreakopintWidgetService = createDecorator<IPrivateBreakopintWidgetService>('privateBreakopintWidgetService');
export interface IPrivateBreakopintWidgetService {
	_serviceBrand: any;
	close(success: boolean): void;
}
const DECORATION_KEY = 'breakpointwidgetdecoration';

export class BreakpointWidget extends ZoneWidget implements IPrivateBreakopintWidgetService {
	public _serviceBrand: any;

	private selectContainer: HTMLElement;
	private input: SimpleDebugEditor;
	private toDispose: lifecycle.IDisposable[];
	private conditionInput = '';
	private hitCountInput = '';
	private logMessageInput = '';
	private breakpoint: IBreakpoint;

	constructor(editor: ICodeEditor, private lineNumber: number, private column: number, private context: Context,
		@IContextViewService private contextViewService: IContextViewService,
		@IDebugService private debugService: IDebugService,
		@IThemeService private themeService: IThemeService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModelService private modelService: IModelService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
	) {
		super(editor, { showFrame: true, showArrow: false, frameWidth: 1 });

		this.toDispose = [];
		const uri = this.editor.getModel().uri;
		this.breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === this.lineNumber && bp.uri.toString() === uri.toString()).pop();

		if (this.context === undefined) {
			if (this.breakpoint && !this.breakpoint.condition && !this.breakpoint.hitCondition && this.breakpoint.logMessage) {
				this.context = Context.LOG_MESSAGE;
			} else if (this.breakpoint && !this.breakpoint.condition && this.breakpoint.hitCondition) {
				this.context = Context.HIT_COUNT;
			} else {
				this.context = Context.CONDITION;
			}
		}

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(e => {
			if (this.breakpoint && e.removed && e.removed.indexOf(this.breakpoint) >= 0) {
				this.dispose();
			}
		}));
		this.codeEditorService.registerDecorationType(DECORATION_KEY, {});

		this.create();
	}

	private get placeholder(): string {
		switch (this.context) {
			case Context.LOG_MESSAGE:
				return nls.localize('breakpointWidgetLogMessagePlaceholder', "Message to log when breakpoint is hit. Expressions within {} are interpolated. 'Enter' to accept, 'esc' to cancel.");
			case Context.HIT_COUNT:
				return nls.localize('breakpointWidgetHitCountPlaceholder', "Break when hit count condition is met. 'Enter' to accept, 'esc' to cancel.");
			default:
				return nls.localize('breakpointWidgetExpressionPlaceholder', "Break when expression evaluates to true. 'Enter' to accept, 'esc' to cancel.");
		}
	}

	private getInputValue(breakpoint: IBreakpoint): string {
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

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('breakpoint-widget');
		const selectBox = new SelectBox([nls.localize('expression', "Expression"), nls.localize('hitCount', "Hit Count"), nls.localize('logMessage', "Log Message")], this.context, this.contextViewService);
		this.toDispose.push(attachSelectBoxStyler(selectBox, this.themeService));
		this.selectContainer = $('.breakpoint-select-container');
		selectBox.render(dom.append(container, this.selectContainer));
		selectBox.onDidSelect(e => {
			this.rememberInput();
			this.context = e.index;

			const value = this.getInputValue(this.breakpoint);
			this.input.getModel().setValue(value);
		});

		this.createBreakpointInput(dom.append(container, $('.inputContainer')));

		this.input.getModel().setValue(this.getInputValue(this.breakpoint));
		this.input.setPosition({ lineNumber: 1, column: this.input.getModel().getLineMaxColumn(1) });
		// Due to an electron bug we have to do the timeout, otherwise we do not get focus
		setTimeout(() => this.input.focus(), 100);
	}

	public close(success: boolean): void {
		if (success) {
			// if there is already a breakpoint on this location - remove it.

			let condition = this.breakpoint && this.breakpoint.condition;
			let hitCondition = this.breakpoint && this.breakpoint.hitCondition;
			let logMessage = this.breakpoint && this.breakpoint.logMessage;
			this.rememberInput();

			if (this.conditionInput) {
				condition = this.conditionInput;
			}
			if (this.hitCountInput) {
				hitCondition = this.hitCountInput;
			}
			if (this.logMessageInput) {
				logMessage = this.logMessageInput;
			}

			if (this.breakpoint) {
				this.debugService.updateBreakpoints(this.breakpoint.uri, {
					[this.breakpoint.getId()]: {
						condition,
						hitCondition,
						verified: this.breakpoint.verified,
						logMessage
					}
				}, false);
			} else {
				this.debugService.addBreakpoints(this.editor.getModel().uri, [{
					lineNumber: this.lineNumber,
					column: this.breakpoint ? this.breakpoint.column : undefined,
					enabled: true,
					condition,
					hitCondition,
					logMessage
				}]).done(null, errors.onUnexpectedError);
			}
		}

		this.dispose();
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this.input.layout({ height: 18, width: widthInPixel - 113 });
	}

	private createBreakpointInput(container: HTMLElement): void {
		const scopedContextKeyService = this.contextKeyService.createScoped(container);
		this.toDispose.push(scopedContextKeyService);

		const scopedInstatiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService], [IPrivateBreakopintWidgetService, this]));

		const options = SimpleDebugEditor.getEditorOptions();
		this.input = scopedInstatiationService.createInstance(SimpleDebugEditor, container, options);
		CONTEXT_IN_BREAKPOINT_WIDGET.bindTo(scopedContextKeyService).set(true);
		const model = this.modelService.createModel('', null, uri.parse(`${DEBUG_SCHEME}:breakpointinput`), true);
		this.input.setModel(model);
		this.toDispose.push(model);
		const setDecorations = () => {
			const value = this.input.getModel().getValue();
			const decorations = !!value ? [] : this.createDecorations();
			this.input.setDecorations(DECORATION_KEY, decorations);
		};
		this.input.getModel().onDidChangeContent(() => setDecorations());
		this.themeService.onThemeChange(() => setDecorations());

		this.toDispose.push(SuggestRegistry.register({ scheme: DEBUG_SCHEME, hasAccessToAllModels: true }, {
			provideCompletionItems: (model: ITextModel, position: Position, _context: SuggestContext, token: CancellationToken): Thenable<ISuggestResult> => {
				let suggestionsPromise: TPromise<ISuggestResult>;
				if (this.context === Context.CONDITION || this.context === Context.LOG_MESSAGE && this.isCurlyBracketOpen()) {
					suggestionsPromise = provideSuggestionItems(this.editor.getModel(), new Position(this.lineNumber, this.column), 'none', undefined, _context).then(suggestions => {
						return {
							suggestions: suggestions.map(s => {
								if (this.context === Context.CONDITION) {
									s.suggestion.overwriteBefore = position.column - 1;
									s.suggestion.overwriteAfter = 0;
								}

								return s.suggestion;
							})
						};
					});
				} else {
					suggestionsPromise = TPromise.as({ suggestions: [] });
				}

				return wireCancellationToken(token, suggestionsPromise);
			}
		}));
	}

	private createDecorations(): IDecorationOptions[] {
		return [{
			range: {
				startLineNumber: 0,
				endLineNumber: 0,
				startColumn: 0,
				endColumn: 1
			},
			renderOptions: {
				after: {
					contentText: this.placeholder,
					color: transparent(editorForeground, 0.4)(this.themeService.getTheme()).toString()
				}
			}
		}];
	}

	private isCurlyBracketOpen(): boolean {
		const value = this.input.getModel().getValue();
		for (let i = this.input.getPosition().column - 2; i >= 0; i--) {
			if (value[i] === '{') {
				return true;
			}

			if (value[i] === '}') {
				return false;
			}
		}

		return false;
	}

	public dispose(): void {
		super.dispose();
		this.input.dispose();
		lifecycle.dispose(this.toDispose);
		setTimeout(() => this.editor.focus(), 0);
	}
}

class AcceptBreakpointWidgetInputAction extends EditorCommand {

	constructor() {
		super({
			id: 'breakpointWidget.action.acceptInput',
			precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
			kbOpts: {
				kbExpr: CONTEXT_IN_BREAKPOINT_WIDGET,
				primary: KeyCode.Enter
			}
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor): void {
		accessor.get(IPrivateBreakopintWidgetService).close(true);
	}
}

class CloseBreakpointWidgetCommand extends EditorCommand {

	constructor() {
		super({
			id: 'closeBreakpointWidget',
			precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			}
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const debugContribution = editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID);
		if (debugContribution) {
			// if focus is in outer editor we need to use the debug contribution to close
			return debugContribution.closeBreakpointWidget();
		}

		accessor.get(IPrivateBreakopintWidgetService).close(false);
	}
}

registerEditorCommand(new AcceptBreakpointWidgetInputAction());
registerEditorCommand(new CloseBreakpointWidgetCommand());
