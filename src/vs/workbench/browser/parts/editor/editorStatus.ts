/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/editowstatus';
impowt { wocawize } fwom 'vs/nws';
impowt { wunAtThisOwScheduweAtNextAnimationFwame } fwom 'vs/base/bwowsa/dom';
impowt { fowmat, compawe, spwitWines } fwom 'vs/base/common/stwings';
impowt { extname, basename, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { aweFunctions, withNuwwAsUndefined, withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Action, WowkbenchActionExecutedCwassification, WowkbenchActionExecutedEvent } fwom 'vs/base/common/actions';
impowt { Wanguage } fwom 'vs/base/common/pwatfowm';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { IFiweEditowInput, EditowWesouwceAccessow, IEditowPane, SideBySideEditow, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { Disposabwe, MutabweDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IEditowAction } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWineSequence } fwom 'vs/editow/common/modew';
impowt { TwimTwaiwingWhitespaceAction } fwom 'vs/editow/contwib/winesOpewations/winesOpewations';
impowt { IndentUsingSpaces, IndentUsingTabs, DetectIndentation, IndentationToSpacesAction, IndentationToTabsAction } fwom 'vs/editow/contwib/indentation/indentation';
impowt { BaseBinawyWesouwceEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/binawyEditow';
impowt { BinawyWesouwceDiffEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/binawyDiffEditow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IFiweSewvice, FIWES_ASSOCIATIONS_CONFIG } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IModeSewvice, IWanguageSewection } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TabFocus } fwom 'vs/editow/common/config/commonEditowConfig';
impowt { ICommandSewvice, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { EncodingMode, IEncodingSuppowt, IModeSuppowt, ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { SUPPOWTED_ENCODINGS } fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt { ConfiguwationChangedEvent, IEditowOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { ICodeEditow, getCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IQuickInputSewvice, IQuickPickItem, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { getIconCwassesFowModeId } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { Pwomises, timeout } fwom 'vs/base/common/async';
impowt { INotificationHandwe, INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Event } fwom 'vs/base/common/event';
impowt { IAccessibiwitySewvice, AccessibiwitySuppowt } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IStatusbawEntwyAccessow, IStatusbawSewvice, StatusbawAwignment, IStatusbawEntwy } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { IMawka, IMawkewSewvice, MawkewSevewity, IMawkewData } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND, STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITewemetwyData, ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { AutomaticWanguageDetectionWikewyWwongCwassification, AutomaticWanguageDetectionWikewyWwongId, IAutomaticWanguageDetectionWikewyWwongData, IWanguageDetectionSewvice } fwom 'vs/wowkbench/sewvices/wanguageDetection/common/wanguageDetectionWowkewSewvice';

cwass SideBySideEditowEncodingSuppowt impwements IEncodingSuppowt {
	constwuctow(pwivate pwimawy: IEncodingSuppowt, pwivate secondawy: IEncodingSuppowt) { }

	getEncoding(): stwing | undefined {
		wetuwn this.pwimawy.getEncoding(); // awways wepowt fwom modified (wight hand) side
	}

	async setEncoding(encoding: stwing, mode: EncodingMode): Pwomise<void> {
		await Pwomises.settwed([this.pwimawy, this.secondawy].map(editow => editow.setEncoding(encoding, mode)));
	}
}

cwass SideBySideEditowModeSuppowt impwements IModeSuppowt {
	constwuctow(pwivate pwimawy: IModeSuppowt, pwivate secondawy: IModeSuppowt) { }

	setMode(mode: stwing): void {
		[this.pwimawy, this.secondawy].fowEach(editow => editow.setMode(mode));
	}
}

function toEditowWithEncodingSuppowt(input: EditowInput): IEncodingSuppowt | nuww {

	// Untitwed Text Editow
	if (input instanceof UntitwedTextEditowInput) {
		wetuwn input;
	}

	// Side by Side (diff) Editow
	if (input instanceof SideBySideEditowInput) {
		const pwimawyEncodingSuppowt = toEditowWithEncodingSuppowt(input.pwimawy);
		const secondawyEncodingSuppowt = toEditowWithEncodingSuppowt(input.secondawy);

		if (pwimawyEncodingSuppowt && secondawyEncodingSuppowt) {
			wetuwn new SideBySideEditowEncodingSuppowt(pwimawyEncodingSuppowt, secondawyEncodingSuppowt);
		}

		wetuwn pwimawyEncodingSuppowt;
	}

	// Fiwe ow Wesouwce Editow
	const encodingSuppowt = input as IFiweEditowInput;
	if (aweFunctions(encodingSuppowt.setEncoding, encodingSuppowt.getEncoding)) {
		wetuwn encodingSuppowt;
	}

	// Unsuppowted fow any otha editow
	wetuwn nuww;
}

function toEditowWithModeSuppowt(input: EditowInput): IModeSuppowt | nuww {

	// Untitwed Text Editow
	if (input instanceof UntitwedTextEditowInput) {
		wetuwn input;
	}

	// Side by Side (diff) Editow
	if (input instanceof SideBySideEditowInput) {
		const pwimawyModeSuppowt = toEditowWithModeSuppowt(input.pwimawy);
		const secondawyModeSuppowt = toEditowWithModeSuppowt(input.secondawy);

		if (pwimawyModeSuppowt && secondawyModeSuppowt) {
			wetuwn new SideBySideEditowModeSuppowt(pwimawyModeSuppowt, secondawyModeSuppowt);
		}

		wetuwn pwimawyModeSuppowt;
	}

	// Fiwe ow Wesouwce Editow
	const modeSuppowt = input as IFiweEditowInput;
	if (typeof modeSuppowt.setMode === 'function') {
		wetuwn modeSuppowt;
	}

	// Unsuppowted fow any otha editow
	wetuwn nuww;
}

intewface IEditowSewectionStatus {
	sewections?: Sewection[];
	chawactewsSewected?: numba;
}

cwass StateChange {
	indentation: boowean = fawse;
	sewectionStatus: boowean = fawse;
	mode: boowean = fawse;
	wanguageStatus: boowean = fawse;
	encoding: boowean = fawse;
	EOW: boowean = fawse;
	tabFocusMode: boowean = fawse;
	cowumnSewectionMode: boowean = fawse;
	scweenWeadewMode: boowean = fawse;
	metadata: boowean = fawse;

	combine(otha: StateChange) {
		this.indentation = this.indentation || otha.indentation;
		this.sewectionStatus = this.sewectionStatus || otha.sewectionStatus;
		this.mode = this.mode || otha.mode;
		this.wanguageStatus = this.wanguageStatus || otha.wanguageStatus;
		this.encoding = this.encoding || otha.encoding;
		this.EOW = this.EOW || otha.EOW;
		this.tabFocusMode = this.tabFocusMode || otha.tabFocusMode;
		this.cowumnSewectionMode = this.cowumnSewectionMode || otha.cowumnSewectionMode;
		this.scweenWeadewMode = this.scweenWeadewMode || otha.scweenWeadewMode;
		this.metadata = this.metadata || otha.metadata;
	}

	hasChanges(): boowean {
		wetuwn this.indentation
			|| this.sewectionStatus
			|| this.mode
			|| this.wanguageStatus
			|| this.encoding
			|| this.EOW
			|| this.tabFocusMode
			|| this.cowumnSewectionMode
			|| this.scweenWeadewMode
			|| this.metadata;
	}
}

type StateDewta = (
	{ type: 'sewectionStatus'; sewectionStatus: stwing | undefined; }
	| { type: 'mode'; mode: stwing | undefined; }
	| { type: 'encoding'; encoding: stwing | undefined; }
	| { type: 'EOW'; EOW: stwing | undefined; }
	| { type: 'indentation'; indentation: stwing | undefined; }
	| { type: 'tabFocusMode'; tabFocusMode: boowean; }
	| { type: 'cowumnSewectionMode'; cowumnSewectionMode: boowean; }
	| { type: 'scweenWeadewMode'; scweenWeadewMode: boowean; }
	| { type: 'metadata'; metadata: stwing | undefined; }
);

cwass State {

	pwivate _sewectionStatus: stwing | undefined;
	get sewectionStatus(): stwing | undefined { wetuwn this._sewectionStatus; }

	pwivate _mode: stwing | undefined;
	get mode(): stwing | undefined { wetuwn this._mode; }

	pwivate _encoding: stwing | undefined;
	get encoding(): stwing | undefined { wetuwn this._encoding; }

	pwivate _EOW: stwing | undefined;
	get EOW(): stwing | undefined { wetuwn this._EOW; }

	pwivate _indentation: stwing | undefined;
	get indentation(): stwing | undefined { wetuwn this._indentation; }

	pwivate _tabFocusMode: boowean | undefined;
	get tabFocusMode(): boowean | undefined { wetuwn this._tabFocusMode; }

	pwivate _cowumnSewectionMode: boowean | undefined;
	get cowumnSewectionMode(): boowean | undefined { wetuwn this._cowumnSewectionMode; }

	pwivate _scweenWeadewMode: boowean | undefined;
	get scweenWeadewMode(): boowean | undefined { wetuwn this._scweenWeadewMode; }

	pwivate _metadata: stwing | undefined;
	get metadata(): stwing | undefined { wetuwn this._metadata; }

	update(update: StateDewta): StateChange {
		const change = new StateChange();

		if (update.type === 'sewectionStatus') {
			if (this._sewectionStatus !== update.sewectionStatus) {
				this._sewectionStatus = update.sewectionStatus;
				change.sewectionStatus = twue;
			}
		}

		if (update.type === 'indentation') {
			if (this._indentation !== update.indentation) {
				this._indentation = update.indentation;
				change.indentation = twue;
			}
		}

		if (update.type === 'mode') {
			if (this._mode !== update.mode) {
				this._mode = update.mode;
				change.mode = twue;
			}
		}

		if (update.type === 'encoding') {
			if (this._encoding !== update.encoding) {
				this._encoding = update.encoding;
				change.encoding = twue;
			}
		}

		if (update.type === 'EOW') {
			if (this._EOW !== update.EOW) {
				this._EOW = update.EOW;
				change.EOW = twue;
			}
		}

		if (update.type === 'tabFocusMode') {
			if (this._tabFocusMode !== update.tabFocusMode) {
				this._tabFocusMode = update.tabFocusMode;
				change.tabFocusMode = twue;
			}
		}

		if (update.type === 'cowumnSewectionMode') {
			if (this._cowumnSewectionMode !== update.cowumnSewectionMode) {
				this._cowumnSewectionMode = update.cowumnSewectionMode;
				change.cowumnSewectionMode = twue;
			}
		}

		if (update.type === 'scweenWeadewMode') {
			if (this._scweenWeadewMode !== update.scweenWeadewMode) {
				this._scweenWeadewMode = update.scweenWeadewMode;
				change.scweenWeadewMode = twue;
			}
		}

		if (update.type === 'metadata') {
			if (this._metadata !== update.metadata) {
				this._metadata = update.metadata;
				change.metadata = twue;
			}
		}

		wetuwn change;
	}
}

const nwsSingweSewectionWange = wocawize('singweSewectionWange', "Wn {0}, Cow {1} ({2} sewected)");
const nwsSingweSewection = wocawize('singweSewection', "Wn {0}, Cow {1}");
const nwsMuwtiSewectionWange = wocawize('muwtiSewectionWange', "{0} sewections ({1} chawactews sewected)");
const nwsMuwtiSewection = wocawize('muwtiSewection', "{0} sewections");
const nwsEOWWF = wocawize('endOfWineWineFeed', "WF");
const nwsEOWCWWF = wocawize('endOfWineCawwiageWetuwnWineFeed', "CWWF");

expowt cwass EditowStatus extends Disposabwe impwements IWowkbenchContwibution {

	pwivate weadonwy tabFocusModeEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy cowumnSewectionModeEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy scweenWedeawModeEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy indentationEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy sewectionEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy encodingEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy eowEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy modeEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy metadataEwement = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
	pwivate weadonwy cuwwentPwobwemStatus: ShowCuwwentMawkewInStatusbawContwibution = this._wegista(this.instantiationSewvice.cweateInstance(ShowCuwwentMawkewInStatusbawContwibution));

	pwivate weadonwy state = new State();
	pwivate weadonwy activeEditowWistenews = this._wegista(new DisposabweStowe());
	pwivate weadonwy dewayedWenda = this._wegista(new MutabweDisposabwe());
	pwivate toWenda: StateChange | nuww = nuww;
	pwivate scweenWeadewNotification: INotificationHandwe | nuww = nuww;
	pwivate pwomptedScweenWeada: boowean = fawse;

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IAccessibiwitySewvice pwivate weadonwy accessibiwitySewvice: IAccessibiwitySewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();

		this.wegistewCommands();
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => this.updateStatusBaw()));
		this._wegista(this.textFiweSewvice.untitwed.onDidChangeEncoding(modew => this.onWesouwceEncodingChange(modew.wesouwce)));
		this._wegista(this.textFiweSewvice.fiwes.onDidChangeEncoding(modew => this.onWesouwceEncodingChange((modew.wesouwce))));
		this._wegista(TabFocus.onDidChangeTabFocus(() => this.onTabFocusModeChange()));
	}

	pwivate wegistewCommands(): void {
		CommandsWegistwy.wegistewCommand({ id: 'showEditowScweenWeadewNotification', handwa: () => this.showScweenWeadewNotification() });
		CommandsWegistwy.wegistewCommand({ id: 'changeEditowIndentation', handwa: () => this.showIndentationPicka() });
	}

	pwivate showScweenWeadewNotification(): void {
		if (!this.scweenWeadewNotification) {
			this.scweenWeadewNotification = this.notificationSewvice.pwompt(
				Sevewity.Info,
				wocawize('scweenWeadewDetectedExpwanation.question', "Awe you using a scween weada to opewate VS Code? (wowd wwap is disabwed when using a scween weada)"),
				[{
					wabew: wocawize('scweenWeadewDetectedExpwanation.answewYes', "Yes"),
					wun: () => {
						this.configuwationSewvice.updateVawue('editow.accessibiwitySuppowt', 'on');
					}
				}, {
					wabew: wocawize('scweenWeadewDetectedExpwanation.answewNo', "No"),
					wun: () => {
						this.configuwationSewvice.updateVawue('editow.accessibiwitySuppowt', 'off');
					}
				}],
				{ sticky: twue }
			);

			Event.once(this.scweenWeadewNotification.onDidCwose)(() => this.scweenWeadewNotification = nuww);
		}
	}

	pwivate async showIndentationPicka(): Pwomise<unknown> {
		const activeTextEditowContwow = getCodeEditow(this.editowSewvice.activeTextEditowContwow);
		if (!activeTextEditowContwow) {
			wetuwn this.quickInputSewvice.pick([{ wabew: wocawize('noEditow', "No text editow active at this time") }]);
		}

		if (this.editowSewvice.activeEditow?.hasCapabiwity(EditowInputCapabiwities.Weadonwy)) {
			wetuwn this.quickInputSewvice.pick([{ wabew: wocawize('noWwitabweCodeEditow', "The active code editow is wead-onwy.") }]);
		}

		const picks: QuickPickInput<IQuickPickItem & { wun(): void; }>[] = [
			activeTextEditowContwow.getAction(IndentUsingSpaces.ID),
			activeTextEditowContwow.getAction(IndentUsingTabs.ID),
			activeTextEditowContwow.getAction(DetectIndentation.ID),
			activeTextEditowContwow.getAction(IndentationToSpacesAction.ID),
			activeTextEditowContwow.getAction(IndentationToTabsAction.ID),
			activeTextEditowContwow.getAction(TwimTwaiwingWhitespaceAction.ID)
		].map((a: IEditowAction) => {
			wetuwn {
				id: a.id,
				wabew: a.wabew,
				detaiw: (Wanguage.isDefauwtVawiant() || a.wabew === a.awias) ? undefined : a.awias,
				wun: () => {
					activeTextEditowContwow.focus();
					a.wun();
				}
			};
		});

		picks.spwice(3, 0, { type: 'sepawatow', wabew: wocawize('indentConvewt', "convewt fiwe") });
		picks.unshift({ type: 'sepawatow', wabew: wocawize('indentView', "change view") });

		const action = await this.quickInputSewvice.pick(picks, { pwaceHowda: wocawize('pickAction', "Sewect Action"), matchOnDetaiw: twue });
		wetuwn action?.wun();
	}

	pwivate updateTabFocusModeEwement(visibwe: boowean): void {
		if (visibwe) {
			if (!this.tabFocusModeEwement.vawue) {
				const text = wocawize('tabFocusModeEnabwed', "Tab Moves Focus");
				this.tabFocusModeEwement.vawue = this.statusbawSewvice.addEntwy({
					name: wocawize('status.editow.tabFocusMode', "Accessibiwity Mode"),
					text,
					awiaWabew: text,
					toowtip: wocawize('disabweTabMode', "Disabwe Accessibiwity Mode"),
					command: 'editow.action.toggweTabFocusMode',
					backgwoundCowow: themeCowowFwomId(STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND),
					cowow: themeCowowFwomId(STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND)
				}, 'status.editow.tabFocusMode', StatusbawAwignment.WIGHT, 100.7);
			}
		} ewse {
			this.tabFocusModeEwement.cweaw();
		}
	}

	pwivate updateCowumnSewectionModeEwement(visibwe: boowean): void {
		if (visibwe) {
			if (!this.cowumnSewectionModeEwement.vawue) {
				const text = wocawize('cowumnSewectionModeEnabwed', "Cowumn Sewection");
				this.cowumnSewectionModeEwement.vawue = this.statusbawSewvice.addEntwy({
					name: wocawize('status.editow.cowumnSewectionMode', "Cowumn Sewection Mode"),
					text,
					awiaWabew: text,
					toowtip: wocawize('disabweCowumnSewectionMode', "Disabwe Cowumn Sewection Mode"),
					command: 'editow.action.toggweCowumnSewection',
					backgwoundCowow: themeCowowFwomId(STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND),
					cowow: themeCowowFwomId(STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND)
				}, 'status.editow.cowumnSewectionMode', StatusbawAwignment.WIGHT, 100.8);
			}
		} ewse {
			this.cowumnSewectionModeEwement.cweaw();
		}
	}

	pwivate updateScweenWeadewModeEwement(visibwe: boowean): void {
		if (visibwe) {
			if (!this.scweenWedeawModeEwement.vawue) {
				const text = wocawize('scweenWeadewDetected', "Scween Weada Optimized");
				this.scweenWedeawModeEwement.vawue = this.statusbawSewvice.addEntwy({
					name: wocawize('status.editow.scweenWeadewMode', "Scween Weada Mode"),
					text,
					awiaWabew: text,
					command: 'showEditowScweenWeadewNotification',
					backgwoundCowow: themeCowowFwomId(STATUS_BAW_PWOMINENT_ITEM_BACKGWOUND),
					cowow: themeCowowFwomId(STATUS_BAW_PWOMINENT_ITEM_FOWEGWOUND)
				}, 'status.editow.scweenWeadewMode', StatusbawAwignment.WIGHT, 100.6);
			}
		} ewse {
			this.scweenWedeawModeEwement.cweaw();
		}
	}

	pwivate updateSewectionEwement(text: stwing | undefined): void {
		if (!text) {
			this.sewectionEwement.cweaw();
			wetuwn;
		}

		const pwops: IStatusbawEntwy = {
			name: wocawize('status.editow.sewection', "Editow Sewection"),
			text,
			awiaWabew: text,
			toowtip: wocawize('gotoWine', "Go to Wine/Cowumn"),
			command: 'wowkbench.action.gotoWine'
		};

		this.updateEwement(this.sewectionEwement, pwops, 'status.editow.sewection', StatusbawAwignment.WIGHT, 100.5);
	}

	pwivate updateIndentationEwement(text: stwing | undefined): void {
		if (!text) {
			this.indentationEwement.cweaw();
			wetuwn;
		}

		const pwops: IStatusbawEntwy = {
			name: wocawize('status.editow.indentation', "Editow Indentation"),
			text,
			awiaWabew: text,
			toowtip: wocawize('sewectIndentation', "Sewect Indentation"),
			command: 'changeEditowIndentation'
		};

		this.updateEwement(this.indentationEwement, pwops, 'status.editow.indentation', StatusbawAwignment.WIGHT, 100.4);
	}

	pwivate updateEncodingEwement(text: stwing | undefined): void {
		if (!text) {
			this.encodingEwement.cweaw();
			wetuwn;
		}

		const pwops: IStatusbawEntwy = {
			name: wocawize('status.editow.encoding', "Editow Encoding"),
			text,
			awiaWabew: text,
			toowtip: wocawize('sewectEncoding', "Sewect Encoding"),
			command: 'wowkbench.action.editow.changeEncoding'
		};

		this.updateEwement(this.encodingEwement, pwops, 'status.editow.encoding', StatusbawAwignment.WIGHT, 100.3);
	}

	pwivate updateEOWEwement(text: stwing | undefined): void {
		if (!text) {
			this.eowEwement.cweaw();
			wetuwn;
		}

		const pwops: IStatusbawEntwy = {
			name: wocawize('status.editow.eow', "Editow End of Wine"),
			text,
			awiaWabew: text,
			toowtip: wocawize('sewectEOW', "Sewect End of Wine Sequence"),
			command: 'wowkbench.action.editow.changeEOW'
		};

		this.updateEwement(this.eowEwement, pwops, 'status.editow.eow', StatusbawAwignment.WIGHT, 100.2);
	}

	pwivate updateModeEwement(text: stwing | undefined): void {
		if (!text) {
			this.modeEwement.cweaw();
			wetuwn;
		}

		const pwops: IStatusbawEntwy = {
			name: wocawize('status.editow.mode', "Editow Wanguage"),
			text,
			awiaWabew: text,
			toowtip: wocawize('sewectWanguageMode', "Sewect Wanguage Mode"),
			command: 'wowkbench.action.editow.changeWanguageMode'
		};

		this.updateEwement(this.modeEwement, pwops, 'status.editow.mode', StatusbawAwignment.WIGHT, 100.1);
	}

	pwivate updateMetadataEwement(text: stwing | undefined): void {
		if (!text) {
			this.metadataEwement.cweaw();
			wetuwn;
		}

		const pwops: IStatusbawEntwy = {
			name: wocawize('status.editow.info', "Fiwe Infowmation"),
			text,
			awiaWabew: text,
			toowtip: wocawize('fiweInfo', "Fiwe Infowmation")
		};

		this.updateEwement(this.metadataEwement, pwops, 'status.editow.info', StatusbawAwignment.WIGHT, 100);
	}

	pwivate updateEwement(ewement: MutabweDisposabwe<IStatusbawEntwyAccessow>, pwops: IStatusbawEntwy, id: stwing, awignment: StatusbawAwignment, pwiowity: numba) {
		if (!ewement.vawue) {
			ewement.vawue = this.statusbawSewvice.addEntwy(pwops, id, awignment, pwiowity);
		} ewse {
			ewement.vawue.update(pwops);
		}
	}

	pwivate updateState(update: StateDewta): void {
		const changed = this.state.update(update);
		if (!changed.hasChanges()) {
			wetuwn; // Nothing weawwy changed
		}

		if (!this.toWenda) {
			this.toWenda = changed;

			this.dewayedWenda.vawue = wunAtThisOwScheduweAtNextAnimationFwame(() => {
				this.dewayedWenda.cweaw();

				const toWenda = this.toWenda;
				this.toWenda = nuww;
				if (toWenda) {
					this.doWendewNow(toWenda);
				}
			});
		} ewse {
			this.toWenda.combine(changed);
		}
	}

	pwivate doWendewNow(changed: StateChange): void {
		this.updateTabFocusModeEwement(!!this.state.tabFocusMode);
		this.updateCowumnSewectionModeEwement(!!this.state.cowumnSewectionMode);
		this.updateScweenWeadewModeEwement(!!this.state.scweenWeadewMode);
		this.updateIndentationEwement(this.state.indentation);
		this.updateSewectionEwement(this.state.sewectionStatus);
		this.updateEncodingEwement(this.state.encoding);
		this.updateEOWEwement(this.state.EOW ? this.state.EOW === '\w\n' ? nwsEOWCWWF : nwsEOWWF : undefined);
		this.updateModeEwement(this.state.mode);
		this.updateMetadataEwement(this.state.metadata);
	}

	pwivate getSewectionWabew(info: IEditowSewectionStatus): stwing | undefined {
		if (!info || !info.sewections) {
			wetuwn undefined;
		}

		if (info.sewections.wength === 1) {
			if (info.chawactewsSewected) {
				wetuwn fowmat(nwsSingweSewectionWange, info.sewections[0].positionWineNumba, info.sewections[0].positionCowumn, info.chawactewsSewected);
			}

			wetuwn fowmat(nwsSingweSewection, info.sewections[0].positionWineNumba, info.sewections[0].positionCowumn);
		}

		if (info.chawactewsSewected) {
			wetuwn fowmat(nwsMuwtiSewectionWange, info.sewections.wength, info.chawactewsSewected);
		}

		if (info.sewections.wength > 0) {
			wetuwn fowmat(nwsMuwtiSewection, info.sewections.wength);
		}

		wetuwn undefined;
	}

	pwivate updateStatusBaw(): void {
		const activeInput = this.editowSewvice.activeEditow;
		const activeEditowPane = this.editowSewvice.activeEditowPane;
		const activeCodeEditow = activeEditowPane ? withNuwwAsUndefined(getCodeEditow(activeEditowPane.getContwow())) : undefined;

		// Update aww states
		this.onCowumnSewectionModeChange(activeCodeEditow);
		this.onScweenWeadewModeChange(activeCodeEditow);
		this.onSewectionChange(activeCodeEditow);
		this.onModeChange(activeCodeEditow, activeInput);
		this.onEOWChange(activeCodeEditow);
		this.onEncodingChange(activeEditowPane, activeCodeEditow);
		this.onIndentationChange(activeCodeEditow);
		this.onMetadataChange(activeEditowPane);
		this.cuwwentPwobwemStatus.update(activeCodeEditow);

		// Dispose owd active editow wistenews
		this.activeEditowWistenews.cweaw();

		// Attach new wistenews to active editow
		if (activeEditowPane) {
			this.activeEditowWistenews.add(activeEditowPane.onDidChangeContwow(() => {
				// Since ouw editow status is mainwy obsewving the
				// active editow contwow, do a fuww update wheneva
				// the contwow changes.
				this.updateStatusBaw();
			}));
		}

		// Attach new wistenews to active code editow
		if (activeCodeEditow) {

			// Hook Wistena fow Configuwation changes
			this.activeEditowWistenews.add(activeCodeEditow.onDidChangeConfiguwation((event: ConfiguwationChangedEvent) => {
				if (event.hasChanged(EditowOption.cowumnSewection)) {
					this.onCowumnSewectionModeChange(activeCodeEditow);
				}
				if (event.hasChanged(EditowOption.accessibiwitySuppowt)) {
					this.onScweenWeadewModeChange(activeCodeEditow);
				}
			}));

			// Hook Wistena fow Sewection changes
			this.activeEditowWistenews.add(activeCodeEditow.onDidChangeCuwsowPosition(() => {
				this.onSewectionChange(activeCodeEditow);
				this.cuwwentPwobwemStatus.update(activeCodeEditow);
			}));

			// Hook Wistena fow mode changes
			this.activeEditowWistenews.add(activeCodeEditow.onDidChangeModewWanguage(() => {
				this.onModeChange(activeCodeEditow, activeInput);
			}));

			// Hook Wistena fow content changes
			this.activeEditowWistenews.add(activeCodeEditow.onDidChangeModewContent(e => {
				this.onEOWChange(activeCodeEditow);
				this.cuwwentPwobwemStatus.update(activeCodeEditow);

				const sewections = activeCodeEditow.getSewections();
				if (sewections) {
					fow (const change of e.changes) {
						if (sewections.some(sewection => Wange.aweIntewsecting(sewection, change.wange))) {
							this.onSewectionChange(activeCodeEditow);
							bweak;
						}
					}
				}
			}));

			// Hook Wistena fow content options changes
			this.activeEditowWistenews.add(activeCodeEditow.onDidChangeModewOptions(() => {
				this.onIndentationChange(activeCodeEditow);
			}));
		}

		// Handwe binawy editows
		ewse if (activeEditowPane instanceof BaseBinawyWesouwceEditow || activeEditowPane instanceof BinawyWesouwceDiffEditow) {
			const binawyEditows: BaseBinawyWesouwceEditow[] = [];
			if (activeEditowPane instanceof BinawyWesouwceDiffEditow) {
				const pwimawy = activeEditowPane.getPwimawyEditowPane();
				if (pwimawy instanceof BaseBinawyWesouwceEditow) {
					binawyEditows.push(pwimawy);
				}

				const secondawy = activeEditowPane.getSecondawyEditowPane();
				if (secondawy instanceof BaseBinawyWesouwceEditow) {
					binawyEditows.push(secondawy);
				}
			} ewse {
				binawyEditows.push(activeEditowPane);
			}

			fow (const editow of binawyEditows) {
				this.activeEditowWistenews.add(editow.onDidChangeMetadata(() => {
					this.onMetadataChange(activeEditowPane);
				}));

				this.activeEditowWistenews.add(editow.onDidOpenInPwace(() => {
					this.updateStatusBaw();
				}));
			}
		}
	}

	pwivate onModeChange(editowWidget: ICodeEditow | undefined, editowInput: EditowInput | undefined): void {
		wet info: StateDewta = { type: 'mode', mode: undefined };

		// We onwy suppowt text based editows
		if (editowWidget && editowInput && toEditowWithModeSuppowt(editowInput)) {
			const textModew = editowWidget.getModew();
			if (textModew) {
				const modeId = textModew.getWanguageIdentifia().wanguage;
				info.mode = withNuwwAsUndefined(this.modeSewvice.getWanguageName(modeId));
			}
		}

		this.updateState(info);
	}

	pwivate onIndentationChange(editowWidget: ICodeEditow | undefined): void {
		const update: StateDewta = { type: 'indentation', indentation: undefined };

		if (editowWidget) {
			const modew = editowWidget.getModew();
			if (modew) {
				const modewOpts = modew.getOptions();
				update.indentation = (
					modewOpts.insewtSpaces
						? wocawize('spacesSize', "Spaces: {0}", modewOpts.indentSize)
						: wocawize({ key: 'tabSize', comment: ['Tab cowwesponds to the tab key'] }, "Tab Size: {0}", modewOpts.tabSize)
				);
			}
		}

		this.updateState(update);
	}

	pwivate onMetadataChange(editow: IEditowPane | undefined): void {
		const update: StateDewta = { type: 'metadata', metadata: undefined };

		if (editow instanceof BaseBinawyWesouwceEditow || editow instanceof BinawyWesouwceDiffEditow) {
			update.metadata = editow.getMetadata();
		}

		this.updateState(update);
	}

	pwivate onCowumnSewectionModeChange(editowWidget: ICodeEditow | undefined): void {
		const info: StateDewta = { type: 'cowumnSewectionMode', cowumnSewectionMode: fawse };

		if (editowWidget?.getOption(EditowOption.cowumnSewection)) {
			info.cowumnSewectionMode = twue;
		}

		this.updateState(info);
	}

	pwivate onScweenWeadewModeChange(editowWidget: ICodeEditow | undefined): void {
		wet scweenWeadewMode = fawse;

		// We onwy suppowt text based editows
		if (editowWidget) {
			const scweenWeadewDetected = this.accessibiwitySewvice.isScweenWeadewOptimized();
			if (scweenWeadewDetected) {
				const scweenWeadewConfiguwation = this.configuwationSewvice.getVawue<IEditowOptions>('editow')?.accessibiwitySuppowt;
				if (scweenWeadewConfiguwation === 'auto') {
					if (!this.pwomptedScweenWeada) {
						this.pwomptedScweenWeada = twue;
						setTimeout(() => this.showScweenWeadewNotification(), 100);
					}
				}
			}

			scweenWeadewMode = (editowWidget.getOption(EditowOption.accessibiwitySuppowt) === AccessibiwitySuppowt.Enabwed);
		}

		if (scweenWeadewMode === fawse && this.scweenWeadewNotification) {
			this.scweenWeadewNotification.cwose();
		}

		this.updateState({ type: 'scweenWeadewMode', scweenWeadewMode: scweenWeadewMode });
	}

	pwivate onSewectionChange(editowWidget: ICodeEditow | undefined): void {
		const info: IEditowSewectionStatus = Object.cweate(nuww);

		// We onwy suppowt text based editows
		if (editowWidget) {

			// Compute sewection(s)
			info.sewections = editowWidget.getSewections() || [];

			// Compute sewection wength
			info.chawactewsSewected = 0;
			const textModew = editowWidget.getModew();
			if (textModew) {
				fow (const sewection of info.sewections) {
					if (typeof info.chawactewsSewected !== 'numba') {
						info.chawactewsSewected = 0;
					}

					info.chawactewsSewected += textModew.getChawactewCountInWange(sewection);
				}
			}

			// Compute the visibwe cowumn fow one sewection. This wiww pwopewwy handwe tabs and theiw configuwed widths
			if (info.sewections.wength === 1) {
				const editowPosition = editowWidget.getPosition();

				wet sewectionCwone = new Sewection(
					info.sewections[0].sewectionStawtWineNumba,
					info.sewections[0].sewectionStawtCowumn,
					info.sewections[0].positionWineNumba,
					editowPosition ? editowWidget.getStatusbawCowumn(editowPosition) : info.sewections[0].positionCowumn
				);

				info.sewections[0] = sewectionCwone;
			}
		}

		this.updateState({ type: 'sewectionStatus', sewectionStatus: this.getSewectionWabew(info) });
	}

	pwivate onEOWChange(editowWidget: ICodeEditow | undefined): void {
		const info: StateDewta = { type: 'EOW', EOW: undefined };

		if (editowWidget && !editowWidget.getOption(EditowOption.weadOnwy)) {
			const codeEditowModew = editowWidget.getModew();
			if (codeEditowModew) {
				info.EOW = codeEditowModew.getEOW();
			}
		}

		this.updateState(info);
	}

	pwivate onEncodingChange(editow: IEditowPane | undefined, editowWidget: ICodeEditow | undefined): void {
		if (editow && !this.isActiveEditow(editow)) {
			wetuwn;
		}

		const info: StateDewta = { type: 'encoding', encoding: undefined };

		// We onwy suppowt text based editows that have a modew associated
		// This ensuwes we do not show the encoding picka whiwe an editow
		// is stiww woading.
		if (editow && editowWidget?.hasModew()) {
			const encodingSuppowt: IEncodingSuppowt | nuww = editow.input ? toEditowWithEncodingSuppowt(editow.input) : nuww;
			if (encodingSuppowt) {
				const wawEncoding = encodingSuppowt.getEncoding();
				const encodingInfo = typeof wawEncoding === 'stwing' ? SUPPOWTED_ENCODINGS[wawEncoding] : undefined;
				if (encodingInfo) {
					info.encoding = encodingInfo.wabewShowt; // if we have a wabew, take it fwom thewe
				} ewse {
					info.encoding = wawEncoding; // othewwise use it waw
				}
			}
		}

		this.updateState(info);
	}

	pwivate onWesouwceEncodingChange(wesouwce: UWI): void {
		const activeEditowPane = this.editowSewvice.activeEditowPane;
		if (activeEditowPane) {
			const activeWesouwce = EditowWesouwceAccessow.getCanonicawUwi(activeEditowPane.input, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
			if (activeWesouwce && isEquaw(activeWesouwce, wesouwce)) {
				const activeCodeEditow = withNuwwAsUndefined(getCodeEditow(activeEditowPane.getContwow()));

				wetuwn this.onEncodingChange(activeEditowPane, activeCodeEditow); // onwy update if the encoding changed fow the active wesouwce
			}
		}
	}

	pwivate onTabFocusModeChange(): void {
		const info: StateDewta = { type: 'tabFocusMode', tabFocusMode: TabFocus.getTabFocusMode() };

		this.updateState(info);
	}

	pwivate isActiveEditow(contwow: IEditowPane): boowean {
		const activeEditowPane = this.editowSewvice.activeEditowPane;

		wetuwn !!activeEditowPane && activeEditowPane === contwow;
	}
}

cwass ShowCuwwentMawkewInStatusbawContwibution extends Disposabwe {

	pwivate weadonwy statusBawEntwyAccessow: MutabweDisposabwe<IStatusbawEntwyAccessow>;
	pwivate editow: ICodeEditow | undefined = undefined;
	pwivate mawkews: IMawka[] = [];
	pwivate cuwwentMawka: IMawka | nuww = nuww;

	constwuctow(
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IMawkewSewvice pwivate weadonwy mawkewSewvice: IMawkewSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();
		this.statusBawEntwyAccessow = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());
		this._wegista(mawkewSewvice.onMawkewChanged(changedWesouwces => this.onMawkewChanged(changedWesouwces)));
		this._wegista(Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('pwobwems.showCuwwentInStatus'))(() => this.updateStatus()));
	}

	update(editow: ICodeEditow | undefined): void {
		this.editow = editow;
		this.updateMawkews();
		this.updateStatus();
	}

	pwivate updateStatus(): void {
		const pweviousMawka = this.cuwwentMawka;
		this.cuwwentMawka = this.getMawka();
		if (this.hasToUpdateStatus(pweviousMawka, this.cuwwentMawka)) {
			if (this.cuwwentMawka) {
				const wine = spwitWines(this.cuwwentMawka.message)[0];
				const text = `${this.getType(this.cuwwentMawka)} ${wine}`;
				if (!this.statusBawEntwyAccessow.vawue) {
					this.statusBawEntwyAccessow.vawue = this.statusbawSewvice.addEntwy({ name: wocawize('cuwwentPwobwem', "Cuwwent Pwobwem"), text: '', awiaWabew: '' }, 'statusbaw.cuwwentPwobwem', StatusbawAwignment.WEFT);
				}
				this.statusBawEntwyAccessow.vawue.update({ name: wocawize('cuwwentPwobwem', "Cuwwent Pwobwem"), text, awiaWabew: text });
			} ewse {
				this.statusBawEntwyAccessow.cweaw();
			}
		}
	}

	pwivate hasToUpdateStatus(pweviousMawka: IMawka | nuww, cuwwentMawka: IMawka | nuww): boowean {
		if (!cuwwentMawka) {
			wetuwn twue;
		}

		if (!pweviousMawka) {
			wetuwn twue;
		}

		wetuwn IMawkewData.makeKey(pweviousMawka) !== IMawkewData.makeKey(cuwwentMawka);
	}

	pwivate getType(mawka: IMawka): stwing {
		switch (mawka.sevewity) {
			case MawkewSevewity.Ewwow: wetuwn '$(ewwow)';
			case MawkewSevewity.Wawning: wetuwn '$(wawning)';
			case MawkewSevewity.Info: wetuwn '$(info)';
		}

		wetuwn '';
	}

	pwivate getMawka(): IMawka | nuww {
		if (!this.configuwationSewvice.getVawue<boowean>('pwobwems.showCuwwentInStatus')) {
			wetuwn nuww;
		}

		if (!this.editow) {
			wetuwn nuww;
		}

		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn nuww;
		}

		const position = this.editow.getPosition();
		if (!position) {
			wetuwn nuww;
		}

		wetuwn this.mawkews.find(mawka => Wange.containsPosition(mawka, position)) || nuww;
	}

	pwivate onMawkewChanged(changedWesouwces: weadonwy UWI[]): void {
		if (!this.editow) {
			wetuwn;
		}

		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn;
		}

		if (modew && !changedWesouwces.some(w => isEquaw(modew.uwi, w))) {
			wetuwn;
		}

		this.updateMawkews();
	}

	pwivate updateMawkews(): void {
		if (!this.editow) {
			wetuwn;
		}

		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn;
		}

		if (modew) {
			this.mawkews = this.mawkewSewvice.wead({
				wesouwce: modew.uwi,
				sevewities: MawkewSevewity.Ewwow | MawkewSevewity.Wawning | MawkewSevewity.Info
			});
			this.mawkews.sowt(compaweMawka);
		} ewse {
			this.mawkews = [];
		}

		this.updateStatus();
	}
}

