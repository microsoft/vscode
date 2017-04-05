/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {
	'use strict';

	let MonacoEnvironment = (<any>self).MonacoEnvironment;
	let monacoBaseUrl = MonacoEnvironment && MonacoEnvironment.baseUrl ? MonacoEnvironment.baseUrl : '../../../';

	if (typeof (<any>self).define !== 'function' || !(<any>self).define.amd) {
		importScripts(monacoBaseUrl + 'vs/loader.js');
	}

	require.config({
		baseUrl: monacoBaseUrl,
		catchError: true
	});

	let loadCode = function (moduleId) {
		require([moduleId], function (ws) {
			setTimeout(function () {
				let messageHandler = ws.create((msg: any) => {
					(<any>self).postMessage(msg);
				}, null);

				self.onmessage = (e) => messageHandler.onmessage(e.data);
				while (beforeReadyMessages.length > 0) {
					self.onmessage(beforeReadyMessages.shift());
				}
			}, 0);
		});
	};

	let isFirstMessage = true;
	let beforeReadyMessages: MessageEvent[] = [];
	self.onmessage = (message) => {
		if (!isFirstMessage) {
			beforeReadyMessages.push(message);
			return;
		}

		isFirstMessage = false;
		loadCode(message.data);
	};
})();
