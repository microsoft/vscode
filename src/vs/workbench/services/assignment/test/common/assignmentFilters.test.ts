/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ICopilotTokenInfo, IDefaultAccount, IEntitlementsData } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { TestExtensionService, mock } from '../../../../test/common/workbenchTestServices.js';
import { CopilotAssignmentFilterProvider, ExtensionsFilter, GitHubAssignmentsFilter, GitHubCoreAssignmentsFilterProvider } from '../../common/assignmentFilters.js';

suite('CopilotAssignmentFilterProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestDefaultAccountService extends mock<IDefaultAccountService>() {
		private readonly _onDidChangeCopilotTokenInfo = disposables.add(new Emitter<ICopilotTokenInfo | null>());
		override readonly onDidChangeCopilotTokenInfo = this._onDidChangeCopilotTokenInfo.event;

		override copilotTokenInfo: ICopilotTokenInfo | null = null;

		setCopilotTokenInfo(tokenInfo: ICopilotTokenInfo | null): void {
			this.copilotTokenInfo = tokenInfo;
			this._onDidChangeCopilotTokenInfo.fire(tokenInfo);
		}
	}

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
		const defaultAccountService = new TestDefaultAccountService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatEntitlementService, chatEntitlementService);
		instantiationService.stub(IDefaultAccountService, defaultAccountService);

		const provider = disposables.add(instantiationService.createInstance(CopilotAssignmentFilterProvider));

		assert.strictEqual(provider.getFilterValue(ExtensionsFilter.CopilotTrackingId), 'tracking-id');
	});

	test('maps extension versions without forwarding cached account filters to new TAS', async () => {
		const onDidChangeEntitlement = disposables.add(new Emitter<void>());
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeEntitlement = onDidChangeEntitlement.event;
			override sku: string | undefined = 'pro';
			override readonly organisations = undefined;
			override readonly copilotTrackingId = undefined;
		}();
		const account = new TestDefaultAccountService();
		account.copilotTokenInfo = { sn: '1', fcv1: '1' };
		const extension = new class extends mock<IExtensionDescription>() {
			override readonly version = '0.68.0-insider';
		}();
		const extensionService = new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensionsStatus = Event.None;
			override async getExtension(id: string): Promise<IExtensionDescription | undefined> {
				return id === 'github.copilot-chat' ? extension : undefined;
			}
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, extensionService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatEntitlementService, entitlement);
		instantiationService.stub(IDefaultAccountService, account);

		const provider = disposables.add(instantiationService.createInstance(CopilotAssignmentFilterProvider));
		await Event.toPromise(provider.onDidChangeFilters);
		const initial = Object.fromEntries(provider.getAssignmentsFilters());
		let changes = 0;
		disposables.add(provider.onDidChangeFilters(() => changes++));
		account.setCopilotTokenInfo({ sn: '1', fcv1: '0' });
		const fcv1Changed = Object.fromEntries(provider.getAssignmentsFilters());
		entitlement.sku = 'enterprise';
		onDidChangeEntitlement.fire();
		account.setCopilotTokenInfo({ sn: '0' });
		const refreshed = Object.fromEntries(provider.getAssignmentsFilters());
		entitlement.sku = undefined;
		onDidChangeEntitlement.fire();
		account.setCopilotTokenInfo(null);

		assert.deepStrictEqual({
			initial,
			fcv1Changed,
			refreshed,
			signedOut: Object.fromEntries(provider.getAssignmentsFilters()),
			changes,
			legacy: [
				provider.getFilterValue(ExtensionsFilter.CopilotChatExtensionVersion),
				provider.getFilterValue(ExtensionsFilter.CopilotSku),
				provider.getFilterValue(ExtensionsFilter.CopilotIsSn),
				provider.getFilterValue(ExtensionsFilter.CopilotIsFcv1),
				provider.getFilterValue(ExtensionsFilter.CopilotIsProxima),
			],
		}, {
			initial: {
				vscode_core_copilotchatextensionversion: '0.68.0',
			},
			fcv1Changed: {
				vscode_core_copilotchatextensionversion: '0.68.0',
			},
			refreshed: {
				vscode_core_copilotchatextensionversion: '0.68.0',
			},
			signedOut: {
				vscode_core_copilotchatextensionversion: '0.68.0',
			},
			changes: 4,
			legacy: ['0.68.0', null, '0', '0', '0'],
		});
	});

	test('classifies Proxima from the token stamp and fails closed while it is unresolved', () => {
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeEntitlement = Event.None;
			override readonly organisations = undefined;
			override readonly copilotTrackingId = undefined;
		}();
		const account = new TestDefaultAccountService();
		const extensionService = new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensionsStatus = Event.None;
			override async getExtension(): Promise<undefined> {
				return undefined;
			}
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, extensionService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatEntitlementService, entitlement);
		instantiationService.stub(IDefaultAccountService, account);

		const provider = disposables.add(instantiationService.createInstance(CopilotAssignmentFilterProvider));
		let changes = 0;
		disposables.add(provider.onDidChangeFilters(() => changes++));
		const values = [provider.getFilterValue(ExtensionsFilter.CopilotIsProxima)];
		account.setCopilotTokenInfo({ st: 'dotcom' });
		values.push(provider.getFilterValue(ExtensionsFilter.CopilotIsProxima));
		account.setCopilotTokenInfo({ st: 'proxima' });
		values.push(provider.getFilterValue(ExtensionsFilter.CopilotIsProxima));
		account.setCopilotTokenInfo({});
		values.push(provider.getFilterValue(ExtensionsFilter.CopilotIsProxima));
		account.setCopilotTokenInfo(null);
		values.push(provider.getFilterValue(ExtensionsFilter.CopilotIsProxima));

		assert.deepStrictEqual({
			values,
			changes,
			assignmentsFilters: Object.fromEntries(provider.getAssignmentsFilters()),
		}, {
			values: ['0', '0', '1', '0', '0'],
			changes: 2,
			assignmentsFilters: {
				vscode_core_copilotchatextensionversion: null,
			},
		});
	});
});

suite('GitHubCoreAssignmentsFilterProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestDefaultAccountService extends mock<IDefaultAccountService>() {
		private readonly accountChanged = disposables.add(new Emitter<IDefaultAccount | null>());
		override readonly onDidChangeDefaultAccount = this.accountChanged.event;
		override readonly onDidChangeCopilotTokenInfo = Event.None;
		override copilotTokenInfo: ICopilotTokenInfo | null = null;
		override currentDefaultAccount: IDefaultAccount | null = null;

		setEntitlements(entitlements?: Partial<IEntitlementsData>): void {
			this.currentDefaultAccount = entitlements ? new class extends mock<IDefaultAccount>() {
				override readonly entitlementsData = Object.assign(new class extends mock<IEntitlementsData>() { }(), entitlements);
			}() : null;
			this.accountChanged.fire(this.currentDefaultAccount);
		}
	}

	function createProvider(account: TestDefaultAccountService): GitHubCoreAssignmentsFilterProvider {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IDefaultAccountService, account);
		return disposables.add(instantiationService.createInstance(GitHubCoreAssignmentsFilterProvider));
	}

	test('emits the core GitHub assignment filters map', () => {
		const account = new TestDefaultAccountService();
		account.setEntitlements({ analytics_tracking_id: 'tid-1', organization_login_list: ['github'], access_type_sku: 'pro' });
		account.copilotTokenInfo = { sn: '1', fcv1: '0' };
		const provider = createProvider(account);

		const filters = provider.getFilters();
		assert.deepStrictEqual([...filters.entries()], [
			[GitHubAssignmentsFilter.CopilotTrackingId, 'tid-1'],
			[GitHubAssignmentsFilter.IsGhOrMsftStaff, '1'],
			[GitHubAssignmentsFilter.GhMsftOrExternal, 'github'],
			[GitHubAssignmentsFilter.CopilotSku, 'pro'],
			[GitHubAssignmentsFilter.CopilotIsSn, '1'],
			[GitHubAssignmentsFilter.CopilotIsFcv1, '0'],
		]);
	});

	test('clears account filters on sign-out even before token info is cleared', () => {
		const account = new TestDefaultAccountService();
		account.setEntitlements({ analytics_tracking_id: 'old-user', access_type_sku: 'enterprise', organization_login_list: ['github'] });
		account.copilotTokenInfo = { sn: '1', fcv1: '1' };
		const provider = createProvider(account);
		let changes = 0;
		disposables.add(provider.onDidChangeFilters(() => changes++));
		account.setEntitlements();
		assert.deepStrictEqual({ filters: Object.fromEntries(provider.getFilters()), changes }, {
			filters: {
				copilottrackingid: null,
				github_core_isghormsftstaff: '0',
				github_core_ghmsftorexternal: 'external',
				github_core_copilotsku: null,
				github_core_issn: '0',
				github_core_isfcv1: '0',
			},
			changes: 1,
		});
	});

	test('does not retain another account tracking id while the next account has no entitlements', () => {
		const account = new TestDefaultAccountService();
		const provider = createProvider(account);
		const values = [{ analytics_tracking_id: 'first' }, {}, { analytics_tracking_id: 'second' }, undefined];
		assert.deepStrictEqual(values.map(value => {
			account.setEntitlements(value);
			return provider.getFilterValue(GitHubAssignmentsFilter.CopilotTrackingId);
		}), ['first', null, 'second', null]);
	});

	test('reflects organization classification changes', () => {
		const account = new TestDefaultAccountService();
		const provider = createProvider(account);
		const organizations = [
			undefined,
			['microsoft'],
			['github'],
			['Visual-Studio-Code'],
			['microsoft', 'github', 'Visual-Studio-Code'],
			['unrecognized-org'],
			[],
			undefined,
		];

		assert.deepStrictEqual(organizations.map(organisations => {
			account.setEntitlements({ organization_login_list: organisations });
			const filters = provider.getFilters();
			return [
				filters.get(GitHubAssignmentsFilter.GhMsftOrExternal),
				filters.get(GitHubAssignmentsFilter.IsGhOrMsftStaff),
			];
		}), [
			['external', '0'],
			['microsoft', '1'],
			['github', '1'],
			['vscode', '1'],
			['vscode', '1'],
			['external', '0'],
			['external', '0'],
			['external', '0'],
		]);
	});

	test('includes staff without internal organizations and notifies on staff-only changes', () => {
		const account = new TestDefaultAccountService();
		account.setEntitlements({ organization_login_list: ['contoso'], is_staff: true });
		const provider = createProvider(account);
		let changes = 0;
		disposables.add(provider.onDidChangeFilters(() => changes++));

		assert.deepStrictEqual([true, false, false, true, undefined].map(isStaff => {
			account.setEntitlements({ organization_login_list: ['contoso'], is_staff: isStaff });
			const filters = provider.getFilters();
			return [
				filters.get(GitHubAssignmentsFilter.IsGhOrMsftStaff),
				filters.get(GitHubAssignmentsFilter.GhMsftOrExternal),
				changes,
			];
		}), [
			['1', 'external', 0],
			['0', 'external', 1],
			['0', 'external', 1],
			['1', 'external', 2],
			['0', 'external', 3],
		]);
	});

	test('fires onDidChangeFilters only when relevant inputs change', () => {
		const account = new TestDefaultAccountService();
		account.setEntitlements({ analytics_tracking_id: 'tid-1', organization_login_list: ['github'] });
		const provider = createProvider(account);

		let changes = 0;
		disposables.add(provider.onDidChangeFilters(() => changes++));

		// No relevant change -> no event.
		account.setEntitlements({ analytics_tracking_id: 'tid-1', organization_login_list: ['github'] });
		assert.strictEqual(changes, 0);

		// Org change -> event.
		account.setEntitlements({ analytics_tracking_id: 'tid-1', organization_login_list: ['microsoft'] });
		assert.strictEqual(changes, 1);

		// Tracking id change -> event.
		account.setEntitlements({ analytics_tracking_id: 'tid-2', organization_login_list: ['microsoft'] });
		assert.strictEqual(changes, 2);
	});
});
