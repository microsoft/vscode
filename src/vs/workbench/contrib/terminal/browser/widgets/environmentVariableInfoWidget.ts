/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Widget } from 'vs/base/browser/ui/widget';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IHoverTarget, IProposedAnchor, HorizontalAlignment, VerticalAlignment, HoverWidget } from 'vs/workbench/contrib/terminal/browser/widgets/hoverWidget';
import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ITerminalWidget } from 'vs/workbench/contrib/terminal/browser/widgets/widgets';

export class EnvironmentVariableInfoWidget extends Widget implements ITerminalWidget {
	readonly id = 'env-var-info';

	private _domNode: HTMLElement | undefined;
	private _hoverWidget: HoverWidget | undefined;

	constructor(
		private _info: IEnvironmentVariableInfo
	) {
		super();
	}

	attach(container: HTMLElement): void {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('terminal-env-var-info', 'codicon', `codicon-${this._info.getIcon()}`);
		container.appendChild(this._domNode);
		this.onmouseover(this._domNode, () => {
			this._showHover();
		});
	}

	dispose() {
		super.dispose();
		this._domNode?.parentElement?.removeChild(this._domNode);
	}

	private _showHover() {
		if (!this._domNode || this._hoverWidget) {
			return;
		}
		const target = new ElementHoverTarget(this._domNode);
		this._hoverWidget = new HoverWidget(this._domNode, target, new MarkdownString(this._info.getInfo()), () => { });
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

	proposeIdealAnchor(): IProposedAnchor {
		const position = getDomNodePagePosition(this._element);
		return {
			x: document.documentElement.clientWidth - position.left - position.width,
			horizontalAlignment: HorizontalAlignment.Right,
			y: document.documentElement.clientHeight - position.top - 1,
			verticalAlignment: VerticalAlignment.Bottom
		};
	}

	proposeSecondaryAnchor(): IProposedAnchor {
		throw new Error('Method not implemented.');
	}

	dispose(): void {
	}
}
