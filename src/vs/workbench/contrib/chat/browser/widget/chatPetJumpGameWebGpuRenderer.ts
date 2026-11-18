/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import { createChatPetJumpGameLiteShapeAtlas, getChatPetJumpGameLiteRenderInfo, IChatPetJumpGameLiteColors, renderChatPetJumpGameLiteShapes } from './chatPetJumpGameLiteShapes.js';
import type { IChatPetJumpGameRenderer, IChatPetJumpGameRenderState } from './chatPetJumpGameRenderer.js';

type LiteWebGpuModule = typeof import('../../../../../base/browser/babylonLite/lite-webgpu.js');
type LiteWebGpu = Pick<LiteWebGpuModule,
	'addSprite2DIndex' |
	'clearSprite2DLayer' |
	'createEngine' |
	'createSprite2DLayer' |
	'createSpriteAtlasFromFrames' |
	'createSpriteRenderer' |
	'disposeEngine' |
	'disposeSpriteAtlas' |
	'disposeSpriteRenderer' |
	'onEngineDeviceLost' |
	'onEngineGpuError' |
	'registerSpriteRenderer' |
	'renderFrame' |
	'setEngineSize'
>;
type WebGpuEngine = Awaited<ReturnType<LiteWebGpu['createEngine']>>;
type WebGpuAtlas = ReturnType<LiteWebGpu['createSpriteAtlasFromFrames']>;
type WebGpuLayer = ReturnType<LiteWebGpu['createSprite2DLayer']>;
type WebGpuSpriteRenderer = ReturnType<LiteWebGpu['createSpriteRenderer']>;

const liteWebGpuPromises = new Map<string, Promise<LiteWebGpu>>();

async function loadLiteWebGpu(runtimeUri: string): Promise<LiteWebGpu> {
	let promise = liteWebGpuPromises.get(runtimeUri);
	if (!promise) {
		promise = (import(/* webpackIgnore: true */ runtimeUri) as Promise<LiteWebGpu>).catch(error => {
			liteWebGpuPromises.delete(runtimeUri);
			throw error;
		});
		liteWebGpuPromises.set(runtimeUri, promise);
	}
	return promise;
}

export async function createChatPetJumpGameWebGpuRenderer(
	canvas: HTMLCanvasElement,
	runtimeUri: string,
	gpu: GPU | undefined,
	getColors: () => IChatPetJumpGameLiteColors,
	onDidChangeTheme: (listener: () => void) => IDisposable,
	getDevicePixelRatio: () => number,
	onDidFail: (error: Error) => void,
): Promise<IChatPetJumpGameRenderer> {
	if (!gpu) {
		canvas.remove();
		throw new Error('WebGPU is unavailable.');
	}
	let lite: LiteWebGpu | undefined;
	let engine: WebGpuEngine | undefined;
	let atlas: WebGpuAtlas | undefined;
	let spriteRenderer: WebGpuSpriteRenderer | undefined;
	try {
		lite = await loadLiteWebGpu(runtimeUri);
		engine = await lite.createEngine(canvas, { alphaMode: 'premultiplied', msaaSamples: 1 });
		const atlasPixels = createChatPetJumpGameLiteShapeAtlas();
		atlas = lite.createSpriteAtlasFromFrames(engine, [
			{ pixels: atlasPixels, width: 16, height: 16, srcStrideBytes: 48 * 4 },
			{ pixels: atlasPixels, width: 16, height: 16, srcX: 16, srcStrideBytes: 48 * 4 },
			{ pixels: atlasPixels, width: 16, height: 16, srcX: 32, srcStrideBytes: 48 * 4 },
		], { paddingPx: 1, sampling: 'linear' });
		const layer = lite.createSprite2DLayer(atlas, { capacity: 4096, pivot: [0.5, 0.5] });
		spriteRenderer = lite.createSpriteRenderer(engine, {
			layers: [layer],
			clearValue: { r: 0, g: 0, b: 0, a: 0 },
		});
		lite.registerSpriteRenderer(spriteRenderer);
		return new ChatPetJumpGameWebGpuRenderer(canvas, engine, atlas, layer, spriteRenderer, getColors, onDidChangeTheme, getDevicePixelRatio, onDidFail, lite);
	} catch (error) {
		if (lite && spriteRenderer) {
			lite.disposeSpriteRenderer(spriteRenderer);
		}
		if (lite && atlas) {
			lite.disposeSpriteAtlas(atlas);
		}
		if (lite && engine) {
			lite.disposeEngine(engine);
		}
		canvas.remove();
		throw error;
	}
}

