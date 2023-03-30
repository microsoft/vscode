/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {

	const MonacoEnvironment = (<any>globalThis).MonacoEnvironment;
	// ESM-comment-begin
	const isESM = false;
	// ESM-comment-end
	// ESM-uncomment-begin
	// const isESM = true;
	// ESM-uncomment-end

	// SHARED-PROCESS: worker with node integration but with blink's import
	if (isESM && 'require' in globalThis) {
		const nodeRequire = require as any as (mode: string) => any;
		// VSCODE_GLOBALS: node_modules
		(<any>globalThis)._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => nodeRequire(String(mod)) });
	}

	const monacoBaseUrl = MonacoEnvironment && MonacoEnvironment.baseUrl ? MonacoEnvironment.baseUrl : '../../../';

	const trustedTypesPolicy = (
		typeof self.trustedTypes?.createPolicy === 'function'
			? self.trustedTypes?.createPolicy('amdLoader', {
				createScriptURL: value => value,
				createScript: (_, ...args: string[]) => {
					// workaround a chrome issue not allowing to create new functions
					// see https://github.com/w3c/webappsec-trusted-types/wiki/Trusted-Types-for-function-constructor
					const fnArgs = args.slice(0, -1).join(',');
					const fnBody = args.pop()!.toString();
					// Do not add a new line to fnBody, as this will confuse source maps.
					const body = `(function anonymous(${fnArgs}) { ${fnBody}\n})`;
					return body;
				}
			})
			: undefined
	);

	function canUseEval(): boolean {
		try {
			const func = (
				trustedTypesPolicy
					? globalThis.eval(<any>trustedTypesPolicy.createScript('', 'true'))
					: new Function('true')
			);
			func.call(globalThis);
			return true;
		} catch (err) {
			return false;
		}
	}

	function loadAMDLoader() {
		return new Promise<void>((resolve, reject) => {
			if (typeof (<any>globalThis).define === 'function' && (<any>globalThis).define.amd) {
				return resolve();
			}
			const loaderSrc: string | TrustedScriptURL = monacoBaseUrl + 'vs/loader.js';

			const isCrossOrigin = (/^((http:)|(https:)|(file:))/.test(loaderSrc) && loaderSrc.substring(0, globalThis.origin.length) !== globalThis.origin);
			if (!isCrossOrigin && canUseEval()) {
				// use `fetch` if possible because `importScripts`
				// is synchronous and can lead to deadlocks on Safari
				fetch(loaderSrc).then((response) => {
					if (response.status !== 200) {
						throw new Error(response.statusText);
					}
					return response.text();
				}).then((text) => {
					text = `${text}\n//# sourceURL=${loaderSrc}`;
					const func = (
						trustedTypesPolicy
							? globalThis.eval(trustedTypesPolicy.createScript('', text) as unknown as string)
							: new Function(text)
					);
					func.call(globalThis);
					resolve();
				}).then(undefined, reject);
				return;
			}

			if (trustedTypesPolicy) {
				importScripts(trustedTypesPolicy.createScriptURL(loaderSrc) as unknown as string);
			} else {
				importScripts(loaderSrc as string);
			}
			resolve();
		});
	}

	function configureAMDLoader() {
		require.config({
			baseUrl: monacoBaseUrl,
			catchError: true,
			trustedTypesPolicy,
			amdModulesPattern: /^vs\//
		});
	}

	function loadCode(moduleId: string): Promise<SimpleWorkerModule> {
		if (isESM) {
			// TODO: this won't work when bundling
			// My path is: vs/base/worker/workerMain.ts
			return import(`../../../${moduleId}.js`);
		} else {
			return loadAMDLoader().then(() => {
				configureAMDLoader();
				return new Promise<SimpleWorkerModule>((resolve, reject) => {
					require([moduleId], resolve, reject);
				});
			});
		}
	}

	interface MessageHandler {
		onmessage(msg: any, ports: readonly MessagePort[]): void;
	}

	// shape of vs/base/common/worker/simpleWorker.ts
	interface SimpleWorkerModule {
		create(postMessage: (msg: any, transfer?: Transferable[]) => void): MessageHandler;
	}

	function setupWorkerServer(ws: SimpleWorkerModule) {
		setTimeout(function () {
			const messageHandler = ws.create((msg: any, transfer?: Transferable[]) => {
				(<any>globalThis).postMessage(msg, transfer);
			});

			self.onmessage = (e: MessageEvent) => messageHandler.onmessage(e.data, e.ports);
			while (beforeReadyMessages.length > 0) {
				self.onmessage(beforeReadyMessages.shift()!);
			}
		}, 0);
	}

	// If the loader is already defined, configure it immediately
	// This helps in the bundled case, where we must load nls files
	// and they need a correct baseUrl to be loaded.
	if (typeof (<any>globalThis).define === 'function' && (<any>globalThis).define.amd) {
		configureAMDLoader();
	}

	let isFirstMessage = true;
	const beforeReadyMessages: MessageEvent[] = [];
	globalThis.onmessage = (message: MessageEvent) => {
		if (!isFirstMessage) {
			beforeReadyMessages.push(message);
			return;
		}

		isFirstMessage = false;
		loadCode(message.data).then((ws) => {
			setupWorkerServer(ws);
		}, (err) => {
			console.error(err);
		});
	};
})();
