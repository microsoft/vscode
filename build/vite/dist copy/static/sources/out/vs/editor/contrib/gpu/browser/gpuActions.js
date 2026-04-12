/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { EditorAction, registerEditorAction } from '../../../browser/editorExtensions.js';
import { ensureNonNullable } from '../../../browser/gpu/gpuUtils.js';
import { GlyphRasterizer } from '../../../browser/gpu/raster/glyphRasterizer.js';
import { ViewGpuContext } from '../../../browser/gpu/viewGpuContext.js';
class DebugEditorGpuRendererAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.debugEditorGpuRenderer',
            label: localize2('gpuDebug.label', "Developer: Debug Editor GPU Renderer"),
            // TODO: Why doesn't `ContextKeyExpr.equals('config:editor.experimentalGpuAcceleration', 'on')` work?
            precondition: ContextKeyExpr.true(),
        });
    }
    async run(accessor, editor) {
        const instantiationService = accessor.get(IInstantiationService);
        const quickInputService = accessor.get(IQuickInputService);
        const choice = await quickInputService.pick([
            {
                label: localize('logTextureAtlasStats.label', "Log Texture Atlas Stats"),
                id: 'logTextureAtlasStats',
            },
            {
                label: localize('saveTextureAtlas.label', "Save Texture Atlas"),
                id: 'saveTextureAtlas',
            },
            {
                label: localize('drawGlyph.label', "Draw Glyph"),
                id: 'drawGlyph',
            },
        ], { canPickMany: false });
        if (!choice) {
            return;
        }
        switch (choice.id) {
            case 'logTextureAtlasStats':
                instantiationService.invokeFunction(accessor => {
                    const logService = accessor.get(ILogService);
                    const atlas = ViewGpuContext.atlas;
                    if (!ViewGpuContext.atlas) {
                        logService.error('No texture atlas found');
                        return;
                    }
                    const stats = atlas.getStats();
                    logService.info(['Texture atlas stats', ...stats].join('\n\n'));
                });
                break;
            case 'saveTextureAtlas':
                instantiationService.invokeFunction(async (accessor) => {
                    const workspaceContextService = accessor.get(IWorkspaceContextService);
                    const fileService = accessor.get(IFileService);
                    const folders = workspaceContextService.getWorkspace().folders;
                    if (folders.length > 0) {
                        const atlas = ViewGpuContext.atlas;
                        const promises = [];
                        for (const [layerIndex, page] of atlas.pages.entries()) {
                            promises.push(...[
                                fileService.writeFile(URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_actual.png`), VSBuffer.wrap(new Uint8Array(await (await page.source.convertToBlob()).arrayBuffer()))),
                                fileService.writeFile(URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_usage.png`), VSBuffer.wrap(new Uint8Array(await (await page.getUsagePreview()).arrayBuffer()))),
                            ]);
                        }
                        await Promise.all(promises);
                    }
                });
                break;
            case 'drawGlyph':
                instantiationService.invokeFunction(async (accessor) => {
                    const configurationService = accessor.get(IConfigurationService);
                    const fileService = accessor.get(IFileService);
                    const quickInputService = accessor.get(IQuickInputService);
                    const workspaceContextService = accessor.get(IWorkspaceContextService);
                    const folders = workspaceContextService.getWorkspace().folders;
                    if (folders.length === 0) {
                        return;
                    }
                    const atlas = ViewGpuContext.atlas;
                    const fontFamily = configurationService.getValue('editor.fontFamily');
                    const fontSize = configurationService.getValue('editor.fontSize');
                    const rasterizer = new GlyphRasterizer(fontSize, fontFamily, getActiveWindow().devicePixelRatio, ViewGpuContext.decorationStyleCache);
                    let chars = await quickInputService.input({
                        prompt: 'Enter a character to draw (prefix with 0x for code point))'
                    });
                    if (!chars) {
                        return;
                    }
                    const codePoint = chars.match(/0x(?<codePoint>[0-9a-f]+)/i)?.groups?.codePoint;
                    if (codePoint !== undefined) {
                        chars = String.fromCodePoint(parseInt(codePoint, 16));
                    }
                    const tokenMetadata = 0;
                    const charMetadata = 0;
                    const rasterizedGlyph = atlas.getGlyph(rasterizer, chars, tokenMetadata, charMetadata, 0);
                    if (!rasterizedGlyph) {
                        return;
                    }
                    const imageData = atlas.pages[rasterizedGlyph.pageIndex].source.getContext('2d')?.getImageData(rasterizedGlyph.x, rasterizedGlyph.y, rasterizedGlyph.w, rasterizedGlyph.h);
                    if (!imageData) {
                        return;
                    }
                    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
                    const ctx = ensureNonNullable(canvas.getContext('2d'));
                    ctx.putImageData(imageData, 0, 0);
                    const blob = await canvas.convertToBlob({ type: 'image/png' });
                    const resource = URI.joinPath(folders[0].uri, `glyph_${chars}_${tokenMetadata}_${fontSize}px_${fontFamily.replaceAll(/[,\\\/\.'\s]/g, '_')}.png`);
                    await fileService.writeFile(resource, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
                });
                break;
        }
    }
}
registerEditorAction(DebugEditorGpuRendererAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3B1QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2dwdS9icm93c2VyL2dwdUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUU5RixPQUFPLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUF5QixNQUFNLHNDQUFzQyxDQUFDO0FBQ2pILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFeEUsTUFBTSw0QkFBNkIsU0FBUSxZQUFZO0lBRXREO1FB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