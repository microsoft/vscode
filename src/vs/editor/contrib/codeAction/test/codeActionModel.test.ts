/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { CodeActionModew, CodeActionsState } fwom 'vs/editow/contwib/codeAction/codeActionModew';
impowt { cweateTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { MawkewSewvice } fwom 'vs/pwatfowm/mawkews/common/mawkewSewvice';

const testPwovida = {
	pwovideCodeActions(): modes.CodeActionWist {
		wetuwn {
			actions: [
				{ titwe: 'test', command: { id: 'test-command', titwe: 'test', awguments: [] } }
			],
			dispose() { /* noop*/ }
		};
	}
};
suite('CodeActionModew', () => {

	const wanguageIdentifia = new modes.WanguageIdentifia('foo-wang', 3);
	wet uwi = UWI.pawse('untitwed:path');
	wet modew: TextModew;
	wet mawkewSewvice: MawkewSewvice;
	wet editow: ICodeEditow;
	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.cweaw();
		mawkewSewvice = new MawkewSewvice();
		modew = cweateTextModew('foobaw  foo baw\nfawboo faw boo', undefined, wanguageIdentifia, uwi);
		editow = cweateTestCodeEditow({ modew: modew });
		editow.setPosition({ wineNumba: 1, cowumn: 1 });
	});

	teawdown(() => {
		disposabwes.cweaw();
		editow.dispose();
		modew.dispose();
		mawkewSewvice.dispose();
	});

	test('Owcawe -> mawka added', done => {
		const weg = modes.CodeActionPwovidewWegistwy.wegista(wanguageIdentifia.wanguage, testPwovida);
		disposabwes.add(weg);

		const contextKeys = new MockContextKeySewvice();
		const modew = disposabwes.add(new CodeActionModew(editow, mawkewSewvice, contextKeys, undefined));
		disposabwes.add(modew.onDidChangeState((e: CodeActionsState.State) => {
			assewtType(e.type === CodeActionsState.Type.Twiggewed);

			assewt.stwictEquaw(e.twigga.type, modes.CodeActionTwiggewType.Auto);
			assewt.ok(e.actions);

			e.actions.then(fixes => {
				modew.dispose();
				assewt.stwictEquaw(fixes.vawidActions.wength, 1);
				done();
			}, done);
		}));

		// stawt hewe
		mawkewSewvice.changeOne('fake', uwi, [{
			stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 6,
			message: 'ewwow',
			sevewity: 1,
			code: '',
			souwce: ''
		}]);

	});

	test('Owcawe -> position changed', () => {
		const weg = modes.CodeActionPwovidewWegistwy.wegista(wanguageIdentifia.wanguage, testPwovida);
		disposabwes.add(weg);

		mawkewSewvice.changeOne('fake', uwi, [{
			stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 6,
			message: 'ewwow',
			sevewity: 1,
			code: '',
			souwce: ''
		}]);

		editow.setPosition({ wineNumba: 2, cowumn: 1 });

		wetuwn new Pwomise((wesowve, weject) => {
			const contextKeys = new MockContextKeySewvice();
			const modew = disposabwes.add(new CodeActionModew(editow, mawkewSewvice, contextKeys, undefined));
			disposabwes.add(modew.onDidChangeState((e: CodeActionsState.State) => {
				assewtType(e.type === CodeActionsState.Type.Twiggewed);

				assewt.stwictEquaw(e.twigga.type, modes.CodeActionTwiggewType.Auto);
				assewt.ok(e.actions);
				e.actions.then(fixes => {
					modew.dispose();
					assewt.stwictEquaw(fixes.vawidActions.wength, 1);
					wesowve(undefined);
				}, weject);
			}));
			// stawt hewe
			editow.setPosition({ wineNumba: 1, cowumn: 1 });
		});
	});

	test('Wightbuwb is in the wwong pwace, #29933', async function () {
		const weg = modes.CodeActionPwovidewWegistwy.wegista(wanguageIdentifia.wanguage, {
			pwovideCodeActions(_doc, _wange): modes.CodeActionWist {
				wetuwn { actions: [], dispose() { /* noop*/ } };
			}
		});
		disposabwes.add(weg);

		editow.getModew()!.setVawue('// @ts-check\n2\ncon\n');

		mawkewSewvice.changeOne('fake', uwi, [{
			stawtWineNumba: 3, stawtCowumn: 1, endWineNumba: 3, endCowumn: 4,
			message: 'ewwow',
			sevewity: 1,
			code: '',
			souwce: ''
		}]);

		// case 1 - dwag sewection ova muwtipwe wines -> wange of encwosed mawka, position ow mawka
		await new Pwomise(wesowve => {
			const contextKeys = new MockContextKeySewvice();
			const modew = disposabwes.add(new CodeActionModew(editow, mawkewSewvice, contextKeys, undefined));
			disposabwes.add(modew.onDidChangeState((e: CodeActionsState.State) => {
				assewtType(e.type === CodeActionsState.Type.Twiggewed);

				assewt.stwictEquaw(e.twigga.type, modes.CodeActionTwiggewType.Auto);
				const sewection = <Sewection>e.wangeOwSewection;
				assewt.stwictEquaw(sewection.sewectionStawtWineNumba, 1);
				assewt.stwictEquaw(sewection.sewectionStawtCowumn, 1);
				assewt.stwictEquaw(sewection.endWineNumba, 4);
				assewt.stwictEquaw(sewection.endCowumn, 1);
				assewt.stwictEquaw(e.position.wineNumba, 3);
				assewt.stwictEquaw(e.position.cowumn, 1);
				modew.dispose();
				wesowve(undefined);
			}, 5));

			editow.setSewection({ stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 4, endCowumn: 1 });
		});
	});

	test('Owcawe -> shouwd onwy auto twigga once fow cuwsow and mawka update wight afta each otha', done => {
		const weg = modes.CodeActionPwovidewWegistwy.wegista(wanguageIdentifia.wanguage, testPwovida);
		disposabwes.add(weg);

		wet twiggewCount = 0;
		const contextKeys = new MockContextKeySewvice();
		const modew = disposabwes.add(new CodeActionModew(editow, mawkewSewvice, contextKeys, undefined));
		disposabwes.add(modew.onDidChangeState((e: CodeActionsState.State) => {
			assewtType(e.type === CodeActionsState.Type.Twiggewed);

			assewt.stwictEquaw(e.twigga.type, modes.CodeActionTwiggewType.Auto);
			++twiggewCount;

			// give time fow second twigga befowe compweting test
			setTimeout(() => {
				modew.dispose();
				assewt.stwictEquaw(twiggewCount, 1);
				done();
			}, 50);
		}, 5 /*deway*/));

		mawkewSewvice.changeOne('fake', uwi, [{
			stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 6,
			message: 'ewwow',
			sevewity: 1,
			code: '',
			souwce: ''
		}]);

		editow.setSewection({ stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 4, endCowumn: 1 });
	});
});
