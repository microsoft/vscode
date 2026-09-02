/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener, EventHelper, EventType, getWindow, h, scheduleAtNextAnimationFrame, trackFocus } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, globalTransaction, IObservable, observableValue } from '../../../../base/common/observable.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService, type IScopedContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { observableCodeEditor } from '../../observableCodeEditor.js';
import { DiffEditorWidget } from '../diffEditor/diffEditorWidget.js';
import { DocumentDiffItemViewModel } from './multiDiffEditorViewModel.js';
import { ActionRunnerWithContext } from './utils.js';
import { IVirtualizedItemBindingContext, VirtualizedItemBinding, VirtualizedItemTemplate } from './virtualizedItemManager.js';
import { IWorkbenchUIElementFactory, MultiDiffEditorItemLabelKind } from './workbenchUIElementFactory.js';

export class DiffEditorItemTemplate extends VirtualizedItemTemplate<DocumentDiffItemViewModel, DiffEditorItemBinding> {
	private readonly _viewModel;

	private readonly _collapsed;

	private readonly _editorContentHeight;
	public readonly size: IObservable<number>;

	private readonly _modifiedContentWidth;
	private readonly _modifiedWidth;
	private readonly _originalContentWidth;
	private readonly _originalWidth;
	private readonly _itemHorizontalInsets: Readonly<{ left: number; right: number }>;

	public readonly maxScroll;

	private readonly _elements;

	public readonly editor;

	private readonly isModifedFocused;
	private readonly isOriginalFocused;
	public readonly isFocused;

	private readonly _resourceLabel;

	private readonly _resourceLabel2;
	private readonly _verticalStateUpdate = this._register(new MutableDisposable());
	private _observedEditorContentHeight = 500;
	private _isSettingData = false;
	private _bindingContext: IVirtualizedItemBindingContext | undefined;

