/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	dataEnablesMouseTracking,
	ensureSgrMouseEncodingOnReplay,
	shouldStripMouseTrackingOnReplay,
	stripMouseTrackingEnableFromData,
	TERMINAL_MOUSE_MODE_RESET,
	TERMINAL_MOUSE_TRACKING_RESET,
	TERMINAL_PROCESS_EXIT_RESET,
} from '../../common/terminalMouseModeReset.js';

suite('Terminal mouse mode reset', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('TERMINAL_MOUSE_TRACKING_RESET disables mouse modes only (incl. X10 ?9)', () => {
		for (const mode of ['9', '1000', '1002', '1003', '1015', '1006']) {
			assert.ok(
				TERMINAL_MOUSE_TRACKING_RESET.includes(`\x1b[?${mode}l`),
				`must reset ?${mode}`,
			);
		}
		// Must NOT clear focus / paste — live TUI needs FocusGained after Reload
		assert.ok(!TERMINAL_MOUSE_TRACKING_RESET.includes('\x1b[?2004l'));
		assert.ok(!TERMINAL_MOUSE_TRACKING_RESET.includes('\x1b[?1004l'));
	});

	test('TERMINAL_MOUSE_MODE_RESET is tracking reset plus paste/focus', () => {
		assert.ok(TERMINAL_MOUSE_MODE_RESET.startsWith(TERMINAL_MOUSE_TRACKING_RESET));
		assert.ok(TERMINAL_MOUSE_MODE_RESET.includes('\x1b[?2004l'));
		assert.ok(TERMINAL_MOUSE_MODE_RESET.includes('\x1b[?1004l'));
	});

	test('TERMINAL_PROCESS_EXIT_RESET also leaves alt screen and shows cursor', () => {
		assert.ok(TERMINAL_PROCESS_EXIT_RESET.startsWith(TERMINAL_MOUSE_MODE_RESET));
		assert.ok(TERMINAL_PROCESS_EXIT_RESET.includes('\x1b[?1049l'));
		assert.ok(TERMINAL_PROCESS_EXIT_RESET.includes('\x1b[?25h'));
		// The live-TUI resets must never leave the alt screen:
		assert.ok(!TERMINAL_MOUSE_TRACKING_RESET.includes('1049'));
		assert.ok(!TERMINAL_MOUSE_MODE_RESET.includes('1049'));
	});

	test('reset is pure CSI (safe to write as process output)', () => {
		assert.ok(TERMINAL_MOUSE_MODE_RESET.startsWith('\x1b'));
		assert.ok(!TERMINAL_MOUSE_MODE_RESET.includes(' '));
		assert.ok(!TERMINAL_MOUSE_MODE_RESET.includes('node'));
	});

	test('dataEnablesMouseTracking detects enable sequences including X10', () => {
		assert.strictEqual(dataEnablesMouseTracking('hello'), false);
		assert.strictEqual(dataEnablesMouseTracking('\x1b[?9h'), true);
		assert.strictEqual(dataEnablesMouseTracking('\x1b[?1000h'), true);
		assert.strictEqual(dataEnablesMouseTracking('\x1b[?1006h'), true);
		assert.strictEqual(dataEnablesMouseTracking('\x1b[?1000;1002;1006h'), true);
		assert.strictEqual(dataEnablesMouseTracking('\x1b[?9;1000h'), true);
		assert.strictEqual(dataEnablesMouseTracking(TERMINAL_MOUSE_MODE_RESET), false);
	});

	test('stripMouseTrackingEnableFromData drops pure mouse enables including X10', () => {
		assert.strictEqual(stripMouseTrackingEnableFromData('\x1b[?1000h'), '');
		assert.strictEqual(stripMouseTrackingEnableFromData('\x1b[?9h'), '');
		assert.strictEqual(
			stripMouseTrackingEnableFromData('before\x1b[?1000h\x1b[?1006hafter'),
			'beforeafter',
		);
		assert.strictEqual(stripMouseTrackingEnableFromData('\x1b[?1000l'), '\x1b[?1000l');
		assert.strictEqual(
			stripMouseTrackingEnableFromData('\x1b[?1000;2004h'),
			'\x1b[?2004h',
		);
		// X10 combined with alt-screen: strip mouse, keep 1049
		assert.strictEqual(
			stripMouseTrackingEnableFromData('\x1b[?1049;9;1002h'),
			'\x1b[?1049h',
		);
	});

	test('shouldStripMouseTrackingOnReplay: dead root always strips', () => {
		assert.strictEqual(shouldStripMouseTrackingOnReplay({
			processAlive: false,
			hasChildProcesses: true,
			shellTypeOrTitle: 'grok',
			isWindows: true,
		}), true);
		assert.strictEqual(shouldStripMouseTrackingOnReplay({
			processAlive: false,
			hasChildProcesses: false,
			isWindows: false,
		}), true);
	});

	test('shouldStripMouseTrackingOnReplay: live TUI root keeps mouse (no strip)', () => {
		// Grok / Claude / vim as root with no children — do not strip
		for (const title of ['grok', 'claude', 'vim', 'node', undefined, '']) {
			assert.strictEqual(shouldStripMouseTrackingOnReplay({
				processAlive: true,
				hasChildProcesses: false,
				shellTypeOrTitle: title,
				isWindows: true,
			}), false, `title=${title}`);
		}
		// Live shell with children (TUI under pwsh) — do not strip
		assert.strictEqual(shouldStripMouseTrackingOnReplay({
			processAlive: true,
			hasChildProcesses: true,
			shellTypeOrTitle: 'pwsh',
			isWindows: true,
		}), false);
	});

	test('shouldStripMouseTrackingOnReplay: Windows childless shell strips (nested-dead)', () => {
		for (const shell of ['pwsh', 'powershell', 'PowerShell', 'cmd', 'bash', 'gitbash', 'GitBash']) {
			assert.strictEqual(shouldStripMouseTrackingOnReplay({
				processAlive: true,
				hasChildProcesses: false,
				shellTypeOrTitle: shell,
				isWindows: true,
			}), true, shell);
		}
	});

	test('shouldStripMouseTrackingOnReplay: fail-open children keeps mouse on Windows shell', () => {
		// ChildProcessMonitor defaults true; terminalProcess uses ?? true when monitor missing.
		// hasChildProcesses=true must never strip a live shell (live nested TUI).
		assert.strictEqual(shouldStripMouseTrackingOnReplay({
			processAlive: true,
			hasChildProcesses: true,
			shellTypeOrTitle: 'pwsh',
			isWindows: true,
		}), false);
	});

	test('shouldStripMouseTrackingOnReplay: POSIX live never strips (residual hole accepted)', () => {
		assert.strictEqual(shouldStripMouseTrackingOnReplay({
			processAlive: true,
			hasChildProcesses: false,
			shellTypeOrTitle: 'bash',
			isWindows: false,
		}), false);
	});

	test('ensureSgrMouseEncodingOnReplay: appends ?1006h when tracking present without SGR', () => {
		// SerializeAddon re-emits drag mode only (?1002h) — missing SGR encoding
		const serialized = 'FAKE_TUI_READY\x1b[?2004h\x1b[?1004h\x1b[?1002h\x1b[?25l';
		const fixed = ensureSgrMouseEncodingOnReplay(serialized);
		assert.ok(fixed.endsWith('\x1b[?1006h'), fixed);
		assert.ok(fixed.includes('\x1b[?1002h'));
	});

	test('ensureSgrMouseEncodingOnReplay: no-op when SGR already present or no tracking', () => {
		const withSgr = 'x\x1b[?1002h\x1b[?1006hy';
		assert.strictEqual(ensureSgrMouseEncodingOnReplay(withSgr), withSgr);
		const noMouse = 'hello\x1b[?1049h\x1b[?25l';
		assert.strictEqual(ensureSgrMouseEncodingOnReplay(noMouse), noMouse);
		assert.strictEqual(ensureSgrMouseEncodingOnReplay('plain'), 'plain');
	});
});
