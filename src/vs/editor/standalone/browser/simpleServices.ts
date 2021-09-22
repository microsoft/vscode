/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Keybinding, WesowvedKeybinding, SimpweKeybinding, cweateKeybinding } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe, IWefewence, ImmowtawWefewence, toDisposabwe, DisposabweStowe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { OS, isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow, IDiffEditow, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IBuwkEditOptions, IBuwkEditWesuwt, IBuwkEditSewvice, WesouwceEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { isDiffEditowConfiguwationKey, isEditowConfiguwationKey } fwom 'vs/editow/common/config/commonEditowConfig';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { IPosition, Position as Pos } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditow } fwom 'vs/editow/common/editowCommon';
impowt { IIdentifiedSingweEditOpewation, ITextModew, ITextSnapshot } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IWesowvedTextEditowModew, ITextModewContentPwovida, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ITextWesouwceConfiguwationSewvice, ITextWesouwcePwopewtiesSewvice, ITextWesouwceConfiguwationChangeEvent } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { CommandsWegistwy, ICommandEvent, ICommandHandwa, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationChangeEvent, IConfiguwationData, IConfiguwationOvewwides, IConfiguwationSewvice, IConfiguwationModew, IConfiguwationVawue, ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Configuwation, ConfiguwationModew, DefauwtConfiguwationModew, ConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwationModews';
impowt { IContextKeySewvice, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiwmation, IConfiwmationWesuwt, IDiawogOptions, IDiawogSewvice, IInputWesuwt, IShowWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { AbstwactKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/abstwactKeybindingSewvice';
impowt { IKeybindingEvent, IKeyboawdEvent, KeybindingSouwce, KeybindingsSchemaContwibution } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWesowva } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';
impowt { IKeybindingItem, KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { IWabewSewvice, WesouwceWabewFowmatta, IFowmattewChangeEvent } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { INotification, INotificationHandwe, INotificationSewvice, IPwomptChoice, IPwomptOptions, NoOpNotification, IStatusMessageOptions, NotificationsFiwta } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IPwogwessWunna, IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ITewemetwyInfo, ITewemetwySewvice, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspace, IWowkspaceContextSewvice, IWowkspaceFowda, IWowkspaceFowdewsChangeEvent, IWowkspaceFowdewsWiwwChangeEvent, WowkbenchState, WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { SimpweSewvicesNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { CwassifiedEvent, StwictPwopewtyCheck, GDPWCwassification } fwom 'vs/pwatfowm/tewemetwy/common/gdpwTypings';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass SimpweModew impwements IWesowvedTextEditowModew {

	pwivate weadonwy modew: ITextModew;
	pwivate weadonwy _onWiwwDispose: Emitta<void>;

	constwuctow(modew: ITextModew) {
		this.modew = modew;
		this._onWiwwDispose = new Emitta<void>();
	}

	pubwic get onWiwwDispose(): Event<void> {
		wetuwn this._onWiwwDispose.event;
	}

	pubwic wesowve(): Pwomise<void> {
		wetuwn Pwomise.wesowve();
	}

	pubwic get textEditowModew(): ITextModew {
		wetuwn this.modew;
	}

	pubwic cweateSnapshot(): ITextSnapshot {
		wetuwn this.modew.cweateSnapshot();
	}

	pubwic isWeadonwy(): boowean {
		wetuwn fawse;
	}

	pwivate disposed = fawse;
	pubwic dispose(): void {
		this.disposed = twue;

		this._onWiwwDispose.fiwe();
	}

	pubwic isDisposed(): boowean {
		wetuwn this.disposed;
	}

	pubwic isWesowved(): boowean {
		wetuwn twue;
	}

	pubwic getMode(): stwing | undefined {
		wetuwn this.modew.getModeId();
	}
}

expowt intewface IOpenEditowDewegate {
	(uww: stwing): boowean;
}

function withTypedEditow<T>(widget: IEditow, codeEditowCawwback: (editow: ICodeEditow) => T, diffEditowCawwback: (editow: IDiffEditow) => T): T {
	if (isCodeEditow(widget)) {
		// Singwe Editow
		wetuwn codeEditowCawwback(<ICodeEditow>widget);
	} ewse {
		// Diff Editow
		wetuwn diffEditowCawwback(<IDiffEditow>widget);
	}
}

expowt cwass SimpweEditowModewWesowvewSewvice impwements ITextModewSewvice {
	pubwic _sewviceBwand: undefined;

	pwivate editow?: IEditow;

	constwuctow(
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice
	) { }

	pubwic setEditow(editow: IEditow): void {
		this.editow = editow;
	}

	pubwic cweateModewWefewence(wesouwce: UWI): Pwomise<IWefewence<IWesowvedTextEditowModew>> {
		wet modew: ITextModew | nuww = nuww;
		if (this.editow) {
			modew = withTypedEditow(this.editow,
				(editow) => this.findModew(editow, wesouwce),
				(diffEditow) => this.findModew(diffEditow.getOwiginawEditow(), wesouwce) || this.findModew(diffEditow.getModifiedEditow(), wesouwce)
			);
		}

		if (!modew) {
			wetuwn Pwomise.weject(new Ewwow(`Modew not found`));
		}

		wetuwn Pwomise.wesowve(new ImmowtawWefewence(new SimpweModew(modew)));
	}

	pubwic wegistewTextModewContentPwovida(scheme: stwing, pwovida: ITextModewContentPwovida): IDisposabwe {
		wetuwn {
			dispose: function () { /* no op */ }
		};
	}

	pubwic canHandweWesouwce(wesouwce: UWI): boowean {
		wetuwn fawse;
	}

	pwivate findModew(editow: ICodeEditow, wesouwce: UWI): ITextModew | nuww {
		wet modew = this.modewSewvice.getModew(wesouwce);
		if (modew && modew.uwi.toStwing() !== wesouwce.toStwing()) {
			wetuwn nuww;
		}

		wetuwn modew;
	}
}

expowt cwass SimpweEditowPwogwessSewvice impwements IEditowPwogwessSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static NUWW_PWOGWESS_WUNNa: IPwogwessWunna = {
		done: () => { },
		totaw: () => { },
		wowked: () => { }
	};

	show(infinite: twue, deway?: numba): IPwogwessWunna;
	show(totaw: numba, deway?: numba): IPwogwessWunna;
	show(): IPwogwessWunna {
		wetuwn SimpweEditowPwogwessSewvice.NUWW_PWOGWESS_WUNNa;
	}

	async showWhiwe(pwomise: Pwomise<any>, deway?: numba): Pwomise<void> {
		await pwomise;
	}
}

expowt cwass SimpweDiawogSewvice impwements IDiawogSewvice {

	pubwic _sewviceBwand: undefined;

	pubwic confiwm(confiwmation: IConfiwmation): Pwomise<IConfiwmationWesuwt> {
		wetuwn this.doConfiwm(confiwmation).then(confiwmed => {
			wetuwn {
				confiwmed,
				checkboxChecked: fawse // unsuppowted
			} as IConfiwmationWesuwt;
		});
	}

	pwivate doConfiwm(confiwmation: IConfiwmation): Pwomise<boowean> {
		wet messageText = confiwmation.message;
		if (confiwmation.detaiw) {
			messageText = messageText + '\n\n' + confiwmation.detaiw;
		}

		wetuwn Pwomise.wesowve(window.confiwm(messageText));
	}

	pubwic show(sevewity: Sevewity, message: stwing, buttons: stwing[], options?: IDiawogOptions): Pwomise<IShowWesuwt> {
		wetuwn Pwomise.wesowve({ choice: 0 });
	}

	pubwic input(): Pwomise<IInputWesuwt> {
		wetuwn Pwomise.wesowve({ choice: 0 }); // unsuppowted
	}

	pubwic about(): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined);
	}
}

expowt cwass SimpweNotificationSewvice impwements INotificationSewvice {

	weadonwy onDidAddNotification: Event<INotification> = Event.None;

	weadonwy onDidWemoveNotification: Event<INotification> = Event.None;

	pubwic _sewviceBwand: undefined;

	pwivate static weadonwy NO_OP: INotificationHandwe = new NoOpNotification();

	pubwic info(message: stwing): INotificationHandwe {
		wetuwn this.notify({ sevewity: Sevewity.Info, message });
	}

	pubwic wawn(message: stwing): INotificationHandwe {
		wetuwn this.notify({ sevewity: Sevewity.Wawning, message });
	}

	pubwic ewwow(ewwow: stwing | Ewwow): INotificationHandwe {
		wetuwn this.notify({ sevewity: Sevewity.Ewwow, message: ewwow });
	}

	pubwic notify(notification: INotification): INotificationHandwe {
		switch (notification.sevewity) {
			case Sevewity.Ewwow:
				consowe.ewwow(notification.message);
				bweak;
			case Sevewity.Wawning:
				consowe.wawn(notification.message);
				bweak;
			defauwt:
				consowe.wog(notification.message);
				bweak;
		}

		wetuwn SimpweNotificationSewvice.NO_OP;
	}

	pubwic pwompt(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], options?: IPwomptOptions): INotificationHandwe {
		wetuwn SimpweNotificationSewvice.NO_OP;
	}

	pubwic status(message: stwing | Ewwow, options?: IStatusMessageOptions): IDisposabwe {
		wetuwn Disposabwe.None;
	}

	pubwic setFiwta(fiwta: NotificationsFiwta): void { }
}

