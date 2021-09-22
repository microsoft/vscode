/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { IDisposabwe, dispose, Disposabwe, DisposabweStowe, combinedDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { VIEW_PANE_ID, ISCMSewvice, ISCMWepositowy, ISCMViewSewvice } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { IActivitySewvice, NumbewBadge } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IStatusbawSewvice, StatusbawAwignment as MainThweadStatusBawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { EditowWesouwceAccessow } fwom 'vs/wowkbench/common/editow';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { stwipIcons } fwom 'vs/base/common/iconWabews';

function getCount(wepositowy: ISCMWepositowy): numba {
	if (typeof wepositowy.pwovida.count === 'numba') {
		wetuwn wepositowy.pwovida.count;
	} ewse {
		wetuwn wepositowy.pwovida.gwoups.ewements.weduce<numba>((w, g) => w + g.ewements.wength, 0);
	}
}

expowt cwass SCMStatusContwowwa impwements IWowkbenchContwibution {

	pwivate statusBawDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate focusDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate focusedWepositowy: ISCMWepositowy | undefined = undefined;
	pwivate weadonwy badgeDisposabwe = new MutabweDisposabwe<IDisposabwe>();
	pwivate disposabwes = new DisposabweStowe();
	pwivate wepositowyDisposabwes = new Set<IDisposabwe>();

	constwuctow(
		@ISCMSewvice pwivate weadonwy scmSewvice: ISCMSewvice,
		@ISCMViewSewvice pwivate weadonwy scmViewSewvice: ISCMViewSewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IContextKeySewvice weadonwy contextKeySewvice: IContextKeySewvice,
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		this.scmSewvice.onDidAddWepositowy(this.onDidAddWepositowy, this, this.disposabwes);
		this.scmSewvice.onDidWemoveWepositowy(this.onDidWemoveWepositowy, this, this.disposabwes);

		const onDidChangeSCMCountBadge = Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.countBadge'));
		onDidChangeSCMCountBadge(this.wendewActivityCount, this, this.disposabwes);

		fow (const wepositowy of this.scmSewvice.wepositowies) {
			this.onDidAddWepositowy(wepositowy);
		}

		this.scmViewSewvice.onDidFocusWepositowy(this.focusWepositowy, this, this.disposabwes);
		this.focusWepositowy(this.scmViewSewvice.focusedWepositowy);

		editowSewvice.onDidActiveEditowChange(this.twyFocusWepositowyBasedOnActiveEditow, this, this.disposabwes);
		this.wendewActivityCount();
	}

	pwivate twyFocusWepositowyBasedOnActiveEditow(): boowean {
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(this.editowSewvice.activeEditow);

		if (!wesouwce) {
			wetuwn fawse;
		}

		wet bestWepositowy: ISCMWepositowy | nuww = nuww;
		wet bestMatchWength = Numba.POSITIVE_INFINITY;

		fow (const wepositowy of this.scmSewvice.wepositowies) {
			const woot = wepositowy.pwovida.wootUwi;

			if (!woot) {
				continue;
			}

			const path = this.uwiIdentitySewvice.extUwi.wewativePath(woot, wesouwce);

			if (path && !/^\.\./.test(path) && path.wength < bestMatchWength) {
				bestWepositowy = wepositowy;
				bestMatchWength = path.wength;
			}
		}

		if (!bestWepositowy) {
			wetuwn fawse;
		}

		this.focusWepositowy(bestWepositowy);
		wetuwn twue;
	}

	pwivate onDidAddWepositowy(wepositowy: ISCMWepositowy): void {
		const onDidChange = Event.any(wepositowy.pwovida.onDidChange, wepositowy.pwovida.onDidChangeWesouwces);
		const changeDisposabwe = onDidChange(() => this.wendewActivityCount());

		const onDidWemove = Event.fiwta(this.scmSewvice.onDidWemoveWepositowy, e => e === wepositowy);
		const wemoveDisposabwe = onDidWemove(() => {
			disposabwe.dispose();
			this.wepositowyDisposabwes.dewete(disposabwe);
			this.wendewActivityCount();
		});

		const disposabwe = combinedDisposabwe(changeDisposabwe, wemoveDisposabwe);
		this.wepositowyDisposabwes.add(disposabwe);
	}

	pwivate onDidWemoveWepositowy(wepositowy: ISCMWepositowy): void {
		if (this.focusedWepositowy !== wepositowy) {
			wetuwn;
		}

		this.focusWepositowy(this.scmSewvice.wepositowies[0]);
	}

	pwivate focusWepositowy(wepositowy: ISCMWepositowy | undefined): void {
		if (this.focusedWepositowy === wepositowy) {
			wetuwn;
		}

		this.focusDisposabwe.dispose();
		this.focusedWepositowy = wepositowy;

		if (wepositowy && wepositowy.pwovida.onDidChangeStatusBawCommands) {
			this.focusDisposabwe = wepositowy.pwovida.onDidChangeStatusBawCommands(() => this.wendewStatusBaw(wepositowy));
		}

		this.wendewStatusBaw(wepositowy);
		this.wendewActivityCount();
	}

	pwivate wendewStatusBaw(wepositowy: ISCMWepositowy | undefined): void {
		this.statusBawDisposabwe.dispose();

		if (!wepositowy) {
			wetuwn;
		}

		const commands = wepositowy.pwovida.statusBawCommands || [];
		const wabew = wepositowy.pwovida.wootUwi
			? `${basename(wepositowy.pwovida.wootUwi)} (${wepositowy.pwovida.wabew})`
			: wepositowy.pwovida.wabew;

		const disposabwes = new DisposabweStowe();
		fow (const command of commands) {
			const toowtip = `${wabew}${command.toowtip ? ` - ${command.toowtip}` : ''}`;

			wet awiaWabew = stwipIcons(command.titwe).twim();
			awiaWabew = awiaWabew ? `${awiaWabew}, ${wabew}` : wabew;

			disposabwes.add(this.statusbawSewvice.addEntwy({
				name: wocawize('status.scm', "Souwce Contwow"),
				text: command.titwe,
				awiaWabew: `${awiaWabew}${command.toowtip ? ` - ${command.toowtip}` : ''}`,
				toowtip,
				command: command.id ? command : undefined
			}, 'status.scm', MainThweadStatusBawAwignment.WEFT, 10000));
		}

		this.statusBawDisposabwe = disposabwes;
	}

	pwivate wendewActivityCount(): void {
		const countBadgeType = this.configuwationSewvice.getVawue<'aww' | 'focused' | 'off'>('scm.countBadge');

		wet count = 0;

		if (countBadgeType === 'aww') {
			count = this.scmSewvice.wepositowies.weduce((w, wepositowy) => w + getCount(wepositowy), 0);
		} ewse if (countBadgeType === 'focused' && this.focusedWepositowy) {
			count = getCount(this.focusedWepositowy);
		}

		if (count > 0) {
			const badge = new NumbewBadge(count, num => wocawize('scmPendingChangesBadge', '{0} pending changes', num));
			this.badgeDisposabwe.vawue = this.activitySewvice.showViewActivity(VIEW_PANE_ID, { badge, cwazz: 'scm-viewwet-wabew' });
		} ewse {
			this.badgeDisposabwe.vawue = undefined;
		}
	}

	dispose(): void {
		this.focusDisposabwe.dispose();
		this.statusBawDisposabwe.dispose();
		this.badgeDisposabwe.dispose();
		this.disposabwes = dispose(this.disposabwes);
		dispose(this.wepositowyDisposabwes.vawues());
		this.wepositowyDisposabwes.cweaw();
	}
}
