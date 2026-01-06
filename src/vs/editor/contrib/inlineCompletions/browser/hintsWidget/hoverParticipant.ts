/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, constObservable } from '../../../../../base/common/observable.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../../browser/editorBrowser.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Range } from '../../../../common/core/range.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { IModelDecoration } from '../../../../common/model.js';
import { HoverAnchor, HoverAnchorType, HoverForeignElementAnchor, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from '../../../hover/browser/hoverTypes.js';
import { InlineCompletionsController } from '../controller/inlineCompletionsController.js';
import { InlineSuggestionHintsContentWidget } from './inlineCompletionsHintsWidget.js';
import { MarkdownRenderer } from '../../../../browser/widget/markdownRenderer/browser/markdownRenderer.js';
import * as nls from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { GhostTextView } from '../view/ghostText/ghostTextView.js';

export class InlineCompletionsHover implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<InlineCompletionsHover>,
		public readonly range: Range,
		public readonly controller: InlineCompletionsController
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

export class InlineCompletionsHoverParticipant implements IEditorHoverParticipant<InlineCompletionsHover> {

	public readonly hoverOrdinal: number = 4;

	constructor(
		private readonly _editor: ICodeEditor,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
	}

	suggestHoverAnchor(mouseEvent: IEditorMouseEvent): HoverAnchor | null {
		const controller = InlineCompletionsController.get(this._editor);
		if (!controller) {
			return null;
		}

		const target = mouseEvent.target;
		if (target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
			// handle the case where the mouse is over the view zone
			const viewZoneData = target.detail;
			if (controller.shouldShowHoverAtViewZone(viewZoneData.viewZoneId)) {
				return new HoverForeignElementAnchor(1000, this, Range.fromPositions(this._editor.getModel()!.validatePosition(viewZoneData.positionBefore || viewZoneData.position)), mouseEvent.event.posx, mouseEvent.event.posy, false);
			}
		}
		if (target.type === MouseTargetType.CONTENT_EMPTY) {
			// handle the case where the mouse is over the empty portion of a line following ghost text
			if (controller.shouldShowHoverAt(target.range)) {
				return new HoverForeignElementAnchor(1000, this, target.range, mouseEvent.event.posx, mouseEvent.event.posy, false);
			}
		}
		if (target.type === MouseTargetType.CONTENT_TEXT) {
			// handle the case where the mouse is directly over ghost text
			const mightBeForeignElement = target.detail.mightBeForeignElement;
			if (mightBeForeignElement && controller.shouldShowHoverAt(target.range)) {
				return new HoverForeignElementAnchor(1000, this, target.range, mouseEvent.event.posx, mouseEvent.event.posy, false);
			}
		}
		if (target.type === MouseTargetType.CONTENT_WIDGET && target.element) {
			const ctx = GhostTextView.getWarningWidgetContext(target.element);
			if (ctx && controller.shouldShowHoverAt(ctx.range)) {
				return new HoverForeignElementAnchor(1000, this, ctx.range, mouseEvent.event.posx, mouseEvent.event.posy, false);
			}
		}
		return null;
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): InlineCompletionsHover[] {
		if (this._editor.getOption(EditorOption.inlineSuggest).showToolbar !== 'onHover') {
			return [];
		}

		const controller = InlineCompletionsController.get(this._editor);
		if (controller && controller.shouldShowHoverAt(anchor.range)) {
			return [new InlineCompletionsHover(this, anchor.range, controller)];
		}
		return [];
	}

	renderHoverParts(context: IEditorHoverRenderContext, hoverParts: InlineCompletionsHover[]): IRenderedHoverParts<InlineCompletionsHover> {
		const disposables = new DisposableStore();
		const part = hoverParts[0];

		this._telemetryService.publicLog2<{}, {
			owner: 'hediet';
			comment: 'This event tracks whenever an inline completion hover is shown.';
		}>('inlineCompletionHover.shown');

		if (this.accessibilityService.isScreenReaderOptimized() && !this._editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
			disposables.add(this.renderScreenReaderText(context, part));
		}

		const model = part.controller.model.get()!;
		const widgetNode: HTMLElement = document.createElement('div');
		context.fragment.appendChild(widgetNode);

		disposables.add(autorunWithStore((reader, store) => {
			const w = store.add(this._instantiationService.createInstance(
				InlineSuggestionHintsContentWidget.hot.read(reader),
				this._editor,
				false,
				constObservable(null),
				model.selectedInlineCompletionIndex,
				model.inlineCompletionsCount,
				model.activeCommands,
				model.warning,
				() => {
					context.onContentsChanged();
				},
			));
			widgetNode.replaceChildren(w.getDomNode());
		}));

		model.triggerExplicitly();

		const renderedHoverPart: IRenderedHoverPart<InlineCompletionsHover> = {
			hoverPart: part,
			hoverElement: widgetNode,
			dispose() { disposables.dispose(); }
		};
		return new RenderedHoverParts([renderedHoverPart]);
	}

	getAccessibleContent(hoverPart: InlineCompletionsHover): string {
		return nls.localize('hoverAccessibilityStatusBar', 'There are inline completions here');
	}

	private renderScreenReaderText(context: IEditorHoverRenderContext, part: InlineCompletionsHover): IDisposable {
		const disposables = new DisposableStore();
		const $ = dom.$;
		const markdownHoverElement = $('div.hover-row.markdown-hover');
		const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents', { ['aria-live']: 'assertive' }));
		const renderer = new MarkdownRenderer({ editor: this._editor }, this._languageService, this._openerService);
		const render = (code: string) => {
			const inlineSuggestionAvailable = nls.localize('inlineSuggestionFollows', "Suggestion:");
			const renderedContents = disposables.add(renderer.render(new MarkdownString().appendText(inlineSuggestionAvailable).appendCodeblock('text', code), {
				asyncRenderCallback: () => {
					hoverContentsElement.className = 'hover-contents code-hover-contents';
					context.onContentsChanged();
				}
			}));
			hoverContentsElement.replaceChildren(renderedContents.element);
		};

		disposables.add(autorun(reader => {
			/** @description update hover */
			const ghostText = part.controller.model.read(reader)?.primaryGhostText.read(reader);
			if (ghostText) {
				const lineText = this._editor.getModel()!.getLineContent(ghostText.lineNumber);
				render(ghostText.renderForScreenReader(lineText));
			} else {
				dom.reset(hoverContentsElement);
			}
		}));

		context.fragment.appendChild(markdownHoverElement);
		return disposables;
	}
}
