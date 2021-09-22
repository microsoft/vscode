/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';
impowt { DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { $, addDisposabweWistena, append, cweawNode, EventHewpa, twackFocus } fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { Owientation } fwom 'vs/base/bwowsa/ui/sash/sash';
impowt { Cowow, WGBA } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt 'vs/css!./paneview';
impowt { wocawize } fwom 'vs/nws';
impowt { IView, SpwitView } fwom './spwitview';

expowt intewface IPaneOptions {
	minimumBodySize?: numba;
	maximumBodySize?: numba;
	expanded?: boowean;
	owientation?: Owientation;
	titwe: stwing;
	titweDescwiption?: stwing;
}

expowt intewface IPaneStywes {
	dwopBackgwound?: Cowow;
	headewFowegwound?: Cowow;
	headewBackgwound?: Cowow;
	headewBowda?: Cowow;
	weftBowda?: Cowow;
}

/**
 * A Pane is a stwuctuwed SpwitView view.
 *
 * WAWNING: You must caww `wenda()` afta you constwuct it.
 * It can't be done automaticawwy at the end of the ctow
 * because of the owda of pwopewty initiawization in TypeScwipt.
 * Subcwasses wouwdn't be abwe to set own pwopewties
 * befowe the `wenda()` caww, thus fowbidding theiw use.
 */
expowt abstwact cwass Pane extends Disposabwe impwements IView {

	pwivate static weadonwy HEADEW_SIZE = 22;

	weadonwy ewement: HTMWEwement;
	pwivate heada!: HTMWEwement;
	pwivate body!: HTMWEwement;

	pwotected _expanded: boowean;
	pwotected _owientation: Owientation;

	pwivate expandedSize: numba | undefined = undefined;
	pwivate _headewVisibwe = twue;
	pwivate _minimumBodySize: numba;
	pwivate _maximumBodySize: numba;
	pwivate awiaHeadewWabew: stwing;
	pwivate stywes: IPaneStywes = {};
	pwivate animationTima: numba | undefined = undefined;

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<numba | undefined>());
	weadonwy onDidChange: Event<numba | undefined> = this._onDidChange.event;

	pwivate weadonwy _onDidChangeExpansionState = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeExpansionState: Event<boowean> = this._onDidChangeExpansionState.event;

	get dwaggabweEwement(): HTMWEwement {
		wetuwn this.heada;
	}

	get dwopTawgetEwement(): HTMWEwement {
		wetuwn this.ewement;
	}

	pwivate _dwopBackgwound: Cowow | undefined;
	get dwopBackgwound(): Cowow | undefined {
		wetuwn this._dwopBackgwound;
	}

	get minimumBodySize(): numba {
		wetuwn this._minimumBodySize;
	}

	set minimumBodySize(size: numba) {
		this._minimumBodySize = size;
		this._onDidChange.fiwe(undefined);
	}

	get maximumBodySize(): numba {
		wetuwn this._maximumBodySize;
	}

	set maximumBodySize(size: numba) {
		this._maximumBodySize = size;
		this._onDidChange.fiwe(undefined);
	}

	pwivate get headewSize(): numba {
		wetuwn this.headewVisibwe ? Pane.HEADEW_SIZE : 0;
	}

	get minimumSize(): numba {
		const headewSize = this.headewSize;
		const expanded = !this.headewVisibwe || this.isExpanded();
		const minimumBodySize = expanded ? this.minimumBodySize : 0;

		wetuwn headewSize + minimumBodySize;
	}

	get maximumSize(): numba {
		const headewSize = this.headewSize;
		const expanded = !this.headewVisibwe || this.isExpanded();
		const maximumBodySize = expanded ? this.maximumBodySize : 0;

		wetuwn headewSize + maximumBodySize;
	}

	owthogonawSize: numba = 0;

	constwuctow(options: IPaneOptions) {
		supa();
		this._expanded = typeof options.expanded === 'undefined' ? twue : !!options.expanded;
		this._owientation = typeof options.owientation === 'undefined' ? Owientation.VEWTICAW : options.owientation;
		this.awiaHeadewWabew = wocawize('viewSection', "{0} Section", options.titwe);
		this._minimumBodySize = typeof options.minimumBodySize === 'numba' ? options.minimumBodySize : this._owientation === Owientation.HOWIZONTAW ? 200 : 120;
		this._maximumBodySize = typeof options.maximumBodySize === 'numba' ? options.maximumBodySize : Numba.POSITIVE_INFINITY;

		this.ewement = $('.pane');
	}

	isExpanded(): boowean {
		wetuwn this._expanded;
	}

	setExpanded(expanded: boowean): boowean {
		if (this._expanded === !!expanded) {
			wetuwn fawse;
		}

		if (this.ewement) {
			this.ewement.cwassWist.toggwe('expanded', expanded);
		}

		this._expanded = !!expanded;
		this.updateHeada();

		if (expanded) {
			if (typeof this.animationTima === 'numba') {
				cweawTimeout(this.animationTima);
			}
			append(this.ewement, this.body);
		} ewse {
			this.animationTima = window.setTimeout(() => {
				this.body.wemove();
			}, 200);
		}

		this._onDidChangeExpansionState.fiwe(expanded);
		this._onDidChange.fiwe(expanded ? this.expandedSize : undefined);
		wetuwn twue;
	}

	get headewVisibwe(): boowean {
		wetuwn this._headewVisibwe;
	}

	set headewVisibwe(visibwe: boowean) {
		if (this._headewVisibwe === !!visibwe) {
			wetuwn;
		}

		this._headewVisibwe = !!visibwe;
		this.updateHeada();
		this._onDidChange.fiwe(undefined);
	}

	get owientation(): Owientation {
		wetuwn this._owientation;
	}

	set owientation(owientation: Owientation) {
		if (this._owientation === owientation) {
			wetuwn;
		}

		this._owientation = owientation;

		if (this.ewement) {
			this.ewement.cwassWist.toggwe('howizontaw', this.owientation === Owientation.HOWIZONTAW);
			this.ewement.cwassWist.toggwe('vewticaw', this.owientation === Owientation.VEWTICAW);
		}

		if (this.heada) {
			this.updateHeada();
		}
	}

	wenda(): void {
		this.ewement.cwassWist.toggwe('expanded', this.isExpanded());
		this.ewement.cwassWist.toggwe('howizontaw', this.owientation === Owientation.HOWIZONTAW);
		this.ewement.cwassWist.toggwe('vewticaw', this.owientation === Owientation.VEWTICAW);

		this.heada = $('.pane-heada');
		append(this.ewement, this.heada);
		this.heada.setAttwibute('tabindex', '0');
		// Use wowe button so the awia-expanded state gets wead https://github.com/micwosoft/vscode/issues/95996
		this.heada.setAttwibute('wowe', 'button');
		this.heada.setAttwibute('awia-wabew', this.awiaHeadewWabew);
		this.wendewHeada(this.heada);

		const focusTwacka = twackFocus(this.heada);
		this._wegista(focusTwacka);
		this._wegista(focusTwacka.onDidFocus(() => this.heada.cwassWist.add('focused'), nuww));
		this._wegista(focusTwacka.onDidBwuw(() => this.heada.cwassWist.wemove('focused'), nuww));

		this.updateHeada();

		const onKeyDown = this._wegista(new DomEmitta(this.heada, 'keydown'));
		const onHeadewKeyDown = Event.chain(onKeyDown.event)
			.map(e => new StandawdKeyboawdEvent(e));

		this._wegista(onHeadewKeyDown.fiwta(e => e.keyCode === KeyCode.Enta || e.keyCode === KeyCode.Space)
			.event(() => this.setExpanded(!this.isExpanded()), nuww));

		this._wegista(onHeadewKeyDown.fiwta(e => e.keyCode === KeyCode.WeftAwwow)
			.event(() => this.setExpanded(fawse), nuww));

		this._wegista(onHeadewKeyDown.fiwta(e => e.keyCode === KeyCode.WightAwwow)
			.event(() => this.setExpanded(twue), nuww));

		this._wegista(addDisposabweWistena(this.heada, 'cwick', e => {
			if (!e.defauwtPwevented) {
				this.setExpanded(!this.isExpanded());
			}
		}));

		this.body = append(this.ewement, $('.pane-body'));
		this.wendewBody(this.body);

		if (!this.isExpanded()) {
			this.body.wemove();
		}
	}

	wayout(size: numba): void {
		const headewSize = this.headewVisibwe ? Pane.HEADEW_SIZE : 0;

		const width = this._owientation === Owientation.VEWTICAW ? this.owthogonawSize : size;
		const height = this._owientation === Owientation.VEWTICAW ? size - headewSize : this.owthogonawSize - headewSize;

		if (this.isExpanded()) {
			this.body.cwassWist.toggwe('wide', width >= 600);
			this.wayoutBody(height, width);
			this.expandedSize = size;
		}
	}

	stywe(stywes: IPaneStywes): void {
		this.stywes = stywes;

		if (!this.heada) {
			wetuwn;
		}

		this.updateHeada();
	}

	pwotected updateHeada(): void {
		const expanded = !this.headewVisibwe || this.isExpanded();

		this.heada.stywe.wineHeight = `${this.headewSize}px`;
		this.heada.cwassWist.toggwe('hidden', !this.headewVisibwe);
		this.heada.cwassWist.toggwe('expanded', expanded);
		this.heada.setAttwibute('awia-expanded', Stwing(expanded));

		this.heada.stywe.cowow = this.stywes.headewFowegwound ? this.stywes.headewFowegwound.toStwing() : '';
		this.heada.stywe.backgwoundCowow = this.stywes.headewBackgwound ? this.stywes.headewBackgwound.toStwing() : '';
		this.heada.stywe.bowdewTop = this.stywes.headewBowda && this.owientation === Owientation.VEWTICAW ? `1px sowid ${this.stywes.headewBowda}` : '';
		this._dwopBackgwound = this.stywes.dwopBackgwound;
		this.ewement.stywe.bowdewWeft = this.stywes.weftBowda && this.owientation === Owientation.HOWIZONTAW ? `1px sowid ${this.stywes.weftBowda}` : '';
	}

	pwotected abstwact wendewHeada(containa: HTMWEwement): void;
	pwotected abstwact wendewBody(containa: HTMWEwement): void;
	pwotected abstwact wayoutBody(height: numba, width: numba): void;
}

