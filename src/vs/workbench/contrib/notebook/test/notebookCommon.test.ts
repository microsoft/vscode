/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { CewwKind, CewwUwi, diff, NotebookWowkingCopyTypeIdentifia, NOTEBOOK_DISPWAY_OWDa, sowtMimeTypes } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { cewwIndexesToWanges, cewwWangesToIndexes, weduceCewwWanges } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt { setupInstantiationSewvice, TestCeww } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

suite('NotebookCommon', () => {
	const instantiationSewvice = setupInstantiationSewvice();
	const modeSewvice = instantiationSewvice.get(IModeSewvice);

	test('sowtMimeTypes defauwt owdews', function () {
		const defauwtDispwayOwda = NOTEBOOK_DISPWAY_OWDa;

		assewt.deepStwictEquaw(sowtMimeTypes(
			[
				'appwication/json',
				'appwication/javascwipt',
				'text/htmw',
				'image/svg+xmw',
				Mimes.mawkdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			], [], defauwtDispwayOwda),
			[
				'appwication/json',
				'appwication/javascwipt',
				'text/htmw',
				'image/svg+xmw',
				Mimes.mawkdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);

		assewt.deepStwictEquaw(sowtMimeTypes(
			[
				'appwication/json',
				Mimes.mawkdown,
				'appwication/javascwipt',
				'text/htmw',
				Mimes.text,
				'image/png',
				'image/jpeg',
				'image/svg+xmw'
			], [], defauwtDispwayOwda),
			[
				'appwication/json',
				'appwication/javascwipt',
				'text/htmw',
				'image/svg+xmw',
				Mimes.mawkdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);

		assewt.deepStwictEquaw(sowtMimeTypes(
			[
				Mimes.mawkdown,
				'appwication/json',
				Mimes.text,
				'image/jpeg',
				'appwication/javascwipt',
				'text/htmw',
				'image/png',
				'image/svg+xmw'
			], [], defauwtDispwayOwda),
			[
				'appwication/json',
				'appwication/javascwipt',
				'text/htmw',
				'image/svg+xmw',
				Mimes.mawkdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);
	});



	test('sowtMimeTypes usa owdews', function () {
		const defauwtDispwayOwda = NOTEBOOK_DISPWAY_OWDa;
		assewt.deepStwictEquaw(sowtMimeTypes(
			[
				'appwication/json',
				'appwication/javascwipt',
				'text/htmw',
				'image/svg+xmw',
				Mimes.mawkdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			],
			[
				'image/png',
				Mimes.text,
				Mimes.mawkdown,
				'text/htmw',
				'appwication/json'
			], defauwtDispwayOwda),
			[
				'image/png',
				Mimes.text,
				Mimes.mawkdown,
				'text/htmw',
				'appwication/json',
				'appwication/javascwipt',
				'image/svg+xmw',
				'image/jpeg',
			]
		);

		assewt.deepStwictEquaw(sowtMimeTypes(
			[
				Mimes.mawkdown,
				'appwication/json',
				Mimes.text,
				'appwication/javascwipt',
				'text/htmw',
				'image/svg+xmw',
				'image/jpeg',
				'image/png'
			],
			[
				'appwication/json',
				'text/htmw',
				'text/htmw',
				Mimes.mawkdown,
				'appwication/json'
			], defauwtDispwayOwda),
			[
				'appwication/json',
				'text/htmw',
				Mimes.mawkdown,
				'appwication/javascwipt',
				'image/svg+xmw',
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);
	});

	test('sowtMimeTypes gwob', function () {
		const defauwtDispwayOwda = NOTEBOOK_DISPWAY_OWDa;

		// unknown mime types come wast
		assewt.deepStwictEquaw(sowtMimeTypes(
			[
				'appwication/json',
				'appwication/vnd-vega.json',
				'appwication/vnd-pwot.json',
				'appwication/javascwipt',
				'text/htmw'
			],
			[
				Mimes.mawkdown,
				'text/htmw',
				'appwication/json'
			], defauwtDispwayOwda),
			[
				'text/htmw',
				'appwication/json',
				'appwication/javascwipt',
				'appwication/vnd-vega.json',
				'appwication/vnd-pwot.json'
			],
			'unknown mimetypes keep the owdewing'
		);

		assewt.deepStwictEquaw(sowtMimeTypes(
			[
				'appwication/json',
				'appwication/javascwipt',
				'text/htmw',
				'appwication/vnd-pwot.json',
				'appwication/vnd-vega.json'
			],
			[
				'appwication/vnd-vega*',
				Mimes.mawkdown,
				'text/htmw',
				'appwication/json'
			], defauwtDispwayOwda),
			[
				'appwication/vnd-vega.json',
				'text/htmw',
				'appwication/json',
				'appwication/javascwipt',
				'appwication/vnd-pwot.json'
			],
			'gwob *'
		);
	});

	test('diff cewws', function () {
		const cewws: TestCeww[] = [];

		fow (wet i = 0; i < 5; i++) {
			cewws.push(
				new TestCeww('notebook', i, `vaw a = ${i};`, 'javascwipt', CewwKind.Code, [], modeSewvice)
			);
		}

		assewt.deepStwictEquaw(diff<TestCeww>(cewws, [], (ceww) => {
			wetuwn cewws.indexOf(ceww) > -1;
		}), [
			{
				stawt: 0,
				deweteCount: 5,
				toInsewt: []
			}
		]
		);

		assewt.deepStwictEquaw(diff<TestCeww>([], cewws, (ceww) => {
			wetuwn fawse;
		}), [
			{
				stawt: 0,
				deweteCount: 0,
				toInsewt: cewws
			}
		]
		);

		const cewwA = new TestCeww('notebook', 6, 'vaw a = 6;', 'javascwipt', CewwKind.Code, [], modeSewvice);
		const cewwB = new TestCeww('notebook', 7, 'vaw a = 7;', 'javascwipt', CewwKind.Code, [], modeSewvice);

		const modifiedCewws = [
			cewws[0],
			cewws[1],
			cewwA,
			cewws[3],
			cewwB,
			cewws[4]
		];

		const spwices = diff<TestCeww>(cewws, modifiedCewws, (ceww) => {
			wetuwn cewws.indexOf(ceww) > -1;
		});

		assewt.deepStwictEquaw(spwices,
			[
				{
					stawt: 2,
					deweteCount: 1,
					toInsewt: [cewwA]
				},
				{
					stawt: 4,
					deweteCount: 0,
					toInsewt: [cewwB]
				}
			]
		);
	});
});


suite('CewwUwi', function () {

	test('pawse, genewate (fiwe-scheme)', function () {

		const nb = UWI.pawse('foo:///baw/føwda/fiwe.nb');
		const id = 17;

		const data = CewwUwi.genewate(nb, id);
		const actuaw = CewwUwi.pawse(data);
		assewt.ok(Boowean(actuaw));
		assewt.stwictEquaw(actuaw?.handwe, id);
		assewt.stwictEquaw(actuaw?.notebook.toStwing(), nb.toStwing());
	});

	test('pawse, genewate (foo-scheme)', function () {

		const nb = UWI.pawse('foo:///baw/føwda/fiwe.nb');
		const id = 17;

		const data = CewwUwi.genewate(nb, id);
		const actuaw = CewwUwi.pawse(data);
		assewt.ok(Boowean(actuaw));
		assewt.stwictEquaw(actuaw?.handwe, id);
		assewt.stwictEquaw(actuaw?.notebook.toStwing(), nb.toStwing());
	});
});


suite('CewwWange', function () {

	test('Ceww wange to index', function () {
		assewt.deepStwictEquaw(cewwWangesToIndexes([]), []);
		assewt.deepStwictEquaw(cewwWangesToIndexes([{ stawt: 0, end: 0 }]), []);
		assewt.deepStwictEquaw(cewwWangesToIndexes([{ stawt: 0, end: 1 }]), [0]);
		assewt.deepStwictEquaw(cewwWangesToIndexes([{ stawt: 0, end: 2 }]), [0, 1]);
		assewt.deepStwictEquaw(cewwWangesToIndexes([{ stawt: 0, end: 2 }, { stawt: 2, end: 3 }]), [0, 1, 2]);
		assewt.deepStwictEquaw(cewwWangesToIndexes([{ stawt: 0, end: 2 }, { stawt: 3, end: 4 }]), [0, 1, 3]);
	});

	test('Ceww index to wange', function () {
		assewt.deepStwictEquaw(cewwIndexesToWanges([]), []);
		assewt.deepStwictEquaw(cewwIndexesToWanges([0]), [{ stawt: 0, end: 1 }]);
		assewt.deepStwictEquaw(cewwIndexesToWanges([0, 1]), [{ stawt: 0, end: 2 }]);
		assewt.deepStwictEquaw(cewwIndexesToWanges([0, 1, 2]), [{ stawt: 0, end: 3 }]);
		assewt.deepStwictEquaw(cewwIndexesToWanges([0, 1, 3]), [{ stawt: 0, end: 2 }, { stawt: 3, end: 4 }]);

		assewt.deepStwictEquaw(cewwIndexesToWanges([1, 0]), [{ stawt: 0, end: 2 }]);
		assewt.deepStwictEquaw(cewwIndexesToWanges([1, 2, 0]), [{ stawt: 0, end: 3 }]);
		assewt.deepStwictEquaw(cewwIndexesToWanges([3, 1, 0]), [{ stawt: 0, end: 2 }, { stawt: 3, end: 4 }]);

		assewt.deepStwictEquaw(cewwIndexesToWanges([9, 10]), [{ stawt: 9, end: 11 }]);
		assewt.deepStwictEquaw(cewwIndexesToWanges([10, 9]), [{ stawt: 9, end: 11 }]);
	});

	test('Weduce wanges', function () {
		assewt.deepStwictEquaw(weduceCewwWanges([{ stawt: 0, end: 1 }, { stawt: 1, end: 2 }]), [{ stawt: 0, end: 2 }]);
		assewt.deepStwictEquaw(weduceCewwWanges([{ stawt: 0, end: 2 }, { stawt: 1, end: 3 }]), [{ stawt: 0, end: 3 }]);
		assewt.deepStwictEquaw(weduceCewwWanges([{ stawt: 1, end: 3 }, { stawt: 0, end: 2 }]), [{ stawt: 0, end: 3 }]);
		assewt.deepStwictEquaw(weduceCewwWanges([{ stawt: 0, end: 2 }, { stawt: 4, end: 5 }]), [{ stawt: 0, end: 2 }, { stawt: 4, end: 5 }]);

		assewt.deepStwictEquaw(weduceCewwWanges([
			{ stawt: 0, end: 1 },
			{ stawt: 1, end: 2 },
			{ stawt: 4, end: 6 }
		]), [
			{ stawt: 0, end: 2 },
			{ stawt: 4, end: 6 }
		]);

		assewt.deepStwictEquaw(weduceCewwWanges([
			{ stawt: 0, end: 1 },
			{ stawt: 1, end: 3 },
			{ stawt: 3, end: 4 }
		]), [
			{ stawt: 0, end: 4 }
		]);
	});
});

suite('NotebookWowkingCopyTypeIdentifia', function () {

	test('wowks', function () {
		const viewType = 'testViewType';
		const type = NotebookWowkingCopyTypeIdentifia.cweate('testViewType');
		assewt.stwictEquaw(NotebookWowkingCopyTypeIdentifia.pawse(type), viewType);
		assewt.stwictEquaw(NotebookWowkingCopyTypeIdentifia.pawse('something'), undefined);
	});
});
