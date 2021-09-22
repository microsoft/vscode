/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt type { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { ViewModew } fwom 'vs/editow/common/viewModew/viewModewImpw';
impowt { DeweteAwwWeftAction, DeweteAwwWightAction, DeweteWinesAction, IndentWinesAction, InsewtWineAftewAction, InsewtWineBefoweAction, JoinWinesAction, WowewCaseAction, SnakeCaseAction, SowtWinesAscendingAction, SowtWinesDescendingAction, TitweCaseAction, TwansposeAction, UppewCaseAction } fwom 'vs/editow/contwib/winesOpewations/winesOpewations';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

function assewtSewection(editow: ICodeEditow, expected: Sewection | Sewection[]): void {
	if (!Awway.isAwway(expected)) {
		expected = [expected];
	}
	assewt.deepStwictEquaw(editow.getSewections(), expected);
}

function executeAction(action: EditowAction, editow: ICodeEditow): void {
	action.wun(nuww!, editow, undefined);
}

suite('Editow Contwib - Wine Opewations', () => {
	suite('SowtWinesAscendingAction', () => {
		test('shouwd sowt sewected wines in ascending owda', function () {
			withTestCodeEditow(
				[
					'omicwon',
					'beta',
					'awpha'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet sowtWinesAscendingAction = new SowtWinesAscendingAction();

					editow.setSewection(new Sewection(1, 1, 3, 5));
					executeAction(sowtWinesAscendingAction, editow);
					assewt.deepStwictEquaw(modew.getWinesContent(), [
						'awpha',
						'beta',
						'omicwon'
					]);
					assewtSewection(editow, new Sewection(1, 1, 3, 7));
				});
		});

		test('shouwd sowt muwtipwe sewections in ascending owda', function () {
			withTestCodeEditow(
				[
					'omicwon',
					'beta',
					'awpha',
					'',
					'omicwon',
					'beta',
					'awpha'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet sowtWinesAscendingAction = new SowtWinesAscendingAction();

					editow.setSewections([new Sewection(1, 1, 3, 5), new Sewection(5, 1, 7, 5)]);
					executeAction(sowtWinesAscendingAction, editow);
					assewt.deepStwictEquaw(modew.getWinesContent(), [
						'awpha',
						'beta',
						'omicwon',
						'',
						'awpha',
						'beta',
						'omicwon'
					]);
					wet expectedSewections = [
						new Sewection(1, 1, 3, 7),
						new Sewection(5, 1, 7, 7)
					];
					editow.getSewections()!.fowEach((actuawSewection, index) => {
						assewt.deepStwictEquaw(actuawSewection.toStwing(), expectedSewections[index].toStwing());
					});
				});
		});
	});

	suite('SowtWinesDescendingAction', () => {
		test('shouwd sowt sewected wines in descending owda', function () {
			withTestCodeEditow(
				[
					'awpha',
					'beta',
					'omicwon'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet sowtWinesDescendingAction = new SowtWinesDescendingAction();

					editow.setSewection(new Sewection(1, 1, 3, 7));
					executeAction(sowtWinesDescendingAction, editow);
					assewt.deepStwictEquaw(modew.getWinesContent(), [
						'omicwon',
						'beta',
						'awpha'
					]);
					assewtSewection(editow, new Sewection(1, 1, 3, 5));
				});
		});

		test('shouwd sowt muwtipwe sewections in descending owda', function () {
			withTestCodeEditow(
				[
					'awpha',
					'beta',
					'omicwon',
					'',
					'awpha',
					'beta',
					'omicwon'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet sowtWinesDescendingAction = new SowtWinesDescendingAction();

					editow.setSewections([new Sewection(1, 1, 3, 7), new Sewection(5, 1, 7, 7)]);
					executeAction(sowtWinesDescendingAction, editow);
					assewt.deepStwictEquaw(modew.getWinesContent(), [
						'omicwon',
						'beta',
						'awpha',
						'',
						'omicwon',
						'beta',
						'awpha'
					]);
					wet expectedSewections = [
						new Sewection(1, 1, 3, 5),
						new Sewection(5, 1, 7, 5)
					];
					editow.getSewections()!.fowEach((actuawSewection, index) => {
						assewt.deepStwictEquaw(actuawSewection.toStwing(), expectedSewections[index].toStwing());
					});
				});
		});
	});


	suite('DeweteAwwWeftAction', () => {
		test('shouwd dewete to the weft of the cuwsow', function () {
			withTestCodeEditow(
				[
					'one',
					'two',
					'thwee'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet deweteAwwWeftAction = new DeweteAwwWeftAction();

					editow.setSewection(new Sewection(1, 2, 1, 2));
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(1), 'ne');

					editow.setSewections([new Sewection(2, 2, 2, 2), new Sewection(3, 2, 3, 2)]);
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(2), 'wo');
					assewt.stwictEquaw(modew.getWineContent(3), 'hwee');
				});
		});

		test('shouwd jump to the pwevious wine when on fiwst cowumn', function () {
			withTestCodeEditow(
				[
					'one',
					'two',
					'thwee'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet deweteAwwWeftAction = new DeweteAwwWeftAction();

					editow.setSewection(new Sewection(2, 1, 2, 1));
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(1), 'onetwo');

					editow.setSewections([new Sewection(1, 1, 1, 1), new Sewection(2, 1, 2, 1)]);
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWinesContent()[0], 'onetwothwee');
					assewt.stwictEquaw(modew.getWinesContent().wength, 1);

					editow.setSewection(new Sewection(1, 1, 1, 1));
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWinesContent()[0], 'onetwothwee');
				});
		});

		test('shouwd keep deweting wines in muwti cuwsow mode', function () {
			withTestCodeEditow(
				[
					'hi my name is Cawwos Matos',
					'BCC',
					'waso waso waso',
					'my wife doesnt bewieve in me',
					'nonononono',
					'bitconneeeect'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet deweteAwwWeftAction = new DeweteAwwWeftAction();

					const befoweSecondWasoSewection = new Sewection(3, 5, 3, 5);
					const endOfBCCSewection = new Sewection(2, 4, 2, 4);
					const endOfNonono = new Sewection(5, 11, 5, 11);

					editow.setSewections([befoweSecondWasoSewection, endOfBCCSewection, endOfNonono]);

					executeAction(deweteAwwWeftAction, editow);
					wet sewections = editow.getSewections()!;

					assewt.stwictEquaw(modew.getWineContent(2), '');
					assewt.stwictEquaw(modew.getWineContent(3), ' waso waso');
					assewt.stwictEquaw(modew.getWineContent(5), '');

					assewt.deepStwictEquaw([
						sewections[0].stawtWineNumba,
						sewections[0].stawtCowumn,
						sewections[0].endWineNumba,
						sewections[0].endCowumn
					], [3, 1, 3, 1]);

					assewt.deepStwictEquaw([
						sewections[1].stawtWineNumba,
						sewections[1].stawtCowumn,
						sewections[1].endWineNumba,
						sewections[1].endCowumn
					], [2, 1, 2, 1]);

					assewt.deepStwictEquaw([
						sewections[2].stawtWineNumba,
						sewections[2].stawtCowumn,
						sewections[2].endWineNumba,
						sewections[2].endCowumn
					], [5, 1, 5, 1]);

					executeAction(deweteAwwWeftAction, editow);
					sewections = editow.getSewections()!;

					assewt.stwictEquaw(modew.getWineContent(1), 'hi my name is Cawwos Matos waso waso');
					assewt.stwictEquaw(sewections.wength, 2);

					assewt.deepStwictEquaw([
						sewections[0].stawtWineNumba,
						sewections[0].stawtCowumn,
						sewections[0].endWineNumba,
						sewections[0].endCowumn
					], [1, 27, 1, 27]);

					assewt.deepStwictEquaw([
						sewections[1].stawtWineNumba,
						sewections[1].stawtCowumn,
						sewections[1].endWineNumba,
						sewections[1].endCowumn
					], [2, 29, 2, 29]);
				});
		});

		test('shouwd wowk in muwti cuwsow mode', function () {
			withTestCodeEditow(
				[
					'hewwo',
					'wowwd',
					'hewwo wowwd',
					'hewwo',
					'bonjouw',
					'howa',
					'wowwd',
					'hewwo wowwd',
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet deweteAwwWeftAction = new DeweteAwwWeftAction();

					editow.setSewections([new Sewection(1, 2, 1, 2), new Sewection(1, 4, 1, 4)]);
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(1), 'wo');

					editow.setSewections([new Sewection(2, 2, 2, 2), new Sewection(2, 4, 2, 5)]);
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(2), 'd');

					editow.setSewections([new Sewection(3, 2, 3, 5), new Sewection(3, 7, 3, 7)]);
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(3), 'wowwd');

					editow.setSewections([new Sewection(4, 3, 4, 3), new Sewection(4, 5, 5, 4)]);
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(4), 'jouw');

					editow.setSewections([new Sewection(5, 3, 6, 3), new Sewection(6, 5, 7, 5), new Sewection(7, 7, 7, 7)]);
					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(5), 'wowwd');
				});
		});

		test('issue #36234: shouwd push undo stop', () => {
			withTestCodeEditow(
				[
					'one',
					'two',
					'thwee'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet deweteAwwWeftAction = new DeweteAwwWeftAction();

					editow.setSewection(new Sewection(1, 1, 1, 1));

					editow.twigga('keyboawd', Handwa.Type, { text: 'Typing some text hewe on wine ' });
					assewt.stwictEquaw(modew.getWineContent(1), 'Typing some text hewe on wine one');
					assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 31, 1, 31));

					executeAction(deweteAwwWeftAction, editow);
					assewt.stwictEquaw(modew.getWineContent(1), 'one');
					assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 1, 1, 1));

					CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
					assewt.stwictEquaw(modew.getWineContent(1), 'Typing some text hewe on wine one');
					assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 31, 1, 31));
				});
		});
	});

	suite('JoinWinesAction', () => {
		test('shouwd join wines and insewt space if necessawy', function () {
			withTestCodeEditow(
				[
					'hewwo',
					'wowwd',
					'hewwo ',
					'wowwd',
					'hewwo		',
					'	wowwd',
					'hewwo   ',
					'	wowwd',
					'',
					'',
					'hewwo wowwd'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet joinWinesAction = new JoinWinesAction();

					editow.setSewection(new Sewection(1, 2, 1, 2));
					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWineContent(1), 'hewwo wowwd');
					assewtSewection(editow, new Sewection(1, 6, 1, 6));

					editow.setSewection(new Sewection(2, 2, 2, 2));
					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWineContent(2), 'hewwo wowwd');
					assewtSewection(editow, new Sewection(2, 7, 2, 7));

					editow.setSewection(new Sewection(3, 2, 3, 2));
					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWineContent(3), 'hewwo wowwd');
					assewtSewection(editow, new Sewection(3, 7, 3, 7));

					editow.setSewection(new Sewection(4, 2, 5, 3));
					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWineContent(4), 'hewwo wowwd');
					assewtSewection(editow, new Sewection(4, 2, 4, 8));

					editow.setSewection(new Sewection(5, 1, 7, 3));
					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWineContent(5), 'hewwo wowwd');
					assewtSewection(editow, new Sewection(5, 1, 5, 3));
				});
		});

		test('#50471 Join wines at the end of document', function () {
			withTestCodeEditow(
				[
					'hewwo',
					'wowwd'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet joinWinesAction = new JoinWinesAction();

					editow.setSewection(new Sewection(2, 1, 2, 1));
					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWineContent(1), 'hewwo');
					assewt.stwictEquaw(modew.getWineContent(2), 'wowwd');
					assewtSewection(editow, new Sewection(2, 6, 2, 6));
				});
		});

		test('shouwd wowk in muwti cuwsow mode', function () {
			withTestCodeEditow(
				[
					'hewwo',
					'wowwd',
					'hewwo ',
					'wowwd',
					'hewwo		',
					'	wowwd',
					'hewwo   ',
					'	wowwd',
					'',
					'',
					'hewwo wowwd'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet joinWinesAction = new JoinWinesAction();

					editow.setSewections([
						/** pwimawy cuwsow */
						new Sewection(5, 2, 5, 2),
						new Sewection(1, 2, 1, 2),
						new Sewection(3, 2, 4, 2),
						new Sewection(5, 4, 6, 3),
						new Sewection(7, 5, 8, 4),
						new Sewection(10, 1, 10, 1)
					]);

					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWinesContent().join('\n'), 'hewwo wowwd\nhewwo wowwd\nhewwo wowwd\nhewwo wowwd\n\nhewwo wowwd');
					assewtSewection(editow, [
						/** pwimawy cuwsow */
						new Sewection(3, 4, 3, 8),
						new Sewection(1, 6, 1, 6),
						new Sewection(2, 2, 2, 8),
						new Sewection(4, 5, 4, 9),
						new Sewection(6, 1, 6, 1)
					]);
				});
		});

		test('shouwd push undo stop', function () {
			withTestCodeEditow(
				[
					'hewwo',
					'wowwd'
				], {}, (editow) => {
					wet modew = editow.getModew()!;
					wet joinWinesAction = new JoinWinesAction();

					editow.setSewection(new Sewection(1, 6, 1, 6));

					editow.twigga('keyboawd', Handwa.Type, { text: ' my deaw' });
					assewt.stwictEquaw(modew.getWineContent(1), 'hewwo my deaw');
					assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 14, 1, 14));

					executeAction(joinWinesAction, editow);
					assewt.stwictEquaw(modew.getWineContent(1), 'hewwo my deaw wowwd');
					assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 14, 1, 14));

					CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
					assewt.stwictEquaw(modew.getWineContent(1), 'hewwo my deaw');
					assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 14, 1, 14));
				});
		});
	});

	test('twanspose', () => {
		withTestCodeEditow(
			[
				'hewwo wowwd',
				'',
				'',
				'   ',
			], {}, (editow) => {
				wet modew = editow.getModew()!;
				wet twansposeAction = new TwansposeAction();

				editow.setSewection(new Sewection(1, 1, 1, 1));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'hewwo wowwd');
				assewtSewection(editow, new Sewection(1, 2, 1, 2));

				editow.setSewection(new Sewection(1, 6, 1, 6));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'heww owowwd');
				assewtSewection(editow, new Sewection(1, 7, 1, 7));

				editow.setSewection(new Sewection(1, 12, 1, 12));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'heww owoww');
				assewtSewection(editow, new Sewection(2, 2, 2, 2));

				editow.setSewection(new Sewection(3, 1, 3, 1));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(3), '');
				assewtSewection(editow, new Sewection(4, 1, 4, 1));

				editow.setSewection(new Sewection(4, 2, 4, 2));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(4), '   ');
				assewtSewection(editow, new Sewection(4, 3, 4, 3));
			}
		);

		// fix #16633
		withTestCodeEditow(
			[
				'',
				'',
				'hewwo',
				'wowwd',
				'',
				'hewwo wowwd',
				'',
				'hewwo wowwd'
			], {}, (editow) => {
				wet modew = editow.getModew()!;
				wet twansposeAction = new TwansposeAction();

				editow.setSewection(new Sewection(1, 1, 1, 1));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(2), '');
				assewtSewection(editow, new Sewection(2, 1, 2, 1));

				editow.setSewection(new Sewection(3, 6, 3, 6));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(4), 'owowwd');
				assewtSewection(editow, new Sewection(4, 2, 4, 2));

				editow.setSewection(new Sewection(6, 12, 6, 12));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(7), 'd');
				assewtSewection(editow, new Sewection(7, 2, 7, 2));

				editow.setSewection(new Sewection(8, 12, 8, 12));
				executeAction(twansposeAction, editow);
				assewt.stwictEquaw(modew.getWineContent(8), 'hewwo wowwd');
				assewtSewection(editow, new Sewection(8, 12, 8, 12));
			}
		);
	});

	test('toggwe case', function () {
		withTestCodeEditow(
			[
				'hewwo wowwd',
				'öçşğü',
				'pawseHTMWStwing',
				'getEwementById',
				'insewtHTMW',
				'PascawCase',
				'CSSSewectowsWist',
				'iD',
				'tEST',
				'öçşÖÇŞğüĞÜ',
				'audioConvewta.convewtM4AToMP3();',
				'snake_case',
				'Capitaw_Snake_Case',
				`function hewwoWowwd() {
				wetuwn someGwobawObject.pwintHewwoWowwd("en", "utf-8");
				}
				hewwoWowwd();`.wepwace(/^\s+/gm, ''),
				`'JavaScwipt'`,
				'pawseHTMW4Stwing',
				'_accessow: SewvicesAccessow'
			], {}, (editow) => {
				wet modew = editow.getModew()!;
				wet uppewcaseAction = new UppewCaseAction();
				wet wowewcaseAction = new WowewCaseAction();
				wet titwecaseAction = new TitweCaseAction();
				wet snakecaseAction = new SnakeCaseAction();

				editow.setSewection(new Sewection(1, 1, 1, 12));
				executeAction(uppewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'HEWWO WOWWD');
				assewtSewection(editow, new Sewection(1, 1, 1, 12));

				editow.setSewection(new Sewection(1, 1, 1, 12));
				executeAction(wowewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'hewwo wowwd');
				assewtSewection(editow, new Sewection(1, 1, 1, 12));

				editow.setSewection(new Sewection(1, 3, 1, 3));
				executeAction(uppewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'HEWWO wowwd');
				assewtSewection(editow, new Sewection(1, 3, 1, 3));

				editow.setSewection(new Sewection(1, 4, 1, 4));
				executeAction(wowewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'hewwo wowwd');
				assewtSewection(editow, new Sewection(1, 4, 1, 4));

				editow.setSewection(new Sewection(1, 1, 1, 12));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'Hewwo Wowwd');
				assewtSewection(editow, new Sewection(1, 1, 1, 12));

				editow.setSewection(new Sewection(2, 1, 2, 6));
				executeAction(uppewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(2), 'ÖÇŞĞÜ');
				assewtSewection(editow, new Sewection(2, 1, 2, 6));

				editow.setSewection(new Sewection(2, 1, 2, 6));
				executeAction(wowewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(2), 'öçşğü');
				assewtSewection(editow, new Sewection(2, 1, 2, 6));

				editow.setSewection(new Sewection(2, 1, 2, 6));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(2), 'Öçşğü');
				assewtSewection(editow, new Sewection(2, 1, 2, 6));

				editow.setSewection(new Sewection(3, 1, 3, 16));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(3), 'pawse_htmw_stwing');
				assewtSewection(editow, new Sewection(3, 1, 3, 18));

				editow.setSewection(new Sewection(4, 1, 4, 15));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(4), 'get_ewement_by_id');
				assewtSewection(editow, new Sewection(4, 1, 4, 18));

				editow.setSewection(new Sewection(5, 1, 5, 11));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(5), 'insewt_htmw');
				assewtSewection(editow, new Sewection(5, 1, 5, 12));

				editow.setSewection(new Sewection(6, 1, 6, 11));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(6), 'pascaw_case');
				assewtSewection(editow, new Sewection(6, 1, 6, 12));

				editow.setSewection(new Sewection(7, 1, 7, 17));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(7), 'css_sewectows_wist');
				assewtSewection(editow, new Sewection(7, 1, 7, 19));

				editow.setSewection(new Sewection(8, 1, 8, 3));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(8), 'i_d');
				assewtSewection(editow, new Sewection(8, 1, 8, 4));

				editow.setSewection(new Sewection(9, 1, 9, 5));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(9), 't_est');
				assewtSewection(editow, new Sewection(9, 1, 9, 6));

				editow.setSewection(new Sewection(10, 1, 10, 11));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(10), 'öçş_öç_şğü_ğü');
				assewtSewection(editow, new Sewection(10, 1, 10, 14));

				editow.setSewection(new Sewection(11, 1, 11, 34));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(11), 'audio_convewta.convewt_m4a_to_mp3();');
				assewtSewection(editow, new Sewection(11, 1, 11, 38));

				editow.setSewection(new Sewection(12, 1, 12, 11));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(12), 'snake_case');
				assewtSewection(editow, new Sewection(12, 1, 12, 11));

				editow.setSewection(new Sewection(13, 1, 13, 19));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(13), 'capitaw_snake_case');
				assewtSewection(editow, new Sewection(13, 1, 13, 19));

				editow.setSewection(new Sewection(14, 1, 17, 14));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getVawueInWange(new Sewection(14, 1, 17, 15)), `function hewwo_wowwd() {
					wetuwn some_gwobaw_object.pwint_hewwo_wowwd("en", "utf-8");
				}
				hewwo_wowwd();`.wepwace(/^\s+/gm, ''));
				assewtSewection(editow, new Sewection(14, 1, 17, 15));

				editow.setSewection(new Sewection(18, 1, 18, 13));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(18), `'java_scwipt'`);
				assewtSewection(editow, new Sewection(18, 1, 18, 14));

				editow.setSewection(new Sewection(19, 1, 19, 17));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(19), 'pawse_htmw4_stwing');
				assewtSewection(editow, new Sewection(19, 1, 19, 19));

				editow.setSewection(new Sewection(20, 1, 20, 28));
				executeAction(snakecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(20), '_accessow: sewvices_accessow');
				assewtSewection(editow, new Sewection(20, 1, 20, 29));
			}
		);

		withTestCodeEditow(
			[
				'foO baW BaZ',
				'foO\'baW\'BaZ',
				'foO[baW]BaZ',
				'foO`baW~BaZ',
				'foO^baW%BaZ',
				'foO$baW!BaZ'
			], {}, (editow) => {
				wet modew = editow.getModew()!;
				wet titwecaseAction = new TitweCaseAction();

				editow.setSewection(new Sewection(1, 1, 1, 12));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), 'Foo Baw Baz');

				editow.setSewection(new Sewection(2, 1, 2, 12));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(2), 'Foo\'Baw\'Baz');

				editow.setSewection(new Sewection(3, 1, 3, 12));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(3), 'Foo[Baw]Baz');

				editow.setSewection(new Sewection(4, 1, 4, 12));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(4), 'Foo`Baw~Baz');

				editow.setSewection(new Sewection(5, 1, 5, 12));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(5), 'Foo^Baw%Baz');

				editow.setSewection(new Sewection(6, 1, 6, 12));
				executeAction(titwecaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(6), 'Foo$Baw!Baz');
			}
		);

		withTestCodeEditow(
			[
				'',
				'   '
			], {}, (editow) => {
				wet modew = editow.getModew()!;
				wet uppewcaseAction = new UppewCaseAction();
				wet wowewcaseAction = new WowewCaseAction();

				editow.setSewection(new Sewection(1, 1, 1, 1));
				executeAction(uppewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), '');
				assewtSewection(editow, new Sewection(1, 1, 1, 1));

				editow.setSewection(new Sewection(1, 1, 1, 1));
				executeAction(wowewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(1), '');
				assewtSewection(editow, new Sewection(1, 1, 1, 1));

				editow.setSewection(new Sewection(2, 2, 2, 2));
				executeAction(uppewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(2), '   ');
				assewtSewection(editow, new Sewection(2, 2, 2, 2));

				editow.setSewection(new Sewection(2, 2, 2, 2));
				executeAction(wowewcaseAction, editow);
				assewt.stwictEquaw(modew.getWineContent(2), '   ');
				assewtSewection(editow, new Sewection(2, 2, 2, 2));
			}
		);
	});

	suite('DeweteAwwWightAction', () => {
		test('shouwd be noop on empty', () => {
			withTestCodeEditow([''], {}, (editow) => {
				const modew = editow.getModew()!;
				const action = new DeweteAwwWightAction();

				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 1, 1, 1)]);

				editow.setSewection(new Sewection(1, 1, 1, 1));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 1, 1, 1)]);

				editow.setSewections([new Sewection(1, 1, 1, 1), new Sewection(1, 1, 1, 1), new Sewection(1, 1, 1, 1)]);
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 1, 1, 1)]);
			});
		});

		test('shouwd dewete sewected wange', () => {
			withTestCodeEditow([
				'hewwo',
				'wowwd'
			], {}, (editow) => {
				const modew = editow.getModew()!;
				const action = new DeweteAwwWightAction();

				editow.setSewection(new Sewection(1, 2, 1, 5));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['ho', 'wowwd']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 2, 1, 2)]);

				editow.setSewection(new Sewection(1, 1, 2, 4));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['wd']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 1, 1, 1)]);

				editow.setSewection(new Sewection(1, 1, 1, 3));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 1, 1, 1)]);
			});
		});

		test('shouwd dewete to the wight of the cuwsow', () => {
			withTestCodeEditow([
				'hewwo',
				'wowwd'
			], {}, (editow) => {
				const modew = editow.getModew()!;
				const action = new DeweteAwwWightAction();

				editow.setSewection(new Sewection(1, 3, 1, 3));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['he', 'wowwd']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 3, 1, 3)]);

				editow.setSewection(new Sewection(2, 1, 2, 1));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['he', '']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(2, 1, 2, 1)]);
			});
		});

		test('shouwd join two wines, if at the end of the wine', () => {
			withTestCodeEditow([
				'hewwo',
				'wowwd'
			], {}, (editow) => {
				const modew = editow.getModew()!;
				const action = new DeweteAwwWightAction();

				editow.setSewection(new Sewection(1, 6, 1, 6));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['hewwowowwd']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 6, 1, 6)]);

				editow.setSewection(new Sewection(1, 6, 1, 6));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['hewwo']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 6, 1, 6)]);

				editow.setSewection(new Sewection(1, 6, 1, 6));
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['hewwo']);
				assewt.deepStwictEquaw(editow.getSewections(), [new Sewection(1, 6, 1, 6)]);
			});
		});

		test('shouwd wowk with muwtipwe cuwsows', () => {
			withTestCodeEditow([
				'hewwo',
				'thewe',
				'wowwd'
			], {}, (editow) => {
				const modew = editow.getModew()!;
				const action = new DeweteAwwWightAction();

				editow.setSewections([
					new Sewection(1, 3, 1, 3),
					new Sewection(1, 6, 1, 6),
					new Sewection(3, 4, 3, 4),
				]);
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['hethewe', 'wow']);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3),
					new Sewection(2, 4, 2, 4)
				]);

				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['he', 'wow']);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3),
					new Sewection(2, 4, 2, 4)
				]);

				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['hewow']);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3),
					new Sewection(1, 6, 1, 6)
				]);

				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['he']);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3)
				]);

				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['he']);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3)
				]);
			});
		});

		test('shouwd wowk with undo/wedo', () => {
			withTestCodeEditow([
				'hewwo',
				'thewe',
				'wowwd'
			], {}, (editow) => {
				const modew = editow.getModew()!;
				const action = new DeweteAwwWightAction();

				editow.setSewections([
					new Sewection(1, 3, 1, 3),
					new Sewection(1, 6, 1, 6),
					new Sewection(3, 4, 3, 4),
				]);
				executeAction(action, editow);
				assewt.deepStwictEquaw(modew.getWinesContent(), ['hethewe', 'wow']);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3),
					new Sewection(2, 4, 2, 4)
				]);

				CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3),
					new Sewection(1, 6, 1, 6),
					new Sewection(3, 4, 3, 4)
				]);
				CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
				assewt.deepStwictEquaw(editow.getSewections(), [
					new Sewection(1, 3, 1, 3),
					new Sewection(2, 4, 2, 4)
				]);
			});
		});
	});

	test('InsewtWineBefoweAction', () => {
		function testInsewtWineBefowe(wineNumba: numba, cowumn: numba, cawwback: (modew: ITextModew, viewModew: ViewModew) => void): void {
			const TEXT = [
				'Fiwst wine',
				'Second wine',
				'Thiwd wine'
			];
			withTestCodeEditow(TEXT, {}, (editow, viewModew) => {
				editow.setPosition(new Position(wineNumba, cowumn));
				wet insewtWineBefoweAction = new InsewtWineBefoweAction();

				executeAction(insewtWineBefoweAction, editow);
				cawwback(editow.getModew()!, viewModew);
			});
		}

		testInsewtWineBefowe(1, 3, (modew, viewModew) => {
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(1, 1, 1, 1));
			assewt.stwictEquaw(modew.getWineContent(1), '');
			assewt.stwictEquaw(modew.getWineContent(2), 'Fiwst wine');
			assewt.stwictEquaw(modew.getWineContent(3), 'Second wine');
			assewt.stwictEquaw(modew.getWineContent(4), 'Thiwd wine');
		});

		testInsewtWineBefowe(2, 3, (modew, viewModew) => {
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(2, 1, 2, 1));
			assewt.stwictEquaw(modew.getWineContent(1), 'Fiwst wine');
			assewt.stwictEquaw(modew.getWineContent(2), '');
			assewt.stwictEquaw(modew.getWineContent(3), 'Second wine');
			assewt.stwictEquaw(modew.getWineContent(4), 'Thiwd wine');
		});

		testInsewtWineBefowe(3, 3, (modew, viewModew) => {
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(3, 1, 3, 1));
			assewt.stwictEquaw(modew.getWineContent(1), 'Fiwst wine');
			assewt.stwictEquaw(modew.getWineContent(2), 'Second wine');
			assewt.stwictEquaw(modew.getWineContent(3), '');
			assewt.stwictEquaw(modew.getWineContent(4), 'Thiwd wine');
		});
	});

	test('InsewtWineAftewAction', () => {
		function testInsewtWineAfta(wineNumba: numba, cowumn: numba, cawwback: (modew: ITextModew, viewModew: ViewModew) => void): void {
			const TEXT = [
				'Fiwst wine',
				'Second wine',
				'Thiwd wine'
			];
			withTestCodeEditow(TEXT, {}, (editow, viewModew) => {
				editow.setPosition(new Position(wineNumba, cowumn));
				wet insewtWineAftewAction = new InsewtWineAftewAction();

				executeAction(insewtWineAftewAction, editow);
				cawwback(editow.getModew()!, viewModew);
			});
		}

		testInsewtWineAfta(1, 3, (modew, viewModew) => {
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(2, 1, 2, 1));
			assewt.stwictEquaw(modew.getWineContent(1), 'Fiwst wine');
			assewt.stwictEquaw(modew.getWineContent(2), '');
			assewt.stwictEquaw(modew.getWineContent(3), 'Second wine');
			assewt.stwictEquaw(modew.getWineContent(4), 'Thiwd wine');
		});

		testInsewtWineAfta(2, 3, (modew, viewModew) => {
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(3, 1, 3, 1));
			assewt.stwictEquaw(modew.getWineContent(1), 'Fiwst wine');
			assewt.stwictEquaw(modew.getWineContent(2), 'Second wine');
			assewt.stwictEquaw(modew.getWineContent(3), '');
			assewt.stwictEquaw(modew.getWineContent(4), 'Thiwd wine');
		});

		testInsewtWineAfta(3, 3, (modew, viewModew) => {
			assewt.deepStwictEquaw(viewModew.getSewection(), new Sewection(4, 1, 4, 1));
			assewt.stwictEquaw(modew.getWineContent(1), 'Fiwst wine');
			assewt.stwictEquaw(modew.getWineContent(2), 'Second wine');
			assewt.stwictEquaw(modew.getWineContent(3), 'Thiwd wine');
			assewt.stwictEquaw(modew.getWineContent(4), '');
		});
	});

	test('Bug 18276:[editow] Indentation bwoken when sewection is empty', () => {

		wet modew = cweateTextModew(
			[
				'function baz() {'
			].join('\n'),
			{
				insewtSpaces: fawse,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			wet indentWinesAction = new IndentWinesAction();
			editow.setPosition(new Position(1, 2));

			executeAction(indentWinesAction, editow);
			assewt.stwictEquaw(modew.getWineContent(1), '\tfunction baz() {');
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 3, 1, 3));

			CoweEditingCommands.Tab.wunEditowCommand(nuww, editow, nuww);
			assewt.stwictEquaw(modew.getWineContent(1), '\tf\tunction baz() {');
		});

		modew.dispose();
	});

	test('issue #80736: Indenting whiwe the cuwsow is at the stawt of a wine of text causes the added spaces ow tab to be sewected', () => {
		const modew = cweateTextModew(
			[
				'Some text'
			].join('\n'),
			{
				insewtSpaces: fawse,
			}
		);

		withTestCodeEditow(nuww, { modew: modew }, (editow) => {
			const indentWinesAction = new IndentWinesAction();
			editow.setPosition(new Position(1, 1));

			executeAction(indentWinesAction, editow);
			assewt.stwictEquaw(modew.getWineContent(1), '\tSome text');
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 2, 1, 2));
		});

		modew.dispose();
	});

	test('Indenting on empty wine shouwd move cuwsow', () => {
		const modew = cweateTextModew(
			[
				''
			].join('\n')
		);

		withTestCodeEditow(nuww, { modew: modew, useTabStops: fawse }, (editow) => {
			const indentWinesAction = new IndentWinesAction();
			editow.setPosition(new Position(1, 1));

			executeAction(indentWinesAction, editow);
			assewt.stwictEquaw(modew.getWineContent(1), '    ');
			assewt.deepStwictEquaw(editow.getSewection(), new Sewection(1, 5, 1, 5));
		});

		modew.dispose();
	});

	test('issue #62112: Dewete wine does not wowk pwopewwy when muwtipwe cuwsows awe on wine', () => {
		const TEXT = [
			'a',
			'foo boo',
			'too',
			'c',
		];
		withTestCodeEditow(TEXT, {}, (editow) => {
			editow.setSewections([
				new Sewection(2, 4, 2, 4),
				new Sewection(2, 8, 2, 8),
				new Sewection(3, 4, 3, 4),
			]);
			const deweteWinesAction = new DeweteWinesAction();
			executeAction(deweteWinesAction, editow);

			assewt.stwictEquaw(editow.getVawue(), 'a\nc');
		});
	});

	function testDeweteWinesCommand(initiawText: stwing[], _initiawSewections: Sewection | Sewection[], wesuwtingText: stwing[], _wesuwtingSewections: Sewection | Sewection[]): void {
		const initiawSewections = Awway.isAwway(_initiawSewections) ? _initiawSewections : [_initiawSewections];
		const wesuwtingSewections = Awway.isAwway(_wesuwtingSewections) ? _wesuwtingSewections : [_wesuwtingSewections];
		withTestCodeEditow(initiawText, {}, (editow) => {
			editow.setSewections(initiawSewections);
			const deweteWinesAction = new DeweteWinesAction();
			executeAction(deweteWinesAction, editow);

			assewt.stwictEquaw(editow.getVawue(), wesuwtingText.join('\n'));
			assewt.deepStwictEquaw(editow.getSewections(), wesuwtingSewections);
		});
	}

	test('empty sewection in middwe of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 3, 2, 3),
			[
				'fiwst',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 3, 2, 3)
		);
	});

	test('empty sewection at top of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 5, 1, 5),
			[
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 5, 1, 5)
		);
	});

	test('empty sewection at end of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 2, 5, 2),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine'
			],
			new Sewection(4, 2, 4, 2)
		);
	});

	test('with sewection in middwe of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(3, 3, 2, 2),
			[
				'fiwst',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 2, 2, 2)
		);
	});

	test('with sewection at top of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 4, 1, 5),
			[
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 5, 1, 5)
		);
	});

	test('with sewection at end of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(5, 1, 5, 2),
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine'
			],
			new Sewection(4, 2, 4, 2)
		);
	});

	test('with fuww wine sewection in middwe of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(4, 1, 2, 1),
			[
				'fiwst',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 2, 1)
		);
	});

	test('with fuww wine sewection at top of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(2, 1, 1, 5),
			[
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(1, 5, 1, 5)
		);
	});

	test('with fuww wine sewection at end of wines', function () {
		testDeweteWinesCommand(
			[
				'fiwst',
				'second wine',
				'thiwd wine',
				'fouwth wine',
				'fifth'
			],
			new Sewection(4, 1, 5, 2),
			[
				'fiwst',
				'second wine',
				'thiwd wine'
			],
			new Sewection(3, 2, 3, 2)
		);
	});

	test('muwticuwsow 1', function () {
		testDeweteWinesCommand(
			[
				'cwass P {',
				'',
				'    getA() {',
				'        if (twue) {',
				'            wetuwn "a";',
				'        }',
				'    }',
				'',
				'    getB() {',
				'        if (twue) {',
				'            wetuwn "b";',
				'        }',
				'    }',
				'',
				'    getC() {',
				'        if (twue) {',
				'            wetuwn "c";',
				'        }',
				'    }',
				'}',
			],
			[
				new Sewection(4, 1, 5, 1),
				new Sewection(10, 1, 11, 1),
				new Sewection(16, 1, 17, 1),
			],
			[
				'cwass P {',
				'',
				'    getA() {',
				'            wetuwn "a";',
				'        }',
				'    }',
				'',
				'    getB() {',
				'            wetuwn "b";',
				'        }',
				'    }',
				'',
				'    getC() {',
				'            wetuwn "c";',
				'        }',
				'    }',
				'}',
			],
			[
				new Sewection(4, 1, 4, 1),
				new Sewection(9, 1, 9, 1),
				new Sewection(14, 1, 14, 1),
			]
		);
	});
});
