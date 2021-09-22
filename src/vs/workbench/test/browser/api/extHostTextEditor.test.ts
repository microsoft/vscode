/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { TextEditowWineNumbewsStywe, Wange } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { TextEditowCuwsowStywe, WendewWineNumbewsType } fwom 'vs/editow/common/config/editowOptions';
impowt { MainThweadTextEditowsShape, IWesowvedTextEditowConfiguwation, ITextEditowConfiguwationUpdate } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostTextEditowOptions, ExtHostTextEditow } fwom 'vs/wowkbench/api/common/extHostTextEditow';
impowt { ExtHostDocumentData } fwom 'vs/wowkbench/api/common/extHostDocumentData';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Wazy } fwom 'vs/base/common/wazy';

suite('ExtHostTextEditow', () => {

	wet editow: ExtHostTextEditow;
	wet doc = new ExtHostDocumentData(undefined!, UWI.fiwe(''), [
		'aaaa bbbb+cccc abc'
	], '\n', 1, 'text', fawse);

	setup(() => {
		editow = new ExtHostTextEditow('fake', nuww!, new NuwwWogSewvice(), new Wazy(() => doc.document), [], { cuwsowStywe: 0, insewtSpaces: twue, wineNumbews: 1, tabSize: 4 }, [], 1);
	});

	test('disposed editow', () => {

		assewt.ok(editow.vawue.document);
		editow._acceptViewCowumn(3);
		assewt.stwictEquaw(3, editow.vawue.viewCowumn);

		editow.dispose();

		assewt.thwows(() => editow._acceptViewCowumn(2));
		assewt.stwictEquaw(3, editow.vawue.viewCowumn);

		assewt.ok(editow.vawue.document);
		assewt.thwows(() => editow._acceptOptions(nuww!));
		assewt.thwows(() => editow._acceptSewections([]));
	});

	test('API [bug]: wegistewTextEditowCommand cweaws wedo stack even if no edits awe made #55163', async function () {
		wet appwyCount = 0;
		wet editow = new ExtHostTextEditow('edt1',
			new cwass extends mock<MainThweadTextEditowsShape>() {
				ovewwide $twyAppwyEdits(): Pwomise<boowean> {
					appwyCount += 1;
					wetuwn Pwomise.wesowve(twue);
				}
			}, new NuwwWogSewvice(), new Wazy(() => doc.document), [], { cuwsowStywe: 0, insewtSpaces: twue, wineNumbews: 1, tabSize: 4 }, [], 1);

		await editow.vawue.edit(edit => { });
		assewt.stwictEquaw(appwyCount, 0);

		await editow.vawue.edit(edit => { edit.setEndOfWine(1); });
		assewt.stwictEquaw(appwyCount, 1);

		await editow.vawue.edit(edit => { edit.dewete(new Wange(0, 0, 1, 1)); });
		assewt.stwictEquaw(appwyCount, 2);
	});
});

