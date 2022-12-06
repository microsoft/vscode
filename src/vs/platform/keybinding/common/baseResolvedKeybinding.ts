/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from 'vs/base/common/errors';
import { AriaLabelProvider, ElectronAcceleratorLabelProvider, UILabelProvider, UserSettingsLabelProvider } from 'vs/base/common/keybindingLabels';
import { IBaseKeybinding, KeybindingModifier, ResolvedKeybinding, ResolvedKeybindingPart } from 'vs/base/common/keybindings';
import { OperatingSystem } from 'vs/base/common/platform';

export abstract class BaseResolvedKeybinding<T extends IBaseKeybinding> extends ResolvedKeybinding {

	protected readonly _os: OperatingSystem;
	protected readonly _parts: readonly T[];

	constructor(os: OperatingSystem, parts: readonly T[]) {
		super();
		if (parts.length === 0) {
			throw illegalArgument(`parts`);
		}
		this._os = os;
		this._parts = parts;
	}

	public getLabel(): string | null {
		return UILabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getLabel(keybinding));
	}

	public getAriaLabel(): string | null {
		return AriaLabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getAriaLabel(keybinding));
	}

	public getElectronAccelerator(): string | null {
		if (this._parts.length > 1) {
			// [Electron Accelerators] Electron cannot handle chords
			return null;
		}
		if (this._parts[0].isDuplicateModifierCase()) {
			// [Electron Accelerators] Electron cannot handle modifier only keybindings
			// e.g. "shift shift"
			return null;
		}
		return ElectronAcceleratorLabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getElectronAccelerator(keybinding));
	}

	public getUserSettingsLabel(): string | null {
		return UserSettingsLabelProvider.toLabel(this._os, this._parts, (keybinding) => this._getUserSettingsLabel(keybinding));
	}

	public isWYSIWYG(): boolean {
		return this._parts.every((keybinding) => this._isWYSIWYG(keybinding));
	}

	public isChord(): boolean {
		return (this._parts.length > 1);
	}

	public getParts(): ResolvedKeybindingPart[] {
		return this._parts.map((keybinding) => this._getPart(keybinding));
	}

	private _getPart(keybinding: T): ResolvedKeybindingPart {
		return new ResolvedKeybindingPart(
			keybinding.ctrlKey,
			keybinding.shiftKey,
			keybinding.altKey,
			keybinding.metaKey,
			this._getLabel(keybinding),
			this._getAriaLabel(keybinding)
		);
	}

	public getDispatchParts(): (string | null)[] {
		return this._parts.map((keybinding) => this._getDispatchPart(keybinding));
	}

	public getSingleModifierDispatchParts(): (KeybindingModifier | null)[] {
		return this._parts.map((keybinding) => this._getSingleModifierDispatchPart(keybinding));
	}

	protected abstract _getLabel(keybinding: T): string | null;
	protected abstract _getAriaLabel(keybinding: T): string | null;
	protected abstract _getElectronAccelerator(keybinding: T): string | null;
	protected abstract _getUserSettingsLabel(keybinding: T): string | null;
	protected abstract _isWYSIWYG(keybinding: T): boolean;
	protected abstract _getDispatchPart(keybinding: T): string | null;
	protected abstract _getSingleModifierDispatchPart(keybinding: T): KeybindingModifier | null;
}
