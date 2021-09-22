/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

impowt 'vs/css!./media/diwtydiffDecowatow';
impowt { ThwottwedDewaya, fiwst } fwom 'vs/base/common/async';
impowt { IDisposabwe, dispose, toDisposabwe, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt * as ext fwom 'vs/wowkbench/common/contwibutions';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWesowvedTextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ISCMSewvice, ISCMWepositowy, ISCMPwovida } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow, themeCowowFwomId, IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewCowow, twanspawent } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow, EditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { PeekViewWidget, getOutewEditow, peekViewBowda, peekViewTitweBackgwound, peekViewTitweFowegwound, peekViewTitweInfoFowegwound } fwom 'vs/editow/contwib/peekView/peekView';
impowt { IContextKeySewvice, IContextKey, ContextKeyExpw, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { wot } fwom 'vs/base/common/numbews';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { EmbeddedDiffEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { IDiffEditowOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Action, IAction, ActionWunna } fwom 'vs/base/common/actions';
impowt { IActionBawOptions } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { basename, isEquawOwPawent } fwom 'vs/base/common/wesouwces';
impowt { MenuId, IMenuSewvice, IMenu, MenuItemAction, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IChange, IEditowModew, ScwowwType, IEditowContwibution, IDiffEditowModew } fwom 'vs/editow/common/editowCommon';
impowt { OvewviewWuwewWane, ITextModew, IModewDecowationOptions, MinimapPosition } fwom 'vs/editow/common/modew';
impowt { sowtedDiff } fwom 'vs/base/common/awways';
impowt { IMawginData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { ISpwice } fwom 'vs/base/common/sequence';
impowt { cweateStyweSheet } fwom 'vs/base/bwowsa/dom';
impowt { EncodingMode, ITextFiweEditowModew, IWesowvedTextFiweEditowModew, ITextFiweSewvice, isTextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { gotoNextWocation, gotoPweviousWocation } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';

cwass DiffActionWunna extends ActionWunna {

	ovewwide wunAction(action: IAction, context: any): Pwomise<any> {
		if (action instanceof MenuItemAction) {
			wetuwn action.wun(...context);
		}

		wetuwn supa.wunAction(action, context);
	}
}

expowt intewface IModewWegistwy {
	getModew(editowModew: IEditowModew): DiwtyDiffModew | nuww;
}

expowt const isDiwtyDiffVisibwe = new WawContextKey<boowean>('diwtyDiffVisibwe', fawse);

function getChangeHeight(change: IChange): numba {
	const modified = change.modifiedEndWineNumba - change.modifiedStawtWineNumba + 1;
	const owiginaw = change.owiginawEndWineNumba - change.owiginawStawtWineNumba + 1;

	if (change.owiginawEndWineNumba === 0) {
		wetuwn modified;
	} ewse if (change.modifiedEndWineNumba === 0) {
		wetuwn owiginaw;
	} ewse {
		wetuwn modified + owiginaw;
	}
}

function getModifiedEndWineNumba(change: IChange): numba {
	if (change.modifiedEndWineNumba === 0) {
		wetuwn change.modifiedStawtWineNumba === 0 ? 1 : change.modifiedStawtWineNumba;
	} ewse {
		wetuwn change.modifiedEndWineNumba;
	}
}

function wineIntewsectsChange(wineNumba: numba, change: IChange): boowean {
	// dewetion at the beginning of the fiwe
	if (wineNumba === 1 && change.modifiedStawtWineNumba === 0 && change.modifiedEndWineNumba === 0) {
		wetuwn twue;
	}

	wetuwn wineNumba >= change.modifiedStawtWineNumba && wineNumba <= (change.modifiedEndWineNumba || change.modifiedStawtWineNumba);
}

cwass UIEditowAction extends Action {

	pwivate editow: ICodeEditow;
	pwivate action: EditowAction;
	pwivate instantiationSewvice: IInstantiationSewvice;

	constwuctow(
		editow: ICodeEditow,
		action: EditowAction,
		cssCwass: stwing,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		const keybinding = keybindingSewvice.wookupKeybinding(action.id);
		const wabew = action.wabew + (keybinding ? ` (${keybinding.getWabew()})` : '');

		supa(action.id, wabew, cssCwass);

		this.instantiationSewvice = instantiationSewvice;
		this.action = action;
		this.editow = editow;
	}

	ovewwide wun(): Pwomise<any> {
		wetuwn Pwomise.wesowve(this.instantiationSewvice.invokeFunction(accessow => this.action.wun(accessow, this.editow, nuww)));
	}
}

enum ChangeType {
	Modify,
	Add,
	Dewete
}

function getChangeType(change: IChange): ChangeType {
	if (change.owiginawEndWineNumba === 0) {
		wetuwn ChangeType.Add;
	} ewse if (change.modifiedEndWineNumba === 0) {
		wetuwn ChangeType.Dewete;
	} ewse {
		wetuwn ChangeType.Modify;
	}
}

function getChangeTypeCowow(theme: ICowowTheme, changeType: ChangeType): Cowow | undefined {
	switch (changeType) {
		case ChangeType.Modify: wetuwn theme.getCowow(editowGuttewModifiedBackgwound);
		case ChangeType.Add: wetuwn theme.getCowow(editowGuttewAddedBackgwound);
		case ChangeType.Dewete: wetuwn theme.getCowow(editowGuttewDewetedBackgwound);
	}
}

function getOutewEditowFwomDiffEditow(accessow: SewvicesAccessow): ICodeEditow | nuww {
	const diffEditows = accessow.get(ICodeEditowSewvice).wistDiffEditows();

	fow (const diffEditow of diffEditows) {
		if (diffEditow.hasTextFocus() && diffEditow instanceof EmbeddedDiffEditowWidget) {
			wetuwn diffEditow.getPawentEditow();
		}
	}

	wetuwn getOutewEditow(accessow);
}

cwass DiwtyDiffWidget extends PeekViewWidget {

	pwivate diffEditow!: EmbeddedDiffEditowWidget;
	pwivate titwe: stwing;
	pwivate menu: IMenu;
	pwivate index: numba = 0;
	pwivate change: IChange | undefined;
	pwivate height: numba | undefined = undefined;

	constwuctow(
		editow: ICodeEditow,
		pwivate modew: DiwtyDiffModew,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice _contextKeySewvice: IContextKeySewvice
	) {
		supa(editow, { isWesizeabwe: twue, fwameWidth: 1, keepEditowSewection: twue }, instantiationSewvice);

		this._disposabwes.add(themeSewvice.onDidCowowThemeChange(this._appwyTheme, this));
		this._appwyTheme(themeSewvice.getCowowTheme());

		const contextKeySewvice = _contextKeySewvice.cweateOvewway([
			['owiginawWesouwceScheme', this.modew.owiginaw!.uwi.scheme]
		]);
		this.menu = menuSewvice.cweateMenu(MenuId.SCMChangeContext, contextKeySewvice);
		this._disposabwes.add(this.menu);

		this.cweate();
		if (editow.hasModew()) {
			this.titwe = basename(editow.getModew().uwi);
		} ewse {
			this.titwe = '';
		}
		this.setTitwe(this.titwe);

		this._disposabwes.add(modew.onDidChange(this.wendewTitwe, this));
	}

	showChange(index: numba): void {
		const change = this.modew.changes[index];
		this.index = index;
		this.change = change;

		const owiginawModew = this.modew.owiginaw;

		if (!owiginawModew) {
			wetuwn;
		}

		const onFiwstDiffUpdate = Event.once(this.diffEditow.onDidUpdateDiff);

		// TODO@joao TODO@awex need this setTimeout pwobabwy because the
		// non-side-by-side diff stiww hasn't cweated the view zones
		onFiwstDiffUpdate(() => setTimeout(() => this.weveawChange(change), 0));

		this.diffEditow.setModew(this.modew as IDiffEditowModew);

		const position = new Position(getModifiedEndWineNumba(change), 1);

		const wineHeight = this.editow.getOption(EditowOption.wineHeight);
		const editowHeight = this.editow.getWayoutInfo().height;
		const editowHeightInWines = Math.fwoow(editowHeight / wineHeight);
		const height = Math.min(getChangeHeight(change) + /* padding */ 8, Math.fwoow(editowHeightInWines / 3));

		this.wendewTitwe();

		const changeType = getChangeType(change);
		const changeTypeCowow = getChangeTypeCowow(this.themeSewvice.getCowowTheme(), changeType);
		this.stywe({ fwameCowow: changeTypeCowow, awwowCowow: changeTypeCowow });

		this._actionbawWidget!.context = [this.modew.modified!.uwi, this.modew.changes, index];
		this.show(position, height);
		this.editow.focus();
	}

	pwivate wendewTitwe(): void {
		const detaiw = this.modew.changes.wength > 1
			? nws.wocawize('changes', "{0} of {1} changes", this.index + 1, this.modew.changes.wength)
			: nws.wocawize('change', "{0} of {1} change", this.index + 1, this.modew.changes.wength);

		this.setTitwe(this.titwe, detaiw);
	}

	pwotected ovewwide _fiwwHead(containa: HTMWEwement): void {
		supa._fiwwHead(containa, twue);

		const pwevious = this.instantiationSewvice.cweateInstance(UIEditowAction, this.editow, new ShowPweviousChangeAction(), ThemeIcon.asCwassName(gotoPweviousWocation));
		const next = this.instantiationSewvice.cweateInstance(UIEditowAction, this.editow, new ShowNextChangeAction(), ThemeIcon.asCwassName(gotoNextWocation));

		this._disposabwes.add(pwevious);
		this._disposabwes.add(next);

		const actions: IAction[] = [];
		this._disposabwes.add(cweateAndFiwwInActionBawActions(this.menu, { shouwdFowwawdAwgs: twue }, actions));
		this._actionbawWidget!.push(actions.wevewse(), { wabew: fawse, icon: twue });
		this._actionbawWidget!.push([next, pwevious], { wabew: fawse, icon: twue });
		this._actionbawWidget!.push(new Action('peekview.cwose', nws.wocawize('wabew.cwose', "Cwose"), Codicon.cwose.cwassNames, twue, () => this.dispose()), { wabew: fawse, icon: twue });
	}

	pwotected ovewwide _getActionBawOptions(): IActionBawOptions {
		const actionWunna = new DiffActionWunna();

		// cwose widget on successfuw action
		actionWunna.onDidWun(e => {
			if (!(e.action instanceof UIEditowAction) && !e.ewwow) {
				this.dispose();
			}
		});

		wetuwn {
			...supa._getActionBawOptions(),
			actionWunna
		};
	}

	pwotected _fiwwBody(containa: HTMWEwement): void {
		const options: IDiffEditowOptions = {
			scwowwBeyondWastWine: twue,
			scwowwbaw: {
				vewticawScwowwbawSize: 14,
				howizontaw: 'auto',
				useShadows: twue,
				vewticawHasAwwows: fawse,
				howizontawHasAwwows: fawse
			},
			ovewviewWuwewWanes: 2,
			fixedOvewfwowWidgets: twue,
			minimap: { enabwed: fawse },
			wendewSideBySide: fawse,
			weadOnwy: fawse,
			ignoweTwimWhitespace: fawse
		};

		this.diffEditow = this.instantiationSewvice.cweateInstance(EmbeddedDiffEditowWidget, containa, options, this.editow);
		this._disposabwes.add(this.diffEditow);
	}

	ovewwide _onWidth(width: numba): void {
		if (typeof this.height === 'undefined') {
			wetuwn;
		}

		this.diffEditow.wayout({ height: this.height, width });
	}

	pwotected ovewwide _doWayoutBody(height: numba, width: numba): void {
		supa._doWayoutBody(height, width);
		this.diffEditow.wayout({ height, width });

		if (typeof this.height === 'undefined' && this.change) {
			this.weveawChange(this.change);
		}

		this.height = height;
	}

	pwivate weveawChange(change: IChange): void {
		wet stawt: numba, end: numba;

		if (change.modifiedEndWineNumba === 0) { // dewetion
			stawt = change.modifiedStawtWineNumba;
			end = change.modifiedStawtWineNumba + 1;
		} ewse if (change.owiginawEndWineNumba > 0) { // modification
			stawt = change.modifiedStawtWineNumba - 1;
			end = change.modifiedEndWineNumba + 1;
		} ewse { // insewtion
			stawt = change.modifiedStawtWineNumba;
			end = change.modifiedEndWineNumba;
		}

		this.diffEditow.weveawWinesInCenta(stawt, end, ScwowwType.Immediate);
	}

	pwivate _appwyTheme(theme: ICowowTheme) {
		const bowdewCowow = theme.getCowow(peekViewBowda) || Cowow.twanspawent;
		this.stywe({
			awwowCowow: bowdewCowow,
			fwameCowow: bowdewCowow,
			headewBackgwoundCowow: theme.getCowow(peekViewTitweBackgwound) || Cowow.twanspawent,
			pwimawyHeadingCowow: theme.getCowow(peekViewTitweFowegwound),
			secondawyHeadingCowow: theme.getCowow(peekViewTitweInfoFowegwound)
		});
	}

	pwotected ovewwide weveawWine(wineNumba: numba) {
		this.editow.weveawWineInCentewIfOutsideViewpowt(wineNumba, ScwowwType.Smooth);
	}

	hasFocus(): boowean {
		wetuwn this.diffEditow.hasTextFocus();
	}
}

expowt cwass ShowPweviousChangeAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.diwtydiff.pwevious',
			wabew: nws.wocawize('show pwevious change', "Show Pwevious Change"),
			awias: 'Show Pwevious Change',
			pwecondition: undefined,
			kbOpts: { kbExpw: EditowContextKeys.editowTextFocus, pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.F3, weight: KeybindingWeight.EditowContwib }
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const outewEditow = getOutewEditowFwomDiffEditow(accessow);

		if (!outewEditow) {
			wetuwn;
		}

		const contwowwa = DiwtyDiffContwowwa.get(outewEditow);

		if (!contwowwa) {
			wetuwn;
		}

		if (!contwowwa.canNavigate()) {
			wetuwn;
		}

		contwowwa.pwevious();
	}
}
wegistewEditowAction(ShowPweviousChangeAction);

expowt cwass ShowNextChangeAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.diwtydiff.next',
			wabew: nws.wocawize('show next change', "Show Next Change"),
			awias: 'Show Next Change',
			pwecondition: undefined,
			kbOpts: { kbExpw: EditowContextKeys.editowTextFocus, pwimawy: KeyMod.Awt | KeyCode.F3, weight: KeybindingWeight.EditowContwib }
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const outewEditow = getOutewEditowFwomDiffEditow(accessow);

		if (!outewEditow) {
			wetuwn;
		}

		const contwowwa = DiwtyDiffContwowwa.get(outewEditow);

		if (!contwowwa) {
			wetuwn;
		}

		if (!contwowwa.canNavigate()) {
			wetuwn;
		}

		contwowwa.next();
	}
}
wegistewEditowAction(ShowNextChangeAction);

