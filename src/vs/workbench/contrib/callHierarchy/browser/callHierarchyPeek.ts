/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/callHierarchy';
import { PeekViewWidget, IPeekViewService } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CallHierarchyProvider, CallHierarchyDirection, CallHierarchyItem } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { FuzzyScore } from 'vs/base/common/filters';
import * as callHTree from 'vs/workbench/contrib/callHierarchy/browser/callHierarchyTree';
import { IAsyncDataTreeOptions, IAsyncDataTreeViewState } from 'vs/base/browser/ui/tree/asyncDataTree';
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
import { registerThemingParticipant, themeColorFromId, IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import * as referencesWidget from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { IPosition } from 'vs/editor/common/core/position';
import { Action } from 'vs/base/common/actions';
import { IActionBarOptions, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ILabelService } from 'vs/platform/label/common/label';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Color } from 'vs/base/common/color';
import { TreeMouseEventTarget } from 'vs/base/browser/ui/tree/tree';

const enum State {
	Loading = 'loading',
	Message = 'message',
	Data = 'data'
}

class ChangeHierarchyDirectionAction extends Action {

	constructor(direction: CallHierarchyDirection, updateDirection: (direction: CallHierarchyDirection) => void) {
		super('', undefined, '', true, () => {
			if (direction === CallHierarchyDirection.CallsTo) {
				direction = CallHierarchyDirection.CallsFrom;
			} else {
				direction = CallHierarchyDirection.CallsTo;
			}
			updateDirection(direction);
			update();
			return Promise.resolve();
		});
		const update = () => {
			if (direction === CallHierarchyDirection.CallsFrom) {
				this.label = localize('toggle.from', "Showing Calls");
				this.class = 'calls-from';
			} else {
				this.label = localize('toggle.to', "Showing Callers");
				this.class = 'calls-to';
			}
		};
		update();
	}
}

class LayoutInfo {

	static store(info: LayoutInfo, storageService: IStorageService): void {
		storageService.store('callHierarchyPeekLayout', JSON.stringify(info), StorageScope.GLOBAL);
	}

	static retrieve(storageService: IStorageService): LayoutInfo {
		const value = storageService.get('callHierarchyPeekLayout', StorageScope.GLOBAL, '{}');
		const defaultInfo: LayoutInfo = { ratio: 0.7, height: 17 };
		try {
			return { ...defaultInfo, ...JSON.parse(value) };
		} catch {
			return defaultInfo;
		}
	}

	constructor(
		public ratio: number,
		public height: number
	) { }
}

export class CallHierarchyTreePeekWidget extends PeekViewWidget {

	private _changeDirectionAction?: ChangeHierarchyDirectionAction;
	private _parent!: HTMLElement;
	private _message!: HTMLElement;
	private _splitView!: SplitView;
	private _tree!: WorkbenchAsyncDataTree<CallHierarchyItem, callHTree.Call, FuzzyScore>;
	private _treeViewStates = new Map<CallHierarchyDirection, IAsyncDataTreeViewState>();
	private _editor!: EmbeddedCodeEditorWidget;
	private _dim!: Dimension;
	private _layoutInfo!: LayoutInfo;

