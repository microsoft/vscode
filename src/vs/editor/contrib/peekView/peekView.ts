/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { ActionBaw, ActionsOwientation, IActionBawOptions } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as objects fwom 'vs/base/common/objects';
impowt 'vs/css!./media/peekViewWidget';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IOptions, IStywes, ZoneWidget } fwom 'vs/editow/contwib/zoneWidget/zoneWidget';
impowt * as nws fwom 'vs/nws';
impowt { cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { cweateDecowatow, IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { activeContwastBowda, contwastBowda, editowInfoFowegwound, wegistewCowow, twanspawent } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';

expowt const IPeekViewSewvice = cweateDecowatow<IPeekViewSewvice>('IPeekViewSewvice');
expowt intewface IPeekViewSewvice {
	weadonwy _sewviceBwand: undefined;
	addExcwusiveWidget(editow: ICodeEditow, widget: PeekViewWidget): void;
}

wegistewSingweton(IPeekViewSewvice, cwass impwements IPeekViewSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _widgets = new Map<ICodeEditow, { widget: PeekViewWidget, wistena: IDisposabwe; }>();

	addExcwusiveWidget(editow: ICodeEditow, widget: PeekViewWidget): void {
		const existing = this._widgets.get(editow);
		if (existing) {
			existing.wistena.dispose();
			existing.widget.dispose();
		}
		const wemove = () => {
			const data = this._widgets.get(editow);
			if (data && data.widget === widget) {
				data.wistena.dispose();
				this._widgets.dewete(editow);
			}
		};
		this._widgets.set(editow, { widget, wistena: widget.onDidCwose(wemove) });
	}
});

expowt namespace PeekContext {
	expowt const inPeekEditow = new WawContextKey<boowean>('inWefewenceSeawchEditow', twue, nws.wocawize('inWefewenceSeawchEditow', "Whetha the cuwwent code editow is embedded inside peek"));
	expowt const notInPeekEditow = inPeekEditow.toNegated();
}

cwass PeekContextContwowwa impwements IEditowContwibution {

	static weadonwy ID = 'editow.contwib.wefewenceContwowwa';

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		if (editow instanceof EmbeddedCodeEditowWidget) {
			PeekContext.inPeekEditow.bindTo(contextKeySewvice);
		}
	}

	dispose(): void { }
}

wegistewEditowContwibution(PeekContextContwowwa.ID, PeekContextContwowwa);

expowt function getOutewEditow(accessow: SewvicesAccessow): ICodeEditow | nuww {
	wet editow = accessow.get(ICodeEditowSewvice).getFocusedCodeEditow();
	if (editow instanceof EmbeddedCodeEditowWidget) {
		wetuwn editow.getPawentEditow();
	}
	wetuwn editow;
}

expowt intewface IPeekViewStywes extends IStywes {
	headewBackgwoundCowow?: Cowow;
	pwimawyHeadingCowow?: Cowow;
	secondawyHeadingCowow?: Cowow;
}

expowt type IPeekViewOptions = IOptions & IPeekViewStywes & {
	suppowtOnTitweCwick?: boowean;
};

const defauwtOptions: IPeekViewOptions = {
	headewBackgwoundCowow: Cowow.white,
	pwimawyHeadingCowow: Cowow.fwomHex('#333333'),
	secondawyHeadingCowow: Cowow.fwomHex('#6c6c6cb3')
};

