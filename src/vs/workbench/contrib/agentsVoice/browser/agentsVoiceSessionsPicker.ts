/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IAgentSession } from '../../chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionsSorter, groupAgentSessionsByDate } from '../../chat/browser/agentSessions/agentSessionsViewer.js';
import { getSessionDescription, shouldShowSessionInPicker } from '../../chat/browser/agentSessions/agentSessionsPicker.js';
import { AgentSessionsFilter } from '../../chat/browser/agentSessions/agentSessionsFilter.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';

interface IVoiceSessionPickItem extends IQuickPickItem {
	readonly session: IAgentSession;
}

const setTargetButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.voiceMode),
	tooltip: localize('voiceSessions.setTarget', "Set as voice target")
};

/**
 * A quickpick that lists agent sessions and allows the user to select one
 * as the voice transcription target. Mirrors the pattern of AgentSessionsPicker
 * but with a voice-specific action.
 */
export class AgentsVoiceSessionsPicker {

	private readonly sorter = new AgentSessionsSorter();

	constructor(
		private readonly onSelectTarget: (resource: URI) => void,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async show(): Promise<void> {
		const disposables = new DisposableStore();
		const picker = disposables.add(this.quickInputService.createQuickPick<IVoiceSessionPickItem>({ useSeparators: true }));
		const filter = disposables.add(this.instantiationService.createInstance(AgentSessionsFilter, {}));

		picker.items = this.createPickerItems(filter);
		picker.placeholder = localize('voiceSessions.placeholder', "Select a session for voice input");

		disposables.add(picker.onDidAccept(() => {
			const pick = picker.selectedItems[0];
			if (pick) {
				this.onSelectTarget(pick.session.resource);
			}
			picker.hide();
		}));

		disposables.add(picker.onDidTriggerItemButton(e => {
			if (e.button === setTargetButton) {
				this.onSelectTarget(e.item.session.resource);
				picker.hide();
			}
		}));

		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}

	private createPickerItems(filter: AgentSessionsFilter): (IVoiceSessionPickItem | IQuickPickSeparator)[] {
		const sessions = this.agentSessionsService.model.sessions
			.filter(session => shouldShowSessionInPicker(session, filter))
			.sort(this.sorter.compare.bind(this.sorter));
		const items: (IVoiceSessionPickItem | IQuickPickSeparator)[] = [];

		const groupedSessions = groupAgentSessionsByDate(sessions);
		for (const group of groupedSessions.values()) {
			if (group.sessions.length > 0) {
				items.push({ type: 'separator', label: group.label });
				items.push(...group.sessions.map(session => this.toPickItem(session)));
			}
		}

		return items;
	}

	private toPickItem(session: IAgentSession): IVoiceSessionPickItem {
		const description = getSessionDescription(session);

		return {
			id: session.resource.toString(),
			label: session.label,
			tooltip: session.tooltip,
			description,
			iconClass: ThemeIcon.asClassName(session.icon),
			buttons: [setTargetButton],
			session
		};
	}
}
