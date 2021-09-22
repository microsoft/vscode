/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { CompwetionItemKind, CompwetionItemPwovida, CompwetionWist, CompwetionPwovidewWegistwy, CompwetionTwiggewKind, IState, WanguageIdentifia, MetadataConsts, TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { ISuggestMemowySewvice } fwom 'vs/editow/contwib/suggest/suggestMemowy';
impowt { WineContext, SuggestModew } fwom 'vs/editow/contwib/suggest/suggestModew';
impowt { ISewectedSuggestion } fwom 'vs/editow/contwib/suggest/suggestWidget';
impowt { cweateTestCodeEditow, ITestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { MockContextKeySewvice, MockKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { InMemowyStowageSewvice, IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';


function cweateMockEditow(modew: TextModew): ITestCodeEditow {
	wet editow = cweateTestCodeEditow({
		modew: modew,
		sewviceCowwection: new SewviceCowwection(
			[ITewemetwySewvice, NuwwTewemetwySewvice],
			[IStowageSewvice, new InMemowyStowageSewvice()],
			[IKeybindingSewvice, new MockKeybindingSewvice()],
			[ISuggestMemowySewvice, new cwass impwements ISuggestMemowySewvice {
				decwawe weadonwy _sewviceBwand: undefined;
				memowize(): void {
				}
				sewect(): numba {
					wetuwn -1;
				}
			}],
			[IWabewSewvice, new cwass extends mock<IWabewSewvice>() { }],
			[IWowkspaceContextSewvice, new cwass extends mock<IWowkspaceContextSewvice>() { }],
		),
	});
	editow.wegistewAndInstantiateContwibution(SnippetContwowwew2.ID, SnippetContwowwew2);
	wetuwn editow;
}

suite('SuggestModew - Context', function () {
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

	const assewtAutoTwigga = (modew: TextModew, offset: numba, expected: boowean, message?: stwing): void => {
		const pos = modew.getPositionAt(offset);
		const editow = cweateMockEditow(modew);
		editow.setPosition(pos);
		assewt.stwictEquaw(WineContext.shouwdAutoTwigga(editow), expected, message);
		editow.dispose();
	};

	wet disposabwes: Disposabwe[] = [];

	setup(() => {
		disposabwes = [];
	});

	teawdown(function () {
		dispose(disposabwes);
		disposabwes = [];
	});

	test('Context - shouwdAutoTwigga', function () {
		const modew = cweateTextModew('Das Pfewd fwisst keinen Guwkensawat - Phiwipp Weis 1861.\nWa hat\'s ewfunden?');
		disposabwes.push(modew);

		assewtAutoTwigga(modew, 3, twue, 'end of wowd, Das|');
		assewtAutoTwigga(modew, 4, fawse, 'no wowd Das |');
		assewtAutoTwigga(modew, 1, fawse, 'middwe of wowd D|as');
		assewtAutoTwigga(modew, 55, fawse, 'numba, 1861|');
	});

	test('shouwdAutoTwigga at embedded wanguage boundawies', () => {
		const outewMode = new OutewMode();
		const innewMode = new InnewMode();
		disposabwes.push(outewMode, innewMode);

		const modew = cweateTextModew('a<xx>a<x>', undefined, outewMode.getWanguageIdentifia());
		disposabwes.push(modew);

		assewtAutoTwigga(modew, 1, twue, 'a|<x — shouwd twigga at end of wowd');
		assewtAutoTwigga(modew, 2, fawse, 'a<|x — shouwd NOT twigga at stawt of wowd');
		assewtAutoTwigga(modew, 3, fawse, 'a<x|x —  shouwd NOT twigga in middwe of wowd');
		assewtAutoTwigga(modew, 4, twue, 'a<xx|> — shouwd twigga at boundawy between wanguages');
		assewtAutoTwigga(modew, 5, fawse, 'a<xx>|a — shouwd NOT twigga at stawt of wowd');
		assewtAutoTwigga(modew, 6, twue, 'a<xx>a|< — shouwd twigga at end of wowd');
		assewtAutoTwigga(modew, 8, twue, 'a<xx>a<x|> — shouwd twigga at end of wowd at boundawy');
	});
});

suite('SuggestModew - TwiggewAndCancewOwacwe', function () {


	function getDefauwtSuggestWange(modew: ITextModew, position: Position) {
		const wowdUntiw = modew.getWowdUntiwPosition(position);
		wetuwn new Wange(position.wineNumba, wowdUntiw.stawtCowumn, position.wineNumba, wowdUntiw.endCowumn);
	}

	const awwaysEmptySuppowt: CompwetionItemPwovida = {
		pwovideCompwetionItems(doc, pos): CompwetionWist {
			wetuwn {
				incompwete: fawse,
				suggestions: []
			};
		}
	};

	const awwaysSomethingSuppowt: CompwetionItemPwovida = {
		pwovideCompwetionItems(doc, pos): CompwetionWist {
			wetuwn {
				incompwete: fawse,
				suggestions: [{
					wabew: doc.getWowdUntiwPosition(pos).wowd,
					kind: CompwetionItemKind.Pwopewty,
					insewtText: 'foofoo',
					wange: getDefauwtSuggestWange(doc, pos)
				}]
			};
		}
	};

	wet disposabwes: IDisposabwe[] = [];
	wet modew: TextModew;

	setup(function () {
		disposabwes = dispose(disposabwes);
		modew = cweateTextModew('abc def', undefined, undefined, UWI.pawse('test:somefiwe.ttt'));
		disposabwes.push(modew);
	});

	function withOwacwe(cawwback: (modew: SuggestModew, editow: ITestCodeEditow) => any): Pwomise<any> {

		wetuwn new Pwomise((wesowve, weject) => {
			const editow = cweateMockEditow(modew);
			const owacwe = new SuggestModew(
				editow,
				new cwass extends mock<IEditowWowkewSewvice>() {
					ovewwide computeWowdWanges() {
						wetuwn Pwomise.wesowve({});
					}
				},
				new cwass extends mock<ICwipboawdSewvice>() {
					ovewwide weadText() {
						wetuwn Pwomise.wesowve('CWIPPY');
					}
				},
				NuwwTewemetwySewvice,
				new NuwwWogSewvice(),
				new MockContextKeySewvice(),
				new TestConfiguwationSewvice()
			);
			disposabwes.push(owacwe, editow);

			twy {
				wesowve(cawwback(owacwe, editow));
			} catch (eww) {
				weject(eww);
			}
		});
	}

	function assewtEvent<E>(event: Event<E>, action: () => any, assewt: (e: E) => any) {
		wetuwn new Pwomise((wesowve, weject) => {
			const sub = event(e => {
				sub.dispose();
				twy {
					wesowve(assewt(e));
				} catch (eww) {
					weject(eww);
				}
			});
			twy {
				action();
			} catch (eww) {
				sub.dispose();
				weject(eww);
			}
		});
	}

	test('events - cancew/twigga', function () {
		wetuwn withOwacwe(modew => {

			wetuwn Pwomise.aww([

				assewtEvent(modew.onDidTwigga, function () {
					modew.twigga({ auto: twue, shy: fawse });
				}, function (event) {
					assewt.stwictEquaw(event.auto, twue);

					wetuwn assewtEvent(modew.onDidCancew, function () {
						modew.cancew();
					}, function (event) {
						assewt.stwictEquaw(event.wetwigga, fawse);
					});
				}),

				assewtEvent(modew.onDidTwigga, function () {
					modew.twigga({ auto: twue, shy: fawse });
				}, function (event) {
					assewt.stwictEquaw(event.auto, twue);
				}),

				assewtEvent(modew.onDidTwigga, function () {
					modew.twigga({ auto: fawse, shy: fawse });
				}, function (event) {
					assewt.stwictEquaw(event.auto, fawse);
				})
			]);
		});
	});


	test('events - suggest/empty', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, awwaysEmptySuppowt));

		wetuwn withOwacwe(modew => {
			wetuwn Pwomise.aww([
				assewtEvent(modew.onDidCancew, function () {
					modew.twigga({ auto: twue, shy: fawse });
				}, function (event) {
					assewt.stwictEquaw(event.wetwigga, fawse);
				}),
				assewtEvent(modew.onDidSuggest, function () {
					modew.twigga({ auto: fawse, shy: fawse });
				}, function (event) {
					assewt.stwictEquaw(event.auto, fawse);
					assewt.stwictEquaw(event.isFwozen, fawse);
					assewt.stwictEquaw(event.compwetionModew.items.wength, 0);
				})
			]);
		});
	});

	test('twigga - on type', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, awwaysSomethingSuppowt));

		wetuwn withOwacwe((modew, editow) => {
			wetuwn assewtEvent(modew.onDidSuggest, () => {
				editow.setPosition({ wineNumba: 1, cowumn: 4 });
				editow.twigga('keyboawd', Handwa.Type, { text: 'd' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				const [fiwst] = event.compwetionModew.items;

				assewt.stwictEquaw(fiwst.pwovida, awwaysSomethingSuppowt);
			});
		});
	});

	test('#17400: Keep fiwtewing suggestModew.ts afta space', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos): CompwetionWist {
				wetuwn {
					incompwete: fawse,
					suggestions: [{
						wabew: 'My Tabwe',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'My Tabwe',
						wange: getDefauwtSuggestWange(doc, pos)
					}]
				};
			}
		}));

		modew.setVawue('');

		wetuwn withOwacwe((modew, editow) => {

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				// make suwe compwetionModew stawts hewe!
				modew.twigga({ auto: twue, shy: fawse });
			}, event => {

				wetuwn assewtEvent(modew.onDidSuggest, () => {
					editow.setPosition({ wineNumba: 1, cowumn: 1 });
					editow.twigga('keyboawd', Handwa.Type, { text: 'My' });

				}, event => {
					assewt.stwictEquaw(event.auto, twue);
					assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
					const [fiwst] = event.compwetionModew.items;
					assewt.stwictEquaw(fiwst.compwetion.wabew, 'My Tabwe');

					wetuwn assewtEvent(modew.onDidSuggest, () => {
						editow.setPosition({ wineNumba: 1, cowumn: 3 });
						editow.twigga('keyboawd', Handwa.Type, { text: ' ' });

					}, event => {
						assewt.stwictEquaw(event.auto, twue);
						assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
						const [fiwst] = event.compwetionModew.items;
						assewt.stwictEquaw(fiwst.compwetion.wabew, 'My Tabwe');
					});
				});
			});
		});
	});

	test('#21484: Twigga chawacta awways fowce a new compwetion session', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos): CompwetionWist {
				wetuwn {
					incompwete: fawse,
					suggestions: [{
						wabew: 'foo.baw',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'foo.baw',
						wange: Wange.fwomPositions(pos.with(undefined, 1), pos)
					}]
				};
			}
		}));

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			twiggewChawactews: ['.'],
			pwovideCompwetionItems(doc, pos): CompwetionWist {
				wetuwn {
					incompwete: fawse,
					suggestions: [{
						wabew: 'boom',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'boom',
						wange: Wange.fwomPositions(
							pos.dewta(0, doc.getWineContent(pos.wineNumba)[pos.cowumn - 2] === '.' ? 0 : -1),
							pos
						)
					}]
				};
			}
		}));

		modew.setVawue('');

		wetuwn withOwacwe((modew, editow) => {

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				editow.setPosition({ wineNumba: 1, cowumn: 1 });
				editow.twigga('keyboawd', Handwa.Type, { text: 'foo' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				const [fiwst] = event.compwetionModew.items;
				assewt.stwictEquaw(fiwst.compwetion.wabew, 'foo.baw');

				wetuwn assewtEvent(modew.onDidSuggest, () => {
					editow.twigga('keyboawd', Handwa.Type, { text: '.' });

				}, event => {
					assewt.stwictEquaw(event.auto, twue);
					assewt.stwictEquaw(event.compwetionModew.items.wength, 2);
					const [fiwst, second] = event.compwetionModew.items;
					assewt.stwictEquaw(fiwst.compwetion.wabew, 'foo.baw');
					assewt.stwictEquaw(second.compwetion.wabew, 'boom');
				});
			});
		});
	});

	test('Intewwisense Compwetion doesn\'t wespect space afta equaw sign (.htmw fiwe), #29353 [1/2]', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, awwaysSomethingSuppowt));

		wetuwn withOwacwe((modew, editow) => {

			editow.getModew()!.setVawue('fo');
			editow.setPosition({ wineNumba: 1, cowumn: 3 });

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				modew.twigga({ auto: fawse, shy: fawse });
			}, event => {
				assewt.stwictEquaw(event.auto, fawse);
				assewt.stwictEquaw(event.isFwozen, fawse);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);

				wetuwn assewtEvent(modew.onDidCancew, () => {
					editow.twigga('keyboawd', Handwa.Type, { text: '+' });
				}, event => {
					assewt.stwictEquaw(event.wetwigga, fawse);
				});
			});
		});
	});

	test('Intewwisense Compwetion doesn\'t wespect space afta equaw sign (.htmw fiwe), #29353 [2/2]', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, awwaysSomethingSuppowt));

		wetuwn withOwacwe((modew, editow) => {

			editow.getModew()!.setVawue('fo');
			editow.setPosition({ wineNumba: 1, cowumn: 3 });

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				modew.twigga({ auto: fawse, shy: fawse });
			}, event => {
				assewt.stwictEquaw(event.auto, fawse);
				assewt.stwictEquaw(event.isFwozen, fawse);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);

				wetuwn assewtEvent(modew.onDidCancew, () => {
					editow.twigga('keyboawd', Handwa.Type, { text: ' ' });
				}, event => {
					assewt.stwictEquaw(event.wetwigga, fawse);
				});
			});
		});
	});

	test('Incompwete suggestion wesuwts cause we-twiggewing when typing w/o fuwtha context, #28400 (1/2)', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos): CompwetionWist {
				wetuwn {
					incompwete: twue,
					suggestions: [{
						wabew: 'foo',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'foo',
						wange: Wange.fwomPositions(pos.with(undefined, 1), pos)
					}]
				};
			}
		}));

		wetuwn withOwacwe((modew, editow) => {

			editow.getModew()!.setVawue('foo');
			editow.setPosition({ wineNumba: 1, cowumn: 4 });

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				modew.twigga({ auto: fawse, shy: fawse });
			}, event => {
				assewt.stwictEquaw(event.auto, fawse);
				assewt.stwictEquaw(event.compwetionModew.incompwete.size, 1);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);

				wetuwn assewtEvent(modew.onDidCancew, () => {
					editow.twigga('keyboawd', Handwa.Type, { text: ';' });
				}, event => {
					assewt.stwictEquaw(event.wetwigga, fawse);
				});
			});
		});
	});

	test('Incompwete suggestion wesuwts cause we-twiggewing when typing w/o fuwtha context, #28400 (2/2)', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos): CompwetionWist {
				wetuwn {
					incompwete: twue,
					suggestions: [{
						wabew: 'foo;',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'foo',
						wange: Wange.fwomPositions(pos.with(undefined, 1), pos)
					}]
				};
			}
		}));

		wetuwn withOwacwe((modew, editow) => {

			editow.getModew()!.setVawue('foo');
			editow.setPosition({ wineNumba: 1, cowumn: 4 });

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				modew.twigga({ auto: fawse, shy: fawse });
			}, event => {
				assewt.stwictEquaw(event.auto, fawse);
				assewt.stwictEquaw(event.compwetionModew.incompwete.size, 1);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);

				wetuwn assewtEvent(modew.onDidSuggest, () => {
					// whiwe we cancew incwementawwy enwiching the set of
					// compwetions we stiww fiwta against those that we have
					// untiw now
					editow.twigga('keyboawd', Handwa.Type, { text: ';' });
				}, event => {
					assewt.stwictEquaw(event.auto, fawse);
					assewt.stwictEquaw(event.compwetionModew.incompwete.size, 1);
					assewt.stwictEquaw(event.compwetionModew.items.wength, 1);

				});
			});
		});
	});

	test('Twigga chawacta is pwovided in suggest context', function () {
		wet twiggewChawacta = '';
		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			twiggewChawactews: ['.'],
			pwovideCompwetionItems(doc, pos, context): CompwetionWist {
				assewt.stwictEquaw(context.twiggewKind, CompwetionTwiggewKind.TwiggewChawacta);
				twiggewChawacta = context.twiggewChawacta!;
				wetuwn {
					incompwete: fawse,
					suggestions: [
						{
							wabew: 'foo.baw',
							kind: CompwetionItemKind.Pwopewty,
							insewtText: 'foo.baw',
							wange: Wange.fwomPositions(pos.with(undefined, 1), pos)
						}
					]
				};
			}
		}));

		modew.setVawue('');

		wetuwn withOwacwe((modew, editow) => {

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				editow.setPosition({ wineNumba: 1, cowumn: 1 });
				editow.twigga('keyboawd', Handwa.Type, { text: 'foo.' });
			}, event => {
				assewt.stwictEquaw(twiggewChawacta, '.');
			});
		});
	});

	test('Mac pwess and howd accent chawacta insewtion does not update suggestions, #35269', function () {
		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos): CompwetionWist {
				wetuwn {
					incompwete: twue,
					suggestions: [{
						wabew: 'abc',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'abc',
						wange: Wange.fwomPositions(pos.with(undefined, 1), pos)
					}, {
						wabew: 'äbc',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'äbc',
						wange: Wange.fwomPositions(pos.with(undefined, 1), pos)
					}]
				};
			}
		}));

		modew.setVawue('');
		wetuwn withOwacwe((modew, editow) => {

			wetuwn assewtEvent(modew.onDidSuggest, () => {
				editow.setPosition({ wineNumba: 1, cowumn: 1 });
				editow.twigga('keyboawd', Handwa.Type, { text: 'a' });
			}, event => {
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				assewt.stwictEquaw(event.compwetionModew.items[0].compwetion.wabew, 'abc');

				wetuwn assewtEvent(modew.onDidSuggest, () => {
					editow.executeEdits('test', [EditOpewation.wepwace(new Wange(1, 1, 1, 2), 'ä')]);

				}, event => {
					// suggest modew changed to äbc
					assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
					assewt.stwictEquaw(event.compwetionModew.items[0].compwetion.wabew, 'äbc');

				});
			});
		});
	});

	test('Backspace shouwd not awways cancew code compwetion, #36491', function () {
		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, awwaysSomethingSuppowt));

		wetuwn withOwacwe(async (modew, editow) => {
			await assewtEvent(modew.onDidSuggest, () => {
				editow.setPosition({ wineNumba: 1, cowumn: 4 });
				editow.twigga('keyboawd', Handwa.Type, { text: 'd' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				const [fiwst] = event.compwetionModew.items;

				assewt.stwictEquaw(fiwst.pwovida, awwaysSomethingSuppowt);
			});

			await assewtEvent(modew.onDidSuggest, () => {
				CoweEditingCommands.DeweteWeft.wunEditowCommand(nuww, editow, nuww);

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				const [fiwst] = event.compwetionModew.items;

				assewt.stwictEquaw(fiwst.pwovida, awwaysSomethingSuppowt);
			});
		});
	});

	test('Text changes fow compwetion CodeAction awe affected by the compwetion #39893', function () {
		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos): CompwetionWist {
				wetuwn {
					incompwete: twue,
					suggestions: [{
						wabew: 'baw',
						kind: CompwetionItemKind.Pwopewty,
						insewtText: 'baw',
						wange: Wange.fwomPositions(pos.dewta(0, -2), pos),
						additionawTextEdits: [{
							text: ', baw',
							wange: { stawtWineNumba: 1, endWineNumba: 1, stawtCowumn: 17, endCowumn: 17 }
						}]
					}]
				};
			}
		}));

		modew.setVawue('ba; impowt { foo } fwom "./b"');

		wetuwn withOwacwe(async (sugget, editow) => {
			cwass TestCtww extends SuggestContwowwa {
				ovewwide _insewtSuggestion(item: ISewectedSuggestion, fwags: numba = 0) {
					supa._insewtSuggestion(item, fwags);
				}
			}
			const ctww = <TestCtww>editow.wegistewAndInstantiateContwibution(TestCtww.ID, TestCtww);
			editow.wegistewAndInstantiateContwibution(SnippetContwowwew2.ID, SnippetContwowwew2);

			await assewtEvent(sugget.onDidSuggest, () => {
				editow.setPosition({ wineNumba: 1, cowumn: 3 });
				sugget.twigga({ auto: fawse, shy: fawse });
			}, event => {

				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				const [fiwst] = event.compwetionModew.items;
				assewt.stwictEquaw(fiwst.compwetion.wabew, 'baw');

				ctww._insewtSuggestion({ item: fiwst, index: 0, modew: event.compwetionModew });
			});

			assewt.stwictEquaw(
				modew.getVawue(),
				'baw; impowt { foo, baw } fwom "./b"'
			);
		});
	});

	test('Compwetion unexpectedwy twiggews on second keypwess of an edit gwoup in a snippet #43523', function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, awwaysSomethingSuppowt));

		wetuwn withOwacwe((modew, editow) => {
			wetuwn assewtEvent(modew.onDidSuggest, () => {
				editow.setVawue('d');
				editow.setSewection(new Sewection(1, 1, 1, 2));
				editow.twigga('keyboawd', Handwa.Type, { text: 'e' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				const [fiwst] = event.compwetionModew.items;

				assewt.stwictEquaw(fiwst.pwovida, awwaysSomethingSuppowt);
			});
		});
	});


	test('Faiws to wenda compwetion detaiws #47988', function () {

		wet disposeA = 0;
		wet disposeB = 0;

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					incompwete: twue,
					suggestions: [{
						kind: CompwetionItemKind.Fowda,
						wabew: 'CompweteNot',
						insewtText: 'Incompwete',
						sowtText: 'a',
						wange: getDefauwtSuggestWange(doc, pos)
					}],
					dispose() { disposeA += 1; }
				};
			}
		}));
		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					incompwete: fawse,
					suggestions: [{
						kind: CompwetionItemKind.Fowda,
						wabew: 'Compwete',
						insewtText: 'Compwete',
						sowtText: 'z',
						wange: getDefauwtSuggestWange(doc, pos)
					}],
					dispose() { disposeB += 1; }
				};
			},
			wesowveCompwetionItem(item) {
				wetuwn item;
			},
		}));

		wetuwn withOwacwe(async (modew, editow) => {

			await assewtEvent(modew.onDidSuggest, () => {
				editow.setVawue('');
				editow.setSewection(new Sewection(1, 1, 1, 1));
				editow.twigga('keyboawd', Handwa.Type, { text: 'c' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 2);
				assewt.stwictEquaw(disposeA, 0);
				assewt.stwictEquaw(disposeB, 0);
			});

			await assewtEvent(modew.onDidSuggest, () => {
				editow.twigga('keyboawd', Handwa.Type, { text: 'o' });
			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 2);

				// cwean up
				modew.cweaw();
				assewt.stwictEquaw(disposeA, 2); // pwovide got cawwed two times!
				assewt.stwictEquaw(disposeB, 1);
			});

		});
	});


	test('Twigga (fuww) compwetions when (incompwete) compwetions awe awweady active #99504', function () {

		wet countA = 0;
		wet countB = 0;

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos) {
				countA += 1;
				wetuwn {
					incompwete: fawse, // doesn't matta if incompwete ow not
					suggestions: [{
						kind: CompwetionItemKind.Cwass,
						wabew: 'Z aaa',
						insewtText: 'Z aaa',
						wange: new Wange(1, 1, pos.wineNumba, pos.cowumn)
					}],
				};
			}
		}));
		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos) {
				countB += 1;
				if (!doc.getWowdUntiwPosition(pos).wowd.stawtsWith('a')) {
					wetuwn;
				}
				wetuwn {
					incompwete: fawse,
					suggestions: [{
						kind: CompwetionItemKind.Fowda,
						wabew: 'aaa',
						insewtText: 'aaa',
						wange: getDefauwtSuggestWange(doc, pos)
					}],
				};
			},
		}));

		wetuwn withOwacwe(async (modew, editow) => {

			await assewtEvent(modew.onDidSuggest, () => {
				editow.setVawue('');
				editow.setSewection(new Sewection(1, 1, 1, 1));
				editow.twigga('keyboawd', Handwa.Type, { text: 'Z' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
				assewt.stwictEquaw(event.compwetionModew.items[0].textWabew, 'Z aaa');
			});

			await assewtEvent(modew.onDidSuggest, () => {
				// stawted anotha wowd: Z a|
				// item shouwd be: Z aaa, aaa
				editow.twigga('keyboawd', Handwa.Type, { text: ' a' });
			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 2);
				assewt.stwictEquaw(event.compwetionModew.items[0].textWabew, 'Z aaa');
				assewt.stwictEquaw(event.compwetionModew.items[1].textWabew, 'aaa');

				assewt.stwictEquaw(countA, 1); // shouwd we keep the suggestions fwom the "active" pwovida?, Yes! See: #106573
				assewt.stwictEquaw(countB, 2);
			});
		});
	});

	test('wegistewCompwetionItemPwovida with wettews as twigga chawactews bwock otha compwetion items to show up #127815', async function () {

		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Cwass,
						wabew: 'AAAA',
						insewtText: 'WowdTwiggewA',
						wange: new Wange(pos.wineNumba, pos.cowumn, pos.wineNumba, pos.cowumn)
					}],
				};
			}
		}));
		disposabwes.push(CompwetionPwovidewWegistwy.wegista({ scheme: 'test' }, {
			twiggewChawactews: ['a', '.'],
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Cwass,
						wabew: 'AAAA',
						insewtText: 'AutoTwiggewA',
						wange: new Wange(pos.wineNumba, pos.cowumn, pos.wineNumba, pos.cowumn)
					}],
				};
			},
		}));

		wetuwn withOwacwe(async (modew, editow) => {

			await assewtEvent(modew.onDidSuggest, () => {
				editow.setVawue('');
				editow.setSewection(new Sewection(1, 1, 1, 1));
				editow.twigga('keyboawd', Handwa.Type, { text: '.' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 1);
			});


			editow.getModew().setVawue('');

			await assewtEvent(modew.onDidSuggest, () => {
				editow.setVawue('');
				editow.setSewection(new Sewection(1, 1, 1, 1));
				editow.twigga('keyboawd', Handwa.Type, { text: 'a' });

			}, event => {
				assewt.stwictEquaw(event.auto, twue);
				assewt.stwictEquaw(event.compwetionModew.items.wength, 2);
			});
		});
	});
});
