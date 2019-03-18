/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/callHierarchy';
import { PeekViewWidget } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyItem, CallHierarchyProvider, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { FuzzyScore } from 'vs/base/common/filters';
import * as callHTree from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyTree';
import { IAsyncDataTreeOptions } from 'vs/base/browser/ui/tree/asyncDataTree';
import { localize } from 'vs/nls';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IRange, Range } from 'vs/editor/common/core/range';
import { SplitView, Orientation, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { Dimension, addClass } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationOptions, OverviewRulerLane } from 'vs/editor/common/model';
import { registerThemingParticipant, themeColorFromId } from 'vs/platform/theme/common/themeService';
import { peekViewEditorMatchHighlight } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { IPosition } from 'vs/editor/common/core/position';

registerThemingParticipant((theme, collector) => {
	const referenceHighlightColor = theme.getColor(peekViewEditorMatchHighlight);
	if (referenceHighlightColor) {
		collector.addRule(`.monaco-editor .call-hierarchy .call-decoration { background-color: ${referenceHighlightColor}; }`);
	}
});

const enum State {
	Loading = 'loading',
	Message = 'message',
	Data = 'data'
}

export class CallHierarchyTreePeekWidget extends PeekViewWidget {

	private _parent: HTMLElement;
	private _message: HTMLElement;
	private _splitView: SplitView;
	private _tree: WorkbenchAsyncDataTree<CallHierarchyItem, callHTree.Call, FuzzyScore>;
	private _editor: EmbeddedCodeEditorWidget;
	private _dim: Dimension = { height: 0, width: 0 };

	constructor(
		editor: ICodeEditor,
		private readonly _where: IPosition,
		private readonly _provider: CallHierarchyProvider,
		private readonly _direction: CallHierarchyDirection,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true });
		this.create();
	}

	dispose(): void {
		this._splitView.dispose();
		this._tree.dispose();
		this._editor.dispose();
		super.dispose();
	}

	protected _fillBody(parent: HTMLElement): void {
		this._parent = parent;
		addClass(parent, 'call-hierarchy');

		const message = document.createElement('div');
		addClass(message, 'message');
		parent.appendChild(message);
		this._message = message;

		const container = document.createElement('div');
		addClass(container, 'results');
		parent.appendChild(container);

		this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });

		// editor stuff
		const editorContainer = document.createElement('div');
		container.appendChild(editorContainer);
		let editorOptions: IEditorOptions = {
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			minimap: {
				enabled: false
			}
		};
		this._editor = this._instantiationService.createInstance(
			EmbeddedCodeEditorWidget,
			editorContainer,
			editorOptions,
			this.editor
		);

		// tree stuff
		const treeContainer = document.createElement('div');
		container.appendChild(treeContainer);
		const options: IAsyncDataTreeOptions<callHTree.Call, FuzzyScore> = {
			identityProvider: new callHTree.IdentityProvider(),
			ariaLabel: localize('tree.aria', "Call Hierarchy"),
			expandOnlyOnTwistieClick: true,
		};
		this._tree = <any>this._instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			treeContainer,
			new callHTree.VirtualDelegate(),
			[new callHTree.CallRenderer()],
			new callHTree.SingleDirectionDataSource(this._provider, this._direction),
			options
		);

		// split stuff
		this._splitView.addView({
			onDidChange: Event.None,
			element: editorContainer,
			minimumSize: 70,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._editor.layout({ height: this._dim.height, width });
			}
		}, Sizing.Distribute);

		this._splitView.addView({
			onDidChange: Event.None,
			element: treeContainer,
			minimumSize: 30,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._tree.layout(this._dim.height, width);
			}
		}, Sizing.Distribute);

		let localDispose: IDisposable[] = [];
		this._disposables.push({ dispose() { dispose(localDispose); } });

		// update editor
		this._tree.onDidChangeFocus(e => {
			const [element] = e.elements;
			if (element && isNonEmptyArray(element.locations)) {

				localDispose = dispose(localDispose);

				const options: IModelDecorationOptions = {
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					className: 'call-decoration',
					overviewRuler: {
						color: themeColorFromId(peekViewEditorMatchHighlight),
						position: OverviewRulerLane.Center
					},
				};
				let decorations: IModelDeltaDecoration[] = [];
				let fullRange: IRange | undefined;
				for (const { range } of element.locations) {
					decorations.push({ range, options });
					fullRange = !fullRange ? range : Range.plusRange(range, fullRange);
				}

				this._textModelService.createModelReference(element.locations[0].uri).then(value => {
					this._editor.setModel(value.object.textEditorModel);
					this._editor.revealRangeInCenter(fullRange!, ScrollType.Smooth);
					this._editor.revealLine(element.item.range.startLineNumber, ScrollType.Smooth);
					const ids = this._editor.deltaDecorations([], decorations);
					localDispose.push({ dispose: () => this._editor.deltaDecorations(ids, []) });
					localDispose.push(value);
				});
			}
		}, undefined, this._disposables);

		this._editor.onMouseDown(e => {
			const { event, target } = e;
			if (event.detail !== 2) {
				return;
			}
			const [focus] = this._tree.getFocus();
			if (!focus) {
				return;
			}
			this.dispose();
			this._editorService.openEditor({
				resource: focus.locations[0].uri,
				options: { selection: target.range! }
			});

		}, undefined, this._disposables);

		this._tree.onMouseDblClick(e => {
			if (e.element && isNonEmptyArray(e.element.locations)) {
				this.dispose();
				this._editorService.openEditor({
					resource: e.element.locations[0].uri,
					options: { selection: e.element.locations[0].range }
				});
			}
		}, undefined, this._disposables);

		this._tree.onDidChangeSelection(e => {
			const [element] = e.elements;
			// don't close on click
			if (element && !(e.browserEvent instanceof MouseEvent)) {
				this.dispose();
				this._editorService.openEditor({
					resource: element.locations[0].uri,
					options: { selection: element.locations[0].range }
				});
			}
		});
	}

	showLoading(): void {
		this._parent.dataset['state'] = State.Loading;
		this.setTitle(localize('title.loading', "Loading..."));
		this._show();
	}

	showEmpty(): void {
		this._parent.dataset['state'] = State.Message;
		this.setTitle('');
		this._message.innerText = localize('empty', "No results");
		this._show();
	}

	showItem(item: CallHierarchyItem) {
		this._parent.dataset['state'] = State.Data;
		this._tree.setInput(item).then(() => {
			this._tree.domFocus();
			this._tree.focusFirst();
			this.setTitle(localize('title', "Call Hierarchy for '{0}'", item.name));
		});
		this._show();
	}

	private _show() {
		if (!this._isShowing) {
			this.editor.revealLineInCenterIfOutsideViewport(this._where.lineNumber, ScrollType.Smooth);
			super.show(Range.fromPositions(this._where), 17);
		}
	}

	protected _onWidth(width: number) {
		if (this._dim) {
			this._doLayoutBody(this._dim.height, width);
		}
	}

	protected _doLayoutBody(height: number, width: number): void {
		super._doLayoutBody(height, width);
		this._dim = { height, width };
		this._splitView.layout(width);
	}
}
