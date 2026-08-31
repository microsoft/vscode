/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, h } from '../../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, ITransaction, autorun, autorunWithStore, derived, mapObservableArrayCached, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ContextKeyValue, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { OffsetRange } from '../../../common/core/ranges/offsetRange.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { IRange } from '../../../common/core/range.js';
import { ISelection, Selection } from '../../../common/core/selection.js';
import { IDiffEditor } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ICodeEditor } from '../../editorBrowser.js';
import { CompressedVirtualizedScrollView, ICompressedVirtualizedScrollItem, ICompressedVirtualizedScrollItemContext } from './compressedVirtualizedScrollView.js';
import { ICompressedVirtualizedScrollLayout } from './compressedVirtualizedScrollLayout.js';
import { DiffEditorItemBinding, DiffEditorItemTemplate } from './diffEditorItemTemplate.js';
import { IDocumentDiffItem } from './model.js';
import { formatDiffItemKey, formatUri, ILoggedDiffItem, MultiDiffEditorLogger } from './multiDiffEditorLogging.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from './multiDiffEditorViewModel.js';
import { RevealOptions } from './multiDiffEditorWidget.js';
import './style.css';
import { ManagedVirtualizedItem, VirtualizedItemManager } from './virtualizedItemManager.js';
import { IWorkbenchUIElementFactory } from './workbenchUIElementFactory.js';

export class MultiDiffEditorWidgetImpl extends Disposable {
	private readonly _scrollView;

	private readonly _elements;

	private readonly _optionsOverride: IObservable<IDiffEditorOptions>;

	public readonly scrollTop;
	public readonly scrollLeft;
	public readonly layoutDebugState: IObservable<IMultiDiffEditorLayoutDebugState>;

	private readonly _viewItemsInfo;

	private readonly _viewItems;

	private readonly _spaceBetweenPx;
	public readonly activeControl;

	private readonly _contextKeyService;
	private readonly _instantiationService;

	private readonly _logger: MultiDiffEditorLogger;

	/**
	 * When `true`, the automatic "select the first change" initialization that
	 * runs once the view model finishes loading does not move keyboard focus
	 * into the editor. Driven by {@link setPreserveFocusOnLoad} so a
	 * `preserveFocus` open (e.g. restored in the background or on a session
	 * switch) does not steal focus, while a normal user-initiated open does.
	 */
	private _preserveFocusOnLoad = false;

