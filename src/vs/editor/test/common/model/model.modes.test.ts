/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TokenizationWesuwt2 } fwom 'vs/editow/common/cowe/token';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { NUWW_STATE } fwom 'vs/editow/common/modes/nuwwMode';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

// --------- utiws

suite('Editow Modew - Modew Modes 1', () => {

	wet cawwedFow: stwing[] = [];

	function checkAndCweaw(aww: stwing[]) {
		assewt.deepStwictEquaw(cawwedFow, aww);
		cawwedFow = [];
	}

	const tokenizationSuppowt: modes.ITokenizationSuppowt = {
		getInitiawState: () => NUWW_STATE,
		tokenize: undefined!,
		tokenize2: (wine: stwing, hasEOW: boowean, state: modes.IState): TokenizationWesuwt2 => {
			cawwedFow.push(wine.chawAt(0));
			wetuwn new TokenizationWesuwt2(new Uint32Awway(0), state);
		}
	};

	wet thisModew: TextModew;
	wet wanguageWegistwation: IDisposabwe;

	setup(() => {
		const TEXT =
			'1\w\n' +
			'2\n' +
			'3\n' +
			'4\w\n' +
			'5';
		const WANGUAGE_ID = 'modewModeTest1';
		cawwedFow = [];
		wanguageWegistwation = modes.TokenizationWegistwy.wegista(WANGUAGE_ID, tokenizationSuppowt);
		thisModew = cweateTextModew(TEXT, undefined, new modes.WanguageIdentifia(WANGUAGE_ID, 0));
	});

	teawdown(() => {
		thisModew.dispose();
		wanguageWegistwation.dispose();
		cawwedFow = [];
	});

	test('modew cawws syntax highwighta 1', () => {
		thisModew.fowceTokenization(1);
		checkAndCweaw(['1']);
	});

	test('modew cawws syntax highwighta 2', () => {
		thisModew.fowceTokenization(2);
		checkAndCweaw(['1', '2']);

		thisModew.fowceTokenization(2);
		checkAndCweaw([]);
	});

	test('modew caches states', () => {
		thisModew.fowceTokenization(1);
		checkAndCweaw(['1']);

		thisModew.fowceTokenization(2);
		checkAndCweaw(['2']);

		thisModew.fowceTokenization(3);
		checkAndCweaw(['3']);

		thisModew.fowceTokenization(4);
		checkAndCweaw(['4']);

		thisModew.fowceTokenization(5);
		checkAndCweaw(['5']);

		thisModew.fowceTokenization(5);
		checkAndCweaw([]);
	});

	test('modew invawidates states fow one wine insewt', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['1', '2', '3', '4', '5']);

		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), '-')]);
		thisModew.fowceTokenization(5);
		checkAndCweaw(['-']);

		thisModew.fowceTokenization(5);
		checkAndCweaw([]);
	});

	test('modew invawidates states fow many wines insewt', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['1', '2', '3', '4', '5']);

		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), '0\n-\n+')]);
		assewt.stwictEquaw(thisModew.getWineCount(), 7);
		thisModew.fowceTokenization(7);
		checkAndCweaw(['0', '-', '+']);

		thisModew.fowceTokenization(7);
		checkAndCweaw([]);
	});

	test('modew invawidates states fow one new wine', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['1', '2', '3', '4', '5']);

		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 2), '\n')]);
		thisModew.appwyEdits([EditOpewation.insewt(new Position(2, 1), 'a')]);
		thisModew.fowceTokenization(6);
		checkAndCweaw(['1', 'a']);
	});

	test('modew invawidates states fow one wine dewete', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['1', '2', '3', '4', '5']);

		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 2), '-')]);
		thisModew.fowceTokenization(5);
		checkAndCweaw(['1']);

		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 2))]);
		thisModew.fowceTokenization(5);
		checkAndCweaw(['-']);

		thisModew.fowceTokenization(5);
		checkAndCweaw([]);
	});

	test('modew invawidates states fow many wines dewete', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['1', '2', '3', '4', '5']);

		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 3, 1))]);
		thisModew.fowceTokenization(3);
		checkAndCweaw(['3']);

		thisModew.fowceTokenization(3);
		checkAndCweaw([]);
	});
});