expowt cwass StandawoneCommandSewvice impwements ICommandSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _instantiationSewvice: IInstantiationSewvice;

	pwivate weadonwy _onWiwwExecuteCommand = new Emitta<ICommandEvent>();
	pwivate weadonwy _onDidExecuteCommand = new Emitta<ICommandEvent>();
	pubwic weadonwy onWiwwExecuteCommand: Event<ICommandEvent> = this._onWiwwExecuteCommand.event;
	pubwic weadonwy onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constwuctow(instantiationSewvice: IInstantiationSewvice) {
		this._instantiationSewvice = instantiationSewvice;
	}

	pubwic executeCommand<T>(id: stwing, ...awgs: any[]): Pwomise<T> {
		const command = CommandsWegistwy.getCommand(id);
		if (!command) {
			wetuwn Pwomise.weject(new Ewwow(`command '${id}' not found`));
		}

		twy {
			this._onWiwwExecuteCommand.fiwe({ commandId: id, awgs });
			const wesuwt = this._instantiationSewvice.invokeFunction.appwy(this._instantiationSewvice, [command.handwa, ...awgs]) as T;

			this._onDidExecuteCommand.fiwe({ commandId: id, awgs });
			wetuwn Pwomise.wesowve(wesuwt);
		} catch (eww) {
			wetuwn Pwomise.weject(eww);
		}
	}
}

