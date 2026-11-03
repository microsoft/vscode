/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatTip, IChatTipProvider, IChatTipService } from '../../../../workbench/contrib/chat/browser/chatTipService.js';
import { OPEN_AGENTS_WINDOW_COMMAND_ID } from '../../../../workbench/contrib/chat/common/constants.js';
import { selectSystemWideKeybindings } from '../../../../workbench/contrib/keybindings/electron-browser/systemWideKeybindings.js';
import { IKeybindingEditingService } from '../../../../workbench/services/keybinding/common/keybindingEditing.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';

export const ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID = 'sessions.action.enableOpenAgentsWindowSystemWideKeybinding';
export const OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING = 'ctrl+cmd+a';

const OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_ID = 'sessions.openAgentsWindowSystemWideKeybinding';
const OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_DISMISSED = 'sessions.openAgentsWindowSystemWideKeybindingTip.dismissed';

export class OpenAgentsWindowSystemWideKeybindingTip extends Disposable implements IChatTipProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _enabled: boolean;
	private _dismissed: boolean;
	private _enablement: Promise<void> | undefined;

	constructor(
		private readonly _supported: boolean,
		private readonly _chatTipService: IChatTipService,
		private readonly _keybindingService: IKeybindingService,
		private readonly _keybindingEditingService: IKeybindingEditingService,
		private readonly _storageService: IStorageService,
		private readonly _notificationService: INotificationService,
		private readonly _logService: ILogService,
	) {
		super();

		this._enabled = this._hasSystemWideKeybinding();
		this._dismissed = this._storageService.getBoolean(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_DISMISSED, StorageScope.APPLICATION, false);

		this._register(this._chatTipService.registerTipProvider(this));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => this._updateEnabled()));
		this._register(CommandsRegistry.registerCommand(ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID, () => this._enable()));
	}

	provideTip(): IChatTip | undefined {
		if (!this._supported || this._enabled || this._dismissed) {
			return undefined;
		}

		const keybindingLabel = this._keybindingService.resolveUserBinding(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING)[0]?.getLabel()
			?? localize('openAgentsWindowSystemWideKeybinding.label', "Ctrl+Cmd+A");
		const content = new MarkdownString('', {
			isTrusted: { enabledCommands: [ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID] },
		});
		content.appendMarkdown(localize('openAgentsWindowSystemWideKeybinding.tip', "**Tip:** Open the Agents window while VS Code is running with `{0}`, even when another app is active. ", keybindingLabel));
		content.appendLink(`command:${ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID}`, localize('openAgentsWindowSystemWideKeybinding.enable', "Enable"));

		return {
			id: OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_ID,
			content,
			enabledCommands: [ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID],
		};
	}

	dismissTip(tipId: string): void {
		if (tipId !== OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_ID) {
			return;
		}

		this._dismissed = true;
		this._storageService.store(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_DISMISSED, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._onDidChange.fire();
	}

	clearDismissedTips(): void {
		this._dismissed = false;
		this._storageService.remove(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_DISMISSED, StorageScope.APPLICATION);
		this._onDidChange.fire();
	}

	private _updateEnabled(): void {
		const enabled = this._hasSystemWideKeybinding();
		if (this._enabled === enabled) {
			return;
		}

		this._enabled = enabled;
		this._onDidChange.fire();
	}

	private _hasSystemWideKeybinding(): boolean {
		return selectSystemWideKeybindings(this._keybindingService.getKeybindings()).candidates
			.some(keybinding => keybinding.commandId === OPEN_AGENTS_WINDOW_COMMAND_ID);
	}

	private _enable(): Promise<void> {
		if (this._enabled) {
			return Promise.resolve();
		}
		if (!this._enablement) {
			this._enablement = this._doEnable().finally(() => this._enablement = undefined);
		}
		return this._enablement;
	}

	private async _doEnable(): Promise<void> {
		const resolvedKeybinding = this._keybindingService.resolveUserBinding(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING)[0];
		const accelerator = resolvedKeybinding?.getElectronAccelerator();
		if (!accelerator) {
			this._notificationService.error(localize('openAgentsWindowSystemWideKeybinding.unresolved', "Unable to enable the system-wide Agents window keybinding because the key combination could not be resolved."));
			return;
		}

		const existing = selectSystemWideKeybindings(this._keybindingService.getKeybindings()).candidates
			.find(keybinding => keybinding.accelerator === accelerator);
		if (existing) {
			if (existing.commandId === OPEN_AGENTS_WINDOW_COMMAND_ID) {
				this._updateEnabled();
				return;
			}

			const keybindingLabel = resolvedKeybinding.getLabel() ?? localize('openAgentsWindowSystemWideKeybinding.label', "Ctrl+Cmd+A");
			this._notificationService.error(localize('openAgentsWindowSystemWideKeybinding.conflict', "Unable to enable {0} because another system-wide keybinding already uses it.", keybindingLabel));
			return;
		}

		const keybinding = new ResolvedKeybindingItem(
			undefined,
			OPEN_AGENTS_WINDOW_COMMAND_ID,
			{ source: AgentsWindowOpenSource.KeyboardShortcut },
			undefined,
			false,
			null,
			false,
			true,
		);
		try {
			await this._keybindingEditingService.addKeybinding(keybinding, OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING, undefined);
		} catch (error) {
			this._logService.error('[OpenAgentsWindowSystemWideKeybindingTip] Failed to add the keybinding', error);
			this._notificationService.error(localize('openAgentsWindowSystemWideKeybinding.error', "Unable to enable the system-wide Agents window keybinding: {0}", getErrorMessage(error)));
			return;
		}

		this._enabled = true;
		this._chatTipService.hideTipsForSession();
		this._onDidChange.fire();
	}
}

class OpenAgentsWindowSystemWideKeybindingTipContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openAgentsWindowSystemWideKeybindingTip';

	constructor(
		@IChatTipService chatTipService: IChatTipService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IKeybindingEditingService keybindingEditingService: IKeybindingEditingService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@ILogService logService: ILogService,
	) {
		super();

		this._register(new OpenAgentsWindowSystemWideKeybindingTip(
			isMacintosh,
			chatTipService,
			keybindingService,
			keybindingEditingService,
			storageService,
			notificationService,
			logService,
		));
	}
}

registerWorkbenchContribution2(
	OpenAgentsWindowSystemWideKeybindingTipContribution.ID,
	OpenAgentsWindowSystemWideKeybindingTipContribution,
	WorkbenchPhase.BlockRestore,
);
