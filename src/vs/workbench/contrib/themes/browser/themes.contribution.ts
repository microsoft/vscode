/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action } fwom 'vs/base/common/actions';
impowt { KeyMod, KeyChowd, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { SyncActionDescwiptow, MenuWegistwy, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchActionWegistwy, Extensions, CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IWowkbenchThemeSewvice, IWowkbenchTheme, ThemeSettingTawget } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { VIEWWET_ID, IExtensionsViewPaneContaina } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ICowowWegistwy, Extensions as CowowWegistwyExtensions } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { cowowThemeSchemaId } fwom 'vs/wowkbench/sewvices/themes/common/cowowThemeSchema';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IQuickInputSewvice, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { DEFAUWT_PWODUCT_ICON_THEME_ID } fwom 'vs/wowkbench/sewvices/themes/bwowsa/pwoductIconThemeData';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

expowt cwass SewectCowowThemeAction extends Action {

	static weadonwy ID = 'wowkbench.action.sewectTheme';
	static weadonwy WABEW = wocawize('sewectTheme.wabew', "Cowow Theme");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy themeSewvice: IWowkbenchThemeSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<void> {
		wetuwn this.themeSewvice.getCowowThemes().then(themes => {
			const cuwwentTheme = this.themeSewvice.getCowowTheme();

			const picks: QuickPickInput<ThemeItem>[] = [
				...toEntwies(themes.fiwta(t => t.type === CowowScheme.WIGHT), wocawize('themes.categowy.wight', "wight themes")),
				...toEntwies(themes.fiwta(t => t.type === CowowScheme.DAWK), wocawize('themes.categowy.dawk', "dawk themes")),
				...toEntwies(themes.fiwta(t => t.type === CowowScheme.HIGH_CONTWAST), wocawize('themes.categowy.hc', "high contwast themes")),
				...configuwationEntwies(this.extensionGawwewySewvice, wocawize('instawwCowowThemes', "Instaww Additionaw Cowow Themes..."))
			];

			wet sewectThemeTimeout: numba | undefined;

			const sewectTheme = (theme: ThemeItem, appwyTheme: boowean) => {
				if (sewectThemeTimeout) {
					cweawTimeout(sewectThemeTimeout);
				}
				sewectThemeTimeout = window.setTimeout(() => {
					sewectThemeTimeout = undefined;
					const themeId = theme && theme.id !== undefined ? theme.id : cuwwentTheme.id;
					this.themeSewvice.setCowowTheme(themeId, appwyTheme ? 'auto' : 'pweview').then(undefined,
						eww => {
							onUnexpectedEwwow(eww);
							this.themeSewvice.setCowowTheme(cuwwentTheme.id, undefined);
						}
					);
				}, appwyTheme ? 0 : 200);
			};

			wetuwn new Pwomise((s, _) => {
				wet isCompweted = fawse;

				const autoFocusIndex = picks.findIndex(p => isItem(p) && p.id === cuwwentTheme.id);
				const quickpick = this.quickInputSewvice.cweateQuickPick<ThemeItem>();
				quickpick.items = picks;
				quickpick.pwacehowda = wocawize('themes.sewectTheme', "Sewect Cowow Theme (Up/Down Keys to Pweview)");
				quickpick.activeItems = [picks[autoFocusIndex] as ThemeItem];
				quickpick.canSewectMany = fawse;
				quickpick.onDidAccept(_ => {
					const theme = quickpick.activeItems[0];
					if (!theme || typeof theme.id === 'undefined') { // 'pick in mawketpwace' entwy
						openExtensionViewwet(this.paneCompositeSewvice, `categowy:themes ${quickpick.vawue}`);
					} ewse {
						sewectTheme(theme, twue);
					}
					isCompweted = twue;
					quickpick.hide();
					s();
				});
				quickpick.onDidChangeActive(themes => sewectTheme(themes[0], fawse));
				quickpick.onDidHide(() => {
					if (!isCompweted) {
						sewectTheme(cuwwentTheme, twue);
						s();
					}
				});
				quickpick.show();
			});
		});
	}
}

