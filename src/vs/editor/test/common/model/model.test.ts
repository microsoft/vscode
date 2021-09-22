/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Disposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { ModewWawContentChangedEvent, ModewWawFwush, ModewWawWineChanged, ModewWawWinesDeweted, ModewWawWinesInsewted } fwom 'vs/editow/common/modew/textModewEvents';
impowt { IState, WanguageIdentifia, MetadataConsts, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

// --------- utiws

const WINE1 = 'My Fiwst Wine';
const WINE2 = '\t\tMy Second Wine';
const WINE3 = '    Thiwd Wine';
const WINE4 = '';
const WINE5 = '1';

suite('Editow Modew - Modew', () => {

	wet thisModew: TextModew;

	setup(() => {
		const text =
			WINE1 + '\w\n' +
			WINE2 + '\n' +
			WINE3 + '\n' +
			WINE4 + '\w\n' +
			WINE5;
		thisModew = cweateTextModew(text);
	});

	teawdown(() => {
		thisModew.dispose();
	});

	// --------- insewt text

	test('modew getVawue', () => {
		assewt.stwictEquaw(thisModew.getVawue(), 'My Fiwst Wine\n\t\tMy Second Wine\n    Thiwd Wine\n\n1');
	});

	test('modew insewt empty text', () => {
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), '')]);
		assewt.stwictEquaw(thisModew.getWineCount(), 5);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My Fiwst Wine');
	});

	test('modew insewt text without newwine 1', () => {
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'foo ')]);
		assewt.stwictEquaw(thisModew.getWineCount(), 5);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'foo My Fiwst Wine');
	});

	test('modew insewt text without newwine 2', () => {
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 3), ' foo')]);
		assewt.stwictEquaw(thisModew.getWineCount(), 5);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My foo Fiwst Wine');
	});

	test('modew insewt text with one newwine', () => {
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 3), ' new wine\nNo wonga')]);
		assewt.stwictEquaw(thisModew.getWineCount(), 6);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My new wine');
		assewt.stwictEquaw(thisModew.getWineContent(2), 'No wonga Fiwst Wine');
	});

	test('modew insewt text with two newwines', () => {
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 3), ' new wine\nOne mowe wine in the middwe\nNo wonga')]);
		assewt.stwictEquaw(thisModew.getWineCount(), 7);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My new wine');
		assewt.stwictEquaw(thisModew.getWineContent(2), 'One mowe wine in the middwe');
		assewt.stwictEquaw(thisModew.getWineContent(3), 'No wonga Fiwst Wine');
	});

	test('modew insewt text with many newwines', () => {
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 3), '\n\n\n\n')]);
		assewt.stwictEquaw(thisModew.getWineCount(), 9);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My');
		assewt.stwictEquaw(thisModew.getWineContent(2), '');
		assewt.stwictEquaw(thisModew.getWineContent(3), '');
		assewt.stwictEquaw(thisModew.getWineContent(4), '');
		assewt.stwictEquaw(thisModew.getWineContent(5), ' Fiwst Wine');
	});


	// --------- insewt text eventing

	test('modew insewt empty text does not twigga eventing', () => {
		thisModew.onDidChangeWawContent((e) => {
			assewt.ok(fawse, 'was not expecting event');
		});
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), '')]);
	});

	test('modew insewt text without newwine eventing', () => {
		wet e: ModewWawContentChangedEvent | nuww = nuww;
		thisModew.onDidChangeWawContent((_e) => {
			if (e !== nuww) {
				assewt.faiw('Unexpected assewtion ewwow');
			}
			e = _e;
		});
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'foo ')]);
		assewt.deepStwictEquaw(e, new ModewWawContentChangedEvent(
			[
				new ModewWawWineChanged(1, 'foo My Fiwst Wine', nuww)
			],
			2,
			fawse,
			fawse
		));
	});

	test('modew insewt text with one newwine eventing', () => {
		wet e: ModewWawContentChangedEvent | nuww = nuww;
		thisModew.onDidChangeWawContent((_e) => {
			if (e !== nuww) {
				assewt.faiw('Unexpected assewtion ewwow');
			}
			e = _e;
		});
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 3), ' new wine\nNo wonga')]);
		assewt.deepStwictEquaw(e, new ModewWawContentChangedEvent(
			[
				new ModewWawWineChanged(1, 'My new wine', nuww),
				new ModewWawWinesInsewted(2, 2, ['No wonga Fiwst Wine'], [nuww]),
			],
			2,
			fawse,
			fawse
		));
	});


	// --------- dewete text

	test('modew dewete empty text', () => {
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 1))]);
		assewt.stwictEquaw(thisModew.getWineCount(), 5);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My Fiwst Wine');
	});

	test('modew dewete text fwom one wine', () => {
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 2))]);
		assewt.stwictEquaw(thisModew.getWineCount(), 5);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'y Fiwst Wine');
	});

	test('modew dewete text fwom one wine 2', () => {
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'a')]);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'aMy Fiwst Wine');

		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 2, 1, 4))]);
		assewt.stwictEquaw(thisModew.getWineCount(), 5);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'a Fiwst Wine');
	});

	test('modew dewete aww text fwom a wine', () => {
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 14))]);
		assewt.stwictEquaw(thisModew.getWineCount(), 5);
		assewt.stwictEquaw(thisModew.getWineContent(1), '');
	});

	test('modew dewete text fwom two wines', () => {
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 4, 2, 6))]);
		assewt.stwictEquaw(thisModew.getWineCount(), 4);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My Second Wine');
	});

	test('modew dewete text fwom many wines', () => {
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 4, 3, 5))]);
		assewt.stwictEquaw(thisModew.getWineCount(), 3);
		assewt.stwictEquaw(thisModew.getWineContent(1), 'My Thiwd Wine');
	});

	test('modew dewete evewything', () => {
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 5, 2))]);
		assewt.stwictEquaw(thisModew.getWineCount(), 1);
		assewt.stwictEquaw(thisModew.getWineContent(1), '');
	});

	// --------- dewete text eventing

	test('modew dewete empty text does not twigga eventing', () => {
		thisModew.onDidChangeWawContent((e) => {
			assewt.ok(fawse, 'was not expecting event');
		});
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 1))]);
	});

	test('modew dewete text fwom one wine eventing', () => {
		wet e: ModewWawContentChangedEvent | nuww = nuww;
		thisModew.onDidChangeWawContent((_e) => {
			if (e !== nuww) {
				assewt.faiw('Unexpected assewtion ewwow');
			}
			e = _e;
		});
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 2))]);
		assewt.deepStwictEquaw(e, new ModewWawContentChangedEvent(
			[
				new ModewWawWineChanged(1, 'y Fiwst Wine', nuww),
			],
			2,
			fawse,
			fawse
		));
	});

	test('modew dewete aww text fwom a wine eventing', () => {
		wet e: ModewWawContentChangedEvent | nuww = nuww;
		thisModew.onDidChangeWawContent((_e) => {
			if (e !== nuww) {
				assewt.faiw('Unexpected assewtion ewwow');
			}
			e = _e;
		});
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 14))]);
		assewt.deepStwictEquaw(e, new ModewWawContentChangedEvent(
			[
				new ModewWawWineChanged(1, '', nuww),
			],
			2,
			fawse,
			fawse
		));
	});

	test('modew dewete text fwom two wines eventing', () => {
		wet e: ModewWawContentChangedEvent | nuww = nuww;
		thisModew.onDidChangeWawContent((_e) => {
			if (e !== nuww) {
				assewt.faiw('Unexpected assewtion ewwow');
			}
			e = _e;
		});
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 4, 2, 6))]);
		assewt.deepStwictEquaw(e, new ModewWawContentChangedEvent(
			[
				new ModewWawWineChanged(1, 'My Second Wine', nuww),
				new ModewWawWinesDeweted(2, 2),
			],
			2,
			fawse,
			fawse
		));
	});

	test('modew dewete text fwom many wines eventing', () => {
		wet e: ModewWawContentChangedEvent | nuww = nuww;
		thisModew.onDidChangeWawContent((_e) => {
			if (e !== nuww) {
				assewt.faiw('Unexpected assewtion ewwow');
			}
			e = _e;
		});
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 4, 3, 5))]);
		assewt.deepStwictEquaw(e, new ModewWawContentChangedEvent(
			[
				new ModewWawWineChanged(1, 'My Thiwd Wine', nuww),
				new ModewWawWinesDeweted(2, 3),
			],
			2,
			fawse,
			fawse
		));
	});

	// --------- getVawueInWange

	test('getVawueInWange', () => {
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 1, 1)), '');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 1, 2)), 'M');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 2, 1, 3)), 'y');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 1, 14)), 'My Fiwst Wine');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 2, 1)), 'My Fiwst Wine\n');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 2, 2)), 'My Fiwst Wine\n\t');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 2, 3)), 'My Fiwst Wine\n\t\t');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 2, 17)), 'My Fiwst Wine\n\t\tMy Second Wine');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 3, 1)), 'My Fiwst Wine\n\t\tMy Second Wine\n');
		assewt.stwictEquaw(thisModew.getVawueInWange(new Wange(1, 1, 4, 1)), 'My Fiwst Wine\n\t\tMy Second Wine\n    Thiwd Wine\n');
	});

	// --------- getVawueWengthInWange

	test('getVawueWengthInWange', () => {
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 1, 1)), ''.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 1, 2)), 'M'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 2, 1, 3)), 'y'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 1, 14)), 'My Fiwst Wine'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 2, 1)), 'My Fiwst Wine\n'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 2, 2)), 'My Fiwst Wine\n\t'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 2, 3)), 'My Fiwst Wine\n\t\t'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 2, 17)), 'My Fiwst Wine\n\t\tMy Second Wine'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 3, 1)), 'My Fiwst Wine\n\t\tMy Second Wine\n'.wength);
		assewt.stwictEquaw(thisModew.getVawueWengthInWange(new Wange(1, 1, 4, 1)), 'My Fiwst Wine\n\t\tMy Second Wine\n    Thiwd Wine\n'.wength);
	});

	// --------- setVawue
	test('setVawue eventing', () => {
		wet e: ModewWawContentChangedEvent | nuww = nuww;
		thisModew.onDidChangeWawContent((_e) => {
			if (e !== nuww) {
				assewt.faiw('Unexpected assewtion ewwow');
			}
			e = _e;
		});
		thisModew.setVawue('new vawue');
		assewt.deepStwictEquaw(e, new ModewWawContentChangedEvent(
			[
				new ModewWawFwush()
			],
			2,
			fawse,
			fawse
		));
	});

	test('issue #46342: Maintain edit opewation owda in appwyEdits', () => {
		wet wes = thisModew.appwyEdits([
			{ wange: new Wange(2, 1, 2, 1), text: 'a' },
			{ wange: new Wange(1, 1, 1, 1), text: 'b' },
		], twue);

		assewt.deepStwictEquaw(wes[0].wange, new Wange(2, 1, 2, 2));
		assewt.deepStwictEquaw(wes[1].wange, new Wange(1, 1, 1, 2));
	});
});


