/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../base/common/assert.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import type { IBrowserViewDeviceRequest } from '../../../../platform/browserView/common/browserView.js';
import { type BrowserDeviceType, PERMISSION_CATEGORY_DESCRIPTORS, type PermissionCategory, type PermissionDecision } from '../../../../platform/browserView/common/browserPermissions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, type IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import type { IBrowserViewModel } from '../common/browserView.js';

/** Permission prompts and device choices owned by one attached native page. */
export class BrowserViewPermissionHandler extends Disposable {
	private readonly permissions = this._register(new DisposableMap<string, IDisposable>());
	private readonly devices = this._register(new DisposableMap<string, IDevicePickerHandle>());
	private modelDisposed = false;

	constructor(
		private readonly model: IBrowserViewModel,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(model.onDidRequestPermission(event => {
			if (event.device) {
				this.requestDevice(event.origin, event.device);
			} else {
				void this.requestPermission(event.origin, event.category).catch(error => this.reportError(error));
			}
		}));
		const cancelRequests = () => {
			this.permissions.clearAndDisposeAll();
			// Retain cancelled identities until native acknowledgements drain queued updates.
			for (const picker of this.devices.values()) {
				picker.dispose();
			}
		};
		this._register(model.onWillNavigate(cancelRequests));
		this._register(model.onDidNavigate(cancelRequests));
		this._register(Event.once(model.onWillDispose)(() => {
			// Native teardown settles requests without a write to the retiring page.
			this.modelDisposed = true;
			this.dispose();
		}));
	}

	private requestDevice(origin: string, request: IBrowserViewDeviceRequest): void {
		const existing = this.devices.get(request.requestId);
		if (existing) {
			existing.update(request);
			return;
		}
		const picker = createDevicePicker(this.quickInputService, origin, request, deviceId => {
			void (this.modelDisposed ? Promise.resolve() : this.model.selectDevice(request.requestId, deviceId))
				.finally(() => {
					if (this.devices.get(request.requestId) === picker) {
						this.devices.deleteAndDispose(request.requestId);
					}
				})
				.catch(error => this.reportError(error));
		});
		this.devices.set(request.requestId, picker);
		picker.show();
	}

	private async requestPermission(origin: string, category: PermissionCategory): Promise<void> {
		const key = `${origin}\0${category}`;
		if (this.permissions.has(key)) {
			return;
		}
		const cancellation = new CancellationTokenSource();
		const token = cancellation.token;
		let settled = false;
		const pending = toDisposable(() => {
			cancellation.dispose(true);
			if (!settled && !this.modelDisposed) {
				settled = true;
				void this.model.setPermissions(origin, [{ category, state: null }]).catch(error => this.reportError(error));
			}
		});
		this.permissions.set(key, pending);
		const descriptor = PERMISSION_CATEGORY_DESCRIPTORS[category];
		try {
			const { result } = await this.dialogService.prompt<PermissionDecision>({
				type: Severity.Info,
				message: localize('browser.permissions.prompt', "{0} wants access to {1}", displayBrowserOrigin(origin), descriptor.label),
				detail: `\u2022 ${descriptor.description}`,
				custom: true,
				token,
				buttons: [
					{ label: localize('browser.permissions.allow', "Allow"), run: () => 'allow' },
					{ label: localize('browser.permissions.block', "Block"), run: () => 'deny' },
				],
				cancelButton: true,
			});
			if (token.isCancellationRequested) {
				return;
			}
			settled = true;
			await this.model.setPermissions(origin, [{ category, state: result ?? null }]);
		} finally {
			if (this.permissions.get(key) === pending) {
				this.permissions.deleteAndDispose(key);
			}
		}
	}

	private reportError(error: unknown): void {
		this.logService.error('Browser permission request failed.', error);
		if (!this.modelDisposed && !this._store.isDisposed) {
			this.notificationService.error(localize('browser.permissions.failed', "The browser permission request could not be completed."));
		}
	}
}

interface DevicePickItem extends IQuickPickItem {
	readonly deviceId: string;
}

interface IDevicePickerHandle extends IDisposable {
	show(): void;
	update(request: IBrowserViewDeviceRequest): void;
}

function deviceTypeLabel(deviceType: BrowserDeviceType): string {
	switch (deviceType) {
		case 'usb': return localize('browser.device.kind.usb', "a USB device");
		case 'serial': return localize('browser.device.kind.serial', "a serial port");
		case 'hid': return localize('browser.device.kind.hid', "an HID device");
		case 'bluetooth': return localize('browser.device.kind.bluetooth', "a Bluetooth device");
		default: assertNever(deviceType);
	}
}

function createDevicePicker(
	quickInputService: IQuickInputService,
	origin: string,
	request: IBrowserViewDeviceRequest,
	onSelect: (deviceId: string | null) => void,
): IDevicePickerHandle {
	const disposables = new DisposableStore();
	const picker = disposables.add(quickInputService.createQuickPick<DevicePickItem>());
	picker.title = localize('browser.device.title', "{0} wants to connect to {1}", displayBrowserOrigin(origin), deviceTypeLabel(request.deviceType));
	picker.placeholder = localize('browser.device.placeholder', "Select a device to connect to");
	picker.matchOnDescription = true;
	picker.ignoreFocusOut = true;
	picker.busy = true;

	let resolved = false;
	let finished = false;
	const finish = () => {
		if (finished) {
			return;
		}
		finished = true;
		disposables.dispose();
	};
	const resolve = (deviceId: string | null) => {
		if (resolved) {
			return;
		}
		resolved = true;
		onSelect(deviceId);
	};
	const setDevices = (devices: IBrowserViewDeviceRequest['devices']) => {
		const activeId = picker.activeItems[0]?.deviceId;
		const items: DevicePickItem[] = devices.map(device => ({ label: device.label, description: device.detail, deviceId: device.deviceId }));
		picker.items = items;
		if (activeId !== undefined) {
			const active = items.find(item => item.deviceId === activeId);
			if (active) {
				picker.activeItems = [active];
			}
		}
	};
	setDevices(request.devices);
	disposables.add(picker.onDidAccept(() => {
		const pick = picker.selectedItems[0];
		if (pick) {
			resolve(pick.deviceId);
			finish();
		}
	}));
	disposables.add(picker.onDidHide(() => {
		resolve(null);
		finish();
	}));
	return {
		show: () => picker.show(),
		update: next => {
			if (!finished) {
				setDevices(next.devices);
			}
		},
		dispose: () => {
			resolve(null);
			finish();
		},
	};
}

export function displayBrowserOrigin(origin: string): string {
	try {
		return new URL(origin).host || origin;
	} catch {
		return origin;
	}
}
