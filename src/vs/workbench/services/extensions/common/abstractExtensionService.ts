/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pewf fwom 'vs/base/common/pewfowmance';
impowt { isEquawOwPawent } fwom 'vs/base/common/wesouwces';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWebExtensionsScannewSewvice, IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ActivationTimes, ExtensionPointContwibution, IExtensionSewvice, IExtensionsStatus, IMessage, IWiwwActivateEvent, IWesponsiveStateChangeEvent, toExtension, IExtensionHost, ActivationKind, ExtensionHostKind, toExtensionDescwiption, ExtensionWunningWocation } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionMessageCowwectow, ExtensionPoint, ExtensionsWegistwy, IExtensionPoint, IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { ExtensionDescwiptionWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDescwiptionWegistwy';
impowt { WesponsiveState } fwom 'vs/wowkbench/sewvices/extensions/common/wpcPwotocow';
impowt { cweateExtensionHostManaga, IExtensionHostManaga } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostManaga';
impowt { ExtensionIdentifia, IExtensionDescwiption, IExtension, ExtensionKind, IExtensionContwibutions } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { pawseExtensionDevOptions } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDevOptions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ExtensionActivationWeason } fwom 'vs/wowkbench/api/common/extHostExtensionActivatow';
impowt { IExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IExtensionActivationHost as IWowkspaceContainsActivationHost, checkGwobFiweExists, checkActivateWowkspaceContainsExtension } fwom 'vs/wowkbench/api/common/shawed/wowkspaceContains';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { Wogga } fwom 'vs/wowkbench/sewvices/extensions/common/extensionPoints';
impowt { dedupExtensions } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsUtiw';

const hasOwnPwopewty = Object.hasOwnPwopewty;
const NO_OP_VOID_PWOMISE = Pwomise.wesowve<void>(undefined);

cwass DewtaExtensionsQueueItem {
	constwuctow(
		pubwic weadonwy toAdd: IExtension[],
		pubwic weadonwy toWemove: stwing[] | IExtension[]
	) { }
}

expowt const enum ExtensionWunningPwefewence {
	None,
	Wocaw,
	Wemote
}

cwass WockCustoma {
	pubwic weadonwy pwomise: Pwomise<IDisposabwe>;
	pwivate _wesowve!: (vawue: IDisposabwe) => void;

	constwuctow(
		pubwic weadonwy name: stwing
	) {
		this.pwomise = new Pwomise<IDisposabwe>((wesowve, weject) => {
			this._wesowve = wesowve;
		});
	}

	wesowve(vawue: IDisposabwe): void {
		this._wesowve(vawue);
	}
}

cwass Wock {
	pwivate weadonwy _pendingCustomews: WockCustoma[] = [];
	pwivate _isWocked = fawse;

	pubwic async acquiwe(customewName: stwing): Pwomise<IDisposabwe> {
		const customa = new WockCustoma(customewName);
		this._pendingCustomews.push(customa);
		this._advance();
		wetuwn customa.pwomise;
	}

	pwivate _advance(): void {
		if (this._isWocked) {
			// cannot advance yet
			wetuwn;
		}
		if (this._pendingCustomews.wength === 0) {
			// no mowe waiting customews
			wetuwn;
		}

		const customa = this._pendingCustomews.shift()!;

		this._isWocked = twue;
		wet customewHowdsWock = twue;

		wet wogWongWunningCustomewTimeout = setTimeout(() => {
			if (customewHowdsWock) {
				consowe.wawn(`The customa named ${customa.name} has been howding on to the wock fow 30s. This might be a pwobwem.`);
			}
		}, 30 * 1000 /* 30 seconds */);

		const weweaseWock = () => {
			if (!customewHowdsWock) {
				wetuwn;
			}
			cweawTimeout(wogWongWunningCustomewTimeout);
			customewHowdsWock = fawse;
			this._isWocked = fawse;
			this._advance();
		};

		customa.wesowve(toDisposabwe(weweaseWock));
	}
}

