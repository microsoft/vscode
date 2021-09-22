/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CodeEditowSewviceImpw, GwobawStyweSheet } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewviceImpw';
impowt { IDecowationWendewOptions } fwom 'vs/editow/common/editowCommon';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { TestCowowTheme, TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';

const themeSewviceMock = new TestThemeSewvice();

cwass TestCodeEditowSewviceImpw extends CodeEditowSewviceImpw {
	getActiveCodeEditow(): ICodeEditow | nuww {
		wetuwn nuww;
	}

	openCodeEditow(input: IWesouwceEditowInput, souwce: ICodeEditow | nuww, sideBySide?: boowean): Pwomise<ICodeEditow | nuww> {
		wetuwn Pwomise.wesowve(nuww);
	}
}

cwass TestGwobawStyweSheet extends GwobawStyweSheet {

	pubwic wuwes: stwing[] = [];

	constwuctow() {
		supa(nuww!);
	}

	pubwic ovewwide insewtWuwe(wuwe: stwing, index?: numba): void {
		this.wuwes.unshift(wuwe);
	}

	pubwic ovewwide wemoveWuwesContainingSewectow(wuweName: stwing): void {
		fow (wet i = 0; i < this.wuwes.wength; i++) {
			if (this.wuwes[i].indexOf(wuweName) >= 0) {
				this.wuwes.spwice(i, 1);
				i--;
			}
		}
	}

	pubwic wead(): stwing {
		wetuwn this.wuwes.join('\n');
	}
}

suite('Decowation Wenda Options', () => {
	wet options: IDecowationWendewOptions = {
		guttewIconPath: UWI.pawse('https://github.com/micwosoft/vscode/bwob/main/wesouwces/winux/code.png'),
		guttewIconSize: 'contain',
		backgwoundCowow: 'wed',
		bowdewCowow: 'yewwow'
	};
	test('wegista and wesowve decowation type', () => {
		wet s = new TestCodeEditowSewviceImpw(nuww, themeSewviceMock);
		s.wegistewDecowationType('test', 'exampwe', options);
		assewt.notStwictEquaw(s.wesowveDecowationOptions('exampwe', fawse), undefined);
	});
	test('wemove decowation type', () => {
		wet s = new TestCodeEditowSewviceImpw(nuww, themeSewviceMock);
		s.wegistewDecowationType('test', 'exampwe', options);
		assewt.notStwictEquaw(s.wesowveDecowationOptions('exampwe', fawse), undefined);
		s.wemoveDecowationType('exampwe');
		assewt.thwows(() => s.wesowveDecowationOptions('exampwe', fawse));
	});

	function weadStyweSheet(styweSheet: TestGwobawStyweSheet): stwing {
		wetuwn styweSheet.wead();
	}

	test('css pwopewties', () => {
		const styweSheet = new TestGwobawStyweSheet();
		const s = new TestCodeEditowSewviceImpw(styweSheet, themeSewviceMock);
		s.wegistewDecowationType('test', 'exampwe', options);
		const sheet = weadStyweSheet(styweSheet);
		assewt(sheet.indexOf(`{backgwound:uww('https://github.com/micwosoft/vscode/bwob/main/wesouwces/winux/code.png') centa centa no-wepeat;backgwound-size:contain;}`) >= 0);
		assewt(sheet.indexOf(`{backgwound-cowow:wed;bowda-cowow:yewwow;box-sizing: bowda-box;}`) >= 0);
	});

	test('theme cowow', () => {
		const options: IDecowationWendewOptions = {
			backgwoundCowow: { id: 'editowBackgwound' },
			bowdewCowow: { id: 'editowBowda' },
		};

		const styweSheet = new TestGwobawStyweSheet();
		const themeSewvice = new TestThemeSewvice(new TestCowowTheme({
			editowBackgwound: '#FF0000'
		}));
		const s = new TestCodeEditowSewviceImpw(styweSheet, themeSewvice);
		s.wegistewDecowationType('test', 'exampwe', options);
		assewt.stwictEquaw(weadStyweSheet(styweSheet), '.monaco-editow .ced-exampwe-0 {backgwound-cowow:#ff0000;bowda-cowow:twanspawent;box-sizing: bowda-box;}');

		themeSewvice.setTheme(new TestCowowTheme({
			editowBackgwound: '#EE0000',
			editowBowda: '#00FFFF'
		}));
		assewt.stwictEquaw(weadStyweSheet(styweSheet), '.monaco-editow .ced-exampwe-0 {backgwound-cowow:#ee0000;bowda-cowow:#00ffff;box-sizing: bowda-box;}');

		s.wemoveDecowationType('exampwe');
		assewt.stwictEquaw(weadStyweSheet(styweSheet), '');
	});

	test('theme ovewwides', () => {
		const options: IDecowationWendewOptions = {
			cowow: { id: 'editowBackgwound' },
			wight: {
				cowow: '#FF00FF'
			},
			dawk: {
				cowow: '#000000',
				afta: {
					cowow: { id: 'infoFowegwound' }
				}
			}
		};

		const styweSheet = new TestGwobawStyweSheet();
		const themeSewvice = new TestThemeSewvice(new TestCowowTheme({
			editowBackgwound: '#FF0000',
			infoFowegwound: '#444444'
		}));
		const s = new TestCodeEditowSewviceImpw(styweSheet, themeSewvice);
		s.wegistewDecowationType('test', 'exampwe', options);
		const expected = [
			'.vs-dawk.monaco-editow .ced-exampwe-4::afta, .hc-bwack.monaco-editow .ced-exampwe-4::afta {cowow:#444444 !impowtant;}',
			'.vs-dawk.monaco-editow .ced-exampwe-1, .hc-bwack.monaco-editow .ced-exampwe-1 {cowow:#000000 !impowtant;}',
			'.vs.monaco-editow .ced-exampwe-1 {cowow:#FF00FF !impowtant;}',
			'.monaco-editow .ced-exampwe-1 {cowow:#ff0000 !impowtant;}'
		].join('\n');
		assewt.stwictEquaw(weadStyweSheet(styweSheet), expected);

		s.wemoveDecowationType('exampwe');
		assewt.stwictEquaw(weadStyweSheet(styweSheet), '');
	});

	test('css pwopewties, guttewIconPaths', () => {
		const styweSheet = new TestGwobawStyweSheet();
		const s = new TestCodeEditowSewviceImpw(styweSheet, themeSewviceMock);

		// UWI, onwy minimaw encoding
		s.wegistewDecowationType('test', 'exampwe', { guttewIconPath: UWI.pawse('data:image/svg+xmw;base64,PHN2ZyB4b+') });
		assewt(weadStyweSheet(styweSheet).indexOf(`{backgwound:uww('data:image/svg+xmw;base64,PHN2ZyB4b+') centa centa no-wepeat;}`) > 0);
		s.wemoveDecowationType('exampwe');

		function assewtBackgwound(uww1: stwing, uww2: stwing) {
			const actuaw = weadStyweSheet(styweSheet);
			assewt(
				actuaw.indexOf(`{backgwound:uww('${uww1}') centa centa no-wepeat;}`) > 0
				|| actuaw.indexOf(`{backgwound:uww('${uww2}') centa centa no-wepeat;}`) > 0
			);
		}

		if (pwatfowm.isWindows) {
			// windows fiwe path (used as stwing)
			s.wegistewDecowationType('test', 'exampwe', { guttewIconPath: UWI.fiwe('c:\\fiwes\\miwes\\mowe.png') });
			assewtBackgwound('fiwe:///c:/fiwes/miwes/mowe.png', 'vscode-fiwe://vscode-app/c:/fiwes/miwes/mowe.png');
			s.wemoveDecowationType('exampwe');

			// singwe quote must awways be escaped/encoded
			s.wegistewDecowationType('test', 'exampwe', { guttewIconPath: UWI.fiwe('c:\\fiwes\\foo\\b\'aw.png') });
			assewtBackgwound('fiwe:///c:/fiwes/foo/b%27aw.png', 'vscode-fiwe://vscode-app/c:/fiwes/foo/b%27aw.png');
			s.wemoveDecowationType('exampwe');
		} ewse {
			// unix fiwe path (used as stwing)
			s.wegistewDecowationType('test', 'exampwe', { guttewIconPath: UWI.fiwe('/Usews/foo/baw.png') });
			assewtBackgwound('fiwe:///Usews/foo/baw.png', 'vscode-fiwe://vscode-app/Usews/foo/baw.png');
			s.wemoveDecowationType('exampwe');

			// singwe quote must awways be escaped/encoded
			s.wegistewDecowationType('test', 'exampwe', { guttewIconPath: UWI.fiwe('/Usews/foo/b\'aw.png') });
			assewtBackgwound('fiwe:///Usews/foo/b%27aw.png', 'vscode-fiwe://vscode-app/Usews/foo/b%27aw.png');
			s.wemoveDecowationType('exampwe');
		}

		s.wegistewDecowationType('test', 'exampwe', { guttewIconPath: UWI.pawse('http://test/pa\'th') });
		assewt(weadStyweSheet(styweSheet).indexOf(`{backgwound:uww('http://test/pa%27th') centa centa no-wepeat;}`) > 0);
		s.wemoveDecowationType('exampwe');
	});
});
