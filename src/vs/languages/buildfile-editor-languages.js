/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

exports.collectModules = function(args) {

	var result = [];

	// ---- json ---------------------------------
	result.push({
		name: 'vs/languages/json/common/json',
		exclude: [
			'vs/css',
			'vs/nls',
			'vs/editor/common/languages.common'
		]
	});

	result.push({
		name: 'vs/languages/json/common/jsonWorker',
		exclude: [
			'vs/css',
			'vs/nls',
			'vs/editor/common/languages.common',
			'vs/languages/json/common/json',
			'vs/editor/common/languages.common',
			'vs/base/common/worker/workerServer',
			'vs/editor/common/worker/editorWorkerServer'
		]
	});

	return result;
};