/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { webContents as electronWebContents } from 'electron';
import { localize } from '../../../nls.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { StorageScope, StorageTarget } from '../../storage/common/storage.js';
import {
	BrowserDeviceType,
	BrowserPermissionStore,
	IBrowserDeviceCandidate,
	IPermissionCategoryState,
	ISerializedBrowserPermissionsSnapshot,
	PermissionCategory,
	electronPermissionToCategories,
	isAlwaysAllowedPermission,
	toOriginKey,
} from '../common/browserPermissions.js';
import { BrowserViewStorageScope, IBrowserViewPermissionRequestEvent, IBrowserViewStorageKeys } from '../common/browserView.js';
import type { BrowserSession } from './browserSession.js';

/** Time the main process waits for a prompt answer before a non-persisted deny. */
const PROMPT_TIMEOUT_MS = 30_000;

/**
 * Fired when a permission request for an undecided category needs UI. The view
 * that owns {@link webContents} should {@link claim} it and surface a prompt;
 * if no listener claims it, the request is left undecided (effective deny).
 */
export interface IBrowserSessionPermissionRequest {
	/** The top-level web contents the request originates from. */
	readonly webContents: Electron.WebContents;
	/** The origin + category being requested. */
	readonly request: IBrowserViewPermissionRequestEvent;
	/** Called by the owning view to take responsibility for prompting. */
	claim(): void;
}

/**
 * Fired when a hardware-device chooser ({@link PermissionCategory.Devices}) needs
 * UI, and re-fired as the available device list changes. The owning view
 * {@link claim}s it and surfaces a picker; the user's pick is reported back via
 * {@link IBrowserSessionPermissions.resolveDevice}. If the originating
 * webContents is destroyed or the session is disposed, the page promise is
 * settled and the pending request is removed; a late
 * {@link IBrowserSessionPermissions.resolveDevice} call is then a no-op. Any
 * open picker on the workbench side is left open until the user dismisses it.
 */
export interface IBrowserSessionDeviceRequest {
	/** The top-level web contents the request originates from. */
	readonly webContents: Electron.WebContents;
	/** The origin requesting a device. */
	readonly origin: string;
	/** Stable id correlating the initial request with its updates. */
	readonly requestId: string;
	/** Which native chooser flow this is. */
	readonly deviceType: BrowserDeviceType;
	/** The devices currently available to choose from. */
	readonly devices: IBrowserDeviceCandidate[];
	/** Called by the owning view to take responsibility for the chooser UI. */
	claim(): void;
}

/** Internal record of an in-flight device chooser awaiting the user's pick. */
interface IPendingDeviceRequest {
	readonly requestId: string;
	readonly webContents: Electron.WebContents;
	readonly origin: string;
	readonly deviceType: BrowserDeviceType;
	devices: IBrowserDeviceCandidate[];
	settled: boolean;
	/** Type-specific adapter that calls the native Electron callback. */
	invoke: (deviceId: string | null) => void;
	/** Resolve the chooser with a device id, or `null` to cancel. */
	settle(deviceId: string | null): void;
}


export interface IBrowserSessionPermissions {
	readonly storageKeys: IBrowserViewStorageKeys;
	/**
	 * Fires when an undecided permission needs UI. Each browser view listens and
	 * claims the requests targeting its own web contents.
	 */
	readonly onDidRequestPermission: Event<IBrowserSessionPermissionRequest>;
	/** Fires when a hardware-device chooser needs UI, and again as its device list changes. */
	readonly onDidRequestDevice: Event<IBrowserSessionDeviceRequest>;
	readonly onDidChange: Event<void>;
	/** Current snapshot of all recorded decisions, mirrored to the workbench. */
	serialize(): ISerializedBrowserPermissionsSnapshot;
	/** Record permission decisions for an origin and persist immediately. */
	set(origin: string, grants: readonly IPermissionCategoryState[]): void;
	/** Clear all recorded permission state for this session. */
	clear(): void;
	/** Funnel a per-webContents Bluetooth chooser into the unified device flow. */
	beginBluetoothRequest(webContents: Electron.WebContents, devices: Electron.BluetoothDevice[], callback: (deviceId: string) => void): void;
	/** Answer a device chooser with the chosen id, or `null` to cancel. */
	resolveDevice(requestId: string, deviceId: string | null): void;
}