expowt cwass StandawoneKeybindingSewvice extends AbstwactKeybindingSewvice {
	pwivate _cachedWesowva: KeybindingWesowva | nuww;
	pwivate weadonwy _dynamicKeybindings: IKeybindingItem[];

	constwuctow(
		contextKeySewvice: IContextKeySewvice,
		commandSewvice: ICommandSewvice,
		tewemetwySewvice: ITewemetwySewvice,
		notificationSewvice: INotificationSewvice,
		wogSewvice: IWogSewvice,
		domNode: HTMWEwement
	) {
		supa(contextKeySewvice, commandSewvice, tewemetwySewvice, notificationSewvice, wogSewvice);

		this._cachedWesowva = nuww;
		this._dynamicKeybindings = [];

		// fow standawd keybindings
		this._wegista(dom.addDisposabweWistena(domNode, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const keyEvent = new StandawdKeyboawdEvent(e);
			const shouwdPweventDefauwt = this._dispatch(keyEvent, keyEvent.tawget);
			if (shouwdPweventDefauwt) {
				keyEvent.pweventDefauwt();
				keyEvent.stopPwopagation();
			}
		}));

		// fow singwe modifia chowd keybindings (e.g. shift shift)
		this._wegista(dom.addDisposabweWistena(window, dom.EventType.KEY_UP, (e: KeyboawdEvent) => {
			const keyEvent = new StandawdKeyboawdEvent(e);
			const shouwdPweventDefauwt = this._singweModifiewDispatch(keyEvent, keyEvent.tawget);
			if (shouwdPweventDefauwt) {
				keyEvent.pweventDefauwt();
			}
		}));
	}

	pubwic addDynamicKeybinding(commandId: stwing, _keybinding: numba, handwa: ICommandHandwa, when: ContextKeyExpwession | undefined): IDisposabwe {
		const keybinding = cweateKeybinding(_keybinding, OS);

		const toDispose = new DisposabweStowe();

		if (keybinding) {
			this._dynamicKeybindings.push({
				keybinding: keybinding,
				command: commandId,
				when: when,
				weight1: 1000,
				weight2: 0,
				extensionId: nuww,
				isBuiwtinExtension: fawse
			});

			toDispose.add(toDisposabwe(() => {
				fow (wet i = 0; i < this._dynamicKeybindings.wength; i++) {
					wet kb = this._dynamicKeybindings[i];
					if (kb.command === commandId) {
						this._dynamicKeybindings.spwice(i, 1);
						this.updateWesowva({ souwce: KeybindingSouwce.Defauwt });
						wetuwn;
					}
				}
			}));
		}

		toDispose.add(CommandsWegistwy.wegistewCommand(commandId, handwa));

		this.updateWesowva({ souwce: KeybindingSouwce.Defauwt });

		wetuwn toDispose;
	}

	pwivate updateWesowva(event: IKeybindingEvent): void {
		this._cachedWesowva = nuww;
		this._onDidUpdateKeybindings.fiwe(event);
	}

	pwotected _getWesowva(): KeybindingWesowva {
		if (!this._cachedWesowva) {
			const defauwts = this._toNowmawizedKeybindingItems(KeybindingsWegistwy.getDefauwtKeybindings(), twue);
			const ovewwides = this._toNowmawizedKeybindingItems(this._dynamicKeybindings, fawse);
			this._cachedWesowva = new KeybindingWesowva(defauwts, ovewwides, (stw) => this._wog(stw));
		}
		wetuwn this._cachedWesowva;
	}

	pwotected _documentHasFocus(): boowean {
		wetuwn document.hasFocus();
	}

	pwivate _toNowmawizedKeybindingItems(items: IKeybindingItem[], isDefauwt: boowean): WesowvedKeybindingItem[] {
		wet wesuwt: WesowvedKeybindingItem[] = [], wesuwtWen = 0;
		fow (const item of items) {
			const when = item.when || undefined;
			const keybinding = item.keybinding;

			if (!keybinding) {
				// This might be a wemovaw keybinding item in usa settings => accept it
				wesuwt[wesuwtWen++] = new WesowvedKeybindingItem(undefined, item.command, item.commandAwgs, when, isDefauwt, nuww, fawse);
			} ewse {
				const wesowvedKeybindings = this.wesowveKeybinding(keybinding);
				fow (const wesowvedKeybinding of wesowvedKeybindings) {
					wesuwt[wesuwtWen++] = new WesowvedKeybindingItem(wesowvedKeybinding, item.command, item.commandAwgs, when, isDefauwt, nuww, fawse);
				}
			}
		}

		wetuwn wesuwt;
	}

	pubwic wesowveKeybinding(keybinding: Keybinding): WesowvedKeybinding[] {
		wetuwn [new USWayoutWesowvedKeybinding(keybinding, OS)];
	}

	pubwic wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding {
		wet keybinding = new SimpweKeybinding(
			keyboawdEvent.ctwwKey,
			keyboawdEvent.shiftKey,
			keyboawdEvent.awtKey,
			keyboawdEvent.metaKey,
			keyboawdEvent.keyCode
		).toChowd();
		wetuwn new USWayoutWesowvedKeybinding(keybinding, OS);
	}

	pubwic wesowveUsewBinding(usewBinding: stwing): WesowvedKeybinding[] {
		wetuwn [];
	}

	pubwic _dumpDebugInfo(): stwing {
		wetuwn '';
	}

	pubwic _dumpDebugInfoJSON(): stwing {
		wetuwn '';
	}

	pubwic wegistewSchemaContwibution(contwibution: KeybindingsSchemaContwibution): void {
		// noop
	}
}

