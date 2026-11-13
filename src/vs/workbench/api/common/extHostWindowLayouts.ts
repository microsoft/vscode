/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter } from '../../../base/common/event.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostWindowLayoutsShape, IMainContext, MainContext, MainThreadWindowLayoutsShape, WindowLayoutDto } from './extHost.protocol.js';

function toWindowLayout(layout: WindowLayoutDto): vscode.WindowLayout {
	return Object.freeze({
		label: layout.label,
		contribution: layout.contribution ? Object.freeze({ ...layout.contribution }) : undefined
	});
}

export class ExtHostWindowLayouts implements ExtHostWindowLayoutsShape {

	private readonly proxy: MainThreadWindowLayoutsShape;

	private readonly _onDidChangeActiveLayout = new Emitter<vscode.WindowLayout>();
	readonly onDidChangeActiveLayout = this._onDidChangeActiveLayout.event;

	private _activeLayout: vscode.WindowLayout = Object.freeze({ label: 'Default', contribution: undefined });

	constructor(mainContext: IMainContext) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadWindowLayouts);
	}

	get activeLayout(): vscode.WindowLayout {
		return this._activeLayout;
	}

	$acceptActiveLayout(layout: WindowLayoutDto): void {
		const activeLayout = toWindowLayout(layout);
		if (activeLayout.label === this._activeLayout.label && activeLayout.contribution?.extensionId === this._activeLayout.contribution?.extensionId && activeLayout.contribution?.id === this._activeLayout.contribution?.id) {
			return;
		}

		this._activeLayout = activeLayout;
		this._onDidChangeActiveLayout.fire(activeLayout);
	}

	async switchLayout(extension: IExtensionDescription, id: string): Promise<vscode.WindowLayoutSwitch> {
		const { token, previousLayout } = await this.proxy.$switchLayout(extension.identifier.value, id);
		return Object.freeze({
			previousLayout: toWindowLayout(previousLayout),
			restore: () => this.proxy.$restoreLayout(token)
		});
	}
}
