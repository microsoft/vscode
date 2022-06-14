/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/test/node/testUtils';
import { Keybinding, KeybindingModifier, ResolvedKeybinding, SimpleKeybinding, ScanCodeBinding } from 'vs/base/common/keybindings';
import { Promises } from 'vs/base/node/pfs';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { IKeyboardMapper } from 'vs/platform/keyboardLayout/common/keyboardMapper';

export interface IResolvedKeybinding {
	label: string | null;
	ariaLabel: string | null;
	electronAccelerator: string | null;
	userSettingsLabel: string | null;
	isWYSIWYG: boolean;
	isChord: boolean;
	dispatchParts: (string | null)[];
	singleModifierDispatchParts: (KeybindingModifier | null)[];
}

function toIResolvedKeybinding(kb: ResolvedKeybinding): IResolvedKeybinding {
	return {
		label: kb.getLabel(),
		ariaLabel: kb.getAriaLabel(),
		electronAccelerator: kb.getElectronAccelerator(),
		userSettingsLabel: kb.getUserSettingsLabel(),
		isWYSIWYG: kb.isWYSIWYG(),
		isChord: kb.isChord(),
		dispatchParts: kb.getDispatchParts(),
		singleModifierDispatchParts: kb.getSingleModifierDispatchParts()
	};
}

export function assertResolveKeybinding(mapper: IKeyboardMapper, keybinding: Keybinding | null, expected: IResolvedKeybinding[]): void {
	const actual: IResolvedKeybinding[] = mapper.resolveKeybinding(keybinding!).map(toIResolvedKeybinding);
	assert.deepStrictEqual(actual, expected);
}

export function assertResolveKeyboardEvent(mapper: IKeyboardMapper, keyboardEvent: IKeyboardEvent, expected: IResolvedKeybinding): void {
	const actual = toIResolvedKeybinding(mapper.resolveKeyboardEvent(keyboardEvent));
	assert.deepStrictEqual(actual, expected);
}

export function assertResolveUserBinding(mapper: IKeyboardMapper, parts: (SimpleKeybinding | ScanCodeBinding)[], expected: IResolvedKeybinding[]): void {
	const actual: IResolvedKeybinding[] = mapper.resolveUserBinding(parts).map(toIResolvedKeybinding);
	assert.deepStrictEqual(actual, expected);
}

export function readRawMapping<T>(file: string): Promise<T> {
	return Promises.readFile(getPathFromAmdModule(require, `vs/workbench/services/keybinding/test/electron-browser/${file}.js`)).then((buff) => {
		const contents = buff.toString();
		const func = new Function('define', contents);
		let rawMappings: T | null = null;
		func(function (value: T) {
			rawMappings = value;
		});
		return rawMappings!;
	});
}

export function assertMapping(writeFileIfDifferent: boolean, mapper: IKeyboardMapper, file: string): Promise<void> {
	const filePath = path.normalize(getPathFromAmdModule(require, `vs/workbench/services/keybinding/test/electron-browser/${file}`));

	return Promises.readFile(filePath).then((buff) => {
		const expected = buff.toString().replace(/\r\n/g, '\n');
		const actual = mapper.dumpDebugInfo().replace(/\r\n/g, '\n');
		if (actual !== expected && writeFileIfDifferent) {
			const destPath = filePath.replace(/[\/\\]out[\/\\]vs[\/\\]workbench/, '/src/vs/workbench');
			Promises.writeFile(destPath, actual);
		}
		assert.deepStrictEqual(actual, expected);
	});
}
