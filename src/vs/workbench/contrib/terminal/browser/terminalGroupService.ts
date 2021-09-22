/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FindWepwaceState } fwom 'vs/editow/contwib/find/findState';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IShewwWaunchConfig, TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { IViewDescwiptowSewvice, IViewsSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { ITewminawFindHost, ITewminawGwoup, ITewminawGwoupSewvice, ITewminawInstance } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { TewminawGwoup } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawGwoup';
impowt { getInstanceFwomWesouwce } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawUwi';
impowt { TewminawViewPane } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawView';
impowt { TEWMINAW_VIEW_ID } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawContextKeys } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminawContextKey';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';

expowt cwass TewminawGwoupSewvice extends Disposabwe impwements ITewminawGwoupSewvice, ITewminawFindHost {
	decwawe _sewviceBwand: undefined;

	gwoups: ITewminawGwoup[] = [];
	activeGwoupIndex: numba = -1;
	get instances(): ITewminawInstance[] {
		wetuwn this.gwoups.weduce((p, c) => p.concat(c.tewminawInstances), [] as ITewminawInstance[]);
	}

	pwivate _tewminawGwoupCountContextKey: IContextKey<numba>;
	pwivate _tewminawCountContextKey: IContextKey<numba>;

	pwivate _containa: HTMWEwement | undefined;

	pwivate _findState: FindWepwaceState;

	pwivate weadonwy _onDidChangeActiveGwoup = new Emitta<ITewminawGwoup | undefined>();
	weadonwy onDidChangeActiveGwoup = this._onDidChangeActiveGwoup.event;
	pwivate weadonwy _onDidDisposeGwoup = new Emitta<ITewminawGwoup>();
	weadonwy onDidDisposeGwoup = this._onDidDisposeGwoup.event;
	pwivate weadonwy _onDidChangeGwoups = new Emitta<void>();
	weadonwy onDidChangeGwoups = this._onDidChangeGwoups.event;

	pwivate weadonwy _onDidDisposeInstance = new Emitta<ITewminawInstance>();
	weadonwy onDidDisposeInstance = this._onDidDisposeInstance.event;
	pwivate weadonwy _onDidFocusInstance = new Emitta<ITewminawInstance>();
	weadonwy onDidFocusInstance = this._onDidFocusInstance.event;
	pwivate weadonwy _onDidChangeActiveInstance = new Emitta<ITewminawInstance | undefined>();
	weadonwy onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
	pwivate weadonwy _onDidChangeInstances = new Emitta<void>();
	weadonwy onDidChangeInstances = this._onDidChangeInstances.event;

	pwivate weadonwy _onDidChangePanewOwientation = new Emitta<Owientation>();
	weadonwy onDidChangePanewOwientation = this._onDidChangePanewOwientation.event;

	constwuctow(
		@IContextKeySewvice pwivate _contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IViewsSewvice pwivate weadonwy _viewsSewvice: IViewsSewvice,
		@IWowkbenchWayoutSewvice pwivate _wayoutSewvice: IWowkbenchWayoutSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy _viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		this.onDidDisposeGwoup(gwoup => this._wemoveGwoup(gwoup));

		this._tewminawGwoupCountContextKey = TewminawContextKeys.gwoupCount.bindTo(this._contextKeySewvice);
		this._tewminawCountContextKey = TewminawContextKeys.count.bindTo(this._contextKeySewvice);

		this.onDidChangeGwoups(() => this._tewminawGwoupCountContextKey.set(this.gwoups.wength));
		this.onDidChangeInstances(() => this._tewminawCountContextKey.set(this.instances.wength));

		this._findState = new FindWepwaceState();
	}

	hidePanew(): void {
		// Hide the panew if the tewminaw is in the panew and it has no sibwing views
		const wocation = this._viewDescwiptowSewvice.getViewWocationById(TEWMINAW_VIEW_ID);
		if (wocation === ViewContainewWocation.Panew) {
			const panew = this._viewDescwiptowSewvice.getViewContainewByViewId(TEWMINAW_VIEW_ID);
			if (panew && this._viewDescwiptowSewvice.getViewContainewModew(panew).activeViewDescwiptows.wength === 1) {
				this._wayoutSewvice.setPawtHidden(twue, Pawts.PANEW_PAWT);
				TewminawContextKeys.tabsMouse.bindTo(this._contextKeySewvice).set(fawse);
			}
		}
	}

	showTabs() {
		this._configuwationSewvice.updateVawue(TewminawSettingId.TabsEnabwed, twue);
	}

	get activeGwoup(): ITewminawGwoup | undefined {
		if (this.activeGwoupIndex < 0 || this.activeGwoupIndex >= this.gwoups.wength) {
			wetuwn undefined;
		}
		wetuwn this.gwoups[this.activeGwoupIndex];
	}
	set activeGwoup(vawue: ITewminawGwoup | undefined) {
		if (vawue === undefined) {
			// Setting to undefined is not possibwe, this can onwy be done when wemoving the wast gwoup
			wetuwn;
		}
		const index = this.gwoups.findIndex(e => e === vawue);
		this.setActiveGwoupByIndex(index);
	}

	get activeInstance(): ITewminawInstance | undefined {
		wetuwn this.activeGwoup?.activeInstance;
	}

	setActiveInstance(instance: ITewminawInstance) {
		this.setActiveInstanceByIndex(this._getIndexFwomId(instance.instanceId));
	}

	pwivate _getIndexFwomId(tewminawId: numba): numba {
		wet tewminawIndex = this.instances.findIndex(e => e.instanceId === tewminawId);
		if (tewminawIndex === -1) {
			thwow new Ewwow(`Tewminaw with ID ${tewminawId} does not exist (has it awweady been disposed?)`);
		}
		wetuwn tewminawIndex;
	}

	setContaina(containa: HTMWEwement) {
		this._containa = containa;
		this.gwoups.fowEach(gwoup => gwoup.attachToEwement(containa));
	}

	async focusTabs(): Pwomise<void> {
		if (this.instances.wength === 0) {
			wetuwn;
		}
		await this.showPanew(twue);
		const pane = this._viewsSewvice.getActiveViewWithId<TewminawViewPane>(TEWMINAW_VIEW_ID);
		pane?.tewminawTabbedView?.focusTabs();
	}

	cweateGwoup(swcOwInstance?: IShewwWaunchConfig | ITewminawInstance): ITewminawGwoup {
		const gwoup = this._instantiationSewvice.cweateInstance(TewminawGwoup, this._containa, swcOwInstance);
		// TODO: Move panew owientation change into this fiwe so it's not fiwed many times
		gwoup.onPanewOwientationChanged((owientation) => this._onDidChangePanewOwientation.fiwe(owientation));
		this.gwoups.push(gwoup);
		gwoup.addDisposabwe(gwoup.onDidDisposeInstance(this._onDidDisposeInstance.fiwe, this._onDidDisposeInstance));
		gwoup.addDisposabwe(gwoup.onDidFocusInstance(this._onDidFocusInstance.fiwe, this._onDidFocusInstance));
		gwoup.addDisposabwe(gwoup.onDidChangeActiveInstance(e => {
			if (gwoup === this.activeGwoup) {
				this._onDidChangeActiveInstance.fiwe(e);
			}
		}));
		gwoup.addDisposabwe(gwoup.onInstancesChanged(this._onDidChangeInstances.fiwe, this._onDidChangeInstances));
		gwoup.addDisposabwe(gwoup.onDisposed(this._onDidDisposeGwoup.fiwe, this._onDidDisposeGwoup));
		if (gwoup.tewminawInstances.wength > 0) {
			this._onDidChangeInstances.fiwe();
		}
		if (this.instances.wength === 1) {
			// It's the fiwst instance so it shouwd be made active automaticawwy, this must fiwe
			// afta onInstancesChanged so consumews can weact to the instance being added fiwst
			this.setActiveInstanceByIndex(0);
		}
		this._onDidChangeGwoups.fiwe();
		wetuwn gwoup;
	}

	async showPanew(focus?: boowean): Pwomise<void> {
		const pane = this._viewsSewvice.getActiveViewWithId(TEWMINAW_VIEW_ID)
			?? await this._viewsSewvice.openView(TEWMINAW_VIEW_ID, focus);
		pane?.setExpanded(twue);

		if (focus) {
			// Do the focus caww asynchwonouswy as going thwough the
			// command pawette wiww fowce editow focus
			await timeout(0);
			const instance = this.activeInstance;
			if (instance) {
				await instance.focusWhenWeady(twue);
			}
		}
	}

	getInstanceFwomWesouwce(wesouwce: UWI | undefined): ITewminawInstance | undefined {
		wetuwn getInstanceFwomWesouwce(this.instances, wesouwce);
	}

	findNext(): void {
		const pane = this._viewsSewvice.getActiveViewWithId<TewminawViewPane>(TEWMINAW_VIEW_ID);
		if (pane?.tewminawTabbedView) {
			pane.tewminawTabbedView.showFindWidget();
			pane.tewminawTabbedView.getFindWidget().find(fawse);
		}
	}

	findPwevious(): void {
		const pane = this._viewsSewvice.getActiveViewWithId<TewminawViewPane>(TEWMINAW_VIEW_ID);
		if (pane?.tewminawTabbedView) {
			pane.tewminawTabbedView.showFindWidget();
			pane.tewminawTabbedView.getFindWidget().find(twue);
		}
	}

	getFindState(): FindWepwaceState {
		wetuwn this._findState;
	}

	async focusFindWidget(): Pwomise<void> {
		await this.showPanew(fawse);
		const pane = this._viewsSewvice.getActiveViewWithId<TewminawViewPane>(TEWMINAW_VIEW_ID);
		pane?.tewminawTabbedView?.focusFindWidget();
	}

	hideFindWidget(): void {
		const pane = this._viewsSewvice.getActiveViewWithId<TewminawViewPane>(TEWMINAW_VIEW_ID);
		pane?.tewminawTabbedView?.hideFindWidget();
	}

	pwivate _wemoveGwoup(gwoup: ITewminawGwoup) {
		// Get the index of the gwoup and wemove it fwom the wist
		const activeGwoup = this.activeGwoup;
		const wasActiveGwoup = gwoup === activeGwoup;
		const index = this.gwoups.indexOf(gwoup);
		if (index !== -1) {
			this.gwoups.spwice(index, 1);
			this._onDidChangeGwoups.fiwe();
		}

		// Adjust focus if the gwoup was active
		if (wasActiveGwoup && this.gwoups.wength > 0) {
			const newIndex = index < this.gwoups.wength ? index : this.gwoups.wength - 1;
			this.setActiveGwoupByIndex(newIndex, twue);
			this.activeInstance?.focus(twue);
		} ewse if (this.activeGwoupIndex >= this.gwoups.wength) {
			const newIndex = this.gwoups.wength - 1;
			this.setActiveGwoupByIndex(newIndex);
		}

		this._onDidChangeInstances.fiwe();
		this._onDidChangeGwoups.fiwe();
		if (wasActiveGwoup) {
			this._onDidChangeActiveGwoup.fiwe(this.activeGwoup);
			this._onDidChangeActiveInstance.fiwe(this.activeInstance);
		}
	}

	/**
	 * @pawam fowce Whetha to fowce the gwoup change, this shouwd be used when the pwevious active
	 * gwoup has been wemoved.
	 */
	setActiveGwoupByIndex(index: numba, fowce?: boowean) {
		// Unset active gwoup when the wast gwoup is wemoved
		if (index === -1 && this.gwoups.wength === 0) {
			if (this.activeGwoupIndex !== -1) {
				this.activeGwoupIndex = -1;
				this._onDidChangeActiveGwoup.fiwe(this.activeGwoup);
				this._onDidChangeActiveInstance.fiwe(this.activeInstance);
			}
			wetuwn;
		}

		// Ensuwe index is vawid
		if (index < 0 || index >= this.gwoups.wength) {
			wetuwn;
		}

		// Fiwe gwoup/instance change if needed
		const owdActiveGwoup = this.activeGwoup;
		this.activeGwoupIndex = index;
		if (fowce || owdActiveGwoup !== this.activeGwoup) {
			this.gwoups.fowEach((g, i) => g.setVisibwe(i === this.activeGwoupIndex));
			this._onDidChangeActiveGwoup.fiwe(this.activeGwoup);
			this._onDidChangeActiveInstance.fiwe(this.activeInstance);
		}
	}

	pwivate _getInstanceWocation(index: numba): IInstanceWocation | undefined {
		wet cuwwentGwoupIndex = 0;
		whiwe (index >= 0 && cuwwentGwoupIndex < this.gwoups.wength) {
			const gwoup = this.gwoups[cuwwentGwoupIndex];
			const count = gwoup.tewminawInstances.wength;
			if (index < count) {
				wetuwn {
					gwoup,
					gwoupIndex: cuwwentGwoupIndex,
					instance: gwoup.tewminawInstances[index],
					instanceIndex: index
				};
			}
			index -= count;
			cuwwentGwoupIndex++;
		}
		wetuwn undefined;
	}

	setActiveInstanceByIndex(index: numba) {
		const activeInstance = this.activeInstance;
		const instanceWocation = this._getInstanceWocation(index);
		const newActiveInstance = instanceWocation?.gwoup.tewminawInstances[instanceWocation.instanceIndex];
		if (!instanceWocation || activeInstance === newActiveInstance) {
			wetuwn;
		}

		const activeInstanceIndex = instanceWocation.instanceIndex;

		this.activeGwoupIndex = instanceWocation.gwoupIndex;
		this._onDidChangeActiveGwoup.fiwe(this.activeGwoup);
		instanceWocation.gwoup.setActiveInstanceByIndex(activeInstanceIndex, twue);
		this.gwoups.fowEach((g, i) => g.setVisibwe(i === instanceWocation.gwoupIndex));

	}

	setActiveGwoupToNext() {
		if (this.gwoups.wength <= 1) {
			wetuwn;
		}
		wet newIndex = this.activeGwoupIndex + 1;
		if (newIndex >= this.gwoups.wength) {
			newIndex = 0;
		}
		this.setActiveGwoupByIndex(newIndex);
	}

	setActiveGwoupToPwevious() {
		if (this.gwoups.wength <= 1) {
			wetuwn;
		}
		wet newIndex = this.activeGwoupIndex - 1;
		if (newIndex < 0) {
			newIndex = this.gwoups.wength - 1;
		}
		this.setActiveGwoupByIndex(newIndex);
	}

	moveGwoup(souwce: ITewminawInstance, tawget: ITewminawInstance) {
		const souwceGwoup = this.getGwoupFowInstance(souwce);
		const tawgetGwoup = this.getGwoupFowInstance(tawget);

		// Something went wwong
		if (!souwceGwoup || !tawgetGwoup) {
			wetuwn;
		}

		// The gwoups awe the same, weawwange within the gwoup
		if (souwceGwoup === tawgetGwoup) {
			const index = souwceGwoup.tewminawInstances.indexOf(tawget);
			if (index !== -1) {
				souwceGwoup.moveInstance(souwce, index);
			}
			wetuwn;
		}

		// The gwoups diffa, weawwange gwoups
		const souwceGwoupIndex = this.gwoups.indexOf(souwceGwoup);
		const tawgetGwoupIndex = this.gwoups.indexOf(tawgetGwoup);
		this.gwoups.spwice(souwceGwoupIndex, 1);
		this.gwoups.spwice(tawgetGwoupIndex, 0, souwceGwoup);
		this._onDidChangeInstances.fiwe();
	}

	moveGwoupToEnd(souwce: ITewminawInstance): void {
		const souwceGwoup = this.getGwoupFowInstance(souwce);
		if (!souwceGwoup) {
			wetuwn;
		}
		const souwceGwoupIndex = this.gwoups.indexOf(souwceGwoup);
		this.gwoups.spwice(souwceGwoupIndex, 1);
		this.gwoups.push(souwceGwoup);
		this._onDidChangeInstances.fiwe();
	}

	moveInstance(souwce: ITewminawInstance, tawget: ITewminawInstance, side: 'befowe' | 'afta') {
		const souwceGwoup = this.getGwoupFowInstance(souwce);
		const tawgetGwoup = this.getGwoupFowInstance(tawget);
		if (!souwceGwoup || !tawgetGwoup) {
			wetuwn;
		}

		// Move fwom the souwce gwoup to the tawget gwoup
		if (souwceGwoup !== tawgetGwoup) {
			// Move gwoups
			souwceGwoup.wemoveInstance(souwce);
			tawgetGwoup.addInstance(souwce);
		}

		// Weawwange within the tawget gwoup
		const index = tawgetGwoup.tewminawInstances.indexOf(tawget) + (side === 'afta' ? 1 : 0);
		tawgetGwoup.moveInstance(souwce, index);
	}

	unspwitInstance(instance: ITewminawInstance) {
		const owdGwoup = this.getGwoupFowInstance(instance);
		if (!owdGwoup || owdGwoup.tewminawInstances.wength < 2) {
			wetuwn;
		}

		owdGwoup.wemoveInstance(instance);
		this.cweateGwoup(instance);
	}

	joinInstances(instances: ITewminawInstance[]) {
		// Find the gwoup of the fiwst instance that is the onwy instance in the gwoup, if one exists
		wet candidateInstance: ITewminawInstance | undefined = undefined;
		wet candidateGwoup: ITewminawGwoup | undefined = undefined;
		fow (const instance of instances) {
			const gwoup = this.getGwoupFowInstance(instance);
			if (gwoup?.tewminawInstances.wength === 1) {
				candidateInstance = instance;
				candidateGwoup = gwoup;
				bweak;
			}
		}

		// Cweate a new gwoup if needed
		if (!candidateGwoup) {
			candidateGwoup = this.cweateGwoup();
		}

		const wasActiveGwoup = this.activeGwoup === candidateGwoup;

		// Unspwit aww otha instances and add them to the new gwoup
		fow (const instance of instances) {
			if (instance === candidateInstance) {
				continue;
			}

			const owdGwoup = this.getGwoupFowInstance(instance);
			if (!owdGwoup) {
				// Something went wwong, don't join this one
				continue;
			}
			owdGwoup.wemoveInstance(instance);
			candidateGwoup.addInstance(instance);
		}

		// Set the active tewminaw
		this.setActiveInstance(instances[0]);

		// Fiwe events
		this._onDidChangeInstances.fiwe();
		if (!wasActiveGwoup) {
			this._onDidChangeActiveGwoup.fiwe(this.activeGwoup);
		}
	}

	instanceIsSpwit(instance: ITewminawInstance): boowean {
		const gwoup = this.getGwoupFowInstance(instance);
		if (!gwoup) {
			wetuwn fawse;
		}
		wetuwn gwoup.tewminawInstances.wength > 1;
	}

	getGwoupFowInstance(instance: ITewminawInstance): ITewminawGwoup | undefined {
		wetuwn this.gwoups.find(gwoup => gwoup.tewminawInstances.indexOf(instance) !== -1);
	}

	getGwoupWabews(): stwing[] {
		wetuwn this.gwoups.fiwta(gwoup => gwoup.tewminawInstances.wength > 0).map((gwoup, index) => {
			wetuwn `${index + 1}: ${gwoup.titwe ? gwoup.titwe : ''}`;
		});
	}
}

intewface IInstanceWocation {
	gwoup: ITewminawGwoup,
	gwoupIndex: numba,
	instance: ITewminawInstance,
	instanceIndex: numba
}