	constructor(
		private readonly _element: HTMLElement,
		private readonly _dimension: IObservable<Dimension | undefined>,
		private readonly _viewModel: IObservable<MultiDiffEditorViewModel | undefined>,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		private readonly _diffLayoutOptions: IObservable<IDiffEditorOptions | undefined>,
		private readonly _diffEditorOptions: IDiffEditorOptions | undefined,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@IInstantiationService private readonly _parentInstantiationService: IInstantiationService,
		@ILogService logService: ILogService,
	) {
		super();
		this._logger = this._register(new MultiDiffEditorLogger(logService));
		this._optionsOverride = derived(this, reader => {
			return { ...this._diffEditorOptions, ...this._diffLayoutOptions.read(reader) };
		});
		this._spaceBetweenPx = observableValue(this, 0);

		let viewItemsInfo!: IObservable<{ items: readonly VirtualizedViewItem[]; getItem: (viewModel: DocumentDiffItemViewModel) => VirtualizedViewItem }>;
		let viewItems!: IObservable<readonly VirtualizedViewItem[]>;
		this._scrollView = this._register(new CompressedVirtualizedScrollView(
			this._element,
			this._dimension,
			this._spaceBetweenPx,
			context => {
				const sourceItems = derived(this, reader => this._viewModel.read(reader)?.items.read(reader) ?? []);
				const manager = this._register(new VirtualizedItemManager<DocumentDiffItemViewModel, DiffEditorItemBinding, DiffEditorItemTemplate>(sourceItems, context, {
					getId: item => item,
					getTemplateId: () => 'diffEditor',
					getUnboundSize: item => derived(item, reader => item.collapsed.read(reader) ? 40 : item.lastTemplateData.read(reader).expandedContentHeight),
					createTemplate: () => this._instantiationService.createInstance(
						DiffEditorItemTemplate,
						context.contentDomNode,
						context.overflowWidgetsDomNode,
						this._workbenchUIElementFactory,
						this._optionsOverride,
					),
					onDidBind: binding => {
						const selections = binding.item.lastTemplateData.get().selections;
						this._logger.log('acquired editor template', {
							file: formatUri(binding.item.modifiedUri ?? binding.item.originalUri),
							collapsed: binding.item.collapsed.get(),
							expectedExpandedContentHeight: binding.item.lastTemplateData.get().expandedContentHeight,
							selections: selections?.length ?? 0,
						});
						if (selections) {
							binding.editor.setSelections(selections);
						}
					},
					onWillUnbind: (binding, tx) => {
						this._logger.log('releasing editor template', {
							file: formatUri(binding.item.modifiedUri ?? binding.item.originalUri),
							contentHeight: binding.size.get(),
						});
						binding.item.lastTemplateData.set({
							expandedContentHeight: binding.getExpandedContentHeight(),
							selections: binding.editor.getSelections() ?? undefined,
						}, tx);
					},
				}));
				const adaptedItems = mapObservableArrayCached(this, manager.virtualizedItems, (item, store) => {
					const adaptedItem = store.add(new VirtualizedViewItem(item, context.scrollLeft, this._logger));
					const data = this._lastDocStates?.[adaptedItem.getKey()];
					if (data) {
						transaction(tx => adaptedItem.setViewState(data, tx));
					}
					return adaptedItem;
				}).recomputeInitiallyAndOnChange(this._store);
				viewItemsInfo = derived<{ items: readonly VirtualizedViewItem[]; getItem: (viewModel: DocumentDiffItemViewModel) => VirtualizedViewItem }>(this, reader => {
					const items = adaptedItems.read(reader);
					const map = new Map(items.map(item => [item.viewModel, item]));
					const restoredDocStates = items.filter(item => this._lastDocStates?.[item.getKey()] !== undefined).length;
					this._logger.log('view items updated', {
						items: items.length,
						restoredDocStates,
					});
					return { items, getItem: d => map.get(d)! };
				});
				viewItems = viewItemsInfo.map(this, items => items.items);
				return viewItems;
			},
		));
		this._viewItemsInfo = viewItemsInfo;
		this._viewItems = viewItems;
		this.scrollTop = this._scrollView.scrollTop;
		this.scrollLeft = this._scrollView.scrollLeft;
		this.layoutDebugState = derived(this, reader => {
			const layout = this._scrollView.layout.read(reader);
			const items = this._viewItems.read(reader);
			const geometryEdit = this._scrollView.lastGeometryEdit.read(reader);
			return {
				scrollLeft: this.scrollLeft.read(reader),
				scrollDimensions: this._scrollView.scrollDimensions.read(reader),
				layout: {
					revision: layout.revision,
					scrollTop: layout.scrollTop,
					logicalScrollHeight: layout.logicalScrollHeight,
					scrollHeight: layout.scrollHeight,
					renderedHeight: layout.renderedHeight,
					leadingScrollSlack: layout.leadingScrollSlack,
					trailingScrollSlack: layout.trailingScrollSlack,
					contentViewport: serializeOffsetRange(layout.contentViewport),
					renderedViewport: serializeOffsetRange(layout.renderedViewport),
					hiddenContentHeightAboveViewport: layout.hiddenContentHeightAboveViewport,
				},
				geometryEdit: geometryEdit ? {
					...geometryEdit,
					edits: geometryEdit.edits.map(edit => ({
						oldRange: serializeOffsetRange(edit.oldRange),
						newRange: serializeOffsetRange(edit.newRange),
					})),
				} : undefined,
				items: items.map((item, index) => item.getLayoutDebugState(reader, layout.items[index])),
			};
		});
		this._elements = h('div.monaco-component.multiDiffEditor', {}, [
			this._scrollView.domNode,
			h('div.placeholder@placeholder', {}, [h('div')]),
		]);
		this.activeControl = derived(this, reader => {
			const activeDiffItem = this._viewModel.read(reader)?.activeDiffItem.read(reader);
			if (!activeDiffItem) { return undefined; }
			const viewItem = this._viewItemsInfo.read(reader).getItem(activeDiffItem);
			return viewItem.template.read(reader)?.editor;
		});
		this._contextKeyService = this._register(this._parentContextKeyService.createScoped(this._element));
		this._instantiationService = this._register(this._parentInstantiationService.createChild(
			new ServiceCollection([IContextKeyService, this._contextKeyService])
		));

		this._contextKeyService.createKey(EditorContextKeys.inMultiDiffEditor.key, true);

		this._lastDocStates = {};

		this._register(autorunWithStore((reader, store) => {
			const viewModel = this._viewModel.read(reader);
			if (viewModel && viewModel.contextKeys) {
				for (const [key, value] of Object.entries(viewModel.contextKeys)) {
					const contextKey = this._contextKeyService.createKey<ContextKeyValue>(key, undefined);
					contextKey.set(value);
					store.add(toDisposable(() => contextKey.reset()));
				}
			}
		}));

		const ctxAllCollapsed = this._parentContextKeyService.createKey<boolean>(EditorContextKeys.multiDiffEditorAllCollapsed.key, false);
		this._register(autorun((reader) => {
			const viewModel = this._viewModel.read(reader);
			if (viewModel) {
				const allCollapsed = viewModel.items.read(reader).every(item => item.collapsed.read(reader));
				ctxAllCollapsed.set(allCollapsed);
			}
		}));

		const ctxRenderSideBySide = this._parentContextKeyService.createKey<boolean>(EditorContextKeys.multiDiffEditorRenderSideBySide.key, true);
		this._register(autorun((reader) => {
			const renderSideBySide = this._diffLayoutOptions.read(reader)?.renderSideBySide;
			if (renderSideBySide !== undefined) {
				ctxRenderSideBySide.set(renderSideBySide);
			}
		}));

		this._logger.logStateChanges({
			viewModel: this._viewModel,
			items: this._viewItems,
			spaceBetweenPx: this._spaceBetweenPx.get(),
			getScrollTop: () => this._scrollView.getScrollPosition().scrollTop,
			isPreserveFocusOnLoad: () => this._preserveFocusOnLoad,
		});

		const placeholderMessage = derived(reader => {
			const items = this._viewItems.read(reader);
			if (items.length > 0) { return undefined; }

			const vm = this._viewModel.read(reader);
			return (!vm || vm.isLoading.read(reader))
				? localize('loading', 'Loading...')
				: localize('noChangedFiles', 'No Changed Files');
		});

		this._register(autorun((reader) => {
			const message = placeholderMessage.read(reader);
			this._elements.placeholder.innerText = message ?? '';
			this._elements.placeholder.classList.toggle('visible', !!message);
		}));

		this._register(autorun(reader => {
			this._scrollView.scrollDimensions.read(reader);
			// A restored scroll offset applied before the model updated these
			// dimensions would be clamped against a stale (often 0) scrollHeight, so
			// apply it here once the dimensions are known.
			this._applyPendingScrollState();
		}));

		_element.replaceChildren(this._elements.root);
		this._register(toDisposable(() => {
			_element.replaceChildren();
		}));

		// Automatically select the first change in the first file when items are loaded
		this._register(autorun(reader => {
			/** @description Initialize first change */
			const viewModel = this._viewModel.read(reader);
			if (!viewModel) {
				return;
			}

			// Only initialize when loading is complete
			if (!viewModel.isLoading.read(reader)) {
				const items = viewModel.items.read(reader);
				if (items.length === 0) {
					return;
				}

				// Only initialize if there's no active item yet
				const activeDiffItem = viewModel.activeDiffItem.read(reader);
				if (activeDiffItem) {
					return;
				}

				// Restore the persisted active item instead of selecting the first
				// change, so the restored scroll/collapsed state is preserved.
				if (this._restorePendingActiveDiffItem(viewModel, items)) {
					return;
				}

				this._logger.log('no active diff item after loading, selecting first change', { items: items.length });

				// Navigate to the first change using the existing navigation
				// logic. Whether this also moves keyboard focus into the editor
				// is driven by the last `setViewModel` call: an editor opened
				// with `preserveFocus` (e.g. restored in the background or on a
				// session switch) must not steal focus from wherever the user is
				// (such as the chat input), while a normal user-initiated open
				// focuses the first change so the editor is ready to use.
				this._navigateToChange('next', !this._preserveFocusOnLoad);
			}
		}));

	}

