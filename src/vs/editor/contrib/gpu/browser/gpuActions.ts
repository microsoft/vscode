/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import type { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, type ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { GpuViewLayerRenderer } from 'vs/editor/browser/view/gpu/gpuViewLayer';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

class LogTextureAtlasStatsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.logTextureAtlasStats',
			label: localize('logTextureAtlasStats.label', "Log Texture Atlas States"),
			alias: 'Log Texture Atlas States',
			precondition: ContextKeyExpr.and(EditorContextKeys.notInCompositeEditor),
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const logService = accessor.get(ILogService);

		const atlas = GpuViewLayerRenderer.atlas;
		if (!GpuViewLayerRenderer.atlas) {
			logService.error('No texture atlas found');
		}

		const stats = atlas.getStats();
		logService.info(['Texture atlas stats', ...stats].join('\n\n'));
	}
}

class SaveTextureAtlasAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.saveTextureAtlas',
			label: localize('saveTextureAtlas.label', "Save Texture Atlas"),
			alias: 'Save Texture Atlas',
			precondition: ContextKeyExpr.and(EditorContextKeys.notInCompositeEditor),
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length > 0) {
			const atlas = GpuViewLayerRenderer.atlas;
			const promises = [];
			for (const [layerIndex, page] of atlas.pages.entries()) {
				promises.push(...[
					fileService.writeFile(
						URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_actual.png`),
						VSBuffer.wrap(new Uint8Array(await (await page.source.convertToBlob()).arrayBuffer()))
					),
					fileService.writeFile(
						URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_usage.png`),
						VSBuffer.wrap(new Uint8Array(await (await page.getUsagePreview()).arrayBuffer()))
					),
				]);
			}
			await promises;
		}
	}
}

registerEditorAction(LogTextureAtlasStatsAction);
registerEditorAction(SaveTextureAtlasAction);
