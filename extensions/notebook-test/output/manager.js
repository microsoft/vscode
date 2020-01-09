/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var base = require('@jupyter-widgets/base');
var controls = require('@jupyter-widgets/controls');
var LuminoWidget = require('@lumino/widgets').Widget;

class WidgetManager extends base.ManagerBase {
	constructor(el) {
		super();
		this.el = el;
	}

	loadClass(className, moduleName, moduleVersion) {
		return new Promise(function(resolve, reject) {
			if (moduleName === '@jupyter-widgets/controls') {
				resolve(controls);
			} else if (moduleName === '@jupyter-widgets/base') {
				resolve(base)
			} else {
				var fallback = function(err) {
					let failedId = err.requireModules && err.requireModules[0];
					if (failedId) {
						console.log(`Falling back to unpkg.com for ${moduleName}@${moduleVersion}`);
						window.require([`https://unpkg.com/${moduleName}@${moduleVersion}/dist/index.js`], resolve, reject);
					} else {
						throw err;
					}
				};
				window.require([`${moduleName}.js`], resolve, fallback);
			}
		}).then(function(module) {
			if (module[className]) {
				return module[className];
			} else {
				return Promise.reject(`Class ${className} not found in module ${moduleName}@${moduleVersion}`);
			}
		});
	}

	display_view(msg, view, options) {
		var that = this;
		return Promise.resolve(view).then(function(view) {
			let el = options.el || that.el;
			LuminoWidget.attach(view.pWidget, el);
			view.on('remove', function() {
				console.log('View removed', view);
			});
			return view;
		});
	};

	_get_comm_info() {
		return Promise.resolve({});
	};

	_create_comm() {
		return Promise.reject('no comms available');
	}
}

exports.WidgetManager = WidgetManager;