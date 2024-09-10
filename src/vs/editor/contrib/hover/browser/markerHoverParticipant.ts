/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { CancelablePromise, createCancelablePromise, disposableTimeout } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { CodeActionTriggerType } from '../../../common/languages.js';
import { IModelDecoration } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { IMarkerDecorationsService } from '../../../common/services/markerDecorations.js';
import { getCodeActions, quickFixCommandId } from '../../codeAction/browser/codeAction.js';
import { CodeActionController } from '../../codeAction/browser/codeActionController.js';
import { CodeActionKind, CodeActionSet, CodeActionTrigger, CodeActionTriggerSource } from '../../codeAction/common/types.js';
import { MarkerController, NextMarkerAction } from '../../gotoError/browser/gotoError.js';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from './hoverTypes.js';
import * as nls from '../../../../nls.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IMarker, IMarkerData, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Progress } from '../../../../platform/progress/common/progress.js';

const $ = dom.$;

export class MarkerHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<MarkerHover>,
		public readonly range: Range,
		public readonly marker: IMarker,
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

const markerCodeActionTrigger: CodeActionTrigger = {
	type: CodeActionTriggerType.Invoke,
	filter: { include: CodeActionKind.QuickFix },
	triggerAction: CodeActionTriggerSource.QuickFixHover
};

export class MarkerHoverParticipant implements IEditorHoverParticipant<MarkerHover> {

	public readonly hoverOrdinal: number = 1;

