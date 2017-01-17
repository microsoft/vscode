/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { ITypescriptServiceClient } from '../typescriptService';

const typingsInstallTimeout = 30 * 1000;

export default class TypingsStatus extends vscode.Disposable {
	private _acquiringTypings: { [eventId: string]: NodeJS.Timer } = Object.create({});
	private _client: ITypescriptServiceClient;
	private _subscriptions: vscode.Disposable[] = [];

	constructor(client: ITypescriptServiceClient) {
		super(() => this.dispose());
		this._client = client;

		this._subscriptions.push(
			this._client.onDidBeginInstallTypings(event => this.onBeginInstallTypings(event.eventId)));

		this._subscriptions.push(
			this._client.onDidEndInstallTypings(event => this.onEndInstallTypings(event.eventId)));
	}

	public dispose(): void {
		this._subscriptions.forEach(x => x.dispose());

		for (const eventId of Object.keys(this._acquiringTypings)) {
			clearTimeout(this._acquiringTypings[eventId]);
		}
	}

	public get isAcquiringTypings(): boolean {
		return Object.keys(this._acquiringTypings).length > 0;
	}

	private onBeginInstallTypings(eventId: number): void {
		if (this._acquiringTypings[eventId]) {
			return;
		}
		this._acquiringTypings[eventId] = setTimeout(() => {
			this.onEndInstallTypings(eventId);
		}, typingsInstallTimeout);
	}

	private onEndInstallTypings(eventId: number): void {
		const timer = this._acquiringTypings[eventId];
		if (timer) {
			clearTimeout(timer);
		}
		delete this._acquiringTypings[eventId];
	}
}