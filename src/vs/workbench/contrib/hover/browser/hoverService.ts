/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverService, IHoverOptions } from 'vs/workbench/contrib/hover/browser/hover';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HoverWidget } from 'vs/workbench/contrib/hover/browser/hoverWidget';
import { IContextViewProvider, IDelegate } from 'vs/base/browser/ui/contextview/contextview';

export class HoverService implements IHoverService {
	declare readonly _serviceBrand: undefined;

	private _currentHoverOptions: IHoverOptions | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextViewService private readonly _contextViewService: IContextViewService
	) {
	}

	showHover(options: IHoverOptions, focus?: boolean): void {
		if (this._currentHoverOptions === options) {
			return;
		}
		this._currentHoverOptions = options;

		const hover = this._instantiationService.createInstance(HoverWidget, options);
		const provider = this._contextViewService as IContextViewProvider;
		const contextViewDelegate: IDelegate = {
			render: container => {
				hover.render(container);
				hover.onDispose(() => this._currentHoverOptions = undefined);
				if (focus) {
					hover.focus();
				}
				return hover;
			},
			anchorPosition: hover.anchor,
			getAnchor: () => ({ x: hover.x, y: hover.y }),
			layout: () => hover.layout()
		};
		provider.showContextView(contextViewDelegate);
		hover.onRequestLayout(() => provider.layout());
	}

	hideHover(): void {
		if (!this._currentHoverOptions) {
			return;
		}
		this._currentHoverOptions = undefined;
		this._contextViewService.hideContextView();
	}
}