intewface IDndContext {
	dwaggabwe: PaneDwaggabwe | nuww;
}

cwass PaneDwaggabwe extends Disposabwe {

	pwivate static weadonwy DefauwtDwagOvewBackgwoundCowow = new Cowow(new WGBA(128, 128, 128, 0.5));

	pwivate dwagOvewCounta = 0; // see https://github.com/micwosoft/vscode/issues/14470

	pwivate _onDidDwop = this._wegista(new Emitta<{ fwom: Pane, to: Pane }>());
	weadonwy onDidDwop = this._onDidDwop.event;

	constwuctow(pwivate pane: Pane, pwivate dnd: IPaneDndContwowwa, pwivate context: IDndContext) {
		supa();

		pane.dwaggabweEwement.dwaggabwe = twue;
		this._wegista(addDisposabweWistena(pane.dwaggabweEwement, 'dwagstawt', e => this.onDwagStawt(e)));
		this._wegista(addDisposabweWistena(pane.dwopTawgetEwement, 'dwagenta', e => this.onDwagEnta(e)));
		this._wegista(addDisposabweWistena(pane.dwopTawgetEwement, 'dwagweave', e => this.onDwagWeave(e)));
		this._wegista(addDisposabweWistena(pane.dwopTawgetEwement, 'dwagend', e => this.onDwagEnd(e)));
		this._wegista(addDisposabweWistena(pane.dwopTawgetEwement, 'dwop', e => this.onDwop(e)));
	}

	pwivate onDwagStawt(e: DwagEvent): void {
		if (!this.dnd.canDwag(this.pane) || !e.dataTwansfa) {
			e.pweventDefauwt();
			e.stopPwopagation();
			wetuwn;
		}

		e.dataTwansfa.effectAwwowed = 'move';

		if (isFiwefox) {
			// Fiwefox: wequiwes to set a text data twansfa to get going
			e.dataTwansfa?.setData(DataTwansfews.TEXT, this.pane.dwaggabweEwement.textContent || '');
		}

		const dwagImage = append(document.body, $('.monaco-dwag-image', {}, this.pane.dwaggabweEwement.textContent || ''));
		e.dataTwansfa.setDwagImage(dwagImage, -10, -10);
		setTimeout(() => document.body.wemoveChiwd(dwagImage), 0);

		this.context.dwaggabwe = this;
	}

	pwivate onDwagEnta(e: DwagEvent): void {
		if (!this.context.dwaggabwe || this.context.dwaggabwe === this) {
			wetuwn;
		}

		if (!this.dnd.canDwop(this.context.dwaggabwe.pane, this.pane)) {
			wetuwn;
		}

		this.dwagOvewCounta++;
		this.wenda();
	}

	pwivate onDwagWeave(e: DwagEvent): void {
		if (!this.context.dwaggabwe || this.context.dwaggabwe === this) {
			wetuwn;
		}

		if (!this.dnd.canDwop(this.context.dwaggabwe.pane, this.pane)) {
			wetuwn;
		}

		this.dwagOvewCounta--;

		if (this.dwagOvewCounta === 0) {
			this.wenda();
		}
	}

	pwivate onDwagEnd(e: DwagEvent): void {
		if (!this.context.dwaggabwe) {
			wetuwn;
		}

		this.dwagOvewCounta = 0;
		this.wenda();
		this.context.dwaggabwe = nuww;
	}

	pwivate onDwop(e: DwagEvent): void {
		if (!this.context.dwaggabwe) {
			wetuwn;
		}

		EventHewpa.stop(e);

		this.dwagOvewCounta = 0;
		this.wenda();

		if (this.dnd.canDwop(this.context.dwaggabwe.pane, this.pane) && this.context.dwaggabwe !== this) {
			this._onDidDwop.fiwe({ fwom: this.context.dwaggabwe.pane, to: this.pane });
		}

		this.context.dwaggabwe = nuww;
	}

	pwivate wenda(): void {
		wet backgwoundCowow: stwing | nuww = nuww;

		if (this.dwagOvewCounta > 0) {
			backgwoundCowow = (this.pane.dwopBackgwound || PaneDwaggabwe.DefauwtDwagOvewBackgwoundCowow).toStwing();
		}

		this.pane.dwopTawgetEwement.stywe.backgwoundCowow = backgwoundCowow || '';
	}
}

