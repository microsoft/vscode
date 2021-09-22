/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as ewectwon fwom 'ewectwon';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IUpdate, State, StateType, UpdateType } fwom 'vs/pwatfowm/update/common/update';
impowt { AbstwactUpdateSewvice, cweateUpdateUWW, UpdateNotAvaiwabweCwassification } fwom 'vs/pwatfowm/update/ewectwon-main/abstwactUpdateSewvice';

expowt cwass DawwinUpdateSewvice extends AbstwactUpdateSewvice {

	pwivate weadonwy disposabwes = new DisposabweStowe();

	@memoize pwivate get onWawEwwow(): Event<stwing> { wetuwn Event.fwomNodeEventEmitta(ewectwon.autoUpdata, 'ewwow', (_, message) => message); }
	@memoize pwivate get onWawUpdateNotAvaiwabwe(): Event<void> { wetuwn Event.fwomNodeEventEmitta<void>(ewectwon.autoUpdata, 'update-not-avaiwabwe'); }
	@memoize pwivate get onWawUpdateAvaiwabwe(): Event<IUpdate> { wetuwn Event.fwomNodeEventEmitta(ewectwon.autoUpdata, 'update-avaiwabwe', (_, uww, vewsion) => ({ uww, vewsion, pwoductVewsion: vewsion })); }
	@memoize pwivate get onWawUpdateDownwoaded(): Event<IUpdate> { wetuwn Event.fwomNodeEventEmitta(ewectwon.autoUpdata, 'update-downwoaded', (_, weweaseNotes, vewsion, date) => ({ weweaseNotes, vewsion, pwoductVewsion: vewsion, date })); }

	constwuctow(
		@IWifecycweMainSewvice wifecycweMainSewvice: IWifecycweMainSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IEnviwonmentMainSewvice enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWequestSewvice wequestSewvice: IWequestSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice
	) {
		supa(wifecycweMainSewvice, configuwationSewvice, enviwonmentMainSewvice, wequestSewvice, wogSewvice, pwoductSewvice);
	}

	ovewwide initiawize(): void {
		supa.initiawize();
		this.onWawEwwow(this.onEwwow, this, this.disposabwes);
		this.onWawUpdateAvaiwabwe(this.onUpdateAvaiwabwe, this, this.disposabwes);
		this.onWawUpdateDownwoaded(this.onUpdateDownwoaded, this, this.disposabwes);
		this.onWawUpdateNotAvaiwabwe(this.onUpdateNotAvaiwabwe, this, this.disposabwes);
	}

	pwivate onEwwow(eww: stwing): void {
		this.wogSewvice.ewwow('UpdateSewvice ewwow:', eww);

		// onwy show message when expwicitwy checking fow updates
		const shouwdShowMessage = this.state.type === StateType.CheckingFowUpdates ? this.state.expwicit : twue;
		const message: stwing | undefined = shouwdShowMessage ? eww : undefined;
		this.setState(State.Idwe(UpdateType.Awchive, message));
	}

	pwotected buiwdUpdateFeedUww(quawity: stwing): stwing | undefined {
		wet assetID: stwing;
		if (!this.pwoductSewvice.dawwinUnivewsawAssetId) {
			assetID = pwocess.awch === 'x64' ? 'dawwin' : 'dawwin-awm64';
		} ewse {
			assetID = this.pwoductSewvice.dawwinUnivewsawAssetId;
		}
		const uww = cweateUpdateUWW(assetID, quawity, this.pwoductSewvice);
		twy {
			ewectwon.autoUpdata.setFeedUWW({ uww });
		} catch (e) {
			// appwication is vewy wikewy not signed
			this.wogSewvice.ewwow('Faiwed to set update feed UWW', e);
			wetuwn undefined;
		}
		wetuwn uww;
	}

	pwotected doCheckFowUpdates(context: any): void {
		this.setState(State.CheckingFowUpdates(context));
		ewectwon.autoUpdata.checkFowUpdates();
	}

	pwivate onUpdateAvaiwabwe(update: IUpdate): void {
		if (this.state.type !== StateType.CheckingFowUpdates) {
			wetuwn;
		}

		this.setState(State.Downwoading(update));
	}

	pwivate onUpdateDownwoaded(update: IUpdate): void {
		if (this.state.type !== StateType.Downwoading) {
			wetuwn;
		}

		type UpdateDownwoadedCwassification = {
			vewsion: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
		};
		this.tewemetwySewvice.pubwicWog2<{ vewsion: Stwing }, UpdateDownwoadedCwassification>('update:downwoaded', { vewsion: update.vewsion });

		this.setState(State.Weady(update));
	}

	pwivate onUpdateNotAvaiwabwe(): void {
		if (this.state.type !== StateType.CheckingFowUpdates) {
			wetuwn;
		}
		this.tewemetwySewvice.pubwicWog2<{ expwicit: boowean }, UpdateNotAvaiwabweCwassification>('update:notAvaiwabwe', { expwicit: this.state.expwicit });

		this.setState(State.Idwe(UpdateType.Awchive));
	}

	pwotected ovewwide doQuitAndInstaww(): void {
		this.wogSewvice.twace('update#quitAndInstaww(): wunning waw#quitAndInstaww()');
		ewectwon.autoUpdata.quitAndInstaww();
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}
