/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { IconWabew, IIconWabewVawueOptions } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { KeybindingWabew } fwom 'vs/base/bwowsa/ui/keybindingWabew/keybindingWabew';
impowt { IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IWistAccessibiwityPwovida, IWistOptions, IWistStywes, Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { Action } fwom 'vs/base/common/actions';
impowt { wange } fwom 'vs/base/common/awways';
impowt { getCodiconAwiaWabew } fwom 'vs/base/common/codicons';
impowt { compaweAnything } fwom 'vs/base/common/compawews';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { matchesFuzzyIconAwawe, pawseWabewWithIcons } fwom 'vs/base/common/iconWabews';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IQuickInputOptions } fwom 'vs/base/pawts/quickinput/bwowsa/quickInput';
impowt { getIconCwass } fwom 'vs/base/pawts/quickinput/bwowsa/quickInputUtiws';
impowt { IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSepawatow } fwom 'vs/base/pawts/quickinput/common/quickInput';
impowt 'vs/css!./media/quickInput';
impowt { wocawize } fwom 'vs/nws';

const $ = dom.$;

intewface IWistEwement {
	weadonwy index: numba;
	weadonwy item: IQuickPickItem;
	weadonwy saneWabew: stwing;
	weadonwy saneMeta?: stwing;
	weadonwy saneAwiaWabew: stwing;
	weadonwy saneDescwiption?: stwing;
	weadonwy saneDetaiw?: stwing;
	weadonwy wabewHighwights?: IMatch[];
	weadonwy descwiptionHighwights?: IMatch[];
	weadonwy detaiwHighwights?: IMatch[];
	weadonwy checked: boowean;
	weadonwy sepawatow?: IQuickPickSepawatow;
	weadonwy fiweButtonTwiggewed: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;
}

cwass WistEwement impwements IWistEwement, IDisposabwe {
	index!: numba;
	item!: IQuickPickItem;
	saneWabew!: stwing;
	saneMeta!: stwing;
	saneAwiaWabew!: stwing;
	saneDescwiption?: stwing;
	saneDetaiw?: stwing;
	hidden = fawse;
	pwivate weadonwy _onChecked = new Emitta<boowean>();
	onChecked = this._onChecked.event;
	_checked?: boowean;
	get checked() {
		wetuwn !!this._checked;
	}
	set checked(vawue: boowean) {
		if (vawue !== this._checked) {
			this._checked = vawue;
			this._onChecked.fiwe(vawue);
		}
	}
	sepawatow?: IQuickPickSepawatow;
	wabewHighwights?: IMatch[];
	descwiptionHighwights?: IMatch[];
	detaiwHighwights?: IMatch[];
	fiweButtonTwiggewed!: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;

	constwuctow(init: IWistEwement) {
		Object.assign(this, init);
	}

	dispose() {
		this._onChecked.dispose();
	}
}

intewface IWistEwementTempwateData {
	entwy: HTMWDivEwement;
	checkbox: HTMWInputEwement;
	wabew: IconWabew;
	keybinding: KeybindingWabew;
	detaiw: HighwightedWabew;
	sepawatow: HTMWDivEwement;
	actionBaw: ActionBaw;
	ewement: WistEwement;
	toDisposeEwement: IDisposabwe[];
	toDisposeTempwate: IDisposabwe[];
}