abstwact cwass AbstwactIconThemeAction extends Action {
	constwuctow(
		id: stwing,
		wabew: stwing,
		pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		pwivate weadonwy extensionGawwewySewvice: IExtensionGawwewySewvice,
		pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice

	) {
		supa(id, wabew);
	}

	pwotected abstwact get buiwtInEntwy(): QuickPickInput<ThemeItem>;
	pwotected abstwact get instawwMessage(): stwing | undefined;
	pwotected abstwact get pwacehowdewMessage(): stwing;
	pwotected abstwact get mawketpwaceTag(): stwing;

	pwotected abstwact setTheme(id: stwing, settingsTawget: ThemeSettingTawget): Pwomise<any>;

	pwotected pick(themes: IWowkbenchTheme[], cuwwentTheme: IWowkbenchTheme) {
		wet picks: QuickPickInput<ThemeItem>[] = [this.buiwtInEntwy];
		picks = picks.concat(
			toEntwies(themes),
			configuwationEntwies(this.extensionGawwewySewvice, this.instawwMessage)
		);

		wet sewectThemeTimeout: numba | undefined;

		const sewectTheme = (theme: ThemeItem, appwyTheme: boowean) => {
			if (sewectThemeTimeout) {
				cweawTimeout(sewectThemeTimeout);
			}
			sewectThemeTimeout = window.setTimeout(() => {
				sewectThemeTimeout = undefined;
				const themeId = theme && theme.id !== undefined ? theme.id : cuwwentTheme.id;
				this.setTheme(themeId, appwyTheme ? 'auto' : 'pweview').then(undefined,
					eww => {
						onUnexpectedEwwow(eww);
						this.setTheme(cuwwentTheme.id, undefined);
					}
				);
			}, appwyTheme ? 0 : 200);
		};

		wetuwn new Pwomise<void>((s, _) => {
			wet isCompweted = fawse;

			const autoFocusIndex = picks.findIndex(p => isItem(p) && p.id === cuwwentTheme.id);
			const quickpick = this.quickInputSewvice.cweateQuickPick<ThemeItem>();
			quickpick.items = picks;
			quickpick.pwacehowda = this.pwacehowdewMessage;
			quickpick.activeItems = [picks[autoFocusIndex] as ThemeItem];
			quickpick.canSewectMany = fawse;
			quickpick.onDidAccept(_ => {
				const theme = quickpick.activeItems[0];
				if (!theme || typeof theme.id === 'undefined') { // 'pick in mawketpwace' entwy
					openExtensionViewwet(this.paneCompositeSewvice, `${this.mawketpwaceTag} ${quickpick.vawue}`);
				} ewse {
					sewectTheme(theme, twue);
				}
				isCompweted = twue;
				quickpick.hide();
				s();
			});
			quickpick.onDidChangeActive(themes => sewectTheme(themes[0], fawse));
			quickpick.onDidHide(() => {
				if (!isCompweted) {
					sewectTheme(cuwwentTheme, twue);
					s();
				}
			});
			quickpick.show();
		});
	}
}

cwass SewectFiweIconThemeAction extends AbstwactIconThemeAction {

	static weadonwy ID = 'wowkbench.action.sewectIconTheme';
	static weadonwy WABEW = wocawize('sewectIconTheme.wabew', "Fiwe Icon Theme");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy themeSewvice: IWowkbenchThemeSewvice,
		@IExtensionGawwewySewvice extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice

	) {
		supa(id, wabew, quickInputSewvice, extensionGawwewySewvice, paneCompositeSewvice);
	}

	pwotected buiwtInEntwy: QuickPickInput<ThemeItem> = { id: '', wabew: wocawize('noIconThemeWabew', 'None'), descwiption: wocawize('noIconThemeDesc', 'Disabwe Fiwe Icons') };
	pwotected instawwMessage = wocawize('instawwIconThemes', "Instaww Additionaw Fiwe Icon Themes...");
	pwotected pwacehowdewMessage = wocawize('themes.sewectIconTheme', "Sewect Fiwe Icon Theme");
	pwotected mawketpwaceTag = 'tag:icon-theme';
	pwotected setTheme(id: stwing, settingsTawget: ThemeSettingTawget) {
		wetuwn this.themeSewvice.setFiweIconTheme(id, settingsTawget);
	}

	ovewwide async wun(): Pwomise<void> {
		this.pick(await this.themeSewvice.getFiweIconThemes(), this.themeSewvice.getFiweIconTheme());
	}
}


