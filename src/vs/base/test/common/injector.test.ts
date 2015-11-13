/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import injector = require('vs/base/common/injector');

suite('Injection test', () => {

	test('test inject service', function() {
		var didInjectFoo = false;
		var didInjectBar = false;
		var checkCount = 0;

		var target = {
			_serviceFoo: null,
			_serviceBar: null,
			injectFoo: function(service) {
				this._serviceFoo = service;
				didInjectFoo = true;
			},
			injectBar: function(s) {
				this._serviceBar = s;
				didInjectBar = true;
			},
			check: function() {
				this._serviceFoo.check();
				this._serviceBar.check();
			}
		}

		var service = {
			check: function() {
				checkCount++;
			}
		};

		var container = new injector.Container();
		container.registerService('foo', service);
		container.registerService('bar', service);

		container.injectTo(target);
		target.check();

		assert(didInjectFoo);
		assert(didInjectBar);
		assert.equal(checkCount, 2);
	});


	test('test inject service with chaining', function() {
		var didDoubleInjectFoo = false;

		var target = {
			_serviceFoo: null,
			_serviceBar: null,
			injectFoo: function(service) {
				this._serviceFoo = service;
			},
			injectBar: function(s) {
				this._serviceBar = s;
			},
			check: function() {
				this._serviceFoo.check();
				this._serviceBar.check();
			}
		};

		var service = {
			check: function() {}
		};
		var service1 = {
			check: function() {
				didDoubleInjectFoo = true;
			}
		};

		var container = new injector.Container();
		container.registerService('foo', service);

		var container1 = new injector.Container();
		container1.registerService('bar', service);
		container1.registerService('foo', service1); // will be ignored


		container.setParent(container1);

		container.injectTo(target);
		target.check();
		assert(!didDoubleInjectFoo);
	});

	test('inject does not inject target with target', function() {

		var target = {
			injectFoo: function(s) {
				assert(target !== s);
			}
		};

		var service =  { };

		var parent = new injector.Container();
		parent.registerService('foo', parent);

		var container = parent.createChild();
		container.registerService('foo', target);

		container.injectTo(target);

	});
});
