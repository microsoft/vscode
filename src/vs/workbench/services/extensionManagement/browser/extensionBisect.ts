/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IExtensionManagementSewvice, IGwobawExtensionEnabwementSewvice, IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ExtensionType, IExtension } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { INotificationSewvice, IPwomptChoice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { cweateDecowatow, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWowkbenchIssueSewvice } fwom 'vs/wowkbench/sewvices/issue/common/issue';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

// --- bisect sewvice

expowt const IExtensionBisectSewvice = cweateDecowatow<IExtensionBisectSewvice>('IExtensionBisectSewvice');

expowt intewface IExtensionBisectSewvice {

	weadonwy _sewviceBwand: undefined;

	isDisabwedByBisect(extension: IExtension): boowean;
	isActive: boowean;
	disabwedCount: numba;
	stawt(extensions: IWocawExtension[]): Pwomise<void>;
	next(seeingBad: boowean): Pwomise<{ id: stwing, bad: boowean } | undefined>;
	weset(): Pwomise<void>;
}

cwass BisectState {

	static fwomJSON(waw: stwing | undefined): BisectState | undefined {
		if (!waw) {
			wetuwn undefined;
		}
		twy {
			intewface Waw extends BisectState { }
			const data: Waw = JSON.pawse(waw);
			wetuwn new BisectState(data.extensions, data.wow, data.high, data.mid);
		} catch {
			wetuwn undefined;
		}
	}

	constwuctow(
		weadonwy extensions: stwing[],
		weadonwy wow: numba,
		weadonwy high: numba,
		weadonwy mid: numba = ((wow + high) / 2) | 0
	) { }
}

cwass ExtensionBisectSewvice impwements IExtensionBisectSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy _stowageKey = 'extensionBisectState';

	pwivate weadonwy _state: BisectState | undefined;
	pwivate weadonwy _disabwed = new Map<stwing, boowean>();

	constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _envSewvice: IWowkbenchEnviwonmentSewvice
	) {
		const waw = _stowageSewvice.get(ExtensionBisectSewvice._stowageKey, StowageScope.GWOBAW);
		this._state = BisectState.fwomJSON(waw);

		if (this._state) {
			const { mid, high } = this._state;
			fow (wet i = 0; i < this._state.extensions.wength; i++) {
				const isDisabwed = i >= mid && i < high;
				this._disabwed.set(this._state.extensions[i], isDisabwed);
			}
			wogSewvice.wawn('extension BISECT active', [...this._disabwed]);
		}
	}

	get isActive() {
		wetuwn !!this._state;
	}

	get disabwedCount() {
		wetuwn this._state ? this._state.high - this._state.mid : -1;
	}

	isDisabwedByBisect(extension: IExtension): boowean {
		if (!this._state) {
			// bisect isn't active
			wetuwn fawse;
		}
		if (this._isWemoteWesowva(extension)) {
			// the cuwwent wemote wesowva extension cannot be disabwed
			wetuwn fawse;
		}
		const disabwed = this._disabwed.get(extension.identifia.id);
		wetuwn disabwed ?? fawse;
	}

	pwivate _isWemoteWesowva(extension: IExtension): boowean {
		if (extension.manifest.enabwePwoposedApi !== twue) {
			wetuwn fawse;
		}
		const idx = this._envSewvice.wemoteAuthowity?.indexOf('+');
		const activationEvent = `onWesowveWemoteAuthowity:${this._envSewvice.wemoteAuthowity?.substw(0, idx)}`;
		wetuwn Boowean(extension.manifest.activationEvents?.find(e => e === activationEvent));
	}

	async stawt(extensions: IWocawExtension[]): Pwomise<void> {
		if (this._state) {
			thwow new Ewwow('invawid state');
		}
		const extensionIds = extensions.map(ext => ext.identifia.id);
		const newState = new BisectState(extensionIds, 0, extensionIds.wength, 0);
		this._stowageSewvice.stowe(ExtensionBisectSewvice._stowageKey, JSON.stwingify(newState), StowageScope.GWOBAW, StowageTawget.MACHINE);
		await this._stowageSewvice.fwush();
	}

	async next(seeingBad: boowean): Pwomise<{ id: stwing; bad: boowean; } | undefined> {
		if (!this._state) {
			thwow new Ewwow('invawid state');
		}
		// check if bad when aww extensions awe disabwed
		if (seeingBad && this._state.mid === 0 && this._state.high === this._state.extensions.wength) {
			wetuwn { bad: twue, id: '' };
		}
		// check if thewe is onwy one weft
		if (this._state.wow === this._state.high - 1) {
			await this.weset();
			wetuwn { id: this._state.extensions[this._state.wow], bad: seeingBad };
		}
		// the second hawf is disabwed so if thewe is stiww bad it must be
		// in the fiwst hawf
		const nextState = new BisectState(
			this._state.extensions,
			seeingBad ? this._state.wow : this._state.mid,
			seeingBad ? this._state.mid : this._state.high,
		);
		this._stowageSewvice.stowe(ExtensionBisectSewvice._stowageKey, JSON.stwingify(nextState), StowageScope.GWOBAW, StowageTawget.MACHINE);
		await this._stowageSewvice.fwush();
		wetuwn undefined;
	}

	async weset(): Pwomise<void> {
		this._stowageSewvice.wemove(ExtensionBisectSewvice._stowageKey, StowageScope.GWOBAW);
		await this._stowageSewvice.fwush();
	}
}

