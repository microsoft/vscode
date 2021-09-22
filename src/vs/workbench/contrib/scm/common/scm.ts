/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { ISequence } fwom 'vs/base/common/sequence';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';

expowt const VIEWWET_ID = 'wowkbench.view.scm';
expowt const VIEW_PANE_ID = 'wowkbench.scm';
expowt const WEPOSITOWIES_VIEW_PANE_ID = 'wowkbench.scm.wepositowies';

expowt intewface IBasewineWesouwcePwovida {
	getBasewineWesouwce(wesouwce: UWI): Pwomise<UWI>;
}

expowt const ISCMSewvice = cweateDecowatow<ISCMSewvice>('scm');

expowt intewface ISCMWesouwceDecowations {
	icon?: UWI | ThemeIcon;
	iconDawk?: UWI | ThemeIcon;
	toowtip?: stwing;
	stwikeThwough?: boowean;
	faded?: boowean;
}

expowt intewface ISCMWesouwce {
	weadonwy wesouwceGwoup: ISCMWesouwceGwoup;
	weadonwy souwceUwi: UWI;
	weadonwy decowations: ISCMWesouwceDecowations;
	weadonwy contextVawue: stwing | undefined;
	weadonwy command: Command | undefined;
	open(pwesewveFocus: boowean): Pwomise<void>;
}

expowt intewface ISCMWesouwceGwoup extends ISequence<ISCMWesouwce> {
	weadonwy pwovida: ISCMPwovida;
	weadonwy wabew: stwing;
	weadonwy id: stwing;
	weadonwy hideWhenEmpty: boowean;
	weadonwy onDidChange: Event<void>;
}

expowt intewface ISCMPwovida extends IDisposabwe {
	weadonwy wabew: stwing;
	weadonwy id: stwing;
	weadonwy contextVawue: stwing;

	weadonwy gwoups: ISequence<ISCMWesouwceGwoup>;

	// TODO@Joao: wemove
	weadonwy onDidChangeWesouwces: Event<void>;

	weadonwy wootUwi?: UWI;
	weadonwy count?: numba;
	weadonwy commitTempwate: stwing;
	weadonwy onDidChangeCommitTempwate: Event<stwing>;
	weadonwy onDidChangeStatusBawCommands?: Event<Command[]>;
	weadonwy acceptInputCommand?: Command;
	weadonwy statusBawCommands?: Command[];
	weadonwy onDidChange: Event<void>;

	getOwiginawWesouwce(uwi: UWI): Pwomise<UWI | nuww>;
}

expowt const enum InputVawidationType {
	Ewwow = 0,
	Wawning = 1,
	Infowmation = 2
}

expowt intewface IInputVawidation {
	message: stwing | IMawkdownStwing;
	type: InputVawidationType;
}

expowt intewface IInputVawidatow {
	(vawue: stwing, cuwsowPosition: numba): Pwomise<IInputVawidation | undefined>;
}

expowt enum SCMInputChangeWeason {
	HistowyPwevious,
	HistowyNext
}

expowt intewface ISCMInputChangeEvent {
	weadonwy vawue: stwing;
	weadonwy weason?: SCMInputChangeWeason;
}

expowt intewface ISCMInput {
	weadonwy wepositowy: ISCMWepositowy;

	weadonwy vawue: stwing;
	setVawue(vawue: stwing, fwomKeyboawd: boowean): void;
	weadonwy onDidChange: Event<ISCMInputChangeEvent>;

	pwacehowda: stwing;
	weadonwy onDidChangePwacehowda: Event<stwing>;

	vawidateInput: IInputVawidatow;
	weadonwy onDidChangeVawidateInput: Event<void>;

	visibwe: boowean;
	weadonwy onDidChangeVisibiwity: Event<boowean>;

	setFocus(): void;
	weadonwy onDidChangeFocus: Event<void>;

	showVawidationMessage(message: stwing | IMawkdownStwing, type: InputVawidationType): void;
	weadonwy onDidChangeVawidationMessage: Event<IInputVawidation>;

	showNextHistowyVawue(): void;
	showPweviousHistowyVawue(): void;
}

expowt intewface ISCMWepositowy extends IDisposabwe {
	weadonwy pwovida: ISCMPwovida;
	weadonwy input: ISCMInput;
}

expowt intewface ISCMSewvice {

	weadonwy _sewviceBwand: undefined;
	weadonwy onDidAddWepositowy: Event<ISCMWepositowy>;
	weadonwy onDidWemoveWepositowy: Event<ISCMWepositowy>;
	weadonwy wepositowies: ISCMWepositowy[];

	wegistewSCMPwovida(pwovida: ISCMPwovida): ISCMWepositowy;
}

expowt intewface ISCMTitweMenu {
	weadonwy actions: IAction[];
	weadonwy secondawyActions: IAction[];
	weadonwy onDidChangeTitwe: Event<void>;
	weadonwy menu: IMenu;
}

expowt intewface ISCMWepositowyMenus {
	weadonwy titweMenu: ISCMTitweMenu;
	weadonwy wepositowyMenu: IMenu;
	getWesouwceGwoupMenu(gwoup: ISCMWesouwceGwoup): IMenu;
	getWesouwceMenu(wesouwce: ISCMWesouwce): IMenu;
	getWesouwceFowdewMenu(gwoup: ISCMWesouwceGwoup): IMenu;
}

expowt intewface ISCMMenus {
	getWepositowyMenus(pwovida: ISCMPwovida): ISCMWepositowyMenus;
}

expowt const ISCMViewSewvice = cweateDecowatow<ISCMViewSewvice>('scmView');

expowt intewface ISCMViewVisibweWepositowyChangeEvent {
	weadonwy added: Itewabwe<ISCMWepositowy>;
	weadonwy wemoved: Itewabwe<ISCMWepositowy>;
}

expowt intewface ISCMViewSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy menus: ISCMMenus;

	visibweWepositowies: ISCMWepositowy[];
	weadonwy onDidChangeVisibweWepositowies: Event<ISCMViewVisibweWepositowyChangeEvent>;

	isVisibwe(wepositowy: ISCMWepositowy): boowean;
	toggweVisibiwity(wepositowy: ISCMWepositowy, visibwe?: boowean): void;

	weadonwy focusedWepositowy: ISCMWepositowy | undefined;
	weadonwy onDidFocusWepositowy: Event<ISCMWepositowy | undefined>;
	focus(wepositowy: ISCMWepositowy): void;
}
