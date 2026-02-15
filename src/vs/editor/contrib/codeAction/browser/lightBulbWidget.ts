/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import './lightBulbWidget.css';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IPosition } from '../../../common/core/position.js';
import { GlyphMarginLane, IModelDecorationsChangeAccessor, TrackedRangeStickiness } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { computeIndentLevel } from '../../../common/model/utils.js';
import { autoFixCommandId, quickFixCommandId } from './codeAction.js';
import { CodeActionSet, CodeActionTrigger } from '../common/types.js';
import * as nls from '../../../../nls.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Range } from '../../../common/core/range.js';

const GUTTER_LIGHTBULB_ICON = registerIcon('gutter-lightbulb', Codicon.lightBulb, nls.localize('gutterLightbulbWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor.'));
const GUTTER_LIGHTBULB_AUTO_FIX_ICON = registerIcon('gutter-lightbulb-auto-fix', Codicon.lightbulbAutofix, nls.localize('gutterLightbulbAutoFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and a quick fix is available.'));
const GUTTER_LIGHTBULB_AIFIX_ICON = registerIcon('gutter-lightbulb-sparkle', Codicon.lightbulbSparkle, nls.localize('gutterLightbulbAIFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix is available.'));
const GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON = registerIcon('gutter-lightbulb-aifix-auto-fix', Codicon.lightbulbSparkleAutofix, nls.localize('gutterLightbulbAIFixAutoFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available.'));
const GUTTER_SPARKLE_FILLED_ICON = registerIcon('gutter-lightbulb-sparkle-filled', Codicon.sparkleFilled, nls.localize('gutterLightbulbSparkleFilledWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available.'));

export interface LightBulbInfo {
	readonly actions: CodeActionSet;
	readonly trigger: CodeActionTrigger;
	readonly icon: ThemeIcon;
	readonly autoRun: boolean;
	readonly title: string;
	readonly isGutter: boolean;
}

namespace LightBulbState {

	export const enum Type {
		Hidden,
		Showing,
	}

	export const Hidden = { type: Type.Hidden } as const;

	export class Showing {
		readonly type = Type.Showing;

		constructor(
			public readonly actions: CodeActionSet,
			public readonly trigger: CodeActionTrigger,
			public readonly editorPosition: IPosition,
			public readonly widgetPosition: IContentWidgetPosition,
		) { }
	}

	export type State = typeof Hidden | Showing;
}

export class LightBulbWidget extends Disposable implements IContentWidget {
	private _gutterDecorationID: string | undefined;

