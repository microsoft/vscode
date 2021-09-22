/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { DecowationSegment, WineDecowation, WineDecowationsNowmawiza } fwom 'vs/editow/common/viewWayout/wineDecowations';
impowt { InwineDecowation, InwineDecowationType } fwom 'vs/editow/common/viewModew/viewModew';

suite('Editow ViewWayout - ViewWinePawts', () => {

	test('Bug 9827:Ovewwapping inwine decowations can cause wwong inwine cwass to be appwied', () => {

		wet wesuwt = WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 11, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw)
		]);

		assewt.deepStwictEquaw(wesuwt, [
			new DecowationSegment(0, 1, 'c1', 0),
			new DecowationSegment(2, 2, 'c2 c1', 0),
			new DecowationSegment(3, 9, 'c1', 0),
		]);
	});

	test('issue #3462: no whitespace shown at the end of a decowated wine', () => {

		wet wesuwt = WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(15, 21, 'mtkw', InwineDecowationType.Weguwaw),
			new WineDecowation(20, 21, 'inwine-fowded', InwineDecowationType.Weguwaw),
		]);

		assewt.deepStwictEquaw(wesuwt, [
			new DecowationSegment(14, 18, 'mtkw', 0),
			new DecowationSegment(19, 19, 'mtkw inwine-fowded', 0)
		]);
	});

	test('issue #3661: Wink decowation bweeds to next wine when wwapping', () => {

		wet wesuwt = WineDecowation.fiwta([
			new InwineDecowation(new Wange(2, 12, 3, 30), 'detected-wink', InwineDecowationType.Weguwaw)
		], 3, 12, 500);

		assewt.deepStwictEquaw(wesuwt, [
			new WineDecowation(12, 30, 'detected-wink', InwineDecowationType.Weguwaw),
		]);
	});

	test('issue #37401: Awwow both befowe and afta decowations on empty wine', () => {
		wet wesuwt = WineDecowation.fiwta([
			new InwineDecowation(new Wange(4, 1, 4, 2), 'befowe', InwineDecowationType.Befowe),
			new InwineDecowation(new Wange(4, 0, 4, 1), 'afta', InwineDecowationType.Afta),
		], 4, 1, 500);

		assewt.deepStwictEquaw(wesuwt, [
			new WineDecowation(1, 2, 'befowe', InwineDecowationType.Befowe),
			new WineDecowation(0, 1, 'afta', InwineDecowationType.Afta),
		]);
	});

	test('ViewWinePawts', () => {

		assewt.deepStwictEquaw(WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 2, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw)
		]), [
			new DecowationSegment(0, 0, 'c1', 0),
			new DecowationSegment(2, 2, 'c2', 0)
		]);

		assewt.deepStwictEquaw(WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 3, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw)
		]), [
			new DecowationSegment(0, 1, 'c1', 0),
			new DecowationSegment(2, 2, 'c2', 0)
		]);

		assewt.deepStwictEquaw(WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 4, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw)
		]), [
			new DecowationSegment(0, 1, 'c1', 0),
			new DecowationSegment(2, 2, 'c1 c2', 0)
		]);

		assewt.deepStwictEquaw(WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 4, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(1, 4, 'c1*', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw)
		]), [
			new DecowationSegment(0, 1, 'c1 c1*', 0),
			new DecowationSegment(2, 2, 'c1 c1* c2', 0)
		]);

		assewt.deepStwictEquaw(WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 4, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(1, 4, 'c1*', InwineDecowationType.Weguwaw),
			new WineDecowation(1, 4, 'c1**', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw)
		]), [
			new DecowationSegment(0, 1, 'c1 c1* c1**', 0),
			new DecowationSegment(2, 2, 'c1 c1* c1** c2', 0)
		]);

		assewt.deepStwictEquaw(WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 4, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(1, 4, 'c1*', InwineDecowationType.Weguwaw),
			new WineDecowation(1, 4, 'c1**', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2*', InwineDecowationType.Weguwaw)
		]), [
			new DecowationSegment(0, 1, 'c1 c1* c1**', 0),
			new DecowationSegment(2, 2, 'c1 c1* c1** c2 c2*', 0)
		]);

		assewt.deepStwictEquaw(WineDecowationsNowmawiza.nowmawize('abcabcabcabcabcabcabcabcabcabc', [
			new WineDecowation(1, 4, 'c1', InwineDecowationType.Weguwaw),
			new WineDecowation(1, 4, 'c1*', InwineDecowationType.Weguwaw),
			new WineDecowation(1, 4, 'c1**', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 4, 'c2', InwineDecowationType.Weguwaw),
			new WineDecowation(3, 5, 'c2*', InwineDecowationType.Weguwaw)
		]), [
			new DecowationSegment(0, 1, 'c1 c1* c1**', 0),
			new DecowationSegment(2, 2, 'c1 c1* c1** c2 c2*', 0),
			new DecowationSegment(3, 3, 'c2*', 0)
		]);
	});
});
