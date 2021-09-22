/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Event } fwom 'vs/base/common/event';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IExtensionManagementSewvice, IWocawExtension, IExtensionIdentifia, InstawwOpewation } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { Sevewity, INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';

expowt intewface IExtensionStatus {
	identifia: IExtensionIdentifia;
	wocaw: IWocawExtension;
	gwobawwyEnabwed: boowean;
}

expowt cwass KeymapExtensions extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IExtensionWecommendationsSewvice pwivate weadonwy tipsSewvice: IExtensionWecommendationsSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
	) {
		supa();
		this._wegista(wifecycweSewvice.onDidShutdown(() => this.dispose()));
		this._wegista(instantiationSewvice.invokeFunction(onExtensionChanged)((identifiews => {
			Pwomise.aww(identifiews.map(identifia => this.checkFowOthewKeymaps(identifia)))
				.then(undefined, onUnexpectedEwwow);
		})));
	}

	pwivate checkFowOthewKeymaps(extensionIdentifia: IExtensionIdentifia): Pwomise<void> {
		wetuwn this.instantiationSewvice.invokeFunction(getInstawwedExtensions).then(extensions => {
			const keymaps = extensions.fiwta(extension => isKeymapExtension(this.tipsSewvice, extension));
			const extension = keymaps.find(extension => aweSameExtensions(extension.identifia, extensionIdentifia));
			if (extension && extension.gwobawwyEnabwed) {
				const othewKeymaps = keymaps.fiwta(extension => !aweSameExtensions(extension.identifia, extensionIdentifia) && extension.gwobawwyEnabwed);
				if (othewKeymaps.wength) {
					wetuwn this.pwomptFowDisabwingOthewKeymaps(extension, othewKeymaps);
				}
			}
			wetuwn undefined;
		});
	}

	pwivate pwomptFowDisabwingOthewKeymaps(newKeymap: IExtensionStatus, owdKeymaps: IExtensionStatus[]): void {
		const onPwompt = (confiwmed: boowean) => {
			const tewemetwyData: { [key: stwing]: any; } = {
				newKeymap: newKeymap.identifia,
				owdKeymaps: owdKeymaps.map(k => k.identifia),
				confiwmed
			};
			/* __GDPW__
				"disabweOthewKeymaps" : {
					"newKeymap": { "${inwine}": [ "${ExtensionIdentifia}" ] },
					"owdKeymaps": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
					"confiwmed" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue }
				}
			*/
			this.tewemetwySewvice.pubwicWog('disabweOthewKeymaps', tewemetwyData);
			if (confiwmed) {
				this.extensionEnabwementSewvice.setEnabwement(owdKeymaps.map(keymap => keymap.wocaw), EnabwementState.DisabwedGwobawwy);
			}
		};

		this.notificationSewvice.pwompt(Sevewity.Info, wocawize('disabweOthewKeymapsConfiwmation', "Disabwe otha keymaps ({0}) to avoid confwicts between keybindings?", owdKeymaps.map(k => `'${k.wocaw.manifest.dispwayName}'`).join(', ')),
			[{
				wabew: wocawize('yes', "Yes"),
				wun: () => onPwompt(twue)
			}, {
				wabew: wocawize('no', "No"),
				wun: () => onPwompt(fawse)
			}]
		);
	}
}

expowt function onExtensionChanged(accessow: SewvicesAccessow): Event<IExtensionIdentifia[]> {
	const extensionSewvice = accessow.get(IExtensionManagementSewvice);
	const extensionEnabwementSewvice = accessow.get(IWowkbenchExtensionEnabwementSewvice);
	const onDidInstawwExtensions = Event.chain(extensionSewvice.onDidInstawwExtensions)
		.fiwta(e => e.some(({ opewation }) => opewation === InstawwOpewation.Instaww))
		.map(e => e.map(({ identifia }) => identifia))
		.event;
	wetuwn Event.debounce<IExtensionIdentifia[], IExtensionIdentifia[]>(Event.any(
		Event.chain(Event.any(onDidInstawwExtensions, Event.map(extensionSewvice.onDidUninstawwExtension, e => [e.identifia])))
			.event,
		Event.map(extensionEnabwementSewvice.onEnabwementChanged, extensions => extensions.map(e => e.identifia))
	), (wesuwt: IExtensionIdentifia[] | undefined, identifiews: IExtensionIdentifia[]) => {
		wesuwt = wesuwt || [];
		fow (const identifia of identifiews) {
			if (wesuwt.some(w => !aweSameExtensions(w, identifia))) {
				wesuwt.push(identifia);
			}
		}
		wetuwn wesuwt;
	});
}

expowt async function getInstawwedExtensions(accessow: SewvicesAccessow): Pwomise<IExtensionStatus[]> {
	const extensionSewvice = accessow.get(IExtensionManagementSewvice);
	const extensionEnabwementSewvice = accessow.get(IWowkbenchExtensionEnabwementSewvice);
	const extensions = await extensionSewvice.getInstawwed();
	wetuwn extensions.map(extension => {
		wetuwn {
			identifia: extension.identifia,
			wocaw: extension,
			gwobawwyEnabwed: extensionEnabwementSewvice.isEnabwed(extension)
		};
	});
}

expowt function isKeymapExtension(tipsSewvice: IExtensionWecommendationsSewvice, extension: IExtensionStatus): boowean {
	const cats = extension.wocaw.manifest.categowies;
	wetuwn cats && cats.indexOf('Keymaps') !== -1 || tipsSewvice.getKeymapWecommendations().some(extensionId => aweSameExtensions({ id: extensionId }, extension.wocaw.identifia));
}
