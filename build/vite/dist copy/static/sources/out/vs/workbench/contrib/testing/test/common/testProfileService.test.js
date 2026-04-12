/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestProfileService } from '../../common/testProfileService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
suite('Workbench - TestProfileService', () => {
    let t;
    let ds;
    let idCounter = 0;
    teardown(() => {
        ds.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        idCounter = 0;
        ds = new DisposableStore();
        t = ds.add(new TestProfileService(new MockContextKeyService(), ds.add(new TestStorageService())));
    });
    const addProfile = (profile) => {
        const p = {
            controllerId: 'ctrlId',
            group: 2 /* TestRunProfileBitset.Run */,
            isDefault: true,
            label: 'profile',
            profileId: idCounter++,
            hasConfigurationHandler: false,
            tag: null,
            supportsContinuousRun: false,
            ...profile,
        };
        t.addProfile(upcastPartial({ id: 'ctrlId' }), p);
        return p;
    };
    const assertGroupDefaults = (group, expected) => {
        assert.deepStrictEqual(t.getGroupDefaultProfiles(group).map(p => p.label), expected.map(e => e.label));
    };
    const expectProfiles = (expected, actual) => {
        const e = expected.map(e => e.label).sort();
        const a = actual.sort();
        assert.deepStrictEqual(e, a);
    };
    test('getGroupDefaultProfiles', () => {
        addProfile({ isDefault: true, group: 4 /* TestRunProfileBitset.Debug */, label: 'a' });
        addProfile({ isDefault: false, group: 4 /* TestRunProfileBitset.Debug */, label: 'b' });
        addProfile({ isDefault: true, group: 2 /* TestRunProfileBitset.Run */, label: 'c' });
        addProfile({ isDefault: true, group: 2 /* TestRunProfileBitset.Run */, label: 'd', controllerId: '2' });
        addProfile({ isDefault: false, group: 2 /* TestRunProfileBitset.Run */, label: 'e', controllerId: '2' });
        expectProfiles(t.getGroupDefaultProfiles(2 /* TestRunProfileBitset.Run */), ['c', 'd']);
        expectProfiles(t.getGroupDefaultProfiles(4 /* TestRunProfileBitset.Debug */), ['a']);
    });
    suite('setGroupDefaultProfiles', () => {
        test('applies simple changes', () => {
            const p1 = addProfile({ isDefault: false, group: 4 /* TestRunProfileBitset.Debug */, label: 'a' });
            addProfile({ isDefault: false, group: 4 /* TestRunProfileBitset.Debug */, label: 'b' });
            const p3 = addProfile({ isDefault: false, group: 2 /* TestRunProfileBitset.Run */, label: 'c' });
            addProfile({ isDefault: false, group: 2 /* TestRunProfileBitset.Run */, label: 'd' });
            t.setGroupDefaultProfiles(2 /* TestRunProfileBitset.Run */, [p3]);
            assertGroupDefaults(2 /* TestRunProfileBitset.Run */, [p3]);
            assertGroupDefaults(4 /* TestRunProfileBitset.Debug */, [p1]);
        });
        test('syncs labels if same', () => {
            const p1 = addProfile({ isDefault: false, group: 4 /* TestRunProfileBitset.Debug */, label: 'a' });
            const p2 = addProfile({ isDefault: false, group: 4 /* TestRunProfileBitset.Debug */, label: 'b' });
            const p3 = addProfile({ isDefault: false, group: 2 /* TestRunProfileBitset.Run */, label: 'a' });
            const p4 = addProfile({ isDefault: false, group: 2 /* TestRunProfileBitset.Run */, label: 'b' });
            t.setGroupDefaultProfiles(2 /* TestRunProfileBitset.Run */, [p3]);
            assertGroupDefaults(2 /* TestRunProfileBitset.Run */, [p3]);
            assertGroupDefaults(4 /* TestRunProfileBitset.Debug */, [p1]);
            t.setGroupDefaultProfiles(4 /* TestRunProfileBitset.Debug */, [p2]);
            assertGroupDefaults(2 /* TestRunProfileBitset.Run */, [p4]);
            assertGroupDefaults(4 /* TestRunProfileBitset.Debug */, [p2]);
        });
        test('does not mess up sync for multiple controllers', () => {
            // ctrl a and b both of have their own labels. ctrl c does not and should be unaffected
            const p1 = addProfile({ isDefault: false, controllerId: 'a', group: 4 /* TestRunProfileBitset.Debug */, label: 'a' });
            const p2 = addProfile({ isDefault: false, controllerId: 'b', group: 4 /* TestRunProfileBitset.Debug */, label: 'b1' });
            const p3 = addProfile({ isDefault: false, controllerId: 'b', group: 4 /* TestRunProfileBitset.Debug */, label: 'b2' });
            const p4 = addProfile({ isDefault: false, controllerId: 'c', group: 4 /* TestRunProfileBitset.Debug */, label: 'c1' });
            const p5 = addProfile({ isDefault: false, controllerId: 'a', group: 2 /* TestRunProfileBitset.Run */, label: 'a' });
            const p6 = addProfile({ isDefault: false, controllerId: 'b', group: 2 /* TestRunProfileBitset.Run */, label: 'b1' });
            const p7 = addProfile({ isDefault: false, controllerId: 'b', group: 2 /* TestRunProfileBitset.Run */, label: 'b2' });
            const p8 = addProfile({ isDefault: false, controllerId: 'b', group: 2 /* TestRunProfileBitset.Run */, label: 'b3' });
            // same profile on both
            t.setGroupDefaultProfiles(4 /* TestRunProfileBitset.Debug */, [p3]);
            assertGroupDefaults(2 /* TestRunProfileBitset.Run */, [p7]);
            assertGroupDefaults(4 /* TestRunProfileBitset.Debug */, [p3]);
            // different profile, other should be unaffected
            t.setGroupDefaultProfiles(2 /* TestRunProfileBitset.Run */, [p8]);
            assertGroupDefaults(2 /* TestRunProfileBitset.Run */, [p8]);
            assertGroupDefaults(4 /* TestRunProfileBitset.Debug */, [p5]);
            // multiple changes in one go, with unmatched c
            t.setGroupDefaultProfiles(4 /* TestRunProfileBitset.Debug */, [p1, p2, p4]);
            assertGroupDefaults(2 /* TestRunProfileBitset.Run */, [p5, p6, p8]);
            assertGroupDefaults(4 /* TestRunProfileBitset.Debug */, [p1, p2, p4]);
            // identity
            t.setGroupDefaultProfiles(2 /* TestRunProfileBitset.Run */, [p5, p6, p8]);
            assertGroupDefaults(2 /* TestRunProfileBitset.Run */, [p5, p6, p8]);
            assertGroupDefaults(4 /* TestRunProfileBitset.Debug */, [p1, p2, p4]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFByb2ZpbGVTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL3Rlc3QvY29tbW9uL3Rlc3RQcm9maWxlU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDaEgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFeEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBR3hFLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7SUFDNUMsSUFBSSxDQUFxQixDQUFDO0lBQzFCLElBQUksRUFBbUIsQ0FBQztJQUN4QixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7SUFFbEIsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsU0FBUyxHQUFHLENBQUMsQ0FBQztRQUNkLEVBQUUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzNCLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksa0JBQWtCLENBQ2hDLElBQUkscUJBQXFCLEVBQUUsRUFDM0IsRUFBRSxD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