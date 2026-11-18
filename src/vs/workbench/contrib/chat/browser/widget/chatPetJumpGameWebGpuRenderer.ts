/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Color } from '../../../../../base/common/color.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { contrastBorder, descriptionForeground, foreground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ChatPetJumpGameLiteColor, createChatPetJumpGameLiteShapeAtlas, getChatPetJumpGameLiteRenderInfo, renderChatPetJumpGameLiteShapes } from './chatPetJumpGameLiteShapes.js';
import { IChatPetJumpGameRenderer, IChatPetJumpGameRenderState } from './chatPetJumpGameRenderer.js';

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

let liteWebGpuPromise: Promise<LiteWebGpu> | undefined;

async function loadLiteWebGpu(): Promise<LiteWebGpu> {
	if (!liteWebGpuPromise) {
		liteWebGpuPromise = import('../../../../../base/browser/babylonLite/lite-webgpu.js');
	}
	return liteWebGpuPromise;
}

export async function createChatPetJumpGameWebGpuRenderer(stage: HTMLElement, themeService: IThemeService, onDidFail: (error: Error) => void): Promise<IChatPetJumpGameRenderer> {
	if (!navigator.gpu) {
		throw new Error('WebGPU is unavailable.');
	}
	const lite = await loadLiteWebGpu();
	const canvas = dom.prepend(stage, dom.$('canvas.chat-pet-jump-playfield.chat-pet-jump-playfield-lite-webgpu', {
		'aria-hidden': 'true',
	})) as HTMLCanvasElement;
	let engine: WebGpuEngine | undefined;
	let atlas: WebGpuAtlas | undefined;
	let spriteRenderer: WebGpuSpriteRenderer | undefined;
	try {
		engine = await lite.createEngine(canvas, { alphaMode: 'premultiplied', msaaSamples: 1 });
		const atlasPixels = createChatPetJumpGameLiteShapeAtlas();
		atlas = lite.createSpriteAtlasFromFrames(engine, [
			{ pixels: atlasPixels, width: 16, height: 16, srcStrideBytes: 32 * 4 },
			{ pixels: atlasPixels, width: 16, height: 16, srcX: 16, srcStrideBytes: 32 * 4 },
		], { paddingPx: 1, sampling: 'linear' });
		const layer = lite.createSprite2DLayer(atlas, { capacity: 4096, pivot: [0.5, 0.5] });
		spriteRenderer = lite.createSpriteRenderer(engine, {
			layers: [layer],
			clearValue: { r: 0, g: 0, b: 0, a: 0 },
		});
		lite.registerSpriteRenderer(spriteRenderer);
		return new ChatPetJumpGameWebGpuRenderer(canvas, engine, atlas, layer, spriteRenderer, themeService, onDidFail, lite);
	} catch (error) {
		if (spriteRenderer) {
			lite.disposeSpriteRenderer(spriteRenderer);
		}
		if (atlas) {
			lite.disposeSpriteAtlas(atlas);
		}
		if (engine) {
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
	private foreground = toLiteColor(Color.white);
	private integrityForeground = toLiteColor(Color.white);
	private border: ChatPetJumpGameLiteColor | undefined;
	private width = 1;
	private height = 1;
	private canvasLeft = 0;
	private canvasWidth = 1;
	private devicePixelRatio = 1;
	private lastRenderHash = Number.NaN;
	private disposed = false;
	private failed = false;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly engine: WebGpuEngine,
		private readonly atlas: WebGpuAtlas,
		private readonly layer: WebGpuLayer,
		private readonly spriteRenderer: WebGpuSpriteRenderer,
		private readonly themeService: IThemeService,
		private readonly onDidFail: (error: Error) => void,
		private readonly lite: LiteWebGpu,
	) {
		this.canvas.dataset.renderer = this.kind;
		this.updateTheme();
		this.themeListener = themeService.onDidColorThemeChange(() => this.updateTheme());
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
		renderChatPetJumpGameLiteShapes(state, {
			foreground: this.foreground,
			integrityForeground: this.integrityForeground,
			border: this.border,
		}, (x, y, width, height, color, angle, circle) => {
			this.lite.addSprite2DIndex(this.layer, {
				positionPx: [x - this.canvasLeft, y],
				sizePx: [width, height],
				frame: circle ? 1 : 0,
				color: [...color],
				rotation: angle,
			});
		});
		this.lite.renderFrame(this.engine, 0);
	}

	private updateCanvasBounds(left: number, width: number): void {
		const devicePixelRatio = Math.max(1, dom.getWindow(this.canvas).devicePixelRatio);
		if (left === this.canvasLeft && width === this.canvasWidth && devicePixelRatio === this.devicePixelRatio) {
			return;
		}
		this.canvasLeft = left;
		this.canvasWidth = width;
		this.devicePixelRatio = devicePixelRatio;
		this.canvas.style.left = `${left}px`;
		this.canvas.style.top = '0';
		this.canvas.style.right = 'auto';
		this.canvas.style.bottom = 'auto';
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${this.height}px`;
		this.layer.view.zoom = devicePixelRatio;
		this.lite.setEngineSize(this.engine, Math.max(1, Math.ceil(width * devicePixelRatio)), Math.max(1, Math.ceil(this.height * devicePixelRatio)));
	}

	private updateTheme(): void {
		const theme = this.themeService.getColorTheme();
		this.foreground = toLiteColor(theme.getColor(descriptionForeground) ?? Color.white);
		this.integrityForeground = toLiteColor(theme.getColor(foreground) ?? Color.white);
		const border = theme.getColor(contrastBorder);
		this.border = border ? toLiteColor(border) : undefined;
		this.lastRenderHash = Number.NaN;
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

function toLiteColor(color: Color): ChatPetJumpGameLiteColor {
	return [color.rgba.r / 255, color.rgba.g / 255, color.rgba.b / 255, color.rgba.a];
}