	public setScrollState(scrollState: { top?: number; left?: number }): void {
		this._pendingScrollState = scrollState;
		this._applyPendingScrollState();
	}

	/**
	 * Applies a restored scroll offset once the scrollable dimensions can
	 * accommodate it; retries on subsequent dimension updates until it sticks (so
	 * a fresh/reloaded widget whose content height is not yet known does not clamp
	 * the offset to 0). Consumed once it lands.
	 */
	private _applyPendingScrollState(): void {
		const pending = this._pendingScrollState;
		if (!pending) {
			return;
		}
		this._scrollView.setScrollPosition({ scrollLeft: pending.left, scrollTop: pending.top });
		const applied = this._scrollView.getScrollPosition();
		const topLanded = pending.top === undefined || applied.scrollTop >= pending.top;
		const leftLanded = pending.left === undefined || applied.scrollLeft >= pending.left;
		if (topLanded && leftLanded) {
			this._pendingScrollState = undefined;
		}
		this._logger.log('applied pending scroll state', {
			requested: pending,
			applied: { top: applied.scrollTop, left: applied.scrollLeft },
			landed: topLanded && leftLanded,
		});
	}

	/**
	 * Clears any pending restoration state (documents, active item, scroll). Called
	 * when a new model is installed without a view state, so it cannot inherit the
	 * previous model's state for overlapping diff keys.
	 */
	public clearPendingRestorationState(): void {
		this._logger.log('cleared pending restoration state', {
			hadDocStates: !!this._lastDocStates,
			hadActiveDiffItemKey: !!this._lastActiveDiffItemKey,
			hadScrollState: !!this._pendingScrollState,
		});
		this._lastDocStates = undefined;
		this._lastActiveDiffItemKey = undefined;
		this._pendingScrollState = undefined;
	}

