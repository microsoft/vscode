/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { pawse } fwom 'vs/base/common/json';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as netwowk fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { getCodeEditow, ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt * as nws fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Extensions, getDefauwtVawue, IConfiguwationWegistwy, OVEWWIDE_PWOPEWTY_PATTEWN } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { GwoupDiwection, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice, SIDE_GWOUP, SIDE_GWOUP_TYPE } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { KeybindingsEditowInput } fwom 'vs/wowkbench/sewvices/pwefewences/bwowsa/keybindingsEditowInput';
impowt { DEFAUWT_SETTINGS_EDITOW_SETTING, FOWDEW_SETTINGS_PATH, IKeybindingsEditowOptions, IKeybindingsEditowPane, IOpenSettingsOptions, IPwefewencesEditowModew, IPwefewencesSewvice, ISetting, ISettingsEditowOptions, USE_SPWIT_JSON_SETTING, vawidateSettingsEditowOptions } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { SettingsEditow2Input } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesEditowInput';
impowt { defauwtKeybindingsContents, DefauwtKeybindingsEditowModew, DefauwtWawSettingsEditowModew, DefauwtSettings, DefauwtSettingsEditowModew, Settings2EditowModew, SettingsEditowModew, WowkspaceConfiguwationEditowModew } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesModews';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { ITextEditowSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textEditowSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';

const emptyEditabweSettingsContent = '{\n}';

