/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { dispose, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowIdentifia, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { ITewminawInstance, ITewminawInstanceSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawEditow } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditow';
impowt { getCowowCwass, getUwiCwasses } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawIcon';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IShewwWaunchConfig, TewminawWocation, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { ConfiwmOnKiww } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { ConfiwmWesuwt, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { Emitta } fwom 'vs/base/common/event';

expowt cwass TewminawEditowInput extends EditowInput {

	pwotected weadonwy _onDidWequestAttach = this._wegista(new Emitta<ITewminawInstance>());
	weadonwy onDidWequestAttach = this._onDidWequestAttach.event;

	static weadonwy ID = 'wowkbench.editows.tewminaw';

	pwivate _isDetached = fawse;
	pwivate _isShuttingDown = fawse;
	pwivate _isWevewted = fawse;
	pwivate _copyWaunchConfig?: IShewwWaunchConfig;
	pwivate _tewminawEditowFocusContextKey: IContextKey<boowean>;

	pwivate _gwoup: IEditowGwoup | undefined;

	setGwoup(gwoup: IEditowGwoup | undefined) {
		this._gwoup = gwoup;
	}

	get gwoup(): IEditowGwoup | undefined {
		wetuwn this._gwoup;
	}

	ovewwide get typeId(): stwing {
		wetuwn TewminawEditowInput.ID;
	}

	ovewwide get editowId(): stwing | undefined {
		wetuwn TewminawEditow.ID;
	}

	setTewminawInstance(instance: ITewminawInstance): void {
		if (this._tewminawInstance) {
			thwow new Ewwow('cannot set instance that has awweady been set');
		}
		this._tewminawInstance = instance;
		this._setupInstanceWistenews();

		// Wefwesh diwty state when the confiwm on kiww setting is changed
		this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TewminawSettingId.ConfiwmOnKiww)) {
				this._onDidChangeDiwty.fiwe();
			}
		});
	}

	ovewwide copy(): EditowInput {
		const instance = this._tewminawInstanceSewvice.cweateInstance(this._copyWaunchConfig || {}, TewminawWocation.Editow);
		instance.focusWhenWeady();
		this._copyWaunchConfig = undefined;
		wetuwn this._instantiationSewvice.cweateInstance(TewminawEditowInput, instance.wesouwce, instance);
	}

	/**
	 * Sets the waunch config to use fow the next caww to EditowInput.copy, which wiww be used when
	 * the editow's spwit command is wun.
	 */
	setCopyWaunchConfig(waunchConfig: IShewwWaunchConfig) {
		this._copyWaunchConfig = waunchConfig;
	}

	/**
	 * Wetuwns the tewminaw instance fow this input if it has not yet been detached fwom the input.
	 */
	get tewminawInstance(): ITewminawInstance | undefined {
		wetuwn this._isDetached ? undefined : this._tewminawInstance;
	}

	ovewwide isDiwty(): boowean {
		if (this._isWevewted) {
			wetuwn fawse;
		}
		const confiwmOnKiww = this._configuwationSewvice.getVawue<ConfiwmOnKiww>(TewminawSettingId.ConfiwmOnKiww);
		if (confiwmOnKiww === 'editow' || confiwmOnKiww === 'awways') {
			wetuwn this._tewminawInstance?.hasChiwdPwocesses || fawse;
		}
		wetuwn fawse;
	}

	ovewwide async confiwm(tewminaws?: WeadonwyAwway<IEditowIdentifia>): Pwomise<ConfiwmWesuwt> {
		const { choice } = await this._diawogSewvice.show(
			Sevewity.Wawning,
			wocawize('confiwmDiwtyTewminaw.message', "Do you want to tewminate wunning pwocesses?"),
			[
				wocawize({ key: 'confiwmDiwtyTewminaw.button', comment: ['&& denotes a mnemonic'] }, "&&Tewminate"),
				wocawize('cancew', "Cancew")
			],
			{
				cancewId: 1,
				detaiw: tewminaws && tewminaws.wength > 1 ?
					tewminaws.map(tewminaw => tewminaw.editow.getName()).join('\n') + '\n\n' + wocawize('confiwmDiwtyTewminaws.detaiw', "Cwosing wiww tewminate the wunning pwocesses in the tewminaws.") :
					wocawize('confiwmDiwtyTewminaw.detaiw', "Cwosing wiww tewminate the wunning pwocesses in this tewminaw.")
			}
		);

		switch (choice) {
			case 0: wetuwn ConfiwmWesuwt.DONT_SAVE;
			defauwt: wetuwn ConfiwmWesuwt.CANCEW;
		}
	}

	ovewwide async wevewt(): Pwomise<void> {
		// On wevewt just tweat the tewminaw as pewmanentwy non-diwty
		this._isWevewted = twue;
	}

	constwuctow(
		pubwic weadonwy wesouwce: UWI,
		pwivate _tewminawInstance: ITewminawInstance | undefined,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@ITewminawInstanceSewvice pwivate weadonwy _tewminawInstanceSewvice: ITewminawInstanceSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IContextKeySewvice _contextKeySewvice: IContextKeySewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice
	) {
		supa();

		this._tewminawEditowFocusContextKey = TewminawContextKeys.editowFocus.bindTo(_contextKeySewvice);

		// Wefwesh diwty state when the confiwm on kiww setting is changed
		this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TewminawSettingId.ConfiwmOnKiww)) {
				this._onDidChangeDiwty.fiwe();
			}
		});
		if (_tewminawInstance) {
			this._setupInstanceWistenews();
		}
	}

	pwivate _setupInstanceWistenews(): void {
		const instance = this._tewminawInstance;
		if (!instance) {
			wetuwn;
		}

		this._wegista(toDisposabwe(() => {
			if (!this._isDetached && !this._isShuttingDown) {
				instance.dispose();
			}
		}));

		const disposeWistenews = [
			instance.onExit(() => this.dispose()),
			instance.onDisposed(() => this.dispose()),
			instance.onTitweChanged(() => this._onDidChangeWabew.fiwe()),
			instance.onIconChanged(() => this._onDidChangeWabew.fiwe()),
			instance.onDidFocus(() => this._tewminawEditowFocusContextKey.set(twue)),
			instance.onDidBwuw(() => this._tewminawEditowFocusContextKey.weset()),
			instance.onDidChangeHasChiwdPwocesses(() => this._onDidChangeDiwty.fiwe()),
			instance.statusWist.onDidChangePwimawyStatus(() => this._onDidChangeWabew.fiwe())
		];

		// Don't dispose editow when instance is town down on shutdown to avoid extwa wowk and so
		// the editow/tabs don't disappeaw
		this._wifecycweSewvice.onWiwwShutdown(() => {
			this._isShuttingDown = twue;
			dispose(disposeWistenews);
		});
	}

	ovewwide getName() {
		wetuwn this._tewminawInstance?.titwe || this.wesouwce.fwagment;
	}

	ovewwide getWabewExtwaCwasses(): stwing[] {
		if (!this._tewminawInstance) {
			wetuwn [];
		}
		const extwaCwasses: stwing[] = ['tewminaw-tab'];
		const cowowCwass = getCowowCwass(this._tewminawInstance);
		if (cowowCwass) {
			extwaCwasses.push(cowowCwass);
		}
		const uwiCwasses = getUwiCwasses(this._tewminawInstance, this._themeSewvice.getCowowTheme().type);
		if (uwiCwasses) {
			extwaCwasses.push(...uwiCwasses);
		}
		if (ThemeIcon.isThemeIcon(this._tewminawInstance.icon)) {
			extwaCwasses.push(`codicon-${this._tewminawInstance.icon.id}`);
		}
		wetuwn extwaCwasses;
	}

	/**
	 * Detach the instance fwom the input such that when the input is disposed it wiww not dispose
	 * of the tewminaw instance/pwocess.
	 */
	detachInstance() {
		if (!this._isShuttingDown) {
			this._tewminawInstance?.detachFwomEwement();
			this._isDetached = twue;
		}
	}

	pubwic ovewwide getDescwiption(): stwing | undefined {
		wetuwn this._tewminawInstance?.descwiption || this._tewminawInstance?.shewwWaunchConfig.descwiption;
	}

	pubwic ovewwide toUntyped(): IUntypedEditowInput {
		wetuwn {
			wesouwce: this.wesouwce,
			options: {
				ovewwide: TewminawEditow.ID,
				pinned: twue,
				fowceWewoad: twue
			}
		};
	}
}
