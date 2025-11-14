/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { addDisposableListener, getActiveWindow } from '../../../base/browser/dom.js';
import { createFastDomNode, type FastDomNode } from '../../../base/browser/fastDomNode.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import type { ViewLineOptions } from '../viewParts/viewLines/viewLineOptions.js';
import { observableValue, runOnChange, type IObservable } from '../../../base/common/observable.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { TextureAtlas } from './atlas/textureAtlas.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { INotificationService, IPromptChoice, Severity } from '../../../platform/notification/common/notification.js';
import { GPULifecycle } from './gpuDisposable.js';
import { ensureNonNullable, observeDevicePixelDimensions } from './gpuUtils.js';
import { RectangleRenderer } from './rectangleRenderer.js';
import type { ViewContext } from '../../common/viewModel/viewContext.js';
import { DecorationCssRuleExtractor } from './css/decorationCssRuleExtractor.js';
import { Event } from '../../../base/common/event.js';
import { EditorOption, type IEditorOptions } from '../../common/config/editorOptions.js';
import { DecorationStyleCache } from './css/decorationStyleCache.js';
import { InlineDecorationType } from '../../common/viewModel/inlineDecorations.js';

export class ViewGpuContext extends Disposable {
	/**
	 * The hard cap for line columns rendered by the GPU renderer.
	 */
	readonly maxGpuCols = 2000;

	readonly canvas: FastDomNode<HTMLCanvasElement>;
	readonly ctx: GPUCanvasContext;

	static device: Promise<GPUDevice>;
	static deviceSync: GPUDevice | undefined;

	readonly rectangleRenderer: RectangleRenderer;

	private static readonly _decorationCssRuleExtractor = new DecorationCssRuleExtractor();
	static get decorationCssRuleExtractor(): DecorationCssRuleExtractor {
		return ViewGpuContext._decorationCssRuleExtractor;
	}

	private static readonly _decorationStyleCache = new DecorationStyleCache();
	static get decorationStyleCache(): DecorationStyleCache {
		return ViewGpuContext._decorationStyleCache;
	}

	private static _atlas: TextureAtlas | undefined;

	/**
	 * The shared texture atlas to use across all views.
	 *
	 * @throws if called before the GPU device is resolved
	 */
	static get atlas(): TextureAtlas {
		if (!ViewGpuContext._atlas) {
			throw new BugIndicatingError('Cannot call ViewGpuContext.textureAtlas before device is resolved');
		}
		return ViewGpuContext._atlas;
	}
	/**
	 * The shared texture atlas to use across all views. This is a convenience alias for
	 * {@link ViewGpuContext.atlas}.
	 *
	 * @throws if called before the GPU device is resolved
	 */
	get atlas(): TextureAtlas {
		return ViewGpuContext.atlas;
	}

	readonly canvasDevicePixelDimensions: IObservable<{ width: number; height: number }>;
	readonly devicePixelRatio: IObservable<number>;
	readonly contentLeft: IObservable<number>;

