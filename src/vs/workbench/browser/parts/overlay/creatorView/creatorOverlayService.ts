/* eslint-disable header/header */

import {
	registerSingleton,
	InstantiationType,
} from "../../../../../platform/instantiation/common/extensions.js";
import {
	Disposable,
	IDisposable,
} from "../../../../../base/common/lifecycle.js";
import { CreatorOverlayPart } from "./creatorOverlayPart.js";
import {
	createDecorator,
	IInstantiationService,
} from "../../../../../platform/instantiation/common/instantiation.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ITerminalService } from "../../../../contrib/terminal/browser/terminal.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";

export const ICreatorOverlayService = createDecorator<ICreatorOverlayService>(
	"creatorOverlayService",
);

export interface ICreatorOverlayService extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the CreatorOverlayPart instance.
	 */
	readonly creatorOverlayPart: CreatorOverlayPart;

	/**
	 * Shows the Creator view popup.
	 */
	show(): void;

	/**
	 * Hides the Creator view popup.
	 */
	hide(): void;

	/**
	 * Toggles the visibility of the Creator view popup.
	 */
	toggle(): void;

	/**
	 * Returns true if the Creator view popup is visible.
	 */
	isVisible(): boolean;

	/**
	 * Locks the Creator view popup.
	 */
	lock(): void;

	/**
	 * Unlocks the Creator view popup.
	 */
	unlock(): void;

	/**
	 * Returns true if the Creator view popup is locked.
	 */
	isLocked(): boolean;

	/**
	 * Hides the loading overlay message.
	 */
	hideOverlayLoadingMessage(): void;
}

export class CreatorOverlayService
	extends Disposable
	implements ICreatorOverlayService
{
	declare readonly _serviceBrand: undefined;

	private readonly _creatorOverlayPart: CreatorOverlayPart;

	constructor(
		@IInstantiationService
		private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
		this._creatorOverlayPart =
			this.instantiationService.createInstance(CreatorOverlayPart);
		this.registerListeners();
		this.registerCommands();
	}

	private registerListeners(): void {
		this._register(
			this._editorService.onDidActiveEditorChange(() => {
				// Optional: auto-hide when editor changes
				// this.hide();
			}),
		);

		this._register(
			this._terminalService.onDidFocusInstance(() => {
				// Optional: auto-hide when terminal gets focus
				// this.hide();
			}),
		);
	}

	private registerCommands(): void {
		// Register commands for external use
		CommandsRegistry.registerCommand(
			"pearai.isCreatorOverlayVisible",
			(accessor) => {
				const overlayService = accessor.get(ICreatorOverlayService);
				return overlayService.isVisible();
			},
		);

		CommandsRegistry.registerCommand(
			"pearai.showCreatorOverlay",
			(accessor) => {
				const overlayService = accessor.get(ICreatorOverlayService);
				overlayService.show();
			},
		);

		CommandsRegistry.registerCommand(
			"pearai.hideCreatorOverlay",
			(accessor) => {
				const overlayService = accessor.get(ICreatorOverlayService);
				overlayService.hide();
			},
		);

		CommandsRegistry.registerCommand("pearai.toggleCreator", (accessor) => {
			const overlayService = accessor.get(ICreatorOverlayService);
			overlayService.toggle();
		});

		CommandsRegistry.registerCommand(
			"pearai.lockCreatorOverlay",
			(accessor) => {
				const overlayService = accessor.get(ICreatorOverlayService);
				overlayService.lock();
			},
		);

		CommandsRegistry.registerCommand(
			"pearai.unlockCreatorOverlay",
			(accessor) => {
				const overlayService = accessor.get(ICreatorOverlayService);
				overlayService.unlock();
			},
		);

		CommandsRegistry.registerCommand(
			"pearai.isCreatorOverlayLocked",
			(accessor) => {
				const overlayService = accessor.get(ICreatorOverlayService);
				return overlayService.isLocked();
			},
		);

		CommandsRegistry.registerCommand(
			"pearai.hideCreatorOverlayLoadingMessage",
			(accessor) => {
				const overlayService = accessor.get(ICreatorOverlayService);
				overlayService.hideOverlayLoadingMessage();
			},
		);
	}

	get creatorOverlayPart(): CreatorOverlayPart {
		return this._creatorOverlayPart;
	}

	show(): void {
		this._creatorOverlayPart.show();
	}

	hide(): void {
		this._creatorOverlayPart.hide();
	}

	toggle(): void {
		this._creatorOverlayPart.toggle();
	}

	lock(): void {
		this._creatorOverlayPart.lock();
	}

	unlock(): void {
		this._creatorOverlayPart.unlock();
	}

	isLocked(): boolean {
		return this._creatorOverlayPart.isLocked;
	}

	hideOverlayLoadingMessage(): void {
		this._creatorOverlayPart.hideOverlayLoadingMessage();
	}

	override dispose(): void {
		super.dispose();
		this._creatorOverlayPart.dispose();
	}

	isVisible(): boolean {
		return this._creatorOverlayPart.isVisible();
	}
}

registerSingleton(
	ICreatorOverlayService,
	CreatorOverlayService,
	InstantiationType.Eager,
);
