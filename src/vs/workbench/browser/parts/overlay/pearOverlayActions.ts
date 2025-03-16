/* eslint-disable header/header */

import {
	registerAction2,
	Action2,
} from "../../../../platform/actions/common/actions.js";
import { ServicesAccessor } from "../../../../platform/instantiation/common/instantiation.js";
import { IPearOverlayService } from "./pearOverlayService.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { PEARAI_FIRST_LAUNCH_KEY } from "./common.js";
import {
	INotificationService,
	Severity,
} from "../../../../platform/notification/common/notification.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { PearAIVisibleContext } from "../../../common/contextkeys.js";

export class ClosePearOverlayAction extends Action2 {
	static readonly ID = "workbench.action.closePearAI";

	constructor() {
		super({
			id: ClosePearOverlayAction.ID,
			title: { value: "Close PearAI Popup", original: "Close PearAI Popup" },
			f1: true,
			keybinding: {
				weight: 200,
				primary: KeyCode.Escape,
				// when: PearAIVisibleContext.negate(),
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const pearaiOverlayService = accessor.get(IPearOverlayService);
		pearaiOverlayService.hide();
	}
}

export class TogglePearOverlayAction extends Action2 {
	static readonly ID = "workbench.action.togglePearAI";

	constructor() {
		super({
			id: TogglePearOverlayAction.ID,
			title: {
				value: "Toggle PearAI Popup",
				original: "Toggle PearAI Popup",
			},
			f1: true,
			keybinding: {
				weight: 200,
				primary: KeyMod.CtrlCmd | KeyCode.KeyE,
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const pearaiOverlayService = accessor.get(IPearOverlayService);
		pearaiOverlayService.toggle();
	}
}

export class MarkPearAIFirstLaunchCompleteAction extends Action2 {
	static readonly ID = "workbench.action.markPearAIFirstLaunchComplete";

	constructor() {
		super({
			id: MarkPearAIFirstLaunchCompleteAction.ID,
			title: {
				value: "Mark PearAI First Launch Key Complete",
				original: "Mark PearAI First Launch Key Complete",
			},
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		storageService.store(PEARAI_FIRST_LAUNCH_KEY, true, 0, 0);
		// const notificationService = accessor.get(INotificationService);
		// const commandService = accessor.get(ICommandService);  // Get command service early
		// notificationService.notify({
		// 	severity: Severity.Info,
		// 	message: 'Successfully marked PearAI first launch Key complete',
		// 	actions: {
		// 		primary: [{
		// 			id: 'reloadWindow',
		// 			label: 'Reload Window',
		// 			tooltip: 'Reload Window',
		// 			class: '',
		// 			enabled: true,
		// 			run: () => {
		// 				commandService.executeCommand('workbench.action.reloadWindow');
		// 			}
		// 		}]
		// 	}
		// });
	}
}

export class ResetPearAIFirstLaunchKeyAction extends Action2 {
	static readonly ID = "workbench.action.resetPearAIFirstLaunchKey";

	constructor() {
		super({
			id: ResetPearAIFirstLaunchKeyAction.ID,
			title: {
				value: "Reset PearAI First Launch Key",
				original: "Reset PearAI First Launch Key",
			},
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService); // Get command service early

		storageService.store(PEARAI_FIRST_LAUNCH_KEY, false, 0, 0);
		notificationService.notify({
			severity: Severity.Info,
			message: "Successfully reset PearAI first launch Key",
			actions: {
				primary: [
					{
						id: "reloadWindow",
						label: "Reload Window",
						tooltip: "Reload Window",
						class: "",
						enabled: true,
						run: () => {
							commandService.executeCommand("workbench.action.reloadWindow");
						},
					},
				],
			},
		});
	}
}

export class IsPearAIFirstLaunchAction extends Action2 {
	static readonly ID = "workbench.action.isPearAIFirstLaunch";

	constructor() {
		super({
			id: IsPearAIFirstLaunchAction.ID,
			title: {
				value: "Is PearAI First Launch",
				original: "Is PearAI First Launch",
			},
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): boolean | undefined {
		const storageService = accessor.get(IStorageService);
		return !storageService.getBoolean(PEARAI_FIRST_LAUNCH_KEY, 0);
	}
}

registerAction2(TogglePearOverlayAction);
registerAction2(ClosePearOverlayAction);

registerAction2(MarkPearAIFirstLaunchCompleteAction);
registerAction2(ResetPearAIFirstLaunchKeyAction);
registerAction2(IsPearAIFirstLaunchAction);
