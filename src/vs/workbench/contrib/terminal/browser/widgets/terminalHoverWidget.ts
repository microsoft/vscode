/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Widget } from 'vs/base/browser/ui/widget';
import { ITerminalWidget } from 'vs/workbench/contrib/terminal/browser/widgets/widgets';
import * as dom from 'vs/base/browser/dom';
import type { IViewportRange } from 'xterm';
import { IHoverTarget, IHoverService, IHoverAction } from 'vs/workbench/services/hover/browser/hover';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';

const $ = dom.$;

export interface ILinkHoverTargetOptions {
	readonly viewportRange: IViewportRange;
	readonly cellDimensions: { width: number; height: number };
	readonly terminalDimensions: { width: number; height: number };
	readonly modifierDownCallback?: () => void;
	readonly modifierUpCallback?: () => void;
}

export class TerminalHover extends Disposable implements ITerminalWidget {
	readonly id = 'hover';

	constructor(
		private readonly _targetOptions: ILinkHoverTargetOptions,
		private readonly _text: IMarkdownString,
		private readonly _actions: IHoverAction[] | undefined,
		private readonly _linkHandler: (url: string) => any,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
	}

	attach(container: HTMLElement): void {
		const showLinkHover = this._configurationService.getValue(TerminalSettingId.ShowLinkHover);
		if (!showLinkHover) {
			return;
		}
		const target = new CellHoverTarget(container, this._targetOptions);
		const hover = this._hoverService.showHover({
			target,
			content: this._text,
			actions: this._actions,
			linkHandler: this._linkHandler,
			// .xterm-hover lets xterm know that the hover is part of a link
			additionalClasses: ['xterm-hover']
		});
		if (hover) {
			this._register(hover);
		}
	}
}

class CellHoverTarget extends Widget implements IHoverTarget {
	private _domNode: HTMLElement;
	private readonly _targetElements: HTMLElement[] = [];

	get targetElements(): readonly HTMLElement[] { return this._targetElements; }

	constructor(
		container: HTMLElement,
		private readonly _options: ILinkHoverTargetOptions
	) {
		super();

		this._domNode = $('div.terminal-hover-targets.xterm-hover');
		const rowCount = this._options.viewportRange.end.y - this._options.viewportRange.start.y + 1;

		// Add top target row
		const width = (this._options.viewportRange.end.y > this._options.viewportRange.start.y ? this._options.terminalDimensions.width - this._options.viewportRange.start.x : this._options.viewportRange.end.x - this._options.viewportRange.start.x + 1) * this._options.cellDimensions.width;
		const topTarget = $('div.terminal-hover-target.hoverHighlight');
		topTarget.style.left = `${this._options.viewportRange.start.x * this._options.cellDimensions.width}px`;
		topTarget.style.bottom = `${(this._options.terminalDimensions.height - this._options.viewportRange.start.y - 1) * this._options.cellDimensions.height}px`;
		topTarget.style.width = `${width}px`;
		topTarget.style.height = `${this._options.cellDimensions.height}px`;
		this._targetElements.push(this._domNode.appendChild(topTarget));

		// Add middle target rows
		if (rowCount > 2) {
			const middleTarget = $('div.terminal-hover-target.hoverHighlight');
			middleTarget.style.left = `0px`;
			middleTarget.style.bottom = `${(this._options.terminalDimensions.height - this._options.viewportRange.start.y - 1 - (rowCount - 2)) * this._options.cellDimensions.height}px`;
			middleTarget.style.width = `${this._options.terminalDimensions.width * this._options.cellDimensions.width}px`;
			middleTarget.style.height = `${(rowCount - 2) * this._options.cellDimensions.height}px`;
			this._targetElements.push(this._domNode.appendChild(middleTarget));
		}

		// Add bottom target row
		if (rowCount > 1) {
			const bottomTarget = $('div.terminal-hover-target.hoverHighlight');
			bottomTarget.style.left = `0px`;
			bottomTarget.style.bottom = `${(this._options.terminalDimensions.height - this._options.viewportRange.end.y - 1) * this._options.cellDimensions.height}px`;
			bottomTarget.style.width = `${(this._options.viewportRange.end.x + 1) * this._options.cellDimensions.width}px`;
			bottomTarget.style.height = `${this._options.cellDimensions.height}px`;
			this._targetElements.push(this._domNode.appendChild(bottomTarget));
		}

		if (this._options.modifierDownCallback && this._options.modifierUpCallback) {
			let down = false;
			this._register(dom.addDisposableListener(document, 'keydown', e => {
				if (e.ctrlKey && !down) {
					down = true;
					this._options.modifierDownCallback!();
				}
			}));
			this._register(dom.addDisposableListener(document, 'keyup', e => {
				if (!e.ctrlKey) {
					down = false;
					this._options.modifierUpCallback!();
				}
			}));
		}

		container.appendChild(this._domNode);
		this._register(toDisposable(() => this._domNode?.remove()));
	}
}