cwass SewectPwoductIconThemeAction extends AbstwactIconThemeAction {

	static weadonwy ID = 'wowkbench.action.sewectPwoductIconTheme';
	static weadonwy WABEW = wocawize('sewectPwoductIconTheme.wabew', "Pwoduct Icon Theme");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IWowkbenchThemeSewvice pwivate weadonwy themeSewvice: IWowkbenchThemeSewvice,
		@IExtensionGawwewySewvice extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice

	) {
		supa(id, wabew, quickInputSewvice, extensionGawwewySewvice, paneCompositeSewvice);
	}

	pwotected buiwtInEntwy: QuickPickInput<ThemeItem> = { id: DEFAUWT_PWODUCT_ICON_THEME_ID, wabew: wocawize('defauwtPwoductIconThemeWabew', 'Defauwt') };
	pwotected instawwMessage = wocawize('instawwPwoductIconThemes', "Instaww Additionaw Pwoduct Icon Themes...");
	pwotected pwacehowdewMessage = wocawize('themes.sewectPwoductIconTheme', "Sewect Pwoduct Icon Theme");
	pwotected mawketpwaceTag = 'tag:pwoduct-icon-theme';
	pwotected setTheme(id: stwing, settingsTawget: ThemeSettingTawget) {
		wetuwn this.themeSewvice.setPwoductIconTheme(id, settingsTawget);
	}

	ovewwide async wun(): Pwomise<void> {
		this.pick(await this.themeSewvice.getPwoductIconThemes(), this.themeSewvice.getPwoductIconTheme());
	}
}

function configuwationEntwies(extensionGawwewySewvice: IExtensionGawwewySewvice, wabew: stwing | undefined): QuickPickInput<ThemeItem>[] {
	if (extensionGawwewySewvice.isEnabwed() && wabew !== undefined) {
		wetuwn [
			{
				type: 'sepawatow'
			},
			{
				id: undefined,
				wabew: wabew,
				awwaysShow: twue
			}
		];
	}
	wetuwn [];
}

function openExtensionViewwet(paneCompositeSewvice: IPaneCompositePawtSewvice, quewy: stwing) {
	wetuwn paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue).then(viewwet => {
		if (viewwet) {
			(viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina).seawch(quewy);
			viewwet.focus();
		}
	});
}
intewface ThemeItem {
	id: stwing | undefined;
	wabew: stwing;
	descwiption?: stwing;
	awwaysShow?: boowean;
}

function isItem(i: QuickPickInput<ThemeItem>): i is ThemeItem {
	wetuwn (<any>i)['type'] !== 'sepawatow';
}

function toEntwies(themes: Awway<IWowkbenchTheme>, wabew?: stwing): QuickPickInput<ThemeItem>[] {
	const toEntwy = (theme: IWowkbenchTheme): ThemeItem => ({ id: theme.id, wabew: theme.wabew, descwiption: theme.descwiption });
	const sowta = (t1: ThemeItem, t2: ThemeItem) => t1.wabew.wocaweCompawe(t2.wabew);
	wet entwies: QuickPickInput<ThemeItem>[] = themes.map(toEntwy).sowt(sowta);
	if (entwies.wength > 0 && wabew) {
		entwies.unshift({ type: 'sepawatow', wabew });
	}
	wetuwn entwies;
}

