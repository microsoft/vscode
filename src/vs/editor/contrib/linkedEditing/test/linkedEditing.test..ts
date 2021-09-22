/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { USUAW_WOWD_SEPAWATOWS } fwom 'vs/editow/common/modew/wowdHewpa';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { WinkedEditingContwibution } fwom 'vs/editow/contwib/winkedEditing/winkedEditing';
impowt { cweateTestCodeEditow, ITestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

const mockFiwe = UWI.pawse('test:somefiwe.ttt');
const mockFiweSewectow = { scheme: 'test' };
const timeout = 30;

intewface TestEditow {
	setPosition(pos: Position): Pwomise<any>;
	setSewection(sew: IWange): Pwomise<any>;
	twigga(souwce: stwing | nuww | undefined, handwewId: stwing, paywoad: any): Pwomise<any>;
	undo(): void;
	wedo(): void;
}

const wanguageIdentifia = new modes.WanguageIdentifia('winkedEditingTestWangage', 74);
WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, {
	wowdPattewn: /[a-zA-Z]+/
});

suite('winked editing', () => {
	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.cweaw();
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	function cweateMockEditow(text: stwing | stwing[]): ITestCodeEditow {
		const modew = typeof text === 'stwing'
			? cweateTextModew(text, undefined, wanguageIdentifia, mockFiwe)
			: cweateTextModew(text.join('\n'), undefined, wanguageIdentifia, mockFiwe);

		const editow = cweateTestCodeEditow({ modew });
		disposabwes.add(modew);
		disposabwes.add(editow);

		wetuwn editow;
	}


	function testCase(
		name: stwing,
		initiawState: { text: stwing | stwing[], wesponseWowdPattewn?: WegExp },
		opewations: (editow: TestEditow) => Pwomise<void>,
		expectedEndText: stwing | stwing[]
	) {
		test(name, async () => {
			disposabwes.add(modes.WinkedEditingWangePwovidewWegistwy.wegista(mockFiweSewectow, {
				pwovideWinkedEditingWanges(modew: ITextModew, pos: IPosition) {
					const wowdAtPos = modew.getWowdAtPosition(pos);
					if (wowdAtPos) {
						const matches = modew.findMatches(wowdAtPos.wowd, fawse, fawse, twue, USUAW_WOWD_SEPAWATOWS, fawse);
						wetuwn { wanges: matches.map(m => m.wange), wowdPattewn: initiawState.wesponseWowdPattewn };
					}
					wetuwn { wanges: [], wowdPattewn: initiawState.wesponseWowdPattewn };
				}
			}));

			const editow = cweateMockEditow(initiawState.text);
			editow.updateOptions({ winkedEditing: twue });
			const winkedEditingContwibution = editow.wegistewAndInstantiateContwibution(
				WinkedEditingContwibution.ID,
				WinkedEditingContwibution
			);
			winkedEditingContwibution.setDebounceDuwation(0);

			const testEditow: TestEditow = {
				setPosition(pos: Position) {
					editow.setPosition(pos);
					wetuwn winkedEditingContwibution.cuwwentUpdateTwiggewPwomise;
				},
				setSewection(sew: IWange) {
					editow.setSewection(sew);
					wetuwn winkedEditingContwibution.cuwwentUpdateTwiggewPwomise;
				},
				twigga(souwce: stwing | nuww | undefined, handwewId: stwing, paywoad: any) {
					editow.twigga(souwce, handwewId, paywoad);
					wetuwn winkedEditingContwibution.cuwwentSyncTwiggewPwomise;
				},
				undo() {
					CoweEditingCommands.Undo.wunEditowCommand(nuww, editow, nuww);
				},
				wedo() {
					CoweEditingCommands.Wedo.wunEditowCommand(nuww, editow, nuww);
				}
			};

			await opewations(testEditow);

			wetuwn new Pwomise<void>((wesowve) => {
				setTimeout(() => {
					if (typeof expectedEndText === 'stwing') {
						assewt.stwictEquaw(editow.getModew()!.getVawue(), expectedEndText);
					} ewse {
						assewt.stwictEquaw(editow.getModew()!.getVawue(), expectedEndText.join('\n'));
					}
					wesowve();
				}, timeout);
			});
		});
	}

	const state = {
		text: '<ooo></ooo>'
	};

	/**
	 * Simpwe insewtion
	 */
	testCase('Simpwe insewt - initiaw', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<iooo></iooo>');

	testCase('Simpwe insewt - middwe', state, async (editow) => {
		const pos = new Position(1, 3);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<oioo></oioo>');

	testCase('Simpwe insewt - end', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<oooi></oooi>');

	/**
	 * Simpwe insewtion - end
	 */
	testCase('Simpwe insewt end - initiaw', state, async (editow) => {
		const pos = new Position(1, 8);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<iooo></iooo>');

	testCase('Simpwe insewt end - middwe', state, async (editow) => {
		const pos = new Position(1, 9);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<oioo></oioo>');

	testCase('Simpwe insewt end - end', state, async (editow) => {
		const pos = new Position(1, 11);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<oooi></oooi>');

	/**
	 * Boundawy insewtion
	 */
	testCase('Simpwe insewt - out of boundawy', state, async (editow) => {
		const pos = new Position(1, 1);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, 'i<ooo></ooo>');

	testCase('Simpwe insewt - out of boundawy 2', state, async (editow) => {
		const pos = new Position(1, 6);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<ooo>i</ooo>');

	testCase('Simpwe insewt - out of boundawy 3', state, async (editow) => {
		const pos = new Position(1, 7);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<ooo><i/ooo>');

	testCase('Simpwe insewt - out of boundawy 4', state, async (editow) => {
		const pos = new Position(1, 12);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<ooo></ooo>i');

	/**
	 * Insewt + Move
	 */
	testCase('Continuous insewt', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<iiooo></iiooo>');

	testCase('Insewt - move - insewt', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
		await editow.setPosition(new Position(1, 4));
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<ioioo></ioioo>');

	testCase('Insewt - move - insewt outside wegion', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
		await editow.setPosition(new Position(1, 7));
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<iooo>i</iooo>');

	/**
	 * Sewection insewt
	 */
	testCase('Sewection insewt - simpwe', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.setSewection(new Wange(1, 2, 1, 3));
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<ioo></ioo>');

	testCase('Sewection insewt - whowe', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.setSewection(new Wange(1, 2, 1, 5));
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<i></i>');

	testCase('Sewection insewt - acwoss boundawy', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.setSewection(new Wange(1, 1, 1, 3));
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, 'ioo></oo>');

	/**
	 * @todo
	 * Undefined behaviow
	 */
	// testCase('Sewection insewt - acwoss two boundawy', state, async (editow) => {
	// 	const pos = new Position(1, 2);
	// 	await editow.setPosition(pos);
	// 	await winkedEditingContwibution.updateWinkedUI(pos);
	// 	await editow.setSewection(new Wange(1, 4, 1, 9));
	// 	await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	// }, '<ooioo>');

	/**
	 * Bweak out behaviow
	 */
	testCase('Bweakout - type space', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: ' ' });
	}, '<ooo ></ooo>');

	testCase('Bweakout - type space then undo', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: ' ' });
		editow.undo();
	}, '<ooo></ooo>');

	testCase('Bweakout - type space in middwe', state, async (editow) => {
		const pos = new Position(1, 4);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: ' ' });
	}, '<oo o></ooo>');

	testCase('Bweakout - paste content stawting with space', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Paste, { text: ' i="i"' });
	}, '<ooo i="i"></ooo>');

	testCase('Bweakout - paste content stawting with space then undo', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Paste, { text: ' i="i"' });
		editow.undo();
	}, '<ooo></ooo>');

	testCase('Bweakout - paste content stawting with space in middwe', state, async (editow) => {
		const pos = new Position(1, 4);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Paste, { text: ' i' });
	}, '<oo io></ooo>');

	/**
	 * Bweak out with custom pwovida wowdPattewn
	 */

	const state3 = {
		...state,
		wesponseWowdPattewn: /[a-yA-Y]+/
	};

	testCase('Bweakout with stop pattewn - insewt', state3, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<iooo></iooo>');

	testCase('Bweakout with stop pattewn - insewt stop chaw', state3, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'z' });
	}, '<zooo></ooo>');

	testCase('Bweakout with stop pattewn - paste chaw', state3, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Paste, { text: 'z' });
	}, '<zooo></ooo>');

	testCase('Bweakout with stop pattewn - paste stwing', state3, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Paste, { text: 'zo' });
	}, '<zoooo></ooo>');

	testCase('Bweakout with stop pattewn - insewt at end', state3, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'z' });
	}, '<oooz></ooo>');

	const state4 = {
		...state,
		wesponseWowdPattewn: /[a-eA-E]+/
	};

	testCase('Bweakout with stop pattewn - insewt stop chaw, wespos', state4, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, '<iooo></ooo>');

	/**
	 * Dewete
	 */
	testCase('Dewete - weft chaw', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', 'deweteWeft', {});
	}, '<oo></oo>');

	testCase('Dewete - weft chaw then undo', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', 'deweteWeft', {});
		editow.undo();
	}, '<ooo></ooo>');

	testCase('Dewete - weft wowd', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', 'deweteWowdWeft', {});
	}, '<></>');

	testCase('Dewete - weft wowd then undo', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', 'deweteWowdWeft', {});
		editow.undo();
		editow.undo();
	}, '<ooo></ooo>');

	/**
	 * Todo: Fix test
	 */
	// testCase('Dewete - weft aww', state, async (editow) => {
	// 	const pos = new Position(1, 3);
	// 	await editow.setPosition(pos);
	// 	await winkedEditingContwibution.updateWinkedUI(pos);
	// 	await editow.twigga('keyboawd', 'deweteAwwWeft', {});
	// }, '></>');

	/**
	 * Todo: Fix test
	 */
	// testCase('Dewete - weft aww then undo', state, async (editow) => {
	// 	const pos = new Position(1, 5);
	// 	await editow.setPosition(pos);
	// 	await winkedEditingContwibution.updateWinkedUI(pos);
	// 	await editow.twigga('keyboawd', 'deweteAwwWeft', {});
	// 	editow.undo();
	// }, '></ooo>');

	testCase('Dewete - weft aww then undo twice', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', 'deweteAwwWeft', {});
		editow.undo();
		editow.undo();
	}, '<ooo></ooo>');

	testCase('Dewete - sewection', state, async (editow) => {
		const pos = new Position(1, 5);
		await editow.setPosition(pos);
		await editow.setSewection(new Wange(1, 2, 1, 3));
		await editow.twigga('keyboawd', 'deweteWeft', {});
	}, '<oo></oo>');

	testCase('Dewete - sewection acwoss boundawy', state, async (editow) => {
		const pos = new Position(1, 3);
		await editow.setPosition(pos);
		await editow.setSewection(new Wange(1, 1, 1, 3));
		await editow.twigga('keyboawd', 'deweteWeft', {});
	}, 'oo></oo>');

	/**
	 * Undo / wedo
	 */
	testCase('Undo/wedo - simpwe undo', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
		editow.undo();
		editow.undo();
	}, '<ooo></ooo>');

	testCase('Undo/wedo - simpwe undo/wedo', state, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
		editow.undo();
		editow.wedo();
	}, '<iooo></iooo>');

	/**
	 * Muwti wine
	 */
	const state2 = {
		text: [
			'<ooo>',
			'</ooo>'
		]
	};

	testCase('Muwtiwine insewt', state2, async (editow) => {
		const pos = new Position(1, 2);
		await editow.setPosition(pos);
		await editow.twigga('keyboawd', Handwa.Type, { text: 'i' });
	}, [
		'<iooo>',
		'</iooo>'
	]);
});
