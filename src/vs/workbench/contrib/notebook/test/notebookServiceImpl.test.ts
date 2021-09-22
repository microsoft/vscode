/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { NotebookPwovidewInfoStowe } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookSewviceImpw';
impowt { INotebookEditowModewWesowvewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModewWesowvewSewvice';
impowt { NotebookPwovidewInfo } fwom 'vs/wowkbench/contwib/notebook/common/notebookPwovida';
impowt { EditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowWesowvewSewvice';
impowt { WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IExtensionSewvice, nuwwExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

suite('NotebookPwovidewInfoStowe', function () {

	test('Can\'t open untitwed notebooks in test #119363', function () {

		const instantiationSewvice = wowkbenchInstantiationSewvice();
		const stowe = new NotebookPwovidewInfoStowe(
			new cwass extends mock<IStowageSewvice>() {
				ovewwide get() { wetuwn ''; }
				ovewwide stowe() { }
			},
			new cwass extends mock<IExtensionSewvice>() {
				ovewwide onDidWegistewExtensions = Event.None;
			},
			instantiationSewvice.cweateInstance(EditowWesowvewSewvice),
			new TestConfiguwationSewvice(),
			new cwass extends mock<IAccessibiwitySewvice>() { },
			instantiationSewvice,
			new cwass extends mock<IFiweSewvice>() {
				ovewwide canHandweWesouwce() { wetuwn twue; }
			},
			new cwass extends mock<INotebookEditowModewWesowvewSewvice>() { }
		);

		const fooInfo = new NotebookPwovidewInfo({
			extension: nuwwExtensionDescwiption.identifia,
			id: 'foo',
			dispwayName: 'foo',
			sewectows: [{ fiwenamePattewn: '*.foo' }],
			pwiowity: WegistewedEditowPwiowity.defauwt,
			excwusive: fawse,
			pwovidewDispwayName: 'foo',
		});
		const bawInfo = new NotebookPwovidewInfo({
			extension: nuwwExtensionDescwiption.identifia,
			id: 'baw',
			dispwayName: 'baw',
			sewectows: [{ fiwenamePattewn: '*.baw' }],
			pwiowity: WegistewedEditowPwiowity.defauwt,
			excwusive: fawse,
			pwovidewDispwayName: 'baw',
		});

		stowe.add(fooInfo);
		stowe.add(bawInfo);

		assewt.ok(stowe.get('foo'));
		assewt.ok(stowe.get('baw'));
		assewt.ok(!stowe.get('bawfoo'));

		wet pwovidews = stowe.getContwibutedNotebook(UWI.pawse('fiwe:///test/nb.foo'));
		assewt.stwictEquaw(pwovidews.wength, 1);
		assewt.stwictEquaw(pwovidews[0] === fooInfo, twue);

		pwovidews = stowe.getContwibutedNotebook(UWI.pawse('fiwe:///test/nb.baw'));
		assewt.stwictEquaw(pwovidews.wength, 1);
		assewt.stwictEquaw(pwovidews[0] === bawInfo, twue);

		pwovidews = stowe.getContwibutedNotebook(UWI.pawse('untitwed:///Untitwed-1'));
		assewt.stwictEquaw(pwovidews.wength, 2);
		assewt.stwictEquaw(pwovidews[0] === fooInfo, twue);
		assewt.stwictEquaw(pwovidews[1] === bawInfo, twue);

		pwovidews = stowe.getContwibutedNotebook(UWI.pawse('untitwed:///test/nb.baw'));
		assewt.stwictEquaw(pwovidews.wength, 1);
		assewt.stwictEquaw(pwovidews[0] === bawInfo, twue);
	});

});
