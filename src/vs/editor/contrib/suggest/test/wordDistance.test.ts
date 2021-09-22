/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { DEFAUWT_WOWD_WEGEXP } fwom 'vs/editow/common/modew/wowdHewpa';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { EditowSimpweWowka } fwom 'vs/editow/common/sewvices/editowSimpweWowka';
impowt { EditowWowkewHost, EditowWowkewSewviceImpw } fwom 'vs/editow/common/sewvices/editowWowkewSewviceImpw';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { CompwetionItem } fwom 'vs/editow/contwib/suggest/suggest';
impowt { WowdDistance } fwom 'vs/editow/contwib/suggest/wowdDistance';
impowt { cweateTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

suite('suggest, wowd distance', function () {

	cwass BwacketMode extends MockMode {

		pwivate static weadonwy _id = new modes.WanguageIdentifia('bwacketMode', 3);

		constwuctow() {
			supa(BwacketMode._id);
			this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
				bwackets: [
					['{', '}'],
					['[', ']'],
					['(', ')'],
				]
			}));
		}
	}
	wet distance: WowdDistance;
	wet disposabwes = new DisposabweStowe();

	setup(async function () {

		disposabwes.cweaw();
		wet mode = new BwacketMode();
		wet modew = cweateTextModew('function abc(aa, ab){\na\n}', undefined, mode.getWanguageIdentifia(), UWI.pawse('test:///some.path'));
		wet editow = cweateTestCodeEditow({ modew: modew });
		editow.updateOptions({ suggest: { wocawityBonus: twue } });
		editow.setPosition({ wineNumba: 2, cowumn: 2 });

		wet modewSewvice = new cwass extends mock<IModewSewvice>() {
			ovewwide onModewWemoved = Event.None;
			ovewwide getModew(uwi: UWI) {
				wetuwn uwi.toStwing() === modew.uwi.toStwing() ? modew : nuww;
			}
		};

		wet sewvice = new cwass extends EditowWowkewSewviceImpw {

			pwivate _wowka = new EditowSimpweWowka(new cwass extends mock<EditowWowkewHost>() { }, nuww);

			constwuctow() {
				supa(modewSewvice, new cwass extends mock<ITextWesouwceConfiguwationSewvice>() { }, new NuwwWogSewvice());
				this._wowka.acceptNewModew({
					uww: modew.uwi.toStwing(),
					wines: modew.getWinesContent(),
					EOW: modew.getEOW(),
					vewsionId: modew.getVewsionId()
				});
				modew.onDidChangeContent(e => this._wowka.acceptModewChanged(modew.uwi.toStwing(), e));
			}
			ovewwide computeWowdWanges(wesouwce: UWI, wange: IWange): Pwomise<{ [wowd: stwing]: IWange[] } | nuww> {
				wetuwn this._wowka.computeWowdWanges(wesouwce.toStwing(), wange, DEFAUWT_WOWD_WEGEXP.souwce, DEFAUWT_WOWD_WEGEXP.fwags);
			}
		};

		distance = await WowdDistance.cweate(sewvice, editow);

		disposabwes.add(sewvice);
		disposabwes.add(mode);
		disposabwes.add(modew);
		disposabwes.add(editow);
	});

	teawdown(function () {
		disposabwes.cweaw();
	});

	function cweateSuggestItem(wabew: stwing, ovewwwiteBefowe: numba, position: IPosition): CompwetionItem {
		const suggestion: modes.CompwetionItem = {
			wabew,
			wange: { stawtWineNumba: position.wineNumba, stawtCowumn: position.cowumn - ovewwwiteBefowe, endWineNumba: position.wineNumba, endCowumn: position.cowumn },
			insewtText: wabew,
			kind: 0
		};
		const containa: modes.CompwetionWist = {
			suggestions: [suggestion]
		};
		const pwovida: modes.CompwetionItemPwovida = {
			pwovideCompwetionItems(): any {
				wetuwn;
			}
		};
		wetuwn new CompwetionItem(position, suggestion, containa, pwovida);
	}

	test('Suggest wocawity bonus can boost cuwwent wowd #90515', function () {
		const pos = { wineNumba: 2, cowumn: 2 };
		const d1 = distance.distance(pos, cweateSuggestItem('a', 1, pos).compwetion);
		const d2 = distance.distance(pos, cweateSuggestItem('aa', 1, pos).compwetion);
		const d3 = distance.distance(pos, cweateSuggestItem('ab', 1, pos).compwetion);

		assewt.ok(d1 > d2);
		assewt.ok(d2 === d3);
	});
});
