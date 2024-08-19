/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import assert from 'assert';
import * as path from 'vs/base/common/path';
import { SingleModifierChord, ResolvedKeybinding, Keybinding } from 'vs/base/common/keybindings';
import { Promises } from 'vs/base/node/pfs';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { IKeyboardMapper } from 'vs/platform/keyboardLayout/common/keyboardMapper';
import { FileAccess } from 'vs/base/common/network';

export interface IResolvedKeybinding {
	label: string | null;
	ariaLabel: string | null;
	electronAccelerator: string | null;
	userSettingsLabel: string | null;
	isWYSIWYG: boolean;
	isMultiChord: boolean;
	dispatchParts: (string | null)[];
	singleModifierDispatchParts: (SingleModifierChord | null)[];
}

function toIResolvedKeybinding(kb: ResolvedKeybinding): IResolvedKeybinding {
	return {
		label: kb.getLabel(),
		ariaLabel: kb.getAriaLabel(),
		electronAccelerator: kb.getElectronAccelerator(),
		userSettingsLabel: kb.getUserSettingsLabel(),
		isWYSIWYG: kb.isWYSIWYG(),
		isMultiChord: kb.hasMultipleChords(),
		dispatchParts: kb.getDispatchChords(),
		singleModifierDispatchParts: kb.getSingleModifierDispatchChords()
	};
}

export function assertResolveKeyboardEvent(mapper: IKeyboardMapper, keyboardEvent: IKeyboardEvent, expected: IResolvedKeybinding): void {
	const actual = toIResolvedKeybinding(mapper.resolveKeyboardEvent(keyboardEvent));
	assert.deepStrictEqual(actual, expected);
}

export function assertResolveKeybinding(mapper: IKeyboardMapper, keybinding: Keybinding, expected: IResolvedKeybinding[]): void {
	const actual: IResolvedKeybinding[] = mapper.resolveKeybinding(keybinding).map(toIResolvedKeybinding);
	assert.deepStrictEqual(actual, expected);
}

export function readRawMapping<T>(file: string): Promise<T> {
	return fs.promises.readFile(FileAccess.asFileUri(`vs/workbench/services/keybinding/test/node/${file}.js`).fsPath).then((buff) => {
		const contents = buff.toString();
		const func = new Function('define', contents);// CodeQL [SM01632] This is used in tests and we read the files as JS to avoid slowing down TS compilation
		let rawMappings: T | null = null;
		func(function (value: T) {
			rawMappings = value;
		});
		return rawMappings!;
	});
}

export function assertMapping(writeFileIfDifferent: boolean, mapper: IKeyboardMapper, file: string): Promise<void> {
	const filePath = path.normalize(FileAccess.asFileUri(`vs/workbench/services/keybinding/test/node/${file}`).fsPath);

	return fs.promises.readFile(filePath).then((buff) => {
		const expected = buff.toString().replace(/\r\n/g, '\n');
		const actual = mapper.dumpDebugInfo().replace(/\r\n/g, '\n');
		if (actual !== expected && writeFileIfDifferent) {
			const destPath = filePath.replace(/[\/\\]out[\/\\]vs[\/\\]workbench/, '/src/vs/workbench');
			Promises.writeFile(destPath, actual);
		}
		assert.deepStrictEqual(actual, expected);
	});
}
