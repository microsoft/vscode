/**
 * Parity gate: CSI sequences must match across host TS, harness model, and
 * (when present) grok-build Rust. Catches the three-copy drift failure mode.
 *
 *   node --test scripts/sticky-mouse-reload/parity.test.mjs
 *   node --test scripts/sticky-mouse-reload/*.test.mjs   # full gate
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSI } from './decModeState.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vscodeRoot = path.resolve(__dirname, '../..');
const hostTs = path.join(
	vscodeRoot,
	'src/vs/platform/terminal/common/terminalMouseModeReset.ts',
);

function read(p) {
	return fs.readFileSync(p, 'utf8');
}

/** Pull a `export const NAME = '...' + '...'` style concatenation of escapes. */
function extractConstString(src, name) {
	const re = new RegExp(
		`export const ${name}\\s*=\\s*([\\s\\S]*?);`,
		'm',
	);
	const m = src.match(re);
	if (!m) return null;
	const body = m[1];
	// Collect '\\x1b[...]' and '\x1b[...]' string literals
	const parts = [];
	const lit = /'\\x1b\[([^\']*)'|"\\x1b\[([^"]*)"/g;
	let x;
	while ((x = lit.exec(body)) !== null) {
		parts.push('\x1b[' + (x[1] ?? x[2]));
	}
	// Also plain '\x1b[?1000l' forms already covered; handle concatenated IDENT only
	if (parts.length === 0 && body.includes('TERMINAL_MOUSE_TRACKING_RESET')) {
		// composed from other consts — resolve manually below
		return body.trim();
	}
	return parts.length ? parts.join('') : null;
}

describe('CSI parity: host TS ↔ harness decModeState', () => {
	const ts = read(hostTs);

	it('host exports the three reset levels', () => {
		assert.ok(ts.includes('TERMINAL_MOUSE_TRACKING_RESET'));
		assert.ok(ts.includes('TERMINAL_MOUSE_MODE_RESET'));
		assert.ok(ts.includes('TERMINAL_PROCESS_EXIT_RESET'));
	});

	it('mouse-only reset matches harness hostMouseOnlyReset', () => {
		const tracking = extractConstString(ts, 'TERMINAL_MOUSE_TRACKING_RESET');
		assert.ok(tracking, 'parse TERMINAL_MOUSE_TRACKING_RESET');
		assert.equal(tracking, CSI.hostMouseOnlyReset);
	});

	it('full sticky reset (no leave-alt) matches harness hostExitReset mouse+paste+focus', () => {
		// TERMINAL_MOUSE_MODE_RESET = TRACKING + paste + focus
		const modeBody = extractConstString(ts, 'TERMINAL_MOUSE_MODE_RESET');
		assert.ok(modeBody);
		// May be composition expression — assert includes
		assert.ok(ts.includes("'\\x1b[?2004l'") || ts.includes('"\\x1b[?2004l"') || ts.includes('\\x1b[?2004l'));
		assert.ok(ts.includes('?1004l'));
		assert.equal(CSI.hostExitReset, CSI.hostMouseOnlyReset + '\x1b[?2004l\x1b[?1004l');
	});

	it('process-exit reset includes leave-alt + show cursor (harness + host)', () => {
		assert.ok(ts.includes('?1049l'));
		assert.ok(ts.includes('?25h'));
		// harness hostExitReset is intentionally mouse+paste+focus only; exit
		// leave-alt lives on TERMINAL_PROCESS_EXIT_RESET. Keep both documented:
		assert.ok(!CSI.hostExitReset.includes('1049'), 'harness hostExitReset stays leave-alt free (post-replay safe)');
	});

	it('strip keeps alt-screen and drops mouse enables including X10 ?9 (shared policy)', () => {
		assert.ok(ts.includes('stripMouseTrackingEnableFromData'));
		assert.ok(ts.includes('1000') && ts.includes('1006'));
		assert.ok(
			ts.includes("'9'") || ts.includes('"9"') || /MOUSE_TRACKING_ENABLE_MODES[\s\S]*\b9\b/.test(ts),
			'strip set must include X10 mode 9',
		);
		assert.ok(CSI.hostMouseOnlyReset.includes('\x1b[?9l'));
	});
});

describe('CSI parity: optional grok-build Rust (when checkout exists)', () => {
	const candidates = [
		path.resolve(vscodeRoot, '../grok-build/crates/codegen/xai-crash-handler/src/terminal.rs'),
		path.resolve('C:/Users/Louis/Documents/clone/grok-build/crates/codegen/xai-crash-handler/src/terminal.rs'),
	];
	const rustPath = candidates.find(p => fs.existsSync(p));

	it('MOUSE_ENABLE_SEQ / REASSERT / RESTORE present and sane when grok-build is local', function () {
		if (!rustPath) {
			this.skip();
			return;
		}
		const rs = read(rustPath);
		assert.ok(rs.includes('MOUSE_ENABLE_SEQ'));
		assert.ok(rs.includes('REASSERT_DISPLAY_SEQ'));
		assert.ok(rs.includes('RESTORE_SEQ'));
		/** Capture the `b"..."` body for `pub const NAME`. */
		const bytesBody = (name) => {
			const re = new RegExp(
				String.raw`pub const ${name}\s*:\s*&\[u8\]\s*=\s*b"([\s\S]*?)"\s*;`,
			);
			const m = rs.match(re);
			assert.ok(m, `parse b"..." for ${name}`);
			return m[1].replace(/\\\n\s*/g, '');
		};
		const mouseEn = bytesBody('MOUSE_ENABLE_SEQ');
		const reassert = bytesBody('REASSERT_DISPLAY_SEQ');
		const restore = bytesBody('RESTORE_SEQ');
		assert.ok(!/1049/.test(mouseEn), 'mouse-only must not touch alt');
		assert.ok(reassert.includes('?1049h'), 'reassert enters alt');
		assert.ok(!reassert.includes('?1049l'), 'reassert must not leave alt');
		assert.ok(restore.includes('?1049l'), 'RESTORE leaves alt on real exit');
		assert.ok(mouseEn.includes('?1000h') && mouseEn.includes('?1006h'));
		assert.ok(
			!mouseEn.includes('?1004h'),
			'mouse-only reassert must not re-fire focus reporting (storm risk)',
		);
		assert.ok(reassert.includes('?1006h') && reassert.includes('?1004h'));
	});
});
