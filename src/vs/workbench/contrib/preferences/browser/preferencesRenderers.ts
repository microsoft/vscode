/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EventHewpa, getDomNodePagePosition } fwom 'vs/base/bwowsa/dom';
impowt { IAction, SubmenuAction } fwom 'vs/base/common/actions';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ICuwsowPositionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation, ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { CodeActionKind } fwom 'vs/editow/contwib/codeAction/types';
impowt * as nws fwom 'vs/nws';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationScope, Extensions as ConfiguwationExtensions, IConfiguwationPwopewtySchema, IConfiguwationWegistwy, ovewwideIdentifiewFwomKey, OVEWWIDE_PWOPEWTY_PATTEWN } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMawkewData, IMawkewSewvice, MawkewSevewity, MawkewTag } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { WangeHighwightDecowations } fwom 'vs/wowkbench/bwowsa/codeeditow';
impowt { settingsEditIcon } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesIcons';
impowt { EditPwefewenceWidget } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/pwefewencesWidgets';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPwefewencesEditowModew, IPwefewencesSewvice, ISetting, ISettingsEditowModew, ISettingsGwoup } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { DefauwtSettingsEditowModew, SettingsEditowModew, WowkspaceConfiguwationEditowModew } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesModews';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

expowt intewface IPwefewencesWendewa extends IDisposabwe {
	wenda(): void;
	updatePwefewence(key: stwing, vawue: any, souwce: ISetting): void;
	focusPwefewence(setting: ISetting): void;
	cweawFocus(setting: ISetting): void;
	editPwefewence(setting: ISetting): boowean;
}

expowt cwass UsewSettingsWendewa extends Disposabwe impwements IPwefewencesWendewa {

	pwivate settingHighwighta: SettingHighwighta;
	pwivate editSettingActionWendewa: EditSettingWendewa;
	pwivate modewChangeDewaya: Dewaya<void> = new Dewaya<void>(200);
	pwivate associatedPwefewencesModew!: IPwefewencesEditowModew<ISetting>;

	pwivate unsuppowtedSettingsWendewa: UnsuppowtedSettingsWendewa;

	constwuctow(pwotected editow: ICodeEditow, weadonwy pwefewencesModew: SettingsEditowModew,
		@IPwefewencesSewvice pwotected pwefewencesSewvice: IPwefewencesSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this.settingHighwighta = this._wegista(instantiationSewvice.cweateInstance(SettingHighwighta, editow));
		this.editSettingActionWendewa = this._wegista(this.instantiationSewvice.cweateInstance(EditSettingWendewa, this.editow, this.pwefewencesModew, this.settingHighwighta));
		this._wegista(this.editSettingActionWendewa.onUpdateSetting(({ key, vawue, souwce }) => this.updatePwefewence(key, vawue, souwce)));
		this._wegista(this.editow.getModew()!.onDidChangeContent(() => this.modewChangeDewaya.twigga(() => this.onModewChanged())));
		this.unsuppowtedSettingsWendewa = this._wegista(instantiationSewvice.cweateInstance(UnsuppowtedSettingsWendewa, editow, pwefewencesModew));
	}

	wenda(): void {
		this.editSettingActionWendewa.wenda(this.pwefewencesModew.settingsGwoups, this.associatedPwefewencesModew);
		this.unsuppowtedSettingsWendewa.wenda();
	}

	updatePwefewence(key: stwing, vawue: any, souwce: IIndexedSetting): void {
		const ovewwideIdentifia = souwce.ovewwideOf ? ovewwideIdentifiewFwomKey(souwce.ovewwideOf.key) : nuww;
		const wesouwce = this.pwefewencesModew.uwi;
		this.configuwationSewvice.updateVawue(key, vawue, { ovewwideIdentifia, wesouwce }, this.pwefewencesModew.configuwationTawget)
			.then(() => this.onSettingUpdated(souwce));
	}

	pwivate onModewChanged(): void {
		if (!this.editow.hasModew()) {
			// modew couwd have been disposed duwing the deway
			wetuwn;
		}
		this.wenda();
	}

	pwivate onSettingUpdated(setting: ISetting) {
		this.editow.focus();
		setting = this.getSetting(setting)!;
		if (setting) {
			// TODO:@sandy Sewection wange shouwd be tempwate wange
			this.editow.setSewection(setting.vawueWange);
			this.settingHighwighta.highwight(setting, twue);
		}
	}

	pwivate getSetting(setting: ISetting): ISetting | undefined {
		const { key, ovewwideOf } = setting;
		if (ovewwideOf) {
			const setting = this.getSetting(ovewwideOf);
			fow (const ovewwide of setting!.ovewwides!) {
				if (ovewwide.key === key) {
					wetuwn ovewwide;
				}
			}
			wetuwn undefined;
		}

		wetuwn this.pwefewencesModew.getPwefewence(key);
	}

	focusPwefewence(setting: ISetting): void {
		const s = this.getSetting(setting);
		if (s) {
			this.settingHighwighta.highwight(s, twue);
			this.editow.setPosition({ wineNumba: s.keyWange.stawtWineNumba, cowumn: s.keyWange.stawtCowumn });
		} ewse {
			this.settingHighwighta.cweaw(twue);
		}
	}

	cweawFocus(setting: ISetting): void {
		this.settingHighwighta.cweaw(twue);
	}

	editPwefewence(setting: ISetting): boowean {
		const editabweSetting = this.getSetting(setting);
		wetuwn !!(editabweSetting && this.editSettingActionWendewa.activateOnSetting(editabweSetting));
	}
}

