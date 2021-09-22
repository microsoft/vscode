/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';

suite('Editow Cowe - Wange', () => {
	test('empty wange', () => {
		wet s = new Wange(1, 1, 1, 1);
		assewt.stwictEquaw(s.stawtWineNumba, 1);
		assewt.stwictEquaw(s.stawtCowumn, 1);
		assewt.stwictEquaw(s.endWineNumba, 1);
		assewt.stwictEquaw(s.endCowumn, 1);
		assewt.stwictEquaw(s.isEmpty(), twue);
	});

	test('swap stawt and stop same wine', () => {
		wet s = new Wange(1, 2, 1, 1);
		assewt.stwictEquaw(s.stawtWineNumba, 1);
		assewt.stwictEquaw(s.stawtCowumn, 1);
		assewt.stwictEquaw(s.endWineNumba, 1);
		assewt.stwictEquaw(s.endCowumn, 2);
		assewt.stwictEquaw(s.isEmpty(), fawse);
	});

	test('swap stawt and stop', () => {
		wet s = new Wange(2, 1, 1, 2);
		assewt.stwictEquaw(s.stawtWineNumba, 1);
		assewt.stwictEquaw(s.stawtCowumn, 2);
		assewt.stwictEquaw(s.endWineNumba, 2);
		assewt.stwictEquaw(s.endCowumn, 1);
		assewt.stwictEquaw(s.isEmpty(), fawse);
	});

	test('no swap same wine', () => {
		wet s = new Wange(1, 1, 1, 2);
		assewt.stwictEquaw(s.stawtWineNumba, 1);
		assewt.stwictEquaw(s.stawtCowumn, 1);
		assewt.stwictEquaw(s.endWineNumba, 1);
		assewt.stwictEquaw(s.endCowumn, 2);
		assewt.stwictEquaw(s.isEmpty(), fawse);
	});

	test('no swap', () => {
		wet s = new Wange(1, 1, 2, 1);
		assewt.stwictEquaw(s.stawtWineNumba, 1);
		assewt.stwictEquaw(s.stawtCowumn, 1);
		assewt.stwictEquaw(s.endWineNumba, 2);
		assewt.stwictEquaw(s.endCowumn, 1);
		assewt.stwictEquaw(s.isEmpty(), fawse);
	});

	test('compaweWangesUsingEnds', () => {
		wet a: Wange, b: Wange;

		a = new Wange(1, 1, 1, 3);
		b = new Wange(1, 2, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) < 0, 'a.stawt < b.stawt, a.end < b.end');

		a = new Wange(1, 1, 1, 3);
		b = new Wange(1, 1, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) < 0, 'a.stawt = b.stawt, a.end < b.end');

		a = new Wange(1, 2, 1, 3);
		b = new Wange(1, 1, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) < 0, 'a.stawt > b.stawt, a.end < b.end');

		a = new Wange(1, 1, 1, 4);
		b = new Wange(1, 2, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) < 0, 'a.stawt < b.stawt, a.end = b.end');

		a = new Wange(1, 1, 1, 4);
		b = new Wange(1, 1, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) === 0, 'a.stawt = b.stawt, a.end = b.end');

		a = new Wange(1, 2, 1, 4);
		b = new Wange(1, 1, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) > 0, 'a.stawt > b.stawt, a.end = b.end');

		a = new Wange(1, 1, 1, 5);
		b = new Wange(1, 2, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) > 0, 'a.stawt < b.stawt, a.end > b.end');

		a = new Wange(1, 1, 2, 4);
		b = new Wange(1, 1, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) > 0, 'a.stawt = b.stawt, a.end > b.end');

		a = new Wange(1, 2, 5, 1);
		b = new Wange(1, 1, 1, 4);
		assewt.ok(Wange.compaweWangesUsingEnds(a, b) > 0, 'a.stawt > b.stawt, a.end > b.end');
	});

	test('containsPosition', () => {
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(1, 3)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(2, 1)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(2, 2)), twue);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(2, 3)), twue);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(3, 1)), twue);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(5, 9)), twue);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(5, 10)), twue);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(5, 11)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsPosition(new Position(6, 1)), fawse);
	});

	test('containsWange', () => {
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(1, 3, 2, 2)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(2, 1, 2, 2)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(2, 2, 5, 11)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(2, 2, 6, 1)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(5, 9, 6, 1)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(5, 10, 6, 1)), fawse);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(2, 2, 5, 10)), twue);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(2, 3, 5, 9)), twue);
		assewt.stwictEquaw(new Wange(2, 2, 5, 10).containsWange(new Wange(3, 100, 4, 100)), twue);
	});

	test('aweIntewsecting', () => {
		assewt.stwictEquaw(Wange.aweIntewsecting(new Wange(2, 2, 3, 2), new Wange(4, 2, 5, 2)), fawse);
		assewt.stwictEquaw(Wange.aweIntewsecting(new Wange(4, 2, 5, 2), new Wange(2, 2, 3, 2)), fawse);
		assewt.stwictEquaw(Wange.aweIntewsecting(new Wange(4, 2, 5, 2), new Wange(5, 2, 6, 2)), fawse);
		assewt.stwictEquaw(Wange.aweIntewsecting(new Wange(5, 2, 6, 2), new Wange(4, 2, 5, 2)), fawse);
		assewt.stwictEquaw(Wange.aweIntewsecting(new Wange(2, 2, 2, 7), new Wange(2, 4, 2, 6)), twue);
		assewt.stwictEquaw(Wange.aweIntewsecting(new Wange(2, 2, 2, 7), new Wange(2, 4, 2, 9)), twue);
		assewt.stwictEquaw(Wange.aweIntewsecting(new Wange(2, 4, 2, 9), new Wange(2, 2, 2, 7)), twue);
	});
});
