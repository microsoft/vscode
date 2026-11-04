/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
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
import { ISystemWideKeybindingCandidate, selectSystemWideKeybindings } from '../../../../workbench/contrib/keybindings/electron-browser/systemWideKeybindings.js';
import { IKeybindingEditingService } from '../../../../workbench/services/keybinding/common/keybindingEditing.js';
import { createKeybindingCommandQuery } from '../../../../workbench/services/preferences/browser/keybindingsEditorModel.js';
import { AgentsWindowOpenSource } from '../../../../platform/window/common/window.js';

export const ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID = 'sessions.action.enableOpenAgentsWindowSystemWideKeybinding';
export const OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING = 'ctrl+cmd+a';

const OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_ID = 'sessions.openAgentsWindowSystemWideKeybinding';
const OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_DISMISSED = 'sessions.openAgentsWindowSystemWideKeybindingTip.dismissed';
const OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID = 'workbench.action.openGlobalKeybindings';

export class OpenAgentsWindowSystemWideKeybindingTip extends Disposable implements IChatTipProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _enabled: boolean;
	private _enabledKeybindingLabel: string | undefined;
	private _dismissed: boolean;
	private _showEnabledConfirmation = false;
	private _sessionGeneration = 0;
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

		const enabledKeybinding = this._getOpenAgentsWindowSystemWideKeybinding();
		this._enabled = !!enabledKeybinding;
		this._enabledKeybindingLabel = this._getKeybindingLabel(enabledKeybinding);
		this._dismissed = this._storageService.getBoolean(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_DISMISSED, StorageScope.APPLICATION, false);

		this._register(this._chatTipService.registerTipProvider(this));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => this._updateEnabled()));
		this._register(CommandsRegistry.registerCommand(ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID, () => this._enable()));
	}

	provideTip(): IChatTip | undefined {
		if (!this._supported || this._dismissed) {
			return undefined;
		}

		const defaultKeybindingLabel = this._keybindingService.resolveUserBinding(OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING)[0]?.getLabel()
			?? localize('openAgentsWindowSystemWideKeybinding.label', "Ctrl+Cmd+A");
		if (this._enabled) {
			if (!this._showEnabledConfirmation) {
				return undefined;
			}

			const keybindingLabel = this._enabledKeybindingLabel ?? defaultKeybindingLabel;
			const commandArgs = encodeURIComponent(JSON.stringify([createKeybindingCommandQuery(OPEN_AGENTS_WINDOW_COMMAND_ID)]));
			const content = new MarkdownString('', {
				isTrusted: { enabledCommands: [OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID] },
			});
			content.appendMarkdown(localize('openAgentsWindowSystemWideKeybinding.enabled', "**Shortcut enabled:** Press `{0}` from any app to open the Agents Window. ", keybindingLabel));
			content.appendLink(`command:${OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID}?${commandArgs}`, localize('openAgentsWindowSystemWideKeybinding.manage', "Manage Shortcut"));

			return {
				id: OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_ID,
				content,
				enabledCommands: [OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID],
			};
		}

		const content = new MarkdownString('', {
			isTrusted: { enabledCommands: [ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID] },
		});
		content.appendMarkdown(localize('openAgentsWindowSystemWideKeybinding.tipPrefix', "**Tip:** "));
		content.appendLink(`command:${ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID}`, localize('openAgentsWindowSystemWideKeybinding.enable', "Enable {0}", defaultKeybindingLabel));
		content.appendMarkdown(localize('openAgentsWindowSystemWideKeybinding.tipSuffix', " to open the Agents Window from any app while VS Code is running."));

		return {
			id: OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_TIP_ID,
			content,
			enabledCommands: [ENABLE_OPEN_AGENTS_WINDOW_SYSTEM_WIDE_KEYBINDING_COMMAND_ID],
		};
	}

	resetSession(): void {
		this._sessionGeneration++;
		this._showEnabledConfirmation = false;
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
		const enabledKeybinding = this._getOpenAgentsWindowSystemWideKeybinding();
		const enabled = !!enabledKeybinding;
		const enabledKeybindingLabel = this._getKeybindingLabel(enabledKeybinding);
		const didChange = this._enabled !== enabled
			|| (this._showEnabledConfirmation && this._enabledKeybindingLabel !== enabledKeybindingLabel);
		this._enabled = enabled;
		this._enabledKeybindingLabel = enabledKeybindingLabel;
		if (!enabled) {
			this._showEnabledConfirmation = false;
		}
		if (didChange) {
			this._onDidChange.fire();
		}
	}

	private _getOpenAgentsWindowSystemWideKeybinding(): ISystemWideKeybindingCandidate | undefined {
		return selectSystemWideKeybindings(this._keybindingService.getKeybindings()).candidates
			.find(keybinding => keybinding.commandId === OPEN_AGENTS_WINDOW_COMMAND_ID);
	}

	private _getKeybindingLabel(keybinding: ISystemWideKeybindingCandidate | undefined): string | undefined {
		if (!keybinding) {
			return undefined;
		}
		return this._keybindingService.resolveUserBinding(keybinding.userSettingsLabel)[0]?.getLabel() ?? keybinding.userSettingsLabel;
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
		const sessionGeneration = this._sessionGeneration;
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
		this._enabledKeybindingLabel = resolvedKeybinding.getLabel() ?? localize('openAgentsWindowSystemWideKeybinding.label', "Ctrl+Cmd+A");
		this._showEnabledConfirmation = sessionGeneration === this._sessionGeneration;
		status(localize('openAgentsWindowSystemWideKeybinding.enabledStatus', "Shortcut {0} enabled. Press it from any app to open the Agents Window.", resolvedKeybinding.getAriaLabel() ?? resolvedKeybinding.getLabel() ?? localize('openAgentsWindowSystemWideKeybinding.label', "Ctrl+Cmd+A")));
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
