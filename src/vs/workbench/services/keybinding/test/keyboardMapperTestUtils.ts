/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { Keybinding, ResolvedKeybinding, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { readFile, writeFile } from 'vs/base/node/pfs';
import { OperatingSystem } from 'vs/base/common/platform';
import { IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { ScanCodeBinding } from 'vs/workbench/services/keybinding/common/scanCode';

export interface IResolvedKeybinding {
	label: string;
	labelWithoutModifiers: string;
	ariaLabel: string;
	ariaLabelWithoutModifiers: string;
	electronAccelerator: string;
	userSettingsLabel: string;
	isWYSIWYG: boolean;
	isChord: boolean;
	hasCtrlModifier: boolean;
	hasShiftModifier: boolean;
	hasAltModifier: boolean;
	hasMetaModifier: boolean;
	dispatchParts: [string, string];
}

function toIResolvedKeybinding(kb: ResolvedKeybinding): IResolvedKeybinding {
	return {
		label: kb.getLabel(),
		labelWithoutModifiers: kb.getLabelWithoutModifiers(),
		ariaLabel: kb.getAriaLabel(),
		ariaLabelWithoutModifiers: kb.getAriaLabelWithoutModifiers(),
		electronAccelerator: kb.getElectronAccelerator(),
		userSettingsLabel: kb.getUserSettingsLabel(),
		isWYSIWYG: kb.isWYSIWYG(),
		isChord: kb.isChord(),
		hasCtrlModifier: kb.hasCtrlModifier(),
		hasShiftModifier: kb.hasShiftModifier(),
		hasAltModifier: kb.hasAltModifier(),
		hasMetaModifier: kb.hasMetaModifier(),
		dispatchParts: kb.getDispatchParts(),
	};
}

export function assertResolveKeybinding(mapper: IKeyboardMapper, keybinding: Keybinding, expected: IResolvedKeybinding[]): void {
	let actual: IResolvedKeybinding[] = mapper.resolveKeybinding(keybinding).map(toIResolvedKeybinding);
	assert.deepEqual(actual, expected);
}

export function assertResolveKeyboardEvent(mapper: IKeyboardMapper, keyboardEvent: IKeyboardEvent, expected: IResolvedKeybinding): void {
	let actual = toIResolvedKeybinding(mapper.resolveKeyboardEvent(keyboardEvent));
	assert.deepEqual(actual, expected);
}

export function assertResolveUserBinding(mapper: IKeyboardMapper, firstPart: SimpleKeybinding | ScanCodeBinding, chordPart: SimpleKeybinding | ScanCodeBinding, expected: IResolvedKeybinding[]): void {
	let actual: IResolvedKeybinding[] = mapper.resolveUserBinding(firstPart, chordPart).map(toIResolvedKeybinding);
	assert.deepEqual(actual, expected);
}

function _htmlPieces(pieces: string[], OS: OperatingSystem): IHTMLContentElement[] {
	let children: IHTMLContentElement[] = [];
	for (let i = 0, len = pieces.length; i < len; i++) {
		if (i !== 0 && OS !== OperatingSystem.Macintosh) {
			children.push({ tagName: 'span', text: '+' });
		}
		children.push({ tagName: 'span', className: 'monaco-kbkey', text: pieces[i] });
	}
	return children;
}

export function simpleHTMLLabel(pieces: string[], OS: OperatingSystem): IHTMLContentElement {
	return {
		tagName: 'span',
		className: 'monaco-kb',
		children: _htmlPieces(pieces, OS)
	};
}

export function chordHTMLLabel(firstPart: string[], chordPart: string[], OS: OperatingSystem): IHTMLContentElement {
	return {
		tagName: 'span',
		className: 'monaco-kb',
		children: [].concat(
			_htmlPieces(firstPart, OS),
			[{ tagName: 'span', text: ' ' }],
			_htmlPieces(chordPart, OS)
		)
	};
}

export function readRawMapping<T>(file: string): TPromise<T> {
	return readFile(require.toUrl(`vs/workbench/services/keybinding/test/${file}.js`)).then((buff) => {
		let contents = buff.toString();
		let func = new Function('define', contents);
		let rawMappings: T = null;
		func(function (value) {
			rawMappings = value;
		});
		return rawMappings;
	});
}

export function assertMapping(writeFileIfDifferent: boolean, mapper: IKeyboardMapper, file: string, done: (err?: any) => void): void {
	const filePath = require.toUrl(`vs/workbench/services/keybinding/test/${file}`);

	readFile(filePath).then((buff) => {
		let expected = buff.toString();
		const actual = mapper.dumpDebugInfo();
		if (actual !== expected && writeFileIfDifferent) {
			writeFile(filePath, actual);
		}
		try {
			assert.deepEqual(actual, expected);
		} catch (err) {
			return done(err);
		}
		done();
	}, done);
}
