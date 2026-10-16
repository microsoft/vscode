/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CopyAction } from '../../../../editor/contrib/clipboard/browser/clipboard.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { ActiveEditorContext, ResourceContextKey } from '../../../common/contextkeys.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { TEXT_FILE_EDITOR_ID } from '../../files/common/files.js';
import { IMAGE_PREVIEW_EDITOR_ID } from '../common/mediaPreview.js';
import { ImagePreviewEditor } from './imagePreviewEditor.js';
import { ImageViewer, ImageViewerContextMenuId, ImageViewerScale, isImageViewerEditorPane } from './imageViewer.js';
import { getImageZoomLabel, SELECT_IMAGE_ZOOM_LEVEL_COMMAND_ID } from './mediaPreviewStatusBar.js';

const imagePreviewCategory = localize2('imagePreview', "Image Preview");

const imagePreviewActive = ActiveEditorContext.isEqualTo(ImagePreviewEditor.ID);
const svgImagePreviewActive = ContextKeyExpr.and(imagePreviewActive, ResourceContextKey.Extension.isEqualTo('.svg'));
const svgTextEditorActive = ContextKeyExpr.and(
	ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
	ResourceContextKey.Extension.isEqualTo('.svg'),
	// Allows extensions that provide their own SVG preview to hide this action
	ContextKeyExpr.not('hasCustomImagePreview'),
);

/**
 * Gets the viewer an image action applies to: the viewer passed by the image context menu, the
 * focused viewer, or the viewer of the active editor.
 */
function getImageViewer(accessor: ServicesAccessor, arg: unknown): ImageViewer | undefined {
	if (arg instanceof ImageViewer) {
		return arg;
	}

	const focusedViewer = ImageViewer.getFocusedViewer();
	if (focusedViewer) {
		return focusedViewer;
	}

	const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
	return isImageViewerEditorPane(activeEditorPane) ? activeEditorPane.imageViewer : undefined;
}

/**
 * Makes the workbench copy command (e.g. Cmd/Ctrl+C) copy the image of a focused image viewer.
 */
export function registerImageViewerCopyCommand(): IDisposable | undefined {
	return CopyAction?.addImplementation(100, 'image-viewer', () => {
		const viewer = ImageViewer.getFocusedViewer();
		if (!viewer?.hasImage) {
			return false;
		}
		return viewer.copyImage();
	});
}

export class ZoomInImageAction extends Action2 {
	constructor() {
		super({
			id: 'imagePreview.zoomIn',
			title: localize2('imagePreview.zoomIn', "Zoom In"),
			category: imagePreviewCategory,
			f1: true,
			precondition: imagePreviewActive,
		});
	}

	run(accessor: ServicesAccessor, arg?: unknown): void {
		getImageViewer(accessor, arg)?.zoomIn();
	}
}

export class ZoomOutImageAction extends Action2 {
	constructor() {
		super({
			id: 'imagePreview.zoomOut',
			title: localize2('imagePreview.zoomOut', "Zoom Out"),
			category: imagePreviewCategory,
			f1: true,
			precondition: imagePreviewActive,
		});
	}

	run(accessor: ServicesAccessor, arg?: unknown): void {
		getImageViewer(accessor, arg)?.zoomOut();
	}
}

export class SelectImageZoomLevelAction extends Action2 {
	constructor() {
		super({
			id: SELECT_IMAGE_ZOOM_LEVEL_COMMAND_ID,
			title: localize2('imagePreview.selectZoomLevel', "Select Zoom Level"),
			category: imagePreviewCategory,
			f1: true,
			precondition: imagePreviewActive,
		});
	}

	async run(accessor: ServicesAccessor, arg?: unknown): Promise<void> {
		const viewer = getImageViewer(accessor, arg);
		if (!viewer) {
			return;
		}

		const scales: ImageViewerScale[] = [10, 5, 2, 1, 0.5, 0.2, 'fit'];
		const pick = await accessor.get(IQuickInputService).pick<IQuickPickItem & { scale: ImageViewerScale }>(
			scales.map(scale => ({ label: getImageZoomLabel(scale), scale })),
			{ placeHolder: localize('imagePreview.selectZoomLevelPlaceholder', "Select zoom level") },
		);
		if (pick) {
			viewer.setScale(pick.scale);
		}
	}
}

export class CopyImageAction extends Action2 {
	constructor() {
		super({
			id: 'imagePreview.copyImage',
			title: localize2('imagePreview.copyImage', "Copy"),
			category: imagePreviewCategory,
			f1: false,
			menu: {
				id: ImageViewerContextMenuId,
				group: 'navigation',
				order: 1,
			},
		});
	}

	run(accessor: ServicesAccessor, arg?: unknown): Promise<void> | undefined {
		return getImageViewer(accessor, arg)?.copyImage();
	}
}

export class ReopenImageAsTextAction extends Action2 {
	constructor() {
		super({
			id: 'imagePreview.reopenAsText',
			title: localize2('imagePreview.reopenAsText', "Reopen as Source Text"),
			category: imagePreviewCategory,
			icon: Codicon.goToFile,
			f1: true,
			precondition: svgImagePreviewActive,
			menu: {
				id: MenuId.EditorTitle,
				group: 'navigation',
				when: svgImagePreviewActive,
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, DEFAULT_EDITOR_ASSOCIATION.id, ...args);
	}
}

export class ReopenImageAsPreviewAction extends Action2 {
	constructor() {
		super({
			id: 'imagePreview.reopenAsPreview',
			title: localize2('imagePreview.reopenAsPreview', "Reopen as Image Preview"),
			category: imagePreviewCategory,
			icon: Codicon.preview,
			f1: true,
			precondition: svgTextEditorActive,
			menu: {
				id: MenuId.EditorTitle,
				group: 'navigation',
				when: svgTextEditorActive,
			},
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): Promise<unknown> {
		return accessor.get(ICommandService).executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, IMAGE_PREVIEW_EDITOR_ID, ...args);
	}
}
