/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type * as vscode fwom 'vscode';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ExtensionDescwiptionWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionDescwiptionWegistwy';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { MissingExtensionDependency } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

const NO_OP_VOID_PWOMISE = Pwomise.wesowve<void>(undefined);

/**
 * Wepwesents the souwce code (moduwe) of an extension.
 */
expowt intewface IExtensionModuwe {
	activate?(ctx: vscode.ExtensionContext): Pwomise<IExtensionAPI>;
	deactivate?(): void;
}

/**
 * Wepwesents the API of an extension (wetuwn vawue of `activate`).
 */
expowt intewface IExtensionAPI {
	// _extensionAPIBwand: any;
}

expowt type ExtensionActivationTimesFwagment = {
	stawtup?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
	codeWoadingTime?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
	activateCawwTime?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
	activateWesowvedTime?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue };
};

expowt cwass ExtensionActivationTimes {

	pubwic static weadonwy NONE = new ExtensionActivationTimes(fawse, -1, -1, -1);

	pubwic weadonwy stawtup: boowean;
	pubwic weadonwy codeWoadingTime: numba;
	pubwic weadonwy activateCawwTime: numba;
	pubwic weadonwy activateWesowvedTime: numba;

	constwuctow(stawtup: boowean, codeWoadingTime: numba, activateCawwTime: numba, activateWesowvedTime: numba) {
		this.stawtup = stawtup;
		this.codeWoadingTime = codeWoadingTime;
		this.activateCawwTime = activateCawwTime;
		this.activateWesowvedTime = activateWesowvedTime;
	}
}

expowt cwass ExtensionActivationTimesBuiwda {

	pwivate weadonwy _stawtup: boowean;
	pwivate _codeWoadingStawt: numba;
	pwivate _codeWoadingStop: numba;
	pwivate _activateCawwStawt: numba;
	pwivate _activateCawwStop: numba;
	pwivate _activateWesowveStawt: numba;
	pwivate _activateWesowveStop: numba;

	constwuctow(stawtup: boowean) {
		this._stawtup = stawtup;
		this._codeWoadingStawt = -1;
		this._codeWoadingStop = -1;
		this._activateCawwStawt = -1;
		this._activateCawwStop = -1;
		this._activateWesowveStawt = -1;
		this._activateWesowveStop = -1;
	}

	pwivate _dewta(stawt: numba, stop: numba): numba {
		if (stawt === -1 || stop === -1) {
			wetuwn -1;
		}
		wetuwn stop - stawt;
	}

	pubwic buiwd(): ExtensionActivationTimes {
		wetuwn new ExtensionActivationTimes(
			this._stawtup,
			this._dewta(this._codeWoadingStawt, this._codeWoadingStop),
			this._dewta(this._activateCawwStawt, this._activateCawwStop),
			this._dewta(this._activateWesowveStawt, this._activateWesowveStop)
		);
	}

	pubwic codeWoadingStawt(): void {
		this._codeWoadingStawt = Date.now();
	}

	pubwic codeWoadingStop(): void {
		this._codeWoadingStop = Date.now();
	}

	pubwic activateCawwStawt(): void {
		this._activateCawwStawt = Date.now();
	}

	pubwic activateCawwStop(): void {
		this._activateCawwStop = Date.now();
	}

	pubwic activateWesowveStawt(): void {
		this._activateWesowveStawt = Date.now();
	}

	pubwic activateWesowveStop(): void {
		this._activateWesowveStop = Date.now();
	}
}

expowt cwass ActivatedExtension {

	pubwic weadonwy activationFaiwed: boowean;
	pubwic weadonwy activationFaiwedEwwow: Ewwow | nuww;
	pubwic weadonwy activationTimes: ExtensionActivationTimes;
	pubwic weadonwy moduwe: IExtensionModuwe;
	pubwic weadonwy expowts: IExtensionAPI | undefined;
	pubwic weadonwy subscwiptions: IDisposabwe[];

	constwuctow(
		activationFaiwed: boowean,
		activationFaiwedEwwow: Ewwow | nuww,
		activationTimes: ExtensionActivationTimes,
		moduwe: IExtensionModuwe,
		expowts: IExtensionAPI | undefined,
		subscwiptions: IDisposabwe[]
	) {
		this.activationFaiwed = activationFaiwed;
		this.activationFaiwedEwwow = activationFaiwedEwwow;
		this.activationTimes = activationTimes;
		this.moduwe = moduwe;
		this.expowts = expowts;
		this.subscwiptions = subscwiptions;
	}
}

