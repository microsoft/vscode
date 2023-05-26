/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from 'vs/base/common/errors';
import { AriaLabelProvider, ElectronAcceleratorLabelProvider, UILabelProvider, UserSettingsLabelProvider } from 'vs/base/common/keybindingLabels';
import { Chord, SingleModifierChord, ResolvedKeybinding, ResolvedChord } from 'vs/base/common/keybindings';
import { OperatingSystem } from 'vs/base/common/platform';

export abstract class BaseResolvedKeybinding<T extends Chord> extends ResolvedKeybinding {

	protected readonly _os: OperatingSystem;
	protected readonly _chords: readonly T[];

	constructor(os: OperatingSystem, chords: readonly T[]) {
		super();
		if (chords.length === 0) {
			throw illegalArgument(`chords`);
		}
		this._os = os;
		this._chords = chords;
	}

	public getLabel(): string | null {
		return UILabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getLabel(keybinding));
	}

	public getAriaLabel(): string | null {
		return AriaLabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getAriaLabel(keybinding));
	}

	public getElectronAccelerator(): string | null {
		if (this._chords.length > 1) {
			// [Electron Accelerators] Electron cannot handle chords
			return null;
		}
		if (this._chords[0].isDuplicateModifierCase()) {
			// [Electron Accelerators] Electron cannot handle modifier only keybindings
			// e.g. "shift shift"
			return null;
		}
		return ElectronAcceleratorLabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getElectronAccelerator(keybinding));
	}

	public getUserSettingsLabel(): string | null {
		return UserSettingsLabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getUserSettingsLabel(keybinding));
	}

	public isWYSIWYG(): boolean {
		return this._chords.every((keybinding) => this._isWYSIWYG(keybinding));
	}

	public hasMultipleChords(): boolean {
		return (this._chords.length > 1);
	}

	public getChords(): ResolvedChord[] {
		return this._chords.map((keybinding) => this._getChord(keybinding));
	}

	private _getChord(keybinding: T): ResolvedChord {
		return new ResolvedChord(
			keybinding.ctrlKey,
			keybinding.shiftKey,
			keybinding.altKey,
			keybinding.metaKey,
			this._getLabel(keybinding),
			this._getAriaLabel(keybinding)
		);
	}

	public getDispatchChords(): (string | null)[] {
		return this._chords.map((keybinding) => this._getChordDispatch(keybinding));
	}

	public getSingleModifierDispatchChords(): (SingleModifierChord | null)[] {
		return this._chords.map((keybinding) => this._getSingleModifierChordDispatch(keybinding));
	}

	protected abstract _getLabel(keybinding: T): string | null;
	protected abstract _getAriaLabel(keybinding: T): string | null;
	protected abstract _getElectronAccelerator(keybinding: T): string | null;
	protected abstract _getUserSettingsLabel(keybinding: T): string | null;
	protected abstract _isWYSIWYG(keybinding: T): boolean;
	protected abstract _getChordDispatch(keybinding: T): string | null;
	protected abstract _getSingleModifierChordDispatch(keybinding: T): SingleModifierChord | null;
}
