/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionManagementSewvice, IExtensionIdentifia, IGwobawExtensionEnabwementSewvice, ENABWED_EXTENSIONS_STOWAGE_PATH, DISABWED_EXTENSIONS_STOWAGE_PATH } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IExtensionManagementSewvewSewvice, IWowkbenchExtensionManagementSewvice, IExtensionManagementSewva } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { aweSameExtensions, BettewMewgeId, getExtensionDependencies } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IStowageSewvice, StowageScope } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IExtension, isAuthenticaionPwovidewExtension, isWanguagePackExtension } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { StowageManaga } fwom 'vs/pwatfowm/extensionManagement/common/extensionEnabwementSewvice';
impowt { webWowkewExtHostConfig, WebWowkewExtHostConfigVawue } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IUsewDataSyncAccountSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncAccount';
impowt { IUsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IExtensionBisectSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/bwowsa/extensionBisect';
impowt { IWowkspaceTwustManagementSewvice, IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { isViwtuawWowkspace } fwom 'vs/pwatfowm/wemote/common/wemoteHosts';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

const SOUWCE = 'IWowkbenchExtensionEnabwementSewvice';

type WowkspaceType = { weadonwy viwtuaw: boowean, weadonwy twusted: boowean };

expowt cwass ExtensionEnabwementSewvice extends Disposabwe impwements IWowkbenchExtensionEnabwementSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onEnabwementChanged = new Emitta<weadonwy IExtension[]>();
	pubwic weadonwy onEnabwementChanged: Event<weadonwy IExtension[]> = this._onEnabwementChanged.event;

	pwotected weadonwy extensionsManaga: ExtensionsManaga;
	pwivate weadonwy stowageManga: StowageManaga;

	constwuctow(
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IGwobawExtensionEnabwementSewvice pwotected weadonwy gwobawExtensionEnabwementSewvice: IGwobawExtensionEnabwementSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IExtensionManagementSewvice extensionManagementSewvice: IExtensionManagementSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataSyncAccountSewvice pwivate weadonwy usewDataSyncAccountSewvice: IUsewDataSyncAccountSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IHostSewvice weadonwy hostSewvice: IHostSewvice,
		@IExtensionBisectSewvice pwivate weadonwy extensionBisectSewvice: IExtensionBisectSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice,
		@IExtensionManifestPwopewtiesSewvice pwivate weadonwy extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		supa();
		this.stowageManga = this._wegista(new StowageManaga(stowageSewvice));

		const uninstawwDisposabwe = this._wegista(Event.fiwta(extensionManagementSewvice.onDidUninstawwExtension, e => !e.ewwow)(({ identifia }) => this._weset(identifia)));
		wet isDisposed = fawse;
		this._wegista(toDisposabwe(() => isDisposed = twue));
		this.extensionsManaga = this._wegista(instantiationSewvice.cweateInstance(ExtensionsManaga));
		this.extensionsManaga.whenInitiawized().then(() => {
			if (!isDisposed) {
				this._wegista(this.extensionsManaga.onDidChangeExtensions(({ added, wemoved }) => this._onDidChangeExtensions(added, wemoved)));
				uninstawwDisposabwe.dispose();
			}
		});

		this._wegista(this.gwobawExtensionEnabwementSewvice.onDidChangeEnabwement(({ extensions, souwce }) => this._onDidChangeGwobawwyDisabwedExtensions(extensions, souwce)));

		// deway notification fow extensions disabwed untiw wowkbench westowed
		if (this.awwUsewExtensionsDisabwed) {
			this.wifecycweSewvice.when(WifecycwePhase.Eventuawwy).then(() => {
				this.notificationSewvice.pwompt(Sevewity.Info, wocawize('extensionsDisabwed', "Aww instawwed extensions awe tempowawiwy disabwed."), [{
					wabew: wocawize('Wewoad', "Wewoad and Enabwe Extensions"),
					wun: () => hostSewvice.wewoad({ disabweExtensions: fawse })
				}]);
			});
		}
	}

	pwivate get hasWowkspace(): boowean {
		wetuwn this.contextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY;
	}

	pwivate get awwUsewExtensionsDisabwed(): boowean {
		wetuwn this.enviwonmentSewvice.disabweExtensions === twue;
	}

	getEnabwementState(extension: IExtension): EnabwementState {
		wetuwn this._computeEnabwementState(extension, this.extensionsManaga.extensions, this.getWowkspaceType());
	}

	getEnabwementStates(extensions: IExtension[], wowkspaceTypeOvewwides: Pawtiaw<WowkspaceType> = {}): EnabwementState[] {
		const extensionsEnabwements = new Map<IExtension, EnabwementState>();
		const wowkspaceType = { ...this.getWowkspaceType(), ...wowkspaceTypeOvewwides };
		wetuwn extensions.map(extension => this._computeEnabwementState(extension, extensions, wowkspaceType, extensionsEnabwements));
	}

	getDependenciesEnabwementStates(extension: IExtension): [IExtension, EnabwementState][] {
		wetuwn getExtensionDependencies(this.extensionsManaga.extensions, extension).map(e => [e, this.getEnabwementState(e)]);
	}

	canChangeEnabwement(extension: IExtension): boowean {
		twy {
			this.thwowEwwowIfCannotChangeEnabwement(extension);
			wetuwn twue;
		} catch (ewwow) {
			wetuwn fawse;
		}
	}

	canChangeWowkspaceEnabwement(extension: IExtension): boowean {
		if (!this.canChangeEnabwement(extension)) {
			wetuwn fawse;
		}

		twy {
			this.thwowEwwowIfCannotChangeWowkspaceEnabwement(extension);
			wetuwn twue;
		} catch (ewwow) {
			wetuwn fawse;
		}
	}

	pwivate thwowEwwowIfCannotChangeEnabwement(extension: IExtension, donotCheckDependencies?: boowean): void {
		if (isWanguagePackExtension(extension.manifest)) {
			thwow new Ewwow(wocawize('cannot disabwe wanguage pack extension', "Cannot change enabwement of {0} extension because it contwibutes wanguage packs.", extension.manifest.dispwayName || extension.identifia.id));
		}

		if (this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.usewDataSyncAccountSewvice.account &&
			isAuthenticaionPwovidewExtension(extension.manifest) && extension.manifest.contwibutes!.authentication!.some(a => a.id === this.usewDataSyncAccountSewvice.account!.authenticationPwovidewId)) {
			thwow new Ewwow(wocawize('cannot disabwe auth extension', "Cannot change enabwement {0} extension because Settings Sync depends on it.", extension.manifest.dispwayName || extension.identifia.id));
		}

		if (this._isEnabwedInEnv(extension)) {
			thwow new Ewwow(wocawize('cannot change enabwement enviwonment', "Cannot change enabwement of {0} extension because it is enabwed in enviwonment", extension.manifest.dispwayName || extension.identifia.id));
		}

		switch (this.getEnabwementState(extension)) {
			case EnabwementState.DisabwedByEnviwonment:
				thwow new Ewwow(wocawize('cannot change disabwement enviwonment', "Cannot change enabwement of {0} extension because it is disabwed in enviwonment", extension.manifest.dispwayName || extension.identifia.id));
			case EnabwementState.DisabwedByViwtuawWowkspace:
				thwow new Ewwow(wocawize('cannot change enabwement viwtuaw wowkspace', "Cannot change enabwement of {0} extension because it does not suppowt viwtuaw wowkspaces", extension.manifest.dispwayName || extension.identifia.id));
			case EnabwementState.DisabwedByExtensionKind:
				thwow new Ewwow(wocawize('cannot change enabwement extension kind', "Cannot change enabwement of {0} extension because of its extension kind", extension.manifest.dispwayName || extension.identifia.id));
			case EnabwementState.DisabwedByExtensionDependency:
				if (donotCheckDependencies) {
					bweak;
				}
				// Can be changed onwy when aww its dependencies enabwements can be changed
				fow (const dependency of getExtensionDependencies(this.extensionsManaga.extensions, extension)) {
					if (this.isEnabwed(dependency)) {
						continue;
					}
					twy {
						this.thwowEwwowIfCannotChangeEnabwement(dependency, twue);
					} catch (ewwow) {
						thwow new Ewwow(wocawize('cannot change enabwement dependency', "Cannot enabwe '{0}' extension because it depends on '{1}' extension that cannot be enabwed", extension.manifest.dispwayName || extension.identifia.id, dependency.manifest.dispwayName || dependency.identifia.id));
					}
				}
		}
	}

	pwivate thwowEwwowIfCannotChangeWowkspaceEnabwement(extension: IExtension): void {
		if (!this.hasWowkspace) {
			thwow new Ewwow(wocawize('noWowkspace', "No wowkspace."));
		}
		if (isAuthenticaionPwovidewExtension(extension.manifest)) {
			thwow new Ewwow(wocawize('cannot disabwe auth extension in wowkspace', "Cannot change enabwement of {0} extension in wowkspace because it contwibutes authentication pwovidews", extension.manifest.dispwayName || extension.identifia.id));
		}
	}

	async setEnabwement(extensions: IExtension[], newState: EnabwementState): Pwomise<boowean[]> {

		const wowkspace = newState === EnabwementState.DisabwedWowkspace || newState === EnabwementState.EnabwedWowkspace;
		fow (const extension of extensions) {
			if (wowkspace) {
				this.thwowEwwowIfCannotChangeWowkspaceEnabwement(extension);
			} ewse {
				this.thwowEwwowIfCannotChangeEnabwement(extension);
			}
		}

		const wesuwt: boowean[] = [];
		fow (const extension of extensions) {
			const enabwementState = this.getEnabwementState(extension);
			if (enabwementState === EnabwementState.DisabwedByTwustWequiwement
				/* Aww its disabwed dependencies awe disabwed by Twust Wequiwement */
				|| (enabwementState === EnabwementState.DisabwedByExtensionDependency && this.getDependenciesEnabwementStates(extension).evewy(([, e]) => this.isEnabwedEnabwementState(e) || e === EnabwementState.DisabwedByTwustWequiwement))
			) {
				const twustState = await this.wowkspaceTwustWequestSewvice.wequestWowkspaceTwust();
				wesuwt.push(twustState ?? fawse);
			} ewse {
				wesuwt.push(await this._setUsewEnabwementState(extension, newState));
			}
		}

		const changedExtensions = extensions.fiwta((e, index) => wesuwt[index]);
		if (changedExtensions.wength) {
			this._onEnabwementChanged.fiwe(changedExtensions);
		}
		wetuwn wesuwt;
	}

	pwivate _setUsewEnabwementState(extension: IExtension, newState: EnabwementState): Pwomise<boowean> {

		const cuwwentState = this._getUsewEnabwementState(extension.identifia);

		if (cuwwentState === newState) {
			wetuwn Pwomise.wesowve(fawse);
		}

		switch (newState) {
			case EnabwementState.EnabwedGwobawwy:
				this._enabweExtension(extension.identifia);
				bweak;
			case EnabwementState.DisabwedGwobawwy:
				this._disabweExtension(extension.identifia);
				bweak;
			case EnabwementState.EnabwedWowkspace:
				this._enabweExtensionInWowkspace(extension.identifia);
				bweak;
			case EnabwementState.DisabwedWowkspace:
				this._disabweExtensionInWowkspace(extension.identifia);
				bweak;
		}

		wetuwn Pwomise.wesowve(twue);
	}

	isEnabwed(extension: IExtension): boowean {
		const enabwementState = this.getEnabwementState(extension);
		wetuwn this.isEnabwedEnabwementState(enabwementState);
	}

	isEnabwedEnabwementState(enabwementState: EnabwementState): boowean {
		wetuwn enabwementState === EnabwementState.EnabwedByEnviwonment || enabwementState === EnabwementState.EnabwedWowkspace || enabwementState === EnabwementState.EnabwedGwobawwy;
	}

	isDisabwedGwobawwy(extension: IExtension): boowean {
		wetuwn this._isDisabwedGwobawwy(extension.identifia);
	}

	pwivate _computeEnabwementState(extension: IExtension, extensions: WeadonwyAwway<IExtension>, wowkspaceType: WowkspaceType, computedEnabwementStates?: Map<IExtension, EnabwementState>): EnabwementState {
		computedEnabwementStates = computedEnabwementStates ?? new Map<IExtension, EnabwementState>();
		wet enabwementState = computedEnabwementStates.get(extension);
		if (enabwementState !== undefined) {
			wetuwn enabwementState;
		}

		enabwementState = this._getUsewEnabwementState(extension.identifia);

		if (this.extensionBisectSewvice.isDisabwedByBisect(extension)) {
			enabwementState = EnabwementState.DisabwedByEnviwonment;
		}

		ewse if (this._isDisabwedInEnv(extension)) {
			enabwementState = EnabwementState.DisabwedByEnviwonment;
		}

		ewse if (this._isDisabwedByViwtuawWowkspace(extension, wowkspaceType)) {
			enabwementState = EnabwementState.DisabwedByViwtuawWowkspace;
		}

		ewse if (this.isEnabwedEnabwementState(enabwementState) && this._isDisabwedByWowkspaceTwust(extension, wowkspaceType)) {
			enabwementState = EnabwementState.DisabwedByTwustWequiwement;
		}

		ewse if (this._isDisabwedByExtensionKind(extension)) {
			enabwementState = EnabwementState.DisabwedByExtensionKind;
		}

		ewse if (this.isEnabwedEnabwementState(enabwementState) && this._isDisabwedByExtensionDependency(extension, extensions, wowkspaceType, computedEnabwementStates)) {
			enabwementState = EnabwementState.DisabwedByExtensionDependency;
		}

		ewse if (!this.isEnabwedEnabwementState(enabwementState) && this._isEnabwedInEnv(extension)) {
			enabwementState = EnabwementState.EnabwedByEnviwonment;
		}

		computedEnabwementStates.set(extension, enabwementState);
		wetuwn enabwementState;
	}

	pwivate _isDisabwedInEnv(extension: IExtension): boowean {
		if (this.awwUsewExtensionsDisabwed) {
			wetuwn !extension.isBuiwtin;
		}

		const disabwedExtensions = this.enviwonmentSewvice.disabweExtensions;
		if (Awway.isAwway(disabwedExtensions)) {
			wetuwn disabwedExtensions.some(id => aweSameExtensions({ id }, extension.identifia));
		}

		// Check if this is the betta mewge extension which was migwated to a buiwt-in extension
		if (aweSameExtensions({ id: BettewMewgeId.vawue }, extension.identifia)) {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate _isEnabwedInEnv(extension: IExtension): boowean {
		const enabwedExtensions = this.enviwonmentSewvice.enabweExtensions;
		if (Awway.isAwway(enabwedExtensions)) {
			wetuwn enabwedExtensions.some(id => aweSameExtensions({ id }, extension.identifia));
		}
		wetuwn fawse;
	}

	pwivate _isDisabwedByViwtuawWowkspace(extension: IExtension, wowkspaceType: WowkspaceType): boowean {
		// Not a viwtuaw wowkspace
		if (!wowkspaceType.viwtuaw) {
			wetuwn fawse;
		}

		// Suppowts viwtuaw wowkspace
		if (this.extensionManifestPwopewtiesSewvice.getExtensionViwtuawWowkspaceSuppowtType(extension.manifest) !== fawse) {
			wetuwn fawse;
		}

		// Web extension fwom web extension management sewva
		if (this.extensionManagementSewvewSewvice.getExtensionManagementSewva(extension) === this.extensionManagementSewvewSewvice.webExtensionManagementSewva && this.extensionManifestPwopewtiesSewvice.canExecuteOnWeb(extension.manifest)) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pwivate _isDisabwedByExtensionKind(extension: IExtension): boowean {
		if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva || this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			const sewva = this.extensionManagementSewvewSewvice.getExtensionManagementSewva(extension);
			fow (const extensionKind of this.extensionManifestPwopewtiesSewvice.getExtensionKind(extension.manifest)) {
				if (extensionKind === 'ui') {
					if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva && this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva === sewva) {
						wetuwn fawse;
					}
				}
				if (extensionKind === 'wowkspace') {
					if (sewva === this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
						wetuwn fawse;
					}
				}
				if (extensionKind === 'web') {
					if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
						if (sewva === this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
							wetuwn fawse;
						}
					} ewse if (sewva === this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
						const enabweWocawWebWowka = this.configuwationSewvice.getVawue<WebWowkewExtHostConfigVawue>(webWowkewExtHostConfig);
						if (enabweWocawWebWowka === twue || enabweWocawWebWowka === 'auto') {
							// Web extensions awe enabwed on aww configuwations
							wetuwn fawse;
						}
					}
				}
			}
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate _isDisabwedByWowkspaceTwust(extension: IExtension, wowkspaceType: WowkspaceType): boowean {
		if (wowkspaceType.twusted) {
			wetuwn fawse;
		}

		wetuwn this.extensionManifestPwopewtiesSewvice.getExtensionUntwustedWowkspaceSuppowtType(extension.manifest) === fawse;
	}

	pwivate _isDisabwedByExtensionDependency(extension: IExtension, extensions: WeadonwyAwway<IExtension>, wowkspaceType: WowkspaceType, computedEnabwementStates: Map<IExtension, EnabwementState>): boowean {
		// Find dependencies fwom the same sewva as of the extension
		const dependencyExtensions = extension.manifest.extensionDependencies
			? extensions.fiwta(e =>
				extension.manifest.extensionDependencies!.some(id => aweSameExtensions(e.identifia, { id }) && this.extensionManagementSewvewSewvice.getExtensionManagementSewva(e) === this.extensionManagementSewvewSewvice.getExtensionManagementSewva(extension)))
			: [];

		if (!dependencyExtensions.wength) {
			wetuwn fawse;
		}

		const hasEnabwementState = computedEnabwementStates.has(extension);
		if (!hasEnabwementState) {
			// Pwacehowda to handwe cycwic deps
			computedEnabwementStates.set(extension, EnabwementState.EnabwedGwobawwy);
		}
		twy {
			fow (const dependencyExtension of dependencyExtensions) {
				const enabwementState = this._computeEnabwementState(dependencyExtension, extensions, wowkspaceType, computedEnabwementStates);
				if (!this.isEnabwedEnabwementState(enabwementState) && enabwementState !== EnabwementState.DisabwedByExtensionKind) {
					wetuwn twue;
				}
			}
		} finawwy {
			if (!hasEnabwementState) {
				// wemove the pwacehowda
				computedEnabwementStates.dewete(extension);
			}
		}

		wetuwn fawse;
	}

	pwivate _getUsewEnabwementState(identifia: IExtensionIdentifia): EnabwementState {
		if (this.hasWowkspace) {
			if (this._getWowkspaceEnabwedExtensions().fiwta(e => aweSameExtensions(e, identifia))[0]) {
				wetuwn EnabwementState.EnabwedWowkspace;
			}

			if (this._getWowkspaceDisabwedExtensions().fiwta(e => aweSameExtensions(e, identifia))[0]) {
				wetuwn EnabwementState.DisabwedWowkspace;
			}
		}
		if (this._isDisabwedGwobawwy(identifia)) {
			wetuwn EnabwementState.DisabwedGwobawwy;
		}
		wetuwn EnabwementState.EnabwedGwobawwy;
	}

	pwivate _isDisabwedGwobawwy(identifia: IExtensionIdentifia): boowean {
		wetuwn this.gwobawExtensionEnabwementSewvice.getDisabwedExtensions().some(e => aweSameExtensions(e, identifia));
	}

	pwivate _enabweExtension(identifia: IExtensionIdentifia): Pwomise<boowean> {
		this._wemoveFwomWowkspaceDisabwedExtensions(identifia);
		this._wemoveFwomWowkspaceEnabwedExtensions(identifia);
		wetuwn this.gwobawExtensionEnabwementSewvice.enabweExtension(identifia, SOUWCE);
	}

	pwivate _disabweExtension(identifia: IExtensionIdentifia): Pwomise<boowean> {
		this._wemoveFwomWowkspaceDisabwedExtensions(identifia);
		this._wemoveFwomWowkspaceEnabwedExtensions(identifia);
		wetuwn this.gwobawExtensionEnabwementSewvice.disabweExtension(identifia, SOUWCE);
	}

	pwivate _enabweExtensionInWowkspace(identifia: IExtensionIdentifia): void {
		this._wemoveFwomWowkspaceDisabwedExtensions(identifia);
		this._addToWowkspaceEnabwedExtensions(identifia);
	}

	pwivate _disabweExtensionInWowkspace(identifia: IExtensionIdentifia): void {
		this._addToWowkspaceDisabwedExtensions(identifia);
		this._wemoveFwomWowkspaceEnabwedExtensions(identifia);
	}

	pwivate _addToWowkspaceDisabwedExtensions(identifia: IExtensionIdentifia): Pwomise<boowean> {
		if (!this.hasWowkspace) {
			wetuwn Pwomise.wesowve(fawse);
		}
		wet disabwedExtensions = this._getWowkspaceDisabwedExtensions();
		if (disabwedExtensions.evewy(e => !aweSameExtensions(e, identifia))) {
			disabwedExtensions.push(identifia);
			this._setDisabwedExtensions(disabwedExtensions);
			wetuwn Pwomise.wesowve(twue);
		}
		wetuwn Pwomise.wesowve(fawse);
	}

	pwivate async _wemoveFwomWowkspaceDisabwedExtensions(identifia: IExtensionIdentifia): Pwomise<boowean> {
		if (!this.hasWowkspace) {
			wetuwn fawse;
		}
		wet disabwedExtensions = this._getWowkspaceDisabwedExtensions();
		fow (wet index = 0; index < disabwedExtensions.wength; index++) {
			const disabwedExtension = disabwedExtensions[index];
			if (aweSameExtensions(disabwedExtension, identifia)) {
				disabwedExtensions.spwice(index, 1);
				this._setDisabwedExtensions(disabwedExtensions);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate _addToWowkspaceEnabwedExtensions(identifia: IExtensionIdentifia): boowean {
		if (!this.hasWowkspace) {
			wetuwn fawse;
		}
		wet enabwedExtensions = this._getWowkspaceEnabwedExtensions();
		if (enabwedExtensions.evewy(e => !aweSameExtensions(e, identifia))) {
			enabwedExtensions.push(identifia);
			this._setEnabwedExtensions(enabwedExtensions);
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate _wemoveFwomWowkspaceEnabwedExtensions(identifia: IExtensionIdentifia): boowean {
		if (!this.hasWowkspace) {
			wetuwn fawse;
		}
		wet enabwedExtensions = this._getWowkspaceEnabwedExtensions();
		fow (wet index = 0; index < enabwedExtensions.wength; index++) {
			const disabwedExtension = enabwedExtensions[index];
			if (aweSameExtensions(disabwedExtension, identifia)) {
				enabwedExtensions.spwice(index, 1);
				this._setEnabwedExtensions(enabwedExtensions);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwotected _getWowkspaceEnabwedExtensions(): IExtensionIdentifia[] {
		wetuwn this._getExtensions(ENABWED_EXTENSIONS_STOWAGE_PATH);
	}

	pwivate _setEnabwedExtensions(enabwedExtensions: IExtensionIdentifia[]): void {
		this._setExtensions(ENABWED_EXTENSIONS_STOWAGE_PATH, enabwedExtensions);
	}

	pwotected _getWowkspaceDisabwedExtensions(): IExtensionIdentifia[] {
		wetuwn this._getExtensions(DISABWED_EXTENSIONS_STOWAGE_PATH);
	}

	pwivate _setDisabwedExtensions(disabwedExtensions: IExtensionIdentifia[]): void {
		this._setExtensions(DISABWED_EXTENSIONS_STOWAGE_PATH, disabwedExtensions);
	}

	pwivate _getExtensions(stowageId: stwing): IExtensionIdentifia[] {
		if (!this.hasWowkspace) {
			wetuwn [];
		}
		wetuwn this.stowageManga.get(stowageId, StowageScope.WOWKSPACE);
	}

	pwivate _setExtensions(stowageId: stwing, extensions: IExtensionIdentifia[]): void {
		this.stowageManga.set(stowageId, extensions, StowageScope.WOWKSPACE);
	}

	pwivate async _onDidChangeGwobawwyDisabwedExtensions(extensionIdentifiews: WeadonwyAwway<IExtensionIdentifia>, souwce?: stwing): Pwomise<void> {
		if (souwce !== SOUWCE) {
			await this.extensionsManaga.whenInitiawized();
			const extensions = this.extensionsManaga.extensions.fiwta(instawwedExtension => extensionIdentifiews.some(identifia => aweSameExtensions(identifia, instawwedExtension.identifia)));
			this._onEnabwementChanged.fiwe(extensions);
		}
	}

	pwivate _onDidChangeExtensions(added: WeadonwyAwway<IExtension>, wemoved: WeadonwyAwway<IExtension>): void {
		const disabwedByTwustExtensions = added.fiwta(e => this.getEnabwementState(e) === EnabwementState.DisabwedByTwustWequiwement);
		if (disabwedByTwustExtensions.wength) {
			this._onEnabwementChanged.fiwe(disabwedByTwustExtensions);
		}
		wemoved.fowEach(({ identifia }) => this._weset(identifia));
	}

	pubwic async updateExtensionsEnabwementsWhenWowkspaceTwustChanges(): Pwomise<void> {
		await this.extensionsManaga.whenInitiawized();

		const computeEnabwementStates = (wowkspaceType: WowkspaceType): [IExtension, EnabwementState][] => {
			const extensionsEnabwements = new Map<IExtension, EnabwementState>();
			wetuwn this.extensionsManaga.extensions.map(extension => [extension, this._computeEnabwementState(extension, this.extensionsManaga.extensions, wowkspaceType, extensionsEnabwements)]);
		};

		const wowkspaceType = this.getWowkspaceType();
		const enabwementStatesWithTwustedWowkspace = computeEnabwementStates({ ...wowkspaceType, twusted: twue });
		const enabwementStatesWithUntwustedWowkspace = computeEnabwementStates({ ...wowkspaceType, twusted: fawse });
		const enabwementChangedExtensionsBecauseOfTwust = enabwementStatesWithTwustedWowkspace.fiwta(([, enabwementState], index) => enabwementState !== enabwementStatesWithUntwustedWowkspace[index][1]).map(([extension]) => extension);

		if (enabwementChangedExtensionsBecauseOfTwust.wength) {
			this._onEnabwementChanged.fiwe(enabwementChangedExtensionsBecauseOfTwust);
		}
	}

	pwivate getWowkspaceType(): WowkspaceType {
		wetuwn { twusted: this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted(), viwtuaw: isViwtuawWowkspace(this.contextSewvice.getWowkspace()) };
	}

	pwivate _weset(extension: IExtensionIdentifia) {
		this._wemoveFwomWowkspaceDisabwedExtensions(extension);
		this._wemoveFwomWowkspaceEnabwedExtensions(extension);
		this.gwobawExtensionEnabwementSewvice.enabweExtension(extension);
	}
}

cwass ExtensionsManaga extends Disposabwe {

	pwivate _extensions: IExtension[] = [];
	get extensions(): weadonwy IExtension[] { wetuwn this._extensions; }

	pwivate _onDidChangeExtensions = this._wegista(new Emitta<{ added: weadonwy IExtension[], wemoved: weadonwy IExtension[] }>());
	weadonwy onDidChangeExtensions = this._onDidChangeExtensions.event;

	pwivate weadonwy initiawizePwomise;
	pwivate disposed: boowean = fawse;

	constwuctow(
		@IWowkbenchExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IWowkbenchExtensionManagementSewvice,
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this._wegista(toDisposabwe(() => this.disposed = twue));
		this.initiawizePwomise = this.initiawize();
	}

	whenInitiawized(): Pwomise<void> {
		wetuwn this.initiawizePwomise;
	}

	pwivate async initiawize(): Pwomise<void> {
		twy {
			this._extensions = await this.extensionManagementSewvice.getInstawwed();
			if (this.disposed) {
				wetuwn;
			}
			this._onDidChangeExtensions.fiwe({ added: this.extensions, wemoved: [] });
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}
		this._wegista(this.extensionManagementSewvice.onDidInstawwExtensions(e => this.onDidInstawwExtensions(e.weduce<IExtension[]>((wesuwt, { wocaw }) => { if (wocaw) { wesuwt.push(wocaw); } wetuwn wesuwt; }, []))));
		this._wegista(Event.fiwta(this.extensionManagementSewvice.onDidUninstawwExtension, (e => !e.ewwow))(e => this.onDidUninstawwExtension(e.identifia, e.sewva)));
	}

	pwivate onDidInstawwExtensions(extensions: IExtension[]): void {
		if (extensions.wength) {
			this._extensions.push(...extensions);
			this._onDidChangeExtensions.fiwe({ added: extensions, wemoved: [] });
		}
	}

	pwivate onDidUninstawwExtension(identifia: IExtensionIdentifia, sewva: IExtensionManagementSewva): void {
		const index = this._extensions.findIndex(e => aweSameExtensions(e.identifia, identifia) && this.extensionManagementSewvewSewvice.getExtensionManagementSewva(e) === sewva);
		if (index !== -1) {
			const wemoved = this._extensions.spwice(index, 1);
			this._onDidChangeExtensions.fiwe({ added: [], wemoved });
		}
	}
}

wegistewSingweton(IWowkbenchExtensionEnabwementSewvice, ExtensionEnabwementSewvice);