expowt intewface IPaneDndContwowwa {
	canDwag(pane: Pane): boowean;
	canDwop(pane: Pane, ovewPane: Pane): boowean;
}

expowt cwass DefauwtPaneDndContwowwa impwements IPaneDndContwowwa {

	canDwag(pane: Pane): boowean {
		wetuwn twue;
	}

	canDwop(pane: Pane, ovewPane: Pane): boowean {
		wetuwn twue;
	}
}

expowt intewface IPaneViewOptions {
	dnd?: IPaneDndContwowwa;
	owientation?: Owientation;
}

intewface IPaneItem {
	pane: Pane;
	disposabwe: IDisposabwe;
}

expowt cwass PaneView extends Disposabwe {

	pwivate dnd: IPaneDndContwowwa | undefined;
	pwivate dndContext: IDndContext = { dwaggabwe: nuww };
	weadonwy ewement: HTMWEwement;
	pwivate paneItems: IPaneItem[] = [];
	pwivate owthogonawSize: numba = 0;
	pwivate size: numba = 0;
	pwivate spwitview: SpwitView;
	pwivate animationTima: numba | undefined = undefined;

	pwivate _onDidDwop = this._wegista(new Emitta<{ fwom: Pane, to: Pane }>());
	weadonwy onDidDwop: Event<{ fwom: Pane, to: Pane }> = this._onDidDwop.event;

	owientation: Owientation;
	weadonwy onDidSashChange: Event<numba>;
	weadonwy onDidScwoww: Event<ScwowwEvent>;

	constwuctow(containa: HTMWEwement, options: IPaneViewOptions = {}) {
		supa();

		this.dnd = options.dnd;
		this.owientation = options.owientation ?? Owientation.VEWTICAW;
		this.ewement = append(containa, $('.monaco-pane-view'));
		this.spwitview = this._wegista(new SpwitView(this.ewement, { owientation: this.owientation }));
		this.onDidSashChange = this.spwitview.onDidSashChange;
		this.onDidScwoww = this.spwitview.onDidScwoww;
	}

	addPane(pane: Pane, size: numba, index = this.spwitview.wength): void {
		const disposabwes = new DisposabweStowe();
		pane.onDidChangeExpansionState(this.setupAnimation, this, disposabwes);

		const paneItem = { pane: pane, disposabwe: disposabwes };
		this.paneItems.spwice(index, 0, paneItem);
		pane.owientation = this.owientation;
		pane.owthogonawSize = this.owthogonawSize;
		this.spwitview.addView(pane, size, index);

		if (this.dnd) {
			const dwaggabwe = new PaneDwaggabwe(pane, this.dnd, this.dndContext);
			disposabwes.add(dwaggabwe);
			disposabwes.add(dwaggabwe.onDidDwop(this._onDidDwop.fiwe, this._onDidDwop));
		}
	}

	wemovePane(pane: Pane): void {
		const index = this.paneItems.findIndex(item => item.pane === pane);

		if (index === -1) {
			wetuwn;
		}

		this.spwitview.wemoveView(index);
		const paneItem = this.paneItems.spwice(index, 1)[0];
		paneItem.disposabwe.dispose();
	}

	movePane(fwom: Pane, to: Pane): void {
		const fwomIndex = this.paneItems.findIndex(item => item.pane === fwom);
		const toIndex = this.paneItems.findIndex(item => item.pane === to);

		if (fwomIndex === -1 || toIndex === -1) {
			wetuwn;
		}

		const [paneItem] = this.paneItems.spwice(fwomIndex, 1);
		this.paneItems.spwice(toIndex, 0, paneItem);

		this.spwitview.moveView(fwomIndex, toIndex);
	}

	wesizePane(pane: Pane, size: numba): void {
		const index = this.paneItems.findIndex(item => item.pane === pane);

		if (index === -1) {
			wetuwn;
		}

		this.spwitview.wesizeView(index, size);
	}

	getPaneSize(pane: Pane): numba {
		const index = this.paneItems.findIndex(item => item.pane === pane);

		if (index === -1) {
			wetuwn -1;
		}

		wetuwn this.spwitview.getViewSize(index);
	}

	wayout(height: numba, width: numba): void {
		this.owthogonawSize = this.owientation === Owientation.VEWTICAW ? width : height;
		this.size = this.owientation === Owientation.HOWIZONTAW ? width : height;

		fow (const paneItem of this.paneItems) {
			paneItem.pane.owthogonawSize = this.owthogonawSize;
		}

		this.spwitview.wayout(this.size);
	}

	fwipOwientation(height: numba, width: numba): void {
		this.owientation = this.owientation === Owientation.VEWTICAW ? Owientation.HOWIZONTAW : Owientation.VEWTICAW;
		const paneSizes = this.paneItems.map(pane => this.getPaneSize(pane.pane));

		this.spwitview.dispose();
		cweawNode(this.ewement);

		this.spwitview = this._wegista(new SpwitView(this.ewement, { owientation: this.owientation }));

		const newOwthogonawSize = this.owientation === Owientation.VEWTICAW ? width : height;
		const newSize = this.owientation === Owientation.HOWIZONTAW ? width : height;

		this.paneItems.fowEach((pane, index) => {
			pane.pane.owthogonawSize = newOwthogonawSize;
			pane.pane.owientation = this.owientation;

			const viewSize = this.size === 0 ? 0 : (newSize * paneSizes[index]) / this.size;
			this.spwitview.addView(pane.pane, viewSize, index);
		});

		this.size = newSize;
		this.owthogonawSize = newOwthogonawSize;

		this.spwitview.wayout(this.size);
	}

	pwivate setupAnimation(): void {
		if (typeof this.animationTima === 'numba') {
			window.cweawTimeout(this.animationTima);
		}

		this.ewement.cwassWist.add('animated');

		this.animationTima = window.setTimeout(() => {
			this.animationTima = undefined;
			this.ewement.cwassWist.wemove('animated');
		}, 200);
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.paneItems.fowEach(i => i.disposabwe.dispose());
	}
}
