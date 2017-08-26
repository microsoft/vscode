/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/platform/commands/common/commandService';
import { IExtensionService, ExtensionPointContribution, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IExtensionPoint } from 'vs/platform/extensions/common/extensionsRegistry';

class SimpleExtensionService implements IExtensionService {
	_serviceBrand: any;
	activateByEvent(activationEvent: string): TPromise<void> {
		return this.onReady().then(() => { });
	}
	onReady(): TPromise<boolean> {
		return TPromise.as(true);
	}
	readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): TPromise<ExtensionPointContribution<T>[]> {
		return TPromise.as([]);
	}
	getExtensionsStatus() {
		return undefined;
	}
	getExtensionsActivationTimes() {
		return undefined;
	}
	getExtensions(): TPromise<IExtensionDescription[]> {
		return TPromise.wrap([]);
	}
	restartExtensionHost(): void {
	}
}

suite('CommandService', function () {

	let commandRegistration: IDisposable;

	setup(function () {
		commandRegistration = CommandsRegistry.registerCommand('foo', function () { });
	});

	teardown(function () {
		commandRegistration.dispose();
	});

	test('activateOnCommand', function () {

		let lastEvent: string;

		let service = new CommandService(new InstantiationService(), new class extends SimpleExtensionService {
			activateByEvent(activationEvent: string): TPromise<void> {
				lastEvent = activationEvent;
				return super.activateByEvent(activationEvent);
			}
		});

		return service.executeCommand('foo').then(() => {
			assert.ok(lastEvent, 'onCommand:foo');
			return service.executeCommand('unknownCommandId');
		}).then(() => {
			assert.ok(false);
		}, () => {
			assert.ok(lastEvent, 'onCommand:unknownCommandId');
		});
	});

	test('fwd activation error', function () {

		let service = new CommandService(new InstantiationService(), new class extends SimpleExtensionService {
			activateByEvent(activationEvent: string): TPromise<void> {
				return TPromise.wrapError<void>(new Error('bad_activate'));
			}
		});

		return service.executeCommand('foo').then(() => assert.ok(false), err => {
			assert.equal(err.message, 'bad_activate');
		});
	});

	test('!onReady, but executeCommand', function () {

		let callCounter = 0;
		let reg = CommandsRegistry.registerCommand('bar', () => callCounter += 1);

		let resolve: Function;
		let service = new CommandService(new InstantiationService(), new class extends SimpleExtensionService {
			onReady() {
				return new TPromise<boolean>(_resolve => { resolve = _resolve; });
			}
		});

		return service.executeCommand('bar').then(() => {
			reg.dispose();
			assert.equal(callCounter, 1);
		});
	});

});