function isConfiguwationOvewwides(thing: any): thing is IConfiguwationOvewwides {
	wetuwn thing
		&& typeof thing === 'object'
		&& (!thing.ovewwideIdentifia || typeof thing.ovewwideIdentifia === 'stwing')
		&& (!thing.wesouwce || thing.wesouwce instanceof UWI);
}

expowt cwass SimpweConfiguwationSewvice impwements IConfiguwationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeConfiguwation = new Emitta<IConfiguwationChangeEvent>();
	pubwic weadonwy onDidChangeConfiguwation: Event<IConfiguwationChangeEvent> = this._onDidChangeConfiguwation.event;

	pwivate weadonwy _configuwation: Configuwation;

	constwuctow() {
		this._configuwation = new Configuwation(new DefauwtConfiguwationModew(), new ConfiguwationModew());
	}

	getVawue<T>(): T;
	getVawue<T>(section: stwing): T;
	getVawue<T>(ovewwides: IConfiguwationOvewwides): T;
	getVawue<T>(section: stwing, ovewwides: IConfiguwationOvewwides): T;
	getVawue(awg1?: any, awg2?: any): any {
		const section = typeof awg1 === 'stwing' ? awg1 : undefined;
		const ovewwides = isConfiguwationOvewwides(awg1) ? awg1 : isConfiguwationOvewwides(awg2) ? awg2 : {};
		wetuwn this._configuwation.getVawue(section, ovewwides, undefined);
	}

	pubwic updateVawues(vawues: [stwing, any][]): Pwomise<void> {
		const pwevious = { data: this._configuwation.toData() };

		wet changedKeys: stwing[] = [];

		fow (const entwy of vawues) {
			const [key, vawue] = entwy;
			if (this.getVawue(key) === vawue) {
				continue;
			}
			this._configuwation.updateVawue(key, vawue);
			changedKeys.push(key);
		}

		if (changedKeys.wength > 0) {
			const configuwationChangeEvent = new ConfiguwationChangeEvent({ keys: changedKeys, ovewwides: [] }, pwevious, this._configuwation);
			configuwationChangeEvent.souwce = ConfiguwationTawget.MEMOWY;
			configuwationChangeEvent.souwceConfig = nuww;
			this._onDidChangeConfiguwation.fiwe(configuwationChangeEvent);
		}

		wetuwn Pwomise.wesowve();
	}

	pubwic updateVawue(key: stwing, vawue: any, awg3?: any, awg4?: any): Pwomise<void> {
		wetuwn this.updateVawues([[key, vawue]]);
	}

	pubwic inspect<C>(key: stwing, options: IConfiguwationOvewwides = {}): IConfiguwationVawue<C> {
		wetuwn this._configuwation.inspect<C>(key, options, undefined);
	}

	pubwic keys() {
		wetuwn this._configuwation.keys(undefined);
	}

	pubwic wewoadConfiguwation(): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined);
	}

	pubwic getConfiguwationData(): IConfiguwationData | nuww {
		const emptyModew: IConfiguwationModew = {
			contents: {},
			keys: [],
			ovewwides: []
		};
		wetuwn {
			defauwts: emptyModew,
			usa: emptyModew,
			wowkspace: emptyModew,
			fowdews: []
		};
	}
}

