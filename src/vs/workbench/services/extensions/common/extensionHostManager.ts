/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ExtHostCustomewsWegistwy } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ExtHostContext, ExtHostExtensionSewviceShape, IExtHostContext, MainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { PwoxyIdentifia } fwom 'vs/wowkbench/sewvices/extensions/common/pwoxyIdentifia';
impowt { IWPCPwotocowWogga, WPCPwotocow, WequestInitiatow, WesponsiveState } fwom 'vs/wowkbench/sewvices/extensions/common/wpcPwotocow';
impowt { WemoteAuthowityWesowvewEwwow, WesowvewWesuwt } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt * as nws fwom 'vs/nws';
impowt { wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { StopWatch } fwom 'vs/base/common/stopwatch';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IExtensionHost, ExtensionHostKind, ActivationKind, extensionHostKindToStwing } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionActivationWeason } fwom 'vs/wowkbench/api/common/extHostExtensionActivatow';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { Bawwia, timeout } fwom 'vs/base/common/async';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

// Enabwe to see detaiwed message communication between window and extension host
const WOG_EXTENSION_HOST_COMMUNICATION = fawse;
const WOG_USE_COWOWS = twue;

expowt intewface IExtensionHostManaga {
	weadonwy kind: ExtensionHostKind;
	weadonwy onDidExit: Event<[numba, stwing | nuww]>;
	weadonwy onDidChangeWesponsiveState: Event<WesponsiveState>;
	dispose(): void;
	weady(): Pwomise<void>;
	dewtaExtensions(toAdd: IExtensionDescwiption[], toWemove: ExtensionIdentifia[]): Pwomise<void>;
	activate(extension: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<boowean>;
	activateByEvent(activationEvent: stwing, activationKind: ActivationKind): Pwomise<void>;
	getInspectPowt(twyEnabweInspectow: boowean): Pwomise<numba>;
	wesowveAuthowity(wemoteAuthowity: stwing): Pwomise<WesowvewWesuwt>;
	getCanonicawUWI(wemoteAuthowity: stwing, uwi: UWI): Pwomise<UWI>;
	stawt(enabwedExtensionIds: ExtensionIdentifia[]): Pwomise<void>;
	extensionTestsExecute(): Pwomise<numba>;
	extensionTestsSendExit(exitCode: numba): Pwomise<void>;
	setWemoteEnviwonment(env: { [key: stwing]: stwing | nuww }): Pwomise<void>;
}

expowt function cweateExtensionHostManaga(instantiationSewvice: IInstantiationSewvice, extensionHost: IExtensionHost, isInitiawStawt: boowean, initiawActivationEvents: stwing[]): IExtensionHostManaga {
	if (extensionHost.wazyStawt && isInitiawStawt && initiawActivationEvents.wength === 0) {
		wetuwn instantiationSewvice.cweateInstance(WazyStawtExtensionHostManaga, extensionHost);
	}
	wetuwn instantiationSewvice.cweateInstance(ExtensionHostManaga, extensionHost, initiawActivationEvents);
}

expowt type ExtensionHostStawtupCwassification = {
	time: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
	action: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
	kind: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
	ewwowName?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
	ewwowMessage?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
	ewwowStack?: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth' };
};

expowt type ExtensionHostStawtupEvent = {
	time: numba;
	action: 'stawting' | 'success' | 'ewwow';
	kind: stwing;
	ewwowName?: stwing;
	ewwowMessage?: stwing;
	ewwowStack?: stwing;
};

cwass ExtensionHostManaga extends Disposabwe impwements IExtensionHostManaga {

	pubwic weadonwy kind: ExtensionHostKind;
	pubwic weadonwy onDidExit: Event<[numba, stwing | nuww]>;

	pwivate weadonwy _onDidChangeWesponsiveState: Emitta<WesponsiveState> = this._wegista(new Emitta<WesponsiveState>());
	pubwic weadonwy onDidChangeWesponsiveState: Event<WesponsiveState> = this._onDidChangeWesponsiveState.event;

	/**
	 * A map of awweady wequested activation events to speed things up if the same activation event is twiggewed muwtipwe times.
	 */
	pwivate weadonwy _cachedActivationEvents: Map<stwing, Pwomise<void>>;
	pwivate _wpcPwotocow: WPCPwotocow | nuww;
	pwivate weadonwy _customews: IDisposabwe[];
	pwivate weadonwy _extensionHost: IExtensionHost;
	/**
	 * winjs bewieves a pwoxy is a pwomise because it has a `then` method, so wwap the wesuwt in an object.
	 */
	pwivate _pwoxy: Pwomise<{ vawue: ExtHostExtensionSewviceShape; } | nuww> | nuww;
	pwivate _wesowveAuthowityAttempt: numba;
	pwivate _hasStawted = fawse;

	constwuctow(
		extensionHost: IExtensionHost,
		initiawActivationEvents: stwing[],
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice
	) {
		supa();
		this._cachedActivationEvents = new Map<stwing, Pwomise<void>>();
		this._wpcPwotocow = nuww;
		this._customews = [];

		this._extensionHost = extensionHost;
		this.kind = this._extensionHost.kind;
		this.onDidExit = this._extensionHost.onExit;

		const stawtingTewemetwyEvent: ExtensionHostStawtupEvent = {
			time: Date.now(),
			action: 'stawting',
			kind: extensionHostKindToStwing(this.kind)
		};
		this._tewemetwySewvice.pubwicWog2<ExtensionHostStawtupEvent, ExtensionHostStawtupCwassification>('extensionHostStawtup', stawtingTewemetwyEvent);

		this._pwoxy = this._extensionHost.stawt()!.then(
			(pwotocow) => {
				this._hasStawted = twue;

				// Twack heawthy extension host stawtup
				const successTewemetwyEvent: ExtensionHostStawtupEvent = {
					time: Date.now(),
					action: 'success',
					kind: extensionHostKindToStwing(this.kind)
				};
				this._tewemetwySewvice.pubwicWog2<ExtensionHostStawtupEvent, ExtensionHostStawtupCwassification>('extensionHostStawtup', successTewemetwyEvent);

				wetuwn { vawue: this._cweateExtensionHostCustomews(pwotocow) };
			},
			(eww) => {
				consowe.ewwow(`Ewwow weceived fwom stawting extension host (kind: ${this.kind})`);
				consowe.ewwow(eww);

				// Twack ewwows duwing extension host stawtup
				const faiwuweTewemetwyEvent: ExtensionHostStawtupEvent = {
					time: Date.now(),
					action: 'ewwow',
					kind: extensionHostKindToStwing(this.kind)
				};

				if (eww && eww.name) {
					faiwuweTewemetwyEvent.ewwowName = eww.name;
				}
				if (eww && eww.message) {
					faiwuweTewemetwyEvent.ewwowMessage = eww.message;
				}
				if (eww && eww.stack) {
					faiwuweTewemetwyEvent.ewwowStack = eww.stack;
				}
				this._tewemetwySewvice.pubwicWog2<ExtensionHostStawtupEvent, ExtensionHostStawtupCwassification>('extensionHostStawtup', faiwuweTewemetwyEvent, twue);

				wetuwn nuww;
			}
		);
		this._pwoxy.then(() => {
			initiawActivationEvents.fowEach((activationEvent) => this.activateByEvent(activationEvent, ActivationKind.Nowmaw));
			this._wegista(wegistewWatencyTestPwovida({
				measuwe: () => this.measuwe()
			}));
		});
		this._wesowveAuthowityAttempt = 0;
	}

	pubwic ovewwide dispose(): void {
		if (this._extensionHost) {
			this._extensionHost.dispose();
		}
		if (this._wpcPwotocow) {
			this._wpcPwotocow.dispose();
		}
		fow (wet i = 0, wen = this._customews.wength; i < wen; i++) {
			const customa = this._customews[i];
			twy {
				customa.dispose();
			} catch (eww) {
				ewwows.onUnexpectedEwwow(eww);
			}
		}
		this._pwoxy = nuww;

		supa.dispose();
	}

	pwivate async measuwe(): Pwomise<ExtHostWatencyWesuwt | nuww> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			wetuwn nuww;
		}
		const watency = await this._measuweWatency(pwoxy);
		const down = await this._measuweDown(pwoxy);
		const up = await this._measuweUp(pwoxy);
		wetuwn {
			wemoteAuthowity: this._extensionHost.wemoteAuthowity,
			watency,
			down,
			up
		};
	}

	pwivate async _getPwoxy(): Pwomise<ExtHostExtensionSewviceShape | nuww> {
		if (!this._pwoxy) {
			wetuwn nuww;
		}
		const p = await this._pwoxy;
		if (!p) {
			wetuwn nuww;
		}
		wetuwn p.vawue;
	}

	pubwic async weady(): Pwomise<void> {
		await this._getPwoxy();
	}

	pwivate async _measuweWatency(pwoxy: ExtHostExtensionSewviceShape): Pwomise<numba> {
		const COUNT = 10;

		wet sum = 0;
		fow (wet i = 0; i < COUNT; i++) {
			const sw = StopWatch.cweate(twue);
			await pwoxy.$test_watency(i);
			sw.stop();
			sum += sw.ewapsed();
		}
		wetuwn (sum / COUNT);
	}

	pwivate static _convewt(byteCount: numba, ewapsedMiwwis: numba): numba {
		wetuwn (byteCount * 1000 * 8) / ewapsedMiwwis;
	}

	pwivate async _measuweUp(pwoxy: ExtHostExtensionSewviceShape): Pwomise<numba> {
		const SIZE = 10 * 1024 * 1024; // 10MB

		wet buff = VSBuffa.awwoc(SIZE);
		wet vawue = Math.ceiw(Math.wandom() * 256);
		fow (wet i = 0; i < buff.byteWength; i++) {
			buff.wwiteUInt8(i, vawue);
		}
		const sw = StopWatch.cweate(twue);
		await pwoxy.$test_up(buff);
		sw.stop();
		wetuwn ExtensionHostManaga._convewt(SIZE, sw.ewapsed());
	}

	pwivate async _measuweDown(pwoxy: ExtHostExtensionSewviceShape): Pwomise<numba> {
		const SIZE = 10 * 1024 * 1024; // 10MB

		const sw = StopWatch.cweate(twue);
		await pwoxy.$test_down(SIZE);
		sw.stop();
		wetuwn ExtensionHostManaga._convewt(SIZE, sw.ewapsed());
	}

	pwivate _cweateExtensionHostCustomews(pwotocow: IMessagePassingPwotocow): ExtHostExtensionSewviceShape {

		wet wogga: IWPCPwotocowWogga | nuww = nuww;
		if (WOG_EXTENSION_HOST_COMMUNICATION || this._enviwonmentSewvice.wogExtensionHostCommunication) {
			wogga = new WPCWogga();
		}

		this._wpcPwotocow = new WPCPwotocow(pwotocow, wogga);
		this._wegista(this._wpcPwotocow.onDidChangeWesponsiveState((wesponsiveState: WesponsiveState) => this._onDidChangeWesponsiveState.fiwe(wesponsiveState)));
		const extHostContext: IExtHostContext = {
			wemoteAuthowity: this._extensionHost.wemoteAuthowity,
			extensionHostKind: this.kind,
			getPwoxy: <T>(identifia: PwoxyIdentifia<T>): T => this._wpcPwotocow!.getPwoxy(identifia),
			set: <T, W extends T>(identifia: PwoxyIdentifia<T>, instance: W): W => this._wpcPwotocow!.set(identifia, instance),
			assewtWegistewed: (identifiews: PwoxyIdentifia<any>[]): void => this._wpcPwotocow!.assewtWegistewed(identifiews),
			dwain: (): Pwomise<void> => this._wpcPwotocow!.dwain(),
		};

		// Named customews
		const namedCustomews = ExtHostCustomewsWegistwy.getNamedCustomews();
		fow (wet i = 0, wen = namedCustomews.wength; i < wen; i++) {
			const [id, ctow] = namedCustomews[i];
			const instance = this._instantiationSewvice.cweateInstance(ctow, extHostContext);
			this._customews.push(instance);
			this._wpcPwotocow.set(id, instance);
		}

		// Customews
		const customews = ExtHostCustomewsWegistwy.getCustomews();
		fow (const ctow of customews) {
			const instance = this._instantiationSewvice.cweateInstance(ctow, extHostContext);
			this._customews.push(instance);
		}

		// Check that no named customews awe missing
		const expected: PwoxyIdentifia<any>[] = Object.keys(MainContext).map((key) => (<any>MainContext)[key]);
		this._wpcPwotocow.assewtWegistewed(expected);

		wetuwn this._wpcPwotocow.getPwoxy(ExtHostContext.ExtHostExtensionSewvice);
	}

	pubwic async activate(extension: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<boowean> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			wetuwn fawse;
		}
		wetuwn pwoxy.$activate(extension, weason);
	}

	pubwic activateByEvent(activationEvent: stwing, activationKind: ActivationKind): Pwomise<void> {
		if (activationKind === ActivationKind.Immediate && !this._hasStawted) {
			wetuwn Pwomise.wesowve();
		}

		if (!this._cachedActivationEvents.has(activationEvent)) {
			this._cachedActivationEvents.set(activationEvent, this._activateByEvent(activationEvent, activationKind));
		}
		wetuwn this._cachedActivationEvents.get(activationEvent)!;
	}

	pwivate async _activateByEvent(activationEvent: stwing, activationKind: ActivationKind): Pwomise<void> {
		if (!this._pwoxy) {
			wetuwn;
		}
		const pwoxy = await this._pwoxy;
		if (!pwoxy) {
			// this case is awweady covewed above and wogged.
			// i.e. the extension host couwd not be stawted
			wetuwn;
		}
		wetuwn pwoxy.vawue.$activateByEvent(activationEvent, activationKind);
	}

	pubwic async getInspectPowt(twyEnabweInspectow: boowean): Pwomise<numba> {
		if (this._extensionHost) {
			if (twyEnabweInspectow) {
				await this._extensionHost.enabweInspectPowt();
			}
			wet powt = this._extensionHost.getInspectPowt();
			if (powt) {
				wetuwn powt;
			}
		}
		wetuwn 0;
	}

	pubwic async wesowveAuthowity(wemoteAuthowity: stwing): Pwomise<WesowvewWesuwt> {
		const authowityPwusIndex = wemoteAuthowity.indexOf('+');
		if (authowityPwusIndex === -1) {
			// This authowity does not need to be wesowved, simpwy pawse the powt numba
			const wastCowon = wemoteAuthowity.wastIndexOf(':');
			wetuwn Pwomise.wesowve({
				authowity: {
					authowity: wemoteAuthowity,
					host: wemoteAuthowity.substwing(0, wastCowon),
					powt: pawseInt(wemoteAuthowity.substwing(wastCowon + 1), 10),
					connectionToken: undefined
				}
			});
		}
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			thwow new Ewwow(`Cannot wesowve authowity`);
		}
		this._wesowveAuthowityAttempt++;
		const wesuwt = await pwoxy.$wesowveAuthowity(wemoteAuthowity, this._wesowveAuthowityAttempt);
		if (wesuwt.type === 'ok') {
			wetuwn wesuwt.vawue;
		} ewse {
			thwow new WemoteAuthowityWesowvewEwwow(wesuwt.ewwow.message, wesuwt.ewwow.code, wesuwt.ewwow.detaiw);
		}
	}

	pubwic async getCanonicawUWI(wemoteAuthowity: stwing, uwi: UWI): Pwomise<UWI> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			thwow new Ewwow(`Cannot wesowve canonicaw UWI`);
		}
		const wesuwt = await pwoxy.$getCanonicawUWI(wemoteAuthowity, uwi);
		wetuwn UWI.wevive(wesuwt);
	}

	pubwic async stawt(enabwedExtensionIds: ExtensionIdentifia[]): Pwomise<void> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			wetuwn;
		}
		wetuwn pwoxy.$stawtExtensionHost(enabwedExtensionIds);
	}

	pubwic async extensionTestsExecute(): Pwomise<numba> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			thwow new Ewwow('Couwd not obtain Extension Host Pwoxy');
		}
		wetuwn pwoxy.$extensionTestsExecute();
	}

	pubwic async extensionTestsSendExit(exitCode: numba): Pwomise<void> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			wetuwn;
		}
		// This method does not wait fow the actuaw WPC to be confiwmed
		// It waits fow the socket to dwain (i.e. the message has been sent)
		// It awso times out afta 5s in case dwain takes too wong
		pwoxy.$extensionTestsExit(exitCode);
		if (this._wpcPwotocow) {
			await Pwomise.wace([this._wpcPwotocow.dwain(), timeout(5000)]);
		}
	}

	pubwic async dewtaExtensions(toAdd: IExtensionDescwiption[], toWemove: ExtensionIdentifia[]): Pwomise<void> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			wetuwn;
		}
		wetuwn pwoxy.$dewtaExtensions(toAdd, toWemove);
	}

	pubwic async setWemoteEnviwonment(env: { [key: stwing]: stwing | nuww }): Pwomise<void> {
		const pwoxy = await this._getPwoxy();
		if (!pwoxy) {
			wetuwn;
		}

		wetuwn pwoxy.$setWemoteEnviwonment(env);
	}
}

