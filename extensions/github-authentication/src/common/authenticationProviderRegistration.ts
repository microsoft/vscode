/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/** Buffers initial session changes until the extension host has subscribed during registration. */
export class AuthenticationProviderRegistration implements vscode.AuthenticationProvider, vscode.Disposable {
	private readonly _events = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private readonly _event = this._events.event;
	private _pending: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] | undefined = [];
	private readonly _registered = Promise.withResolvers<boolean>();
	private readonly _disposable: vscode.Disposable;

	/** Completes with false if disposed before the extension host subscribes. */
	get whenRegistered(): Promise<boolean> { return this._registered.promise; }

	readonly onDidChangeSessions: vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent> = (listener, thisArgs, disposables) => {
		const subscription = this._event(listener, thisArgs, disposables);
		// Registration sends its RPC after subscribing, so flush only once that call is queued.
		queueMicrotask(() => this.flush());
		return subscription;
	};

	constructor(
		id: string,
		label: string,
		private readonly _provider: vscode.AuthenticationProvider,
		options: vscode.AuthenticationProviderOptions
	) {
		this._disposable = vscode.Disposable.from(
			this._events,
			_provider.onDidChangeSessions(event => {
				if (this._pending) {
					this._pending.push(event);
				} else {
					this._events.fire(event);
				}
			}),
			vscode.authentication.registerAuthenticationProvider(id, label, this, options)
		);
	}

	private flush(): void {
		const pending = this._pending;
		this._pending = undefined;
		if (pending) {
			pending.forEach(event => this._events.fire(event));
			this._registered.resolve(true);
		}
	}

	getSessions(scopes: readonly string[] | undefined, options: vscode.AuthenticationProviderSessionOptions = {}) {
		return this._provider.getSessions(scopes, options);
	}

	createSession(scopes: readonly string[], options: vscode.AuthenticationProviderSessionOptions = {}) {
		return this._provider.createSession(scopes, options);
	}

	removeSession(id: string) {
		return this._provider.removeSession(id);
	}

	dispose(): void {
		this._pending = undefined;
		this._registered.resolve(false);
		this._disposable.dispose();
	}
}
