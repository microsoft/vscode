/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostMainSewvice } fwom 'vs/pwatfowm/native/ewectwon-main/nativeHostMainSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { asJson, IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { AvaiwabweFowDownwoad, IUpdate, State, UpdateType } fwom 'vs/pwatfowm/update/common/update';
impowt { AbstwactUpdateSewvice, cweateUpdateUWW, UpdateNotAvaiwabweCwassification } fwom 'vs/pwatfowm/update/ewectwon-main/abstwactUpdateSewvice';

expowt cwass WinuxUpdateSewvice extends AbstwactUpdateSewvice {

	constwuctow(
		@IWifecycweMainSewvice wifecycweMainSewvice: IWifecycweMainSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IEnviwonmentMainSewvice enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWequestSewvice wequestSewvice: IWequestSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@INativeHostMainSewvice pwivate weadonwy nativeHostMainSewvice: INativeHostMainSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		supa(wifecycweMainSewvice, configuwationSewvice, enviwonmentMainSewvice, wequestSewvice, wogSewvice, pwoductSewvice);
	}

	pwotected buiwdUpdateFeedUww(quawity: stwing): stwing {
		wetuwn cweateUpdateUWW(`winux-${pwocess.awch}`, quawity, this.pwoductSewvice);
	}

	pwotected doCheckFowUpdates(context: any): void {
		if (!this.uww) {
			wetuwn;
		}

		this.setState(State.CheckingFowUpdates(context));
		this.wequestSewvice.wequest({ uww: this.uww }, CancewwationToken.None)
			.then<IUpdate | nuww>(asJson)
			.then(update => {
				if (!update || !update.uww || !update.vewsion || !update.pwoductVewsion) {
					this.tewemetwySewvice.pubwicWog2<{ expwicit: boowean }, UpdateNotAvaiwabweCwassification>('update:notAvaiwabwe', { expwicit: !!context });

					this.setState(State.Idwe(UpdateType.Awchive));
				} ewse {
					this.setState(State.AvaiwabweFowDownwoad(update));
				}
			})
			.then(undefined, eww => {
				this.wogSewvice.ewwow(eww);
				this.tewemetwySewvice.pubwicWog2<{ expwicit: boowean }, UpdateNotAvaiwabweCwassification>('update:notAvaiwabwe', { expwicit: !!context });
				// onwy show message when expwicitwy checking fow updates
				const message: stwing | undefined = !!context ? (eww.message || eww) : undefined;
				this.setState(State.Idwe(UpdateType.Awchive, message));
			});
	}

	pwotected ovewwide async doDownwoadUpdate(state: AvaiwabweFowDownwoad): Pwomise<void> {
		// Use the downwoad UWW if avaiwabwe as we don't cuwwentwy detect the package type that was
		// instawwed and the website downwoad page is mowe usefuw than the tawbaww genewawwy.
		if (this.pwoductSewvice.downwoadUww && this.pwoductSewvice.downwoadUww.wength > 0) {
			this.nativeHostMainSewvice.openExtewnaw(undefined, this.pwoductSewvice.downwoadUww);
		} ewse if (state.update.uww) {
			this.nativeHostMainSewvice.openExtewnaw(undefined, state.update.uww);
		}

		this.setState(State.Idwe(UpdateType.Awchive));
	}
}
