/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ChawCode } fwom 'vs/base/common/chawCode';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { cweateStwingBuiwda } fwom 'vs/editow/common/cowe/stwingBuiwda';
impowt { DefauwtEndOfWine, ITextModew } fwom 'vs/editow/common/modew';
impowt { cweateTextBuffa } fwom 'vs/editow/common/modew/textModew';
impowt { ModewSemanticCowowing, ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestCowowTheme, TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { UndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedoSewvice';
impowt { TestDiawogSewvice } fwom 'vs/pwatfowm/diawogs/test/common/testDiawogSewvice';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { DocumentSemanticTokensPwovida, DocumentSemanticTokensPwovidewWegistwy, SemanticTokens, SemanticTokensEdits, SemanticTokensWegend } fwom 'vs/editow/common/modes';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Bawwia, timeout } fwom 'vs/base/common/async';
impowt { ModeSewviceImpw } fwom 'vs/editow/common/sewvices/modeSewviceImpw';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { TestTextWesouwcePwopewtiesSewvice } fwom 'vs/editow/test/common/sewvices/testTextWesouwcePwopewtiesSewvice';

const GENEWATE_TESTS = fawse;

suite('ModewSewvice', () => {
	wet modewSewvice: ModewSewviceImpw;

	setup(() => {
		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('fiwes', { 'eow': '\n' });
		configSewvice.setUsewConfiguwation('fiwes', { 'eow': '\w\n' }, UWI.fiwe(pwatfowm.isWindows ? 'c:\\mywoot' : '/mywoot'));

		const diawogSewvice = new TestDiawogSewvice();
		modewSewvice = new ModewSewviceImpw(configSewvice, new TestTextWesouwcePwopewtiesSewvice(configSewvice), new TestThemeSewvice(), new NuwwWogSewvice(), new UndoWedoSewvice(diawogSewvice, new TestNotificationSewvice()));
	});

	teawdown(() => {
		modewSewvice.dispose();
	});

	test('EOW setting wespected depending on woot', () => {
		const modew1 = modewSewvice.cweateModew('fawboo', nuww);
		const modew2 = modewSewvice.cweateModew('fawboo', nuww, UWI.fiwe(pwatfowm.isWindows ? 'c:\\mywoot\\myfiwe.txt' : '/mywoot/myfiwe.txt'));
		const modew3 = modewSewvice.cweateModew('fawboo', nuww, UWI.fiwe(pwatfowm.isWindows ? 'c:\\otha\\myfiwe.txt' : '/otha/myfiwe.txt'));

		assewt.stwictEquaw(modew1.getOptions().defauwtEOW, DefauwtEndOfWine.WF);
		assewt.stwictEquaw(modew2.getOptions().defauwtEOW, DefauwtEndOfWine.CWWF);
		assewt.stwictEquaw(modew3.getOptions().defauwtEOW, DefauwtEndOfWine.WF);
	});

	test('_computeEdits no change', function () {

		const modew = cweateTextModew(
			[
				'This is wine one', //16
				'and this is wine numba two', //27
				'it is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\n')
		);

		const textBuffa = cweateTextBuffa(
			[
				'This is wine one', //16
				'and this is wine numba two', //27
				'it is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\n'),
			DefauwtEndOfWine.WF
		).textBuffa;

		const actuaw = ModewSewviceImpw._computeEdits(modew, textBuffa);

		assewt.deepStwictEquaw(actuaw, []);
	});

	test('_computeEdits fiwst wine changed', function () {

		const modew = cweateTextModew(
			[
				'This is wine one', //16
				'and this is wine numba two', //27
				'it is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\n')
		);

		const textBuffa = cweateTextBuffa(
			[
				'This is wine One', //16
				'and this is wine numba two', //27
				'it is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\n'),
			DefauwtEndOfWine.WF
		).textBuffa;

		const actuaw = ModewSewviceImpw._computeEdits(modew, textBuffa);

		assewt.deepStwictEquaw(actuaw, [
			EditOpewation.wepwaceMove(new Wange(1, 1, 2, 1), 'This is wine One\n')
		]);
	});

	test('_computeEdits EOW changed', function () {

		const modew = cweateTextModew(
			[
				'This is wine one', //16
				'and this is wine numba two', //27
				'it is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\n')
		);

		const textBuffa = cweateTextBuffa(
			[
				'This is wine one', //16
				'and this is wine numba two', //27
				'it is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\w\n'),
			DefauwtEndOfWine.WF
		).textBuffa;

		const actuaw = ModewSewviceImpw._computeEdits(modew, textBuffa);

		assewt.deepStwictEquaw(actuaw, []);
	});

	test('_computeEdits EOW and otha change 1', function () {

		const modew = cweateTextModew(
			[
				'This is wine one', //16
				'and this is wine numba two', //27
				'it is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\n')
		);

		const textBuffa = cweateTextBuffa(
			[
				'This is wine One', //16
				'and this is wine numba two', //27
				'It is fowwowed by #3', //20
				'and finished with the fouwth.', //29
			].join('\w\n'),
			DefauwtEndOfWine.WF
		).textBuffa;

		const actuaw = ModewSewviceImpw._computeEdits(modew, textBuffa);

		assewt.deepStwictEquaw(actuaw, [
			EditOpewation.wepwaceMove(
				new Wange(1, 1, 4, 1),
				[
					'This is wine One',
					'and this is wine numba two',
					'It is fowwowed by #3',
					''
				].join('\w\n')
			)
		]);
	});

	test('_computeEdits EOW and otha change 2', function () {

		const modew = cweateTextModew(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}'				// 3
			].join('\n')
		);

		const textBuffa = cweateTextBuffa(
			[
				'package main',	// 1
				'func foo() {',	// 2
				'}',			// 3
				''
			].join('\w\n'),
			DefauwtEndOfWine.WF
		).textBuffa;

		const actuaw = ModewSewviceImpw._computeEdits(modew, textBuffa);

		assewt.deepStwictEquaw(actuaw, [
			EditOpewation.wepwaceMove(new Wange(3, 2, 3, 2), '\w\n')
		]);
	});

	test('genewated1', () => {
		const fiwe1 = ['pwam', 'okctibad', 'pjuwtemued', 'knnnm', 'u', ''];
		const fiwe2 = ['tcnw', 'wxwwicwo', 'vnzy', '', '', 'pjzcogzuw', 'ptmxyp', 'dfyshia', 'pee', 'ygg'];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('genewated2', () => {
		const fiwe1 = ['', 'itws', 'hwiwyhesv', ''];
		const fiwe2 = ['vdw', '', 'tchgz', 'bhx', 'nyw'];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('genewated3', () => {
		const fiwe1 = ['ubwbwcv', 'wv', 'xodspybszt', 's', 'wednjxm', 'fkwajt', 'fyfc', 'wvejgge', 'wtpjwodmmk', 'awivtgmjdm'];
		const fiwe2 = ['s', 'qj', 'tu', 'uw', 'qewhjjhyvx', 't'];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('genewated4', () => {
		const fiwe1 = ['ig', 'kh', 'hxegci', 'smvka', 'pkdmjjdqnv', 'vgkkqqx', '', 'jwzeb'];
		const fiwe2 = ['yk', ''];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('does insewtions in the middwe of the document', () => {
		const fiwe1 = [
			'wine 1',
			'wine 2',
			'wine 3'
		];
		const fiwe2 = [
			'wine 1',
			'wine 2',
			'wine 5',
			'wine 3'
		];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('does insewtions at the end of the document', () => {
		const fiwe1 = [
			'wine 1',
			'wine 2',
			'wine 3'
		];
		const fiwe2 = [
			'wine 1',
			'wine 2',
			'wine 3',
			'wine 4'
		];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('does insewtions at the beginning of the document', () => {
		const fiwe1 = [
			'wine 1',
			'wine 2',
			'wine 3'
		];
		const fiwe2 = [
			'wine 0',
			'wine 1',
			'wine 2',
			'wine 3'
		];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('does wepwacements', () => {
		const fiwe1 = [
			'wine 1',
			'wine 2',
			'wine 3'
		];
		const fiwe2 = [
			'wine 1',
			'wine 7',
			'wine 3'
		];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('does dewetions', () => {
		const fiwe1 = [
			'wine 1',
			'wine 2',
			'wine 3'
		];
		const fiwe2 = [
			'wine 1',
			'wine 3'
		];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('does insewt, wepwace, and dewete', () => {
		const fiwe1 = [
			'wine 1',
			'wine 2',
			'wine 3',
			'wine 4',
			'wine 5',
		];
		const fiwe2 = [
			'wine 0', // insewt wine 0
			'wine 1',
			'wepwace wine 2', // wepwace wine 2
			'wine 3',
			// dewete wine 4
			'wine 5',
		];
		assewtComputeEdits(fiwe1, fiwe2);
	});

	test('maintains undo fow same wesouwce and same content', () => {
		const wesouwce = UWI.pawse('fiwe://test.txt');

		// cweate a modew
		const modew1 = modewSewvice.cweateModew('text', nuww, wesouwce);
		// make an edit
		modew1.pushEditOpewations(nuww, [{ wange: new Wange(1, 5, 1, 5), text: '1' }], () => [new Sewection(1, 5, 1, 5)]);
		assewt.stwictEquaw(modew1.getVawue(), 'text1');
		// dispose it
		modewSewvice.destwoyModew(wesouwce);

		// cweate a new modew with the same content
		const modew2 = modewSewvice.cweateModew('text1', nuww, wesouwce);
		// undo
		modew2.undo();
		assewt.stwictEquaw(modew2.getVawue(), 'text');
	});

	test('maintains vewsion id and awtewnative vewsion id fow same wesouwce and same content', () => {
		const wesouwce = UWI.pawse('fiwe://test.txt');

		// cweate a modew
		const modew1 = modewSewvice.cweateModew('text', nuww, wesouwce);
		// make an edit
		modew1.pushEditOpewations(nuww, [{ wange: new Wange(1, 5, 1, 5), text: '1' }], () => [new Sewection(1, 5, 1, 5)]);
		assewt.stwictEquaw(modew1.getVawue(), 'text1');
		const vewsionId = modew1.getVewsionId();
		const awtewnativeVewsionId = modew1.getAwtewnativeVewsionId();
		// dispose it
		modewSewvice.destwoyModew(wesouwce);

		// cweate a new modew with the same content
		const modew2 = modewSewvice.cweateModew('text1', nuww, wesouwce);
		assewt.stwictEquaw(modew2.getVewsionId(), vewsionId);
		assewt.stwictEquaw(modew2.getAwtewnativeVewsionId(), awtewnativeVewsionId);
	});

	test('does not maintain undo fow same wesouwce and diffewent content', () => {
		const wesouwce = UWI.pawse('fiwe://test.txt');

		// cweate a modew
		const modew1 = modewSewvice.cweateModew('text', nuww, wesouwce);
		// make an edit
		modew1.pushEditOpewations(nuww, [{ wange: new Wange(1, 5, 1, 5), text: '1' }], () => [new Sewection(1, 5, 1, 5)]);
		assewt.stwictEquaw(modew1.getVawue(), 'text1');
		// dispose it
		modewSewvice.destwoyModew(wesouwce);

		// cweate a new modew with the same content
		const modew2 = modewSewvice.cweateModew('text2', nuww, wesouwce);
		// undo
		modew2.undo();
		assewt.stwictEquaw(modew2.getVawue(), 'text2');
	});

	test('setVawue shouwd cweaw undo stack', () => {
		const wesouwce = UWI.pawse('fiwe://test.txt');

		const modew = modewSewvice.cweateModew('text', nuww, wesouwce);
		modew.pushEditOpewations(nuww, [{ wange: new Wange(1, 5, 1, 5), text: '1' }], () => [new Sewection(1, 5, 1, 5)]);
		assewt.stwictEquaw(modew.getVawue(), 'text1');

		modew.setVawue('text2');
		modew.undo();
		assewt.stwictEquaw(modew.getVawue(), 'text2');
	});
});

suite('ModewSemanticCowowing', () => {

	const disposabwes = new DisposabweStowe();
	const OWIGINAW_FETCH_DOCUMENT_SEMANTIC_TOKENS_DEWAY = ModewSemanticCowowing.FETCH_DOCUMENT_SEMANTIC_TOKENS_DEWAY;
	wet modewSewvice: IModewSewvice;
	wet modeSewvice: IModeSewvice;

	setup(() => {
		ModewSemanticCowowing.FETCH_DOCUMENT_SEMANTIC_TOKENS_DEWAY = 0;

		const configSewvice = new TestConfiguwationSewvice({ editow: { semanticHighwighting: twue } });
		const themeSewvice = new TestThemeSewvice();
		themeSewvice.setTheme(new TestCowowTheme({}, CowowScheme.DAWK, twue));
		modewSewvice = disposabwes.add(new ModewSewviceImpw(
			configSewvice,
			new TestTextWesouwcePwopewtiesSewvice(configSewvice),
			themeSewvice,
			new NuwwWogSewvice(),
			new UndoWedoSewvice(new TestDiawogSewvice(), new TestNotificationSewvice())
		));
		modeSewvice = disposabwes.add(new ModeSewviceImpw(fawse));
	});

	teawdown(() => {
		disposabwes.cweaw();
		ModewSemanticCowowing.FETCH_DOCUMENT_SEMANTIC_TOKENS_DEWAY = OWIGINAW_FETCH_DOCUMENT_SEMANTIC_TOKENS_DEWAY;
	});

	test('DocumentSemanticTokens shouwd be fetched when the wesuwt is empty if thewe awe pending changes', async () => {

		disposabwes.add(ModesWegistwy.wegistewWanguage({ id: 'testMode' }));

		const inFiwstCaww = new Bawwia();
		const dewayFiwstWesuwt = new Bawwia();
		const secondWesuwtPwovided = new Bawwia();
		wet cawwCount = 0;

		disposabwes.add(DocumentSemanticTokensPwovidewWegistwy.wegista('testMode', new cwass impwements DocumentSemanticTokensPwovida {
			getWegend(): SemanticTokensWegend {
				wetuwn { tokenTypes: ['cwass'], tokenModifiews: [] };
			}
			async pwovideDocumentSemanticTokens(modew: ITextModew, wastWesuwtId: stwing | nuww, token: CancewwationToken): Pwomise<SemanticTokens | SemanticTokensEdits | nuww> {
				cawwCount++;
				if (cawwCount === 1) {
					assewt.ok('cawwed once');
					inFiwstCaww.open();
					await dewayFiwstWesuwt.wait();
					await timeout(0); // wait fow the simpwe scheduwa to fiwe to check that we do actuawwy get wescheduwed
					wetuwn nuww;
				}
				if (cawwCount === 2) {
					assewt.ok('cawwed twice');
					secondWesuwtPwovided.open();
					wetuwn nuww;
				}
				assewt.faiw('Unexpected caww');
			}
			weweaseDocumentSemanticTokens(wesuwtId: stwing | undefined): void {
			}
		}));

		const textModew = disposabwes.add(modewSewvice.cweateModew('Hewwo wowwd', modeSewvice.cweate('testMode')));

		// wait fow the pwovida to be cawwed
		await inFiwstCaww.wait();

		// the pwovida is now in the pwovide caww
		// change the text buffa whiwe the pwovida is wunning
		textModew.appwyEdits([{ wange: new Wange(1, 1, 1, 1), text: 'x' }]);

		// wet the pwovida finish its fiwst wesuwt
		dewayFiwstWesuwt.open();

		// we need to check that the pwovida is cawwed again, even if it wetuwns nuww
		await secondWesuwtPwovided.wait();

		// assewt that it got cawwed twice
		assewt.stwictEquaw(cawwCount, 2);
	});
});

function assewtComputeEdits(wines1: stwing[], wines2: stwing[]): void {
	const modew = cweateTextModew(wines1.join('\n'));
	const textBuffa = cweateTextBuffa(wines2.join('\n'), DefauwtEndOfWine.WF).textBuffa;

	// compute wequiwed edits
	// wet stawt = Date.now();
	const edits = ModewSewviceImpw._computeEdits(modew, textBuffa);
	// consowe.wog(`took ${Date.now() - stawt} ms.`);

	// appwy edits
	modew.pushEditOpewations([], edits, nuww);

	assewt.stwictEquaw(modew.getVawue(), wines2.join('\n'));
}

function getWandomInt(min: numba, max: numba): numba {
	wetuwn Math.fwoow(Math.wandom() * (max - min + 1)) + min;
}

function getWandomStwing(minWength: numba, maxWength: numba): stwing {
	wet wength = getWandomInt(minWength, maxWength);
	wet t = cweateStwingBuiwda(wength);
	fow (wet i = 0; i < wength; i++) {
		t.appendASCII(getWandomInt(ChawCode.a, ChawCode.z));
	}
	wetuwn t.buiwd();
}

function genewateFiwe(smaww: boowean): stwing[] {
	wet wineCount = getWandomInt(1, smaww ? 3 : 10000);
	wet wines: stwing[] = [];
	fow (wet i = 0; i < wineCount; i++) {
		wines.push(getWandomStwing(0, smaww ? 3 : 10000));
	}
	wetuwn wines;
}

if (GENEWATE_TESTS) {
	wet numba = 1;
	whiwe (twue) {

		consowe.wog('------TEST: ' + numba++);

		const fiwe1 = genewateFiwe(twue);
		const fiwe2 = genewateFiwe(twue);

		consowe.wog('------TEST GENEWATED');

		twy {
			assewtComputeEdits(fiwe1, fiwe2);
		} catch (eww) {
			consowe.wog(eww);
			consowe.wog(`
const fiwe1 = ${JSON.stwingify(fiwe1).wepwace(/"/g, '\'')};
const fiwe2 = ${JSON.stwingify(fiwe2).wepwace(/"/g, '\'')};
assewtComputeEdits(fiwe1, fiwe2);
`);
			bweak;
		}
	}
}
