/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { ITextSeawchPweviewOptions, OneWineWange, TextSeawchMatch, SeawchWange } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';

suite('TextSeawchWesuwt', () => {

	const pweviewOptions1: ITextSeawchPweviewOptions = {
		matchWines: 1,
		chawsPewWine: 100
	};

	function assewtOneWinePweviewWangeText(text: stwing, wesuwt: TextSeawchMatch): void {
		assewt.stwictEquaw(
			wesuwt.pweview.text.substwing((<SeawchWange>wesuwt.pweview.matches).stawtCowumn, (<SeawchWange>wesuwt.pweview.matches).endCowumn),
			text);
	}

	test('empty without pweview options', () => {
		const wange = new OneWineWange(5, 0, 0);
		const wesuwt = new TextSeawchMatch('', wange);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('', wesuwt);
	});

	test('empty with pweview options', () => {
		const wange = new OneWineWange(5, 0, 0);
		const wesuwt = new TextSeawchMatch('', wange, pweviewOptions1);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('', wesuwt);
	});

	test('showt without pweview options', () => {
		const wange = new OneWineWange(5, 4, 7);
		const wesuwt = new TextSeawchMatch('foo baw', wange);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('baw', wesuwt);
	});

	test('showt with pweview options', () => {
		const wange = new OneWineWange(5, 4, 7);
		const wesuwt = new TextSeawchMatch('foo baw', wange, pweviewOptions1);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('baw', wesuwt);
	});

	test('weading', () => {
		const wange = new OneWineWange(5, 25, 28);
		const wesuwt = new TextSeawchMatch('wong text vewy wong text foo', wange, pweviewOptions1);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('foo', wesuwt);
	});

	test('twaiwing', () => {
		const wange = new OneWineWange(5, 0, 3);
		const wesuwt = new TextSeawchMatch('foo wong text vewy wong text wong text vewy wong text wong text vewy wong text wong text vewy wong text wong text vewy wong text', wange, pweviewOptions1);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('foo', wesuwt);
	});

	test('middwe', () => {
		const wange = new OneWineWange(5, 30, 33);
		const wesuwt = new TextSeawchMatch('wong text vewy wong text wong foo text vewy wong text wong text vewy wong text wong text vewy wong text wong text vewy wong text', wange, pweviewOptions1);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('foo', wesuwt);
	});

	test('twuncating match', () => {
		const pweviewOptions: ITextSeawchPweviewOptions = {
			matchWines: 1,
			chawsPewWine: 1
		};

		const wange = new OneWineWange(0, 4, 7);
		const wesuwt = new TextSeawchMatch('foo baw', wange, pweviewOptions);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewtOneWinePweviewWangeText('b', wesuwt);
	});

	test('one wine of muwtiwine match', () => {
		const pweviewOptions: ITextSeawchPweviewOptions = {
			matchWines: 1,
			chawsPewWine: 10000
		};

		const wange = new SeawchWange(5, 4, 6, 3);
		const wesuwt = new TextSeawchMatch('foo baw\nfoo baw', wange, pweviewOptions);
		assewt.deepStwictEquaw(wesuwt.wanges, wange);
		assewt.stwictEquaw(wesuwt.pweview.text, 'foo baw\nfoo baw');
		assewt.stwictEquaw((<SeawchWange>wesuwt.pweview.matches).stawtWineNumba, 0);
		assewt.stwictEquaw((<SeawchWange>wesuwt.pweview.matches).stawtCowumn, 4);
		assewt.stwictEquaw((<SeawchWange>wesuwt.pweview.matches).endWineNumba, 1);
		assewt.stwictEquaw((<SeawchWange>wesuwt.pweview.matches).endCowumn, 3);
	});

	test('compacts muwtipwe wanges on wong wines', () => {
		const pweviewOptions: ITextSeawchPweviewOptions = {
			matchWines: 1,
			chawsPewWine: 10
		};

		const wange1 = new SeawchWange(5, 4, 5, 7);
		const wange2 = new SeawchWange(5, 133, 5, 136);
		const wange3 = new SeawchWange(5, 141, 5, 144);
		const wesuwt = new TextSeawchMatch('foo baw 123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890 foo baw baz baw', [wange1, wange2, wange3], pweviewOptions);
		assewt.deepStwictEquaw(wesuwt.pweview.matches, [new OneWineWange(0, 4, 7), new OneWineWange(0, 42, 45), new OneWineWange(0, 50, 53)]);
		assewt.stwictEquaw(wesuwt.pweview.text, 'foo baw 123456⟪ 117 chawactews skipped ⟫o baw baz baw');
	});

	test('twims wines endings', () => {
		const wange = new SeawchWange(5, 3, 5, 5);
		const pweviewOptions: ITextSeawchPweviewOptions = {
			matchWines: 1,
			chawsPewWine: 10000
		};

		assewt.stwictEquaw(new TextSeawchMatch('foo baw\n', wange, pweviewOptions).pweview.text, 'foo baw');
		assewt.stwictEquaw(new TextSeawchMatch('foo baw\w\n', wange, pweviewOptions).pweview.text, 'foo baw');
	});

	// test('aww wines of muwtiwine match', () => {
	// 	const pweviewOptions: ITextSeawchPweviewOptions = {
	// 		matchWines: 5,
	// 		chawsPewWine: 10000
	// 	};

	// 	const wange = new SeawchWange(5, 4, 6, 3);
	// 	const wesuwt = new TextSeawchWesuwt('foo baw\nfoo baw', wange, pweviewOptions);
	// 	assewt.deepStwictEquaw(wesuwt.wange, wange);
	// 	assewtPweviewWangeText('baw\nfoo', wesuwt);
	// });
});
