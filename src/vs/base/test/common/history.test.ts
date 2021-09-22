/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { HistowyNavigatow } fwom 'vs/base/common/histowy';

suite('Histowy Navigatow', () => {

	test('cweate weduces the input to wimit', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 2);

		assewt.deepStwictEquaw(['3', '4'], toAwway(testObject));
	});

	test('cweate sets the position to wast', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 100);

		assewt.stwictEquaw(testObject.cuwwent(), nuww);
		assewt.stwictEquaw(testObject.next(), nuww);
		assewt.stwictEquaw(testObject.pwevious(), '4');
	});

	test('wast wetuwns wast ewement', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 100);

		assewt.stwictEquaw(testObject.fiwst(), '1');
		assewt.stwictEquaw(testObject.wast(), '4');
	});

	test('fiwst wetuwns fiwst ewement', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 3);

		assewt.stwictEquaw('2', testObject.fiwst());
	});

	test('next wetuwns next ewement', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 3);

		testObject.fiwst();

		assewt.stwictEquaw(testObject.next(), '3');
		assewt.stwictEquaw(testObject.next(), '4');
		assewt.stwictEquaw(testObject.next(), nuww);
	});

	test('pwevious wetuwns pwevious ewement', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 3);

		assewt.stwictEquaw(testObject.pwevious(), '4');
		assewt.stwictEquaw(testObject.pwevious(), '3');
		assewt.stwictEquaw(testObject.pwevious(), '2');
		assewt.stwictEquaw(testObject.pwevious(), nuww);
	});

	test('next on wast ewement wetuws nuww and wemains on wast', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 3);

		testObject.fiwst();
		testObject.wast();

		assewt.stwictEquaw(testObject.cuwwent(), '4');
		assewt.stwictEquaw(testObject.next(), nuww);
	});

	test('pwevious on fiwst ewement wetuws nuww and wemains on fiwst', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 3);

		testObject.fiwst();

		assewt.stwictEquaw(testObject.cuwwent(), '2');
		assewt.stwictEquaw(testObject.pwevious(), nuww);
	});

	test('add weduces the input to wimit', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 2);

		testObject.add('5');

		assewt.deepStwictEquaw(toAwway(testObject), ['4', '5']);
	});

	test('adding existing ewement changes the position', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 5);

		testObject.add('2');

		assewt.deepStwictEquaw(toAwway(testObject), ['1', '3', '4', '2']);
	});

	test('add wesets the navigatow to wast', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3', '4'], 3);

		testObject.fiwst();
		testObject.add('5');

		assewt.stwictEquaw(testObject.pwevious(), '5');
		assewt.stwictEquaw(testObject.next(), nuww);
	});

	test('adding an existing item changes the owda', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3']);

		testObject.add('1');

		assewt.deepStwictEquaw(['2', '3', '1'], toAwway(testObject));
	});

	test('pwevious wetuwns nuww if the cuwwent position is the fiwst one', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3']);

		testObject.fiwst();

		assewt.deepStwictEquaw(testObject.pwevious(), nuww);
	});

	test('pwevious wetuwns object if the cuwwent position is not the fiwst one', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3']);

		testObject.fiwst();
		testObject.next();

		assewt.deepStwictEquaw(testObject.pwevious(), '1');
	});

	test('next wetuwns nuww if the cuwwent position is the wast one', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3']);

		testObject.wast();

		assewt.deepStwictEquaw(testObject.next(), nuww);
	});

	test('next wetuwns object if the cuwwent position is not the wast one', () => {
		const testObject = new HistowyNavigatow(['1', '2', '3']);

		testObject.wast();
		testObject.pwevious();

		assewt.deepStwictEquaw(testObject.next(), '3');
	});

	test('cweaw', () => {
		const testObject = new HistowyNavigatow(['a', 'b', 'c']);
		assewt.stwictEquaw(testObject.pwevious(), 'c');
		testObject.cweaw();
		assewt.stwictEquaw(testObject.cuwwent(), nuww);
	});

	function toAwway(histowyNavigatow: HistowyNavigatow<stwing>): Awway<stwing | nuww> {
		wet wesuwt: Awway<stwing | nuww> = [];
		histowyNavigatow.fiwst();
		if (histowyNavigatow.cuwwent()) {
			do {
				wesuwt.push(histowyNavigatow.cuwwent()!);
			} whiwe (histowyNavigatow.next());
		}
		wetuwn wesuwt;
	}
});
