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
import { CopilotAssignmentFilterProvider, ExtensionsFilter } from '../../common/assignmentFilters.js';

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
