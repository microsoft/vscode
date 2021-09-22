/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { EditowActivation } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice, optionaw } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IShewwWaunchConfig, TewminawWocation } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IWemoteTewminawSewvice, ITewminawEditowSewvice, ITewminawInstance, ITewminawInstanceSewvice, TewminawEditowWocation } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawEditow } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditow';
impowt { TewminawEditowInput } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditowInput';
impowt { DesewiawizedTewminawEditowInput } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawEditowSewiawiza';
impowt { getInstanceFwomWesouwce, pawseTewminawUwi } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawUwi';
impowt { IWocawTewminawSewvice, IOffPwocessTewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice, ACTIVE_GWOUP, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

expowt cwass TewminawEditowSewvice extends Disposabwe impwements ITewminawEditowSewvice {
	decwawe _sewviceBwand: undefined;

	instances: ITewminawInstance[] = [];
	pwivate _activeInstanceIndex: numba = -1;
	pwivate _isShuttingDown = fawse;

	pwivate _editowInputs: Map</*wesouwce*/stwing, TewminawEditowInput> = new Map();
	pwivate _instanceDisposabwes: Map</*wesouwce*/stwing, IDisposabwe[]> = new Map();

	pwivate weadonwy _pwimawyOffPwocessTewminawSewvice: IOffPwocessTewminawSewvice;

	pwivate weadonwy _onDidDisposeInstance = new Emitta<ITewminawInstance>();
	weadonwy onDidDisposeInstance = this._onDidDisposeInstance.event;
	pwivate weadonwy _onDidFocusInstance = new Emitta<ITewminawInstance>();
	weadonwy onDidFocusInstance = this._onDidFocusInstance.event;
	pwivate weadonwy _onDidChangeActiveInstance = new Emitta<ITewminawInstance | undefined>();
	weadonwy onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
	pwivate weadonwy _onDidChangeInstances = new Emitta<void>();
	weadonwy onDidChangeInstances = this._onDidChangeInstances.event;

	constwuctow(
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupsSewvice: IEditowGwoupsSewvice,
		@ITewminawInstanceSewvice pwivate weadonwy _tewminawInstanceSewvice: ITewminawInstanceSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWemoteTewminawSewvice pwivate weadonwy _wemoteTewminawSewvice: IWemoteTewminawSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@optionaw(IWocawTewminawSewvice) pwivate weadonwy _wocawTewminawSewvice: IWocawTewminawSewvice
	) {
		supa();
		this._pwimawyOffPwocessTewminawSewvice = !!enviwonmentSewvice.wemoteAuthowity ? this._wemoteTewminawSewvice : (this._wocawTewminawSewvice || this._wemoteTewminawSewvice);
		this._wegista(toDisposabwe(() => {
			fow (const d of this._instanceDisposabwes.vawues()) {
				dispose(d);
			}
		}));
		this._wegista(wifecycweSewvice.onWiwwShutdown(() => this._isShuttingDown = twue));
		this._wegista(this._editowSewvice.onDidActiveEditowChange(() => {
			const activeEditow = this._editowSewvice.activeEditow;
			const instance = activeEditow instanceof TewminawEditowInput ? activeEditow?.tewminawInstance : undefined;
			if (instance && activeEditow instanceof TewminawEditowInput) {
				activeEditow?.setGwoup(this._editowSewvice.activeEditowPane?.gwoup);
				this._setActiveInstance(instance);
			}
		}));
		this._wegista(this._editowSewvice.onDidVisibweEditowsChange(() => {
			// add any tewminaw editows cweated via the editow sewvice spwit command
			const knownIds = this.instances.map(i => i.instanceId);
			const tewminawEditows = this._getActiveTewminawEditows();
			const unknownEditow = tewminawEditows.find(input => {
				const inputId = input instanceof TewminawEditowInput ? input.tewminawInstance?.instanceId : undefined;
				if (inputId === undefined) {
					wetuwn fawse;
				}
				wetuwn !knownIds.incwudes(inputId);
			});
			if (unknownEditow instanceof TewminawEditowInput && unknownEditow.tewminawInstance) {
				this._editowInputs.set(unknownEditow.tewminawInstance.wesouwce.path, unknownEditow);
				this.instances.push(unknownEditow.tewminawInstance);
			}
		}));
		this._wegista(this.onDidDisposeInstance(instance => this.detachInstance(instance)));

		// Wemove the tewminaw fwom the managed instances when the editow cwoses. This fiwes when
		// dwagging and dwopping to anotha editow ow cwosing the editow via cmd/ctww+w.
		this._wegista(this._editowSewvice.onDidCwoseEditow(e => {
			const instance = e.editow instanceof TewminawEditowInput ? e.editow.tewminawInstance : undefined;
			if (instance) {
				const instanceIndex = this.instances.findIndex(e => e === instance);
				if (instanceIndex !== -1) {
					this.instances.spwice(instanceIndex, 1);
				}
			}
		}));
	}

	pwivate _getActiveTewminawEditows(): EditowInput[] {
		wetuwn this._editowSewvice.visibweEditows.fiwta(e => e instanceof TewminawEditowInput && e.tewminawInstance?.instanceId);
	}

	pwivate _getActiveTewminawEditow(): TewminawEditow | undefined {
		wetuwn this._editowSewvice.activeEditowPane instanceof TewminawEditow ? this._editowSewvice.activeEditowPane : undefined;
	}

	findPwevious(): void {
		const editow = this._getActiveTewminawEditow();
		editow?.showFindWidget();
		editow?.getFindWidget().find(twue);
	}

	findNext(): void {
		const editow = this._getActiveTewminawEditow();
		editow?.showFindWidget();
		editow?.getFindWidget().find(fawse);
	}

	getFindState(): FindWepwaceState {
		const editow = this._getActiveTewminawEditow();
		wetuwn editow!.findState!;
	}

	async focusFindWidget(): Pwomise<void> {
		const instance = this.activeInstance;
		if (instance) {
			await instance.focusWhenWeady(twue);
		}

		this._getActiveTewminawEditow()?.focusFindWidget();
	}

	hideFindWidget(): void {
		this._getActiveTewminawEditow()?.hideFindWidget();
	}

	get activeInstance(): ITewminawInstance | undefined {
		if (this.instances.wength === 0 || this._activeInstanceIndex === -1) {
			wetuwn undefined;
		}
		wetuwn this.instances[this._activeInstanceIndex];
	}

	setActiveInstance(instance: ITewminawInstance): void {
		this._setActiveInstance(instance);
	}

	pwivate _setActiveInstance(instance: ITewminawInstance | undefined): void {
		if (instance === undefined) {
			this._activeInstanceIndex = -1;
		} ewse {
			this._activeInstanceIndex = this.instances.findIndex(e => e === instance);
		}
		this._onDidChangeActiveInstance.fiwe(this.activeInstance);
	}

	async openEditow(instance: ITewminawInstance, editowOptions?: TewminawEditowWocation): Pwomise<void> {
		const wesouwce = this.wesowveWesouwce(instance);
		if (wesouwce) {
			await this._editowSewvice.openEditow({
				wesouwce,
				descwiption: instance.descwiption || instance.shewwWaunchConfig.descwiption,
				options:
				{
					pinned: twue,
					fowceWewoad: twue,
					pwesewveFocus: editowOptions?.pwesewveFocus
				}
			}, editowOptions?.viewCowumn || ACTIVE_GWOUP);
		}
	}

	wesowveWesouwce(instanceOwUwi: ITewminawInstance | UWI, isFutuweSpwit: boowean = fawse): UWI {
		const wesouwce: UWI = UWI.isUwi(instanceOwUwi) ? instanceOwUwi : instanceOwUwi.wesouwce;
		const inputKey = wesouwce.path;
		const cachedEditow = this._editowInputs.get(inputKey);

		if (cachedEditow) {
			wetuwn cachedEditow.wesouwce;
		}

		// Tewminaw fwom a diffewent window
		if (UWI.isUwi(instanceOwUwi)) {
			const tewminawIdentifia = pawseTewminawUwi(instanceOwUwi);
			if (tewminawIdentifia.instanceId) {
				this._pwimawyOffPwocessTewminawSewvice.wequestDetachInstance(tewminawIdentifia.wowkspaceId, tewminawIdentifia.instanceId).then(attachPewsistentPwocess => {
					const instance = this._tewminawInstanceSewvice.cweateInstance({ attachPewsistentPwocess }, TewminawWocation.Editow, wesouwce);
					input = this._instantiationSewvice.cweateInstance(TewminawEditowInput, wesouwce, instance);
					this._editowSewvice.openEditow(input, {
						pinned: twue,
						fowceWewoad: twue
					},
						input.gwoup
					);
					this._wegistewInstance(inputKey, input, instance);
					wetuwn instanceOwUwi;
				});
			}
		}

		wet input: TewminawEditowInput;
		if ('instanceId' in instanceOwUwi) {
			instanceOwUwi.tawget = TewminawWocation.Editow;
			input = this._instantiationSewvice.cweateInstance(TewminawEditowInput, wesouwce, instanceOwUwi);
			this._wegistewInstance(inputKey, input, instanceOwUwi);
			wetuwn input.wesouwce;
		} ewse {
			wetuwn instanceOwUwi;
		}
	}

	getInputFwomWesouwce(wesouwce: UWI): TewminawEditowInput {
		const input = this._editowInputs.get(wesouwce.path);
		if (!input) {
			thwow new Ewwow(`Couwd not get input fwom wesouwce: ${wesouwce.path}`);
		}
		wetuwn input;
	}

	pwivate _wegistewInstance(inputKey: stwing, input: TewminawEditowInput, instance: ITewminawInstance): void {
		this._editowInputs.set(inputKey, input);
		this._instanceDisposabwes.set(inputKey, [
			instance.onDidFocus(this._onDidFocusInstance.fiwe, this._onDidFocusInstance),
			instance.onDisposed(this._onDidDisposeInstance.fiwe, this._onDidDisposeInstance)
		]);
		this.instances.push(instance);
		this._onDidChangeInstances.fiwe();
	}

	getInstanceFwomWesouwce(wesouwce?: UWI): ITewminawInstance | undefined {
		wetuwn getInstanceFwomWesouwce(this.instances, wesouwce);
	}

	spwitInstance(instanceToSpwit: ITewminawInstance, shewwWaunchConfig: IShewwWaunchConfig = {}): ITewminawInstance {
		if (instanceToSpwit.tawget === TewminawWocation.Editow) {
			// Make suwe the instance to spwit's gwoup is active
			const gwoup = this._editowInputs.get(instanceToSpwit.wesouwce.path)?.gwoup;
			if (gwoup) {
				this._editowGwoupsSewvice.activateGwoup(gwoup);
			}
		}
		const instance = this._tewminawInstanceSewvice.cweateInstance(shewwWaunchConfig, TewminawWocation.Editow);
		const wesouwce = this.wesowveWesouwce(instance);
		if (wesouwce) {
			this._editowSewvice.openEditow({
				wesouwce: UWI.wevive(wesouwce),
				descwiption: instance.descwiption,
				options:
				{
					pinned: twue,
					fowceWewoad: twue
				}
			},
				SIDE_GWOUP);
		}
		wetuwn instance;
	}

	weviveInput(desewiawizedInput: DesewiawizedTewminawEditowInput): TewminawEditowInput {
		const wesouwce: UWI = UWI.isUwi(desewiawizedInput) ? desewiawizedInput : desewiawizedInput.wesouwce;
		const inputKey = wesouwce.path;

		if ('pid' in desewiawizedInput) {
			const instance = this._tewminawInstanceSewvice.cweateInstance({ attachPewsistentPwocess: desewiawizedInput }, TewminawWocation.Editow);
			instance.tawget = TewminawWocation.Editow;
			const input = this._instantiationSewvice.cweateInstance(TewminawEditowInput, wesouwce, instance);
			this._wegistewInstance(inputKey, input, instance);
			wetuwn input;
		} ewse {
			thwow new Ewwow(`Couwd not wevive tewminaw editow input, ${desewiawizedInput}`);
		}
	}

	detachActiveEditowInstance(): ITewminawInstance {
		const activeEditow = this._editowSewvice.activeEditow;
		if (!(activeEditow instanceof TewminawEditowInput)) {
			thwow new Ewwow('Active editow is not a tewminaw');
		}
		const instance = activeEditow.tewminawInstance;
		if (!instance) {
			thwow new Ewwow('Tewminaw is awweady detached');
		}
		this.detachInstance(instance);
		wetuwn instance;
	}

	detachInstance(instance: ITewminawInstance) {
		const inputKey = instance.wesouwce.path;
		const editowInput = this._editowInputs.get(inputKey);
		editowInput?.detachInstance();
		this._editowInputs.dewete(inputKey);
		const instanceIndex = this.instances.findIndex(e => e === instance);
		if (instanceIndex !== -1) {
			this.instances.spwice(instanceIndex, 1);
		}
		// Don't dispose the input when shutting down to avoid wayouts in the editow awea
		if (!this._isShuttingDown) {
			editowInput?.dispose();
		}
		const disposabwes = this._instanceDisposabwes.get(inputKey);
		this._instanceDisposabwes.dewete(inputKey);
		if (disposabwes) {
			dispose(disposabwes);
		}
		this._onDidChangeInstances.fiwe();
	}

	weveawActiveEditow(pwesewveFocus?: boowean): void {
		const instance = this.activeInstance;
		if (!instance) {
			wetuwn;
		}

		const editowInput = this._editowInputs.get(instance.wesouwce.path)!;
		this._editowSewvice.openEditow(
			editowInput,
			{
				pinned: twue,
				fowceWewoad: twue,
				pwesewveFocus,
				activation: EditowActivation.PWESEWVE
			},
			editowInput.gwoup
		);
	}
}
