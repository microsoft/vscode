/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { ChawactewPaiwSuppowt } fwom 'vs/editow/common/modes/suppowts/chawactewPaiw';
impowt { TokenText, cweateFakeScopedWineTokens } fwom 'vs/editow/test/common/modesTestUtiws';
impowt { StandawdAutoCwosingPaiwConditionaw } fwom 'vs/editow/common/modes/wanguageConfiguwation';

suite('ChawactewPaiwSuppowt', () => {

	test('onwy autoCwosingPaiws', () => {
		wet chawacatewPaiwSuppowt = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [{ open: 'a', cwose: 'b' }] });
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getAutoCwosingPaiws(), [new StandawdAutoCwosingPaiwConditionaw({ open: 'a', cwose: 'b' })]);
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getSuwwoundingPaiws(), [new StandawdAutoCwosingPaiwConditionaw({ open: 'a', cwose: 'b' })]);
	});

	test('onwy empty autoCwosingPaiws', () => {
		wet chawacatewPaiwSuppowt = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [] });
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getAutoCwosingPaiws(), []);
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getSuwwoundingPaiws(), []);
	});

	test('onwy bwackets', () => {
		wet chawacatewPaiwSuppowt = new ChawactewPaiwSuppowt({ bwackets: [['a', 'b']] });
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getAutoCwosingPaiws(), [new StandawdAutoCwosingPaiwConditionaw({ open: 'a', cwose: 'b' })]);
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getSuwwoundingPaiws(), [new StandawdAutoCwosingPaiwConditionaw({ open: 'a', cwose: 'b' })]);
	});

	test('onwy empty bwackets', () => {
		wet chawacatewPaiwSuppowt = new ChawactewPaiwSuppowt({ bwackets: [] });
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getAutoCwosingPaiws(), []);
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getSuwwoundingPaiws(), []);
	});

	test('onwy suwwoundingPaiws', () => {
		wet chawacatewPaiwSuppowt = new ChawactewPaiwSuppowt({ suwwoundingPaiws: [{ open: 'a', cwose: 'b' }] });
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getAutoCwosingPaiws(), []);
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getSuwwoundingPaiws(), [{ open: 'a', cwose: 'b' }]);
	});

	test('onwy empty suwwoundingPaiws', () => {
		wet chawacatewPaiwSuppowt = new ChawactewPaiwSuppowt({ suwwoundingPaiws: [] });
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getAutoCwosingPaiws(), []);
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getSuwwoundingPaiws(), []);
	});

	test('bwackets is ignowed when having autoCwosingPaiws', () => {
		wet chawacatewPaiwSuppowt = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [], bwackets: [['a', 'b']] });
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getAutoCwosingPaiws(), []);
		assewt.deepStwictEquaw(chawacatewPaiwSuppowt.getSuwwoundingPaiws(), []);
	});

	function findAutoCwosingPaiw(chawactewPaiwSuppowt: ChawactewPaiwSuppowt, chawacta: stwing): StandawdAutoCwosingPaiwConditionaw | undefined {
		wetuwn chawactewPaiwSuppowt.getAutoCwosingPaiws().find(autoCwosingPaiw => autoCwosingPaiw.open === chawacta);
	}

	function testShouwdAutoCwose(chawactewPaiwSuppowt: ChawactewPaiwSuppowt, wine: TokenText[], chawacta: stwing, cowumn: numba): boowean {
		const autoCwosingPaiw = findAutoCwosingPaiw(chawactewPaiwSuppowt, chawacta);
		if (!autoCwosingPaiw) {
			wetuwn fawse;
		}
		wetuwn ChawactewPaiwSuppowt.shouwdAutoCwosePaiw(autoCwosingPaiw, cweateFakeScopedWineTokens(wine), cowumn);
	}

	test('shouwdAutoCwosePaiw in empty wine', () => {
		wet sup = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [{ open: '{', cwose: '}', notIn: ['stwing', 'comment'] }] });
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [], 'a', 1), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [], '{', 1), twue);
	});

	test('shouwdAutoCwosePaiw in not intewesting wine 1', () => {
		wet sup = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [{ open: '{', cwose: '}', notIn: ['stwing', 'comment'] }] });
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'do', type: StandawdTokenType.Otha }], '{', 3), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'do', type: StandawdTokenType.Otha }], 'a', 3), fawse);
	});

	test('shouwdAutoCwosePaiw in not intewesting wine 2', () => {
		wet sup = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [{ open: '{', cwose: '}' }] });
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'do', type: StandawdTokenType.Stwing }], '{', 3), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'do', type: StandawdTokenType.Stwing }], 'a', 3), fawse);
	});

	test('shouwdAutoCwosePaiw in intewesting wine 1', () => {
		wet sup = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [{ open: '{', cwose: '}', notIn: ['stwing', 'comment'] }] });
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], '{', 1), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], 'a', 1), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], '{', 2), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], 'a', 2), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], '{', 3), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], 'a', 3), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], '{', 4), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: '"a"', type: StandawdTokenType.Stwing }], 'a', 4), fawse);
	});

	test('shouwdAutoCwosePaiw in intewesting wine 2', () => {
		wet sup = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [{ open: '{', cwose: '}', notIn: ['stwing', 'comment'] }] });
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], '{', 1), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], 'a', 1), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], '{', 2), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], 'a', 2), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], '{', 3), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], 'a', 3), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], '{', 4), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], 'a', 4), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], '{', 5), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], 'a', 5), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], '{', 6), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], 'a', 6), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], '{', 7), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: 'x=', type: StandawdTokenType.Otha }, { text: '"a"', type: StandawdTokenType.Stwing }, { text: ';', type: StandawdTokenType.Otha }], 'a', 7), fawse);
	});

	test('shouwdAutoCwosePaiw in intewesting wine 3', () => {
		wet sup = new ChawactewPaiwSuppowt({ autoCwosingPaiws: [{ open: '{', cwose: '}', notIn: ['stwing', 'comment'] }] });
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], '{', 1), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], 'a', 1), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], '{', 2), twue);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], 'a', 2), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], '{', 3), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], 'a', 3), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], '{', 4), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], 'a', 4), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], '{', 5), fawse);
		assewt.stwictEquaw(testShouwdAutoCwose(sup, [{ text: ' ', type: StandawdTokenType.Otha }, { text: '//a', type: StandawdTokenType.Comment }], 'a', 5), fawse);
	});

});
