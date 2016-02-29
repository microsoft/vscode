/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

exports.collectModules = function() {
	return [{
		name: 'vs/base/common/worker/workerServer',
		exclude: [ 'vs/css', 'vs/nls', 'vs/text' ]
	}, {
		name: 'vs/base/common/worker/simpleWorker',
		exclude: [ 'vs/css', 'vs/nls', 'vs/text' ]
	}];
};
