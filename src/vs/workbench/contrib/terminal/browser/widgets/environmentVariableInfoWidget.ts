/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Widget } from 'vs/base/browser/ui/widget';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ITerminalWidget, IHoverTarget, IHoverAnchor, HorizontalAnchorSide, VerticalAnchorSide } from 'vs/workbench/contrib/terminal/browser/widgets/widgets';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HoverWidget } from 'vs/workbench/contrib/terminal/browser/widgets/hoverWidget';

export class EnvironmentVariableInfoWidget extends Widget implements ITerminalWidget {
	readonly id = 'env-var-info';

	private _domNode: HTMLElement | undefined;
	private _container: HTMLElement | undefined;
	private _hoverWidget: HoverWidget | undefined;

	get requiresAction() { return this._info.requiresAction; }

	constructor(
		private _info: IEnvironmentVariableInfo,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	attach(container: HTMLElement): void {
		this._container = container;
		this._domNode = document.createElement('div');
		this._domNode.classList.add('terminal-env-var-info', 'codicon', `codicon-${this._info.getIcon()}`);
		container.appendChild(this._domNode);
		this.onmouseover(this._domNode, () => this._showHover());
	}

	dispose() {
		super.dispose();
		this._domNode?.parentElement?.removeChild(this._domNode);
	}

	private _showHover() {
		if (!this._domNode || !this._container || this._hoverWidget) {
			return;
		}
		const target = new ElementHoverTarget(this._domNode);
		const actions = this._info.getActions ? this._info.getActions() : undefined;
		this._hoverWidget = this._instantiationService.createInstance(HoverWidget, this._container, target, new MarkdownString(this._info.getInfo()), () => { }, actions);
		this._register(this._hoverWidget);
		this._register(this._hoverWidget.onDispose(() => this._hoverWidget = undefined));
	}
}

class ElementHoverTarget implements IHoverTarget {
	readonly targetElements: readonly HTMLElement[];

	constructor(
		private _element: HTMLElement
	) {
		this.targetElements = [this._element];
	}

	get anchor(): IHoverAnchor {
		const position = getDomNodePagePosition(this._element);
		return {
			x: position.left,
			horizontalAnchorSide: HorizontalAnchorSide.Left,
			y: document.documentElement.clientHeight - position.top - 1,
			verticalAnchorSide: VerticalAnchorSide.Bottom,
			fallbackY: position.top + position.height
		};
	}

	dispose(): void {
	}
}