	/**
	 * Controls whether the automatic first-change selection that runs once the
	 * view model finishes loading preserves focus instead of moving it into the
	 * editor. Set to `true` for `preserveFocus` opens so focus is not stolen
	 * from elsewhere.
	 */
	public setPreserveFocusOnLoad(preserveFocus: boolean): void {
		this._preserveFocusOnLoad = preserveFocus;
	}

	public getRootElement(): HTMLElement {
		return this._elements.root;
	}

	public getContextKeyService(): IContextKeyService {
		return this._contextKeyService;
	}

	public getScopedInstantiationService(): IInstantiationService {
		return this._instantiationService;
	}
	public reveal(resource: IMultiDiffResourceId, options?: RevealOptions): void {
		const viewItems = this._viewItems.get();
		const index = viewItems.findIndex(
			(item) => item.viewModel.originalUri?.toString() === resource.original?.toString()
				&& item.viewModel.modifiedUri?.toString() === resource.modified?.toString()
		);
		if (index === -1) {
			throw new BugIndicatingError('Resource not found in diff editor');
		}
		const viewItem = viewItems[index];
		this._viewModel.get()!.activeDiffItem.setCache(viewItem.viewModel, undefined);

		let scrollTop = 0;
		for (let i = 0; i < index; i++) {
			scrollTop += viewItems[i].contentHeight.get() + this._spaceBetweenPx.get();
		}
		this._logger.log('reveal', {
			file: viewItem.getLabel(),
			index,
			scrollTop: `${this._scrollView.getScrollPosition().scrollTop} -> ${scrollTop}`,
			range: options?.range,
		});
		this._scrollView.setScrollPosition({ scrollTop });

		const diffEditor = viewItem.template.get()?.editor;
		const editor = 'original' in resource ? diffEditor?.getOriginalEditor() : diffEditor?.getModifiedEditor();
		if (editor && options?.range) {
			editor.revealRangeInCenter(options.range);
			highlightRange(editor, options.range);
		}
	}

