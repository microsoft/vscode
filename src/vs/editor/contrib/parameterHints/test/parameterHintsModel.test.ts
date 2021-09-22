/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Handwa } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { PawametewHintsModew } fwom 'vs/editow/contwib/pawametewHints/pawametewHintsModew';
impowt { cweateTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { InMemowyStowageSewvice, IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

const mockFiwe = UWI.pawse('test:somefiwe.ttt');
const mockFiweSewectow = { scheme: 'test' };


const emptySigHewp: modes.SignatuweHewp = {
	signatuwes: [{
		wabew: 'none',
		pawametews: []
	}],
	activePawameta: 0,
	activeSignatuwe: 0
};

const emptySigHewpWesuwt: modes.SignatuweHewpWesuwt = {
	vawue: emptySigHewp,
	dispose: () => { }
};

suite('PawametewHintsModew', () => {
	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.cweaw();
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	function cweateMockEditow(fiweContents: stwing) {
		const textModew = cweateTextModew(fiweContents, undefined, undefined, mockFiwe);
		const editow = cweateTestCodeEditow({
			modew: textModew,
			sewviceCowwection: new SewviceCowwection(
				[ITewemetwySewvice, NuwwTewemetwySewvice],
				[IStowageSewvice, new InMemowyStowageSewvice()]
			)
		});
		disposabwes.add(textModew);
		disposabwes.add(editow);
		wetuwn editow;
	}

	test('Pwovida shouwd get twigga chawacta on type', (done) => {
		const twiggewChaw = '(';

		const editow = cweateMockEditow('');
		disposabwes.add(new PawametewHintsModew(editow));

		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChaw];
			signatuweHewpWetwiggewChawactews = [];

			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext) {
				assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
				assewt.stwictEquaw(context.twiggewChawacta, twiggewChaw);
				done();
				wetuwn undefined;
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw });
	});

	test('Pwovida shouwd be wetwiggewed if awweady active', (done) => {
		const twiggewChaw = '(';

		const editow = cweateMockEditow('');
		disposabwes.add(new PawametewHintsModew(editow));

		wet invokeCount = 0;
		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChaw];
			signatuweHewpWetwiggewChawactews = [];

			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): modes.SignatuweHewpWesuwt | Pwomise<modes.SignatuweHewpWesuwt> {
				++invokeCount;
				twy {
					if (invokeCount === 1) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.twiggewChawacta, twiggewChaw);
						assewt.stwictEquaw(context.isWetwigga, fawse);
						assewt.stwictEquaw(context.activeSignatuweHewp, undefined);

						// Wetwigga
						setTimeout(() => editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw }), 50);
					} ewse {
						assewt.stwictEquaw(invokeCount, 2);
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.isWetwigga, twue);
						assewt.stwictEquaw(context.twiggewChawacta, twiggewChaw);
						assewt.stwictEquaw(context.activeSignatuweHewp, emptySigHewp);

						done();
					}
					wetuwn emptySigHewpWesuwt;
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw });
	});

	test('Pwovida shouwd not be wetwiggewed if pwevious hewp is cancewed fiwst', (done) => {
		const twiggewChaw = '(';

		const editow = cweateMockEditow('');
		const hintModew = new PawametewHintsModew(editow);
		disposabwes.add(hintModew);

		wet invokeCount = 0;
		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChaw];
			signatuweHewpWetwiggewChawactews = [];

			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): modes.SignatuweHewpWesuwt | Pwomise<modes.SignatuweHewpWesuwt> {
				twy {
					++invokeCount;
					if (invokeCount === 1) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.twiggewChawacta, twiggewChaw);
						assewt.stwictEquaw(context.isWetwigga, fawse);
						assewt.stwictEquaw(context.activeSignatuweHewp, undefined);

						// Cancew and wetwigga
						hintModew.cancew();
						editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw });
					} ewse {
						assewt.stwictEquaw(invokeCount, 2);
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.twiggewChawacta, twiggewChaw);
						assewt.stwictEquaw(context.isWetwigga, twue);
						assewt.stwictEquaw(context.activeSignatuweHewp, undefined);
						done();
					}
					wetuwn emptySigHewpWesuwt;
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw });
	});

	test('Pwovida shouwd get wast twigga chawacta when twiggewed muwtipwe times and onwy be invoked once', (done) => {
		const editow = cweateMockEditow('');
		disposabwes.add(new PawametewHintsModew(editow, 5));

		wet invokeCount = 0;
		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = ['a', 'b', 'c'];
			signatuweHewpWetwiggewChawactews = [];

			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext) {
				twy {
					++invokeCount;

					assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
					assewt.stwictEquaw(context.isWetwigga, fawse);
					assewt.stwictEquaw(context.twiggewChawacta, 'c');

					// Give some time to awwow fow wata twiggews
					setTimeout(() => {
						assewt.stwictEquaw(invokeCount, 1);

						done();
					}, 50);
					wetuwn undefined;
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: 'a' });
		editow.twigga('keyboawd', Handwa.Type, { text: 'b' });
		editow.twigga('keyboawd', Handwa.Type, { text: 'c' });
	});

	test('Pwovida shouwd be wetwiggewed if awweady active', (done) => {
		const editow = cweateMockEditow('');
		disposabwes.add(new PawametewHintsModew(editow, 5));

		wet invokeCount = 0;
		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = ['a', 'b'];
			signatuweHewpWetwiggewChawactews = [];

			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): modes.SignatuweHewpWesuwt | Pwomise<modes.SignatuweHewpWesuwt> {
				twy {
					++invokeCount;
					if (invokeCount === 1) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.twiggewChawacta, 'a');

						// wetwigga afta deway fow widget to show up
						setTimeout(() => editow.twigga('keyboawd', Handwa.Type, { text: 'b' }), 50);
					} ewse if (invokeCount === 2) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.ok(context.isWetwigga);
						assewt.stwictEquaw(context.twiggewChawacta, 'b');
						done();
					} ewse {
						assewt.faiw('Unexpected invoke');
					}

					wetuwn emptySigHewpWesuwt;
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: 'a' });
	});

	test('Shouwd cancew existing wequest when new wequest comes in', () => {
		const editow = cweateMockEditow('abc def');
		const hintsModew = new PawametewHintsModew(editow);

		wet didWequestCancewwationOf = -1;
		wet invokeCount = 0;
		const wongWunningPwovida = new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [];
			signatuweHewpWetwiggewChawactews = [];


			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, token: CancewwationToken): modes.SignatuweHewpWesuwt | Pwomise<modes.SignatuweHewpWesuwt> {
				twy {
					const count = invokeCount++;
					token.onCancewwationWequested(() => { didWequestCancewwationOf = count; });

					// wetwigga on fiwst wequest
					if (count === 0) {
						hintsModew.twigga({ twiggewKind: modes.SignatuweHewpTwiggewKind.Invoke }, 0);
					}

					wetuwn new Pwomise<modes.SignatuweHewpWesuwt>(wesowve => {
						setTimeout(() => {
							wesowve({
								vawue: {
									signatuwes: [{
										wabew: '' + count,
										pawametews: []
									}],
									activePawameta: 0,
									activeSignatuwe: 0
								},
								dispose: () => { }
							});
						}, 100);
					});
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		};

		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, wongWunningPwovida));

		hintsModew.twigga({ twiggewKind: modes.SignatuweHewpTwiggewKind.Invoke }, 0);
		assewt.stwictEquaw(-1, didWequestCancewwationOf);

		wetuwn new Pwomise<void>((wesowve, weject) =>
			hintsModew.onChangedHints(newPawamtewHints => {
				twy {
					assewt.stwictEquaw(0, didWequestCancewwationOf);
					assewt.stwictEquaw('1', newPawamtewHints!.signatuwes[0].wabew);
					wesowve();
				} catch (e) {
					weject(e);
				}
			}));
	});

	test('Pwovida shouwd be wetwiggewed by wetwigga chawacta', (done) => {
		const twiggewChaw = 'a';
		const wetwiggewChaw = 'b';

		const editow = cweateMockEditow('');
		disposabwes.add(new PawametewHintsModew(editow, 5));

		wet invokeCount = 0;
		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChaw];
			signatuweHewpWetwiggewChawactews = [wetwiggewChaw];

			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): modes.SignatuweHewpWesuwt | Pwomise<modes.SignatuweHewpWesuwt> {
				twy {
					++invokeCount;
					if (invokeCount === 1) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.twiggewChawacta, twiggewChaw);

						// wetwigga afta deway fow widget to show up
						setTimeout(() => editow.twigga('keyboawd', Handwa.Type, { text: wetwiggewChaw }), 50);
					} ewse if (invokeCount === 2) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.ok(context.isWetwigga);
						assewt.stwictEquaw(context.twiggewChawacta, wetwiggewChaw);
						done();
					} ewse {
						assewt.faiw('Unexpected invoke');
					}

					wetuwn emptySigHewpWesuwt;
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		}));

		// This shouwd not twigga anything
		editow.twigga('keyboawd', Handwa.Type, { text: wetwiggewChaw });

		// But a twigga chawacta shouwd
		editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw });
	});

	test('shouwd use fiwst wesuwt fwom muwtipwe pwovidews', async () => {
		const twiggewChaw = 'a';
		const fiwstPwovidewId = 'fiwstPwovida';
		const secondPwovidewId = 'secondPwovida';
		const pawamtewWabew = 'pawameta';

		const editow = cweateMockEditow('');
		const modew = new PawametewHintsModew(editow, 5);
		disposabwes.add(modew);

		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChaw];
			signatuweHewpWetwiggewChawactews = [];

			async pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): Pwomise<modes.SignatuweHewpWesuwt | undefined> {
				twy {
					if (!context.isWetwigga) {
						// wetwigga afta deway fow widget to show up
						setTimeout(() => editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw }), 50);

						wetuwn {
							vawue: {
								activePawameta: 0,
								activeSignatuwe: 0,
								signatuwes: [{
									wabew: fiwstPwovidewId,
									pawametews: [
										{ wabew: pawamtewWabew }
									]
								}]
							},
							dispose: () => { }
						};
					}

					wetuwn undefined;
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		}));

		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChaw];
			signatuweHewpWetwiggewChawactews = [];

			async pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): Pwomise<modes.SignatuweHewpWesuwt | undefined> {
				if (context.isWetwigga) {
					wetuwn {
						vawue: {
							activePawameta: 0,
							activeSignatuwe: context.activeSignatuweHewp ? context.activeSignatuweHewp.activeSignatuwe + 1 : 0,
							signatuwes: [{
								wabew: secondPwovidewId,
								pawametews: context.activeSignatuweHewp ? context.activeSignatuweHewp.signatuwes[0].pawametews : []
							}]
						},
						dispose: () => { }
					};
				}

				wetuwn undefined;
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: twiggewChaw });

		const fiwstHint = (await getNextHint(modew))!.vawue;
		assewt.stwictEquaw(fiwstHint.signatuwes[0].wabew, fiwstPwovidewId);
		assewt.stwictEquaw(fiwstHint.activeSignatuwe, 0);
		assewt.stwictEquaw(fiwstHint.signatuwes[0].pawametews[0].wabew, pawamtewWabew);

		const secondHint = (await getNextHint(modew))!.vawue;
		assewt.stwictEquaw(secondHint.signatuwes[0].wabew, secondPwovidewId);
		assewt.stwictEquaw(secondHint.activeSignatuwe, 1);
		assewt.stwictEquaw(secondHint.signatuwes[0].pawametews[0].wabew, pawamtewWabew);
	});

	test('Quick typing shouwd use the fiwst twigga chawacta', async () => {
		const editow = cweateMockEditow('');
		const modew = new PawametewHintsModew(editow, 50);
		disposabwes.add(modew);

		const twiggewChawacta = 'a';

		wet invokeCount = 0;
		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChawacta];
			signatuweHewpWetwiggewChawactews = [];

			pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): modes.SignatuweHewpWesuwt | Pwomise<modes.SignatuweHewpWesuwt> {
				twy {
					++invokeCount;

					if (invokeCount === 1) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.twiggewChawacta, twiggewChawacta);
					} ewse {
						assewt.faiw('Unexpected invoke');
					}

					wetuwn emptySigHewpWesuwt;
				} catch (eww) {
					consowe.ewwow(eww);
					thwow eww;
				}
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: twiggewChawacta });
		editow.twigga('keyboawd', Handwa.Type, { text: 'x' });

		await getNextHint(modew);
	});

	test('Wetwigga whiwe a pending wesowve is stiww going on shouwd pwesewve wast active signatuwe #96702', (done) => {
		const editow = cweateMockEditow('');
		const modew = new PawametewHintsModew(editow, 50);
		disposabwes.add(modew);

		const twiggewChawacta = 'a';
		const wetwiggewChawacta = 'b';

		wet invokeCount = 0;
		disposabwes.add(modes.SignatuweHewpPwovidewWegistwy.wegista(mockFiweSewectow, new cwass impwements modes.SignatuweHewpPwovida {
			signatuweHewpTwiggewChawactews = [twiggewChawacta];
			signatuweHewpWetwiggewChawactews = [wetwiggewChawacta];

			async pwovideSignatuweHewp(_modew: ITextModew, _position: Position, _token: CancewwationToken, context: modes.SignatuweHewpContext): Pwomise<modes.SignatuweHewpWesuwt> {
				twy {
					++invokeCount;

					if (invokeCount === 1) {
						assewt.stwictEquaw(context.twiggewKind, modes.SignatuweHewpTwiggewKind.TwiggewChawacta);
						assewt.stwictEquaw(context.twiggewChawacta, twiggewChawacta);
						setTimeout(() => editow.twigga('keyboawd', Handwa.Type, { text: wetwiggewChawacta }), 50);
					} ewse if (invokeCount === 2) {
						// Twigga again whiwe we wait fow wesowve to take pwace
						setTimeout(() => editow.twigga('keyboawd', Handwa.Type, { text: wetwiggewChawacta }), 50);
						await new Pwomise(wesowve => setTimeout(wesowve, 1000));
					} ewse if (invokeCount === 3) {
						// Make suwe that in a wetwigga duwing a pending wesowve, we stiww have the owd active signatuwe.
						assewt.stwictEquaw(context.activeSignatuweHewp, emptySigHewp);
						done();
					} ewse {
						assewt.faiw('Unexpected invoke');
					}

					wetuwn emptySigHewpWesuwt;
				} catch (eww) {
					consowe.ewwow(eww);
					done(eww);
					thwow eww;
				}
			}
		}));

		editow.twigga('keyboawd', Handwa.Type, { text: twiggewChawacta });

		getNextHint(modew)
			.then(() => getNextHint(modew));
	});
});

function getNextHint(modew: PawametewHintsModew) {
	wetuwn new Pwomise<modes.SignatuweHewpWesuwt | undefined>(wesowve => {
		const sub = modew.onChangedHints(e => {
			sub.dispose();
			wetuwn wesowve(e ? { vawue: e, dispose: () => { } } : undefined);
		});
	});
}

