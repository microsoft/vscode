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

	constructor(
		private _info: IEnvironmentVariableInfo
	) {
		super();
	}

	attach(container: HTMLElement): void {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('terminal-env-var-info', 'codicon', `codicon-${this._info.getInfo()}`);
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
		if (!this._domNode) {
			return;
		}
		const target = new ElementHoverTarget(this._domNode);
		this._register(new HoverWidget(this._domNode, target, new MarkdownString(this._info.getInfo()), () => { }));
	}
}

class ElementHoverTarget implements IHoverTarget {
	readonly targetElements: readonly HTMLElement[];

	constructor(
		element: HTMLElement
	) {
		this.targetElements = [element];
	}

	proposeIdealAnchor(): IProposedAnchor {
		const firstPosition = getDomNodePagePosition(this.targetElements[0]);
		return {
			x: firstPosition.left + firstPosition.width,
			horizontalAlignment: HorizontalAlignment.Right,
			y: document.documentElement.clientHeight - firstPosition.top - 1,
			verticalAlignment: VerticalAlignment.Bottom
		};
	}

	proposeSecondaryAnchor(): IProposedAnchor {
		throw new Error('Method not implemented.');
	}

	dispose(): void {
		throw new Error('Method not implemented.');
	}
}
