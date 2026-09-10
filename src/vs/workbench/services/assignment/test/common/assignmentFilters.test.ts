/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { TestExtensionService, mock } from '../../../../test/common/workbenchTestServices.js';
import { CopilotAssignmentFilterProvider, ExtensionsFilter, GitHubAssignmentsFilter, GitHubCoreAssignmentsFilterProvider } from '../../common/assignmentFilters.js';

suite('CopilotAssignmentFilterProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('initializes entitlement filters before subscribing to entitlement changes', () => {
		const onDidChangeEntitlement = disposables.add(new Emitter<void>());
		const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeEntitlement = onDidChangeEntitlement.event;
			override readonly sku = 'pro';
			override readonly organisations = undefined;

			private readonly trackingId = new Lazy(() => {
				onDidChangeEntitlement.fire();
				return 'tracking-id';
			});

			override get copilotTrackingId(): string {
				return this.trackingId.value;
			}
		}();
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override readonly copilotTokenInfo = null;
			override readonly onDidChangeCopilotTokenInfo = Event.None;
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatEntitlementService, chatEntitlementService);
		instantiationService.stub(IDefaultAccountService, defaultAccountService);

		const provider = disposables.add(instantiationService.createInstance(CopilotAssignmentFilterProvider));

		assert.strictEqual(provider.getFilterValue(ExtensionsFilter.CopilotTrackingId), 'tracking-id');
	});
});

suite('GitHubCoreAssignmentsFilterProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestChatEntitlementService extends mock<IChatEntitlementService>() {
		private readonly _onDidChangeEntitlement = disposables.add(new Emitter<void>());
		override readonly onDidChangeEntitlement = this._onDidChangeEntitlement.event;

		override copilotTrackingId: string | undefined;
		override organisations: string[] | undefined;

		fireChange(): void {
			this._onDidChangeEntitlement.fire();
		}
	}

	function createProvider(entitlement: TestChatEntitlementService): GitHubCoreAssignmentsFilterProvider {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatEntitlementService, entitlement);
		return disposables.add(instantiationService.createInstance(GitHubCoreAssignmentsFilterProvider));
	}

	test('emits the core GitHub assignment filters map', () => {
		const entitlement = new TestChatEntitlementService();
		entitlement.copilotTrackingId = 'tid-1';
		entitlement.organisations = ['github'];

		const provider = createProvider(entitlement);

		const filters = provider.getFilters();
		assert.deepStrictEqual([...filters.entries()], [
			[GitHubAssignmentsFilter.CopilotTrackingId, 'tid-1'],
			[GitHubAssignmentsFilter.IsGhOrMsftStaff, '1'],
			[GitHubAssignmentsFilter.GhMsftOrExternal, 'github'],
		]);
	});

	test('latches a late tracking id and keeps it after it becomes unavailable', () => {
		const entitlement = new TestChatEntitlementService();
		entitlement.organisations = undefined;

		const provider = createProvider(entitlement);

		// Not yet available during sign-in delay.
		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.CopilotTrackingId), null);

		// Becomes available later.
		entitlement.copilotTrackingId = 'tid-late';
		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.CopilotTrackingId), 'tid-late');

		// Latched: survives the live value going away again.
		entitlement.copilotTrackingId = undefined;
		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.CopilotTrackingId), 'tid-late');
	});

	test('reflects organization classification changes', () => {
		const entitlement = new TestChatEntitlementService();
		entitlement.organisations = undefined;

		const provider = createProvider(entitlement);

		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.IsGhOrMsftStaff), '0');
		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.GhMsftOrExternal), 'external');

		entitlement.organisations = ['microsoft'];
		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.IsGhOrMsftStaff), '1');
		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.GhMsftOrExternal), 'microsoft');

		entitlement.organisations = ['Visual-Studio-Code'];
		assert.strictEqual(provider.getFilterValue(GitHubAssignmentsFilter.GhMsftOrExternal), 'microsoft');
	});

	test('fires onDidChangeFilters only when relevant inputs change', () => {
		const entitlement = new TestChatEntitlementService();
		entitlement.copilotTrackingId = 'tid-1';
		entitlement.organisations = ['github'];

		const provider = createProvider(entitlement);

		let changes = 0;
		disposables.add(provider.onDidChangeFilters(() => changes++));

		// No relevant change -> no event.
		entitlement.fireChange();
		assert.strictEqual(changes, 0);

		// Org change -> event.
		entitlement.organisations = ['microsoft'];
		entitlement.fireChange();
		assert.strictEqual(changes, 1);

		// Tracking id change -> event.
		entitlement.copilotTrackingId = 'tid-2';
		entitlement.fireChange();
		assert.strictEqual(changes, 2);
	});
});