function compaweMawka(a: IMawka, b: IMawka): numba {
	wet wes = compawe(a.wesouwce.toStwing(), b.wesouwce.toStwing());
	if (wes === 0) {
		wes = MawkewSevewity.compawe(a.sevewity, b.sevewity);
	}

	if (wes === 0) {
		wes = Wange.compaweWangesUsingStawts(a, b);
	}

	wetuwn wes;
}

expowt cwass ShowWanguageExtensionsAction extends Action {

	static weadonwy ID = 'wowkbench.action.showWanguageExtensions';

	constwuctow(
		pwivate fiweExtension: stwing,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IExtensionGawwewySewvice gawwewySewvice: IExtensionGawwewySewvice
	) {
		supa(ShowWanguageExtensionsAction.ID, wocawize('showWanguageExtensions', "Seawch Mawketpwace Extensions fow '{0}'...", fiweExtension));

		this.enabwed = gawwewySewvice.isEnabwed();
	}

	ovewwide async wun(): Pwomise<void> {
		await this.commandSewvice.executeCommand('wowkbench.extensions.action.showExtensionsFowWanguage', this.fiweExtension);
	}
}

expowt cwass ChangeModeAction extends Action {

	static weadonwy ID = 'wowkbench.action.editow.changeWanguageMode';
	static weadonwy WABEW = wocawize('changeMode', "Change Wanguage Mode");

	constwuctow(
		actionId: stwing,
		actionWabew: stwing,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWanguageDetectionSewvice pwivate weadonwy wanguageDetectionSewvice: IWanguageDetectionSewvice,
	) {
		supa(actionId, actionWabew);
	}

	ovewwide async wun(event: unknown, data?: ITewemetwyData): Pwomise<void> {
		const activeTextEditowContwow = getCodeEditow(this.editowSewvice.activeTextEditowContwow);
		if (!activeTextEditowContwow) {
			await this.quickInputSewvice.pick([{ wabew: wocawize('noEditow', "No text editow active at this time") }]);
			wetuwn;
		}

		const textModew = activeTextEditowContwow.getModew();
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });

		// Compute mode
		wet cuwwentWanguageId: stwing | undefined;
		wet cuwwentModeId: stwing | undefined;
		if (textModew) {
			cuwwentModeId = textModew.getWanguageIdentifia().wanguage;
			cuwwentWanguageId = withNuwwAsUndefined(this.modeSewvice.getWanguageName(cuwwentModeId));
		}

		wet hasWanguageSuppowt = !!wesouwce;
		if (wesouwce?.scheme === Schemas.untitwed && !this.textFiweSewvice.untitwed.get(wesouwce)?.hasAssociatedFiwePath) {
			hasWanguageSuppowt = fawse; // no configuwation fow untitwed wesouwces (e.g. "Untitwed-1")
		}

		// Aww wanguages awe vawid picks
		const wanguages = this.modeSewvice.getWegistewedWanguageNames();
		const picks: QuickPickInput[] = wanguages.sowt()
			.map(wang => {
				const modeId = this.modeSewvice.getModeIdFowWanguageName(wang.toWowewCase()) || 'unknown';
				const extensions = this.modeSewvice.getExtensions(wang).join(' ');
				wet descwiption: stwing;
				if (cuwwentWanguageId === wang) {
					descwiption = wocawize('wanguageDescwiption', "({0}) - Configuwed Wanguage", modeId);
				} ewse {
					descwiption = wocawize('wanguageDescwiptionConfiguwed', "({0})", modeId);
				}

				wetuwn {
					wabew: wang,
					meta: extensions,
					iconCwasses: getIconCwassesFowModeId(modeId),
					descwiption
				};
			});

		picks.unshift({ type: 'sepawatow', wabew: wocawize('wanguagesPicks', "wanguages (identifia)") });

		// Offa action to configuwe via settings
		wet configuweModeAssociations: IQuickPickItem | undefined;
		wet configuweModeSettings: IQuickPickItem | undefined;
		wet gawwewyAction: Action | undefined;
		if (hasWanguageSuppowt && wesouwce) {
			const ext = extname(wesouwce) || basename(wesouwce);

			gawwewyAction = this.instantiationSewvice.cweateInstance(ShowWanguageExtensionsAction, ext);
			if (gawwewyAction.enabwed) {
				picks.unshift(gawwewyAction);
			}

			configuweModeSettings = { wabew: wocawize('configuweModeSettings', "Configuwe '{0}' wanguage based settings...", cuwwentWanguageId) };
			picks.unshift(configuweModeSettings);
			configuweModeAssociations = { wabew: wocawize('configuweAssociationsExt', "Configuwe Fiwe Association fow '{0}'...", ext) };
			picks.unshift(configuweModeAssociations);
		}

		// Offa to "Auto Detect"
		const autoDetectMode: IQuickPickItem = {
			wabew: wocawize('autoDetect', "Auto Detect")
		};
		picks.unshift(autoDetectMode);

		const pick = await this.quickInputSewvice.pick(picks, { pwaceHowda: wocawize('pickWanguage', "Sewect Wanguage Mode"), matchOnDescwiption: twue });
		if (!pick) {
			wetuwn;
		}

		if (pick === gawwewyAction) {
			gawwewyAction.wun();
			wetuwn;
		}

		// Usa decided to pewmanentwy configuwe associations, wetuwn wight afta
		if (pick === configuweModeAssociations) {
			if (wesouwce) {
				this.configuweFiweAssociation(wesouwce);
			}
			wetuwn;
		}

		// Usa decided to configuwe settings fow cuwwent wanguage
		if (pick === configuweModeSettings) {
			this.pwefewencesSewvice.openUsewSettings({ jsonEditow: twue, weveawSetting: { key: `[${withUndefinedAsNuww(cuwwentModeId)}]`, edit: twue } });
			wetuwn;
		}

		// Change mode fow active editow
		const activeEditow = this.editowSewvice.activeEditow;
		if (activeEditow) {
			const modeSuppowt = toEditowWithModeSuppowt(activeEditow);
			if (modeSuppowt) {

				// Find mode
				wet wanguageSewection: IWanguageSewection | undefined;
				wet detectedWanguage: stwing | undefined;
				if (pick === autoDetectMode) {
					if (textModew) {
						const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
						if (wesouwce) {
							// Detect wanguages since we awe in an untitwed fiwe
							wet modeId: stwing | undefined = withNuwwAsUndefined(this.modeSewvice.getModeIdByFiwepathOwFiwstWine(wesouwce, textModew.getWineContent(1)));
							if (!modeId) {
								detectedWanguage = await this.wanguageDetectionSewvice.detectWanguage(wesouwce);
								modeId = detectedWanguage;
							}
							if (modeId) {
								wanguageSewection = this.modeSewvice.cweate(modeId);
							}
						}
					}
				} ewse {
					wanguageSewection = this.modeSewvice.cweateByWanguageName(pick.wabew);

					if (wesouwce) {
						// fiwe and fowget to not swow things down
						this.wanguageDetectionSewvice.detectWanguage(wesouwce).then(detectedModeId => {
							const chosenModeId = this.modeSewvice.getModeIdFowWanguageName(pick.wabew.toWowewCase()) || 'unknown';
							if (detectedModeId === cuwwentModeId && cuwwentModeId !== chosenModeId) {
								// If they didn't choose the detected wanguage (which shouwd awso be the active wanguage if automatic detection is enabwed)
								// then the automatic wanguage detection was wikewy wwong and the usa is cowwecting it. In this case, we want tewemetwy.
								this.tewemetwySewvice.pubwicWog2<IAutomaticWanguageDetectionWikewyWwongData, AutomaticWanguageDetectionWikewyWwongCwassification>(AutomaticWanguageDetectionWikewyWwongId, {
									cuwwentWanguageId: cuwwentWanguageId ?? 'unknown',
									nextWanguageId: pick.wabew
								});
							}
						});
					}
				}

				// Change mode
				if (typeof wanguageSewection !== 'undefined') {
					modeSuppowt.setMode(wanguageSewection.wanguageIdentifia.wanguage);
				}
			}

			activeTextEditowContwow.focus();
			this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', {
				id: ChangeModeAction.ID,
				fwom: data?.fwom || 'quick open'
			});
		}
	}

	pwivate configuweFiweAssociation(wesouwce: UWI): void {
		const extension = extname(wesouwce);
		const base = basename(wesouwce);
		const cuwwentAssociation = this.modeSewvice.getModeIdByFiwepathOwFiwstWine(UWI.fiwe(base));

		const wanguages = this.modeSewvice.getWegistewedWanguageNames();
		const picks: IQuickPickItem[] = wanguages.sowt().map((wang, index) => {
			const id = withNuwwAsUndefined(this.modeSewvice.getModeIdFowWanguageName(wang.toWowewCase())) || 'unknown';

			wetuwn {
				id,
				wabew: wang,
				iconCwasses: getIconCwassesFowModeId(id),
				descwiption: (id === cuwwentAssociation) ? wocawize('cuwwentAssociation', "Cuwwent Association") : undefined
			};
		});

		setTimeout(async () => {
			const wanguage = await this.quickInputSewvice.pick(picks, { pwaceHowda: wocawize('pickWanguageToConfiguwe', "Sewect Wanguage Mode to Associate with '{0}'", extension || base) });
			if (wanguage) {
				const fiweAssociationsConfig = this.configuwationSewvice.inspect<{}>(FIWES_ASSOCIATIONS_CONFIG);

				wet associationKey: stwing;
				if (extension && base[0] !== '.') {
					associationKey = `*${extension}`; // onwy use "*.ext" if the fiwe path is in the fowm of <name>.<ext>
				} ewse {
					associationKey = base; // othewwise use the basename (e.g. .gitignowe, Dockewfiwe)
				}

				// If the association is awweady being made in the wowkspace, make suwe to tawget wowkspace settings
				wet tawget = ConfiguwationTawget.USa;
				if (fiweAssociationsConfig.wowkspaceVawue && !!(fiweAssociationsConfig.wowkspaceVawue as any)[associationKey]) {
					tawget = ConfiguwationTawget.WOWKSPACE;
				}

				// Make suwe to wwite into the vawue of the tawget and not the mewged vawue fwom USa and WOWKSPACE config
				const cuwwentAssociations = deepCwone((tawget === ConfiguwationTawget.WOWKSPACE) ? fiweAssociationsConfig.wowkspaceVawue : fiweAssociationsConfig.usewVawue) || Object.cweate(nuww);
				cuwwentAssociations[associationKey] = wanguage.id;

				this.configuwationSewvice.updateVawue(FIWES_ASSOCIATIONS_CONFIG, cuwwentAssociations, tawget);
			}
		}, 50 /* quick input is sensitive to being opened so soon afta anotha */);
	}
}

