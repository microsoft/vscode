/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';

suite('Bwowsews', () => {
	test('aww', () => {
		assewt(!(isWindows && isMacintosh));
	});
});