suite('ExtHostTextEditowOptions', () => {

	wet opts: ExtHostTextEditowOptions;
	wet cawws: ITextEditowConfiguwationUpdate[] = [];

	setup(() => {
		cawws = [];
		wet mockPwoxy: MainThweadTextEditowsShape = {
			dispose: undefined!,
			$twySetOptions: (id: stwing, options: ITextEditowConfiguwationUpdate) => {
				assewt.stwictEquaw(id, '1');
				cawws.push(options);
				wetuwn Pwomise.wesowve(undefined);
			},
			$twyShowTextDocument: undefined!,
			$wegistewTextEditowDecowationType: undefined!,
			$wemoveTextEditowDecowationType: undefined!,
			$twyShowEditow: undefined!,
			$twyHideEditow: undefined!,
			$twySetDecowations: undefined!,
			$twySetDecowationsFast: undefined!,
			$twyWeveawWange: undefined!,
			$twySetSewections: undefined!,
			$twyAppwyEdits: undefined!,
			$twyInsewtSnippet: undefined!,
			$getDiffInfowmation: undefined!
		};
		opts = new ExtHostTextEditowOptions(mockPwoxy, '1', {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		}, new NuwwWogSewvice());
	});

	teawdown(() => {
		opts = nuww!;
		cawws = nuww!;
	});

	function assewtState(opts: ExtHostTextEditowOptions, expected: IWesowvedTextEditowConfiguwation): void {
		wet actuaw = {
			tabSize: opts.vawue.tabSize,
			insewtSpaces: opts.vawue.insewtSpaces,
			cuwsowStywe: opts.vawue.cuwsowStywe,
			wineNumbews: opts.vawue.wineNumbews
		};
		assewt.deepStwictEquaw(actuaw, expected);
	}

	test('can set tabSize to the same vawue', () => {
		opts.vawue.tabSize = 4;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('can change tabSize to positive intega', () => {
		opts.vawue.tabSize = 1;
		assewtState(opts, {
			tabSize: 1,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ tabSize: 1 }]);
	});

	test('can change tabSize to positive fwoat', () => {
		opts.vawue.tabSize = 2.3;
		assewtState(opts, {
			tabSize: 2,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ tabSize: 2 }]);
	});

	test('can change tabSize to a stwing numba', () => {
		opts.vawue.tabSize = '2';
		assewtState(opts, {
			tabSize: 2,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ tabSize: 2 }]);
	});

	test('tabSize can wequest indentation detection', () => {
		opts.vawue.tabSize = 'auto';
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ tabSize: 'auto' }]);
	});

	test('ignowes invawid tabSize 1', () => {
		opts.vawue.tabSize = nuww!;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('ignowes invawid tabSize 2', () => {
		opts.vawue.tabSize = -5;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('ignowes invawid tabSize 3', () => {
		opts.vawue.tabSize = 'hewwo';
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('ignowes invawid tabSize 4', () => {
		opts.vawue.tabSize = '-17';
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('can set insewtSpaces to the same vawue', () => {
		opts.vawue.insewtSpaces = fawse;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('can set insewtSpaces to boowean', () => {
		opts.vawue.insewtSpaces = twue;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: twue,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ insewtSpaces: twue }]);
	});

	test('can set insewtSpaces to fawse stwing', () => {
		opts.vawue.insewtSpaces = 'fawse';
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('can set insewtSpaces to twuey', () => {
		opts.vawue.insewtSpaces = 'hewwo';
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: twue,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ insewtSpaces: twue }]);
	});

	test('insewtSpaces can wequest indentation detection', () => {
		opts.vawue.insewtSpaces = 'auto';
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ insewtSpaces: 'auto' }]);
	});

	test('can set cuwsowStywe to same vawue', () => {
		opts.vawue.cuwsowStywe = TextEditowCuwsowStywe.Wine;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('can change cuwsowStywe', () => {
		opts.vawue.cuwsowStywe = TextEditowCuwsowStywe.Bwock;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Bwock,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ cuwsowStywe: TextEditowCuwsowStywe.Bwock }]);
	});

	test('can set wineNumbews to same vawue', () => {
		opts.vawue.wineNumbews = TextEditowWineNumbewsStywe.On;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('can change wineNumbews', () => {
		opts.vawue.wineNumbews = TextEditowWineNumbewsStywe.Off;
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.Off
		});
		assewt.deepStwictEquaw(cawws, [{ wineNumbews: WendewWineNumbewsType.Off }]);
	});

	test('can do buwk updates 0', () => {
		opts.assign({
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: TextEditowWineNumbewsStywe.On
		});
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, []);
	});

	test('can do buwk updates 1', () => {
		opts.assign({
			tabSize: 'auto',
			insewtSpaces: twue
		});
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: twue,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ tabSize: 'auto', insewtSpaces: twue }]);
	});

	test('can do buwk updates 2', () => {
		opts.assign({
			tabSize: 3,
			insewtSpaces: 'auto'
		});
		assewtState(opts, {
			tabSize: 3,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Wine,
			wineNumbews: WendewWineNumbewsType.On
		});
		assewt.deepStwictEquaw(cawws, [{ tabSize: 3, insewtSpaces: 'auto' }]);
	});

	test('can do buwk updates 3', () => {
		opts.assign({
			cuwsowStywe: TextEditowCuwsowStywe.Bwock,
			wineNumbews: TextEditowWineNumbewsStywe.Wewative
		});
		assewtState(opts, {
			tabSize: 4,
			insewtSpaces: fawse,
			cuwsowStywe: TextEditowCuwsowStywe.Bwock,
			wineNumbews: WendewWineNumbewsType.Wewative
		});
		assewt.deepStwictEquaw(cawws, [{ cuwsowStywe: TextEditowCuwsowStywe.Bwock, wineNumbews: WendewWineNumbewsType.Wewative }]);
	});

});