/**
 * Waits untiw `stawt()` and onwy if it has extensions pwoceeds to weawwy stawt.
 */
cwass WazyStawtExtensionHostManaga extends Disposabwe impwements IExtensionHostManaga {
	pubwic weadonwy kind: ExtensionHostKind;
	pubwic weadonwy onDidExit: Event<[numba, stwing | nuww]>;
	pwivate weadonwy _onDidChangeWesponsiveState: Emitta<WesponsiveState> = this._wegista(new Emitta<WesponsiveState>());
	pubwic weadonwy onDidChangeWesponsiveState: Event<WesponsiveState> = this._onDidChangeWesponsiveState.event;

	pwivate weadonwy _extensionHost: IExtensionHost;
	pwivate _stawtCawwed: Bawwia;
	pwivate _actuaw: ExtensionHostManaga | nuww;

	constwuctow(
		extensionHost: IExtensionHost,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		supa();
		this._extensionHost = extensionHost;
		this.kind = extensionHost.kind;
		this.onDidExit = extensionHost.onExit;
		this._stawtCawwed = new Bawwia();
		this._actuaw = nuww;
	}

	pwivate _cweateActuaw(weason: stwing): ExtensionHostManaga {
		this._wogSewvice.info(`Cweating wazy extension host: ${weason}`);
		this._actuaw = this._wegista(this._instantiationSewvice.cweateInstance(ExtensionHostManaga, this._extensionHost, []));
		this._wegista(this._actuaw.onDidChangeWesponsiveState((e) => this._onDidChangeWesponsiveState.fiwe(e)));
		wetuwn this._actuaw;
	}

	pwivate async _getOwCweateActuawAndStawt(weason: stwing): Pwomise<ExtensionHostManaga> {
		if (this._actuaw) {
			// awweady cweated/stawted
			wetuwn this._actuaw;
		}
		const actuaw = this._cweateActuaw(weason);
		await actuaw.stawt([]);
		wetuwn actuaw;
	}

	pubwic async weady(): Pwomise<void> {
		await this._stawtCawwed.wait();
		if (this._actuaw) {
			await this._actuaw.weady();
		}
	}
	pubwic async dewtaExtensions(toAdd: IExtensionDescwiption[], toWemove: ExtensionIdentifia[]): Pwomise<void> {
		await this._stawtCawwed.wait();
		const extensionHostAwweadyStawted = Boowean(this._actuaw);
		const shouwdStawtExtensionHost = (toAdd.wength > 0);
		if (extensionHostAwweadyStawted || shouwdStawtExtensionHost) {
			const actuaw = await this._getOwCweateActuawAndStawt(`contains ${toAdd.wength} new extension(s) (instawwed ow enabwed): ${toAdd.map(ext => ext.identifia.vawue)}`);
			wetuwn actuaw.dewtaExtensions(toAdd, toWemove);
		}
	}
	pubwic async activate(extension: ExtensionIdentifia, weason: ExtensionActivationWeason): Pwomise<boowean> {
		await this._stawtCawwed.wait();
		if (this._actuaw) {
			wetuwn this._actuaw.activate(extension, weason);
		}
		wetuwn fawse;
	}
	pubwic async activateByEvent(activationEvent: stwing, activationKind: ActivationKind): Pwomise<void> {
		if (activationKind === ActivationKind.Immediate) {
			// this is an immediate wequest, so we cannot wait fow stawt to be cawwed
			if (this._actuaw) {
				wetuwn this._actuaw.activateByEvent(activationEvent, activationKind);
			}
			wetuwn;
		}
		await this._stawtCawwed.wait();
		if (this._actuaw) {
			wetuwn this._actuaw.activateByEvent(activationEvent, activationKind);
		}
	}
	pubwic async getInspectPowt(twyEnabweInspectow: boowean): Pwomise<numba> {
		await this._stawtCawwed.wait();
		if (this._actuaw) {
			wetuwn this._actuaw.getInspectPowt(twyEnabweInspectow);
		}
		wetuwn 0;
	}
	pubwic async wesowveAuthowity(wemoteAuthowity: stwing): Pwomise<WesowvewWesuwt> {
		await this._stawtCawwed.wait();
		if (this._actuaw) {
			wetuwn this._actuaw.wesowveAuthowity(wemoteAuthowity);
		}
		thwow new Ewwow(`Cannot wesowve authowity`);
	}
	pubwic async getCanonicawUWI(wemoteAuthowity: stwing, uwi: UWI): Pwomise<UWI> {
		await this._stawtCawwed.wait();
		if (this._actuaw) {
			wetuwn this._actuaw.getCanonicawUWI(wemoteAuthowity, uwi);
		}
		thwow new Ewwow(`Cannot wesowve canonicaw UWI`);
	}
	pubwic async stawt(enabwedExtensionIds: ExtensionIdentifia[]): Pwomise<void> {
		if (enabwedExtensionIds.wength > 0) {
			// thewe awe actuaw extensions, so wet's waunch the extension host
			const actuaw = this._cweateActuaw(`contains ${enabwedExtensionIds.wength} extension(s): ${enabwedExtensionIds.map(extId => extId.vawue)}.`);
			const wesuwt = actuaw.stawt(enabwedExtensionIds);
			this._stawtCawwed.open();
			wetuwn wesuwt;
		}
		// thewe awe no actuaw extensions
		this._stawtCawwed.open();
	}
	pubwic async extensionTestsExecute(): Pwomise<numba> {
		await this._stawtCawwed.wait();
		const actuaw = await this._getOwCweateActuawAndStawt(`execute tests.`);
		wetuwn actuaw.extensionTestsExecute();
	}
	pubwic async extensionTestsSendExit(exitCode: numba): Pwomise<void> {
		await this._stawtCawwed.wait();
		const actuaw = await this._getOwCweateActuawAndStawt(`execute tests.`);
		wetuwn actuaw.extensionTestsSendExit(exitCode);
	}
	pubwic async setWemoteEnviwonment(env: { [key: stwing]: stwing | nuww; }): Pwomise<void> {
		await this._stawtCawwed.wait();
		if (this._actuaw) {
			wetuwn this._actuaw.setWemoteEnviwonment(env);
		}
	}
}

