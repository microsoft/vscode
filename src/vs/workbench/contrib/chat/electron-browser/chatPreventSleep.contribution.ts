/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeepAwakeState, PREVENT_SLEEP_ENABLED, PREVENT_SLEEP_GRACE_PERIOD } from '../../../../platform/keepAwake/common/keepAwake.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatPreventSleepClaimContribution } from './chatPreventSleep.js';

const SHOW_STATUS = 'workbench.action.chat.showSleepPreventionStatus';
const activeContext = new RawContextKey<boolean>('chatPreventSleepActive', false, localize('preventSleep.context', "Whether chat sleep prevention is active"));

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chat.configuration', "Chat"),
	properties: {
		[PREVENT_SLEEP_ENABLED]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			ignoreSync: true,
			description: localize('preventSleep.enabled', "Keep this computer awake while a chat or agent session is running on it, including while it waits for your input. Cloud and remote agent sessions are not included. The display can still sleep, and closing a laptop lid still puts it to sleep."),
		},
		[PREVENT_SLEEP_GRACE_PERIOD]: {
			type: 'number',
			default: 10,
			enum: [0, 5, 10, 15, 30],
			enumItemLabels: [
				localize('preventSleep.none', "None"), localize('preventSleep.five', "5 minutes"),
				localize('preventSleep.ten', "10 minutes"), localize('preventSleep.fifteen', "15 minutes"),
				localize('preventSleep.thirty', "30 minutes"),
			],
			scope: ConfigurationScope.APPLICATION,
			description: localize('preventSleep.grace', "How many more minutes to keep this computer awake after the last local chat or agent session goes idle."),
		},
	},
});

export function keepAwakeStatus(state: IKeepAwakeState): string {
	if (!state.enabled) {
		return localize('preventSleep.off', "Chat sleep prevention is turned off.");
	}
	if (!state.active) {
		return state.busySources.length > 0
			? localize('preventSleep.failed', "Unable to prevent sleep. Check the main log for details.")
			: localize('preventSleep.idle', "Not preventing sleep: no local sessions are busy.");
	}
	if (state.inGrace) {
		return localize('preventSleep.inGrace', "Preventing sleep during the grace period after local sessions went idle.");
	}
	const windows = state.busySources.filter(source => source.startsWith('window:')).length;
	return state.busySources.includes('agentHost')
		? localize('preventSleep.host', "Preventing sleep: local sessions are busy in {0} windows and the local agent host.", windows)
		: localize('preventSleep.windows', "Preventing sleep: local sessions are busy in {0} windows.", windows);
}

class ChatPreventSleepStatus extends Disposable {
	static readonly ID = 'workbench.contrib.chatPreventSleepStatus';
	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@INativeHostService nativeHostService: INativeHostService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStatusbarService statusbarService: IStatusbarService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		const context = activeContext.bindTo(contextKeyService);
		let currentState: IKeepAwakeState | undefined;
		const update = (state: IKeepAwakeState) => {
			currentState = state;
			context.set(state.enabled && state.active);
			if (!state.active || !state.enabled || environmentService.isSessionsWindow || chatEntitlementService.sentiment.hidden) {
				this.entry.clear();
				return;
			}
			const message = keepAwakeStatus(state);
			const tooltip = new MarkdownString().appendText(message).appendMarkdown(`\n\n[${localize('preventSleep.settings', "Open Settings")}](command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(['@id:chat.preventSleep.enabled']))})`);
			tooltip.isTrusted = { enabledCommands: ['workbench.action.openSettings'] };
			const props = { name: localize('preventSleep.name', "Chat Sleep Prevention"), text: '$(coffee)', ariaLabel: message, tooltip, command: SHOW_STATUS };
			if (this.entry.value) {
				this.entry.value.update(props);
			} else {
				this.entry.value = statusbarService.addEntry(props, 'chat.preventSleep', StatusbarAlignment.RIGHT, 99);
			}
		};
		this._register(chatEntitlementService.onDidChangeSentiment(() => {
			if (currentState) {
				update(currentState);
			}
		}));
		let eventReceived = false;
		this._register(nativeHostService.onDidChangeKeepAwakeState(state => {
			eventReceived = true;
			update(state);
		}));
		void nativeHostService.getKeepAwakeState().then(state => {
			if (!eventReceived && !this._store.isDisposed) {
				update(state);
			}
		}).catch(error => logService.error('[KeepAwake] Failed to get status', error));
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SHOW_STATUS,
			title: localize2('preventSleep.showStatus', "Show Sleep Prevention Status"),
			category: localize2('chat.category', "Chat"),
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${PREVENT_SLEEP_ENABLED}`, true)),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const notificationService = accessor.get(INotificationService);
		const configurationService = accessor.get(IConfigurationService);
		const preferencesService = accessor.get(IPreferencesService);
		const state = await nativeHostService.getKeepAwakeState();
		notificationService.prompt(Severity.Info, keepAwakeStatus(state), [
			{ label: localize('preventSleep.turnOff', "Turn Off"), run: () => configurationService.updateValue(PREVENT_SLEEP_ENABLED, false) },
			{ label: localize('preventSleep.openSettings', "Open Settings"), run: () => preferencesService.openSettings({ query: `@id:${PREVENT_SLEEP_ENABLED}` }) },
		]);
	}
});

registerWorkbenchContribution2(ChatPreventSleepClaimContribution.ID, ChatPreventSleepClaimContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatPreventSleepStatus.ID, ChatPreventSleepStatus, WorkbenchPhase.Eventually);
