/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { suite, test } from 'node:test';

suite('Windows Agents installer shortcut', () => {
	const installer = readFileSync(new URL('../../win32/code.iss', import.meta.url), 'utf8');
	const icons = installer.split('[Icons]')[1].split('[Run]')[0].trim().split(/\r?\n/);

	test('installs an independently pinnable Start-menu entry without changing editor shortcuts', () => {
		const agents = icons.filter(line => line.includes('Parameters: "--agents"'));
		assert.deepStrictEqual(agents.map(line => Object.fromEntries([...line.matchAll(/(?<key>\w+): "(?<value>[^"]*)"/g)].map(match => [match.groups!.key, match.groups!.value]))), [{
			Name: '{group}\\{#NameLong} Agents',
			Filename: '{app}\\{#ExeBasename}.exe',
			Parameters: '--agents',
			WorkingDir: '{app}',
			IconFilename: '{app}\\agents.ico',
			AppUserModelID: '{#AppUserId}.Agents',
		}]);
		assert.strictEqual(icons.filter(line => line.includes('AppUserModelID: "{#AppUserId}"')).length, 3);
	});

	test('adds the entry on background upgrades when it is missing, without replacing an existing shortcut', () => {
		assert.ok(icons.some(line => line.includes(`Check: ShouldUpdateShortcut(ExpandConstant('{group}\\{#NameLong} Agents.lnk'))`)));
		assert.match(installer, /function ShouldUpdateShortcut\(Path: String\): Boolean;\s*begin\s*Result := not \(IsBackgroundUpdate\(\) and FileExists\(Path\)\);/);
	});
});
