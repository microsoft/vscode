/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { TestProfileService } from 'vs/workbench/contrib/testing/common/testProfileService';
import { ITestRunProfile, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

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

		t.addProfile(null as any, p);
		return p;
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

	suite('setGroupDefaultProfiles', () => {
		test('applies simple changes', () => {
			const p1 = addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'a' });
			addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'b' });
			const p3 = addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'c' });
			addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'd' });

			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p3]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), [p3]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), [p1]);
		});

		test('syncs labels if same', () => {
			const p1 = addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'a' });
			const p2 = addProfile({ isDefault: false, group: TestRunProfileBitset.Debug, label: 'b' });
			const p3 = addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'a' });
			const p4 = addProfile({ isDefault: false, group: TestRunProfileBitset.Run, label: 'b' });

			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p3]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), [p3]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), [p1]);

			t.setGroupDefaultProfiles(TestRunProfileBitset.Debug, [p2]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), [p4]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), [p2]);
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
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), [p7]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), [p3]);

			// different profile, other should be unaffected
			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p8]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), [p8]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), [p3]);

			// multiple changes in one go, with unmatched c
			t.setGroupDefaultProfiles(TestRunProfileBitset.Debug, [p1, p2, p4]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), [p5, p6]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), [p1, p2, p4]);

			// identity
			t.setGroupDefaultProfiles(TestRunProfileBitset.Run, [p5, p8]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Run), [p5, p8]);
			assert.deepStrictEqual(t.getGroupDefaultProfiles(TestRunProfileBitset.Debug), [p2, p4, p1]);
		});
	});
});