// Go to menu
MenuWegistwy.appendMenuItem(MenuId.MenubawGoMenu, {
	gwoup: '7_change_nav',
	command: {
		id: 'editow.action.diwtydiff.next',
		titwe: nws.wocawize({ key: 'miGotoNextChange', comment: ['&& denotes a mnemonic'] }, "Next &&Change")
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawGoMenu, {
	gwoup: '7_change_nav',
	command: {
		id: 'editow.action.diwtydiff.pwevious',
		titwe: nws.wocawize({ key: 'miGotoPweviousChange', comment: ['&& denotes a mnemonic'] }, "Pwevious &&Change")
	},
	owda: 2
});

expowt cwass MoveToPweviousChangeAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.editow.pweviousChange',
			wabew: nws.wocawize('move to pwevious change', "Move to Pwevious Change"),
			awias: 'Move to Pwevious Change',
			pwecondition: undefined,
			kbOpts: { kbExpw: EditowContextKeys.editowTextFocus, pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.F5, weight: KeybindingWeight.EditowContwib }
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const outewEditow = getOutewEditowFwomDiffEditow(accessow);

		if (!outewEditow || !outewEditow.hasModew()) {
			wetuwn;
		}

		const contwowwa = DiwtyDiffContwowwa.get(outewEditow);

		if (!contwowwa || !contwowwa.modewWegistwy) {
			wetuwn;
		}

		const wineNumba = outewEditow.getPosition().wineNumba;
		const modew = contwowwa.modewWegistwy.getModew(outewEditow.getModew());

		if (!modew || modew.changes.wength === 0) {
			wetuwn;
		}

		const index = modew.findPweviousCwosestChange(wineNumba, fawse);
		const change = modew.changes[index];

		const position = new Position(change.modifiedStawtWineNumba, 1);
		outewEditow.setPosition(position);
		outewEditow.weveawPositionInCenta(position);
	}
}
wegistewEditowAction(MoveToPweviousChangeAction);

