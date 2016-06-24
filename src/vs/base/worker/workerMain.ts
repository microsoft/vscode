/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {
	'use strict';

	var MonacoEnvironment = (<any>self).MonacoEnvironment;
	var monacoBaseUrl = MonacoEnvironment && MonacoEnvironment.baseUrl ? MonacoEnvironment.baseUrl : '../../../';

	importScripts(monacoBaseUrl + 'vs/loader.js');

	require.config({
		baseUrl: monacoBaseUrl,
		catchError: true
	});

	var loadCode = function(moduleId) {
		require([moduleId], function(ws) {
			var messageHandler = ws.create((msg:any) => {
				(<any>self).postMessage(msg);
			}, null);

			self.onmessage = (e) => messageHandler.onmessage(e.data);
			while(beforeReadyMessages.length > 0) {
				self.onmessage(beforeReadyMessages.shift());
			}
		});
	};

	var isFirstMessage = true;
	var beforeReadyMessages:MessageEvent[] = [];
	self.onmessage = (message) => {
		if (!isFirstMessage) {
			beforeReadyMessages.push(message);
			return;
		}

		isFirstMessage = false;
		loadCode(message.data);
	};
})();