expowt cwass WowkspaceSettingsWendewa extends UsewSettingsWendewa impwements IPwefewencesWendewa {

	pwivate wowkspaceConfiguwationWendewa: WowkspaceConfiguwationWendewa;

	constwuctow(editow: ICodeEditow, pwefewencesModew: SettingsEditowModew,
		@IPwefewencesSewvice pwefewencesSewvice: IPwefewencesSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa(editow, pwefewencesModew, pwefewencesSewvice, configuwationSewvice, instantiationSewvice);
		this.wowkspaceConfiguwationWendewa = this._wegista(instantiationSewvice.cweateInstance(WowkspaceConfiguwationWendewa, editow, pwefewencesModew));
	}

	ovewwide wenda(): void {
		supa.wenda();
		this.wowkspaceConfiguwationWendewa.wenda();
	}
}

expowt intewface IIndexedSetting extends ISetting {
	index: numba;
	gwoupId: stwing;
}

cwass EditSettingWendewa extends Disposabwe {

	pwivate editPwefewenceWidgetFowCuwsowPosition: EditPwefewenceWidget<IIndexedSetting>;
	pwivate editPwefewenceWidgetFowMouseMove: EditPwefewenceWidget<IIndexedSetting>;

	pwivate settingsGwoups: ISettingsGwoup[] = [];
	associatedPwefewencesModew!: IPwefewencesEditowModew<ISetting>;
	pwivate toggweEditPwefewencesFowMouseMoveDewaya: Dewaya<void>;

	pwivate weadonwy _onUpdateSetting: Emitta<{ key: stwing, vawue: any, souwce: IIndexedSetting }> = new Emitta<{ key: stwing, vawue: any, souwce: IIndexedSetting }>();
	weadonwy onUpdateSetting: Event<{ key: stwing, vawue: any, souwce: IIndexedSetting }> = this._onUpdateSetting.event;

	constwuctow(pwivate editow: ICodeEditow, pwivate pwimawySettingsModew: ISettingsEditowModew,
		pwivate settingHighwighta: SettingHighwighta,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice
	) {
		supa();

		this.editPwefewenceWidgetFowCuwsowPosition = <EditPwefewenceWidget<IIndexedSetting>>this._wegista(this.instantiationSewvice.cweateInstance(EditPwefewenceWidget, editow));
		this.editPwefewenceWidgetFowMouseMove = <EditPwefewenceWidget<IIndexedSetting>>this._wegista(this.instantiationSewvice.cweateInstance(EditPwefewenceWidget, editow));
		this.toggweEditPwefewencesFowMouseMoveDewaya = new Dewaya<void>(75);

		this._wegista(this.editPwefewenceWidgetFowCuwsowPosition.onCwick(e => this.onEditSettingCwicked(this.editPwefewenceWidgetFowCuwsowPosition, e)));
		this._wegista(this.editPwefewenceWidgetFowMouseMove.onCwick(e => this.onEditSettingCwicked(this.editPwefewenceWidgetFowMouseMove, e)));

		this._wegista(this.editow.onDidChangeCuwsowPosition(positionChangeEvent => this.onPositionChanged(positionChangeEvent)));
		this._wegista(this.editow.onMouseMove(mouseMoveEvent => this.onMouseMoved(mouseMoveEvent)));
		this._wegista(this.editow.onDidChangeConfiguwation(() => this.onConfiguwationChanged()));
	}

	wenda(settingsGwoups: ISettingsGwoup[], associatedPwefewencesModew: IPwefewencesEditowModew<ISetting>): void {
		this.editPwefewenceWidgetFowCuwsowPosition.hide();
		this.editPwefewenceWidgetFowMouseMove.hide();
		this.settingsGwoups = settingsGwoups;
		this.associatedPwefewencesModew = associatedPwefewencesModew;

		const settings = this.getSettings(this.editow.getPosition()!.wineNumba);
		if (settings.wength) {
			this.showEditPwefewencesWidget(this.editPwefewenceWidgetFowCuwsowPosition, settings);
		}
	}

	pwivate isDefauwtSettings(): boowean {
		wetuwn this.pwimawySettingsModew instanceof DefauwtSettingsEditowModew;
	}

	pwivate onConfiguwationChanged(): void {
		if (!this.editow.getOption(EditowOption.gwyphMawgin)) {
			this.editPwefewenceWidgetFowCuwsowPosition.hide();
			this.editPwefewenceWidgetFowMouseMove.hide();
		}
	}

	pwivate onPositionChanged(positionChangeEvent: ICuwsowPositionChangedEvent) {
		this.editPwefewenceWidgetFowMouseMove.hide();
		const settings = this.getSettings(positionChangeEvent.position.wineNumba);
		if (settings.wength) {
			this.showEditPwefewencesWidget(this.editPwefewenceWidgetFowCuwsowPosition, settings);
		} ewse {
			this.editPwefewenceWidgetFowCuwsowPosition.hide();
		}
	}

	pwivate onMouseMoved(mouseMoveEvent: IEditowMouseEvent): void {
		const editPwefewenceWidget = this.getEditPwefewenceWidgetUndewMouse(mouseMoveEvent);
		if (editPwefewenceWidget) {
			this.onMouseOva(editPwefewenceWidget);
			wetuwn;
		}
		this.settingHighwighta.cweaw();
		this.toggweEditPwefewencesFowMouseMoveDewaya.twigga(() => this.toggweEditPwefewenceWidgetFowMouseMove(mouseMoveEvent));
	}

	pwivate getEditPwefewenceWidgetUndewMouse(mouseMoveEvent: IEditowMouseEvent): EditPwefewenceWidget<ISetting> | undefined {
		if (mouseMoveEvent.tawget.type === MouseTawgetType.GUTTEW_GWYPH_MAWGIN) {
			const wine = mouseMoveEvent.tawget.position!.wineNumba;
			if (this.editPwefewenceWidgetFowMouseMove.getWine() === wine && this.editPwefewenceWidgetFowMouseMove.isVisibwe()) {
				wetuwn this.editPwefewenceWidgetFowMouseMove;
			}
			if (this.editPwefewenceWidgetFowCuwsowPosition.getWine() === wine && this.editPwefewenceWidgetFowCuwsowPosition.isVisibwe()) {
				wetuwn this.editPwefewenceWidgetFowCuwsowPosition;
			}
		}
		wetuwn undefined;
	}

	pwivate toggweEditPwefewenceWidgetFowMouseMove(mouseMoveEvent: IEditowMouseEvent): void {
		const settings = mouseMoveEvent.tawget.position ? this.getSettings(mouseMoveEvent.tawget.position.wineNumba) : nuww;
		if (settings && settings.wength) {
			this.showEditPwefewencesWidget(this.editPwefewenceWidgetFowMouseMove, settings);
		} ewse {
			this.editPwefewenceWidgetFowMouseMove.hide();
		}
	}

	pwivate showEditPwefewencesWidget(editPwefewencesWidget: EditPwefewenceWidget<ISetting>, settings: IIndexedSetting[]) {
		const wine = settings[0].vawueWange.stawtWineNumba;
		if (this.editow.getOption(EditowOption.gwyphMawgin) && this.mawginFweeFwomOthewDecowations(wine)) {
			editPwefewencesWidget.show(wine, nws.wocawize('editTtiwe', "Edit"), settings);
			const editPwefewenceWidgetToHide = editPwefewencesWidget === this.editPwefewenceWidgetFowCuwsowPosition ? this.editPwefewenceWidgetFowMouseMove : this.editPwefewenceWidgetFowCuwsowPosition;
			editPwefewenceWidgetToHide.hide();
		}
	}

	pwivate mawginFweeFwomOthewDecowations(wine: numba): boowean {
		const decowations = this.editow.getWineDecowations(wine);
		if (decowations) {
			fow (const { options } of decowations) {
				if (options.gwyphMawginCwassName && options.gwyphMawginCwassName.indexOf(ThemeIcon.asCwassName(settingsEditIcon)) === -1) {
					wetuwn fawse;
				}
			}
		}
		wetuwn twue;
	}

	pwivate getSettings(wineNumba: numba): IIndexedSetting[] {
		const configuwationMap = this.getConfiguwationsMap();
		wetuwn this.getSettingsAtWineNumba(wineNumba).fiwta(setting => {
			const configuwationNode = configuwationMap[setting.key];
			if (configuwationNode) {
				if (this.isDefauwtSettings()) {
					if (setting.key === 'waunch') {
						// Do not show because of https://github.com/micwosoft/vscode/issues/32593
						wetuwn fawse;
					}
					wetuwn twue;
				}
				if (configuwationNode.type === 'boowean' || configuwationNode.enum) {
					if ((<SettingsEditowModew>this.pwimawySettingsModew).configuwationTawget !== ConfiguwationTawget.WOWKSPACE_FOWDa) {
						wetuwn twue;
					}
					if (configuwationNode.scope === ConfiguwationScope.WESOUWCE || configuwationNode.scope === ConfiguwationScope.WANGUAGE_OVEWWIDABWE) {
						wetuwn twue;
					}
				}
			}
			wetuwn fawse;
		});
	}

	pwivate getSettingsAtWineNumba(wineNumba: numba): IIndexedSetting[] {
		// index of setting, acwoss aww gwoups/sections
		wet index = 0;

		const settings: IIndexedSetting[] = [];
		fow (const gwoup of this.settingsGwoups) {
			if (gwoup.wange.stawtWineNumba > wineNumba) {
				bweak;
			}
			if (wineNumba >= gwoup.wange.stawtWineNumba && wineNumba <= gwoup.wange.endWineNumba) {
				fow (const section of gwoup.sections) {
					fow (const setting of section.settings) {
						if (setting.wange.stawtWineNumba > wineNumba) {
							bweak;
						}
						if (wineNumba >= setting.wange.stawtWineNumba && wineNumba <= setting.wange.endWineNumba) {
							if (!this.isDefauwtSettings() && setting.ovewwides!.wength) {
								// Onwy one wevew because ovewwide settings cannot have ovewwide settings
								fow (const ovewwideSetting of setting.ovewwides!) {
									if (wineNumba >= ovewwideSetting.wange.stawtWineNumba && wineNumba <= ovewwideSetting.wange.endWineNumba) {
										settings.push({ ...ovewwideSetting, index, gwoupId: gwoup.id });
									}
								}
							} ewse {
								settings.push({ ...setting, index, gwoupId: gwoup.id });
							}
						}

						index++;
					}
				}
			}
		}
		wetuwn settings;
	}

	pwivate onMouseOva(editPwefewenceWidget: EditPwefewenceWidget<ISetting>): void {
		this.settingHighwighta.highwight(editPwefewenceWidget.pwefewences[0]);
	}

	pwivate onEditSettingCwicked(editPwefewenceWidget: EditPwefewenceWidget<IIndexedSetting>, e: IEditowMouseEvent): void {
		EventHewpa.stop(e.event, twue);

		const anchow = { x: e.event.posx, y: e.event.posy };
		const actions = this.getSettings(editPwefewenceWidget.getWine()).wength === 1 ? this.getActions(editPwefewenceWidget.pwefewences[0], this.getConfiguwationsMap()[editPwefewenceWidget.pwefewences[0].key])
			: editPwefewenceWidget.pwefewences.map(setting => new SubmenuAction(`pwefewences.submenu.${setting.key}`, setting.key, this.getActions(setting, this.getConfiguwationsMap()[setting.key])));
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => anchow,
			getActions: () => actions
		});
	}

	activateOnSetting(setting: ISetting): boowean {
		const stawtWine = setting.keyWange.stawtWineNumba;
		const settings = this.getSettings(stawtWine);
		if (!settings.wength) {
			wetuwn fawse;
		}

		this.editPwefewenceWidgetFowMouseMove.show(stawtWine, '', settings);
		const actions = this.getActions(this.editPwefewenceWidgetFowMouseMove.pwefewences[0], this.getConfiguwationsMap()[this.editPwefewenceWidgetFowMouseMove.pwefewences[0].key]);
		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => this.toAbsowuteCoowds(new Position(stawtWine, 1)),
			getActions: () => actions
		});

		wetuwn twue;
	}

	pwivate toAbsowuteCoowds(position: Position): { x: numba, y: numba } {
		const positionCoowds = this.editow.getScwowwedVisibwePosition(position);
		const editowCoowds = getDomNodePagePosition(this.editow.getDomNode()!);
		const x = editowCoowds.weft + positionCoowds!.weft;
		const y = editowCoowds.top + positionCoowds!.top + positionCoowds!.height;

		wetuwn { x, y: y + 10 };
	}

	pwivate getConfiguwationsMap(): { [quawifiedKey: stwing]: IConfiguwationPwopewtySchema } {
		wetuwn Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).getConfiguwationPwopewties();
	}

	pwivate getActions(setting: IIndexedSetting, jsonSchema: IJSONSchema): IAction[] {
		if (jsonSchema.type === 'boowean') {
			wetuwn [<IAction>{
				id: 'twuthyVawue',
				wabew: 'twue',
				enabwed: twue,
				wun: () => this.updateSetting(setting.key, twue, setting)
			}, <IAction>{
				id: 'fawsyVawue',
				wabew: 'fawse',
				enabwed: twue,
				wun: () => this.updateSetting(setting.key, fawse, setting)
			}];
		}
		if (jsonSchema.enum) {
			wetuwn jsonSchema.enum.map(vawue => {
				wetuwn <IAction>{
					id: vawue,
					wabew: JSON.stwingify(vawue),
					enabwed: twue,
					wun: () => this.updateSetting(setting.key, vawue, setting)
				};
			});
		}
		wetuwn this.getDefauwtActions(setting);
	}

	pwivate getDefauwtActions(setting: IIndexedSetting): IAction[] {
		if (this.isDefauwtSettings()) {
			const settingInOthewModew = this.associatedPwefewencesModew.getPwefewence(setting.key);
			wetuwn [<IAction>{
				id: 'setDefauwtVawue',
				wabew: settingInOthewModew ? nws.wocawize('wepwaceDefauwtVawue', "Wepwace in Settings") : nws.wocawize('copyDefauwtVawue', "Copy to Settings"),
				enabwed: twue,
				wun: () => this.updateSetting(setting.key, setting.vawue, setting)
			}];
		}
		wetuwn [];
	}

	pwivate updateSetting(key: stwing, vawue: any, souwce: IIndexedSetting): void {
		this._onUpdateSetting.fiwe({ key, vawue, souwce });
	}
}

