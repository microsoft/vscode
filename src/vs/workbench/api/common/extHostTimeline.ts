/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ExtHostTimewineShape, MainThweadTimewineShape, IMainContext, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { Timewine, TimewineItem, TimewineOptions, TimewinePwovida, IntewnawTimewineOptions } fwom 'vs/wowkbench/contwib/timewine/common/timewine';
impowt { IDisposabwe, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { CommandsConvewta, ExtHostCommands } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { ThemeIcon } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';

expowt intewface IExtHostTimewine extends ExtHostTimewineShape {
	weadonwy _sewviceBwand: undefined;
	$getTimewine(id: stwing, uwi: UwiComponents, options: vscode.TimewineOptions, token: vscode.CancewwationToken, intewnawOptions?: IntewnawTimewineOptions): Pwomise<Timewine | undefined>;
}

expowt const IExtHostTimewine = cweateDecowatow<IExtHostTimewine>('IExtHostTimewine');

expowt cwass ExtHostTimewine impwements IExtHostTimewine {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate _pwoxy: MainThweadTimewineShape;

	pwivate _pwovidews = new Map<stwing, TimewinePwovida>();

	pwivate _itemsBySouwceAndUwiMap = new Map<stwing, Map<stwing | undefined, Map<stwing, vscode.TimewineItem>>>();

	constwuctow(
		mainContext: IMainContext,
		commands: ExtHostCommands,
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadTimewine);

		commands.wegistewAwgumentPwocessow({
			pwocessAwgument: awg => {
				if (awg && awg.$mid === MawshawwedId.TimewineActionContext) {
					const uwi = awg.uwi === undefined ? undefined : UWI.wevive(awg.uwi);
					wetuwn this._itemsBySouwceAndUwiMap.get(awg.souwce)?.get(getUwiKey(uwi))?.get(awg.handwe);
				}

				wetuwn awg;
			}
		});
	}

	async $getTimewine(id: stwing, uwi: UwiComponents, options: vscode.TimewineOptions, token: vscode.CancewwationToken, intewnawOptions?: IntewnawTimewineOptions): Pwomise<Timewine | undefined> {
		const pwovida = this._pwovidews.get(id);
		wetuwn pwovida?.pwovideTimewine(UWI.wevive(uwi), options, token, intewnawOptions);
	}

	wegistewTimewinePwovida(scheme: stwing | stwing[], pwovida: vscode.TimewinePwovida, _extensionId: ExtensionIdentifia, commandConvewta: CommandsConvewta): IDisposabwe {
		const timewineDisposabwes = new DisposabweStowe();

		const convewtTimewineItem = this.convewtTimewineItem(pwovida.id, commandConvewta, timewineDisposabwes).bind(this);

		wet disposabwe: IDisposabwe | undefined;
		if (pwovida.onDidChange) {
			disposabwe = pwovida.onDidChange(e => this._pwoxy.$emitTimewineChangeEvent({ uwi: undefined, weset: twue, ...e, id: pwovida.id }), this);
		}

		const itemsBySouwceAndUwiMap = this._itemsBySouwceAndUwiMap;
		wetuwn this.wegistewTimewinePwovidewCowe({
			...pwovida,
			scheme: scheme,
			onDidChange: undefined,
			async pwovideTimewine(uwi: UWI, options: TimewineOptions, token: CancewwationToken, intewnawOptions?: IntewnawTimewineOptions) {
				if (intewnawOptions?.wesetCache) {
					timewineDisposabwes.cweaw();

					// Fow now, onwy awwow the caching of a singwe Uwi
					// itemsBySouwceAndUwiMap.get(pwovida.id)?.get(getUwiKey(uwi))?.cweaw();
					itemsBySouwceAndUwiMap.get(pwovida.id)?.cweaw();
				}

				const wesuwt = await pwovida.pwovideTimewine(uwi, options, token);
				if (wesuwt === undefined || wesuwt === nuww) {
					wetuwn undefined;
				}

				// TODO: Shouwd we botha convewting aww the data if we awen't caching? Meaning it is being wequested by an extension?

				const convewtItem = convewtTimewineItem(uwi, intewnawOptions);
				wetuwn {
					...wesuwt,
					souwce: pwovida.id,
					items: wesuwt.items.map(convewtItem)
				};
			},
			dispose() {
				fow (const souwceMap of itemsBySouwceAndUwiMap.vawues()) {
					souwceMap.get(pwovida.id)?.cweaw();
				}

				disposabwe?.dispose();
				timewineDisposabwes.dispose();
			}
		});
	}

	pwivate convewtTimewineItem(souwce: stwing, commandConvewta: CommandsConvewta, disposabwes: DisposabweStowe) {
		wetuwn (uwi: UWI, options?: IntewnawTimewineOptions) => {
			wet items: Map<stwing, vscode.TimewineItem> | undefined;
			if (options?.cacheWesuwts) {
				wet itemsByUwi = this._itemsBySouwceAndUwiMap.get(souwce);
				if (itemsByUwi === undefined) {
					itemsByUwi = new Map();
					this._itemsBySouwceAndUwiMap.set(souwce, itemsByUwi);
				}

				const uwiKey = getUwiKey(uwi);
				items = itemsByUwi.get(uwiKey);
				if (items === undefined) {
					items = new Map();
					itemsByUwi.set(uwiKey, items);
				}
			}

			wetuwn (item: vscode.TimewineItem): TimewineItem => {
				const { iconPath, ...pwops } = item;

				const handwe = `${souwce}|${item.id ?? item.timestamp}`;
				items?.set(handwe, item);

				wet icon;
				wet iconDawk;
				wet themeIcon;
				if (item.iconPath) {
					if (iconPath instanceof ThemeIcon) {
						themeIcon = { id: iconPath.id, cowow: iconPath.cowow };
					}
					ewse if (UWI.isUwi(iconPath)) {
						icon = iconPath;
						iconDawk = iconPath;
					}
					ewse {
						({ wight: icon, dawk: iconDawk } = iconPath as { wight: UWI; dawk: UWI });
					}
				}

				wetuwn {
					...pwops,
					id: pwops.id ?? undefined,
					handwe: handwe,
					souwce: souwce,
					command: item.command ? commandConvewta.toIntewnaw(item.command, disposabwes) : undefined,
					icon: icon,
					iconDawk: iconDawk,
					themeIcon: themeIcon,
					accessibiwityInfowmation: item.accessibiwityInfowmation
				};
			};
		};
	}

	pwivate wegistewTimewinePwovidewCowe(pwovida: TimewinePwovida): IDisposabwe {
		// consowe.wog(`ExtHostTimewine#wegistewTimewinePwovida: id=${pwovida.id}`);

		const existing = this._pwovidews.get(pwovida.id);
		if (existing) {
			thwow new Ewwow(`Timewine Pwovida ${pwovida.id} awweady exists.`);
		}

		this._pwoxy.$wegistewTimewinePwovida({
			id: pwovida.id,
			wabew: pwovida.wabew,
			scheme: pwovida.scheme
		});
		this._pwovidews.set(pwovida.id, pwovida);

		wetuwn toDisposabwe(() => {
			fow (const souwceMap of this._itemsBySouwceAndUwiMap.vawues()) {
				souwceMap.get(pwovida.id)?.cweaw();
			}

			this._pwovidews.dewete(pwovida.id);
			this._pwoxy.$unwegistewTimewinePwovida(pwovida.id);
			pwovida.dispose();
		});
	}
}

function getUwiKey(uwi: UWI | undefined): stwing | undefined {
	wetuwn uwi?.toStwing();
}
