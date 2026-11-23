/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatEntitlement, ChatEntitlementService, getChatPlanName, IChatEntitlementService, SimulatedChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

const SIMULATE_ENTITLEMENT_COMMAND_ID = 'workbench.action.chat.simulateEntitlement';

function getSimulatedEntitlementLabel(entitlement: SimulatedChatEntitlement): string {
	switch (entitlement) {
		case ChatEntitlement.Available:
			return localize('simulatedEntitlement.available', "Can Claim Copilot Free");
		case ChatEntitlement.Unavailable:
			return localize('simulatedEntitlement.unavailable', "No Copilot Access");
		default:
			return getChatPlanName(entitlement);
	}
}

function getChatEntitlementRequests(chatEntitlementService: IChatEntitlementService) {
	return chatEntitlementService instanceof ChatEntitlementService ? chatEntitlementService.requests?.value : undefined;
}

interface ISimulatedEntitlementPickItem extends IQuickPickItem {
	readonly entitlement: SimulatedChatEntitlement | undefined;
}

/**
 * Lets developers try the product as a user with a different Copilot plan,
 * for example a user who can claim Copilot Free but has not signed up yet.
 */
export class SimulateChatEntitlementAction extends Action2 {

	constructor() {
		super({
			id: SIMULATE_ENTITLEMENT_COMMAND_ID,
			title: localize2('simulateEntitlement', "Simulate Copilot Plan..."),
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatEntitlementService = accessor.get(IChatEntitlementService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		const requests = getChatEntitlementRequests(chatEntitlementService);
		if (!requests) {
			notificationService.info(localize('simulateEntitlement.unsupported', "Simulating a Copilot plan is not supported in this environment."));
			return;
		}

		const current = requests.simulatedEntitlement;
		const currentDescription = localize('simulateEntitlement.current', "Current");
		const toItem = (entitlement: SimulatedChatEntitlement, detail?: string): ISimulatedEntitlementPickItem => ({
			entitlement,
			label: getSimulatedEntitlementLabel(entitlement),
			description: entitlement === current ? currentDescription : undefined,
			detail
		});

		const items: (ISimulatedEntitlementPickItem | IQuickPickSeparator)[] = [
			{
				entitlement: undefined,
				label: current === undefined ? localize('simulateEntitlement.actual', "Actual Plan") : localize('simulateEntitlement.stop', "Stop Simulating"),
				description: current === undefined ? currentDescription : undefined,
				detail: localize('simulateEntitlement.actualDetail', "Use the Copilot plan of your signed-in account")
			},
			{ type: 'separator', label: localize('simulateEntitlement.notSubscribed', "Not Subscribed") },
			toItem(ChatEntitlement.Available, localize('simulateEntitlement.availableDetail', "Signed in and eligible for Copilot Free, but not signed up yet")),
			toItem(ChatEntitlement.Unavailable, localize('simulateEntitlement.unavailableDetail', "Signed in but not eligible for any Copilot plan")),
			{ type: 'separator', label: localize('simulateEntitlement.individual', "Individual Plans") },
			toItem(ChatEntitlement.Free),
			toItem(ChatEntitlement.EDU),
			toItem(ChatEntitlement.Pro),
			toItem(ChatEntitlement.ProPlus),
			toItem(ChatEntitlement.Max),
			{ type: 'separator', label: localize('simulateEntitlement.organization', "Organization Plans") },
			toItem(ChatEntitlement.Business),
			toItem(ChatEntitlement.Enterprise),
		];

		const pick = await quickInputService.pick(items, {
			title: localize('simulateEntitlement.title', "Simulate Copilot Plan"),
			placeHolder: localize('simulateEntitlement.placeholder', "Select the Copilot plan to experience the product with"),
			activeItem: items.find((item): item is ISimulatedEntitlementPickItem => item.type !== 'separator' && item.entitlement === current)
		});
		if (!pick || pick.entitlement === current) {
			return;
		}

		await requests.setSimulatedEntitlement(pick.entitlement);

		if (pick.entitlement === undefined) {
			status(localize('simulateEntitlement.stopped', "Stopped simulating a Copilot plan"));
		} else {
			status(localize('simulateEntitlement.started', "Simulating {0}", getSimulatedEntitlementLabel(pick.entitlement)));
			if (chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
				notificationService.info(localize('simulateEntitlement.signIn', "Sign in with GitHub to experience the simulated Copilot plan."));
			}
		}
	}
}

/**
 * Shows a status bar entry while a Copilot plan is simulated.
 */
export class ChatEntitlementSimulationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatEntitlementSimulation';

	private readonly entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		const requests = getChatEntitlementRequests(chatEntitlementService);
		if (!requests) {
			return;
		}

		this.update(requests.simulatedEntitlement);
		this._register(requests.onDidChangeSimulatedEntitlement(() => this.update(requests.simulatedEntitlement)));
	}

	private update(simulatedEntitlement: SimulatedChatEntitlement | undefined): void {
		if (simulatedEntitlement === undefined) {
			this.entry.clear();
			return;
		}

		const label = getSimulatedEntitlementLabel(simulatedEntitlement);
		const props: IStatusbarEntry = {
			name: localize('simulateEntitlement.statusName', "Simulated Copilot Plan"),
			text: `$(beaker) ${localize('simulateEntitlement.statusText', "Simulating: {0}", label)}`,
			ariaLabel: localize('simulateEntitlement.statusAria', "Simulating the Copilot plan {0}. Select to change or stop the simulation.", label),
			tooltip: localize('simulateEntitlement.statusTooltip', "Simulating the Copilot plan \"{0}\". Click to change or stop the simulation.", label),
			command: SIMULATE_ENTITLEMENT_COMMAND_ID,
			kind: 'warning'
		};

		if (this.entry.value) {
			this.entry.value.update(props);
		} else {
			// Far right, just before the notifications bell, independent of whether the Copilot entry is shown
			this.entry.value = this.statusbarService.addEntry(props, 'chat.entitlementSimulation', StatusbarAlignment.RIGHT, -Number.MAX_SAFE_INTEGER);
		}
	}
}