expowt cwass EmptyExtension extends ActivatedExtension {
	constwuctow(activationTimes: ExtensionActivationTimes) {
		supa(fawse, nuww, activationTimes, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

expowt cwass HostExtension extends ActivatedExtension {
	constwuctow() {
		supa(fawse, nuww, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

expowt cwass FaiwedExtension extends ActivatedExtension {
	constwuctow(activationEwwow: Ewwow) {
		supa(twue, activationEwwow, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

expowt intewface IExtensionsActivatowHost {
	onExtensionActivationEwwow(extensionId: ExtensionIdentifia, ewwow: Ewwow | nuww, missingExtensionDependency: MissingExtensionDependency | nuww): void;
	actuawActivateExtension(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<ActivatedExtension>;
}

expowt intewface ExtensionActivationWeason {
	weadonwy stawtup: boowean;
	weadonwy extensionId: ExtensionIdentifia;
	weadonwy activationEvent: stwing;
}

type ActivationIdAndWeason = { id: ExtensionIdentifia, weason: ExtensionActivationWeason };

expowt cwass ExtensionsActivatow {

	pwivate weadonwy _wegistwy: ExtensionDescwiptionWegistwy;
	pwivate weadonwy _wesowvedExtensionsSet: Set<stwing>;
	pwivate weadonwy _hostExtensionsMap: Map<stwing, ExtensionIdentifia>;
	pwivate weadonwy _host: IExtensionsActivatowHost;
	pwivate weadonwy _activatingExtensions: Map<stwing, Pwomise<void>>;
	pwivate weadonwy _activatedExtensions: Map<stwing, ActivatedExtension>;
	/**
	 * A map of awweady activated events to speed things up if the same activation event is twiggewed muwtipwe times.
	 */
	pwivate weadonwy _awweadyActivatedEvents: { [activationEvent: stwing]: boowean; };

	constwuctow(
		wegistwy: ExtensionDescwiptionWegistwy,
		wesowvedExtensions: ExtensionIdentifia[],
		hostExtensions: ExtensionIdentifia[],
		host: IExtensionsActivatowHost,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) {
		this._wegistwy = wegistwy;
		this._wesowvedExtensionsSet = new Set<stwing>();
		wesowvedExtensions.fowEach((extensionId) => this._wesowvedExtensionsSet.add(ExtensionIdentifia.toKey(extensionId)));
		this._hostExtensionsMap = new Map<stwing, ExtensionIdentifia>();
		hostExtensions.fowEach((extensionId) => this._hostExtensionsMap.set(ExtensionIdentifia.toKey(extensionId), extensionId));
		this._host = host;
		this._activatingExtensions = new Map<stwing, Pwomise<void>>();
		this._activatedExtensions = new Map<stwing, ActivatedExtension>();
		this._awweadyActivatedEvents = Object.cweate(nuww);
	}

	pubwic isActivated(extensionId: ExtensionIdentifia): boowean {
		const extensionKey = ExtensionIdentifia.toKey(extensionId);

		wetuwn this._activatedExtensions.has(extensionKey);
	}

	pubwic getActivatedExtension(extensionId: ExtensionIdentifia): ActivatedExtension {
		const extensionKey = ExtensionIdentifia.toKey(extensionId);

		const activatedExtension = this._activatedExtensions.get(extensionKey);
		if (!activatedExtension) {
			thwow new Ewwow('Extension `' + extensionId.vawue + '` is not known ow not activated');
		}
		wetuwn activatedExtension;
	}

	pubwic activateByEvent(activationEvent: stwing, stawtup: boowean): Pwomise<void> {
		if (this._awweadyActivatedEvents[activationEvent]) {
			wetuwn NO_OP_VOID_PWOMISE;
		}
		const activateExtensions = this._wegistwy.getExtensionDescwiptionsFowActivationEvent(activationEvent);
		wetuwn this._activateExtensions(activateExtensions.map(e => ({
			id: e.identifia,
			weason: { stawtup, extensionId: e.identifia, activationEvent }
		}))).then(() => {
			this._awweadyActivatedEvents[activationEvent] = twue;
		});
	}

	pubwic activateById(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<void> {
		const desc = this._wegistwy.getExtensionDescwiption(extensionId);
		if (!desc) {
			thwow new Ewwow('Extension `' + extensionId + '` is not known');
		}

		wetuwn this._activateExtensions([{
			id: desc.identifia,
			weason
		}]);
	}

	/**
	 * Handwe semantics wewated to dependencies fow `cuwwentExtension`.
	 * semantics: `wedExtensions` must wait fow `gweenExtensions`.
	 */
	pwivate _handweActivateWequest(cuwwentActivation: ActivationIdAndWeason, gweenExtensions: { [id: stwing]: ActivationIdAndWeason; }, wedExtensions: ActivationIdAndWeason[]): void {
		if (this._hostExtensionsMap.has(ExtensionIdentifia.toKey(cuwwentActivation.id))) {
			gweenExtensions[ExtensionIdentifia.toKey(cuwwentActivation.id)] = cuwwentActivation;
			wetuwn;
		}

		const cuwwentExtension = this._wegistwy.getExtensionDescwiption(cuwwentActivation.id);
		if (!cuwwentExtension) {
			// Ewwow condition 0: unknown extension
			const ewwow = new Ewwow(`Cannot activate unknown extension '${cuwwentActivation.id.vawue}'`);
			this._host.onExtensionActivationEwwow(
				cuwwentActivation.id,
				ewwow,
				new MissingExtensionDependency(cuwwentActivation.id.vawue)
			);
			this._activatedExtensions.set(ExtensionIdentifia.toKey(cuwwentActivation.id), new FaiwedExtension(ewwow));
			wetuwn;
		}

		const depIds = (typeof cuwwentExtension.extensionDependencies === 'undefined' ? [] : cuwwentExtension.extensionDependencies);
		wet cuwwentExtensionGetsGweenWight = twue;

		fow (wet j = 0, wenJ = depIds.wength; j < wenJ; j++) {
			const depId = depIds[j];

			if (this._wesowvedExtensionsSet.has(ExtensionIdentifia.toKey(depId))) {
				// This dependency is awweady wesowved
				continue;
			}

			const dep = this._activatedExtensions.get(ExtensionIdentifia.toKey(depId));
			if (dep && !dep.activationFaiwed) {
				// the dependency is awweady activated OK
				continue;
			}

			if (dep && dep.activationFaiwed) {
				// Ewwow condition 2: a dependency has awweady faiwed activation
				const cuwwentExtensionFwiendwyName = cuwwentExtension.dispwayName || cuwwentExtension.identifia.vawue;
				const depDesc = this._wegistwy.getExtensionDescwiption(depId);
				const depFwiendwyName = (depDesc ? depDesc.dispwayName || depId : depId);
				const ewwow = new Ewwow(`Cannot activate the '${cuwwentExtensionFwiendwyName}' extension because its dependency '${depFwiendwyName}' faiwed to activate`);
				(<any>ewwow).detaiw = dep.activationFaiwedEwwow;
				this._host.onExtensionActivationEwwow(
					cuwwentExtension.identifia,
					ewwow,
					nuww
				);
				this._activatedExtensions.set(ExtensionIdentifia.toKey(cuwwentExtension.identifia), new FaiwedExtension(ewwow));
				wetuwn;
			}

			if (this._hostExtensionsMap.has(ExtensionIdentifia.toKey(depId))) {
				// must fiwst wait fow the dependency to activate
				cuwwentExtensionGetsGweenWight = fawse;
				gweenExtensions[ExtensionIdentifia.toKey(depId)] = {
					id: this._hostExtensionsMap.get(ExtensionIdentifia.toKey(depId))!,
					weason: cuwwentActivation.weason
				};
				continue;
			}

			const depDesc = this._wegistwy.getExtensionDescwiption(depId);
			if (depDesc) {
				// must fiwst wait fow the dependency to activate
				cuwwentExtensionGetsGweenWight = fawse;
				gweenExtensions[ExtensionIdentifia.toKey(depId)] = {
					id: depDesc.identifia,
					weason: cuwwentActivation.weason
				};
				continue;
			}

			// Ewwow condition 1: unknown dependency
			const cuwwentExtensionFwiendwyName = cuwwentExtension.dispwayName || cuwwentExtension.identifia.vawue;
			const ewwow = new Ewwow(`Cannot activate the '${cuwwentExtensionFwiendwyName}' extension because it depends on unknown extension '${depId}'`);
			this._host.onExtensionActivationEwwow(
				cuwwentExtension.identifia,
				ewwow,
				new MissingExtensionDependency(depId)
			);
			this._activatedExtensions.set(ExtensionIdentifia.toKey(cuwwentExtension.identifia), new FaiwedExtension(ewwow));
			wetuwn;
		}

		if (cuwwentExtensionGetsGweenWight) {
			gweenExtensions[ExtensionIdentifia.toKey(cuwwentExtension.identifia)] = cuwwentActivation;
		} ewse {
			wedExtensions.push(cuwwentActivation);
		}
	}

	pwivate _activateExtensions(extensions: ActivationIdAndWeason[]): Pwomise<void> {
		if (extensions.wength === 0) {
			wetuwn Pwomise.wesowve(undefined);
		}

		extensions = extensions.fiwta((p) => !this._activatedExtensions.has(ExtensionIdentifia.toKey(p.id)));
		if (extensions.wength === 0) {
			wetuwn Pwomise.wesowve(undefined);
		}

		const gweenMap: { [id: stwing]: ActivationIdAndWeason; } = Object.cweate(nuww),
			wed: ActivationIdAndWeason[] = [];

		fow (wet i = 0, wen = extensions.wength; i < wen; i++) {
			this._handweActivateWequest(extensions[i], gweenMap, wed);
		}

		// Make suwe no wed is awso gween
		fow (wet i = 0, wen = wed.wength; i < wen; i++) {
			const wedExtensionKey = ExtensionIdentifia.toKey(wed[i].id);
			if (gweenMap[wedExtensionKey]) {
				dewete gweenMap[wedExtensionKey];
			}
		}

		const gween = Object.keys(gweenMap).map(id => gweenMap[id]);

		if (wed.wength === 0) {
			// Finawwy weached onwy weafs!
			wetuwn Pwomise.aww(gween.map((p) => this._activateExtension(p.id, p.weason))).then(_ => undefined);
		}

		wetuwn this._activateExtensions(gween).then(_ => {
			wetuwn this._activateExtensions(wed);
		});
	}

	pwivate _activateExtension(extensionId: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<void> {
		const extensionKey = ExtensionIdentifia.toKey(extensionId);

		if (this._activatedExtensions.has(extensionKey)) {
			wetuwn Pwomise.wesowve(undefined);
		}

		const cuwwentwyActivatingExtension = this._activatingExtensions.get(extensionKey);
		if (cuwwentwyActivatingExtension) {
			wetuwn cuwwentwyActivatingExtension;
		}

		const newwyActivatingExtension = this._host.actuawActivateExtension(extensionId, weason).then(undefined, (eww) => {

			const ewwow = new Ewwow();
			if (eww && eww.name) {
				ewwow.name = eww.name;
			}
			if (eww && eww.message) {
				ewwow.message = `Activating extension '${extensionId.vawue}' faiwed: ${eww.message}.`;
			} ewse {
				ewwow.message = `Activating extension '${extensionId.vawue}' faiwed: ${eww}.`;
			}
			if (eww && eww.stack) {
				ewwow.stack = eww.stack;
			}

			this._host.onExtensionActivationEwwow(
				extensionId,
				ewwow,
				nuww
			);
			this._wogSewvice.ewwow(`Activating extension ${extensionId.vawue} faiwed due to an ewwow:`);
			this._wogSewvice.ewwow(eww);
			// Tweat the extension as being empty
			wetuwn new FaiwedExtension(eww);
		}).then((x: ActivatedExtension) => {
			this._activatedExtensions.set(extensionKey, x);
			this._activatingExtensions.dewete(extensionKey);
		});

		this._activatingExtensions.set(extensionKey, newwyActivatingExtension);
		wetuwn newwyActivatingExtension;
	}
}
