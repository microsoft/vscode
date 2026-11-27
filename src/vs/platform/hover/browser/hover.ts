/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IHoverDelegate, IHoverDelegateOptions } from '../../../base/browser/ui/hover/hoverDelegate.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { addStandardDisposableListener, isHTMLElement } from '../../../base/browser/dom.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import type { IHoverDelegate2, IHoverOptions, IHoverWidget, IManagedHoverContentOrFactory } from '../../../base/browser/ui/hover/hover.js';
import { deepClone, equals } from '../../../base/common/objects.js';

export const IHoverService = createDecorator<IHoverService>('hoverService');

export interface IHoverService extends IHoverDelegate2 {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the visible sticky hover for the given target element, excluding passive previews.
	 */
	getStickyHover(targetElement: HTMLElement): IHoverWidget | undefined;
}

export interface IHoverDelayOptions {
	readonly instantHover?: boolean;
	readonly dynamicDelay?: (content?: IManagedHoverContentOrFactory) => number | undefined;
}

export class WorkbenchHoverDelegate extends Disposable implements IHoverDelegate {

	private lastHoverHideTime = 0;
	private timeLimit = 200;

	private _delay: number;
	get delay(): number | ((content: IManagedHoverContentOrFactory) => number) {
		if (this.isInstantlyHovering()) {
			return 0; // show instantly when a hover was recently shown
		}

		if (this.hoverOptions?.dynamicDelay) {
			return content => this.hoverOptions?.dynamicDelay?.(content) ?? this._delay;
		}

		return this._delay;
	}

	private readonly hoverDisposables = this._register(new DisposableStore());
	private readonly hoverUpdates = new WeakMap<IHoverWidget, { options: IHoverDelegateOptions; configuration: ReturnType<typeof getHoverUpdateConfiguration> }>();

	constructor(
		public readonly placement: 'mouse' | 'element',
		private readonly hoverOptions: IHoverDelayOptions | undefined,
		private overrideOptions: Partial<IHoverOptions> | ((options: IHoverDelegateOptions, focus?: boolean) => Partial<IHoverOptions>) = {},
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this._delay = this.configurationService.getValue<number>('workbench.hover.delay');
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.hover.delay')) {
				this._delay = this.configurationService.getValue<number>('workbench.hover.delay');
			}
		}));
	}

	showHover(options: IHoverDelegateOptions, focus?: boolean): IHoverWidget | undefined {
		const resolvedOptions = this.resolveOptions(options, focus);
		const configuration = getHoverUpdateConfiguration(resolvedOptions);

		// close hover on escape
		this.hoverDisposables.clear();
		const targets = isHTMLElement(options.target) ? [options.target] : options.target.targetElements;
		for (const target of targets) {
			this.hoverDisposables.add(addStandardDisposableListener(target, 'keydown', (e) => {
				if (e.equals(KeyCode.Escape)) {
					this.hoverService.hideHover();
				}
			}));
		}

		const hover = this.hoverService.showInstantHover(resolvedOptions, focus);
		if (hover) {
			this.hoverUpdates.set(hover, { options, configuration });
		}
		return hover;
	}

	/**
	 * Reevaluate overrides while preserving the widget when its effective configuration is unchanged.
	 */
	updateHover(hover: IHoverWidget, content: string, focus?: boolean): boolean {
		const previous = this.hoverUpdates.get(hover);
		if (!previous || hover.isDisposed) {
			return false;
		}
		const options = { ...previous.options, content };
		const resolvedOptions = this.resolveOptions(options, focus);
		if (typeof resolvedOptions.content !== 'string') {
			return false;
		}
		const configuration = getHoverUpdateConfiguration(resolvedOptions);
		if (previous.configuration.target !== configuration.target ||
			previous.configuration.container !== configuration.container ||
			previous.configuration.hoverPosition !== configuration.hoverPosition ||
			previous.configuration.clippingElement !== configuration.clippingElement ||
			!equals(previous.configuration.options, configuration.options) ||
			!hover.updateContent?.(resolvedOptions.content)) {
			return false;
		}
		this.hoverUpdates.set(hover, { options, configuration });
		return true;
	}

	/**
	 * Resolve the same delegate configuration for creation and in-place compatibility checks.
	 */
	private resolveOptions(options: IHoverDelegateOptions, focus?: boolean): IHoverOptions {
		const overrideOptions = typeof this.overrideOptions === 'function' ? this.overrideOptions(options, focus) : this.overrideOptions;
		return {
			...options,
			...overrideOptions,
			persistence: {
				hideOnKeyDown: true,
				...overrideOptions.persistence
			},
			appearance: {
				...options.appearance,
				compact: true,
				skipFadeInAnimation: this.isInstantlyHovering(),
				...overrideOptions.appearance
			}
		};
	}

	private isInstantlyHovering(): boolean {
		return !!this.hoverOptions?.instantHover && Date.now() - this.lastHoverHideTime < this.timeLimit;
	}

	setInstantHoverTimeLimit(timeLimit: number): void {
		if (!this.hoverOptions?.instantHover) {
			throw new Error('Instant hover is not enabled');
		}
		this.timeLimit = timeLimit;
	}

	onDidHideHover(): void {
		this.hoverDisposables.clear();
		if (this.hoverOptions?.instantHover) {
			this.lastHoverHideTime = Date.now();
		}
	}
}

/**
 * Snapshot configuration independently of mutable option objects, keeping DOM and event identities
 * out of structural cloning. Fade-in animation only applies when a widget is created.
 */
function getHoverUpdateConfiguration(options: IHoverOptions) {
	return {
		target: options.target,
		container: options.container,
		hoverPosition: options.position?.hoverPosition,
		clippingElement: options.position?.clippingElement,
		options: deepClone({
			...options,
			content: undefined,
			target: undefined,
			container: undefined,
			position: { ...options.position, hoverPosition: undefined, clippingElement: undefined },
			appearance: { ...options.appearance, skipFadeInAnimation: undefined },
		}),
	};
}

// TODO@benibenj remove this, only temp fix for contextviews
export const nativeHoverDelegate: IHoverDelegate = {
	showHover: function (): IHoverWidget | undefined {
		throw new Error('Native hover function not implemented.');
	},
	delay: 0,
	showNativeHover: true
};
