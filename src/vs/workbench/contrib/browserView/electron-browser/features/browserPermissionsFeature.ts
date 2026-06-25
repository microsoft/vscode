/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IBrowserViewDeviceRequest, BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import {
	ALL_PERMISSION_CATEGORIES,
	BrowserDeviceType,
	BrowserPermissionStore,
	PERMISSION_CATEGORY_DESCRIPTORS,
	PermissionCategory,
	PermissionDecision,
	PermissionState,
	toOriginKey,
} from '../../../../../platform/browserView/common/browserPermissions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import {
	BROWSER_EDITOR_ACTIVE,
	CONTEXT_BROWSER_HAS_URL,
	BrowserActionCategory,
	BrowserActionGroup,
	BrowserEditor,
	BrowserEditorContribution,
} from '../browserEditor.js';

/**
 * Surfaces per-origin permission prompts and a management picker for the active
 * browser view. Prompts are raised by the main process via
 * {@link IBrowserViewModel.onDidRequestPermission}; the user's choice -- and any
 * edits made in the management picker -- flow back through the single
 * {@link IBrowserViewModel.setPermissions} write API, which both persists the
 * decision and resolves the pending request in the main process.
 */
export class BrowserPermissionsFeature extends BrowserEditorContribution {

	private readonly _modelDisposables = this._register(new DisposableStore());

	private _model: IBrowserViewModel | undefined;
	private _permissions: BrowserPermissionStore | undefined;

	/** Open device choosers keyed by request id, so updates reach the right one. */
	private readonly _devicePickers = new Map<string, IDevicePickerHandle>();

	constructor(
		editor: BrowserEditor,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super(editor);
	}

	protected override onModelAttached(): void {
		this._modelDisposables.clear();
		this._model = this.editor.model!;
		this._permissions = this._model.permissions;
		this._modelDisposables.add(this._model.onDidRequestPermission(e => {
			if (e.device) {
				this._onDidRequestDevice(e.origin, e.device);
			} else {
				void this._onDidRequestPermission(e.origin, e.category);
			}
		}));
		// Close any open device choosers when the model goes away.
		this._modelDisposables.add(toDisposable(() => this._closeDevicePickers()));
	}

	override onModelDetached(): void {
		this._modelDisposables.clear();
		this._model = undefined;
		this._permissions = undefined;
	}

	private _closeDevicePickers(): void {
		for (const picker of [...this._devicePickers.values()]) {
			picker.dispose();
		}
		this._devicePickers.clear();
	}

	private _onDidRequestDevice(origin: string, request: IBrowserViewDeviceRequest): void {
		const existing = this._devicePickers.get(request.requestId);
		if (existing) {
			existing.update(request);
			return;
		}
		const model = this._model;
		if (!model) {
			return;
		}
		const handle = showDevicePicker(this._quickInputService, model, origin, request, () => this._devicePickers.delete(request.requestId));
		this._devicePickers.set(request.requestId, handle);
	}

	private async _onDidRequestPermission(origin: string, category: PermissionCategory): Promise<void> {
		const model = this._model;
		if (!model) {
			return;
		}
		const descriptor = PERMISSION_CATEGORY_DESCRIPTORS[category];
		const { result } = await this._dialogService.prompt<PermissionDecision>({
			type: Severity.Info,
			message: localize('browser.permissions.prompt', "{0} wants access to {1}", displayOrigin(origin), descriptor.label),
			detail: `• ${descriptor.description}`,
			buttons: [
				{
					label: localize('browser.permissions.allow', "Allow"),
					run: () => 'allow',
				},
				{
					label: localize('browser.permissions.block', "Block"),
					run: () => 'deny',
				},
			],
			// Dismissing leaves the request undecided. The main process settles
			// the page's request on navigation / teardown (or a timeout), so a
			// late answer here is harmless.
			cancelButton: true,
		});
		if (result === 'allow' || result === 'deny') {
			model.setPermissions(origin, [{ category, state: result }]);
		}
	}

	showManagementPicker(): void {
		const model = this._model;
		const permissions = this._permissions;
		if (!model || !permissions) {
			return;
		}
		const origin = toOriginKey(model.url);
		if (!origin) {
			this._notificationService.info(localize('browser.permissions.noOrigin', "Permissions can only be managed for web pages."));
			return;
		}
		showPermissionsPicker(this._quickInputService, model, permissions, origin);
	}
}

