/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
(function () {
	const id = document.location.search.match(/\bid=([\w-]+)/)[1];
	const onElectron = /platform=electron/.test(document.location.search);

	const hostMessaging = new class HostMessaging {
		constructor() {
			/** @type {Map<string, Array<(event: MessageEvent, data: any) => void>>} */
			this.handlers = new Map();

			window.addEventListener('message', (e) => {
				if (e.data && (e.data.command === 'onmessage' || e.data.command === 'do-update-state')) {
					// Came from inner iframe
					this.postMessage(e.data.command, e.data.data);
					return;
				}

				const channel = e.data.channel;
				const handlers = this.handlers.get(channel);
				if (handlers) {
					for (const handler of handlers) {
						handler(e, e.data.args);
					}
				} else {
					console.log('no handler for ', e);
				}
			});
		}

		/**
		 * @param {string} channel
		 * @param {any} data
		 */
		postMessage(channel, data) {
			window.parent.postMessage({ target: id, channel, data }, '*');
		}

		/**
		 * @param {string} channel
		 * @param {(event: MessageEvent, data: any) => void} handler
		 */
		onMessage(channel, handler) {
			let handlers = this.handlers.get(channel);
			if (!handlers) {
				handlers = [];
				this.handlers.set(channel, handlers);
			}
			handlers.push(handler);
		}
	}();

	function fatalError(/** @type {string} */ message) {
		console.error(`Webview fatal error: ${message}`);
		hostMessaging.postMessage('fatal-error', { message });
	}

	/** @type {Promise<void>} */
	const workerReady = new Promise(async (resolveWorkerReady) => {
		if (onElectron) {
			return resolveWorkerReady();
		}

		if (!areServiceWorkersEnabled()) {
			fatalError('Service Workers are not enabled in browser. Webviews will not work.');
			return resolveWorkerReady();
		}

		const expectedWorkerVersion = 1;

		navigator.serviceWorker.register('service-worker.js').then(
			async registration => {
				await navigator.serviceWorker.ready;

				const versionHandler = (event) => {
					if (event.data.channel !== 'version') {
						return;
					}

					navigator.serviceWorker.removeEventListener('message', versionHandler);
					if (event.data.version === expectedWorkerVersion) {
						return resolveWorkerReady();
					} else {
						// If we have the wrong version, try once to unregister and re-register
						return registration.update()
							.then(() => navigator.serviceWorker.ready)
							.finally(resolveWorkerReady);
					}
				};
				navigator.serviceWorker.addEventListener('message', versionHandler);
				registration.active.postMessage({ channel: 'version' });
			},
			error => {
				fatalError(`Could not register service workers: ${error}.`);
				resolveWorkerReady();
			});

		const forwardFromHostToWorker = (channel) => {
			hostMessaging.onMessage(channel, event => {
				navigator.serviceWorker.ready.then(registration => {
					registration.active.postMessage({ channel: channel, data: event.data.args });
				});
			});
		};
		forwardFromHostToWorker('did-load-resource');
		forwardFromHostToWorker('did-load-localhost');

		navigator.serviceWorker.addEventListener('message', event => {
			if (['load-resource', 'load-localhost'].includes(event.data.channel)) {
				hostMessaging.postMessage(event.data.channel, event.data);
			}
		});
	});

	function areServiceWorkersEnabled() {
		try {
			return !!navigator.serviceWorker;
		} catch (e) {
			return false;
		}
	}

	const unloadMonitor = new class {

		constructor() {
			this.confirmBeforeClose = 'keyboardOnly';
			this.isModifierKeyDown = false;

			hostMessaging.onMessage('set-confirm-before-close', (_e, /** @type {string} */ data) => {
				this.confirmBeforeClose = data;
			});

			hostMessaging.onMessage('content', (_e, /** @type {any} */ data) => {
				this.confirmBeforeClose = data.confirmBeforeClose;
			});

			window.addEventListener('beforeunload', (event) => {
				if (onElectron) {
					return;
				}

				switch (this.confirmBeforeClose) {
					case 'always':
						{
							event.preventDefault();
							event.returnValue = '';
							return '';
						}
					case 'never':
						{
							break;
						}
					case 'keyboardOnly':
					default: {
						if (this.isModifierKeyDown) {
							event.preventDefault();
							event.returnValue = '';
							return '';
						}
						break;
					}
				}
			});
		}

		onIframeLoaded(/** @type {HTMLIFrameElement} */frame) {
			frame.contentWindow.addEventListener('keydown', e => {
				this.isModifierKeyDown = e.metaKey || e.ctrlKey || e.altKey;
			});

			frame.contentWindow.addEventListener('keyup', () => {
				this.isModifierKeyDown = false;
			});
		}
	};

	/** @type {import('./main').WebviewHost} */
	const host = {
		postMessage: hostMessaging.postMessage.bind(hostMessaging),
		onMessage: hostMessaging.onMessage.bind(hostMessaging),
		ready: workerReady,
		fakeLoad: !onElectron,
		onElectron: onElectron,
		onIframeLoaded: (/** @type {HTMLIFrameElement} */ frame) => {
			unloadMonitor.onIframeLoaded(frame);
		},
		rewriteCSP: onElectron
			? (csp) => {
				return csp.replace(/vscode-resource:(?=(\s|;|$))/g, 'vscode-webview-resource:');
			}
			: (csp, endpoint) => {
				const endpointUrl = new URL(endpoint);
				return csp.replace(/(vscode-webview-resource|vscode-resource):(?=(\s|;|$))/g, endpointUrl.origin);
			}
	};

	(/** @type {any} */ (window)).createWebviewManager(host);
}());