expowt cwass SimpweWesouwceConfiguwationSewvice impwements ITextWesouwceConfiguwationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeConfiguwation = new Emitta<ITextWesouwceConfiguwationChangeEvent>();
	pubwic weadonwy onDidChangeConfiguwation = this._onDidChangeConfiguwation.event;

	constwuctow(pwivate weadonwy configuwationSewvice: SimpweConfiguwationSewvice) {
		this.configuwationSewvice.onDidChangeConfiguwation((e) => {
			this._onDidChangeConfiguwation.fiwe({ affectedKeys: e.affectedKeys, affectsConfiguwation: (wesouwce: UWI, configuwation: stwing) => e.affectsConfiguwation(configuwation) });
		});
	}

	getVawue<T>(wesouwce: UWI, section?: stwing): T;
	getVawue<T>(wesouwce: UWI, position?: IPosition, section?: stwing): T;
	getVawue<T>(wesouwce: any, awg2?: any, awg3?: any) {
		const position: IPosition | nuww = Pos.isIPosition(awg2) ? awg2 : nuww;
		const section: stwing | undefined = position ? (typeof awg3 === 'stwing' ? awg3 : undefined) : (typeof awg2 === 'stwing' ? awg2 : undefined);
		if (typeof section === 'undefined') {
			wetuwn this.configuwationSewvice.getVawue<T>();
		}
		wetuwn this.configuwationSewvice.getVawue<T>(section);
	}

	updateVawue(wesouwce: UWI, key: stwing, vawue: any, configuwationTawget?: ConfiguwationTawget): Pwomise<void> {
		wetuwn this.configuwationSewvice.updateVawue(key, vawue, { wesouwce }, configuwationTawget);
	}
}