	public getViewState(): IMultiDiffEditorViewState {
		const viewState: IMultiDiffEditorViewState = {
			scrollState: {
				top: this.scrollTop.get(),
				left: this.scrollLeft.get(),
			},
			docStates: Object.fromEntries(this._viewItems.get().map(i => [i.getKey(), i.getViewState()])),
			activeDiffItemKey: this._viewModel.get()?.activeDiffItem.get()?.getKey(),
		};
		if (this._logger.isEnabled) {
			const docStates = Object.values(viewState.docStates ?? {});
			this._logger.log('get view state', {
				scrollTop: viewState.scrollState.top,
				scrollLeft: viewState.scrollState.left,
				docStates: docStates.length,
				collapsed: docStates.filter(s => s.collapsed).length,
				activeDiffItem: formatDiffItemKey(viewState.activeDiffItemKey),
			});
		}
		return viewState;
	}

	/** This accounts for documents that are not loaded yet. */
	private _lastDocStates: IMultiDiffEditorViewState['docStates'];

	/**
	 * The active diff item to restore once the documents are loaded. Restoring it
	 * suppresses the automatic first-change navigation (which would expand the
	 * first file and reset scroll), so the restored state wins. Consumed once.
	 */
	private _lastActiveDiffItemKey: string | undefined;

	/** A restored scroll offset waiting for the scrollable dimensions to be known. */
	private _pendingScrollState: { top?: number; left?: number } | undefined;

	public setViewState(viewState: IMultiDiffEditorViewState, tx?: ITransaction): void {
		if (this._logger.isEnabled) {
			const docStates = Object.values(viewState.docStates ?? {});
			this._logger.log('set view state', {
				scrollTop: viewState.scrollState.top,
				scrollLeft: viewState.scrollState.left,
				docStates: docStates.length,
				collapsed: docStates.filter(s => s.collapsed).length,
				activeDiffItem: formatDiffItemKey(viewState.activeDiffItemKey),
				viewItems: this._viewItems.get().length,
			});
		}
		this.setScrollState(viewState.scrollState);

		this._lastDocStates = viewState.docStates;
		this._lastActiveDiffItemKey = viewState.activeDiffItemKey;

		const applyDocStates = (tx: ITransaction) => {
			if (viewState.docStates) {
				for (const i of this._viewItems.get()) {
					const state = viewState.docStates[i.getKey()];
					if (state) {
						i.setViewState(state, tx);
					}
				}
			}
		};
		if (tx) {
			applyDocStates(tx);
		} else {
			transaction(applyDocStates);
		}

		// If the documents are already loaded, restore the active item now (this
		// overrides the first-change selection the init autorun may have made);
		// otherwise the init autorun restores it once loading completes.
		const viewModel = this._viewModel.get();
		if (viewModel) {
			this._restorePendingActiveDiffItem(viewModel, viewModel.items.get());
		}
	}

