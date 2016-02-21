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

	// ---- beautify-html (shared btw html and xml) -----------------------------
	worker.define('vs/languages/lib/common/beautify-html');

	// ---- css -----------------------------------
	worker.define('vs/languages/css/common/services/browsers');
	common.define('vs/languages/css/common/css')
		.combine(worker)
			.define('vs/languages/css/common/cssWorker', ['vs/languages/css/common/services/browsers']);

	// ---- less ---------------------------------------
	common.define('vs/languages/less/common/less')
		.combine(worker)
			.define('vs/languages/less/common/lessWorker', ['vs/languages/css/common/cssWorker', 'vs/languages/css/common/services/browsers']);

	// ---- sass ---------------------------------------
	common.define('vs/languages/sass/common/sass')
		.combine(worker)
			.define('vs/languages/sass/common/sassWorker', ['vs/languages/css/common/cssWorker', 'vs/languages/css/common/services/browsers']);

	// ---- handlebars ----------------------------------
	common.define('vs/languages/handlebars/common/handlebars', ['vs/languages/html/common/html']);

	// ---- html ----------------------------------
	common.define('vs/languages/html/common/html')
		.combine(worker)
			.define('vs/languages/html/common/htmlWorker', ['vs/languages/lib/common/beautify-html']);

	// ---- markdown -------------------------------
	common.define('vs/languages/markdown/common/markdown')
		.combine(worker)
			.define('vs/languages/markdown/common/markdownWorker');

	// ---- php -----------------------------------
	common.define('vs/languages/php/common/php');

	// ---- razor -----------------------------------
	common.define('vs/languages/razor/common/razor', ['vs/languages/html/common/html'])
		.combine(worker)
			.define('vs/languages/razor/common/razorWorker', ['vs/languages/html/common/htmlWorker', 'vs/languages/lib/common/beautify-html'] );

	return result;
};