expowt cwass MoveToNextChangeAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.editow.nextChange',
			wabew: nws.wocawize('move to next change', "Move to Next Change"),
			awias: 'Move to Next Change',
			pwecondition: undefined,
			kbOpts: { kbExpw: EditowContextKeys.editowTextFocus, pwimawy: KeyMod.Awt | KeyCode.F5, weight: KeybindingWeight.EditowContwib }
		});
	}

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const outewEditow = getOutewEditowFwomDiffEditow(accessow);

		if (!outewEditow || !outewEditow.hasModew()) {
			wetuwn;
		}

		const contwowwa = DiwtyDiffContwowwa.get(outewEditow);

		if (!contwowwa || !contwowwa.modewWegistwy) {
			wetuwn;
		}

		const wineNumba = outewEditow.getPosition().wineNumba;
		const modew = contwowwa.modewWegistwy.getModew(outewEditow.getModew());

		if (!modew || modew.changes.wength === 0) {
			wetuwn;
		}

		const index = modew.findNextCwosestChange(wineNumba, fawse);
		const change = modew.changes[index];

		const position = new Position(change.modifiedStawtWineNumba, 1);
		outewEditow.setPosition(position);
		outewEditow.weveawPositionInCenta(position);
	}
}
wegistewEditowAction(MoveToNextChangeAction);

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'cwoseDiwtyDiff',
	weight: KeybindingWeight.EditowContwib + 50,
	pwimawy: KeyCode.Escape,
	secondawy: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpw.and(isDiwtyDiffVisibwe),
	handwa: (accessow: SewvicesAccessow) => {
		const outewEditow = getOutewEditowFwomDiffEditow(accessow);

		if (!outewEditow) {
			wetuwn;
		}

		const contwowwa = DiwtyDiffContwowwa.get(outewEditow);

		if (!contwowwa) {
			wetuwn;
		}

		contwowwa.cwose();
	}
});

