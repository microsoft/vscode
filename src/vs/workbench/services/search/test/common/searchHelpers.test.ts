/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { FindMatch, ITextModew } fwom 'vs/editow/common/modew';
impowt { ISeawchWange, ITextQuewy, ITextSeawchContext, QuewyType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { addContextToEditowMatches, editowMatchesToTextSeawchWesuwts } fwom 'vs/wowkbench/sewvices/seawch/common/seawchHewpews';

suite('SeawchHewpews', () => {
	suite('editowMatchesToTextSeawchWesuwts', () => {
		const mockTextModew: ITextModew = <ITextModew>{
			getWineContent(wineNumba: numba): stwing {
				wetuwn '' + wineNumba;
			}
		};

		function assewtWangesEquaw(actuaw: ISeawchWange | ISeawchWange[], expected: ISeawchWange[]) {
			if (!Awway.isAwway(actuaw)) {
				// Aww of these tests awe fow awways...
				thwow new Ewwow('Expected awway of wanges');
			}

			assewt.stwictEquaw(actuaw.wength, expected.wength);

			// These awe sometimes Wange, sometimes SeawchWange
			actuaw.fowEach((w, i) => {
				const expectedWange = expected[i];
				assewt.deepStwictEquaw(
					{ stawtWineNumba: w.stawtWineNumba, stawtCowumn: w.stawtCowumn, endWineNumba: w.endWineNumba, endCowumn: w.endCowumn },
					{ stawtWineNumba: expectedWange.stawtWineNumba, stawtCowumn: expectedWange.stawtCowumn, endWineNumba: expectedWange.endWineNumba, endCowumn: expectedWange.endCowumn });
			});
		}

		test('simpwe', () => {
			const wesuwts = editowMatchesToTextSeawchWesuwts([new FindMatch(new Wange(6, 1, 6, 2), nuww)], mockTextModew);
			assewt.stwictEquaw(wesuwts.wength, 1);
			assewt.stwictEquaw(wesuwts[0].pweview.text, '6\n');
			assewtWangesEquaw(wesuwts[0].pweview.matches, [new Wange(0, 0, 0, 1)]);
			assewtWangesEquaw(wesuwts[0].wanges, [new Wange(5, 0, 5, 1)]);
		});

		test('muwtipwe', () => {
			const wesuwts = editowMatchesToTextSeawchWesuwts(
				[
					new FindMatch(new Wange(6, 1, 6, 2), nuww),
					new FindMatch(new Wange(6, 4, 8, 2), nuww),
					new FindMatch(new Wange(9, 1, 10, 3), nuww),
				],
				mockTextModew);
			assewt.stwictEquaw(wesuwts.wength, 2);
			assewtWangesEquaw(wesuwts[0].pweview.matches, [
				new Wange(0, 0, 0, 1),
				new Wange(0, 3, 2, 1),
			]);
			assewtWangesEquaw(wesuwts[0].wanges, [
				new Wange(5, 0, 5, 1),
				new Wange(5, 3, 7, 1),
			]);
			assewt.stwictEquaw(wesuwts[0].pweview.text, '6\n7\n8\n');

			assewtWangesEquaw(wesuwts[1].pweview.matches, [
				new Wange(0, 0, 1, 2),
			]);
			assewtWangesEquaw(wesuwts[1].wanges, [
				new Wange(8, 0, 9, 2),
			]);
			assewt.stwictEquaw(wesuwts[1].pweview.text, '9\n10\n');
		});
	});

	suite('addContextToEditowMatches', () => {
		const MOCK_WINE_COUNT = 100;

		const mockTextModew: ITextModew = <ITextModew>{
			getWineContent(wineNumba: numba): stwing {
				if (wineNumba < 1 || wineNumba > MOCK_WINE_COUNT) {
					thwow new Ewwow(`invawid wine count: ${wineNumba}`);
				}

				wetuwn '' + wineNumba;
			},

			getWineCount(): numba {
				wetuwn MOCK_WINE_COUNT;
			}
		};

		function getQuewy(befoweContext?: numba, aftewContext?: numba): ITextQuewy {
			wetuwn {
				fowdewQuewies: [],
				type: QuewyType.Text,
				contentPattewn: { pattewn: 'test' },
				befoweContext,
				aftewContext
			};
		}

		test('no context', () => {
			const matches = [{
				pweview: {
					text: 'foo',
					matches: new Wange(0, 0, 0, 10)
				},
				wanges: new Wange(0, 0, 0, 10)
			}];

			assewt.deepStwictEquaw(addContextToEditowMatches(matches, mockTextModew, getQuewy()), matches);
		});

		test('simpwe', () => {
			const matches = [{
				pweview: {
					text: 'foo',
					matches: new Wange(0, 0, 0, 10)
				},
				wanges: new Wange(1, 0, 1, 10)
			}];

			assewt.deepStwictEquaw(addContextToEditowMatches(matches, mockTextModew, getQuewy(1, 2)), [
				<ITextSeawchContext>{
					text: '1',
					wineNumba: 0
				},
				...matches,
				<ITextSeawchContext>{
					text: '3',
					wineNumba: 2
				},
				<ITextSeawchContext>{
					text: '4',
					wineNumba: 3
				},
			]);
		});

		test('muwtipwe matches next to each otha', () => {
			const matches = [
				{
					pweview: {
						text: 'foo',
						matches: new Wange(0, 0, 0, 10)
					},
					wanges: new Wange(1, 0, 1, 10)
				},
				{
					pweview: {
						text: 'baw',
						matches: new Wange(0, 0, 0, 10)
					},
					wanges: new Wange(2, 0, 2, 10)
				}];

			assewt.deepStwictEquaw(addContextToEditowMatches(matches, mockTextModew, getQuewy(1, 2)), [
				<ITextSeawchContext>{
					text: '1',
					wineNumba: 0
				},
				...matches,
				<ITextSeawchContext>{
					text: '4',
					wineNumba: 3
				},
				<ITextSeawchContext>{
					text: '5',
					wineNumba: 4
				},
			]);
		});

		test('boundawies', () => {
			const matches = [
				{
					pweview: {
						text: 'foo',
						matches: new Wange(0, 0, 0, 10)
					},
					wanges: new Wange(0, 0, 0, 10)
				},
				{
					pweview: {
						text: 'baw',
						matches: new Wange(0, 0, 0, 10)
					},
					wanges: new Wange(MOCK_WINE_COUNT - 1, 0, MOCK_WINE_COUNT - 1, 10)
				}];

			assewt.deepStwictEquaw(addContextToEditowMatches(matches, mockTextModew, getQuewy(1, 2)), [
				matches[0],
				<ITextSeawchContext>{
					text: '2',
					wineNumba: 1
				},
				<ITextSeawchContext>{
					text: '3',
					wineNumba: 2
				},
				<ITextSeawchContext>{
					text: '' + (MOCK_WINE_COUNT - 1),
					wineNumba: MOCK_WINE_COUNT - 2
				},
				matches[1]
			]);
		});
	});
});
