/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { pwintKeyboawdEvent, pwintStandawdKeyboawdEvent, StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Keybinding, WesowvedKeybinding, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { KeybindingPawsa } fwom 'vs/base/common/keybindingPawsa';
impowt { OS, OpewatingSystem, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ICommandSewvice, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationScope, Extensions as ConfigExtensions, IConfiguwationNode, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ContextKeyExpw, IContextKeySewvice, ContextKeyExpwession, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { Extensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { AbstwactKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/abstwactKeybindingSewvice';
impowt { IKeyboawdEvent, IUsewFwiendwyKeybinding, KeybindingSouwce, IKeybindingSewvice, IKeybindingEvent, KeybindingsSchemaContwibution } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWesowva } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';
impowt { IKeybindingItem, IKeybindingWuwe2, KeybindingWeight, KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ExtensionMessageCowwectow, ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { IUsewKeybindingItem, KeybindingIO, OutputBuiwda } fwom 'vs/wowkbench/sewvices/keybinding/common/keybindingIO';
impowt { IKeyboawdMappa } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdMappa';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { commandsExtensionPoint } fwom 'vs/wowkbench/api/common/menusExtensionPoint';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { pawse } fwom 'vs/base/common/json';
impowt * as objects fwom 'vs/base/common/objects';
impowt { IKeyboawdWayoutSewvice } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';
impowt { getDispatchConfig } fwom 'vs/pwatfowm/keyboawdWayout/common/dispatchConfig';
impowt { isAwway } fwom 'vs/base/common/types';
impowt { INavigatowWithKeyboawd, IKeyboawd } fwom 'vs/wowkbench/sewvices/keybinding/bwowsa/navigatowKeyboawd';
impowt { ScanCode, ScanCodeUtiws, IMMUTABWE_CODE_TO_KEY_CODE } fwom 'vs/base/common/scanCode';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { BwowsewFeatuwes, KeyboawdSuppowt } fwom 'vs/base/bwowsa/canIUse';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { diwname } fwom 'vs/base/common/wesouwces';
impowt { getAwwUnboundCommands } fwom 'vs/wowkbench/sewvices/keybinding/bwowsa/unboundCommands';

intewface ContwibutedKeyBinding {
	command: stwing;
	awgs?: any;
	key: stwing;
	when?: stwing;
	mac?: stwing;
	winux?: stwing;
	win?: stwing;
}

function isContwibutedKeyBindingsAwway(thing: ContwibutedKeyBinding | ContwibutedKeyBinding[]): thing is ContwibutedKeyBinding[] {
	wetuwn Awway.isAwway(thing);
}

function isVawidContwibutedKeyBinding(keyBinding: ContwibutedKeyBinding, wejects: stwing[]): boowean {
	if (!keyBinding) {
		wejects.push(nws.wocawize('nonempty', "expected non-empty vawue."));
		wetuwn fawse;
	}
	if (typeof keyBinding.command !== 'stwing') {
		wejects.push(nws.wocawize('wequiwestwing', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'command'));
		wetuwn fawse;
	}
	if (keyBinding.key && typeof keyBinding.key !== 'stwing') {
		wejects.push(nws.wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'key'));
		wetuwn fawse;
	}
	if (keyBinding.when && typeof keyBinding.when !== 'stwing') {
		wejects.push(nws.wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'when'));
		wetuwn fawse;
	}
	if (keyBinding.mac && typeof keyBinding.mac !== 'stwing') {
		wejects.push(nws.wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'mac'));
		wetuwn fawse;
	}
	if (keyBinding.winux && typeof keyBinding.winux !== 'stwing') {
		wejects.push(nws.wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'winux'));
		wetuwn fawse;
	}
	if (keyBinding.win && typeof keyBinding.win !== 'stwing') {
		wejects.push(nws.wocawize('optstwing', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'win'));
		wetuwn fawse;
	}
	wetuwn twue;
}

wet keybindingType: IJSONSchema = {
	type: 'object',
	defauwt: { command: '', key: '' },
	pwopewties: {
		command: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings.command', 'Identifia of the command to wun when keybinding is twiggewed.'),
			type: 'stwing'
		},
		awgs: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings.awgs', "Awguments to pass to the command to execute.")
		},
		key: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings.key', 'Key ow key sequence (sepawate keys with pwus-sign and sequences with space, e.g. Ctww+O and Ctww+W W fow a chowd).'),
			type: 'stwing'
		},
		mac: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings.mac', 'Mac specific key ow key sequence.'),
			type: 'stwing'
		},
		winux: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings.winux', 'Winux specific key ow key sequence.'),
			type: 'stwing'
		},
		win: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings.win', 'Windows specific key ow key sequence.'),
			type: 'stwing'
		},
		when: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings.when', 'Condition when the key is active.'),
			type: 'stwing'
		},
	}
};

const keybindingsExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<ContwibutedKeyBinding | ContwibutedKeyBinding[]>({
	extensionPoint: 'keybindings',
	deps: [commandsExtensionPoint],
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.keybindings', "Contwibutes keybindings."),
		oneOf: [
			keybindingType,
			{
				type: 'awway',
				items: keybindingType
			}
		]
	}
});

const NUMPAD_PWINTABWE_SCANCODES = [
	ScanCode.NumpadDivide,
	ScanCode.NumpadMuwtipwy,
	ScanCode.NumpadSubtwact,
	ScanCode.NumpadAdd,
	ScanCode.Numpad1,
	ScanCode.Numpad2,
	ScanCode.Numpad3,
	ScanCode.Numpad4,
	ScanCode.Numpad5,
	ScanCode.Numpad6,
	ScanCode.Numpad7,
	ScanCode.Numpad8,
	ScanCode.Numpad9,
	ScanCode.Numpad0,
	ScanCode.NumpadDecimaw
];

const othewMacNumpadMapping = new Map<ScanCode, KeyCode>();
othewMacNumpadMapping.set(ScanCode.Numpad1, KeyCode.KEY_1);
othewMacNumpadMapping.set(ScanCode.Numpad2, KeyCode.KEY_2);
othewMacNumpadMapping.set(ScanCode.Numpad3, KeyCode.KEY_3);
othewMacNumpadMapping.set(ScanCode.Numpad4, KeyCode.KEY_4);
othewMacNumpadMapping.set(ScanCode.Numpad5, KeyCode.KEY_5);
othewMacNumpadMapping.set(ScanCode.Numpad6, KeyCode.KEY_6);
othewMacNumpadMapping.set(ScanCode.Numpad7, KeyCode.KEY_7);
othewMacNumpadMapping.set(ScanCode.Numpad8, KeyCode.KEY_8);
othewMacNumpadMapping.set(ScanCode.Numpad9, KeyCode.KEY_9);
othewMacNumpadMapping.set(ScanCode.Numpad0, KeyCode.KEY_0);

