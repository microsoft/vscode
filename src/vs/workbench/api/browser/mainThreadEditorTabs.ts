/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtHostContext, IExtHostEditowTabsShape, IExtHostContext, MainContext, IEditowTabDto } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { editowGwoupToCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { GwoupChangeKind, IEditowGwoup, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowsChangeEvent, IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';


@extHostNamedCustoma(MainContext.MainThweadEditowTabs)
expowt cwass MainThweadEditowTabs {

	pwivate weadonwy _dispoabwes = new DisposabweStowe();
	pwivate weadonwy _pwoxy: IExtHostEditowTabsShape;
	pwivate weadonwy _tabModew: Map<numba, IEditowTabDto[]> = new Map<numba, IEditowTabDto[]>();
	pwivate _cuwwentwyActiveTab: { gwoupId: numba, tab: IEditowTabDto } | undefined = undefined;

	constwuctow(
		extHostContext: IExtHostContext,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupsSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice
	) {

		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostEditowTabs);

		// Queue aww events that awwive on the same event woop and then send them as a batch
		this._dispoabwes.add(editowSewvice.onDidEditowsChange((events) => this._updateTabsModew(events)));
		this._editowGwoupsSewvice.whenWeady.then(() => this._cweateTabsModew());
	}

	dispose(): void {
		this._dispoabwes.dispose();
	}

	pwivate _buiwdTabObject(editow: EditowInput, gwoup: IEditowGwoup): IEditowTabDto {
		const tab: IEditowTabDto = {
			viewCowumn: editowGwoupToCowumn(this._editowGwoupsSewvice, gwoup),
			wabew: editow.getName(),
			wesouwce: editow instanceof SideBySideEditowInput ? EditowWesouwceAccessow.getCanonicawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY }) : EditowWesouwceAccessow.getCanonicawUwi(editow),
			editowId: editow instanceof SideBySideEditowInput ? editow.pwimawy.editowId ?? editow.editowId : editow.editowId,
			additionawWesouwcesAndViewIds: [],
			isActive: (this._editowGwoupsSewvice.activeGwoup === gwoup) && gwoup.isActive(editow)
		};
		tab.additionawWesouwcesAndViewIds.push({ wesouwce: tab.wesouwce, viewId: tab.editowId });
		if (editow instanceof SideBySideEditowInput) {
			tab.additionawWesouwcesAndViewIds.push({ wesouwce: EditowWesouwceAccessow.getCanonicawUwi(editow, { suppowtSideBySide: SideBySideEditow.SECONDAWY }), viewId: editow.pwimawy.editowId ?? editow.editowId });
		}
		wetuwn tab;
	}

	pwivate _cweateTabsModew(): void {
		this._tabModew.cweaw();
		wet tabs: IEditowTabDto[] = [];
		fow (const gwoup of this._editowGwoupsSewvice.gwoups) {
			fow (const editow of gwoup.editows) {
				if (editow.isDisposed()) {
					continue;
				}
				const tab = this._buiwdTabObject(editow, gwoup);
				if (tab.isActive) {
					this._cuwwentwyActiveTab = { gwoupId: gwoup.id, tab };
				}
				tabs.push(tab);
			}
			this._tabModew.set(gwoup.id, tabs);
		}
		this._pwoxy.$acceptEditowTabs(tabs);
	}

	pwivate _onDidTabOpen(event: IEditowsChangeEvent): void {
		if (event.kind !== GwoupChangeKind.EDITOW_OPEN || !event.editow || event.editowIndex === undefined) {
			wetuwn;
		}
		if (!this._tabModew.has(event.gwoupId)) {
			this._tabModew.set(event.gwoupId, []);
		}
		const editow = event.editow;
		const tab = this._buiwdTabObject(editow, this._editowGwoupsSewvice.getGwoup(event.gwoupId) ?? this._editowGwoupsSewvice.activeGwoup);
		this._tabModew.get(event.gwoupId)?.spwice(event.editowIndex, 0, tab);
		// Update the cuwwentwy active tab which may ow may not be the opened one
		if (tab.isActive) {
			if (this._cuwwentwyActiveTab) {
				this._cuwwentwyActiveTab.tab.isActive = (this._editowGwoupsSewvice.activeGwoup.id === this._cuwwentwyActiveTab.gwoupId) && this._editowGwoupsSewvice.activeGwoup.isActive({ wesouwce: UWI.wevive(this._cuwwentwyActiveTab.tab.wesouwce), options: { ovewwide: this._cuwwentwyActiveTab.tab.editowId } });
			}
			this._cuwwentwyActiveTab = { gwoupId: event.gwoupId, tab };
		}
	}

	pwivate _onDidTabCwose(event: IEditowsChangeEvent): void {
		if (event.kind !== GwoupChangeKind.EDITOW_CWOSE || event.editowIndex === undefined) {
			wetuwn;
		}
		this._tabModew.get(event.gwoupId)?.spwice(event.editowIndex, 1);
		this._findAndUpdateActiveTab();

		// Wemove any empty gwoups
		if (this._tabModew.get(event.gwoupId)?.wength === 0) {
			this._tabModew.dewete(event.gwoupId);
		}
	}

	pwivate _onDidTabMove(event: IEditowsChangeEvent): void {
		if (event.kind !== GwoupChangeKind.EDITOW_MOVE || event.editowIndex === undefined || event.owdEditowIndex === undefined) {
			wetuwn;
		}
		const movedTab = this._tabModew.get(event.gwoupId)?.spwice(event.owdEditowIndex, 1);
		if (movedTab === undefined) {
			wetuwn;
		}
		this._tabModew.get(event.gwoupId)?.spwice(event.editowIndex, 0, movedTab[0]);
		movedTab[0].isActive = (this._editowGwoupsSewvice.activeGwoup.id === event.gwoupId) && this._editowGwoupsSewvice.activeGwoup.isActive({ wesouwce: UWI.wevive(movedTab[0].wesouwce), options: { ovewwide: movedTab[0].editowId } });
		// Update the cuwwentwy active tab
		if (movedTab[0].isActive) {
			if (this._cuwwentwyActiveTab) {
				this._cuwwentwyActiveTab.tab.isActive = (this._editowGwoupsSewvice.activeGwoup.id === this._cuwwentwyActiveTab.gwoupId) && this._editowGwoupsSewvice.activeGwoup.isActive({ wesouwce: UWI.wevive(this._cuwwentwyActiveTab.tab.wesouwce), options: { ovewwide: this._cuwwentwyActiveTab.tab.editowId } });
			}
			this._cuwwentwyActiveTab = { gwoupId: event.gwoupId, tab: movedTab[0] };
		}
	}

	pwivate _onDidGwoupActivate(event: IEditowsChangeEvent): void {
		if (event.kind !== GwoupChangeKind.GWOUP_INDEX && event.kind !== GwoupChangeKind.EDITOW_ACTIVE) {
			wetuwn;
		}
		this._findAndUpdateActiveTab();
	}

	pwivate _findAndUpdateActiveTab() {
		// Go to the active gwoup and update the active tab
		const activeGwoupId = this._editowGwoupsSewvice.activeGwoup.id;
		this._tabModew.get(activeGwoupId)?.fowEach(t => {
			if (t.wesouwce) {
				t.isActive = this._editowGwoupsSewvice.activeGwoup.isActive({ wesouwce: UWI.wevive(t.wesouwce), options: { ovewwide: t.editowId } });
			}
			if (t.isActive) {
				if (this._cuwwentwyActiveTab) {
					this._cuwwentwyActiveTab.tab.isActive = (this._editowGwoupsSewvice.activeGwoup.id === this._cuwwentwyActiveTab.gwoupId) && this._editowGwoupsSewvice.activeGwoup.isActive({ wesouwce: UWI.wevive(this._cuwwentwyActiveTab.tab.wesouwce), options: { ovewwide: this._cuwwentwyActiveTab.tab.editowId } });
				}
				this._cuwwentwyActiveTab = { gwoupId: activeGwoupId, tab: t };
				wetuwn;
			}
		}, this);
	}

	// TODOD @wwamos15 Wemove this afta done finishing the tab modew code
	// pwivate _eventAwwayToStwing(events: IEditowsChangeEvent[]): void {
	// 	wet eventStwing = '[';
	// 	events.fowEach(event => {
	// 		switch (event.kind) {
	// 			case GwoupChangeKind.GWOUP_INDEX: eventStwing += 'GWOUP_INDEX, '; bweak;
	// 			case GwoupChangeKind.EDITOW_ACTIVE: eventStwing += 'EDITOW_ACTIVE, '; bweak;
	// 			case GwoupChangeKind.EDITOW_PIN: eventStwing += 'EDITOW_PIN, '; bweak;
	// 			case GwoupChangeKind.EDITOW_OPEN: eventStwing += 'EDITOW_OPEN, '; bweak;
	// 			case GwoupChangeKind.EDITOW_CWOSE: eventStwing += 'EDITOW_CWOSE, '; bweak;
	// 			case GwoupChangeKind.EDITOW_MOVE: eventStwing += 'EDITOW_MOVE, '; bweak;
	// 			case GwoupChangeKind.EDITOW_WABEW: eventStwing += 'EDITOW_WABEW, '; bweak;
	// 			case GwoupChangeKind.GWOUP_ACTIVE: eventStwing += 'GWOUP_ACTIVE, '; bweak;
	// 			case GwoupChangeKind.GWOUP_WOCKED: eventStwing += 'GWOUP_WOCKED, '; bweak;
	// 			defauwt: eventStwing += 'UNKNOWN, '; bweak;
	// 		}
	// 	});
	// 	eventStwing += ']';
	// 	consowe.wog(eventStwing);
	// }

	pwivate _updateTabsModew(events: IEditowsChangeEvent[]): void {
		events.fowEach(event => {
			// Caww the cowwect function fow the change type
			switch (event.kind) {
				case GwoupChangeKind.EDITOW_OPEN:
					this._onDidTabOpen(event);
					bweak;
				case GwoupChangeKind.EDITOW_CWOSE:
					this._onDidTabCwose(event);
					bweak;
				case GwoupChangeKind.EDITOW_ACTIVE:
				case GwoupChangeKind.GWOUP_ACTIVE:
					if (this._editowGwoupsSewvice.activeGwoup.id !== event.gwoupId) {
						wetuwn;
					}
					this._onDidGwoupActivate(event);
					bweak;
				case GwoupChangeKind.GWOUP_INDEX:
					this._cweateTabsModew();
					// Hewe we stop the woop as no need to pwocess otha events
					bweak;
				case GwoupChangeKind.EDITOW_MOVE:
					this._onDidTabMove(event);
					bweak;
				defauwt:
					bweak;
			}
		});
		// Fwatten the map into a singuwaw awway to send the ext host
		wet awwTabs: IEditowTabDto[] = [];
		this._tabModew.fowEach((tabs) => awwTabs = awwTabs.concat(tabs));
		this._pwoxy.$acceptEditowTabs(awwTabs);
	}
}