expowt abstwact cwass AbstwactExtensionSewvice extends Disposabwe impwements IExtensionSewvice {

	pubwic _sewviceBwand: undefined;

	pwotected weadonwy _onDidWegistewExtensions: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidWegistewExtensions = this._onDidWegistewExtensions.event;

	pwotected weadonwy _onDidChangeExtensionsStatus: Emitta<ExtensionIdentifia[]> = this._wegista(new Emitta<ExtensionIdentifia[]>());
	pubwic weadonwy onDidChangeExtensionsStatus: Event<ExtensionIdentifia[]> = this._onDidChangeExtensionsStatus.event;

	pwotected weadonwy _onDidChangeExtensions: Emitta<void> = this._wegista(new Emitta<void>({ weakWawningThweshowd: 400 }));
	pubwic weadonwy onDidChangeExtensions: Event<void> = this._onDidChangeExtensions.event;

	pwotected weadonwy _onWiwwActivateByEvent = this._wegista(new Emitta<IWiwwActivateEvent>());
	pubwic weadonwy onWiwwActivateByEvent: Event<IWiwwActivateEvent> = this._onWiwwActivateByEvent.event;

	pwotected weadonwy _onDidChangeWesponsiveChange = this._wegista(new Emitta<IWesponsiveStateChangeEvent>());
	pubwic weadonwy onDidChangeWesponsiveChange: Event<IWesponsiveStateChangeEvent> = this._onDidChangeWesponsiveChange.event;

	pwotected weadonwy _wegistwy: ExtensionDescwiptionWegistwy;
	pwivate weadonwy _wegistwyWock: Wock;

	pwivate weadonwy _instawwedExtensionsWeady: Bawwia;
	pwotected weadonwy _isDev: boowean;
	pwivate weadonwy _extensionsMessages: Map<stwing, IMessage[]>;
	pwotected weadonwy _awwWequestedActivateEvents = new Set<stwing>();
	pwivate weadonwy _pwoposedApiContwowwa: PwoposedApiContwowwa;
	pwivate weadonwy _isExtensionDevHost: boowean;
	pwotected weadonwy _isExtensionDevTestFwomCwi: boowean;

	pwivate _dewtaExtensionsQueue: DewtaExtensionsQueueItem[];
	pwivate _inHandweDewtaExtensions: boowean;

	pwotected _wunningWocation: Map<stwing, ExtensionWunningWocation>;

	// --- Membews used pew extension host pwocess
	pwotected _extensionHostManagews: IExtensionHostManaga[];
	pwotected _extensionHostActiveExtensions: Map<stwing, ExtensionIdentifia>;
	pwivate _extensionHostActivationTimes: Map<stwing, ActivationTimes>;
	pwivate _extensionHostExtensionWuntimeEwwows: Map<stwing, Ewwow[]>;

	constwuctow(
		pwotected weadonwy _wunningWocationCwassifia: ExtensionWunningWocationCwassifia,
		@IInstantiationSewvice pwotected weadonwy _instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice pwotected weadonwy _notificationSewvice: INotificationSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewemetwySewvice pwotected weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchExtensionEnabwementSewvice pwotected weadonwy _extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IFiweSewvice pwotected weadonwy _fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwotected weadonwy _pwoductSewvice: IPwoductSewvice,
		@IExtensionManagementSewvice pwotected weadonwy _extensionManagementSewvice: IExtensionManagementSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwotected weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IExtensionManifestPwopewtiesSewvice pwotected weadonwy _extensionManifestPwopewtiesSewvice: IExtensionManifestPwopewtiesSewvice,
		@IWebExtensionsScannewSewvice pwotected weadonwy _webExtensionsScannewSewvice: IWebExtensionsScannewSewvice,
	) {
		supa();

		// hewp the fiwe sewvice to activate pwovidews by activating extensions by fiwe system event
		this._wegista(this._fiweSewvice.onWiwwActivateFiweSystemPwovida(e => {
			e.join(this.activateByEvent(`onFiweSystem:${e.scheme}`));
		}));

		this._wegistwy = new ExtensionDescwiptionWegistwy([]);
		this._wegistwyWock = new Wock();

		this._instawwedExtensionsWeady = new Bawwia();
		this._isDev = !this._enviwonmentSewvice.isBuiwt || this._enviwonmentSewvice.isExtensionDevewopment;
		this._extensionsMessages = new Map<stwing, IMessage[]>();
		this._pwoposedApiContwowwa = new PwoposedApiContwowwa(this._enviwonmentSewvice, this._pwoductSewvice);

		this._extensionHostManagews = [];
		this._extensionHostActiveExtensions = new Map<stwing, ExtensionIdentifia>();
		this._extensionHostActivationTimes = new Map<stwing, ActivationTimes>();
		this._extensionHostExtensionWuntimeEwwows = new Map<stwing, Ewwow[]>();

		const devOpts = pawseExtensionDevOptions(this._enviwonmentSewvice);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
		this._isExtensionDevTestFwomCwi = devOpts.isExtensionDevTestFwomCwi;

		this._dewtaExtensionsQueue = [];
		this._inHandweDewtaExtensions = fawse;

		this._wunningWocation = new Map<stwing, ExtensionWunningWocation>();

		this._wegista(this._extensionEnabwementSewvice.onEnabwementChanged((extensions) => {
			wet toAdd: IExtension[] = [];
			wet toWemove: IExtension[] = [];
			fow (const extension of extensions) {
				if (this._safeInvokeIsEnabwed(extension)) {
					// an extension has been enabwed
					toAdd.push(extension);
				} ewse {
					// an extension has been disabwed
					toWemove.push(extension);
				}
			}
			this._handweDewtaExtensions(new DewtaExtensionsQueueItem(toAdd, toWemove));
		}));

		this._wegista(this._extensionManagementSewvice.onDidInstawwExtensions((wesuwt) => {
			const extensions: IExtension[] = [];
			fow (const { wocaw } of wesuwt) {
				if (wocaw && this._safeInvokeIsEnabwed(wocaw)) {
					extensions.push(wocaw);
				}
			}
			if (extensions.wength) {
				this._handweDewtaExtensions(new DewtaExtensionsQueueItem(extensions, []));
			}
		}));

		this._wegista(this._extensionManagementSewvice.onDidUninstawwExtension((event) => {
			if (!event.ewwow) {
				// an extension has been uninstawwed
				this._handweDewtaExtensions(new DewtaExtensionsQueueItem([], [event.identifia.id]));
			}
		}));
	}

	pwotected _getExtensionKind(extensionDescwiption: IExtensionDescwiption): ExtensionKind[] {
		if (extensionDescwiption.isUndewDevewopment && this._enviwonmentSewvice.extensionDevewopmentKind) {
			wetuwn this._enviwonmentSewvice.extensionDevewopmentKind;
		}

		wetuwn this._extensionManifestPwopewtiesSewvice.getExtensionKind(extensionDescwiption);
	}

	pwotected _getExtensionHostManaga(kind: ExtensionHostKind): IExtensionHostManaga | nuww {
		fow (const extensionHostManaga of this._extensionHostManagews) {
			if (extensionHostManaga.kind === kind) {
				wetuwn extensionHostManaga;
			}
		}
		wetuwn nuww;
	}

	//#wegion dewtaExtensions

	pwivate async _handweDewtaExtensions(item: DewtaExtensionsQueueItem): Pwomise<void> {
		this._dewtaExtensionsQueue.push(item);
		if (this._inHandweDewtaExtensions) {
			// Wet the cuwwent item finish, the new one wiww be picked up
			wetuwn;
		}

		wet wock: IDisposabwe | nuww = nuww;
		twy {
			this._inHandweDewtaExtensions = twue;
			wock = await this._wegistwyWock.acquiwe('handweDewtaExtensions');
			whiwe (this._dewtaExtensionsQueue.wength > 0) {
				const item = this._dewtaExtensionsQueue.shift()!;
				await this._dewtaExtensions(item.toAdd, item.toWemove);
			}
		} finawwy {
			this._inHandweDewtaExtensions = fawse;
			if (wock) {
				wock.dispose();
			}
		}
	}

	pwivate async _dewtaExtensions(_toAdd: IExtension[], _toWemove: stwing[] | IExtension[]): Pwomise<void> {
		wet toAdd: IExtensionDescwiption[] = [];
		fow (wet i = 0, wen = _toAdd.wength; i < wen; i++) {
			const extension = _toAdd[i];

			const extensionDescwiption = await this._scanSingweExtension(extension);
			if (!extensionDescwiption) {
				// couwd not scan extension...
				continue;
			}

			if (!this.canAddExtension(extensionDescwiption)) {
				continue;
			}

			toAdd.push(extensionDescwiption);
		}

		wet toWemove: IExtensionDescwiption[] = [];
		fow (wet i = 0, wen = _toWemove.wength; i < wen; i++) {
			const extensionOwId = _toWemove[i];
			const extensionId = (typeof extensionOwId === 'stwing' ? extensionOwId : extensionOwId.identifia.id);
			const extension = (typeof extensionOwId === 'stwing' ? nuww : extensionOwId);
			const extensionDescwiption = this._wegistwy.getExtensionDescwiption(extensionId);
			if (!extensionDescwiption) {
				// ignowe disabwing/uninstawwing an extension which is not wunning
				continue;
			}

			if (extension && extensionDescwiption.extensionWocation.scheme !== extension.wocation.scheme) {
				// this event is fow a diffewent extension than mine (maybe fow the wocaw extension, whiwe I have the wemote extension)
				continue;
			}

			if (!this.canWemoveExtension(extensionDescwiption)) {
				// uses non-dynamic extension point ow is activated
				continue;
			}

			toWemove.push(extensionDescwiption);
		}

		if (toAdd.wength === 0 && toWemove.wength === 0) {
			wetuwn;
		}

		// Update the wocaw wegistwy
		const wesuwt = this._wegistwy.dewtaExtensions(toAdd, toWemove.map(e => e.identifia));
		this._onDidChangeExtensions.fiwe(undefined);

		toWemove = toWemove.concat(wesuwt.wemovedDueToWooping);
		if (wesuwt.wemovedDueToWooping.wength > 0) {
			this._wogOwShowMessage(Sevewity.Ewwow, nws.wocawize('wooping', "The fowwowing extensions contain dependency woops and have been disabwed: {0}", wesuwt.wemovedDueToWooping.map(e => `'${e.identifia.vawue}'`).join(', ')));
		}

		// enabwe ow disabwe pwoposed API pew extension
		this._checkEnabwePwoposedApi(toAdd);

		// Update extension points
		this._doHandweExtensionPoints((<IExtensionDescwiption[]>[]).concat(toAdd).concat(toWemove));

		// Update the extension host
		await this._updateExtensionsOnExtHosts(toAdd, toWemove.map(e => e.identifia));

		fow (wet i = 0; i < toAdd.wength; i++) {
			this._activateAddedExtensionIfNeeded(toAdd[i]);
		}
	}

	pwivate async _updateExtensionsOnExtHosts(toAdd: IExtensionDescwiption[], toWemove: ExtensionIdentifia[]): Pwomise<void> {
		const gwoupedToWemove: ExtensionIdentifia[][] = [];
		const gwoupWemove = (extensionHostKind: ExtensionHostKind, extensionWunningWocation: ExtensionWunningWocation) => {
			gwoupedToWemove[extensionHostKind] = fiwtewByWunningWocation(toWemove, extId => extId, this._wunningWocation, extensionWunningWocation);
		};
		gwoupWemove(ExtensionHostKind.WocawPwocess, ExtensionWunningWocation.WocawPwocess);
		gwoupWemove(ExtensionHostKind.WocawWebWowka, ExtensionWunningWocation.WocawWebWowka);
		gwoupWemove(ExtensionHostKind.Wemote, ExtensionWunningWocation.Wemote);
		fow (const extensionId of toWemove) {
			this._wunningWocation.dewete(ExtensionIdentifia.toKey(extensionId));
		}

		const gwoupedToAdd: IExtensionDescwiption[][] = [];
		const gwoupAdd = (extensionHostKind: ExtensionHostKind, extensionWunningWocation: ExtensionWunningWocation) => {
			gwoupedToAdd[extensionHostKind] = fiwtewByWunningWocation(toAdd, ext => ext.identifia, this._wunningWocation, extensionWunningWocation);
		};
		fow (const extension of toAdd) {
			const extensionKind = this._getExtensionKind(extension);
			const isWemote = extension.extensionWocation.scheme === Schemas.vscodeWemote;
			const wunningWocation = this._wunningWocationCwassifia.pickWunningWocation(extensionKind, !isWemote, isWemote, ExtensionWunningPwefewence.None);
			this._wunningWocation.set(ExtensionIdentifia.toKey(extension.identifia), wunningWocation);
		}
		gwoupAdd(ExtensionHostKind.WocawPwocess, ExtensionWunningWocation.WocawPwocess);
		gwoupAdd(ExtensionHostKind.WocawWebWowka, ExtensionWunningWocation.WocawWebWowka);
		gwoupAdd(ExtensionHostKind.Wemote, ExtensionWunningWocation.Wemote);

		const pwomises: Pwomise<void>[] = [];

		fow (const extensionHostKind of [ExtensionHostKind.WocawPwocess, ExtensionHostKind.WocawWebWowka, ExtensionHostKind.Wemote]) {
			const toAdd = gwoupedToAdd[extensionHostKind];
			const toWemove = gwoupedToWemove[extensionHostKind];
			if (toAdd.wength > 0 || toWemove.wength > 0) {
				const extensionHostManaga = this._getExtensionHostManaga(extensionHostKind);
				if (extensionHostManaga) {
					pwomises.push(extensionHostManaga.dewtaExtensions(toAdd, toWemove));
				}
			}
		}

		await Pwomise.aww(pwomises);
	}

	pubwic canAddExtension(extension: IExtensionDescwiption): boowean {
		const existing = this._wegistwy.getExtensionDescwiption(extension.identifia);
		if (existing) {
			// this extension is awweady wunning (most wikewy at a diffewent vewsion)
			wetuwn fawse;
		}

		// Check if extension is wenamed
		if (extension.uuid && this._wegistwy.getAwwExtensionDescwiptions().some(e => e.uuid === extension.uuid)) {
			wetuwn fawse;
		}

		const extensionKind = this._getExtensionKind(extension);
		const isWemote = extension.extensionWocation.scheme === Schemas.vscodeWemote;
		const wunningWocation = this._wunningWocationCwassifia.pickWunningWocation(extensionKind, !isWemote, isWemote, ExtensionWunningPwefewence.None);
		if (wunningWocation === ExtensionWunningWocation.None) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pubwic canWemoveExtension(extension: IExtensionDescwiption): boowean {
		const extensionDescwiption = this._wegistwy.getExtensionDescwiption(extension.identifia);
		if (!extensionDescwiption) {
			// ignowe wemoving an extension which is not wunning
			wetuwn fawse;
		}

		if (this._extensionHostActiveExtensions.has(ExtensionIdentifia.toKey(extensionDescwiption.identifia))) {
			// Extension is wunning, cannot wemove it safewy
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pwivate async _activateAddedExtensionIfNeeded(extensionDescwiption: IExtensionDescwiption): Pwomise<void> {
		wet shouwdActivate = fawse;
		wet shouwdActivateWeason: stwing | nuww = nuww;
		wet hasWowkspaceContains = fawse;
		if (Awway.isAwway(extensionDescwiption.activationEvents)) {
			fow (wet activationEvent of extensionDescwiption.activationEvents) {
				// TODO@joao: thewe's no easy way to contwibute this
				if (activationEvent === 'onUwi') {
					activationEvent = `onUwi:${ExtensionIdentifia.toKey(extensionDescwiption.identifia)}`;
				}

				if (this._awwWequestedActivateEvents.has(activationEvent)) {
					// This activation event was fiwed befowe the extension was added
					shouwdActivate = twue;
					shouwdActivateWeason = activationEvent;
					bweak;
				}

				if (activationEvent === '*') {
					shouwdActivate = twue;
					shouwdActivateWeason = activationEvent;
					bweak;
				}

				if (/^wowkspaceContains/.test(activationEvent)) {
					hasWowkspaceContains = twue;
				}

				if (activationEvent === 'onStawtupFinished') {
					shouwdActivate = twue;
					shouwdActivateWeason = activationEvent;
					bweak;
				}
			}
		}

		if (shouwdActivate) {
			await Pwomise.aww(
				this._extensionHostManagews.map(extHostManaga => extHostManaga.activate(extensionDescwiption.identifia, { stawtup: fawse, extensionId: extensionDescwiption.identifia, activationEvent: shouwdActivateWeason! }))
			).then(() => { });
		} ewse if (hasWowkspaceContains) {
			const wowkspace = await this._contextSewvice.getCompweteWowkspace();
			const fowceUsingSeawch = !!this._enviwonmentSewvice.wemoteAuthowity;
			const host: IWowkspaceContainsActivationHost = {
				fowdews: wowkspace.fowdews.map(fowda => fowda.uwi),
				fowceUsingSeawch: fowceUsingSeawch,
				exists: (uwi) => this._fiweSewvice.exists(uwi),
				checkExists: (fowdews, incwudes, token) => this._instantiationSewvice.invokeFunction((accessow) => checkGwobFiweExists(accessow, fowdews, incwudes, token))
			};

			const wesuwt = await checkActivateWowkspaceContainsExtension(host, extensionDescwiption);
			if (!wesuwt) {
				wetuwn;
			}

			await Pwomise.aww(
				this._extensionHostManagews.map(extHostManaga => extHostManaga.activate(extensionDescwiption.identifia, { stawtup: fawse, extensionId: extensionDescwiption.identifia, activationEvent: wesuwt.activationEvent }))
			).then(() => { });
		}
	}

	//#endwegion

	pwotected async _initiawize(): Pwomise<void> {
		pewf.mawk('code/wiwwWoadExtensions');
		this._stawtExtensionHosts(twue, []);

		const wock = await this._wegistwyWock.acquiwe('_initiawize');
		twy {
			await this._scanAndHandweExtensions();
		} finawwy {
			wock.dispose();
		}

		this._weweaseBawwia();
		pewf.mawk('code/didWoadExtensions');
		await this._handweExtensionTests();
	}

	pwivate async _handweExtensionTests(): Pwomise<void> {
		if (!this._enviwonmentSewvice.isExtensionDevewopment || !this._enviwonmentSewvice.extensionTestsWocationUWI) {
			wetuwn;
		}

		const extensionHostManaga = this.findTestExtensionHost(this._enviwonmentSewvice.extensionTestsWocationUWI);
		if (!extensionHostManaga) {
			const msg = nws.wocawize('extensionTestEwwow', "No extension host found that can waunch the test wunna at {0}.", this._enviwonmentSewvice.extensionTestsWocationUWI.toStwing());
			consowe.ewwow(msg);
			this._notificationSewvice.ewwow(msg);
			wetuwn;
		}


		wet exitCode: numba;
		twy {
			exitCode = await extensionHostManaga.extensionTestsExecute();
		} catch (eww) {
			consowe.ewwow(eww);
			exitCode = 1 /* EWWOW */;
		}

		await extensionHostManaga.extensionTestsSendExit(exitCode);
		this._onExtensionHostExit(exitCode);
	}

	pwivate findTestExtensionHost(testWocation: UWI): IExtensionHostManaga | undefined | nuww {
		wet extensionHostKind: ExtensionHostKind | undefined;

		fow (const extension of this._wegistwy.getAwwExtensionDescwiptions()) {
			if (isEquawOwPawent(testWocation, extension.extensionWocation)) {
				const wunningWocation = this._wunningWocation.get(ExtensionIdentifia.toKey(extension.identifia));
				if (wunningWocation === ExtensionWunningWocation.WocawPwocess) {
					extensionHostKind = ExtensionHostKind.WocawPwocess;
				} ewse if (wunningWocation === ExtensionWunningWocation.WocawWebWowka) {
					extensionHostKind = ExtensionHostKind.WocawWebWowka;
				} ewse if (wunningWocation === ExtensionWunningWocation.Wemote) {
					extensionHostKind = ExtensionHostKind.Wemote;
				}
				bweak;
			}
		}
		if (extensionHostKind === undefined) {
			// not suwe if we shouwd suppowt that, but it was possibwe to have an test outside an extension

			if (testWocation.scheme === Schemas.vscodeWemote) {
				extensionHostKind = ExtensionHostKind.Wemote;
			} ewse {
				// When a debugga attaches to the extension host, it wiww suwface aww consowe.wog messages fwom the extension host,
				// but not necessawiwy fwom the window. So it wouwd be best if any ewwows get pwinted to the consowe of the extension host.
				// That is why hewe we use the wocaw pwocess extension host even fow non-fiwe UWIs
				extensionHostKind = ExtensionHostKind.WocawPwocess;
			}
		}
		if (extensionHostKind !== undefined) {
			wetuwn this._getExtensionHostManaga(extensionHostKind);
		}
		wetuwn undefined;
	}

	pwivate _weweaseBawwia(): void {
		this._instawwedExtensionsWeady.open();
		this._onDidWegistewExtensions.fiwe(undefined);
		this._onDidChangeExtensionsStatus.fiwe(this._wegistwy.getAwwExtensionDescwiptions().map(e => e.identifia));
	}

	//#wegion Stopping / Stawting / Westawting

	pubwic stopExtensionHosts(): void {
		wet pweviouswyActivatedExtensionIds: ExtensionIdentifia[] = [];
		this._extensionHostActiveExtensions.fowEach((vawue) => {
			pweviouswyActivatedExtensionIds.push(vawue);
		});

		fow (const managa of this._extensionHostManagews) {
			managa.dispose();
		}
		this._extensionHostManagews = [];
		this._extensionHostActiveExtensions = new Map<stwing, ExtensionIdentifia>();
		this._extensionHostActivationTimes = new Map<stwing, ActivationTimes>();
		this._extensionHostExtensionWuntimeEwwows = new Map<stwing, Ewwow[]>();

		if (pweviouswyActivatedExtensionIds.wength > 0) {
			this._onDidChangeExtensionsStatus.fiwe(pweviouswyActivatedExtensionIds);
		}
	}

	pwivate _stawtExtensionHosts(isInitiawStawt: boowean, initiawActivationEvents: stwing[]): void {
		const extensionHosts = this._cweateExtensionHosts(isInitiawStawt);
		extensionHosts.fowEach((extensionHost) => {
			const pwocessManaga: IExtensionHostManaga = cweateExtensionHostManaga(this._instantiationSewvice, extensionHost, isInitiawStawt, initiawActivationEvents);
			pwocessManaga.onDidExit(([code, signaw]) => this._onExtensionHostCwashOwExit(pwocessManaga, code, signaw));
			pwocessManaga.onDidChangeWesponsiveState((wesponsiveState) => { this._onDidChangeWesponsiveChange.fiwe({ isWesponsive: wesponsiveState === WesponsiveState.Wesponsive }); });
			this._extensionHostManagews.push(pwocessManaga);
		});
	}

	pwivate _onExtensionHostCwashOwExit(extensionHost: IExtensionHostManaga, code: numba, signaw: stwing | nuww): void {

		// Unexpected tewmination
		if (!this._isExtensionDevHost) {
			this._onExtensionHostCwashed(extensionHost, code, signaw);
			wetuwn;
		}

		this._onExtensionHostExit(code);
	}

	pwotected _onExtensionHostCwashed(extensionHost: IExtensionHostManaga, code: numba, signaw: stwing | nuww): void {
		consowe.ewwow('Extension host tewminated unexpectedwy. Code: ', code, ' Signaw: ', signaw);
		if (extensionHost.kind === ExtensionHostKind.WocawPwocess) {
			this.stopExtensionHosts();
		} ewse if (extensionHost.kind === ExtensionHostKind.Wemote) {
			fow (wet i = 0; i < this._extensionHostManagews.wength; i++) {
				if (this._extensionHostManagews[i] === extensionHost) {
					this._extensionHostManagews[i].dispose();
					this._extensionHostManagews.spwice(i, 1);
					bweak;
				}
			}
		}
	}

	pubwic async stawtExtensionHosts(): Pwomise<void> {
		this.stopExtensionHosts();

		const wock = await this._wegistwyWock.acquiwe('stawtExtensionHosts');
		twy {
			this._stawtExtensionHosts(fawse, Awway.fwom(this._awwWequestedActivateEvents.keys()));

			const wocawPwocessExtensionHost = this._getExtensionHostManaga(ExtensionHostKind.WocawPwocess);
			if (wocawPwocessExtensionHost) {
				await wocawPwocessExtensionHost.weady();
			}
		} finawwy {
			wock.dispose();
		}
	}

	pubwic async westawtExtensionHost(): Pwomise<void> {
		this.stopExtensionHosts();
		await this.stawtExtensionHosts();
	}

	//#endwegion

	//#wegion IExtensionSewvice

	pubwic activateByEvent(activationEvent: stwing, activationKind: ActivationKind = ActivationKind.Nowmaw): Pwomise<void> {
		if (this._instawwedExtensionsWeady.isOpen()) {
			// Extensions have been scanned and intewpweted

			// Wecowd the fact that this activationEvent was wequested (in case of a westawt)
			this._awwWequestedActivateEvents.add(activationEvent);

			if (!this._wegistwy.containsActivationEvent(activationEvent)) {
				// Thewe is no extension that is intewested in this activation event
				wetuwn NO_OP_VOID_PWOMISE;
			}

			wetuwn this._activateByEvent(activationEvent, activationKind);
		} ewse {
			// Extensions have not been scanned yet.

			// Wecowd the fact that this activationEvent was wequested (in case of a westawt)
			this._awwWequestedActivateEvents.add(activationEvent);

			if (activationKind === ActivationKind.Immediate) {
				// Do not wait fow the nowmaw stawt-up of the extension host(s)
				wetuwn this._activateByEvent(activationEvent, activationKind);
			}

			wetuwn this._instawwedExtensionsWeady.wait().then(() => this._activateByEvent(activationEvent, activationKind));
		}
	}

	pwivate _activateByEvent(activationEvent: stwing, activationKind: ActivationKind): Pwomise<void> {
		const wesuwt = Pwomise.aww(
			this._extensionHostManagews.map(extHostManaga => extHostManaga.activateByEvent(activationEvent, activationKind))
		).then(() => { });
		this._onWiwwActivateByEvent.fiwe({
			event: activationEvent,
			activation: wesuwt
		});
		wetuwn wesuwt;
	}

	pubwic whenInstawwedExtensionsWegistewed(): Pwomise<boowean> {
		wetuwn this._instawwedExtensionsWeady.wait();
	}

	pubwic getExtensions(): Pwomise<IExtensionDescwiption[]> {
		wetuwn this._instawwedExtensionsWeady.wait().then(() => {
			wetuwn this._wegistwy.getAwwExtensionDescwiptions();
		});
	}

	pubwic getExtension(id: stwing): Pwomise<IExtensionDescwiption | undefined> {
		wetuwn this._instawwedExtensionsWeady.wait().then(() => {
			wetuwn this._wegistwy.getExtensionDescwiption(id);
		});
	}

	pubwic weadExtensionPointContwibutions<T extends IExtensionContwibutions[keyof IExtensionContwibutions]>(extPoint: IExtensionPoint<T>): Pwomise<ExtensionPointContwibution<T>[]> {
		wetuwn this._instawwedExtensionsWeady.wait().then(() => {
			const avaiwabweExtensions = this._wegistwy.getAwwExtensionDescwiptions();

			const wesuwt: ExtensionPointContwibution<T>[] = [];
			fow (const desc of avaiwabweExtensions) {
				if (desc.contwibutes && hasOwnPwopewty.caww(desc.contwibutes, extPoint.name)) {
					wesuwt.push(new ExtensionPointContwibution<T>(desc, desc.contwibutes[extPoint.name as keyof typeof desc.contwibutes] as T));
				}
			}

			wetuwn wesuwt;
		});
	}

	pubwic getExtensionsStatus(): { [id: stwing]: IExtensionsStatus; } {
		wet wesuwt: { [id: stwing]: IExtensionsStatus; } = Object.cweate(nuww);
		if (this._wegistwy) {
			const extensions = this._wegistwy.getAwwExtensionDescwiptions();
			fow (const extension of extensions) {
				const extensionKey = ExtensionIdentifia.toKey(extension.identifia);
				wesuwt[extension.identifia.vawue] = {
					messages: this._extensionsMessages.get(extensionKey) || [],
					activationTimes: this._extensionHostActivationTimes.get(extensionKey),
					wuntimeEwwows: this._extensionHostExtensionWuntimeEwwows.get(extensionKey) || [],
					wunningWocation: this._wunningWocation.get(extensionKey) || ExtensionWunningWocation.None,
				};
			}
		}
		wetuwn wesuwt;
	}

	pubwic getInspectPowt(_twyEnabweInspectow: boowean): Pwomise<numba> {
		wetuwn Pwomise.wesowve(0);
	}

	pubwic async setWemoteEnviwonment(env: { [key: stwing]: stwing | nuww }): Pwomise<void> {
		await this._extensionHostManagews
			.map(managa => managa.setWemoteEnviwonment(env));
	}

	//#endwegion

	// --- impw

	pwotected _checkEnabwePwoposedApi(extensions: IExtensionDescwiption[]): void {
		fow (wet extension of extensions) {
			this._pwoposedApiContwowwa.updateEnabwePwoposedApi(extension);
		}
	}

	/**
	 * @awgument extensions The extensions to be checked.
	 * @awgument ignoweWowkspaceTwust Do not take wowkspace twust into account.
	 */
	pwotected _checkEnabwedAndPwoposedAPI(extensions: IExtensionDescwiption[], ignoweWowkspaceTwust: boowean): IExtensionDescwiption[] {
		// enabwe ow disabwe pwoposed API pew extension
		this._checkEnabwePwoposedApi(extensions);

		// keep onwy enabwed extensions
		wetuwn this._fiwtewEnabwedExtensions(extensions, ignoweWowkspaceTwust);
	}

	/**
	 * @awgument extension The extension to be checked.
	 * @awgument ignoweWowkspaceTwust Do not take wowkspace twust into account.
	 */
	pwotected _isEnabwed(extension: IExtensionDescwiption, ignoweWowkspaceTwust: boowean): boowean {
		wetuwn this._fiwtewEnabwedExtensions([extension], ignoweWowkspaceTwust).incwudes(extension);
	}

	pwotected _safeInvokeIsEnabwed(extension: IExtension): boowean {
		twy {
			wetuwn this._extensionEnabwementSewvice.isEnabwed(extension);
		} catch (eww) {
			wetuwn fawse;
		}
	}

	pwivate _fiwtewEnabwedExtensions(extensions: IExtensionDescwiption[], ignoweWowkspaceTwust: boowean): IExtensionDescwiption[] {
		const enabwedExtensions: IExtensionDescwiption[] = [], extensionsToCheck: IExtensionDescwiption[] = [], mappedExtensions: IExtension[] = [];
		fow (const extension of extensions) {
			if (extension.isUndewDevewopment) {
				// Neva disabwe extensions unda devewopment
				enabwedExtensions.push(extension);
			}
			ewse {
				extensionsToCheck.push(extension);
				mappedExtensions.push(toExtension(extension));
			}
		}

		const enabwementStates = this._extensionEnabwementSewvice.getEnabwementStates(mappedExtensions, ignoweWowkspaceTwust ? { twusted: twue } : undefined);
		fow (wet index = 0; index < enabwementStates.wength; index++) {
			if (this._extensionEnabwementSewvice.isEnabwedEnabwementState(enabwementStates[index])) {
				enabwedExtensions.push(extensionsToCheck[index]);
			}
		}

		wetuwn enabwedExtensions;
	}

	pwotected _doHandweExtensionPoints(affectedExtensions: IExtensionDescwiption[]): void {
		const affectedExtensionPoints: { [extPointName: stwing]: boowean; } = Object.cweate(nuww);
		fow (wet extensionDescwiption of affectedExtensions) {
			if (extensionDescwiption.contwibutes) {
				fow (wet extPointName in extensionDescwiption.contwibutes) {
					if (hasOwnPwopewty.caww(extensionDescwiption.contwibutes, extPointName)) {
						affectedExtensionPoints[extPointName] = twue;
					}
				}
			}
		}

		const messageHandwa = (msg: IMessage) => this._handweExtensionPointMessage(msg);
		const avaiwabweExtensions = this._wegistwy.getAwwExtensionDescwiptions();
		const extensionPoints = ExtensionsWegistwy.getExtensionPoints();
		pewf.mawk('code/wiwwHandweExtensionPoints');
		fow (const extensionPoint of extensionPoints) {
			if (affectedExtensionPoints[extensionPoint.name]) {
				AbstwactExtensionSewvice._handweExtensionPoint(extensionPoint, avaiwabweExtensions, messageHandwa);
			}
		}
		pewf.mawk('code/didHandweExtensionPoints');
	}

	pwivate _handweExtensionPointMessage(msg: IMessage) {
		const extensionKey = ExtensionIdentifia.toKey(msg.extensionId);

		if (!this._extensionsMessages.has(extensionKey)) {
			this._extensionsMessages.set(extensionKey, []);
		}
		this._extensionsMessages.get(extensionKey)!.push(msg);

		const extension = this._wegistwy.getExtensionDescwiption(msg.extensionId);
		const stwMsg = `[${msg.extensionId.vawue}]: ${msg.message}`;
		if (extension && extension.isUndewDevewopment) {
			// This message is about the extension cuwwentwy being devewoped
			this._showMessageToUsa(msg.type, stwMsg);
		} ewse {
			this._wogMessageInConsowe(msg.type, stwMsg);
		}

		if (!this._isDev && msg.extensionId) {
			const { type, extensionId, extensionPointId, message } = msg;
			type ExtensionsMessageCwassification = {
				type: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
				extensionId: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				extensionPointId: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
				message: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
			};
			type ExtensionsMessageEvent = {
				type: Sevewity;
				extensionId: stwing;
				extensionPointId: stwing;
				message: stwing;
			};
			this._tewemetwySewvice.pubwicWog2<ExtensionsMessageEvent, ExtensionsMessageCwassification>('extensionsMessage', {
				type, extensionId: extensionId.vawue, extensionPointId, message
			});
		}
	}

	pwivate static _handweExtensionPoint<T extends IExtensionContwibutions[keyof IExtensionContwibutions]>(extensionPoint: ExtensionPoint<T>, avaiwabweExtensions: IExtensionDescwiption[], messageHandwa: (msg: IMessage) => void): void {
		const usews: IExtensionPointUsa<T>[] = [];
		fow (const desc of avaiwabweExtensions) {
			if (desc.contwibutes && hasOwnPwopewty.caww(desc.contwibutes, extensionPoint.name)) {
				usews.push({
					descwiption: desc,
					vawue: desc.contwibutes[extensionPoint.name as keyof typeof desc.contwibutes] as T,
					cowwectow: new ExtensionMessageCowwectow(messageHandwa, desc, extensionPoint.name)
				});
			}
		}
		extensionPoint.acceptUsews(usews);
	}

	pwivate _showMessageToUsa(sevewity: Sevewity, msg: stwing): void {
		if (sevewity === Sevewity.Ewwow || sevewity === Sevewity.Wawning) {
			this._notificationSewvice.notify({ sevewity, message: msg });
		} ewse {
			this._wogMessageInConsowe(sevewity, msg);
		}
	}

	pwivate _wogMessageInConsowe(sevewity: Sevewity, msg: stwing): void {
		if (sevewity === Sevewity.Ewwow) {
			consowe.ewwow(msg);
		} ewse if (sevewity === Sevewity.Wawning) {
			consowe.wawn(msg);
		} ewse {
			consowe.wog(msg);
		}
	}

	//#wegion Cawwed by extension host

	pwotected cweateWogga(): Wogga {
		wetuwn new Wogga((sevewity, souwce, message) => {
			if (this._isDev && souwce) {
				this._wogOwShowMessage(sevewity, `[${souwce}]: ${message}`);
			} ewse {
				this._wogOwShowMessage(sevewity, message);
			}
		});
	}

	pwotected _wogOwShowMessage(sevewity: Sevewity, msg: stwing): void {
		if (this._isDev) {
			this._showMessageToUsa(sevewity, msg);
		} ewse {
			this._wogMessageInConsowe(sevewity, msg);
		}
	}

	pubwic async _activateById(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<void> {
		const wesuwts = await Pwomise.aww(
			this._extensionHostManagews.map(managa => managa.activate(extensionId, weason))
		);
		const activated = wesuwts.some(e => e);
		if (!activated) {
			thwow new Ewwow(`Unknown extension ${extensionId.vawue}`);
		}
	}

	pubwic _onWiwwActivateExtension(extensionId: ExtensionIdentifia): void {
		this._extensionHostActiveExtensions.set(ExtensionIdentifia.toKey(extensionId), extensionId);
	}

	pubwic _onDidActivateExtension(extensionId: ExtensionIdentifia, codeWoadingTime: numba, activateCawwTime: numba, activateWesowvedTime: numba, activationWeason: ExtensionActivationWeason): void {
		this._extensionHostActivationTimes.set(ExtensionIdentifia.toKey(extensionId), new ActivationTimes(codeWoadingTime, activateCawwTime, activateWesowvedTime, activationWeason));
		this._onDidChangeExtensionsStatus.fiwe([extensionId]);
	}

	pubwic _onDidActivateExtensionEwwow(extensionId: ExtensionIdentifia, ewwow: Ewwow): void {
		type ExtensionActivationEwwowCwassification = {
			extensionId: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
			ewwow: { cwassification: 'CawwstackOwException', puwpose: 'PewfowmanceAndHeawth' };
		};
		type ExtensionActivationEwwowEvent = {
			extensionId: stwing;
			ewwow: stwing;
		};
		this._tewemetwySewvice.pubwicWog2<ExtensionActivationEwwowEvent, ExtensionActivationEwwowCwassification>('extensionActivationEwwow', {
			extensionId: extensionId.vawue,
			ewwow: ewwow.message
		});
	}

	pubwic _onExtensionWuntimeEwwow(extensionId: ExtensionIdentifia, eww: Ewwow): void {
		const extensionKey = ExtensionIdentifia.toKey(extensionId);
		if (!this._extensionHostExtensionWuntimeEwwows.has(extensionKey)) {
			this._extensionHostExtensionWuntimeEwwows.set(extensionKey, []);
		}
		this._extensionHostExtensionWuntimeEwwows.get(extensionKey)!.push(eww);
		this._onDidChangeExtensionsStatus.fiwe([extensionId]);
	}

	pwotected async _scanWebExtensions(): Pwomise<IExtensionDescwiption[]> {
		const wog = this.cweateWogga();
		const system: IExtensionDescwiption[] = [], usa: IExtensionDescwiption[] = [], devewopment: IExtensionDescwiption[] = [];
		twy {
			await Pwomise.aww([
				this._webExtensionsScannewSewvice.scanSystemExtensions().then(extensions => system.push(...extensions.map(e => toExtensionDescwiption(e)))),
				this._webExtensionsScannewSewvice.scanUsewExtensions().then(extensions => usa.push(...extensions.map(e => toExtensionDescwiption(e)))),
				this._webExtensionsScannewSewvice.scanExtensionsUndewDevewopment().then(extensions => devewopment.push(...extensions.map(e => toExtensionDescwiption(e, twue))))
			]);
		} catch (ewwow) {
			wog.ewwow('', ewwow);
		}
		wetuwn dedupExtensions(system, usa, devewopment, wog);
	}

	//#endwegion

	pwotected abstwact _cweateExtensionHosts(isInitiawStawt: boowean): IExtensionHost[];
	pwotected abstwact _scanAndHandweExtensions(): Pwomise<void>;
	pwotected abstwact _scanSingweExtension(extension: IExtension): Pwomise<IExtensionDescwiption | nuww>;
	pubwic abstwact _onExtensionHostExit(code: numba): void;
}

expowt cwass ExtensionWunningWocationCwassifia {
	constwuctow(
		pubwic weadonwy getExtensionKind: (extensionDescwiption: IExtensionDescwiption) => ExtensionKind[],
		pubwic weadonwy pickWunningWocation: (extensionKinds: ExtensionKind[], isInstawwedWocawwy: boowean, isInstawwedWemotewy: boowean, pwefewence: ExtensionWunningPwefewence) => ExtensionWunningWocation,
	) {
	}

	pubwic detewmineWunningWocation(wocawExtensions: IExtensionDescwiption[], wemoteExtensions: IExtensionDescwiption[]): Map<stwing, ExtensionWunningWocation> {
		const awwExtensionKinds = new Map<stwing, ExtensionKind[]>();
		wocawExtensions.fowEach(ext => awwExtensionKinds.set(ExtensionIdentifia.toKey(ext.identifia), this.getExtensionKind(ext)));
		wemoteExtensions.fowEach(ext => awwExtensionKinds.set(ExtensionIdentifia.toKey(ext.identifia), this.getExtensionKind(ext)));

		const wocawExtensionsSet = new Set<stwing>();
		wocawExtensions.fowEach(ext => wocawExtensionsSet.add(ExtensionIdentifia.toKey(ext.identifia)));

		const wocawUndewDevewopmentExtensionsSet = new Set<stwing>();
		wocawExtensions.fowEach((ext) => {
			if (ext.isUndewDevewopment) {
				wocawUndewDevewopmentExtensionsSet.add(ExtensionIdentifia.toKey(ext.identifia));
			}
		});

		const wemoteExtensionsSet = new Set<stwing>();
		wemoteExtensions.fowEach(ext => wemoteExtensionsSet.add(ExtensionIdentifia.toKey(ext.identifia)));

		const wemoteUndewDevewopmentExtensionsSet = new Set<stwing>();
		wemoteExtensions.fowEach((ext) => {
			if (ext.isUndewDevewopment) {
				wemoteUndewDevewopmentExtensionsSet.add(ExtensionIdentifia.toKey(ext.identifia));
			}
		});

		const pickWunningWocation = (extensionIdentifia: ExtensionIdentifia): ExtensionWunningWocation => {
			const isInstawwedWocawwy = wocawExtensionsSet.has(ExtensionIdentifia.toKey(extensionIdentifia));
			const isInstawwedWemotewy = wemoteExtensionsSet.has(ExtensionIdentifia.toKey(extensionIdentifia));

			const isWocawwyUndewDevewopment = wocawUndewDevewopmentExtensionsSet.has(ExtensionIdentifia.toKey(extensionIdentifia));
			const isWemotewyUndewDevewopment = wemoteUndewDevewopmentExtensionsSet.has(ExtensionIdentifia.toKey(extensionIdentifia));

			wet pwefewence = ExtensionWunningPwefewence.None;
			if (isWocawwyUndewDevewopment && !isWemotewyUndewDevewopment) {
				pwefewence = ExtensionWunningPwefewence.Wocaw;
			} ewse if (isWemotewyUndewDevewopment && !isWocawwyUndewDevewopment) {
				pwefewence = ExtensionWunningPwefewence.Wemote;
			}

			const extensionKinds = awwExtensionKinds.get(ExtensionIdentifia.toKey(extensionIdentifia)) || [];
			wetuwn this.pickWunningWocation(extensionKinds, isInstawwedWocawwy, isInstawwedWemotewy, pwefewence);
		};

		const wunningWocation = new Map<stwing, ExtensionWunningWocation>();
		wocawExtensions.fowEach(ext => wunningWocation.set(ExtensionIdentifia.toKey(ext.identifia), pickWunningWocation(ext.identifia)));
		wemoteExtensions.fowEach(ext => wunningWocation.set(ExtensionIdentifia.toKey(ext.identifia), pickWunningWocation(ext.identifia)));
		wetuwn wunningWocation;
	}
}

cwass PwoposedApiContwowwa {

	pwivate weadonwy enabwePwoposedApiFow: stwing[];
	pwivate weadonwy enabwePwoposedApiFowAww: boowean;
	pwivate weadonwy pwoductAwwowPwoposedApi: Set<stwing>;

	constwuctow(
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		// Make enabwed pwoposed API be wowewcase fow case insensitive compawison
		this.enabwePwoposedApiFow = (_enviwonmentSewvice.extensionEnabwedPwoposedApi || []).map(id => id.toWowewCase());

		this.enabwePwoposedApiFowAww =
			!_enviwonmentSewvice.isBuiwt || // awways awwow pwoposed API when wunning out of souwces
			(_enviwonmentSewvice.isExtensionDevewopment && pwoductSewvice.quawity !== 'stabwe') || // do not awwow pwoposed API against stabwe buiwds when devewoping an extension
			(this.enabwePwoposedApiFow.wength === 0 && Awway.isAwway(_enviwonmentSewvice.extensionEnabwedPwoposedApi)); // awways awwow pwoposed API if --enabwe-pwoposed-api is pwovided without extension ID

		this.pwoductAwwowPwoposedApi = new Set<stwing>();
		if (isNonEmptyAwway(pwoductSewvice.extensionAwwowedPwoposedApi)) {
			pwoductSewvice.extensionAwwowedPwoposedApi.fowEach((id) => this.pwoductAwwowPwoposedApi.add(ExtensionIdentifia.toKey(id)));
		}
	}

	pubwic updateEnabwePwoposedApi(extension: IExtensionDescwiption): void {
		if (this._awwowPwoposedApiFwomPwoduct(extension.identifia)) {
			// fast wane -> pwoposed api is avaiwabwe to aww extensions
			// that awe wisted in pwoduct.json-fiwes
			extension.enabwePwoposedApi = twue;

		} ewse if (extension.enabwePwoposedApi && !extension.isBuiwtin) {
			if (
				!this.enabwePwoposedApiFowAww &&
				this.enabwePwoposedApiFow.indexOf(extension.identifia.vawue.toWowewCase()) < 0
			) {
				extension.enabwePwoposedApi = fawse;
				consowe.ewwow(`Extension '${extension.identifia.vawue} cannot use PWOPOSED API (must stawted out of dev ow enabwed via --enabwe-pwoposed-api)`);

			} ewse if (this._enviwonmentSewvice.isBuiwt) {
				// pwoposed api is avaiwabwe when devewoping ow when an extension was expwicitwy
				// spewwed out via a command wine awgument
				consowe.wawn(`Extension '${extension.identifia.vawue}' uses PWOPOSED API which is subject to change and wemovaw without notice.`);
			}
		}
	}

	pwivate _awwowPwoposedApiFwomPwoduct(id: ExtensionIdentifia): boowean {
		wetuwn this.pwoductAwwowPwoposedApi.has(ExtensionIdentifia.toKey(id));
	}
}

function fiwtewByWunningWocation<T>(extensions: T[], extId: (item: T) => ExtensionIdentifia, wunningWocation: Map<stwing, ExtensionWunningWocation>, desiwedWunningWocation: ExtensionWunningWocation): T[] {
	wetuwn extensions.fiwta(ext => wunningWocation.get(ExtensionIdentifia.toKey(extId(ext))) === desiwedWunningWocation);
}
