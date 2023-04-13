/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { Command } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelDecoration } from 'vs/editor/common/model';
import { HoverAnchor, HoverAnchorType, HoverForeignElementAnchor, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { GhostTextController } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { InlineSuggestionHintsContentWidget } from 'vs/editor/contrib/inlineCompletions/browser/inlineSuggestionHintsWidget';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import * as nls from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class InlineCompletionsHover implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<InlineCompletionsHover>,
		public readonly range: Range,
		public readonly controller: GhostTextController
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}

	public requestExplicitContext(): void {
		this.controller.activeModel?.activeInlineCompletionsModel?.completionSession.value?.ensureUpdateWithExplicitContext();
	}

	public getInlineCompletionsCount(): number | undefined {
		const session = this.controller.activeModel?.activeInlineCompletionsModel?.completionSession.value;
		if (!session?.hasBeenTriggeredExplicitly) {
			return undefined;
		}
		return session?.getInlineCompletionsCountSync();
	}

	public getInlineCompletionIndex(): number | undefined {
		return this.controller.activeModel?.activeInlineCompletionsModel?.completionSession.value?.currentlySelectedIndex;
	}

	public onDidChange(handler: () => void): IDisposable {
		const d = this.controller.activeModel?.activeInlineCompletionsModel?.onDidChange(handler);
		return d || Disposable.None;
	}

	public get commands(): Command[] {
		return this.controller.activeModel?.activeInlineCompletionsModel?.completionSession.value?.commands || [];
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
		const controller = GhostTextController.get(this._editor);
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
		return null;
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): InlineCompletionsHover[] {
		if (this._editor.getOption(EditorOption.inlineSuggest).showToolbar === 'always') {
			return [];
		}

		const controller = GhostTextController.get(this._editor);
		if (controller && controller.shouldShowHoverAt(anchor.range)) {
			return [new InlineCompletionsHover(this, anchor.range, controller)];
		}
		return [];
	}

	renderHoverParts(context: IEditorHoverRenderContext, hoverParts: InlineCompletionsHover[]): IDisposable {
		const disposableStore = new DisposableStore();
		const part = hoverParts[0];

		this._telemetryService.publicLog2<{}, {
			owner: 'hediet';
			comment: 'This event tracks whenever an inline completion hover is shown.';
		}>('inlineCompletionHover.shown');

		if (this.accessibilityService.isScreenReaderOptimized()) {
			this.renderScreenReaderText(context, part, disposableStore);
		}

		const w = this._instantiationService.createInstance(InlineSuggestionHintsContentWidget, this._editor, false);
		context.fragment.appendChild(w.getDomNode());

		w.update(null, part.getInlineCompletionIndex() || 0, part.getInlineCompletionsCount(), part.commands);
		part.requestExplicitContext();

		disposableStore.add(part.onDidChange(() => {
			w.update(null, part.getInlineCompletionIndex() || 0, part.getInlineCompletionsCount(), part.commands);
		}));

		return disposableStore;
	}

	private renderScreenReaderText(context: IEditorHoverRenderContext, part: InlineCompletionsHover, disposableStore: DisposableStore) {
		const $ = dom.$;
		const markdownHoverElement = $('div.hover-row.markdown-hover');
		const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents', { ['aria-live']: 'assertive' }));
		const renderer = disposableStore.add(new MarkdownRenderer({ editor: this._editor }, this._languageService, this._openerService));
		const render = (code: string) => {
			disposableStore.add(renderer.onDidRenderAsync(() => {
				hoverContentsElement.className = 'hover-contents code-hover-contents';
				context.onContentsChanged();
			}));

			const inlineSuggestionAvailable = nls.localize('inlineSuggestionFollows', "Suggestion:");
			const renderedContents = disposableStore.add(renderer.render(new MarkdownString().appendText(inlineSuggestionAvailable).appendCodeblock('text', code)));
			hoverContentsElement.replaceChildren(renderedContents.element);
		};

		disposableStore.add(Event.runAndSubscribe<void>(e => part.onDidChange(e), () => {
			const ghostText = part.controller.activeModel?.inlineCompletionsModel?.ghostText;
			if (ghostText) {
				const lineText = this._editor.getModel()!.getLineContent(ghostText.lineNumber);
				render(ghostText.renderForScreenReader(lineText));
			} else {
				dom.reset(hoverContentsElement);
			}
		}));


		context.fragment.appendChild(markdownHoverElement);
	}
}