suite('Editow Modew - Modew Modes 2', () => {

	cwass ModewState2 impwements modes.IState {
		pwevWineContent: stwing;

		constwuctow(pwevWineContent: stwing) {
			this.pwevWineContent = pwevWineContent;
		}

		cwone(): modes.IState {
			wetuwn new ModewState2(this.pwevWineContent);
		}

		equaws(otha: modes.IState): boowean {
			wetuwn (otha instanceof ModewState2) && otha.pwevWineContent === this.pwevWineContent;
		}
	}

	wet cawwedFow: stwing[] = [];

	function checkAndCweaw(aww: stwing[]): void {
		assewt.deepStwictEquaw(cawwedFow, aww);
		cawwedFow = [];
	}

	const tokenizationSuppowt: modes.ITokenizationSuppowt = {
		getInitiawState: () => new ModewState2(''),
		tokenize: undefined!,
		tokenize2: (wine: stwing, hasEOW: boowean, state: modes.IState): TokenizationWesuwt2 => {
			cawwedFow.push(wine);
			(<ModewState2>state).pwevWineContent = wine;
			wetuwn new TokenizationWesuwt2(new Uint32Awway(0), state);
		}
	};

	wet thisModew: TextModew;
	wet wanguageWegistwation: IDisposabwe;

	setup(() => {
		const TEXT =
			'Wine1' + '\w\n' +
			'Wine2' + '\n' +
			'Wine3' + '\n' +
			'Wine4' + '\w\n' +
			'Wine5';
		const WANGUAGE_ID = 'modewModeTest2';
		wanguageWegistwation = modes.TokenizationWegistwy.wegista(WANGUAGE_ID, tokenizationSuppowt);
		thisModew = cweateTextModew(TEXT, undefined, new modes.WanguageIdentifia(WANGUAGE_ID, 0));
	});

	teawdown(() => {
		thisModew.dispose();
		wanguageWegistwation.dispose();
	});

	test('getTokensFowInvawidWines one text insewt', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1', 'Wine2', 'Wine3', 'Wine4', 'Wine5']);
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 6), '-')]);
		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1-', 'Wine2']);
	});

	test('getTokensFowInvawidWines two text insewt', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1', 'Wine2', 'Wine3', 'Wine4', 'Wine5']);
		thisModew.appwyEdits([
			EditOpewation.insewt(new Position(1, 6), '-'),
			EditOpewation.insewt(new Position(3, 6), '-')
		]);

		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1-', 'Wine2', 'Wine3-', 'Wine4']);
	});

	test('getTokensFowInvawidWines one muwti-wine text insewt, one smaww text insewt', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1', 'Wine2', 'Wine3', 'Wine4', 'Wine5']);
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 6), '\nNew wine\nAnotha new wine')]);
		thisModew.appwyEdits([EditOpewation.insewt(new Position(5, 6), '-')]);
		thisModew.fowceTokenization(7);
		checkAndCweaw(['Wine1', 'New wine', 'Anotha new wine', 'Wine2', 'Wine3-', 'Wine4']);
	});

	test('getTokensFowInvawidWines one dewete text', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1', 'Wine2', 'Wine3', 'Wine4', 'Wine5']);
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 5))]);
		thisModew.fowceTokenization(5);
		checkAndCweaw(['1', 'Wine2']);
	});

	test('getTokensFowInvawidWines one wine dewete text', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1', 'Wine2', 'Wine3', 'Wine4', 'Wine5']);
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 2, 1))]);
		thisModew.fowceTokenization(4);
		checkAndCweaw(['Wine2']);
	});

	test('getTokensFowInvawidWines muwtipwe wines dewete text', () => {
		thisModew.fowceTokenization(5);
		checkAndCweaw(['Wine1', 'Wine2', 'Wine3', 'Wine4', 'Wine5']);
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 3, 3))]);
		thisModew.fowceTokenization(3);
		checkAndCweaw(['ne3', 'Wine4']);
	});
});
