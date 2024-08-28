/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Gesture } from 'vs/base/browser/touch';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./lightBulbWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition } from 'vs/editor/common/core/position';
import { GlyphMarginLane, IModelDecorationsChangeAccessor, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { computeIndentLevel } from 'vs/editor/common/model/utils';
import { autoFixCommandId, quickFixCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionSet, CodeActionTrigger } from 'vs/editor/contrib/codeAction/common/types';
import * as nls from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Range } from 'vs/editor/common/core/range';

const GUTTER_LIGHTBULB_ICON = registerIcon('gutter-lightbulb', Codicon.lightBulb, nls.localize('gutterLightbulbWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor.'));
const GUTTER_LIGHTBULB_AUTO_FIX_ICON = registerIcon('gutter-lightbulb-auto-fix', Codicon.lightbulbAutofix, nls.localize('gutterLightbulbAutoFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and a quick fix is available.'));
const GUTTER_LIGHTBULB_AIFIX_ICON = registerIcon('gutter-lightbulb-sparkle', Codicon.lightbulbSparkle, nls.localize('gutterLightbulbAIFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix is available.'));
const GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON = registerIcon('gutter-lightbulb-aifix-auto-fix', Codicon.lightbulbSparkleAutofix, nls.localize('gutterLightbulbAIFixAutoFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available.'));
const GUTTER_SPARKLE_FILLED_ICON = registerIcon('gutter-lightbulb-sparkle-filled', Codicon.sparkleFilled, nls.localize('gutterLightbulbSparkleFilledWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available.'));

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

	private _state: LightBulbState.State = LightBulbState.Hidden;
	private _gutterState: LightBulbState.State = LightBulbState.Hidden;
	private _iconClasses: string[] = [];

	private _preferredKbLabel?: string;
	private _quickFixKbLabel?: string;

	private gutterDecoration: ModelDecorationOptions = LightBulbWidget.GUTTER_DECORATION;

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
			if (this.state.type !== LightBulbState.Type.Showing || !editorModel || this.state.editorPosition.lineNumber >= editorModel.getLineCount()) {
				this.hide();
			}

			if (this.gutterState.type !== LightBulbState.Type.Showing || !editorModel || this.gutterState.editorPosition.lineNumber >= editorModel.getLineCount()) {
				this.gutterHide();
			}
		}));

		this._register(dom.addStandardDisposableGenericMouseDownListener(this._domNode, e => {
			if (this.state.type !== LightBulbState.Type.Showing) {
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
			if (this.state.widgetPosition.position !== null && this.state.widgetPosition.position.lineNumber < this.state.editorPosition.lineNumber) {
				pad += lineHeight;
			}

			this._onClick.fire({
				x: e.posx,
				y: top + height + pad,
				actions: this.state.actions,
				trigger: this.state.trigger,
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
			this._preferredKbLabel = this._keybindingService.lookupKeybinding(autoFixCommandId)?.getLabel() ?? undefined;
			this._quickFixKbLabel = this._keybindingService.lookupKeybinding(quickFixCommandId)?.getLabel() ?? undefined;
			this._updateLightBulbTitleAndIcon();
		}));

		this._register(this._editor.onMouseDown(async (e: IEditorMouseEvent) => {
			const lightbulbClasses = [
				'codicon-' + GUTTER_LIGHTBULB_ICON.id,
				'codicon-' + GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON.id,
				'codicon-' + GUTTER_LIGHTBULB_AUTO_FIX_ICON.id,
				'codicon-' + GUTTER_LIGHTBULB_AIFIX_ICON.id,
				'codicon-' + GUTTER_SPARKLE_FILLED_ICON.id
			];

			if (!e.target.element || !lightbulbClasses.some(cls => e.target.element && e.target.element.classList.contains(cls))) {
				return;
			}

			if (this.gutterState.type !== LightBulbState.Type.Showing) {
				return;
			}

			// Make sure that focus / cursor location is not lost when clicking widget icon
			this._editor.focus();

			// a bit of extra work to make sure the menu
			// doesn't cover the line-text
			const { top, height } = dom.getDomNodePagePosition(e.target.element);
			const lineHeight = this._editor.getOption(EditorOption.lineHeight);

			let pad = Math.floor(lineHeight / 3);
			if (this.gutterState.widgetPosition.position !== null && this.gutterState.widgetPosition.position.lineNumber < this.gutterState.editorPosition.lineNumber) {
				pad += lineHeight;
			}

			this._onClick.fire({
				x: e.event.posx,
				y: top + height + pad,
				actions: this.gutterState.actions,
				trigger: this.gutterState.trigger,
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
		return this._state.type === LightBulbState.Type.Showing ? this._state.widgetPosition : null;
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
				if (decoration.options.glyphMarginClassName) {
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
					this.gutterState = new LightBulbState.Showing(actions, trigger, atPosition, {
						position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
						preference: LightBulbWidget._posPref
					});
					this.renderGutterLightbub();
					return this.hide();
				} else if (prevLineEmptyOrIndented || endLine || (notEmpty && !currLineEmptyOrIndented)) {
					effectiveLineNumber -= 1;
				} else if (nextLineEmptyOrIndented || (notEmpty && currLineEmptyOrIndented)) {
					effectiveLineNumber += 1;
				}
			} else if (lineNumber === 1 && (lineNumber === model.getLineCount() || !isLineEmptyOrIndented(lineNumber + 1) && !isLineEmptyOrIndented(lineNumber))) {
				// special checks for first line blocked vs. not blocked.
				this.gutterState = new LightBulbState.Showing(actions, trigger, atPosition, {
					position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
					preference: LightBulbWidget._posPref
				});

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

		this.state = new LightBulbState.Showing(actions, trigger, atPosition, {
			position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
			preference: LightBulbWidget._posPref
		});

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
		if (this.state === LightBulbState.Hidden) {
			return;
		}

		this.state = LightBulbState.Hidden;
		this._editor.layoutContentWidget(this);
	}

	public gutterHide(): void {
		if (this.gutterState === LightBulbState.Hidden) {
			return;
		}

		if (this._gutterDecorationID) {
			this._removeGutterDecoration(this._gutterDecorationID);
		}

		this.gutterState = LightBulbState.Hidden;
	}

	private get state(): LightBulbState.State { return this._state; }

	private set state(value) {
		this._state = value;
		this._updateLightBulbTitleAndIcon();
	}

	private get gutterState(): LightBulbState.State { return this._gutterState; }

	private set gutterState(value) {
		this._gutterState = value;
		this._updateGutterLightBulbTitleAndIcon();
	}

	private _updateLightBulbTitleAndIcon(): void {
		this._domNode.classList.remove(...this._iconClasses);
		this._iconClasses = [];
		if (this.state.type !== LightBulbState.Type.Showing) {
			return;
		}
		let icon: ThemeIcon;
		let autoRun = false;
		if (this.state.actions.allAIFixes) {
			icon = Codicon.sparkleFilled;
			if (this.state.actions.validActions.length === 1) {
				autoRun = true;
			}
		} else if (this.state.actions.hasAutoFix) {
			if (this.state.actions.hasAIFix) {
				icon = Codicon.lightbulbSparkleAutofix;
			} else {
				icon = Codicon.lightbulbAutofix;
			}
		} else if (this.state.actions.hasAIFix) {
			icon = Codicon.lightbulbSparkle;
		} else {
			icon = Codicon.lightBulb;
		}
		this._updateLightbulbTitle(this.state.actions.hasAutoFix, autoRun);
		this._iconClasses = ThemeIcon.asClassNameArray(icon);
		this._domNode.classList.add(...this._iconClasses);
	}

	private _updateGutterLightBulbTitleAndIcon(): void {
		if (this.gutterState.type !== LightBulbState.Type.Showing) {
			return;
		}
		let icon: ThemeIcon;
		let autoRun = false;
		if (this.gutterState.actions.allAIFixes) {
			icon = GUTTER_SPARKLE_FILLED_ICON;
			if (this.gutterState.actions.validActions.length === 1) {
				autoRun = true;
			}
		} else if (this.gutterState.actions.hasAutoFix) {
			if (this.gutterState.actions.hasAIFix) {
				icon = GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON;
			} else {
				icon = GUTTER_LIGHTBULB_AUTO_FIX_ICON;
			}
		} else if (this.gutterState.actions.hasAIFix) {
			icon = GUTTER_LIGHTBULB_AIFIX_ICON;
		} else {
			icon = GUTTER_LIGHTBULB_ICON;
		}
		this._updateLightbulbTitle(this.gutterState.actions.hasAutoFix, autoRun);

		const GUTTER_DECORATION = ModelDecorationOptions.register({
			description: 'codicon-gutter-lightbulb-decoration',
			glyphMarginClassName: ThemeIcon.asClassName(icon),
			glyphMargin: { position: GlyphMarginLane.Left },
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});

		this.gutterDecoration = GUTTER_DECORATION;
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

	private _updateLightbulbTitle(autoFix: boolean, autoRun: boolean): void {
		if (this.state.type !== LightBulbState.Type.Showing) {
			return;
		}
		if (autoRun) {
			this.title = nls.localize('codeActionAutoRun', "Run: {0}", this.state.actions.validActions[0].action.title);
		} else if (autoFix && this._preferredKbLabel) {
			this.title = nls.localize('preferredcodeActionWithKb', "Show Code Actions. Preferred Quick Fix Available ({0})", this._preferredKbLabel);
		} else if (!autoFix && this._quickFixKbLabel) {
			this.title = nls.localize('codeActionWithKb', "Show Code Actions ({0})", this._quickFixKbLabel);
		} else if (!autoFix) {
			this.title = nls.localize('codeAction', "Show Code Actions");
		}
	}

	private set title(value: string) {
		this._domNode.title = value;
	}
}