	constructor(
		editor: ICodeEditor,
		private readonly _where: IPosition,
		private readonly _provider: CallHierarchyProvider,
		private _direction: CallHierarchyDirection,
		@IThemeService themeService: IThemeService,
		@IPeekViewService private readonly _peekViewService: IPeekViewService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ILabelService private readonly _labelService: ILabelService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true });
		this.create();
		this._peekViewService.addExclusiveWidget(editor, this);
		this._applyTheme(themeService.getTheme());
		this._disposables.add(themeService.onThemeChange(this._applyTheme, this));
	}

	dispose(): void {
		LayoutInfo.store(this._layoutInfo, this._storageService);
		this._splitView.dispose();
		this._tree.dispose();
		this._editor.dispose();
		super.dispose();
	}

	private _applyTheme(theme: ITheme) {
		const borderColor = theme.getColor(referencesWidget.peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(referencesWidget.peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(referencesWidget.peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(referencesWidget.peekViewTitleInfoForeground)
		});
	}

	protected _getActionBarOptions(): IActionBarOptions {
		return {
			orientation: ActionsOrientation.HORIZONTAL_REVERSE
		};
	}

	protected _fillBody(parent: HTMLElement): void {

		this._layoutInfo = LayoutInfo.retrieve(this._storageService);
		this._dim = { height: 0, width: 0 };

		this._parent = parent;
		addClass(parent, 'call-hierarchy');

		const message = document.createElement('div');
		addClass(message, 'message');
		parent.appendChild(message);
		this._message = message;
		this._message.tabIndex = 0;

		const container = document.createElement('div');
		addClass(container, 'results');
		parent.appendChild(container);

		this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });

		// editor stuff
		const editorContainer = document.createElement('div');
		addClass(editorContainer, 'editor');
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
		addClass(treeContainer, 'tree');
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
			[this._instantiationService.createInstance(callHTree.CallRenderer)],
			new callHTree.SingleDirectionDataSource(this._provider, () => this._direction),
			options
		);

		// split stuff
		this._splitView.addView({
			onDidChange: Event.None,
			element: editorContainer,
			minimumSize: 200,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._editor.layout({ height: this._dim.height, width });
			}
		}, Sizing.Distribute);

		this._splitView.addView({
			onDidChange: Event.None,
			element: treeContainer,
			minimumSize: 100,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				this._tree.layout(this._dim.height, width);
			}
		}, Sizing.Distribute);

		this._disposables.add(this._splitView.onDidSashChange(() => {
			if (this._dim.width) {
				this._layoutInfo.ratio = this._splitView.getViewSize(0) / this._dim.width;
			}
		}));

		// session state
		let localDispose: IDisposable[] = [];
		this._disposables.add({ dispose() { dispose(localDispose); } });

		// update editor
		this._disposables.add(this._tree.onDidChangeFocus(e => {
			const [element] = e.elements;
			if (element && isNonEmptyArray(element.locations)) {

				localDispose = dispose(localDispose);

				const options: IModelDecorationOptions = {
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					className: 'call-decoration',
					overviewRuler: {
						color: themeColorFromId(referencesWidget.peekViewEditorMatchHighlight),
						position: OverviewRulerLane.Center
					},
				};
				let decorations: IModelDeltaDecoration[] = [];
				let fullRange: IRange | undefined;
				for (const { range } of element.locations) {
					decorations.push({ range, options });
					fullRange = !fullRange ? range : Range.plusRange(range, fullRange);
				}

				this._textModelService.createModelReference(element.item.uri).then(value => {
					this._editor.setModel(value.object.textEditorModel);
					this._editor.revealRangeInCenter(fullRange!, ScrollType.Smooth);
					this._editor.revealLine(element.item.range.startLineNumber, ScrollType.Smooth);
					const ids = this._editor.deltaDecorations([], decorations);
					localDispose.push({ dispose: () => this._editor.deltaDecorations(ids, []) });
					localDispose.push(value);
				});

				let node: callHTree.Call | CallHierarchyItem = element;
				let names = [element.item.name];
				while (true) {
					let parent = this._tree.getParentElement(node);
					if (!(parent instanceof callHTree.Call)) {
						break;
					}
					if (this._direction === CallHierarchyDirection.CallsTo) {
						names.push(parent.item.name);
					} else {
						names.unshift(parent.item.name);
					}
					node = parent;
				}
				this.setMetaTitle(localize('meta', " – {0}", names.join(' → ')));
			}
		}));

		this._disposables.add(this._editor.onMouseDown(e => {
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
				resource: focus.item.uri,
				options: { selection: target.range! }
			});

		}));

		this._disposables.add(this._tree.onMouseDblClick(e => {
			if (e.target === TreeMouseEventTarget.Twistie) {
				return;
			}

			if (e.element && isNonEmptyArray(e.element.locations)) {
				this.dispose();
				this._editorService.openEditor({
					resource: e.element.item.uri,
					options: { selection: e.element.locations[0].range }
				});
			}
		}));

		this._disposables.add(this._tree.onDidChangeSelection(e => {
			const [element] = e.elements;
			// don't close on click
			if (element && isNonEmptyArray(element.locations) && e.browserEvent instanceof KeyboardEvent) {
				this.dispose();
				this._editorService.openEditor({
					resource: element.item.uri,
					options: { selection: element.locations[0].range }
				});
			}
		}));
	}

	showLoading(): void {
		this._parent.dataset['state'] = State.Loading;
		this.setTitle(localize('title.loading', "Loading..."));
		this._show();
	}

	showMessage(message: string): void {
		this._parent.dataset['state'] = State.Message;
		this.setTitle('');
		this.setMetaTitle('');
		this._message.innerText = message;
		this._show();
		this._message.focus();
	}

	async showItem(item: CallHierarchyItem): Promise<void> {

		this._show();
		const viewState = this._treeViewStates.get(this._direction);
		await this._tree.setInput(item, viewState);

		const [root] = this._tree.getNode(item).children;
		await this._tree.expand(root.element as callHTree.Call);
		const firstChild = this._tree.getFirstElementChild(root.element);
		if (!(firstChild instanceof callHTree.Call)) {
			//
			this.showMessage(this._direction === CallHierarchyDirection.CallsFrom
				? localize('empt.callsFrom', "No calls from '{0}'", item.name)
				: localize('empt.callsTo', "No calls to '{0}'", item.name));

		} else {
			this._parent.dataset['state'] = State.Data;
			this._tree.domFocus();
			if (!viewState) {
				this._tree.setFocus([firstChild]);
			}
			this.setTitle(
				item.name,
				item.detail || this._labelService.getUriLabel(item.uri, { relative: true }),
			);
		}

		if (!this._changeDirectionAction) {
			const changeDirection = (newDirection: CallHierarchyDirection) => {
				if (this._direction !== newDirection) {
					this._treeViewStates.set(this._direction, this._tree.getViewState());
					this._direction = newDirection;
					this.showItem(item);
				}
			};
			this._changeDirectionAction = new ChangeHierarchyDirectionAction(this._direction, changeDirection);
			this._disposables.add(this._changeDirectionAction);
			this._actionbarWidget!.push(this._changeDirectionAction, { icon: true, label: false });
		}
	}

	private _show() {
		if (!this._isShowing) {
			this.editor.revealLineInCenterIfOutsideViewport(this._where.lineNumber, ScrollType.Smooth);
			super.show(Range.fromPositions(this._where), this._layoutInfo.height);
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
		this._layoutInfo.height = this._viewZone ? this._viewZone.heightInLines : this._layoutInfo.height;
		this._splitView.layout(width);
		this._splitView.resizeView(0, width * this._layoutInfo.ratio);
	}
}

