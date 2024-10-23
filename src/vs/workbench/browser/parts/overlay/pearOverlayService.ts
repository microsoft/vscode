import {
	registerSingleton,
	InstantiationType,
} from "vs/platform/instantiation/common/extensions";
import { Disposable, IDisposable } from "vs/base/common/lifecycle";
import { PearOverlayPart } from "./pearOverlayPart";
import {
	createDecorator,
	IInstantiationService,
} from "vs/platform/instantiation/common/instantiation";
import { IEditorService } from "vs/workbench/services/editor/common/editorService";
import { ITerminalService } from "vs/workbench/contrib/terminal/browser/terminal";

export const IPearOverlayService = createDecorator<IPearOverlayService>(
	"pearaiOverlayService",
);

export interface IPearOverlayService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the PearOverlayPart instance.
	 */
	readonly pearOverlayPart: PearOverlayPart;

	/**
	 * Shows the PearAI popup.
	 */
	show(): void;

	/**
	 * Hides the PearAI popup.
	 */
	hide(): void;

	/**
	 * Toggles the visibility of the PearAI popup.
	 */
	toggle(): void;
}

export class PearOverlayService
	extends Disposable
	implements IPearOverlayService
{
	declare readonly _serviceBrand: undefined;

	private readonly _pearOverlayPart: PearOverlayPart;

	constructor(
		@IInstantiationService
		private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
		this._pearOverlayPart =
			this.instantiationService.createInstance(PearOverlayPart);
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(
			this._editorService.onDidActiveEditorChange(() => {
				this.hide();
			}),
		);

		this._register(
			this._terminalService.onDidFocusInstance(() => {
				this.hide();
			}),
		);
	}

	get pearOverlayPart(): PearOverlayPart {
		return this._pearOverlayPart;
	}

	show(): void {
		this._pearOverlayPart.show();
	}

	hide(): void {
		this._pearOverlayPart.hide();
	}

	toggle(): void {
		this._pearOverlayPart.toggle();
	}

	override dispose(): void {
		super.dispose();
		this._pearOverlayPart.dispose();
	}
}

registerSingleton(
	IPearOverlayService,
	PearOverlayService,
	InstantiationType.Eager,
);
