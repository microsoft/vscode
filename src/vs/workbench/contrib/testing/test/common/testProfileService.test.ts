/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { TestId } from '../../common/testId.js';
import { TestProfileService } from '../../common/testProfileService.js';
import { IMainThreadTestController } from '../../common/testService.js';
import { InternalTestItem, ITestRunProfile, TestRunProfileBitset } from '../../common/testTypes.js';

suite('Workbench - TestProfileService', () => {
	let t: TestProfileService;
	let ds: DisposableStore;
	let idCounter = 0;

	teardown(() => {
		ds.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		idCounter = 0;
		ds = new DisposableStore();
		t = ds.add(new TestProfileService(
			new MockContextKeyService(),
			ds.add(new TestStorageService()),
		));
	});

	const addProfile = (profile: Partial<ITestRunProfile>) => {
		const p: ITestRunProfile = {
			controllerId: 'ctrlId',
			group: TestRunProfileBitset.Run,
			isDefault: true,
			label: 'profile',
			profileId: idCounter++,
			hasConfigurationHandler: false,
			tag: null,
			supportsContinuousRun: false,
			...profile,
		};

		t.addProfile(upcastPartial<IMainThreadTestController>({ id: 'ctrlId' }), p);
		return p;
	};

	const makeTest = (...tags: string[]) => upcastDeepPartial<InternalTestItem>({
		controllerId: 'ctrlId',
		item: {
			extId: new TestId(['ctrlId', 'test']).toString(),
			tags,
		},
	});
	const assertDefaultProfile = (expected: ITestRunProfile, ...tags: string[]) => assert.strictEqual(
		t.getDefaultProfileForTest(TestRunProfileBitset.Run, makeTest(...tags))?.profileId,
		expected.profileId,
	);

	const assertGroupDefaults = (group: TestRunProfileBitset, expected: ITestRunProfile[]) => {
		assert.deepStrictEqual(t.getGroupDefaultProfiles(group).map(p => p.label), expected.map(e => e.label));
	};

	const expectProfiles = (expected: ITestRunProfile[], actual: string[]) => {
		const e = expected.map(e => e.label).sort();
		const a = actual.sort();
		assert.deepStrictEqual(e, a);
	};

	test('getGroupDefaultProfiles', () => {
		addProfile({ isDefault: true, group: TestRunProfileBitset.Debug, label: 'a' });
		addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'b' });
		addProfile({ isDefault: true, group: TestRunProfileBitset.Run, label: 'c' });
		addProfile({ isDefault: true, group: TestRunProfileBitset.Run, label: 'd', controllerId: '2' });
		addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'e', controllerId: '2' });
		expectProfiles(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), ['c', 'd']);
		expectProfiles(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), ['a']);
	});

	suite('getDefaultProfileForTest', () => {
		test('uses priority only for automatic profile selection', () => {
			const root = addProfile({ label: 'a: root', priority: 0, tag: 'root' });
			const unrelated = addProfile({ label: 'm: unrelated', priority: 100, tag: 'unrelated' });
			const nested = addProfile({ label: 'z: nested', priority: 1, tag: 'nested' });

			assertDefaultProfile(nested, 'root', 'nested');
			assert.deepStrictEqual(t.getControllerProfiles('ctrlId').map(p => p.label), ['a: root', 'm: unrelated', 'z: nested']);
			expectProfiles([root, unrelated, nested], t.getGroupDefaultProfiles(TestRunProfileBitset.Run, 'ctrlId').map(p => p.label));

			t.updateProfile('ctrlId', nested.profileId, { priority: -1 });
			assertDefaultProfile(root, 'root', 'nested');
		});

		test('user-selected default takes precedence over priority', () => {
			addProfile({ label: 'a: high priority', priority: 100 });
			const selected = addProfile({ label: 'z: selected', priority: 0 });
			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [selected]);

			assertDefaultProfile(selected);
		});

		test('treats missing and zero priority equally', () => {
			addProfile({ label: 'z', priority: 0 });
			const alphabeticallyFirst = addProfile({ label: 'a' });

			assertDefaultProfile(alphabeticallyFirst);
		});
	});

	suite('setGroupDefaultProfiles', () => {
		test('applies simple changes', () => {
			const p1 = addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'a' });
			addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'b' });
			const p3 = addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'c' });
			addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'd' });

			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p3]);
			assertGroupDefaults(TestRunProfileBitset.Run, [p3]);
			assertGroupDefaults(TestRunProfileBitset.Debug, [p1]);
		});

		test('syncs labels if same', () => {
			const p1 = addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'a' });
			const p2 = addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'b' });
			const p3 = addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'a' });
			const p4 = addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'b' });

			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p3]);
			assertGroupDefaults(TestRunProfileBitset.Run, [p3]);
			assertGroupDefaults(TestRunProfileBitset.Debug, [p1]);

			t.setGroupDefaultProfiles(TestRunProfileBitset.Debug, [p2]);
			assertGroupDefaults(TestRunProfileBitset.Run, [p4]);
			assertGroupDefaults(TestRunProfileBitset.Debug, [p2]);
		});

		test('does not mess up sync for multiple controllers', () => {
			// ctrl a and b both of have their own labels. ctrl c does not and should be unaffected
			const p1 = addProfile({ isDefault: false, controllerId: 'a', group: TestRunProfileBitset.Debug, label: 'a' });
			const p2 = addProfile({ isDefault: false, controllerId: 'b', group: TestRunProfileBitset.Debug, label: 'b1' });
			const p3 = addProfile({ isDefault: false, controllerId: 'b', group: TestRunProfileBitset.Debug, label: 'b2' });
			const p4 = addProfile({ isDefault: false, controllerId: 'c', group: TestRunProfileBitset.Debug, label: 'c1' });

			const p5 = addProfile({ isDefault: false, controllerId: 'a', group: TestRunProfileBitset.Run, label: 'a' });
			const p6 = addProfile({ isDefault: false, controllerId: 'b', group: TestRunProfileBitset.Run, label: 'b1' });
			const p7 = addProfile({ isDefault: false, controllerId: 'b', group: TestRunProfileBitset.Run, label: 'b2' });
			const p8 = addProfile({ isDefault: false, controllerId: 'b', group: TestRunProfileBitset.Run, label: 'b3' });

			// same profile on both
			t.setGroupDefaultProfiles(TestRunProfileBitset.Debug, [p3]);
			assertGroupDefaults(TestRunProfileBitset.Run, [p7]);
			assertGroupDefaults(TestRunProfileBitset.Debug, [p3]);

			// different profile, other should be unaffected
			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p8]);
			assertGroupDefaults(TestRunProfileBitset.Run, [p8]);
			assertGroupDefaults(TestRunProfileBitset.Debug, [p5]);

			// multiple changes in one go, with unmatched c
			t.setGroupDefaultProfiles(TestRunProfileBitset.Debug, [p1, p2, p4]);
			assertGroupDefaults(TestRunProfileBitset.Run, [p5, p6, p8]);
			assertGroupDefaults(TestRunProfileBitset.Debug, [p1, p2, p4]);

			// identity
			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p5, p6, p8]);
			assertGroupDefaults(TestRunProfileBitset.Run, [p5, p6, p8]);
			assertGroupDefaults(TestRunProfileBitset.Debug, [p1, p2, p4]);
		});
	});
});
