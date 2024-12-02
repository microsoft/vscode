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
import { DecorationCssRuleExtractor } from './decorationCssRuleExtractor.js';
import { Event } from '../../../base/common/event.js';
import type { IEditorOptions } from '../../common/config/editorOptions.js';
import { InlineDecorationType } from '../../common/viewModel.js';

const enum GpuRenderLimits {
	maxGpuLines = 3000,
	maxGpuCols = 200,
}

export class ViewGpuContext extends Disposable {
	/**
	 * The temporary hard cap for lines rendered by the GPU renderer. This can be removed once more
	 * dynamic allocation is implemented in https://github.com/microsoft/vscode/issues/227091
	 */
	readonly maxGpuLines = GpuRenderLimits.maxGpuLines;

	/**
	 * The temporary hard cap for line columns rendered by the GPU renderer. This can be removed
	 * once more dynamic allocation is implemented in https://github.com/microsoft/vscode/issues/227108
	 */
	readonly maxGpuCols = GpuRenderLimits.maxGpuCols;

	readonly canvas: FastDomNode<HTMLCanvasElement>;
	readonly ctx: GPUCanvasContext;

	readonly device: Promise<GPUDevice>;

	readonly rectangleRenderer: RectangleRenderer;

	private static readonly _decorationCssRuleExtractor = new DecorationCssRuleExtractor();
	static get decorationCssRuleExtractor(): DecorationCssRuleExtractor {
		return ViewGpuContext._decorationCssRuleExtractor;
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

		this.device = GPULifecycle.requestDevice((message) => {
			const choices: IPromptChoice[] = [{
				label: nls.localize('editor.dom.render', "Use DOM-based rendering"),
				run: () => this.configurationService.updateValue('editor.experimentalGpuAcceleration', 'off'),
			}];
			this._notificationService.prompt(Severity.Warning, message, choices);
		}).then(ref => this._register(ref).object);
		this.device.then(device => {
			if (!ViewGpuContext._atlas) {
				ViewGpuContext._atlas = this._instantiationService.createInstance(TextureAtlas, device.limits.maxTextureDimension2D, undefined);
			}
		});

		this.rectangleRenderer = this._instantiationService.createInstance(RectangleRenderer, context, this.canvas.domNode, this.ctx, this.device);

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
			data.maxColumn > GpuRenderLimits.maxGpuCols ||
			data.continuesWithWrappedLine ||
			lineNumber >= GpuRenderLimits.maxGpuLines
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
						if (!gpuSupportedDecorationCssRules.includes(r)) {
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
		if (data.maxColumn > GpuRenderLimits.maxGpuCols) {
			reasons.push('maxColumn > maxGpuCols');
		}
		if (data.continuesWithWrappedLine) {
			reasons.push('continuesWithWrappedLine');
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
						if (!gpuSupportedDecorationCssRules.includes(r)) {
							problemRules.push(r);
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
		if (lineNumber >= GpuRenderLimits.maxGpuLines) {
			reasons.push('lineNumber >= maxGpuLines');
		}
		return reasons;
	}
}

/**
 * A list of fully supported decoration CSS rules that can be used in the GPU renderer.
 */
const gpuSupportedDecorationCssRules = [
	'color',
];