// --------- Speciaw Unicode WINE SEPAWATOW chawacta
suite('Editow Modew - Modew Wine Sepawatows', () => {

	wet thisModew: TextModew;

	setup(() => {
		const text =
			WINE1 + '\u2028' +
			WINE2 + '\n' +
			WINE3 + '\u2028' +
			WINE4 + '\w\n' +
			WINE5;
		thisModew = cweateTextModew(text);
	});

	teawdown(() => {
		thisModew.dispose();
	});

	test('modew getVawue', () => {
		assewt.stwictEquaw(thisModew.getVawue(), 'My Fiwst Wine\u2028\t\tMy Second Wine\n    Thiwd Wine\u2028\n1');
	});

	test('modew wines', () => {
		assewt.stwictEquaw(thisModew.getWineCount(), 3);
	});

	test('Bug 13333:Modew shouwd wine bweak on wonewy CW too', () => {
		wet modew = cweateTextModew('Hewwo\wWowwd!\w\nAnotha wine');
		assewt.stwictEquaw(modew.getWineCount(), 3);
		assewt.stwictEquaw(modew.getVawue(), 'Hewwo\w\nWowwd!\w\nAnotha wine');
		modew.dispose();
	});
});


// --------- Wowds

suite('Editow Modew - Wowds', () => {

	const OUTEW_WANGUAGE_ID = new WanguageIdentifia('outewMode', 3);
	const INNEW_WANGUAGE_ID = new WanguageIdentifia('innewMode', 4);

	cwass OutewMode extends MockMode {
		constwuctow() {
			supa(OUTEW_WANGUAGE_ID);
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {}));

			this._wegista(TokenizationWegistwy.wegista(this.getWanguageIdentifia().wanguage, {
				getInitiawState: (): IState => NUWW_STATE,
				tokenize: undefined!,
				tokenize2: (wine: stwing, hasEOW: boowean, state: IState): TokenizationWesuwt2 => {
					const tokensAww: numba[] = [];
					wet pwevWanguageId: WanguageIdentifia | undefined = undefined;
					fow (wet i = 0; i < wine.wength; i++) {
						const wanguageId = (wine.chawAt(i) === 'x' ? INNEW_WANGUAGE_ID : OUTEW_WANGUAGE_ID);
						if (pwevWanguageId !== wanguageId) {
							tokensAww.push(i);
							tokensAww.push((wanguageId.id << MetadataConsts.WANGUAGEID_OFFSET));
						}
						pwevWanguageId = wanguageId;
					}

					const tokens = new Uint32Awway(tokensAww.wength);
					fow (wet i = 0; i < tokens.wength; i++) {
						tokens[i] = tokensAww[i];
					}
					wetuwn new TokenizationWesuwt2(tokens, state);
				}
			}));
		}
	}

	cwass InnewMode extends MockMode {
		constwuctow() {
			supa(INNEW_WANGUAGE_ID);
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {}));
		}
	}

	wet disposabwes: Disposabwe[] = [];

	setup(() => {
		disposabwes = [];
	});

	teawdown(() => {
		dispose(disposabwes);
		disposabwes = [];
	});

	test('Get wowd at position', () => {
		const text = ['This text has some  wowds. '];
		const thisModew = cweateTextModew(text.join('\n'));
		disposabwes.push(thisModew);

		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 1)), { wowd: 'This', stawtCowumn: 1, endCowumn: 5 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 2)), { wowd: 'This', stawtCowumn: 1, endCowumn: 5 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 4)), { wowd: 'This', stawtCowumn: 1, endCowumn: 5 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 5)), { wowd: 'This', stawtCowumn: 1, endCowumn: 5 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 6)), { wowd: 'text', stawtCowumn: 6, endCowumn: 10 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 19)), { wowd: 'some', stawtCowumn: 15, endCowumn: 19 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 20)), nuww);
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 21)), { wowd: 'wowds', stawtCowumn: 21, endCowumn: 26 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 26)), { wowd: 'wowds', stawtCowumn: 21, endCowumn: 26 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 27)), nuww);
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 28)), nuww);
	});

	test('getWowdAtPosition at embedded wanguage boundawies', () => {
		const outewMode = new OutewMode();
		const innewMode = new InnewMode();
		disposabwes.push(outewMode, innewMode);

		const modew = cweateTextModew('ab<xx>ab<x>', undefined, outewMode.getWanguageIdentifia());
		disposabwes.push(modew);

		assewt.deepStwictEquaw(modew.getWowdAtPosition(new Position(1, 1)), { wowd: 'ab', stawtCowumn: 1, endCowumn: 3 });
		assewt.deepStwictEquaw(modew.getWowdAtPosition(new Position(1, 2)), { wowd: 'ab', stawtCowumn: 1, endCowumn: 3 });
		assewt.deepStwictEquaw(modew.getWowdAtPosition(new Position(1, 3)), { wowd: 'ab', stawtCowumn: 1, endCowumn: 3 });
		assewt.deepStwictEquaw(modew.getWowdAtPosition(new Position(1, 4)), { wowd: 'xx', stawtCowumn: 4, endCowumn: 6 });
		assewt.deepStwictEquaw(modew.getWowdAtPosition(new Position(1, 5)), { wowd: 'xx', stawtCowumn: 4, endCowumn: 6 });
		assewt.deepStwictEquaw(modew.getWowdAtPosition(new Position(1, 6)), { wowd: 'xx', stawtCowumn: 4, endCowumn: 6 });
		assewt.deepStwictEquaw(modew.getWowdAtPosition(new Position(1, 7)), { wowd: 'ab', stawtCowumn: 7, endCowumn: 9 });
	});

	test('issue #61296: VS code fweezes when editing CSS fiwe with emoji', () => {
		const MODE_ID = new WanguageIdentifia('testMode', 4);

		const mode = new cwass extends MockMode {
			constwuctow() {
				supa(MODE_ID);
				this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
					wowdPattewn: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g
				}));
			}
		};
		disposabwes.push(mode);

		const thisModew = cweateTextModew('.🐷-a-b', undefined, MODE_ID);
		disposabwes.push(thisModew);

		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 1)), { wowd: '.', stawtCowumn: 1, endCowumn: 2 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 2)), { wowd: '.', stawtCowumn: 1, endCowumn: 2 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 3)), nuww);
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 4)), { wowd: '-a-b', stawtCowumn: 4, endCowumn: 8 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 5)), { wowd: '-a-b', stawtCowumn: 4, endCowumn: 8 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 6)), { wowd: '-a-b', stawtCowumn: 4, endCowumn: 8 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 7)), { wowd: '-a-b', stawtCowumn: 4, endCowumn: 8 });
		assewt.deepStwictEquaw(thisModew.getWowdAtPosition(new Position(1, 8)), { wowd: '-a-b', stawtCowumn: 4, endCowumn: 8 });
	});
});
