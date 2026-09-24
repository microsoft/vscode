/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { describe, it } from 'mocha';
import { desktopCommand, parseDesktopEntry, validateDesktopEntries } from './launchers.js';

describe('Desktop launcher metadata', () => {
	function entries(): Record<string, string>[] {
		const application = {
			Type: 'Application',
			Exec: '/usr/share/code/code --unity-launch %F',
			StartupWMClass: 'Code',
			MimeType: 'text/plain;',
		};
		const handler = {
			Type: 'Application',
			Exec: '/usr/share/code/code --open-url %U',
			MimeType: 'x-scheme-handler/vscode;',
			NoDisplay: 'true',
		};
		return [application, { ...application, NoDisplay: 'true' }, handler, { ...handler }];
	}

	it('does not confuse desktop actions with the main entry', () => {
		assert.deepStrictEqual(parseDesktopEntry('# comment\r\n[Desktop Entry]\r\nType=Application\r\nExec="/opt/VS Code/code" --unity-launch %F\r\n[Desktop Action new-empty-window]\r\nExec=wrong\r\n'), {
			Type: 'Application',
			Exec: '"/opt/VS Code/code" --unity-launch %F',
		});
	});

	it('preserves launcher switches without interpreting a shell command', () => {
		assert.deepStrictEqual(desktopCommand({ Exec: '"/opt/VS Code/code" --unity-launch %F' }), {
			executable: '/opt/VS Code/code',
			args: ['--unity-launch'],
		});
		assert.throws(() => desktopCommand({ Exec: '/usr/bin/code %F; other-command' }));
		assert.throws(() => desktopCommand({ Exec: '/usr/bin/code %f' }));
	});

	it('accepts launchable, non-visible compatibility entries', () => {
		validateDesktopEntries(entries());
	});

	it('requires a window identity for application entries', () => {
		const values = entries();
		delete values[0].StartupWMClass;
		assert.throws(() => validateDesktopEntries(values), /StartupWMClass/);
	});

	it('rejects a missing legacy launcher', () => {
		assert.throws(() => validateDesktopEntries(entries().slice(0, 3)));
	});

	it('rejects Hidden=true even when the legacy entry is NoDisplay', () => {
		const values = entries();
		values[1].Hidden = 'true';
		assert.throws(() => validateDesktopEntries(values), /Hidden=true/);
	});

	it('rejects a duplicate visible application entry', () => {
		const values = entries();
		delete values[1].NoDisplay;
		assert.throws(() => validateDesktopEntries(values), /Only the canonical/);
	});

	it('rejects a hidden canonical entry', () => {
		const values = entries();
		values[0].NoDisplay = 'true';
		assert.throws(() => validateDesktopEntries(values), /Only the canonical/);
	});

	for (const property of ['Exec', 'StartupWMClass', 'MimeType']) {
		it(`rejects mismatched legacy ${property}`, () => {
			const values = entries();
			values[1][property] = property === 'Exec' ? '/usr/share/wrong/code %F' : 'wrong';
			assert.throws(() => validateDesktopEntries(values));
		});
	}

	it('requires URL handler field codes', () => {
		const values = entries();
		values[2].Exec = '/usr/share/code/code --open-url %F';
		assert.throws(() => validateDesktopEntries(values));
	});

	it('requires the URL handler launch switch', () => {
		const values = entries();
		values[2].Exec = '/usr/share/code/code %U';
		assert.throws(() => validateDesktopEntries(values), /--open-url/);
	});
});
