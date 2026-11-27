/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { displayOrigin, IBrowserViewModel } from '../common/browserView.js';

/** Presents the visible native view host's pending dialog. */
export class BrowserDialogs extends Disposable {
	private readonly active = this._register(new MutableDisposable<DisposableStore>());
	private readonly modelStore = this._register(new DisposableStore());
	private model: IBrowserViewModel | undefined;
	private visible = false;
	private requestId: string | undefined;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	setModel(model: IBrowserViewModel | undefined): void {
		this.modelStore.clear();
		this.active.clear();
		this.requestId = undefined;
		this.model = model;
		if (model) {
			this.modelStore.add(model.onDidChangeDialog(() => this.show()));
		}
		this.show();
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.show();
	}

	private show(): void {
		const model = this.model;
		const request = this.visible ? model?.pendingDialog : undefined;
		if (request && this.requestId === request.requestId) {
			return;
		}
		this.active.clear();
		this.requestId = request?.requestId;
		if (!request || !model) {
			return;
		}
		const store = new DisposableStore();
		this.active.value = store;
		const cancellation = new CancellationTokenSource();
		const token = cancellation.token;
		store.add(toDisposable(() => cancellation.dispose(true)));
		const showDialog = async () => {
			if (request.type !== 'login') {
				const options = {
					type: 'info' as const,
					custom: true,
					token,
					message: request.origin
						? localize('browser.dialog.website', "{0} says", displayOrigin(request.origin))
						: localize('browser.dialog.embedded', "An embedded page says"),
					detail: request.message,
				};
				if (request.type === 'prompt') {
					const result = await this.dialogService.input({
						...options,
						primaryButton: localize('browser.dialog.ok', "OK"),
						inputs: [{ value: request.defaultPrompt, placeholder: localize('browser.dialog.response', "Response") }],
					});
					return { accept: result.confirmed, promptText: result.values?.[0] };
				}
				if (request.type === 'alert') {
					await this.dialogService.prompt({ ...options });
					return { accept: true };
				}
				const result = await this.dialogService.confirm({
					...options,
					primaryButton: localize('browser.dialog.ok', "OK"),
				});
				return { accept: result.confirmed };
			}
			const result = await this.dialogService.input({
				type: 'warning',
				custom: true,
				token,
				message: localize('browser.dialog.signIn', "Sign in to {0}", request.origin),
				detail: request.origin.startsWith('http:')
					? localize('browser.dialog.insecureCredentials', "This site requires a username and password.\nYour connection to this site is not secure. Your credentials will be sent over an unencrypted connection.")
					: localize('browser.dialog.credentials', "This site requires a username and password."),
				primaryButton: localize('browser.dialog.login', "Log In"),
				inputs: [
					{ placeholder: localize('browser.dialog.username', "Username") },
					{ placeholder: localize('browser.dialog.password', "Password"), type: 'password' },
				],
			});
			return { accept: result.confirmed, username: result.values?.[0], password: result.values?.[1] };
		};
		void showDialog().then(response => {
			if (!token.isCancellationRequested) {
				return model.respondToDialog(request.requestId, response);
			}
			return undefined;
		}).catch(error => this.logService.error('Failed to show integrated browser dialog', error));
	}
}