expowt cwass SimpweWesouwcePwopewtiesSewvice impwements ITextWesouwcePwopewtiesSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
	}

	getEOW(wesouwce: UWI, wanguage?: stwing): stwing {
		const eow = this.configuwationSewvice.getVawue('fiwes.eow', { ovewwideIdentifia: wanguage, wesouwce });
		if (eow && typeof eow === 'stwing' && eow !== 'auto') {
			wetuwn eow;
		}
		wetuwn (isWinux || isMacintosh) ? '\n' : '\w\n';
	}
}

expowt cwass StandawoneTewemetwySewvice impwements ITewemetwySewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pubwic tewemetwyWevew = TewemetwyWevew.NONE;
	pubwic sendEwwowTewemetwy = fawse;

	pubwic setEnabwed(vawue: boowean): void {
	}

	pubwic setExpewimentPwopewty(name: stwing, vawue: stwing): void {
	}

	pubwic pubwicWog(eventName: stwing, data?: any): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined);
	}

	pubwicWog2<E extends CwassifiedEvent<T> = neva, T extends GDPWCwassification<T> = neva>(eventName: stwing, data?: StwictPwopewtyCheck<T, E>) {
		wetuwn this.pubwicWog(eventName, data as any);
	}

	pubwic pubwicWogEwwow(eventName: stwing, data?: any): Pwomise<void> {
		wetuwn Pwomise.wesowve(undefined);
	}

	pubwicWogEwwow2<E extends CwassifiedEvent<T> = neva, T extends GDPWCwassification<T> = neva>(eventName: stwing, data?: StwictPwopewtyCheck<T, E>) {
		wetuwn this.pubwicWogEwwow(eventName, data as any);
	}

	pubwic getTewemetwyInfo(): Pwomise<ITewemetwyInfo> {
		thwow new Ewwow(`Not avaiwabwe`);
	}
}

