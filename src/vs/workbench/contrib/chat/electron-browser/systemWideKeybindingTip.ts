/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IKeybindingEditingService } from '../../../services/keybinding/common/keybindingEditing.js';
import { createKeybindingCommandQuery } from '../../../services/preferences/browser/keybindingsEditorModel.js';
import { ISystemWideKeybindingCandidate, selectSystemWideKeybindings } from '../../keybindings/electron-browser/systemWideKeybindings.js';
import { IChatTip, IChatTipProvider, IChatTipService } from '../browser/chatTipService.js';

const OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID = 'workbench.action.openGlobalKeybindings';

/** How a {@link SystemWideKeybindingTip} reads, in the words of the feature that the keybinding belongs to. */
export interface ISystemWideKeybindingTipCopy {
	/** Appends the tip that offers to enable the keybinding in all apps, with a link to `enableLink`, which does. */
	appendOffer(content: MarkdownString, keybindingLabel: string, enableLink: string): void;
	/** Appends the tip that confirms the keybinding, with a link to `manageLink`, which shows it in the Keyboard Shortcuts editor. */
	appendEnabled(content: MarkdownString, keybindingLabel: string, manageLink: string): void;
	/** What screen readers announce once the keybinding is enabled. */
	getEnabledStatus(keybindingLabel: string): string;
}

export interface ISystemWideKeybindingTipOptions {
	readonly tipId: string;
	/** The command that the link of the tip runs to enable the keybinding, which the tip registers. */
	readonly enableCommandId: string;
	/** The command that the keybinding runs, and its arguments. */
	readonly commandId: string;
	readonly commandArgs?: unknown;
	/** Where the tip remembers that the user dismissed it. */
	readonly dismissedStorageKey: string;
	readonly dismissedStorageScope: StorageScope.APPLICATION | StorageScope.APPLICATION_SHARED;
	/** The keybinding that the tip offers to enable, or `undefined` when there is none to offer. */
	getKeybinding(): ResolvedKeybinding | undefined;
	/**
	 * Whether new chats offer the tip, such as on the platform, or once the user knows the command. It is checked when the
	 * tip is created and when a chat starts, so that a change, such as the user's first use of the command, doesn't swap
	 * the tip of the chat that the user is writing.
	 */
	isEligible(): boolean;
	readonly copy: ISystemWideKeybindingTipCopy;
}

/**
 * A chat tip that offers to enable the keybinding of a command in all apps, as only the user should make a keybinding
 * system-wide: its link adds the keybinding to the user's keybindings with `"systemWide": true`, unless another command
 * has a system-wide keybinding at its key. Once the keybinding is enabled, the tip confirms it for the rest of the chat
 * session, with a link to the Keyboard Shortcuts editor, and then shows no more while the keybinding stays enabled.
 */
