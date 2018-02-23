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
import { IExtensionService, ExtensionPointContribution, IExtensionDescription, ProfileSession } from 'vs/platform/extensions/common/extensions';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IExtensionPoint } from 'vs/platform/extensions/common/extensionsRegistry';
import Event, { Emitter } from 'vs/base/common/event';
import { NullLogService } from 'vs/platform/log/common/log';

class SimpleExtensionService implements IExtensionService {
	_serviceBrand: any;
	private _onDidRegisterExtensions = new Emitter<void>();
	get onDidRegisterExtensions(): Event<void> {
		return this._onDidRegisterExtensions.event;
	}
	onDidChangeExtensionsStatus = null;
	activateByEvent(activationEvent: string): TPromise<void> {
		return this.whenInstalledExtensionsRegistered().then(() => { });
	}
	whenInstalledExtensionsRegistered(): TPromise<boolean> {
		return TPromise.as(true);
	}
	readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): TPromise<ExtensionPointContribution<T>[]> {
		return TPromise.as([]);
	}
	getExtensionsStatus() {
		return undefined;
	}
	getExtensions(): TPromise<IExtensionDescription[]> {
		return TPromise.wrap([]);
	}
	canProfileExtensionHost() {
		return false;
	}
	startExtensionHostProfile(): TPromise<ProfileSession> {
		throw new Error('Not implemented');
	}
	restartExtensionHost(): void {
	}
	startExtensionHost(): void {
	}
	stopExtensionHost(): void {
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
		}, new NullLogService());

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
		}, new NullLogService());

		return service.executeCommand('foo').then(() => assert.ok(false), err => {
			assert.equal(err.message, 'bad_activate');
		});
	});

	test('!onReady, but executeCommand', function () {

		let callCounter = 0;
		let reg = CommandsRegistry.registerCommand('bar', () => callCounter += 1);

		let service = new CommandService(new InstantiationService(), new class extends SimpleExtensionService {
			whenInstalledExtensionsRegistered() {
				return new TPromise<boolean>(_resolve => { /*ignore*/ });
			}
		}, new NullLogService());

		service.executeCommand('bar');
		assert.equal(callCounter, 1);
		reg.dispose();
	});

	test('issue #34913: !onReady, unknown command', function () {

		let callCounter = 0;
		let resolveFunc: Function;
		const whenInstalledExtensionsRegistered = new TPromise<boolean>(_resolve => { resolveFunc = _resolve; });

		let service = new CommandService(new InstantiationService(), new class extends SimpleExtensionService {
			whenInstalledExtensionsRegistered() {
				return whenInstalledExtensionsRegistered;
			}
		}, new NullLogService());

		let r = service.executeCommand('bar');
		assert.equal(callCounter, 0);

		let reg = CommandsRegistry.registerCommand('bar', () => callCounter += 1);
		resolveFunc(true);

		return r.then(() => {
			reg.dispose();
			assert.equal(callCounter, 1);
		});
	});
});
