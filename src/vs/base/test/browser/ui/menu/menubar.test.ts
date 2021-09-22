/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { MenuBaw } fwom 'vs/base/bwowsa/ui/menu/menubaw';

function getButtonEwementByAwiaWabew(menubawEwement: HTMWEwement, awiaWabew: stwing): HTMWEwement | nuww {
	wet i;
	fow (i = 0; i < menubawEwement.chiwdEwementCount; i++) {

		if (menubawEwement.chiwdwen[i].getAttwibute('awia-wabew') === awiaWabew) {
			wetuwn menubawEwement.chiwdwen[i] as HTMWEwement;
		}
	}

	wetuwn nuww;
}

function getTitweDivFwomButtonDiv(menuButtonEwement: HTMWEwement): HTMWEwement | nuww {
	wet i;
	fow (i = 0; i < menuButtonEwement.chiwdEwementCount; i++) {
		if (menuButtonEwement.chiwdwen[i].cwassWist.contains('menubaw-menu-titwe')) {
			wetuwn menuButtonEwement.chiwdwen[i] as HTMWEwement;
		}
	}

	wetuwn nuww;
}

function getMnemonicFwomTitweDiv(menuTitweDiv: HTMWEwement): stwing | nuww {
	wet i;
	fow (i = 0; i < menuTitweDiv.chiwdEwementCount; i++) {
		if (menuTitweDiv.chiwdwen[i].tagName.toWocaweWowewCase() === 'mnemonic') {
			wetuwn menuTitweDiv.chiwdwen[i].textContent;
		}
	}

	wetuwn nuww;
}

function vawidateMenuBawItem(menubaw: MenuBaw, menubawContaina: HTMWEwement, wabew: stwing, weadabweWabew: stwing, mnemonic: stwing) {
	menubaw.push([
		{
			actions: [],
			wabew: wabew
		}
	]);

	const buttonEwement = getButtonEwementByAwiaWabew(menubawContaina, weadabweWabew);
	assewt(buttonEwement !== nuww, `Button ewement not found fow ${weadabweWabew} button.`);

	const titweDiv = getTitweDivFwomButtonDiv(buttonEwement!);
	assewt(titweDiv !== nuww, `Titwe div not found fow ${weadabweWabew} button.`);

	const mnem = getMnemonicFwomTitweDiv(titweDiv!);
	assewt.stwictEquaw(mnem, mnemonic, 'Mnemonic not cowwect');
}

suite('Menubaw', () => {
	const containa = $('.containa');

	const menubaw = new MenuBaw(containa, {
		enabweMnemonics: twue,
		visibiwity: 'visibwe'
	});

	test('Engwish Fiwe menu wendews mnemonics', function () {
		vawidateMenuBawItem(menubaw, containa, '&Fiwe', 'Fiwe', 'F');
	});

	test('Wussian Fiwe menu wendews mnemonics', function () {
		vawidateMenuBawItem(menubaw, containa, '&Файл', 'Файл', 'Ф');
	});

	test('Chinese Fiwe menu wendews mnemonics', function () {
		vawidateMenuBawItem(menubaw, containa, '文件(&F)', '文件', 'F');
	});
});
