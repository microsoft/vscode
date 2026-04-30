/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IOTelSqliteStore, type OTelSqliteStore } from '../../../platform/otel/node/sqlite/otelSqliteStore';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import type { IExtensionContribution } from '../../common/contributions';
import { OTelViewerPanel } from './otelViewerPanel';

/**
 * Registers commands that open the OTel trace viewer webview.
 * The viewer reads from the always-on SQLite store populated by OTelContrib.
 */
export class OTelViewerContrib extends Disposable implements IExtensionContribution {

	constructor(
		@IOTelSqliteStore private readonly _sqliteStore: OTelSqliteStore,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
	) {
		super();

		this._register(vscode.commands.registerCommand('github.copilot.chat.openTraces', () => {
			OTelViewerPanel.openOrReveal(this._sqliteStore, this._extensionContext.extensionUri);
		}));

		this._register(vscode.commands.registerCommand('github.copilot.chat.openTrace', (args?: { traceId?: string } | string) => {
			const traceId = typeof args === 'string' ? args : args?.traceId;
			OTelViewerPanel.openOrReveal(this._sqliteStore, this._extensionContext.extensionUri, traceId);
		}));
	}
}