registerThemingParticipant((theme, collector) => {
	const referenceHighlightColor = theme.getColor(referencesWidget.peekViewEditorMatchHighlight);
	if (referenceHighlightColor) {
		collector.addRule(`.monaco-editor .call-hierarchy .call-decoration { background-color: ${referenceHighlightColor}; }`);
	}
	const referenceHighlightBorder = theme.getColor(referencesWidget.peekViewEditorMatchHighlightBorder);
	if (referenceHighlightBorder) {
		collector.addRule(`.monaco-editor .call-hierarchy .call-decoration { border: 2px solid ${referenceHighlightBorder}; box-sizing: border-box; }`);
	}
	const resultsBackground = theme.getColor(referencesWidget.peekViewResultsBackground);
	if (resultsBackground) {
		collector.addRule(`.monaco-editor .call-hierarchy .tree { background-color: ${resultsBackground}; }`);
	}
	const resultsMatchForeground = theme.getColor(referencesWidget.peekViewResultsFileForeground);
	if (resultsMatchForeground) {
		collector.addRule(`.monaco-editor .call-hierarchy .tree { color: ${resultsMatchForeground}; }`);
	}
	const resultsSelectedBackground = theme.getColor(referencesWidget.peekViewResultsSelectionBackground);
	if (resultsSelectedBackground) {
		collector.addRule(`.monaco-editor .call-hierarchy .tree .monaco-list:focus .monaco-list-rows > .monaco-list-row.selected:not(.highlighted) { background-color: ${resultsSelectedBackground}; }`);
	}
	const resultsSelectedForeground = theme.getColor(referencesWidget.peekViewResultsSelectionForeground);
	if (resultsSelectedForeground) {
		collector.addRule(`.monaco-editor .call-hierarchy .tree .monaco-list:focus .monaco-list-rows > .monaco-list-row.selected:not(.highlighted) { color: ${resultsSelectedForeground} !important; }`);
	}
	const editorBackground = theme.getColor(referencesWidget.peekViewEditorBackground);
	if (editorBackground) {
		collector.addRule(
			`.monaco-editor .call-hierarchy .editor .monaco-editor .monaco-editor-background,` +
			`.monaco-editor .call-hierarchy .editor .monaco-editor .inputarea.ime-input {` +
			`	background-color: ${editorBackground};` +
			`}`
		);
	}
	const editorGutterBackground = theme.getColor(referencesWidget.peekViewEditorGutterBackground);
	if (editorGutterBackground) {
		collector.addRule(
			`.monaco-editor .call-hierarchy .editor .monaco-editor .margin {` +
			`	background-color: ${editorGutterBackground};` +
			`}`
		);
	}
});