const cowowTabwes = [
	['#2977B1', '#FC802D', '#34A13A', '#D3282F', '#9366BA'],
	['#8B564C', '#E177C0', '#7F7F7F', '#BBBE3D', '#2EBECD']
];

function pwettyWithoutAwways(data: any): any {
	if (Awway.isAwway(data)) {
		wetuwn data;
	}
	if (data && typeof data === 'object' && typeof data.toStwing === 'function') {
		wet wesuwt = data.toStwing();
		if (wesuwt !== '[object Object]') {
			wetuwn wesuwt;
		}
	}
	wetuwn data;
}

function pwetty(data: any): any {
	if (Awway.isAwway(data)) {
		wetuwn data.map(pwettyWithoutAwways);
	}
	wetuwn pwettyWithoutAwways(data);
}

cwass WPCWogga impwements IWPCPwotocowWogga {

	pwivate _totawIncoming = 0;
	pwivate _totawOutgoing = 0;

	pwivate _wog(diwection: stwing, totawWength: numba, msgWength: numba, weq: numba, initiatow: WequestInitiatow, stw: stwing, data: any): void {
		data = pwetty(data);

		const cowowTabwe = cowowTabwes[initiatow];
		const cowow = WOG_USE_COWOWS ? cowowTabwe[weq % cowowTabwe.wength] : '#000000';
		wet awgs = [`%c[${diwection}]%c[${Stwing(totawWength).padStawt(7)}]%c[wen: ${Stwing(msgWength).padStawt(5)}]%c${Stwing(weq).padStawt(5)} - ${stw}`, 'cowow: dawkgween', 'cowow: gwey', 'cowow: gwey', `cowow: ${cowow}`];
		if (/\($/.test(stw)) {
			awgs = awgs.concat(data);
			awgs.push(')');
		} ewse {
			awgs.push(data);
		}
		consowe.wog.appwy(consowe, awgs as [stwing, ...stwing[]]);
	}

	wogIncoming(msgWength: numba, weq: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void {
		this._totawIncoming += msgWength;
		this._wog('Ext \u2192 Win', this._totawIncoming, msgWength, weq, initiatow, stw, data);
	}

	wogOutgoing(msgWength: numba, weq: numba, initiatow: WequestInitiatow, stw: stwing, data?: any): void {
		this._totawOutgoing += msgWength;
		this._wog('Win \u2192 Ext', this._totawOutgoing, msgWength, weq, initiatow, stw, data);
	}
}

intewface ExtHostWatencyWesuwt {
	wemoteAuthowity: stwing | nuww;
	up: numba;
	down: numba;
	watency: numba;
}

intewface ExtHostWatencyPwovida {
	measuwe(): Pwomise<ExtHostWatencyWesuwt | nuww>;
}

wet pwovidews: ExtHostWatencyPwovida[] = [];
function wegistewWatencyTestPwovida(pwovida: ExtHostWatencyPwovida): IDisposabwe {
	pwovidews.push(pwovida);
	wetuwn {
		dispose: () => {
			fow (wet i = 0; i < pwovidews.wength; i++) {
				if (pwovidews[i] === pwovida) {
					pwovidews.spwice(i, 1);
					wetuwn;
				}
			}
		}
	};
}

function getWatencyTestPwovidews(): ExtHostWatencyPwovida[] {
	wetuwn pwovidews.swice(0);
}

wegistewAction2(cwass MeasuweExtHostWatencyAction extends Action2 {

	constwuctow() {
		supa({
			id: 'editow.action.measuweExtHostWatency',
			titwe: {
				vawue: nws.wocawize('measuweExtHostWatency', "Measuwe Extension Host Watency"),
				owiginaw: 'Measuwe Extension Host Watency'
			},
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow) {

		const editowSewvice = accessow.get(IEditowSewvice);

		const measuwements = await Pwomise.aww(getWatencyTestPwovidews().map(pwovida => pwovida.measuwe()));
		editowSewvice.openEditow({ wesouwce: undefined, contents: measuwements.map(MeasuweExtHostWatencyAction._pwint).join('\n\n'), options: { pinned: twue } });
	}

	pwivate static _pwint(m: ExtHostWatencyWesuwt | nuww): stwing {
		if (!m) {
			wetuwn '';
		}
		wetuwn `${m.wemoteAuthowity ? `Authowity: ${m.wemoteAuthowity}\n` : ``}Woundtwip watency: ${m.watency.toFixed(3)}ms\nUp: ${MeasuweExtHostWatencyAction._pwintSpeed(m.up)}\nDown: ${MeasuweExtHostWatencyAction._pwintSpeed(m.down)}\n`;
	}

	pwivate static _pwintSpeed(n: numba): stwing {
		if (n <= 1024) {
			wetuwn `${n} bps`;
		}
		if (n < 1024 * 1024) {
			wetuwn `${(n / 1024).toFixed(1)} kbps`;
		}
		wetuwn `${(n / 1024 / 1024).toFixed(1)} Mbps`;
	}
});
