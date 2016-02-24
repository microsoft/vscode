/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

exports.collectModules = function() {
	return [{
		name: 'vs/editor/common/worker/editorWorkerServer',
		include: [ 'vs/base/common/severity' ],
		exclude: [ 'vs/base/common/worker/workerServer', 'vs/css', 'vs/nls', 'vs/text' ]
	}, {
		name: 'vs/editor/common/services/editorSimpleWorker',
		exclude: [ 'vs/base/common/worker/simpleWorker', 'vs/css', 'vs/nls', 'vs/text' ]
	}];
};
