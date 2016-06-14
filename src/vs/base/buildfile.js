/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

exports.collectModules = function() {
	return [{
		name: 'vs/base/common/worker/workerServer',
		include: [ 'vs/editor/common/worker/editorWorkerServer' ],
		exclude: [ 'vs/css', 'vs/nls' ]
	}, {
		name: 'vs/base/common/worker/simpleWorker',
		include: [ 'vs/editor/common/services/editorSimpleWorker' ],
		exclude: [ 'vs/css', 'vs/nls' ]
	}];
};
