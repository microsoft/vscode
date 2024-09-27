/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { debounce } from '../../../../../base/common/decorators.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITerminalCapabilityStore, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalLogService, TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';

export class TextAreaSyncAddon extends Disposable implements ITerminalAddon {
	private _terminal: Terminal | undefined;
	private readonly _listeners = this._register(new MutableDisposable());

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._refreshListeners();
	}

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService
	) {
		super();

		this._register(Event.runAndSubscribe(Event.any(
			this._capabilities.onDidAddCapability,
			this._capabilities.onDidRemoveCapability,
			this._accessibilityService.onDidChangeScreenReaderOptimized,
		), () => {
			this._refreshListeners();
		}));
	}

	private _refreshListeners(): void {
		const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
		if (this._shouldBeActive() && commandDetection) {
			if (!this._listeners.value) {
				const textarea = this._terminal?.textarea;
				if (textarea) {
					this._listeners.value = Event.runAndSubscribe(commandDetection.promptInputModel.onDidChangeInput, () => this._sync(textarea));
				}
			}
		} else {
			this._listeners.clear();
		}
	}

	private _shouldBeActive(): boolean {
		return this._accessibilityService.isScreenReaderOptimized() || this._configurationService.getValue(TerminalSettingId.DevMode);
	}

	@debounce(50)
	private _sync(textArea: HTMLTextAreaElement): void {
		const commandCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!commandCapability) {
			return;
		}

		textArea.value = commandCapability.promptInputModel.value;
		textArea.selectionStart = commandCapability.promptInputModel.cursorIndex;
		textArea.selectionEnd = commandCapability.promptInputModel.cursorIndex;

		this._logService.debug(`TextAreaSyncAddon#sync: text changed to "${textArea.value}"`);
	}
}
