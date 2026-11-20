/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickItem, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { IActivityService } from '../../../activity/common/activity.js';
import { TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { AuthenticationMcpService } from '../../browser/authenticationMcpService.js';
import { IAuthenticationMcpAccessService } from '../../browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpUsageService } from '../../browser/authenticationMcpUsageService.js';
import { IAuthenticationProvider, IAuthenticationService } from '../../common/authentication.js';

suite('AuthenticationMcpService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('dismissing the account picker rejects with cancellation', async () => {
		const hidden = disposables.add(new Emitter<IQuickInputHideEvent>());
		const quickInputService = new class extends mock<IQuickInputService>() {
			override createQuickPick<T extends IQuickPickItem, O extends { useSeparators: boolean } = { useSeparators: false }>(): IQuickPick<T, O> {
				return new class extends mock<IQuickPick<T, O>>() {
					override readonly onDidAccept = Event.None;
					override readonly onDidHide = hidden.event;
					override readonly selectedItems: readonly T[] = [];
					override show(): void {
						hidden.fire({ reason: QuickInputHideReason.Gesture });
					}
					override dispose(): void { }
				}();
			}
		}();
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidUnregisterAuthenticationProvider = Event.None;
			override async getAccounts() { return [{ id: 'account', label: 'Test Account' }]; }
			override getProvider() {
				return new class extends mock<IAuthenticationProvider>() {
					override readonly label = 'Test Provider';
				}();
			}
		}();
		const service = disposables.add(new AuthenticationMcpService(
			new class extends mock<IActivityService>() { }(),
			disposables.add(new TestStorageService()),
			new class extends mock<IDialogService>() { }(),
			quickInputService,
			TestProductService,
			authenticationService,
			new class extends mock<IAuthenticationMcpUsageService>() { }(),
			new class extends mock<IAuthenticationMcpAccessService>() { }(),
		));

		await assert.rejects(service.selectSession('provider', 'server', 'Test Server', ['read'], []), isCancellationError);
	});
});
