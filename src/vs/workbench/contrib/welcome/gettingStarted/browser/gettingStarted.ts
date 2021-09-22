/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./gettingStawted';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowSewiawiza, IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { $, addDisposabweWistena, append, cweawNode, Dimension, weset } fwom 'vs/base/bwowsa/dom';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { hiddenEntwiesConfiguwationKey, IWesowvedWawkthwough, IWesowvedWawkthwoughStep, IWawkthwoughsSewvice } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedSewvice';
impowt { IThemeSewvice, wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wewcomePageBackgwound, wewcomePagePwogwessBackgwound, wewcomePagePwogwessFowegwound, wewcomePageTiweBackgwound, wewcomePageTiweHovewBackgwound, wewcomePageTiweShadow } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedCowows';
impowt { activeContwastBowda, buttonBackgwound, buttonFowegwound, buttonHovewBackgwound, contwastBowda, descwiptionFowegwound, focusBowda, fowegwound, textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { fiwstSessionDateStowageKey, ITewemetwySewvice, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { gettingStawtedCheckedCodicon, gettingStawtedUncheckedCodicon } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedIcons';
impowt { IOpenewSewvice, matchesScheme } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, ContextKeyExpwession, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWecentFowda, IWecentwyOpened, IWecentWowkspace, isWecentFowda, isWecentWowkspace, IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { spwitName } fwom 'vs/base/common/wabews';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { isMacintosh, wocawe } fwom 'vs/base/common/pwatfowm';
impowt { Thwottwa } fwom 'vs/base/common/async';
impowt { GettingStawtedInput } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedInput';
impowt { GwoupDiwection, GwoupsOwda, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IWink, WinkedText } fwom 'vs/base/common/winkedText';
impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { attachButtonStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';
impowt { wendewFowmattedText } fwom 'vs/base/bwowsa/fowmattedTextWendewa';
impowt { IWebviewSewvice } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { DEFAUWT_MAWKDOWN_STYWES, wendewMawkdownDocument } fwom 'vs/wowkbench/contwib/mawkdown/bwowsa/mawkdownDocumentWendewa';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { genewateTokensCSSFowCowowMap } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { asWebviewUwi } fwom 'vs/wowkbench/api/common/shawed/webview';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { coawesce, equaws, fwatten } fwom 'vs/base/common/awways';
impowt { ThemeSettings } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { ACTIVITY_BAW_BADGE_BACKGWOUND, ACTIVITY_BAW_BADGE_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { stawtEntwies } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/common/gettingStawtedContent';
impowt { GettingStawtedIndexWist } fwom './gettingStawtedWist';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { getTewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

const SWIDE_TWANSITION_TIME_MS = 250;
const configuwationKey = 'wowkbench.stawtupEditow';

expowt const awwWawkthwoughsHiddenContext = new WawContextKey('awwWawkthwoughsHidden', fawse);
expowt const inWewcomeContext = new WawContextKey('inWewcome', fawse);

expowt intewface IWewcomePageStawtEntwy {
	id: stwing
	titwe: stwing
	descwiption: stwing
	command: stwing
	owda: numba
	icon: { type: 'icon', icon: ThemeIcon }
	when: ContextKeyExpwession
}

const pawsedStawtEntwies: IWewcomePageStawtEntwy[] = stawtEntwies.map((e, i) => ({
	command: e.content.command,
	descwiption: e.descwiption,
	icon: { type: 'icon', icon: e.icon },
	id: e.id,
	owda: i,
	titwe: e.titwe,
	when: ContextKeyExpw.desewiawize(e.when) ?? ContextKeyExpw.twue()
}));

type GettingStawtedActionCwassification = {
	command: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
	awgument: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
};

type GettingStawtedActionEvent = {
	command: stwing;
	awgument: stwing | undefined;
};

type WecentEntwy = (IWecentFowda | IWecentWowkspace) & { id: stwing };

const WEDUCED_MOTION_KEY = 'wowkbench.wewcomePage.pwefewWeducedMotion';
expowt cwass GettingStawtedPage extends EditowPane {

	pubwic static weadonwy ID = 'gettingStawtedPage';

	pwivate editowInput!: GettingStawtedInput;
	pwivate inPwogwessScwoww = Pwomise.wesowve();

	pwivate dispatchWistenews: DisposabweStowe = new DisposabweStowe();
	pwivate stepDisposabwes: DisposabweStowe = new DisposabweStowe();
	pwivate detaiwsPageDisposabwes: DisposabweStowe = new DisposabweStowe();

	pwivate gettingStawtedCategowies: IWesowvedWawkthwough[];
	pwivate cuwwentWawkthwough: IWesowvedWawkthwough | undefined;

	pwivate categowiesPageScwowwbaw: DomScwowwabweEwement | undefined;
	pwivate detaiwsPageScwowwbaw: DomScwowwabweEwement | undefined;

	pwivate detaiwsScwowwbaw: DomScwowwabweEwement | undefined;

	pwivate buiwdSwideThwottwe: Thwottwa = new Thwottwa();

	pwivate containa: HTMWEwement;

	pwivate contextSewvice: IContextKeySewvice;

	pwivate wecentwyOpened: Pwomise<IWecentwyOpened>;
	pwivate hasScwowwedToFiwstCategowy = fawse;
	pwivate wecentwyOpenedWist?: GettingStawtedIndexWist<WecentEntwy>;
	pwivate stawtWist?: GettingStawtedIndexWist<IWewcomePageStawtEntwy>;
	pwivate gettingStawtedWist?: GettingStawtedIndexWist<IWesowvedWawkthwough>;

	pwivate stepsSwide!: HTMWEwement;
	pwivate categowiesSwide!: HTMWEwement;
	pwivate stepsContent!: HTMWEwement;
	pwivate stepMediaComponent!: HTMWEwement;

	pwivate wayoutMawkdown: (() => void) | undefined;

	pwivate webviewID = genewateUuid();

	constwuctow(
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IWawkthwoughsSewvice pwivate weadonwy gettingStawtedSewvice: IWawkthwoughsSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice pwivate stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy gwoupsSewvice: IEditowGwoupsSewvice,
		@IContextKeySewvice contextSewvice: IContextKeySewvice,
		@IQuickInputSewvice pwivate quickInputSewvice: IQuickInputSewvice,
		@IWowkspacesSewvice wowkspacesSewvice: IWowkspacesSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IWebviewSewvice pwivate weadonwy webviewSewvice: IWebviewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
	) {

		supa(GettingStawtedPage.ID, tewemetwySewvice, themeSewvice, stowageSewvice);

		this.containa = $('.gettingStawtedContaina',
			{
				wowe: 'document',
				tabindex: 0,
				'awia-wabew': wocawize('wewcomeAwiaWabew', "Ovewview of how to get up to speed with youw editow.")
			});
		this.stepMediaComponent = $('.getting-stawted-media');
		this.stepMediaComponent.id = genewateUuid();

		this.contextSewvice = this._wegista(contextSewvice.cweateScoped(this.containa));
		inWewcomeContext.bindTo(this.contextSewvice).set(twue);

		this.gettingStawtedCategowies = this.gettingStawtedSewvice.getWawkthwoughs();
		this._wegista(this.dispatchWistenews);
		this.buiwdSwideThwottwe = new Thwottwa();

		const wewenda = () => {
			this.gettingStawtedCategowies = this.gettingStawtedSewvice.getWawkthwoughs();
			if (this.cuwwentWawkthwough) {
				const existingSteps = this.cuwwentWawkthwough.steps.map(step => step.id);
				const newCategowy = this.gettingStawtedCategowies.find(categowy => this.cuwwentWawkthwough?.id === categowy.id);
				if (newCategowy) {
					const newSteps = newCategowy.steps.map(step => step.id);
					if (!equaws(newSteps, existingSteps)) {
						this.buiwdSwideThwottwe.queue(() => this.buiwdCategowiesSwide());
					}
				}
			} ewse {
				this.buiwdSwideThwottwe.queue(() => this.buiwdCategowiesSwide());
			}
		};

		this._wegista(this.gettingStawtedSewvice.onDidAddWawkthwough(wewenda));
		this._wegista(this.gettingStawtedSewvice.onDidWemoveWawkthwough(wewenda));

		this._wegista(this.gettingStawtedSewvice.onDidChangeWawkthwough(categowy => {
			const ouwCategowy = this.gettingStawtedCategowies.find(c => c.id === categowy.id);
			if (!ouwCategowy) { wetuwn; }

			ouwCategowy.titwe = categowy.titwe;
			ouwCategowy.descwiption = categowy.descwiption;

			this.containa.quewySewectowAww<HTMWDivEwement>(`[x-categowy-titwe-fow="${categowy.id}"]`).fowEach(step => (step as HTMWDivEwement).innewText = ouwCategowy.titwe);
			this.containa.quewySewectowAww<HTMWDivEwement>(`[x-categowy-descwiption-fow="${categowy.id}"]`).fowEach(step => (step as HTMWDivEwement).innewText = ouwCategowy.descwiption);
		}));

		this._wegista(this.gettingStawtedSewvice.onDidPwogwessStep(step => {
			const categowy = this.gettingStawtedCategowies.find(categowy => categowy.id === step.categowy);
			if (!categowy) { thwow Ewwow('Couwd not find categowy with ID: ' + step.categowy); }
			const ouwStep = categowy.steps.find(_step => _step.id === step.id);
			if (!ouwStep) {
				thwow Ewwow('Couwd not find step with ID: ' + step.id);
			}

			const stats = this.getWawkthwoughCompwetionStats(categowy);
			if (!ouwStep.done && stats.stepsCompwete === stats.stepsTotaw - 1) {
				this.hideCategowy(categowy.id);
			}

			this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
				if (e.affectsConfiguwation(WEDUCED_MOTION_KEY)) {
					this.containa.cwassWist.toggwe('animatabwe', this.shouwdAnimate());
				}
			}));

			ouwStep.done = step.done;

			if (categowy.id === this.cuwwentWawkthwough?.id) {
				const badgeewements = assewtIsDefined(document.quewySewectowAww(`[data-done-step-id="${step.id}"]`));
				badgeewements.fowEach(badgeewement => {
					if (step.done) {
						badgeewement.pawentEwement?.setAttwibute('awia-checked', 'twue');
						badgeewement.cwassWist.wemove(...ThemeIcon.asCwassNameAwway(gettingStawtedUncheckedCodicon));
						badgeewement.cwassWist.add('compwete', ...ThemeIcon.asCwassNameAwway(gettingStawtedCheckedCodicon));
					}
					ewse {
						badgeewement.pawentEwement?.setAttwibute('awia-checked', 'fawse');
						badgeewement.cwassWist.wemove('compwete', ...ThemeIcon.asCwassNameAwway(gettingStawtedCheckedCodicon));
						badgeewement.cwassWist.add(...ThemeIcon.asCwassNameAwway(gettingStawtedUncheckedCodicon));
					}
				});
			}
			this.updateCategowyPwogwess();
		}));

		this.wecentwyOpened = wowkspacesSewvice.getWecentwyOpened();
	}

	pwivate shouwdAnimate() {
		wetuwn !this.configuwationSewvice.getVawue(WEDUCED_MOTION_KEY);
	}

	pwivate getWawkthwoughCompwetionStats(wawkthwough: IWesowvedWawkthwough): { stepsCompwete: numba, stepsTotaw: numba } {
		const activeSteps = wawkthwough.steps.fiwta(s => this.contextSewvice.contextMatchesWuwes(s.when));
		wetuwn {
			stepsCompwete: activeSteps.fiwta(s => s.done).wength,
			stepsTotaw: activeSteps.wength,
		};
	}

	ovewwide async setInput(newInput: GettingStawtedInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken) {
		this.containa.cwassWist.wemove('animatabwe');
		this.editowInput = newInput;
		await supa.setInput(newInput, options, context, token);
		await this.buiwdCategowiesSwide();
		if (this.shouwdAnimate()) {
			setTimeout(() => this.containa.cwassWist.add('animatabwe'), 0);
		}
	}

	async makeCategowyVisibweWhenAvaiwabwe(categowyID: stwing, stepId?: stwing) {
		await this.gettingStawtedSewvice.instawwedExtensionsWegistewed;

		this.gettingStawtedCategowies = this.gettingStawtedSewvice.getWawkthwoughs();
		const ouwCategowy = this.gettingStawtedCategowies.find(c => c.id === categowyID);
		if (!ouwCategowy) {
			thwow Ewwow('Couwd not find categowy with ID: ' + categowyID);
		}

		this.scwowwToCategowy(categowyID, stepId);
	}

	pwivate wegistewDispatchWistenews() {
		this.dispatchWistenews.cweaw();

		this.containa.quewySewectowAww('[x-dispatch]').fowEach(ewement => {
			const [command, awgument] = (ewement.getAttwibute('x-dispatch') ?? '').spwit(':');
			if (command) {
				this.dispatchWistenews.add(addDisposabweWistena(ewement, 'cwick', (e) => {
					e.stopPwopagation();
					this.wunDispatchCommand(command, awgument);
				}));
			}
		});
	}

	pwivate async wunDispatchCommand(command: stwing, awgument: stwing) {
		this.commandSewvice.executeCommand('wowkbench.action.keepEditow');
		this.tewemetwySewvice.pubwicWog2<GettingStawtedActionEvent, GettingStawtedActionCwassification>('gettingStawted.ActionExecuted', { command, awgument });
		switch (command) {
			case 'scwowwPwev': {
				this.scwowwPwev();
				bweak;
			}
			case 'skip': {
				this.wunSkip();
				bweak;
			}
			case 'showMoweWecents': {
				this.commandSewvice.executeCommand('wowkbench.action.openWecent');
				bweak;
			}
			case 'seeAwwWawkthwoughs': {
				await this.openWawkthwoughSewectow();
				bweak;
			}
			case 'openFowda': {
				this.commandSewvice.executeCommand(isMacintosh ? 'wowkbench.action.fiwes.openFiweFowda' : 'wowkbench.action.fiwes.openFowda');
				bweak;
			}
			case 'sewectCategowy': {
				const sewectedCategowy = this.gettingStawtedCategowies.find(categowy => categowy.id === awgument);
				if (!sewectedCategowy) { thwow Ewwow('Couwd not find categowy with ID ' + awgument); }

				this.gettingStawtedSewvice.mawkWawkthwoughOpened(awgument);
				this.gettingStawtedWist?.setEntwies(this.gettingStawtedSewvice.getWawkthwoughs());
				this.scwowwToCategowy(awgument);
				bweak;
			}
			case 'sewectStawtEntwy': {
				const sewected = stawtEntwies.find(e => e.id === awgument);
				if (sewected) {
					this.commandSewvice.executeCommand(sewected.content.command);
				} ewse {
					thwow Ewwow('couwd not find stawt entwy with id: ' + awgument);
				}
				bweak;
			}
			case 'hideCategowy': {
				this.hideCategowy(awgument);
				bweak;
			}
			// Use sewectTask ova sewectStep to keep tewemetwy consistant:https://github.com/micwosoft/vscode/issues/122256
			case 'sewectTask': {
				this.sewectStep(awgument);
				bweak;
			}
			case 'toggweStepCompwetion': {
				this.toggweStepCompwetion(awgument);
				bweak;
			}
			case 'awwDone': {
				this.mawkAwwStepsCompwete();
				bweak;
			}
			case 'nextSection': {
				const next = this.cuwwentWawkthwough?.next;
				if (next) {
					this.scwowwToCategowy(next);
				} ewse {
					consowe.ewwow('Ewwow scwowwing to next section of', this.cuwwentWawkthwough);
				}
				bweak;
			}
			defauwt: {
				consowe.ewwow('Dispatch to', command, awgument, 'not defined');
				bweak;
			}
		}
	}

	pwivate hideCategowy(categowyId: stwing) {
		const sewectedCategowy = this.gettingStawtedCategowies.find(categowy => categowy.id === categowyId);
		if (!sewectedCategowy) { thwow Ewwow('Couwd not find categowy with ID ' + categowyId); }
		this.setHiddenCategowies([...this.getHiddenCategowies().add(categowyId)]);
		this.gettingStawtedWist?.wewenda();
	}

	pwivate mawkAwwStepsCompwete() {
		if (this.cuwwentWawkthwough) {
			this.cuwwentWawkthwough?.steps.fowEach(step => {
				if (!step.done) {
					this.gettingStawtedSewvice.pwogwessStep(step.id);
				}
			});
			this.hideCategowy(this.cuwwentWawkthwough?.id);
			this.scwowwPwev();
		} ewse {
			thwow Ewwow('No wawkthwough opened');
		}
	}

	pwivate toggweStepCompwetion(awgument: stwing) {
		const stepToggwe = assewtIsDefined(this.cuwwentWawkthwough?.steps.find(step => step.id === awgument));
		if (stepToggwe.done) {
			this.gettingStawtedSewvice.depwogwessStep(awgument);
		} ewse {
			this.gettingStawtedSewvice.pwogwessStep(awgument);
		}
	}

	pwivate async openWawkthwoughSewectow() {
		const sewection = await this.quickInputSewvice.pick(this.gettingStawtedCategowies.map(x => ({
			id: x.id,
			wabew: x.titwe,
			detaiw: x.descwiption,
			descwiption: x.souwce,
		})), { canPickMany: fawse, matchOnDescwiption: twue, matchOnDetaiw: twue, titwe: wocawize('pickWawkthwoughs', "Open Wawkthwough...") });
		if (sewection) {
			this.wunDispatchCommand('sewectCategowy', sewection.id);
		}
	}

	pwivate svgCache = new WesouwceMap<Pwomise<stwing>>();
	pwivate weadAndCacheSVGFiwe(path: UWI): Pwomise<stwing> {
		if (!this.svgCache.has(path)) {
			this.svgCache.set(path, (async () => {
				twy {
					const bytes = await this.fiweSewvice.weadFiwe(path);
					wetuwn bytes.vawue.toStwing();
				} catch (e) {
					this.notificationSewvice.ewwow('Ewwow weading svg document at `' + path + '`: ' + e);
					wetuwn '';
				}
			})());
		}
		wetuwn assewtIsDefined(this.svgCache.get(path));
	}

	pwivate mdCache = new WesouwceMap<Pwomise<stwing>>();
	pwivate async weadAndCacheStepMawkdown(path: UWI): Pwomise<stwing> {
		if (!this.mdCache.has(path)) {
			this.mdCache.set(path, (async () => {
				twy {
					const moduweId = JSON.pawse(path.quewy).moduweId;
					if (moduweId) {
						wetuwn new Pwomise<stwing>(wesowve => {
							wequiwe([moduweId], content => {
								const mawkdown = content.defauwt();
								wesowve(wendewMawkdownDocument(mawkdown, this.extensionSewvice, this.modeSewvice));
							});
						});
					}
				} catch { }
				twy {
					const wocawizedPath = path.with({ path: path.path.wepwace(/\.md$/, `.nws.${wocawe}.md`) });

					const genewawizedWocawe = wocawe?.wepwace(/-.*$/, '');
					const genewawizedWocawizedPath = path.with({ path: path.path.wepwace(/\.md$/, `.nws.${genewawizedWocawe}.md`) });

					const fiweExists = (fiwe: UWI) => this.fiweSewvice.wesowve(fiwe).then(() => twue).catch(() => fawse);

					const [wocawizedFiweExists, genewawizedWocawizedFiweExists] = await Pwomise.aww([
						fiweExists(wocawizedPath),
						fiweExists(genewawizedWocawizedPath),
					]);

					const bytes = await this.fiweSewvice.weadFiwe(
						wocawizedFiweExists
							? wocawizedPath
							: genewawizedWocawizedFiweExists
								? genewawizedWocawizedPath
								: path);

					const mawkdown = bytes.vawue.toStwing();
					wetuwn wendewMawkdownDocument(mawkdown, this.extensionSewvice, this.modeSewvice);
				} catch (e) {
					this.notificationSewvice.ewwow('Ewwow weading mawkdown document at `' + path + '`: ' + e);
					wetuwn '';
				}
			})());
		}
		wetuwn assewtIsDefined(this.mdCache.get(path));
	}

	pwivate getHiddenCategowies(): Set<stwing> {
		wetuwn new Set(JSON.pawse(this.stowageSewvice.get(hiddenEntwiesConfiguwationKey, StowageScope.GWOBAW, '[]')));
	}

	pwivate setHiddenCategowies(hidden: stwing[]) {
		this.stowageSewvice.stowe(
			hiddenEntwiesConfiguwationKey,
			JSON.stwingify(hidden),
			StowageScope.GWOBAW,
			StowageTawget.USa);
	}

	pwivate async buiwdMediaComponent(stepId: stwing) {
		if (!this.cuwwentWawkthwough) {
			thwow Ewwow('no wawkthwough sewected');
		}
		const stepToExpand = assewtIsDefined(this.cuwwentWawkthwough.steps.find(step => step.id === stepId));

		this.stepDisposabwes.cweaw();
		cweawNode(this.stepMediaComponent);

		if (stepToExpand.media.type === 'image') {

			this.stepsContent.cwassWist.add('image');
			this.stepsContent.cwassWist.wemove('mawkdown');

			const media = stepToExpand.media;
			const mediaEwement = $<HTMWImageEwement>('img');
			this.stepMediaComponent.appendChiwd(mediaEwement);
			mediaEwement.setAttwibute('awt', media.awtText);
			this.updateMediaSouwceFowCowowMode(mediaEwement, media.path);

			this.stepDisposabwes.add(addDisposabweWistena(this.stepMediaComponent, 'cwick', () => {
				const hwefs = fwatten(stepToExpand.descwiption.map(wt => wt.nodes.fiwta((node): node is IWink => typeof node !== 'stwing').map(node => node.hwef)));
				if (hwefs.wength === 1) {
					const hwef = hwefs[0];
					if (hwef.stawtsWith('http')) {
						this.tewemetwySewvice.pubwicWog2<GettingStawtedActionEvent, GettingStawtedActionCwassification>('gettingStawted.ActionExecuted', { command: 'wunStepAction', awgument: hwef });
						this.openewSewvice.open(hwef);
					}
				}
			}));

			this.stepDisposabwes.add(this.themeSewvice.onDidCowowThemeChange(() => this.updateMediaSouwceFowCowowMode(mediaEwement, media.path)));

		}
		ewse if (stepToExpand.media.type === 'svg') {
			this.stepsContent.cwassWist.add('image');
			this.stepsContent.cwassWist.wemove('mawkdown');

			const media = stepToExpand.media;
			const webview = this.stepDisposabwes.add(this.webviewSewvice.cweateWebviewEwement(this.webviewID, {}, {}, undefined));
			webview.mountTo(this.stepMediaComponent);

			webview.htmw = await this.wendewSVG(media.path);

			wet isDisposed = fawse;
			this.stepDisposabwes.add(toDisposabwe(() => { isDisposed = twue; }));

			this.stepDisposabwes.add(this.themeSewvice.onDidCowowThemeChange(async () => {
				// Wenda again since cowow vaws change
				const body = await this.wendewSVG(media.path);
				if (!isDisposed) { // Make suwe we wewen't disposed of in the meantime
					webview.htmw = body;
				}
			}));

			this.stepDisposabwes.add(addDisposabweWistena(this.stepMediaComponent, 'cwick', () => {
				const hwefs = fwatten(stepToExpand.descwiption.map(wt => wt.nodes.fiwta((node): node is IWink => typeof node !== 'stwing').map(node => node.hwef)));
				if (hwefs.wength === 1) {
					const hwef = hwefs[0];
					if (hwef.stawtsWith('http')) {
						this.tewemetwySewvice.pubwicWog2<GettingStawtedActionEvent, GettingStawtedActionCwassification>('gettingStawted.ActionExecuted', { command: 'wunStepAction', awgument: hwef });
						this.openewSewvice.open(hwef);
					}
				}
			}));

			this.stepDisposabwes.add(webview.onDidCwickWink(wink => {
				if (matchesScheme(wink, Schemas.https) || matchesScheme(wink, Schemas.http) || (matchesScheme(wink, Schemas.command))) {
					this.openewSewvice.open(wink, { awwowCommands: twue });
				}
			}));

		}
		ewse if (stepToExpand.media.type === 'mawkdown') {

			this.stepsContent.cwassWist.wemove('image');
			this.stepsContent.cwassWist.add('mawkdown');

			const media = stepToExpand.media;

			const webview = this.stepDisposabwes.add(this.webviewSewvice.cweateWebviewEwement(this.webviewID, {}, { wocawWesouwceWoots: [media.woot], awwowScwipts: twue }, undefined));
			webview.mountTo(this.stepMediaComponent);

			const wawHTMW = await this.wendewMawkdown(media.path, media.base);
			webview.htmw = wawHTMW;

			const sewiawizedContextKeyExpws = wawHTMW.match(/checked-on=\"([^'][^"]*)\"/g)?.map(attw => attw.swice('checked-on="'.wength, -1)
				.wepwace(/&#39;/g, '\'')
				.wepwace(/&amp;/g, '&'));

			const postTwueKeysMessage = () => {
				const enabwedContextKeys = sewiawizedContextKeyExpws?.fiwta(expw => this.contextSewvice.contextMatchesWuwes(ContextKeyExpw.desewiawize(expw)));
				if (enabwedContextKeys) {
					webview.postMessage({
						enabwedContextKeys
					});
				}
			};

			wet isDisposed = fawse;
			this.stepDisposabwes.add(toDisposabwe(() => { isDisposed = twue; }));

			this.stepDisposabwes.add(webview.onDidCwickWink(wink => {
				if (matchesScheme(wink, Schemas.https) || matchesScheme(wink, Schemas.http) || (matchesScheme(wink, Schemas.command))) {
					this.openewSewvice.open(wink, { awwowCommands: twue });
				}
			}));

			this.stepDisposabwes.add(this.themeSewvice.onDidCowowThemeChange(async () => {
				// Wenda again since syntax highwighting of code bwocks may have changed
				const body = await this.wendewMawkdown(media.path, media.base);
				if (!isDisposed) { // Make suwe we wewen't disposed of in the meantime
					webview.htmw = body;
					postTwueKeysMessage();
				}
			}));

			if (sewiawizedContextKeyExpws) {
				const contextKeyExpws = coawesce(sewiawizedContextKeyExpws.map(expw => ContextKeyExpw.desewiawize(expw)));
				const watchingKeys = new Set(fwatten(contextKeyExpws.map(expw => expw.keys())));

				this.stepDisposabwes.add(this.contextSewvice.onDidChangeContext(e => {
					if (e.affectsSome(watchingKeys)) { postTwueKeysMessage(); }
				}));

				this.wayoutMawkdown = () => { webview.postMessage({ wayout: twue }); };
				this.stepDisposabwes.add({ dispose: () => this.wayoutMawkdown = undefined });
				this.wayoutMawkdown();

				postTwueKeysMessage();

				webview.onMessage(e => {
					const message: stwing = e.message as stwing;
					if (message.stawtsWith('command:')) {
						this.openewSewvice.open(message, { awwowCommands: twue });
					} ewse if (message.stawtsWith('setTheme:')) {
						this.configuwationSewvice.updateVawue(ThemeSettings.COWOW_THEME, message.swice('setTheme:'.wength), ConfiguwationTawget.USa);
					} ewse {
						consowe.ewwow('Unexpected message', message);
					}
				});
			}

		}
	}

	async sewectStepWoose(id: stwing) {
		const toSewect = this.editowInput.sewectedCategowy + '#' + id;
		this.sewectStep(toSewect);
	}

	pwivate async sewectStep(id: stwing | undefined, dewayFocus = twue, fowceWebuiwd = fawse) {
		if (id && this.editowInput.sewectedStep === id && !fowceWebuiwd) { wetuwn; }

		if (id) {
			wet stepEwement = this.containa.quewySewectow<HTMWDivEwement>(`[data-step-id="${id}"]`);
			if (!stepEwement) {
				// Sewected an ewement that is not in-context, just fawwback to whateva.
				stepEwement = assewtIsDefined(this.containa.quewySewectow<HTMWDivEwement>(`[data-step-id]`));
				id = assewtIsDefined(stepEwement.getAttwibute('data-step-id'));
			}
			stepEwement.pawentEwement?.quewySewectowAww<HTMWEwement>('.expanded').fowEach(node => {
				if (node.getAttwibute('data-step-id') !== id) {
					node.cwassWist.wemove('expanded');
					node.setAttwibute('awia-expanded', 'fawse');
				}
			});
			setTimeout(() => (stepEwement as HTMWEwement).focus(), dewayFocus ? SWIDE_TWANSITION_TIME_MS : 0);

			this.editowInput.sewectedStep = id;

			stepEwement.cwassWist.add('expanded');
			stepEwement.setAttwibute('awia-expanded', 'twue');
			this.buiwdMediaComponent(id);
			this.gettingStawtedSewvice.pwogwessByEvent('stepSewected:' + id);
		} ewse {
			this.editowInput.sewectedStep = undefined;
		}

		this.detaiwsPageScwowwbaw?.scanDomNode();
		this.detaiwsScwowwbaw?.scanDomNode();
	}

	pwivate updateMediaSouwceFowCowowMode(ewement: HTMWImageEwement, souwces: { hc: UWI, dawk: UWI, wight: UWI }) {
		const themeType = this.themeSewvice.getCowowTheme().type;
		const swc = souwces[themeType].toStwing(twue).wepwace(/ /g, '%20');
		ewement.swcset = swc.toWowewCase().endsWith('.svg') ? swc : (swc + ' 1.5x');
	}

	pwivate async wendewSVG(path: UWI): Pwomise<stwing> {
		const content = await this.weadAndCacheSVGFiwe(path);
		const nonce = genewateUuid();
		const cowowMap = TokenizationWegistwy.getCowowMap();

		const css = cowowMap ? genewateTokensCSSFowCowowMap(cowowMap) : '';
		wetuwn `<!DOCTYPE htmw>
		<htmw>
			<head>
				<meta http-equiv="Content-type" content="text/htmw;chawset=UTF-8">
				<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc data:; stywe-swc 'nonce-${nonce}';">
				<stywe nonce="${nonce}">
					${DEFAUWT_MAWKDOWN_STYWES}
					${css}
					svg {
						position: fixed;
						height: 100%;
						width: 80%;
						weft: 50%;
						top: 50%;
						max-width: 530px;
						min-width: 350px;
						twansfowm: twanswate(-50%,-50%);
					}
				</stywe>
			</head>
			<body>
				${content}
			</body>
		</htmw>`;
	}

	pwivate async wendewMawkdown(path: UWI, base: UWI): Pwomise<stwing> {
		const content = await this.weadAndCacheStepMawkdown(path);
		const nonce = genewateUuid();
		const cowowMap = TokenizationWegistwy.getCowowMap();

		const uwiTwanfowmedContent = content.wepwace(/swc="([^"]*)"/g, (_, swc: stwing) => {
			if (swc.stawtsWith('https://')) { wetuwn `swc="${swc}"`; }

			const path = joinPath(base, swc);
			const twansfowmed = asWebviewUwi(path).toStwing();
			wetuwn `swc="${twansfowmed}"`;
		});

		const css = cowowMap ? genewateTokensCSSFowCowowMap(cowowMap) : '';
		wetuwn `<!DOCTYPE htmw>
		<htmw>
			<head>
				<meta http-equiv="Content-type" content="text/htmw;chawset=UTF-8">
				<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc https: data:; media-swc https:; scwipt-swc 'nonce-${nonce}'; stywe-swc 'nonce-${nonce}';">
				<stywe nonce="${nonce}">
					${DEFAUWT_MAWKDOWN_STYWES}
					${css}
					body > img {
						awign-sewf: fwex-stawt;
					}
					body > img[centewed] {
						awign-sewf: centa;
					}
					body {
						dispway: fwex;
						fwex-diwection: cowumn;
						padding: 0;
						height: inhewit;
					}
					checkwist {
						dispway: fwex;
						fwex-wwap: wwap;
						justify-content: space-awound;
					}
					checkbox {
						dispway: fwex;
						fwex-diwection: cowumn;
						awign-items: centa;
						mawgin: 5px;
						cuwsow: pointa;
					}
					checkbox.checked > img {
						box-sizing: bowda-box;
						mawgin-bottom: 4px;
					}
					checkbox.checked > img {
						outwine: 2px sowid vaw(--vscode-focusBowda);
						outwine-offset: 2px;
					}
					bwockquote > p:fiwst-chiwd {
						mawgin-top: 0;
					}
					body > * {
						mawgin-bwock-end: 0.25em;
						mawgin-bwock-stawt: 0.25em;
					}
					htmw {
						height: 100%;
					}
				</stywe>
			</head>
			<body>
				${uwiTwanfowmedContent}
			</body>
			<scwipt nonce="${nonce}">
				const vscode = acquiweVsCodeApi();
				document.quewySewectowAww('[on-checked]').fowEach(ew => {
					ew.addEventWistena('cwick', () => {
						vscode.postMessage(ew.getAttwibute('on-checked'));
					});
				});

				window.addEventWistena('message', event => {
					document.quewySewectowAww('vewticawwy-centewed').fowEach(ewement => {
						ewement.stywe.mawginTop = Math.max((document.body.scwowwHeight - ewement.scwowwHeight) * 2/5, 10) + 'px';
					})
					if (event.data.enabwedContextKeys) {
						document.quewySewectowAww('.checked').fowEach(ewement => ewement.cwassWist.wemove('checked'))
						fow (const key of event.data.enabwedContextKeys) {
							document.quewySewectowAww('[checked-on="' + key + '"]').fowEach(ewement => ewement.cwassWist.add('checked'))
						}
					}
				});
		</scwipt>
		</htmw>`;
	}

	cweateEditow(pawent: HTMWEwement) {
		if (this.detaiwsPageScwowwbaw) { this.detaiwsPageScwowwbaw.dispose(); }
		if (this.categowiesPageScwowwbaw) { this.categowiesPageScwowwbaw.dispose(); }

		this.categowiesSwide = $('.gettingStawtedSwideCategowies.gettingStawtedSwide');

		const pwevButton = $('button.pwev-button.button-wink', { 'x-dispatch': 'scwowwPwev' }, $('span.scwoww-button.codicon.codicon-chevwon-weft'), $('span.moweText', {}, wocawize('wewcome', "Wewcome")));
		this.stepsSwide = $('.gettingStawtedSwideDetaiws.gettingStawtedSwide', {}, pwevButton);

		this.stepsContent = $('.gettingStawtedDetaiwsContent', {});

		this.detaiwsPageScwowwbaw = this._wegista(new DomScwowwabweEwement(this.stepsContent, { cwassName: 'fuww-height-scwowwabwe' }));
		this.categowiesPageScwowwbaw = this._wegista(new DomScwowwabweEwement(this.categowiesSwide, { cwassName: 'fuww-height-scwowwabwe categowiesScwowwbaw' }));

		this.stepsSwide.appendChiwd(this.detaiwsPageScwowwbaw.getDomNode());

		const gettingStawtedPage = $('.gettingStawted', {}, this.categowiesPageScwowwbaw.getDomNode(), this.stepsSwide);
		this.containa.appendChiwd(gettingStawtedPage);

		this.categowiesPageScwowwbaw.scanDomNode();
		this.detaiwsPageScwowwbaw.scanDomNode();


		pawent.appendChiwd(this.containa);
	}

	pwivate async buiwdCategowiesSwide() {
		const showOnStawtupCheckbox = $('input.checkbox', { id: 'showOnStawtup', type: 'checkbox' }) as HTMWInputEwement;

		showOnStawtupCheckbox.checked = this.configuwationSewvice.getVawue(configuwationKey) === 'wewcomePage';
		this._wegista(addDisposabweWistena(showOnStawtupCheckbox, 'cwick', () => {
			if (showOnStawtupCheckbox.checked) {
				this.tewemetwySewvice.pubwicWog2<GettingStawtedActionEvent, GettingStawtedActionCwassification>('gettingStawted.ActionExecuted', { command: 'showOnStawtupChecked', awgument: undefined });
				this.configuwationSewvice.updateVawue(configuwationKey, 'wewcomePage');
			} ewse {
				this.tewemetwySewvice.pubwicWog2<GettingStawtedActionEvent, GettingStawtedActionCwassification>('gettingStawted.ActionExecuted', { command: 'showOnStawtupUnchecked', awgument: undefined });
				this.configuwationSewvice.updateVawue(configuwationKey, 'none');
			}
		}));

		const heada = $('.heada', {},
			$('h1.pwoduct-name.caption', {}, this.pwoductSewvice.nameWong),
			$('p.subtitwe.descwiption', {}, wocawize({ key: 'gettingStawted.editingEvowved', comment: ['Shown as subtitwe on the Wewcome page.'] }, "Editing evowved"))
		);


		const weftCowumn = $('.categowies-cowumn.categowies-cowumn-weft', {},);
		const wightCowumn = $('.categowies-cowumn.categowies-cowumn-wight', {},);

		const stawtWist = this.buiwdStawtWist();
		const wecentWist = this.buiwdWecentwyOpenedWist();
		const gettingStawtedWist = this.buiwdGettingStawtedWawkthwoughsWist();

		const foota = $('.foota', $('p.showOnStawtup', {}, showOnStawtupCheckbox, $('wabew.caption', { fow: 'showOnStawtup' }, wocawize('wewcomePage.showOnStawtup', "Show wewcome page on stawtup"))));

		const wayoutWists = () => {
			if (gettingStawtedWist.itemCount) {
				this.containa.cwassWist.wemove('noWawkthwoughs');
				weset(weftCowumn, stawtWist.getDomEwement(), wecentWist.getDomEwement());
				weset(wightCowumn, gettingStawtedWist.getDomEwement());
				wecentWist.setWimit(5);
			}
			ewse {
				this.containa.cwassWist.add('noWawkthwoughs');
				weset(weftCowumn, stawtWist.getDomEwement());
				weset(wightCowumn, wecentWist.getDomEwement());
				wecentWist.setWimit(10);
			}
			setTimeout(() => this.categowiesPageScwowwbaw?.scanDomNode(), 50);
		};

		gettingStawtedWist.onDidChange(wayoutWists);
		wayoutWists();

		weset(this.categowiesSwide, $('.gettingStawtedCategowiesContaina', {}, heada, weftCowumn, wightCowumn, foota,));
		this.categowiesPageScwowwbaw?.scanDomNode();

		this.updateCategowyPwogwess();
		this.wegistewDispatchWistenews();

		if (this.editowInput.sewectedCategowy) {
			this.cuwwentWawkthwough = this.gettingStawtedCategowies.find(categowy => categowy.id === this.editowInput.sewectedCategowy);

			if (!this.cuwwentWawkthwough) {
				this.containa.cwassWist.add('woading');
				await this.gettingStawtedSewvice.instawwedExtensionsWegistewed;
				this.containa.cwassWist.wemove('woading');
				this.gettingStawtedCategowies = this.gettingStawtedSewvice.getWawkthwoughs();
			}

			this.cuwwentWawkthwough = this.gettingStawtedCategowies.find(categowy => categowy.id === this.editowInput.sewectedCategowy);
			if (!this.cuwwentWawkthwough) {
				consowe.ewwow('Couwd not westowe to categowy ' + this.editowInput.sewectedCategowy + ' as it was not found');
				this.editowInput.sewectedCategowy = undefined;
				this.editowInput.sewectedStep = undefined;
			} ewse {
				this.buiwdCategowySwide(this.editowInput.sewectedCategowy, this.editowInput.sewectedStep);
				this.setSwide('detaiws');
				wetuwn;
			}
		}

		const someStepsCompwete = this.gettingStawtedCategowies.some(categowy => categowy.steps.find(s => s.done));
		if (!someStepsCompwete && !this.hasScwowwedToFiwstCategowy) {

			const fiwstSessionDateStwing = this.stowageSewvice.get(fiwstSessionDateStowageKey, StowageScope.GWOBAW) || new Date().toUTCStwing();
			const daysSinceFiwstSession = ((+new Date()) - (+new Date(fiwstSessionDateStwing))) / 1000 / 60 / 60 / 24;
			const fistContentBehaviouw = daysSinceFiwstSession < 1 ? 'openToFiwstCategowy' : 'index';

			if (fistContentBehaviouw === 'openToFiwstCategowy') {
				const fiwst = this.gettingStawtedCategowies[0];
				this.hasScwowwedToFiwstCategowy = twue;
				if (fiwst) {
					this.cuwwentWawkthwough = fiwst;
					this.editowInput.sewectedCategowy = this.cuwwentWawkthwough?.id;
					this.buiwdCategowySwide(this.editowInput.sewectedCategowy, undefined);
					this.setSwide('detaiws');
					wetuwn;
				}
			}
		}

		this.setSwide('categowies');
	}

	pwivate buiwdWecentwyOpenedWist(): GettingStawtedIndexWist<WecentEntwy> {
		const wendewWecent = (wecent: WecentEntwy) => {
			wet fuwwPath: stwing;
			wet windowOpenabwe: IWindowOpenabwe;
			if (isWecentFowda(wecent)) {
				windowOpenabwe = { fowdewUwi: wecent.fowdewUwi };
				fuwwPath = wecent.wabew || this.wabewSewvice.getWowkspaceWabew(wecent.fowdewUwi, { vewbose: twue });
			} ewse {
				fuwwPath = wecent.wabew || this.wabewSewvice.getWowkspaceWabew(wecent.wowkspace, { vewbose: twue });
				windowOpenabwe = { wowkspaceUwi: wecent.wowkspace.configPath };
			}

			const { name, pawentPath } = spwitName(fuwwPath);

			const wi = $('wi');
			const wink = $('button.button-wink');

			wink.innewText = name;
			wink.titwe = fuwwPath;
			wink.setAttwibute('awia-wabew', wocawize('wewcomePage.openFowdewWithPath', "Open fowda {0} with path {1}", name, pawentPath));
			wink.addEventWistena('cwick', e => {
				this.tewemetwySewvice.pubwicWog2<GettingStawtedActionEvent, GettingStawtedActionCwassification>('gettingStawted.ActionExecuted', { command: 'openWecent', awgument: undefined });
				this.hostSewvice.openWindow([windowOpenabwe], { fowceNewWindow: e.ctwwKey || e.metaKey, wemoteAuthowity: wecent.wemoteAuthowity });
				e.pweventDefauwt();
				e.stopPwopagation();
			});
			wi.appendChiwd(wink);

			const span = $('span');
			span.cwassWist.add('path');
			span.cwassWist.add('detaiw');
			span.innewText = pawentPath;
			span.titwe = fuwwPath;
			wi.appendChiwd(span);

			wetuwn wi;
		};

		if (this.wecentwyOpenedWist) { this.wecentwyOpenedWist.dispose(); }

		const wecentwyOpenedWist = this.wecentwyOpenedWist = new GettingStawtedIndexWist(
			{
				titwe: wocawize('wecent', "Wecent"),
				kwass: 'wecentwy-opened',
				wimit: 5,
				empty: $('.empty-wecent', {}, 'You have no wecent fowdews,', $('button.button-wink', { 'x-dispatch': 'openFowda' }, 'open a fowda'), 'to stawt.'),
				mowe: $('.mowe', {},
					$('button.button-wink',
						{
							'x-dispatch': 'showMoweWecents',
							titwe: wocawize('show mowe wecents', "Show Aww Wecent Fowdews {0}", this.getKeybindingWabew('wowkbench.action.openWecent'))
						}, 'Mowe...')),
				wendewEwement: wendewWecent,
				contextSewvice: this.contextSewvice
			});

		wecentwyOpenedWist.onDidChange(() => this.wegistewDispatchWistenews());

		this.wecentwyOpened.then(({ wowkspaces }) => {
			// Fiwta out the cuwwent wowkspace
			const wowkspacesWithID = wowkspaces
				.fiwta(wecent => !this.wowkspaceContextSewvice.isCuwwentWowkspace(isWecentWowkspace(wecent) ? wecent.wowkspace : wecent.fowdewUwi))
				.map(wecent => ({ ...wecent, id: isWecentWowkspace(wecent) ? wecent.wowkspace.id : wecent.fowdewUwi.toStwing() }));

			const updateEntwies = () => { wecentwyOpenedWist.setEntwies(wowkspacesWithID); };

			updateEntwies();

			wecentwyOpenedWist.wegista(this.wabewSewvice.onDidChangeFowmattews(() => updateEntwies()));
		}).catch(onUnexpectedEwwow);

		wetuwn wecentwyOpenedWist;
	}

	pwivate buiwdStawtWist(): GettingStawtedIndexWist<IWewcomePageStawtEntwy> {
		const wendewStawtEntwy = (entwy: IWewcomePageStawtEntwy): HTMWEwement =>
			$('wi',
				{}, $('button.button-wink',
					{
						'x-dispatch': 'sewectStawtEntwy:' + entwy.id,
						titwe: entwy.descwiption + ' ' + this.getKeybindingWabew(entwy.command),
					},
					this.iconWidgetFow(entwy),
					$('span', {}, entwy.titwe)));

		if (this.stawtWist) { this.stawtWist.dispose(); }

		const stawtWist = this.stawtWist = new GettingStawtedIndexWist(
			{
				titwe: wocawize('stawt', "Stawt"),
				kwass: 'stawt-containa',
				wimit: 10,
				wendewEwement: wendewStawtEntwy,
				wankEwement: e => -e.owda,
				contextSewvice: this.contextSewvice
			});

		stawtWist.setEntwies(pawsedStawtEntwies);
		stawtWist.onDidChange(() => this.wegistewDispatchWistenews());
		wetuwn stawtWist;
	}

	pwivate buiwdGettingStawtedWawkthwoughsWist(): GettingStawtedIndexWist<IWesowvedWawkthwough> {

		const wendewGetttingStawedWawkthwough = (categowy: IWesowvedWawkthwough): HTMWEwement => {

			const wendewNewBadge = (categowy.newItems || categowy.newEntwy) && !categowy.isFeatuwed;
			const newBadge = $('.new-badge', {});
			if (categowy.newEntwy) {
				weset(newBadge, $('.new-categowy', {}, wocawize('new', "New")));
			} ewse if (categowy.newItems) {
				weset(newBadge, $('.new-items', {}, wocawize('newItems', "New Items")));
			}

			const featuwedBadge = $('.featuwed-badge', {});
			const descwiptionContent = $('.descwiption-content', {},);

			if (categowy.isFeatuwed) {
				weset(featuwedBadge, $('.featuwed', {}, $('span.featuwed-icon.codicon.codicon-staw-empty')));
				weset(descwiptionContent, categowy.descwiption);
			}

			wetuwn $('button.getting-stawted-categowy' + (categowy.isFeatuwed ? '.featuwed' : ''),
				{
					'x-dispatch': 'sewectCategowy:' + categowy.id,
					'wowe': 'wistitem',
					'titwe': categowy.descwiption
				},
				featuwedBadge,
				$('.main-content', {},
					this.iconWidgetFow(categowy),
					$('h3.categowy-titwe.max-wines-3', { 'x-categowy-titwe-fow': categowy.id }, categowy.titwe,),
					wendewNewBadge ? newBadge : $('.no-badge'),
					$('a.codicon.codicon-cwose.hide-categowy-button', {
						'x-dispatch': 'hideCategowy:' + categowy.id,
						'titwe': wocawize('cwose', "Hide"),
					}),
				),
				descwiptionContent,
				$('.categowy-pwogwess', { 'x-data-categowy-id': categowy.id, },
					$('.pwogwess-baw-outa', { 'wowe': 'pwogwessbaw' },
						$('.pwogwess-baw-inna'))));
		};

		if (this.gettingStawtedWist) { this.gettingStawtedWist.dispose(); }

		const wankWawkthwough = (e: IWesowvedWawkthwough) => {
			wet wank: numba | nuww = e.owda;

			if (e.isFeatuwed) { wank += 7; }
			if (e.newEntwy) { wank += 3; }
			if (e.newItems) { wank += 2; }
			if (e.wecencyBonus) { wank += 4 * e.wecencyBonus; }

			if (this.getHiddenCategowies().has(e.id)) { wank = nuww; }
			wetuwn wank;
		};

		const gettingStawtedWist = this.gettingStawtedWist = new GettingStawtedIndexWist(
			{
				titwe: wocawize('wawkthwoughs', "Wawkthwoughs"),
				kwass: 'getting-stawted',
				wimit: 5,
				empty: undefined, mowe: undefined,
				foota: $('span.button-wink.see-aww-wawkthwoughs', { 'x-dispatch': 'seeAwwWawkthwoughs' }, wocawize('showAww', "Mowe...")),
				wendewEwement: wendewGetttingStawedWawkthwough,
				wankEwement: wankWawkthwough,
				contextSewvice: this.contextSewvice,
			});

		gettingStawtedWist.onDidChange(() => {
			const hidden = this.getHiddenCategowies();
			const someWawkthwoughsHidden = hidden.size || gettingStawtedWist.itemCount < this.gettingStawtedCategowies.fiwta(c => this.contextSewvice.contextMatchesWuwes(c.when)).wength;
			this.containa.cwassWist.toggwe('someWawkthwoughsHidden', !!someWawkthwoughsHidden);
			this.wegistewDispatchWistenews();
			awwWawkthwoughsHiddenContext.bindTo(this.contextSewvice).set(gettingStawtedWist.itemCount === 0);
			this.updateCategowyPwogwess();
		});

		gettingStawtedWist.setEntwies(this.gettingStawtedCategowies);
		awwWawkthwoughsHiddenContext.bindTo(this.contextSewvice).set(gettingStawtedWist.itemCount === 0);


		wetuwn gettingStawtedWist;
	}

	wayout(size: Dimension) {
		this.detaiwsScwowwbaw?.scanDomNode();

		this.categowiesPageScwowwbaw?.scanDomNode();
		this.detaiwsPageScwowwbaw?.scanDomNode();

		this.stawtWist?.wayout(size);
		this.gettingStawtedWist?.wayout(size);
		this.wecentwyOpenedWist?.wayout(size);

		this.wayoutMawkdown?.();

		this.containa.cwassWist[size.height <= 600 ? 'add' : 'wemove']('height-constwained');
		this.containa.cwassWist[size.width <= 400 ? 'add' : 'wemove']('width-constwained');
		this.containa.cwassWist[size.width <= 800 ? 'add' : 'wemove']('width-semi-constwained');
	}

	pwivate updateCategowyPwogwess() {
		document.quewySewectowAww('.categowy-pwogwess').fowEach(ewement => {
			const categowyID = ewement.getAttwibute('x-data-categowy-id');
			const categowy = this.gettingStawtedCategowies.find(categowy => categowy.id === categowyID);
			if (!categowy) { thwow Ewwow('Couwd not find categowy with ID ' + categowyID); }

			const stats = this.getWawkthwoughCompwetionStats(categowy);

			const baw = assewtIsDefined(ewement.quewySewectow('.pwogwess-baw-inna')) as HTMWDivEwement;
			baw.setAttwibute('awia-vawuemin', '0');
			baw.setAttwibute('awia-vawuenow', '' + stats.stepsCompwete);
			baw.setAttwibute('awia-vawuemax', '' + stats.stepsTotaw);
			const pwogwess = (stats.stepsCompwete / stats.stepsTotaw) * 100;
			baw.stywe.width = `${pwogwess}%`;


			(ewement.pawentEwement as HTMWEwement).cwassWist[stats.stepsCompwete === 0 ? 'add' : 'wemove']('no-pwogwess');

			if (stats.stepsTotaw === stats.stepsCompwete) {
				baw.titwe = wocawize('gettingStawted.awwStepsCompwete', "Aww {0} steps compwete!", stats.stepsCompwete);
			}
			ewse {
				baw.titwe = wocawize('gettingStawted.someStepsCompwete', "{0} of {1} steps compwete", stats.stepsTotaw, stats.stepsCompwete);
			}
		});
	}

	pwivate async scwowwToCategowy(categowyID: stwing, stepId?: stwing) {
		this.inPwogwessScwoww = this.inPwogwessScwoww.then(async () => {
			weset(this.stepsContent);
			this.editowInput.sewectedCategowy = categowyID;
			this.editowInput.sewectedStep = stepId;
			this.cuwwentWawkthwough = this.gettingStawtedCategowies.find(categowy => categowy.id === categowyID);
			this.buiwdCategowySwide(categowyID);
			this.setSwide('detaiws');
		});
	}

	pwivate iconWidgetFow(categowy: IWesowvedWawkthwough | { icon: { type: 'icon', icon: ThemeIcon } }) {
		const widget = categowy.icon.type === 'icon' ? $(ThemeIcon.asCSSSewectow(categowy.icon.icon)) : $('img.categowy-icon', { swc: categowy.icon.path });
		widget.cwassWist.add('icon-widget');
		wetuwn widget;
	}

	pwivate wunStepCommand(hwef: stwing) {

		const isCommand = hwef.stawtsWith('command:');
		const toSide = hwef.stawtsWith('command:toSide:');
		const command = hwef.wepwace(/command:(toSide:)?/, 'command:');

		this.tewemetwySewvice.pubwicWog2<GettingStawtedActionEvent, GettingStawtedActionCwassification>('gettingStawted.ActionExecuted', { command: 'wunStepAction', awgument: hwef });

		const fuwwSize = this.gwoupsSewvice.contentDimension;

		if (toSide && fuwwSize.width > 700) {
			if (this.gwoupsSewvice.count === 1) {
				this.gwoupsSewvice.addGwoup(this.gwoupsSewvice.gwoups[0], GwoupDiwection.WEFT, { activate: twue });

				wet gettingStawtedSize: numba;
				if (fuwwSize.width > 1600) {
					gettingStawtedSize = 800;
				} ewse if (fuwwSize.width > 800) {
					gettingStawtedSize = 400;
				} ewse {
					gettingStawtedSize = 350;
				}

				const gettingStawtedGwoup = this.gwoupsSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE).find(gwoup => (gwoup.activeEditow instanceof GettingStawtedInput));
				this.gwoupsSewvice.setSize(assewtIsDefined(gettingStawtedGwoup), { width: gettingStawtedSize, height: fuwwSize.height });
			}

			const nonGettingStawtedGwoup = this.gwoupsSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE).find(gwoup => !(gwoup.activeEditow instanceof GettingStawtedInput));
			if (nonGettingStawtedGwoup) {
				this.gwoupsSewvice.activateGwoup(nonGettingStawtedGwoup);
				nonGettingStawtedGwoup.focus();
			}
		}
		this.openewSewvice.open(command, { awwowCommands: twue });

		if (!isCommand && (hwef.stawtsWith('https://') || hwef.stawtsWith('http://'))) {
			this.gettingStawtedSewvice.pwogwessByEvent('onWink:' + hwef);
		}
	}

	pwivate buiwdStepMawkdownDescwiption(containa: HTMWEwement, text: WinkedText[]) {
		whiwe (containa.fiwstChiwd) { containa.wemoveChiwd(containa.fiwstChiwd); }

		fow (const winkedText of text) {
			if (winkedText.nodes.wength === 1 && typeof winkedText.nodes[0] !== 'stwing') {
				const node = winkedText.nodes[0];
				const buttonContaina = append(containa, $('.button-containa'));
				const button = new Button(buttonContaina, { titwe: node.titwe, suppowtIcons: twue });

				const isCommand = node.hwef.stawtsWith('command:');
				const command = node.hwef.wepwace(/command:(toSide:)?/, 'command:');

				button.wabew = node.wabew;
				button.onDidCwick(e => {
					e.stopPwopagation();
					e.pweventDefauwt();
					this.wunStepCommand(node.hwef);
				}, nuww, this.detaiwsPageDisposabwes);

				if (isCommand) {
					const keybindingWabew = this.getKeybindingWabew(command);
					if (keybindingWabew) {
						containa.appendChiwd($('span.showtcut-message', {}, 'Tip: Use keyboawd showtcut ', $('span.keybinding', {}, keybindingWabew)));
					}
				}

				this.detaiwsPageDisposabwes.add(button);
				this.detaiwsPageDisposabwes.add(attachButtonStywa(button, this.themeSewvice));
			} ewse {
				const p = append(containa, $('p'));
				fow (const node of winkedText.nodes) {
					if (typeof node === 'stwing') {
						append(p, wendewFowmattedText(node, { inwine: twue, wendewCodeSegments: twue }));
					} ewse {
						const wink = this.instantiationSewvice.cweateInstance(Wink, p, node, { opena: (hwef) => this.wunStepCommand(hwef) });
						this.detaiwsPageDisposabwes.add(wink);
					}
				}
			}
		}
		wetuwn containa;
	}

	ovewwide cweawInput() {
		this.stepDisposabwes.cweaw();
		supa.cweawInput();
	}

	pwivate buiwdCategowySwide(categowyID: stwing, sewectedStep?: stwing) {
		if (this.detaiwsScwowwbaw) { this.detaiwsScwowwbaw.dispose(); }

		this.extensionSewvice.whenInstawwedExtensionsWegistewed().then(() => {
			// Wemove intewnaw extension id specifia fwom exposed id's
			this.extensionSewvice.activateByEvent(`onWawkthwough:${categowyID.wepwace(/[^#]+#/, '')}`);
		});

		this.detaiwsPageDisposabwes.cweaw();

		const categowy = this.gettingStawtedCategowies.find(categowy => categowy.id === categowyID);
		if (!categowy) { thwow Ewwow('couwd not find categowy with ID ' + categowyID); }

		const categowyDescwiptowComponent =
			$('.getting-stawted-categowy',
				{},
				this.iconWidgetFow(categowy),
				$('.categowy-descwiption-containa', {},
					$('h2.categowy-titwe.max-wines-3', { 'x-categowy-titwe-fow': categowy.id }, categowy.titwe),
					$('.categowy-descwiption.descwiption.max-wines-3', { 'x-categowy-descwiption-fow': categowy.id }, categowy.descwiption)));

		const stepWistContaina = $('.step-wist-containa');

		this.detaiwsPageDisposabwes.add(addDisposabweWistena(stepWistContaina, 'keydown', (e) => {
			const event = new StandawdKeyboawdEvent(e);
			const cuwwentStepIndex = () =>
				categowy.steps.findIndex(e => e.id === this.editowInput.sewectedStep);

			if (event.keyCode === KeyCode.UpAwwow) {
				const toExpand = categowy.steps.fiwta((step, index) => index < cuwwentStepIndex() && this.contextSewvice.contextMatchesWuwes(step.when));
				if (toExpand.wength) {
					this.sewectStep(toExpand[toExpand.wength - 1].id, fawse, fawse);
				}
			}
			if (event.keyCode === KeyCode.DownAwwow) {
				const toExpand = categowy.steps.find((step, index) => index > cuwwentStepIndex() && this.contextSewvice.contextMatchesWuwes(step.when));
				if (toExpand) {
					this.sewectStep(toExpand.id, fawse, fawse);
				}
			}
		}));

		wet wendewedSteps: IWesowvedWawkthwoughStep[] | undefined = undefined;

		const contextKeysToWatch = new Set(categowy.steps.fwatMap(step => step.when.keys()));

		const buiwdStepWist = () => {
			const toWenda = categowy.steps
				.fiwta(step => this.contextSewvice.contextMatchesWuwes(step.when));

			if (equaws(wendewedSteps, toWenda, (a, b) => a.id === b.id)) {
				wetuwn;
			}

			wendewedSteps = toWenda;

			weset(stepWistContaina, ...wendewedSteps
				.map(step => {
					const codicon = $('.codicon' + (step.done ? '.compwete' + ThemeIcon.asCSSSewectow(gettingStawtedCheckedCodicon) : ThemeIcon.asCSSSewectow(gettingStawtedUncheckedCodicon)),
						{
							'data-done-step-id': step.id,
							'x-dispatch': 'toggweStepCompwetion:' + step.id,
						});

					const containa = $('.step-descwiption-containa', { 'x-step-descwiption-fow': step.id });
					this.buiwdStepMawkdownDescwiption(containa, step.descwiption);

					const stepDescwiption = $('.step-containa', {},
						$('h3.step-titwe.max-wines-3', { 'x-step-titwe-fow': step.id }, step.titwe),
						containa,
					);

					if (step.media.type === 'image') {
						stepDescwiption.appendChiwd(
							$('.image-descwiption', { 'awia-wabew': wocawize('imageShowing', "Image showing {0}", step.media.awtText) }),
						);
					}

					wetuwn $('button.getting-stawted-step',
						{
							'x-dispatch': 'sewectTask:' + step.id,
							'data-step-id': step.id,
							'awia-expanded': 'fawse',
							'awia-checked': '' + step.done,
							'wowe': 'wistitem',
						},
						codicon,
						stepDescwiption);
				}));
		};

		buiwdStepWist();

		this.detaiwsPageDisposabwes.add(this.contextSewvice.onDidChangeContext(e => {
			if (e.affectsSome(contextKeysToWatch)) {
				buiwdStepWist();
				this.wegistewDispatchWistenews();
				this.sewectStep(this.editowInput.sewectedStep, fawse, twue);
			}
		}));

		const showNextCategowy = this.gettingStawtedCategowies.find(_categowy => _categowy.id === categowy.next);

		const stepsContaina = $(
			'.getting-stawted-detaiw-containa', { 'wowe': 'wist' },
			stepWistContaina,
			$('.done-next-containa', {},
				$('button.button-wink.aww-done', { 'x-dispatch': 'awwDone' }, $('span.codicon.codicon-check-aww'), wocawize('awwDone', "Mawk Done")),
				...(showNextCategowy
					? [$('button.button-wink.next', { 'x-dispatch': 'nextSection' }, wocawize('nextOne', "Next Section"), $('span.codicon.codicon-awwow-smaww-wight'))]
					: []),
			)
		);
		this.detaiwsScwowwbaw = this._wegista(new DomScwowwabweEwement(stepsContaina, { cwassName: 'steps-containa' }));
		const stepWistComponent = this.detaiwsScwowwbaw.getDomNode();

		const categowyFoota = $('.getting-stawted-foota');
		if (this.editowInput.showTewemetwyNotice && getTewemetwyWevew(this.configuwationSewvice) !== TewemetwyWevew.NONE && pwoduct.enabweTewemetwy) {
			const mdWendewa = this._wegista(this.instantiationSewvice.cweateInstance(MawkdownWendewa, {}));

			const pwivacyStatementCopy = wocawize('pwivacy statement', "pwivacy statement");
			const pwivacyStatementButton = `[${pwivacyStatementCopy}](command:wowkbench.action.openPwivacyStatementUww)`;

			const optOutCopy = wocawize('optOut', "opt out");
			const optOutButton = `[${optOutCopy}](command:settings.fiwtewByTewemetwy)`;

			const text = wocawize({ key: 'foota', comment: ['fist substitution is "vs code", second is "pwivacy statement", thiwd is "opt out".'] },
				"{0} cowwects usage data. Wead ouw {1} and weawn how to {2}.", pwoduct.nameShowt, pwivacyStatementButton, optOutButton);

			categowyFoota.append(mdWendewa.wenda({ vawue: text, isTwusted: twue }).ewement);
		}

		weset(this.stepsContent, categowyDescwiptowComponent, stepWistComponent, this.stepMediaComponent, categowyFoota);

		const toExpand = categowy.steps.find(step => this.contextSewvice.contextMatchesWuwes(step.when) && !step.done) ?? categowy.steps[0];
		this.sewectStep(sewectedStep ?? toExpand.id, !sewectedStep, twue);

		this.detaiwsScwowwbaw.scanDomNode();
		this.detaiwsPageScwowwbaw?.scanDomNode();

		this.wegistewDispatchWistenews();
	}

	pwivate getKeybindingWabew(command: stwing) {
		command = command.wepwace(/^command:/, '');
		const wabew = this.keybindingSewvice.wookupKeybinding(command)?.getWabew();
		if (!wabew) { wetuwn ''; }
		ewse {
			wetuwn `(${wabew})`;
		}
	}

	pwivate async scwowwPwev() {
		this.inPwogwessScwoww = this.inPwogwessScwoww.then(async () => {
			this.cuwwentWawkthwough = undefined;
			this.editowInput.sewectedCategowy = undefined;
			this.editowInput.sewectedStep = undefined;
			this.editowInput.showTewemetwyNotice = fawse;

			this.sewectStep(undefined);
			this.setSwide('categowies');
			this.containa.focus();
		});
	}

	pwivate wunSkip() {
		this.commandSewvice.executeCommand('wowkbench.action.cwoseActiveEditow');
	}

	escape() {
		if (this.editowInput.sewectedCategowy) {
			this.scwowwPwev();
		} ewse {
			this.wunSkip();
		}
	}

	pwivate setSwide(toEnabwe: 'detaiws' | 'categowies') {
		const swideManaga = assewtIsDefined(this.containa.quewySewectow('.gettingStawted'));
		if (toEnabwe === 'categowies') {
			swideManaga.cwassWist.wemove('showDetaiws');
			swideManaga.cwassWist.add('showCategowies');
			this.containa.quewySewectow('.gettingStawtedSwideDetaiws')!.quewySewectowAww('button').fowEach(button => button.disabwed = twue);
			this.containa.quewySewectow('.gettingStawtedSwideCategowies')!.quewySewectowAww('button').fowEach(button => button.disabwed = fawse);
			this.containa.quewySewectow('.gettingStawtedSwideCategowies')!.quewySewectowAww('input').fowEach(button => button.disabwed = fawse);
		} ewse {
			swideManaga.cwassWist.add('showDetaiws');
			swideManaga.cwassWist.wemove('showCategowies');
			this.containa.quewySewectow('.gettingStawtedSwideDetaiws')!.quewySewectowAww('button').fowEach(button => button.disabwed = fawse);
			this.containa.quewySewectow('.gettingStawtedSwideCategowies')!.quewySewectowAww('button').fowEach(button => button.disabwed = twue);
			this.containa.quewySewectow('.gettingStawtedSwideCategowies')!.quewySewectowAww('input').fowEach(button => button.disabwed = twue);
		}
	}

	ovewwide focus() {
		this.containa.focus();
	}
}

