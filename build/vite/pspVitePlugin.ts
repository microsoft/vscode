/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Plugin } from 'vite';
import { connectPspPublisher, type IPspPublisher } from '@vscode/psp';

interface IRecordedError {
	readonly message: string;
	readonly at: string;
	readonly file?: string;
	readonly stack?: string;
}

const HMR_IDLE_DEBOUNCE_MS = 300;

const log = (_msg: string, ..._rest: unknown[]) => { /* enable to debug: console.log(`[psp-vite] ${_msg}`, ..._rest); */ };

/**
 * Vite plugin that publishes Vite's lifecycle through the Process State Protocol so the
 * hosting VS Code terminal can show a live status / clickable doc for the dev server.
 *
 * No-op outside a PSP-enabled terminal (env vars missing).
 */
export function pspVitePlugin(opts: { clientName?: string } = {}): Plugin {
	let publisher: IPspPublisher | undefined;
	let isDevServer = false;
	let status: 'starting' | 'building' | 'idle' | 'error' = 'starting';
	let buildStartedAt: number | undefined;
	let lastBuildDurationMs: number | undefined;
	let lastFinishedAt: string | undefined;
	let lastError: string | undefined;
	let urls: readonly string[] = [];

	// Errors are keyed by file so they auto-clear when that file is re-transformed.
	// Errors without a file go under the synthetic key `''` and are cleared on the next HMR event.
	const activeErrors = new Map<string, IRecordedError>();

	const recordError = (msg: string, opts?: { file?: string; stack?: string }) => {
		const key = opts?.file ?? '';
		const entry: IRecordedError = {
			message: msg,
			at: new Date().toISOString(),
			file: opts?.file,
			stack: opts?.stack,
		};
		activeErrors.set(key, entry);
		lastError = msg;
		status = 'error';
		log('error recorded', entry);
		schedulePublish();
	};

	const clearErrorForFile = (file: string) => {
		let changed = false;
		if (activeErrors.delete(file)) {
			changed = true;
		}
		// Also drop generic (unkeyed) errors — assume the latest save resolved them.
		if (activeErrors.delete('')) {
			changed = true;
		}
		if (changed) {
			log('cleared errors for', file);
			if (activeErrors.size === 0) {
				lastError = undefined;
			} else {
				lastError = [...activeErrors.values()].at(-1)?.message;
			}
			schedulePublish();
		}
	};

	let pendingPublish: NodeJS.Immediate | undefined;
	const publish = () => {
		pendingPublish = undefined;
		const errors = [...activeErrors.values()];
		const doc = {
			status,
			urls,
			lastBuildDurationMs,
			lastFinishedAt,
			lastError,
			errors,
		};
		log(`publish (publisher=${publisher ? 'connected' : 'pending'})`, { status, urls, errorCount: errors.length });
		publisher?.setDoc(doc);
	};
	const schedulePublish = () => {
		if (pendingPublish) {
			return;
		}
		pendingPublish = setImmediate(publish);
	};

	let hmrIdleTimer: NodeJS.Timeout | undefined;
	const markIdleAfterHmr = () => {
		if (hmrIdleTimer) {
			clearTimeout(hmrIdleTimer);
		}
		hmrIdleTimer = setTimeout(() => {
			hmrIdleTimer = undefined;
			if (buildStartedAt !== undefined) {
				lastBuildDurationMs = Date.now() - buildStartedAt;
				buildStartedAt = undefined;
			}
			lastFinishedAt = new Date().toISOString();
			status = activeErrors.size > 0 ? 'error' : 'idle';
			schedulePublish();
		}, HMR_IDLE_DEBOUNCE_MS);
	};

	const ensurePublisher = async () => {
		if (!publisher) {
			log('connecting publisher…', {
				endpoint: process.env.PROCESS_STATE_PROTOCOL_ENDPOINT,
				hasToken: !!process.env.PROCESS_STATE_PROTOCOL_TOKEN,
			});
			publisher = await connectPspPublisher({ client: { name: opts.clientName ?? 'vite' } });
			log('publisher connected');
		}
	};

	return {
		name: 'vscode:psp',
		apply: () => true,
		configureServer(server) {
			log('configureServer called', {
				hasHttpServer: !!server.httpServer,
				httpServerListening: server.httpServer?.listening,
				hasResolvedUrls: !!server.resolvedUrls,
			});
			isDevServer = true;
			ensurePublisher().then(schedulePublish);

			// Wrap the logger so dev-mode errors (transform / SSR / plugin errors that don't
			// propagate through buildEnd) get captured into the PSP doc.
			const origError = server.config.logger.error.bind(server.config.logger);
			server.config.logger.error = (msg, options) => {
				try {
					const err = options?.error;
					const text = typeof msg === 'string' ? msg : String(msg);
					recordError(err?.message ?? text, {
						file: (err as { id?: string } | undefined)?.id,
						stack: err?.stack,
					});
				} catch {
					// best-effort; never break logging
				}
				origError(msg, options);
			};

			// Vite also broadcasts compile errors over the HMR ws as `{ type: 'error', err }`.
			server.ws.on('connection', () => log('hmr ws client connected'));

			const markReady = (reason: string) => {
				const resolved = server.resolvedUrls;
				if (resolved) {
					urls = [...resolved.local, ...resolved.network];
				}
				if (status !== 'error') {
					status = 'idle';
				}
				lastFinishedAt = new Date().toISOString();
				log(`markReady (${reason})`, { urls, resolvedUrls: !!resolved });
				schedulePublish();
			};

			const httpServer = server.httpServer;
			if (!httpServer) {
				// Middleware mode — no http server. Mark ready immediately.
				markReady('no httpServer (middleware mode)');
				return;
			}

			if (httpServer.listening) {
				markReady('httpServer already listening');
			} else {
				log('attaching listening handler');
				httpServer.once('listening', () => markReady('listening event'));
			}

			// Belt-and-suspenders: Vite populates `resolvedUrls` synchronously right after the
			// 'listening' callback. If something swallows the event, this still recovers.
			let pollTicks = 0;
			const pollHandle = setInterval(() => {
				pollTicks++;
				if (pollTicks % 8 === 0) {
					log(`poll tick ${pollTicks}`, {
						status,
						httpServerListening: httpServer.listening,
						hasResolvedUrls: !!server.resolvedUrls,
					});
				}
				if (server.resolvedUrls) {
					clearInterval(pollHandle);
					if (status === 'starting') {
						markReady('poll detected resolvedUrls');
					}
				}
			}, 250);
			pollHandle.unref?.();
		},
		async buildStart() {
			log('buildStart', { isDevServer });
			await ensurePublisher();
			// In dev server mode buildStart fires once at startup. We're still 'starting' until
			// the http server is listening — don't flip back to 'building' here.
			if (!isDevServer) {
				status = 'building';
				buildStartedAt = Date.now();
				schedulePublish();
			}
		},
		buildEnd(error) {
			// Only meaningful for `vite build`. In dev mode this fires on server close.
			if (isDevServer) {
				return;
			}
			if (buildStartedAt !== undefined) {
				lastBuildDurationMs = Date.now() - buildStartedAt;
				buildStartedAt = undefined;
			}
			lastFinishedAt = new Date().toISOString();
			if (error) {
				status = 'error';
				lastError = error.message;
			} else {
				status = 'idle';
				lastError = undefined;
			}
			schedulePublish();
		},
		handleHotUpdate(ctx) {
			log('handleHotUpdate', { file: ctx.file });
			clearErrorForFile(ctx.file);
			if (activeErrors.size === 0) {
				status = 'building';
			}
			if (buildStartedAt === undefined) {
				buildStartedAt = Date.now();
			}
			schedulePublish();
			markIdleAfterHmr();
		},
		closeBundle() {
			publisher?.close();
			publisher = undefined;
		},
	};
}

