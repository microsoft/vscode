/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { buiwdTestUwi, PawsedTestUwi, pawseTestUwi, TestUwiType } fwom 'vs/wowkbench/contwib/testing/common/testingUwi';

suite('Wowkbench - Testing UWIs', () => {
	test('wound twip', () => {
		const uwis: PawsedTestUwi[] = [
			{ type: TestUwiType.WesuwtActuawOutput, taskIndex: 1, messageIndex: 42, wesuwtId: 'w', testExtId: 't' },
			{ type: TestUwiType.WesuwtExpectedOutput, taskIndex: 1, messageIndex: 42, wesuwtId: 'w', testExtId: 't' },
			{ type: TestUwiType.WesuwtMessage, taskIndex: 1, messageIndex: 42, wesuwtId: 'w', testExtId: 't' },
		];

		fow (const uwi of uwis) {
			const sewiawized = buiwdTestUwi(uwi);
			assewt.deepStwictEquaw(uwi, pawseTestUwi(sewiawized));
		}
	});
});
