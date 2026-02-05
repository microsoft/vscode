/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../../base/browser/dom.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IToastOptions, IToastResult } from './host.js';

export interface IShowToastController {
	onDidCreateToast: (toast: IDisposable) => void;
	onDidDisposeToast: (toast: IDisposable) => void;
}

export async function showBrowserToast(controller: IShowToastController, options: IToastOptions, token: CancellationToken): Promise<IToastResult> {
	const toast = await triggerBrowserToast(options.title, {
		detail: options.body,
		sticky: !options.silent
	});

	if (!toast) {
		return { supported: false, clicked: false };
	}

	const disposables = new DisposableStore();
	controller.onDidCreateToast(toast);

	const cts = new CancellationTokenSource(token);

	disposables.add(toDisposable(() => {
		controller.onDidDisposeToast(toast);
		toast.dispose();
		cts.dispose(true);
	}));

	return new Promise<IToastResult>(r => {
		const resolve = (result: IToastResult) => {
			r(result);				// first return the result before...
			disposables.dispose();	// ...disposing which would invalidate the result object
		};

		cts.token.onCancellationRequested(() => resolve({ supported: true, clicked: false }));

		Event.once(toast.onClick)(() => resolve({ supported: true, clicked: true }));
		Event.once(toast.onClose)(() => resolve({ supported: true, clicked: false }));
		Event.once(toast.onError)(() => resolve({ supported: false, clicked: false }));
	});
}

interface INotification extends IDisposable {
	readonly onClick: Event<void>;
	readonly onClose: Event<void>;
	readonly onError: Event<void>;
}

async function triggerBrowserToast(message: string, options?: { detail?: string; sticky?: boolean }): Promise<INotification | undefined> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		return;
	}

	const disposables = new DisposableStore();

	const notification = new Notification(message, {
		body: options?.detail,
		requireInteraction: options?.sticky,
	});

	const onClick = disposables.add(new Emitter<void>());
	const onClose = disposables.add(new Emitter<void>());
	const onError = disposables.add(new Emitter<void>());

	disposables.add(addDisposableListener(notification, 'click', () => onClick.fire()));
	disposables.add(addDisposableListener(notification, 'close', () => onClose.fire()));
	disposables.add(addDisposableListener(notification, 'error', () => onError.fire()));

	disposables.add(toDisposable(() => notification.close()));

	return {
		onClick: onClick.event,
		onClose: onClose.event,
		onError: onError.event,
		dispose: () => disposables.dispose()
	};
}
