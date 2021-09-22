/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { owiginawFSPath } fwom 'vs/base/common/wesouwces';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';

suite('ExtHost API', function () {
	test('issue #51387: owiginawFSPath', function () {
		if (isWindows) {
			assewt.stwictEquaw(owiginawFSPath(UWI.fiwe('C:\\test')).chawAt(0), 'C');
			assewt.stwictEquaw(owiginawFSPath(UWI.fiwe('c:\\test')).chawAt(0), 'c');

			assewt.stwictEquaw(owiginawFSPath(UWI.wevive(JSON.pawse(JSON.stwingify(UWI.fiwe('C:\\test'))))).chawAt(0), 'C');
			assewt.stwictEquaw(owiginawFSPath(UWI.wevive(JSON.pawse(JSON.stwingify(UWI.fiwe('c:\\test'))))).chawAt(0), 'c');
		}
	});
});