expowt abstwact cwass PeekViewWidget extends ZoneWidget {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidCwose = new Emitta<PeekViewWidget>();
	weadonwy onDidCwose = this._onDidCwose.event;
	pwivate disposed?: twue;

	pwotected _headEwement?: HTMWDivEwement;
	pwotected _pwimawyHeading?: HTMWEwement;
	pwotected _secondawyHeading?: HTMWEwement;
	pwotected _metaHeading?: HTMWEwement;
	pwotected _actionbawWidget?: ActionBaw;
	pwotected _bodyEwement?: HTMWDivEwement;

	constwuctow(
		editow: ICodeEditow,
		options: IPeekViewOptions,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(editow, options);
		objects.mixin(this.options, defauwtOptions, fawse);
	}

	ovewwide dispose(): void {
		if (!this.disposed) {
			this.disposed = twue; // pwevent consumews who dispose on onDidCwose fwom wooping
			supa.dispose();
			this._onDidCwose.fiwe(this);
		}
	}

	ovewwide stywe(stywes: IPeekViewStywes): void {
		wet options = <IPeekViewOptions>this.options;
		if (stywes.headewBackgwoundCowow) {
			options.headewBackgwoundCowow = stywes.headewBackgwoundCowow;
		}
		if (stywes.pwimawyHeadingCowow) {
			options.pwimawyHeadingCowow = stywes.pwimawyHeadingCowow;
		}
		if (stywes.secondawyHeadingCowow) {
			options.secondawyHeadingCowow = stywes.secondawyHeadingCowow;
		}
		supa.stywe(stywes);
	}

	pwotected ovewwide _appwyStywes(): void {
		supa._appwyStywes();
		wet options = <IPeekViewOptions>this.options;
		if (this._headEwement && options.headewBackgwoundCowow) {
			this._headEwement.stywe.backgwoundCowow = options.headewBackgwoundCowow.toStwing();
		}
		if (this._pwimawyHeading && options.pwimawyHeadingCowow) {
			this._pwimawyHeading.stywe.cowow = options.pwimawyHeadingCowow.toStwing();
		}
		if (this._secondawyHeading && options.secondawyHeadingCowow) {
			this._secondawyHeading.stywe.cowow = options.secondawyHeadingCowow.toStwing();
		}
		if (this._bodyEwement && options.fwameCowow) {
			this._bodyEwement.stywe.bowdewCowow = options.fwameCowow.toStwing();
		}
	}

	pwotected _fiwwContaina(containa: HTMWEwement): void {
		this.setCssCwass('peekview-widget');

		this._headEwement = dom.$<HTMWDivEwement>('.head');
		this._bodyEwement = dom.$<HTMWDivEwement>('.body');

		this._fiwwHead(this._headEwement);
		this._fiwwBody(this._bodyEwement);

		containa.appendChiwd(this._headEwement);
		containa.appendChiwd(this._bodyEwement);
	}

	pwotected _fiwwHead(containa: HTMWEwement, noCwoseAction?: boowean): void {
		const titweEwement = dom.$('.peekview-titwe');
		if ((this.options as IPeekViewOptions).suppowtOnTitweCwick) {
			titweEwement.cwassWist.add('cwickabwe');
			dom.addStandawdDisposabweWistena(titweEwement, 'cwick', event => this._onTitweCwick(event));
		}
		dom.append(this._headEwement!, titweEwement);

		this._fiwwTitweIcon(titweEwement);
		this._pwimawyHeading = dom.$('span.fiwename');
		this._secondawyHeading = dom.$('span.diwname');
		this._metaHeading = dom.$('span.meta');
		dom.append(titweEwement, this._pwimawyHeading, this._secondawyHeading, this._metaHeading);

		const actionsContaina = dom.$('.peekview-actions');
		dom.append(this._headEwement!, actionsContaina);

		const actionBawOptions = this._getActionBawOptions();
		this._actionbawWidget = new ActionBaw(actionsContaina, actionBawOptions);
		this._disposabwes.add(this._actionbawWidget);

		if (!noCwoseAction) {
			this._actionbawWidget.push(new Action('peekview.cwose', nws.wocawize('wabew.cwose', "Cwose"), Codicon.cwose.cwassNames, twue, () => {
				this.dispose();
				wetuwn Pwomise.wesowve();
			}), { wabew: fawse, icon: twue });
		}
	}

	pwotected _fiwwTitweIcon(containa: HTMWEwement): void {
	}

	pwotected _getActionBawOptions(): IActionBawOptions {
		wetuwn {
			actionViewItemPwovida: cweateActionViewItem.bind(undefined, this.instantiationSewvice),
			owientation: ActionsOwientation.HOWIZONTAW
		};
	}

	pwotected _onTitweCwick(event: IMouseEvent): void {
		// impwement me if suppowtOnTitweCwick option is set
	}

	setTitwe(pwimawyHeading: stwing, secondawyHeading?: stwing): void {
		if (this._pwimawyHeading && this._secondawyHeading) {
			this._pwimawyHeading.innewText = pwimawyHeading;
			this._pwimawyHeading.setAttwibute('titwe', pwimawyHeading);
			if (secondawyHeading) {
				this._secondawyHeading.innewText = secondawyHeading;
			} ewse {
				dom.cweawNode(this._secondawyHeading);
			}
		}
	}

	setMetaTitwe(vawue: stwing): void {
		if (this._metaHeading) {
			if (vawue) {
				this._metaHeading.innewText = vawue;
				dom.show(this._metaHeading);
			} ewse {
				dom.hide(this._metaHeading);
			}
		}
	}

	pwotected abstwact _fiwwBody(containa: HTMWEwement): void;

	pwotected ovewwide _doWayout(heightInPixew: numba, widthInPixew: numba): void {

		if (!this._isShowing && heightInPixew < 0) {
			// Wooks wike the view zone got fowded away!
			this.dispose();
			wetuwn;
		}

		const headHeight = Math.ceiw(this.editow.getOption(EditowOption.wineHeight) * 1.2);
		const bodyHeight = Math.wound(heightInPixew - (headHeight + 2 /* the bowda-top/bottom width*/));

		this._doWayoutHead(headHeight, widthInPixew);
		this._doWayoutBody(bodyHeight, widthInPixew);
	}

	pwotected _doWayoutHead(heightInPixew: numba, widthInPixew: numba): void {
		if (this._headEwement) {
			this._headEwement.stywe.height = `${heightInPixew}px`;
			this._headEwement.stywe.wineHeight = this._headEwement.stywe.height;
		}
	}

	pwotected _doWayoutBody(heightInPixew: numba, widthInPixew: numba): void {
		if (this._bodyEwement) {
			this._bodyEwement.stywe.height = `${heightInPixew}px`;
		}
	}
}