	constructor(
		context: ViewContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.canvas = createFastDomNode(document.createElement('canvas'));
		this.canvas.setClassName('editorCanvas');

		// Adjust the canvas size to avoid drawing under the scroll bar
		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration('editor.scrollbar.verticalScrollbarSize')) {
				const verticalScrollbarSize = configurationService.getValue<IEditorOptions>('editor').scrollbar?.verticalScrollbarSize ?? 14;
				this.canvas.domNode.style.boxSizing = 'border-box';
				this.canvas.domNode.style.paddingRight = `${verticalScrollbarSize}px`;
			}
		}));

		this.ctx = ensureNonNullable(this.canvas.domNode.getContext('webgpu'));

		// Request the GPU device, we only want to do this a single time per window as it's async
		// and can delay the initial render.
		if (!ViewGpuContext.device) {
			ViewGpuContext.device = GPULifecycle.requestDevice((message) => {
				const choices: IPromptChoice[] = [{
					label: nls.localize('editor.dom.render', "Use DOM-based rendering"),
					run: () => this.configurationService.updateValue('editor.experimentalGpuAcceleration', 'off'),
				}];
				this._notificationService.prompt(Severity.Warning, message, choices);
			}).then(ref => {
				ViewGpuContext.deviceSync = ref.object;
				if (!ViewGpuContext._atlas) {
					ViewGpuContext._atlas = this._instantiationService.createInstance(TextureAtlas, ref.object.limits.maxTextureDimension2D, undefined, ViewGpuContext.decorationStyleCache);
				}
				return ref.object;
			});
		}

		const dprObs = observableValue(this, getActiveWindow().devicePixelRatio);
		this._register(addDisposableListener(getActiveWindow(), 'resize', () => {
			dprObs.set(getActiveWindow().devicePixelRatio, undefined);
		}));
		this.devicePixelRatio = dprObs;
		this._register(runOnChange(this.devicePixelRatio, () => ViewGpuContext.atlas?.clear()));

		const canvasDevicePixelDimensions = observableValue(this, { width: this.canvas.domNode.width, height: this.canvas.domNode.height });
		this._register(observeDevicePixelDimensions(
			this.canvas.domNode,
			getActiveWindow(),
			(width, height) => {
				this.canvas.domNode.width = width;
				this.canvas.domNode.height = height;
				canvasDevicePixelDimensions.set({ width, height }, undefined);
			}
		));
		this.canvasDevicePixelDimensions = canvasDevicePixelDimensions;

		const contentLeft = observableValue(this, 0);
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			contentLeft.set(context.configuration.options.get(EditorOption.layoutInfo).contentLeft, undefined);
		}));
		this.contentLeft = contentLeft;

		this.rectangleRenderer = this._instantiationService.createInstance(RectangleRenderer, context, this.contentLeft, this.devicePixelRatio, this.canvas.domNode, this.ctx, ViewGpuContext.device);
	}

	/**
	 * This method determines which lines can be and are allowed to be rendered using the GPU
	 * renderer. Eventually this should trend all lines, except maybe exceptional cases like
	 * decorations that use class names.
	 */
	public canRender(options: ViewLineOptions, viewportData: ViewportData, lineNumber: number): boolean {
		const data = viewportData.getViewLineRenderingData(lineNumber);

		// Check if the line has simple attributes that aren't supported
		if (
			data.containsRTL ||
			data.maxColumn > this.maxGpuCols
		) {
			return false;
		}

		// Check if all inline decorations are supported
		if (data.inlineDecorations.length > 0) {
			let supported = true;
			for (const decoration of data.inlineDecorations) {
				if (decoration.type !== InlineDecorationType.Regular) {
					supported = false;
					break;
				}
				const styleRules = ViewGpuContext._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
				supported &&= styleRules.every(rule => {
					// Pseudo classes aren't supported currently
					if (rule.selectorText.includes(':')) {
						return false;
					}
					for (const r of rule.style) {
						if (!supportsCssRule(r, rule.style)) {
							return false;
						}
					}
					return true;
				});
				if (!supported) {
					break;
				}
			}
			return supported;
		}

		return true;
	}

	/**
	 * Like {@link canRender} but returns detailed information about why the line cannot be rendered.
	 */
	public canRenderDetailed(options: ViewLineOptions, viewportData: ViewportData, lineNumber: number): string[] {
		const data = viewportData.getViewLineRenderingData(lineNumber);
		const reasons: string[] = [];
		if (data.containsRTL) {
			reasons.push('containsRTL');
		}
		if (data.maxColumn > this.maxGpuCols) {
			reasons.push('maxColumn > maxGpuCols');
		}
		if (data.inlineDecorations.length > 0) {
			let supported = true;
			const problemTypes: InlineDecorationType[] = [];
			const problemSelectors: string[] = [];
			const problemRules: string[] = [];
			for (const decoration of data.inlineDecorations) {
				if (decoration.type !== InlineDecorationType.Regular) {
					problemTypes.push(decoration.type);
					supported = false;
					continue;
				}
				const styleRules = ViewGpuContext._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
				supported &&= styleRules.every(rule => {
					// Pseudo classes aren't supported currently
					if (rule.selectorText.includes(':')) {
						problemSelectors.push(rule.selectorText);
						return false;
					}
					for (const r of rule.style) {
						if (!supportsCssRule(r, rule.style)) {
							// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
							problemRules.push(`${r}: ${rule.style[r as any]}`);
							return false;
						}
					}
					return true;
				});
				if (!supported) {
					continue;
				}
			}
			if (problemTypes.length > 0) {
				reasons.push(`inlineDecorations with unsupported types (${problemTypes.map(e => `\`${e}\``).join(', ')})`);
			}
			if (problemRules.length > 0) {
				reasons.push(`inlineDecorations with unsupported CSS rules (${problemRules.map(e => `\`${e}\``).join(', ')})`);
			}
			if (problemSelectors.length > 0) {
				reasons.push(`inlineDecorations with unsupported CSS selectors (${problemSelectors.map(e => `\`${e}\``).join(', ')})`);
			}
		}
		return reasons;
	}
}

/**
 * A list of supported decoration CSS rules that can be used in the GPU renderer.
 */
const gpuSupportedDecorationCssRules = [
	'color',
	'font-weight',
	'opacity',
];

function supportsCssRule(rule: string, style: CSSStyleDeclaration) {
	if (!gpuSupportedDecorationCssRules.includes(rule)) {
		return false;
	}
	// Check for values that aren't supported
	switch (rule) {
		default: return true;
	}
}
