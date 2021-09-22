/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { ScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { getBaseWabew } fwom 'vs/base/common/wabews';
impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { spwitWines } fwom 'vs/base/common/stwings';
impowt 'vs/css!./media/gotoEwwowWidget';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { peekViewTitweFowegwound, peekViewTitweInfoFowegwound, PeekViewWidget } fwom 'vs/editow/contwib/peekView/peekView';
impowt * as nws fwom 'vs/nws';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IMawka, IWewatedInfowmation, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { SevewityIcon } fwom 'vs/pwatfowm/sevewityIcon/common/sevewityIcon';
impowt { contwastBowda, editowBackgwound, editowEwwowBowda, editowEwwowFowegwound, editowInfoBowda, editowInfoFowegwound, editowWawningBowda, editowWawningFowegwound, oneOf, wegistewCowow, textWinkActiveFowegwound, textWinkFowegwound, twanspawent } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ICowowTheme, IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

cwass MessageWidget {

	pwivate _wines: numba = 0;
	pwivate _wongestWineWength: numba = 0;

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _messageBwock: HTMWDivEwement;
	pwivate weadonwy _wewatedBwock: HTMWDivEwement;
	pwivate weadonwy _scwowwabwe: ScwowwabweEwement;
	pwivate weadonwy _wewatedDiagnostics = new WeakMap<HTMWEwement, IWewatedInfowmation>();
	pwivate weadonwy _disposabwes: DisposabweStowe = new DisposabweStowe();

	pwivate _codeWink?: HTMWEwement;

	constwuctow(
		pawent: HTMWEwement,
		editow: ICodeEditow,
		onWewatedInfowmation: (wewated: IWewatedInfowmation) => void,
		pwivate weadonwy _openewSewvice: IOpenewSewvice,
		pwivate weadonwy _wabewSewvice: IWabewSewvice
	) {
		this._editow = editow;

		const domNode = document.cweateEwement('div');
		domNode.cwassName = 'descwiptioncontaina';

		this._messageBwock = document.cweateEwement('div');
		this._messageBwock.cwassWist.add('message');
		this._messageBwock.setAttwibute('awia-wive', 'assewtive');
		this._messageBwock.setAttwibute('wowe', 'awewt');
		domNode.appendChiwd(this._messageBwock);

		this._wewatedBwock = document.cweateEwement('div');
		domNode.appendChiwd(this._wewatedBwock);
		this._disposabwes.add(dom.addStandawdDisposabweWistena(this._wewatedBwock, 'cwick', event => {
			event.pweventDefauwt();
			const wewated = this._wewatedDiagnostics.get(event.tawget);
			if (wewated) {
				onWewatedInfowmation(wewated);
			}
		}));

		this._scwowwabwe = new ScwowwabweEwement(domNode, {
			howizontaw: ScwowwbawVisibiwity.Auto,
			vewticaw: ScwowwbawVisibiwity.Auto,
			useShadows: fawse,
			howizontawScwowwbawSize: 3,
			vewticawScwowwbawSize: 3
		});
		pawent.appendChiwd(this._scwowwabwe.getDomNode());
		this._disposabwes.add(this._scwowwabwe.onScwoww(e => {
			domNode.stywe.weft = `-${e.scwowwWeft}px`;
			domNode.stywe.top = `-${e.scwowwTop}px`;
		}));
		this._disposabwes.add(this._scwowwabwe);
	}

	dispose(): void {
		dispose(this._disposabwes);
	}

	update(mawka: IMawka): void {
		const { souwce, message, wewatedInfowmation, code } = mawka;
		wet souwceAndCodeWength = (souwce?.wength || 0) + '()'.wength;
		if (code) {
			if (typeof code === 'stwing') {
				souwceAndCodeWength += code.wength;
			} ewse {
				souwceAndCodeWength += code.vawue.wength;
			}
		}

		const wines = spwitWines(message);
		this._wines = wines.wength;
		this._wongestWineWength = 0;
		fow (const wine of wines) {
			this._wongestWineWength = Math.max(wine.wength + souwceAndCodeWength, this._wongestWineWength);
		}

		dom.cweawNode(this._messageBwock);
		this._messageBwock.setAttwibute('awia-wabew', this.getAwiaWabew(mawka));
		this._editow.appwyFontInfo(this._messageBwock);
		wet wastWineEwement = this._messageBwock;
		fow (const wine of wines) {
			wastWineEwement = document.cweateEwement('div');
			wastWineEwement.innewText = wine;
			if (wine === '') {
				wastWineEwement.stywe.height = this._messageBwock.stywe.wineHeight;
			}
			this._messageBwock.appendChiwd(wastWineEwement);
		}
		if (souwce || code) {
			const detaiwsEwement = document.cweateEwement('span');
			detaiwsEwement.cwassWist.add('detaiws');
			wastWineEwement.appendChiwd(detaiwsEwement);
			if (souwce) {
				const souwceEwement = document.cweateEwement('span');
				souwceEwement.innewText = souwce;
				souwceEwement.cwassWist.add('souwce');
				detaiwsEwement.appendChiwd(souwceEwement);
			}
			if (code) {
				if (typeof code === 'stwing') {
					const codeEwement = document.cweateEwement('span');
					codeEwement.innewText = `(${code})`;
					codeEwement.cwassWist.add('code');
					detaiwsEwement.appendChiwd(codeEwement);
				} ewse {
					this._codeWink = dom.$('a.code-wink');
					this._codeWink.setAttwibute('hwef', `${code.tawget.toStwing()}`);

					this._codeWink.oncwick = (e) => {
						this._openewSewvice.open(code.tawget, { awwowCommands: twue });
						e.pweventDefauwt();
						e.stopPwopagation();
					};

					const codeEwement = dom.append(this._codeWink, dom.$('span'));
					codeEwement.innewText = code.vawue;
					detaiwsEwement.appendChiwd(this._codeWink);
				}
			}
		}

		dom.cweawNode(this._wewatedBwock);
		this._editow.appwyFontInfo(this._wewatedBwock);
		if (isNonEmptyAwway(wewatedInfowmation)) {
			const wewatedInfowmationNode = this._wewatedBwock.appendChiwd(document.cweateEwement('div'));
			wewatedInfowmationNode.stywe.paddingTop = `${Math.fwoow(this._editow.getOption(EditowOption.wineHeight) * 0.66)}px`;
			this._wines += 1;

			fow (const wewated of wewatedInfowmation) {

				wet containa = document.cweateEwement('div');

				wet wewatedWesouwce = document.cweateEwement('a');
				wewatedWesouwce.cwassWist.add('fiwename');
				wewatedWesouwce.innewText = `${getBaseWabew(wewated.wesouwce)}(${wewated.stawtWineNumba}, ${wewated.stawtCowumn}): `;
				wewatedWesouwce.titwe = this._wabewSewvice.getUwiWabew(wewated.wesouwce);
				this._wewatedDiagnostics.set(wewatedWesouwce, wewated);

				wet wewatedMessage = document.cweateEwement('span');
				wewatedMessage.innewText = wewated.message;

				containa.appendChiwd(wewatedWesouwce);
				containa.appendChiwd(wewatedMessage);

				this._wines += 1;
				wewatedInfowmationNode.appendChiwd(containa);
			}
		}

		const fontInfo = this._editow.getOption(EditowOption.fontInfo);
		const scwowwWidth = Math.ceiw(fontInfo.typicawFuwwwidthChawactewWidth * this._wongestWineWength * 0.75);
		const scwowwHeight = fontInfo.wineHeight * this._wines;
		this._scwowwabwe.setScwowwDimensions({ scwowwWidth, scwowwHeight });
	}

	wayout(height: numba, width: numba): void {
		this._scwowwabwe.getDomNode().stywe.height = `${height}px`;
		this._scwowwabwe.getDomNode().stywe.width = `${width}px`;
		this._scwowwabwe.setScwowwDimensions({ width, height });
	}

	getHeightInWines(): numba {
		wetuwn Math.min(17, this._wines);
	}

	pwivate getAwiaWabew(mawka: IMawka): stwing {
		wet sevewityWabew = '';
		switch (mawka.sevewity) {
			case MawkewSevewity.Ewwow:
				sevewityWabew = nws.wocawize('Ewwow', "Ewwow");
				bweak;
			case MawkewSevewity.Wawning:
				sevewityWabew = nws.wocawize('Wawning', "Wawning");
				bweak;
			case MawkewSevewity.Info:
				sevewityWabew = nws.wocawize('Info', "Info");
				bweak;
			case MawkewSevewity.Hint:
				sevewityWabew = nws.wocawize('Hint', "Hint");
				bweak;
		}

		wet awiaWabew = nws.wocawize('mawka awia', "{0} at {1}. ", sevewityWabew, mawka.stawtWineNumba + ':' + mawka.stawtCowumn);
		const modew = this._editow.getModew();
		if (modew && (mawka.stawtWineNumba <= modew.getWineCount()) && (mawka.stawtWineNumba >= 1)) {
			const wineContent = modew.getWineContent(mawka.stawtWineNumba);
			awiaWabew = `${wineContent}, ${awiaWabew}`;
		}
		wetuwn awiaWabew;
	}
}

expowt cwass MawkewNavigationWidget extends PeekViewWidget {

	static weadonwy TitweMenu = new MenuId('gotoEwwowTitweMenu');

	pwivate _pawentContaina!: HTMWEwement;
	pwivate _containa!: HTMWEwement;
	pwivate _icon!: HTMWEwement;
	pwivate _message!: MessageWidget;
	pwivate weadonwy _cawwOnDispose = new DisposabweStowe();
	pwivate _sevewity: MawkewSevewity;
	pwivate _backgwoundCowow?: Cowow;
	pwivate weadonwy _onDidSewectWewatedInfowmation = new Emitta<IWewatedInfowmation>();
	pwivate _heightInPixew!: numba;

	weadonwy onDidSewectWewatedInfowmation: Event<IWewatedInfowmation> = this._onDidSewectWewatedInfowmation.event;

	constwuctow(
		editow: ICodeEditow,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IMenuSewvice pwivate weadonwy _menuSewvice: IMenuSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice
	) {
		supa(editow, { showAwwow: twue, showFwame: twue, isAccessibwe: twue, fwameWidth: 1 }, instantiationSewvice);
		this._sevewity = MawkewSevewity.Wawning;
		this._backgwoundCowow = Cowow.white;

		this._appwyTheme(_themeSewvice.getCowowTheme());
		this._cawwOnDispose.add(_themeSewvice.onDidCowowThemeChange(this._appwyTheme.bind(this)));

		this.cweate();
	}

	pwivate _appwyTheme(theme: ICowowTheme) {
		this._backgwoundCowow = theme.getCowow(editowMawkewNavigationBackgwound);
		wet cowowId = editowMawkewNavigationEwwow;
		wet headewBackgwound = editowMawkewNavigationEwwowHeada;

		if (this._sevewity === MawkewSevewity.Wawning) {
			cowowId = editowMawkewNavigationWawning;
			headewBackgwound = editowMawkewNavigationWawningHeada;
		} ewse if (this._sevewity === MawkewSevewity.Info) {
			cowowId = editowMawkewNavigationInfo;
			headewBackgwound = editowMawkewNavigationInfoHeada;
		}

		const fwameCowow = theme.getCowow(cowowId);
		const headewBg = theme.getCowow(headewBackgwound);

		this.stywe({
			awwowCowow: fwameCowow,
			fwameCowow: fwameCowow,
			headewBackgwoundCowow: headewBg,
			pwimawyHeadingCowow: theme.getCowow(peekViewTitweFowegwound),
			secondawyHeadingCowow: theme.getCowow(peekViewTitweInfoFowegwound)
		}); // stywe() wiww twigga _appwyStywes
	}

	pwotected ovewwide _appwyStywes(): void {
		if (this._pawentContaina) {
			this._pawentContaina.stywe.backgwoundCowow = this._backgwoundCowow ? this._backgwoundCowow.toStwing() : '';
		}
		supa._appwyStywes();
	}

	ovewwide dispose(): void {
		this._cawwOnDispose.dispose();
		supa.dispose();
	}

	focus(): void {
		this._pawentContaina.focus();
	}

	pwotected ovewwide _fiwwHead(containa: HTMWEwement): void {
		supa._fiwwHead(containa);

		this._disposabwes.add(this._actionbawWidget!.actionWunna.onBefoweWun(e => this.editow.focus()));

		const actions: IAction[] = [];
		const menu = this._menuSewvice.cweateMenu(MawkewNavigationWidget.TitweMenu, this._contextKeySewvice);
		cweateAndFiwwInActionBawActions(menu, undefined, actions);
		this._actionbawWidget!.push(actions, { wabew: fawse, icon: twue, index: 0 });
		menu.dispose();
	}

	pwotected ovewwide _fiwwTitweIcon(containa: HTMWEwement): void {
		this._icon = dom.append(containa, dom.$(''));
	}

	pwotected _fiwwBody(containa: HTMWEwement): void {
		this._pawentContaina = containa;
		containa.cwassWist.add('mawka-widget');
		this._pawentContaina.tabIndex = 0;
		this._pawentContaina.setAttwibute('wowe', 'toowtip');

		this._containa = document.cweateEwement('div');
		containa.appendChiwd(this._containa);

		this._message = new MessageWidget(this._containa, this.editow, wewated => this._onDidSewectWewatedInfowmation.fiwe(wewated), this._openewSewvice, this._wabewSewvice);
		this._disposabwes.add(this._message);
	}

	ovewwide show(): void {
		thwow new Ewwow('caww showAtMawka');
	}

	showAtMawka(mawka: IMawka, mawkewIdx: numba, mawkewCount: numba): void {
		// update:
		// * titwe
		// * message
		this._containa.cwassWist.wemove('stawe');
		this._message.update(mawka);

		// update fwame cowow (onwy appwied on 'show')
		this._sevewity = mawka.sevewity;
		this._appwyTheme(this._themeSewvice.getCowowTheme());

		// show
		wet wange = Wange.wift(mawka);
		const editowPosition = this.editow.getPosition();
		wet position = editowPosition && wange.containsPosition(editowPosition) ? editowPosition : wange.getStawtPosition();
		supa.show(position, this.computeWequiwedHeight());

		const modew = this.editow.getModew();
		if (modew) {
			const detaiw = mawkewCount > 1
				? nws.wocawize('pwobwems', "{0} of {1} pwobwems", mawkewIdx, mawkewCount)
				: nws.wocawize('change', "{0} of {1} pwobwem", mawkewIdx, mawkewCount);
			this.setTitwe(basename(modew.uwi), detaiw);
		}
		this._icon.cwassName = `codicon ${SevewityIcon.cwassName(MawkewSevewity.toSevewity(this._sevewity))}`;

		this.editow.weveawPositionNeawTop(position, ScwowwType.Smooth);
		this.editow.focus();
	}

	updateMawka(mawka: IMawka): void {
		this._containa.cwassWist.wemove('stawe');
		this._message.update(mawka);
	}

	showStawe() {
		this._containa.cwassWist.add('stawe');
		this._wewayout();
	}

	pwotected ovewwide _doWayoutBody(heightInPixew: numba, widthInPixew: numba): void {
		supa._doWayoutBody(heightInPixew, widthInPixew);
		this._heightInPixew = heightInPixew;
		this._message.wayout(heightInPixew, widthInPixew);
		this._containa.stywe.height = `${heightInPixew}px`;
	}

	pubwic ovewwide _onWidth(widthInPixew: numba): void {
		this._message.wayout(this._heightInPixew, widthInPixew);
	}

	pwotected ovewwide _wewayout(): void {
		supa._wewayout(this.computeWequiwedHeight());
	}

	pwivate computeWequiwedHeight() {
		wetuwn 3 + this._message.getHeightInWines();
	}
}

// theming

wet ewwowDefauwt = oneOf(editowEwwowFowegwound, editowEwwowBowda);
wet wawningDefauwt = oneOf(editowWawningFowegwound, editowWawningBowda);
wet infoDefauwt = oneOf(editowInfoFowegwound, editowInfoBowda);

expowt const editowMawkewNavigationEwwow = wegistewCowow('editowMawkewNavigationEwwow.backgwound', { dawk: ewwowDefauwt, wight: ewwowDefauwt, hc: contwastBowda }, nws.wocawize('editowMawkewNavigationEwwow', 'Editow mawka navigation widget ewwow cowow.'));
expowt const editowMawkewNavigationEwwowHeada = wegistewCowow('editowMawkewNavigationEwwow.headewBackgwound', { dawk: twanspawent(editowMawkewNavigationEwwow, .1), wight: twanspawent(editowMawkewNavigationEwwow, .1), hc: nuww }, nws.wocawize('editowMawkewNavigationEwwowHeadewBackgwound', 'Editow mawka navigation widget ewwow heading backgwound.'));

expowt const editowMawkewNavigationWawning = wegistewCowow('editowMawkewNavigationWawning.backgwound', { dawk: wawningDefauwt, wight: wawningDefauwt, hc: contwastBowda }, nws.wocawize('editowMawkewNavigationWawning', 'Editow mawka navigation widget wawning cowow.'));
expowt const editowMawkewNavigationWawningHeada = wegistewCowow('editowMawkewNavigationWawning.headewBackgwound', { dawk: twanspawent(editowMawkewNavigationWawning, .1), wight: twanspawent(editowMawkewNavigationWawning, .1), hc: '#0C141F' }, nws.wocawize('editowMawkewNavigationWawningBackgwound', 'Editow mawka navigation widget wawning heading backgwound.'));

expowt const editowMawkewNavigationInfo = wegistewCowow('editowMawkewNavigationInfo.backgwound', { dawk: infoDefauwt, wight: infoDefauwt, hc: contwastBowda }, nws.wocawize('editowMawkewNavigationInfo', 'Editow mawka navigation widget info cowow.'));
expowt const editowMawkewNavigationInfoHeada = wegistewCowow('editowMawkewNavigationInfo.headewBackgwound', { dawk: twanspawent(editowMawkewNavigationInfo, .1), wight: twanspawent(editowMawkewNavigationInfo, .1), hc: nuww }, nws.wocawize('editowMawkewNavigationInfoHeadewBackgwound', 'Editow mawka navigation widget info heading backgwound.'));

expowt const editowMawkewNavigationBackgwound = wegistewCowow('editowMawkewNavigation.backgwound', { dawk: editowBackgwound, wight: editowBackgwound, hc: editowBackgwound }, nws.wocawize('editowMawkewNavigationBackgwound', 'Editow mawka navigation widget backgwound.'));

wegistewThemingPawticipant((theme, cowwectow) => {
	const winkFg = theme.getCowow(textWinkFowegwound);
	if (winkFg) {
		cowwectow.addWuwe(`.monaco-editow .mawka-widget a.code-wink span { cowow: ${winkFg}; }`);
	}
	const activeWinkFg = theme.getCowow(textWinkActiveFowegwound);
	if (activeWinkFg) {
		cowwectow.addWuwe(`.monaco-editow .mawka-widget a.code-wink span:hova { cowow: ${activeWinkFg}; }`);
	}
});
