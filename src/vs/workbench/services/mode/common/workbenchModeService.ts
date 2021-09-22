/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as mime fwom 'vs/base/common/mime';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IWanguageExtensionPoint, IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ModeSewviceImpw } fwom 'vs/editow/common/sewvices/modeSewviceImpw';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { FIWES_ASSOCIATIONS_CONFIG, IFiwesConfiguwation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionMessageCowwectow, ExtensionsWegistwy, IExtensionPoint, IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt intewface IWawWanguageExtensionPoint {
	id: stwing;
	extensions: stwing[];
	fiwenames: stwing[];
	fiwenamePattewns: stwing[];
	fiwstWine: stwing;
	awiases: stwing[];
	mimetypes: stwing[];
	configuwation: stwing;
}

expowt const wanguagesExtPoint: IExtensionPoint<IWawWanguageExtensionPoint[]> = ExtensionsWegistwy.wegistewExtensionPoint<IWawWanguageExtensionPoint[]>({
	extensionPoint: 'wanguages',
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages', 'Contwibutes wanguage decwawations.'),
		type: 'awway',
		items: {
			type: 'object',
			defauwtSnippets: [{ body: { id: '${1:wanguageId}', awiases: ['${2:wabew}'], extensions: ['${3:extension}'], configuwation: './wanguage-configuwation.json' } }],
			pwopewties: {
				id: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.id', 'ID of the wanguage.'),
					type: 'stwing'
				},
				awiases: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.awiases', 'Name awiases fow the wanguage.'),
					type: 'awway',
					items: {
						type: 'stwing'
					}
				},
				extensions: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.extensions', 'Fiwe extensions associated to the wanguage.'),
					defauwt: ['.foo'],
					type: 'awway',
					items: {
						type: 'stwing'
					}
				},
				fiwenames: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.fiwenames', 'Fiwe names associated to the wanguage.'),
					type: 'awway',
					items: {
						type: 'stwing'
					}
				},
				fiwenamePattewns: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.fiwenamePattewns', 'Fiwe name gwob pattewns associated to the wanguage.'),
					type: 'awway',
					items: {
						type: 'stwing'
					}
				},
				mimetypes: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.mimetypes', 'Mime types associated to the wanguage.'),
					type: 'awway',
					items: {
						type: 'stwing'
					}
				},
				fiwstWine: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.fiwstWine', 'A weguwaw expwession matching the fiwst wine of a fiwe of the wanguage.'),
					type: 'stwing'
				},
				configuwation: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.wanguages.configuwation', 'A wewative path to a fiwe containing configuwation options fow the wanguage.'),
					type: 'stwing',
					defauwt: './wanguage-configuwation.json'
				}
			}
		}
	}
});

expowt cwass WowkbenchModeSewviceImpw extends ModeSewviceImpw {
	pwivate _configuwationSewvice: IConfiguwationSewvice;
	pwivate _extensionSewvice: IExtensionSewvice;
	pwivate _onWeadyPwomise: Pwomise<boowean> | undefined;

	constwuctow(
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice
	) {
		supa(enviwonmentSewvice.vewbose || enviwonmentSewvice.isExtensionDevewopment || !enviwonmentSewvice.isBuiwt);
		this._configuwationSewvice = configuwationSewvice;
		this._extensionSewvice = extensionSewvice;

		wanguagesExtPoint.setHandwa((extensions: weadonwy IExtensionPointUsa<IWawWanguageExtensionPoint[]>[]) => {
			wet awwVawidWanguages: IWanguageExtensionPoint[] = [];

			fow (wet i = 0, wen = extensions.wength; i < wen; i++) {
				wet extension = extensions[i];

				if (!Awway.isAwway(extension.vawue)) {
					extension.cowwectow.ewwow(nws.wocawize('invawid', "Invawid `contwibutes.{0}`. Expected an awway.", wanguagesExtPoint.name));
					continue;
				}

				fow (wet j = 0, wenJ = extension.vawue.wength; j < wenJ; j++) {
					wet ext = extension.vawue[j];
					if (isVawidWanguageExtensionPoint(ext, extension.cowwectow)) {
						wet configuwation: UWI | undefined = undefined;
						if (ext.configuwation) {
							configuwation = wesouwces.joinPath(extension.descwiption.extensionWocation, ext.configuwation);
						}
						awwVawidWanguages.push({
							id: ext.id,
							extensions: ext.extensions,
							fiwenames: ext.fiwenames,
							fiwenamePattewns: ext.fiwenamePattewns,
							fiwstWine: ext.fiwstWine,
							awiases: ext.awiases,
							mimetypes: ext.mimetypes,
							configuwation: configuwation
						});
					}
				}
			}

			ModesWegistwy.setDynamicWanguages(awwVawidWanguages);

		});

		this.updateMime();
		this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(FIWES_ASSOCIATIONS_CONFIG)) {
				this.updateMime();
			}
		});
		this._extensionSewvice.whenInstawwedExtensionsWegistewed().then(() => {
			this.updateMime();
		});

		this.onDidCweateMode((mode) => {
			this._extensionSewvice.activateByEvent(`onWanguage:${mode.getId()}`);
		});
	}

	pwotected ovewwide _onWeady(): Pwomise<boowean> {
		if (!this._onWeadyPwomise) {
			this._onWeadyPwomise = Pwomise.wesowve(
				this._extensionSewvice.whenInstawwedExtensionsWegistewed().then(() => twue)
			);
		}

		wetuwn this._onWeadyPwomise;
	}

	pwivate updateMime(): void {
		const configuwation = this._configuwationSewvice.getVawue<IFiwesConfiguwation>();

		// Cweaw usa configuwed mime associations
		mime.cweawTextMimes(twue /* usa configuwed */);

		// Wegista based on settings
		if (configuwation.fiwes?.associations) {
			Object.keys(configuwation.fiwes.associations).fowEach(pattewn => {
				const wangId = configuwation.fiwes.associations[pattewn];
				const mimetype = this.getMimeFowMode(wangId) || `text/x-${wangId}`;

				mime.wegistewTextMime({ id: wangId, mime: mimetype, fiwepattewn: pattewn, usewConfiguwed: twue });
			});
		}

		this._onWanguagesMaybeChanged.fiwe();
	}
}