	/**
	 * Restores the persisted active diff item (if any) onto the view model, so the
	 * automatic first-change navigation is skipped. On an explicit (non-preserve-focus)
	 * open it also moves focus into the restored item's editor, mirroring the
	 * first-change navigation it replaces. Returns whether it was applied.
	 */
	private _restorePendingActiveDiffItem(viewModel: MultiDiffEditorViewModel, items: readonly DocumentDiffItemViewModel[]): boolean {
		const key = this._lastActiveDiffItemKey;
		if (key === undefined || items.length === 0) {
			return false;
		}
		this._lastActiveDiffItemKey = undefined;
		const target = items.find(i => i.getKey() === key);
		if (!target) {
			if (this._logger.isEnabled) {
				this._logger.log('persisted active diff item not found', {
					key: formatDiffItemKey(key),
					availableKeys: items.map(i => formatDiffItemKey(i.getKey())),
				});
			}
			return false;
		}
		this._logger.log('restored active diff item', { file: target.modifiedUri ?? target.originalUri, preserveFocus: this._preserveFocusOnLoad });
		viewModel.activeDiffItem.setCache(target, undefined);

		if (!this._preserveFocusOnLoad) {
			this._viewItemsInfo.get().getItem(target).template.get()?.editor.focus();
		}
		return true;
	}

	public findDocumentDiffItem(resource: URI): IDocumentDiffItem | undefined {
		const item = this._viewItems.get().find(v =>
			v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()
			|| v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
		);
		return item?.viewModel.documentDiffItem;
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		const item = this._viewItems.get().find(v =>
			v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()
			|| v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
		);
		const editor = item?.template.get()?.editor;
		if (!editor) {
			return undefined;
		}

		if (item.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()) {
			return { diffEditor: editor, editor: editor.getModifiedEditor() };
		} else {
			return { diffEditor: editor, editor: editor.getOriginalEditor() };
		}
	}

	public goToNextChange(): void {
		this._navigateToChange('next');
	}

	public goToPreviousChange(): void {
		this._navigateToChange('previous');
	}

	private _navigateToChange(direction: 'next' | 'previous', focusEditor: boolean = true): void {
		const viewItems = this._viewItems.get();
		if (viewItems.length === 0) {
			return;
		}

		const activeViewModel = this._viewModel.get()?.activeDiffItem.get();
		const currentIndex = activeViewModel ? viewItems.findIndex(v => v.viewModel === activeViewModel) : -1;

		this._logger.log('navigate to change', { direction, focusEditor, currentIndex, items: viewItems.length });

		// Start with first file if no active item
		if (currentIndex === -1) {
			this._goToFile(0, 'first', focusEditor);
			return;
		}

		// Try current file first - expand if collapsed
		const currentItem = viewItems[currentIndex];
		if (currentItem.viewModel.collapsed.get()) {
			this._logger.log('expanding collapsed item to navigate within it', { file: currentItem.getLabel() });
			currentItem.viewModel.collapsed.set(false, undefined);
		}

		const editor = currentItem.template.get()?.editor;
		if (editor?.getDiffComputationResult()?.changes2?.length) {
			const pos = editor.getModifiedEditor().getPosition()?.lineNumber || 1;
			const changes = editor.getDiffComputationResult()!.changes2!;
			const hasNext = direction === 'next' ? changes.some(c => c.modified.startLineNumber > pos) : changes.some(c => c.modified.endLineNumberExclusive <= pos);

			if (hasNext) {
				editor.goToDiff(direction);
				return;
			}
		}

		// Move to next/previous file
		const nextIndex = (currentIndex + (direction === 'next' ? 1 : -1) + viewItems.length) % viewItems.length;
		this._goToFile(nextIndex, direction === 'next' ? 'first' : 'last', focusEditor);
	}

	private _goToFile(index: number, position: 'first' | 'last', focusEditor: boolean = true): void {
		const item = this._viewItems.get()[index];
		const wasCollapsed = item.viewModel.collapsed.get();
		this._logger.log('go to file', { file: item.getLabel(), index, position, focusEditor, wasCollapsed });
		if (wasCollapsed) {
			item.viewModel.collapsed.set(false, undefined);
		}

		this.reveal({ original: item.viewModel.originalUri, modified: item.viewModel.modifiedUri });

		const editor = item.template.get()?.editor;
		if (editor?.getDiffComputationResult()?.changes2?.length) {
			if (position === 'first') {
				editor.revealFirstDiff();
			} else {
				const lastChange = editor.getDiffComputationResult()!.changes2!.at(-1)!;
				const modifiedEditor = editor.getModifiedEditor();
				modifiedEditor.setPosition({ lineNumber: lastChange.modified.startLineNumber, column: 1 });
				modifiedEditor.revealLineInCenter(lastChange.modified.startLineNumber);
			}
		}
		if (focusEditor) {
			editor?.focus();
		}
	}

}

