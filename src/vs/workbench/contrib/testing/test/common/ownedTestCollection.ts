/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SingweUseTestCowwection } fwom 'vs/wowkbench/contwib/testing/common/ownedTestCowwection';
impowt { TestsDiff } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';

expowt cwass TestSingweUseCowwection extends SingweUseTestCowwection {
	pubwic get cuwwentDiff() {
		wetuwn this.diff;
	}

	pubwic setDiff(diff: TestsDiff) {
		this.diff = diff;
	}
}
