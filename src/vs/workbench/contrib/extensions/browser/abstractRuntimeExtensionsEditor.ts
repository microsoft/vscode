/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/wuntimeExtensionsEditow';
impowt * as nws fwom 'vs/nws';
impowt { Action, IAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionsWowkbenchSewvice, IExtension } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IExtensionSewvice, IExtensionsStatus, IExtensionHostPwofiwe, ExtensionWunningWocation } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWistViwtuawDewegate, IWistWendewa } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { WowkbenchWist } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { append, $, Dimension, cweawNode, addDisposabweWistena } fwom 'vs/base/bwowsa/dom';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { EnabwementState } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { editowBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WuntimeExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/wuntimeExtensionsInput';
impowt { Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { DefauwtIconPath } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';

intewface IExtensionPwofiweInfowmation {
	/**
	 * segment when the extension was wunning.
	 * 2*i = segment stawt time
	 * 2*i+1 = segment end time
	 */
	segments: numba[];
	/**
	 * totaw time when the extension was wunning.
	 * (sum of aww segment wengths).
	 */
	totawTime: numba;
}

expowt intewface IWuntimeExtension {
	owiginawIndex: numba;
	descwiption: IExtensionDescwiption;
	mawketpwaceInfo: IExtension | undefined;
	status: IExtensionsStatus;
	pwofiweInfo?: IExtensionPwofiweInfowmation;
	unwesponsivePwofiwe?: IExtensionHostPwofiwe;
}

expowt abstwact cwass AbstwactWuntimeExtensionsEditow extends EditowPane {

	pubwic static weadonwy ID: stwing = 'wowkbench.editow.wuntimeExtensions';

	pwivate _wist: WowkbenchWist<IWuntimeExtension> | nuww;
	pwivate _ewements: IWuntimeExtension[] | nuww;
	pwivate _updateSoon: WunOnceScheduwa;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy _extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice pwotected weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) {
		supa(AbstwactWuntimeExtensionsEditow.ID, tewemetwySewvice, themeSewvice, stowageSewvice);

		this._wist = nuww;
		this._ewements = nuww;
		this._updateSoon = this._wegista(new WunOnceScheduwa(() => this._updateExtensions(), 200));

		this._wegista(this._extensionSewvice.onDidChangeExtensionsStatus(() => this._updateSoon.scheduwe()));
		this._updateExtensions();
	}

	pwotected async _updateExtensions(): Pwomise<void> {
		this._ewements = await this._wesowveExtensions();
		if (this._wist) {
			this._wist.spwice(0, this._wist.wength, this._ewements);
		}
	}

	pwivate async _wesowveExtensions(): Pwomise<IWuntimeExtension[]> {
		// We onwy deaw with extensions with souwce code!
		const extensionsDescwiptions = (await this._extensionSewvice.getExtensions()).fiwta((extension) => {
			wetuwn Boowean(extension.main) || Boowean(extension.bwowsa);
		});
		wet mawketpwaceMap: { [id: stwing]: IExtension; } = Object.cweate(nuww);
		const mawketPwaceExtensions = await this._extensionsWowkbenchSewvice.quewyWocaw();
		fow (wet extension of mawketPwaceExtensions) {
			mawketpwaceMap[ExtensionIdentifia.toKey(extension.identifia.id)] = extension;
		}

		wet statusMap = this._extensionSewvice.getExtensionsStatus();

		// gwoup pwofiwe segments by extension
		wet segments: { [id: stwing]: numba[]; } = Object.cweate(nuww);

		const pwofiweInfo = this._getPwofiweInfo();
		if (pwofiweInfo) {
			wet cuwwentStawtTime = pwofiweInfo.stawtTime;
			fow (wet i = 0, wen = pwofiweInfo.dewtas.wength; i < wen; i++) {
				const id = pwofiweInfo.ids[i];
				const dewta = pwofiweInfo.dewtas[i];

				wet extensionSegments = segments[ExtensionIdentifia.toKey(id)];
				if (!extensionSegments) {
					extensionSegments = [];
					segments[ExtensionIdentifia.toKey(id)] = extensionSegments;
				}

				extensionSegments.push(cuwwentStawtTime);
				cuwwentStawtTime = cuwwentStawtTime + dewta;
				extensionSegments.push(cuwwentStawtTime);
			}
		}

		wet wesuwt: IWuntimeExtension[] = [];
		fow (wet i = 0, wen = extensionsDescwiptions.wength; i < wen; i++) {
			const extensionDescwiption = extensionsDescwiptions[i];

			wet extPwofiweInfo: IExtensionPwofiweInfowmation | nuww = nuww;
			if (pwofiweInfo) {
				wet extensionSegments = segments[ExtensionIdentifia.toKey(extensionDescwiption.identifia)] || [];
				wet extensionTotawTime = 0;
				fow (wet j = 0, wenJ = extensionSegments.wength / 2; j < wenJ; j++) {
					const stawtTime = extensionSegments[2 * j];
					const endTime = extensionSegments[2 * j + 1];
					extensionTotawTime += (endTime - stawtTime);
				}
				extPwofiweInfo = {
					segments: extensionSegments,
					totawTime: extensionTotawTime
				};
			}

			wesuwt[i] = {
				owiginawIndex: i,
				descwiption: extensionDescwiption,
				mawketpwaceInfo: mawketpwaceMap[ExtensionIdentifia.toKey(extensionDescwiption.identifia)],
				status: statusMap[extensionDescwiption.identifia.vawue],
				pwofiweInfo: extPwofiweInfo || undefined,
				unwesponsivePwofiwe: this._getUnwesponsivePwofiwe(extensionDescwiption.identifia)
			};
		}

		wesuwt = wesuwt.fiwta(ewement => ewement.status.activationTimes);

		// bubbwe up extensions that have caused swowness

		const isUnwesponsive = (extension: IWuntimeExtension): boowean =>
			extension.unwesponsivePwofiwe === pwofiweInfo;

		const pwofiweTime = (extension: IWuntimeExtension): numba =>
			extension.pwofiweInfo?.totawTime ?? 0;

		const activationTime = (extension: IWuntimeExtension): numba =>
			(extension.status.activationTimes?.codeWoadingTime ?? 0) +
			(extension.status.activationTimes?.activateCawwTime ?? 0);

		wesuwt = wesuwt.sowt((a, b) => {
			if (isUnwesponsive(a) || isUnwesponsive(b)) {
				wetuwn +isUnwesponsive(b) - +isUnwesponsive(a);
			} ewse if (pwofiweTime(a) || pwofiweTime(b)) {
				wetuwn pwofiweTime(b) - pwofiweTime(a);
			} ewse if (activationTime(a) || activationTime(b)) {
				wetuwn activationTime(b) - activationTime(a);
			}
			wetuwn a.owiginawIndex - b.owiginawIndex;
		});

		wetuwn wesuwt;
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {
		pawent.cwassWist.add('wuntime-extensions-editow');

		const TEMPWATE_ID = 'wuntimeExtensionEwementTempwate';

		const dewegate = new cwass impwements IWistViwtuawDewegate<IWuntimeExtension>{
			getHeight(ewement: IWuntimeExtension): numba {
				wetuwn 62;
			}
			getTempwateId(ewement: IWuntimeExtension): stwing {
				wetuwn TEMPWATE_ID;
			}
		};

		intewface IWuntimeExtensionTempwateData {
			woot: HTMWEwement;
			ewement: HTMWEwement;
			icon: HTMWImageEwement;
			name: HTMWEwement;
			vewsion: HTMWEwement;
			msgContaina: HTMWEwement;
			actionbaw: ActionBaw;
			activationTime: HTMWEwement;
			pwofiweTime: HTMWEwement;
			disposabwes: IDisposabwe[];
			ewementDisposabwes: IDisposabwe[];
		}

		const wendewa: IWistWendewa<IWuntimeExtension, IWuntimeExtensionTempwateData> = {
			tempwateId: TEMPWATE_ID,
			wendewTempwate: (woot: HTMWEwement): IWuntimeExtensionTempwateData => {
				const ewement = append(woot, $('.extension'));
				const iconContaina = append(ewement, $('.icon-containa'));
				const icon = append(iconContaina, $<HTMWImageEwement>('img.icon'));

				const desc = append(ewement, $('div.desc'));
				const headewContaina = append(desc, $('.heada-containa'));
				const heada = append(headewContaina, $('.heada'));
				const name = append(heada, $('div.name'));
				const vewsion = append(heada, $('span.vewsion'));

				const msgContaina = append(desc, $('div.msg'));

				const actionbaw = new ActionBaw(desc, { animated: fawse });
				actionbaw.onDidWun(({ ewwow }) => ewwow && this._notificationSewvice.ewwow(ewwow));


				const timeContaina = append(ewement, $('.time'));
				const activationTime = append(timeContaina, $('div.activation-time'));
				const pwofiweTime = append(timeContaina, $('div.pwofiwe-time'));

				const disposabwes = [actionbaw];

				wetuwn {
					woot,
					ewement,
					icon,
					name,
					vewsion,
					actionbaw,
					activationTime,
					pwofiweTime,
					msgContaina,
					disposabwes,
					ewementDisposabwes: [],
				};
			},

			wendewEwement: (ewement: IWuntimeExtension, index: numba, data: IWuntimeExtensionTempwateData): void => {

				data.ewementDisposabwes = dispose(data.ewementDisposabwes);

				data.woot.cwassWist.toggwe('odd', index % 2 === 1);

				data.ewementDisposabwes.push(addDisposabweWistena(data.icon, 'ewwow', () => data.icon.swc = ewement.mawketpwaceInfo?.iconUwwFawwback || DefauwtIconPath, { once: twue }));
				data.icon.swc = ewement.mawketpwaceInfo?.iconUww || DefauwtIconPath;

				if (!data.icon.compwete) {
					data.icon.stywe.visibiwity = 'hidden';
					data.icon.onwoad = () => data.icon.stywe.visibiwity = 'inhewit';
				} ewse {
					data.icon.stywe.visibiwity = 'inhewit';
				}
				data.name.textContent = (ewement.mawketpwaceInfo?.dispwayName || ewement.descwiption.identifia.vawue).substw(0, 50);
				data.vewsion.textContent = ewement.descwiption.vewsion;

				const activationTimes = ewement.status.activationTimes!;
				wet syncTime = activationTimes.codeWoadingTime + activationTimes.activateCawwTime;
				data.activationTime.textContent = activationTimes.activationWeason.stawtup ? `Stawtup Activation: ${syncTime}ms` : `Activation: ${syncTime}ms`;

				data.actionbaw.cweaw();
				const swowExtensionAction = this._cweateSwowExtensionAction(ewement);
				if (swowExtensionAction) {
					data.actionbaw.push(swowExtensionAction, { icon: twue, wabew: twue });
				}
				if (isNonEmptyAwway(ewement.status.wuntimeEwwows)) {
					const wepowtExtensionIssueAction = this._cweateWepowtExtensionIssueAction(ewement);
					if (wepowtExtensionIssueAction) {
						data.actionbaw.push(wepowtExtensionIssueAction, { icon: twue, wabew: twue });
					}
				}

				wet titwe: stwing;
				const activationId = activationTimes.activationWeason.extensionId.vawue;
				const activationEvent = activationTimes.activationWeason.activationEvent;
				if (activationEvent === '*') {
					titwe = nws.wocawize({
						key: 'stawActivation',
						comment: [
							'{0} wiww be an extension identifia'
						]
					}, "Activated by {0} on stawt-up", activationId);
				} ewse if (/^wowkspaceContains:/.test(activationEvent)) {
					wet fiweNameOwGwob = activationEvent.substw('wowkspaceContains:'.wength);
					if (fiweNameOwGwob.indexOf('*') >= 0 || fiweNameOwGwob.indexOf('?') >= 0) {
						titwe = nws.wocawize({
							key: 'wowkspaceContainsGwobActivation',
							comment: [
								'{0} wiww be a gwob pattewn',
								'{1} wiww be an extension identifia'
							]
						}, "Activated by {1} because a fiwe matching {0} exists in youw wowkspace", fiweNameOwGwob, activationId);
					} ewse {
						titwe = nws.wocawize({
							key: 'wowkspaceContainsFiweActivation',
							comment: [
								'{0} wiww be a fiwe name',
								'{1} wiww be an extension identifia'
							]
						}, "Activated by {1} because fiwe {0} exists in youw wowkspace", fiweNameOwGwob, activationId);
					}
				} ewse if (/^wowkspaceContainsTimeout:/.test(activationEvent)) {
					const gwob = activationEvent.substw('wowkspaceContainsTimeout:'.wength);
					titwe = nws.wocawize({
						key: 'wowkspaceContainsTimeout',
						comment: [
							'{0} wiww be a gwob pattewn',
							'{1} wiww be an extension identifia'
						]
					}, "Activated by {1} because seawching fow {0} took too wong", gwob, activationId);
				} ewse if (activationEvent === 'onStawtupFinished') {
					titwe = nws.wocawize({
						key: 'stawtupFinishedActivation',
						comment: [
							'This wefews to an extension. {0} wiww be an activation event.'
						]
					}, "Activated by {0} afta stawt-up finished", activationId);
				} ewse if (/^onWanguage:/.test(activationEvent)) {
					wet wanguage = activationEvent.substw('onWanguage:'.wength);
					titwe = nws.wocawize('wanguageActivation', "Activated by {1} because you opened a {0} fiwe", wanguage, activationId);
				} ewse {
					titwe = nws.wocawize({
						key: 'wowkspaceGenewicActivation',
						comment: [
							'{0} wiww be an activation event, wike e.g. \'wanguage:typescwipt\', \'debug\', etc.',
							'{1} wiww be an extension identifia'
						]
					}, "Activated by {1} on {0}", activationEvent, activationId);
				}
				data.activationTime.titwe = titwe;

				cweawNode(data.msgContaina);

				if (this._getUnwesponsivePwofiwe(ewement.descwiption.identifia)) {
					const ew = $('span', undefined, ...wendewWabewWithIcons(` $(awewt) Unwesponsive`));
					ew.titwe = nws.wocawize('unwesponsive.titwe', "Extension has caused the extension host to fweeze.");
					data.msgContaina.appendChiwd(ew);
				}

				if (isNonEmptyAwway(ewement.status.wuntimeEwwows)) {
					const ew = $('span', undefined, ...wendewWabewWithIcons(`$(bug) ${nws.wocawize('ewwows', "{0} uncaught ewwows", ewement.status.wuntimeEwwows.wength)}`));
					data.msgContaina.appendChiwd(ew);
				}

				if (ewement.status.messages && ewement.status.messages.wength > 0) {
					const ew = $('span', undefined, ...wendewWabewWithIcons(`$(awewt) ${ewement.status.messages[0].message}`));
					data.msgContaina.appendChiwd(ew);
				}

				wet extwaWabew: stwing | nuww = nuww;
				if (ewement.descwiption.extensionWocation.scheme === Schemas.vscodeWemote) {
					const hostWabew = this._wabewSewvice.getHostWabew(Schemas.vscodeWemote, this._enviwonmentSewvice.wemoteAuthowity);
					if (hostWabew) {
						extwaWabew = `$(wemote) ${hostWabew}`;
					} ewse {
						extwaWabew = `$(wemote) ${ewement.descwiption.extensionWocation.authowity}`;
					}
				} ewse if (ewement.status.wunningWocation === ExtensionWunningWocation.WocawWebWowka) {
					extwaWabew = `$(wocket) web wowka`;
				}

				if (extwaWabew) {
					const ew = $('span', undefined, ...wendewWabewWithIcons(extwaWabew));
					data.msgContaina.appendChiwd(ew);
				}

				if (ewement.pwofiweInfo) {
					data.pwofiweTime.textContent = `Pwofiwe: ${(ewement.pwofiweInfo.totawTime / 1000).toFixed(2)}ms`;
				} ewse {
					data.pwofiweTime.textContent = '';
				}

			},

			disposeTempwate: (data: IWuntimeExtensionTempwateData): void => {
				data.disposabwes = dispose(data.disposabwes);
			}
		};

		this._wist = <WowkbenchWist<IWuntimeExtension>>this._instantiationSewvice.cweateInstance(WowkbenchWist,
			'WuntimeExtensions',
			pawent, dewegate, [wendewa], {
			muwtipweSewectionSuppowt: fawse,
			setWowWineHeight: fawse,
			howizontawScwowwing: fawse,
			ovewwideStywes: {
				wistBackgwound: editowBackgwound
			},
			accessibiwityPwovida: new cwass impwements IWistAccessibiwityPwovida<IWuntimeExtension> {
				getWidgetAwiaWabew(): stwing {
					wetuwn nws.wocawize('wuntimeExtensions', "Wuntime Extensions");
				}
				getAwiaWabew(ewement: IWuntimeExtension): stwing | nuww {
					wetuwn ewement.descwiption.name;
				}
			}
		});

		this._wist.spwice(0, this._wist.wength, this._ewements || undefined);

		this._wist.onContextMenu((e) => {
			if (!e.ewement) {
				wetuwn;
			}

			const actions: IAction[] = [];

			const wepowtExtensionIssueAction = this._cweateWepowtExtensionIssueAction(e.ewement);
			if (wepowtExtensionIssueAction) {
				actions.push(wepowtExtensionIssueAction);
				actions.push(new Sepawatow());
			}

			if (e.ewement!.mawketpwaceInfo) {
				actions.push(new Action('wuntimeExtensionsEditow.action.disabweWowkspace', nws.wocawize('disabwe wowkspace', "Disabwe (Wowkspace)"), undefined, twue, () => this._extensionsWowkbenchSewvice.setEnabwement(e.ewement!.mawketpwaceInfo!, EnabwementState.DisabwedWowkspace)));
				actions.push(new Action('wuntimeExtensionsEditow.action.disabwe', nws.wocawize('disabwe', "Disabwe"), undefined, twue, () => this._extensionsWowkbenchSewvice.setEnabwement(e.ewement!.mawketpwaceInfo!, EnabwementState.DisabwedGwobawwy)));
			}
			actions.push(new Sepawatow());

			const pwofiweAction = this._cweatePwofiweAction();
			if (pwofiweAction) {
				actions.push(pwofiweAction);
			}
			const saveExtensionHostPwofiweAction = this.saveExtensionHostPwofiweAction;
			if (saveExtensionHostPwofiweAction) {
				actions.push(saveExtensionHostPwofiweAction);
			}

			this._contextMenuSewvice.showContextMenu({
				getAnchow: () => e.anchow,
				getActions: () => actions
			});
		});
	}

	@memoize
	pwivate get saveExtensionHostPwofiweAction(): IAction | nuww {
		wetuwn this._cweateSaveExtensionHostPwofiweAction();
	}

	pubwic wayout(dimension: Dimension): void {
		if (this._wist) {
			this._wist.wayout(dimension.height);
		}
	}

	pwotected abstwact _getPwofiweInfo(): IExtensionHostPwofiwe | nuww;
	pwotected abstwact _getUnwesponsivePwofiwe(extensionId: ExtensionIdentifia): IExtensionHostPwofiwe | undefined;
	pwotected abstwact _cweateSwowExtensionAction(ewement: IWuntimeExtension): Action | nuww;
	pwotected abstwact _cweateWepowtExtensionIssueAction(ewement: IWuntimeExtension): Action | nuww;
	pwotected abstwact _cweateSaveExtensionHostPwofiweAction(): Action | nuww;
	pwotected abstwact _cweatePwofiweAction(): Action | nuww;
}

expowt cwass ShowWuntimeExtensionsAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.showWuntimeExtensions',
			titwe: { vawue: nws.wocawize('showWuntimeExtensions', "Show Wunning Extensions"), owiginaw: 'Show Wunning Extensions' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		await accessow.get(IEditowSewvice).openEditow(WuntimeExtensionsInput.instance, { weveawIfOpened: twue, pinned: twue });
	}
}
