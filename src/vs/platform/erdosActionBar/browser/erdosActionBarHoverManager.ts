/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverWidget } from '../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../hover/browser/hover.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverManager } from '../../hover/browser/hoverManager.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';

const INSTANT_HOVER_TIME_LIMIT = 200;

export class ErdosActionBarHoverManager extends Disposable implements IHoverManager {
	private _hoverDelay: number;
	private _customHoverDelay: number | undefined;
	private _hoverLeaveTime: number = 0;
	private _timeout?: Timeout;
	private _lastHoverWidget?: IHoverWidget;

	private get isInstantlyHovering(): boolean {
		return Date.now() - this._hoverLeaveTime < INSTANT_HOVER_TIME_LIMIT;
	}

	constructor(
		private readonly _compact: boolean,
		private readonly _configurationService: IConfigurationService,
		private readonly _hoverService: IHoverService
	) {
		super();

		this._hoverDelay = this._configurationService.getValue<number>('workbench.hover.delay');
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.hover.delay') && !this._customHoverDelay) {
				this._hoverDelay = this._configurationService.getValue<number>('workbench.hover.delay');
			}
		}));

		this._register(toDisposable(() => this._hoverService.hideHover()));
	}

	override dispose(): void {
		if (this._timeout) {
			clearTimeout(this._timeout);
			this._timeout = undefined;
		}

		if (this._lastHoverWidget) {
			this._lastHoverWidget.dispose();
			this._lastHoverWidget = undefined;
		}

		super.dispose();
	}

	public showHover(target: HTMLElement, content?: string | (() => string | undefined)): void {
		this.hideHover();

		if (!content) {
			return;
		}

		const showHover = (content: string, skipFadeInAnimation: boolean) => {
			this._lastHoverWidget = this._hoverService.showInstantHover({
				content,
				target,
				position: {
					hoverPosition: HoverPosition.BELOW
				},
				persistence: {
					hideOnKeyDown: true,
					hideOnHover: false
				},
				appearance: {
					compact: this._compact,
					showPointer: true,
					skipFadeInAnimation
				}
			}, false);
		};

		if (typeof content !== 'string') {
			content = content();
			if (!content) {
				return;
			}
		}

		if (this.isInstantlyHovering) {
			showHover(content, true);
		} else {
			this._timeout = setTimeout(() =>
				showHover(content, false),
				this._hoverDelay
			);
		}
	}

	public setCustomHoverDelay(hoverDelay: number): void {
		this._customHoverDelay = hoverDelay;
		this._hoverDelay = hoverDelay;
	}

	public hideHover(): void {
		if (this._timeout) {
			clearTimeout(this._timeout);
			this._timeout = undefined;
		}

		if (this._lastHoverWidget) {
			this._lastHoverWidget.dispose();
			this._lastHoverWidget = undefined;
			this._hoverLeaveTime = Date.now();
		}
	}
}