/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as Sinon from 'sinon';
import { Disposable, ExtensionContext, OutputChannel } from 'vscode';
import { CodeReference } from '..';
import { IAuthenticationService } from '../../../../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../../../../platform/authentication/common/copilotToken';
import { generateUuid } from '../../../../../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ConnectionState } from '../../../../lib/src/snippy/connectionState';
import { createExtensionTestingContext } from '../../test/context';
import { GitHubCopilotLogger } from '../outputChannel';

function testExtensionContext() {
	return {
		subscriptions: [],
	};
}

suite('CodeReference', function () {
	let extensionContext: ExtensionContext;
	let instantiationService: IInstantiationService;
	let sub: Disposable | undefined;

	setup(function () {
		const accessor = createExtensionTestingContext().createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		extensionContext = testExtensionContext() as unknown as ExtensionContext;
	});

	teardown(function () {
		extensionContext.subscriptions.forEach(sub => {
			sub.dispose();
		});
		sub?.dispose();
		ConnectionState.setDisabled();
	});

	suite('subscriptions', function () {
		test('should be undefined by default', function () {
			const result = instantiationService.createInstance(CodeReference);
			sub = result.subscriptions;
			assert.ok(!sub);
		});

		test('should be updated correctly when token change events received', function () {
			const codeQuote = instantiationService.createInstance(CodeReference);
			const enabledToken = new CopilotToken(createTestExtendedTokenInfo({ token: `test token ${generateUuid()}`, username: 'fixedTokenManager', copilot_plan: 'unknown', code_quote_enabled: true }));
			const disabledToken = new CopilotToken(createTestExtendedTokenInfo({ token: `test token ${generateUuid()}`, username: 'fixedTokenManager', copilot_plan: 'unknown', code_quote_enabled: false }));

			codeQuote.onCopilotToken(enabledToken);

			assert.ok(codeQuote.enabled);
			assert.ok(codeQuote.subscriptions);
			assert.ok(codeQuote.subscriptions instanceof Disposable);

			const subSpy = Sinon.spy(codeQuote.subscriptions, 'dispose');
			codeQuote.onCopilotToken(disabledToken);

			assert.ok(!codeQuote.enabled);
			assert.strictEqual(codeQuote.subscriptions, undefined);
			assert.strictEqual(subSpy.calledOnce, true);

			codeQuote.onCopilotToken(enabledToken);
			assert.ok(codeQuote.enabled);
			assert.notStrictEqual(codeQuote.subscriptions, undefined);
		});
	});

	test('output channel is created lazily', function () {
		const accessor = createExtensionTestingContext().createTestingAccessor();
		const authenticationService = accessor.get(IAuthenticationService);
		let channelCount = 0;
		const logger = new class extends GitHubCopilotLogger {
			protected override createOutputChannel(): OutputChannel {
				channelCount++;
				return {
					name: 'test',
					append() { },
					appendLine() { },
					clear() { },
					replace() { },
					show() { },
					hide() { },
					dispose() { },
				};
			}
		}(accessor.get(IInstantiationService), authenticationService);

		assert.strictEqual(channelCount, 0);
		logger.info('citation');
		assert.strictEqual(channelCount, 1);
		logger.dispose();
	});
});