	private recentMarkerCodeActionsInfo: { marker: IMarker; hasCodeActions: boolean } | undefined = undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IMarkerDecorationsService private readonly _markerDecorationsService: IMarkerDecorationsService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
	) { }

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkerHover[] {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range && !anchor.supportsMarkerHover) {
			return [];
		}

		const model = this._editor.getModel();
		const lineNumber = anchor.range.startLineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		const result: MarkerHover[] = [];
		for (const d of lineDecorations) {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			const marker = this._markerDecorationsService.getMarker(model.uri, d);
			if (!marker) {
				continue;
			}

			const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
			result.push(new MarkerHover(this, range, marker));
		}

		return result;
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: MarkerHover[]): IRenderedHoverParts<MarkerHover> {
		if (!hoverParts.length) {
			return new RenderedHoverParts([]);
		}
		const disposables = new DisposableStore();
		const renderedHoverParts: IRenderedHoverPart<MarkerHover>[] = [];
		hoverParts.forEach(hoverPart => {
			const renderedMarkerHover = this._renderMarkerHover(hoverPart);
			context.fragment.appendChild(renderedMarkerHover.hoverElement);
			renderedHoverParts.push(renderedMarkerHover);
		});
		const markerHoverForStatusbar = hoverParts.length === 1 ? hoverParts[0] : hoverParts.sort((a, b) => MarkerSeverity.compare(a.marker.severity, b.marker.severity))[0];
		this.renderMarkerStatusbar(context, markerHoverForStatusbar, disposables);
		return new RenderedHoverParts(renderedHoverParts);
	}

	public getAccessibleContent(hoverPart: MarkerHover): string {
		return hoverPart.marker.message;
	}

	private _renderMarkerHover(markerHover: MarkerHover): IRenderedHoverPart<MarkerHover> {
		const disposables: DisposableStore = new DisposableStore();
		const hoverElement = $('div.hover-row');
		const markerElement = dom.append(hoverElement, $('div.marker.hover-contents'));
		const { source, message, code, relatedInformation } = markerHover.marker;

		this._editor.applyFontInfo(markerElement);
		const messageElement = dom.append(markerElement, $('span'));
		messageElement.style.whiteSpace = 'pre-wrap';
		messageElement.innerText = message;

		if (source || code) {
			// Code has link
			if (code && typeof code !== 'string') {
				const sourceAndCodeElement = $('span');
				if (source) {
					const sourceElement = dom.append(sourceAndCodeElement, $('span'));
					sourceElement.innerText = source;
				}
				const codeLink = dom.append(sourceAndCodeElement, $('a.code-link'));
				codeLink.setAttribute('href', code.target.toString(true));

				disposables.add(dom.addDisposableListener(codeLink, 'click', (e) => {
					this._openerService.open(code.target, { allowCommands: true });
					e.preventDefault();
					e.stopPropagation();
				}));

				const codeElement = dom.append(codeLink, $('span'));
				codeElement.innerText = code.value;

				const detailsElement = dom.append(markerElement, sourceAndCodeElement);
				detailsElement.style.opacity = '0.6';
				detailsElement.style.paddingLeft = '6px';
			} else {
				const detailsElement = dom.append(markerElement, $('span'));
				detailsElement.style.opacity = '0.6';
				detailsElement.style.paddingLeft = '6px';
				detailsElement.innerText = source && code ? `${source}(${code})` : source ? source : `(${code})`;
			}
		}

		if (isNonEmptyArray(relatedInformation)) {
			for (const { message, resource, startLineNumber, startColumn } of relatedInformation) {
				const relatedInfoContainer = dom.append(markerElement, $('div'));
				relatedInfoContainer.style.marginTop = '8px';
				const a = dom.append(relatedInfoContainer, $('a'));
				a.innerText = `${basename(resource)}(${startLineNumber}, ${startColumn}): `;
				a.style.cursor = 'pointer';
				disposables.add(dom.addDisposableListener(a, 'click', (e) => {
					e.stopPropagation();
					e.preventDefault();
					if (this._openerService) {
						const editorOptions: ITextEditorOptions = { selection: { startLineNumber, startColumn } };
						this._openerService.open(resource, {
							fromUserGesture: true,
							editorOptions
						}).catch(onUnexpectedError);
					}
				}));
				const messageElement = dom.append<HTMLAnchorElement>(relatedInfoContainer, $('span'));
				messageElement.innerText = message;
				this._editor.applyFontInfo(messageElement);
			}
		}

		const renderedHoverPart: IRenderedHoverPart<MarkerHover> = {
			hoverPart: markerHover,
			hoverElement,
			dispose: () => disposables.dispose()
		};
		return renderedHoverPart;
	}

	private renderMarkerStatusbar(context: IEditorHoverRenderContext, markerHover: MarkerHover, disposables: DisposableStore): void {
		if (markerHover.marker.severity === MarkerSeverity.Error || markerHover.marker.severity === MarkerSeverity.Warning || markerHover.marker.severity === MarkerSeverity.Info) {
			const markerController = MarkerController.get(this._editor);
			if (markerController) {
				context.statusBar.addAction({
					label: nls.localize('view problem', "View Problem"),
					commandId: NextMarkerAction.ID,
					run: () => {
						context.hide();
						markerController.showAtMarker(markerHover.marker);
						this._editor.focus();
					}
				});
			}
		}

		if (!this._editor.getOption(EditorOption.readOnly)) {
			const quickfixPlaceholderElement = context.statusBar.append($('div'));
			if (this.recentMarkerCodeActionsInfo) {
				if (IMarkerData.makeKey(this.recentMarkerCodeActionsInfo.marker) === IMarkerData.makeKey(markerHover.marker)) {
					if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
						quickfixPlaceholderElement.textContent = nls.localize('noQuickFixes', "No quick fixes available");
					}
				} else {
					this.recentMarkerCodeActionsInfo = undefined;
				}
			}
			const updatePlaceholderDisposable = this.recentMarkerCodeActionsInfo && !this.recentMarkerCodeActionsInfo.hasCodeActions ? Disposable.None : disposableTimeout(() => quickfixPlaceholderElement.textContent = nls.localize('checkingForQuickFixes', "Checking for quick fixes..."), 200, disposables);
			if (!quickfixPlaceholderElement.textContent) {
				// Have some content in here to avoid flickering
				quickfixPlaceholderElement.textContent = String.fromCharCode(0xA0); // &nbsp;
			}
			const codeActionsPromise = this.getCodeActions(markerHover.marker);
			disposables.add(toDisposable(() => codeActionsPromise.cancel()));
			codeActionsPromise.then(actions => {
				updatePlaceholderDisposable.dispose();
				this.recentMarkerCodeActionsInfo = { marker: markerHover.marker, hasCodeActions: actions.validActions.length > 0 };

				if (!this.recentMarkerCodeActionsInfo.hasCodeActions) {
					actions.dispose();
					quickfixPlaceholderElement.textContent = nls.localize('noQuickFixes', "No quick fixes available");
					return;
				}
				quickfixPlaceholderElement.style.display = 'none';

				let showing = false;
				disposables.add(toDisposable(() => {
					if (!showing) {
						actions.dispose();
					}
				}));

				context.statusBar.addAction({
					label: nls.localize('quick fixes', "Quick Fix..."),
					commandId: quickFixCommandId,
					run: (target) => {
						showing = true;
						const controller = CodeActionController.get(this._editor);
						const elementPosition = dom.getDomNodePagePosition(target);
						// Hide the hover pre-emptively, otherwise the editor can close the code actions
						// context menu as well when using keyboard navigation
						context.hide();
						controller?.showCodeActions(markerCodeActionTrigger, actions, {
							x: elementPosition.left,
							y: elementPosition.top,
							width: elementPosition.width,
							height: elementPosition.height
						});
					}
				});
			}, onUnexpectedError);
		}
	}

	private getCodeActions(marker: IMarker): CancelablePromise<CodeActionSet> {
		return createCancelablePromise(cancellationToken => {
			return getCodeActions(
				this._languageFeaturesService.codeActionProvider,
				this._editor.getModel()!,
				new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn),
				markerCodeActionTrigger,
				Progress.None,
				cancellationToken);
		});
	}
}