BrowserEditor.registerContribution(BrowserPermissionsFeature);

// -- Device chooser --------------------------------------------------

interface DevicePickItem extends IQuickPickItem {
	readonly deviceId: string;
}

/** Handle to a live device chooser so it can be updated or force-closed. */
interface IDevicePickerHandle {
	/** Apply an updated device list. */
	update(request: IBrowserViewDeviceRequest): void;
	/** Force-close the chooser, cancelling the request if still pending. */
	dispose(): void;
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

/**
 * Show a live-updating chooser for a hardware-device request. The list refreshes
 * as devices are discovered (re-fired with the same request id); accepting picks
 * a device and dismissing cancels the request. Exactly one of select/cancel is
 * reported back to the model.
 */
function showDevicePicker(quickInputService: IQuickInputService, model: IBrowserViewModel, origin: string, request: IBrowserViewDeviceRequest, onDone: () => void): IDevicePickerHandle {
	const disposables = new DisposableStore();
	const picker = disposables.add(quickInputService.createQuickPick<DevicePickItem>());
	picker.title = localize('browser.device.title', "{0} wants to connect to {1}", displayOrigin(origin), deviceTypeLabel(request.deviceType));
	picker.placeholder = localize('browser.device.placeholder', "Select a device to connect to");
	picker.matchOnDescription = true;
	picker.ignoreFocusOut = true;
	// Still scanning: the list may keep growing until the user picks or cancels.
	picker.busy = true;

	let resolved = false;
	let finished = false;

	const finish = () => {
		if (finished) {
			return;
		}
		finished = true;
		disposables.dispose();
		onDone();
	};

	// Report a single decision to the model: a chosen id, or null to cancel.
	const resolve = (deviceId: string | null) => {
		if (resolved) {
			return;
		}
		resolved = true;
		void model.selectDevice(request.requestId, deviceId);
	};

	const setDevices = (devices: readonly { deviceId: string; label: string; detail?: string }[]) => {
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
		if (!pick) {
			return;
		}
		resolve(pick.deviceId);
		finish();
	}));

	disposables.add(picker.onDidHide(() => {
		// Dismissed without a pick cancels the request.
		resolve(null);
		finish();
	}));

	picker.show();

	return {
		update: (next: IBrowserViewDeviceRequest) => {
			setDevices(next.devices);
		},
		dispose: () => {
			resolve(null);
			finish();
		},
	};
}

// -- Management picker -----------------------------------------------

interface PermissionPickItem extends IQuickPickItem {
	readonly category: PermissionCategory;
}

/** Discriminates the per-row action buttons so the handler can react. */
interface PermissionItemButton extends IQuickInputButton {
	readonly kind: 'allow' | 'deny' | 'reset';
}

