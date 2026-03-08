/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phonon Card Bridge - injected into card webview by the platform.
// Provides window.phonon API for card developers.
//
// Dual transport: detects VS Code WebviewElement (acquireVsCodeApi) and falls
// back to raw iframe postMessage. This lets the same bridge work in sandboxed
// webviews (production) and plain iframes (testing).

(function () {
	'use strict';

	// -- Transport detection --
	const vscodeApi = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;

	function sendToHost(msg) {
		if (vscodeApi) {
			vscodeApi.postMessage(msg);
		} else {
			window.parent.postMessage(msg, '*');
		}
	}

	const pending = new Map();
	let readyCallbacks = [];
	let initialized = false;

	window.phonon = {
		data: {
			fetch: function (entity, query) {
				return sendRequest('phonon:data:fetch', { entity: entity, query: query });
			},
			mutate: function (entity, operation, data) {
				return sendRequest('phonon:data:mutate', { entity: entity, operation: operation, data: data });
			}
		},
		navigate: function (viewId, params) {
			sendToHost({ type: 'phonon:navigate', viewId: viewId, params: params });
		},
		intent: function (description) {
			sendToHost({ type: 'phonon:intent', description: description });
		},
		setTitle: function (title) {
			sendToHost({ type: 'phonon:setTitle', title: title });
		},
		setLoading: function (loading) {
			sendToHost({ type: 'phonon:setLoading', loading: loading });
		},
		onReady: function (callback) {
			if (initialized) { callback(); }
			else { readyCallbacks.push(callback); }
		},
		params: {}
	};

	function generateId() {
		// Simple unique ID generation (no crypto.randomUUID dependency)
		return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
	}

	function sendRequest(type, payload) {
		return new Promise(function (resolve, reject) {
			const requestId = generateId();
			pending.set(requestId, { resolve: resolve, reject: reject });
			const msg = { type: type, requestId: requestId };
			for (const key in payload) {
				if (Object.prototype.hasOwnProperty.call(payload, key)) {
					msg[key] = payload[key];
				}
			}
			sendToHost(msg);
		});
	}

	window.addEventListener('message', function (event) {
		const msg = event.data;
		if (!msg || !msg.type) { return; }

		if (msg.type === 'phonon:data:response') {
			const p = pending.get(msg.requestId);
			if (p) {
				pending.delete(msg.requestId);
				if (msg.success) { p.resolve(msg.data); }
				else { p.reject(new Error(msg.error || 'Unknown error')); }
			}
		} else if (msg.type === 'phonon:params') {
			window.phonon.params = msg.params || {};
		} else if (msg.type === 'phonon:init') {
			initialized = true;
			const cbs = readyCallbacks;
			readyCallbacks = [];
			for (let i = 0; i < cbs.length; i++) { cbs[i](); }
		}
	});

	// Signal readiness to host
	sendToHost({ type: 'phonon:ready' });
})();
