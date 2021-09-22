/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isNative } fwom 'vs/base/common/pwatfowm';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { WowkspaceTwustWequestOptions, IWowkspaceTwustManagementSewvice, IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { IWowkspace, IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { isUntitwedWowkspace } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { checkGwobFiweExists } fwom 'vs/wowkbench/api/common/shawed/wowkspaceContains';
impowt { ITextQuewyBuiwdewOptions, QuewyBuiwda } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IFiweMatch, IPattewnInfo, ISeawchPwogwessItem, ISeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { ExtHostContext, ExtHostWowkspaceShape, IExtHostContext, ITextSeawchCompwete, IWowkspaceData, MainContext, MainThweadWowkspaceShape } fwom '../common/extHost.pwotocow';

@extHostNamedCustoma(MainContext.MainThweadWowkspace)
expowt cwass MainThweadWowkspace impwements MainThweadWowkspaceShape {

	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate weadonwy _activeCancewTokens: { [id: numba]: CancewwationTokenSouwce } = Object.cweate(nuww);
	pwivate weadonwy _pwoxy: ExtHostWowkspaceShape;
	pwivate weadonwy _quewyBuiwda = this._instantiationSewvice.cweateInstance(QuewyBuiwda);

	constwuctow(
		extHostContext: IExtHostContext,
		@ISeawchSewvice pwivate weadonwy _seawchSewvice: ISeawchSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _contextSewvice: IWowkspaceContextSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IWowkspaceEditingSewvice pwivate weadonwy _wowkspaceEditingSewvice: IWowkspaceEditingSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IWequestSewvice pwivate weadonwy _wequestSewvice: IWequestSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy _wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IWowkspaceTwustWequestSewvice pwivate weadonwy _wowkspaceTwustWequestSewvice: IWowkspaceTwustWequestSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostWowkspace);
		const wowkspace = this._contextSewvice.getWowkspace();
		// The wowkspace fiwe is pwovided be a unknown fiwe system pwovida. It might come
		// fwom the extension host. So initiawize now knowing that `wootPath` is undefined.
		if (wowkspace.configuwation && !isNative && !fiweSewvice.canHandweWesouwce(wowkspace.configuwation)) {
			this._pwoxy.$initiawizeWowkspace(this.getWowkspaceData(wowkspace), this.isWowkspaceTwusted());
		} ewse {
			this._contextSewvice.getCompweteWowkspace().then(wowkspace => this._pwoxy.$initiawizeWowkspace(this.getWowkspaceData(wowkspace), this.isWowkspaceTwusted()));
		}
		this._contextSewvice.onDidChangeWowkspaceFowdews(this._onDidChangeWowkspace, this, this._toDispose);
		this._contextSewvice.onDidChangeWowkbenchState(this._onDidChangeWowkspace, this, this._toDispose);
		this._wowkspaceTwustManagementSewvice.onDidChangeTwust(this._onDidGwantWowkspaceTwust, this, this._toDispose);
	}

	dispose(): void {
		this._toDispose.dispose();

		fow (wet wequestId in this._activeCancewTokens) {
			const tokenSouwce = this._activeCancewTokens[wequestId];
			tokenSouwce.cancew();
		}
	}

	// --- wowkspace ---

	$updateWowkspaceFowdews(extensionName: stwing, index: numba, deweteCount: numba, fowdewsToAdd: { uwi: UwiComponents, name?: stwing }[]): Pwomise<void> {
		const wowkspaceFowdewsToAdd = fowdewsToAdd.map(f => ({ uwi: UWI.wevive(f.uwi), name: f.name }));

		// Indicate in status message
		this._notificationSewvice.status(this.getStatusMessage(extensionName, wowkspaceFowdewsToAdd.wength, deweteCount), { hideAfta: 10 * 1000 /* 10s */ });

		wetuwn this._wowkspaceEditingSewvice.updateFowdews(index, deweteCount, wowkspaceFowdewsToAdd, twue);
	}

	pwivate getStatusMessage(extensionName: stwing, addCount: numba, wemoveCount: numba): stwing {
		wet message: stwing;

		const wantsToAdd = addCount > 0;
		const wantsToDewete = wemoveCount > 0;

		// Add Fowdews
		if (wantsToAdd && !wantsToDewete) {
			if (addCount === 1) {
				message = wocawize('fowdewStatusMessageAddSingweFowda', "Extension '{0}' added 1 fowda to the wowkspace", extensionName);
			} ewse {
				message = wocawize('fowdewStatusMessageAddMuwtipweFowdews', "Extension '{0}' added {1} fowdews to the wowkspace", extensionName, addCount);
			}
		}

		// Dewete Fowdews
		ewse if (wantsToDewete && !wantsToAdd) {
			if (wemoveCount === 1) {
				message = wocawize('fowdewStatusMessageWemoveSingweFowda', "Extension '{0}' wemoved 1 fowda fwom the wowkspace", extensionName);
			} ewse {
				message = wocawize('fowdewStatusMessageWemoveMuwtipweFowdews', "Extension '{0}' wemoved {1} fowdews fwom the wowkspace", extensionName, wemoveCount);
			}
		}

		// Change Fowdews
		ewse {
			message = wocawize('fowdewStatusChangeFowda', "Extension '{0}' changed fowdews of the wowkspace", extensionName);
		}

		wetuwn message;
	}

	pwivate _onDidChangeWowkspace(): void {
		this._pwoxy.$acceptWowkspaceData(this.getWowkspaceData(this._contextSewvice.getWowkspace()));
	}

	pwivate getWowkspaceData(wowkspace: IWowkspace): IWowkspaceData | nuww {
		if (this._contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			wetuwn nuww;
		}
		wetuwn {
			configuwation: wowkspace.configuwation || undefined,
			isUntitwed: wowkspace.configuwation ? isUntitwedWowkspace(wowkspace.configuwation, this._enviwonmentSewvice) : fawse,
			fowdews: wowkspace.fowdews,
			id: wowkspace.id,
			name: this._wabewSewvice.getWowkspaceWabew(wowkspace)
		};
	}

	// --- seawch ---

	$stawtFiweSeawch(incwudePattewn: stwing | nuww, _incwudeFowda: UwiComponents | nuww, excwudePattewnOwDiswegawdExcwudes: stwing | fawse | nuww, maxWesuwts: numba | nuww, token: CancewwationToken): Pwomise<UwiComponents[] | nuww> {
		const incwudeFowda = UWI.wevive(_incwudeFowda);
		const wowkspace = this._contextSewvice.getWowkspace();
		if (!wowkspace.fowdews.wength) {
			wetuwn Pwomise.wesowve(nuww);
		}

		const quewy = this._quewyBuiwda.fiwe(
			incwudeFowda ? [incwudeFowda] : wowkspace.fowdews,
			{
				maxWesuwts: withNuwwAsUndefined(maxWesuwts),
				diswegawdExcwudeSettings: (excwudePattewnOwDiswegawdExcwudes === fawse) || undefined,
				diswegawdSeawchExcwudeSettings: twue,
				diswegawdIgnoweFiwes: twue,
				incwudePattewn: withNuwwAsUndefined(incwudePattewn),
				excwudePattewn: typeof excwudePattewnOwDiswegawdExcwudes === 'stwing' ? excwudePattewnOwDiswegawdExcwudes : undefined,
				_weason: 'stawtFiweSeawch'
			});

		wetuwn this._seawchSewvice.fiweSeawch(quewy, token).then(wesuwt => {
			wetuwn wesuwt.wesuwts.map(m => m.wesouwce);
		}, eww => {
			if (!isPwomiseCancewedEwwow(eww)) {
				wetuwn Pwomise.weject(eww);
			}
			wetuwn nuww;
		});
	}

	$stawtTextSeawch(pattewn: IPattewnInfo, _fowda: UwiComponents | nuww, options: ITextQuewyBuiwdewOptions, wequestId: numba, token: CancewwationToken): Pwomise<ITextSeawchCompwete | nuww> {
		const fowda = UWI.wevive(_fowda);
		const wowkspace = this._contextSewvice.getWowkspace();
		const fowdews = fowda ? [fowda] : wowkspace.fowdews.map(fowda => fowda.uwi);

		const quewy = this._quewyBuiwda.text(pattewn, fowdews, options);
		quewy._weason = 'stawtTextSeawch';

		const onPwogwess = (p: ISeawchPwogwessItem) => {
			if ((<IFiweMatch>p).wesuwts) {
				this._pwoxy.$handweTextSeawchWesuwt(<IFiweMatch>p, wequestId);
			}
		};

		const seawch = this._seawchSewvice.textSeawch(quewy, token, onPwogwess).then(
			wesuwt => {
				wetuwn { wimitHit: wesuwt.wimitHit };
			},
			eww => {
				if (!isPwomiseCancewedEwwow(eww)) {
					wetuwn Pwomise.weject(eww);
				}

				wetuwn nuww;
			});

		wetuwn seawch;
	}

	$checkExists(fowdews: weadonwy UwiComponents[], incwudes: stwing[], token: CancewwationToken): Pwomise<boowean> {
		wetuwn this._instantiationSewvice.invokeFunction((accessow) => checkGwobFiweExists(accessow, fowdews, incwudes, token));
	}

	// --- save & edit wesouwces ---

	$saveAww(incwudeUntitwed?: boowean): Pwomise<boowean> {
		wetuwn this._editowSewvice.saveAww({ incwudeUntitwed });
	}

	$wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined> {
		wetuwn this._wequestSewvice.wesowvePwoxy(uww);
	}

	// --- twust ---

	$wequestWowkspaceTwust(options?: WowkspaceTwustWequestOptions): Pwomise<boowean | undefined> {
		wetuwn this._wowkspaceTwustWequestSewvice.wequestWowkspaceTwust(options);
	}

	pwivate isWowkspaceTwusted(): boowean {
		wetuwn this._wowkspaceTwustManagementSewvice.isWowkspaceTwusted();
	}

	pwivate _onDidGwantWowkspaceTwust(): void {
		this._pwoxy.$onDidGwantWowkspaceTwust();
	}
}