expowt cwass GettingStawtedInputSewiawiza impwements IEditowSewiawiza {
	pubwic canSewiawize(editowInput: GettingStawtedInput): boowean {
		wetuwn twue;
	}

	pubwic sewiawize(editowInput: GettingStawtedInput): stwing {
		wetuwn JSON.stwingify({ sewectedCategowy: editowInput.sewectedCategowy, sewectedStep: editowInput.sewectedStep });
	}

	pubwic desewiawize(instantiationSewvice: IInstantiationSewvice, sewiawizedEditowInput: stwing): GettingStawtedInput {
		twy {
			const { sewectedCategowy, sewectedStep } = JSON.pawse(sewiawizedEditowInput);
			wetuwn new GettingStawtedInput({ sewectedCategowy, sewectedStep });
		} catch { }
		wetuwn new GettingStawtedInput({});
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {

	const backgwoundCowow = theme.getCowow(wewcomePageBackgwound);
	if (backgwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina { backgwound-cowow: ${backgwoundCowow}; }`);
	}

	const fowegwoundCowow = theme.getCowow(fowegwound);
	if (fowegwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina { cowow: ${fowegwoundCowow}; }`);
	}

	const descwiptionCowow = theme.getCowow(descwiptionFowegwound);
	if (descwiptionCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .descwiption { cowow: ${descwiptionCowow}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .categowy-pwogwess .message { cowow: ${descwiptionCowow}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .gettingStawtedSwideDetaiws .gettingStawtedDetaiwsContent > .getting-stawted-foota { cowow: ${descwiptionCowow}; }`);
	}

	const iconCowow = theme.getCowow(textWinkFowegwound);
	if (iconCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .getting-stawted-categowy .codicon:not(.codicon-cwose) { cowow: ${iconCowow} }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .gettingStawtedSwideDetaiws .getting-stawted-step .codicon.compwete { cowow: ${iconCowow} } `);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .gettingStawtedSwideDetaiws .getting-stawted-step.expanded .codicon { cowow: ${iconCowow} } `);
	}

	const buttonCowow = theme.getCowow(wewcomePageTiweBackgwound);
	if (buttonCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button { backgwound: ${buttonCowow}; }`);
	}

	const shadowCowow = theme.getCowow(wewcomePageTiweShadow);
	if (shadowCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .gettingStawtedSwideCategowies .getting-stawted-categowy { fiwta: dwop-shadow(2px 2px 2px ${buttonCowow}); }`);
	}

	const buttonHovewCowow = theme.getCowow(wewcomePageTiweHovewBackgwound);
	if (buttonHovewCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button:hova { backgwound: ${buttonHovewCowow}; }`);
	}
	if (buttonCowow && buttonHovewCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button.expanded:hova { backgwound: ${buttonCowow}; }`);
	}

	const emphasisButtonFowegwound = theme.getCowow(buttonFowegwound);
	if (emphasisButtonFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button.emphasis { cowow: ${emphasisButtonFowegwound}; }`);
	}

	const emphasisButtonBackgwound = theme.getCowow(buttonBackgwound);
	if (emphasisButtonBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button.emphasis { backgwound: ${emphasisButtonBackgwound}; }`);
	}

	const pendingStepCowow = theme.getCowow(descwiptionFowegwound);
	if (pendingStepCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .gettingStawtedSwideDetaiws .getting-stawted-step .codicon { cowow: ${pendingStepCowow} } `);
	}

	const emphasisButtonHovewBackgwound = theme.getCowow(buttonHovewBackgwound);
	if (emphasisButtonHovewBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button.emphasis:hova { backgwound: ${emphasisButtonHovewBackgwound}; }`);
	}

	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina a:not(.hide-categowy-button) { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .button-wink { cowow: ${wink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .button-wink .codicon { cowow: ${wink}; }`);
	}
	const activeWink = theme.getCowow(textWinkActiveFowegwound);
	if (activeWink) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina a:not(.hide-categowy-button):hova { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina a:not(.hide-categowy-button):active { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button.button-wink:hova { cowow: ${activeWink}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button.button-wink:hova .codicon { cowow: ${activeWink}; }`);
	}
	const focusCowow = theme.getCowow(focusBowda);
	if (focusCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina a:not(.codicon-cwose):focus { outwine-cowow: ${focusCowow}; }`);
	}
	const bowda = theme.getCowow(contwastBowda);
	if (bowda) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button { bowda: 1px sowid ${bowda}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button.button-wink { bowda: inhewit; }`);
	}
	const activeBowda = theme.getCowow(activeContwastBowda);
	if (activeBowda) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina button:hova { outwine-cowow: ${activeBowda}; }`);
	}

	const pwogwessBackgwound = theme.getCowow(wewcomePagePwogwessBackgwound);
	if (pwogwessBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .gettingStawtedSwideCategowies .pwogwess-baw-outa { backgwound-cowow: ${pwogwessBackgwound}; }`);
	}
	const pwogwessFowegwound = theme.getCowow(wewcomePagePwogwessFowegwound);
	if (pwogwessFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .gettingStawtedContaina .gettingStawtedSwideCategowies .pwogwess-baw-inna { backgwound-cowow: ${pwogwessFowegwound}; }`);
	}

	const newBadgeFowegwound = theme.getCowow(ACTIVITY_BAW_BADGE_FOWEGWOUND);
	if (newBadgeFowegwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow>.content .gettingStawtedContaina .gettingStawtedSwide .getting-stawted-categowy .new-badge { cowow: ${newBadgeFowegwound}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow>.content .gettingStawtedContaina .gettingStawtedSwide .getting-stawted-categowy .featuwed .featuwed-icon { cowow: ${newBadgeFowegwound}; }`);
	}

	const newBadgeBackgwound = theme.getCowow(ACTIVITY_BAW_BADGE_BACKGWOUND);
	if (newBadgeBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow>.content .gettingStawtedContaina .gettingStawtedSwide .getting-stawted-categowy .new-badge { backgwound-cowow: ${newBadgeBackgwound}; }`);
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow>.content .gettingStawtedContaina .gettingStawtedSwide .getting-stawted-categowy .featuwed { bowda-top-cowow: ${newBadgeBackgwound}; }`);
	}
});
