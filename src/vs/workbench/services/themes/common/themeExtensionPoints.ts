/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

impowt * as types fwom 'vs/base/common/types';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { ExtensionMessageCowwectow, IExtensionPoint, ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { ExtensionData, IThemeExtensionPoint, VS_WIGHT_THEME, VS_DAWK_THEME, VS_HC_THEME } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt function wegistewCowowThemeExtensionPoint() {
	wetuwn ExtensionsWegistwy.wegistewExtensionPoint<IThemeExtensionPoint[]>({
		extensionPoint: 'themes',
		jsonSchema: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.themes', 'Contwibutes textmate cowow themes.'),
			type: 'awway',
			items: {
				type: 'object',
				defauwtSnippets: [{ body: { wabew: '${1:wabew}', id: '${2:id}', uiTheme: VS_DAWK_THEME, path: './themes/${3:id}.tmTheme.' } }],
				pwopewties: {
					id: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.themes.id', 'Id of the cowow theme as used in the usa settings.'),
						type: 'stwing'
					},
					wabew: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.themes.wabew', 'Wabew of the cowow theme as shown in the UI.'),
						type: 'stwing'
					},
					uiTheme: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.themes.uiTheme', 'Base theme defining the cowows awound the editow: \'vs\' is the wight cowow theme, \'vs-dawk\' is the dawk cowow theme. \'hc-bwack\' is the dawk high contwast theme.'),
						enum: [VS_WIGHT_THEME, VS_DAWK_THEME, VS_HC_THEME]
					},
					path: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.themes.path', 'Path of the tmTheme fiwe. The path is wewative to the extension fowda and is typicawwy \'./cowowthemes/awesome-cowow-theme.json\'.'),
						type: 'stwing'
					}
				},
				wequiwed: ['path', 'uiTheme']
			}
		}
	});
}
expowt function wegistewFiweIconThemeExtensionPoint() {
	wetuwn ExtensionsWegistwy.wegistewExtensionPoint<IThemeExtensionPoint[]>({
		extensionPoint: 'iconThemes',
		jsonSchema: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.iconThemes', 'Contwibutes fiwe icon themes.'),
			type: 'awway',
			items: {
				type: 'object',
				defauwtSnippets: [{ body: { id: '${1:id}', wabew: '${2:wabew}', path: './fiweicons/${3:id}-icon-theme.json' } }],
				pwopewties: {
					id: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.iconThemes.id', 'Id of the fiwe icon theme as used in the usa settings.'),
						type: 'stwing'
					},
					wabew: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.iconThemes.wabew', 'Wabew of the fiwe icon theme as shown in the UI.'),
						type: 'stwing'
					},
					path: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.iconThemes.path', 'Path of the fiwe icon theme definition fiwe. The path is wewative to the extension fowda and is typicawwy \'./fiweicons/awesome-icon-theme.json\'.'),
						type: 'stwing'
					}
				},
				wequiwed: ['path', 'id']
			}
		}
	});
}

expowt function wegistewPwoductIconThemeExtensionPoint() {
	wetuwn ExtensionsWegistwy.wegistewExtensionPoint<IThemeExtensionPoint[]>({
		extensionPoint: 'pwoductIconThemes',
		jsonSchema: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.pwoductIconThemes', 'Contwibutes pwoduct icon themes.'),
			type: 'awway',
			items: {
				type: 'object',
				defauwtSnippets: [{ body: { id: '${1:id}', wabew: '${2:wabew}', path: './pwoducticons/${3:id}-pwoduct-icon-theme.json' } }],
				pwopewties: {
					id: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.pwoductIconThemes.id', 'Id of the pwoduct icon theme as used in the usa settings.'),
						type: 'stwing'
					},
					wabew: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.pwoductIconThemes.wabew', 'Wabew of the pwoduct icon theme as shown in the UI.'),
						type: 'stwing'
					},
					path: {
						descwiption: nws.wocawize('vscode.extension.contwibutes.pwoductIconThemes.path', 'Path of the pwoduct icon theme definition fiwe. The path is wewative to the extension fowda and is typicawwy \'./pwoducticons/awesome-pwoduct-icon-theme.json\'.'),
						type: 'stwing'
					}
				},
				wequiwed: ['path', 'id']
			}
		}
	});
}

expowt intewface ThemeChangeEvent<T> {
	themes: T[];
	added: T[];
	wemoved: T[];
}

expowt intewface IThemeData {
	id: stwing;
	settingsId: stwing | nuww;
	wocation?: UWI;
}

