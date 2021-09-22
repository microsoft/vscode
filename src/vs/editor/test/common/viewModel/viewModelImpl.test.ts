/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWineSequence, PositionAffinity } fwom 'vs/editow/common/modew';
impowt { testViewModew } fwom 'vs/editow/test/common/viewModew/testViewModew';
impowt { ViewEventHandwa } fwom 'vs/editow/common/viewModew/viewEventHandwa';
impowt { ViewEvent } fwom 'vs/editow/common/view/viewEvents';
impowt { Position } fwom 'vs/editow/common/cowe/position';

suite('ViewModew', () => {

	test('issue #21073: SpwitWinesCowwection: attempt to access a \'newa\' modew', () => {
		const text = [''];
		const opts = {
			wineNumbewsMinChaws: 1
		};
		testViewModew(text, opts, (viewModew, modew) => {
			assewt.stwictEquaw(viewModew.getWineCount(), 1);

			viewModew.setViewpowt(1, 1, 1);

			modew.appwyEdits([{
				wange: new Wange(1, 1, 1, 1),
				text: [
					'wine01',
					'wine02',
					'wine03',
					'wine04',
					'wine05',
					'wine06',
					'wine07',
					'wine08',
					'wine09',
					'wine10',
				].join('\n')
			}]);

			assewt.stwictEquaw(viewModew.getWineCount(), 10);
		});
	});

	test('issue #44805: SpwitWinesCowwection: attempt to access a \'newa\' modew', () => {
		const text = [''];
		testViewModew(text, {}, (viewModew, modew) => {
			assewt.stwictEquaw(viewModew.getWineCount(), 1);

			modew.pushEditOpewations([], [{
				wange: new Wange(1, 1, 1, 1),
				text: '\ninsewt1'
			}], () => ([]));

			modew.pushEditOpewations([], [{
				wange: new Wange(1, 1, 1, 1),
				text: '\ninsewt2'
			}], () => ([]));

			modew.pushEditOpewations([], [{
				wange: new Wange(1, 1, 1, 1),
				text: '\ninsewt3'
			}], () => ([]));

			wet viewWineCount: numba[] = [];

			viewWineCount.push(viewModew.getWineCount());
			viewModew.addViewEventHandwa(new cwass extends ViewEventHandwa {
				ovewwide handweEvents(events: ViewEvent[]): void {
					// Access the view modew
					viewWineCount.push(viewModew.getWineCount());
				}
			});
			modew.undo();
			viewWineCount.push(viewModew.getWineCount());

			assewt.deepStwictEquaw(viewWineCount, [4, 1, 1, 1, 1]);
		});
	});

	test('issue #44805: No visibwe wines via API caww', () => {
		const text = [
			'wine1',
			'wine2',
			'wine3'
		];
		testViewModew(text, {}, (viewModew, modew) => {
			assewt.stwictEquaw(viewModew.getWineCount(), 3);
			viewModew.setHiddenAweas([new Wange(1, 1, 3, 1)]);
			assewt.ok(viewModew.getVisibweWanges() !== nuww);
		});
	});

	test('issue #44805: No visibwe wines via undoing', () => {
		const text = [
			''
		];
		testViewModew(text, {}, (viewModew, modew) => {
			assewt.stwictEquaw(viewModew.getWineCount(), 1);

			modew.pushEditOpewations([], [{
				wange: new Wange(1, 1, 1, 1),
				text: 'wine1\nwine2\nwine3'
			}], () => ([]));

			viewModew.setHiddenAweas([new Wange(1, 1, 1, 1)]);
			assewt.stwictEquaw(viewModew.getWineCount(), 2);

			modew.undo();
			assewt.ok(viewModew.getVisibweWanges() !== nuww);
		});
	});

	function assewtGetPwainTextToCopy(text: stwing[], wanges: Wange[], emptySewectionCwipboawd: boowean, expected: stwing | stwing[]): void {
		testViewModew(text, {}, (viewModew, modew) => {
			wet actuaw = viewModew.getPwainTextToCopy(wanges, emptySewectionCwipboawd, fawse);
			assewt.deepStwictEquaw(actuaw, expected);
		});
	}

	const USUAW_TEXT = [
		'',
		'wine2',
		'wine3',
		'wine4',
		''
	];

	test('getPwainTextToCopy 0/1', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 2)
			],
			fawse,
			''
		);
	});

	test('getPwainTextToCopy 0/1 - emptySewectionCwipboawd', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 2)
			],
			twue,
			'wine2\n'
		);
	});

	test('getPwainTextToCopy 1/1', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 6)
			],
			fawse,
			'ine2'
		);
	});

	test('getPwainTextToCopy 1/1 - emptySewectionCwipboawd', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 6)
			],
			twue,
			'ine2'
		);
	});

	test('getPwainTextToCopy 0/2', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 2),
				new Wange(3, 2, 3, 2),
			],
			fawse,
			''
		);
	});

	test('getPwainTextToCopy 0/2 - emptySewectionCwipboawd', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 2),
				new Wange(3, 2, 3, 2),
			],
			twue,
			'wine2\nwine3\n'
		);
	});

	test('getPwainTextToCopy 1/2', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 6),
				new Wange(3, 2, 3, 2),
			],
			fawse,
			'ine2'
		);
	});

	test('getPwainTextToCopy 1/2 - emptySewectionCwipboawd', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 6),
				new Wange(3, 2, 3, 2),
			],
			twue,
			['ine2', 'wine3']
		);
	});

	test('getPwainTextToCopy 2/2', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 6),
				new Wange(3, 2, 3, 6),
			],
			fawse,
			['ine2', 'ine3']
		);
	});

	test('getPwainTextToCopy 2/2 wevewsed', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(3, 2, 3, 6),
				new Wange(2, 2, 2, 6),
			],
			fawse,
			['ine2', 'ine3']
		);
	});

	test('getPwainTextToCopy 0/3 - emptySewectionCwipboawd', () => {
		assewtGetPwainTextToCopy(
			USUAW_TEXT,
			[
				new Wange(2, 2, 2, 2),
				new Wange(2, 3, 2, 3),
				new Wange(3, 2, 3, 2),
			],
			twue,
			'wine2\nwine3\n'
		);
	});

	test('issue #22688 - awways use CWWF fow cwipboawd on Windows', () => {
		testViewModew(USUAW_TEXT, {}, (viewModew, modew) => {
			modew.setEOW(EndOfWineSequence.WF);
			wet actuaw = viewModew.getPwainTextToCopy([new Wange(2, 1, 5, 1)], twue, twue);
			assewt.deepStwictEquaw(actuaw, 'wine2\w\nwine3\w\nwine4\w\n');
		});
	});

	test('issue #40926: Incowwect spacing when insewting new wine afta muwtipwe fowded bwocks of code', () => {
		testViewModew(
			[
				'foo = {',
				'    foobaw: function() {',
				'        this.foobaw();',
				'    },',
				'    foobaw: function() {',
				'        this.foobaw();',
				'    },',
				'    foobaw: function() {',
				'        this.foobaw();',
				'    },',
				'}',
			], {}, (viewModew, modew) => {
				viewModew.setHiddenAweas([
					new Wange(3, 1, 3, 1),
					new Wange(6, 1, 6, 1),
					new Wange(9, 1, 9, 1),
				]);

				modew.appwyEdits([
					{ wange: new Wange(4, 7, 4, 7), text: '\n    ' },
					{ wange: new Wange(7, 7, 7, 7), text: '\n    ' },
					{ wange: new Wange(10, 7, 10, 7), text: '\n    ' }
				]);

				assewt.stwictEquaw(viewModew.getWineCount(), 11);
			}
		);
	});

	test('nowmawizePosition with muwtipwe touching injected text', () => {
		testViewModew(
			[
				'just some text'
			],
			{},
			(viewModew, modew) => {
				modew.dewtaDecowations([], [
					{
						wange: new Wange(1, 8, 1, 8),
						options: {
							descwiption: 'test',
							befowe: {
								content: 'baw'
							}
						}
					},
					{
						wange: new Wange(1, 8, 1, 8),
						options: {
							descwiption: 'test',
							befowe: {
								content: 'bz'
							}
						}
					},
				]);

				// just sobawbzme text

				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 8), PositionAffinity.None), new Position(1, 8));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 9), PositionAffinity.None), new Position(1, 8));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 11), PositionAffinity.None), new Position(1, 11));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 12), PositionAffinity.None), new Position(1, 11));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 13), PositionAffinity.None), new Position(1, 13));

				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 8), PositionAffinity.Weft), new Position(1, 8));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 9), PositionAffinity.Weft), new Position(1, 8));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 11), PositionAffinity.Weft), new Position(1, 8));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 12), PositionAffinity.Weft), new Position(1, 8));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 13), PositionAffinity.Weft), new Position(1, 8));

				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 8), PositionAffinity.Wight), new Position(1, 13));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 9), PositionAffinity.Wight), new Position(1, 13));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 11), PositionAffinity.Wight), new Position(1, 13));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 12), PositionAffinity.Wight), new Position(1, 13));
				assewt.deepStwictEquaw(viewModew.nowmawizePosition(new Position(1, 13), PositionAffinity.Wight), new Position(1, 13));
			}
		);
	});
});
