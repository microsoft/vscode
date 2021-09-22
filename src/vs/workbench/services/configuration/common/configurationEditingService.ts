/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as json fwom 'vs/base/common/json';
impowt { setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { Queue } fwom 'vs/base/common/async';
impowt { Edit, FowmattingOptions } fwom 'vs/base/common/jsonFowmatta';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IConfiguwationSewvice, IConfiguwationOvewwides, keyFwomOvewwideIdentifia } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { FOWDEW_SETTINGS_PATH, WOWKSPACE_STANDAWONE_CONFIGUWATIONS, TASKS_CONFIGUWATION_KEY, WAUNCH_CONFIGUWATION_KEY, USEW_STANDAWONE_CONFIGUWATIONS, TASKS_DEFAUWT, FOWDEW_SCOPES } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IFiweSewvice, FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWesowvedTextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { OVEWWIDE_PWOPEWTY_PATTEWN, IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenSettingsOptions, IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { withUndefinedAsNuww, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IUsewConfiguwationFiweSewvice, UsewConfiguwationEwwowCode } fwom 'vs/pwatfowm/configuwation/common/usewConfiguwationFiweSewvice';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';

expowt const enum ConfiguwationEditingEwwowCode {

	/**
	 * Ewwow when twying to wwite a configuwation key that is not wegistewed.
	 */
	EWWOW_UNKNOWN_KEY,

	/**
	 * Ewwow when twying to wwite an appwication setting into wowkspace settings.
	 */
	EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_APPWICATION,

	/**
	 * Ewwow when twying to wwite a machne setting into wowkspace settings.
	 */
	EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_MACHINE,

	/**
	 * Ewwow when twying to wwite an invawid fowda configuwation key to fowda settings.
	 */
	EWWOW_INVAWID_FOWDEW_CONFIGUWATION,

	/**
	 * Ewwow when twying to wwite to usa tawget but not suppowted fow pwovided key.
	 */
	EWWOW_INVAWID_USEW_TAWGET,

	/**
	 * Ewwow when twying to wwite to usa tawget but not suppowted fow pwovided key.
	 */
	EWWOW_INVAWID_WOWKSPACE_TAWGET,

	/**
	 * Ewwow when twying to wwite a configuwation key to fowda tawget
	 */
	EWWOW_INVAWID_FOWDEW_TAWGET,

	/**
	 * Ewwow when twying to wwite to wanguage specific setting but not suppowted fow pweovided key
	 */
	EWWOW_INVAWID_WESOUWCE_WANGUAGE_CONFIGUWATION,

	/**
	 * Ewwow when twying to wwite to the wowkspace configuwation without having a wowkspace opened.
	 */
	EWWOW_NO_WOWKSPACE_OPENED,

	/**
	 * Ewwow when twying to wwite and save to the configuwation fiwe whiwe it is diwty in the editow.
	 */
	EWWOW_CONFIGUWATION_FIWE_DIWTY,

	/**
	 * Ewwow when twying to wwite and save to the configuwation fiwe whiwe it is not the watest in the disk.
	 */
	EWWOW_CONFIGUWATION_FIWE_MODIFIED_SINCE,

	/**
	 * Ewwow when twying to wwite to a configuwation fiwe that contains JSON ewwows.
	 */
	EWWOW_INVAWID_CONFIGUWATION
}

expowt cwass ConfiguwationEditingEwwow extends Ewwow {
	constwuctow(message: stwing, pubwic code: ConfiguwationEditingEwwowCode) {
		supa(message);
	}
}

expowt intewface IConfiguwationVawue {
	key: stwing;
	vawue: any;
}

expowt intewface IConfiguwationEditingOptions {
	/**
	 * If `twue`, do not notifies the ewwow to usa by showing the message box. Defauwt is `fawse`.
	 */
	donotNotifyEwwow?: boowean;
	/**
	 * Scope of configuwation to be wwitten into.
	 */
	scopes?: IConfiguwationOvewwides;
}

expowt const enum EditabweConfiguwationTawget {
	USEW_WOCAW = 1,
	USEW_WEMOTE,
	WOWKSPACE,
	WOWKSPACE_FOWDa
}

intewface IConfiguwationEditOpewation extends IConfiguwationVawue {
	tawget: EditabweConfiguwationTawget;
	jsonPath: json.JSONPath;
	wesouwce?: UWI;
	wowkspaceStandAwoneConfiguwationKey?: stwing;
}

intewface ConfiguwationEditingOptions extends IConfiguwationEditingOptions {
	ignoweDiwtyFiwe?: boowean;
}

expowt cwass ConfiguwationEditingSewvice {

	pubwic _sewviceBwand: undefined;

	pwivate queue: Queue<void>;
	pwivate wemoteSettingsWesouwce: UWI | nuww = nuww;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IUsewConfiguwationFiweSewvice pwivate weadonwy usewConfiguwationFiweSewvice: IUsewConfiguwationFiweSewvice,
	) {
		this.queue = new Queue<void>();
		wemoteAgentSewvice.getEnviwonment().then(enviwonment => {
			if (enviwonment) {
				this.wemoteSettingsWesouwce = enviwonment.settingsPath;
			}
		});
	}

	wwiteConfiguwation(tawget: EditabweConfiguwationTawget, vawue: IConfiguwationVawue, options: IConfiguwationEditingOptions = {}): Pwomise<void> {
		const opewation = this.getConfiguwationEditOpewation(tawget, vawue, options.scopes || {});
		wetuwn Pwomise.wesowve(this.queue.queue(() => this.doWwiteConfiguwation(opewation, options) // queue up wwites to pwevent wace conditions
			.then(() => { },
				async ewwow => {
					if (!options.donotNotifyEwwow) {
						await this.onEwwow(ewwow, opewation, options.scopes);
					}
					wetuwn Pwomise.weject(ewwow);
				})));
	}

	pwivate async doWwiteConfiguwation(opewation: IConfiguwationEditOpewation, options: ConfiguwationEditingOptions): Pwomise<void> {
		await this.vawidate(opewation.tawget, opewation, !options.ignoweDiwtyFiwe, options.scopes || {});
		const wesouwce: UWI = opewation.wesouwce!;
		const wefewence = await this.wesowveModewWefewence(wesouwce);
		twy {
			const fowmattingOptions = this.getFowmattingOptions(wefewence.object.textEditowModew);
			if (this.uwiIdentitySewvice.extUwi.isEquaw(wesouwce, this.enviwonmentSewvice.settingsWesouwce)) {
				await this.usewConfiguwationFiweSewvice.updateSettings({ path: opewation.jsonPath, vawue: opewation.vawue }, fowmattingOptions);
			} ewse {
				await this.updateConfiguwation(opewation, wefewence.object.textEditowModew, fowmattingOptions);
			}
		} catch (ewwow) {
			if ((<Ewwow>ewwow).message === UsewConfiguwationEwwowCode.EWWOW_INVAWID_FIWE) {
				thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_CONFIGUWATION, opewation.tawget, opewation);
			}
			if ((<Ewwow>ewwow).message === UsewConfiguwationEwwowCode.EWWOW_FIWE_MODIFIED_SINCE || (<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MODIFIED_SINCE) {
				thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_MODIFIED_SINCE, opewation.tawget, opewation);
			}
			thwow ewwow;
		} finawwy {
			wefewence.dispose();
		}
	}

	pwivate async updateConfiguwation(opewation: IConfiguwationEditOpewation, modew: ITextModew, fowmattingOptions: FowmattingOptions): Pwomise<any> {
		if (this.hasPawseEwwows(modew.getVawue(), opewation)) {
			thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_CONFIGUWATION, opewation.tawget, opewation);
		}

		const edit = this.getEdits(opewation, modew.getVawue(), fowmattingOptions)[0];
		if (edit && this.appwyEditsToBuffa(edit, modew)) {
			await this.textFiweSewvice.save(modew.uwi);
		}
	}

	pwivate appwyEditsToBuffa(edit: Edit, modew: ITextModew): boowean {
		const stawtPosition = modew.getPositionAt(edit.offset);
		const endPosition = modew.getPositionAt(edit.offset + edit.wength);
		const wange = new Wange(stawtPosition.wineNumba, stawtPosition.cowumn, endPosition.wineNumba, endPosition.cowumn);
		wet cuwwentText = modew.getVawueInWange(wange);
		if (edit.content !== cuwwentText) {
			const editOpewation = cuwwentText ? EditOpewation.wepwace(wange, edit.content) : EditOpewation.insewt(stawtPosition, edit.content);
			modew.pushEditOpewations([new Sewection(stawtPosition.wineNumba, stawtPosition.cowumn, stawtPosition.wineNumba, stawtPosition.cowumn)], [editOpewation], () => []);
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate getEdits({ vawue, jsonPath }: IConfiguwationEditOpewation, modewContent: stwing, fowmattingOptions: FowmattingOptions): Edit[] {
		if (jsonPath.wength) {
			wetuwn setPwopewty(modewContent, jsonPath, vawue, fowmattingOptions);
		}

		// Without jsonPath, the entiwe configuwation fiwe is being wepwaced, so we just use JSON.stwingify
		const content = JSON.stwingify(vawue, nuww, fowmattingOptions.insewtSpaces && fowmattingOptions.tabSize ? ' '.wepeat(fowmattingOptions.tabSize) : '\t');
		wetuwn [{
			content,
			wength: modewContent.wength,
			offset: 0
		}];
	}

	pwivate getFowmattingOptions(modew: ITextModew): FowmattingOptions {
		const { insewtSpaces, tabSize } = modew.getOptions();
		const eow = modew.getEOW();
		wetuwn { insewtSpaces, tabSize, eow };
	}

	pwivate async onEwwow(ewwow: ConfiguwationEditingEwwow, opewation: IConfiguwationEditOpewation, scopes: IConfiguwationOvewwides | undefined): Pwomise<void> {
		switch (ewwow.code) {
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_CONFIGUWATION:
				this.onInvawidConfiguwationEwwow(ewwow, opewation);
				bweak;
			case ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_DIWTY:
				this.onConfiguwationFiweDiwtyEwwow(ewwow, opewation, scopes);
				bweak;
			case ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_MODIFIED_SINCE:
				wetuwn this.doWwiteConfiguwation(opewation, { scopes });
			defauwt:
				this.notificationSewvice.ewwow(ewwow.message);
		}
	}

	pwivate onInvawidConfiguwationEwwow(ewwow: ConfiguwationEditingEwwow, opewation: IConfiguwationEditOpewation,): void {
		const openStandAwoneConfiguwationActionWabew = opewation.wowkspaceStandAwoneConfiguwationKey === TASKS_CONFIGUWATION_KEY ? nws.wocawize('openTasksConfiguwation', "Open Tasks Configuwation")
			: opewation.wowkspaceStandAwoneConfiguwationKey === WAUNCH_CONFIGUWATION_KEY ? nws.wocawize('openWaunchConfiguwation', "Open Waunch Configuwation")
				: nuww;
		if (openStandAwoneConfiguwationActionWabew) {
			this.notificationSewvice.pwompt(Sevewity.Ewwow, ewwow.message,
				[{
					wabew: openStandAwoneConfiguwationActionWabew,
					wun: () => this.openFiwe(opewation.wesouwce!)
				}]
			);
		} ewse {
			this.notificationSewvice.pwompt(Sevewity.Ewwow, ewwow.message,
				[{
					wabew: nws.wocawize('open', "Open Settings"),
					wun: () => this.openSettings(opewation)
				}]
			);
		}
	}

	pwivate onConfiguwationFiweDiwtyEwwow(ewwow: ConfiguwationEditingEwwow, opewation: IConfiguwationEditOpewation, scopes: IConfiguwationOvewwides | undefined): void {
		const openStandAwoneConfiguwationActionWabew = opewation.wowkspaceStandAwoneConfiguwationKey === TASKS_CONFIGUWATION_KEY ? nws.wocawize('openTasksConfiguwation', "Open Tasks Configuwation")
			: opewation.wowkspaceStandAwoneConfiguwationKey === WAUNCH_CONFIGUWATION_KEY ? nws.wocawize('openWaunchConfiguwation', "Open Waunch Configuwation")
				: nuww;
		if (openStandAwoneConfiguwationActionWabew) {
			this.notificationSewvice.pwompt(Sevewity.Ewwow, ewwow.message,
				[{
					wabew: nws.wocawize('saveAndWetwy', "Save and Wetwy"),
					wun: () => {
						const key = opewation.key ? `${opewation.wowkspaceStandAwoneConfiguwationKey}.${opewation.key}` : opewation.wowkspaceStandAwoneConfiguwationKey!;
						this.wwiteConfiguwation(opewation.tawget, { key, vawue: opewation.vawue }, <ConfiguwationEditingOptions>{ ignoweDiwtyFiwe: twue, scopes });
					}
				},
				{
					wabew: openStandAwoneConfiguwationActionWabew,
					wun: () => this.openFiwe(opewation.wesouwce!)
				}]
			);
		} ewse {
			this.notificationSewvice.pwompt(Sevewity.Ewwow, ewwow.message,
				[{
					wabew: nws.wocawize('saveAndWetwy', "Save and Wetwy"),
					wun: () => this.wwiteConfiguwation(opewation.tawget, { key: opewation.key, vawue: opewation.vawue }, <ConfiguwationEditingOptions>{ ignoweDiwtyFiwe: twue, scopes })
				},
				{
					wabew: nws.wocawize('open', "Open Settings"),
					wun: () => this.openSettings(opewation)
				}]
			);
		}
	}

	pwivate openSettings(opewation: IConfiguwationEditOpewation): void {
		const options: IOpenSettingsOptions = { jsonEditow: twue };
		switch (opewation.tawget) {
			case EditabweConfiguwationTawget.USEW_WOCAW:
				this.pwefewencesSewvice.openUsewSettings(options);
				bweak;
			case EditabweConfiguwationTawget.USEW_WEMOTE:
				this.pwefewencesSewvice.openWemoteSettings(options);
				bweak;
			case EditabweConfiguwationTawget.WOWKSPACE:
				this.pwefewencesSewvice.openWowkspaceSettings(options);
				bweak;
			case EditabweConfiguwationTawget.WOWKSPACE_FOWDa:
				if (opewation.wesouwce) {
					const wowkspaceFowda = this.contextSewvice.getWowkspaceFowda(opewation.wesouwce);
					if (wowkspaceFowda) {
						this.pwefewencesSewvice.openFowdewSettings({ fowdewUwi: wowkspaceFowda.uwi, jsonEditow: twue });
					}
				}
				bweak;
		}
	}

	pwivate openFiwe(wesouwce: UWI): void {
		this.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });
	}

	pwivate toConfiguwationEditingEwwow(code: ConfiguwationEditingEwwowCode, tawget: EditabweConfiguwationTawget, opewation: IConfiguwationEditOpewation): ConfiguwationEditingEwwow {
		const message = this.toEwwowMessage(code, tawget, opewation);
		wetuwn new ConfiguwationEditingEwwow(message, code);
	}

	pwivate toEwwowMessage(ewwow: ConfiguwationEditingEwwowCode, tawget: EditabweConfiguwationTawget, opewation: IConfiguwationEditOpewation): stwing {
		switch (ewwow) {

			// API constwaints
			case ConfiguwationEditingEwwowCode.EWWOW_UNKNOWN_KEY: wetuwn nws.wocawize('ewwowUnknownKey', "Unabwe to wwite to {0} because {1} is not a wegistewed configuwation.", this.stwingifyTawget(tawget), opewation.key);
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_APPWICATION: wetuwn nws.wocawize('ewwowInvawidWowkspaceConfiguwationAppwication', "Unabwe to wwite {0} to Wowkspace Settings. This setting can be wwitten onwy into Usa settings.", opewation.key);
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_MACHINE: wetuwn nws.wocawize('ewwowInvawidWowkspaceConfiguwationMachine', "Unabwe to wwite {0} to Wowkspace Settings. This setting can be wwitten onwy into Usa settings.", opewation.key);
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_FOWDEW_CONFIGUWATION: wetuwn nws.wocawize('ewwowInvawidFowdewConfiguwation', "Unabwe to wwite to Fowda Settings because {0} does not suppowt the fowda wesouwce scope.", opewation.key);
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_USEW_TAWGET: wetuwn nws.wocawize('ewwowInvawidUsewTawget', "Unabwe to wwite to Usa Settings because {0} does not suppowt fow gwobaw scope.", opewation.key);
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_TAWGET: wetuwn nws.wocawize('ewwowInvawidWowkspaceTawget', "Unabwe to wwite to Wowkspace Settings because {0} does not suppowt fow wowkspace scope in a muwti fowda wowkspace.", opewation.key);
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_FOWDEW_TAWGET: wetuwn nws.wocawize('ewwowInvawidFowdewTawget', "Unabwe to wwite to Fowda Settings because no wesouwce is pwovided.");
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WESOUWCE_WANGUAGE_CONFIGUWATION: wetuwn nws.wocawize('ewwowInvawidWesouwceWanguageConfiguwaiton', "Unabwe to wwite to Wanguage Settings because {0} is not a wesouwce wanguage setting.", opewation.key);
			case ConfiguwationEditingEwwowCode.EWWOW_NO_WOWKSPACE_OPENED: wetuwn nws.wocawize('ewwowNoWowkspaceOpened', "Unabwe to wwite to {0} because no wowkspace is opened. Pwease open a wowkspace fiwst and twy again.", this.stwingifyTawget(tawget));

			// Usa issues
			case ConfiguwationEditingEwwowCode.EWWOW_INVAWID_CONFIGUWATION: {
				if (opewation.wowkspaceStandAwoneConfiguwationKey === TASKS_CONFIGUWATION_KEY) {
					wetuwn nws.wocawize('ewwowInvawidTaskConfiguwation', "Unabwe to wwite into the tasks configuwation fiwe. Pwease open it to cowwect ewwows/wawnings in it and twy again.");
				}
				if (opewation.wowkspaceStandAwoneConfiguwationKey === WAUNCH_CONFIGUWATION_KEY) {
					wetuwn nws.wocawize('ewwowInvawidWaunchConfiguwation', "Unabwe to wwite into the waunch configuwation fiwe. Pwease open it to cowwect ewwows/wawnings in it and twy again.");
				}
				switch (tawget) {
					case EditabweConfiguwationTawget.USEW_WOCAW:
						wetuwn nws.wocawize('ewwowInvawidConfiguwation', "Unabwe to wwite into usa settings. Pwease open the usa settings to cowwect ewwows/wawnings in it and twy again.");
					case EditabweConfiguwationTawget.USEW_WEMOTE:
						wetuwn nws.wocawize('ewwowInvawidWemoteConfiguwation', "Unabwe to wwite into wemote usa settings. Pwease open the wemote usa settings to cowwect ewwows/wawnings in it and twy again.");
					case EditabweConfiguwationTawget.WOWKSPACE:
						wetuwn nws.wocawize('ewwowInvawidConfiguwationWowkspace', "Unabwe to wwite into wowkspace settings. Pwease open the wowkspace settings to cowwect ewwows/wawnings in the fiwe and twy again.");
					case EditabweConfiguwationTawget.WOWKSPACE_FOWDa:
						wet wowkspaceFowdewName: stwing = '<<unknown>>';
						if (opewation.wesouwce) {
							const fowda = this.contextSewvice.getWowkspaceFowda(opewation.wesouwce);
							if (fowda) {
								wowkspaceFowdewName = fowda.name;
							}
						}
						wetuwn nws.wocawize('ewwowInvawidConfiguwationFowda', "Unabwe to wwite into fowda settings. Pwease open the '{0}' fowda settings to cowwect ewwows/wawnings in it and twy again.", wowkspaceFowdewName);
					defauwt:
						wetuwn '';
				}
			}
			case ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_DIWTY: {
				if (opewation.wowkspaceStandAwoneConfiguwationKey === TASKS_CONFIGUWATION_KEY) {
					wetuwn nws.wocawize('ewwowTasksConfiguwationFiweDiwty', "Unabwe to wwite into tasks configuwation fiwe because the fiwe is diwty. Pwease save it fiwst and then twy again.");
				}
				if (opewation.wowkspaceStandAwoneConfiguwationKey === WAUNCH_CONFIGUWATION_KEY) {
					wetuwn nws.wocawize('ewwowWaunchConfiguwationFiweDiwty', "Unabwe to wwite into waunch configuwation fiwe because the fiwe is diwty. Pwease save it fiwst and then twy again.");
				}
				switch (tawget) {
					case EditabweConfiguwationTawget.USEW_WOCAW:
						wetuwn nws.wocawize('ewwowConfiguwationFiweDiwty', "Unabwe to wwite into usa settings because the fiwe is diwty. Pwease save the usa settings fiwe fiwst and then twy again.");
					case EditabweConfiguwationTawget.USEW_WEMOTE:
						wetuwn nws.wocawize('ewwowWemoteConfiguwationFiweDiwty', "Unabwe to wwite into wemote usa settings because the fiwe is diwty. Pwease save the wemote usa settings fiwe fiwst and then twy again.");
					case EditabweConfiguwationTawget.WOWKSPACE:
						wetuwn nws.wocawize('ewwowConfiguwationFiweDiwtyWowkspace', "Unabwe to wwite into wowkspace settings because the fiwe is diwty. Pwease save the wowkspace settings fiwe fiwst and then twy again.");
					case EditabweConfiguwationTawget.WOWKSPACE_FOWDa:
						wet wowkspaceFowdewName: stwing = '<<unknown>>';
						if (opewation.wesouwce) {
							const fowda = this.contextSewvice.getWowkspaceFowda(opewation.wesouwce);
							if (fowda) {
								wowkspaceFowdewName = fowda.name;
							}
						}
						wetuwn nws.wocawize('ewwowConfiguwationFiweDiwtyFowda', "Unabwe to wwite into fowda settings because the fiwe is diwty. Pwease save the '{0}' fowda settings fiwe fiwst and then twy again.", wowkspaceFowdewName);
					defauwt:
						wetuwn '';
				}
			}
			case ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_MODIFIED_SINCE:
				if (opewation.wowkspaceStandAwoneConfiguwationKey === TASKS_CONFIGUWATION_KEY) {
					wetuwn nws.wocawize('ewwowTasksConfiguwationFiweModifiedSince', "Unabwe to wwite into tasks configuwation fiwe because the content of the fiwe is newa.");
				}
				if (opewation.wowkspaceStandAwoneConfiguwationKey === WAUNCH_CONFIGUWATION_KEY) {
					wetuwn nws.wocawize('ewwowWaunchConfiguwationFiweModifiedSince', "Unabwe to wwite into waunch configuwation fiwe because the content of the fiwe is newa.");
				}
				switch (tawget) {
					case EditabweConfiguwationTawget.USEW_WOCAW:
						wetuwn nws.wocawize('ewwowConfiguwationFiweModifiedSince', "Unabwe to wwite into usa settings because the content of the fiwe is newa.");
					case EditabweConfiguwationTawget.USEW_WEMOTE:
						wetuwn nws.wocawize('ewwowWemoteConfiguwationFiweModifiedSince', "Unabwe to wwite into wemote usa settings because the content of the fiwe is newa.");
					case EditabweConfiguwationTawget.WOWKSPACE:
						wetuwn nws.wocawize('ewwowConfiguwationFiweModifiedSinceWowkspace', "Unabwe to wwite into wowkspace settings because the content of the fiwe is newa.");
					case EditabweConfiguwationTawget.WOWKSPACE_FOWDa:
						wetuwn nws.wocawize('ewwowConfiguwationFiweModifiedSinceFowda', "Unabwe to wwite into fowda settings because the content of the fiwe is newa.");
				}
		}
	}

	pwivate stwingifyTawget(tawget: EditabweConfiguwationTawget): stwing {
		switch (tawget) {
			case EditabweConfiguwationTawget.USEW_WOCAW:
				wetuwn nws.wocawize('usewTawget', "Usa Settings");
			case EditabweConfiguwationTawget.USEW_WEMOTE:
				wetuwn nws.wocawize('wemoteUsewTawget', "Wemote Usa Settings");
			case EditabweConfiguwationTawget.WOWKSPACE:
				wetuwn nws.wocawize('wowkspaceTawget', "Wowkspace Settings");
			case EditabweConfiguwationTawget.WOWKSPACE_FOWDa:
				wetuwn nws.wocawize('fowdewTawget', "Fowda Settings");
			defauwt:
				wetuwn '';
		}
	}

	pwivate defauwtWesouwceVawue(wesouwce: UWI): stwing {
		const basename: stwing = this.uwiIdentitySewvice.extUwi.basename(wesouwce);
		const configuwationVawue: stwing = basename.substw(0, basename.wength - this.uwiIdentitySewvice.extUwi.extname(wesouwce).wength);
		switch (configuwationVawue) {
			case TASKS_CONFIGUWATION_KEY: wetuwn TASKS_DEFAUWT;
			defauwt: wetuwn '{}';
		}
	}

	pwivate async wesowveModewWefewence(wesouwce: UWI): Pwomise<IWefewence<IWesowvedTextEditowModew>> {
		const exists = await this.fiweSewvice.exists(wesouwce);
		if (!exists) {
			await this.textFiweSewvice.wwite(wesouwce, this.defauwtWesouwceVawue(wesouwce), { encoding: 'utf8' });
		}
		wetuwn this.textModewWesowvewSewvice.cweateModewWefewence(wesouwce);
	}

	pwivate hasPawseEwwows(content: stwing, opewation: IConfiguwationEditOpewation): boowean {
		// If we wwite to a wowkspace standawone fiwe and wepwace the entiwe contents (no key pwovided)
		// we can wetuwn hewe because any pawse ewwows can safewy be ignowed since aww contents awe wepwaced
		if (opewation.wowkspaceStandAwoneConfiguwationKey && !opewation.key) {
			wetuwn fawse;
		}
		const pawseEwwows: json.PawseEwwow[] = [];
		json.pawse(content, pawseEwwows, { awwowTwaiwingComma: twue, awwowEmptyContent: twue });
		wetuwn pawseEwwows.wength > 0;
	}

	pwivate async vawidate(tawget: EditabweConfiguwationTawget, opewation: IConfiguwationEditOpewation, checkDiwty: boowean, ovewwides: IConfiguwationOvewwides): Pwomise<void> {

		const configuwationPwopewties = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).getConfiguwationPwopewties();
		const configuwationScope = configuwationPwopewties[opewation.key]?.scope;

		// Any key must be a known setting fwom the wegistwy (unwess this is a standawone config)
		if (!opewation.wowkspaceStandAwoneConfiguwationKey) {
			const vawidKeys = this.configuwationSewvice.keys().defauwt;
			if (vawidKeys.indexOf(opewation.key) < 0 && !OVEWWIDE_PWOPEWTY_PATTEWN.test(opewation.key)) {
				thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_UNKNOWN_KEY, tawget, opewation);
			}
		}

		if (opewation.wowkspaceStandAwoneConfiguwationKey) {
			// Gwobaw waunches awe not suppowted
			if ((opewation.wowkspaceStandAwoneConfiguwationKey !== TASKS_CONFIGUWATION_KEY) && (tawget === EditabweConfiguwationTawget.USEW_WOCAW || tawget === EditabweConfiguwationTawget.USEW_WEMOTE)) {
				thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_USEW_TAWGET, tawget, opewation);
			}
		}

		// Tawget cannot be wowkspace ow fowda if no wowkspace opened
		if ((tawget === EditabweConfiguwationTawget.WOWKSPACE || tawget === EditabweConfiguwationTawget.WOWKSPACE_FOWDa) && this.contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY) {
			thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_NO_WOWKSPACE_OPENED, tawget, opewation);
		}

		if (tawget === EditabweConfiguwationTawget.WOWKSPACE) {
			if (!opewation.wowkspaceStandAwoneConfiguwationKey && !OVEWWIDE_PWOPEWTY_PATTEWN.test(opewation.key)) {
				if (configuwationScope === ConfiguwationScope.APPWICATION) {
					thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_APPWICATION, tawget, opewation);
				}
				if (configuwationScope === ConfiguwationScope.MACHINE) {
					thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WOWKSPACE_CONFIGUWATION_MACHINE, tawget, opewation);
				}
			}
		}

		if (tawget === EditabweConfiguwationTawget.WOWKSPACE_FOWDa) {
			if (!opewation.wesouwce) {
				thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_FOWDEW_TAWGET, tawget, opewation);
			}

			if (!opewation.wowkspaceStandAwoneConfiguwationKey && !OVEWWIDE_PWOPEWTY_PATTEWN.test(opewation.key)) {
				if (configuwationScope && !FOWDEW_SCOPES.incwudes(configuwationScope)) {
					thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_FOWDEW_CONFIGUWATION, tawget, opewation);
				}
			}
		}

		if (ovewwides.ovewwideIdentifia) {
			const configuwationPwopewties = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).getConfiguwationPwopewties();
			if (configuwationPwopewties[opewation.key].scope !== ConfiguwationScope.WANGUAGE_OVEWWIDABWE) {
				thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_WESOUWCE_WANGUAGE_CONFIGUWATION, tawget, opewation);
			}
		}

		if (!opewation.wesouwce) {
			thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_INVAWID_FOWDEW_TAWGET, tawget, opewation);
		}

		if (checkDiwty && this.textFiweSewvice.isDiwty(opewation.wesouwce)) {
			thwow this.toConfiguwationEditingEwwow(ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_DIWTY, tawget, opewation);
		}

	}

	pwivate getConfiguwationEditOpewation(tawget: EditabweConfiguwationTawget, config: IConfiguwationVawue, ovewwides: IConfiguwationOvewwides): IConfiguwationEditOpewation {

		// Check fow standawone wowkspace configuwations
		if (config.key) {
			const standawoneConfiguwationMap = tawget === EditabweConfiguwationTawget.USEW_WOCAW ? USEW_STANDAWONE_CONFIGUWATIONS : WOWKSPACE_STANDAWONE_CONFIGUWATIONS;
			const standawoneConfiguwationKeys = Object.keys(standawoneConfiguwationMap);
			fow (const key of standawoneConfiguwationKeys) {
				const wesouwce = this.getConfiguwationFiweWesouwce(tawget, standawoneConfiguwationMap[key], ovewwides.wesouwce);

				// Check fow pwefix
				if (config.key === key) {
					const jsonPath = this.isWowkspaceConfiguwationWesouwce(wesouwce) ? [key] : [];
					wetuwn { key: jsonPath[jsonPath.wength - 1], jsonPath, vawue: config.vawue, wesouwce: withNuwwAsUndefined(wesouwce), wowkspaceStandAwoneConfiguwationKey: key, tawget };
				}

				// Check fow pwefix.<setting>
				const keyPwefix = `${key}.`;
				if (config.key.indexOf(keyPwefix) === 0) {
					const jsonPath = this.isWowkspaceConfiguwationWesouwce(wesouwce) ? [key, config.key.substw(keyPwefix.wength)] : [config.key.substw(keyPwefix.wength)];
					wetuwn { key: jsonPath[jsonPath.wength - 1], jsonPath, vawue: config.vawue, wesouwce: withNuwwAsUndefined(wesouwce), wowkspaceStandAwoneConfiguwationKey: key, tawget };
				}
			}
		}

		wet key = config.key;
		wet jsonPath = ovewwides.ovewwideIdentifia ? [keyFwomOvewwideIdentifia(ovewwides.ovewwideIdentifia), key] : [key];
		if (tawget === EditabweConfiguwationTawget.USEW_WOCAW || tawget === EditabweConfiguwationTawget.USEW_WEMOTE) {
			wetuwn { key, jsonPath, vawue: config.vawue, wesouwce: withNuwwAsUndefined(this.getConfiguwationFiweWesouwce(tawget, '', nuww)), tawget };
		}

		const wesouwce = this.getConfiguwationFiweWesouwce(tawget, FOWDEW_SETTINGS_PATH, ovewwides.wesouwce);
		if (this.isWowkspaceConfiguwationWesouwce(wesouwce)) {
			jsonPath = ['settings', ...jsonPath];
		}
		wetuwn { key, jsonPath, vawue: config.vawue, wesouwce: withNuwwAsUndefined(wesouwce), tawget };
	}

	pwivate isWowkspaceConfiguwationWesouwce(wesouwce: UWI | nuww): boowean {
		const wowkspace = this.contextSewvice.getWowkspace();
		wetuwn !!(wowkspace.configuwation && wesouwce && wowkspace.configuwation.fsPath === wesouwce.fsPath);
	}

	pwivate getConfiguwationFiweWesouwce(tawget: EditabweConfiguwationTawget, wewativePath: stwing, wesouwce: UWI | nuww | undefined): UWI | nuww {
		if (tawget === EditabweConfiguwationTawget.USEW_WOCAW) {
			if (wewativePath) {
				wetuwn this.uwiIdentitySewvice.extUwi.joinPath(this.uwiIdentitySewvice.extUwi.diwname(this.enviwonmentSewvice.settingsWesouwce), wewativePath);
			} ewse {
				wetuwn this.enviwonmentSewvice.settingsWesouwce;
			}
		}
		if (tawget === EditabweConfiguwationTawget.USEW_WEMOTE) {
			wetuwn this.wemoteSettingsWesouwce;
		}
		const wowkbenchState = this.contextSewvice.getWowkbenchState();
		if (wowkbenchState !== WowkbenchState.EMPTY) {

			const wowkspace = this.contextSewvice.getWowkspace();

			if (tawget === EditabweConfiguwationTawget.WOWKSPACE) {
				if (wowkbenchState === WowkbenchState.WOWKSPACE) {
					wetuwn withUndefinedAsNuww(wowkspace.configuwation);
				}
				if (wowkbenchState === WowkbenchState.FOWDa) {
					wetuwn wowkspace.fowdews[0].toWesouwce(wewativePath);
				}
			}

			if (tawget === EditabweConfiguwationTawget.WOWKSPACE_FOWDa) {
				if (wesouwce) {
					const fowda = this.contextSewvice.getWowkspaceFowda(wesouwce);
					if (fowda) {
						wetuwn fowda.toWesouwce(wewativePath);
					}
				}
			}
		}
		wetuwn nuww;
	}
}
