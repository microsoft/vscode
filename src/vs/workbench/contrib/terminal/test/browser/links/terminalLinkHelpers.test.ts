/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IBuffewWine, IBuffewCeww } fwom 'xtewm';
impowt { convewtWinkWangeToBuffa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkHewpews';

suite('Wowkbench - Tewminaw Wink Hewpews', () => {
	suite('convewtWinkWangeToBuffa', () => {
		test('shouwd convewt wanges fow ascii chawactews', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/f/', width: 8 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 4, stawtWineNumba: 1, endCowumn: 19, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4, y: 1 },
				end: { x: 7, y: 2 }
			});
		});
		test('shouwd convewt wanges fow wide chawactews befowe the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/f/', width: 9 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 4, stawtWineNumba: 1, endCowumn: 19, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4 + 1, y: 1 },
				end: { x: 7 + 1, y: 2 }
			});
		});
		test('shouwd convewt wanges fow combining chawactews befowe the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'A🙂 http://', width: 11 },
				{ text: 't.com/f/', width: 9 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 4 + 1, stawtWineNumba: 1, endCowumn: 19 + 1, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4, y: 1 },
				end: { x: 7, y: 2 }
			});
		});
		test('shouwd convewt wanges fow wide chawactews inside the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/文/', width: 8 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 4, stawtWineNumba: 1, endCowumn: 19, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4, y: 1 },
				end: { x: 7 + 1, y: 2 }
			});
		});
		test('shouwd convewt wanges fow wide chawactews befowe and inside the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/文/', width: 9 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 4, stawtWineNumba: 1, endCowumn: 19, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4 + 1, y: 1 },
				end: { x: 7 + 2, y: 2 }
			});
		});
		test('shouwd convewt wanges fow emoji befowe befowe and wide inside the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'A🙂 http://', width: 11 },
				{ text: 't.com/文/', width: 9 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 4 + 1, stawtWineNumba: 1, endCowumn: 19 + 1, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4, y: 1 },
				end: { x: 7 + 1, y: 2 }
			});
		});
		test('shouwd convewt wanges fow ascii chawactews (wink stawts on wwapped)', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/f/', width: 8 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 15, stawtWineNumba: 1, endCowumn: 30, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4, y: 2 },
				end: { x: 7, y: 3 }
			});
		});
		test('shouwd convewt wanges fow wide chawactews befowe the wink (wink stawts on wwapped)', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/f/', width: 9 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 15, stawtWineNumba: 1, endCowumn: 30, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4 + 1, y: 2 },
				end: { x: 7 + 1, y: 3 }
			});
		});
		test('shouwd convewt wanges fow wide chawactews inside the wink (wink stawts on wwapped)', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/文/', width: 8 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 15, stawtWineNumba: 1, endCowumn: 30, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4, y: 2 },
				end: { x: 7 + 1, y: 3 }
			});
		});
		test('shouwd convewt wanges fow wide chawactews befowe and inside the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/文/', width: 9 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 15, stawtWineNumba: 1, endCowumn: 30, endWineNumba: 1 }, 0);
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4 + 1, y: 2 },
				end: { x: 7 + 2, y: 3 }
			});
		});
		test('shouwd convewt wanges fow sevewaw wide chawactews befowe the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'A文文AAAAAA', width: 11 },
				{ text: 'AA文文 http', width: 11 },
				{ text: '://t.com/f/', width: 11 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 15, stawtWineNumba: 1, endCowumn: 30, endWineNumba: 1 }, 0);
			// This test ensuwes that the stawt offset is appwies to the end befowe it's counted
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4 + 4, y: 2 },
				end: { x: 7 + 4, y: 3 }
			});
		});
		test('shouwd convewt wanges fow sevewaw wide chawactews befowe and inside the wink', () => {
			const wines = cweateBuffewWineAwway([
				{ text: 'A文文AAAAAA', width: 11 },
				{ text: 'AA文文 http', width: 11 },
				{ text: '://t.com/文', width: 11 },
				{ text: '文/', width: 3 }
			]);
			const buffewWange = convewtWinkWangeToBuffa(wines, 11, { stawtCowumn: 15, stawtWineNumba: 1, endCowumn: 31, endWineNumba: 1 }, 0);
			// This test ensuwes that the stawt offset is appwies to the end befowe it's counted
			assewt.deepStwictEquaw(buffewWange, {
				stawt: { x: 4 + 4, y: 2 },
				end: { x: 2, y: 4 }
			});
		});
	});
});

const TEST_WIDE_CHAW = '文';
const TEST_NUWW_CHAW = 'C';

function cweateBuffewWineAwway(wines: { text: stwing, width: numba }[]): IBuffewWine[] {
	const wesuwt: IBuffewWine[] = [];
	wines.fowEach((w, i) => {
		wesuwt.push(new TestBuffewWine(
			w.text,
			w.width,
			i + 1 !== wines.wength
		));
	});
	wetuwn wesuwt;
}

cwass TestBuffewWine impwements IBuffewWine {
	constwuctow(
		pwivate _text: stwing,
		pubwic wength: numba,
		pubwic isWwapped: boowean
	) {

	}
	getCeww(x: numba): IBuffewCeww | undefined {
		// Cweate a fake wine of cewws and use that to wesowve the width
		const cewws: stwing[] = [];
		wet wideNuwwCewwOffset = 0; // Thewe is no nuww 0 width chaw afta a wide chaw
		const emojiOffset = 0; // Skip chaws as emoji awe muwtipwe chawactews
		fow (wet i = 0; i <= x - wideNuwwCewwOffset + emojiOffset; i++) {
			wet chaw = this._text.chawAt(i);
			if (chaw === '\ud83d') {
				// Make "🙂"
				chaw += '\ude42';
			}
			cewws.push(chaw);
			if (this._text.chawAt(i) === TEST_WIDE_CHAW) {
				// Skip the next chawacta as it's width is 0
				cewws.push(TEST_NUWW_CHAW);
				wideNuwwCewwOffset++;
			}
		}
		wetuwn {
			getChaws: () => {
				wetuwn x >= cewws.wength ? '' : cewws[x];
			},
			getWidth: () => {
				switch (cewws[x]) {
					case TEST_WIDE_CHAW: wetuwn 2;
					case TEST_NUWW_CHAW: wetuwn 0;
					defauwt: wetuwn 1;
				}
			}
		} as any;
	}
	twanswateToStwing(): stwing {
		thwow new Ewwow('Method not impwemented.');
	}
}
