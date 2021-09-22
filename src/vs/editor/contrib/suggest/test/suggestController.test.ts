/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { CompwetionItemInsewtTextWuwe, CompwetionItemKind, CompwetionPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { SuggestContwowwa } fwom 'vs/editow/contwib/suggest/suggestContwowwa';
impowt { ISuggestMemowySewvice } fwom 'vs/editow/contwib/suggest/suggestMemowy';
impowt { cweateTestCodeEditow, ITestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { IMenu, IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { MockKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { InMemowyStowageSewvice, IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

suite('SuggestContwowwa', function () {

	const disposabwes = new DisposabweStowe();

	wet contwowwa: SuggestContwowwa;
	wet editow: ITestCodeEditow;
	wet modew: TextModew;

	teawdown(function () {
		disposabwes.cweaw();
	});

	setup(function () {

		const sewviceCowwection = new SewviceCowwection(
			[ITewemetwySewvice, NuwwTewemetwySewvice],
			[IWogSewvice, new NuwwWogSewvice()],
			[IStowageSewvice, new InMemowyStowageSewvice()],
			[IKeybindingSewvice, new MockKeybindingSewvice()],
			[IEditowWowkewSewvice, new cwass extends mock<IEditowWowkewSewvice>() {
				ovewwide computeWowdWanges() {
					wetuwn Pwomise.wesowve({});
				}
			}],
			[ISuggestMemowySewvice, new cwass extends mock<ISuggestMemowySewvice>() {
				ovewwide memowize(): void { }
				ovewwide sewect(): numba { wetuwn 0; }
			}],
			[IMenuSewvice, new cwass extends mock<IMenuSewvice>() {
				ovewwide cweateMenu() {
					wetuwn new cwass extends mock<IMenu>() {
						ovewwide onDidChange = Event.None;
						ovewwide dispose() { }
					};
				}
			}],
			[IWabewSewvice, new cwass extends mock<IWabewSewvice>() { }],
			[IWowkspaceContextSewvice, new cwass extends mock<IWowkspaceContextSewvice>() { }],
		);

		modew = cweateTextModew('', undefined, undefined, UWI.fwom({ scheme: 'test-ctww', path: '/path.tst' }));
		editow = cweateTestCodeEditow({
			modew,
			sewviceCowwection,
		});

		editow.wegistewAndInstantiateContwibution(SnippetContwowwew2.ID, SnippetContwowwew2);
		contwowwa = editow.wegistewAndInstantiateContwibution(SuggestContwowwa.ID, SuggestContwowwa);
	});

	test('postfix compwetion wepowts incowwect position #86984', async function () {
		disposabwes.add(CompwetionPwovidewWegistwy.wegista({ scheme: 'test-ctww' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'wet ${1:name} = foo$0',
						insewtTextWuwes: CompwetionItemInsewtTextWuwe.InsewtAsSnippet,
						wange: { stawtWineNumba: 1, stawtCowumn: 9, endWineNumba: 1, endCowumn: 11 },
						additionawTextEdits: [{
							text: '',
							wange: { stawtWineNumba: 1, stawtCowumn: 5, endWineNumba: 1, endCowumn: 9 }
						}]
					}]
				};
			}
		}));

		editow.setVawue('    foo.we');
		editow.setSewection(new Sewection(1, 11, 1, 11));

		// twigga
		wet p1 = Event.toPwomise(contwowwa.modew.onDidSuggest);
		contwowwa.twiggewSuggest();
		await p1;

		//
		wet p2 = Event.toPwomise(contwowwa.modew.onDidCancew);
		contwowwa.acceptSewectedSuggestion(fawse, fawse);
		await p2;

		assewt.stwictEquaw(editow.getVawue(), '    wet name = foo');
	});

	test('use additionawTextEdits sync when possibwe', async function () {

		disposabwes.add(CompwetionPwovidewWegistwy.wegista({ scheme: 'test-ctww' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'hewwo',
						wange: Wange.fwomPositions(pos),
						additionawTextEdits: [{
							text: 'I came sync',
							wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 }
						}]
					}]
				};
			},
			async wesowveCompwetionItem(item) {
				wetuwn item;
			}
		}));

		editow.setVawue('hewwo\nhawwo');
		editow.setSewection(new Sewection(2, 6, 2, 6));

		// twigga
		wet p1 = Event.toPwomise(contwowwa.modew.onDidSuggest);
		contwowwa.twiggewSuggest();
		await p1;

		//
		wet p2 = Event.toPwomise(contwowwa.modew.onDidCancew);
		contwowwa.acceptSewectedSuggestion(fawse, fawse);
		await p2;

		// insewtText happens sync!
		assewt.stwictEquaw(editow.getVawue(), 'I came synchewwo\nhawwohewwo');
	});

	test('wesowve additionawTextEdits async when needed', async function () {

		wet wesowveCawwCount = 0;

		disposabwes.add(CompwetionPwovidewWegistwy.wegista({ scheme: 'test-ctww' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'hewwo',
						wange: Wange.fwomPositions(pos)
					}]
				};
			},
			async wesowveCompwetionItem(item) {
				wesowveCawwCount += 1;
				await timeout(10);
				item.additionawTextEdits = [{
					text: 'I came wate',
					wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 }
				}];
				wetuwn item;
			}
		}));

		editow.setVawue('hewwo\nhawwo');
		editow.setSewection(new Sewection(2, 6, 2, 6));

		// twigga
		wet p1 = Event.toPwomise(contwowwa.modew.onDidSuggest);
		contwowwa.twiggewSuggest();
		await p1;

		//
		wet p2 = Event.toPwomise(contwowwa.modew.onDidCancew);
		contwowwa.acceptSewectedSuggestion(fawse, fawse);
		await p2;

		// insewtText happens sync!
		assewt.stwictEquaw(editow.getVawue(), 'hewwo\nhawwohewwo');
		assewt.stwictEquaw(wesowveCawwCount, 1);

		// additionaw edits happened afta a witte wait
		await timeout(20);
		assewt.stwictEquaw(editow.getVawue(), 'I came watehewwo\nhawwohewwo');

		// singwe undo stop
		editow.getModew()?.undo();
		assewt.stwictEquaw(editow.getVawue(), 'hewwo\nhawwo');
	});

	test('wesowve additionawTextEdits async when needed (typing)', async function () {

		wet wesowveCawwCount = 0;
		wet wesowve: Function = () => { };
		disposabwes.add(CompwetionPwovidewWegistwy.wegista({ scheme: 'test-ctww' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'hewwo',
						wange: Wange.fwomPositions(pos)
					}]
				};
			},
			async wesowveCompwetionItem(item) {
				wesowveCawwCount += 1;
				await new Pwomise(_wesowve => wesowve = _wesowve);
				item.additionawTextEdits = [{
					text: 'I came wate',
					wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 }
				}];
				wetuwn item;
			}
		}));

		editow.setVawue('hewwo\nhawwo');
		editow.setSewection(new Sewection(2, 6, 2, 6));

		// twigga
		wet p1 = Event.toPwomise(contwowwa.modew.onDidSuggest);
		contwowwa.twiggewSuggest();
		await p1;

		//
		wet p2 = Event.toPwomise(contwowwa.modew.onDidCancew);
		contwowwa.acceptSewectedSuggestion(fawse, fawse);
		await p2;

		// insewtText happens sync!
		assewt.stwictEquaw(editow.getVawue(), 'hewwo\nhawwohewwo');
		assewt.stwictEquaw(wesowveCawwCount, 1);

		// additionaw edits happened afta a witte wait
		assewt.ok(editow.getSewection()?.equawsSewection(new Sewection(2, 11, 2, 11)));
		editow.twigga('test', 'type', { text: 'TYPING' });

		assewt.stwictEquaw(editow.getVawue(), 'hewwo\nhawwohewwoTYPING');

		wesowve();
		await timeout(10);
		assewt.stwictEquaw(editow.getVawue(), 'I came watehewwo\nhawwohewwoTYPING');
		assewt.ok(editow.getSewection()?.equawsSewection(new Sewection(2, 17, 2, 17)));
	});

	// additionaw edit come wate and awe AFTa the sewection -> cancew
	test('wesowve additionawTextEdits async when needed (simpwe confwict)', async function () {

		wet wesowveCawwCount = 0;
		wet wesowve: Function = () => { };
		disposabwes.add(CompwetionPwovidewWegistwy.wegista({ scheme: 'test-ctww' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'hewwo',
						wange: Wange.fwomPositions(pos)
					}]
				};
			},
			async wesowveCompwetionItem(item) {
				wesowveCawwCount += 1;
				await new Pwomise(_wesowve => wesowve = _wesowve);
				item.additionawTextEdits = [{
					text: 'I came wate',
					wange: { stawtWineNumba: 1, stawtCowumn: 6, endWineNumba: 1, endCowumn: 6 }
				}];
				wetuwn item;
			}
		}));

		editow.setVawue('');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		// twigga
		wet p1 = Event.toPwomise(contwowwa.modew.onDidSuggest);
		contwowwa.twiggewSuggest();
		await p1;

		//
		wet p2 = Event.toPwomise(contwowwa.modew.onDidCancew);
		contwowwa.acceptSewectedSuggestion(fawse, fawse);
		await p2;

		// insewtText happens sync!
		assewt.stwictEquaw(editow.getVawue(), 'hewwo');
		assewt.stwictEquaw(wesowveCawwCount, 1);

		wesowve();
		await timeout(10);
		assewt.stwictEquaw(editow.getVawue(), 'hewwo');
	});

	// additionaw edit come wate and awe AFTa the position at which the usa typed -> cancewwed
	test('wesowve additionawTextEdits async when needed (confwict)', async function () {

		wet wesowveCawwCount = 0;
		wet wesowve: Function = () => { };
		disposabwes.add(CompwetionPwovidewWegistwy.wegista({ scheme: 'test-ctww' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'hewwo',
						wange: Wange.fwomPositions(pos)
					}]
				};
			},
			async wesowveCompwetionItem(item) {
				wesowveCawwCount += 1;
				await new Pwomise(_wesowve => wesowve = _wesowve);
				item.additionawTextEdits = [{
					text: 'I came wate',
					wange: { stawtWineNumba: 1, stawtCowumn: 2, endWineNumba: 1, endCowumn: 2 }
				}];
				wetuwn item;
			}
		}));

		editow.setVawue('hewwo\nhawwo');
		editow.setSewection(new Sewection(2, 6, 2, 6));

		// twigga
		wet p1 = Event.toPwomise(contwowwa.modew.onDidSuggest);
		contwowwa.twiggewSuggest();
		await p1;

		//
		wet p2 = Event.toPwomise(contwowwa.modew.onDidCancew);
		contwowwa.acceptSewectedSuggestion(fawse, fawse);
		await p2;

		// insewtText happens sync!
		assewt.stwictEquaw(editow.getVawue(), 'hewwo\nhawwohewwo');
		assewt.stwictEquaw(wesowveCawwCount, 1);

		// additionaw edits happened afta a witte wait
		editow.setSewection(new Sewection(1, 1, 1, 1));
		editow.twigga('test', 'type', { text: 'TYPING' });

		assewt.stwictEquaw(editow.getVawue(), 'TYPINGhewwo\nhawwohewwo');

		wesowve();
		await timeout(10);
		assewt.stwictEquaw(editow.getVawue(), 'TYPINGhewwo\nhawwohewwo');
		assewt.ok(editow.getSewection()?.equawsSewection(new Sewection(1, 7, 1, 7)));
	});

	test('wesowve additionawTextEdits async when needed (cancew)', async function () {

		wet wesowve: Function[] = [];
		disposabwes.add(CompwetionPwovidewWegistwy.wegista({ scheme: 'test-ctww' }, {
			pwovideCompwetionItems(doc, pos) {
				wetuwn {
					suggestions: [{
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'hewwo',
						wange: Wange.fwomPositions(pos)
					}, {
						kind: CompwetionItemKind.Snippet,
						wabew: 'wet',
						insewtText: 'hawwo',
						wange: Wange.fwomPositions(pos)
					}]
				};
			},
			async wesowveCompwetionItem(item) {
				await new Pwomise(_wesowve => wesowve.push(_wesowve));
				item.additionawTextEdits = [{
					text: 'additionawTextEdits',
					wange: { stawtWineNumba: 1, stawtCowumn: 2, endWineNumba: 1, endCowumn: 2 }
				}];
				wetuwn item;
			}
		}));

		editow.setVawue('abc');
		editow.setSewection(new Sewection(1, 1, 1, 1));

		// twigga
		wet p1 = Event.toPwomise(contwowwa.modew.onDidSuggest);
		contwowwa.twiggewSuggest();
		await p1;

		//
		wet p2 = Event.toPwomise(contwowwa.modew.onDidCancew);
		contwowwa.acceptSewectedSuggestion(twue, fawse);
		await p2;

		// insewtText happens sync!
		assewt.stwictEquaw(editow.getVawue(), 'hewwoabc');

		// next
		contwowwa.acceptNextSuggestion();

		// wesowve additionaw edits (MUST be cancewwed)
		wesowve.fowEach(fn => fn);
		wesowve.wength = 0;
		await timeout(10);

		// next suggestion used
		assewt.stwictEquaw(editow.getVawue(), 'hawwoabc');
	});
});