class ChatPetJumpGameWebGpuRenderer implements IChatPetJumpGameRenderer {
	readonly kind = 'lite-webgpu';
	private readonly themeListener: IDisposable;
	private readonly unsubscribeDeviceLost: () => void;
	private readonly unsubscribeGpuError: () => void;
	private colors: IChatPetJumpGameLiteColors;
	private width = 1;
	private height = 1;
	private canvasLeft = 0;
	private canvasWidth = 1;
	private canvasHeight = 1;
	private devicePixelRatio = 1;
	private lastRenderHash = Number.NaN;
	private lastRenderState: IChatPetJumpGameRenderState | undefined;
	private disposed = false;
	private failed = false;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly engine: WebGpuEngine,
		private readonly atlas: WebGpuAtlas,
		private readonly layer: WebGpuLayer,
		private readonly spriteRenderer: WebGpuSpriteRenderer,
		private readonly getColors: () => IChatPetJumpGameLiteColors,
		onDidChangeTheme: (listener: () => void) => IDisposable,
		private readonly getDevicePixelRatio: () => number,
		private readonly onDidFail: (error: Error) => void,
		private readonly lite: LiteWebGpu,
	) {
		this.canvas.dataset.renderer = this.kind;
		this.colors = getColors();
		this.themeListener = onDidChangeTheme(() => this.updateTheme());
		this.unsubscribeDeviceLost = lite.onEngineDeviceLost(engine, info => {
			if (info.reason !== 'destroyed') {
				this.fail(new Error(`Babylon Lite WebGPU device lost: ${info.message || info.reason}`));
			}
		});
		this.unsubscribeGpuError = lite.onEngineGpuError(engine, error => this.fail(new Error(`Babylon Lite WebGPU error: ${error.message}`)));
	}

	layout(width: number, height: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.updateCanvasBounds(0, this.width);
		this.lastRenderHash = Number.NaN;
	}

	render(state: IChatPetJumpGameRenderState): void {
		this.lastRenderState = state;
		const renderInfo = getChatPetJumpGameLiteRenderInfo(state, this.width);
		if (renderInfo.hash === this.lastRenderHash) {
			return;
		}
		this.lastRenderHash = renderInfo.hash;
		if (renderInfo.renderedObjects === 0) {
			this.updateCanvasBounds(0, 1);
		} else {
			const canvasLeft = Math.max(0, Math.floor(renderInfo.left));
			this.updateCanvasBounds(canvasLeft, Math.max(1, Math.min(this.width, Math.ceil(renderInfo.right)) - canvasLeft));
		}
		this.lite.clearSprite2DLayer(this.layer);
		renderChatPetJumpGameLiteShapes(state, this.colors, (x, y, width, height, color, angle, frame) => {
			this.lite.addSprite2DIndex(this.layer, {
				positionPx: [x - this.canvasLeft, y],
				sizePx: [width, height],
				frame,
				color: [...color],
				rotation: angle,
			});
		});
		this.lite.renderFrame(this.engine, 0);
	}

	private updateCanvasBounds(left: number, width: number): void {
		const devicePixelRatio = this.getDevicePixelRatio();
		if (left === this.canvasLeft && width === this.canvasWidth && this.height === this.canvasHeight && devicePixelRatio === this.devicePixelRatio) {
			return;
		}
		this.canvasLeft = left;
		this.canvasWidth = width;
		this.canvasHeight = this.height;
		this.devicePixelRatio = devicePixelRatio;
		this.canvas.style.left = `${left}px`;
		this.canvas.style.top = '0';
		this.canvas.style.right = 'auto';
		this.canvas.style.bottom = 'auto';
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${this.canvasHeight}px`;
		this.layer.view.zoom = devicePixelRatio;
		this.lite.setEngineSize(this.engine, Math.max(1, Math.ceil(width * devicePixelRatio)), Math.max(1, Math.ceil(this.canvasHeight * devicePixelRatio)));
	}

	private updateTheme(): void {
		this.colors = this.getColors();
		this.lastRenderHash = Number.NaN;
		if (this.lastRenderState) {
			try {
				this.render(this.lastRenderState);
			} catch (error) {
				this.fail(error instanceof Error ? error : new Error(String(error)));
			}
		}
	}

	private fail(error: Error): void {
		if (this.disposed || this.failed) {
			return;
		}
		this.failed = true;
		this.onDidFail(error);
	}

	dispose(): void {
		this.disposed = true;
		this.themeListener.dispose();
		this.unsubscribeDeviceLost();
		this.unsubscribeGpuError();
		this.lite.disposeSpriteRenderer(this.spriteRenderer);
		this.lite.disposeSpriteAtlas(this.atlas);
		this.lite.disposeEngine(this.engine);
		this.canvas.remove();
	}
}