function showPermissionsPicker(quickInputService: IQuickInputService, model: IBrowserViewModel, permissions: BrowserPermissionStore, origin: string): void {
	const disposables = new DisposableStore();
	const picker = disposables.add(quickInputService.createQuickPick<PermissionPickItem>());
	picker.title = localize('browser.permissions.title', "Permissions for {0}", displayOrigin(origin));
	picker.placeholder = localize('browser.permissions.placeholder', "Filter permissions");
	picker.sortByLabel = false;
	picker.ignoreFocusOut = true;

	// Pending, unsaved decision changes keyed by category. A value maps to the
	// desired decision (`null` clears it); absence means no change from the
	// stored value. Edits are committed only when the user saves.
	const edits = new Map<PermissionCategory, PermissionDecision | null>();

	// The stored decision for a category, or `undefined` when none is recorded.
	const storedDecision = (category: PermissionCategory): PermissionDecision | null => {
		return permissions.getDecision(origin, category) ?? null;
	};

	// The pending decision for a category: the edit if any, else the stored value.
	const pendingDecision = (category: PermissionCategory): PermissionDecision | null =>
		edits.has(category) ? edits.get(category)! : storedDecision(category);

	const setPendingDecision = (category: PermissionCategory, decision: PermissionDecision | null): void => {
		if (decision === storedDecision(category)) {
			edits.delete(category); // back to stored value: no pending change
		} else {
			edits.set(category, decision);
		}
		rebuild();
	};

	const rebuild = (): void => {
		// Preserve the focused row across rebuilds (item identity changes because
		// we recreate the items each time).
		const activeCategory = picker.activeItems[0]?.category;
		const items = buildItems();
		picker.items = items;
		if (activeCategory !== undefined) {
			const active = items.find(item => item.category === activeCategory);
			if (active) {
				picker.activeItems = [active];
			}
		}
		picker.customButton = edits.size > 0;
		picker.customLabel = edits.size === 1
			? localize('browser.permissions.saveOne', "Save 1 Change")
			: localize('browser.permissions.saveMany', "Save {0} Changes", edits.size);
	};

	rebuild();

	disposables.add(picker.onDidTriggerItemButton(({ button, item }) => {
		const { kind } = button as PermissionItemButton;
		if (kind === 'allow') {
			setPendingDecision(item.category, 'allow');
		} else if (kind === 'deny') {
			setPendingDecision(item.category, 'deny');
		} else {
			// The current-value toggle resets back to the default when active; it
			// is inert (no override to clear) when already showing the default.
			setPendingDecision(item.category, null);
		}
	}));

	// Commit all pending edits in one write, then close.
	disposables.add(picker.onDidCustom(() => {
		if (edits.size === 0) {
			return;
		}
		const grants = [...edits].map(([category, state]) => ({ category, state }));
		void model.setPermissions(origin, grants);
		picker.hide();
	}));

	// Re-render when the store changes underneath us (e.g. a prompt answered
	// elsewhere); pending edits are preserved and still take precedence.
	disposables.add(permissions.onDidChange(rebuild));

	disposables.add(picker.onDidHide(() => disposables.dispose()));
	picker.show();

	function buildItems(): PermissionPickItem[] {
		return ALL_PERMISSION_CATEGORIES.map(buildItem);
	}

	function buildItem(category: PermissionCategory): PermissionPickItem {
		const descriptor = PERMISSION_CATEGORY_DESCRIPTORS[category];
		const override = pendingDecision(category);
		const hasOverride = !!override;
		// The effective state shown under the name is the (pending) override when
		// set, otherwise the category default.
		const effective: PermissionState = hasOverride ? override : permissions.defaultStateFor(category);
		const stateLabel = effective === 'allow'
			? localize('browser.permissions.state.allowed', "Allowed")
			: effective === 'deny'
				? localize('browser.permissions.state.blocked', "Blocked")
				: localize('browser.permissions.state.ask', "Ask");
		const description = hasOverride
			? stateLabel
			: localize('browser.permissions.state.default', "{0} (default)", stateLabel);

		const buttons: PermissionItemButton[] = [];
		if (effective !== 'allow') {
			buttons.push({
				kind: 'allow',
				iconClass: ThemeIcon.asClassName(Codicon.check),
				tooltip: localize('browser.permissions.allow', "Allow"),
			});
		}
		if (effective !== 'deny') {
			buttons.push({
				kind: 'deny',
				iconClass: ThemeIcon.asClassName(Codicon.circleSlash),
				tooltip: localize('browser.permissions.block', "Block"),
			});
		}
		if (effective !== 'ask') {
			buttons.push({
				kind: hasOverride ? 'reset' : effective === 'allow' ? 'allow' : 'deny',
				iconClass: ThemeIcon.asClassName(effective === 'allow' ? Codicon.check : Codicon.circleSlash),
				alwaysVisible: true,
				toggle: { checked: hasOverride },
				tooltip: description
			});
		}

		return {
			category,
			label: descriptor.label,
			detail: descriptor.description,
			iconClass: ThemeIcon.asClassName(descriptor.icon),
			buttons,
		};
	}
}

function displayOrigin(origin: string): string {
	try {
		return new URL(origin).host || origin;
	} catch {
		return origin;
	}
}

// -- Actions ----------------------------------------------------------

class ManageBrowserPermissionsAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ManagePermissions;

	constructor() {
		const when = ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL);
		super({
			id: ManageBrowserPermissionsAction.ID,
			title: localize2('browser.managePermissions', 'Site Permissions'),
			category: BrowserActionCategory,
			icon: Codicon.shield,
			f1: true,
			precondition: when,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Data,
				order: 10,
				when,
				isHiddenByDefault: true,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (browserEditor instanceof BrowserEditor) {
			browserEditor.getContribution(BrowserPermissionsFeature)?.showManagementPicker();
		}
	}
}

registerAction2(ManageBrowserPermissionsAction);
