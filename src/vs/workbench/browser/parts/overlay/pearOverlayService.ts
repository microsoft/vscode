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
import { CommandsRegistry } from "vs/platform/commands/common/commands";

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

	/**
	 * Returns true if the PearAI popup is visible.
	 */
	isVisible(): boolean;
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
		// @ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._pearOverlayPart =
			this.instantiationService.createInstance(PearOverlayPart);
		this.registerListeners();
		this.registerCommands();
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

	private registerCommands(): void {
		// Register commands for external use e.g. in pearai submodule
		CommandsRegistry.registerCommand('pearai.isOverlayVisible', (accessor) => {
			const overlayService = accessor.get(IPearOverlayService);
			return overlayService.isVisible();
		});

		CommandsRegistry.registerCommand('pearai.showOverlay', (accessor) => {
			const overlayService = accessor.get(IPearOverlayService);
			overlayService.show();
		});

		CommandsRegistry.registerCommand('pearai.hideOverlay', (accessor) => {
			const overlayService = accessor.get(IPearOverlayService);
			overlayService.hide();
		});

		CommandsRegistry.registerCommand('pearai.toggleOverlay', (accessor) => {
			const overlayService = accessor.get(IPearOverlayService);
			overlayService.toggle();
		});
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

	isVisible(): boolean {
		return this._pearOverlayPart.isVisible();
	}

}

registerSingleton(
	IPearOverlayService,
	PearOverlayService,
	InstantiationType.Eager,
);