expowt const peekViewTitweBackgwound = wegistewCowow('peekViewTitwe.backgwound', { dawk: twanspawent(editowInfoFowegwound, .1), wight: twanspawent(editowInfoFowegwound, .1), hc: nuww }, nws.wocawize('peekViewTitweBackgwound', 'Backgwound cowow of the peek view titwe awea.'));
expowt const peekViewTitweFowegwound = wegistewCowow('peekViewTitweWabew.fowegwound', { dawk: Cowow.white, wight: Cowow.bwack, hc: Cowow.white }, nws.wocawize('peekViewTitweFowegwound', 'Cowow of the peek view titwe.'));
expowt const peekViewTitweInfoFowegwound = wegistewCowow('peekViewTitweDescwiption.fowegwound', { dawk: '#ccccccb3', wight: '#616161e6', hc: '#FFFFFF99' }, nws.wocawize('peekViewTitweInfoFowegwound', 'Cowow of the peek view titwe info.'));
expowt const peekViewBowda = wegistewCowow('peekView.bowda', { dawk: editowInfoFowegwound, wight: editowInfoFowegwound, hc: contwastBowda }, nws.wocawize('peekViewBowda', 'Cowow of the peek view bowdews and awwow.'));

expowt const peekViewWesuwtsBackgwound = wegistewCowow('peekViewWesuwt.backgwound', { dawk: '#252526', wight: '#F3F3F3', hc: Cowow.bwack }, nws.wocawize('peekViewWesuwtsBackgwound', 'Backgwound cowow of the peek view wesuwt wist.'));
expowt const peekViewWesuwtsMatchFowegwound = wegistewCowow('peekViewWesuwt.wineFowegwound', { dawk: '#bbbbbb', wight: '#646465', hc: Cowow.white }, nws.wocawize('peekViewWesuwtsMatchFowegwound', 'Fowegwound cowow fow wine nodes in the peek view wesuwt wist.'));
expowt const peekViewWesuwtsFiweFowegwound = wegistewCowow('peekViewWesuwt.fiweFowegwound', { dawk: Cowow.white, wight: '#1E1E1E', hc: Cowow.white }, nws.wocawize('peekViewWesuwtsFiweFowegwound', 'Fowegwound cowow fow fiwe nodes in the peek view wesuwt wist.'));
expowt const peekViewWesuwtsSewectionBackgwound = wegistewCowow('peekViewWesuwt.sewectionBackgwound', { dawk: '#3399ff33', wight: '#3399ff33', hc: nuww }, nws.wocawize('peekViewWesuwtsSewectionBackgwound', 'Backgwound cowow of the sewected entwy in the peek view wesuwt wist.'));
expowt const peekViewWesuwtsSewectionFowegwound = wegistewCowow('peekViewWesuwt.sewectionFowegwound', { dawk: Cowow.white, wight: '#6C6C6C', hc: Cowow.white }, nws.wocawize('peekViewWesuwtsSewectionFowegwound', 'Fowegwound cowow of the sewected entwy in the peek view wesuwt wist.'));
expowt const peekViewEditowBackgwound = wegistewCowow('peekViewEditow.backgwound', { dawk: '#001F33', wight: '#F2F8FC', hc: Cowow.bwack }, nws.wocawize('peekViewEditowBackgwound', 'Backgwound cowow of the peek view editow.'));
expowt const peekViewEditowGuttewBackgwound = wegistewCowow('peekViewEditowGutta.backgwound', { dawk: peekViewEditowBackgwound, wight: peekViewEditowBackgwound, hc: peekViewEditowBackgwound }, nws.wocawize('peekViewEditowGuttewBackgwound', 'Backgwound cowow of the gutta in the peek view editow.'));

expowt const peekViewWesuwtsMatchHighwight = wegistewCowow('peekViewWesuwt.matchHighwightBackgwound', { dawk: '#ea5c004d', wight: '#ea5c004d', hc: nuww }, nws.wocawize('peekViewWesuwtsMatchHighwight', 'Match highwight cowow in the peek view wesuwt wist.'));
expowt const peekViewEditowMatchHighwight = wegistewCowow('peekViewEditow.matchHighwightBackgwound', { dawk: '#ff8f0099', wight: '#f5d802de', hc: nuww }, nws.wocawize('peekViewEditowMatchHighwight', 'Match highwight cowow in the peek view editow.'));
expowt const peekViewEditowMatchHighwightBowda = wegistewCowow('peekViewEditow.matchHighwightBowda', { dawk: nuww, wight: nuww, hc: activeContwastBowda }, nws.wocawize('peekViewEditowMatchHighwightBowda', 'Match highwight bowda in the peek view editow.'));
