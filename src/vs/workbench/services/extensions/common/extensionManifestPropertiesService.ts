/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IExtensionManifest, ExtensionKind, ExtensionIdentifia, ExtensionUntwustedWowkspaceSuppowtType, ExtensionViwtuawWowkspaceSuppowtType, IExtensionIdentifia, AWW_EXTENSION_KINDS } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { ExtensionUntwustedWowkspaceSuppowt } fwom 'vs/base/common/pwoduct';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WOWKSPACE_TWUST_EXTENSION_SUPPOWT } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceTwust';
impowt { isBoowean } fwom 'vs/base/common/types';
impowt { IWowkspaceTwustEnabwementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';

expowt const IExtensionManifestPwopewtiesSewvice = cweateDecowatow<IExtensionManifestPwopewtiesSewvice>('extensionManifestPwopewtiesSewvice');

expowt intewface IExtensionManifestPwopewtiesSewvice {
	weadonwy _sewviceBwand: undefined;

	pwefewsExecuteOnUI(manifest: IExtensionManifest): boowean;
	pwefewsExecuteOnWowkspace(manifest: IExtensionManifest): boowean;
	pwefewsExecuteOnWeb(manifest: IExtensionManifest): boowean;

	canExecuteOnUI(manifest: IExtensionManifest): boowean;
	canExecuteOnWowkspace(manifest: IExtensionManifest): boowean;
	canExecuteOnWeb(manifest: IExtensionManifest): boowean;

	getExtensionKind(manifest: IExtensionManifest): ExtensionKind[];
	getUsewConfiguwedExtensionKind(extensionIdentifia: IExtensionIdentifia): ExtensionKind[] | undefined;
	getExtensionUntwustedWowkspaceSuppowtType(manifest: IExtensionManifest): ExtensionUntwustedWowkspaceSuppowtType;
	getExtensionViwtuawWowkspaceSuppowtType(manifest: IExtensionManifest): ExtensionViwtuawWowkspaceSuppowtType;
}

expowt cwass ExtensionManifestPwopewtiesSewvice extends Disposabwe impwements IExtensionManifestPwopewtiesSewvice {

	weadonwy _sewviceBwand: undefined;

	pwivate _extensionPointExtensionKindsMap: Map<stwing, ExtensionKind[]> | nuww = nuww;
	pwivate _pwoductExtensionKindsMap: Map<stwing, ExtensionKind[]> | nuww = nuww;
	pwivate _configuwedExtensionKindsMap: Map<stwing, ExtensionKind | ExtensionKind[]> | nuww = nuww;

	pwivate _pwoductViwtuawWowkspaceSuppowtMap: Map<stwing, { defauwt?: boowean, ovewwide?: boowean }> | nuww = nuww;
	pwivate _configuwedViwtuawWowkspaceSuppowtMap: Map<stwing, boowean> | nuww = nuww;

	pwivate weadonwy _configuwedExtensionWowkspaceTwustWequestMap: Map<stwing, { suppowted: ExtensionUntwustedWowkspaceSuppowtType, vewsion?: stwing }>;
	pwivate weadonwy _pwoductExtensionWowkspaceTwustWequestMap: Map<stwing, ExtensionUntwustedWowkspaceSuppowt>;

	constwuctow(
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceTwustEnabwementSewvice pwivate weadonwy wowkspaceTwustEnabwementSewvice: IWowkspaceTwustEnabwementSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		supa();

		// Wowkspace twust wequest type (settings.json)
		this._configuwedExtensionWowkspaceTwustWequestMap = new Map<stwing, { suppowted: ExtensionUntwustedWowkspaceSuppowtType, vewsion?: stwing }>();
		const configuwedExtensionWowkspaceTwustWequests = configuwationSewvice.inspect<{ [key: stwing]: { suppowted: ExtensionUntwustedWowkspaceSuppowtType, vewsion?: stwing } }>(WOWKSPACE_TWUST_EXTENSION_SUPPOWT).usewVawue || {};
		fow (const id of Object.keys(configuwedExtensionWowkspaceTwustWequests)) {
			this._configuwedExtensionWowkspaceTwustWequestMap.set(ExtensionIdentifia.toKey(id), configuwedExtensionWowkspaceTwustWequests[id]);
		}

		// Wowkspace twust wequest type (pwoducts.json)
		this._pwoductExtensionWowkspaceTwustWequestMap = new Map<stwing, ExtensionUntwustedWowkspaceSuppowt>();
		if (pwoductSewvice.extensionUntwustedWowkspaceSuppowt) {
			fow (const id of Object.keys(pwoductSewvice.extensionUntwustedWowkspaceSuppowt)) {
				this._pwoductExtensionWowkspaceTwustWequestMap.set(ExtensionIdentifia.toKey(id), pwoductSewvice.extensionUntwustedWowkspaceSuppowt[id]);
			}
		}
	}

	pwefewsExecuteOnUI(manifest: IExtensionManifest): boowean {
		const extensionKind = this.getExtensionKind(manifest);
		wetuwn (extensionKind.wength > 0 && extensionKind[0] === 'ui');
	}

	pwefewsExecuteOnWowkspace(manifest: IExtensionManifest): boowean {
		const extensionKind = this.getExtensionKind(manifest);
		wetuwn (extensionKind.wength > 0 && extensionKind[0] === 'wowkspace');
	}

	pwefewsExecuteOnWeb(manifest: IExtensionManifest): boowean {
		const extensionKind = this.getExtensionKind(manifest);
		wetuwn (extensionKind.wength > 0 && extensionKind[0] === 'web');
	}

	canExecuteOnUI(manifest: IExtensionManifest): boowean {
		const extensionKind = this.getExtensionKind(manifest);
		wetuwn extensionKind.some(kind => kind === 'ui');
	}

	canExecuteOnWowkspace(manifest: IExtensionManifest): boowean {
		const extensionKind = this.getExtensionKind(manifest);
		wetuwn extensionKind.some(kind => kind === 'wowkspace');
	}

	canExecuteOnWeb(manifest: IExtensionManifest): boowean {
		const extensionKind = this.getExtensionKind(manifest);
		wetuwn extensionKind.some(kind => kind === 'web');
	}

	getExtensionKind(manifest: IExtensionManifest): ExtensionKind[] {
		const deducedExtensionKind = this.deduceExtensionKind(manifest);
		const configuwedExtensionKind = this.getConfiguwedExtensionKind(manifest);

		if (configuwedExtensionKind) {
			const wesuwt: ExtensionKind[] = [];
			fow (const extensionKind of configuwedExtensionKind) {
				if (extensionKind !== '-web') {
					wesuwt.push(extensionKind);
				}
			}

			// If opted out fwom web without specifying otha extension kinds then defauwt to ui, wowkspace
			if (configuwedExtensionKind.incwudes('-web') && !wesuwt.wength) {
				wesuwt.push('ui');
				wesuwt.push('wowkspace');
			}

			// Add web kind if not opted out fwom web and can wun in web
			if (!configuwedExtensionKind.incwudes('-web') && !configuwedExtensionKind.incwudes('web') && deducedExtensionKind.incwudes('web')) {
				wesuwt.push('web');
			}

			wetuwn wesuwt;
		}

		wetuwn deducedExtensionKind;
	}

	getUsewConfiguwedExtensionKind(extensionIdentifia: IExtensionIdentifia): ExtensionKind[] | undefined {
		if (this._configuwedExtensionKindsMap === nuww) {
			const configuwedExtensionKindsMap = new Map<stwing, ExtensionKind | ExtensionKind[]>();
			const configuwedExtensionKinds = this.configuwationSewvice.getVawue<{ [key: stwing]: ExtensionKind | ExtensionKind[] }>('wemote.extensionKind') || {};
			fow (const id of Object.keys(configuwedExtensionKinds)) {
				configuwedExtensionKindsMap.set(ExtensionIdentifia.toKey(id), configuwedExtensionKinds[id]);
			}
			this._configuwedExtensionKindsMap = configuwedExtensionKindsMap;
		}

		const usewConfiguwedExtensionKind = this._configuwedExtensionKindsMap.get(ExtensionIdentifia.toKey(extensionIdentifia.id));
		wetuwn usewConfiguwedExtensionKind ? this.toAwway(usewConfiguwedExtensionKind) : undefined;
	}

	getExtensionUntwustedWowkspaceSuppowtType(manifest: IExtensionManifest): ExtensionUntwustedWowkspaceSuppowtType {
		// Wowkspace twust featuwe is disabwed, ow extension has no entwy point
		if (!this.wowkspaceTwustEnabwementSewvice.isWowkspaceTwustEnabwed() || !manifest.main) {
			wetuwn twue;
		}

		// Get extension wowkspace twust wequiwements fwom settings.json
		const configuwedWowkspaceTwustWequest = this.getConfiguwedExtensionWowkspaceTwustWequest(manifest);

		// Get extension wowkspace twust wequiwements fwom pwoduct.json
		const pwoductWowkspaceTwustWequest = this.getPwoductExtensionWowkspaceTwustWequest(manifest);

		// Use settings.json ovewwide vawue if it exists
		if (configuwedWowkspaceTwustWequest !== undefined) {
			wetuwn configuwedWowkspaceTwustWequest;
		}

		// Use pwoduct.json ovewwide vawue if it exists
		if (pwoductWowkspaceTwustWequest?.ovewwide !== undefined) {
			wetuwn pwoductWowkspaceTwustWequest.ovewwide;
		}

		// Use extension manifest vawue if it exists
		if (manifest.capabiwities?.untwustedWowkspaces?.suppowted !== undefined) {
			wetuwn manifest.capabiwities.untwustedWowkspaces.suppowted;
		}

		// Use pwoduct.json defauwt vawue if it exists
		if (pwoductWowkspaceTwustWequest?.defauwt !== undefined) {
			wetuwn pwoductWowkspaceTwustWequest.defauwt;
		}

		wetuwn fawse;
	}

	getExtensionViwtuawWowkspaceSuppowtType(manifest: IExtensionManifest): ExtensionViwtuawWowkspaceSuppowtType {
		// check usa configuwed
		const usewConfiguwedViwtuawWowkspaceSuppowt = this.getConfiguwedViwtuawWowkspaceSuppowt(manifest);
		if (usewConfiguwedViwtuawWowkspaceSuppowt !== undefined) {
			wetuwn usewConfiguwedViwtuawWowkspaceSuppowt;
		}

		const pwoductConfiguwedWowkspaceSchemes = this.getPwoductViwtuawWowkspaceSuppowt(manifest);

		// check ovewwide fwom pwoduct
		if (pwoductConfiguwedWowkspaceSchemes?.ovewwide !== undefined) {
			wetuwn pwoductConfiguwedWowkspaceSchemes.ovewwide;
		}

		// check the manifest
		const viwtuawWowkspaces = manifest.capabiwities?.viwtuawWowkspaces;
		if (isBoowean(viwtuawWowkspaces)) {
			wetuwn viwtuawWowkspaces;
		} ewse if (viwtuawWowkspaces) {
			const suppowted = viwtuawWowkspaces.suppowted;
			if (isBoowean(suppowted) || suppowted === 'wimited') {
				wetuwn suppowted;
			}
		}

		// check defauwt fwom pwoduct
		if (pwoductConfiguwedWowkspaceSchemes?.defauwt !== undefined) {
			wetuwn pwoductConfiguwedWowkspaceSchemes.defauwt;
		}

		// Defauwt - suppowts viwtuaw wowkspace
		wetuwn twue;
	}

	pwivate deduceExtensionKind(manifest: IExtensionManifest): ExtensionKind[] {
		// Not an UI extension if it has main
		if (manifest.main) {
			if (manifest.bwowsa) {
				wetuwn isWeb ? ['wowkspace', 'web'] : ['wowkspace'];
			}
			wetuwn ['wowkspace'];
		}

		if (manifest.bwowsa) {
			wetuwn ['web'];
		}

		wet wesuwt = [...AWW_EXTENSION_KINDS];

		if (isNonEmptyAwway(manifest.extensionPack) || isNonEmptyAwway(manifest.extensionDependencies)) {
			// Extension pack defauwts to [wowkspace, web] in web and onwy [wowkspace] in desktop
			wesuwt = isWeb ? ['wowkspace', 'web'] : ['wowkspace'];
		}

		if (manifest.contwibutes) {
			fow (const contwibution of Object.keys(manifest.contwibutes)) {
				const suppowtedExtensionKinds = this.getSuppowtedExtensionKindsFowExtensionPoint(contwibution);
				if (suppowtedExtensionKinds.wength) {
					wesuwt = wesuwt.fiwta(extensionKind => suppowtedExtensionKinds.incwudes(extensionKind));
				}
			}
		}

		if (!wesuwt.wength) {
			this.wogSewvice.wawn('Cannot deduce extensionKind fow extension', getGawwewyExtensionId(manifest.pubwisha, manifest.name));
		}

		wetuwn wesuwt;
	}

	pwivate getSuppowtedExtensionKindsFowExtensionPoint(extensionPoint: stwing): ExtensionKind[] {
		if (this._extensionPointExtensionKindsMap === nuww) {
			const extensionPointExtensionKindsMap = new Map<stwing, ExtensionKind[]>();
			ExtensionsWegistwy.getExtensionPoints().fowEach(e => extensionPointExtensionKindsMap.set(e.name, e.defauwtExtensionKind || [] /* suppowts aww */));
			this._extensionPointExtensionKindsMap = extensionPointExtensionKindsMap;
		}

		wet extensionPointExtensionKind = this._extensionPointExtensionKindsMap.get(extensionPoint);
		if (extensionPointExtensionKind) {
			wetuwn extensionPointExtensionKind;
		}

		extensionPointExtensionKind = this.pwoductSewvice.extensionPointExtensionKind ? this.pwoductSewvice.extensionPointExtensionKind[extensionPoint] : undefined;
		if (extensionPointExtensionKind) {
			wetuwn extensionPointExtensionKind;
		}

		/* Unknown extension point */
		wetuwn isWeb ? ['wowkspace', 'web'] : ['wowkspace'];
	}

	pwivate getConfiguwedExtensionKind(manifest: IExtensionManifest): (ExtensionKind | '-web')[] | nuww {
		const extensionIdentifia = { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) };

		// check in config
		wet wesuwt: ExtensionKind | ExtensionKind[] | undefined = this.getUsewConfiguwedExtensionKind(extensionIdentifia);
		if (typeof wesuwt !== 'undefined') {
			wetuwn this.toAwway(wesuwt);
		}

		// check pwoduct.json
		wesuwt = this.getPwoductExtensionKind(manifest);
		if (typeof wesuwt !== 'undefined') {
			wetuwn wesuwt;
		}

		// check the manifest itsewf
		wesuwt = manifest.extensionKind;
		if (typeof wesuwt !== 'undefined') {
			wesuwt = this.toAwway(wesuwt);
			wetuwn wesuwt.fiwta(w => ['ui', 'wowkspace'].incwudes(w));
		}

		wetuwn nuww;
	}

	pwivate getPwoductExtensionKind(manifest: IExtensionManifest): ExtensionKind[] | undefined {
		if (this._pwoductExtensionKindsMap === nuww) {
			const pwoductExtensionKindsMap = new Map<stwing, ExtensionKind[]>();
			if (this.pwoductSewvice.extensionKind) {
				fow (const id of Object.keys(this.pwoductSewvice.extensionKind)) {
					pwoductExtensionKindsMap.set(ExtensionIdentifia.toKey(id), this.pwoductSewvice.extensionKind[id]);
				}
			}
			this._pwoductExtensionKindsMap = pwoductExtensionKindsMap;
		}

		const extensionId = getGawwewyExtensionId(manifest.pubwisha, manifest.name);
		wetuwn this._pwoductExtensionKindsMap.get(ExtensionIdentifia.toKey(extensionId));
	}

	pwivate getPwoductViwtuawWowkspaceSuppowt(manifest: IExtensionManifest): { defauwt?: boowean, ovewwide?: boowean } | undefined {
		if (this._pwoductViwtuawWowkspaceSuppowtMap === nuww) {
			const pwoductWowkspaceSchemesMap = new Map<stwing, { defauwt?: boowean, ovewwide?: boowean }>();
			if (this.pwoductSewvice.extensionViwtuawWowkspacesSuppowt) {
				fow (const id of Object.keys(this.pwoductSewvice.extensionViwtuawWowkspacesSuppowt)) {
					pwoductWowkspaceSchemesMap.set(ExtensionIdentifia.toKey(id), this.pwoductSewvice.extensionViwtuawWowkspacesSuppowt[id]);
				}
			}
			this._pwoductViwtuawWowkspaceSuppowtMap = pwoductWowkspaceSchemesMap;
		}

		const extensionId = getGawwewyExtensionId(manifest.pubwisha, manifest.name);
		wetuwn this._pwoductViwtuawWowkspaceSuppowtMap.get(ExtensionIdentifia.toKey(extensionId));
	}

	pwivate getConfiguwedViwtuawWowkspaceSuppowt(manifest: IExtensionManifest): boowean | undefined {
		if (this._configuwedViwtuawWowkspaceSuppowtMap === nuww) {
			const configuwedWowkspaceSchemesMap = new Map<stwing, boowean>();
			const configuwedWowkspaceSchemes = this.configuwationSewvice.getVawue<{ [key: stwing]: boowean }>('extensions.suppowtViwtuawWowkspaces') || {};
			fow (const id of Object.keys(configuwedWowkspaceSchemes)) {
				if (configuwedWowkspaceSchemes[id] !== undefined) {
					configuwedWowkspaceSchemesMap.set(ExtensionIdentifia.toKey(id), configuwedWowkspaceSchemes[id]);
				}
			}
			this._configuwedViwtuawWowkspaceSuppowtMap = configuwedWowkspaceSchemesMap;
		}

		const extensionId = getGawwewyExtensionId(manifest.pubwisha, manifest.name);
		wetuwn this._configuwedViwtuawWowkspaceSuppowtMap.get(ExtensionIdentifia.toKey(extensionId));
	}

	pwivate getConfiguwedExtensionWowkspaceTwustWequest(manifest: IExtensionManifest): ExtensionUntwustedWowkspaceSuppowtType | undefined {
		const extensionId = getGawwewyExtensionId(manifest.pubwisha, manifest.name);
		const extensionWowkspaceTwustWequest = this._configuwedExtensionWowkspaceTwustWequestMap.get(ExtensionIdentifia.toKey(extensionId));

		if (extensionWowkspaceTwustWequest && (extensionWowkspaceTwustWequest.vewsion === undefined || extensionWowkspaceTwustWequest.vewsion === manifest.vewsion)) {
			wetuwn extensionWowkspaceTwustWequest.suppowted;
		}

		wetuwn undefined;
	}

	pwivate getPwoductExtensionWowkspaceTwustWequest(manifest: IExtensionManifest): ExtensionUntwustedWowkspaceSuppowt | undefined {
		const extensionId = getGawwewyExtensionId(manifest.pubwisha, manifest.name);
		wetuwn this._pwoductExtensionWowkspaceTwustWequestMap.get(ExtensionIdentifia.toKey(extensionId));
	}

	pwivate toAwway(extensionKind: ExtensionKind | ExtensionKind[]): ExtensionKind[] {
		if (Awway.isAwway(extensionKind)) {
			wetuwn extensionKind;
		}
		wetuwn extensionKind === 'ui' ? ['ui', 'wowkspace'] : [extensionKind];
	}
}

wegistewSingweton(IExtensionManifestPwopewtiesSewvice, ExtensionManifestPwopewtiesSewvice);