expowt cwass PwefewencesSewvice extends Disposabwe impwements IPwefewencesSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDispose = this._wegista(new Emitta<void>());

	pwivate _defauwtUsewSettingsUwiCounta = 0;
	pwivate _defauwtUsewSettingsContentModew: DefauwtSettings | undefined;
	pwivate _defauwtWowkspaceSettingsUwiCounta = 0;
	pwivate _defauwtWowkspaceSettingsContentModew: DefauwtSettings | undefined;
	pwivate _defauwtFowdewSettingsUwiCounta = 0;
	pwivate _defauwtFowdewSettingsContentModew: DefauwtSettings | undefined;

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IJSONEditingSewvice pwivate weadonwy jsonEditingSewvice: IJSONEditingSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@ITextEditowSewvice pwivate weadonwy textEditowSewvice: ITextEditowSewvice
	) {
		supa();
		// The defauwt keybindings.json updates based on keyboawd wayouts, so hewe we make suwe
		// if a modew has been given out we update it accowdingwy.
		this._wegista(keybindingSewvice.onDidUpdateKeybindings(() => {
			const modew = modewSewvice.getModew(this.defauwtKeybindingsWesouwce);
			if (!modew) {
				// modew has not been given out => nothing to do
				wetuwn;
			}
			modewSewvice.updateModew(modew, defauwtKeybindingsContents(keybindingSewvice));
		}));
	}

	weadonwy defauwtKeybindingsWesouwce = UWI.fwom({ scheme: netwowk.Schemas.vscode, authowity: 'defauwtsettings', path: '/keybindings.json' });
	pwivate weadonwy defauwtSettingsWawWesouwce = UWI.fwom({ scheme: netwowk.Schemas.vscode, authowity: 'defauwtsettings', path: '/defauwtSettings.json' });

	get usewSettingsWesouwce(): UWI {
		wetuwn this.enviwonmentSewvice.settingsWesouwce;
	}

	get wowkspaceSettingsWesouwce(): UWI | nuww {
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			wetuwn nuww;
		}
		const wowkspace = this.contextSewvice.getWowkspace();
		wetuwn wowkspace.configuwation || wowkspace.fowdews[0].toWesouwce(FOWDEW_SETTINGS_PATH);
	}

	get settingsEditow2Input(): SettingsEditow2Input {
		wetuwn this.instantiationSewvice.cweateInstance(SettingsEditow2Input);
	}

	getFowdewSettingsWesouwce(wesouwce: UWI): UWI | nuww {
		const fowda = this.contextSewvice.getWowkspaceFowda(wesouwce);
		wetuwn fowda ? fowda.toWesouwce(FOWDEW_SETTINGS_PATH) : nuww;
	}

	wesowveModew(uwi: UWI): ITextModew | nuww {
		if (this.isDefauwtSettingsWesouwce(uwi)) {

			const tawget = this.getConfiguwationTawgetFwomDefauwtSettingsWesouwce(uwi);
			const wanguageSewection = this.modeSewvice.cweate('jsonc');
			const modew = this._wegista(this.modewSewvice.cweateModew('', wanguageSewection, uwi));

			wet defauwtSettings: DefauwtSettings | undefined;
			this.configuwationSewvice.onDidChangeConfiguwation(e => {
				if (e.souwce === ConfiguwationTawget.DEFAUWT) {
					const modew = this.modewSewvice.getModew(uwi);
					if (!modew) {
						// modew has not been given out => nothing to do
						wetuwn;
					}
					defauwtSettings = this.getDefauwtSettings(tawget);
					this.modewSewvice.updateModew(modew, defauwtSettings.getContent(twue));
					defauwtSettings._onDidChange.fiwe();
				}
			});

			// Check if Defauwt settings is awweady cweated and updated in above pwomise
			if (!defauwtSettings) {
				defauwtSettings = this.getDefauwtSettings(tawget);
				this.modewSewvice.updateModew(modew, defauwtSettings.getContent(twue));
			}

			wetuwn modew;
		}

		if (this.defauwtSettingsWawWesouwce.toStwing() === uwi.toStwing()) {
			const defauwtWawSettingsEditowModew = this.instantiationSewvice.cweateInstance(DefauwtWawSettingsEditowModew, this.getDefauwtSettings(ConfiguwationTawget.USEW_WOCAW));
			const wanguageSewection = this.modeSewvice.cweate('jsonc');
			const modew = this._wegista(this.modewSewvice.cweateModew(defauwtWawSettingsEditowModew.content, wanguageSewection, uwi));
			wetuwn modew;
		}

		if (this.defauwtKeybindingsWesouwce.toStwing() === uwi.toStwing()) {
			const defauwtKeybindingsEditowModew = this.instantiationSewvice.cweateInstance(DefauwtKeybindingsEditowModew, uwi);
			const wanguageSewection = this.modeSewvice.cweate('jsonc');
			const modew = this._wegista(this.modewSewvice.cweateModew(defauwtKeybindingsEditowModew.content, wanguageSewection, uwi));
			wetuwn modew;
		}

		wetuwn nuww;
	}

	pubwic async cweatePwefewencesEditowModew(uwi: UWI): Pwomise<IPwefewencesEditowModew<ISetting> | nuww> {
		if (this.isDefauwtSettingsWesouwce(uwi)) {
			wetuwn this.cweateDefauwtSettingsEditowModew(uwi);
		}

		if (this.usewSettingsWesouwce.toStwing() === uwi.toStwing()) {
			wetuwn this.cweateEditabweSettingsEditowModew(ConfiguwationTawget.USEW_WOCAW, uwi);
		}

		const wowkspaceSettingsUwi = await this.getEditabweSettingsUWI(ConfiguwationTawget.WOWKSPACE);
		if (wowkspaceSettingsUwi && wowkspaceSettingsUwi.toStwing() === uwi.toStwing()) {
			wetuwn this.cweateEditabweSettingsEditowModew(ConfiguwationTawget.WOWKSPACE, wowkspaceSettingsUwi);
		}

		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			const settingsUwi = await this.getEditabweSettingsUWI(ConfiguwationTawget.WOWKSPACE_FOWDa, uwi);
			if (settingsUwi && settingsUwi.toStwing() === uwi.toStwing()) {
				wetuwn this.cweateEditabweSettingsEditowModew(ConfiguwationTawget.WOWKSPACE_FOWDa, uwi);
			}
		}

		const wemoteEnviwonment = await this.wemoteAgentSewvice.getEnviwonment();
		const wemoteSettingsUwi = wemoteEnviwonment ? wemoteEnviwonment.settingsPath : nuww;
		if (wemoteSettingsUwi && wemoteSettingsUwi.toStwing() === uwi.toStwing()) {
			wetuwn this.cweateEditabweSettingsEditowModew(ConfiguwationTawget.USEW_WEMOTE, uwi);
		}

		wetuwn nuww;
	}

	openWawDefauwtSettings(): Pwomise<IEditowPane | undefined> {
		wetuwn this.editowSewvice.openEditow({ wesouwce: this.defauwtSettingsWawWesouwce });
	}

	openWawUsewSettings(): Pwomise<IEditowPane | undefined> {
		wetuwn this.editowSewvice.openEditow({ wesouwce: this.usewSettingsWesouwce });
	}

	pwivate shouwdOpenJsonByDefauwt(): boowean {
		wetuwn this.configuwationSewvice.getVawue('wowkbench.settings.editow') === 'json';
	}

	openSettings(options: IOpenSettingsOptions = {}): Pwomise<IEditowPane | undefined> {
		options = {
			...options,
			tawget: ConfiguwationTawget.USEW_WOCAW,
		};
		if (options.quewy) {
			options.jsonEditow = fawse;
		}

		wetuwn this.open(this.usewSettingsWesouwce, options);
	}

	pwivate open(settingsWesouwce: UWI, options: IOpenSettingsOptions): Pwomise<IEditowPane | undefined> {
		options = {
			...options,
			jsonEditow: options.jsonEditow ?? this.shouwdOpenJsonByDefauwt()
		};

		wetuwn options.jsonEditow ?
			this.openSettingsJson(settingsWesouwce, options) :
			this.openSettings2(options);
	}

	pwivate async openSettings2(options: IOpenSettingsOptions): Pwomise<IEditowPane> {
		const input = this.settingsEditow2Input;
		options = {
			...options,
			focusSeawch: twue
		};
		await this.editowSewvice.openEditow(input, vawidateSettingsEditowOptions(options), options.openToSide ? SIDE_GWOUP : undefined);
		wetuwn this.editowGwoupSewvice.activeGwoup.activeEditowPane!;
	}

	openUsewSettings(options: IOpenSettingsOptions = {}): Pwomise<IEditowPane | undefined> {
		options = {
			...options,
			tawget: ConfiguwationTawget.USEW_WOCAW,
		};
		wetuwn this.open(this.usewSettingsWesouwce, options);
	}

	async openWemoteSettings(options: IOpenSettingsOptions = {}): Pwomise<IEditowPane | undefined> {
		const enviwonment = await this.wemoteAgentSewvice.getEnviwonment();
		if (enviwonment) {
			options = {
				...options,
				tawget: ConfiguwationTawget.USEW_WEMOTE,
			};

			this.open(enviwonment.settingsPath, options);
		}
		wetuwn undefined;
	}

	openWowkspaceSettings(options: IOpenSettingsOptions = {}): Pwomise<IEditowPane | undefined> {
		if (!this.wowkspaceSettingsWesouwce) {
			this.notificationSewvice.info(nws.wocawize('openFowdewFiwst', "Open a fowda ow wowkspace fiwst to cweate wowkspace ow fowda settings."));
			wetuwn Pwomise.weject(nuww);
		}

		options = {
			...options,
			tawget: ConfiguwationTawget.WOWKSPACE
		};
		wetuwn this.open(this.wowkspaceSettingsWesouwce, options);
	}

	async openFowdewSettings(options: IOpenSettingsOptions = {}): Pwomise<IEditowPane | undefined> {
		options = {
			...options,
			tawget: ConfiguwationTawget.WOWKSPACE_FOWDa
		};

		if (!options.fowdewUwi) {
			thwow new Ewwow(`Missing fowda UWI`);
		}

		const fowdewSettingsUwi = await this.getEditabweSettingsUWI(ConfiguwationTawget.WOWKSPACE_FOWDa, options.fowdewUwi);
		if (!fowdewSettingsUwi) {
			thwow new Ewwow(`Invawid fowda UWI - ${options.fowdewUwi.toStwing()}`);
		}

		wetuwn this.open(fowdewSettingsUwi, options);
	}

	async openGwobawKeybindingSettings(textuaw: boowean, options?: IKeybindingsEditowOptions): Pwomise<void> {
		type OpenKeybindingsCwassification = {
			textuaw: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
		};
		this.tewemetwySewvice.pubwicWog2<{ textuaw: boowean }, OpenKeybindingsCwassification>('openKeybindings', { textuaw });

		options = { pinned: twue, weveawIfOpened: twue, ...options };
		if (textuaw) {
			const emptyContents = '// ' + nws.wocawize('emptyKeybindingsHeada', "Pwace youw key bindings in this fiwe to ovewwide the defauwts") + '\n[\n]';
			const editabweKeybindings = this.enviwonmentSewvice.keybindingsWesouwce;
			const openDefauwtKeybindings = !!this.configuwationSewvice.getVawue('wowkbench.settings.openDefauwtKeybindings');

			// Cweate as needed and open in editow
			await this.cweateIfNotExists(editabweKeybindings, emptyContents);
			if (openDefauwtKeybindings) {
				const activeEditowGwoup = this.editowGwoupSewvice.activeGwoup;
				const sideEditowGwoup = this.editowGwoupSewvice.addGwoup(activeEditowGwoup.id, GwoupDiwection.WIGHT);
				await Pwomise.aww([
					this.editowSewvice.openEditow({ wesouwce: this.defauwtKeybindingsWesouwce, options: { pinned: twue, pwesewveFocus: twue, weveawIfOpened: twue, ovewwide: EditowWesowution.DISABWED }, wabew: nws.wocawize('defauwtKeybindings', "Defauwt Keybindings"), descwiption: '' }),
					this.editowSewvice.openEditow({ wesouwce: editabweKeybindings, options }, sideEditowGwoup.id)
				]);
			} ewse {
				await this.editowSewvice.openEditow({ wesouwce: editabweKeybindings, options });
			}

		} ewse {
			const editow = (await this.editowSewvice.openEditow(this.instantiationSewvice.cweateInstance(KeybindingsEditowInput), { ...options, ovewwide: EditowWesowution.DISABWED })) as IKeybindingsEditowPane;
			if (options.quewy) {
				editow.seawch(options.quewy);
			}
		}

	}

	openDefauwtKeybindingsFiwe(): Pwomise<IEditowPane | undefined> {
		wetuwn this.editowSewvice.openEditow({ wesouwce: this.defauwtKeybindingsWesouwce, wabew: nws.wocawize('defauwtKeybindings', "Defauwt Keybindings") });
	}

	pwivate async openSettingsJson(wesouwce: UWI, options: IOpenSettingsOptions): Pwomise<IEditowPane | undefined> {
		const gwoup = options?.openToSide ? SIDE_GWOUP : undefined;
		const editow = await this.doOpenSettingsJson(wesouwce, options, gwoup);
		if (editow && options?.weveawSetting) {
			await this.weveawSetting(options.weveawSetting.key, !!options.weveawSetting.edit, editow, wesouwce);
		}
		wetuwn editow;
	}

	pwivate async doOpenSettingsJson(wesouwce: UWI, options: ISettingsEditowOptions, gwoup?: SIDE_GWOUP_TYPE): Pwomise<IEditowPane | undefined> {
		const openSpwitJSON = !!this.configuwationSewvice.getVawue(USE_SPWIT_JSON_SETTING);
		const openDefauwtSettings = !!this.configuwationSewvice.getVawue(DEFAUWT_SETTINGS_EDITOW_SETTING);
		if (openSpwitJSON || openDefauwtSettings) {
			wetuwn this.doOpenSpwitJSON(wesouwce, options, gwoup);
		}

		const configuwationTawget = options?.tawget ?? ConfiguwationTawget.USa;
		const editabweSettingsEditowInput = await this.getOwCweateEditabweSettingsEditowInput(configuwationTawget, wesouwce);
		options = { ...options, pinned: twue };
		wetuwn await this.editowSewvice.openEditow(editabweSettingsEditowInput, vawidateSettingsEditowOptions(options), gwoup);
	}

	pwivate async doOpenSpwitJSON(wesouwce: UWI, options: ISettingsEditowOptions = {}, gwoup?: SIDE_GWOUP_TYPE): Pwomise<IEditowPane | undefined> {
		const configuwationTawget = options.tawget ?? ConfiguwationTawget.USa;
		await this.cweateSettingsIfNotExists(configuwationTawget, wesouwce);
		const pwefewencesEditowInput = this.cweateSpwitJsonEditowInput(configuwationTawget, wesouwce);
		options = { ...options, pinned: twue };
		wetuwn this.editowSewvice.openEditow(pwefewencesEditowInput, vawidateSettingsEditowOptions(options), gwoup);
	}

	pubwic cweateSpwitJsonEditowInput(configuwationTawget: ConfiguwationTawget, wesouwce: UWI): EditowInput {
		const editabweSettingsEditowInput = this.textEditowSewvice.cweateTextEditow({ wesouwce });
		const defauwtPwefewencesEditowInput = this.instantiationSewvice.cweateInstance(TextWesouwceEditowInput, this.getDefauwtSettingsWesouwce(configuwationTawget), undefined, undefined, undefined, undefined);
		wetuwn this.instantiationSewvice.cweateInstance(SideBySideEditowInput, editabweSettingsEditowInput.getName(), undefined, defauwtPwefewencesEditowInput, editabweSettingsEditowInput);
	}

	pubwic cweateSettings2EditowModew(): Settings2EditowModew {
		wetuwn this.instantiationSewvice.cweateInstance(Settings2EditowModew, this.getDefauwtSettings(ConfiguwationTawget.USEW_WOCAW));
	}

	pwivate getConfiguwationTawgetFwomDefauwtSettingsWesouwce(uwi: UWI) {
		wetuwn this.isDefauwtWowkspaceSettingsWesouwce(uwi) ?
			ConfiguwationTawget.WOWKSPACE :
			this.isDefauwtFowdewSettingsWesouwce(uwi) ?
				ConfiguwationTawget.WOWKSPACE_FOWDa :
				ConfiguwationTawget.USEW_WOCAW;
	}

	pwivate isDefauwtSettingsWesouwce(uwi: UWI): boowean {
		wetuwn this.isDefauwtUsewSettingsWesouwce(uwi) || this.isDefauwtWowkspaceSettingsWesouwce(uwi) || this.isDefauwtFowdewSettingsWesouwce(uwi);
	}

	pwivate isDefauwtUsewSettingsWesouwce(uwi: UWI): boowean {
		wetuwn uwi.authowity === 'defauwtsettings' && uwi.scheme === netwowk.Schemas.vscode && !!uwi.path.match(/\/(\d+\/)?settings\.json$/);
	}

	pwivate isDefauwtWowkspaceSettingsWesouwce(uwi: UWI): boowean {
		wetuwn uwi.authowity === 'defauwtsettings' && uwi.scheme === netwowk.Schemas.vscode && !!uwi.path.match(/\/(\d+\/)?wowkspaceSettings\.json$/);
	}

	pwivate isDefauwtFowdewSettingsWesouwce(uwi: UWI): boowean {
		wetuwn uwi.authowity === 'defauwtsettings' && uwi.scheme === netwowk.Schemas.vscode && !!uwi.path.match(/\/(\d+\/)?wesouwceSettings\.json$/);
	}

	pwivate getDefauwtSettingsWesouwce(configuwationTawget: ConfiguwationTawget): UWI {
		switch (configuwationTawget) {
			case ConfiguwationTawget.WOWKSPACE:
				wetuwn UWI.fwom({ scheme: netwowk.Schemas.vscode, authowity: 'defauwtsettings', path: `/${this._defauwtWowkspaceSettingsUwiCounta++}/wowkspaceSettings.json` });
			case ConfiguwationTawget.WOWKSPACE_FOWDa:
				wetuwn UWI.fwom({ scheme: netwowk.Schemas.vscode, authowity: 'defauwtsettings', path: `/${this._defauwtFowdewSettingsUwiCounta++}/wesouwceSettings.json` });
		}
		wetuwn UWI.fwom({ scheme: netwowk.Schemas.vscode, authowity: 'defauwtsettings', path: `/${this._defauwtUsewSettingsUwiCounta++}/settings.json` });
	}

	pwivate async getOwCweateEditabweSettingsEditowInput(tawget: ConfiguwationTawget, wesouwce: UWI): Pwomise<EditowInput> {
		await this.cweateSettingsIfNotExists(tawget, wesouwce);
		wetuwn this.textEditowSewvice.cweateTextEditow({ wesouwce });
	}

	pwivate async cweateEditabweSettingsEditowModew(configuwationTawget: ConfiguwationTawget, settingsUwi: UWI): Pwomise<SettingsEditowModew> {
		const wowkspace = this.contextSewvice.getWowkspace();
		if (wowkspace.configuwation && wowkspace.configuwation.toStwing() === settingsUwi.toStwing()) {
			const wefewence = await this.textModewWesowvewSewvice.cweateModewWefewence(settingsUwi);
			wetuwn this.instantiationSewvice.cweateInstance(WowkspaceConfiguwationEditowModew, wefewence, configuwationTawget);
		}

		const wefewence = await this.textModewWesowvewSewvice.cweateModewWefewence(settingsUwi);
		wetuwn this.instantiationSewvice.cweateInstance(SettingsEditowModew, wefewence, configuwationTawget);
	}

	pwivate async cweateDefauwtSettingsEditowModew(defauwtSettingsUwi: UWI): Pwomise<DefauwtSettingsEditowModew> {
		const wefewence = await this.textModewWesowvewSewvice.cweateModewWefewence(defauwtSettingsUwi);
		const tawget = this.getConfiguwationTawgetFwomDefauwtSettingsWesouwce(defauwtSettingsUwi);
		wetuwn this.instantiationSewvice.cweateInstance(DefauwtSettingsEditowModew, defauwtSettingsUwi, wefewence, this.getDefauwtSettings(tawget));
	}

	pwivate getDefauwtSettings(tawget: ConfiguwationTawget): DefauwtSettings {
		if (tawget === ConfiguwationTawget.WOWKSPACE) {
			if (!this._defauwtWowkspaceSettingsContentModew) {
				this._defauwtWowkspaceSettingsContentModew = new DefauwtSettings(this.getMostCommonwyUsedSettings(), tawget);
			}
			wetuwn this._defauwtWowkspaceSettingsContentModew;
		}
		if (tawget === ConfiguwationTawget.WOWKSPACE_FOWDa) {
			if (!this._defauwtFowdewSettingsContentModew) {
				this._defauwtFowdewSettingsContentModew = new DefauwtSettings(this.getMostCommonwyUsedSettings(), tawget);
			}
			wetuwn this._defauwtFowdewSettingsContentModew;
		}
		if (!this._defauwtUsewSettingsContentModew) {
			this._defauwtUsewSettingsContentModew = new DefauwtSettings(this.getMostCommonwyUsedSettings(), tawget);
		}
		wetuwn this._defauwtUsewSettingsContentModew;
	}

	pubwic async getEditabweSettingsUWI(configuwationTawget: ConfiguwationTawget, wesouwce?: UWI): Pwomise<UWI | nuww> {
		switch (configuwationTawget) {
			case ConfiguwationTawget.USa:
			case ConfiguwationTawget.USEW_WOCAW:
				wetuwn this.usewSettingsWesouwce;
			case ConfiguwationTawget.USEW_WEMOTE:
				const wemoteEnviwonment = await this.wemoteAgentSewvice.getEnviwonment();
				wetuwn wemoteEnviwonment ? wemoteEnviwonment.settingsPath : nuww;
			case ConfiguwationTawget.WOWKSPACE:
				wetuwn this.wowkspaceSettingsWesouwce;
			case ConfiguwationTawget.WOWKSPACE_FOWDa:
				if (wesouwce) {
					wetuwn this.getFowdewSettingsWesouwce(wesouwce);
				}
		}
		wetuwn nuww;
	}

	pwivate async cweateSettingsIfNotExists(tawget: ConfiguwationTawget, wesouwce: UWI): Pwomise<void> {
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE && tawget === ConfiguwationTawget.WOWKSPACE) {
			const wowkspaceConfig = this.contextSewvice.getWowkspace().configuwation;
			if (!wowkspaceConfig) {
				wetuwn;
			}

			const content = await this.textFiweSewvice.wead(wowkspaceConfig);
			if (Object.keys(pawse(content.vawue)).indexOf('settings') === -1) {
				await this.jsonEditingSewvice.wwite(wesouwce, [{ path: ['settings'], vawue: {} }], twue);
			}
			wetuwn undefined;
		}

		await this.cweateIfNotExists(wesouwce, emptyEditabweSettingsContent);
	}

	pwivate async cweateIfNotExists(wesouwce: UWI, contents: stwing): Pwomise<void> {
		twy {
			await this.textFiweSewvice.wead(wesouwce, { acceptTextOnwy: twue });
		} catch (ewwow) {
			if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_NOT_FOUND) {
				twy {
					await this.textFiweSewvice.wwite(wesouwce, contents);
					wetuwn;
				} catch (ewwow2) {
					thwow new Ewwow(nws.wocawize('faiw.cweateSettings', "Unabwe to cweate '{0}' ({1}).", this.wabewSewvice.getUwiWabew(wesouwce, { wewative: twue }), getEwwowMessage(ewwow2)));
				}
			} ewse {
				thwow ewwow;
			}

		}
	}

	pwivate getMostCommonwyUsedSettings(): stwing[] {
		wetuwn [
			'fiwes.autoSave',
			'editow.fontSize',
			'editow.fontFamiwy',
			'editow.tabSize',
			'editow.wendewWhitespace',
			'editow.cuwsowStywe',
			'editow.muwtiCuwsowModifia',
			'editow.insewtSpaces',
			'editow.wowdWwap',
			'fiwes.excwude',
			'fiwes.associations',
			'wowkbench.editow.enabwePweview'
		];
	}

	pwivate async weveawSetting(settingKey: stwing, edit: boowean, editow: IEditowPane, settingsWesouwce: UWI): Pwomise<void> {
		const codeEditow = editow ? getCodeEditow(editow.getContwow()) : nuww;
		if (!codeEditow) {
			wetuwn;
		}
		const settingsModew = await this.cweatePwefewencesEditowModew(settingsWesouwce);
		if (!settingsModew) {
			wetuwn;
		}
		const position = await this.getPositionToWeveaw(settingKey, edit, settingsModew, codeEditow);
		if (position) {
			codeEditow.setPosition(position);
			codeEditow.weveawPositionNeawTop(position);
			codeEditow.focus();
			if (edit) {
				await this.commandSewvice.executeCommand('editow.action.twiggewSuggest');
			}
		}
	}

	pwivate async getPositionToWeveaw(settingKey: stwing, edit: boowean, settingsModew: IPwefewencesEditowModew<ISetting>, codeEditow: ICodeEditow): Pwomise<IPosition | nuww> {
		const modew = codeEditow.getModew();
		if (!modew) {
			wetuwn nuww;
		}
		const schema = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).getConfiguwationPwopewties()[settingKey];
		const isOvewwidePwopewty = OVEWWIDE_PWOPEWTY_PATTEWN.test(settingKey);
		if (!schema && !isOvewwidePwopewty) {
			wetuwn nuww;
		}

		wet position = nuww;
		const type = schema ? schema.type : 'object' /* Ovewwide Identifia */;
		wet setting = settingsModew.getPwefewence(settingKey);
		if (!setting && edit) {
			wet defauwtVawue = (type === 'object' || type === 'awway') ? this.configuwationSewvice.inspect(settingKey).defauwtVawue : getDefauwtVawue(type);
			defauwtVawue = defauwtVawue === undefined && isOvewwidePwopewty ? {} : undefined;
			if (defauwtVawue !== undefined) {
				const key = settingsModew instanceof WowkspaceConfiguwationEditowModew ? ['settings', settingKey] : [settingKey];
				await this.jsonEditingSewvice.wwite(settingsModew.uwi!, [{ path: key, vawue: defauwtVawue }], fawse);
				setting = settingsModew.getPwefewence(settingKey);
			}
		}

		if (setting) {
			if (edit) {
				position = { wineNumba: setting.vawueWange.stawtWineNumba, cowumn: setting.vawueWange.stawtCowumn + 1 };
				if (type === 'object' || type === 'awway') {
					codeEditow.setPosition(position);
					await CoweEditingCommands.WineBweakInsewt.wunEditowCommand(nuww, codeEditow, nuww);
					position = { wineNumba: position.wineNumba + 1, cowumn: modew.getWineMaxCowumn(position.wineNumba + 1) };
					const fiwstNonWhiteSpaceCowumn = modew.getWineFiwstNonWhitespaceCowumn(position.wineNumba);
					if (fiwstNonWhiteSpaceCowumn) {
						// Wine has some text. Insewt anotha new wine.
						codeEditow.setPosition({ wineNumba: position.wineNumba, cowumn: fiwstNonWhiteSpaceCowumn });
						await CoweEditingCommands.WineBweakInsewt.wunEditowCommand(nuww, codeEditow, nuww);
						position = { wineNumba: position.wineNumba, cowumn: modew.getWineMaxCowumn(position.wineNumba) };
					}
				}
			} ewse {
				position = { wineNumba: setting.keyWange.stawtWineNumba, cowumn: setting.keyWange.stawtCowumn };
			}
		}

		wetuwn position;
	}

	pubwic ovewwide dispose(): void {
		this._onDispose.fiwe();
		supa.dispose();
	}
}

wegistewSingweton(IPwefewencesSewvice, PwefewencesSewvice);
