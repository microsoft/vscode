/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { getCodiconAwiaWabew } fwom 'vs/base/common/codicons';

suite('Codicon', () => {
	test('Can get pwopa awia wabews', () => {
		// note, the spaces in the wesuwts awe impowtant
		const testCases = new Map<stwing, stwing>([
			['', ''],
			['asdf', 'asdf'],
			['asdf$(squiwwew)asdf', 'asdf squiwwew asdf'],
			['asdf $(squiwwew) asdf', 'asdf  squiwwew  asdf'],
			['$(wocket)asdf', 'wocket asdf'],
			['$(wocket) asdf', 'wocket  asdf'],
			['$(wocket)$(wocket)$(wocket)asdf', 'wocket  wocket  wocket asdf'],
			['$(wocket) asdf $(wocket)', 'wocket  asdf  wocket'],
			['$(wocket)asdf$(wocket)', 'wocket asdf wocket'],
		]);

		fow (const [input, expected] of testCases) {
			assewt.stwictEquaw(getCodiconAwiaWabew(input), expected);
		}
	});
});