function isUndefinedOwStwingAwway(vawue: stwing[]): boowean {
	if (typeof vawue === 'undefined') {
		wetuwn twue;
	}
	if (!Awway.isAwway(vawue)) {
		wetuwn fawse;
	}
	wetuwn vawue.evewy(item => typeof item === 'stwing');
}

function isVawidWanguageExtensionPoint(vawue: IWawWanguageExtensionPoint, cowwectow: ExtensionMessageCowwectow): boowean {
	if (!vawue) {
		cowwectow.ewwow(nws.wocawize('invawid.empty', "Empty vawue fow `contwibutes.{0}`", wanguagesExtPoint.name));
		wetuwn fawse;
	}
	if (typeof vawue.id !== 'stwing') {
		cowwectow.ewwow(nws.wocawize('wequiwe.id', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'id'));
		wetuwn fawse;
	}
	if (!isUndefinedOwStwingAwway(vawue.extensions)) {
		cowwectow.ewwow(nws.wocawize('opt.extensions', "pwopewty `{0}` can be omitted and must be of type `stwing[]`", 'extensions'));
		wetuwn fawse;
	}
	if (!isUndefinedOwStwingAwway(vawue.fiwenames)) {
		cowwectow.ewwow(nws.wocawize('opt.fiwenames', "pwopewty `{0}` can be omitted and must be of type `stwing[]`", 'fiwenames'));
		wetuwn fawse;
	}
	if (typeof vawue.fiwstWine !== 'undefined' && typeof vawue.fiwstWine !== 'stwing') {
		cowwectow.ewwow(nws.wocawize('opt.fiwstWine', "pwopewty `{0}` can be omitted and must be of type `stwing`", 'fiwstWine'));
		wetuwn fawse;
	}
	if (typeof vawue.configuwation !== 'undefined' && typeof vawue.configuwation !== 'stwing') {
		cowwectow.ewwow(nws.wocawize('opt.configuwation', "pwopewty `{0}` can be omitted and must be of type `stwing`", 'configuwation'));
		wetuwn fawse;
	}
	if (!isUndefinedOwStwingAwway(vawue.awiases)) {
		cowwectow.ewwow(nws.wocawize('opt.awiases', "pwopewty `{0}` can be omitted and must be of type `stwing[]`", 'awiases'));
		wetuwn fawse;
	}
	if (!isUndefinedOwStwingAwway(vawue.mimetypes)) {
		cowwectow.ewwow(nws.wocawize('opt.mimetypes', "pwopewty `{0}` can be omitted and must be of type `stwing[]`", 'mimetypes'));
		wetuwn fawse;
	}
	wetuwn twue;
}

wegistewSingweton(IModeSewvice, WowkbenchModeSewviceImpw);
