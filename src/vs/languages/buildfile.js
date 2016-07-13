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
			exclude: ['vs/css', 'vs/nls'].concat(this.modules).concat(excludes)
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

	// ---- beautify-html (shared btw html and xml) -----------------------------
	worker.define('vs/languages/lib/common/beautify-html');

	// ---- handlebars ----------------------------------
	common.define('vs/languages/handlebars/common/handlebars', ['vs/languages/html/common/html']);

	// ---- html ----------------------------------
	common.define('vs/languages/html/common/html')
		.combine(worker)
			.define('vs/languages/html/common/htmlWorker', ['vs/languages/lib/common/beautify-html']);

	// ---- php -----------------------------------
	common.define('vs/languages/php/common/php');

	// ---- razor -----------------------------------
	common.define('vs/languages/razor/common/razor', ['vs/languages/html/common/html'])
		.combine(worker)
			.define('vs/languages/razor/common/razorWorker', ['vs/languages/html/common/htmlWorker', 'vs/languages/lib/common/beautify-html'] );

	return result;
};