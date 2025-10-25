/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/callHierarchy.css';
import * as peekView from '../../../../editor/contrib/peekView/browser/peekView.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CallHierarchyDirection, CallHierarchyModel } from '../common/callHierarchy.js';
import { WorkbenchAsyncDataTree, IWorkbenchAsyncDataTreeOptions } from '../../../../platform/list/browser/listService.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import * as callHTree from './callHierarchyTree.js';
import { IAsyncDataTreeViewState } from '../../../../base/browser/ui/tree/asyncDataTree.js';
import { localize } from '../../../../nls.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { SplitView, Orientation, Sizing } from '../../../../base/browser/ui/splitview/splitview.js';
import { Dimension, isKeyboardEvent } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationOptions, OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId, IThemeService, IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Color } from '../../../../base/common/color.js';
import { TreeMouseEventTarget, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { URI } from '../../../../base/common/uri.js';
import { MenuId, IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';

const enum State {
	Loading = 'loading',
	Message = 'message',
	Data = 'data'
}

class LayoutInfo {

	static store(info: LayoutInfo, storageService: IStorageService): void {
		storageService.store('callHierarchyPeekLayout', JSON.stringify(info), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	static retrieve(storageService: IStorageService): LayoutInfo {
		const value = storageService.get('callHierarchyPeekLayout', StorageScope.PROFILE, '{}');
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

class CallHierarchyTree extends WorkbenchAsyncDataTree<CallHierarchyModel, callHTree.Call, FuzzyScore> { }

export class CallHierarchyTreePeekWidget extends peekView.PeekViewWidget {

	static readonly TitleMenu = new MenuId('callhierarchy/title');

	private _parent!: HTMLElement;
	private _message!: HTMLElement;
	private _splitView!: SplitView;
	private _tree!: CallHierarchyTree;
	private _treeViewStates = new Map<CallHierarchyDirection, IAsyncDataTreeViewState>();
	private _editor!: EmbeddedCodeEditorWidget;
	private _dim!: Dimension;
	private _layoutInfo!: LayoutInfo;

	private readonly _previewDisposable = new DisposableStore();

	constructor(
		editor: ICodeEditor,
		private readonly _where: IPosition,
		private _direction: CallHierarchyDirection,
		@IThemeService themeService: IThemeService,
		@peekView.IPeekViewService private readonly _peekViewService: peekView.IPeekViewService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IStorageService private readonly _storageService: IStorageService,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true }, _instantiationService);
		this.create();
		this._peekViewService.addExclusiveWidget(editor, this);
		this._applyTheme(themeService.getColorTheme());
		this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
		this._disposables.add(this._previewDisposable);
	}

	override dispose(): void {
		LayoutInfo.store(this._layoutInfo, this._storageService);
		this._splitView.dispose();
		this._tree.dispose();
		this._editor.dispose();
		super.dispose();
	}

	get direction(): CallHierarchyDirection {
		return this._direction;
	}

	private _applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
		});
	}

	protected override _fillHead(container: HTMLElement): void {
		super._fillHead(container, true);

		const menu = this._menuService.createMenu(CallHierarchyTreePeekWidget.TitleMenu, this._contextKeyService);
		const updateToolbar = () => {
			const actions = getFlatActionBarActions(menu.getActions());
			this._actionbarWidget!.clear();
			this._actionbarWidget!.push(actions, { label: false, icon: true });
		};
		this._disposables.add(menu);
		this._disposables.add(menu.onDidChange(updateToolbar));
		updateToolbar();
	}

	protected _fillBody(parent: HTMLElement): void {

		this._layoutInfo = LayoutInfo.retrieve(this._storageService);
		this._dim = new Dimension(0, 0);

		this._parent = parent;
		parent.classList.add('call-hierarchy');

		const message = document.createElement('div');
		message.classList.add('message');
		parent.appendChild(message);
		this._message = message;
		this._message.tabIndex = 0;

		const container = document.createElement('div');
		container.classList.add('results');
		parent.appendChild(container);

		this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });

		// editor stuff
		const editorContainer = document.createElement('div');
		editorContainer.classList.add('editor');
		container.appendChild(editorContainer);
		const editorOptions: IEditorOptions = {
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
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
			{},
			this.editor
		);

		// tree stuff
		const treeContainer = document.createElement('div');
		treeContainer.classList.add('tree');
		container.appendChild(treeContainer);
		const options: IWorkbenchAsyncDataTreeOptions<callHTree.Call, FuzzyScore> = {
			sorter: new callHTree.Sorter(),
			accessibilityProvider: new callHTree.AccessibilityProvider(() => this._direction),
			identityProvider: new callHTree.IdentityProvider(() => this._direction),
			expandOnlyOnTwistieClick: true,
			overrideStyles: {
				listBackground: peekView.peekViewResultsBackground
			}
		};
		this._tree = this._instantiationService.createInstance(
			CallHierarchyTree,
			'CallHierarchyPeek',
			treeContainer,
			new callHTree.VirtualDelegate(),
			[this._instantiationService.createInstance(callHTree.CallRenderer)],
			this._instantiationService.createInstance(callHTree.DataSource, () => this._direction),
			options
		);

		// split stuff
		this._splitView.addView({
			onDidChange: Event.None,
			element: editorContainer,
			minimumSize: 200,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				if (this._dim.height) {
					this._editor.layout({ height: this._dim.height, width });
				}
			}
		}, Sizing.Distribute);

		this._splitView.addView({
			onDidChange: Event.None,
			element: treeContainer,
			minimumSize: 100,
			maximumSize: Number.MAX_VALUE,
			layout: (width) => {
				if (this._dim.height) {
					this._tree.layout(this._dim.height, width);
				}
			}
		}, Sizing.Distribute);

		this._disposables.add(this._splitView.onDidSashChange(() => {
			if (this._dim.width) {
				this._layoutInfo.ratio = this._splitView.getViewSize(0) / this._dim.width;
			}
		}));

		// update editor
		this._disposables.add(this._tree.onDidChangeFocus(this._updatePreview, this));

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

			if (e.element) {
				this.dispose();
				this._editorService.openEditor({
					resource: e.element.item.uri,
					options: { selection: e.element.item.selectionRange, pinned: true }
				});
			}
		}));

		this._disposables.add(this._tree.onDidChangeSelection(e => {
			const [element] = e.elements;
			// don't close on click
			if (element && isKeyboardEvent(e.browserEvent)) {
				this.dispose();
				this._editorService.openEditor({
					resource: element.item.uri,
					options: { selection: element.item.selectionRange, pinned: true }
				});
			}
		}));
	}

	private async _updatePreview() {
		const [element] = this._tree.getFocus();
		if (!element) {
			return;
		}

		this._previewDisposable.clear();

		// update: editor and editor highlights
		const options: IModelDecorationOptions = {
			description: 'call-hierarchy-decoration',
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: 'call-decoration',
			overviewRuler: {
				color: themeColorFromId(peekView.peekViewEditorMatchHighlight),
				position: OverviewRulerLane.Center
			},
		};

		let previewUri: URI;
		if (this._direction === CallHierarchyDirection.CallsFrom) {
			// outgoing calls: show caller and highlight focused calls
			previewUri = element.parent ? element.parent.item.uri : element.model.root.uri;

		} else {
			// incoming calls: show caller and highlight focused calls
			previewUri = element.item.uri;
		}

		const value = await this._textModelService.createModelReference(previewUri);
		this._editor.setModel(value.object.textEditorModel);

		// set decorations for caller ranges (if in the same file)
		const decorations: IModelDeltaDecoration[] = [];
		let fullRange: IRange | undefined;
		let locations = element.locations;
		if (!locations) {
			locations = [{ uri: element.item.uri, range: element.item.selectionRange }];
		}
		for (const loc of locations) {
			if (loc.uri.toString() === previewUri.toString()) {
				decorations.push({ range: loc.range, options });
				fullRange = !fullRange ? loc.range : Range.plusRange(loc.range, fullRange);
			}
		}
		if (fullRange) {
			this._editor.revealRangeInCenter(fullRange, ScrollType.Immediate);
			const decorationsCollection = this._editor.createDecorationsCollection(decorations);
			this._previewDisposable.add(toDisposable(() => decorationsCollection.clear()));
		}
		this._previewDisposable.add(value);

		// update: title
		const title = this._direction === CallHierarchyDirection.CallsFrom
			? localize('callFrom', "Calls from '{0}'", element.model.root.name)
			: localize('callsTo', "Callers of '{0}'", element.model.root.name);
		this.setTitle(title);
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

	async showModel(model: CallHierarchyModel): Promise<void> {

		this._show();
		const viewState = this._treeViewStates.get(this._direction);

		await this._tree.setInput(model, viewState);

		const root = <ITreeNode<callHTree.Call, FuzzyScore>>this._tree.getNode(model).children[0];
		await this._tree.expand(root.element);

		if (root.children.length === 0) {
			//
			this.showMessage(this._direction === CallHierarchyDirection.CallsFrom
				? localize('empt.callsFrom', "No calls from '{0}'", model.root.name)
				: localize('empt.callsTo', "No callers of '{0}'", model.root.name));

		} else {
			this._parent.dataset['state'] = State.Data;
			if (!viewState || this._tree.getFocus().length === 0) {
				this._tree.setFocus([root.children[0].element]);
			}
			this._tree.domFocus();
			this._updatePreview();
		}
	}

	getModel(): CallHierarchyModel | undefined {
		return this._tree.getInput();
	}

	getFocused(): callHTree.Call | undefined {
		return this._tree.getFocus()[0];
	}

	async updateDirection(newDirection: CallHierarchyDirection): Promise<void> {
		const model = this._tree.getInput();
		if (model && newDirection !== this._direction) {
			this._treeViewStates.set(this._direction, this._tree.getViewState());
			this._direction = newDirection;
			await this.showModel(model);
		}
	}

	private _show() {
		if (!this._isShowing) {
			this.editor.revealLineInCenterIfOutsideViewport(this._where.lineNumber, ScrollType.Smooth);
			super.show(Range.fromPositions(this._where), this._layoutInfo.height);
		}
	}

	protected override _onWidth(width: number) {
		if (this._dim) {
			this._doLayoutBody(this._dim.height, width);
		}
	}

	protected override _doLayoutBody(height: number, width: number): void {
		if (this._dim.height !== height || this._dim.width !== width) {
			super._doLayoutBody(height, width);
			this._dim = new Dimension(width, height);
			this._layoutInfo.height = this._viewZone ? this._viewZone.heightInLines : this._layoutInfo.height;
			this._splitView.layout(width);
			this._splitView.resizeView(0, width * this._layoutInfo.ratio);
		}
	}
}
