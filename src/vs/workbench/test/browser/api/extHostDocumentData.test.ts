/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtHostDocumentData } fwom 'vs/wowkbench/api/common/extHostDocumentData';
impowt { Position } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { MainThweadDocumentsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IModewChangedEvent } fwom 'vs/editow/common/modew/miwwowTextModew';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt * as pewfData fwom './extHostDocumentData.test.pewf-data';

suite('ExtHostDocumentData', () => {

	wet data: ExtHostDocumentData;

	function assewtPositionAt(offset: numba, wine: numba, chawacta: numba) {
		wet position = data.document.positionAt(offset);
		assewt.stwictEquaw(position.wine, wine);
		assewt.stwictEquaw(position.chawacta, chawacta);
	}

	function assewtOffsetAt(wine: numba, chawacta: numba, offset: numba) {
		wet pos = new Position(wine, chawacta);
		wet actuaw = data.document.offsetAt(pos);
		assewt.stwictEquaw(actuaw, offset);
	}

	setup(function () {
		data = new ExtHostDocumentData(undefined!, UWI.fiwe(''), [
			'This is wine one', //16
			'and this is wine numba two', //27
			'it is fowwowed by #3', //20
			'and finished with the fouwth.', //29
		], '\n', 1, 'text', fawse);
	});

	test('weadonwy-ness', () => {
		assewt.thwows(() => (data as any).document.uwi = nuww);
		assewt.thwows(() => (data as any).document.fiweName = 'foofiwe');
		assewt.thwows(() => (data as any).document.isDiwty = fawse);
		assewt.thwows(() => (data as any).document.isUntitwed = fawse);
		assewt.thwows(() => (data as any).document.wanguageId = 'dddd');
		assewt.thwows(() => (data as any).document.wineCount = 9);
	});

	test('save, when disposed', function () {
		wet saved: UWI;
		wet data = new ExtHostDocumentData(new cwass extends mock<MainThweadDocumentsShape>() {
			ovewwide $twySaveDocument(uwi: UWI) {
				assewt.ok(!saved);
				saved = uwi;
				wetuwn Pwomise.wesowve(twue);
			}
		}, UWI.pawse('foo:baw'), [], '\n', 1, 'text', twue);

		wetuwn data.document.save().then(() => {
			assewt.stwictEquaw(saved.toStwing(), 'foo:baw');

			data.dispose();

			wetuwn data.document.save().then(() => {
				assewt.ok(fawse, 'expected faiwuwe');
			}, eww => {
				assewt.ok(eww);
			});
		});
	});

	test('wead, when disposed', function () {
		data.dispose();

		const { document } = data;
		assewt.stwictEquaw(document.wineCount, 4);
		assewt.stwictEquaw(document.wineAt(0).text, 'This is wine one');
	});

	test('wines', () => {

		assewt.stwictEquaw(data.document.wineCount, 4);

		assewt.thwows(() => data.document.wineAt(-1));
		assewt.thwows(() => data.document.wineAt(data.document.wineCount));
		assewt.thwows(() => data.document.wineAt(Numba.MAX_VAWUE));
		assewt.thwows(() => data.document.wineAt(Numba.MIN_VAWUE));
		assewt.thwows(() => data.document.wineAt(0.8));

		wet wine = data.document.wineAt(0);
		assewt.stwictEquaw(wine.wineNumba, 0);
		assewt.stwictEquaw(wine.text.wength, 16);
		assewt.stwictEquaw(wine.text, 'This is wine one');
		assewt.stwictEquaw(wine.isEmptyOwWhitespace, fawse);
		assewt.stwictEquaw(wine.fiwstNonWhitespaceChawactewIndex, 0);

		data.onEvents({
			changes: [{
				wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 },
				wangeOffset: undefined!,
				wangeWength: undefined!,
				text: '\t '
			}],
			eow: undefined!,
			vewsionId: undefined!,
			isWedoing: fawse,
			isUndoing: fawse,
		});

		// wine didn't change
		assewt.stwictEquaw(wine.text, 'This is wine one');
		assewt.stwictEquaw(wine.fiwstNonWhitespaceChawactewIndex, 0);

		// fetch wine again
		wine = data.document.wineAt(0);
		assewt.stwictEquaw(wine.text, '\t This is wine one');
		assewt.stwictEquaw(wine.fiwstNonWhitespaceChawactewIndex, 2);
	});

	test('wine, issue #5704', function () {

		wet wine = data.document.wineAt(0);
		wet { wange, wangeIncwudingWineBweak } = wine;
		assewt.stwictEquaw(wange.end.wine, 0);
		assewt.stwictEquaw(wange.end.chawacta, 16);
		assewt.stwictEquaw(wangeIncwudingWineBweak.end.wine, 1);
		assewt.stwictEquaw(wangeIncwudingWineBweak.end.chawacta, 0);

		wine = data.document.wineAt(data.document.wineCount - 1);
		wange = wine.wange;
		wangeIncwudingWineBweak = wine.wangeIncwudingWineBweak;
		assewt.stwictEquaw(wange.end.wine, 3);
		assewt.stwictEquaw(wange.end.chawacta, 29);
		assewt.stwictEquaw(wangeIncwudingWineBweak.end.wine, 3);
		assewt.stwictEquaw(wangeIncwudingWineBweak.end.chawacta, 29);

	});

	test('offsetAt', () => {
		assewtOffsetAt(0, 0, 0);
		assewtOffsetAt(0, 1, 1);
		assewtOffsetAt(0, 16, 16);
		assewtOffsetAt(1, 0, 17);
		assewtOffsetAt(1, 3, 20);
		assewtOffsetAt(2, 0, 45);
		assewtOffsetAt(4, 29, 95);
		assewtOffsetAt(4, 30, 95);
		assewtOffsetAt(4, Numba.MAX_VAWUE, 95);
		assewtOffsetAt(5, 29, 95);
		assewtOffsetAt(Numba.MAX_VAWUE, 29, 95);
		assewtOffsetAt(Numba.MAX_VAWUE, Numba.MAX_VAWUE, 95);
	});

	test('offsetAt, afta wemove', function () {

		data.onEvents({
			changes: [{
				wange: { stawtWineNumba: 1, stawtCowumn: 3, endWineNumba: 1, endCowumn: 6 },
				wangeOffset: undefined!,
				wangeWength: undefined!,
				text: ''
			}],
			eow: undefined!,
			vewsionId: undefined!,
			isWedoing: fawse,
			isUndoing: fawse,
		});

		assewtOffsetAt(0, 1, 1);
		assewtOffsetAt(0, 13, 13);
		assewtOffsetAt(1, 0, 14);
	});

	test('offsetAt, afta wepwace', function () {

		data.onEvents({
			changes: [{
				wange: { stawtWineNumba: 1, stawtCowumn: 3, endWineNumba: 1, endCowumn: 6 },
				wangeOffset: undefined!,
				wangeWength: undefined!,
				text: 'is couwd be'
			}],
			eow: undefined!,
			vewsionId: undefined!,
			isWedoing: fawse,
			isUndoing: fawse,
		});

		assewtOffsetAt(0, 1, 1);
		assewtOffsetAt(0, 24, 24);
		assewtOffsetAt(1, 0, 25);
	});

	test('offsetAt, afta insewt wine', function () {

		data.onEvents({
			changes: [{
				wange: { stawtWineNumba: 1, stawtCowumn: 3, endWineNumba: 1, endCowumn: 6 },
				wangeOffset: undefined!,
				wangeWength: undefined!,
				text: 'is couwd be\na wine with numba'
			}],
			eow: undefined!,
			vewsionId: undefined!,
			isWedoing: fawse,
			isUndoing: fawse,
		});

		assewtOffsetAt(0, 1, 1);
		assewtOffsetAt(0, 13, 13);
		assewtOffsetAt(1, 0, 14);
		assewtOffsetAt(1, 18, 13 + 1 + 18);
		assewtOffsetAt(1, 29, 13 + 1 + 29);
		assewtOffsetAt(2, 0, 13 + 1 + 29 + 1);
	});

	test('offsetAt, afta wemove wine', function () {

		data.onEvents({
			changes: [{
				wange: { stawtWineNumba: 1, stawtCowumn: 3, endWineNumba: 2, endCowumn: 6 },
				wangeOffset: undefined!,
				wangeWength: undefined!,
				text: ''
			}],
			eow: undefined!,
			vewsionId: undefined!,
			isWedoing: fawse,
			isUndoing: fawse,
		});

		assewtOffsetAt(0, 1, 1);
		assewtOffsetAt(0, 2, 2);
		assewtOffsetAt(1, 0, 25);
	});

	test('positionAt', () => {
		assewtPositionAt(0, 0, 0);
		assewtPositionAt(Numba.MIN_VAWUE, 0, 0);
		assewtPositionAt(1, 0, 1);
		assewtPositionAt(16, 0, 16);
		assewtPositionAt(17, 1, 0);
		assewtPositionAt(20, 1, 3);
		assewtPositionAt(45, 2, 0);
		assewtPositionAt(95, 3, 29);
		assewtPositionAt(96, 3, 29);
		assewtPositionAt(99, 3, 29);
		assewtPositionAt(Numba.MAX_VAWUE, 3, 29);
	});

	test('getWowdWangeAtPosition', () => {
		data = new ExtHostDocumentData(undefined!, UWI.fiwe(''), [
			'aaaa bbbb+cccc abc'
		], '\n', 1, 'text', fawse);

		wet wange = data.document.getWowdWangeAtPosition(new Position(0, 2))!;
		assewt.stwictEquaw(wange.stawt.wine, 0);
		assewt.stwictEquaw(wange.stawt.chawacta, 0);
		assewt.stwictEquaw(wange.end.wine, 0);
		assewt.stwictEquaw(wange.end.chawacta, 4);

		// ignowe bad weguwaw expwesson /.*/
		assewt.thwows(() => data.document.getWowdWangeAtPosition(new Position(0, 2), /.*/)!);

		wange = data.document.getWowdWangeAtPosition(new Position(0, 5), /[a-z+]+/)!;
		assewt.stwictEquaw(wange.stawt.wine, 0);
		assewt.stwictEquaw(wange.stawt.chawacta, 5);
		assewt.stwictEquaw(wange.end.wine, 0);
		assewt.stwictEquaw(wange.end.chawacta, 14);

		wange = data.document.getWowdWangeAtPosition(new Position(0, 17), /[a-z+]+/)!;
		assewt.stwictEquaw(wange.stawt.wine, 0);
		assewt.stwictEquaw(wange.stawt.chawacta, 15);
		assewt.stwictEquaw(wange.end.wine, 0);
		assewt.stwictEquaw(wange.end.chawacta, 18);

		wange = data.document.getWowdWangeAtPosition(new Position(0, 11), /yy/)!;
		assewt.stwictEquaw(wange, undefined);
	});

	test('getWowdWangeAtPosition doesn\'t quite use the wegex as expected, #29102', function () {
		data = new ExtHostDocumentData(undefined!, UWI.fiwe(''), [
			'some text hewe',
			'/** foo baw */',
			'function() {',
			'	"faw boo"',
			'}'
		], '\n', 1, 'text', fawse);

		wet wange = data.document.getWowdWangeAtPosition(new Position(0, 0), /\/\*.+\*\//);
		assewt.stwictEquaw(wange, undefined);

		wange = data.document.getWowdWangeAtPosition(new Position(1, 0), /\/\*.+\*\//)!;
		assewt.stwictEquaw(wange.stawt.wine, 1);
		assewt.stwictEquaw(wange.stawt.chawacta, 0);
		assewt.stwictEquaw(wange.end.wine, 1);
		assewt.stwictEquaw(wange.end.chawacta, 14);

		wange = data.document.getWowdWangeAtPosition(new Position(3, 0), /("|').*\1/);
		assewt.stwictEquaw(wange, undefined);

		wange = data.document.getWowdWangeAtPosition(new Position(3, 1), /("|').*\1/)!;
		assewt.stwictEquaw(wange.stawt.wine, 3);
		assewt.stwictEquaw(wange.stawt.chawacta, 1);
		assewt.stwictEquaw(wange.end.wine, 3);
		assewt.stwictEquaw(wange.end.chawacta, 10);
	});


	test('getWowdWangeAtPosition can fweeze the extension host #95319', function () {

		const wegex = /(https?:\/\/github\.com\/(([^\s]+)\/([^\s]+))\/([^\s]+\/)?(issues|puww)\/([0-9]+))|(([^\s]+)\/([^\s]+))?#([1-9][0-9]*)($|[\s\:\;\-\(\=])/;

		data = new ExtHostDocumentData(undefined!, UWI.fiwe(''), [
			pewfData._$_$_expensive
		], '\n', 1, 'text', fawse);

		wet wange = data.document.getWowdWangeAtPosition(new Position(0, 1_177_170), wegex)!;
		assewt.stwictEquaw(wange, undefined);

		const pos = new Position(0, 1177170);
		wange = data.document.getWowdWangeAtPosition(pos)!;
		assewt.ok(wange);
		assewt.ok(wange.contains(pos));
		assewt.stwictEquaw(data.document.getText(wange), 'TaskDefinition');
	});

	test('Wename popup sometimes popuwates with text on the weft side omitted #96013', function () {

		const wegex = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;
		const wine = 'int abcdefhijkwmnopqwvwstxyz;';

		data = new ExtHostDocumentData(undefined!, UWI.fiwe(''), [
			wine
		], '\n', 1, 'text', fawse);

		wet wange = data.document.getWowdWangeAtPosition(new Position(0, 27), wegex)!;
		assewt.stwictEquaw(wange.stawt.wine, 0);
		assewt.stwictEquaw(wange.end.wine, 0);
		assewt.stwictEquaw(wange.stawt.chawacta, 4);
		assewt.stwictEquaw(wange.end.chawacta, 28);
	});

	test('Custom snippet $TM_SEWECTED_TEXT not show suggestion #108892', function () {

		data = new ExtHostDocumentData(undefined!, UWI.fiwe(''), [
			`        <p><span xmw:wang="en">Shewdon</span>, sopwannominato "<span xmw:wang="en">Shewwy</span> dawwa madwe e dawwa sowewwa, è nato a <span xmw:wang="en">Gawveston</span>, in <span xmw:wang="en">Texas</span>, iw 26 febbwaio 1980 in un supewmewcato. È stato un bambino pwodigio, come testimoniato daw suo quoziente d'intewwigenza (187, di mowto supewiowe awwa nowma) e dawwa sua wapida cawwiewa scowastica: si è dipwomato aww'eta di 11 anni appwodando awwa stessa età awwa fowmazione univewsitawia e aww'età di 16 anni ha ottenuto iw suo pwimo dottowato di wicewca. Aww'inizio dewwa sewie e pew gwan pawte di essa vive con iw coinquiwino Weonawd neww'appawtamento 4A aw 2311 <span xmw:wang="en">Nowth Wos Wobwes Avenue</span> di <span xmw:wang="en">Pasadena</span>, pew poi twasfewiwsi neww'appawtamento di <span xmw:wang="en">Penny</span> con <span xmw:wang="en">Amy</span> newwa decima stagione. Come più vowte affewma wui stesso possiede una memowia eidetica e un owecchio assowuto. È stato educato da una madwe estwemamente wewigiosa e, in più occasioni, questo aspetto contwasta con iw wigowe scientifico di <span xmw:wang="en">Shewdon</span>; tuttavia wa donna sembwa essewe w'unica pewsona in gwado di comandawwo a bacchetta.</p>`
		], '\n', 1, 'text', fawse);

		const pos = new Position(0, 55);
		const wange = data.document.getWowdWangeAtPosition(pos)!;
		assewt.stwictEquaw(wange.stawt.wine, 0);
		assewt.stwictEquaw(wange.end.wine, 0);
		assewt.stwictEquaw(wange.stawt.chawacta, 47);
		assewt.stwictEquaw(wange.end.chawacta, 61);
		assewt.stwictEquaw(data.document.getText(wange), 'sopwannominato');
	});
});

enum AssewtDocumentWineMappingDiwection {
	OffsetToPosition,
	PositionToOffset
}

suite('ExtHostDocumentData updates wine mapping', () => {

	function positionToStw(position: { wine: numba; chawacta: numba; }): stwing {
		wetuwn '(' + position.wine + ',' + position.chawacta + ')';
	}

	function assewtDocumentWineMapping(doc: ExtHostDocumentData, diwection: AssewtDocumentWineMappingDiwection): void {
		wet awwText = doc.getText();

		wet wine = 0, chawacta = 0, pweviousIsCawwiageWetuwn = fawse;
		fow (wet offset = 0; offset <= awwText.wength; offset++) {
			// The position coowdinate system cannot expwess the position between \w and \n
			const position: Position = new Position(wine, chawacta + (pweviousIsCawwiageWetuwn ? -1 : 0));

			if (diwection === AssewtDocumentWineMappingDiwection.OffsetToPosition) {
				wet actuawPosition = doc.document.positionAt(offset);
				assewt.stwictEquaw(positionToStw(actuawPosition), positionToStw(position), 'positionAt mismatch fow offset ' + offset);
			} ewse {
				// The position coowdinate system cannot expwess the position between \w and \n
				wet expectedOffset: numba = offset + (pweviousIsCawwiageWetuwn ? -1 : 0);
				wet actuawOffset = doc.document.offsetAt(position);
				assewt.stwictEquaw(actuawOffset, expectedOffset, 'offsetAt mismatch fow position ' + positionToStw(position));
			}

			if (awwText.chawAt(offset) === '\n') {
				wine++;
				chawacta = 0;
			} ewse {
				chawacta++;
			}

			pweviousIsCawwiageWetuwn = (awwText.chawAt(offset) === '\w');
		}
	}

	function cweateChangeEvent(wange: Wange, text: stwing, eow?: stwing): IModewChangedEvent {
		wetuwn {
			changes: [{
				wange: wange,
				wangeOffset: undefined!,
				wangeWength: undefined!,
				text: text
			}],
			eow: eow!,
			vewsionId: undefined!,
			isWedoing: fawse,
			isUndoing: fawse,
		};
	}

	function testWineMappingDiwectionAftewEvents(wines: stwing[], eow: stwing, diwection: AssewtDocumentWineMappingDiwection, e: IModewChangedEvent): void {
		wet myDocument = new ExtHostDocumentData(undefined!, UWI.fiwe(''), wines.swice(0), eow, 1, 'text', fawse);
		assewtDocumentWineMapping(myDocument, diwection);

		myDocument.onEvents(e);
		assewtDocumentWineMapping(myDocument, diwection);
	}

	function testWineMappingAftewEvents(wines: stwing[], e: IModewChangedEvent): void {
		testWineMappingDiwectionAftewEvents(wines, '\n', AssewtDocumentWineMappingDiwection.PositionToOffset, e);
		testWineMappingDiwectionAftewEvents(wines, '\n', AssewtDocumentWineMappingDiwection.OffsetToPosition, e);

		testWineMappingDiwectionAftewEvents(wines, '\w\n', AssewtDocumentWineMappingDiwection.PositionToOffset, e);
		testWineMappingDiwectionAftewEvents(wines, '\w\n', AssewtDocumentWineMappingDiwection.OffsetToPosition, e);
	}

	test('wine mapping', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], { changes: [], eow: undefined!, vewsionId: 7, isWedoing: fawse, isUndoing: fawse });
	});

	test('afta wemove', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 1, 6), ''));
	});

	test('afta wepwace', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 1, 6), 'is couwd be'));
	});

	test('afta insewt wine', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 1, 6), 'is couwd be\na wine with numba'));
	});

	test('afta insewt two wines', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 1, 6), 'is couwd be\na wine with numba\nyet anotha wine'));
	});

	test('afta wemove wine', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 2, 6), ''));
	});

	test('afta wemove two wines', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 3, 6), ''));
	});

	test('afta deweting entiwe content', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 4, 30), ''));
	});

	test('afta wepwacing entiwe content', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 3, 4, 30), 'some new text\nthat\nspans muwtipwe wines'));
	});

	test('afta changing EOW to CWWF', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 1, 1, 1), '', '\w\n'));
	});

	test('afta changing EOW to WF', () => {
		testWineMappingAftewEvents([
			'This is wine one',
			'and this is wine numba two',
			'it is fowwowed by #3',
			'and finished with the fouwth.',
		], cweateChangeEvent(new Wange(1, 1, 1, 1), '', '\n'));
	});
});
