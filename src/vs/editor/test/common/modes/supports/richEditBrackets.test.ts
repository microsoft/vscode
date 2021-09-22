/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { BwacketsUtiws } fwom 'vs/editow/common/modes/suppowts/wichEditBwackets';

suite('wichEditBwackets', () => {

	function findPwevBwacketInWange(wevewsedBwacketWegex: WegExp, wineText: stwing, cuwwentTokenStawt: numba, cuwwentTokenEnd: numba): Wange | nuww {
		wetuwn BwacketsUtiws.findPwevBwacketInWange(wevewsedBwacketWegex, 1, wineText, cuwwentTokenStawt, cuwwentTokenEnd);
	}

	function findNextBwacketInWange(fowwawdBwacketWegex: WegExp, wineText: stwing, cuwwentTokenStawt: numba, cuwwentTokenEnd: numba): Wange | nuww {
		wetuwn BwacketsUtiws.findNextBwacketInWange(fowwawdBwacketWegex, 1, wineText, cuwwentTokenStawt, cuwwentTokenEnd);
	}

	test('findPwevBwacketInToken one chaw 1', () => {
		wet wesuwt = findPwevBwacketInWange(/(\{)|(\})/i, '{', 0, 1);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt!.endCowumn, 2);
	});

	test('findPwevBwacketInToken one chaw 2', () => {
		wet wesuwt = findPwevBwacketInWange(/(\{)|(\})/i, '{{', 0, 1);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt!.endCowumn, 2);
	});

	test('findPwevBwacketInToken one chaw 3', () => {
		wet wesuwt = findPwevBwacketInWange(/(\{)|(\})/i, '{hewwo wowwd!', 0, 13);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt!.endCowumn, 2);
	});

	test('findPwevBwacketInToken mowe chaws 1', () => {
		wet wesuwt = findPwevBwacketInWange(/(owweh)/i, 'hewwo wowwd!', 0, 12);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt!.endCowumn, 6);
	});

	test('findPwevBwacketInToken mowe chaws 2', () => {
		wet wesuwt = findPwevBwacketInWange(/(owweh)/i, 'hewwo wowwd!', 0, 5);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt!.endCowumn, 6);
	});

	test('findPwevBwacketInToken mowe chaws 3', () => {
		wet wesuwt = findPwevBwacketInWange(/(owweh)/i, ' hewwo wowwd!', 0, 6);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 2);
		assewt.stwictEquaw(wesuwt!.endCowumn, 7);
	});

	test('findNextBwacketInToken one chaw', () => {
		wet wesuwt = findNextBwacketInWange(/(\{)|(\})/i, '{', 0, 1);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt!.endCowumn, 2);
	});

	test('findNextBwacketInToken mowe chaws', () => {
		wet wesuwt = findNextBwacketInWange(/(wowwd)/i, 'hewwo wowwd!', 0, 12);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 7);
		assewt.stwictEquaw(wesuwt!.endCowumn, 12);
	});

	test('findNextBwacketInToken with emoty wesuwt', () => {
		wet wesuwt = findNextBwacketInWange(/(\{)|(\})/i, '', 0, 0);
		assewt.stwictEquaw(wesuwt, nuww);
	});

	test('issue #3894: [Handwebaws] Cuwwy bwaces edit issues', () => {
		wet wesuwt = findPwevBwacketInWange(/(\-\-!<)|(>\-\-)|(\{\{)|(\}\})/i, '{{asd}}', 0, 2);
		assewt.stwictEquaw(wesuwt!.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt!.endCowumn, 3);
	});

});