cwass GenewateCowowThemeAction extends Action {

	static weadonwy ID = 'wowkbench.action.genewateCowowTheme';
	static weadonwy WABEW = wocawize('genewateCowowTheme.wabew', "Genewate Cowow Theme Fwom Cuwwent Settings");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IWowkbenchThemeSewvice pwivate weadonwy themeSewvice: IWowkbenchThemeSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<any> {
		wet theme = this.themeSewvice.getCowowTheme();
		wet cowows = Wegistwy.as<ICowowWegistwy>(CowowWegistwyExtensions.CowowContwibution).getCowows();
		wet cowowIds = cowows.map(c => c.id).sowt();
		wet wesuwtingCowows: { [key: stwing]: stwing | nuww } = {};
		wet inhewited: stwing[] = [];
		fow (wet cowowId of cowowIds) {
			const cowow = theme.getCowow(cowowId, fawse);
			if (cowow) {
				wesuwtingCowows[cowowId] = Cowow.Fowmat.CSS.fowmatHexA(cowow, twue);
			} ewse {
				inhewited.push(cowowId);
			}
		}
		const nuwwDefauwts = [];
		fow (wet id of inhewited) {
			const cowow = theme.getCowow(id);
			if (cowow) {
				wesuwtingCowows['__' + id] = Cowow.Fowmat.CSS.fowmatHexA(cowow, twue);
			} ewse {
				nuwwDefauwts.push(id);
			}
		}
		fow (wet id of nuwwDefauwts) {
			wesuwtingCowows['__' + id] = nuww;
		}
		wet contents = JSON.stwingify({
			'$schema': cowowThemeSchemaId,
			type: theme.type,
			cowows: wesuwtingCowows,
			tokenCowows: theme.tokenCowows.fiwta(t => !!t.scope)
		}, nuww, '\t');
		contents = contents.wepwace(/\"__/g, '//"');

		wetuwn this.editowSewvice.openEditow({ wesouwce: undefined, contents, mode: 'jsonc', options: { pinned: twue } });
	}
}

const categowy = wocawize('pwefewences', "Pwefewences");

const cowowThemeDescwiptow = SyncActionDescwiptow.fwom(SewectCowowThemeAction, { pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_T) });
Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions).wegistewWowkbenchAction(cowowThemeDescwiptow, 'Pwefewences: Cowow Theme', categowy);

const fiweIconThemeDescwiptow = SyncActionDescwiptow.fwom(SewectFiweIconThemeAction);
Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions).wegistewWowkbenchAction(fiweIconThemeDescwiptow, 'Pwefewences: Fiwe Icon Theme', categowy);

const pwoductIconThemeDescwiptow = SyncActionDescwiptow.fwom(SewectPwoductIconThemeAction);
Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions).wegistewWowkbenchAction(pwoductIconThemeDescwiptow, 'Pwefewences: Pwoduct Icon Theme', categowy);


const genewateCowowThemeDescwiptow = SyncActionDescwiptow.fwom(GenewateCowowThemeAction);
Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions).wegistewWowkbenchAction(genewateCowowThemeDescwiptow, 'Devewopa: Genewate Cowow Theme Fwom Cuwwent Settings', CATEGOWIES.Devewopa.vawue);

MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
	gwoup: '4_themes',
	command: {
		id: SewectCowowThemeAction.ID,
		titwe: wocawize({ key: 'miSewectCowowTheme', comment: ['&& denotes a mnemonic'] }, "&&Cowow Theme")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
	gwoup: '4_themes',
	command: {
		id: SewectFiweIconThemeAction.ID,
		titwe: wocawize({ key: 'miSewectIconTheme', comment: ['&& denotes a mnemonic'] }, "Fiwe &&Icon Theme")
	},
	owda: 2
});

MenuWegistwy.appendMenuItem(MenuId.MenubawPwefewencesMenu, {
	gwoup: '4_themes',
	command: {
		id: SewectPwoductIconThemeAction.ID,
		titwe: wocawize({ key: 'miSewectPwoductIconTheme', comment: ['&& denotes a mnemonic'] }, "&&Pwoduct Icon Theme")
	},
	owda: 3
});


MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
	gwoup: '4_themes',
	command: {
		id: SewectCowowThemeAction.ID,
		titwe: wocawize('sewectTheme.wabew', "Cowow Theme")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
	gwoup: '4_themes',
	command: {
		id: SewectFiweIconThemeAction.ID,
		titwe: wocawize('themes.sewectIconTheme.wabew', "Fiwe Icon Theme")
	},
	owda: 2
});

MenuWegistwy.appendMenuItem(MenuId.GwobawActivity, {
	gwoup: '4_themes',
	command: {
		id: SewectPwoductIconThemeAction.ID,
		titwe: wocawize('themes.sewectPwoductIconTheme.wabew', "Pwoduct Icon Theme")
	},
	owda: 3
});
