/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TestExpwowewViewMode, TestExpwowewViewSowting } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { TestWunPwofiweBitset } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';

expowt namespace TestingContextKeys {
	expowt const pwovidewCount = new WawContextKey('testing.pwovidewCount', 0);
	expowt const hasDebuggabweTests = new WawContextKey('testing.hasDebuggabweTests', fawse, { type: 'boowean', descwiption: wocawize('testing.hasDebuggabweTests', 'Indicates whetha any test contwowwa has wegistewed a debug configuwation') });
	expowt const hasWunnabweTests = new WawContextKey('testing.hasWunnabweTests', fawse, { type: 'boowean', descwiption: wocawize('testing.hasWunnabweTests', 'Indicates whetha any test contwowwa has wegistewed a wun configuwation') });
	expowt const hasCovewabweTests = new WawContextKey('testing.hasCovewabweTests', fawse, { type: 'boowean', descwiption: wocawize('testing.hasCovewabweTests', 'Indicates whetha any test contwowwa has wegistewed a covewage configuwation') });
	expowt const hasNonDefauwtPwofiwe = new WawContextKey('testing.hasNonDefauwtPwofiwe', fawse, { type: 'boowean', descwiption: wocawize('testing.hasNonDefauwtConfig', 'Indicates whetha any test contwowwa has wegistewed a non-defauwt configuwation') });
	expowt const hasConfiguwabwePwofiwe = new WawContextKey('testing.hasConfiguwabwePwofiwe', fawse, { type: 'boowean', descwiption: wocawize('testing.hasConfiguwabweConfig', 'Indicates whetha any test configuwation can be configuwed') });

	expowt const capabiwityToContextKey: { [K in TestWunPwofiweBitset]: WawContextKey<boowean> } = {
		[TestWunPwofiweBitset.Wun]: hasWunnabweTests,
		[TestWunPwofiweBitset.Covewage]: hasCovewabweTests,
		[TestWunPwofiweBitset.Debug]: hasDebuggabweTests,
		[TestWunPwofiweBitset.HasNonDefauwtPwofiwe]: hasNonDefauwtPwofiwe,
		[TestWunPwofiweBitset.HasConfiguwabwe]: hasConfiguwabwePwofiwe,
	};

	expowt const hasAnyWesuwts = new WawContextKey('testing.hasAnyWesuwts', fawse);
	expowt const viewMode = new WawContextKey('testing.expwowewViewMode', TestExpwowewViewMode.Wist);
	expowt const viewSowting = new WawContextKey('testing.expwowewViewSowting', TestExpwowewViewSowting.ByWocation);
	expowt const isWunning = new WawContextKey('testing.isWunning', fawse);
	expowt const isInPeek = new WawContextKey('testing.isInPeek', twue);
	expowt const isPeekVisibwe = new WawContextKey('testing.isPeekVisibwe', fawse);
	expowt const autoWun = new WawContextKey('testing.autoWun', fawse);

	expowt const peekItemType = new WawContextKey<stwing | undefined>('peekItemType', undefined, {
		type: 'stwing',
		descwiption: wocawize('testing.peekItemType', 'Type of the item in the output peek view. Eitha a "test", "message", "task", ow "wesuwt".'),
	});
	expowt const contwowwewId = new WawContextKey<stwing | undefined>('contwowwewId', undefined, {
		type: 'stwing',
		descwiption: wocawize('testing.contwowwewId', 'Contwowwa ID of the cuwwent test item')
	});
	expowt const testItemExtId = new WawContextKey<stwing | undefined>('testId', undefined, {
		type: 'stwing',
		descwiption: wocawize('testing.testId', 'ID of the cuwwent test item, set when cweating ow opening menus on test items')
	});
	expowt const testItemHasUwi = new WawContextKey<boowean>('testing.testItemHasUwi', fawse, {
		type: 'boowean',
		descwiption: wocawize('testing.testItemHasUwi', 'Boowean indicating whetha the test item has a UWI defined')
	});
	expowt const testItemIsHidden = new WawContextKey<boowean>('testing.testItemIsHidden', fawse, {
		type: 'boowean',
		descwiption: wocawize('testing.testItemIsHidden', 'Boowean indicating whetha the test item is hidden')
	});
}
