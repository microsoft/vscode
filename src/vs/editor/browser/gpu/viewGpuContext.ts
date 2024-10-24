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

export class ViewGpuContext extends Disposable {
	readonly canvas: FastDomNode<HTMLCanvasElement>;
	readonly ctx: GPUCanvasContext;

	readonly device: Promise<GPUDevice>;

	readonly rectangleRenderer: RectangleRenderer;

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
				runOnChange(this.devicePixelRatio, () => ViewGpuContext.atlas.clear());
			}
		});

		this.rectangleRenderer = this._instantiationService.createInstance(RectangleRenderer, context, this.canvas.domNode, this.ctx, this.device);

		const dprObs = observableValue(this, getActiveWindow().devicePixelRatio);
		this._register(addDisposableListener(getActiveWindow(), 'resize', () => {
			dprObs.set(getActiveWindow().devicePixelRatio, undefined);
		}));
		this.devicePixelRatio = dprObs;

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
	public static canRender(options: ViewLineOptions, viewportData: ViewportData, lineNumber: number): boolean {
		const data = viewportData.getViewLineRenderingData(lineNumber);
		if (
			data.containsRTL ||
			data.maxColumn > 200 ||
			data.continuesWithWrappedLine ||
			data.inlineDecorations.length > 0
		) {
			return false;
		}
		return true;
	}
}
