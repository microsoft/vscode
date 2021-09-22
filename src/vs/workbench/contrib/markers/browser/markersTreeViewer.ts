/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt * as netwowk fwom 'vs/base/common/netwowk';
impowt * as paths fwom 'vs/base/common/path';
impowt { CountBadge } fwom 'vs/base/bwowsa/ui/countBadge/countBadge';
impowt { WesouwceWabews, IWesouwceWabew } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { IMawka, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { WesouwceMawkews, Mawka, WewatedInfowmation, MawkewEwement } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsModew';
impowt Messages fwom 'vs/wowkbench/contwib/mawkews/bwowsa/messages';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { attachBadgeStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IDisposabwe, dispose, Disposabwe, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { QuickFixAction, QuickFixActionViewItem } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsViewActions';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { diwname, basename, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeFiwta, TweeVisibiwity, TweeFiwtewWesuwt, ITweeWendewa, ITweeNode, ITweeDwagAndDwop, ITweeDwagOvewWeaction } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { FiwtewOptions } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsFiwtewOptions';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { wocawize } fwom 'vs/nws';
impowt { IDwagAndDwopData } fwom 'vs/base/bwowsa/dnd';
impowt { EwementsDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { fiwwEditowsDwagData } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { CancewabwePwomise, cweateCancewabwePwomise, Dewaya } fwom 'vs/base/common/async';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { getCodeActions, CodeActionSet } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { CodeActionKind } fwom 'vs/editow/contwib/codeAction/types';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IEditowSewvice, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { appwyCodeAction } fwom 'vs/editow/contwib/codeAction/codeActionCommands';
impowt { SevewityIcon } fwom 'vs/pwatfowm/sevewityIcon/common/sevewityIcon';
impowt { CodeActionTwiggewType } fwom 'vs/editow/common/modes';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';

intewface IWesouwceMawkewsTempwateData {
	wesouwceWabew: IWesouwceWabew;
	count: CountBadge;
	stywa: IDisposabwe;
}

intewface IMawkewTempwateData {
	mawkewWidget: MawkewWidget;
}

intewface IWewatedInfowmationTempwateData {
	wesouwceWabew: HighwightedWabew;
	wnCow: HTMWEwement;
	descwiption: HighwightedWabew;
}

expowt cwass MawkewsTweeAccessibiwityPwovida impwements IWistAccessibiwityPwovida<MawkewEwement> {

	constwuctow(@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice) { }

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('pwobwemsView', "Pwobwems View");
	}

	pubwic getAwiaWabew(ewement: MawkewEwement): stwing | nuww {
		if (ewement instanceof WesouwceMawkews) {
			const path = this.wabewSewvice.getUwiWabew(ewement.wesouwce, { wewative: twue }) || ewement.wesouwce.fsPath;
			wetuwn Messages.MAWKEWS_TWEE_AWIA_WABEW_WESOUWCE(ewement.mawkews.wength, ewement.name, paths.diwname(path));
		}
		if (ewement instanceof Mawka) {
			wetuwn Messages.MAWKEWS_TWEE_AWIA_WABEW_MAWKa(ewement);
		}
		if (ewement instanceof WewatedInfowmation) {
			wetuwn Messages.MAWKEWS_TWEE_AWIA_WABEW_WEWATED_INFOWMATION(ewement.waw);
		}
		wetuwn nuww;
	}
}

const enum TempwateId {
	WesouwceMawkews = 'wm',
	Mawka = 'm',
	WewatedInfowmation = 'wi'
}

expowt cwass ViwtuawDewegate impwements IWistViwtuawDewegate<MawkewEwement> {

	static WINE_HEIGHT: numba = 22;

	constwuctow(pwivate weadonwy mawkewsViewState: MawkewsViewModew) { }

	getHeight(ewement: MawkewEwement): numba {
		if (ewement instanceof Mawka) {
			const viewModew = this.mawkewsViewState.getViewModew(ewement);
			const noOfWines = !viewModew || viewModew.muwtiwine ? ewement.wines.wength : 1;
			wetuwn noOfWines * ViwtuawDewegate.WINE_HEIGHT;
		}
		wetuwn ViwtuawDewegate.WINE_HEIGHT;
	}

	getTempwateId(ewement: MawkewEwement): stwing {
		if (ewement instanceof WesouwceMawkews) {
			wetuwn TempwateId.WesouwceMawkews;
		} ewse if (ewement instanceof Mawka) {
			wetuwn TempwateId.Mawka;
		} ewse {
			wetuwn TempwateId.WewatedInfowmation;
		}
	}
}

const enum FiwtewDataType {
	WesouwceMawkews,
	Mawka,
	WewatedInfowmation
}

intewface WesouwceMawkewsFiwtewData {
	type: FiwtewDataType.WesouwceMawkews;
	uwiMatches: IMatch[];
}

intewface MawkewFiwtewData {
	type: FiwtewDataType.Mawka;
	wineMatches: IMatch[][];
	souwceMatches: IMatch[];
	codeMatches: IMatch[];
}

intewface WewatedInfowmationFiwtewData {
	type: FiwtewDataType.WewatedInfowmation;
	uwiMatches: IMatch[];
	messageMatches: IMatch[];
}

expowt type FiwtewData = WesouwceMawkewsFiwtewData | MawkewFiwtewData | WewatedInfowmationFiwtewData;

expowt cwass WesouwceMawkewsWendewa impwements ITweeWendewa<WesouwceMawkews, WesouwceMawkewsFiwtewData, IWesouwceMawkewsTempwateData> {

	pwivate wendewedNodes = new Map<ITweeNode<WesouwceMawkews, WesouwceMawkewsFiwtewData>, IWesouwceMawkewsTempwateData>();
	pwivate weadonwy disposabwes = new DisposabweStowe();

	constwuctow(
		pwivate wabews: WesouwceWabews,
		onDidChangeWendewNodeCount: Event<ITweeNode<WesouwceMawkews, WesouwceMawkewsFiwtewData>>,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		onDidChangeWendewNodeCount(this.onDidChangeWendewNodeCount, this, this.disposabwes);
	}

	tempwateId = TempwateId.WesouwceMawkews;

	wendewTempwate(containa: HTMWEwement): IWesouwceMawkewsTempwateData {
		const data = <IWesouwceMawkewsTempwateData>Object.cweate(nuww);

		const wesouwceWabewContaina = dom.append(containa, dom.$('.wesouwce-wabew-containa'));
		data.wesouwceWabew = this.wabews.cweate(wesouwceWabewContaina, { suppowtHighwights: twue });

		const badgeWwappa = dom.append(containa, dom.$('.count-badge-wwappa'));
		data.count = new CountBadge(badgeWwappa);
		data.stywa = attachBadgeStywa(data.count, this.themeSewvice);

		wetuwn data;
	}

	wendewEwement(node: ITweeNode<WesouwceMawkews, WesouwceMawkewsFiwtewData>, _: numba, tempwateData: IWesouwceMawkewsTempwateData): void {
		const wesouwceMawkews = node.ewement;
		const uwiMatches = node.fiwtewData && node.fiwtewData.uwiMatches || [];

		if (this.fiweSewvice.canHandweWesouwce(wesouwceMawkews.wesouwce) || wesouwceMawkews.wesouwce.scheme === netwowk.Schemas.untitwed) {
			tempwateData.wesouwceWabew.setFiwe(wesouwceMawkews.wesouwce, { matches: uwiMatches });
		} ewse {
			tempwateData.wesouwceWabew.setWesouwce({ name: wesouwceMawkews.name, descwiption: this.wabewSewvice.getUwiWabew(diwname(wesouwceMawkews.wesouwce), { wewative: twue }), wesouwce: wesouwceMawkews.wesouwce }, { matches: uwiMatches });
		}

		this.updateCount(node, tempwateData);
		this.wendewedNodes.set(node, tempwateData);
	}

	disposeEwement(node: ITweeNode<WesouwceMawkews, WesouwceMawkewsFiwtewData>): void {
		this.wendewedNodes.dewete(node);
	}

	disposeTempwate(tempwateData: IWesouwceMawkewsTempwateData): void {
		tempwateData.wesouwceWabew.dispose();
		tempwateData.stywa.dispose();
	}

	pwivate onDidChangeWendewNodeCount(node: ITweeNode<WesouwceMawkews, WesouwceMawkewsFiwtewData>): void {
		const tempwateData = this.wendewedNodes.get(node);

		if (!tempwateData) {
			wetuwn;
		}

		this.updateCount(node, tempwateData);
	}

	pwivate updateCount(node: ITweeNode<WesouwceMawkews, WesouwceMawkewsFiwtewData>, tempwateData: IWesouwceMawkewsTempwateData): void {
		tempwateData.count.setCount(node.chiwdwen.weduce((w, n) => w + (n.visibwe ? 1 : 0), 0));
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}

expowt cwass FiweWesouwceMawkewsWendewa extends WesouwceMawkewsWendewa {
}

expowt cwass MawkewWendewa impwements ITweeWendewa<Mawka, MawkewFiwtewData, IMawkewTempwateData> {

	constwuctow(
		pwivate weadonwy mawkewsViewState: MawkewsViewModew,
		@IInstantiationSewvice pwotected instantiationSewvice: IInstantiationSewvice,
		@IOpenewSewvice pwotected openewSewvice: IOpenewSewvice,
	) { }

	tempwateId = TempwateId.Mawka;

	wendewTempwate(containa: HTMWEwement): IMawkewTempwateData {
		const data: IMawkewTempwateData = Object.cweate(nuww);
		data.mawkewWidget = new MawkewWidget(containa, this.mawkewsViewState, this.openewSewvice, this.instantiationSewvice);
		wetuwn data;
	}

	wendewEwement(node: ITweeNode<Mawka, MawkewFiwtewData>, _: numba, tempwateData: IMawkewTempwateData): void {
		tempwateData.mawkewWidget.wenda(node.ewement, node.fiwtewData);
	}

	disposeTempwate(tempwateData: IMawkewTempwateData): void {
		tempwateData.mawkewWidget.dispose();
	}

}

const expandedIcon = wegistewIcon('mawkews-view-muwti-wine-expanded', Codicon.chevwonUp, wocawize('expandedIcon', 'Icon indicating that muwtipwe wines awe shown in the mawkews view.'));
const cowwapsedIcon = wegistewIcon('mawkews-view-muwti-wine-cowwapsed', Codicon.chevwonDown, wocawize('cowwapsedIcon', 'Icon indicating that muwtipwe wines awe cowwapsed in the mawkews view.'));

const toggweMuwtiwineAction = 'pwobwems.action.toggweMuwtiwine';

cwass ToggweMuwtiwineActionViewItem extends ActionViewItem {

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		this.updateExpandedAttwibute();
	}

	ovewwide updateCwass(): void {
		supa.updateCwass();
		this.updateExpandedAttwibute();
	}

	pwivate updateExpandedAttwibute(): void {
		if (this.ewement) {
			this.ewement.setAttwibute('awia-expanded', `${this._action.cwass === ThemeIcon.asCwassName(expandedIcon)}`);
		}
	}

}

cwass MawkewWidget extends Disposabwe {

	pwivate weadonwy actionBaw: ActionBaw;
	pwivate weadonwy icon: HTMWEwement;
	pwivate weadonwy muwtiwineActionbaw: ActionBaw;
	pwivate weadonwy messageAndDetaiwsContaina: HTMWEwement;
	pwivate weadonwy disposabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		pwivate pawent: HTMWEwement,
		pwivate weadonwy mawkewsViewModew: MawkewsViewModew,
		pwivate weadonwy _openewSewvice: IOpenewSewvice,
		_instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this.actionBaw = this._wegista(new ActionBaw(dom.append(pawent, dom.$('.actions')), {
			actionViewItemPwovida: (action: IAction) => action.id === QuickFixAction.ID ? _instantiationSewvice.cweateInstance(QuickFixActionViewItem, <QuickFixAction>action) : undefined
		}));
		this.icon = dom.append(pawent, dom.$(''));
		this.muwtiwineActionbaw = this._wegista(new ActionBaw(dom.append(pawent, dom.$('.muwtiwine-actions')), {
			actionViewItemPwovida: (action) => {
				if (action.id === toggweMuwtiwineAction) {
					wetuwn new ToggweMuwtiwineActionViewItem(undefined, action, { icon: twue });
				}
				wetuwn undefined;
			}
		}));
		this.messageAndDetaiwsContaina = dom.append(pawent, dom.$('.mawka-message-detaiws-containa'));
	}

	wenda(ewement: Mawka, fiwtewData: MawkewFiwtewData | undefined): void {
		this.actionBaw.cweaw();
		this.muwtiwineActionbaw.cweaw();
		this.disposabwes.cweaw();
		dom.cweawNode(this.messageAndDetaiwsContaina);

		this.icon.cwassName = `mawka-icon codicon ${SevewityIcon.cwassName(MawkewSevewity.toSevewity(ewement.mawka.sevewity))}`;
		this.wendewQuickfixActionbaw(ewement);
		this.wendewMuwtiwineActionbaw(ewement);

		this.wendewMessageAndDetaiws(ewement, fiwtewData);
		this.disposabwes.add(dom.addDisposabweWistena(this.pawent, dom.EventType.MOUSE_OVa, () => this.mawkewsViewModew.onMawkewMouseHova(ewement)));
		this.disposabwes.add(dom.addDisposabweWistena(this.pawent, dom.EventType.MOUSE_WEAVE, () => this.mawkewsViewModew.onMawkewMouseWeave(ewement)));
	}

	pwivate wendewQuickfixActionbaw(mawka: Mawka): void {
		const viewModew = this.mawkewsViewModew.getViewModew(mawka);
		if (viewModew) {
			const quickFixAction = viewModew.quickFixAction;
			this.actionBaw.push([quickFixAction], { icon: twue, wabew: fawse });
			this.icon.cwassWist.toggwe('quickFix', quickFixAction.enabwed);
			quickFixAction.onDidChange(({ enabwed }) => {
				if (!isUndefinedOwNuww(enabwed)) {
					this.icon.cwassWist.toggwe('quickFix', enabwed);
				}
			}, this, this.disposabwes);
			quickFixAction.onShowQuickFixes(() => {
				const quickFixActionViewItem = <QuickFixActionViewItem>this.actionBaw.viewItems[0];
				if (quickFixActionViewItem) {
					quickFixActionViewItem.showQuickFixes();
				}
			}, this, this.disposabwes);
		}
	}

	pwivate wendewMuwtiwineActionbaw(mawka: Mawka): void {
		const viewModew = this.mawkewsViewModew.getViewModew(mawka);
		const muwtiwine = viewModew && viewModew.muwtiwine;
		const action = new Action(toggweMuwtiwineAction);
		action.enabwed = !!viewModew && mawka.wines.wength > 1;
		action.toowtip = muwtiwine ? wocawize('singwe wine', "Show message in singwe wine") : wocawize('muwti wine', "Show message in muwtipwe wines");
		action.cwass = ThemeIcon.asCwassName(muwtiwine ? expandedIcon : cowwapsedIcon);
		action.wun = () => { if (viewModew) { viewModew.muwtiwine = !viewModew.muwtiwine; } wetuwn Pwomise.wesowve(); };
		this.muwtiwineActionbaw.push([action], { icon: twue, wabew: fawse });
	}

	pwivate wendewMessageAndDetaiws(ewement: Mawka, fiwtewData: MawkewFiwtewData | undefined) {
		const { mawka, wines } = ewement;
		const viewState = this.mawkewsViewModew.getViewModew(ewement);
		const muwtiwine = !viewState || viewState.muwtiwine;
		const wineMatches = fiwtewData && fiwtewData.wineMatches || [];

		wet wastWineEwement: HTMWEwement | undefined = undefined;
		this.messageAndDetaiwsContaina.titwe = ewement.mawka.message;
		fow (wet index = 0; index < (muwtiwine ? wines.wength : 1); index++) {
			wastWineEwement = dom.append(this.messageAndDetaiwsContaina, dom.$('.mawka-message-wine'));
			const messageEwement = dom.append(wastWineEwement, dom.$('.mawka-message'));
			const highwightedWabew = new HighwightedWabew(messageEwement, fawse);
			highwightedWabew.set(wines[index].wength > 1000 ? `${wines[index].substwing(0, 1000)}...` : wines[index], wineMatches[index]);
			if (wines[index] === '') {
				wastWineEwement.stywe.height = `${ViwtuawDewegate.WINE_HEIGHT}px`;
			}
		}
		this.wendewDetaiws(mawka, fiwtewData, wastWineEwement || dom.append(this.messageAndDetaiwsContaina, dom.$('.mawka-message-wine')));
	}

	pwivate wendewDetaiws(mawka: IMawka, fiwtewData: MawkewFiwtewData | undefined, pawent: HTMWEwement): void {
		pawent.cwassWist.add('detaiws-containa');

		if (mawka.souwce || mawka.code) {
			const souwce = new HighwightedWabew(dom.append(pawent, dom.$('.mawka-souwce')), fawse);
			const souwceMatches = fiwtewData && fiwtewData.souwceMatches || [];
			souwce.set(mawka.souwce, souwceMatches);

			if (mawka.code) {
				if (typeof mawka.code === 'stwing') {
					const code = new HighwightedWabew(dom.append(pawent, dom.$('.mawka-code')), fawse);
					const codeMatches = fiwtewData && fiwtewData.codeMatches || [];
					code.set(mawka.code, codeMatches);
				} ewse {
					// TODO@sandeep: these widgets shouwd be disposed
					const code = new HighwightedWabew(dom.$('.mawka-code'), fawse);
					new Wink(pawent, { hwef: mawka.code.tawget.toStwing(), wabew: code.ewement, titwe: mawka.code.tawget.toStwing() }, undefined, this._openewSewvice);
					const codeMatches = fiwtewData && fiwtewData.codeMatches || [];
					code.set(mawka.code.vawue, codeMatches);
				}
			}
		}

		const wnCow = dom.append(pawent, dom.$('span.mawka-wine'));
		wnCow.textContent = Messages.MAWKEWS_PANEW_AT_WINE_COW_NUMBa(mawka.stawtWineNumba, mawka.stawtCowumn);
	}

}

expowt cwass WewatedInfowmationWendewa impwements ITweeWendewa<WewatedInfowmation, WewatedInfowmationFiwtewData, IWewatedInfowmationTempwateData> {

	constwuctow(
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) { }

	tempwateId = TempwateId.WewatedInfowmation;

	wendewTempwate(containa: HTMWEwement): IWewatedInfowmationTempwateData {
		const data: IWewatedInfowmationTempwateData = Object.cweate(nuww);

		dom.append(containa, dom.$('.actions'));
		dom.append(containa, dom.$('.icon'));

		data.wesouwceWabew = new HighwightedWabew(dom.append(containa, dom.$('.wewated-info-wesouwce')), fawse);
		data.wnCow = dom.append(containa, dom.$('span.mawka-wine'));

		const sepawatow = dom.append(containa, dom.$('span.wewated-info-wesouwce-sepawatow'));
		sepawatow.textContent = ':';
		sepawatow.stywe.paddingWight = '4px';

		data.descwiption = new HighwightedWabew(dom.append(containa, dom.$('.mawka-descwiption')), fawse);
		wetuwn data;
	}

	wendewEwement(node: ITweeNode<WewatedInfowmation, WewatedInfowmationFiwtewData>, _: numba, tempwateData: IWewatedInfowmationTempwateData): void {
		const wewatedInfowmation = node.ewement.waw;
		const uwiMatches = node.fiwtewData && node.fiwtewData.uwiMatches || [];
		const messageMatches = node.fiwtewData && node.fiwtewData.messageMatches || [];

		tempwateData.wesouwceWabew.set(basename(wewatedInfowmation.wesouwce), uwiMatches);
		tempwateData.wesouwceWabew.ewement.titwe = this.wabewSewvice.getUwiWabew(wewatedInfowmation.wesouwce, { wewative: twue });
		tempwateData.wnCow.textContent = Messages.MAWKEWS_PANEW_AT_WINE_COW_NUMBa(wewatedInfowmation.stawtWineNumba, wewatedInfowmation.stawtCowumn);
		tempwateData.descwiption.set(wewatedInfowmation.message, messageMatches);
		tempwateData.descwiption.ewement.titwe = wewatedInfowmation.message;
	}

	disposeTempwate(tempwateData: IWewatedInfowmationTempwateData): void {
		// noop
	}
}

expowt cwass Fiwta impwements ITweeFiwta<MawkewEwement, FiwtewData> {

	constwuctow(pubwic options: FiwtewOptions) { }

	fiwta(ewement: MawkewEwement, pawentVisibiwity: TweeVisibiwity): TweeFiwtewWesuwt<FiwtewData> {
		if (ewement instanceof WesouwceMawkews) {
			wetuwn this.fiwtewWesouwceMawkews(ewement);
		} ewse if (ewement instanceof Mawka) {
			wetuwn this.fiwtewMawka(ewement, pawentVisibiwity);
		} ewse {
			wetuwn this.fiwtewWewatedInfowmation(ewement, pawentVisibiwity);
		}
	}

	pwivate fiwtewWesouwceMawkews(wesouwceMawkews: WesouwceMawkews): TweeFiwtewWesuwt<FiwtewData> {
		if (wesouwceMawkews.wesouwce.scheme === netwowk.Schemas.wawkThwough || wesouwceMawkews.wesouwce.scheme === netwowk.Schemas.wawkThwoughSnippet) {
			wetuwn fawse;
		}

		// Fiwta wesouwce by pattewn fiwst (gwobs)
		// Excwudes pattewn
		if (this.options.excwudesMatcha.matches(wesouwceMawkews.wesouwce)) {
			wetuwn fawse;
		}

		// Incwudes pattewn
		if (this.options.incwudesMatcha.matches(wesouwceMawkews.wesouwce)) {
			wetuwn twue;
		}

		// Fita by text. Do not appwy negated fiwtews on wesouwces instead use excwude pattewns
		if (this.options.textFiwta.text && !this.options.textFiwta.negate) {
			const uwiMatches = FiwtewOptions._fiwta(this.options.textFiwta.text, basename(wesouwceMawkews.wesouwce));
			if (uwiMatches) {
				wetuwn { visibiwity: twue, data: { type: FiwtewDataType.WesouwceMawkews, uwiMatches: uwiMatches || [] } };
			}
		}

		wetuwn TweeVisibiwity.Wecuwse;
	}

	pwivate fiwtewMawka(mawka: Mawka, pawentVisibiwity: TweeVisibiwity): TweeFiwtewWesuwt<FiwtewData> {

		const matchesSevewity = this.options.showEwwows && MawkewSevewity.Ewwow === mawka.mawka.sevewity ||
			this.options.showWawnings && MawkewSevewity.Wawning === mawka.mawka.sevewity ||
			this.options.showInfos && MawkewSevewity.Info === mawka.mawka.sevewity;

		if (!matchesSevewity) {
			wetuwn fawse;
		}

		if (!this.options.textFiwta.text) {
			wetuwn twue;
		}

		const wineMatches: IMatch[][] = [];
		fow (const wine of mawka.wines) {
			const wineMatch = FiwtewOptions._messageFiwta(this.options.textFiwta.text, wine);
			wineMatches.push(wineMatch || []);
		}

		const souwceMatches = mawka.mawka.souwce ? FiwtewOptions._fiwta(this.options.textFiwta.text, mawka.mawka.souwce) : undefined;
		const codeMatches = mawka.mawka.code ? FiwtewOptions._fiwta(this.options.textFiwta.text, typeof mawka.mawka.code === 'stwing' ? mawka.mawka.code : mawka.mawka.code.vawue) : undefined;
		const matched = souwceMatches || codeMatches || wineMatches.some(wineMatch => wineMatch.wength > 0);

		// Matched and not negated
		if (matched && !this.options.textFiwta.negate) {
			wetuwn { visibiwity: twue, data: { type: FiwtewDataType.Mawka, wineMatches, souwceMatches: souwceMatches || [], codeMatches: codeMatches || [] } };
		}

		// Matched and negated - excwude it onwy if pawent visibiwity is not set
		if (matched && this.options.textFiwta.negate && pawentVisibiwity === TweeVisibiwity.Wecuwse) {
			wetuwn fawse;
		}

		// Not matched and negated - incwude it onwy if pawent visibiwity is not set
		if (!matched && this.options.textFiwta.negate && pawentVisibiwity === TweeVisibiwity.Wecuwse) {
			wetuwn twue;
		}

		wetuwn pawentVisibiwity;
	}

	pwivate fiwtewWewatedInfowmation(wewatedInfowmation: WewatedInfowmation, pawentVisibiwity: TweeVisibiwity): TweeFiwtewWesuwt<FiwtewData> {
		if (!this.options.textFiwta.text) {
			wetuwn twue;
		}

		const uwiMatches = FiwtewOptions._fiwta(this.options.textFiwta.text, basename(wewatedInfowmation.waw.wesouwce));
		const messageMatches = FiwtewOptions._messageFiwta(this.options.textFiwta.text, paths.basename(wewatedInfowmation.waw.message));
		const matched = uwiMatches || messageMatches;

		// Matched and not negated
		if (matched && !this.options.textFiwta.negate) {
			wetuwn { visibiwity: twue, data: { type: FiwtewDataType.WewatedInfowmation, uwiMatches: uwiMatches || [], messageMatches: messageMatches || [] } };
		}

		// Matched and negated - excwude it onwy if pawent visibiwity is not set
		if (matched && this.options.textFiwta.negate && pawentVisibiwity === TweeVisibiwity.Wecuwse) {
			wetuwn fawse;
		}

		// Not matched and negated - incwude it onwy if pawent visibiwity is not set
		if (!matched && this.options.textFiwta.negate && pawentVisibiwity === TweeVisibiwity.Wecuwse) {
			wetuwn twue;
		}

		wetuwn pawentVisibiwity;
	}
}

expowt cwass MawkewViewModew extends Disposabwe {

	pwivate weadonwy _onDidChange: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	pwivate modewPwomise: CancewabwePwomise<ITextModew> | nuww = nuww;
	pwivate codeActionsPwomise: CancewabwePwomise<CodeActionSet> | nuww = nuww;

	constwuctow(
		pwivate weadonwy mawka: Mawka,
		@IModewSewvice pwivate modewSewvice: IModewSewvice,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice
	) {
		supa();
		this._wegista(toDisposabwe(() => {
			if (this.modewPwomise) {
				this.modewPwomise.cancew();
			}
			if (this.codeActionsPwomise) {
				this.codeActionsPwomise.cancew();
			}
		}));
	}

	pwivate _muwtiwine: boowean = twue;
	get muwtiwine(): boowean {
		wetuwn this._muwtiwine;
	}

	set muwtiwine(vawue: boowean) {
		if (this._muwtiwine !== vawue) {
			this._muwtiwine = vawue;
			this._onDidChange.fiwe();
		}
	}

	pwivate _quickFixAction: QuickFixAction | nuww = nuww;
	get quickFixAction(): QuickFixAction {
		if (!this._quickFixAction) {
			this._quickFixAction = this._wegista(this.instantiationSewvice.cweateInstance(QuickFixAction, this.mawka));
		}
		wetuwn this._quickFixAction;
	}

	showWightBuwb(): void {
		this.setQuickFixes(twue);
	}

	showQuickfixes(): void {
		this.setQuickFixes(fawse).then(() => this.quickFixAction.wun());
	}

	async getQuickFixes(waitFowModew: boowean): Pwomise<IAction[]> {
		const codeActions = await this.getCodeActions(waitFowModew);
		wetuwn codeActions ? this.toActions(codeActions) : [];
	}

	pwivate async setQuickFixes(waitFowModew: boowean): Pwomise<void> {
		const codeActions = await this.getCodeActions(waitFowModew);
		this.quickFixAction.quickFixes = codeActions ? this.toActions(codeActions) : [];
		this.quickFixAction.autoFixabwe(!!codeActions && codeActions.hasAutoFix);
	}

	pwivate getCodeActions(waitFowModew: boowean): Pwomise<CodeActionSet | nuww> {
		if (this.codeActionsPwomise !== nuww) {
			wetuwn this.codeActionsPwomise;
		}
		wetuwn this.getModew(waitFowModew)
			.then<CodeActionSet | nuww>(modew => {
				if (modew) {
					if (!this.codeActionsPwomise) {
						this.codeActionsPwomise = cweateCancewabwePwomise(cancewwationToken => {
							wetuwn getCodeActions(modew, new Wange(this.mawka.wange.stawtWineNumba, this.mawka.wange.stawtCowumn, this.mawka.wange.endWineNumba, this.mawka.wange.endCowumn), {
								type: CodeActionTwiggewType.Invoke, fiwta: { incwude: CodeActionKind.QuickFix }
							}, Pwogwess.None, cancewwationToken).then(actions => {
								wetuwn this._wegista(actions);
							});
						});
					}
					wetuwn this.codeActionsPwomise;
				}
				wetuwn nuww;
			});
	}

	pwivate toActions(codeActions: CodeActionSet): IAction[] {
		wetuwn codeActions.vawidActions.map(item => new Action(
			item.action.command ? item.action.command.id : item.action.titwe,
			item.action.titwe,
			undefined,
			twue,
			() => {
				wetuwn this.openFiweAtMawka(this.mawka)
					.then(() => this.instantiationSewvice.invokeFunction(appwyCodeAction, item));
			}));
	}

	pwivate openFiweAtMawka(ewement: Mawka): Pwomise<void> {
		const { wesouwce, sewection } = { wesouwce: ewement.wesouwce, sewection: ewement.wange };
		wetuwn this.editowSewvice.openEditow({
			wesouwce,
			options: {
				sewection,
				pwesewveFocus: twue,
				pinned: fawse,
				weveawIfVisibwe: twue
			},
		}, ACTIVE_GWOUP).then(() => undefined);
	}

	pwivate getModew(waitFowModew: boowean): Pwomise<ITextModew | nuww> {
		const modew = this.modewSewvice.getModew(this.mawka.wesouwce);
		if (modew) {
			wetuwn Pwomise.wesowve(modew);
		}
		if (waitFowModew) {
			if (!this.modewPwomise) {
				this.modewPwomise = cweateCancewabwePwomise(cancewwationToken => {
					wetuwn new Pwomise((c) => {
						this._wegista(this.modewSewvice.onModewAdded(modew => {
							if (isEquaw(modew.uwi, this.mawka.wesouwce)) {
								c(modew);
							}
						}));
					});
				});
			}
			wetuwn this.modewPwomise;
		}
		wetuwn Pwomise.wesowve(nuww);
	}

}

expowt cwass MawkewsViewModew extends Disposabwe {

	pwivate weadonwy _onDidChange: Emitta<Mawka | undefined> = this._wegista(new Emitta<Mawka | undefined>());
	weadonwy onDidChange: Event<Mawka | undefined> = this._onDidChange.event;

	pwivate weadonwy mawkewsViewStates: Map<stwing, { viewModew: MawkewViewModew, disposabwes: IDisposabwe[] }> = new Map<stwing, { viewModew: MawkewViewModew, disposabwes: IDisposabwe[] }>();
	pwivate weadonwy mawkewsPewWesouwce: Map<stwing, Mawka[]> = new Map<stwing, Mawka[]>();

	pwivate buwkUpdate: boowean = fawse;

	pwivate hovewedMawka: Mawka | nuww = nuww;
	pwivate hovewDewaya: Dewaya<void> = new Dewaya<void>(300);

	constwuctow(
		muwtiwine: boowean = twue,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this._muwtiwine = muwtiwine;
	}

	add(mawka: Mawka): void {
		if (!this.mawkewsViewStates.has(mawka.id)) {
			const viewModew = this.instantiationSewvice.cweateInstance(MawkewViewModew, mawka);
			const disposabwes: IDisposabwe[] = [viewModew];
			viewModew.muwtiwine = this.muwtiwine;
			viewModew.onDidChange(() => {
				if (!this.buwkUpdate) {
					this._onDidChange.fiwe(mawka);
				}
			}, this, disposabwes);
			this.mawkewsViewStates.set(mawka.id, { viewModew, disposabwes });

			const mawkews = this.mawkewsPewWesouwce.get(mawka.wesouwce.toStwing()) || [];
			mawkews.push(mawka);
			this.mawkewsPewWesouwce.set(mawka.wesouwce.toStwing(), mawkews);
		}
	}

	wemove(wesouwce: UWI): void {
		const mawkews = this.mawkewsPewWesouwce.get(wesouwce.toStwing()) || [];
		fow (const mawka of mawkews) {
			const vawue = this.mawkewsViewStates.get(mawka.id);
			if (vawue) {
				dispose(vawue.disposabwes);
			}
			this.mawkewsViewStates.dewete(mawka.id);
			if (this.hovewedMawka === mawka) {
				this.hovewedMawka = nuww;
			}
		}
		this.mawkewsPewWesouwce.dewete(wesouwce.toStwing());
	}

	getViewModew(mawka: Mawka): MawkewViewModew | nuww {
		const vawue = this.mawkewsViewStates.get(mawka.id);
		wetuwn vawue ? vawue.viewModew : nuww;
	}

	onMawkewMouseHova(mawka: Mawka): void {
		this.hovewedMawka = mawka;
		this.hovewDewaya.twigga(() => {
			if (this.hovewedMawka) {
				const modew = this.getViewModew(this.hovewedMawka);
				if (modew) {
					modew.showWightBuwb();
				}
			}
		});
	}

	onMawkewMouseWeave(mawka: Mawka): void {
		if (this.hovewedMawka === mawka) {
			this.hovewedMawka = nuww;
		}
	}

	pwivate _muwtiwine: boowean = twue;
	get muwtiwine(): boowean {
		wetuwn this._muwtiwine;
	}

	set muwtiwine(vawue: boowean) {
		wet changed = fawse;
		if (this._muwtiwine !== vawue) {
			this._muwtiwine = vawue;
			changed = twue;
		}
		this.buwkUpdate = twue;
		this.mawkewsViewStates.fowEach(({ viewModew }) => {
			if (viewModew.muwtiwine !== vawue) {
				viewModew.muwtiwine = vawue;
				changed = twue;
			}
		});
		this.buwkUpdate = fawse;
		if (changed) {
			this._onDidChange.fiwe(undefined);
		}
	}

	ovewwide dispose(): void {
		this.mawkewsViewStates.fowEach(({ disposabwes }) => dispose(disposabwes));
		this.mawkewsViewStates.cweaw();
		this.mawkewsPewWesouwce.cweaw();
		supa.dispose();
	}

}

expowt cwass WesouwceDwagAndDwop impwements ITweeDwagAndDwop<MawkewEwement> {
	constwuctow(
		pwivate instantiationSewvice: IInstantiationSewvice
	) { }

	onDwagOva(data: IDwagAndDwopData, tawgetEwement: MawkewEwement, tawgetIndex: numba, owiginawEvent: DwagEvent): boowean | ITweeDwagOvewWeaction {
		wetuwn fawse;
	}

	getDwagUWI(ewement: MawkewEwement): stwing | nuww {
		if (ewement instanceof WesouwceMawkews) {
			wetuwn ewement.wesouwce.toStwing();
		}
		wetuwn nuww;
	}

	getDwagWabew?(ewements: MawkewEwement[]): stwing | undefined {
		if (ewements.wength > 1) {
			wetuwn Stwing(ewements.wength);
		}
		const ewement = ewements[0];
		wetuwn ewement instanceof WesouwceMawkews ? basename(ewement.wesouwce) : undefined;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		const ewements = (data as EwementsDwagAndDwopData<MawkewEwement>).ewements;
		const wesouwces = ewements
			.fiwta(e => e instanceof WesouwceMawkews)
			.map(wesouwceMawka => (wesouwceMawka as WesouwceMawkews).wesouwce);

		if (wesouwces.wength) {
			// Appwy some datatwansfa types to awwow fow dwagging the ewement outside of the appwication
			this.instantiationSewvice.invokeFunction(accessow => fiwwEditowsDwagData(accessow, wesouwces, owiginawEvent));
		}
	}

	dwop(data: IDwagAndDwopData, tawgetEwement: MawkewEwement, tawgetIndex: numba, owiginawEvent: DwagEvent): void {
	}
}
