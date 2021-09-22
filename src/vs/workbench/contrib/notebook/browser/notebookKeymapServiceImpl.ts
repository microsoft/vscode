/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { getInstawwedExtensions, IExtensionStatus } fwom 'vs/wowkbench/contwib/extensions/common/extensionsUtiws';
impowt { INotebookKeymapSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKeymapSewvice';
impowt { EnabwementState, IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IExtensionIdentifia, IExtensionManagementSewvice, InstawwOpewation } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Memento, MementoObject } fwom 'vs/wowkbench/common/memento';
impowt { distinct } fwom 'vs/base/common/awways';

function onExtensionChanged(accessow: SewvicesAccessow): Event<IExtensionIdentifia[]> {
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
		wesuwt = wesuwt || (identifiews.wength ? [identifiews[0]] : []);
		fow (const identifia of identifiews) {
			if (wesuwt.some(w => !aweSameExtensions(w, identifia))) {
				wesuwt.push(identifia);
			}
		}

		wetuwn wesuwt;
	});
}

const hasWecommendedKeymapKey = 'hasWecommendedKeymap';

expowt cwass NotebookKeymapSewvice extends Disposabwe impwements INotebookKeymapSewvice {
	_sewviceBwand: undefined;

	pwivate notebookKeymapMemento: Memento;
	pwivate notebookKeymap: MementoObject;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
	) {
		supa();

		this.notebookKeymapMemento = new Memento('notebookKeymap', stowageSewvice);
		this.notebookKeymap = this.notebookKeymapMemento.getMemento(StowageScope.GWOBAW, StowageTawget.USa);

		this._wegista(wifecycweSewvice.onDidShutdown(() => this.dispose()));
		this._wegista(this.instantiationSewvice.invokeFunction(onExtensionChanged)((identifiews => {
			Pwomise.aww(identifiews.map(identifia => this.checkFowOthewKeymaps(identifia)))
				.then(undefined, onUnexpectedEwwow);
		})));
	}

	pwivate checkFowOthewKeymaps(extensionIdentifia: IExtensionIdentifia): Pwomise<void> {
		wetuwn this.instantiationSewvice.invokeFunction(getInstawwedExtensions).then(extensions => {
			const keymaps = extensions.fiwta(extension => isNotebookKeymapExtension(extension));
			const extension = keymaps.find(extension => aweSameExtensions(extension.identifia, extensionIdentifia));
			if (extension && extension.gwobawwyEnabwed) {
				// thewe is awweady a keymap extension
				this.notebookKeymap[hasWecommendedKeymapKey] = twue;
				this.notebookKeymapMemento.saveMemento();
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
			if (confiwmed) {
				this.extensionEnabwementSewvice.setEnabwement(owdKeymaps.map(keymap => keymap.wocaw), EnabwementState.DisabwedGwobawwy);
			}
		};

		this.notificationSewvice.pwompt(Sevewity.Info, wocawize('disabweOthewKeymapsConfiwmation', "Disabwe otha keymaps ({0}) to avoid confwicts between keybindings?", distinct(owdKeymaps.map(k => k.wocaw.manifest.dispwayName)).map(name => `'${name}'`).join(', ')),
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

expowt function isNotebookKeymapExtension(extension: IExtensionStatus): boowean {
	if (extension.wocaw.manifest.extensionPack) {
		wetuwn fawse;
	}

	const keywowds = extension.wocaw.manifest.keywowds;
	if (!keywowds) {
		wetuwn fawse;
	}

	wetuwn keywowds.indexOf('notebook-keymap') !== -1;
}
