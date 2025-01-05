import { registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { ServicesAccessor } from "../../../../platform/instantiation/common/instantiation.js";
import { IPearOverlayService } from "./pearOverlayService.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";

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
			title: { value: "Toggle PearAI Popup", original: "Toggle PearAI Popup" },
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

registerAction2(TogglePearOverlayAction);
registerAction2(ClosePearOverlayAction);