	private readonly _outerEditorHeight: number;
	private readonly _contextKeyService: IScopedContextKeyService;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _overflowWidgetsDomNode: HTMLElement,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		private readonly _optionsOverride: IObservable<IDiffEditorOptions> | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService _parentContextKeyService: IContextKeyService,
	) {
		super();
		this._viewModel = observableValue<DocumentDiffItemViewModel | undefined>(this, undefined);
		this._collapsed = derived(this, reader => this._viewModel.read(reader)?.collapsed.read(reader));
		this._editorContentHeight = observableValue<number>(this, 500);
		this._itemHorizontalInsets = this._workbenchUIElementFactory.diffEditorItemHorizontalInsets ?? { left: 9, right: 9 };
		this.size = derived(this, reader => {
			if (this._collapsed.read(reader)) {
				return this._headerHeight;
			}
			return this._editorContentHeight.read(reader) + this._outerEditorHeight;
		});
		this._modifiedContentWidth = observableValue<number>(this, 0);
		this._modifiedWidth = observableValue<number>(this, 0);
		this._originalContentWidth = observableValue<number>(this, 0);
		this._originalWidth = observableValue<number>(this, 0);
		this.maxScroll = derived(this, reader => {
			const scroll1 = this._modifiedContentWidth.read(reader) - this._modifiedWidth.read(reader);
			const scroll2 = this._originalContentWidth.read(reader) - this._originalWidth.read(reader);
			if (scroll1 > scroll2) {
				return { maxScroll: scroll1, width: this._modifiedWidth.read(reader) };
			} else {
				return { maxScroll: scroll2, width: this._originalWidth.read(reader) };
			}
		});
		this._elements = h('div.multiDiffEntry', [
			h('div.header@header', [
				h('div.header-content', [
					h('div.collapse-button@collapseButton'),
					h('div.file-path', [
						// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
						h('div.title.modified.show-file-icons@primaryPath', [] as any),
						h('div.status.deleted@status', ['R']),
						// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
						h('div.title.original.show-file-icons@secondaryPath', [] as any),
					]),
					h('div.actions@actions'),
				]),
			]),

			h('div.editorParent', [
				h('div.editorContainer@editor'),
			])
		]) as Record<string, HTMLElement>;
		this.editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
			overflowWidgetsDomNode: this._overflowWidgetsDomNode,
			fixedOverflowWidgets: true
		}, {
			runWithOriginalEditorScrollAnchor: (anchorLineNumber, update) => this._runWithEditorScrollAnchor(
				() => this._outerEditorHeight + this._getOriginalEditorLineTop(anchorLineNumber),
				update
			),
			runWithModifiedEditorScrollAnchor: (anchorLineNumber, update) => this._runWithEditorScrollAnchor(
				() => this._outerEditorHeight + this._getModifiedEditorLineTop(anchorLineNumber),
				update
			),
		}));
		this.isModifedFocused = observableCodeEditor(this.editor.getModifiedEditor()).isFocused;
		this.isOriginalFocused = observableCodeEditor(this.editor.getOriginalEditor()).isFocused;
		this.isFocused = derived(this, reader => this.isModifedFocused.read(reader) || this.isOriginalFocused.read(reader));
		this._resourceLabel = this._workbenchUIElementFactory.createResourceLabel
			? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.primaryPath, MultiDiffEditorItemLabelKind.Primary))
			: undefined;
		this._resourceLabel2 = this._workbenchUIElementFactory.createResourceLabel
			? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.secondaryPath, MultiDiffEditorItemLabelKind.Secondary))
			: undefined;
		this._dataStore = this._register(new DisposableStore());
		this._headerHeight = this._workbenchUIElementFactory.diffEditorItemHeaderHeight ?? 40;

		const btn = this._register(new Button(this._elements.collapseButton, {}));
		const activateItem = () => this._viewModel.get()?.setActive(undefined);

		this._register(autorun(reader => {
			btn.element.className = '';
			btn.icon = this._collapsed.read(reader) ? Codicon.chevronRight : Codicon.chevronDown;
		}));
		this._register(btn.onDidClick(() => {
			activateItem();
			this._viewModel.get()?.collapsed.set(!this._collapsed.get(), undefined);
		}));

		if (this._workbenchUIElementFactory.handleHeaderMiddleClick) {
			this._register(addDisposableListener(this._elements.header, EventType.AUXCLICK, e => {
				if (e.button !== 1) {
					return;
				}

				const viewModel = this._viewModel.get();
				const resource = viewModel?.modifiedUri ?? viewModel?.originalUri;
				if (resource && this._workbenchUIElementFactory.handleHeaderMiddleClick?.(resource)) {
					EventHelper.stop(e, true);
				}
			}));
		}

		if (this._workbenchUIElementFactory.headerClickToCollapse) {
			// Make the header clickable to toggle collapse/expand
			this._elements.header.tabIndex = 0;
			this._elements.header.setAttribute('role', 'button');
			this._register(addDisposableListener(this._elements.header, EventType.MOUSE_ENTER, () => this._elements.root.classList.add('header-hovered')));
			this._register(addDisposableListener(this._elements.header, EventType.MOUSE_LEAVE, () => this._elements.root.classList.remove('header-hovered')));
			const headerFocus = this._register(trackFocus(this._elements.header));
			this._register(headerFocus.onDidFocus(() => {
				this._elements.root.classList.add('header-focused');
				activateItem();
			}));
			this._register(headerFocus.onDidBlur(() => this._elements.root.classList.remove('header-focused')));

			this._register(addDisposableListener(this._elements.header, EventType.CLICK, (e) => {
				activateItem();
				// Don't toggle if clicking on actions or the collapse button itself (already handled)
				const target = e.target;
				if (!(target instanceof Element)) {
					return;
				}
				if (target.closest('.actions') || target.closest('.collapse-button')) {
					return;
				}
				this._viewModel.get()?.collapsed.set(!this._collapsed.get(), undefined);
			}));

			this._register(addDisposableListener(this._elements.header, EventType.KEY_DOWN, (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					activateItem();
					const target = e.target;
					if (target instanceof Element && (target.closest('.actions') || target.closest('.collapse-button'))) {
						return;
					}
					e.preventDefault();
					this._viewModel.get()?.collapsed.set(!this._collapsed.get(), undefined);
				}
			}));
		}

		this._register(autorun(reader => {
			const collapsed = this._collapsed.read(reader);
			this._elements.editor.style.display = collapsed ? 'none' : 'block';
			if (this._workbenchUIElementFactory.headerClickToCollapse) {
				this._elements.header.setAttribute('aria-expanded', String(!collapsed));
			}
		}));

		this._register(this.editor.getModifiedEditor().onDidLayoutChange(e => {
			const width = this.editor.getModifiedEditor().getLayoutInfo().contentWidth;
			this._modifiedWidth.set(width, undefined);
		}));

		this._register(this.editor.getOriginalEditor().onDidLayoutChange(e => {
			const width = this.editor.getOriginalEditor().getLayoutInfo().contentWidth;
			this._originalWidth.set(width, undefined);
		}));

		this._register(this.editor.onDidContentSizeChange(e => {
			globalTransaction(tx => {
				this._modifiedContentWidth.set(this.editor.getModifiedEditor().getContentWidth(), tx);
				this._originalContentWidth.set(this.editor.getOriginalEditor().getContentWidth(), tx);
			});
			const viewModel = this._viewModel.get();
			if (this._isSettingData || !viewModel?.diffEditorViewModel.isDiffUpToDate.get()) {
				return;
			}
			this._observedEditorContentHeight = e.contentHeight;
			this._scheduleVerticalStateUpdate();
		}));

		this._register(autorun(reader => {
			const isActive = this._viewModel.read(reader)?.isActive.read(reader);
			this._elements.root.classList.toggle('active', isActive);
			const isFirst = this._viewModel.read(reader)?.isFirst.read(reader);
			this._elements.root.classList.toggle('first-diff-entry', isFirst);
		}));

		this._container.appendChild(this._elements.root);
		this._outerEditorHeight = this._headerHeight + (this._workbenchUIElementFactory.diffEditorItemContentBottomPadding ?? 0);

		this._contextKeyService = this._register(_parentContextKeyService.createScoped(this._elements.actions));
		const ctxAllUnchangedRegionsShown = EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown.bindTo(this._contextKeyService);
		this._register(autorun(reader => {
			ctxAllUnchangedRegionsShown.set(this.editor.allUnchangedRegionsShown.read(reader));
		}));
		const instantiationService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
		this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.actions, MenuId.MultiDiffEditorFileToolbar, {
			actionRunner: this._register(new ActionRunnerWithContext(() => (this._viewModel.get()?.modifiedUri ?? this._viewModel.get()?.originalUri))),
			highlightToggledItems: true,
			menuOptions: {
				shouldForwardArgs: true,
			},
			toolbarOptions: { primaryGroup: g => g.startsWith('navigation') },
			actionViewItemProvider: (action, options) => this._workbenchUIElementFactory.createToolbarActionViewItem?.(action, options) ?? createActionViewItem(instantiationService, action, options),
		}));
	}

	public setScrollLeft(left: number): void {
		if (this._modifiedContentWidth.get() - this._modifiedWidth.get() > this._originalContentWidth.get() - this._originalWidth.get()) {
			this.editor.getModifiedEditor().setScrollLeft(left);
		} else {
			this.editor.getOriginalEditor().setScrollLeft(left);
		}
	}

	public getExpandedContentHeight(): number {
		return this._observedEditorContentHeight + this._outerEditorHeight;
	}

	private readonly _dataStore;

	protected createBinding(item: DocumentDiffItemViewModel, context: IVirtualizedItemBindingContext): DiffEditorItemBinding {
		this._bindingContext = context;
		try {
			this.setItem(item, context.initialSize);
		} catch (error) {
			try {
				this.setItem(undefined);
			} finally {
				this._bindingContext = undefined;
			}
			throw error;
		}
		return new DiffEditorItemBinding(item, this);
	}

	private _runWithEditorScrollAnchor(getItemOffset: () => number, update: () => void): void {
		const context = this._bindingContext;
		if (!context) {
			throw new BugIndicatingError('Cannot preserve a diff editor scroll anchor without an active item binding');
		}

		context.runWithScrollAnchor(
			getItemOffset,
			tx => {
				update();
				this._verticalStateUpdate.clear();
				this._observedEditorContentHeight = this.editor.getContentHeight();
				this._editorContentHeight.set(this._observedEditorContentHeight, tx);
			}
		);
	}

	private _getOriginalEditorLineTop(lineNumber: number): number {
		const originalEditor = this.editor.getOriginalEditor();
		return lineNumber > originalEditor.getModel()!.getLineCount()
			? originalEditor.getContentHeight()
			: originalEditor.getTopForLineNumber(lineNumber);
	}

	private _getModifiedEditorLineTop(lineNumber: number): number {
		const modifiedEditor = this.editor.getModifiedEditor();
		return lineNumber > modifiedEditor.getModel()!.getLineCount()
			? modifiedEditor.getContentHeight()
			: modifiedEditor.getTopForLineNumber(lineNumber);
	}

	private setItem(item: DocumentDiffItemViewModel | undefined, initialSize = 0): void {
		this._verticalStateUpdate.clear();
		const optionsOverride = this._optionsOverride;
		function updateOptions(options: IDiffEditorOptions): IDiffEditorOptions {
			return {
				...options,
				...optionsOverride?.get(),
				scrollBeyondLastLine: false,
				hideUnchangedRegions: {
					enabled: true,
				},
				scrollbar: {
					vertical: 'hidden',
					horizontal: 'hidden',
					handleMouseWheel: false,
					useShadows: false,
				},
				renderOverviewRuler: false,
				fixedOverflowWidgets: true,
				overviewRulerBorder: false,
			};
		}

		if (!item) {
			this._isSettingData = true;
			try {
				globalTransaction(tx => {
					this._viewModel.set(undefined, tx);
					this.editor.setDiffModel(null, tx);
					this._dataStore.clear();
				});
			} finally {
				this._isSettingData = false;
			}
			return;
		}

		const value = item.documentDiffItem;
		const editorContentHeight = Math.max(0, Math.max(initialSize, item.lastTemplateData.get().expandedContentHeight) - this._outerEditorHeight);
		this._observedEditorContentHeight = editorContentHeight;
		this._isSettingData = true;
		try {
			globalTransaction(tx => {
				this._editorContentHeight.set(editorContentHeight, tx);
				this._resourceLabel?.setUri(item.modifiedUri ?? item.originalUri!, { strikethrough: item.modifiedUri === undefined });

				let isRenamed = false;
				let isDeleted = false;
				let isAdded = false;
				let flag = '';
				if (item.modifiedUri && item.originalUri && item.modifiedUri.path !== item.originalUri.path) {
					flag = 'R';
					isRenamed = true;
				} else if (!item.modifiedUri) {
					flag = 'D';
					isDeleted = true;
				} else if (!item.originalUri) {
					flag = 'A';
					isAdded = true;
				}
				this._elements.status.classList.toggle('renamed', isRenamed);
				this._elements.status.classList.toggle('deleted', isDeleted);
				this._elements.status.classList.toggle('added', isAdded);
				this._elements.status.innerText = flag;

				this._resourceLabel2?.setUri(isRenamed ? item.originalUri : undefined, { strikethrough: true });

				this._dataStore.clear();
				this._viewModel.set(item, tx);
				this.editor.updateOptions(updateOptions(value.options ?? {}));
				this.editor.setDiffModel(item.diffEditorViewModelRef, tx);
			});
		} finally {
			this._isSettingData = false;
		}
		this._dataStore.add(autorun(reader => {
			const viewModel = item.diffEditorViewModel;
			if (!viewModel.isDiffUpToDate.read(reader)) {
				return;
			}
			const hasChanges = (viewModel.diff.read(reader)?.mappings.length ?? 0) > 0;
			if (hasChanges && viewModel.unchangedRegions.read(reader).length > 0) {
				return;
			}
			this._observedEditorContentHeight = this.editor.getContentHeight();
			this._scheduleVerticalStateUpdate();
		}));
		if (value.onOptionsDidChange) {
			this._dataStore.add(value.onOptionsDidChange(() => {
				this.editor.updateOptions(updateOptions(value.options ?? {}));
			}));
		}
		if (optionsOverride) {
			this._dataStore.add(autorun(reader => {
				optionsOverride.read(reader);
				this.editor.updateOptions(updateOptions(value.options ?? {}));
			}));
		}
		if (item.documentDiffItem.contextKeys) {
			for (const [key, value] of Object.entries(item.documentDiffItem.contextKeys)) {
				this._contextKeyService.createKey(key, value);
			}
		}
	}

	private readonly _headerHeight;

	public render(verticalRange: OffsetRange, width: number, editorScroll: number, viewPort: OffsetRange): void {
		this._elements.root.style.visibility = 'visible';
		this._elements.root.style.top = `${verticalRange.start}px`;
		this._elements.root.style.height = `${verticalRange.length}px`;
		this._elements.root.style.width = `${width}px`;
		this._elements.root.style.position = 'absolute';

		// For sticky scroll
		const maxDelta = verticalRange.length - this._headerHeight;
		const delta = Math.max(0, Math.min(viewPort.start - verticalRange.start, maxDelta));
		this._elements.header.style.transform = `translateY(${delta}px)`;

		globalTransaction(tx => {
			this.editor.layout({
				width: width - this._itemHorizontalInsets.left - this._itemHorizontalInsets.right,
				height: verticalRange.length - this._outerEditorHeight,
			});
		});
		this.editor.getOriginalEditor().setScrollTop(editorScroll);
		this._flushVerticalState();

		this._elements.header.classList.toggle('shadow', delta > 0 || editorScroll > 0);
		this._elements.header.classList.toggle('collapsed', delta === maxDelta);
	}

	private _scheduleVerticalStateUpdate(): void {
		if (this._verticalStateUpdate.value) {
			return;
		}
		this._verticalStateUpdate.value = scheduleAtNextAnimationFrame(getWindow(this._elements.root), () => this._flushVerticalState());
	}

	private _flushVerticalState(): void {
		this._verticalStateUpdate.clear();
		globalTransaction(tx => {
			this._editorContentHeight.set(this._observedEditorContentHeight, tx);
		});
	}

	public hide(): void {
		this._elements.root.classList.remove('header-hovered');
		this._elements.root.style.top = `-100000px`;
		this._elements.root.style.visibility = 'hidden'; // Some editor parts are still visible
	}

	public unbind(item: DocumentDiffItemViewModel): void {
		if (this._viewModel.get() !== item) {
			throw new BugIndicatingError('Cannot unbind a diff editor template from a different item');
		}
		this.setItem(undefined);
		this._bindingContext = undefined;
	}
}

export class DiffEditorItemBinding extends VirtualizedItemBinding<DocumentDiffItemViewModel> {
	readonly size;
	readonly maxScroll;
	readonly shouldKeepAlive;
	readonly editor;

	constructor(
		item: DocumentDiffItemViewModel,
		private readonly _template: DiffEditorItemTemplate,
	) {
		super(item);
		this.size = _template.size;
		this.maxScroll = _template.maxScroll;
		this.shouldKeepAlive = _template.isFocused;
		this.editor = _template.editor;
	}

	render(renderedRange: OffsetRange, scrollOffset: number, width: number, renderedViewport: OffsetRange): void {
		this._template.render(renderedRange, width, scrollOffset, renderedViewport);
	}

	hide(): void {
		this._template.hide();
	}

	setScrollLeft(scrollLeft: number): void {
		this._template.setScrollLeft(scrollLeft);
	}

	getExpandedContentHeight(): number {
		return this._template.getExpandedContentHeight();
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._template.unbind(this.item);
		super.dispose();
	}
}
