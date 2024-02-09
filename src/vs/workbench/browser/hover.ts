/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverDelegate, IHoverDelegateOptions, IHoverWidget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IHoverService } from 'vs/platform/hover/browser/hover';

export class WorkbenchHoverDelegate implements IHoverDelegate {

	readonly placement = 'mouse';

	private _delay: number;
	get delay(): number {
		return this._delay;
	}

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		this._delay = this.configurationService.getValue<number>('workbench.hover.delay');
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.hover.delay')) {
				this._delay = this.configurationService.getValue<number>('workbench.hover.delay');
			}
		});
	}

	showHover(options: IHoverDelegateOptions): IHoverWidget | undefined {
		return this.hoverService.showHover({
			...options,
			persistence: {
				hideOnHover: true
			}
		});
	}
}
