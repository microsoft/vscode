/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../../src/vs/vscode.proposed.d.ts" />

'use strict';

import * as vscode from 'vscode';
import { ITypescriptServiceClient } from '../typescriptService';
import { loadMessageBundle } from 'vscode-nls';
const localize = loadMessageBundle();

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

export class AtaProgressReporter {

	private _promises = new Map<number, Function>();
	private _disposable: vscode.Disposable;

	constructor(client: ITypescriptServiceClient) {
		this._disposable = vscode.Disposable.from(
			client.onDidBeginInstallTypings(e => this._onBegin(e.eventId)),
			client.onDidEndInstallTypings(e => this._onEndOrTimeout(e.eventId))
		);
	}

	dispose(): void {
		this._disposable.dispose();
		this._promises.forEach(value => value());
	}

	private _onBegin(eventId: number): void {
		const handle = setTimeout(() => this._onEndOrTimeout(eventId), typingsInstallTimeout);
		const promise = new Promise(resolve => {
			this._promises.set(eventId, () => {
				clearTimeout(handle);
				resolve();
			});
		});

		vscode.window.withWindowProgress(localize('installingPackages', "Fetching data for better TypeScript IntelliSense"), () => promise);
	}

	private _onEndOrTimeout(eventId: number): void {
		const resolve = this._promises.get(eventId);
		if (resolve) {
			this._promises.delete(eventId);
			resolve();
		}
	}
}
