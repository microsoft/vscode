/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getDesktopEnvironment } from '../../common/desktopEnvironmentInfo.js';
import { env } from '../../common/process.js';

suite('Desktop Environment Info', () => {
	const originalEnv: NodeJS.ProcessEnv = {};

	setup(() => {
		// Save original environment
		for (const key in env) {
			originalEnv[key] = env[key];
		}
		// Clear environment
		for (const key in env) {
			delete env[key];
		}
	});

	teardown(() => {
		// Restore environment
		for (const key in env) {
			delete env[key];
		}
		for (const key in originalEnv) {
			env[key] = originalEnv[key];
		}
	});

	suite('XDG_CURRENT_DESKTOP', () => {
		test('Unity', () => {
			env['XDG_CURRENT_DESKTOP'] = 'Unity';
			assert.strictEqual(getDesktopEnvironment(), 'UNITY');
		});

		test('Unity with gnome-fallback', () => {
			env['XDG_CURRENT_DESKTOP'] = 'Unity';
			env['DESKTOP_SESSION'] = 'ubuntu-communitheme:gnome-fallback';
			assert.strictEqual(getDesktopEnvironment(), 'GNOME');
		});

		test('Deepin', () => {
			env['XDG_CURRENT_DESKTOP'] = 'Deepin';
			assert.strictEqual(getDesktopEnvironment(), 'DEEPIN');
		});

		test('GNOME', () => {
			env['XDG_CURRENT_DESKTOP'] = 'GNOME';
			assert.strictEqual(getDesktopEnvironment(), 'GNOME');
		});

		test('X-Cinnamon', () => {
			env['XDG_CURRENT_DESKTOP'] = 'X-Cinnamon';
			assert.strictEqual(getDesktopEnvironment(), 'CINNAMON');
		});

		test('KDE 5', () => {
			env['XDG_CURRENT_DESKTOP'] = 'KDE';
			env['KDE_SESSION_VERSION'] = '5';
			assert.strictEqual(getDesktopEnvironment(), 'KDE5');
		});

		test('KDE 6', () => {
			env['XDG_CURRENT_DESKTOP'] = 'KDE';
			env['KDE_SESSION_VERSION'] = '6';
			assert.strictEqual(getDesktopEnvironment(), 'KDE6');
		});

		test('KDE 4 (fallback)', () => {
			env['XDG_CURRENT_DESKTOP'] = 'KDE';
			assert.strictEqual(getDesktopEnvironment(), 'KDE4');
		});

		test('Pantheon', () => {
			env['XDG_CURRENT_DESKTOP'] = 'Pantheon';
			assert.strictEqual(getDesktopEnvironment(), 'PANTHEON');
		});

		test('XFCE', () => {
			env['XDG_CURRENT_DESKTOP'] = 'XFCE';
			assert.strictEqual(getDesktopEnvironment(), 'XFCE');
		});

		test('UKUI', () => {
			env['XDG_CURRENT_DESKTOP'] = 'UKUI';
			assert.strictEqual(getDesktopEnvironment(), 'UKUI');
		});

		test('LXQt', () => {
			env['XDG_CURRENT_DESKTOP'] = 'LXQt';
			assert.strictEqual(getDesktopEnvironment(), 'LXQT');
		});

		test('Multiple values', () => {
			env['XDG_CURRENT_DESKTOP'] = 'ubuntu:GNOME';
			assert.strictEqual(getDesktopEnvironment(), 'GNOME');
		});
	});

	suite('DESKTOP_SESSION', () => {
		test('deepin', () => {
			env['DESKTOP_SESSION'] = 'deepin';
			assert.strictEqual(getDesktopEnvironment(), 'DEEPIN');
		});

		test('gnome', () => {
			env['DESKTOP_SESSION'] = 'gnome';
			assert.strictEqual(getDesktopEnvironment(), 'GNOME');
		});

		test('mate', () => {
			env['DESKTOP_SESSION'] = 'mate';
			assert.strictEqual(getDesktopEnvironment(), 'GNOME');
		});

		test('kde4', () => {
			env['DESKTOP_SESSION'] = 'kde4';
			assert.strictEqual(getDesktopEnvironment(), 'KDE4');
		});

		test('kde-plasma', () => {
			env['DESKTOP_SESSION'] = 'kde-plasma';
			assert.strictEqual(getDesktopEnvironment(), 'KDE4');
		});

		test('kde with version', () => {
			env['DESKTOP_SESSION'] = 'kde';
			env['KDE_SESSION_VERSION'] = '5';
			assert.strictEqual(getDesktopEnvironment(), 'KDE4'); // The logic returns KDE4 if KDE_SESSION_VERSION exists at all
		});

		test('kde without version', () => {
			env['DESKTOP_SESSION'] = 'kde';
			assert.strictEqual(getDesktopEnvironment(), 'KDE3');
		});

		test('xfce', () => {
			env['DESKTOP_SESSION'] = 'xfce';
			assert.strictEqual(getDesktopEnvironment(), 'XFCE');
		});

		test('xubuntu', () => {
			env['DESKTOP_SESSION'] = 'xubuntu';
			assert.strictEqual(getDesktopEnvironment(), 'XFCE');
		});

		test('ukui', () => {
			env['DESKTOP_SESSION'] = 'ukui';
			assert.strictEqual(getDesktopEnvironment(), 'UKUI');
		});
	});

	suite('Fallback Environment Variables', () => {
		test('GNOME_DESKTOP_SESSION_ID', () => {
			env['GNOME_DESKTOP_SESSION_ID'] = '1';
			assert.strictEqual(getDesktopEnvironment(), 'GNOME');
		});

		test('KDE_FULL_SESSION with version', () => {
			env['KDE_FULL_SESSION'] = '1';
			env['KDE_SESSION_VERSION'] = '5';
			assert.strictEqual(getDesktopEnvironment(), 'KDE4'); // Logic returns KDE4 if KDE_SESSION_VERSION exists
		});

		test('KDE_FULL_SESSION without version', () => {
			env['KDE_FULL_SESSION'] = '1';
			assert.strictEqual(getDesktopEnvironment(), 'KDE3');
		});
	});

	test('Unknown', () => {
		assert.strictEqual(getDesktopEnvironment(), 'UNKNOWN');
	});
});
