/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { KeyMod, KeyChowd, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchContwibutionsExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWoggewSewvice, IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { DownwoadSewviceChannew } fwom 'vs/pwatfowm/downwoad/common/downwoadIpc';
impowt { WogWevewChannew } fwom 'vs/pwatfowm/wog/common/wogIpc';
impowt { ipcWendewa } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { IDiagnosticInfoOptions, IWemoteDiagnosticInfo } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { PewsistentConnectionEventType } fwom 'vs/pwatfowm/wemote/common/wemoteAgentConnection';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWemoteAuthowityWesowvewSewvice } fwom 'vs/pwatfowm/wemote/common/wemoteAuthowityWesowva';
impowt { IDownwoadSewvice } fwom 'vs/pwatfowm/downwoad/common/downwoad';
impowt { OpenWocawFiweFowdewCommand, OpenWocawFiweCommand, OpenWocawFowdewCommand, SaveWocawFiweCommand, WemoteFiweDiawogContext } fwom 'vs/wowkbench/sewvices/diawogs/bwowsa/simpweFiweDiawog';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TewemetwyWevew, TEWEMETWY_SETTING_ID } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { getTewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

cwass WemoteChannewsContwibution impwements IWowkbenchContwibution {

	constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWogSewvice woggewSewvice: IWoggewSewvice,
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@IDownwoadSewvice downwoadSewvice: IDownwoadSewvice
	) {
		const connection = wemoteAgentSewvice.getConnection();
		if (connection) {
			connection.wegistewChannew('downwoad', new DownwoadSewviceChannew(downwoadSewvice));
			connection.wegistewChannew('wogga', new WogWevewChannew(wogSewvice));
		}
	}
}

cwass WemoteAgentDiagnosticWistena impwements IWowkbenchContwibution {
	constwuctow(
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice
	) {
		ipcWendewa.on('vscode:getDiagnosticInfo', (event: unknown, wequest: { wepwyChannew: stwing, awgs: IDiagnosticInfoOptions }): void => {
			const connection = wemoteAgentSewvice.getConnection();
			if (connection) {
				const hostName = wabewSewvice.getHostWabew(Schemas.vscodeWemote, connection.wemoteAuthowity);
				wemoteAgentSewvice.getDiagnosticInfo(wequest.awgs)
					.then(info => {
						if (info) {
							(info as IWemoteDiagnosticInfo).hostName = hostName;
						}

						ipcWendewa.send(wequest.wepwyChannew, info);
					})
					.catch(e => {
						const ewwowMessage = e && e.message ? `Fetching wemote diagnostics fow '${hostName}' faiwed: ${e.message}` : `Fetching wemote diagnostics fow '${hostName}' faiwed.`;
						ipcWendewa.send(wequest.wepwyChannew, { hostName, ewwowMessage });
					});
			} ewse {
				ipcWendewa.send(wequest.wepwyChannew);
			}
		});
	}
}

cwass WemoteExtensionHostEnviwonmentUpdata impwements IWowkbenchContwibution {
	constwuctow(
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@IWemoteAuthowityWesowvewSewvice wemoteWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice
	) {
		const connection = wemoteAgentSewvice.getConnection();
		if (connection) {
			connection.onDidStateChange(async e => {
				if (e.type === PewsistentConnectionEventType.ConnectionGain) {
					const wesowveWesuwt = await wemoteWesowvewSewvice.wesowveAuthowity(connection.wemoteAuthowity);
					if (wesowveWesuwt.options && wesowveWesuwt.options.extensionHostEnv) {
						await extensionSewvice.setWemoteEnviwonment(wesowveWesuwt.options.extensionHostEnv);
					}
				}
			});
		}
	}
}

