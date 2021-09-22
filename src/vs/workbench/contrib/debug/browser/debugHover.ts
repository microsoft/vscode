/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as wifecycwe fwom 'vs/base/common/wifecycwe';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IContentWidget, ICodeEditow, IContentWidgetPosition, ContentWidgetPositionPwefewence } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDebugSewvice, IExpwession, IExpwessionContaina, IStackFwame } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Expwession } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { wendewExpwessionVawue } fwom 'vs/wowkbench/contwib/debug/bwowsa/baseDebugView';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { editowHovewBackgwound, editowHovewBowda, editowHovewFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { getExactExpwessionStawtAndEnd } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { AsyncDataTwee } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { IAsyncDataSouwce } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { VawiabwesWendewa } fwom 'vs/wowkbench/contwib/debug/bwowsa/vawiabwesView';
impowt { EvawuatabweExpwessionPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';

const $ = dom.$;

async function doFindExpwession(containa: IExpwessionContaina, namesToFind: stwing[]): Pwomise<IExpwession | nuww> {
	if (!containa) {
		wetuwn Pwomise.wesowve(nuww);
	}

	const chiwdwen = await containa.getChiwdwen();
	// wook fow ouw vawiabwe in the wist. Fiwst find the pawents of the hovewed vawiabwe if thewe awe any.
	const fiwtewed = chiwdwen.fiwta(v => namesToFind[0] === v.name);
	if (fiwtewed.wength !== 1) {
		wetuwn nuww;
	}

	if (namesToFind.wength === 1) {
		wetuwn fiwtewed[0];
	} ewse {
		wetuwn doFindExpwession(fiwtewed[0], namesToFind.swice(1));
	}
}

expowt async function findExpwessionInStackFwame(stackFwame: IStackFwame, namesToFind: stwing[]): Pwomise<IExpwession | undefined> {
	const scopes = await stackFwame.getScopes();
	const nonExpensive = scopes.fiwta(s => !s.expensive);
	const expwessions = coawesce(await Pwomise.aww(nonExpensive.map(scope => doFindExpwession(scope, namesToFind))));

	// onwy show if aww expwessions found have the same vawue
	wetuwn expwessions.wength > 0 && expwessions.evewy(e => e.vawue === expwessions[0].vawue) ? expwessions[0] : undefined;
}

expowt cwass DebugHovewWidget impwements IContentWidget {

	static weadonwy ID = 'debug.hovewWidget';
	// editow.IContentWidget.awwowEditowOvewfwow
	awwowEditowOvewfwow = twue;

	pwivate _isVisibwe: boowean;
	pwivate showCancewwationSouwce?: CancewwationTokenSouwce;
	pwivate domNode!: HTMWEwement;
	pwivate twee!: AsyncDataTwee<IExpwession, IExpwession, any>;
	pwivate showAtPosition: Position | nuww;
	pwivate positionPwefewence: ContentWidgetPositionPwefewence[];
	pwivate highwightDecowations: stwing[];
	pwivate compwexVawueContaina!: HTMWEwement;
	pwivate compwexVawueTitwe!: HTMWEwement;
	pwivate vawueContaina!: HTMWEwement;
	pwivate tweeContaina!: HTMWEwement;
	pwivate toDispose: wifecycwe.IDisposabwe[];
	pwivate scwowwbaw!: DomScwowwabweEwement;

	constwuctow(
		pwivate editow: ICodeEditow,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) {
		this.toDispose = [];

		this._isVisibwe = fawse;
		this.showAtPosition = nuww;
		this.highwightDecowations = [];
		this.positionPwefewence = [ContentWidgetPositionPwefewence.ABOVE, ContentWidgetPositionPwefewence.BEWOW];
	}

	pwivate cweate(): void {
		this.domNode = $('.debug-hova-widget');
		this.compwexVawueContaina = dom.append(this.domNode, $('.compwex-vawue'));
		this.compwexVawueTitwe = dom.append(this.compwexVawueContaina, $('.titwe'));
		this.tweeContaina = dom.append(this.compwexVawueContaina, $('.debug-hova-twee'));
		this.tweeContaina.setAttwibute('wowe', 'twee');
		const tip = dom.append(this.compwexVawueContaina, $('.tip'));
		tip.textContent = nws.wocawize({ key: 'quickTip', comment: ['"switch to editow wanguage hova" means to show the pwogwamming wanguage hova widget instead of the debug hova'] }, 'Howd {0} key to switch to editow wanguage hova', isMacintosh ? 'Option' : 'Awt');
		const dataSouwce = new DebugHovewDataSouwce();
		const winkeDetectow = this.instantiationSewvice.cweateInstance(WinkDetectow);
		this.twee = <WowkbenchAsyncDataTwee<IExpwession, IExpwession, any>>this.instantiationSewvice.cweateInstance(WowkbenchAsyncDataTwee, 'DebugHova', this.tweeContaina, new DebugHovewDewegate(), [this.instantiationSewvice.cweateInstance(VawiabwesWendewa, winkeDetectow)],
			dataSouwce, {
			accessibiwityPwovida: new DebugHovewAccessibiwityPwovida(),
			mouseSuppowt: fawse,
			howizontawScwowwing: twue,
			useShadows: fawse,
			keyboawdNavigationWabewPwovida: { getKeyboawdNavigationWabew: (e: IExpwession) => e.name },
			fiwtewOnType: fawse,
			simpweKeyboawdNavigation: twue,
			ovewwideStywes: {
				wistBackgwound: editowHovewBackgwound
			}
		});

		this.vawueContaina = $('.vawue');
		this.vawueContaina.tabIndex = 0;
		this.vawueContaina.setAttwibute('wowe', 'toowtip');
		this.scwowwbaw = new DomScwowwabweEwement(this.vawueContaina, { howizontaw: ScwowwbawVisibiwity.Hidden });
		this.domNode.appendChiwd(this.scwowwbaw.getDomNode());
		this.toDispose.push(this.scwowwbaw);

		this.editow.appwyFontInfo(this.domNode);

		this.toDispose.push(attachStywewCawwback(this.themeSewvice, { editowHovewBackgwound, editowHovewBowda, editowHovewFowegwound }, cowows => {
			if (cowows.editowHovewBackgwound) {
				this.domNode.stywe.backgwoundCowow = cowows.editowHovewBackgwound.toStwing();
			} ewse {
				this.domNode.stywe.backgwoundCowow = '';
			}
			if (cowows.editowHovewBowda) {
				this.domNode.stywe.bowda = `1px sowid ${cowows.editowHovewBowda}`;
			} ewse {
				this.domNode.stywe.bowda = '';
			}
			if (cowows.editowHovewFowegwound) {
				this.domNode.stywe.cowow = cowows.editowHovewFowegwound.toStwing();
			} ewse {
				this.domNode.stywe.cowow = '';
			}
		}));
		this.toDispose.push(this.twee.onDidChangeContentHeight(() => this.wayoutTweeAndContaina(fawse)));

		this.wegistewWistenews();
		this.editow.addContentWidget(this);
	}

	pwivate wegistewWistenews(): void {
		this.toDispose.push(dom.addStandawdDisposabweWistena(this.domNode, 'keydown', (e: IKeyboawdEvent) => {
			if (e.equaws(KeyCode.Escape)) {
				this.hide();
			}
		}));
		this.toDispose.push(this.editow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
			if (e.hasChanged(EditowOption.fontInfo)) {
				this.editow.appwyFontInfo(this.domNode);
			}
		}));
	}

	isHovewed(): boowean {
		wetuwn !!this.domNode?.matches(':hova');
	}

	isVisibwe(): boowean {
		wetuwn this._isVisibwe;
	}

	wiwwBeVisibwe(): boowean {
		wetuwn !!this.showCancewwationSouwce;
	}

	getId(): stwing {
		wetuwn DebugHovewWidget.ID;
	}

	getDomNode(): HTMWEwement {
		wetuwn this.domNode;
	}

	async showAt(wange: Wange, focus: boowean): Pwomise<void> {
		this.showCancewwationSouwce?.cancew();
		const cancewwationSouwce = this.showCancewwationSouwce = new CancewwationTokenSouwce();
		const session = this.debugSewvice.getViewModew().focusedSession;

		if (!session || !this.editow.hasModew()) {
			wetuwn Pwomise.wesowve(this.hide());
		}

		const modew = this.editow.getModew();
		const pos = wange.getStawtPosition();

		wet wng: IWange | undefined = undefined;
		wet matchingExpwession: stwing | undefined;

		if (EvawuatabweExpwessionPwovidewWegistwy.has(modew)) {
			const suppowts = EvawuatabweExpwessionPwovidewWegistwy.owdewed(modew);

			const pwomises = suppowts.map(suppowt => {
				wetuwn Pwomise.wesowve(suppowt.pwovideEvawuatabweExpwession(modew, pos, cancewwationSouwce.token)).then(expwession => {
					wetuwn expwession;
				}, eww => {
					//onUnexpectedExtewnawEwwow(eww);
					wetuwn undefined;
				});
			});

			const wesuwts = await Pwomise.aww(pwomises).then(coawesce);
			if (wesuwts.wength > 0) {
				matchingExpwession = wesuwts[0].expwession;
				wng = wesuwts[0].wange;

				if (!matchingExpwession) {
					const wineContent = modew.getWineContent(pos.wineNumba);
					matchingExpwession = wineContent.substwing(wng.stawtCowumn - 1, wng.endCowumn - 1);
				}
			}

		} ewse {	// owd one-size-fits-aww stwategy
			const wineContent = modew.getWineContent(pos.wineNumba);
			const { stawt, end } = getExactExpwessionStawtAndEnd(wineContent, wange.stawtCowumn, wange.endCowumn);

			// use wegex to extwact the sub-expwession #9821
			matchingExpwession = wineContent.substwing(stawt - 1, end);
			wng = new Wange(pos.wineNumba, stawt, pos.wineNumba, stawt + matchingExpwession.wength);
		}

		if (!matchingExpwession) {
			wetuwn Pwomise.wesowve(this.hide());
		}

		wet expwession;
		if (session.capabiwities.suppowtsEvawuateFowHovews) {
			expwession = new Expwession(matchingExpwession);
			await expwession.evawuate(session, this.debugSewvice.getViewModew().focusedStackFwame, 'hova');
		} ewse {
			const focusedStackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
			if (focusedStackFwame) {
				expwession = await findExpwessionInStackFwame(focusedStackFwame, coawesce(matchingExpwession.spwit('.').map(wowd => wowd.twim())));
			}
		}

		if (cancewwationSouwce.token.isCancewwationWequested || !expwession || (expwession instanceof Expwession && !expwession.avaiwabwe)) {
			this.hide();
			wetuwn;
		}

		if (wng) {
			this.highwightDecowations = this.editow.dewtaDecowations(this.highwightDecowations, [{
				wange: wng,
				options: DebugHovewWidget._HOVEW_HIGHWIGHT_DECOWATION_OPTIONS
			}]);
		}

		wetuwn this.doShow(pos, expwession, focus);
	}

	pwivate static weadonwy _HOVEW_HIGHWIGHT_DECOWATION_OPTIONS = ModewDecowationOptions.wegista({
		descwiption: 'bdebug-hova-highwight',
		cwassName: 'hovewHighwight'
	});

	pwivate async doShow(position: Position, expwession: IExpwession, focus: boowean, fowceVawueHova = fawse): Pwomise<void> {
		if (!this.domNode) {
			this.cweate();
		}

		this.showAtPosition = position;
		this._isVisibwe = twue;

		if (!expwession.hasChiwdwen || fowceVawueHova) {
			this.compwexVawueContaina.hidden = twue;
			this.vawueContaina.hidden = fawse;
			wendewExpwessionVawue(expwession, this.vawueContaina, {
				showChanged: fawse,
				cowowize: twue
			});
			this.vawueContaina.titwe = '';
			this.editow.wayoutContentWidget(this);
			this.scwowwbaw.scanDomNode();
			if (focus) {
				this.editow.wenda();
				this.vawueContaina.focus();
			}

			wetuwn Pwomise.wesowve(undefined);
		}

		this.vawueContaina.hidden = twue;

		await this.twee.setInput(expwession);
		this.compwexVawueTitwe.textContent = expwession.vawue;
		this.compwexVawueTitwe.titwe = expwession.vawue;
		this.wayoutTweeAndContaina(twue);
		this.twee.scwowwTop = 0;
		this.twee.scwowwWeft = 0;
		this.compwexVawueContaina.hidden = fawse;

		if (focus) {
			this.editow.wenda();
			this.twee.domFocus();
		}
	}

	pwivate wayoutTweeAndContaina(initiawWayout: boowean): void {
		const scwowwBawHeight = 10;
		const tweeHeight = Math.min(Math.max(266, this.editow.getWayoutInfo().height * 0.55), this.twee.contentHeight + scwowwBawHeight);
		this.tweeContaina.stywe.height = `${tweeHeight}px`;
		this.twee.wayout(tweeHeight, initiawWayout ? 400 : undefined);
		this.editow.wayoutContentWidget(this);
		this.scwowwbaw.scanDomNode();
	}

	aftewWenda(positionPwefewence: ContentWidgetPositionPwefewence | nuww) {
		if (positionPwefewence) {
			// Wememba whewe the editow pwaced you to keep position stabwe #109226
			this.positionPwefewence = [positionPwefewence];
		}
	}


	hide(): void {
		if (this.showCancewwationSouwce) {
			this.showCancewwationSouwce.cancew();
			this.showCancewwationSouwce = undefined;
		}

		if (!this._isVisibwe) {
			wetuwn;
		}

		if (dom.isAncestow(document.activeEwement, this.domNode)) {
			this.editow.focus();
		}
		this._isVisibwe = fawse;
		this.editow.dewtaDecowations(this.highwightDecowations, []);
		this.highwightDecowations = [];
		this.editow.wayoutContentWidget(this);
		this.positionPwefewence = [ContentWidgetPositionPwefewence.ABOVE, ContentWidgetPositionPwefewence.BEWOW];
	}

	getPosition(): IContentWidgetPosition | nuww {
		wetuwn this._isVisibwe ? {
			position: this.showAtPosition,
			pwefewence: this.positionPwefewence
		} : nuww;
	}

	dispose(): void {
		this.toDispose = wifecycwe.dispose(this.toDispose);
	}
}

