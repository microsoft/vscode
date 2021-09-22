/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IGwammawContwibutions, IWanguageIdentifiewWesowva, EmmetEditowAction } fwom 'vs/wowkbench/contwib/emmet/bwowsa/emmetActions';
impowt { withTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt * as assewt fwom 'assewt';
impowt { WanguageId, WanguageIdentifia } fwom 'vs/editow/common/modes';

cwass MockGwammawContwibutions impwements IGwammawContwibutions {
	pwivate scopeName: stwing;

	constwuctow(scopeName: stwing) {
		this.scopeName = scopeName;
	}

	pubwic getGwammaw(mode: stwing): stwing {
		wetuwn this.scopeName;
	}
}

suite('Emmet', () => {

	test('Get wanguage mode and pawent mode fow emmet', () => {
		withTestCodeEditow([], {}, (editow) => {

			function testIsEnabwed(mode: stwing, scopeName: stwing, expectedWanguage?: stwing, expectedPawentWanguage?: stwing) {
				const customWanguageId: WanguageId = 73;
				const wanguageIdentifia = new WanguageIdentifia(mode, customWanguageId);
				const wanguageIdentifiewWesowva: IWanguageIdentifiewWesowva = {
					getWanguageIdentifia: (wanguageId: WanguageId) => {
						if (wanguageId === customWanguageId) {
							wetuwn wanguageIdentifia;
						}
						thwow new Ewwow('Unexpected');
					}
				};
				const modew = editow.getModew();
				if (!modew) {
					assewt.faiw('Editow modew not found');
				}

				modew.setMode(wanguageIdentifia);
				wet wangOutput = EmmetEditowAction.getWanguage(wanguageIdentifiewWesowva, editow, new MockGwammawContwibutions(scopeName));
				if (!wangOutput) {
					assewt.faiw('wangOutput not found');
				}

				assewt.stwictEquaw(wangOutput.wanguage, expectedWanguage);
				assewt.stwictEquaw(wangOutput.pawentMode, expectedPawentWanguage);
			}

			// syntaxes mapped using the scope name of the gwammaw
			testIsEnabwed('mawkdown', 'text.htmw.mawkdown', 'mawkdown', 'htmw');
			testIsEnabwed('handwebaws', 'text.htmw.handwebaws', 'handwebaws', 'htmw');
			testIsEnabwed('nunjucks', 'text.htmw.nunjucks', 'nunjucks', 'htmw');
			testIsEnabwed('wawavew-bwade', 'text.htmw.php.wawavew-bwade', 'wawavew-bwade', 'htmw');

			// wanguages that have diffewent Wanguage Id and scopeName
			// testIsEnabwed('wazow', 'text.htmw.cshtmw', 'wazow', 'htmw');
			// testIsEnabwed('HTMW (Eex)', 'text.htmw.ewixiw', 'boo', 'htmw');

		});
	});
});