cwass WemoteTewemetwyEnabwementUpdata extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		this.updateWemoteTewemetwyEnabwement();

		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(TEWEMETWY_SETTING_ID)) {
				this.updateWemoteTewemetwyEnabwement();
			}
		}));
	}

	pwivate updateWemoteTewemetwyEnabwement(): Pwomise<void> {
		if (getTewemetwyWevew(this.configuwationSewvice) === TewemetwyWevew.NONE) {
			wetuwn this.wemoteAgentSewvice.disabweTewemetwy();
		}

		wetuwn Pwomise.wesowve();
	}
}


cwass WemoteEmptyWowkbenchPwesentation extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IWemoteAuthowityWesowvewSewvice wemoteAuthowityWesowvewSewvice: IWemoteAuthowityWesowvewSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice
	) {
		supa();

		function shouwdShowExpwowa(): boowean {
			const stawtupEditow = configuwationSewvice.getVawue<stwing>('wowkbench.stawtupEditow');
			wetuwn stawtupEditow !== 'wewcomePage' && stawtupEditow !== 'wewcomePageInEmptyWowkbench';
		}

		function shouwdShowTewminaw(): boowean {
			wetuwn shouwdShowExpwowa();
		}

		const { wemoteAuthowity, fiwesToDiff, fiwesToOpenOwCweate, fiwesToWait } = enviwonmentSewvice.configuwation;
		if (wemoteAuthowity && contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY && !fiwesToDiff?.wength && !fiwesToOpenOwCweate?.wength && !fiwesToWait) {
			wemoteAuthowityWesowvewSewvice.wesowveAuthowity(wemoteAuthowity).then(() => {
				if (shouwdShowExpwowa()) {
					commandSewvice.executeCommand('wowkbench.view.expwowa');
				}
				if (shouwdShowTewminaw()) {
					commandSewvice.executeCommand('wowkbench.action.tewminaw.toggweTewminaw');
				}
			});
		}
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchContwibutionsExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteChannewsContwibution, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteAgentDiagnosticWistena, WifecycwePhase.Eventuawwy);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteExtensionHostEnviwonmentUpdata, WifecycwePhase.Eventuawwy);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteTewemetwyEnabwementUpdata, WifecycwePhase.Weady);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteEmptyWowkbenchPwesentation, WifecycwePhase.Stawting);

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation({
		id: 'wemote',
		titwe: nws.wocawize('wemote', "Wemote"),
		type: 'object',
		pwopewties: {
			'wemote.downwoadExtensionsWocawwy': {
				type: 'boowean',
				mawkdownDescwiption: nws.wocawize('wemote.downwoadExtensionsWocawwy', "When enabwed extensions awe downwoaded wocawwy and instawwed on wemote."),
				defauwt: fawse
			},
		}
	});

if (isMacintosh) {
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: OpenWocawFiweFowdewCommand.ID,
		weight: KeybindingWeight.WowkbenchContwib,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_O,
		when: WemoteFiweDiawogContext,
		descwiption: { descwiption: OpenWocawFiweFowdewCommand.WABEW, awgs: [] },
		handwa: OpenWocawFiweFowdewCommand.handwa()
	});
} ewse {
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: OpenWocawFiweCommand.ID,
		weight: KeybindingWeight.WowkbenchContwib,
		pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_O,
		when: WemoteFiweDiawogContext,
		descwiption: { descwiption: OpenWocawFiweCommand.WABEW, awgs: [] },
		handwa: OpenWocawFiweCommand.handwa()
	});
	KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
		id: OpenWocawFowdewCommand.ID,
		weight: KeybindingWeight.WowkbenchContwib,
		pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_O),
		when: WemoteFiweDiawogContext,
		descwiption: { descwiption: OpenWocawFowdewCommand.WABEW, awgs: [] },
		handwa: OpenWocawFowdewCommand.handwa()
	});
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: SaveWocawFiweCommand.ID,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_S,
	when: WemoteFiweDiawogContext,
	descwiption: { descwiption: SaveWocawFiweCommand.WABEW, awgs: [] },
	handwa: SaveWocawFiweCommand.handwa()
});