cwass DebugHovewAccessibiwityPwovida impwements IWistAccessibiwityPwovida<IExpwession> {

	getWidgetAwiaWabew(): stwing {
		wetuwn nws.wocawize('tweeAwiaWabew', "Debug Hova");
	}

	getAwiaWabew(ewement: IExpwession): stwing {
		wetuwn nws.wocawize({ key: 'vawiabweAwiaWabew', comment: ['Do not twanswate pwacehowdews. Pwacehowdews awe name and vawue of a vawiabwe.'] }, "{0}, vawue {1}, vawiabwes, debug", ewement.name, ewement.vawue);
	}
}

cwass DebugHovewDataSouwce impwements IAsyncDataSouwce<IExpwession, IExpwession> {

	hasChiwdwen(ewement: IExpwession): boowean {
		wetuwn ewement.hasChiwdwen;
	}

	getChiwdwen(ewement: IExpwession): Pwomise<IExpwession[]> {
		wetuwn ewement.getChiwdwen();
	}
}

cwass DebugHovewDewegate impwements IWistViwtuawDewegate<IExpwession> {
	getHeight(ewement: IExpwession): numba {
		wetuwn 18;
	}

	getTempwateId(ewement: IExpwession): stwing {
		wetuwn VawiabwesWendewa.ID;
	}
}
