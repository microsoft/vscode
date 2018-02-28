/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageItem, workspace, Disposable, ProgressLocation, window } from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import { loadMessageBundle } from 'vscode-nls';

const localize = loadMessageBundle();

const typingsInstallTimeout = 30 * 1000;

export default class TypingsStatus extends Disposable {
	private _acquiringTypings: { [eventId: string]: NodeJS.Timer } = Object.create({});
	private _client: ITypeScriptServiceClient;
	private _subscriptions: Disposable[] = [];

	constructor(client: ITypeScriptServiceClient) {
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
	private _disposable: Disposable;

	constructor(client: ITypeScriptServiceClient) {
		this._disposable = Disposable.from(
			client.onDidBeginInstallTypings(e => this._onBegin(e.eventId)),
			client.onDidEndInstallTypings(e => this._onEndOrTimeout(e.eventId)),
			client.onTypesInstallerInitializationFailed(_ => this.onTypesInstallerInitializationFailed()));
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

		window.withProgress({
			location: ProgressLocation.Window,
			title: localize('installingPackages', "Fetching data for better TypeScript IntelliSense")
		}, () => promise);
	}

	private _onEndOrTimeout(eventId: number): void {
		const resolve = this._promises.get(eventId);
		if (resolve) {
			this._promises.delete(eventId);
			resolve();
		}
	}

	private onTypesInstallerInitializationFailed() {
		interface MyMessageItem extends MessageItem {
			id: number;
		}

		if (workspace.getConfiguration('typescript').get<boolean>('check.npmIsInstalled', true)) {
			window.showWarningMessage<MyMessageItem>(
				localize(
					'typesInstallerInitializationFailed.title',
					"Could not install typings files for JavaScript language features. Please ensure that NPM is installed or configure 'typescript.npm' in your user settings. Click [here]({0}) to learn more.",
					'https://go.microsoft.com/fwlink/?linkid=847635'
				), {
					title: localize('typesInstallerInitializationFailed.doNotCheckAgain', "Don't Show Again"),
					id: 1
				}
			).then(selected => {
				if (!selected) {
					return;
				}
				switch (selected.id) {
					case 1:
						const tsConfig = workspace.getConfiguration('typescript');
						tsConfig.update('check.npmIsInstalled', false, true);
						break;
				}
			});
		}
	}
}
