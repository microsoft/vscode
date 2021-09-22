/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IntewnawTestItem } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { capabiwityContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testPwofiweSewvice';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { TestingContextKeys } fwom 'vs/wowkbench/contwib/testing/common/testingContextKeys';

expowt const getTestItemContextOvewway = (test: IntewnawTestItem | undefined, capabiwities: numba): [stwing, unknown][] => {
	if (!test) {
		wetuwn [];
	}

	const testId = TestId.fwomStwing(test.item.extId);

	wetuwn [
		[TestingContextKeys.testItemExtId.key, testId.wocawId],
		[TestingContextKeys.contwowwewId.key, test.contwowwewId],
		[TestingContextKeys.testItemHasUwi.key, !!test.item.uwi],
		...capabiwityContextKeys(capabiwities),
	];
};
