/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import type { ProgressReport } from '@vscode/test-electron';

const childFlag = '--download-stable-code';

export interface IStableCodeDownloadOptions {
	readonly version: string;
	readonly cachePath: string;
	readonly onProgress: (report: ProgressReport) => void;
	readonly onStall: (message: string) => void;
	/** The download is stalled when fewer than `stallMinBytes` arrive within `stallWindowMs`. */
	readonly stallWindowMs?: number;
	readonly stallMinBytes?: number;
}

type ChildMessage =
	| { readonly type: 'progress'; readonly report: ProgressReport }
	| { readonly type: 'done'; readonly executable: string }
	| { readonly type: 'error'; readonly message: string };

/**
 * Downloads and extracts a VS Code release with `@vscode/test-electron`, in a child process so that a stalled
 * download can be stopped.
 *
 * Some connections stay open at a fraction of the usual speed for as long as they last (seen on the macOS lab
 * agents, see IcM 891066261). `@vscode/test-electron` only has an idle timeout, which a slow trickle keeps
 * resetting, so such a download runs past the smoke test's setup timeout. When fewer than `stallMinBytes`
 * arrive within `stallWindowMs`, this kills the child, which closes its connection, and rejects, so that the
 * caller can retry on a new connection.
 */
export function downloadStableCode(options: IStableCodeDownloadOptions): Promise<string> {
	const stallWindowMs = options.stallWindowMs ?? 30_000;
	const stallMinBytes = options.stallMinBytes ?? 10 * 1024 * 1024;

	return new Promise<string>((resolve, reject) => {
		const child = cp.fork(__filename, [childFlag], { stdio: 'inherit' });
		let settled = false;
		let bytesSoFar = 0;
		let totalBytes = 0;
		let windowStart: { readonly at: number; readonly bytes: number } | undefined;

		const settle = (error: Error | undefined, executable?: string) => {
			if (settled) {
				return;
			}
			settled = true;
			clearInterval(stallCheck);
			if (error) {
				child.kill('SIGKILL');
				reject(error);
			} else {
				resolve(executable!);
			}
		};

		const stallCheck = setInterval(() => {
			if (!windowStart || bytesSoFar >= totalBytes) {
				return;
			}
			const now = Date.now();
			if (now - windowStart.at < stallWindowMs) {
				return;
			}
			const received = bytesSoFar - windowStart.bytes;
			if (received < stallMinBytes) {
				const message = `download stalled: ${received} bytes in the last ${Math.round((now - windowStart.at) / 1000)}s (${bytesSoFar}/${totalBytes}), stopping it to retry on a new connection`;
				options.onStall(message);
				settle(new Error(message));
			} else {
				windowStart = { at: now, bytes: bytesSoFar };
			}
		}, 1000);

		child.on('message', (message: ChildMessage) => {
			switch (message.type) {
				case 'progress':
					if (message.report.stage === 'downloading') {
						bytesSoFar = message.report.bytesSoFar;
						totalBytes = message.report.totalBytes;
						windowStart ??= { at: Date.now(), bytes: bytesSoFar };
					}
					options.onProgress(message.report);
					break;
				case 'done':
					settle(undefined, message.executable);
					break;
				case 'error':
					settle(new Error(message.message));
					break;
			}
		});
		child.on('error', error => settle(error));
		child.on('exit', (code, signal) => settle(new Error(`download process exited before finishing (code ${code}, signal ${signal})`)));

		child.send({ version: options.version, cachePath: options.cachePath });
	});
}

async function runChild(): Promise<void> {
	// Exit with the smoke runner, for example when its setup times out, instead of downloading into a folder it removes.
	process.once('disconnect', () => process.exit(1));
	const vscodetest = await import('@vscode/test-electron');
	const send = (message: ChildMessage) => new Promise<void>(resolve => process.send!(message, () => resolve()));
	process.once('message', async ({ version, cachePath }: { version: string; cachePath: string }) => {
		let lastDownloadReportAt = 0;
		try {
			const executable = await vscodetest.download({
				cachePath,
				version,
				extractSync: true,
				reporter: {
					report: report => {
						if (report.stage === 'downloading') {
							// The parent only needs the byte count every so often, not for every chunk.
							const now = Date.now();
							if (now - lastDownloadReportAt < 250 && report.bytesSoFar < report.totalBytes) {
								return;
							}
							lastDownloadReportAt = now;
						}
						void send({ type: 'progress', report });
					},
					error: error => void send({ type: 'error', message: String(error) }),
				},
			});
			await send({ type: 'done', executable });
			process.exit(0);
		} catch (error) {
			await send({ type: 'error', message: String(error) });
			process.exit(1);
		}
	});
}

if (require.main === module && process.argv.includes(childFlag)) {
	void runChild();
}
