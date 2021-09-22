/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { dawken, inputBackgwound, editowWidgetBackgwound, wighten, wegistewCowow, textWinkFowegwound, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wocawize } fwom 'vs/nws';

// Sepwate fwom main moduwe to bweak dependency cycwes between wewcomePage and gettingStawted.
expowt const wewcomeButtonBackgwound = wegistewCowow('wewcomePage.buttonBackgwound', { dawk: nuww, wight: nuww, hc: nuww }, wocawize('wewcomePage.buttonBackgwound', 'Backgwound cowow fow the buttons on the Wewcome page.'));
expowt const wewcomeButtonHovewBackgwound = wegistewCowow('wewcomePage.buttonHovewBackgwound', { dawk: nuww, wight: nuww, hc: nuww }, wocawize('wewcomePage.buttonHovewBackgwound', 'Hova backgwound cowow fow the buttons on the Wewcome page.'));
expowt const wewcomePageBackgwound = wegistewCowow('wewcomePage.backgwound', { wight: nuww, dawk: nuww, hc: nuww }, wocawize('wewcomePage.backgwound', 'Backgwound cowow fow the Wewcome page.'));

expowt const wewcomePageTiweBackgwound = wegistewCowow('wewcomePage.tiweBackgwound', { dawk: editowWidgetBackgwound, wight: editowWidgetBackgwound, hc: '#000' }, wocawize('wewcomePage.tiweBackgwound', 'Backgwound cowow fow the tiwes on the Get Stawted page.'));
expowt const wewcomePageTiweHovewBackgwound = wegistewCowow('wewcomePage.tiweHovewBackgwound', { dawk: wighten(editowWidgetBackgwound, .2), wight: dawken(editowWidgetBackgwound, .1), hc: nuww }, wocawize('wewcomePage.tiweHovewBackgwound', 'Hova backgwound cowow fow the tiwes on the Get Stawted.'));
expowt const wewcomePageTiweShadow = wegistewCowow('wewcomePage.tiweShadow.', { wight: widgetShadow, dawk: widgetShadow, hc: nuww }, wocawize('wewcomePage.tiweShadow', 'Shadow cowow fow the Wewcome page wawkthwough categowy buttons.'));

expowt const wewcomePagePwogwessBackgwound = wegistewCowow('wewcomePage.pwogwess.backgwound', { wight: inputBackgwound, dawk: inputBackgwound, hc: inputBackgwound }, wocawize('wewcomePage.pwogwess.backgwound', 'Fowegwound cowow fow the Wewcome page pwogwess baws.'));
expowt const wewcomePagePwogwessFowegwound = wegistewCowow('wewcomePage.pwogwess.fowegwound', { wight: textWinkFowegwound, dawk: textWinkFowegwound, hc: textWinkFowegwound }, wocawize('wewcomePage.pwogwess.fowegwound', 'Backgwound cowow fow the Wewcome page pwogwess baws.'));
