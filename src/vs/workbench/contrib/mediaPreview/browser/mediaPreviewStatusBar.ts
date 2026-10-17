/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { SideBySideEditor } from '../../../browser/parts/editor/sideBySideEditor.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorPane } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ImagePreviewEditor } from './imagePreviewEditor.js';
import { ImageViewerScale } from './imageViewer.js';
import { MediaPlayerEditorInput } from './mediaPlayerEditorInput.js';

export const SELECT_IMAGE_ZOOM_LEVEL_COMMAND_ID = 'imagePreview.selectZoomLevel';

export function getImageZoomLabel(scale: ImageViewerScale): string {
	return scale === 'fit'
		? localize('imagePreview.zoomFit', "Whole Image")
		: localize('imagePreview.zoomPercent', "{0}%", Math.round(scale * 100));
}

interface IMediaPreviewStatus {
	readonly scale?: ImageViewerScale;
	readonly dimensions?: { readonly width: number; readonly height: number };
	readonly fileSize?: number;
}

/**
 * Shows the zoom level, dimensions and file size of the active image, video or audio preview in
 * the status bar.
 */
export class MediaPreviewStatusBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mediaPreviewStatusBar';

	private readonly _zoomEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly _dimensionsEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly _fileSizeEntry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly _containerListener = this._register(new MutableDisposable());
	private readonly _paneListener = this._register(new MutableDisposable());

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
	) {
		super();

		this._register(this._editorService.onDidActiveEditorChange(() => this._onDidActiveEditorChange()));
		this._onDidActiveEditorChange();
	}

	private _onDidActiveEditorChange(): void {
		const activePane = this._editorService.activeEditorPane;
		if (activePane instanceof SideBySideEditor) {
			// Show the status of the focused side of diffs
			const update = () => this._showStatusOf(activePane.getLastFocusedEditorPane());
			this._containerListener.value = activePane.onDidChangeControl(update);
			update();
		} else {
			this._containerListener.clear();
			this._showStatusOf(activePane);
		}
	}

	private _showStatusOf(pane: IEditorPane | undefined): void {
		if (pane instanceof ImagePreviewEditor) {
			const update = () => {
				const viewer = pane.imageViewer;
				this._update({
					scale: viewer?.hasImage ? viewer.scale : undefined,
					dimensions: viewer?.naturalSize,
					fileSize: pane.fileSize,
				});
			};
			this._paneListener.value = pane.onDidChangeImageInfo(update);
			update();
			return;
		}

		const input = pane?.input;
		if (input instanceof MediaPlayerEditorInput) {
			const update = () => this._update({ fileSize: input.fileSize });
			this._paneListener.value = input.onDidChangeFileSize(update);
			update();
			return;
		}

		this._paneListener.clear();
		this._update({});
	}

	private _update(status: IMediaPreviewStatus): void {
		const zoomLabel = status.scale !== undefined ? getImageZoomLabel(status.scale) : undefined;
		this._updateEntry(this._zoomEntry, 'status.imagePreview.zoom', 102 /* to the left of the dimensions entry */, zoomLabel === undefined ? undefined : {
			name: localize('imagePreview.zoomStatus', "Image Zoom"),
			text: zoomLabel,
			ariaLabel: localize('imagePreview.zoomStatusAriaLabel', "Image Zoom: {0}", zoomLabel),
			tooltip: localize('imagePreview.selectZoomLevel', "Select Zoom Level"),
			command: SELECT_IMAGE_ZOOM_LEVEL_COMMAND_ID,
		});

		const dimensions = status.dimensions ? `${status.dimensions.width}x${status.dimensions.height}` : undefined;
		this._updateEntry(this._dimensionsEntry, 'status.imagePreview.dimensions', 101 /* to the left of the file size entry */, dimensions === undefined ? undefined : {
			name: localize('imagePreview.dimensionsStatus', "Image Dimensions"),
			text: dimensions,
			ariaLabel: localize('imagePreview.dimensionsStatusAriaLabel', "Image Dimensions: {0}", dimensions),
		});

		const fileSize = typeof status.fileSize === 'number' ? ByteSize.formatSize(status.fileSize) : undefined;
		this._updateEntry(this._fileSizeEntry, 'status.mediaPreview.fileSize', 100, fileSize === undefined ? undefined : {
			name: localize('mediaPreview.fileSizeStatus', "Media File Size"),
			text: fileSize,
			ariaLabel: localize('mediaPreview.fileSizeStatusAriaLabel', "File Size: {0}", fileSize),
		});
	}

	private _updateEntry(entry: MutableDisposable<IStatusbarEntryAccessor>, id: string, priority: number, props: IStatusbarEntry | undefined): void {
		if (!props) {
			entry.clear();
		} else if (entry.value) {
			entry.value.update(props);
		} else {
			entry.value = this._statusbarService.addEntry(props, id, StatusbarAlignment.RIGHT, priority);
		}
	}
}