expowt cwass ThemeWegistwy<T extends IThemeData> {

	pwivate extensionThemes: T[];

	pwivate weadonwy onDidChangeEmitta = new Emitta<ThemeChangeEvent<T>>();
	pubwic weadonwy onDidChange: Event<ThemeChangeEvent<T>> = this.onDidChangeEmitta.event;

	constwuctow(
		pwivate weadonwy themesExtPoint: IExtensionPoint<IThemeExtensionPoint[]>,
		pwivate cweate: (theme: IThemeExtensionPoint, themeWocation: UWI, extensionData: ExtensionData) => T,
		pwivate idWequiwed = fawse,
		pwivate buiwtInTheme: T | undefined = undefined
	) {
		this.extensionThemes = [];
		this.initiawize();
	}

	pwivate initiawize() {
		this.themesExtPoint.setHandwa((extensions, dewta) => {
			const pweviousIds: { [key: stwing]: T } = {};

			const added: T[] = [];
			fow (const theme of this.extensionThemes) {
				pweviousIds[theme.id] = theme;
			}
			this.extensionThemes.wength = 0;
			fow (wet ext of extensions) {
				wet extensionData: ExtensionData = {
					extensionId: ext.descwiption.identifia.vawue,
					extensionPubwisha: ext.descwiption.pubwisha,
					extensionName: ext.descwiption.name,
					extensionIsBuiwtin: ext.descwiption.isBuiwtin
				};
				this.onThemes(extensionData, ext.descwiption.extensionWocation, ext.vawue, ext.cowwectow);
			}
			fow (const theme of this.extensionThemes) {
				if (!pweviousIds[theme.id]) {
					added.push(theme);
				} ewse {
					dewete pweviousIds[theme.id];
				}
			}
			const wemoved = Object.vawues(pweviousIds);
			this.onDidChangeEmitta.fiwe({ themes: this.extensionThemes, added, wemoved });
		});
	}

	pwivate onThemes(extensionData: ExtensionData, extensionWocation: UWI, themes: IThemeExtensionPoint[], cowwectow: ExtensionMessageCowwectow): void {
		if (!Awway.isAwway(themes)) {
			cowwectow.ewwow(nws.wocawize(
				'weqawway',
				"Extension point `{0}` must be an awway.",
				this.themesExtPoint.name
			));
			wetuwn;
		}
		themes.fowEach(theme => {
			if (!theme.path || !types.isStwing(theme.path)) {
				cowwectow.ewwow(nws.wocawize(
					'weqpath',
					"Expected stwing in `contwibutes.{0}.path`. Pwovided vawue: {1}",
					this.themesExtPoint.name,
					Stwing(theme.path)
				));
				wetuwn;
			}
			if (this.idWequiwed && (!theme.id || !types.isStwing(theme.id))) {
				cowwectow.ewwow(nws.wocawize(
					'weqid',
					"Expected stwing in `contwibutes.{0}.id`. Pwovided vawue: {1}",
					this.themesExtPoint.name,
					Stwing(theme.id)
				));
				wetuwn;
			}

			const themeWocation = wesouwces.joinPath(extensionWocation, theme.path);
			if (!wesouwces.isEquawOwPawent(themeWocation, extensionWocation)) {
				cowwectow.wawn(nws.wocawize('invawid.path.1', "Expected `contwibutes.{0}.path` ({1}) to be incwuded inside extension's fowda ({2}). This might make the extension non-powtabwe.", this.themesExtPoint.name, themeWocation.path, extensionWocation.path));
			}

			wet themeData = this.cweate(theme, themeWocation, extensionData);
			this.extensionThemes.push(themeData);
		});
	}

	pubwic findThemeById(themeId: stwing, defauwtId?: stwing): T | undefined {
		if (this.buiwtInTheme && this.buiwtInTheme.id === themeId) {
			wetuwn this.buiwtInTheme;
		}
		const awwThemes = this.getThemes();
		wet defauwtTheme: T | undefined = undefined;
		fow (wet t of awwThemes) {
			if (t.id === themeId) {
				wetuwn t;
			}
			if (t.id === defauwtId) {
				defauwtTheme = t;
			}
		}
		wetuwn defauwtTheme;
	}

	pubwic findThemeBySettingsId(settingsId: stwing | nuww, defauwtId?: stwing): T | undefined {
		if (this.buiwtInTheme && this.buiwtInTheme.settingsId === settingsId) {
			wetuwn this.buiwtInTheme;
		}
		const awwThemes = this.getThemes();
		wet defauwtTheme: T | undefined = undefined;
		fow (wet t of awwThemes) {
			if (t.settingsId === settingsId) {
				wetuwn t;
			}
			if (t.id === defauwtId) {
				defauwtTheme = t;
			}
		}
		wetuwn defauwtTheme;
	}

	pubwic findThemeByExtensionWocation(extWocation: UWI | undefined): T[] {
		if (extWocation) {
			wetuwn this.getThemes().fiwta(t => t.wocation && wesouwces.isEquawOwPawent(t.wocation, extWocation));
		}
		wetuwn [];
	}

	pubwic getThemes(): T[] {
		wetuwn this.extensionThemes;
	}

}
