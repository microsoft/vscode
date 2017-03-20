/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { IKeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { Keybinding } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { readFile, writeFile } from 'vs/base/node/pfs';

export interface IResolvedKeybinding {
	label: string;
	ariaLabel: string;
	HTMLLabel: IHTMLContentElement[];
	electronAccelerator: string;
	userSettingsLabel: string;
	isChord: boolean;
	hasCtrlModifier: boolean;
	hasShiftModifier: boolean;
	hasAltModifier: boolean;
	hasMetaModifier: boolean;
	dispatchParts: [string, string];
}

export function assertResolveKeybinding(mapper: IKeyboardMapper, keybinding: Keybinding, expected: IResolvedKeybinding[]): void {
	let actual: IResolvedKeybinding[] = mapper.resolveKeybinding(keybinding).map((kb => {
		return {
			label: kb.getLabel(),
			ariaLabel: kb.getAriaLabel(),
			HTMLLabel: kb.getHTMLLabel(),
			electronAccelerator: kb.getElectronAccelerator(),
			userSettingsLabel: kb.getUserSettingsLabel(),
			isChord: kb.isChord(),
			hasCtrlModifier: kb.hasCtrlModifier(),
			hasShiftModifier: kb.hasShiftModifier(),
			hasAltModifier: kb.hasAltModifier(),
			hasMetaModifier: kb.hasMetaModifier(),
			dispatchParts: kb.getDispatchParts(),
		};
	}));
	assert.deepEqual(actual, expected);
}

function _htmlPieces(pieces: string[]): IHTMLContentElement[] {
	let children: IHTMLContentElement[] = [];
	for (let i = 0, len = pieces.length; i < len; i++) {
		if (i !== 0) {
			children.push({ tagName: 'span', text: '+' });
		}
		children.push({ tagName: 'span', className: 'monaco-kbkey', text: pieces[i] });
	}
	return children;
}

export function simpleHTMLLabel(pieces: string[]): IHTMLContentElement {
	return {
		tagName: 'span',
		className: 'monaco-kb',
		children: _htmlPieces(pieces)
	};
}

export function chordHTMLLabel(firstPart: string[], chordPart: string[]): IHTMLContentElement {
	return {
		tagName: 'span',
		className: 'monaco-kb',
		children: [].concat(
			_htmlPieces(firstPart),
			[{ tagName: 'span', text: ' ' }],
			_htmlPieces(chordPart)
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

export function assertMapping(mapper: IKeyboardMapper, file: string, done: (err?: any) => void): void {
	const filePath = require.toUrl(`vs/workbench/services/keybinding/test/${file}`);

	readFile(filePath).then((buff) => {
		let expected = buff.toString();
		const actual = mapper.dumpDebugInfo();
		if (actual !== expected) {
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
