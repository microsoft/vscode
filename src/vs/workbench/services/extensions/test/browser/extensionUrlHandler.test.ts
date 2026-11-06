/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { IOpenURLOptions, IURLHandler } from '../../../../../platform/url/common/url.js';
import { ExtensionUrlHandlerOverrideRegistry, IExtensionContributedURLHandler, IExtensionUrlHandler } from '../../browser/extensionUrlHandler.js';

suite('ExtensionUrlHandler', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	function createHandler(confirm: sinon.SinonStub, extensionInstalled = true): IURLHandler {
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IExtensionUrlHandler)?.[1];
		assert.ok(descriptor);

		const handler = Object.create(descriptor.ctor.prototype) as IURLHandler;
		const extensionHandler: IExtensionContributedURLHandler = {
			extensionDisplayName: 'Copilot Chat',
			handleURL: sinon.stub().resolves(false),
		};
		Reflect.set(handler, 'extensionHandlers', extensionInstalled ? new Map([['github.copilot-chat', extensionHandler]]) : new Map());
		Reflect.set(handler, 'extensionService', { getExtension: sinon.stub().resolves(undefined) });
		Reflect.set(handler, 'productService', { trustedExtensionProtocolHandlers: [] });
		Reflect.set(handler, 'userTrustedExtensionsStorage', { has: () => false, add: () => { } });
		Reflect.set(handler, 'configurationService', { getValue: () => [] });
		Reflect.set(handler, 'dialogService', { confirm });
		return handler;
	}

	async function invokeOverride(confirmResult: boolean, options?: IOpenURLOptions, extensionInstalled = true): Promise<{
		handled: boolean;
		confirmCallCount: number;
		overrideCallCount: number;
	}> {
		const confirm = sinon.stub().resolves({ confirmed: confirmResult, checkboxChecked: false });
		const handler = createHandler(confirm, extensionInstalled);
		const overrideHandleURL = sinon.stub().resolves(true);
		const registration = ExtensionUrlHandlerOverrideRegistry.registerHandler({
			canHandleURL: uri => uri.authority === 'github.copilot-chat',
			handleURL: overrideHandleURL,
		});
		try {
			const handled = await handler.handleURL(
				URI.parse('vscode://github.copilot-chat/?agent=agent&prompt=Approve%20deployment'),
				options
			);
			return {
				handled,
				confirmCallCount: confirm.callCount,
				overrideCallCount: overrideHandleURL.callCount,
			};
		} finally {
			registration.dispose();
		}
	}

	test('extension URL trust policy rejects override before invocation', async () => {
		assert.deepStrictEqual(await invokeOverride(false), {
			handled: true,
			confirmCallCount: 1,
			overrideCallCount: 0,
		});
	});

	test('extension URL trust policy invokes override after confirmation', async () => {
		assert.deepStrictEqual(await invokeOverride(true), {
			handled: true,
			confirmCallCount: 1,
			overrideCallCount: 1,
		});
	});

	test('extension URL trust policy invokes explicitly trusted override without confirmation', async () => {
		assert.deepStrictEqual(await invokeOverride(false, { trusted: true }), {
			handled: true,
			confirmCallCount: 0,
			overrideCallCount: 1,
		});
	});

	test('extension URL trust policy preserves approved overrides when the extension is absent', async () => {
		assert.deepStrictEqual(await invokeOverride(true, undefined, false), {
			handled: true,
			confirmCallCount: 1,
			overrideCallCount: 1,
		});
	});
});