export class SystemWideKeybindingTip extends Disposable implements IChatTipProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _eligible: boolean;
	private _enabled: boolean;
	private _enabledKeybindingLabel: string | undefined;
	private _dismissed: boolean;
	private _showEnabledConfirmation = false;
	private _sessionGeneration = 0;
	private _enablement: Promise<void> | undefined;

	constructor(
		private readonly _options: ISystemWideKeybindingTipOptions,
		chatTipService: IChatTipService,
		private readonly _keybindingService: IKeybindingService,
		private readonly _keybindingEditingService: IKeybindingEditingService,
		private readonly _storageService: IStorageService,
		private readonly _notificationService: INotificationService,
		private readonly _logService: ILogService,
	) {
		super();

		this._eligible = this._options.isEligible();
		const enabledKeybinding = this._getSystemWideKeybinding();
		this._enabled = !!enabledKeybinding;
		this._enabledKeybindingLabel = this._getKeybindingLabel(enabledKeybinding);
		this._dismissed = this._storageService.getBoolean(this._options.dismissedStorageKey, this._options.dismissedStorageScope, false);

		this._register(chatTipService.registerTipProvider(this));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => this._updateEnabled()));
		this._register(CommandsRegistry.registerCommand(this._options.enableCommandId, () => this._enable()));
	}

	provideTip(): IChatTip | undefined {
		if (this._dismissed || !this._eligible) {
			return undefined;
		}

		if (this._enabled) {
			if (!this._showEnabledConfirmation || !this._enabledKeybindingLabel) {
				return undefined;
			}

			const commandArgs = encodeURIComponent(JSON.stringify([createKeybindingCommandQuery(this._options.commandId)]));
			const content = new MarkdownString('', {
				isTrusted: { enabledCommands: [OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID] },
			});
			this._options.copy.appendEnabled(content, this._enabledKeybindingLabel, `command:${OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID}?${commandArgs}`);

			return {
				id: this._options.tipId,
				content,
				enabledCommands: [OPEN_GLOBAL_KEYBINDINGS_COMMAND_ID],
			};
		}

		// Chords can't be system-wide.
		const keybinding = this._options.getKeybinding();
		const keybindingLabel = keybinding?.getElectronAccelerator() ? keybinding.getLabel() : undefined;
		if (!keybindingLabel) {
			return undefined;
		}
		const content = new MarkdownString('', {
			isTrusted: { enabledCommands: [this._options.enableCommandId] },
		});
		this._options.copy.appendOffer(content, keybindingLabel, `command:${this._options.enableCommandId}`);

		return {
			id: this._options.tipId,
			content,
			enabledCommands: [this._options.enableCommandId],
		};
	}

	resetSession(): void {
		this._sessionGeneration++;
		this._showEnabledConfirmation = false;
		this._eligible = this._options.isEligible();
	}

	dismissTip(tipId: string): void {
		if (tipId !== this._options.tipId) {
			return;
		}

		this._dismissed = true;
		this._storageService.store(this._options.dismissedStorageKey, true, this._options.dismissedStorageScope, StorageTarget.MACHINE);
		this._onDidChange.fire();
	}

	clearDismissedTips(): void {
		this._dismissed = false;
		this._storageService.remove(this._options.dismissedStorageKey, this._options.dismissedStorageScope);
		this._onDidChange.fire();
	}

	private _updateEnabled(): void {
		const enabledKeybinding = this._getSystemWideKeybinding();
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

	private _getSystemWideKeybinding(): ISystemWideKeybindingCandidate | undefined {
		return selectSystemWideKeybindings(this._keybindingService.getKeybindings()).candidates
			.find(keybinding => keybinding.commandId === this._options.commandId);
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
		const keybinding = this._options.getKeybinding();
		const accelerator = keybinding?.getElectronAccelerator();
		const key = keybinding?.getUserSettingsLabel();
		if (!keybinding || !accelerator || !key) {
			this._notificationService.error(localize('systemWideKeybindingTip.unresolved', "Unable to enable the keybinding in all apps because its key combination could not be resolved."));
			return;
		}

		const keybindingLabel = keybinding.getLabel() ?? key;
		const existing = selectSystemWideKeybindings(this._keybindingService.getKeybindings()).candidates
			.find(candidate => candidate.accelerator === accelerator);
		if (existing) {
			if (existing.commandId === this._options.commandId) {
				this._updateEnabled();
				return;
			}

			this._notificationService.error(localize('systemWideKeybindingTip.conflict', "Unable to enable {0} because another system-wide keybinding already uses it.", keybindingLabel));
			return;
		}

		const item = new ResolvedKeybindingItem(
			undefined,
			this._options.commandId,
			this._options.commandArgs,
			undefined,
			false,
			null,
			false,
			true,
		);
		try {
			await this._keybindingEditingService.addKeybinding(item, key, undefined);
		} catch (error) {
			this._logService.error(`[SystemWideKeybindingTip] Adding the system-wide keybinding of ${this._options.commandId} failed:`, error);
			this._notificationService.error(localize('systemWideKeybindingTip.error', "Unable to enable the keybinding in all apps: {0}", getErrorMessage(error)));
			return;
		}

		this._enabled = true;
		this._enabledKeybindingLabel = keybindingLabel;
		this._showEnabledConfirmation = sessionGeneration === this._sessionGeneration;
		status(this._options.copy.getEnabledStatus(keybinding.getAriaLabel() ?? keybindingLabel));
		this._onDidChange.fire();
	}
}