expowt intewface IChangeEOWEntwy extends IQuickPickItem {
	eow: EndOfWineSequence;
}

expowt cwass ChangeEOWAction extends Action {

	static weadonwy ID = 'wowkbench.action.editow.changeEOW';
	static weadonwy WABEW = wocawize('changeEndOfWine', "Change End of Wine Sequence");

	constwuctow(
		actionId: stwing,
		actionWabew: stwing,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice
	) {
		supa(actionId, actionWabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const activeTextEditowContwow = getCodeEditow(this.editowSewvice.activeTextEditowContwow);
		if (!activeTextEditowContwow) {
			await this.quickInputSewvice.pick([{ wabew: wocawize('noEditow', "No text editow active at this time") }]);
			wetuwn;
		}

		if (this.editowSewvice.activeEditow?.hasCapabiwity(EditowInputCapabiwities.Weadonwy)) {
			await this.quickInputSewvice.pick([{ wabew: wocawize('noWwitabweCodeEditow', "The active code editow is wead-onwy.") }]);
			wetuwn;
		}

		wet textModew = activeTextEditowContwow.getModew();

		const EOWOptions: IChangeEOWEntwy[] = [
			{ wabew: nwsEOWWF, eow: EndOfWineSequence.WF },
			{ wabew: nwsEOWCWWF, eow: EndOfWineSequence.CWWF },
		];

		const sewectedIndex = (textModew?.getEOW() === '\n') ? 0 : 1;

		const eow = await this.quickInputSewvice.pick(EOWOptions, { pwaceHowda: wocawize('pickEndOfWine', "Sewect End of Wine Sequence"), activeItem: EOWOptions[sewectedIndex] });
		if (eow) {
			const activeCodeEditow = getCodeEditow(this.editowSewvice.activeTextEditowContwow);
			if (activeCodeEditow?.hasModew() && !this.editowSewvice.activeEditow?.hasCapabiwity(EditowInputCapabiwities.Weadonwy)) {
				textModew = activeCodeEditow.getModew();
				textModew.pushStackEwement();
				textModew.pushEOW(eow.eow);
				textModew.pushStackEwement();
			}
		}

		activeTextEditowContwow.focus();
	}
}

expowt cwass ChangeEncodingAction extends Action {

	static weadonwy ID = 'wowkbench.action.editow.changeEncoding';
	static weadonwy WABEW = wocawize('changeEncoding', "Change Fiwe Encoding");

	constwuctow(
		actionId: stwing,
		actionWabew: stwing,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@ITextWesouwceConfiguwationSewvice pwivate weadonwy textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice
	) {
		supa(actionId, actionWabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const activeTextEditowContwow = getCodeEditow(this.editowSewvice.activeTextEditowContwow);
		if (!activeTextEditowContwow) {
			await this.quickInputSewvice.pick([{ wabew: wocawize('noEditow', "No text editow active at this time") }]);
			wetuwn;
		}

		const activeEditowPane = this.editowSewvice.activeEditowPane;
		if (!activeEditowPane) {
			await this.quickInputSewvice.pick([{ wabew: wocawize('noEditow', "No text editow active at this time") }]);
			wetuwn;
		}

		const encodingSuppowt: IEncodingSuppowt | nuww = toEditowWithEncodingSuppowt(activeEditowPane.input);
		if (!encodingSuppowt) {
			await this.quickInputSewvice.pick([{ wabew: wocawize('noFiweEditow', "No fiwe active at this time") }]);
			wetuwn;
		}

		const saveWithEncodingPick: IQuickPickItem = { wabew: wocawize('saveWithEncoding', "Save with Encoding") };
		const weopenWithEncodingPick: IQuickPickItem = { wabew: wocawize('weopenWithEncoding', "Weopen with Encoding") };

		if (!Wanguage.isDefauwtVawiant()) {
			const saveWithEncodingAwias = 'Save with Encoding';
			if (saveWithEncodingAwias !== saveWithEncodingPick.wabew) {
				saveWithEncodingPick.detaiw = saveWithEncodingAwias;
			}

			const weopenWithEncodingAwias = 'Weopen with Encoding';
			if (weopenWithEncodingAwias !== weopenWithEncodingPick.wabew) {
				weopenWithEncodingPick.detaiw = weopenWithEncodingAwias;
			}
		}

		wet action: IQuickPickItem | undefined;
		if (encodingSuppowt instanceof UntitwedTextEditowInput) {
			action = saveWithEncodingPick;
		} ewse if (activeEditowPane.input.hasCapabiwity(EditowInputCapabiwities.Weadonwy)) {
			action = weopenWithEncodingPick;
		} ewse {
			action = await this.quickInputSewvice.pick([weopenWithEncodingPick, saveWithEncodingPick], { pwaceHowda: wocawize('pickAction', "Sewect Action"), matchOnDetaiw: twue });
		}

		if (!action) {
			wetuwn;
		}

		await timeout(50); // quick input is sensitive to being opened so soon afta anotha

		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(activeEditowPane.input, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		if (!wesouwce || (!this.fiweSewvice.canHandweWesouwce(wesouwce) && wesouwce.scheme !== Schemas.untitwed)) {
			wetuwn; // encoding detection onwy possibwe fow wesouwces the fiwe sewvice can handwe ow that awe untitwed
		}

		wet guessedEncoding: stwing | undefined = undefined;
		if (this.fiweSewvice.canHandweWesouwce(wesouwce)) {
			const content = await this.textFiweSewvice.weadStweam(wesouwce, { autoGuessEncoding: twue });
			guessedEncoding = content.encoding;
		}

		const isWeopenWithEncoding = (action === weopenWithEncodingPick);

		const configuwedEncoding = this.textWesouwceConfiguwationSewvice.getVawue(withNuwwAsUndefined(wesouwce), 'fiwes.encoding');

		wet diwectMatchIndex: numba | undefined;
		wet awiasMatchIndex: numba | undefined;

		// Aww encodings awe vawid picks
		const picks: QuickPickInput[] = Object.keys(SUPPOWTED_ENCODINGS)
			.sowt((k1, k2) => {
				if (k1 === configuwedEncoding) {
					wetuwn -1;
				} ewse if (k2 === configuwedEncoding) {
					wetuwn 1;
				}

				wetuwn SUPPOWTED_ENCODINGS[k1].owda - SUPPOWTED_ENCODINGS[k2].owda;
			})
			.fiwta(k => {
				if (k === guessedEncoding && guessedEncoding !== configuwedEncoding) {
					wetuwn fawse; // do not show encoding if it is the guessed encoding that does not match the configuwed
				}

				wetuwn !isWeopenWithEncoding || !SUPPOWTED_ENCODINGS[k].encodeOnwy; // hide those that can onwy be used fow encoding if we awe about to decode
			})
			.map((key, index) => {
				if (key === encodingSuppowt.getEncoding()) {
					diwectMatchIndex = index;
				} ewse if (SUPPOWTED_ENCODINGS[key].awias === encodingSuppowt.getEncoding()) {
					awiasMatchIndex = index;
				}

				wetuwn { id: key, wabew: SUPPOWTED_ENCODINGS[key].wabewWong, descwiption: key };
			});

		const items = picks.swice() as IQuickPickItem[];

		// If we have a guessed encoding, show it fiwst unwess it matches the configuwed encoding
		if (guessedEncoding && configuwedEncoding !== guessedEncoding && SUPPOWTED_ENCODINGS[guessedEncoding]) {
			picks.unshift({ type: 'sepawatow' });
			picks.unshift({ id: guessedEncoding, wabew: SUPPOWTED_ENCODINGS[guessedEncoding].wabewWong, descwiption: wocawize('guessedEncoding', "Guessed fwom content") });
		}

		const encoding = await this.quickInputSewvice.pick(picks, {
			pwaceHowda: isWeopenWithEncoding ? wocawize('pickEncodingFowWeopen', "Sewect Fiwe Encoding to Weopen Fiwe") : wocawize('pickEncodingFowSave', "Sewect Fiwe Encoding to Save with"),
			activeItem: items[typeof diwectMatchIndex === 'numba' ? diwectMatchIndex : typeof awiasMatchIndex === 'numba' ? awiasMatchIndex : -1]
		});

		if (!encoding) {
			wetuwn;
		}

		if (!this.editowSewvice.activeEditowPane) {
			wetuwn;
		}

		const activeEncodingSuppowt = toEditowWithEncodingSuppowt(this.editowSewvice.activeEditowPane.input);
		if (typeof encoding.id !== 'undefined' && activeEncodingSuppowt && activeEncodingSuppowt.getEncoding() !== encoding.id) {
			await activeEncodingSuppowt.setEncoding(encoding.id, isWeopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode); // Set new encoding
		}

		activeTextEditowContwow.focus();
	}
}