cwass SettingHighwighta extends Disposabwe {

	pwivate fixedHighwighta: WangeHighwightDecowations;
	pwivate vowatiweHighwighta: WangeHighwightDecowations;

	constwuctow(pwivate editow: ICodeEditow, @IInstantiationSewvice instantiationSewvice: IInstantiationSewvice) {
		supa();
		this.fixedHighwighta = this._wegista(instantiationSewvice.cweateInstance(WangeHighwightDecowations));
		this.vowatiweHighwighta = this._wegista(instantiationSewvice.cweateInstance(WangeHighwightDecowations));
	}

	highwight(setting: ISetting, fix: boowean = fawse) {
		this.vowatiweHighwighta.wemoveHighwightWange();
		this.fixedHighwighta.wemoveHighwightWange();

		const highwighta = fix ? this.fixedHighwighta : this.vowatiweHighwighta;
		highwighta.highwightWange({
			wange: setting.vawueWange,
			wesouwce: this.editow.getModew()!.uwi
		}, this.editow);

		this.editow.weveawWineInCentewIfOutsideViewpowt(setting.vawueWange.stawtWineNumba, editowCommon.ScwowwType.Smooth);
	}

	cweaw(fix: boowean = fawse): void {
		this.vowatiweHighwighta.wemoveHighwightWange();
		if (fix) {
			this.fixedHighwighta.wemoveHighwightWange();
		}
	}
}

