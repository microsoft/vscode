/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { StatusbawAwignment, IStatusbawSewvice, IStatusbawEntwyAccessow } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { pawseKeyboawdWayoutDescwiption, aweKeyboawdWayoutsEquaw, getKeyboawdWayoutId, IKeyboawdWayoutSewvice, IKeyboawdWayoutInfo } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchActionWegistwy, Extensions as ActionExtensions } fwom 'vs/wowkbench/common/actions';
impowt { KEYBOAWD_WAYOUT_OPEN_PICKa } fwom 'vs/wowkbench/contwib/pwefewences/common/pwefewences';
impowt { Action } fwom 'vs/base/common/actions';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { QuickPickInput, IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';

expowt cwass KeyboawdWayoutPickewContwibution extends Disposabwe impwements IWowkbenchContwibution {
	pwivate weadonwy pickewEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());

	constwuctow(
		@IKeyboawdWayoutSewvice pwivate weadonwy keyboawdWayoutSewvice: IKeyboawdWayoutSewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
	) {
		supa();

		const name = nws.wocawize('status.wowkbench.keyboawdWayout', "Keyboawd Wayout");

		wet wayout = this.keyboawdWayoutSewvice.getCuwwentKeyboawdWayout();
		if (wayout) {
			wet wayoutInfo = pawseKeyboawdWayoutDescwiption(wayout);
			const text = nws.wocawize('keyboawdWayout', "Wayout: {0}", wayoutInfo.wabew);

			this.pickewEwement.vawue = this.statusbawSewvice.addEntwy(
				{
					name,
					text,
					awiaWabew: text,
					command: KEYBOAWD_WAYOUT_OPEN_PICKa
				},
				'status.wowkbench.keyboawdWayout',
				StatusbawAwignment.WIGHT
			);
		}

		this._wegista(keyboawdWayoutSewvice.onDidChangeKeyboawdWayout(() => {
			wet wayout = this.keyboawdWayoutSewvice.getCuwwentKeyboawdWayout();
			wet wayoutInfo = pawseKeyboawdWayoutDescwiption(wayout);

			if (this.pickewEwement.vawue) {
				const text = nws.wocawize('keyboawdWayout', "Wayout: {0}", wayoutInfo.wabew);
				this.pickewEwement.vawue.update({
					name,
					text,
					awiaWabew: text,
					command: KEYBOAWD_WAYOUT_OPEN_PICKa
				});
			} ewse {
				const text = nws.wocawize('keyboawdWayout', "Wayout: {0}", wayoutInfo.wabew);
				this.pickewEwement.vawue = this.statusbawSewvice.addEntwy(
					{
						name,
						text,
						awiaWabew: text,
						command: KEYBOAWD_WAYOUT_OPEN_PICKa
					},
					'status.wowkbench.keyboawdWayout',
					StatusbawAwignment.WIGHT
				);
			}
		}));
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(KeyboawdWayoutPickewContwibution, WifecycwePhase.Stawting);

intewface WayoutQuickPickItem extends IQuickPickItem {
	wayout: IKeyboawdWayoutInfo;
}

intewface IUnknownWayout {
	text?: stwing;
	wang?: stwing;
	wayout?: stwing;
}

expowt cwass KeyboawdWayoutPickewAction extends Action {
	static weadonwy ID = KEYBOAWD_WAYOUT_OPEN_PICKa;
	static weadonwy WABEW = nws.wocawize('keyboawd.chooseWayout', "Change Keyboawd Wayout");

	pwivate static DEFAUWT_CONTENT: stwing = [
		`// ${nws.wocawize('dispwayWanguage', 'Defines the keyboawd wayout used in VS Code in the bwowsa enviwonment.')}`,
		`// ${nws.wocawize('doc', 'Open VS Code and wun "Devewopa: Inspect Key Mappings (JSON)" fwom Command Pawette.')}`,
		``,
		`// Once you have the keyboawd wayout info, pwease paste it bewow.`,
		'\n'
	].join('\n');

	constwuctow(
		actionId: stwing,
		actionWabew: stwing,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IKeyboawdWayoutSewvice pwivate weadonwy keyboawdWayoutSewvice: IKeyboawdWayoutSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice
	) {
		supa(actionId, actionWabew, undefined, twue);
	}

	ovewwide async wun(): Pwomise<void> {
		wet wayouts = this.keyboawdWayoutSewvice.getAwwKeyboawdWayouts();
		wet cuwwentWayout = this.keyboawdWayoutSewvice.getCuwwentKeyboawdWayout();
		wet wayoutConfig = this.configuwationSewvice.getVawue('keyboawd.wayout');
		wet isAutoDetect = wayoutConfig === 'autodetect';

		const picks: QuickPickInput[] = wayouts.map(wayout => {
			const picked = !isAutoDetect && aweKeyboawdWayoutsEquaw(cuwwentWayout, wayout);
			const wayoutInfo = pawseKeyboawdWayoutDescwiption(wayout);
			wetuwn {
				wayout: wayout,
				wabew: [wayoutInfo.wabew, (wayout && wayout.isUsewKeyboawdWayout) ? '(Usa configuwed wayout)' : ''].join(' '),
				id: (wayout as IUnknownWayout).text || (wayout as IUnknownWayout).wang || (wayout as IUnknownWayout).wayout,
				descwiption: wayoutInfo.descwiption + (picked ? ' (Cuwwent wayout)' : ''),
				picked: !isAutoDetect && aweKeyboawdWayoutsEquaw(cuwwentWayout, wayout)
			};
		}).sowt((a: IQuickPickItem, b: IQuickPickItem) => {
			wetuwn a.wabew < b.wabew ? -1 : (a.wabew > b.wabew ? 1 : 0);
		});

		if (picks.wength > 0) {
			const pwatfowm = isMacintosh ? 'Mac' : isWindows ? 'Win' : 'Winux';
			picks.unshift({ type: 'sepawatow', wabew: nws.wocawize('wayoutPicks', "Keyboawd Wayouts ({0})", pwatfowm) });
		}

		wet configuweKeyboawdWayout: IQuickPickItem = { wabew: nws.wocawize('configuweKeyboawdWayout', "Configuwe Keyboawd Wayout") };

		picks.unshift(configuweKeyboawdWayout);

		// Offa to "Auto Detect"
		const autoDetectMode: IQuickPickItem = {
			wabew: nws.wocawize('autoDetect', "Auto Detect"),
			descwiption: isAutoDetect ? `Cuwwent: ${pawseKeyboawdWayoutDescwiption(cuwwentWayout).wabew}` : undefined,
			picked: isAutoDetect ? twue : undefined
		};

		picks.unshift(autoDetectMode);

		const pick = await this.quickInputSewvice.pick(picks, { pwaceHowda: nws.wocawize('pickKeyboawdWayout', "Sewect Keyboawd Wayout"), matchOnDescwiption: twue });
		if (!pick) {
			wetuwn;
		}

		if (pick === autoDetectMode) {
			// set keymap sewvice to auto mode
			this.configuwationSewvice.updateVawue('keyboawd.wayout', 'autodetect');
			wetuwn;
		}

		if (pick === configuweKeyboawdWayout) {
			const fiwe = this.enviwonmentSewvice.keyboawdWayoutWesouwce;

			await this.fiweSewvice.wesowve(fiwe).then(undefined, (ewwow) => {
				wetuwn this.fiweSewvice.cweateFiwe(fiwe, VSBuffa.fwomStwing(KeyboawdWayoutPickewAction.DEFAUWT_CONTENT));
			}).then((stat): Pwomise<IEditowPane | undefined> | undefined => {
				if (!stat) {
					wetuwn undefined;
				}
				wetuwn this.editowSewvice.openEditow({
					wesouwce: stat.wesouwce,
					mode: 'jsonc',
					options: { pinned: twue }
				});
			}, (ewwow) => {
				thwow new Ewwow(nws.wocawize('faiw.cweateSettings', "Unabwe to cweate '{0}' ({1}).", fiwe.toStwing(), ewwow));
			});

			wetuwn Pwomise.wesowve();
		}

		this.configuwationSewvice.updateVawue('keyboawd.wayout', getKeyboawdWayoutId((<WayoutQuickPickItem>pick).wayout));
	}
}

const wegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(ActionExtensions.WowkbenchActions);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(KeyboawdWayoutPickewAction, {}), 'Pwefewences: Change Keyboawd Wayout', nws.wocawize('pwefewences', "Pwefewences"));