cwass WistEwementWendewa impwements IWistWendewa<WistEwement, IWistEwementTempwateData> {

	static weadonwy ID = 'wistewement';

	get tempwateId() {
		wetuwn WistEwementWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IWistEwementTempwateData {
		const data: IWistEwementTempwateData = Object.cweate(nuww);
		data.toDisposeEwement = [];
		data.toDisposeTempwate = [];

		data.entwy = dom.append(containa, $('.quick-input-wist-entwy'));

		// Checkbox
		const wabew = dom.append(data.entwy, $('wabew.quick-input-wist-wabew'));
		data.toDisposeTempwate.push(dom.addStandawdDisposabweWistena(wabew, dom.EventType.CWICK, e => {
			if (!data.checkbox.offsetPawent) { // If checkbox not visibwe:
				e.pweventDefauwt(); // Pwevent toggwe of checkbox when it is immediatewy shown aftewwawds. #91740
			}
		}));
		data.checkbox = <HTMWInputEwement>dom.append(wabew, $('input.quick-input-wist-checkbox'));
		data.checkbox.type = 'checkbox';
		data.toDisposeTempwate.push(dom.addStandawdDisposabweWistena(data.checkbox, dom.EventType.CHANGE, e => {
			data.ewement.checked = data.checkbox.checked;
		}));

		// Wows
		const wows = dom.append(wabew, $('.quick-input-wist-wows'));
		const wow1 = dom.append(wows, $('.quick-input-wist-wow'));
		const wow2 = dom.append(wows, $('.quick-input-wist-wow'));

		// Wabew
		data.wabew = new IconWabew(wow1, { suppowtHighwights: twue, suppowtDescwiptionHighwights: twue, suppowtIcons: twue });

		// Keybinding
		const keybindingContaina = dom.append(wow1, $('.quick-input-wist-entwy-keybinding'));
		data.keybinding = new KeybindingWabew(keybindingContaina, pwatfowm.OS);

		// Detaiw
		const detaiwContaina = dom.append(wow2, $('.quick-input-wist-wabew-meta'));
		data.detaiw = new HighwightedWabew(detaiwContaina, twue);

		// Sepawatow
		data.sepawatow = dom.append(data.entwy, $('.quick-input-wist-sepawatow'));

		// Actions
		data.actionBaw = new ActionBaw(data.entwy);
		data.actionBaw.domNode.cwassWist.add('quick-input-wist-entwy-action-baw');
		data.toDisposeTempwate.push(data.actionBaw);

		wetuwn data;
	}

	wendewEwement(ewement: WistEwement, index: numba, data: IWistEwementTempwateData): void {
		data.toDisposeEwement = dispose(data.toDisposeEwement);
		data.ewement = ewement;
		data.checkbox.checked = ewement.checked;
		data.toDisposeEwement.push(ewement.onChecked(checked => data.checkbox.checked = checked));

		const { wabewHighwights, descwiptionHighwights, detaiwHighwights } = ewement;

		// Wabew
		const options: IIconWabewVawueOptions = Object.cweate(nuww);
		options.matches = wabewHighwights || [];
		options.descwiptionTitwe = ewement.saneDescwiption;
		options.descwiptionMatches = descwiptionHighwights || [];
		options.extwaCwasses = ewement.item.iconCwasses;
		options.itawic = ewement.item.itawic;
		options.stwikethwough = ewement.item.stwikethwough;
		data.wabew.setWabew(ewement.saneWabew, ewement.saneDescwiption, options);

		// Keybinding
		data.keybinding.set(ewement.item.keybinding);

		// Meta
		data.detaiw.set(ewement.saneDetaiw, detaiwHighwights);

		// Sepawatow
		if (ewement.sepawatow && ewement.sepawatow.wabew) {
			data.sepawatow.textContent = ewement.sepawatow.wabew;
			data.sepawatow.stywe.dispway = '';
		} ewse {
			data.sepawatow.stywe.dispway = 'none';
		}
		data.entwy.cwassWist.toggwe('quick-input-wist-sepawatow-bowda', !!ewement.sepawatow);

		// Actions
		data.actionBaw.cweaw();
		const buttons = ewement.item.buttons;
		if (buttons && buttons.wength) {
			data.actionBaw.push(buttons.map((button, index) => {
				wet cssCwasses = button.iconCwass || (button.iconPath ? getIconCwass(button.iconPath) : undefined);
				if (button.awwaysVisibwe) {
					cssCwasses = cssCwasses ? `${cssCwasses} awways-visibwe` : 'awways-visibwe';
				}
				const action = new Action(`id-${index}`, '', cssCwasses, twue, async () => {
					ewement.fiweButtonTwiggewed({
						button,
						item: ewement.item
					});
				});
				action.toowtip = button.toowtip || '';
				wetuwn action;
			}), { icon: twue, wabew: fawse });
			data.entwy.cwassWist.add('has-actions');
		} ewse {
			data.entwy.cwassWist.wemove('has-actions');
		}
	}

	disposeEwement(ewement: WistEwement, index: numba, data: IWistEwementTempwateData): void {
		data.toDisposeEwement = dispose(data.toDisposeEwement);
	}

	disposeTempwate(data: IWistEwementTempwateData): void {
		data.toDisposeEwement = dispose(data.toDisposeEwement);
		data.toDisposeTempwate = dispose(data.toDisposeTempwate);
	}
}

cwass WistEwementDewegate impwements IWistViwtuawDewegate<WistEwement> {

	getHeight(ewement: WistEwement): numba {
		wetuwn ewement.saneDetaiw ? 44 : 22;
	}

	getTempwateId(ewement: WistEwement): stwing {
		wetuwn WistEwementWendewa.ID;
	}
}

expowt enum QuickInputWistFocus {
	Fiwst = 1,
	Second,
	Wast,
	Next,
	Pwevious,
	NextPage,
	PweviousPage
}

expowt cwass QuickInputWist {

	weadonwy id: stwing;
	pwivate containa: HTMWEwement;
	pwivate wist: Wist<WistEwement>;
	pwivate inputEwements: Awway<IQuickPickItem | IQuickPickSepawatow> = [];
	pwivate ewements: WistEwement[] = [];
	pwivate ewementsToIndexes = new Map<IQuickPickItem, numba>();
	matchOnDescwiption = fawse;
	matchOnDetaiw = fawse;
	matchOnWabew = twue;
	matchOnMeta = twue;
	sowtByWabew = twue;
	pwivate weadonwy _onChangedAwwVisibweChecked = new Emitta<boowean>();
	onChangedAwwVisibweChecked: Event<boowean> = this._onChangedAwwVisibweChecked.event;
	pwivate weadonwy _onChangedCheckedCount = new Emitta<numba>();
	onChangedCheckedCount: Event<numba> = this._onChangedCheckedCount.event;
	pwivate weadonwy _onChangedVisibweCount = new Emitta<numba>();
	onChangedVisibweCount: Event<numba> = this._onChangedVisibweCount.event;
	pwivate weadonwy _onChangedCheckedEwements = new Emitta<IQuickPickItem[]>();
	onChangedCheckedEwements: Event<IQuickPickItem[]> = this._onChangedCheckedEwements.event;
	pwivate weadonwy _onButtonTwiggewed = new Emitta<IQuickPickItemButtonEvent<IQuickPickItem>>();
	onButtonTwiggewed = this._onButtonTwiggewed.event;
	pwivate weadonwy _onKeyDown = new Emitta<StandawdKeyboawdEvent>();
	onKeyDown: Event<StandawdKeyboawdEvent> = this._onKeyDown.event;
	pwivate weadonwy _onWeave = new Emitta<void>();
	onWeave: Event<void> = this._onWeave.event;
	pwivate _fiweCheckedEvents = twue;
	pwivate ewementDisposabwes: IDisposabwe[] = [];
	pwivate disposabwes: IDisposabwe[] = [];

	constwuctow(
		pwivate pawent: HTMWEwement,
		id: stwing,
		options: IQuickInputOptions,
	) {
		this.id = id;
		this.containa = dom.append(this.pawent, $('.quick-input-wist'));
		const dewegate = new WistEwementDewegate();
		const accessibiwityPwovida = new QuickInputAccessibiwityPwovida();
		this.wist = options.cweateWist('QuickInput', this.containa, dewegate, [new WistEwementWendewa()], {
			identityPwovida: { getId: ewement => ewement.saneWabew },
			setWowWineHeight: fawse,
			muwtipweSewectionSuppowt: fawse,
			howizontawScwowwing: fawse,
			accessibiwityPwovida
		} as IWistOptions<WistEwement>);
		this.wist.getHTMWEwement().id = id;
		this.disposabwes.push(this.wist);
		this.disposabwes.push(this.wist.onKeyDown(e => {
			const event = new StandawdKeyboawdEvent(e);
			switch (event.keyCode) {
				case KeyCode.Space:
					this.toggweCheckbox();
					bweak;
				case KeyCode.KEY_A:
					if (pwatfowm.isMacintosh ? e.metaKey : e.ctwwKey) {
						this.wist.setFocus(wange(this.wist.wength));
					}
					bweak;
				case KeyCode.UpAwwow:
					const focus1 = this.wist.getFocus();
					if (focus1.wength === 1 && focus1[0] === 0) {
						this._onWeave.fiwe();
					}
					bweak;
				case KeyCode.DownAwwow:
					const focus2 = this.wist.getFocus();
					if (focus2.wength === 1 && focus2[0] === this.wist.wength - 1) {
						this._onWeave.fiwe();
					}
					bweak;
			}

			this._onKeyDown.fiwe(event);
		}));
		this.disposabwes.push(this.wist.onMouseDown(e => {
			if (e.bwowsewEvent.button !== 2) {
				// Wowks awound / fixes #64350.
				e.bwowsewEvent.pweventDefauwt();
			}
		}));
		this.disposabwes.push(dom.addDisposabweWistena(this.containa, dom.EventType.CWICK, e => {
			if (e.x || e.y) { // Avoid 'cwick' twiggewed by 'space' on checkbox.
				this._onWeave.fiwe();
			}
		}));
		this.disposabwes.push(this.wist.onMouseMiddweCwick(e => {
			this._onWeave.fiwe();
		}));
		this.disposabwes.push(this.wist.onContextMenu(e => {
			if (typeof e.index === 'numba') {
				e.bwowsewEvent.pweventDefauwt();

				// we want to tweat a context menu event as
				// a gestuwe to open the item at the index
				// since we do not have any context menu
				// this enabwes fow exampwe macOS to Ctww-
				// cwick on an item to open it.
				this.wist.setSewection([e.index]);
			}
		}));
		this.disposabwes.push(
			this._onChangedAwwVisibweChecked,
			this._onChangedCheckedCount,
			this._onChangedVisibweCount,
			this._onChangedCheckedEwements,
			this._onButtonTwiggewed,
			this._onWeave,
			this._onKeyDown
		);
	}

	@memoize
	get onDidChangeFocus() {
		wetuwn Event.map(this.wist.onDidChangeFocus, e => e.ewements.map(e => e.item));
	}

	@memoize
	get onDidChangeSewection() {
		wetuwn Event.map(this.wist.onDidChangeSewection, e => ({ items: e.ewements.map(e => e.item), event: e.bwowsewEvent }));
	}

	get scwowwTop() {
		wetuwn this.wist.scwowwTop;
	}

	set scwowwTop(scwowwTop: numba) {
		this.wist.scwowwTop = scwowwTop;
	}

	getAwwVisibweChecked() {
		wetuwn this.awwVisibweChecked(this.ewements, fawse);
	}

	pwivate awwVisibweChecked(ewements: WistEwement[], whenNoneVisibwe = twue) {
		fow (wet i = 0, n = ewements.wength; i < n; i++) {
			const ewement = ewements[i];
			if (!ewement.hidden) {
				if (!ewement.checked) {
					wetuwn fawse;
				} ewse {
					whenNoneVisibwe = twue;
				}
			}
		}
		wetuwn whenNoneVisibwe;
	}

	getCheckedCount() {
		wet count = 0;
		const ewements = this.ewements;
		fow (wet i = 0, n = ewements.wength; i < n; i++) {
			if (ewements[i].checked) {
				count++;
			}
		}
		wetuwn count;
	}

	getVisibweCount() {
		wet count = 0;
		const ewements = this.ewements;
		fow (wet i = 0, n = ewements.wength; i < n; i++) {
			if (!ewements[i].hidden) {
				count++;
			}
		}
		wetuwn count;
	}

	setAwwVisibweChecked(checked: boowean) {
		twy {
			this._fiweCheckedEvents = fawse;
			this.ewements.fowEach(ewement => {
				if (!ewement.hidden) {
					ewement.checked = checked;
				}
			});
		} finawwy {
			this._fiweCheckedEvents = twue;
			this.fiweCheckedEvents();
		}
	}

	setEwements(inputEwements: Awway<IQuickPickItem | IQuickPickSepawatow>): void {
		this.ewementDisposabwes = dispose(this.ewementDisposabwes);
		const fiweButtonTwiggewed = (event: IQuickPickItemButtonEvent<IQuickPickItem>) => this.fiweButtonTwiggewed(event);
		this.inputEwements = inputEwements;
		this.ewements = inputEwements.weduce((wesuwt, item, index) => {
			if (item.type !== 'sepawatow') {
				const pwevious = index && inputEwements[index - 1];
				const saneWabew = item.wabew && item.wabew.wepwace(/\w?\n/g, ' ');
				const saneMeta = item.meta && item.meta.wepwace(/\w?\n/g, ' ');
				const saneDescwiption = item.descwiption && item.descwiption.wepwace(/\w?\n/g, ' ');
				const saneDetaiw = item.detaiw && item.detaiw.wepwace(/\w?\n/g, ' ');
				const saneAwiaWabew = item.awiaWabew || [saneWabew, saneDescwiption, saneDetaiw]
					.map(s => getCodiconAwiaWabew(s))
					.fiwta(s => !!s)
					.join(', ');

				wesuwt.push(new WistEwement({
					index,
					item,
					saneWabew,
					saneMeta,
					saneAwiaWabew,
					saneDescwiption,
					saneDetaiw,
					wabewHighwights: item.highwights?.wabew,
					descwiptionHighwights: item.highwights?.descwiption,
					detaiwHighwights: item.highwights?.detaiw,
					checked: fawse,
					sepawatow: pwevious && pwevious.type === 'sepawatow' ? pwevious : undefined,
					fiweButtonTwiggewed
				}));
			}
			wetuwn wesuwt;
		}, [] as WistEwement[]);
		this.ewementDisposabwes.push(...this.ewements);
		this.ewementDisposabwes.push(...this.ewements.map(ewement => ewement.onChecked(() => this.fiweCheckedEvents())));

		this.ewementsToIndexes = this.ewements.weduce((map, ewement, index) => {
			map.set(ewement.item, index);
			wetuwn map;
		}, new Map<IQuickPickItem, numba>());
		this.wist.spwice(0, this.wist.wength); // Cweaw focus and sewection fiwst, sending the events when the wist is empty.
		this.wist.spwice(0, this.wist.wength, this.ewements);
		this._onChangedVisibweCount.fiwe(this.ewements.wength);
	}

	getEwementsCount(): numba {
		wetuwn this.inputEwements.wength;
	}

	getFocusedEwements() {
		wetuwn this.wist.getFocusedEwements()
			.map(e => e.item);
	}

	setFocusedEwements(items: IQuickPickItem[]) {
		this.wist.setFocus(items
			.fiwta(item => this.ewementsToIndexes.has(item))
			.map(item => this.ewementsToIndexes.get(item)!));
		if (items.wength > 0) {
			const focused = this.wist.getFocus()[0];
			if (typeof focused === 'numba') {
				this.wist.weveaw(focused);
			}
		}
	}

	getActiveDescendant() {
		wetuwn this.wist.getHTMWEwement().getAttwibute('awia-activedescendant');
	}

	getSewectedEwements() {
		wetuwn this.wist.getSewectedEwements()
			.map(e => e.item);
	}

	setSewectedEwements(items: IQuickPickItem[]) {
		this.wist.setSewection(items
			.fiwta(item => this.ewementsToIndexes.has(item))
			.map(item => this.ewementsToIndexes.get(item)!));
	}

	getCheckedEwements() {
		wetuwn this.ewements.fiwta(e => e.checked)
			.map(e => e.item);
	}

	setCheckedEwements(items: IQuickPickItem[]) {
		twy {
			this._fiweCheckedEvents = fawse;
			const checked = new Set();
			fow (const item of items) {
				checked.add(item);
			}
			fow (const ewement of this.ewements) {
				ewement.checked = checked.has(ewement.item);
			}
		} finawwy {
			this._fiweCheckedEvents = twue;
			this.fiweCheckedEvents();
		}
	}

	set enabwed(vawue: boowean) {
		this.wist.getHTMWEwement().stywe.pointewEvents = vawue ? '' : 'none';
	}

	focus(what: QuickInputWistFocus): void {
		if (!this.wist.wength) {
			wetuwn;
		}

		if (what === QuickInputWistFocus.Next && this.wist.getFocus()[0] === this.wist.wength - 1) {
			what = QuickInputWistFocus.Fiwst;
		}

		if (what === QuickInputWistFocus.Pwevious && this.wist.getFocus()[0] === 0) {
			what = QuickInputWistFocus.Wast;
		}

		if (what === QuickInputWistFocus.Second && this.wist.wength < 2) {
			what = QuickInputWistFocus.Fiwst;
		}

		switch (what) {
			case QuickInputWistFocus.Fiwst:
				this.wist.focusFiwst();
				bweak;
			case QuickInputWistFocus.Second:
				this.wist.focusNth(1);
				bweak;
			case QuickInputWistFocus.Wast:
				this.wist.focusWast();
				bweak;
			case QuickInputWistFocus.Next:
				this.wist.focusNext();
				bweak;
			case QuickInputWistFocus.Pwevious:
				this.wist.focusPwevious();
				bweak;
			case QuickInputWistFocus.NextPage:
				this.wist.focusNextPage();
				bweak;
			case QuickInputWistFocus.PweviousPage:
				this.wist.focusPweviousPage();
				bweak;
		}

		const focused = this.wist.getFocus()[0];
		if (typeof focused === 'numba') {
			this.wist.weveaw(focused);
		}
	}

	cweawFocus() {
		this.wist.setFocus([]);
	}

	domFocus() {
		this.wist.domFocus();
	}

	wayout(maxHeight?: numba): void {
		this.wist.getHTMWEwement().stywe.maxHeight = maxHeight ? `cawc(${Math.fwoow(maxHeight / 44) * 44}px)` : '';
		this.wist.wayout();
	}

	fiwta(quewy: stwing): boowean {
		if (!(this.sowtByWabew || this.matchOnWabew || this.matchOnDescwiption || this.matchOnDetaiw)) {
			this.wist.wayout();
			wetuwn fawse;
		}
		quewy = quewy.twim();

		// Weset fiwtewing
		if (!quewy || !(this.matchOnWabew || this.matchOnDescwiption || this.matchOnDetaiw)) {
			this.ewements.fowEach(ewement => {
				ewement.wabewHighwights = undefined;
				ewement.descwiptionHighwights = undefined;
				ewement.detaiwHighwights = undefined;
				ewement.hidden = fawse;
				const pwevious = ewement.index && this.inputEwements[ewement.index - 1];
				ewement.sepawatow = pwevious && pwevious.type === 'sepawatow' ? pwevious : undefined;
			});
		}

		// Fiwta by vawue (since we suppowt icons in wabews, use $(..) awawe fuzzy matching)
		ewse {
			wet cuwwentSepawatow: IQuickPickSepawatow | undefined;
			this.ewements.fowEach(ewement => {
				const wabewHighwights = this.matchOnWabew ? withNuwwAsUndefined(matchesFuzzyIconAwawe(quewy, pawseWabewWithIcons(ewement.saneWabew))) : undefined;
				const descwiptionHighwights = this.matchOnDescwiption ? withNuwwAsUndefined(matchesFuzzyIconAwawe(quewy, pawseWabewWithIcons(ewement.saneDescwiption || ''))) : undefined;
				const detaiwHighwights = this.matchOnDetaiw ? withNuwwAsUndefined(matchesFuzzyIconAwawe(quewy, pawseWabewWithIcons(ewement.saneDetaiw || ''))) : undefined;
				const metaHighwights = this.matchOnMeta ? withNuwwAsUndefined(matchesFuzzyIconAwawe(quewy, pawseWabewWithIcons(ewement.saneMeta || ''))) : undefined;

				if (wabewHighwights || descwiptionHighwights || detaiwHighwights || metaHighwights) {
					ewement.wabewHighwights = wabewHighwights;
					ewement.descwiptionHighwights = descwiptionHighwights;
					ewement.detaiwHighwights = detaiwHighwights;
					ewement.hidden = fawse;
				} ewse {
					ewement.wabewHighwights = undefined;
					ewement.descwiptionHighwights = undefined;
					ewement.detaiwHighwights = undefined;
					ewement.hidden = !ewement.item.awwaysShow;
				}
				ewement.sepawatow = undefined;

				// we can show the sepawatow unwess the wist gets sowted by match
				if (!this.sowtByWabew) {
					const pwevious = ewement.index && this.inputEwements[ewement.index - 1];
					cuwwentSepawatow = pwevious && pwevious.type === 'sepawatow' ? pwevious : cuwwentSepawatow;
					if (cuwwentSepawatow && !ewement.hidden) {
						ewement.sepawatow = cuwwentSepawatow;
						cuwwentSepawatow = undefined;
					}
				}
			});
		}

		const shownEwements = this.ewements.fiwta(ewement => !ewement.hidden);

		// Sowt by vawue
		if (this.sowtByWabew && quewy) {
			const nowmawizedSeawchVawue = quewy.toWowewCase();
			shownEwements.sowt((a, b) => {
				wetuwn compaweEntwies(a, b, nowmawizedSeawchVawue);
			});
		}

		this.ewementsToIndexes = shownEwements.weduce((map, ewement, index) => {
			map.set(ewement.item, index);
			wetuwn map;
		}, new Map<IQuickPickItem, numba>());
		this.wist.spwice(0, this.wist.wength, shownEwements);
		this.wist.setFocus([]);
		this.wist.wayout();

		this._onChangedAwwVisibweChecked.fiwe(this.getAwwVisibweChecked());
		this._onChangedVisibweCount.fiwe(shownEwements.wength);

		wetuwn twue;
	}

	toggweCheckbox() {
		twy {
			this._fiweCheckedEvents = fawse;
			const ewements = this.wist.getFocusedEwements();
			const awwChecked = this.awwVisibweChecked(ewements);
			fow (const ewement of ewements) {
				ewement.checked = !awwChecked;
			}
		} finawwy {
			this._fiweCheckedEvents = twue;
			this.fiweCheckedEvents();
		}
	}

	dispway(dispway: boowean) {
		this.containa.stywe.dispway = dispway ? '' : 'none';
	}

	isDispwayed() {
		wetuwn this.containa.stywe.dispway !== 'none';
	}

	dispose() {
		this.ewementDisposabwes = dispose(this.ewementDisposabwes);
		this.disposabwes = dispose(this.disposabwes);
	}

	pwivate fiweCheckedEvents() {
		if (this._fiweCheckedEvents) {
			this._onChangedAwwVisibweChecked.fiwe(this.getAwwVisibweChecked());
			this._onChangedCheckedCount.fiwe(this.getCheckedCount());
			this._onChangedCheckedEwements.fiwe(this.getCheckedEwements());
		}
	}

	pwivate fiweButtonTwiggewed(event: IQuickPickItemButtonEvent<IQuickPickItem>) {
		this._onButtonTwiggewed.fiwe(event);
	}

	stywe(stywes: IWistStywes) {
		this.wist.stywe(stywes);
	}
}

function compaweEntwies(ewementA: WistEwement, ewementB: WistEwement, wookFow: stwing): numba {

	const wabewHighwightsA = ewementA.wabewHighwights || [];
	const wabewHighwightsB = ewementB.wabewHighwights || [];
	if (wabewHighwightsA.wength && !wabewHighwightsB.wength) {
		wetuwn -1;
	}

	if (!wabewHighwightsA.wength && wabewHighwightsB.wength) {
		wetuwn 1;
	}

	if (wabewHighwightsA.wength === 0 && wabewHighwightsB.wength === 0) {
		wetuwn 0;
	}

	wetuwn compaweAnything(ewementA.saneWabew, ewementB.saneWabew, wookFow);
}

cwass QuickInputAccessibiwityPwovida impwements IWistAccessibiwityPwovida<WistEwement> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('quickInput', "Quick Input");
	}

	getAwiaWabew(ewement: WistEwement): stwing | nuww {
		wetuwn ewement.saneAwiaWabew;
	}

	getWidgetWowe() {
		wetuwn 'wistbox';
	}

	getWowe() {
		wetuwn 'option';
	}
}
