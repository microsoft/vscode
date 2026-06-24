/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import {
	ALL_PERMISSION_CATEGORIES,
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
		this._modelDisposables.add(this._model.onDidRequestPermission(e => { void this._onDidRequestPermission(e.origin, e.category); }));
	}

	override onModelDetached(): void {
		this._modelDisposables.clear();
		this._model = undefined;
		this._permissions = undefined;
	}

	private async _onDidRequestPermission(origin: string, category: PermissionCategory): Promise<void> {
		const model = this._model;
		if (!model) {
			return;
		}
		const descriptor = PERMISSION_CATEGORY_DESCRIPTORS[category];
		const { result } = await this._dialogService.prompt<PermissionDecision>({
			type: Severity.Info,
			message: localize('browser.permissions.prompt', "{0} wants to use {1}", displayOrigin(origin), descriptor.label),
			detail: descriptor.description,
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
			// Dismissing leaves the request undecided; the main process times out
			// after 30s with a non-persisted deny.
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
			title: localize2('browser.managePermissions', 'Manage Permissions'),
			category: BrowserActionCategory,
			icon: Codicon.shield,
			f1: true,
			precondition: when,
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Data,
				order: 2,
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