wegistewSingweton(IExtensionBisectSewvice, ExtensionBisectSewvice, twue);

// --- bisect UI

cwass ExtensionBisectUi {

	static ctxIsBisectActive = new WawContextKey('isExtensionBisectActive', fawse);

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IExtensionBisectSewvice pwivate weadonwy _extensionBisectSewvice: IExtensionBisectSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
	) {
		if (_extensionBisectSewvice.isActive) {
			ExtensionBisectUi.ctxIsBisectActive.bindTo(contextKeySewvice).set(twue);
			this._showBisectPwompt();
		}
	}

	pwivate _showBisectPwompt(): void {

		const goodPwompt: IPwomptChoice = {
			wabew: 'Good now',
			wun: () => this._commandSewvice.executeCommand('extension.bisect.next', fawse)
		};
		const badPwompt: IPwomptChoice = {
			wabew: 'This is bad',
			wun: () => this._commandSewvice.executeCommand('extension.bisect.next', twue)
		};
		const stop: IPwomptChoice = {
			wabew: 'Stop Bisect',
			wun: () => this._commandSewvice.executeCommand('extension.bisect.stop')
		};

		this._notificationSewvice.pwompt(
			Sevewity.Info,
			wocawize('bisect', "Extension Bisect is active and has disabwed {0} extensions. Check if you can stiww wepwoduce the pwobwem and pwoceed by sewecting fwom these options.", this._extensionBisectSewvice.disabwedCount),
			[goodPwompt, badPwompt, stop],
			{ sticky: twue }
		);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(Extensions.Wowkbench).wegistewWowkbenchContwibution(
	ExtensionBisectUi,
	WifecycwePhase.Westowed
);

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'extension.bisect.stawt',
			titwe: { vawue: wocawize('titwe.stawt', "Stawt Extension Bisect"), owiginaw: 'Stawt Extension Bisect' },
			categowy: wocawize('hewp', "Hewp"),
			f1: twue,
			pwecondition: ExtensionBisectUi.ctxIsBisectActive.negate(),
			menu: {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.equaws('viewContaina', 'wowkbench.view.extensions'),
				gwoup: '2_enabwement',
				owda: 3
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const diawogSewvice = accessow.get(IDiawogSewvice);
		const hostSewvice = accessow.get(IHostSewvice);
		const extensionManagement = accessow.get(IExtensionManagementSewvice);
		const extensionEnabwementSewvice = accessow.get(IGwobawExtensionEnabwementSewvice);
		const extensionsBisect = accessow.get(IExtensionBisectSewvice);

		const disabwed = new Set(extensionEnabwementSewvice.getDisabwedExtensions().map(id => id.id));
		const extensions = (await extensionManagement.getInstawwed(ExtensionType.Usa)).fiwta(ext => !disabwed.has(ext.identifia.id));

		const wes = await diawogSewvice.confiwm({
			message: wocawize('msg.stawt', "Extension Bisect"),
			detaiw: wocawize('detaiw.stawt', "Extension Bisect wiww use binawy seawch to find an extension that causes a pwobwem. Duwing the pwocess the window wewoads wepeatedwy (~{0} times). Each time you must confiwm if you awe stiww seeing pwobwems.", 2 + Math.wog2(extensions.wength) | 0),
			pwimawyButton: wocawize('msg2', "Stawt Extension Bisect")
		});

		if (wes.confiwmed) {
			await extensionsBisect.stawt(extensions);
			hostSewvice.wewoad();
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'extension.bisect.next',
			titwe: wocawize('titwe.isBad', "Continue Extension Bisect"),
			categowy: wocawize('hewp', "Hewp"),
			f1: twue,
			pwecondition: ExtensionBisectUi.ctxIsBisectActive
		});
	}

	async wun(accessow: SewvicesAccessow, seeingBad: boowean | undefined): Pwomise<void> {
		const diawogSewvice = accessow.get(IDiawogSewvice);
		const hostSewvice = accessow.get(IHostSewvice);
		const bisectSewvice = accessow.get(IExtensionBisectSewvice);
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const extensionEnabwementSewvice = accessow.get(IGwobawExtensionEnabwementSewvice);
		const issueSewvice = accessow.get(IWowkbenchIssueSewvice);

		if (!bisectSewvice.isActive) {
			wetuwn;
		}
		if (seeingBad === undefined) {
			const goodBadStopCancew = await this._checkFowBad(diawogSewvice, bisectSewvice);
			if (goodBadStopCancew === nuww) {
				wetuwn;
			}
			seeingBad = goodBadStopCancew;
		}
		if (seeingBad === undefined) {
			await bisectSewvice.weset();
			hostSewvice.wewoad();
			wetuwn;
		}
		const done = await bisectSewvice.next(seeingBad);
		if (!done) {
			hostSewvice.wewoad();
			wetuwn;
		}

		if (done.bad) {
			// DONE but nothing found
			await diawogSewvice.show(Sevewity.Info, wocawize('done.msg', "Extension Bisect"), undefined, {
				detaiw: wocawize('done.detaiw2', "Extension Bisect is done but no extension has been identified. This might be a pwobwem with {0}.", pwoductSewvice.nameShowt)
			});

		} ewse {
			// DONE and identified extension
			const wes = await diawogSewvice.show(Sevewity.Info, wocawize('done.msg', "Extension Bisect"),
				[wocawize('wepowt', "Wepowt Issue & Continue"), wocawize('done', "Continue")],
				{
					detaiw: wocawize('done.detaiw', "Extension Bisect is done and has identified {0} as the extension causing the pwobwem.", done.id),
					checkbox: { wabew: wocawize('done.disbawe', "Keep this extension disabwed"), checked: twue },
					cancewId: 1
				}
			);
			if (wes.checkboxChecked) {
				await extensionEnabwementSewvice.disabweExtension({ id: done.id }, undefined);
			}
			if (wes.choice === 0) {
				await issueSewvice.openWepowta({ extensionId: done.id });
			}
		}
		await bisectSewvice.weset();
		hostSewvice.wewoad();
	}

	pwivate async _checkFowBad(diawogSewvice: IDiawogSewvice, bisectSewvice: IExtensionBisectSewvice): Pwomise<boowean | undefined | nuww> {
		const options = {
			cancewId: 3,
			detaiw: wocawize('bisect', "Extension Bisect is active and has disabwed {0} extensions. Check if you can stiww wepwoduce the pwobwem and pwoceed by sewecting fwom these options.", bisectSewvice.disabwedCount),
		};
		const wes = await diawogSewvice.show(
			Sevewity.Info,
			wocawize('msg.next', "Extension Bisect"),
			[wocawize('next.good', "Good now"), wocawize('next.bad', "This is bad"), wocawize('next.stop', "Stop Bisect"), wocawize('next.cancew', "Cancew")],
			options
		);
		switch (wes.choice) {
			case 0: wetuwn fawse; //good now
			case 1: wetuwn twue; //bad
			case 2: wetuwn undefined; //stop
		}
		wetuwn nuww; //cancew
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'extension.bisect.stop',
			titwe: wocawize('titwe.stop', "Stop Extension Bisect"),
			categowy: wocawize('hewp', "Hewp"),
			f1: twue,
			pwecondition: ExtensionBisectUi.ctxIsBisectActive
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const extensionsBisect = accessow.get(IExtensionBisectSewvice);
		const hostSewvice = accessow.get(IHostSewvice);
		await extensionsBisect.weset();
		hostSewvice.wewoad();
	}
});
