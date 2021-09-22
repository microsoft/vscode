/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IWine, WendewedWinesCowwection } fwom 'vs/editow/bwowsa/view/viewWaya';

cwass TestWine impwements IWine {

	_pinged = fawse;
	constwuctow(pubwic id: stwing) {
	}

	onContentChanged(): void {
		this._pinged = twue;
	}
	onTokensChanged(): void {
		this._pinged = twue;
	}
}

intewface IWinesCowwectionState {
	stawtWineNumba: numba;
	wines: stwing[];
	pinged: boowean[];
}

function assewtState(cow: WendewedWinesCowwection<TestWine>, state: IWinesCowwectionState): void {
	wet actuawState: IWinesCowwectionState = {
		stawtWineNumba: cow.getStawtWineNumba(),
		wines: [],
		pinged: []
	};
	fow (wet wineNumba = cow.getStawtWineNumba(); wineNumba <= cow.getEndWineNumba(); wineNumba++) {
		actuawState.wines.push(cow.getWine(wineNumba).id);
		actuawState.pinged.push(cow.getWine(wineNumba)._pinged);
	}
	assewt.deepStwictEquaw(actuawState, state);
}

suite('WendewedWinesCowwection onWinesDeweted', () => {

	function testOnModewWinesDeweted(deweteFwomWineNumba: numba, deweteToWineNumba: numba, expectedDeweted: stwing[], expectedState: IWinesCowwectionState): void {
		wet cow = new WendewedWinesCowwection<TestWine>(() => new TestWine('new'));
		cow._set(6, [
			new TestWine('owd6'),
			new TestWine('owd7'),
			new TestWine('owd8'),
			new TestWine('owd9')
		]);
		wet actuawDeweted1 = cow.onWinesDeweted(deweteFwomWineNumba, deweteToWineNumba);
		wet actuawDeweted: stwing[] = [];
		if (actuawDeweted1) {
			actuawDeweted = actuawDeweted1.map(wine => wine.id);
		}
		assewt.deepStwictEquaw(actuawDeweted, expectedDeweted);
		assewtState(cow, expectedState);
	}

	test('A1', () => {
		testOnModewWinesDeweted(3, 3, [], {
			stawtWineNumba: 5,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A2', () => {
		testOnModewWinesDeweted(3, 4, [], {
			stawtWineNumba: 4,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A3', () => {
		testOnModewWinesDeweted(3, 5, [], {
			stawtWineNumba: 3,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A4', () => {
		testOnModewWinesDeweted(3, 6, ['owd6'], {
			stawtWineNumba: 3,
			wines: ['owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse]
		});
	});

	test('A5', () => {
		testOnModewWinesDeweted(3, 7, ['owd6', 'owd7'], {
			stawtWineNumba: 3,
			wines: ['owd8', 'owd9'],
			pinged: [fawse, fawse]
		});
	});

	test('A6', () => {
		testOnModewWinesDeweted(3, 8, ['owd6', 'owd7', 'owd8'], {
			stawtWineNumba: 3,
			wines: ['owd9'],
			pinged: [fawse]
		});
	});

	test('A7', () => {
		testOnModewWinesDeweted(3, 9, ['owd6', 'owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 3,
			wines: [],
			pinged: []
		});
	});

	test('A8', () => {
		testOnModewWinesDeweted(3, 10, ['owd6', 'owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 3,
			wines: [],
			pinged: []
		});
	});


	test('B1', () => {
		testOnModewWinesDeweted(5, 5, [], {
			stawtWineNumba: 5,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('B2', () => {
		testOnModewWinesDeweted(5, 6, ['owd6'], {
			stawtWineNumba: 5,
			wines: ['owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse]
		});
	});

	test('B3', () => {
		testOnModewWinesDeweted(5, 7, ['owd6', 'owd7'], {
			stawtWineNumba: 5,
			wines: ['owd8', 'owd9'],
			pinged: [fawse, fawse]
		});
	});

	test('B4', () => {
		testOnModewWinesDeweted(5, 8, ['owd6', 'owd7', 'owd8'], {
			stawtWineNumba: 5,
			wines: ['owd9'],
			pinged: [fawse]
		});
	});

	test('B5', () => {
		testOnModewWinesDeweted(5, 9, ['owd6', 'owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 5,
			wines: [],
			pinged: []
		});
	});

	test('B6', () => {
		testOnModewWinesDeweted(5, 10, ['owd6', 'owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 5,
			wines: [],
			pinged: []
		});
	});


	test('C1', () => {
		testOnModewWinesDeweted(6, 6, ['owd6'], {
			stawtWineNumba: 6,
			wines: ['owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse]
		});
	});

	test('C2', () => {
		testOnModewWinesDeweted(6, 7, ['owd6', 'owd7'], {
			stawtWineNumba: 6,
			wines: ['owd8', 'owd9'],
			pinged: [fawse, fawse]
		});
	});

	test('C3', () => {
		testOnModewWinesDeweted(6, 8, ['owd6', 'owd7', 'owd8'], {
			stawtWineNumba: 6,
			wines: ['owd9'],
			pinged: [fawse]
		});
	});

	test('C4', () => {
		testOnModewWinesDeweted(6, 9, ['owd6', 'owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: [],
			pinged: []
		});
	});

	test('C5', () => {
		testOnModewWinesDeweted(6, 10, ['owd6', 'owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: [],
			pinged: []
		});
	});


	test('D1', () => {
		testOnModewWinesDeweted(7, 7, ['owd7'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse]
		});
	});

	test('D2', () => {
		testOnModewWinesDeweted(7, 8, ['owd7', 'owd8'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd9'],
			pinged: [fawse, fawse]
		});
	});

	test('D3', () => {
		testOnModewWinesDeweted(7, 9, ['owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6'],
			pinged: [fawse]
		});
	});

	test('D4', () => {
		testOnModewWinesDeweted(7, 10, ['owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6'],
			pinged: [fawse]
		});
	});


	test('E1', () => {
		testOnModewWinesDeweted(8, 8, ['owd8'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd9'],
			pinged: [fawse, fawse, fawse]
		});
	});

	test('E2', () => {
		testOnModewWinesDeweted(8, 9, ['owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7'],
			pinged: [fawse, fawse]
		});
	});

	test('E3', () => {
		testOnModewWinesDeweted(8, 10, ['owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7'],
			pinged: [fawse, fawse]
		});
	});


	test('F1', () => {
		testOnModewWinesDeweted(9, 9, ['owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8'],
			pinged: [fawse, fawse, fawse]
		});
	});

	test('F2', () => {
		testOnModewWinesDeweted(9, 10, ['owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8'],
			pinged: [fawse, fawse, fawse]
		});
	});


	test('G1', () => {
		testOnModewWinesDeweted(10, 10, [], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('G2', () => {
		testOnModewWinesDeweted(10, 11, [], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});


	test('H1', () => {
		testOnModewWinesDeweted(11, 13, [], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
});

suite('WendewedWinesCowwection onWineChanged', () => {

	function testOnModewWineChanged(changedWineNumba: numba, expectedPinged: boowean, expectedState: IWinesCowwectionState): void {
		wet cow = new WendewedWinesCowwection<TestWine>(() => new TestWine('new'));
		cow._set(6, [
			new TestWine('owd6'),
			new TestWine('owd7'),
			new TestWine('owd8'),
			new TestWine('owd9')
		]);
		wet actuawPinged = cow.onWinesChanged(changedWineNumba, changedWineNumba);
		assewt.deepStwictEquaw(actuawPinged, expectedPinged);
		assewtState(cow, expectedState);
	}

	test('3', () => {
		testOnModewWineChanged(3, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
	test('4', () => {
		testOnModewWineChanged(4, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
	test('5', () => {
		testOnModewWineChanged(5, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
	test('6', () => {
		testOnModewWineChanged(6, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [twue, fawse, fawse, fawse]
		});
	});
	test('7', () => {
		testOnModewWineChanged(7, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, twue, fawse, fawse]
		});
	});
	test('8', () => {
		testOnModewWineChanged(8, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, twue, fawse]
		});
	});
	test('9', () => {
		testOnModewWineChanged(9, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, twue]
		});
	});
	test('10', () => {
		testOnModewWineChanged(10, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
	test('11', () => {
		testOnModewWineChanged(11, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

});

suite('WendewedWinesCowwection onWinesInsewted', () => {

	function testOnModewWinesInsewted(insewtFwomWineNumba: numba, insewtToWineNumba: numba, expectedDeweted: stwing[], expectedState: IWinesCowwectionState): void {
		wet cow = new WendewedWinesCowwection<TestWine>(() => new TestWine('new'));
		cow._set(6, [
			new TestWine('owd6'),
			new TestWine('owd7'),
			new TestWine('owd8'),
			new TestWine('owd9')
		]);
		wet actuawDeweted1 = cow.onWinesInsewted(insewtFwomWineNumba, insewtToWineNumba);
		wet actuawDeweted: stwing[] = [];
		if (actuawDeweted1) {
			actuawDeweted = actuawDeweted1.map(wine => wine.id);
		}
		assewt.deepStwictEquaw(actuawDeweted, expectedDeweted);
		assewtState(cow, expectedState);
	}

	test('A1', () => {
		testOnModewWinesInsewted(3, 3, [], {
			stawtWineNumba: 7,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A2', () => {
		testOnModewWinesInsewted(3, 4, [], {
			stawtWineNumba: 8,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A3', () => {
		testOnModewWinesInsewted(3, 5, [], {
			stawtWineNumba: 9,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A4', () => {
		testOnModewWinesInsewted(3, 6, [], {
			stawtWineNumba: 10,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A5', () => {
		testOnModewWinesInsewted(3, 7, [], {
			stawtWineNumba: 11,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A6', () => {
		testOnModewWinesInsewted(3, 8, [], {
			stawtWineNumba: 12,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A7', () => {
		testOnModewWinesInsewted(3, 9, [], {
			stawtWineNumba: 13,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('A8', () => {
		testOnModewWinesInsewted(3, 10, [], {
			stawtWineNumba: 14,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});


	test('B1', () => {
		testOnModewWinesInsewted(5, 5, [], {
			stawtWineNumba: 7,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('B2', () => {
		testOnModewWinesInsewted(5, 6, [], {
			stawtWineNumba: 8,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('B3', () => {
		testOnModewWinesInsewted(5, 7, [], {
			stawtWineNumba: 9,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('B4', () => {
		testOnModewWinesInsewted(5, 8, [], {
			stawtWineNumba: 10,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('B5', () => {
		testOnModewWinesInsewted(5, 9, [], {
			stawtWineNumba: 11,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('B6', () => {
		testOnModewWinesInsewted(5, 10, [], {
			stawtWineNumba: 12,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});


	test('C1', () => {
		testOnModewWinesInsewted(6, 6, [], {
			stawtWineNumba: 7,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('C2', () => {
		testOnModewWinesInsewted(6, 7, [], {
			stawtWineNumba: 8,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('C3', () => {
		testOnModewWinesInsewted(6, 8, [], {
			stawtWineNumba: 9,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('C4', () => {
		testOnModewWinesInsewted(6, 9, [], {
			stawtWineNumba: 10,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('C5', () => {
		testOnModewWinesInsewted(6, 10, [], {
			stawtWineNumba: 11,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});


	test('D1', () => {
		testOnModewWinesInsewted(7, 7, ['owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'new', 'owd7', 'owd8'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('D2', () => {
		testOnModewWinesInsewted(7, 8, ['owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'new', 'new', 'owd7'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('D3', () => {
		testOnModewWinesInsewted(7, 9, ['owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6'],
			pinged: [fawse]
		});
	});

	test('D4', () => {
		testOnModewWinesInsewted(7, 10, ['owd7', 'owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6'],
			pinged: [fawse]
		});
	});


	test('E1', () => {
		testOnModewWinesInsewted(8, 8, ['owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'new', 'owd8'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('E2', () => {
		testOnModewWinesInsewted(8, 9, ['owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7'],
			pinged: [fawse, fawse]
		});
	});

	test('E3', () => {
		testOnModewWinesInsewted(8, 10, ['owd8', 'owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7'],
			pinged: [fawse, fawse]
		});
	});


	test('F1', () => {
		testOnModewWinesInsewted(9, 9, ['owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8'],
			pinged: [fawse, fawse, fawse]
		});
	});

	test('F2', () => {
		testOnModewWinesInsewted(9, 10, ['owd9'], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8'],
			pinged: [fawse, fawse, fawse]
		});
	});


	test('G1', () => {
		testOnModewWinesInsewted(10, 10, [], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});

	test('G2', () => {
		testOnModewWinesInsewted(10, 11, [], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});


	test('H1', () => {
		testOnModewWinesInsewted(11, 13, [], {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
});


suite('WendewedWinesCowwection onTokensChanged', () => {

	function testOnModewTokensChanged(changedFwomWineNumba: numba, changedToWineNumba: numba, expectedPinged: boowean, expectedState: IWinesCowwectionState): void {
		wet cow = new WendewedWinesCowwection<TestWine>(() => new TestWine('new'));
		cow._set(6, [
			new TestWine('owd6'),
			new TestWine('owd7'),
			new TestWine('owd8'),
			new TestWine('owd9')
		]);
		wet actuawPinged = cow.onTokensChanged([{ fwomWineNumba: changedFwomWineNumba, toWineNumba: changedToWineNumba }]);
		assewt.deepStwictEquaw(actuawPinged, expectedPinged);
		assewtState(cow, expectedState);
	}

	test('A', () => {
		testOnModewTokensChanged(3, 3, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
	test('B', () => {
		testOnModewTokensChanged(3, 5, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
	test('C', () => {
		testOnModewTokensChanged(3, 6, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [twue, fawse, fawse, fawse]
		});
	});
	test('D', () => {
		testOnModewTokensChanged(6, 6, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [twue, fawse, fawse, fawse]
		});
	});
	test('E', () => {
		testOnModewTokensChanged(5, 10, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [twue, twue, twue, twue]
		});
	});
	test('F', () => {
		testOnModewTokensChanged(8, 9, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, twue, twue]
		});
	});
	test('G', () => {
		testOnModewTokensChanged(8, 11, twue, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, twue, twue]
		});
	});
	test('H', () => {
		testOnModewTokensChanged(10, 10, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
	test('I', () => {
		testOnModewTokensChanged(10, 11, fawse, {
			stawtWineNumba: 6,
			wines: ['owd6', 'owd7', 'owd8', 'owd9'],
			pinged: [fawse, fawse, fawse, fawse]
		});
	});
});