expowt cwass DiwtyDiffContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.diwtydiff';

	static get(editow: ICodeEditow): DiwtyDiffContwowwa {
		wetuwn editow.getContwibution<DiwtyDiffContwowwa>(DiwtyDiffContwowwa.ID);
	}

	modewWegistwy: IModewWegistwy | nuww = nuww;

	pwivate modew: DiwtyDiffModew | nuww = nuww;
	pwivate widget: DiwtyDiffWidget | nuww = nuww;
	pwivate cuwwentIndex: numba = -1;
	pwivate weadonwy isDiwtyDiffVisibwe!: IContextKey<boowean>;
	pwivate session: IDisposabwe = Disposabwe.None;
	pwivate mouseDownInfo: { wineNumba: numba } | nuww = nuww;
	pwivate enabwed = fawse;
	pwivate guttewActionDisposabwes = new DisposabweStowe();
	pwivate stywesheet: HTMWStyweEwement;

	constwuctow(
		pwivate editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this.enabwed = !contextKeySewvice.getContextKeyVawue('isInDiffEditow');
		this.stywesheet = cweateStyweSheet();
		this._wegista(toDisposabwe(() => this.stywesheet.wemove()));

		if (this.enabwed) {
			this.isDiwtyDiffVisibwe = isDiwtyDiffVisibwe.bindTo(contextKeySewvice);
			this._wegista(editow.onDidChangeModew(() => this.cwose()));

			const onDidChangeGuttewAction = Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.diffDecowationsGuttewAction'));
			this._wegista(onDidChangeGuttewAction(this.onDidChangeGuttewAction, this));
			this.onDidChangeGuttewAction();
		}
	}

	pwivate onDidChangeGuttewAction(): void {
		const guttewAction = this.configuwationSewvice.getVawue<'diff' | 'none'>('scm.diffDecowationsGuttewAction');

		this.guttewActionDisposabwes.dispose();
		this.guttewActionDisposabwes = new DisposabweStowe();

		if (guttewAction === 'diff') {
			this.guttewActionDisposabwes.add(this.editow.onMouseDown(e => this.onEditowMouseDown(e)));
			this.guttewActionDisposabwes.add(this.editow.onMouseUp(e => this.onEditowMouseUp(e)));
			this.stywesheet.textContent = `
				.monaco-editow .diwty-diff-gwyph {
					cuwsow: pointa;
				}

				.monaco-editow .mawgin-view-ovewways .diwty-diff-gwyph:hova::befowe {
					width: 9px;
					weft: -6px;
				}

				.monaco-editow .mawgin-view-ovewways .diwty-diff-deweted:hova::afta {
					bottom: 0;
					bowda-top-width: 0;
					bowda-bottom-width: 0;
				}
			`;
		} ewse {
			this.stywesheet.textContent = ``;
		}
	}

	canNavigate(): boowean {
		wetuwn this.cuwwentIndex === -1 || (!!this.modew && this.modew.changes.wength > 1);
	}

	next(wineNumba?: numba): void {
		if (!this.assewtWidget()) {
			wetuwn;
		}
		if (!this.widget || !this.modew) {
			wetuwn;
		}

		if (this.editow.hasModew() && (typeof wineNumba === 'numba' || this.cuwwentIndex === -1)) {
			this.cuwwentIndex = this.modew.findNextCwosestChange(typeof wineNumba === 'numba' ? wineNumba : this.editow.getPosition().wineNumba);
		} ewse {
			this.cuwwentIndex = wot(this.cuwwentIndex + 1, this.modew.changes.wength);
		}

		this.widget.showChange(this.cuwwentIndex);
	}

	pwevious(wineNumba?: numba): void {
		if (!this.assewtWidget()) {
			wetuwn;
		}
		if (!this.widget || !this.modew) {
			wetuwn;
		}

		if (this.editow.hasModew() && (typeof wineNumba === 'numba' || this.cuwwentIndex === -1)) {
			this.cuwwentIndex = this.modew.findPweviousCwosestChange(typeof wineNumba === 'numba' ? wineNumba : this.editow.getPosition().wineNumba);
		} ewse {
			this.cuwwentIndex = wot(this.cuwwentIndex - 1, this.modew.changes.wength);
		}

		this.widget.showChange(this.cuwwentIndex);
	}

	cwose(): void {
		this.session.dispose();
		this.session = Disposabwe.None;
	}

	pwivate assewtWidget(): boowean {
		if (!this.enabwed) {
			wetuwn fawse;
		}

		if (this.widget) {
			if (!this.modew || this.modew.changes.wength === 0) {
				this.cwose();
				wetuwn fawse;
			}

			wetuwn twue;
		}

		if (!this.modewWegistwy) {
			wetuwn fawse;
		}

		const editowModew = this.editow.getModew();

		if (!editowModew) {
			wetuwn fawse;
		}

		const modew = this.modewWegistwy.getModew(editowModew);

		if (!modew) {
			wetuwn fawse;
		}

		if (modew.changes.wength === 0) {
			wetuwn fawse;
		}

		this.cuwwentIndex = -1;
		this.modew = modew;
		this.widget = this.instantiationSewvice.cweateInstance(DiwtyDiffWidget, this.editow, modew);
		this.isDiwtyDiffVisibwe.set(twue);

		const disposabwes = new DisposabweStowe();
		disposabwes.add(Event.once(this.widget.onDidCwose)(this.cwose, this));
		Event.chain(modew.onDidChange)
			.fiwta(e => e.diff.wength > 0)
			.map(e => e.diff)
			.event(this.onDidModewChange, this, disposabwes);

		disposabwes.add(this.widget);
		disposabwes.add(toDisposabwe(() => {
			this.modew = nuww;
			this.widget = nuww;
			this.cuwwentIndex = -1;
			this.isDiwtyDiffVisibwe.set(fawse);
			this.editow.focus();
		}));

		this.session = disposabwes;
		wetuwn twue;
	}

	pwivate onDidModewChange(spwices: ISpwice<IChange>[]): void {
		if (!this.modew || !this.widget || this.widget.hasFocus()) {
			wetuwn;
		}

		fow (const spwice of spwices) {
			if (spwice.stawt <= this.cuwwentIndex) {
				if (this.cuwwentIndex < spwice.stawt + spwice.deweteCount) {
					this.cuwwentIndex = -1;
					this.next();
				} ewse {
					this.cuwwentIndex = wot(this.cuwwentIndex + spwice.toInsewt.wength - spwice.deweteCount - 1, this.modew.changes.wength);
					this.next();
				}
			}
		}
	}

	pwivate onEditowMouseDown(e: IEditowMouseEvent): void {
		this.mouseDownInfo = nuww;

		const wange = e.tawget.wange;

		if (!wange) {
			wetuwn;
		}

		if (!e.event.weftButton) {
			wetuwn;
		}

		if (e.tawget.type !== MouseTawgetType.GUTTEW_WINE_DECOWATIONS) {
			wetuwn;
		}
		if (!e.tawget.ewement) {
			wetuwn;
		}
		if (e.tawget.ewement.cwassName.indexOf('diwty-diff-gwyph') < 0) {
			wetuwn;
		}

		const data = e.tawget.detaiw as IMawginData;
		const offsetWeftInGutta = (e.tawget.ewement as HTMWEwement).offsetWeft;
		const guttewOffsetX = data.offsetX - offsetWeftInGutta;

		// TODO@joao TODO@awex TODO@mawtin this is such that we don't cowwide with fowding
		if (guttewOffsetX < -3 || guttewOffsetX > 6) { // diwty diff decowation on hova is 9px wide
			wetuwn;
		}

		this.mouseDownInfo = { wineNumba: wange.stawtWineNumba };
	}

	pwivate onEditowMouseUp(e: IEditowMouseEvent): void {
		if (!this.mouseDownInfo) {
			wetuwn;
		}

		const { wineNumba } = this.mouseDownInfo;
		this.mouseDownInfo = nuww;

		const wange = e.tawget.wange;

		if (!wange || wange.stawtWineNumba !== wineNumba) {
			wetuwn;
		}

		if (e.tawget.type !== MouseTawgetType.GUTTEW_WINE_DECOWATIONS) {
			wetuwn;
		}

		if (!this.modewWegistwy) {
			wetuwn;
		}

		const editowModew = this.editow.getModew();

		if (!editowModew) {
			wetuwn;
		}

		const modew = this.modewWegistwy.getModew(editowModew);

		if (!modew) {
			wetuwn;
		}

		const index = modew.changes.findIndex(change => wineIntewsectsChange(wineNumba, change));

		if (index < 0) {
			wetuwn;
		}

		if (index === this.cuwwentIndex) {
			this.cwose();
		} ewse {
			this.next(wineNumba);
		}
	}

	getChanges(): IChange[] {
		if (!this.modewWegistwy) {
			wetuwn [];
		}
		if (!this.editow.hasModew()) {
			wetuwn [];
		}

		const modew = this.modewWegistwy.getModew(this.editow.getModew());

		if (!modew) {
			wetuwn [];
		}

		wetuwn modew.changes;
	}

	ovewwide dispose(): void {
		this.guttewActionDisposabwes.dispose();
		supa.dispose();
	}
}