	private static readonly GUTTER_DECORATION = ModelDecorationOptions.register({
		description: 'codicon-gutter-lightbulb-decoration',
		glyphMarginClassName: ThemeIcon.asClassName(Codicon.lightBulb),
		glyphMargin: { position: GlyphMarginLane.Left },
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	public static readonly ID = 'editor.contrib.lightbulbWidget';

	private static readonly _posPref = [ContentWidgetPositionPreference.EXACT];

	private readonly _domNode: HTMLElement;

	private readonly _onClick = this._register(new Emitter<{ readonly x: number; readonly y: number; readonly actions: CodeActionSet; readonly trigger: CodeActionTrigger }>());
	public readonly onClick = this._onClick.event;

	private readonly _state = observableValue<LightBulbState.State>(this, LightBulbState.Hidden);
	private readonly _gutterState = observableValue<LightBulbState.State>(this, LightBulbState.Hidden);

	private readonly _combinedInfo = derived(this, reader => {
		const gutterState = this._gutterState.read(reader);
		if (gutterState.type === LightBulbState.Type.Showing) {
			return LightBulbWidget._computeLightBulbInfo(gutterState, true, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
		}
		const state = this._state.read(reader);
		if (state.type === LightBulbState.Type.Showing) {
			return LightBulbWidget._computeLightBulbInfo(state, false, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
		}
		return undefined;
	});

	public readonly lightBulbInfo: IObservable<LightBulbInfo | undefined> = this._combinedInfo;

	private _iconClasses: string[] = [];

	private readonly lightbulbClasses = [
		'codicon-' + GUTTER_LIGHTBULB_ICON.id,
		'codicon-' + GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON.id,
		'codicon-' + GUTTER_LIGHTBULB_AUTO_FIX_ICON.id,
		'codicon-' + GUTTER_LIGHTBULB_AIFIX_ICON.id,
		'codicon-' + GUTTER_SPARKLE_FILLED_ICON.id
	];

	private readonly _preferredKbLabel = observableValue<string | undefined>(this, undefined);
	private readonly _quickFixKbLabel = observableValue<string | undefined>(this, undefined);

	private gutterDecoration: ModelDecorationOptions = LightBulbWidget.GUTTER_DECORATION;

	private static _computeLightBulbInfo(state: LightBulbState.State, forGutter: boolean, preferredKbLabel: string | undefined, quickFixKbLabel: string | undefined): LightBulbInfo | undefined {
		if (state.type !== LightBulbState.Type.Showing) {
			return undefined;
		}

		const { actions, trigger } = state;
		let icon: ThemeIcon;
		let autoRun = false;
		if (actions.allAIFixes) {
			icon = forGutter ? GUTTER_SPARKLE_FILLED_ICON : Codicon.sparkleFilled;
			if (actions.validActions.length === 1) {
				autoRun = true;
			}
		} else if (actions.hasAutoFix) {
			if (actions.hasAIFix) {
				icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON : Codicon.lightbulbSparkleAutofix;
			} else {
				icon = forGutter ? GUTTER_LIGHTBULB_AUTO_FIX_ICON : Codicon.lightbulbAutofix;
			}
		} else if (actions.hasAIFix) {
			icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_ICON : Codicon.lightbulbSparkle;
		} else {
			icon = forGutter ? GUTTER_LIGHTBULB_ICON : Codicon.lightBulb;
		}

		let title: string;
		if (autoRun) {
			title = nls.localize('codeActionAutoRun', "Run: {0}", actions.validActions[0].action.title);
		} else if (actions.hasAutoFix && preferredKbLabel) {
			title = nls.localize('preferredcodeActionWithKb', "Show Code Actions. Preferred Quick Fix Available ({0})", preferredKbLabel);
		} else if (!actions.hasAutoFix && quickFixKbLabel) {
			title = nls.localize('codeActionWithKb', "Show Code Actions ({0})", quickFixKbLabel);
		} else {
			title = nls.localize('codeAction', "Show Code Actions");
		}

		return { actions, trigger, icon, autoRun, title, isGutter: forGutter };
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();

		this._domNode = dom.$('div.lightBulbWidget');
		this._domNode.role = 'listbox';
		this._register(Gesture.ignoreTarget(this._domNode));

		this._editor.addContentWidget(this);

		this._register(this._editor.onDidChangeModelContent(_ => {
			// cancel when the line in question has been removed
			const editorModel = this._editor.getModel();
			const state = this._state.get();
			if (state.type !== LightBulbState.Type.Showing || !editorModel || state.editorPosition.lineNumber >= editorModel.getLineCount()) {
				this.hide();
			}

			const gutterState = this._gutterState.get();
			if (gutterState.type !== LightBulbState.Type.Showing || !editorModel || gutterState.editorPosition.lineNumber >= editorModel.getLineCount()) {
				this.gutterHide();
			}
		}));

		this._register(dom.addStandardDisposableGenericMouseDownListener(this._domNode, e => {
			const state = this._state.get();
			if (state.type !== LightBulbState.Type.Showing) {
				return;
			}

			// Make sure that focus / cursor location is not lost when clicking widget icon
			this._editor.focus();
			e.preventDefault();

			// a bit of extra work to make sure the menu
			// doesn't cover the line-text
			const { top, height } = dom.getDomNodePagePosition(this._domNode);
			const lineHeight = this._editor.getOption(EditorOption.lineHeight);

			let pad = Math.floor(lineHeight / 3);
			if (state.widgetPosition.position !== null && state.widgetPosition.position.lineNumber < state.editorPosition.lineNumber) {
				pad += lineHeight;
			}

			this._onClick.fire({
				x: e.posx,
				y: top + height + pad,
				actions: state.actions,
				trigger: state.trigger,
			});
		}));

		this._register(dom.addDisposableListener(this._domNode, 'mouseenter', (e: MouseEvent) => {
			if ((e.buttons & 1) !== 1) {
				return;
			}
			// mouse enters lightbulb while the primary/left button
			// is being pressed -> hide the lightbulb
			this.hide();
		}));


		this._register(Event.runAndSubscribe(this._keybindingService.onDidUpdateKeybindings, () => {
			this._preferredKbLabel.set(this._keybindingService.lookupKeybinding(autoFixCommandId)?.getLabel() ?? undefined, undefined);
			this._quickFixKbLabel.set(this._keybindingService.lookupKeybinding(quickFixCommandId)?.getLabel() ?? undefined, undefined);
		}));

		// Autorun to update the DOM based on state changes
		this._register(autorun(reader => {
			const info = this._combinedInfo.read(reader);
			this._updateLightBulbTitleAndIcon(info);
			this._updateGutterDecorationOptions(info);
		}));

		this._register(this._editor.onMouseDown(async (e: IEditorMouseEvent) => {

			if (!e.target.element || !this.lightbulbClasses.some(cls => e.target.element && e.target.element.classList.contains(cls))) {
				return;
			}

			const gutterState = this._gutterState.get();
			if (gutterState.type !== LightBulbState.Type.Showing) {
				return;
			}

			// Make sure that focus / cursor location is not lost when clicking widget icon
			this._editor.focus();

			// a bit of extra work to make sure the menu
			// doesn't cover the line-text
			const { top, height } = dom.getDomNodePagePosition(e.target.element);
			const lineHeight = this._editor.getOption(EditorOption.lineHeight);

			let pad = Math.floor(lineHeight / 3);
			if (gutterState.widgetPosition.position !== null && gutterState.widgetPosition.position.lineNumber < gutterState.editorPosition.lineNumber) {
				pad += lineHeight;
			}

			this._onClick.fire({
				x: e.event.posx,
				y: top + height + pad,
				actions: gutterState.actions,
				trigger: gutterState.trigger,
			});
		}));
	}

	override dispose(): void {
		super.dispose();
		this._editor.removeContentWidget(this);
		if (this._gutterDecorationID) {
			this._removeGutterDecoration(this._gutterDecorationID);
		}
	}

	getId(): string {
		return 'LightBulbWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		const state = this._state.get();
		return state.type === LightBulbState.Type.Showing ? state.widgetPosition : null;
	}

	public update(actions: CodeActionSet, trigger: CodeActionTrigger, atPosition: IPosition) {
		if (actions.validActions.length <= 0) {
			this.gutterHide();
			return this.hide();
		}

		const hasTextFocus = this._editor.hasTextFocus();
		if (!hasTextFocus) {
			this.gutterHide();
			return this.hide();
		}

		const options = this._editor.getOptions();
		if (!options.get(EditorOption.lightbulb).enabled) {
			this.gutterHide();
			return this.hide();
		}


		const model = this._editor.getModel();
		if (!model) {
			this.gutterHide();
			return this.hide();
		}

		const { lineNumber, column } = model.validatePosition(atPosition);

		const tabSize = model.getOptions().tabSize;
		const fontInfo = this._editor.getOptions().get(EditorOption.fontInfo);
		const lineContent = model.getLineContent(lineNumber);
		const indent = computeIndentLevel(lineContent, tabSize);
		const lineHasSpace = fontInfo.spaceWidth * indent > 22;
		const isFolded = (lineNumber: number) => {
			return lineNumber > 2 && this._editor.getTopForLineNumber(lineNumber) === this._editor.getTopForLineNumber(lineNumber - 1);
		};

		// Check for glyph margin decorations of any kind
		const currLineDecorations = this._editor.getLineDecorations(lineNumber);
		let hasDecoration = false;
		if (currLineDecorations) {
			for (const decoration of currLineDecorations) {
				const glyphClass = decoration.options.glyphMarginClassName;

				if (glyphClass && !this.lightbulbClasses.some(className => glyphClass.includes(className))) {
					hasDecoration = true;
					break;
				}
			}
		}

		let effectiveLineNumber = lineNumber;
		let effectiveColumnNumber = 1;
		if (!lineHasSpace) {
			// Checks if line is empty or starts with any amount of whitespace
			const isLineEmptyOrIndented = (lineNumber: number): boolean => {
				const lineContent = model.getLineContent(lineNumber);
				return /^\s*$|^\s+/.test(lineContent) || lineContent.length <= effectiveColumnNumber;
			};

			if (lineNumber > 1 && !isFolded(lineNumber - 1)) {
				const lineCount = model.getLineCount();
				const endLine = lineNumber === lineCount;
				const prevLineEmptyOrIndented = lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1);
				const nextLineEmptyOrIndented = !endLine && isLineEmptyOrIndented(lineNumber + 1);
				const currLineEmptyOrIndented = isLineEmptyOrIndented(lineNumber);
				const notEmpty = !nextLineEmptyOrIndented && !prevLineEmptyOrIndented;

				// check above and below. if both are blocked, display lightbulb in the gutter.
				if (!nextLineEmptyOrIndented && !prevLineEmptyOrIndented && !hasDecoration) {
					this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
						position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
						preference: LightBulbWidget._posPref
					}), undefined);
					this.renderGutterLightbub();
					return this.hide();
				} else if (prevLineEmptyOrIndented || endLine || (prevLineEmptyOrIndented && !currLineEmptyOrIndented)) {
					effectiveLineNumber -= 1;
				} else if (nextLineEmptyOrIndented || (notEmpty && currLineEmptyOrIndented)) {
					effectiveLineNumber += 1;
				}
			} else if (lineNumber === 1 && (lineNumber === model.getLineCount() || !isLineEmptyOrIndented(lineNumber + 1) && !isLineEmptyOrIndented(lineNumber))) {
				// special checks for first line blocked vs. not blocked.
				this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
					position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
					preference: LightBulbWidget._posPref
				}), undefined);

