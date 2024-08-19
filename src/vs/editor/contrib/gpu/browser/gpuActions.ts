/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import type { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, type ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import { GpuViewLayerRenderer } from 'vs/editor/browser/view/gpu/gpuViewLayer';
import { GlyphRasterizer } from 'vs/editor/browser/view/gpu/raster/glyphRasterizer';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
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
			return;
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

class DrawGlyphAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.drawGlyph',
			label: localize('drawGlyph.label', "Draw Glyph"),
			alias: 'Draw Glyph',
			precondition: ContextKeyExpr.true(),
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const fileService = accessor.get(IFileService);
		const logService = accessor.get(ILogService);
		const quickInputService = accessor.get(IQuickInputService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);

		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}

		const atlas = GpuViewLayerRenderer.atlas;
		if (!GpuViewLayerRenderer.atlas) {
			logService.error('No texture atlas found');
			return;
		}

		const fontFamily = configurationService.getValue<string>('editor.fontFamily');
		const fontSize = configurationService.getValue<number>('editor.fontSize');
		const rasterizer = new GlyphRasterizer(fontSize, fontFamily);
		let chars = await quickInputService.input({
			prompt: 'Enter a character to draw (prefix with 0x for code point))'
		});
		if (!chars) {
			return;
		}
		const codePoint = chars.match(/0x(?<codePoint>\d+)/)?.groups?.codePoint;
		if (codePoint !== undefined) {
			chars = String.fromCodePoint(parseInt(codePoint));
		}
		const metadata = 0;
		const rasterizedGlyph = atlas.getGlyph(rasterizer, chars, metadata);
		if (!rasterizedGlyph) {
			return;
		}
		const imageData = atlas.pages[rasterizedGlyph.textureIndex].source.getContext('2d')?.getImageData(
			rasterizedGlyph.x,
			rasterizedGlyph.y,
			rasterizedGlyph.w,
			rasterizedGlyph.h
		);
		if (!imageData) {
			return;
		}
		const canvas = new OffscreenCanvas(imageData.width, imageData.height);
		const ctx = ensureNonNullable(canvas.getContext('2d'));
		ctx.putImageData(imageData, 0, 0);
		const blob = await canvas.convertToBlob({ type: 'image/png' });
		const resource = URI.joinPath(folders[0].uri, `glyph_${chars}_${metadata}_${fontSize}px_${fontFamily.replaceAll(/[,\.'\s]/g, '_')}.png`);
		await fileService.writeFile(resource, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
	}
}

registerEditorAction(LogTextureAtlasStatsAction);
registerEditorAction(SaveTextureAtlasAction);
registerEditorAction(DrawGlyphAction);