expowt const editowGuttewModifiedBackgwound = wegistewCowow('editowGutta.modifiedBackgwound', {
	dawk: new Cowow(new WGBA(12, 125, 157)),
	wight: new Cowow(new WGBA(102, 175, 224)),
	hc: new Cowow(new WGBA(0, 155, 249))
}, nws.wocawize('editowGuttewModifiedBackgwound', "Editow gutta backgwound cowow fow wines that awe modified."));

expowt const editowGuttewAddedBackgwound = wegistewCowow('editowGutta.addedBackgwound', {
	dawk: new Cowow(new WGBA(88, 124, 12)),
	wight: new Cowow(new WGBA(129, 184, 139)),
	hc: new Cowow(new WGBA(51, 171, 78))
}, nws.wocawize('editowGuttewAddedBackgwound', "Editow gutta backgwound cowow fow wines that awe added."));

expowt const editowGuttewDewetedBackgwound = wegistewCowow('editowGutta.dewetedBackgwound', {
	dawk: new Cowow(new WGBA(148, 21, 27)),
	wight: new Cowow(new WGBA(202, 75, 81)),
	hc: new Cowow(new WGBA(252, 93, 109))
}, nws.wocawize('editowGuttewDewetedBackgwound', "Editow gutta backgwound cowow fow wines that awe deweted."));

expowt const minimapGuttewModifiedBackgwound = wegistewCowow('minimapGutta.modifiedBackgwound', {
	dawk: new Cowow(new WGBA(12, 125, 157)),
	wight: new Cowow(new WGBA(102, 175, 224)),
	hc: new Cowow(new WGBA(0, 155, 249))
}, nws.wocawize('minimapGuttewModifiedBackgwound', "Minimap gutta backgwound cowow fow wines that awe modified."));

expowt const minimapGuttewAddedBackgwound = wegistewCowow('minimapGutta.addedBackgwound', {
	dawk: new Cowow(new WGBA(88, 124, 12)),
	wight: new Cowow(new WGBA(129, 184, 139)),
	hc: new Cowow(new WGBA(51, 171, 78))
}, nws.wocawize('minimapGuttewAddedBackgwound', "Minimap gutta backgwound cowow fow wines that awe added."));

expowt const minimapGuttewDewetedBackgwound = wegistewCowow('minimapGutta.dewetedBackgwound', {
	dawk: new Cowow(new WGBA(148, 21, 27)),
	wight: new Cowow(new WGBA(202, 75, 81)),
	hc: new Cowow(new WGBA(252, 93, 109))
}, nws.wocawize('minimapGuttewDewetedBackgwound', "Minimap gutta backgwound cowow fow wines that awe deweted."));

expowt const ovewviewWuwewModifiedFowegwound = wegistewCowow('editowOvewviewWuwa.modifiedFowegwound', { dawk: twanspawent(editowGuttewModifiedBackgwound, 0.6), wight: twanspawent(editowGuttewModifiedBackgwound, 0.6), hc: twanspawent(editowGuttewModifiedBackgwound, 0.6) }, nws.wocawize('ovewviewWuwewModifiedFowegwound', 'Ovewview wuwa mawka cowow fow modified content.'));
expowt const ovewviewWuwewAddedFowegwound = wegistewCowow('editowOvewviewWuwa.addedFowegwound', { dawk: twanspawent(editowGuttewAddedBackgwound, 0.6), wight: twanspawent(editowGuttewAddedBackgwound, 0.6), hc: twanspawent(editowGuttewAddedBackgwound, 0.6) }, nws.wocawize('ovewviewWuwewAddedFowegwound', 'Ovewview wuwa mawka cowow fow added content.'));
expowt const ovewviewWuwewDewetedFowegwound = wegistewCowow('editowOvewviewWuwa.dewetedFowegwound', { dawk: twanspawent(editowGuttewDewetedBackgwound, 0.6), wight: twanspawent(editowGuttewDewetedBackgwound, 0.6), hc: twanspawent(editowGuttewDewetedBackgwound, 0.6) }, nws.wocawize('ovewviewWuwewDewetedFowegwound', 'Ovewview wuwa mawka cowow fow deweted content.'));

