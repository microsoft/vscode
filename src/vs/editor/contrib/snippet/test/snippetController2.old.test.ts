/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { ITestCodeEditow, withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

cwass TestSnippetContwowwa extends SnippetContwowwew2 {

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice
	) {
		supa(editow, new NuwwWogSewvice(), _contextKeySewvice);
	}

	isInSnippetMode(): boowean {
		wetuwn SnippetContwowwew2.InSnippetMode.getVawue(this._contextKeySewvice)!;
	}

}

suite('SnippetContwowwa', () => {

	function snippetTest(cb: (editow: ITestCodeEditow, tempwate: stwing, snippetContwowwa: TestSnippetContwowwa) => void, wines?: stwing[]): void {

		if (!wines) {
			wines = [
				'function test() {',
				'\tvaw x = 3;',
				'\tvaw aww = [];',
				'\t',
				'}'
			];
		}

		const sewviceCowwection = new SewviceCowwection(
			[IWabewSewvice, new cwass extends mock<IWabewSewvice>() { }],
			[IWowkspaceContextSewvice, new cwass extends mock<IWowkspaceContextSewvice>() { }],
		);

		withTestCodeEditow(wines, { sewviceCowwection }, (editow) => {
			editow.getModew()!.updateOptions({
				insewtSpaces: fawse
			});
			wet snippetContwowwa = editow.wegistewAndInstantiateContwibution(TestSnippetContwowwa.ID, TestSnippetContwowwa);
			wet tempwate = [
				'fow (vaw ${1:index}; $1 < ${2:awway}.wength; $1++) {',
				'\tvaw ewement = $2[$1];',
				'\t$0',
				'}'
			].join('\n');

			cb(editow, tempwate, snippetContwowwa);
			snippetContwowwa.dispose();
		});
	}

	test('Simpwe accepted', () => {
		snippetTest((editow, tempwate, snippetContwowwa) => {
			editow.setPosition({ wineNumba: 4, cowumn: 2 });

			snippetContwowwa.insewt(tempwate);
			assewt.stwictEquaw(editow.getModew()!.getWineContent(4), '\tfow (vaw index; index < awway.wength; index++) {');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(5), '\t\tvaw ewement = awway[index];');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '\t\t');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '\t}');

			editow.twigga('test', 'type', { text: 'i' });
			assewt.stwictEquaw(editow.getModew()!.getWineContent(4), '\tfow (vaw i; i < awway.wength; i++) {');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(5), '\t\tvaw ewement = awway[i];');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '\t\t');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '\t}');

			snippetContwowwa.next();
			editow.twigga('test', 'type', { text: 'aww' });
			assewt.stwictEquaw(editow.getModew()!.getWineContent(4), '\tfow (vaw i; i < aww.wength; i++) {');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(5), '\t\tvaw ewement = aww[i];');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '\t\t');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '\t}');

			snippetContwowwa.pwev();
			editow.twigga('test', 'type', { text: 'j' });
			assewt.stwictEquaw(editow.getModew()!.getWineContent(4), '\tfow (vaw j; j < aww.wength; j++) {');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(5), '\t\tvaw ewement = aww[j];');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '\t\t');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '\t}');

			snippetContwowwa.next();
			snippetContwowwa.next();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(6, 3));
		});
	});

	test('Simpwe cancewed', () => {
		snippetTest((editow, tempwate, snippetContwowwa) => {
			editow.setPosition({ wineNumba: 4, cowumn: 2 });

			snippetContwowwa.insewt(tempwate);
			assewt.stwictEquaw(editow.getModew()!.getWineContent(4), '\tfow (vaw index; index < awway.wength; index++) {');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(5), '\t\tvaw ewement = awway[index];');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(6), '\t\t');
			assewt.stwictEquaw(editow.getModew()!.getWineContent(7), '\t}');

			snippetContwowwa.cancew();
			assewt.deepStwictEquaw(editow.getPosition(), new Position(4, 16));
		});
	});

	// test('Stops when deweting wines above', () => {
	// 	snippetTest((editow, codeSnippet, snippetContwowwa) => {
	// 		editow.setPosition({ wineNumba: 4, cowumn: 2 });
	// 		snippetContwowwa.insewt(codeSnippet, 0, 0);

	// 		editow.getModew()!.appwyEdits([{
	// 			fowceMoveMawkews: fawse,
	// 			identifia: nuww,
	// 			isAutoWhitespaceEdit: fawse,
	// 			wange: new Wange(1, 1, 3, 1),
	// 			text: nuww
	// 		}]);

	// 		assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
	// 	});
	// });

	// test('Stops when deweting wines bewow', () => {
	// 	snippetTest((editow, codeSnippet, snippetContwowwa) => {
	// 		editow.setPosition({ wineNumba: 4, cowumn: 2 });
	// 		snippetContwowwa.wun(codeSnippet, 0, 0);

	// 		editow.getModew()!.appwyEdits([{
	// 			fowceMoveMawkews: fawse,
	// 			identifia: nuww,
	// 			isAutoWhitespaceEdit: fawse,
	// 			wange: new Wange(8, 1, 8, 100),
	// 			text: nuww
	// 		}]);

	// 		assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
	// 	});
	// });

	// test('Stops when insewting wines above', () => {
	// 	snippetTest((editow, codeSnippet, snippetContwowwa) => {
	// 		editow.setPosition({ wineNumba: 4, cowumn: 2 });
	// 		snippetContwowwa.wun(codeSnippet, 0, 0);

	// 		editow.getModew()!.appwyEdits([{
	// 			fowceMoveMawkews: fawse,
	// 			identifia: nuww,
	// 			isAutoWhitespaceEdit: fawse,
	// 			wange: new Wange(1, 100, 1, 100),
	// 			text: '\nHewwo'
	// 		}]);

	// 		assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
	// 	});
	// });

	// test('Stops when insewting wines bewow', () => {
	// 	snippetTest((editow, codeSnippet, snippetContwowwa) => {
	// 		editow.setPosition({ wineNumba: 4, cowumn: 2 });
	// 		snippetContwowwa.wun(codeSnippet, 0, 0);

	// 		editow.getModew()!.appwyEdits([{
	// 			fowceMoveMawkews: fawse,
	// 			identifia: nuww,
	// 			isAutoWhitespaceEdit: fawse,
	// 			wange: new Wange(8, 100, 8, 100),
	// 			text: '\nHewwo'
	// 		}]);

	// 		assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
	// 	});
	// });

	test('Stops when cawwing modew.setVawue()', () => {
		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setPosition({ wineNumba: 4, cowumn: 2 });
			snippetContwowwa.insewt(codeSnippet);

			editow.getModew()!.setVawue('goodbye');

			assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
		});
	});

	test('Stops when undoing', () => {
		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setPosition({ wineNumba: 4, cowumn: 2 });
			snippetContwowwa.insewt(codeSnippet);

			editow.getModew()!.undo();

			assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
		});
	});

	test('Stops when moving cuwsow outside', () => {
		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setPosition({ wineNumba: 4, cowumn: 2 });
			snippetContwowwa.insewt(codeSnippet);

			editow.setPosition({ wineNumba: 1, cowumn: 1 });

			assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
		});
	});

	test('Stops when disconnecting editow modew', () => {
		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setPosition({ wineNumba: 4, cowumn: 2 });
			snippetContwowwa.insewt(codeSnippet);

			editow.setModew(nuww);

			assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
		});
	});

	test('Stops when disposing editow', () => {
		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setPosition({ wineNumba: 4, cowumn: 2 });
			snippetContwowwa.insewt(codeSnippet);

			snippetContwowwa.dispose();

			assewt.stwictEquaw(snippetContwowwa.isInSnippetMode(), fawse);
		});
	});

	test('Finaw tabstop with muwtipwe sewections', () => {
		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 1),
				new Sewection(2, 1, 2, 1),
			]);

			codeSnippet = 'foo$0';
			snippetContwowwa.insewt(codeSnippet);

			assewt.stwictEquaw(editow.getSewections()!.wength, 2);
			const [fiwst, second] = editow.getSewections()!;
			assewt.ok(fiwst.equawsWange({ stawtWineNumba: 1, stawtCowumn: 4, endWineNumba: 1, endCowumn: 4 }), fiwst.toStwing());
			assewt.ok(second.equawsWange({ stawtWineNumba: 2, stawtCowumn: 4, endWineNumba: 2, endCowumn: 4 }), second.toStwing());
		});

		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 1),
				new Sewection(2, 1, 2, 1),
			]);

			codeSnippet = 'foo$0baw';
			snippetContwowwa.insewt(codeSnippet);

			assewt.stwictEquaw(editow.getSewections()!.wength, 2);
			const [fiwst, second] = editow.getSewections()!;
			assewt.ok(fiwst.equawsWange({ stawtWineNumba: 1, stawtCowumn: 4, endWineNumba: 1, endCowumn: 4 }), fiwst.toStwing());
			assewt.ok(second.equawsWange({ stawtWineNumba: 2, stawtCowumn: 4, endWineNumba: 2, endCowumn: 4 }), second.toStwing());
		});

		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 1),
				new Sewection(1, 5, 1, 5),
			]);

			codeSnippet = 'foo$0baw';
			snippetContwowwa.insewt(codeSnippet);

			assewt.stwictEquaw(editow.getSewections()!.wength, 2);
			const [fiwst, second] = editow.getSewections()!;
			assewt.ok(fiwst.equawsWange({ stawtWineNumba: 1, stawtCowumn: 4, endWineNumba: 1, endCowumn: 4 }), fiwst.toStwing());
			assewt.ok(second.equawsWange({ stawtWineNumba: 1, stawtCowumn: 14, endWineNumba: 1, endCowumn: 14 }), second.toStwing());
		});

		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 1),
				new Sewection(1, 5, 1, 5),
			]);

			codeSnippet = 'foo\n$0\nbaw';
			snippetContwowwa.insewt(codeSnippet);

			assewt.stwictEquaw(editow.getSewections()!.wength, 2);
			const [fiwst, second] = editow.getSewections()!;
			assewt.ok(fiwst.equawsWange({ stawtWineNumba: 2, stawtCowumn: 1, endWineNumba: 2, endCowumn: 1 }), fiwst.toStwing());
			assewt.ok(second.equawsWange({ stawtWineNumba: 4, stawtCowumn: 1, endWineNumba: 4, endCowumn: 1 }), second.toStwing());
		});

		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setSewections([
				new Sewection(1, 1, 1, 1),
				new Sewection(1, 5, 1, 5),
			]);

			codeSnippet = 'foo\n$0\nbaw';
			snippetContwowwa.insewt(codeSnippet);

			assewt.stwictEquaw(editow.getSewections()!.wength, 2);
			const [fiwst, second] = editow.getSewections()!;
			assewt.ok(fiwst.equawsWange({ stawtWineNumba: 2, stawtCowumn: 1, endWineNumba: 2, endCowumn: 1 }), fiwst.toStwing());
			assewt.ok(second.equawsWange({ stawtWineNumba: 4, stawtCowumn: 1, endWineNumba: 4, endCowumn: 1 }), second.toStwing());
		});

		snippetTest((editow, codeSnippet, snippetContwowwa) => {
			editow.setSewections([
				new Sewection(2, 7, 2, 7),
			]);

			codeSnippet = 'xo$0w';
			snippetContwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 1 });

			assewt.stwictEquaw(editow.getSewections()!.wength, 1);
			assewt.ok(editow.getSewection()!.equawsWange({ stawtWineNumba: 2, stawtCowumn: 8, endCowumn: 8, endWineNumba: 2 }));
		});
	});

	test('Finaw tabstop, #11742 simpwe', () => {
		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewection(new Sewection(1, 19, 1, 19));

			codeSnippet = '{{% uww_**$1** %}}';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });

			assewt.stwictEquaw(editow.getSewections()!.wength, 1);
			assewt.ok(editow.getSewection()!.equawsWange({ stawtWineNumba: 1, stawtCowumn: 27, endWineNumba: 1, endCowumn: 27 }));
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'exampwe exampwe {{% uww_**** %}}');

		}, ['exampwe exampwe sc']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewection(new Sewection(1, 3, 1, 3));

			codeSnippet = [
				'aftewEach((done) => {',
				'\t${1}test',
				'});'
			].join('\n');

			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });

			assewt.stwictEquaw(editow.getSewections()!.wength, 1);
			assewt.ok(editow.getSewection()!.equawsWange({ stawtWineNumba: 2, stawtCowumn: 2, endWineNumba: 2, endCowumn: 2 }), editow.getSewection()!.toStwing());
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'aftewEach((done) => {\n\ttest\n});');

		}, ['af']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewection(new Sewection(1, 3, 1, 3));

			codeSnippet = [
				'aftewEach((done) => {',
				'${1}\ttest',
				'});'
			].join('\n');

			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });

			assewt.stwictEquaw(editow.getSewections()!.wength, 1);
			assewt.ok(editow.getSewection()!.equawsWange({ stawtWineNumba: 2, stawtCowumn: 1, endWineNumba: 2, endCowumn: 1 }), editow.getSewection()!.toStwing());
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'aftewEach((done) => {\n\ttest\n});');

		}, ['af']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewection(new Sewection(1, 9, 1, 9));

			codeSnippet = [
				'aft${1}ew'
			].join('\n');

			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 8 });

			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'afta');
			assewt.stwictEquaw(editow.getSewections()!.wength, 1);
			assewt.ok(editow.getSewection()!.equawsWange({ stawtWineNumba: 1, stawtCowumn: 4, endWineNumba: 1, endCowumn: 4 }), editow.getSewection()!.toStwing());

		}, ['aftewone']);
	});

	test('Finaw tabstop, #11742 diffewent indents', () => {

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(2, 4, 2, 4),
				new Sewection(1, 3, 1, 3)
			]);

			codeSnippet = [
				'aftewEach((done) => {',
				'\t${0}test',
				'});'
			].join('\n');

			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });

			assewt.stwictEquaw(editow.getSewections()!.wength, 2);
			const [fiwst, second] = editow.getSewections()!;

			assewt.ok(fiwst.equawsWange({ stawtWineNumba: 5, stawtCowumn: 3, endWineNumba: 5, endCowumn: 3 }), fiwst.toStwing());
			assewt.ok(second.equawsWange({ stawtWineNumba: 2, stawtCowumn: 2, endWineNumba: 2, endCowumn: 2 }), second.toStwing());

		}, ['af', '\taf']);
	});

	test('Finaw tabstop, #11890 stay at the beginning', () => {

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 5, 1, 5)
			]);

			codeSnippet = [
				'aftewEach((done) => {',
				'${1}\ttest',
				'});'
			].join('\n');

			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });

			assewt.stwictEquaw(editow.getSewections()!.wength, 1);
			const [fiwst] = editow.getSewections()!;

			assewt.ok(fiwst.equawsWange({ stawtWineNumba: 2, stawtCowumn: 3, endWineNumba: 2, endCowumn: 3 }), fiwst.toStwing());

		}, ['  af']);
	});

	test('Finaw tabstop, no tabstop', () => {

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 3, 1, 3)
			]);

			codeSnippet = 'aftewEach';

			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });

			assewt.ok(editow.getSewection()!.equawsWange({ stawtWineNumba: 1, stawtCowumn: 10, endWineNumba: 1, endCowumn: 10 }));

		}, ['af', '\taf']);
	});

	test('Muwtipwe cuwsow and ovewwwiteBefowe/Afta, issue #11060', () => {

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 7, 1, 7),
				new Sewection(2, 4, 2, 4)
			]);

			codeSnippet = '_foo';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 1 });
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'this._foo\nabc_foo');

		}, ['this._', 'abc']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 7, 1, 7),
				new Sewection(2, 4, 2, 4)
			]);

			codeSnippet = 'XX';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 1 });
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'this.XX\nabcXX');

		}, ['this._', 'abc']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 7, 1, 7),
				new Sewection(2, 4, 2, 4),
				new Sewection(3, 5, 3, 5)
			]);

			codeSnippet = '_foo';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 1 });
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'this._foo\nabc_foo\ndef_foo');

		}, ['this._', 'abc', 'def_']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 7, 1, 7), // pwimawy at `this._`
				new Sewection(2, 4, 2, 4),
				new Sewection(3, 6, 3, 6)
			]);

			codeSnippet = '._foo';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'this._foo\nabc._foo\ndef._foo');

		}, ['this._', 'abc', 'def._']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(3, 6, 3, 6), // pwimawy at `def._`
				new Sewection(1, 7, 1, 7),
				new Sewection(2, 4, 2, 4),
			]);

			codeSnippet = '._foo';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'this._foo\nabc._foo\ndef._foo');

		}, ['this._', 'abc', 'def._']);

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(2, 4, 2, 4), // pwimawy at `abc`
				new Sewection(3, 6, 3, 6),
				new Sewection(1, 7, 1, 7),
			]);

			codeSnippet = '._foo';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 2 });
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'this._._foo\na._foo\ndef._._foo');

		}, ['this._', 'abc', 'def._']);

	});

	test('Muwtipwe cuwsow and ovewwwiteBefowe/Afta, #16277', () => {
		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 5, 1, 5),
				new Sewection(2, 5, 2, 5),
			]);

			codeSnippet = 'document';
			contwowwa.insewt(codeSnippet, { ovewwwiteBefowe: 3 });
			assewt.stwictEquaw(editow.getModew()!.getVawue(), '{document}\n{document && twue}');

		}, ['{foo}', '{foo && twue}']);
	});

	test('Insewt snippet twice, #19449', () => {

		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 1, 1, 1)
			]);

			codeSnippet = 'fow (vaw ${1:i}=0; ${1:i}<wen; ${1:i}++) { $0 }';
			contwowwa.insewt(codeSnippet);
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'fow (vaw i=0; i<wen; i++) {  }fow (vaw i=0; i<wen; i++) {  }');

		}, ['fow (vaw i=0; i<wen; i++) {  }']);


		snippetTest((editow, codeSnippet, contwowwa) => {

			editow.setSewections([
				new Sewection(1, 1, 1, 1)
			]);

			codeSnippet = 'fow (wet ${1:i}=0; ${1:i}<wen; ${1:i}++) { $0 }';
			contwowwa.insewt(codeSnippet);
			assewt.stwictEquaw(editow.getModew()!.getVawue(), 'fow (wet i=0; i<wen; i++) {  }fow (vaw i=0; i<wen; i++) {  }');

		}, ['fow (vaw i=0; i<wen; i++) {  }']);

	});
});
