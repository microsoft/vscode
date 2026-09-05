/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { triggerDownload } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getExtensionForMimeType } from '../../../../base/common/mime.js';
import { isWeb } from '../../../../base/common/platform.js';
import { basename, extname } from '../../../../base/common/path.js';
import { joinPath } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { resolveCommandsContext } from '../../../browser/parts/editor/editorCommandsContext.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExplorerService } from '../../files/browser/files.js';
import { VIEW_ID } from '../../files/common/files.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ImageCarouselEditor } from './imageCarouselEditor.js';
import { ImageCarouselContextKeys, ImageCarouselContextMenu } from './imageCarouselTypes.js';

const carouselActive = ContextKeyExpr.equals('activeEditor', ImageCarouselEditor.ID);

abstract class ImageCarouselAction extends Action2 {
	constructor(options: IAction2Options, primary = false) {
		super({
			...options,
			precondition: ContextKeyExpr.and(carouselActive, options.precondition),
			menu: [
				{ id: MenuId.ModalEditorEditorTitle, group: primary ? 'navigation' : '1_image', when: ContextKeyExpr.and(carouselActive, options.precondition) },
				{ id: ImageCarouselContextMenu, group: '1_image', when: options.precondition },
			],
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		try {
			const resolved = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
			const context = resolved.groupedEditors[0];
			const pane = context?.group.activeEditorPane;
			if (!(pane instanceof ImageCarouselEditor) || context.editors.length !== 1 || context.editors[0] !== pane.input || !pane.currentImage) {
				throw new Error(localize('imageCarousel.unavailable', "The selected preview is no longer available."));
			}
			await this.runWithEditor(accessor, pane);
		} catch (error) {
			notificationService.error(error);
		}
	}

	protected abstract runWithEditor(accessor: ServicesAccessor, editor: ImageCarouselEditor): Promise<void>;
}

registerAction2(class extends ImageCarouselAction {
	constructor() {
		super({
			id: 'imageCarousel.copyImage',
			title: localize2('imageCarousel.copyImage', "Copy Image"),
			icon: Codicon.copy,
			precondition: ImageCarouselContextKeys.canCopy,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyC,
				when: ContextKeyExpr.and(carouselActive, ImageCarouselContextKeys.canCopy, ContextKeyExpr.not('inputFocus')),
			},
		});
	}

	protected async runWithEditor(_accessor: ServicesAccessor, editor: ImageCarouselEditor): Promise<void> {
		await editor.copyImage();
		status(localize('imageCarousel.copied', "Image copied."));
	}
});

registerAction2(class extends ImageCarouselAction {
	constructor() {
		super({
			id: 'imageCarousel.saveMediaAs',
			title: localize2('imageCarousel.saveMediaAs', "Save Media As..."),
			icon: Codicon.saveAs,
			precondition: ImageCarouselContextKeys.hasMedia,
		}, true);
	}

	protected async runWithEditor(accessor: ServicesAccessor, editor: ImageCarouselEditor): Promise<void> {
		const image = editor.currentImage!;
		const fileService = accessor.get(IFileService);
		const dialogs = accessor.get(IFileDialogService);
		const extension = getExtensionForMimeType(image.mimeType) ?? '';
		const name = basename(image.name.replace(/\\/g, '/')) || `image${extension}`;
		const filename = extname(name) ? name : `${name}${extension}`;
		const data = await editor.getCurrentImageData();
		if (isWeb) {
			triggerDownload(data.buffer, filename);
			return;
		}
		const target = await dialogs.showSaveDialog({
			defaultUri: joinPath(await dialogs.defaultFilePath(), filename),
		});
		if (target) {
			await fileService.writeFile(target, data);
		}
	}
});

registerAction2(class extends ImageCarouselAction {
	constructor() {
		super({
			id: 'imageCarousel.openSource',
			title: localize2('imageCarousel.openSource', "Open Source"),
			icon: Codicon.goToFile,
			precondition: ImageCarouselContextKeys.hasSource,
		});
	}

	protected async runWithEditor(accessor: ServicesAccessor, editor: ImageCarouselEditor): Promise<void> {
		const resource = editor.sourceUri;
		if (!resource || !accessor.get(IFileService).hasProvider(resource)) {
			throw new Error(localize('imageCarousel.sourceUnavailable', "The source file is not available."));
		}
		const input = editor.input!;
		const group = accessor.get(IEditorGroupsService).mainPart.activeGroup;
		const opened = await accessor.get(IEditorService).openEditor({ resource, options: { pinned: true } }, group);
		if (opened) {
			await editor.group.closeEditor(input);
		}
	}
});

registerAction2(class extends ImageCarouselAction {
	constructor() {
		super({
			id: 'imageCarousel.revealSource',
			title: localize2('imageCarousel.revealSource', "Reveal in Explorer View"),
			icon: Codicon.files,
			precondition: ImageCarouselContextKeys.canReveal,
		});
	}

	protected async runWithEditor(accessor: ServicesAccessor, editor: ImageCarouselEditor): Promise<void> {
		const resource = editor.sourceUri;
		if (!resource || !accessor.get(IWorkspaceContextService).isInsideWorkspace(resource)) {
			throw new Error(localize('imageCarousel.sourceOutsideWorkspace', "The source file is not in the workspace."));
		}
		const input = editor.input!;
		const explorer = accessor.get(IExplorerService);
		const view = await accessor.get(IViewsService).openView(explorer.getViewId() ?? VIEW_ID, false);
		if (!view) {
			throw new Error(localize('imageCarousel.explorerUnavailable', "The Explorer view is not available."));
		}
		await editor.group.closeEditor(input);
		await explorer.select(resource, 'force');
		view.focus();
	}
});
