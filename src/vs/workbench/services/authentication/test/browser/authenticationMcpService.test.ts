/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActivityService } from '../../../../../workbench/services/activity/common/activity.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputButton, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { AuthenticationMcpService } from '../../browser/authenticationMcpService.js';
import { IAuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpUsageService } from '../../browser/authenticationMcpUsageService.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationProvider, IAuthenticationService, AuthenticationSessionsChangeEvent } from '../../common/authentication.js';
import { TestActivityService, TestProductService, TestStorageService, mock } from '../../../../test/common/workbenchTestServices.js';
import { TestAuthenticationService, TestMcpAccessService } from './authenticationQueryServiceMocks.js';

function createSession(overrides: Partial<AuthenticationSession> = {}): AuthenticationSession {
	return {
		id: 'session1',
		accessToken: 'token1',
		account: { id: 'account1', label: 'Account 1' },
		scopes: ['mcp:proxy'],
		...overrides
	};
}

function createProvider(overrides: Partial<IAuthenticationProvider> = {}): IAuthenticationProvider {
	return {
		supportsMultipleAccounts: true,
		onDidChangeSessions: new Emitter<AuthenticationSessionsChangeEvent>().event,
		id: 'provider',
		label: 'Provider',
		getSessions: async () => [],
		createSession: async () => createSession(),
		removeSession: async () => { },
		...overrides
	};
}

class AutoAcceptQuickInputService extends mock<IQuickInputService>() {
	declare readonly _serviceBrand: undefined;
	override readonly onShow = Event.None;
	override readonly onHide = Event.None;
	override readonly backButton = {} as IQuickInputButton;
	override readonly currentQuickInput = undefined;
	override readonly quickAccess = undefined!;
	override readonly alignment = undefined!;

	override createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: boolean }> {
		const onDidAccept = new Emitter<IQuickPickDidAcceptEvent>();
		const onDidHide = new Emitter<void>();
		const disposables = new DisposableStore();
		disposables.add(onDidAccept);
		disposables.add(onDidHide);

		const quickPick = {
			items: [] as ReadonlyArray<T>,
			selectedItems: [] as ReadonlyArray<T>,
			ignoreFocusOut: false,
			title: undefined as string | undefined,
			placeholder: undefined as string | undefined,
			onDidAccept: onDidAccept.event,
			onDidHide: onDidHide.event,
			show: () => {
				if (quickPick.items.length > 0) {
					quickPick.selectedItems = [quickPick.items[0]];
					onDidAccept.fire({ inBackground: false });
				}
			},
			dispose: () => {
				onDidHide.fire();
				disposables.dispose();
			}
		};

		return quickPick as unknown as IQuickPick<T, { useSeparators: boolean }>;
	}
}

suite('AuthenticationMcpService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('selectSession falls back to available session accounts when provider account list is empty', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const authenticationService = disposables.add(new TestAuthenticationService());
		const accessService = disposables.add(new TestMcpAccessService());

		instantiationService.stub(IActivityService, new TestActivityService());
		instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() { }());
		instantiationService.stub(IQuickInputService, new AutoAcceptQuickInputService());
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IAuthenticationService, authenticationService);
		instantiationService.stub(IAuthenticationMcpUsageService, new class extends mock<IAuthenticationMcpUsageService>() { }());
		instantiationService.stub(IAuthenticationMcpAccessService, accessService);

		const providerId = 'xaa:https://issuer.example.com';
		authenticationService.registerAuthenticationProvider(providerId, createProvider({ id: providerId, label: 'XAA' }));
		authenticationService.addAccounts(providerId, []);

		const service = disposables.add(instantiationService.createInstance(AuthenticationMcpService));
		const session = createSession({ account: { id: 'account1', label: 'Enterprise Account' } as AuthenticationSessionAccount });

		const selected = await service.selectSession(providerId, 'server-b', 'Server B', ['mcp:proxy'], [session]);

		assert.strictEqual(selected.id, session.id);
		assert.strictEqual(selected.account.label, 'Enterprise Account');
	});
});