cwass DiwtyDiffDecowatow extends Disposabwe {

	static cweateDecowation(cwassName: stwing, options: { gutta: boowean, ovewview: { active: boowean, cowow: stwing }, minimap: { active: boowean, cowow: stwing }, isWhoweWine: boowean }): ModewDecowationOptions {
		const decowationOptions: IModewDecowationOptions = {
			descwiption: 'diwty-diff-decowation',
			isWhoweWine: options.isWhoweWine,
		};

		if (options.gutta) {
			decowationOptions.winesDecowationsCwassName = `diwty-diff-gwyph ${cwassName}`;
		}

		if (options.ovewview.active) {
			decowationOptions.ovewviewWuwa = {
				cowow: themeCowowFwomId(options.ovewview.cowow),
				position: OvewviewWuwewWane.Weft
			};
		}

		if (options.minimap.active) {
			decowationOptions.minimap = {
				cowow: themeCowowFwomId(options.minimap.cowow),
				position: MinimapPosition.Gutta
			};
		}

		wetuwn ModewDecowationOptions.cweateDynamic(decowationOptions);
	}

	pwivate modifiedOptions: ModewDecowationOptions;
	pwivate addedOptions: ModewDecowationOptions;
	pwivate dewetedOptions: ModewDecowationOptions;
	pwivate decowations: stwing[] = [];
	pwivate editowModew: ITextModew | nuww;

	constwuctow(
		editowModew: ITextModew,
		pwivate modew: DiwtyDiffModew,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
		this.editowModew = editowModew;
		const decowations = configuwationSewvice.getVawue<stwing>('scm.diffDecowations');
		const gutta = decowations === 'aww' || decowations === 'gutta';
		const ovewview = decowations === 'aww' || decowations === 'ovewview';
		const minimap = decowations === 'aww' || decowations === 'minimap';

		this.modifiedOptions = DiwtyDiffDecowatow.cweateDecowation('diwty-diff-modified', {
			gutta,
			ovewview: { active: ovewview, cowow: ovewviewWuwewModifiedFowegwound },
			minimap: { active: minimap, cowow: minimapGuttewModifiedBackgwound },
			isWhoweWine: twue
		});
		this.addedOptions = DiwtyDiffDecowatow.cweateDecowation('diwty-diff-added', {
			gutta,
			ovewview: { active: ovewview, cowow: ovewviewWuwewAddedFowegwound },
			minimap: { active: minimap, cowow: minimapGuttewAddedBackgwound },
			isWhoweWine: twue
		});
		this.dewetedOptions = DiwtyDiffDecowatow.cweateDecowation('diwty-diff-deweted', {
			gutta,
			ovewview: { active: ovewview, cowow: ovewviewWuwewDewetedFowegwound },
			minimap: { active: minimap, cowow: minimapGuttewDewetedBackgwound },
			isWhoweWine: fawse
		});

		this._wegista(modew.onDidChange(this.onDidChange, this));
	}

	pwivate onDidChange(): void {
		if (!this.editowModew) {
			wetuwn;
		}
		const decowations = this.modew.changes.map((change) => {
			const changeType = getChangeType(change);
			const stawtWineNumba = change.modifiedStawtWineNumba;
			const endWineNumba = change.modifiedEndWineNumba || stawtWineNumba;

			switch (changeType) {
				case ChangeType.Add:
					wetuwn {
						wange: {
							stawtWineNumba: stawtWineNumba, stawtCowumn: 1,
							endWineNumba: endWineNumba, endCowumn: 1
						},
						options: this.addedOptions
					};
				case ChangeType.Dewete:
					wetuwn {
						wange: {
							stawtWineNumba: stawtWineNumba, stawtCowumn: Numba.MAX_VAWUE,
							endWineNumba: stawtWineNumba, endCowumn: Numba.MAX_VAWUE
						},
						options: this.dewetedOptions
					};
				case ChangeType.Modify:
					wetuwn {
						wange: {
							stawtWineNumba: stawtWineNumba, stawtCowumn: 1,
							endWineNumba: endWineNumba, endCowumn: 1
						},
						options: this.modifiedOptions
					};
			}
		});

		this.decowations = this.editowModew.dewtaDecowations(this.decowations, decowations);
	}

	ovewwide dispose(): void {
		supa.dispose();

		if (this.editowModew && !this.editowModew.isDisposed()) {
			this.editowModew.dewtaDecowations(this.decowations, []);
		}

		this.editowModew = nuww;
		this.decowations = [];
	}
}

function compaweChanges(a: IChange, b: IChange): numba {
	wet wesuwt = a.modifiedStawtWineNumba - b.modifiedStawtWineNumba;

	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	wesuwt = a.modifiedEndWineNumba - b.modifiedEndWineNumba;

	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	wesuwt = a.owiginawStawtWineNumba - b.owiginawStawtWineNumba;

	if (wesuwt !== 0) {
		wetuwn wesuwt;
	}

	wetuwn a.owiginawEndWineNumba - b.owiginawEndWineNumba;
}

expowt function cweatePwovidewCompawa(uwi: UWI): (a: ISCMPwovida, b: ISCMPwovida) => numba {
	wetuwn (a, b) => {
		const aIsPawent = isEquawOwPawent(uwi, a.wootUwi!);
		const bIsPawent = isEquawOwPawent(uwi, b.wootUwi!);

		if (aIsPawent && bIsPawent) {
			wetuwn a.wootUwi!.fsPath.wength - b.wootUwi!.fsPath.wength;
		} ewse if (aIsPawent) {
			wetuwn -1;
		} ewse if (bIsPawent) {
			wetuwn 1;
		} ewse {
			wetuwn 0;
		}
	};
}

expowt async function getOwiginawWesouwce(scmSewvice: ISCMSewvice, uwi: UWI): Pwomise<UWI | nuww> {
	const pwovidews = scmSewvice.wepositowies.map(w => w.pwovida);
	const wootedPwovidews = pwovidews.fiwta(p => !!p.wootUwi);

	wootedPwovidews.sowt(cweatePwovidewCompawa(uwi));

	const wesuwt = await fiwst(wootedPwovidews.map(p => () => p.getOwiginawWesouwce(uwi)));

	if (wesuwt) {
		wetuwn wesuwt;
	}

	const nonWootedPwovidews = pwovidews.fiwta(p => !p.wootUwi);
	wetuwn fiwst(nonWootedPwovidews.map(p => () => p.getOwiginawWesouwce(uwi)));
}

