/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverService, IHoverOptions } from 'vs/workbench/contrib/hover/browser/hover';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HoverWidget } from 'vs/workbench/contrib/hover/browser/hoverWidget';
import { IContextViewProvider, AnchorPosition } from 'vs/base/browser/ui/contextview/contextview';

export class HoverService implements IHoverService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextViewService private readonly _contextViewService: IContextViewService
	) {
	}

	showHover(options: IHoverOptions): void {
		// TODO: Prevent hover when the same one is already visible
		const hover = this._instantiationService.createInstance(HoverWidget, options.target, options.text, options.linkHandler, []);
		const provider = this._contextViewService as IContextViewProvider;
		provider.showContextView({
			render: container => {
				hover.render(container);
				return hover;
			},
			anchorPosition: AnchorPosition.ABOVE,
			getAnchor: () => {
				return {
					x: hover.x,
					y: hover.y
				};
			}
		});
	}

	hideHover(): void {
		this._contextViewService.hideContextView();
	}
}
