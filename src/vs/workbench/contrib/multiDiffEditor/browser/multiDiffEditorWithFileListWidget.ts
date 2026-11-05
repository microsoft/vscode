/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension, getActiveElement } from '../../../../base/browser/dom.js';
import { LayoutPriority, Orientation, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { multiDiffEditorBorder } from '../../../../editor/browser/widget/multiDiffEditor/colors.js';
import { IMultiDiffEditorWidgetOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorOptions.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { MultiDiffEditorFileList } from './multiDiffEditorFileList.js';
import { MultiDiffEditorFileListPosition, MultiDiffEditorFileListViewMode } from '../common/multiDiffEditor.js';
import './media/multiDiffEditorWithFileList.css';

/**
 * Composes a {@link MultiDiffEditorWidget} with a list of its files docked on
 * either edge. The list is shown while `fileListVisible` is `true` and the
 * container is wide enough to fit both the diffs and the list. `fileListViewMode`
 * selects whether it shows a flat list or a tree of folders.
 *
 * Hosts drive the diffs through {@link multiDiffEditorWidget} and only route
 * layout through this composite.
 */
export class MultiDiffEditorWithFileListWidget extends Disposable {
	static readonly DEFAULT_FILE_LIST_WIDTH = 260;
	static readonly MIN_FILE_LIST_WIDTH = 160;
	static readonly MIN_DIFF_EDITOR_WIDTH = 400;
	static readonly FILE_LIST_WIDTH_STORAGE_KEY = 'multiDiffEditor.fileListWidth';

	readonly multiDiffEditorWidget: MultiDiffEditorWidget;

	private readonly _splitView: SplitView<number>;
	private readonly _fileListContainer: HTMLElement;
	private readonly _fileList = this._register(new MutableDisposable<MultiDiffEditorFileList>());
	private readonly _width = observableValue(this, 0);
	private _fileListIndex = 1;
	readonly isFileListVisible = observableValue(this, false);
	/** Width the user wants for the list; the split view may temporarily squeeze it when space is short. */
	private _preferredFileListWidth: number;

	constructor(
		container: HTMLElement,
		workbenchUIElementFactory: IWorkbenchUIElementFactory,
		widgetOptions: IMultiDiffEditorWidgetOptions,
		fileListVisible: IObservable<boolean>,
		fileListViewMode: IObservable<MultiDiffEditorFileListViewMode>,
		fileListPosition: IObservable<MultiDiffEditorFileListPosition>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IThemeService themeService: IThemeService,
	) {
		super();

		const root = append(container, $('.multi-diff-editor-with-file-list'));
		const diffEditorContainer = $('.multi-diff-editor-with-file-list-editor');
		this._fileListContainer = $('.multi-diff-editor-with-file-list-files');

		this.multiDiffEditorWidget = this._register(this._instantiationService.createInstance(
			MultiDiffEditorWidget,
			diffEditorContainer,
			workbenchUIElementFactory,
			widgetOptions,
		));

		this._splitView = this._register(new SplitView<number>(root, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: false,
		}));

		const isFileListVisible = this.isFileListVisible;
		this._splitView.addView({
			element: diffEditorContainer,
			// Only reserve room for the diffs while they share the width, so they fit narrow editor groups otherwise.
			get minimumSize() { return isFileListVisible.get() ? MultiDiffEditorWithFileListWidget.MIN_DIFF_EDITOR_WIDTH : 0; },
			maximumSize: Number.POSITIVE_INFINITY,
			priority: LayoutPriority.High,
			onDidChange: Event.None,
			layout: (width, _offset, height) => this.multiDiffEditorWidget.layout(new Dimension(width, height ?? 0)),
		}, Sizing.Distribute, undefined, true);

		this._preferredFileListWidth = this._storageService.getNumber(MultiDiffEditorWithFileListWidget.FILE_LIST_WIDTH_STORAGE_KEY, StorageScope.PROFILE, MultiDiffEditorWithFileListWidget.DEFAULT_FILE_LIST_WIDTH);

		this._splitView.addView({
			element: this._fileListContainer,
			minimumSize: MultiDiffEditorWithFileListWidget.MIN_FILE_LIST_WIDTH,
			maximumSize: Number.POSITIVE_INFINITY,
			priority: LayoutPriority.Low,
			onDidChange: Event.None,
			layout: (width, _offset, height) => this._fileList.value?.layout(height ?? 0, width),
		}, Sizing.Invisible(this._preferredFileListWidth), undefined, true);

		this._register(this._splitView.onDidSashChange(() => {
			this._preferredFileListWidth = this._splitView.getViewSize(this._fileListIndex);
			this._storageService.store(MultiDiffEditorWithFileListWidget.FILE_LIST_WIDTH_STORAGE_KEY, this._preferredFileListWidth, StorageScope.PROFILE, StorageTarget.USER);
		}));

		this._register(this._splitView.onDidSashReset(() => {
			this._preferredFileListWidth = MultiDiffEditorWithFileListWidget.DEFAULT_FILE_LIST_WIDTH;
			this._restorePreferredFileListWidth();
			this._storageService.remove(MultiDiffEditorWithFileListWidget.FILE_LIST_WIDTH_STORAGE_KEY, StorageScope.PROFILE);
		}));

		const updateStyles = () => this._splitView.style({ separatorBorder: themeService.getColorTheme().getColor(multiDiffEditorBorder) ?? Color.transparent });
		this._register(themeService.onDidColorThemeChange(updateStyles));
		updateStyles();

		this._register(autorun(reader => {
			const index = fileListPosition.read(reader) === 'left' ? 0 : 1;
			if (index !== this._fileListIndex) {
				const hadFocus = this._fileListContainer.contains(getActiveElement());
				const previousIndex = this._fileListIndex;
				this._fileListIndex = index;
				this._splitView.moveView(previousIndex, index);
				this._restorePreferredFileListWidth();
				if (hadFocus) {
					this._fileList.value?.focus();
				}
			}
		}));

		this._register(autorun(reader => {
			const enabled = fileListVisible.read(reader);
			const hasRoom = this._width.read(reader) >= MultiDiffEditorWithFileListWidget.MIN_DIFF_EDITOR_WIDTH + MultiDiffEditorWithFileListWidget.MIN_FILE_LIST_WIDTH;
			if (!enabled) {
				this._fileList.clear();
			} else if (!this._fileList.value) {
				this._fileList.value = this._instantiationService.createInstance(MultiDiffEditorFileList, this._fileListContainer, this.multiDiffEditorWidget, fileListViewMode);
			}
			const visible = enabled && hasRoom;
			// Update before the split view relayouts, which reads it for the diffs' minimum width.
			this.isFileListVisible.set(visible, undefined);
			if (this._splitView.isViewVisible(this._fileListIndex) !== visible) {
				this._splitView.setViewVisible(this._fileListIndex, visible);
				this._restorePreferredFileListWidth();
			}
		}));
	}

	/** Lays out the diffs and, if shown, the file list. The diffs get the remaining width. */
	layout(dimension: Dimension): void {
		// Lay out before updating visibility so a newly shown list gets its preferred width
		// rather than being squeezed into a split view that does not know its size yet.
		this._splitView.layout(dimension.width, dimension.height);
		this._width.set(dimension.width, undefined);
		this._restorePreferredFileListWidth();
	}

	/** Moves keyboard focus to the file list. Does nothing while the list is hidden. */
	focusFileList(): void {
		if (this.isFileListVisible.get()) {
			this._fileList.value?.focus();
		}
	}

	/** Gives the list its preferred width back, as far as the diffs' minimum width allows. */
	private _restorePreferredFileListWidth(): void {
		if (this._splitView.isViewVisible(this._fileListIndex) && this._splitView.getViewSize(this._fileListIndex) !== this._preferredFileListWidth) {
			this._splitView.resizeView(this._fileListIndex, this._preferredFileListWidth);
		}
	}
}