function highlightRange(targetEditor: ICodeEditor, range: IRange) {
	const modelNow = targetEditor.getModel();
	const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: 'symbol-navigate-action-highlight', className: 'symbolHighlight' } }]);
	setTimeout(() => {
		if (targetEditor.getModel() === modelNow) {
			decorations.clear();
		}
	}, 350);
}

export interface IMultiDiffEditorViewState {
	scrollState: { top: number; left: number };
	docStates?: Record<string, IMultiDiffDocState>;
	/** Key ({@link DocumentDiffItemViewModel.getKey}) of the active diff item, if any. */
	activeDiffItemKey?: string;
}

interface IMultiDiffDocState {
	collapsed: boolean;
	selections?: ISelection[];
}

export interface IMultiDiffEditorOptions extends ITextEditorOptions {
	viewState?: IMultiDiffEditorOptionsViewState;
}

export interface IMultiDiffEditorOptionsViewState {
	revealData?: {
		resource: IMultiDiffResourceId;
		range?: IRange;
	};
}

export type IMultiDiffResourceId = { original: URI | undefined; modified: URI | undefined };

export interface IMultiDiffEditorLayoutDebugState {
	readonly scrollLeft: number;
	readonly scrollDimensions: {
		readonly width: number;
		readonly height: number;
		readonly scrollWidth: number;
		readonly scrollHeight: number;
	};
	readonly layout: {
		readonly revision: number;
		readonly scrollTop: number;
		readonly logicalScrollHeight: number;
		readonly scrollHeight: number;
		readonly renderedHeight: number;
		readonly leadingScrollSlack: number;
		readonly trailingScrollSlack: number;
		readonly contentViewport: ISerializedOffsetRange;
		readonly renderedViewport: ISerializedOffsetRange;
		readonly hiddenContentHeightAboveViewport: number;
	};
	readonly geometryEdit: {
		readonly fromRevision: number;
		readonly toRevision: number;
		readonly edits: readonly {
			readonly oldRange: ISerializedOffsetRange;
			readonly newRange: ISerializedOffsetRange;
		}[];
		readonly anchorKind: 'viewportTop' | 'viewportBottom' | 'logical' | 'item';
		readonly anchorOffset: number;
		readonly mappedAnchorOffset: number;
		readonly anchorViewportOffset: number;
		readonly desiredScrollTop: number;
		readonly appliedScrollTop: number;
		readonly leadingScrollSlack: number;
		readonly trailingScrollSlack: number;
	} | undefined;
	readonly items: readonly IMultiDiffEditorItemLayoutDebugState[];
}

interface IMultiDiffEditorItemLayoutDebugState {
	readonly key: string;
	readonly label: string;
	readonly originalUri: string | null;
	readonly modifiedUri: string | null;
	readonly collapsed: boolean;
	readonly hasTemplate: boolean;
	readonly verticalState: {
		readonly contentHeight: number;
		readonly itemViewportOffset: number;
	};
	readonly maxScroll: number;
	readonly layout: {
		readonly contentRange: ISerializedOffsetRange;
		readonly renderedRange: ISerializedOffsetRange;
		readonly maxScrollOffset: number;
		readonly scrollOffset: number;
		readonly visibility: 'before' | 'visible' | 'after';
	};
}

interface ISerializedOffsetRange {
	readonly start: number;
	readonly endExclusive: number;
}

function serializeOffsetRange(range: OffsetRange): ISerializedOffsetRange {
	return { start: range.start, endExclusive: range.endExclusive };
}

class VirtualizedViewItem extends Disposable implements ILoggedDiffItem, ICompressedVirtualizedScrollItem {
	public readonly size;
	public readonly contentHeight;
	public readonly maxScroll;
	public readonly template;
	public readonly binding;
	public readonly viewModel;

