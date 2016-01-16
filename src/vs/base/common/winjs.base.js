/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

define(['./winjs.base.raw', 'vs/base/common/errors'], function (raw, __Errors__) {
	'use strict';

	var winjs = raw;

	var outstandingPromiseErrors = {};
	function promiseErrorHandler(e) {

		//
		// e.detail looks like: { exception, error, promise, handler, id, parent }
		//
		var details = e.detail;
		var id = details.id;

		// If the error has a parent promise then this is not the origination of the
		//  error so we check if it has a handler, and if so we mark that the error
		//  was handled by removing it from outstandingPromiseErrors
		//
		if (details.parent) {
			if (details.handler && outstandingPromiseErrors) {
				delete outstandingPromiseErrors[id];
			}
			return;
		}

		// Indicate that this error was originated and needs to be handled
		outstandingPromiseErrors[id] = details;

		// The first time the queue fills up this iteration, schedule a timeout to
		// check if any errors are still unhandled.
		if (Object.keys(outstandingPromiseErrors).length === 1) {
			setTimeout(function () {
				var errors = outstandingPromiseErrors;
				outstandingPromiseErrors = {};
				Object.keys(errors).forEach(function (errorId) {
					var error = errors[errorId];
					if(error.exception) {
						__Errors__.onUnexpectedError(error.exception);
					} else if(error.error) {
						__Errors__.onUnexpectedError(error.error);
					}
					console.log("WARNING: Promise with no error callback:" + error.id);
					console.log(error);
					if(error.exception) {
						console.log(error.exception.stack);
					}
				});
			}, 0);
		}
	}

	winjs.Promise.addEventListener("error", promiseErrorHandler);


	function decoratePromise(promise, completeCallback, errorCallback) {
		var pc, pe, pp;

		var resultPromise = new winjs.Promise(
			function (c, e, p) {
				pc = c;
				pe = e;
				pp = p;
			}, function () {
				promise.cancel();
			}
		);

		promise.then(function (r) {
			if (completeCallback) {
				completeCallback(r);
			}
			pc(r);
		}, function (e) {
			if (errorCallback) {
				errorCallback(e);
			}
			pe(e);
		}, pp);

		return resultPromise;
	}

	return {
		decoratePromise: decoratePromise,
		Class: winjs.Class,
		xhr: winjs.xhr,
		Promise: winjs.Promise,
		TPromise: winjs.Promise,
		PPromise: winjs.Promise,
		Utilities: winjs.Utilities
	};
});