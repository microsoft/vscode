/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';

/**
 * Installs the Rust toolchain needed to build the `@github/copilot` runtime from
 * source, for a `copilotOverride` `runtime` commit override. Invoked by a
 * pipeline step that is gated on `VSCODE_COPILOT_RUNTIME_SOURCE=true`, so normal
 * and feed/SDK-only builds never pay this cost.
 *
 * The runtime's own `build-runtime.ts` runs `rustup target add <triple>` for the
 * requested target, so the essential prerequisite here is `rustup` itself. Cross
 * targets additionally need per-platform system tooling (musl/cross-arch), which
 * this best-effort provisions; a given CI image may already ship some of it.
 */

const IS_WINDOWS = process.platform === 'win32';

function tryRun(command: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): boolean {
	try {
		console.log(`[runtime-toolchain] $ ${command} ${args.join(' ')}`);
		// These are all real executables (no `.cmd` shims), so never use a shell —
		// on Windows a shell would split spaced args like the PowerShell -Command.
		execFileSync(command, args, { stdio: 'inherit', shell: false, env: opts.env ?? process.env });
		return true;
	} catch (err) {
		console.warn(`[runtime-toolchain] command failed: ${err instanceof Error ? err.message : String(err)}`);
		return false;
	}
}

function has(command: string): boolean {
	try {
		execFileSync(IS_WINDOWS ? 'where' : 'which', [command], { stdio: 'ignore', shell: false });
		return true;
	} catch {
		return false;
	}
}

function ensureRustup(): void {
	if (has('rustup')) {
		console.log('[runtime-toolchain] rustup already present.');
		tryRun('rustup', ['--version']);
		return;
	}
	console.log('[runtime-toolchain] rustup not found — installing.');
	if (IS_WINDOWS) {
		// Download and run rustup-init non-interactively.
		tryRun('powershell', ['-NoProfile', '-Command',
			'Invoke-WebRequest https://win.rustup.rs/x86_64 -OutFile rustup-init.exe; ./rustup-init.exe -y --default-toolchain stable --profile minimal']);
		console.log(`##vso[task.prependpath]${path.join(os.homedir(), '.cargo', 'bin')}`);
	} else {
		tryRun('sh', ['-c', 'curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal']);
		console.log(`##vso[task.prependpath]${path.join(os.homedir(), '.cargo', 'bin')}`);
	}
}

/**
 * Best-effort cross-compilation tooling. Native (host-arch, host-libc) builds
 * need none of this; it only matters when a job cross-builds a slice of the
 * matrix (e.g. linux musl/arm64 in the Linux job). Failures are non-fatal here —
 * `build-runtime.ts` surfaces a precise error if a required tool is missing.
 */
function ensureCrossTooling(): void {
	// cargo-zigbuild routes musl and Linux cross-compiles through zig.
	if (!has('cargo-zigbuild')) {
		tryRun('cargo', ['install', '--locked', 'cargo-zigbuild']);
	}
	// zig itself (cargo-zigbuild dependency).
	if (!has('zig')) {
		if (process.platform === 'darwin') {
			tryRun('brew', ['install', 'zig']);
		} else if (process.platform === 'linux') {
			// pip's ziglang wheel provides a `zig`-compatible entry point without root.
			tryRun('python3', ['-m', 'pip', 'install', '--user', 'ziglang']);
		}
	}
	// Linux glibc arm64 cross needs the GNU cross toolchain.
	if (process.platform === 'linux') {
		tryRun('sh', ['-c', 'command -v apt-get >/dev/null 2>&1 && sudo apt-get update && sudo apt-get install -y gcc-aarch64-linux-gnu || true']);
	}
}

function main(): void {
	console.log(`[runtime-toolchain] Provisioning Rust build toolchain on ${process.platform}.`);
	ensureRustup();
	ensureCrossTooling();
	console.log('[runtime-toolchain] Done. build-runtime.ts will add the specific rustup target(s) per build.');
}

main();