				if (hasDecoration) {
					this.gutterHide();
				} else {
					this.renderGutterLightbub();
					return this.hide();
				}
			} else if ((lineNumber < model.getLineCount()) && !isFolded(lineNumber + 1)) {
				effectiveLineNumber += 1;
			} else if (column * fontInfo.spaceWidth < 22) {
				// cannot show lightbulb above/below and showing
				// it inline would overlay the cursor...
				return this.hide();
			}
			effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;
		}

		this._state.set(new LightBulbState.Showing(actions, trigger, atPosition, {
			position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
			preference: LightBulbWidget._posPref
		}), undefined);

		if (this._gutterDecorationID) {
			this._removeGutterDecoration(this._gutterDecorationID);
			this.gutterHide();
		}

		const validActions = actions.validActions;
		const actionKind = actions.validActions[0].action.kind;
		if (validActions.length !== 1 || !actionKind) {
			this._editor.layoutContentWidget(this);
			return;
		}

		this._editor.layoutContentWidget(this);
	}

	public hide(): void {
		if (this._state.get() === LightBulbState.Hidden) {
			return;
		}

		this._state.set(LightBulbState.Hidden, undefined);
		this._editor.layoutContentWidget(this);
	}

	public gutterHide(): void {
		if (this._gutterState.get() === LightBulbState.Hidden) {
			return;
		}

		if (this._gutterDecorationID) {
			this._removeGutterDecoration(this._gutterDecorationID);
		}

		this._gutterState.set(LightBulbState.Hidden, undefined);
	}

	private _updateLightBulbTitleAndIcon(info: LightBulbInfo | undefined): void {
		this._domNode.classList.remove(...this._iconClasses);
		this._iconClasses = [];
		if (!info || info.isGutter) {
			return;
		}
		this._domNode.title = info.title;
		this._iconClasses = ThemeIcon.asClassNameArray(info.icon);
		this._domNode.classList.add(...this._iconClasses);
	}

	private _updateGutterDecorationOptions(info: LightBulbInfo | undefined): void {
		if (!info || !info.isGutter) {
			return;
		}

		this.gutterDecoration = ModelDecorationOptions.register({
			description: 'codicon-gutter-lightbulb-decoration',
			glyphMarginClassName: ThemeIcon.asClassName(info.icon),
			glyphMargin: { position: GlyphMarginLane.Left },
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});
	}

	/* Gutter Helper Functions */
	private renderGutterLightbub(): void {
		const selection = this._editor.getSelection();
		if (!selection) {
			return;
		}

		if (this._gutterDecorationID === undefined) {
			this._addGutterDecoration(selection.startLineNumber);
		} else {
			this._updateGutterDecoration(this._gutterDecorationID, selection.startLineNumber);
		}
	}

	private _addGutterDecoration(lineNumber: number) {
		this._editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			this._gutterDecorationID = accessor.addDecoration(new Range(lineNumber, 0, lineNumber, 0), this.gutterDecoration);
		});
	}

	private _removeGutterDecoration(decorationId: string) {
		this._editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			accessor.removeDecoration(decorationId);
			this._gutterDecorationID = undefined;
		});
	}

	private _updateGutterDecoration(decorationId: string, lineNumber: number) {
		this._editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			accessor.changeDecoration(decorationId, new Range(lineNumber, 0, lineNumber, 0));
			accessor.changeDecorationOptions(decorationId, this.gutterDecoration);
		});
	}


}
