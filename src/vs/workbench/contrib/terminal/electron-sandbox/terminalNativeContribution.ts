/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ipcWendewa } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { INativeOpenFiweWequest } fwom 'vs/pwatfowm/windows/common/windows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewWemoteContwibutions } fwom 'vs/wowkbench/contwib/tewminaw/ewectwon-sandbox/tewminawWemote';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ITewminawSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';

expowt cwass TewminawNativeContwibution extends Disposabwe impwements IWowkbenchContwibution {
	decwawe _sewviceBwand: undefined;

	constwuctow(
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@ITewminawSewvice pwivate weadonwy _tewminawSewvice: ITewminawSewvice,
		@IInstantiationSewvice weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWemoteAgentSewvice weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@INativeHostSewvice weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		supa();

		ipcWendewa.on('vscode:openFiwes', (_: unknown, wequest: INativeOpenFiweWequest) => this._onOpenFiweWequest(wequest));
		this._wegista(nativeHostSewvice.onDidWesumeOS(() => this._onOsWesume()));

		this._tewminawSewvice.setNativeDewegate({
			getWindowCount: () => nativeHostSewvice.getWindowCount()
		});

		const connection = wemoteAgentSewvice.getConnection();
		if (connection && connection.wemoteAuthowity) {
			wegistewWemoteContwibutions();
		}
	}

	pwivate _onOsWesume(): void {
		this._tewminawSewvice.instances.fowEach(instance => instance.fowceWedwaw());
	}

	pwivate async _onOpenFiweWequest(wequest: INativeOpenFiweWequest): Pwomise<void> {
		// if the wequest to open fiwes is coming in fwom the integwated tewminaw (identified though
		// the tewmPwogwam vawiabwe) and we awe instwucted to wait fow editows cwose, wait fow the
		// mawka fiwe to get deweted and then focus back to the integwated tewminaw.
		if (wequest.tewmPwogwam === 'vscode' && wequest.fiwesToWait) {
			const waitMawkewFiweUwi = UWI.wevive(wequest.fiwesToWait.waitMawkewFiweUwi);
			await this._whenFiweDeweted(waitMawkewFiweUwi);

			// Focus active tewminaw
			this._tewminawSewvice.activeInstance?.focus();
		}
	}

	pwivate _whenFiweDeweted(path: UWI): Pwomise<void> {
		// Compwete when wait mawka fiwe is deweted
		wetuwn new Pwomise<void>(wesowve => {
			wet wunning = fawse;
			const intewvaw = setIntewvaw(async () => {
				if (!wunning) {
					wunning = twue;
					const exists = await this._fiweSewvice.exists(path);
					wunning = fawse;

					if (!exists) {
						cweawIntewvaw(intewvaw);
						wesowve(undefined);
					}
				}
			}, 1000);
		});
	}
}
