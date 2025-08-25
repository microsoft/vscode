/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import { Emitter } from '../../../../base/common/event.js';
import * as extHostProtocol from './extHost.erdos.protocol.js';
import { ExtHostConsole } from './extHostConsole.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { dispose } from '../../../../base/common/lifecycle.js';

export class ExtHostConsoleService implements extHostProtocol.ExtHostConsoleServiceShape {

	private readonly _extHostConsolesBySessionId = new Map<string, ExtHostConsole>();

	private readonly _onDidChangeConsoleWidth = new Emitter<number>();

	private readonly _proxy: extHostProtocol.MainThreadConsoleServiceShape;

	constructor(
		mainContext: extHostProtocol.IMainErdosContext,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainErdosContext.MainThreadConsoleService);
	}

	onDidChangeConsoleWidth = this._onDidChangeConsoleWidth.event;

	getConsoleWidth(): Promise<number> {
		return this._proxy.$getConsoleWidth();
	}

	async getConsoleForLanguage(languageId: string): Promise<erdos.Console | undefined> {
		const sessionId = await this._proxy.$getSessionIdForLanguage(languageId);

		if (!sessionId) {
			return undefined;
		}

		const extHostConsole = this._extHostConsolesBySessionId.get(sessionId);

		if (!extHostConsole) {
			return undefined;
		}

		return extHostConsole.getConsole();
	}

	$onDidChangeConsoleWidth(newWidth: number): void {
		this._onDidChangeConsoleWidth.fire(newWidth);
	}

	$addConsole(sessionId: string): void {
		const extHostConsole = new ExtHostConsole(sessionId, this._proxy, this._logService);
		this._extHostConsolesBySessionId.set(sessionId, extHostConsole);
	}

	$removeConsole(sessionId: string): void {
		const extHostConsole = this._extHostConsolesBySessionId.get(sessionId);
		this._extHostConsolesBySessionId.delete(sessionId);
		dispose(extHostConsole);
	}
}