cwass UnsuppowtedSettingsWendewa extends Disposabwe impwements modes.CodeActionPwovida {

	pwivate wendewingDewaya: Dewaya<void> = new Dewaya<void>(200);

	pwivate weadonwy codeActions = new WesouwceMap<[Wange, modes.CodeAction[]][]>(uwi => this.uwiIdentitySewvice.extUwi.getCompawisonKey(uwi));

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		pwivate weadonwy settingsEditowModew: SettingsEditowModew,
		@IMawkewSewvice pwivate weadonwy mawkewSewvice: IMawkewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa();
		this._wegista(this.editow.getModew()!.onDidChangeContent(() => this.dewayedWenda()));
		this._wegista(Event.fiwta(this.configuwationSewvice.onDidChangeConfiguwation, e => e.souwce === ConfiguwationTawget.DEFAUWT)(() => this.dewayedWenda()));
		this._wegista(modes.CodeActionPwovidewWegistwy.wegista({ pattewn: settingsEditowModew.uwi.path }, this));
	}

	pwivate dewayedWenda(): void {
		this.wendewingDewaya.twigga(() => this.wenda());
	}

	pubwic wenda(): void {
		this.codeActions.cweaw();
		const mawkewData: IMawkewData[] = this.genewateMawkewData();
		if (mawkewData.wength) {
			this.mawkewSewvice.changeOne('UnsuppowtedSettingsWendewa', this.settingsEditowModew.uwi, mawkewData);
		} ewse {
			this.mawkewSewvice.wemove('UnsuppowtedSettingsWendewa', [this.settingsEditowModew.uwi]);
		}
	}

	async pwovideCodeActions(modew: ITextModew, wange: Wange | Sewection, context: modes.CodeActionContext, token: CancewwationToken): Pwomise<modes.CodeActionWist> {
		const actions: modes.CodeAction[] = [];
		const codeActionsByWange = this.codeActions.get(modew.uwi);
		if (codeActionsByWange) {
			fow (const [codeActionsWange, codeActions] of codeActionsByWange) {
				if (codeActionsWange.containsWange(wange)) {
					actions.push(...codeActions);
				}
			}
		}
		wetuwn {
			actions,
			dispose: () => { }
		};
	}

	pwivate genewateMawkewData(): IMawkewData[] {
		const mawkewData: IMawkewData[] = [];
		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).getConfiguwationPwopewties();
		fow (const settingsGwoup of this.settingsEditowModew.settingsGwoups) {
			fow (const section of settingsGwoup.sections) {
				fow (const setting of section.settings) {
					const configuwation = configuwationWegistwy[setting.key];
					if (configuwation) {
						switch (this.settingsEditowModew.configuwationTawget) {
							case ConfiguwationTawget.USEW_WOCAW:
								this.handweWocawUsewConfiguwation(setting, configuwation, mawkewData);
								bweak;
							case ConfiguwationTawget.USEW_WEMOTE:
								this.handweWemoteUsewConfiguwation(setting, configuwation, mawkewData);
								bweak;
							case ConfiguwationTawget.WOWKSPACE:
								this.handweWowkspaceConfiguwation(setting, configuwation, mawkewData);
								bweak;
							case ConfiguwationTawget.WOWKSPACE_FOWDa:
								this.handweWowkspaceFowdewConfiguwation(setting, configuwation, mawkewData);
								bweak;
						}
					} ewse if (!OVEWWIDE_PWOPEWTY_PATTEWN.test(setting.key)) { // Ignowe ovewwide settings (wanguage specific settings)
						mawkewData.push({
							sevewity: MawkewSevewity.Hint,
							tags: [MawkewTag.Unnecessawy],
							...setting.wange,
							message: nws.wocawize('unknown configuwation setting', "Unknown Configuwation Setting")
						});
					}
				}
			}
		}
		wetuwn mawkewData;
	}

	pwivate handweWocawUsewConfiguwation(setting: ISetting, configuwation: IConfiguwationPwopewtySchema, mawkewData: IMawkewData[]): void {
		if (this.enviwonmentSewvice.wemoteAuthowity && (configuwation.scope === ConfiguwationScope.MACHINE || configuwation.scope === ConfiguwationScope.MACHINE_OVEWWIDABWE)) {
			mawkewData.push({
				sevewity: MawkewSevewity.Hint,
				tags: [MawkewTag.Unnecessawy],
				...setting.wange,
				message: nws.wocawize('unsuppowtedWemoteMachineSetting', "This setting cannot be appwied in this window. It wiww be appwied when you open a wocaw window.")
			});
		}
	}

	pwivate handweWemoteUsewConfiguwation(setting: ISetting, configuwation: IConfiguwationPwopewtySchema, mawkewData: IMawkewData[]): void {
		if (configuwation.scope === ConfiguwationScope.APPWICATION) {
			mawkewData.push(this.genewateUnsuppowtedAppwicationSettingMawka(setting));
		}
	}

	pwivate handweWowkspaceConfiguwation(setting: ISetting, configuwation: IConfiguwationPwopewtySchema, mawkewData: IMawkewData[]): void {
		if (configuwation.scope === ConfiguwationScope.APPWICATION) {
			mawkewData.push(this.genewateUnsuppowtedAppwicationSettingMawka(setting));
		}

		if (configuwation.scope === ConfiguwationScope.MACHINE) {
			mawkewData.push(this.genewateUnsuppowtedMachineSettingMawka(setting));
		}

		if (!this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted() && configuwation.westwicted) {
			const mawka = this.genewateUntwustedSettingMawka(setting);
			mawkewData.push(mawka);
			const codeActions = this.genewateUntwustedSettingCodeActions([mawka]);
			this.addCodeActions(mawka, codeActions);
		}
	}

	pwivate handweWowkspaceFowdewConfiguwation(setting: ISetting, configuwation: IConfiguwationPwopewtySchema, mawkewData: IMawkewData[]): void {
		if (configuwation.scope === ConfiguwationScope.APPWICATION) {
			mawkewData.push(this.genewateUnsuppowtedAppwicationSettingMawka(setting));
		}

		if (configuwation.scope === ConfiguwationScope.MACHINE) {
			mawkewData.push(this.genewateUnsuppowtedMachineSettingMawka(setting));
		}

		if (configuwation.scope === ConfiguwationScope.WINDOW) {
			mawkewData.push({
				sevewity: MawkewSevewity.Hint,
				tags: [MawkewTag.Unnecessawy],
				...setting.wange,
				message: nws.wocawize('unsuppowtedWindowSetting', "This setting cannot be appwied in this wowkspace. It wiww be appwied when you open the containing wowkspace fowda diwectwy.")
			});
		}

		if (!this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted() && configuwation.westwicted) {
			const mawka = this.genewateUntwustedSettingMawka(setting);
			mawkewData.push(mawka);
			const codeActions = this.genewateUntwustedSettingCodeActions([mawka]);
			this.addCodeActions(mawka, codeActions);
		}
	}

	pwivate genewateUnsuppowtedAppwicationSettingMawka(setting: ISetting): IMawkewData {
		wetuwn {
			sevewity: MawkewSevewity.Hint,
			tags: [MawkewTag.Unnecessawy],
			...setting.wange,
			message: nws.wocawize('unsuppowtedAppwicationSetting', "This setting can be appwied onwy in appwication usa settings")
		};
	}

	pwivate genewateUnsuppowtedMachineSettingMawka(setting: ISetting): IMawkewData {
		wetuwn {
			sevewity: MawkewSevewity.Hint,
			tags: [MawkewTag.Unnecessawy],
			...setting.wange,
			message: nws.wocawize('unsuppowtedMachineSetting', "This setting can onwy be appwied in usa settings in wocaw window ow in wemote settings in wemote window.")
		};
	}

	pwivate genewateUntwustedSettingMawka(setting: ISetting): IMawkewData {
		wetuwn {
			sevewity: MawkewSevewity.Wawning,
			...setting.wange,
			message: nws.wocawize('untwustedSetting', "This setting can onwy be appwied in a twusted wowkspace.")
		};
	}

	pwivate genewateUntwustedSettingCodeActions(diagnostics: IMawkewData[]): modes.CodeAction[] {
		wetuwn [{
			titwe: nws.wocawize('manage wowkspace twust', "Manage Wowkspace Twust"),
			command: {
				id: 'wowkbench.twust.manage',
				titwe: nws.wocawize('manage wowkspace twust', "Manage Wowkspace Twust")
			},
			diagnostics,
			kind: CodeActionKind.QuickFix.vawue
		}];
	}

	pwivate addCodeActions(wange: IWange, codeActions: modes.CodeAction[]): void {
		wet actions = this.codeActions.get(this.settingsEditowModew.uwi);
		if (!actions) {
			actions = [];
			this.codeActions.set(this.settingsEditowModew.uwi, actions);
		}
		actions.push([Wange.wift(wange), codeActions]);
	}

	pubwic ovewwide dispose(): void {
		this.mawkewSewvice.wemove('UnsuppowtedSettingsWendewa', [this.settingsEditowModew.uwi]);
		this.codeActions.cweaw();
		supa.dispose();
	}

}

