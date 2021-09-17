/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ITextContentData, IViewZoneData } from 'vs/editor/browser/controller/mouseTarget';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { IModeService } from 'vs/editor/common/services/modeService';
import { HoverAnchor, HoverAnchorType, HoverForeignElementAnchor, IEditorHover, IEditorHoverParticipant, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/hoverTypes';
import { commitInlineSuggestionAction, GhostTextController, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction } from 'vs/editor/contrib/inlineCompletions/ghostTextController';
import * as nls from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IOpenerService } from 'vs/platform/opener/common/opener';

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

	public hasMultipleSuggestions(): Promise<boolean> {
		return this.controller.hasMultipleInlineCompletions();
	}
}

export class InlineCompletionsHoverParticipant implements IEditorHoverParticipant<InlineCompletionsHover> {
	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@ICommandService private readonly _commandService: ICommandService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) { }

	suggestHoverAnchor(mouseEvent: IEditorMouseEvent): HoverAnchor | null {
		const controller = GhostTextController.get(this._editor);
		if (!controller) {
			return null;
		}
		if (mouseEvent.target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
			// handle the case where the mouse is over the view zone
			const viewZoneData = <IViewZoneData>mouseEvent.target.detail;
			if (controller.shouldShowHoverAtViewZone(viewZoneData.viewZoneId)) {
				return new HoverForeignElementAnchor(1000, this, Range.fromPositions(viewZoneData.positionBefore || viewZoneData.position, viewZoneData.positionBefore || viewZoneData.position));
			}
		}
		if (mouseEvent.target.type === MouseTargetType.CONTENT_EMPTY && mouseEvent.target.range) {
			// handle the case where the mouse is over the empty portion of a line following ghost text
			if (controller.shouldShowHoverAt(mouseEvent.target.range)) {
				return new HoverForeignElementAnchor(1000, this, mouseEvent.target.range);
			}
		}
		if (mouseEvent.target.type === MouseTargetType.CONTENT_TEXT && mouseEvent.target.range && mouseEvent.target.detail) {
			// handle the case where the mouse is directly over ghost text
			const mightBeForeignElement = (<ITextContentData>mouseEvent.target.detail).mightBeForeignElement;
			if (mightBeForeignElement && controller.shouldShowHoverAt(mouseEvent.target.range)) {
				return new HoverForeignElementAnchor(1000, this, mouseEvent.target.range);
			}
		}
		return null;
	}

	computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): InlineCompletionsHover[] {
		const controller = GhostTextController.get(this._editor);
		if (controller && controller.shouldShowHoverAt(anchor.range)) {
			return [new InlineCompletionsHover(this, anchor.range, controller)];
		}
		return [];
	}

	renderHoverParts(hoverParts: InlineCompletionsHover[], fragment: DocumentFragment, statusBar: IEditorHoverStatusBar): IDisposable {
		const disposableStore = new DisposableStore();
		const part = hoverParts[0];

		if (this.accessibilityService.isScreenReaderOptimized()) {
			this.renderScreenReaderText(part, fragment, disposableStore);
		}

		const menu = disposableStore.add(this._menuService.createMenu(
			MenuId.InlineCompletionsActions,
			this._contextKeyService
		));

		const previousAction = statusBar.addAction({
			label: nls.localize('showNextInlineSuggestion', "Next"),
			commandId: ShowNextInlineSuggestionAction.ID,
			run: () => this._commandService.executeCommand(ShowNextInlineSuggestionAction.ID)
		});
		const nextAction = statusBar.addAction({
			label: nls.localize('showPreviousInlineSuggestion', "Previous"),
			commandId: ShowPreviousInlineSuggestionAction.ID,
			run: () => this._commandService.executeCommand(ShowPreviousInlineSuggestionAction.ID)
		});
		statusBar.addAction({
			label: nls.localize('acceptInlineSuggestion', "Accept"),
			commandId: commitInlineSuggestionAction.id,
			run: () => this._commandService.executeCommand(commitInlineSuggestionAction.id)
		});

		const actions = [previousAction, nextAction];
		for (const action of actions) {
			action.setEnabled(false);
		}
		part.hasMultipleSuggestions().then(hasMore => {
			for (const action of actions) {
				action.setEnabled(hasMore);
			}
		});

		for (const [_, group] of menu.getActions()) {
			for (const action of group) {
				if (action instanceof MenuItemAction) {
					statusBar.addAction({
						label: action.label,
						commandId: action.item.id,
						run: () => this._commandService.executeCommand(action.item.id)
					});
				}
			}
		}

		return disposableStore;
	}

	private renderScreenReaderText(part: InlineCompletionsHover, fragment: DocumentFragment, disposableStore: DisposableStore) {
		const $ = dom.$;
		const markdownHoverElement = $('div.hover-row.markdown-hover');
		const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
		const renderer = disposableStore.add(new MarkdownRenderer({ editor: this._editor }, this._modeService, this._openerService));
		const render = (code: string) => {
			disposableStore.add(renderer.onDidRenderAsync(() => {
				hoverContentsElement.className = 'hover-contents code-hover-contents';
				this._hover.onContentsChanged();
			}));

			const inlineSuggestionAvailable = nls.localize('inlineSuggestionFollows', "Suggestion:");
			const renderedContents = disposableStore.add(renderer.render(new MarkdownString().appendText(inlineSuggestionAvailable).appendCodeblock('text', code)));
			hoverContentsElement.replaceChildren(renderedContents.element);
		};

		const ghostText = part.controller.activeModel?.inlineCompletionsModel?.ghostText;
		if (ghostText) {
			const lineText = this._editor.getModel()!.getLineContent(ghostText.lineNumber);
			render(ghostText.renderForScreenReader(lineText));
		}
		fragment.appendChild(markdownHoverElement);
	}
}
