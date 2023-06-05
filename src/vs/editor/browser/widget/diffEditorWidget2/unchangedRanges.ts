/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, h, reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, transaction, constObservable } from 'vs/base/common/observable';
import { autorun, autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { isDefined } from 'vs/base/common/types';
import { ICodeEditor, IOverlayWidget, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffModel';

export class UnchangedRangesFeature extends Disposable {
	constructor(
		private readonly _originalEditor: CodeEditorWidget,
		private readonly _modifiedEditor: CodeEditorWidget,
		private readonly _diffModel: IObservable<DiffModel | null>,
	) {
		super();

		const unchangedRegionViewZoneIdsOrig: string[] = [];
		const unchangedRegionViewZoneIdsMod: string[] = [];

		this._register(this._originalEditor.onDidChangeCursorPosition(e => {
			const m = this._diffModel.get();
			transaction(tx => {
				for (const s of this._originalEditor.getSelections() || []) {
					m?.revealOriginalLine(s.getStartPosition().lineNumber, tx);
					m?.revealOriginalLine(s.getEndPosition().lineNumber, tx);
				}
			});
		}));

		this._register(this._modifiedEditor.onDidChangeCursorPosition(e => {
			const m = this._diffModel.get();
			transaction(tx => {
				for (const s of this._modifiedEditor.getSelections() || []) {
					m?.revealModifiedLine(s.getStartPosition().lineNumber, tx);
					m?.revealModifiedLine(s.getEndPosition().lineNumber, tx);
				}
			});
		}));

		this._register(autorunWithStore2('update folded unchanged regions', (reader, store) => {
			const unchangedRegions = this._diffModel.read(reader)?.unchangedRegions.read(reader);
			if (!unchangedRegions) {
				return;
			}

			// TODO@hediet This might cause unnecessary updates of alignment viewzones if this runs too late
			this._originalEditor.changeViewZones((aOrig) => {
				this._modifiedEditor.changeViewZones(aMod => {

					for (const id of unchangedRegionViewZoneIdsOrig) {
						aOrig.removeZone(id);
					}
					unchangedRegionViewZoneIdsOrig.length = 0;

					for (const id of unchangedRegionViewZoneIdsMod) {
						aMod.removeZone(id);
					}
					unchangedRegionViewZoneIdsMod.length = 0;

					for (const r of unchangedRegions) {
						const atTop = r.modifiedLineNumber !== 1;
						const atBottom = r.modifiedRange.endLineNumberExclusive !== this._modifiedEditor.getModel()!.getLineCount() + 1;

						const hiddenOriginalRange = r.getHiddenOriginalRange(reader);
						const hiddenModifiedRange = r.getHiddenModifiedRange(reader);

						if (hiddenOriginalRange.isEmpty) {
							continue;
						}

						store.add(new CollapsedCodeActionsContentWidget(this._originalEditor, aOrig, hiddenOriginalRange.startLineNumber - 1, 30, constObservable<IContentWidgetAction[]>([
							{
								text: `${hiddenOriginalRange.length} Lines Hidden`
							},
							{
								text: '$(chevron-up) Show More',
								async action() { r.showMoreAbove(undefined); },
							},
							{
								text: '$(chevron-down) Show More',
								async action() { r.showMoreBelow(undefined); },
							},
							{
								text: '$(close) Show All',
								async action() { r.showAll(undefined); },
							}
						]), unchangedRegionViewZoneIdsOrig, atTop, atBottom));

						store.add(new CollapsedCodeActionsContentWidget(this._modifiedEditor, aMod, hiddenModifiedRange.startLineNumber - 1, 30, constObservable<IContentWidgetAction[]>([
							{
								text: '$(chevron-up) Show More',
								async action() { r.showMoreAbove(undefined); },
							},
							{
								text: '$(chevron-down) Show More',
								async action() { r.showMoreBelow(undefined); },
							},
							{
								text: '$(close) Show All',
								async action() { r.showAll(undefined); },
							}
						]), unchangedRegionViewZoneIdsMod, atTop, atBottom));
					}
				});
			});

			this._originalEditor.setHiddenAreas(unchangedRegions.map(r => r.getHiddenOriginalRange(reader).toInclusiveRange()).filter(isDefined));
			this._modifiedEditor.setHiddenAreas(unchangedRegions.map(r => r.getHiddenModifiedRange(reader).toInclusiveRange()).filter(isDefined));
		}));

	}
}

// TODO@hediet avoid code duplication with FixedZoneWidget in merge editor
abstract class FixedZoneWidget extends Disposable {
	private static counter = 0;
	private readonly overlayWidgetId = `fixedZoneWidget-${FixedZoneWidget.counter++}`;
	private readonly viewZoneId: string;

	protected readonly widgetDomNode = h('div.fixed-zone-widget').root;
	private readonly overlayWidget: IOverlayWidget = {
		getId: () => this.overlayWidgetId,
		getDomNode: () => this.widgetDomNode,
		getPosition: () => null
	};

	constructor(
		private readonly editor: ICodeEditor,
		viewZoneAccessor: IViewZoneChangeAccessor,
		afterLineNumber: number,
		height: number,
		viewZoneIdsToCleanUp: string[],
	) {
		super();

		this.viewZoneId = viewZoneAccessor.addZone({
			domNode: document.createElement('div'),
			afterLineNumber: afterLineNumber,
			heightInPx: height,
			onComputedHeight: (height) => {
				this.widgetDomNode.style.height = `${height}px`;
			},
			onDomNodeTop: (top) => {
				this.widgetDomNode.style.top = `${top}px`;
			},
			showInHiddenAreas: true,
		});
		viewZoneIdsToCleanUp.push(this.viewZoneId);

		this.widgetDomNode.style.left = this.editor.getLayoutInfo().contentLeft + 'px';

		this.editor.addOverlayWidget(this.overlayWidget);

		this._register({
			dispose: () => {
				this.editor.removeOverlayWidget(this.overlayWidget);
			},
		});
	}
}

class CollapsedCodeActionsContentWidget extends FixedZoneWidget {
	private readonly _domNode = h('div.diff-hidden-lines', { className: [this.showTopZigZag ? 'showTop' : '', this.showBottomZigZag ? 'showBottom' : ''].join(' ') }, [
		h('div.top'),
		h('div.center@content'),
		h('div.bottom'),
	]);

	constructor(
		editor: ICodeEditor,
		viewZoneAccessor: IViewZoneChangeAccessor,
		afterLineNumber: number,
		height: number,

		items: IObservable<IContentWidgetAction[]>,
		viewZoneIdsToCleanUp: string[],
		public readonly showTopZigZag: boolean,
		public readonly showBottomZigZag: boolean,
	) {
		super(editor, viewZoneAccessor, afterLineNumber, height, viewZoneIdsToCleanUp);

		this.widgetDomNode.appendChild(this._domNode.root);


		this._register(autorun('update commands', (reader) => {
			const i = items.read(reader);
			this.setState(i);
		}));
	}

	private setState(items: IContentWidgetAction[]) {
		const children: HTMLElement[] = [];
		let isFirst = true;
		for (const item of items) {
			if (isFirst) {
				isFirst = false;
			} else {
				children.push($('span', undefined, '\u00a0|\u00a0'));
			}
			const title = renderLabelWithIcons(item.text);

			if (item.action) {
				children.push($('a', { title: item.tooltip, role: 'button', onclick: () => item.action!() }, ...title));
			} else {
				children.push($('span', { title: item.tooltip }, ...title));
			}
		}

		reset(this._domNode.content, ...children);
	}
}

interface IContentWidgetAction {
	text: string;
	tooltip?: string;
	action?: () => Promise<void>;
}
