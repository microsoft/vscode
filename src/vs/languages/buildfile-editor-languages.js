/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var EntryPoint = (function() {
	function toArray(param) {
		if (!param) {
			return [];
		}
		if (!Array.isArray(param)) {
			return [param];
		}
		return param;
	}

	function EntryPoint(result, modules) {
		this.result = result;
		this.modules = toArray(modules);
	}
	EntryPoint.prototype.define = function(moduleId, excludes) {
		excludes = toArray(excludes);
		this.result.push({
			name: moduleId,
			exclude: ['vs/css', 'vs/nls', 'vs/text'].concat(this.modules).concat(excludes)
		});
		return new EntryPoint(this.result, this.modules.concat([moduleId].concat(excludes)));
	};
	EntryPoint.prototype.combine = function(other) {
		return new EntryPoint(this.result, this.modules.concat(other.modules));
	};
	return EntryPoint;
})();
exports.collectModules = function(args) {

	var result = [];
	var common = new EntryPoint(result, 'vs/editor/common/languages.common');
	var worker = new EntryPoint(result, ['vs/editor/common/languages.common', 'vs/base/common/worker/workerServer', 'vs/editor/common/worker/editorWorkerServer']);

	// ---- json ---------------------------------
	common.define('vs/languages/json/common/json')
		.combine(worker)
			.define('vs/languages/json/common/jsonWorker');

	// ---- shared between javascript and typescript -----------------------------------
	common.define('vs/languages/typescript/common/lib/typescriptServices');
	common.define('vs/languages/typescript/common/typescript', 'vs/languages/typescript/common/lib/typescriptServices');
	var SHARED_JS_TS = ['vs/languages/typescript/common/lib/typescriptServices', 'vs/languages/typescript/common/typescript'];

	// ---- typescript -----------------------------------
	var particpantExcludes = common.define('vs/languages/typescript/common/typescriptMode', SHARED_JS_TS)
		.combine(worker)
			.define('vs/languages/typescript/common/typescriptWorker2');

	particpantExcludes.define('vs/languages/typescript/common/js/globalVariableRewriter');
	particpantExcludes.define('vs/languages/typescript/common/js/importAndExportRewriter');
	particpantExcludes.define('vs/languages/typescript/common/js/angularServiceRewriter');
	particpantExcludes.define('vs/languages/typescript/common/js/defineRewriter');
	particpantExcludes.define('vs/languages/typescript/common/js/es6PropertyDeclarator');
	particpantExcludes.define('vs/languages/typescript/common/js/requireRewriter');

	// ---- javascript ----------------------------
	common.define('vs/languages/javascript/common/javascript', SHARED_JS_TS.concat(['vs/languages/typescript/common/typescriptMode']))
		.combine(worker)
			.define('vs/languages/javascript/common/javascriptWorker', ['vs/languages/typescript/common/typescriptWorker2']);

	return result;
};