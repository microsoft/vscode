/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../base/browser/dom.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../parts/views/viewPane.js';
import { IViewDescriptorService } from '../../common/views.js';

export interface ErdosViewPaneOptions extends IViewPaneOptions {
	openFromCollapsedSize?: number | `${number}%`;
}

export abstract class ErdosViewPane extends ViewPane {
	private readonly _disposableStore: DisposableStore;

	private _lastLayoutSize: number | undefined = undefined;

	static readonly MinOpenFromCollapseThreshold = 100;

	focusElement?(): void;

	constructor(
		options: ErdosViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService
		);

		if (options.openFromCollapsedSize) {
			this.minimumBodySize = 0;
		}

		this._disposableStore = this._register(new DisposableStore());

		this.element.tabIndex = 0;

		if (options.openFromCollapsedSize) {
			this._register(this.onDidChangeBodyVisibility(visible => {

				if (visible) {
					this.minimumBodySize = options.minimumBodySize ?? this._getOpenFromCollapsedSize(options.openFromCollapsedSize);
					this.minimumBodySize = 0;
				}
			}));
		}
	}

	override layout(size: number): void {
		this._lastLayoutSize = size - 22;

		super.layout(size);
	}

	private _getOpenFromCollapsedSize(openFromCollapsedSize: ErdosViewPaneOptions['openFromCollapsedSize']): number {

		if (this._lastLayoutSize && this._lastLayoutSize > ErdosViewPane.MinOpenFromCollapseThreshold) {
			return this._lastLayoutSize;
		}

		if (typeof openFromCollapsedSize === 'number') {
			return openFromCollapsedSize;
		}

		if (typeof openFromCollapsedSize === 'string') {
			const popOpenPercent = parseFloat(openFromCollapsedSize);

			if (isNaN(popOpenPercent)) {
				throw new Error(`Invalid value for openFromCollapsedSize: ${openFromCollapsedSize}`);
			}

			const windowHeight = DOM.getWindow(this.element).innerHeight;
			return windowHeight * popOpenPercent / 100;
		}

		throw new Error(`Invalid value for openFromCollapsedSize: ${openFromCollapsedSize}`);
	}

	override focus(): void {
		const focus = () => {
			super.focus();

			this.focusElement?.();
		};
		disposableTimeout(focus, 0, this._disposableStore);
	}

}
