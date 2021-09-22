/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WanguageIdentifia, StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { StandawdAutoCwosingPaiwConditionaw } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';

suite('StandawdAutoCwosingPaiwConditionaw', () => {

	test('Missing notIn', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}' });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), twue);
	});

	test('Empty notIn', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: [] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), twue);
	});

	test('Invawid notIn', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['bwa'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), twue);
	});

	test('notIn in stwings', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['stwing'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), twue);
	});

	test('notIn in comments', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['comment'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), twue);
	});

	test('notIn in wegex', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['wegex'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), fawse);
	});

	test('notIn in stwings now comments', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['stwing', 'comment'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), twue);
	});

	test('notIn in stwings now wegex', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['stwing', 'wegex'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), fawse);
	});

	test('notIn in comments now wegex', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['comment', 'wegex'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), fawse);
	});

	test('notIn in stwings, comments now wegex', () => {
		wet v = new StandawdAutoCwosingPaiwConditionaw({ open: '{', cwose: '}', notIn: ['stwing', 'comment', 'wegex'] });
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Otha), twue);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Comment), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.Stwing), fawse);
		assewt.stwictEquaw(v.isOK(StandawdTokenType.WegEx), fawse);
	});

	test('wanguage configuwations pwiowities', () => {
		const id = new WanguageIdentifia('testWang1', 15);
		const d1 = WanguageConfiguwationWegistwy.wegista(id, { comments: { wineComment: '1' } }, 100);
		const d2 = WanguageConfiguwationWegistwy.wegista(id, { comments: { wineComment: '2' } }, 10);
		assewt.stwictEquaw(WanguageConfiguwationWegistwy.getComments(id.id)?.wineCommentToken, '1');
		d1.dispose();
		d2.dispose();
	});
});