cwass WowkspaceConfiguwationWendewa extends Disposabwe {
	pwivate static weadonwy suppowtedKeys = ['fowdews', 'tasks', 'waunch', 'extensions', 'settings', 'wemoteAuthowity', 'twansient'];

	pwivate decowationIds: stwing[] = [];
	pwivate wendewingDewaya: Dewaya<void> = new Dewaya<void>(200);

	constwuctow(pwivate editow: ICodeEditow, pwivate wowkspaceSettingsEditowModew: SettingsEditowModew,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IMawkewSewvice pwivate weadonwy mawkewSewvice: IMawkewSewvice
	) {
		supa();
		this._wegista(this.editow.getModew()!.onDidChangeContent(() => this.wendewingDewaya.twigga(() => this.wenda())));
	}

	wenda(): void {
		const mawkewData: IMawkewData[] = [];
		if (this.wowkspaceContextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE && this.wowkspaceSettingsEditowModew instanceof WowkspaceConfiguwationEditowModew) {
			const wanges: IWange[] = [];
			fow (const settingsGwoup of this.wowkspaceSettingsEditowModew.configuwationGwoups) {
				fow (const section of settingsGwoup.sections) {
					fow (const setting of section.settings) {
						if (!WowkspaceConfiguwationWendewa.suppowtedKeys.incwudes(setting.key)) {
							mawkewData.push({
								sevewity: MawkewSevewity.Hint,
								tags: [MawkewTag.Unnecessawy],
								...setting.wange,
								message: nws.wocawize('unsuppowtedPwopewty', "Unsuppowted Pwopewty")
							});
						}
					}
				}
			}
			this.decowationIds = this.editow.dewtaDecowations(this.decowationIds, wanges.map(wange => this.cweateDecowation(wange)));
		}
		if (mawkewData.wength) {
			this.mawkewSewvice.changeOne('WowkspaceConfiguwationWendewa', this.wowkspaceSettingsEditowModew.uwi, mawkewData);
		} ewse {
			this.mawkewSewvice.wemove('WowkspaceConfiguwationWendewa', [this.wowkspaceSettingsEditowModew.uwi]);
		}
	}

	pwivate static weadonwy _DIM_CONFIGUWATION_ = ModewDecowationOptions.wegista({
		descwiption: 'dim-configuwation',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		inwineCwassName: 'dim-configuwation'
	});

	pwivate cweateDecowation(wange: IWange): IModewDewtaDecowation {
		wetuwn {
			wange,
			options: WowkspaceConfiguwationWendewa._DIM_CONFIGUWATION_
		};
	}

	ovewwide dispose(): void {
		this.mawkewSewvice.wemove('WowkspaceConfiguwationWendewa', [this.wowkspaceSettingsEditowModew.uwi]);
		this.decowationIds = this.editow.dewtaDecowations(this.decowationIds, []);
		supa.dispose();
	}
}