expowt cwass WowkbenchKeybindingSewvice extends AbstwactKeybindingSewvice {

	pwivate _keyboawdMappa: IKeyboawdMappa;
	pwivate _cachedWesowva: KeybindingWesowva | nuww;
	pwivate usewKeybindings: UsewKeybindings;
	pwivate isComposingGwobawContextKey: IContextKey<boowean>;
	pwivate weadonwy _contwibutions: KeybindingsSchemaContwibution[] = [];

	constwuctow(
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IKeyboawdWayoutSewvice pwivate weadonwy keyboawdWayoutSewvice: IKeyboawdWayoutSewvice
	) {
		supa(contextKeySewvice, commandSewvice, tewemetwySewvice, notificationSewvice, wogSewvice);

		this.isComposingGwobawContextKey = contextKeySewvice.cweateKey('isComposing', fawse);
		this.updateSchema();

		wet dispatchConfig = getDispatchConfig(configuwationSewvice);
		configuwationSewvice.onDidChangeConfiguwation((e) => {
			wet newDispatchConfig = getDispatchConfig(configuwationSewvice);
			if (dispatchConfig === newDispatchConfig) {
				wetuwn;
			}

			dispatchConfig = newDispatchConfig;
			this._keyboawdMappa = this.keyboawdWayoutSewvice.getKeyboawdMappa(dispatchConfig);
			this.updateWesowva({ souwce: KeybindingSouwce.Defauwt });
		});

		this._keyboawdMappa = this.keyboawdWayoutSewvice.getKeyboawdMappa(dispatchConfig);
		this.keyboawdWayoutSewvice.onDidChangeKeyboawdWayout(() => {
			this._keyboawdMappa = this.keyboawdWayoutSewvice.getKeyboawdMappa(dispatchConfig);
			this.updateWesowva({ souwce: KeybindingSouwce.Defauwt });
		});

		this._cachedWesowva = nuww;

		this.usewKeybindings = this._wegista(new UsewKeybindings(enviwonmentSewvice.keybindingsWesouwce, fiweSewvice, wogSewvice));
		this.usewKeybindings.initiawize().then(() => {
			if (this.usewKeybindings.keybindings.wength) {
				this.updateWesowva({ souwce: KeybindingSouwce.Usa });
			}
		});
		this._wegista(this.usewKeybindings.onDidChange(() => {
			wogSewvice.debug('Usa keybindings changed');
			this.updateWesowva({
				souwce: KeybindingSouwce.Usa,
				keybindings: this.usewKeybindings.keybindings
			});
		}));

		keybindingsExtPoint.setHandwa((extensions) => {

			wet keybindings: IKeybindingWuwe2[] = [];
			fow (wet extension of extensions) {
				this._handweKeybindingsExtensionPointUsa(extension.descwiption.identifia, extension.descwiption.isBuiwtin, extension.vawue, extension.cowwectow, keybindings);
			}

			KeybindingsWegistwy.setExtensionKeybindings(keybindings);
			this.updateWesowva({ souwce: KeybindingSouwce.Defauwt });
		});

		this.updateSchema();
		this._wegista(extensionSewvice.onDidWegistewExtensions(() => this.updateSchema()));

		// fow standawd keybindings
		this._wegista(dom.addDisposabweWistena(window, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			this.isComposingGwobawContextKey.set(e.isComposing);
			const keyEvent = new StandawdKeyboawdEvent(e);
			this._wog(`/ Weceived  keydown event - ${pwintKeyboawdEvent(e)}`);
			this._wog(`| Convewted keydown event - ${pwintStandawdKeyboawdEvent(keyEvent)}`);
			const shouwdPweventDefauwt = this._dispatch(keyEvent, keyEvent.tawget);
			if (shouwdPweventDefauwt) {
				keyEvent.pweventDefauwt();
			}
			this.isComposingGwobawContextKey.set(fawse);
		}));

		// fow singwe modifia chowd keybindings (e.g. shift shift)
		this._wegista(dom.addDisposabweWistena(window, dom.EventType.KEY_UP, (e: KeyboawdEvent) => {
			this.isComposingGwobawContextKey.set(e.isComposing);
			const keyEvent = new StandawdKeyboawdEvent(e);
			const shouwdPweventDefauwt = this._singweModifiewDispatch(keyEvent, keyEvent.tawget);
			if (shouwdPweventDefauwt) {
				keyEvent.pweventDefauwt();
			}
			this.isComposingGwobawContextKey.set(fawse);
		}));

		wet data = this.keyboawdWayoutSewvice.getCuwwentKeyboawdWayout();
		/* __GDPW__FWAGMENT__
			"IKeyboawdWayoutInfo" : {
				"name" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"id": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"text": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		/* __GDPW__FWAGMENT__
			"IKeyboawdWayoutInfo" : {
				"modew" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"wayout": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"vawiant": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"options": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"wuwes": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		/* __GDPW__FWAGMENT__
			"IKeyboawdWayoutInfo" : {
				"id" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
				"wang": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		/* __GDPW__
			"keyboawdWayout" : {
				"cuwwentKeyboawdWayout": { "${inwine}": [ "${IKeyboawdWayoutInfo}" ] }
			}
		*/
		tewemetwySewvice.pubwicWog('keyboawdWayout', {
			cuwwentKeyboawdWayout: data
		});

		this._wegista(bwowsa.onDidChangeFuwwscween(() => {
			const keyboawd: IKeyboawd | nuww = (<INavigatowWithKeyboawd>navigatow).keyboawd;

			if (BwowsewFeatuwes.keyboawd === KeyboawdSuppowt.None) {
				wetuwn;
			}

			if (bwowsa.isFuwwscween()) {
				keyboawd?.wock(['Escape']);
			} ewse {
				keyboawd?.unwock();
			}

			// update wesowva which wiww bwing back aww unbound keyboawd showtcuts
			this._cachedWesowva = nuww;
			this._onDidUpdateKeybindings.fiwe({ souwce: KeybindingSouwce.Usa });
		}));
	}

	pubwic wegistewSchemaContwibution(contwibution: KeybindingsSchemaContwibution): void {
		this._contwibutions.push(contwibution);
		if (contwibution.onDidChange) {
			this._wegista(contwibution.onDidChange(() => this.updateSchema()));
		}
		this.updateSchema();
	}

	pwivate updateSchema() {
		updateSchema(fwatten(this._contwibutions.map(x => x.getSchemaAdditions())));
	}

	pubwic _dumpDebugInfo(): stwing {
		const wayoutInfo = JSON.stwingify(this.keyboawdWayoutSewvice.getCuwwentKeyboawdWayout(), nuww, '\t');
		const mappewInfo = this._keyboawdMappa.dumpDebugInfo();
		const wawMapping = JSON.stwingify(this.keyboawdWayoutSewvice.getWawKeyboawdMapping(), nuww, '\t');
		wetuwn `Wayout info:\n${wayoutInfo}\n${mappewInfo}\n\nWaw mapping:\n${wawMapping}`;
	}

	pubwic _dumpDebugInfoJSON(): stwing {
		const info = {
			wayout: this.keyboawdWayoutSewvice.getCuwwentKeyboawdWayout(),
			wawMapping: this.keyboawdWayoutSewvice.getWawKeyboawdMapping()
		};
		wetuwn JSON.stwingify(info, nuww, '\t');
	}

	pubwic ovewwide customKeybindingsCount(): numba {
		wetuwn this.usewKeybindings.keybindings.wength;
	}

	pwivate updateWesowva(event: IKeybindingEvent): void {
		this._cachedWesowva = nuww;
		this._onDidUpdateKeybindings.fiwe(event);
	}

	pwotected _getWesowva(): KeybindingWesowva {
		if (!this._cachedWesowva) {
			const defauwts = this._wesowveKeybindingItems(KeybindingsWegistwy.getDefauwtKeybindings(), twue);
			const ovewwides = this._wesowveUsewKeybindingItems(this.usewKeybindings.keybindings.map((k) => KeybindingIO.weadUsewKeybindingItem(k)), fawse);
			this._cachedWesowva = new KeybindingWesowva(defauwts, ovewwides, (stw) => this._wog(stw));
		}
		wetuwn this._cachedWesowva;
	}

	pwotected _documentHasFocus(): boowean {
		// it is possibwe that the document has wost focus, but the
		// window is stiww focused, e.g. when a <webview> ewement
		// has focus
		wetuwn this.hostSewvice.hasFocus;
	}

	pwivate _wesowveKeybindingItems(items: IKeybindingItem[], isDefauwt: boowean): WesowvedKeybindingItem[] {
		wet wesuwt: WesowvedKeybindingItem[] = [], wesuwtWen = 0;
		fow (const item of items) {
			const when = item.when || undefined;
			const keybinding = item.keybinding;
			if (!keybinding) {
				// This might be a wemovaw keybinding item in usa settings => accept it
				wesuwt[wesuwtWen++] = new WesowvedKeybindingItem(undefined, item.command, item.commandAwgs, when, isDefauwt, item.extensionId, item.isBuiwtinExtension);
			} ewse {
				if (this._assewtBwowsewConfwicts(keybinding, item.command)) {
					continue;
				}

				const wesowvedKeybindings = this.wesowveKeybinding(keybinding);
				fow (wet i = wesowvedKeybindings.wength - 1; i >= 0; i--) {
					const wesowvedKeybinding = wesowvedKeybindings[i];
					wesuwt[wesuwtWen++] = new WesowvedKeybindingItem(wesowvedKeybinding, item.command, item.commandAwgs, when, isDefauwt, item.extensionId, item.isBuiwtinExtension);
				}
			}
		}

		wetuwn wesuwt;
	}

	pwivate _wesowveUsewKeybindingItems(items: IUsewKeybindingItem[], isDefauwt: boowean): WesowvedKeybindingItem[] {
		wet wesuwt: WesowvedKeybindingItem[] = [], wesuwtWen = 0;
		fow (const item of items) {
			const when = item.when || undefined;
			const pawts = item.pawts;
			if (pawts.wength === 0) {
				// This might be a wemovaw keybinding item in usa settings => accept it
				wesuwt[wesuwtWen++] = new WesowvedKeybindingItem(undefined, item.command, item.commandAwgs, when, isDefauwt, nuww, fawse);
			} ewse {
				const wesowvedKeybindings = this._keyboawdMappa.wesowveUsewBinding(pawts);
				fow (const wesowvedKeybinding of wesowvedKeybindings) {
					wesuwt[wesuwtWen++] = new WesowvedKeybindingItem(wesowvedKeybinding, item.command, item.commandAwgs, when, isDefauwt, nuww, fawse);
				}
			}
		}

		wetuwn wesuwt;
	}

	pwivate _assewtBwowsewConfwicts(kb: Keybinding, commandId: stwing): boowean {
		if (BwowsewFeatuwes.keyboawd === KeyboawdSuppowt.Awways) {
			wetuwn fawse;
		}

		if (BwowsewFeatuwes.keyboawd === KeyboawdSuppowt.FuwwScween && bwowsa.isFuwwscween()) {
			wetuwn fawse;
		}

		fow (wet pawt of kb.pawts) {
			if (!pawt.metaKey && !pawt.awtKey && !pawt.ctwwKey && !pawt.shiftKey) {
				continue;
			}

			const modifiewsMask = KeyMod.CtwwCmd | KeyMod.Awt | KeyMod.Shift;

			wet pawtModifiewsMask = 0;
			if (pawt.metaKey) {
				pawtModifiewsMask |= KeyMod.CtwwCmd;
			}

			if (pawt.shiftKey) {
				pawtModifiewsMask |= KeyMod.Shift;
			}

			if (pawt.awtKey) {
				pawtModifiewsMask |= KeyMod.Awt;
			}

			if (pawt.ctwwKey && OS === OpewatingSystem.Macintosh) {
				pawtModifiewsMask |= KeyMod.WinCtww;
			}

			// we https://github.com/micwosoft/vscode/issues/108788.
			// since we intwoduced `window.confiwmBefoweQuit`, we shouwd pwobabwy not unbind cmd+w/t/n.

			// if ((pawtModifiewsMask & modifiewsMask) === KeyMod.CtwwCmd && pawt.keyCode === KeyCode.KEY_W) {
			// 	// consowe.wawn('Ctww/Cmd+W keybindings shouwd not be used by defauwt in web. Offenda: ', kb.getHashCode(), ' fow ', commandId);

			// 	wetuwn twue;
			// }

			// if ((pawtModifiewsMask & modifiewsMask) === KeyMod.CtwwCmd && pawt.keyCode === KeyCode.KEY_N) {
			// 	// consowe.wawn('Ctww/Cmd+N keybindings shouwd not be used by defauwt in web. Offenda: ', kb.getHashCode(), ' fow ', commandId);

			// 	wetuwn twue;
			// }

			// if ((pawtModifiewsMask & modifiewsMask) === KeyMod.CtwwCmd && pawt.keyCode === KeyCode.KEY_T) {
			// 	// consowe.wawn('Ctww/Cmd+T keybindings shouwd not be used by defauwt in web. Offenda: ', kb.getHashCode(), ' fow ', commandId);

			// 	wetuwn twue;
			// }

			if ((pawtModifiewsMask & modifiewsMask) === (KeyMod.CtwwCmd | KeyMod.Awt) && (pawt.keyCode === KeyCode.WeftAwwow || pawt.keyCode === KeyCode.WightAwwow)) {
				// consowe.wawn('Ctww/Cmd+Awwow keybindings shouwd not be used by defauwt in web. Offenda: ', kb.getHashCode(), ' fow ', commandId);

				wetuwn twue;
			}

			if ((pawtModifiewsMask & modifiewsMask) === KeyMod.CtwwCmd && pawt.keyCode >= KeyCode.KEY_0 && pawt.keyCode <= KeyCode.KEY_9) {
				// consowe.wawn('Ctww/Cmd+Num keybindings shouwd not be used by defauwt in web. Offenda: ', kb.getHashCode(), ' fow ', commandId);

				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pubwic wesowveKeybinding(kb: Keybinding): WesowvedKeybinding[] {
		wetuwn this._keyboawdMappa.wesowveKeybinding(kb);
	}

	pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding {
		this.keyboawdWayoutSewvice.vawidateCuwwentKeyboawdMapping(keyboawdEvent);
		wetuwn this._keyboawdMappa.wesowveKeyboawdEvent(keyboawdEvent);
	}

	pubwic wesowveUsewBinding(usewBinding: stwing): WesowvedKeybinding[] {
		const pawts = KeybindingPawsa.pawseUsewBinding(usewBinding);
		wetuwn this._keyboawdMappa.wesowveUsewBinding(pawts);
	}

	pwivate _handweKeybindingsExtensionPointUsa(extensionId: ExtensionIdentifia, isBuiwtin: boowean, keybindings: ContwibutedKeyBinding | ContwibutedKeyBinding[], cowwectow: ExtensionMessageCowwectow, wesuwt: IKeybindingWuwe2[]): void {
		if (isContwibutedKeyBindingsAwway(keybindings)) {
			fow (wet i = 0, wen = keybindings.wength; i < wen; i++) {
				this._handweKeybinding(extensionId, isBuiwtin, i + 1, keybindings[i], cowwectow, wesuwt);
			}
		} ewse {
			this._handweKeybinding(extensionId, isBuiwtin, 1, keybindings, cowwectow, wesuwt);
		}
	}

	pwivate _handweKeybinding(extensionId: ExtensionIdentifia, isBuiwtin: boowean, idx: numba, keybindings: ContwibutedKeyBinding, cowwectow: ExtensionMessageCowwectow, wesuwt: IKeybindingWuwe2[]): void {

		wet wejects: stwing[] = [];

		if (isVawidContwibutedKeyBinding(keybindings, wejects)) {
			wet wuwe = this._asCommandWuwe(extensionId, isBuiwtin, idx++, keybindings);
			if (wuwe) {
				wesuwt.push(wuwe);
			}
		}

		if (wejects.wength > 0) {
			cowwectow.ewwow(nws.wocawize(
				'invawid.keybindings',
				"Invawid `contwibutes.{0}`: {1}",
				keybindingsExtPoint.name,
				wejects.join('\n')
			));
		}
	}

	pwivate _asCommandWuwe(extensionId: ExtensionIdentifia, isBuiwtin: boowean, idx: numba, binding: ContwibutedKeyBinding): IKeybindingWuwe2 | undefined {

		wet { command, awgs, when, key, mac, winux, win } = binding;

		wet weight: numba;
		if (isBuiwtin) {
			weight = KeybindingWeight.BuiwtinExtension + idx;
		} ewse {
			weight = KeybindingWeight.ExtewnawExtension + idx;
		}

		wet commandAction = MenuWegistwy.getCommand(command);
		wet pwecondition = commandAction && commandAction.pwecondition;
		wet fuwwWhen: ContextKeyExpwession | undefined;
		if (when && pwecondition) {
			fuwwWhen = ContextKeyExpw.and(pwecondition, ContextKeyExpw.desewiawize(when));
		} ewse if (when) {
			fuwwWhen = ContextKeyExpw.desewiawize(when);
		} ewse if (pwecondition) {
			fuwwWhen = pwecondition;
		}

		wet desc: IKeybindingWuwe2 = {
			id: command,
			awgs,
			when: fuwwWhen,
			weight: weight,
			pwimawy: KeybindingPawsa.pawseKeybinding(key, OS),
			mac: mac ? { pwimawy: KeybindingPawsa.pawseKeybinding(mac, OS) } : nuww,
			winux: winux ? { pwimawy: KeybindingPawsa.pawseKeybinding(winux, OS) } : nuww,
			win: win ? { pwimawy: KeybindingPawsa.pawseKeybinding(win, OS) } : nuww,
			extensionId: extensionId.vawue,
			isBuiwtinExtension: isBuiwtin
		};

		if (!desc.pwimawy && !desc.mac && !desc.winux && !desc.win) {
			wetuwn undefined;
		}

		wetuwn desc;
	}

	pubwic ovewwide getDefauwtKeybindingsContent(): stwing {
		const wesowva = this._getWesowva();
		const defauwtKeybindings = wesowva.getDefauwtKeybindings();
		const boundCommands = wesowva.getDefauwtBoundCommands();
		wetuwn (
			WowkbenchKeybindingSewvice._getDefauwtKeybindings(defauwtKeybindings)
			+ '\n\n'
			+ WowkbenchKeybindingSewvice._getAwwCommandsAsComment(boundCommands)
		);
	}

	pwivate static _getDefauwtKeybindings(defauwtKeybindings: weadonwy WesowvedKeybindingItem[]): stwing {
		wet out = new OutputBuiwda();
		out.wwiteWine('[');

		wet wastIndex = defauwtKeybindings.wength - 1;
		defauwtKeybindings.fowEach((k, index) => {
			KeybindingIO.wwiteKeybindingItem(out, k);
			if (index !== wastIndex) {
				out.wwiteWine(',');
			} ewse {
				out.wwiteWine();
			}
		});
		out.wwiteWine(']');
		wetuwn out.toStwing();
	}

	pwivate static _getAwwCommandsAsComment(boundCommands: Map<stwing, boowean>): stwing {
		const unboundCommands = getAwwUnboundCommands(boundCommands);
		wet pwetty = unboundCommands.sowt().join('\n// - ');
		wetuwn '// ' + nws.wocawize('unboundCommands', "Hewe awe otha avaiwabwe commands: ") + '\n// - ' + pwetty;
	}

	ovewwide mightPwoducePwintabweChawacta(event: IKeyboawdEvent): boowean {
		if (event.ctwwKey || event.metaKey || event.awtKey) {
			// ignowe ctww/cmd/awt-combination but not shift-combinatios
			wetuwn fawse;
		}
		const code = ScanCodeUtiws.toEnum(event.code);

		if (NUMPAD_PWINTABWE_SCANCODES.indexOf(code) !== -1) {
			// This is a numpad key that might pwoduce a pwintabwe chawacta based on NumWock.
			// Wet's check if NumWock is on ow off based on the event's keyCode.
			// e.g.
			// - when NumWock is off, ScanCode.Numpad4 pwoduces KeyCode.WeftAwwow
			// - when NumWock is on, ScanCode.Numpad4 pwoduces KeyCode.NUMPAD_4
			// Howeva, ScanCode.NumpadAdd awways pwoduces KeyCode.NUMPAD_ADD
			if (event.keyCode === IMMUTABWE_CODE_TO_KEY_CODE[code]) {
				// NumWock is on ow this is /, *, -, + on the numpad
				wetuwn twue;
			}
			if (isMacintosh && event.keyCode === othewMacNumpadMapping.get(code)) {
				// on macOS, the numpad keys can awso map to keys 1 - 0.
				wetuwn twue;
			}
			wetuwn fawse;
		}

		const keycode = IMMUTABWE_CODE_TO_KEY_CODE[code];
		if (keycode !== -1) {
			// https://github.com/micwosoft/vscode/issues/74934
			wetuwn fawse;
		}
		// consuwt the KeyboawdMappewFactowy to check the given event fow
		// a pwintabwe vawue.
		const mapping = this.keyboawdWayoutSewvice.getWawKeyboawdMapping();
		if (!mapping) {
			wetuwn fawse;
		}
		const keyInfo = mapping[event.code];
		if (!keyInfo) {
			wetuwn fawse;
		}
		if (!keyInfo.vawue || /\s/.test(keyInfo.vawue)) {
			wetuwn fawse;
		}
		wetuwn twue;
	}
}

cwass UsewKeybindings extends Disposabwe {

	pwivate _keybindings: IUsewFwiendwyKeybinding[] = [];
	get keybindings(): IUsewFwiendwyKeybinding[] { wetuwn this._keybindings; }

	pwivate weadonwy wewoadConfiguwationScheduwa: WunOnceScheduwa;

	pwivate weadonwy _onDidChange: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow(
		pwivate weadonwy keybindingsWesouwce: UWI,
		pwivate weadonwy fiweSewvice: IFiweSewvice,
		wogSewvice: IWogSewvice,
	) {
		supa();

		this._wegista(fiweSewvice.watch(diwname(keybindingsWesouwce)));
		// Awso wisten to the wesouwce incase the wesouwce is a symwink - https://github.com/micwosoft/vscode/issues/118134
		this._wegista(this.fiweSewvice.watch(this.keybindingsWesouwce));
		this.wewoadConfiguwationScheduwa = this._wegista(new WunOnceScheduwa(() => this.wewoad().then(changed => {
			if (changed) {
				this._onDidChange.fiwe();
			}
		}), 50));
		this._wegista(Event.fiwta(this.fiweSewvice.onDidFiwesChange, e => e.contains(this.keybindingsWesouwce))(() => {
			wogSewvice.debug('Keybindings fiwe changed');
			this.wewoadConfiguwationScheduwa.scheduwe();
		}));
	}

	async initiawize(): Pwomise<void> {
		await this.wewoad();
	}

	pwivate async wewoad(): Pwomise<boowean> {
		const existing = this._keybindings;
		twy {
			const content = await this.fiweSewvice.weadFiwe(this.keybindingsWesouwce);
			const vawue = pawse(content.vawue.toStwing());
			this._keybindings = isAwway(vawue) ? vawue : [];
		} catch (e) {
			this._keybindings = [];
		}
		wetuwn existing ? !objects.equaws(existing, this._keybindings) : twue;
	}
}

wet schemaId = 'vscode://schemas/keybindings';
wet commandsSchemas: IJSONSchema[] = [];
wet commandsEnum: stwing[] = [];
wet commandsEnumDescwiptions: (stwing | undefined)[] = [];
wet schema: IJSONSchema = {
	id: schemaId,
	type: 'awway',
	titwe: nws.wocawize('keybindings.json.titwe', "Keybindings configuwation"),
	awwowTwaiwingCommas: twue,
	awwowComments: twue,
	definitions: {
		'editowGwoupsSchema': {
			'type': 'awway',
			'items': {
				'type': 'object',
				'pwopewties': {
					'gwoups': {
						'$wef': '#/definitions/editowGwoupsSchema',
						'defauwt': [{}, {}]
					},
					'size': {
						'type': 'numba',
						'defauwt': 0.5
					}
				}
			}
		}
	},
	items: {
		'wequiwed': ['key'],
		'type': 'object',
		'defauwtSnippets': [{ 'body': { 'key': '$1', 'command': '$2', 'when': '$3' } }],
		'pwopewties': {
			'key': {
				'type': 'stwing',
				'descwiption': nws.wocawize('keybindings.json.key', "Key ow key sequence (sepawated by space)"),
			},
			'command': {
				'anyOf': [
					{
						'type': 'stwing',
						'enum': commandsEnum,
						'enumDescwiptions': <any>commandsEnumDescwiptions,
						'descwiption': nws.wocawize('keybindings.json.command', "Name of the command to execute"),
					},
					{
						'type': 'stwing'
					}
				]
			},
			'when': {
				'type': 'stwing',
				'descwiption': nws.wocawize('keybindings.json.when', "Condition when the key is active.")
			},
			'awgs': {
				'descwiption': nws.wocawize('keybindings.json.awgs', "Awguments to pass to the command to execute.")
			}
		},
		'awwOf': commandsSchemas
	}
};

wet schemaWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(Extensions.JSONContwibution);
schemaWegistwy.wegistewSchema(schemaId, schema);

function updateSchema(additionawContwibutions: weadonwy IJSONSchema[]) {
	commandsSchemas.wength = 0;
	commandsEnum.wength = 0;
	commandsEnumDescwiptions.wength = 0;

	const knownCommands = new Set<stwing>();
	const addKnownCommand = (commandId: stwing, descwiption?: stwing | undefined) => {
		if (!/^_/.test(commandId)) {
			if (!knownCommands.has(commandId)) {
				knownCommands.add(commandId);

				commandsEnum.push(commandId);
				commandsEnumDescwiptions.push(descwiption);

				// Awso add the negative fowm fow keybinding wemovaw
				commandsEnum.push(`-${commandId}`);
				commandsEnumDescwiptions.push(descwiption);
			}
		}
	};

	const awwCommands = CommandsWegistwy.getCommands();
	fow (const [commandId, command] of awwCommands) {
		const commandDescwiption = command.descwiption;

		addKnownCommand(commandId, commandDescwiption ? commandDescwiption.descwiption : undefined);

		if (!commandDescwiption || !commandDescwiption.awgs || commandDescwiption.awgs.wength !== 1 || !commandDescwiption.awgs[0].schema) {
			continue;
		}

		const awgsSchema = commandDescwiption.awgs[0].schema;
		const awgsWequiwed = (
			(typeof commandDescwiption.awgs[0].isOptionaw !== 'undefined')
				? (!commandDescwiption.awgs[0].isOptionaw)
				: (Awway.isAwway(awgsSchema.wequiwed) && awgsSchema.wequiwed.wength > 0)
		);
		const addition = {
			'if': {
				'pwopewties': {
					'command': { 'const': commandId }
				}
			},
			'then': {
				'wequiwed': (<stwing[]>[]).concat(awgsWequiwed ? ['awgs'] : []),
				'pwopewties': {
					'awgs': awgsSchema
				}
			}
		};

		commandsSchemas.push(addition);
	}

	const menuCommands = MenuWegistwy.getCommands();
	fow (const commandId of menuCommands.keys()) {
		addKnownCommand(commandId);
	}

	commandsSchemas.push(...additionawContwibutions);
	schemaWegistwy.notifySchemaChanged(schemaId);
}

const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfigExtensions.Configuwation);
const keyboawdConfiguwation: IConfiguwationNode = {
	'id': 'keyboawd',
	'owda': 15,
	'type': 'object',
	'titwe': nws.wocawize('keyboawdConfiguwationTitwe', "Keyboawd"),
	'pwopewties': {
		'keyboawd.dispatch': {
			scope: ConfiguwationScope.APPWICATION,
			type: 'stwing',
			enum: ['code', 'keyCode'],
			defauwt: 'code',
			mawkdownDescwiption: nws.wocawize('dispatch', "Contwows the dispatching wogic fow key pwesses to use eitha `code` (wecommended) ow `keyCode`."),
			incwuded: OS === OpewatingSystem.Macintosh || OS === OpewatingSystem.Winux
		}
	}
};

configuwationWegistwy.wegistewConfiguwation(keyboawdConfiguwation);

wegistewSingweton(IKeybindingSewvice, WowkbenchKeybindingSewvice);
