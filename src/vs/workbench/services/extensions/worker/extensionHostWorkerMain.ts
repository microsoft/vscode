/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {

	let MonacoEnvironment = (<any>self).MonacoEnvironment;
	let monacoBaseUrl = MonacoEnvironment && MonacoEnvironment.baseUrl ? MonacoEnvironment.baseUrl : '../../../../../';

	if (typeof (<any>self).define !== 'function' || !(<any>self).define.amd) {
		importScripts(monacoBaseUrl + 'vs/loader.js');
	}

	require.config({
		baseUrl: monacoBaseUrl,
		catchError: true,
		createTrustedScriptURL: (value: string) => value
	});

	require(['vs/workbench/services/extensions/worker/extensionHostWorker'], () => { }, err => console.error(err));
})();