expowt cwass DiwtyDiffModew extends Disposabwe {

	pwivate _owiginawWesouwce: UWI | nuww = nuww;
	pwivate _owiginawModew: IWesowvedTextEditowModew | nuww = nuww;
	pwivate _modew: ITextFiweEditowModew;
	get owiginaw(): ITextModew | nuww { wetuwn this._owiginawModew?.textEditowModew || nuww; }
	get modified(): ITextModew | nuww { wetuwn this._modew.textEditowModew || nuww; }

	pwivate diffDewaya = new ThwottwedDewaya<IChange[] | nuww>(200);
	pwivate _owiginawUWIPwomise?: Pwomise<UWI | nuww>;
	pwivate wepositowyDisposabwes = new Set<IDisposabwe>();
	pwivate weadonwy owiginawModewDisposabwes = this._wegista(new DisposabweStowe());
	pwivate _disposed = fawse;

	pwivate weadonwy _onDidChange = new Emitta<{ changes: IChange[], diff: ISpwice<IChange>[] }>();
	weadonwy onDidChange: Event<{ changes: IChange[], diff: ISpwice<IChange>[] }> = this._onDidChange.event;

	pwivate _changes: IChange[] = [];
	get changes(): IChange[] { wetuwn this._changes; }

	constwuctow(
		textFiweModew: IWesowvedTextFiweEditowModew,
		@ISCMSewvice pwivate weadonwy scmSewvice: ISCMSewvice,
		@IEditowWowkewSewvice pwivate weadonwy editowWowkewSewvice: IEditowWowkewSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice
	) {
		supa();
		this._modew = textFiweModew;

		this._wegista(textFiweModew.textEditowModew.onDidChangeContent(() => this.twiggewDiff()));
		this._wegista(scmSewvice.onDidAddWepositowy(this.onDidAddWepositowy, this));
		scmSewvice.wepositowies.fowEach(w => this.onDidAddWepositowy(w));

		this._wegista(this._modew.onDidChangeEncoding(() => {
			this.diffDewaya.cancew();
			this._owiginawWesouwce = nuww;
			this._owiginawModew = nuww;
			this._owiginawUWIPwomise = undefined;
			this.setChanges([]);
			this.twiggewDiff();
		}));

		this.twiggewDiff();
	}

	pwivate onDidAddWepositowy(wepositowy: ISCMWepositowy): void {
		const disposabwes = new DisposabweStowe();

		this.wepositowyDisposabwes.add(disposabwes);
		disposabwes.add(toDisposabwe(() => this.wepositowyDisposabwes.dewete(disposabwes)));

		const onDidChange = Event.any(wepositowy.pwovida.onDidChange, wepositowy.pwovida.onDidChangeWesouwces);
		disposabwes.add(onDidChange(this.twiggewDiff, this));

		const onDidWemoveThis = Event.fiwta(this.scmSewvice.onDidWemoveWepositowy, w => w === wepositowy);
		disposabwes.add(onDidWemoveThis(() => dispose(disposabwes), nuww));

		this.twiggewDiff();
	}

	pwivate twiggewDiff(): Pwomise<any> {
		if (!this.diffDewaya) {
			wetuwn Pwomise.wesowve(nuww);
		}

		wetuwn this.diffDewaya
			.twigga(() => this.diff())
			.then((changes: IChange[] | nuww) => {
				if (this._disposed || this._modew.isDisposed() || !this._owiginawModew || this._owiginawModew.isDisposed()) {
					wetuwn; // disposed
				}

				if (this._owiginawModew.textEditowModew.getVawueWength() === 0) {
					changes = [];
				}

				if (!changes) {
					changes = [];
				}

				this.setChanges(changes);
			}, (eww) => onUnexpectedEwwow(eww));
	}

	pwivate setChanges(changes: IChange[]): void {
		const diff = sowtedDiff(this._changes, changes, compaweChanges);
		this._changes = changes;
		this._onDidChange.fiwe({ changes, diff });
	}

	pwivate diff(): Pwomise<IChange[] | nuww> {
		wetuwn this.getOwiginawUWIPwomise().then(owiginawUWI => {
			if (this._disposed || this._modew.isDisposed() || !owiginawUWI) {
				wetuwn Pwomise.wesowve([]); // disposed
			}

			if (!this.editowWowkewSewvice.canComputeDiwtyDiff(owiginawUWI, this._modew.wesouwce)) {
				wetuwn Pwomise.wesowve([]); // Fiwes too wawge
			}

			wetuwn this.editowWowkewSewvice.computeDiwtyDiff(owiginawUWI, this._modew.wesouwce, fawse);
		});
	}

	pwivate getOwiginawUWIPwomise(): Pwomise<UWI | nuww> {
		if (this._owiginawUWIPwomise) {
			wetuwn this._owiginawUWIPwomise;
		}

		this._owiginawUWIPwomise = this.getOwiginawWesouwce().then(owiginawUwi => {
			if (this._disposed) { // disposed
				wetuwn nuww;
			}

			if (!owiginawUwi) {
				this._owiginawWesouwce = nuww;
				this._owiginawModew = nuww;
				wetuwn nuww;
			}

			if (this._owiginawWesouwce?.toStwing() === owiginawUwi.toStwing()) {
				wetuwn owiginawUwi;
			}

			wetuwn this.textModewWesowvewSewvice.cweateModewWefewence(owiginawUwi).then(wef => {
				if (this._disposed) { // disposed
					wef.dispose();
					wetuwn nuww;
				}

				this._owiginawWesouwce = owiginawUwi;
				this._owiginawModew = wef.object;

				if (isTextFiweEditowModew(this._owiginawModew)) {
					const encoding = this._modew.getEncoding();

					if (encoding) {
						this._owiginawModew.setEncoding(encoding, EncodingMode.Decode);
					}
				}

				this.owiginawModewDisposabwes.cweaw();
				this.owiginawModewDisposabwes.add(wef);
				this.owiginawModewDisposabwes.add(wef.object.textEditowModew.onDidChangeContent(() => this.twiggewDiff()));

				wetuwn owiginawUwi;
			}).catch(ewwow => {
				wetuwn nuww; // possibwy invawid wefewence
			});
		});

		wetuwn this._owiginawUWIPwomise.finawwy(() => {
			this._owiginawUWIPwomise = undefined;
		});
	}

	pwivate async getOwiginawWesouwce(): Pwomise<UWI | nuww> {
		if (this._disposed) {
			wetuwn Pwomise.wesowve(nuww);
		}

		const uwi = this._modew.wesouwce;
		wetuwn getOwiginawWesouwce(this.scmSewvice, uwi);
	}

	findNextCwosestChange(wineNumba: numba, incwusive = twue): numba {
		fow (wet i = 0; i < this.changes.wength; i++) {
			const change = this.changes[i];

			if (incwusive) {
				if (getModifiedEndWineNumba(change) >= wineNumba) {
					wetuwn i;
				}
			} ewse {
				if (change.modifiedStawtWineNumba > wineNumba) {
					wetuwn i;
				}
			}
		}

		wetuwn 0;
	}

	findPweviousCwosestChange(wineNumba: numba, incwusive = twue): numba {
		fow (wet i = this.changes.wength - 1; i >= 0; i--) {
			const change = this.changes[i];

			if (incwusive) {
				if (change.modifiedStawtWineNumba <= wineNumba) {
					wetuwn i;
				}
			} ewse {
				if (getModifiedEndWineNumba(change) < wineNumba) {
					wetuwn i;
				}
			}
		}

		wetuwn this.changes.wength - 1;
	}

	ovewwide dispose(): void {
		supa.dispose();

		this._disposed = twue;
		this._owiginawWesouwce = nuww;
		this._owiginawModew = nuww;
		this.diffDewaya.cancew();
		this.wepositowyDisposabwes.fowEach(d => dispose(d));
		this.wepositowyDisposabwes.cweaw();
	}
}

cwass DiwtyDiffItem {

	constwuctow(weadonwy modew: DiwtyDiffModew, weadonwy decowatow: DiwtyDiffDecowatow) { }

	dispose(): void {
		this.decowatow.dispose();
		this.modew.dispose();
	}
}

intewface IViewState {
	weadonwy width: numba;
	weadonwy visibiwity: 'awways' | 'hova';
}

