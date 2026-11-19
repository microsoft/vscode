/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ as h, disposableWindowInterval } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { hasSignedInCodexChatGPTAccount, ICodexAccountService, shouldShowCodexAccount } from '../../../../services/agentHost/browser/codexAccountService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment, StatusbarEntryKind } from '../../../../services/statusbar/browser/statusbar.js';
import { CodexStatusDashboard, getCodexRateLimits } from './codexStatusDashboard.js';

export const CODEX_STATUS_BAR_ENTRY_ID = 'codex.statusBarEntry';

export class CodexStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.codexStatusBarEntry';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly entryAnchor = h('span');
	private readonly dashboardTooltip: IStatusbarEntry['tooltip'];

	constructor(
		@ICodexAccountService private readonly codexAccountService: ICodexAccountService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		this.dashboardTooltip = {
			element: (token: CancellationToken) => {
				const store = new DisposableStore();
				store.add(token.onCancellationRequested(() => store.dispose()));
				const element = CodexStatusDashboard.instantiateInContents(this.instantiationService, store);

				// Keep parity with the Copilot status dashboard while hover disposal is
				// not guaranteed when its backing element is removed. See #257923.
				store.add(disposableWindowInterval(mainWindow, () => {
					if (!element.isConnected) {
						store.dispose();
					}
				}, 2000));

				return element;
			},
		};

		this.update();
		this._register(this.codexAccountService.onDidChangeAccount(() => this.update()));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AgentHostCodexAgentEnabledSettingId)
				|| event.affectsConfiguration(CodexPreferAgentHostEditorSettingId)
				|| event.affectsConfiguration(ChatAIDisabledSettingId)) {
				this.update();
			}
		}));
	}

	private update(): void {
		const account = this.codexAccountService.account;
		const visible = hasSignedInCodexChatGPTAccount(account, shouldShowCodexAccount(this.configurationService, false));
		if (!visible) {
			this.entry.clear();
			return;
		}

		const properties = this.getEntryProperties();
		if (this.entry.value) {
			this.entry.value.update(properties);
		} else {
			this.entry.value = this.statusbarService.addEntry(properties, CODEX_STATUS_BAR_ENTRY_ID, StatusbarAlignment.RIGHT, {
				location: { id: 'chat.statusBarEntry', priority: 100.1 },
				alignment: StatusbarAlignment.RIGHT,
			});
		}
	}

	private getEntryProperties(): IStatusbarEntry {
		const rateLimitReached = getCodexRateLimits(this.codexAccountService.account).some(rateLimit => rateLimit.usedPercent >= 100);
		let text = '$(openai)';
		let ariaLabel = localize('codexStatusAria', "Codex status");
		let kind: StatusbarEntryKind | undefined;
		if (rateLimitReached) {
			const limitReached = localize('codexLimitReached', "Limit reached");
			text = `$(openai) ${limitReached}`;
			ariaLabel = localize('codexLimitReachedAria', "Codex limit reached");
			kind = 'prominent';
		}

		return {
			name: localize('codexStatus', "Codex Status"),
			text,
			ariaLabel,
			command: ShowTooltipCommand,
			showInAllWindows: true,
			kind,
			content: this.entryAnchor,
			tooltip: this.dashboardTooltip,
		};
	}
}