interface IPendingRequest {
	readonly origin: string;
	readonly category: PermissionCategory;
	readonly deferred: DeferredPromise<void>;
}

/**
 * Per-{@link BrowserSession} permission state. Owns the authoritative
 * {@link BrowserPermissionStore}, installs the Electron permission handlers that
 * consult it, and brokers prompts for categories that have no recorded decision.
 *
 * Every change to the store is flushed to application storage immediately so
 * decisions survive a crash right after they are made.
 */
export class BrowserSessionPermissions extends Disposable implements IBrowserSessionPermissions {

	private readonly _permissionStore = this._register(new BrowserPermissionStore());

	/** Fires on any change to the store (set, clear, hydrate). */
	readonly onDidChange: Event<void> = this._permissionStore.onDidChange;

	private _storage: IApplicationStorageMainService | undefined;
	private _persistable = false;

	/** While set, store changes are coalesced into a single deferred flush. */
	private _batching = false;
	private _batchDirty = false;

	private readonly _onDidRequestPermission = this._register(new Emitter<IBrowserSessionPermissionRequest>());
	readonly onDidRequestPermission = this._onDidRequestPermission.event;

	private readonly _onDidRequestDevice = this._register(new Emitter<IBrowserSessionDeviceRequest>());
	readonly onDidRequestDevice = this._onDidRequestDevice.event;

	private readonly _pending = new Set<IPendingRequest>();
	private readonly _pendingDevices = new Map<string, IPendingDeviceRequest>();

	readonly storageKeys: IBrowserViewStorageKeys;

	constructor(session: BrowserSession) {
		super();

		this.storageKeys = session.storageScope === BrowserViewStorageScope.Ephemeral
			? {}
			: { permissions: `browser.permissions.${session.id}` };

		this._register(this._permissionStore.onDidChange(() => {
			this._resolvePending();
			// During a batched `set()` defer the write so several category
			// changes collapse into a single storage flush.
			if (this._batching) {
				this._batchDirty = true;
				return;
			}
			if (this._persistable) {
				this._flushNow();
			}
		}));

		this._register(toDisposable(() => {
			for (const pending of this._pending) {
				pending.deferred.complete();
			}
			this._pending.clear();
			// Cancel any in-flight device choosers so pages aren't left hanging.
			for (const device of [...this._pendingDevices.values()]) {
				device.settle(null);
			}
		}));
	}

