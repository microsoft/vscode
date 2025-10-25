/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ITerminalWidget } from './widgets.js';

export class TerminalWidgetManager implements IDisposable {
	private _container: HTMLElement | undefined;
	private _attached: Map<string, ITerminalWidget> = new Map();

	attachToElement(terminalWrapper: HTMLElement) {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('terminal-widget-container');
			terminalWrapper.appendChild(this._container);
		}
	}

	dispose(): void {
		if (this._container) {
			this._container.remove();
			this._container = undefined;
		}
		this._attached.forEach(w => w.dispose());
		this._attached.clear();
	}

	attachWidget(widget: ITerminalWidget): IDisposable | undefined {
		if (!this._container) {
			return;
		}
		this._attached.get(widget.id)?.dispose();
		widget.attach(this._container);
		this._attached.set(widget.id, widget);
		return {
			dispose: () => {
				const current = this._attached.get(widget.id);
				if (current === widget) {
					this._attached.delete(widget.id);
					widget.dispose();
				}
			}
		};
	}
}