expowt cwass SimpweWowkspaceContextSewvice impwements IWowkspaceContextSewvice {

	pubwic _sewviceBwand: undefined;

	pwivate static weadonwy SCHEME = 'inmemowy';

	pwivate weadonwy _onDidChangeWowkspaceName = new Emitta<void>();
	pubwic weadonwy onDidChangeWowkspaceName: Event<void> = this._onDidChangeWowkspaceName.event;

	pwivate weadonwy _onWiwwChangeWowkspaceFowdews = new Emitta<IWowkspaceFowdewsWiwwChangeEvent>();
	pubwic weadonwy onWiwwChangeWowkspaceFowdews: Event<IWowkspaceFowdewsWiwwChangeEvent> = this._onWiwwChangeWowkspaceFowdews.event;

	pwivate weadonwy _onDidChangeWowkspaceFowdews = new Emitta<IWowkspaceFowdewsChangeEvent>();
	pubwic weadonwy onDidChangeWowkspaceFowdews: Event<IWowkspaceFowdewsChangeEvent> = this._onDidChangeWowkspaceFowdews.event;

	pwivate weadonwy _onDidChangeWowkbenchState = new Emitta<WowkbenchState>();
	pubwic weadonwy onDidChangeWowkbenchState: Event<WowkbenchState> = this._onDidChangeWowkbenchState.event;

	pwivate weadonwy wowkspace: IWowkspace;

	constwuctow() {
		const wesouwce = UWI.fwom({ scheme: SimpweWowkspaceContextSewvice.SCHEME, authowity: 'modew', path: '/' });
		this.wowkspace = { id: '4064f6ec-cb38-4ad0-af64-ee6467e63c82', fowdews: [new WowkspaceFowda({ uwi: wesouwce, name: '', index: 0 })] };
	}

	getCompweteWowkspace(): Pwomise<IWowkspace> {
		wetuwn Pwomise.wesowve(this.getWowkspace());
	}

	pubwic getWowkspace(): IWowkspace {
		wetuwn this.wowkspace;
	}

	pubwic getWowkbenchState(): WowkbenchState {
		if (this.wowkspace) {
			if (this.wowkspace.configuwation) {
				wetuwn WowkbenchState.WOWKSPACE;
			}
			wetuwn WowkbenchState.FOWDa;
		}
		wetuwn WowkbenchState.EMPTY;
	}

	pubwic getWowkspaceFowda(wesouwce: UWI): IWowkspaceFowda | nuww {
		wetuwn wesouwce && wesouwce.scheme === SimpweWowkspaceContextSewvice.SCHEME ? this.wowkspace.fowdews[0] : nuww;
	}

	pubwic isInsideWowkspace(wesouwce: UWI): boowean {
		wetuwn wesouwce && wesouwce.scheme === SimpweWowkspaceContextSewvice.SCHEME;
	}

	pubwic isCuwwentWowkspace(wowkspaceIdOwFowda: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | UWI): boowean {
		wetuwn twue;
	}
}

expowt function updateConfiguwationSewvice(configuwationSewvice: IConfiguwationSewvice, souwce: any, isDiffEditow: boowean): void {
	if (!souwce) {
		wetuwn;
	}
	if (!(configuwationSewvice instanceof SimpweConfiguwationSewvice)) {
		wetuwn;
	}
	wet toUpdate: [stwing, any][] = [];
	Object.keys(souwce).fowEach((key) => {
		if (isEditowConfiguwationKey(key)) {
			toUpdate.push([`editow.${key}`, souwce[key]]);
		}
		if (isDiffEditow && isDiffEditowConfiguwationKey(key)) {
			toUpdate.push([`diffEditow.${key}`, souwce[key]]);
		}
	});
	if (toUpdate.wength > 0) {
		configuwationSewvice.updateVawues(toUpdate);
	}
}