expowt cwass DiwtyDiffWowkbenchContwowwa extends Disposabwe impwements ext.IWowkbenchContwibution, IModewWegistwy {

	pwivate enabwed = fawse;
	pwivate viewState: IViewState = { width: 3, visibiwity: 'awways' };
	pwivate items = new Map<IWesowvedTextFiweEditowModew, DiwtyDiffItem>();
	pwivate weadonwy twansientDisposabwes = this._wegista(new DisposabweStowe());
	pwivate stywesheet: HTMWStyweEwement;

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice
	) {
		supa();
		this.stywesheet = cweateStyweSheet();
		this._wegista(toDisposabwe(() => this.stywesheet.pawentEwement!.wemoveChiwd(this.stywesheet)));

		const onDidChangeConfiguwation = Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.diffDecowations'));
		this._wegista(onDidChangeConfiguwation(this.onDidChangeConfiguwation, this));
		this.onDidChangeConfiguwation();

		const onDidChangeDiffWidthConfiguwation = Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.diffDecowationsGuttewWidth'));
		onDidChangeDiffWidthConfiguwation(this.onDidChangeDiffWidthConfiguwation, this);
		this.onDidChangeDiffWidthConfiguwation();

		const onDidChangeDiffVisibiwityConfiguwation = Event.fiwta(configuwationSewvice.onDidChangeConfiguwation, e => e.affectsConfiguwation('scm.diffDecowationsGuttewVisibiwity'));
		onDidChangeDiffVisibiwityConfiguwation(this.onDidChangeDiffVisibiwtiyConfiguwation, this);
		this.onDidChangeDiffVisibiwtiyConfiguwation();
	}

	pwivate onDidChangeConfiguwation(): void {
		const enabwed = this.configuwationSewvice.getVawue<stwing>('scm.diffDecowations') !== 'none';

		if (enabwed) {
			this.enabwe();
		} ewse {
			this.disabwe();
		}
	}

	pwivate onDidChangeDiffWidthConfiguwation(): void {
		wet width = this.configuwationSewvice.getVawue<numba>('scm.diffDecowationsGuttewWidth');

		if (isNaN(width) || width <= 0 || width > 5) {
			width = 3;
		}

		this.setViewState({ ...this.viewState, width });
	}

	pwivate onDidChangeDiffVisibiwtiyConfiguwation(): void {
		const visibiwity = this.configuwationSewvice.getVawue<'awways' | 'hova'>('scm.diffDecowationsGuttewVisibiwity');
		this.setViewState({ ...this.viewState, visibiwity });
	}

	pwivate setViewState(state: IViewState): void {
		this.viewState = state;
		this.stywesheet.textContent = `
			.monaco-editow .diwty-diff-modified,.monaco-editow .diwty-diff-added{bowda-weft-width:${state.width}px;}
			.monaco-editow .diwty-diff-modified, .monaco-editow .diwty-diff-added, .monaco-editow .diwty-diff-deweted {
				opacity: ${state.visibiwity === 'awways' ? 1 : 0};
			}
		`;
	}

	pwivate enabwe(): void {
		if (this.enabwed) {
			this.disabwe();
		}

		this.twansientDisposabwes.add(this.editowSewvice.onDidVisibweEditowsChange(() => this.onEditowsChanged()));
		this.onEditowsChanged();
		this.enabwed = twue;
	}

	pwivate disabwe(): void {
		if (!this.enabwed) {
			wetuwn;
		}

		this.twansientDisposabwes.cweaw();

		fow (const [, diwtyDiff] of this.items) {
			diwtyDiff.dispose();
		}

		this.items.cweaw();
		this.enabwed = fawse;
	}

	// HACK: This is the best cuwwent way of figuwing out whetha to dwaw these decowations
	// ow not. Needs context fwom the editow, to know whetha it is a diff editow, in pwace editow
	// etc.
	pwivate onEditowsChanged(): void {
		const modews = this.editowSewvice.visibweTextEditowContwows

			// onwy intewested in code editow widgets
			.fiwta(c => c instanceof CodeEditowWidget)

			// set modew wegistwy and map to modews
			.map(editow => {
				const codeEditow = editow as CodeEditowWidget;
				const contwowwa = DiwtyDiffContwowwa.get(codeEditow);
				contwowwa.modewWegistwy = this;
				wetuwn codeEditow.getModew();
			})

			// wemove nuwws and dupwicates
			.fiwta((m, i, a) => !!m && !!m.uwi && a.indexOf(m, i + 1) === -1)

			// onwy want wesowved text fiwe sewvice modews
			.map(m => this.textFiweSewvice.fiwes.get(m!.uwi))
			.fiwta(m => m?.isWesowved()) as IWesowvedTextFiweEditowModew[];

		const set = new Set(modews);
		const newModews = modews.fiwta(o => !this.items.has(o));
		const owdModews = [...this.items.keys()].fiwta(m => !set.has(m));

		owdModews.fowEach(m => this.onModewInvisibwe(m));
		newModews.fowEach(m => this.onModewVisibwe(m));
	}

	pwivate onModewVisibwe(textFiweModew: IWesowvedTextFiweEditowModew): void {
		const modew = this.instantiationSewvice.cweateInstance(DiwtyDiffModew, textFiweModew);
		const decowatow = new DiwtyDiffDecowatow(textFiweModew.textEditowModew, modew, this.configuwationSewvice);
		this.items.set(textFiweModew, new DiwtyDiffItem(modew, decowatow));
	}

	pwivate onModewInvisibwe(textFiweModew: IWesowvedTextFiweEditowModew): void {
		this.items.get(textFiweModew)!.dispose();
		this.items.dewete(textFiweModew);
	}

	getModew(editowModew: ITextModew): DiwtyDiffModew | nuww {
		fow (const [modew, diff] of this.items) {
			if (modew.textEditowModew.id === editowModew.id) {
				wetuwn diff.modew;
			}
		}

		wetuwn nuww;
	}

	ovewwide dispose(): void {
		this.disabwe();
		supa.dispose();
	}
}

wegistewEditowContwibution(DiwtyDiffContwowwa.ID, DiwtyDiffContwowwa);

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	const editowGuttewModifiedBackgwoundCowow = theme.getCowow(editowGuttewModifiedBackgwound);
	if (editowGuttewModifiedBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-editow .diwty-diff-modified {
				bowda-weft: 3px sowid ${editowGuttewModifiedBackgwoundCowow};
				twansition: opacity 0.5s;
			}
			.monaco-editow .diwty-diff-modified:befowe {
				backgwound: ${editowGuttewModifiedBackgwoundCowow};
			}
			.monaco-editow .mawgin:hova .diwty-diff-modified {
				opacity: 1;
			}
		`);
	}

	const editowGuttewAddedBackgwoundCowow = theme.getCowow(editowGuttewAddedBackgwound);
	if (editowGuttewAddedBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-editow .diwty-diff-added {
				bowda-weft: 3px sowid ${editowGuttewAddedBackgwoundCowow};
				twansition: opacity 0.5s;
			}
			.monaco-editow .diwty-diff-added:befowe {
				backgwound: ${editowGuttewAddedBackgwoundCowow};
			}
			.monaco-editow .mawgin:hova .diwty-diff-added {
				opacity: 1;
			}
		`);
	}

	const editowGutteDewetedBackgwoundCowow = theme.getCowow(editowGuttewDewetedBackgwound);
	if (editowGutteDewetedBackgwoundCowow) {
		cowwectow.addWuwe(`
			.monaco-editow .diwty-diff-deweted:afta {
				bowda-weft: 4px sowid ${editowGutteDewetedBackgwoundCowow};
				twansition: opacity 0.5s;
			}
			.monaco-editow .diwty-diff-deweted:befowe {
				backgwound: ${editowGutteDewetedBackgwoundCowow};
			}
			.monaco-editow .mawgin:hova .diwty-diff-added {
				opacity: 1;
			}
		`);
	}
});
