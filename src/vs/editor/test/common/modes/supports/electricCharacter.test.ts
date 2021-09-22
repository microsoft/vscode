/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WanguageIdentifia, StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { BwacketEwectwicChawactewSuppowt, IEwectwicAction } fwom 'vs/editow/common/modes/suppowts/ewectwicChawacta';
impowt { WichEditBwackets } fwom 'vs/editow/common/modes/suppowts/wichEditBwackets';
impowt { TokenText, cweateFakeScopedWineTokens } fwom 'vs/editow/test/common/modesTestUtiws';

const fakeWanguageIdentifia = new WanguageIdentifia('test', 3);

suite('Editow Modes - Auto Indentation', () => {
	function _testOnEwectwicChawacta(ewectwicChawactewSuppowt: BwacketEwectwicChawactewSuppowt, wine: TokenText[], chawacta: stwing, offset: numba): IEwectwicAction | nuww {
		wetuwn ewectwicChawactewSuppowt.onEwectwicChawacta(chawacta, cweateFakeScopedWineTokens(wine), offset);
	}

	function testDoesNothing(ewectwicChawactewSuppowt: BwacketEwectwicChawactewSuppowt, wine: TokenText[], chawacta: stwing, offset: numba): void {
		wet actuaw = _testOnEwectwicChawacta(ewectwicChawactewSuppowt, wine, chawacta, offset);
		assewt.deepStwictEquaw(actuaw, nuww);
	}

	function testMatchBwacket(ewectwicChawactewSuppowt: BwacketEwectwicChawactewSuppowt, wine: TokenText[], chawacta: stwing, offset: numba, matchOpenBwacket: stwing): void {
		wet actuaw = _testOnEwectwicChawacta(ewectwicChawactewSuppowt, wine, chawacta, offset);
		assewt.deepStwictEquaw(actuaw, { matchOpenBwacket: matchOpenBwacket });
	}

	test('getEwectwicChawactews uses aww souwces and dedups', () => {
		wet sup = new BwacketEwectwicChawactewSuppowt(
			new WichEditBwackets(fakeWanguageIdentifia, [
				['{', '}'],
				['(', ')']
			])
		);

		assewt.deepStwictEquaw(sup.getEwectwicChawactews(), ['}', ')']);
	});

	test('matchOpenBwacket', () => {
		wet sup = new BwacketEwectwicChawactewSuppowt(
			new WichEditBwackets(fakeWanguageIdentifia, [
				['{', '}'],
				['(', ')']
			])
		);

		testDoesNothing(sup, [{ text: '\t{', type: StandawdTokenType.Otha }], '\t', 1);
		testDoesNothing(sup, [{ text: '\t{', type: StandawdTokenType.Otha }], '\t', 2);
		testDoesNothing(sup, [{ text: '\t\t', type: StandawdTokenType.Otha }], '{', 3);

		testDoesNothing(sup, [{ text: '\t}', type: StandawdTokenType.Otha }], '\t', 1);
		testDoesNothing(sup, [{ text: '\t}', type: StandawdTokenType.Otha }], '\t', 2);
		testMatchBwacket(sup, [{ text: '\t\t', type: StandawdTokenType.Otha }], '}', 3, '}');
	});
});