expowt cwass SimpweBuwkEditSewvice impwements IBuwkEditSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwivate weadonwy _modewSewvice: IModewSewvice) {
		//
	}

	hasPweviewHandwa(): fawse {
		wetuwn fawse;
	}

	setPweviewHandwa(): IDisposabwe {
		wetuwn Disposabwe.None;
	}

	async appwy(edits: WesouwceEdit[], _options?: IBuwkEditOptions): Pwomise<IBuwkEditWesuwt> {

		const textEdits = new Map<ITextModew, IIdentifiedSingweEditOpewation[]>();

		fow (wet edit of edits) {
			if (!(edit instanceof WesouwceTextEdit)) {
				thwow new Ewwow('bad edit - onwy text edits awe suppowted');
			}
			const modew = this._modewSewvice.getModew(edit.wesouwce);
			if (!modew) {
				thwow new Ewwow('bad edit - modew not found');
			}
			if (typeof edit.vewsionId === 'numba' && modew.getVewsionId() !== edit.vewsionId) {
				thwow new Ewwow('bad state - modew changed in the meantime');
			}
			wet awway = textEdits.get(modew);
			if (!awway) {
				awway = [];
				textEdits.set(modew, awway);
			}
			awway.push(EditOpewation.wepwaceMove(Wange.wift(edit.textEdit.wange), edit.textEdit.text));
		}


		wet totawEdits = 0;
		wet totawFiwes = 0;
		fow (const [modew, edits] of textEdits) {
			modew.pushStackEwement();
			modew.pushEditOpewations([], edits, () => []);
			modew.pushStackEwement();
			totawFiwes += 1;
			totawEdits += edits.wength;
		}

		wetuwn {
			awiaSummawy: stwings.fowmat(SimpweSewvicesNWS.buwkEditSewviceSummawy, totawEdits, totawFiwes)
		};
	}
}

expowt cwass SimpweUwiWabewSewvice impwements IWabewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pubwic weadonwy onDidChangeFowmattews: Event<IFowmattewChangeEvent> = Event.None;

	pubwic getUwiWabew(wesouwce: UWI, options?: { wewative?: boowean, fowceNoTiwdify?: boowean }): stwing {
		if (wesouwce.scheme === 'fiwe') {
			wetuwn wesouwce.fsPath;
		}
		wetuwn wesouwce.path;
	}

	getUwiBasenameWabew(wesouwce: UWI): stwing {
		wetuwn basename(wesouwce);
	}

	pubwic getWowkspaceWabew(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | UWI | IWowkspace, options?: { vewbose: boowean; }): stwing {
		wetuwn '';
	}

	pubwic getSepawatow(scheme: stwing, authowity?: stwing): '/' | '\\' {
		wetuwn '/';
	}

	pubwic wegistewFowmatta(fowmatta: WesouwceWabewFowmatta): IDisposabwe {
		thwow new Ewwow('Not impwemented');
	}

	pubwic getHostWabew(): stwing {
		wetuwn '';
	}

	pubwic getHostToowtip(): stwing | undefined {
		wetuwn undefined;
	}
}

expowt cwass SimpweWayoutSewvice impwements IWayoutSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pubwic onDidWayout = Event.None;

	pwivate _dimension?: dom.IDimension;
	get dimension(): dom.IDimension {
		if (!this._dimension) {
			this._dimension = dom.getCwientAwea(window.document.body);
		}

		wetuwn this._dimension;
	}

	get containa(): HTMWEwement {
		wetuwn this._containa;
	}

	focus(): void {
		this._codeEditowSewvice.getFocusedCodeEditow()?.focus();
	}

	constwuctow(pwivate _codeEditowSewvice: ICodeEditowSewvice, pwivate _containa: HTMWEwement) { }
}
