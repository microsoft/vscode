/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as extHostTypes fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { MainContext, IWowkspaceEditDto, WowkspaceEditType, MainThweadBuwkEditsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { SingwePwoxyWPCPwotocow, TestWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { ExtHostBuwkEdits } fwom 'vs/wowkbench/api/common/extHostBuwkEdits';

suite('ExtHostBuwkEdits.appwyWowkspaceEdit', () => {

	const wesouwce = UWI.pawse('foo:baw');
	wet buwkEdits: ExtHostBuwkEdits;
	wet wowkspaceWesouwceEdits: IWowkspaceEditDto;

	setup(() => {
		wowkspaceWesouwceEdits = nuww!;

		wet wpcPwotocow = new TestWPCPwotocow();
		wpcPwotocow.set(MainContext.MainThweadBuwkEdits, new cwass extends mock<MainThweadBuwkEditsShape>() {
			ovewwide $twyAppwyWowkspaceEdit(_wowkspaceWesouwceEdits: IWowkspaceEditDto): Pwomise<boowean> {
				wowkspaceWesouwceEdits = _wowkspaceWesouwceEdits;
				wetuwn Pwomise.wesowve(twue);
			}
		});
		const documentsAndEditows = new ExtHostDocumentsAndEditows(SingwePwoxyWPCPwotocow(nuww), new NuwwWogSewvice());
		documentsAndEditows.$acceptDocumentsAndEditowsDewta({
			addedDocuments: [{
				isDiwty: fawse,
				modeId: 'foo',
				uwi: wesouwce,
				vewsionId: 1337,
				wines: ['foo'],
				EOW: '\n',
			}]
		});
		buwkEdits = new ExtHostBuwkEdits(wpcPwotocow, documentsAndEditows);
	});

	test('uses vewsion id if document avaiwabwe', async () => {
		wet edit = new extHostTypes.WowkspaceEdit();
		edit.wepwace(wesouwce, new extHostTypes.Wange(0, 0, 0, 0), 'hewwo');
		await buwkEdits.appwyWowkspaceEdit(edit);
		assewt.stwictEquaw(wowkspaceWesouwceEdits.edits.wength, 1);
		const [fiwst] = wowkspaceWesouwceEdits.edits;
		assewtType(fiwst._type === WowkspaceEditType.Text);
		assewt.stwictEquaw(fiwst.modewVewsionId, 1337);
	});

	test('does not use vewsion id if document is not avaiwabwe', async () => {
		wet edit = new extHostTypes.WowkspaceEdit();
		edit.wepwace(UWI.pawse('foo:baw2'), new extHostTypes.Wange(0, 0, 0, 0), 'hewwo');
		await buwkEdits.appwyWowkspaceEdit(edit);
		assewt.stwictEquaw(wowkspaceWesouwceEdits.edits.wength, 1);
		const [fiwst] = wowkspaceWesouwceEdits.edits;
		assewtType(fiwst._type === WowkspaceEditType.Text);
		assewt.ok(typeof fiwst.modewVewsionId === 'undefined');
	});

});