	/**
	 * Install the permission request / check / device handlers on the session.
	 * Backed entirely by {@link BrowserPermissionStore}; unrecorded categories
	 * are brokered to the owning browser view via {@link onDidRequestPermission}.
	 */
	configure(electronSession: Electron.Session): void {
		electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
			this._resolveRequest(webContents, permission, details).then(callback, () => callback(false));
		});
		electronSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
			if (isAlwaysAllowedPermission(permission)) {
				return true;
			}
			// Prefer the full requesting URL so file: documents key off their
			// path; `requestingUrl` is absent for cross-origin subframes, in
			// which case Electron only gives us the bare origin.
			const origin = toOriginKey(details.requestingUrl || requestingOrigin);
			const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
			if (categories.length === 0) {
				return false;
			}
			// Synchronous gate used by Blink pre-checks and `permissions.query`.
			// Categories with no recorded decision fall back to their
			// `defaultState` (e.g. Location / Camera are deny-by-default until
			// granted, while others may allow by default).
			return categories.every(category => this._permissionStore.isAllowed(origin, category));
		});

		// Hardware-device choosers. USB / Serial / HID are gated by the handlers
		// above (a `Devices` deny makes the check fail, so Chromium never fires
		// these). We still re-check here, drive selection through the unified
		// device-request flow, and listen for hot-plug add/remove events so an
		// open picker stays in sync. Bluetooth is gated and funneled separately
		// from the owning view (it is a per-webContents event).
		electronSession.on('select-usb-device', (event, details, callback) => {
			event.preventDefault();
			const target = this._frameTarget(details.frame);
			if (!target || !this._deviceAllowed(target.origin)) {
				callback();
				return;
			}
			this._beginDeviceRequest({
				webContents: target.webContents,
				origin: target.origin,
				deviceType: 'usb',
				devices: details.deviceList.map(usbCandidate),
				invoke: deviceId => deviceId === null ? callback() : callback(deviceId),
			});
		});
		electronSession.on('usb-device-added', (_event, device, webContents) => {
			this._addDevice(webContents, 'usb', usbCandidate(device));
		});
		electronSession.on('usb-device-removed', (_event, device, webContents) => {
			this._removeDevice(webContents, 'usb', device.deviceId);
		});

		electronSession.on('select-serial-port', (event, portList, webContents, callback) => {
			event.preventDefault();
			const origin = toOriginKey(webContents.getURL());
			if (!this._deviceAllowed(origin)) {
				callback('');
				return;
			}
			this._beginDeviceRequest({
				webContents,
				origin,
				deviceType: 'serial',
				devices: portList.map(serialCandidate),
				invoke: deviceId => callback(deviceId ?? ''),
			});
		});
		electronSession.on('serial-port-added', (_event, port, webContents) => {
			this._addDevice(webContents, 'serial', serialCandidate(port));
		});
		electronSession.on('serial-port-removed', (_event, port, webContents) => {
			this._removeDevice(webContents, 'serial', port.portId);
		});

		electronSession.on('select-hid-device', (event, details, callback) => {
			event.preventDefault();
			const target = this._frameTarget(details.frame);
			if (!target || !this._deviceAllowed(target.origin)) {
				callback(null);
				return;
			}
			this._beginDeviceRequest({
				webContents: target.webContents,
				origin: target.origin,
				deviceType: 'hid',
				devices: details.deviceList.map(hidCandidate),
				invoke: deviceId => callback(deviceId ?? null),
			});
		});
		electronSession.on('hid-device-added', (_event, details) => {
			const target = this._frameTarget(details.frame);
			if (target) {
				this._addDevice(target.webContents, 'hid', hidCandidate(details.device));
			}
		});
		electronSession.on('hid-device-removed', (_event, details) => {
			const target = this._frameTarget(details.frame);
			if (target) {
				this._removeDevice(target.webContents, 'hid', details.device.deviceId);
			}
		});
	}

	connectStorage(storage: IApplicationStorageMainService): void {
		if (this._storage || !this.storageKeys.permissions) {
			return;
		}
		this._storage = storage;
		this._load();
		this._persistable = true;
	}

	serialize(): ISerializedBrowserPermissionsSnapshot {
		return this._permissionStore.serialize();
	}

	set(origin: string, grants: readonly IPermissionCategoryState[]): void {
		const key = toOriginKey(origin);
		for (const grant of grants) {
			if (grant.state === null) {
				this._resolvePendingForCategory(key, grant.category);
			}
		}

		// Coalesce the per-category onDidChange flushes into a single write for
		// the whole batch so persisting from the management UI isn't N writes.
		this._batching = true;
		this._batchDirty = false;
		try {
			this._permissionStore.setMany(origin, grants);
		} finally {
			this._batching = false;
		}
		if (this._batchDirty && this._persistable) {
			this._flushNow();
		}
	}

	private _resolvePendingForCategory(origin: string, category: PermissionCategory): void {
		if (!origin || this._pending.size === 0) {
			return;
		}
		for (const pending of [...this._pending]) {
			if (pending.origin === origin && pending.category === category) {
				pending.deferred.complete();
			}
		}
	}

	clear(): void {
		this._permissionStore.clear();
	}

	// -- Device choosers -------------------------------------------------

	beginBluetoothRequest(webContents: Electron.WebContents, devices: Electron.BluetoothDevice[], callback: (deviceId: string) => void): void {
		const origin = toOriginKey(webContents.getURL());
		if (!this._deviceAllowed(origin)) {
			callback('');
			return;
		}
		const candidates = devices.map(bluetoothCandidate);
		// Electron re-fires `select-bluetooth-device` for the same chooser as
		// devices are discovered, each time with a fresh callback. Fold those
		// into the existing request: refresh its list and supersede the callback.
		const existing = this._findActiveDevice(webContents, 'bluetooth');
		if (existing) {
			existing.devices = candidates;
			existing.invoke = deviceId => callback(deviceId ?? '');
			this._emitDeviceRequest(existing);
			return;
		}
		this._beginDeviceRequest({
			webContents,
			origin,
			deviceType: 'bluetooth',
			devices: candidates,
			invoke: deviceId => callback(deviceId ?? ''),
		});
	}

	resolveDevice(requestId: string, deviceId: string | null): void {
		this._pendingDevices.get(requestId)?.settle(deviceId);
	}

	/** Begin a device chooser: register it, emit it, and cancel if unclaimed. */
	private _beginDeviceRequest(params: {
		readonly webContents: Electron.WebContents;
		readonly origin: string;
		readonly deviceType: BrowserDeviceType;
		readonly devices: IBrowserDeviceCandidate[];
		readonly invoke: (deviceId: string | null) => void;
	}): void {
		const requestId = generateUuid();
		const settle = (deviceId: string | null) => {
			if (pending.settled) {
				return;
			}
			pending.settled = true;
			params.webContents.off('destroyed', cancel);
			this._pendingDevices.delete(requestId);
			pending.invoke(deviceId);
		};
		const cancel = () => settle(null);
		const pending: IPendingDeviceRequest = {
			requestId,
			webContents: params.webContents,
			origin: params.origin,
			deviceType: params.deviceType,
			devices: params.devices,
			settled: false,
			invoke: params.invoke,
			settle,
		};
		params.webContents.on('destroyed', cancel);
		this._pendingDevices.set(requestId, pending);
		if (!this._emitDeviceRequest(pending)) {
			// No view claimed it (e.g. background or destroyed view): cancel so
			// the page's requestDevice() promise rejects rather than hangs.
			cancel();
		}
	}

	private _emitDeviceRequest(pending: IPendingDeviceRequest): boolean {
		let claimed = false;
		this._onDidRequestDevice.fire({
			webContents: pending.webContents,
			origin: pending.origin,
			requestId: pending.requestId,
			deviceType: pending.deviceType,
			devices: pending.devices,
			claim: () => { claimed = true; },
		});
		return claimed;
	}

	private _addDevice(webContents: Electron.WebContents, deviceType: BrowserDeviceType, candidate: IBrowserDeviceCandidate): void {
		const pending = this._findActiveDevice(webContents, deviceType);
		if (!pending || pending.devices.some(device => device.deviceId === candidate.deviceId)) {
			return;
		}
		pending.devices = [...pending.devices, candidate];
		this._emitDeviceRequest(pending);
	}

	private _removeDevice(webContents: Electron.WebContents, deviceType: BrowserDeviceType, deviceId: string): void {
		const pending = this._findActiveDevice(webContents, deviceType);
		if (!pending) {
			return;
		}
		const next = pending.devices.filter(device => device.deviceId !== deviceId);
		if (next.length === pending.devices.length) {
			return;
		}
		pending.devices = next;
		this._emitDeviceRequest(pending);
	}

	private _findActiveDevice(webContents: Electron.WebContents, deviceType: BrowserDeviceType): IPendingDeviceRequest | undefined {
		for (const pending of this._pendingDevices.values()) {
			if (!pending.settled && pending.webContents === webContents && pending.deviceType === deviceType) {
				return pending;
			}
		}
		return undefined;
	}

	/** Resolve the owning web contents and origin for a requesting frame. */
	private _frameTarget(frame: Electron.WebFrameMain | null): { webContents: Electron.WebContents; origin: string } | undefined {
		if (!frame) {
			return undefined;
		}
		const webContents = electronWebContents.fromFrame(frame);
		if (!webContents) {
			return undefined;
		}
		return { webContents, origin: toOriginKey(frame.url || webContents.getURL()) };
	}

	private _deviceAllowed(origin: string): boolean {
		return !!origin && this._permissionStore.isAllowed(origin, PermissionCategory.Devices);
	}

	private async _resolveRequest(webContents: Electron.WebContents | null, permission: string, details: PermissionRequestDetails | undefined): Promise<boolean> {
		if (isAlwaysAllowedPermission(permission)) {
			return true;
		}
		const origin = toOriginKey(details?.requestingUrl ?? webContents?.getURL());
		const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
		if (categories.length === 0 || !origin) {
			return false;
		}

		// Fast paths that need no prompt. A category whose effective decision is
		// already 'allow' -- either an explicit user grant or an allow-by-default
		// category -- is granted silently. This keeps the async request handler
		// consistent with the synchronous check handler (both use `isAllowed`).
		// An explicit 'deny' short-circuits without prompting.
		if (categories.every(category => this._permissionStore.isAllowed(origin, category))) {
			return true;
		}
		if (categories.some(category => this._permissionStore.getDecision(origin, category) === 'deny')) {
			return false;
		}

		// At least one category is undecided: prompt for each undecided one. Do
		// this sequentially so we never surface two modal prompts at once (e.g.
		// a single `media` request maps to both Camera and Microphone).
		for (const category of categories) {
			if (!this._permissionStore.getDecision(origin, category)) {
				await this._prompt(webContents, origin, category);
			}
		}

		return categories.every(category => this._permissionStore.isAllowed(origin, category));
	}

	private _prompt(webContents: Electron.WebContents | null, origin: string, category: PermissionCategory): Promise<void> {
		if (!webContents) {
			// No view to ask -- leave undecided (effective deny by default state).
			return Promise.resolve();
		}
		// Fire synchronously: the owning view claims the request before fire()
		// returns, so we know whether any UI will surface a prompt.
		let claimed = false;
		this._onDidRequestPermission.fire({
			webContents,
			request: { origin, category },
			claim: () => { claimed = true; },
		});
		if (!claimed) {
			return Promise.resolve();
		}

		const pending: IPendingRequest = { origin, category, deferred: new DeferredPromise<void>() };
		this._pending.add(pending);

		const timer = setTimeout(() => pending.deferred.complete(), PROMPT_TIMEOUT_MS);
		return pending.deferred.p.finally(() => {
			clearTimeout(timer);
			this._pending.delete(pending);
		});
	}

	/** Resolve any pending request whose (origin, category) now has a decision. */
	private _resolvePending(): void {
		if (this._pending.size === 0) {
			return;
		}
		for (const pending of [...this._pending]) {
			if (this._permissionStore.getDecision(pending.origin, pending.category)) {
				pending.deferred.complete();
			}
		}
	}

	private _load(): void {
		const storage = this._storage;
		const key = this.storageKeys.permissions;
		if (!storage || !key) {
			return;
		}
		const snapshot = parseSnapshot<ISerializedBrowserPermissionsSnapshot>(storage.get(key, StorageScope.APPLICATION));
		// Hydration fires onDidChange; suppress flushes so we don't rewrite what we just read.
		this._persistable = false;
		try {
			this._permissionStore.hydrate(snapshot);
		} finally {
			this._persistable = true;
		}
	}

	private _flushNow(): void {
		const storage = this._storage;
		const key = this.storageKeys.permissions;
		if (!storage || !key) {
			return;
		}
		const snapshot = this._permissionStore.serialize();
		if (Object.keys(snapshot.origins).length === 0) {
			storage.remove(key, StorageScope.APPLICATION);
		} else {
			storage.store(key, JSON.stringify(snapshot), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}
}

function parseSnapshot<T>(raw: string | undefined): T | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw) as T;
		if (!parsed || typeof parsed !== 'object') {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

/**
 * The Electron details union passed to `setPermissionRequestHandler`. All
 * variants extend `PermissionRequest` (so share `requestingUrl`); only
 * `MediaAccessPermissionRequest` adds `mediaTypes`.
 */
type PermissionRequestDetails =
	| Electron.PermissionRequest
	| Electron.FilesystemPermissionRequest
	| Electron.MediaAccessPermissionRequest
	| Electron.OpenExternalPermissionRequest;

/**
 * Normalize the media hint from either permission handler's Electron details
 * into a `('video' | 'audio')[]`. The request handler supplies `mediaTypes`
 * (an array); the check handler supplies a single `mediaType`. Returns
 * `undefined` when there is no usable hint, so the mapper can assume both.
 */
function mediaKindsFromDetails(details: PermissionRequestDetails | Electron.PermissionCheckHandlerHandlerDetails | undefined): ('video' | 'audio')[] | undefined {
	if (!details) {
		return undefined;
	}
	const kinds = new Set<'video' | 'audio'>();
	// eslint-disable-next-line local/code-no-in-operator
	if ('mediaTypes' in details && details.mediaTypes) {
		for (const kind of details.mediaTypes) {
			kinds.add(kind);
		}
	}
	// eslint-disable-next-line local/code-no-in-operator
	if ('mediaType' in details && (details.mediaType === 'video' || details.mediaType === 'audio')) {
		kinds.add(details.mediaType);
	}
	return kinds.size ? [...kinds] : undefined;
}

/** Format a USB/HID vendor:product pair as a `vvvv:pppp` hex string. */
function vendorProductHex(vendorId: number | undefined, productId: number | undefined): string {
	const hex = (value: number | undefined) => (value ?? 0).toString(16).padStart(4, '0');
	return `${hex(vendorId)}:${hex(productId)}`;
}

function usbCandidate(device: Electron.USBDevice): IBrowserDeviceCandidate {
	const ids = vendorProductHex(device.vendorId, device.productId);
	return {
		deviceId: device.deviceId,
		label: device.productName || device.manufacturerName || localize('browser.device.usb', "USB Device {0}", ids),
		detail: device.serialNumber ? `${ids} · ${device.serialNumber}` : ids,
	};
}

function serialCandidate(port: Electron.SerialPort): IBrowserDeviceCandidate {
	const ids = port.vendorId && port.productId ? `${port.vendorId}:${port.productId}` : undefined;
	return {
		deviceId: port.portId,
		label: `${port.portName} (${port.displayName})`,
		detail: ids,
	};
}

function hidCandidate(device: Electron.HIDDevice): IBrowserDeviceCandidate {
	const ids = vendorProductHex(device.vendorId, device.productId);
	return {
		deviceId: device.deviceId,
		label: device.name || localize('browser.device.hid', "HID Device {0}", ids),
		detail: device.serialNumber ? `${ids} · ${device.serialNumber}` : ids,
	};
}

function bluetoothCandidate(device: Electron.BluetoothDevice): IBrowserDeviceCandidate {
	return {
		deviceId: device.deviceId,
		label: device.deviceName || device.deviceId,
		detail: device.deviceId,
	};
}