	public get collapsed(): IObservable<boolean> { return this.viewModel.collapsed; }

	public getLayoutDebugState(reader: IReader, layout: ICompressedVirtualizedScrollLayout['items'][number]): IMultiDiffEditorItemLayoutDebugState {
		const binding = this.binding.read(reader);
		return {
			key: this.getKey(),
			label: this.getLabel(),
			originalUri: this.viewModel.originalUri?.toString() ?? null,
			modifiedUri: this.viewModel.modifiedUri?.toString() ?? null,
			collapsed: this.collapsed.read(reader),
			hasTemplate: binding !== undefined,
			verticalState: {
				contentHeight: this.size.read(reader),
				itemViewportOffset: layout.scrollOffset,
			},
			maxScroll: this.maxScroll.read(reader).maxScroll,
			layout: {
				contentRange: serializeOffsetRange(layout.contentRange),
				renderedRange: serializeOffsetRange(layout.renderedRange),
				maxScrollOffset: layout.maxScrollOffset,
				scrollOffset: layout.scrollOffset,
				visibility: layout.visibility,
			},
		};
	}

	private readonly _isFocused;

	constructor(
		private readonly _managedItem: ManagedVirtualizedItem<DocumentDiffItemViewModel, DiffEditorItemBinding, DiffEditorItemTemplate>,
		private readonly _scrollLeft: IObservable<number>,
		private readonly _logger: MultiDiffEditorLogger,
	) {
		super();
		this.size = _managedItem.size;
		this.contentHeight = this.size;
		this.maxScroll = _managedItem.maxScroll;
		this.template = _managedItem.template;
		this.binding = _managedItem.binding;
		this.viewModel = _managedItem.item;
		this._isFocused = derived(this, reader => this.template.read(reader)?.isFocused.read(reader) ?? false);

		this.viewModel.setIsFocused(this._isFocused, undefined);

		this._register(autorun((reader) => {
			const scrollLeft = this._scrollLeft.read(reader);
			this.binding.read(reader)?.setScrollLeft(scrollLeft);
		}));
	}

	public override toString(): string {
		return `VirtualViewItem(${this.viewModel.documentDiffItem.modified?.uri.toString()})`;
	}

	public getKey(): string {
		return this.viewModel.getKey();
	}

	/** Short, log friendly name of this item. */
	public getLabel(): string {
		return formatUri(this.viewModel.modifiedUri ?? this.viewModel.originalUri);
	}

	public getViewState(): IMultiDiffDocState {
		transaction(tx => {
			this._updateTemplateData(tx);
		});
		return {
			collapsed: this.viewModel.collapsed.get(),
			selections: this.viewModel.lastTemplateData.get().selections,
		};
	}

	public setViewState(viewState: IMultiDiffDocState, tx: ITransaction): void {
		this._logger.log('item view state restored', { file: this.getLabel(), collapsed: viewState.collapsed, selections: viewState.selections?.length ?? 0 });
		this.viewModel.collapsed.set(viewState.collapsed, tx);

		this._updateTemplateData(tx);
		const data = this.viewModel.lastTemplateData.get();
		const selections = viewState.selections?.map(Selection.liftSelection);
		this.viewModel.lastTemplateData.set({
			...data,
			selections,
		}, tx);
		const binding = this.binding.get();
		if (binding && selections) {
			binding.editor.setSelections(selections);
		}
	}

	private _updateTemplateData(tx: ITransaction): void {
		const binding = this.binding.get();
		if (!binding) { return; }
		this.viewModel.lastTemplateData.set({
			expandedContentHeight: binding.getExpandedContentHeight(),
			selections: binding.editor.getSelections() ?? undefined,
		}, tx);
	}

	public hide(): void {
		this._managedItem.hide();
	}

	public render(verticalSpace: OffsetRange, offset: number, width: number, viewPort: OffsetRange, context: ICompressedVirtualizedScrollItemContext): void {
		this._managedItem.render(verticalSpace, offset, width, viewPort, context);
	}
}
