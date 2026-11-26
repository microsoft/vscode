/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, Dimension, getActiveElement } from '../../../../base/browser/dom.js';
import { LayoutPriority, Orientation, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
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
 * either edge. The list is shown while `fileListVisible` is `true`, however
 * narrow the container: the diffs then give up width down to their minimum, and
 * below it, the width the list needs. `fileListViewMode` selects whether it
 * shows a flat list or a tree of folders.
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
	private _width = 0;
	private _fileListIndex = 1;
	/** Whether the editor that shows the widget is visible, see {@link setVisible}. */
	private _visible = true;
	readonly isFileListVisible: IObservable<boolean>;
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
		this.isFileListVisible = fileListVisible;

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

		const getWidth = () => this._width;
		this._splitView.addView({
			element: diffEditorContainer,
			// Only reserve room for the diffs while they share the width, and leave the list its minimum width in narrow editor groups.
			get minimumSize() {
				return fileListVisible.get()
					? Math.max(0, Math.min(MultiDiffEditorWithFileListWidget.MIN_DIFF_EDITOR_WIDTH, getWidth() - MultiDiffEditorWithFileListWidget.MIN_FILE_LIST_WIDTH))
					: 0;
			},
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
			const visible = fileListVisible.read(reader);
			if (!visible) {
				this._fileList.clear();
			} else if (!this._fileList.value) {
				this._fileList.value = this._instantiationService.createInstance(MultiDiffEditorFileList, this._fileListContainer, this.multiDiffEditorWidget, fileListViewMode);
				this._fileList.value.setVisible(this._visible);
			}
			if (this._splitView.isViewVisible(this._fileListIndex) !== visible) {
				this._splitView.setViewVisible(this._fileListIndex, visible);
				this._restorePreferredFileListWidth();
			}
		}));
	}

	/** Lays out the diffs and, if shown, the file list. The diffs get the remaining width. */
	layout(dimension: Dimension): void {
		// Set before the split view lays out, which reads it for the diffs' minimum width.
		this._width = dimension.width;
		this._splitView.layout(dimension.width, dimension.height);
		this._restorePreferredFileListWidth();
	}

	/** Moves keyboard focus to the file list. Does nothing while the list is hidden. */
	focusFileList(): void {
		this._fileList.value?.focus();
	}

	/**
	 * Called when the editor that shows the widget is shown or hidden. Like the Source Control view, a hidden file list
	 * keeps no structural changes.
	 */
	setVisible(visible: boolean): void {
		this._visible = visible;
		this._fileList.value?.setVisible(visible);
	}

	/** Gives the list its preferred width back, as far as the diffs' minimum width allows. */
	private _restorePreferredFileListWidth(): void {
		if (this._splitView.isViewVisible(this._fileListIndex) && this._splitView.getViewSize(this._fileListIndex) !== this._preferredFileListWidth) {
			this._splitView.resizeView(this._fileListIndex, this._preferredFileListWidth);
		}
	}
}
