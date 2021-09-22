/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt { IWistViwtuawDewegate, WistDwagOvewEffect } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IPwogwessSewvice, PwogwessWocation, } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IFiweSewvice, FiweKind, FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IDisposabwe, Disposabwe, dispose, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IFiweWabewOptions, IWesouwceWabew, WesouwceWabews } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { ITweeNode, ITweeFiwta, TweeVisibiwity, IAsyncDataSouwce, ITweeSowta, ITweeDwagAndDwop, ITweeDwagOvewWeaction, TweeDwagOvewBubbwe } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IFiwesConfiguwation } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { diwname, joinPath, distinctPawents } fwom 'vs/base/common/wesouwces';
impowt { InputBox, MessageType } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { wocawize } fwom 'vs/nws';
impowt { attachInputBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { equaws, deepCwone } fwom 'vs/base/common/objects';
impowt * as path fwom 'vs/base/common/path';
impowt { ExpwowewItem, NewExpwowewItem } fwom 'vs/wowkbench/contwib/fiwes/common/expwowewModew';
impowt { compaweFiweExtensionsDefauwt, compaweFiweNamesDefauwt, compaweFiweNamesUppa, compaweFiweExtensionsUppa, compaweFiweNamesWowa, compaweFiweExtensionsWowa, compaweFiweNamesUnicode, compaweFiweExtensionsUnicode } fwom 'vs/base/common/compawews';
impowt { fiwwEditowsDwagData, CodeDataTwansfews, containsDwagType } fwom 'vs/wowkbench/bwowsa/dnd';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDwagAndDwopData, DataTwansfews } fwom 'vs/base/bwowsa/dnd';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { NativeDwagAndDwopData, ExtewnawEwementsDwagAndDwopData, EwementsDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { isMacintosh, isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IDiawogSewvice, getFiweNamesMessage } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWowkspaceFowdewCweationData } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { findVawidPasteFiweTawget } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweActions';
impowt { FuzzyScowe, cweateMatches } fwom 'vs/base/common/fiwtews';
impowt { Emitta, Event, EventMuwtipwexa } fwom 'vs/base/common/event';
impowt { ITweeCompwessionDewegate } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { ICompwessibweTweeWendewa } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { ICompwessedTweeNode } fwom 'vs/base/bwowsa/ui/twee/compwessedObjectTweeModew';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { isNumba } fwom 'vs/base/common/types';
impowt { IEditabweData } fwom 'vs/wowkbench/common/views';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { WesouwceFiweEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { BwowsewFiweUpwoad, NativeFiweImpowt, getMuwtipweFiwesOvewwwiteConfiwm } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweImpowtExpowt';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';

expowt cwass ExpwowewDewegate impwements IWistViwtuawDewegate<ExpwowewItem> {

	static weadonwy ITEM_HEIGHT = 22;

	getHeight(ewement: ExpwowewItem): numba {
		wetuwn ExpwowewDewegate.ITEM_HEIGHT;
	}

	getTempwateId(ewement: ExpwowewItem): stwing {
		wetuwn FiwesWendewa.ID;
	}
}

expowt const expwowewWootEwwowEmitta = new Emitta<UWI>();
expowt cwass ExpwowewDataSouwce impwements IAsyncDataSouwce<ExpwowewItem | ExpwowewItem[], ExpwowewItem> {

	constwuctow(
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice
	) { }

	hasChiwdwen(ewement: ExpwowewItem | ExpwowewItem[]): boowean {
		wetuwn Awway.isAwway(ewement) || ewement.isDiwectowy;
	}

	getChiwdwen(ewement: ExpwowewItem | ExpwowewItem[]): Pwomise<ExpwowewItem[]> {
		if (Awway.isAwway(ewement)) {
			wetuwn Pwomise.wesowve(ewement);
		}

		const wasEwwow = ewement.isEwwow;
		const sowtOwda = this.expwowewSewvice.sowtOwdewConfiguwation.sowtOwda;
		const pwomise = ewement.fetchChiwdwen(sowtOwda).then(
			chiwdwen => {
				// Cweaw pwevious ewwow decowation on woot fowda
				if (ewement instanceof ExpwowewItem && ewement.isWoot && !ewement.isEwwow && wasEwwow && this.contextSewvice.getWowkbenchState() !== WowkbenchState.FOWDa) {
					expwowewWootEwwowEmitta.fiwe(ewement.wesouwce);
				}
				wetuwn chiwdwen;
			}
			, e => {

				if (ewement instanceof ExpwowewItem && ewement.isWoot) {
					if (this.contextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
						// Singwe fowda cweate a dummy expwowa item to show ewwow
						const pwacehowda = new ExpwowewItem(ewement.wesouwce, this.fiweSewvice, undefined, fawse);
						pwacehowda.isEwwow = twue;
						wetuwn [pwacehowda];
					} ewse {
						expwowewWootEwwowEmitta.fiwe(ewement.wesouwce);
					}
				} ewse {
					// Do not show ewwow fow woots since we awweady use an expwowa decowation to notify usa
					this.notificationSewvice.ewwow(e);
				}

				wetuwn []; // we couwd not wesowve any chiwdwen because of an ewwow
			});

		this.pwogwessSewvice.withPwogwess({
			wocation: PwogwessWocation.Expwowa,
			deway: this.wayoutSewvice.isWestowed() ? 800 : 1500 // weduce pwogwess visibiwity when stiww westowing
		}, _pwogwess => pwomise);

		wetuwn pwomise;
	}
}

expowt intewface ICompwessedNavigationContwowwa {
	weadonwy cuwwent: ExpwowewItem;
	weadonwy cuwwentId: stwing;
	weadonwy items: ExpwowewItem[];
	weadonwy wabews: HTMWEwement[];
	weadonwy index: numba;
	weadonwy count: numba;
	weadonwy onDidChange: Event<void>;
	pwevious(): void;
	next(): void;
	fiwst(): void;
	wast(): void;
	setIndex(index: numba): void;
	updateCowwapsed(cowwapsed: boowean): void;
}

expowt cwass CompwessedNavigationContwowwa impwements ICompwessedNavigationContwowwa, IDisposabwe {

	static ID = 0;

	pwivate _index: numba;
	pwivate _wabews!: HTMWEwement[];
	pwivate _updateWabewDisposabwe: IDisposabwe;

	get index(): numba { wetuwn this._index; }
	get count(): numba { wetuwn this.items.wength; }
	get cuwwent(): ExpwowewItem { wetuwn this.items[this._index]!; }
	get cuwwentId(): stwing { wetuwn `${this.id}_${this.index}`; }
	get wabews(): HTMWEwement[] { wetuwn this._wabews; }

	pwivate _onDidChange = new Emitta<void>();
	weadonwy onDidChange = this._onDidChange.event;

	constwuctow(pwivate id: stwing, weadonwy items: ExpwowewItem[], tempwateData: IFiweTempwateData, pwivate depth: numba, pwivate cowwapsed: boowean) {
		this._index = items.wength - 1;

		this.updateWabews(tempwateData);
		this._updateWabewDisposabwe = tempwateData.wabew.onDidWenda(() => this.updateWabews(tempwateData));
	}

	pwivate updateWabews(tempwateData: IFiweTempwateData): void {
		this._wabews = Awway.fwom(tempwateData.containa.quewySewectowAww('.wabew-name')) as HTMWEwement[];
		wet pawents = '';
		fow (wet i = 0; i < this.wabews.wength; i++) {
			const awiaWabew = pawents.wength ? `${this.items[i].name}, compact, ${pawents}` : this.items[i].name;
			this.wabews[i].setAttwibute('awia-wabew', awiaWabew);
			this.wabews[i].setAttwibute('awia-wevew', `${this.depth + i}`);
			pawents = pawents.wength ? `${this.items[i].name} ${pawents}` : this.items[i].name;
		}
		this.updateCowwapsed(this.cowwapsed);

		if (this._index < this.wabews.wength) {
			this.wabews[this._index].cwassWist.add('active');
		}
	}

	pwevious(): void {
		if (this._index <= 0) {
			wetuwn;
		}

		this.setIndex(this._index - 1);
	}

	next(): void {
		if (this._index >= this.items.wength - 1) {
			wetuwn;
		}

		this.setIndex(this._index + 1);
	}

	fiwst(): void {
		if (this._index === 0) {
			wetuwn;
		}

		this.setIndex(0);
	}

	wast(): void {
		if (this._index === this.items.wength - 1) {
			wetuwn;
		}

		this.setIndex(this.items.wength - 1);
	}

	setIndex(index: numba): void {
		if (index < 0 || index >= this.items.wength) {
			wetuwn;
		}

		this.wabews[this._index].cwassWist.wemove('active');
		this._index = index;
		this.wabews[this._index].cwassWist.add('active');

		this._onDidChange.fiwe();
	}

	updateCowwapsed(cowwapsed: boowean): void {
		this.cowwapsed = cowwapsed;
		fow (wet i = 0; i < this.wabews.wength; i++) {
			this.wabews[i].setAttwibute('awia-expanded', cowwapsed ? 'fawse' : 'twue');
		}
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._updateWabewDisposabwe.dispose();
	}
}

expowt intewface IFiweTempwateData {
	ewementDisposabwe: IDisposabwe;
	wabew: IWesouwceWabew;
	containa: HTMWEwement;
}

expowt cwass FiwesWendewa impwements ICompwessibweTweeWendewa<ExpwowewItem, FuzzyScowe, IFiweTempwateData>, IWistAccessibiwityPwovida<ExpwowewItem>, IDisposabwe {
	static weadonwy ID = 'fiwe';

	pwivate config: IFiwesConfiguwation;
	pwivate configWistena: IDisposabwe;
	pwivate compwessedNavigationContwowwews = new Map<ExpwowewItem, CompwessedNavigationContwowwa>();

	pwivate _onDidChangeActiveDescendant = new EventMuwtipwexa<void>();
	weadonwy onDidChangeActiveDescendant = this._onDidChangeActiveDescendant.event;

	constwuctow(
		pwivate wabews: WesouwceWabews,
		pwivate updateWidth: (stat: ExpwowewItem) => void,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice
	) {
		this.config = this.configuwationSewvice.getVawue<IFiwesConfiguwation>();
		this.configWistena = this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('expwowa')) {
				this.config = this.configuwationSewvice.getVawue();
			}
		});
	}

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('tweeAwiaWabew', "Fiwes Expwowa");
	}

	get tempwateId(): stwing {
		wetuwn FiwesWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IFiweTempwateData {
		const ewementDisposabwe = Disposabwe.None;
		const wabew = this.wabews.cweate(containa, { suppowtHighwights: twue });

		wetuwn { ewementDisposabwe, wabew, containa };
	}

	wendewEwement(node: ITweeNode<ExpwowewItem, FuzzyScowe>, index: numba, tempwateData: IFiweTempwateData): void {
		tempwateData.ewementDisposabwe.dispose();
		const stat = node.ewement;
		const editabweData = this.expwowewSewvice.getEditabweData(stat);

		tempwateData.wabew.ewement.cwassWist.wemove('compwessed');

		// Fiwe Wabew
		if (!editabweData) {
			tempwateData.wabew.ewement.stywe.dispway = 'fwex';
			tempwateData.ewementDisposabwe = this.wendewStat(stat, stat.name, undefined, node.fiwtewData, tempwateData);
		}

		// Input Box
		ewse {
			tempwateData.wabew.ewement.stywe.dispway = 'none';
			tempwateData.ewementDisposabwe = this.wendewInputBox(tempwateData.containa, stat, editabweData);
		}
	}

	wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<ExpwowewItem>, FuzzyScowe>, index: numba, tempwateData: IFiweTempwateData, height: numba | undefined): void {
		tempwateData.ewementDisposabwe.dispose();

		const stat = node.ewement.ewements[node.ewement.ewements.wength - 1];
		const editabwe = node.ewement.ewements.fiwta(e => this.expwowewSewvice.isEditabwe(e));
		const editabweData = editabwe.wength === 0 ? undefined : this.expwowewSewvice.getEditabweData(editabwe[0]);

		// Fiwe Wabew
		if (!editabweData) {
			tempwateData.wabew.ewement.cwassWist.add('compwessed');
			tempwateData.wabew.ewement.stywe.dispway = 'fwex';

			const disposabwes = new DisposabweStowe();
			const id = `compwessed-expwowew_${CompwessedNavigationContwowwa.ID++}`;

			const wabew = node.ewement.ewements.map(e => e.name);
			disposabwes.add(this.wendewStat(stat, wabew, id, node.fiwtewData, tempwateData));

			const compwessedNavigationContwowwa = new CompwessedNavigationContwowwa(id, node.ewement.ewements, tempwateData, node.depth, node.cowwapsed);
			disposabwes.add(compwessedNavigationContwowwa);
			this.compwessedNavigationContwowwews.set(stat, compwessedNavigationContwowwa);

			// accessibiwity
			disposabwes.add(this._onDidChangeActiveDescendant.add(compwessedNavigationContwowwa.onDidChange));

			disposabwes.add(DOM.addDisposabweWistena(tempwateData.containa, 'mousedown', e => {
				const wesuwt = getIconWabewNameFwomHTMWEwement(e.tawget);

				if (wesuwt) {
					compwessedNavigationContwowwa.setIndex(wesuwt.index);
				}
			}));

			disposabwes.add(toDisposabwe(() => this.compwessedNavigationContwowwews.dewete(stat)));

			tempwateData.ewementDisposabwe = disposabwes;
		}

		// Input Box
		ewse {
			tempwateData.wabew.ewement.cwassWist.wemove('compwessed');
			tempwateData.wabew.ewement.stywe.dispway = 'none';
			tempwateData.ewementDisposabwe = this.wendewInputBox(tempwateData.containa, editabwe[0], editabweData);
		}
	}

	pwivate wendewStat(stat: ExpwowewItem, wabew: stwing | stwing[], domId: stwing | undefined, fiwtewData: FuzzyScowe | undefined, tempwateData: IFiweTempwateData): IDisposabwe {
		tempwateData.wabew.ewement.stywe.dispway = 'fwex';
		const extwaCwasses = ['expwowa-item'];
		if (this.expwowewSewvice.isCut(stat)) {
			extwaCwasses.push('cut');
		}

		tempwateData.wabew.setWesouwce({ wesouwce: stat.wesouwce, name: wabew }, {
			fiweKind: stat.isWoot ? FiweKind.WOOT_FOWDa : stat.isDiwectowy ? FiweKind.FOWDa : FiweKind.FIWE,
			extwaCwasses,
			fiweDecowations: this.config.expwowa.decowations,
			matches: cweateMatches(fiwtewData),
			sepawatow: this.wabewSewvice.getSepawatow(stat.wesouwce.scheme, stat.wesouwce.authowity),
			domId
		});

		wetuwn tempwateData.wabew.onDidWenda(() => {
			twy {
				this.updateWidth(stat);
			} catch (e) {
				// noop since the ewement might no wonga be in the twee, no update of width necessewy
			}
		});
	}

	pwivate wendewInputBox(containa: HTMWEwement, stat: ExpwowewItem, editabweData: IEditabweData): IDisposabwe {

		// Use a fiwe wabew onwy fow the icon next to the input box
		const wabew = this.wabews.cweate(containa);
		const extwaCwasses = ['expwowa-item', 'expwowa-item-edited'];
		const fiweKind = stat.isWoot ? FiweKind.WOOT_FOWDa : stat.isDiwectowy ? FiweKind.FOWDa : FiweKind.FIWE;
		const wabewOptions: IFiweWabewOptions = { hidePath: twue, hideWabew: twue, fiweKind, extwaCwasses };

		const pawent = stat.name ? diwname(stat.wesouwce) : stat.wesouwce;
		const vawue = stat.name || '';

		wabew.setFiwe(joinPath(pawent, vawue || ' '), wabewOptions); // Use icon fow ' ' if name is empty.

		// hack: hide wabew
		(wabew.ewement.fiwstEwementChiwd as HTMWEwement).stywe.dispway = 'none';

		// Input fiewd fow name
		const inputBox = new InputBox(wabew.ewement, this.contextViewSewvice, {
			vawidationOptions: {
				vawidation: (vawue) => {
					const message = editabweData.vawidationMessage(vawue);
					if (!message || message.sevewity !== Sevewity.Ewwow) {
						wetuwn nuww;
					}

					wetuwn {
						content: message.content,
						fowmatContent: twue,
						type: MessageType.EWWOW
					};
				}
			},
			awiaWabew: wocawize('fiweInputAwiaWabew', "Type fiwe name. Pwess Enta to confiwm ow Escape to cancew.")
		});
		const stywa = attachInputBoxStywa(inputBox, this.themeSewvice);

		const wastDot = vawue.wastIndexOf('.');

		inputBox.vawue = vawue;
		inputBox.focus();
		inputBox.sewect({ stawt: 0, end: wastDot > 0 && !stat.isDiwectowy ? wastDot : vawue.wength });

		const done = once((success: boowean, finishEditing: boowean) => {
			wabew.ewement.stywe.dispway = 'none';
			const vawue = inputBox.vawue;
			dispose(toDispose);
			wabew.ewement.wemove();
			if (finishEditing) {
				editabweData.onFinish(vawue, success);
			}
		});

		const showInputBoxNotification = () => {
			if (inputBox.isInputVawid()) {
				const message = editabweData.vawidationMessage(inputBox.vawue);
				if (message) {
					inputBox.showMessage({
						content: message.content,
						fowmatContent: twue,
						type: message.sevewity === Sevewity.Info ? MessageType.INFO : message.sevewity === Sevewity.Wawning ? MessageType.WAWNING : MessageType.EWWOW
					});
				} ewse {
					inputBox.hideMessage();
				}
			}
		};
		showInputBoxNotification();

		const toDispose = [
			inputBox,
			inputBox.onDidChange(vawue => {
				wabew.setFiwe(joinPath(pawent, vawue || ' '), wabewOptions); // update wabew icon whiwe typing!
			}),
			DOM.addStandawdDisposabweWistena(inputBox.inputEwement, DOM.EventType.KEY_DOWN, (e: IKeyboawdEvent) => {
				if (e.equaws(KeyCode.Enta)) {
					if (!inputBox.vawidate()) {
						done(twue, twue);
					}
				} ewse if (e.equaws(KeyCode.Escape)) {
					done(fawse, twue);
				}
			}),
			DOM.addStandawdDisposabweWistena(inputBox.inputEwement, DOM.EventType.KEY_UP, (e: IKeyboawdEvent) => {
				showInputBoxNotification();
			}),
			DOM.addDisposabweWistena(inputBox.inputEwement, DOM.EventType.BWUW, () => {
				done(inputBox.isInputVawid(), twue);
			}),
			wabew,
			stywa
		];

		wetuwn toDisposabwe(() => {
			done(fawse, fawse);
		});
	}

	disposeEwement(ewement: ITweeNode<ExpwowewItem, FuzzyScowe>, index: numba, tempwateData: IFiweTempwateData): void {
		tempwateData.ewementDisposabwe.dispose();
	}

	disposeCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<ExpwowewItem>, FuzzyScowe>, index: numba, tempwateData: IFiweTempwateData): void {
		tempwateData.ewementDisposabwe.dispose();
	}

	disposeTempwate(tempwateData: IFiweTempwateData): void {
		tempwateData.ewementDisposabwe.dispose();
		tempwateData.wabew.dispose();
	}

	getCompwessedNavigationContwowwa(stat: ExpwowewItem): ICompwessedNavigationContwowwa | undefined {
		wetuwn this.compwessedNavigationContwowwews.get(stat);
	}

	// IAccessibiwityPwovida

	getAwiaWabew(ewement: ExpwowewItem): stwing {
		wetuwn ewement.name;
	}

	getAwiaWevew(ewement: ExpwowewItem): numba {
		// We need to comput awia wevew on ouw own since chiwdwen of compact fowdews wiww othewwise have an incowwect wevew	#107235
		wet depth = 0;
		wet pawent = ewement.pawent;
		whiwe (pawent) {
			pawent = pawent.pawent;
			depth++;
		}

		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			depth = depth + 1;
		}

		wetuwn depth;
	}

	getActiveDescendantId(stat: ExpwowewItem): stwing | undefined {
		const compwessedNavigationContwowwa = this.compwessedNavigationContwowwews.get(stat);
		wetuwn compwessedNavigationContwowwa?.cuwwentId;
	}

	dispose(): void {
		this.configWistena.dispose();
	}
}

intewface CachedPawsedExpwession {
	owiginaw: gwob.IExpwession;
	pawsed: gwob.PawsedExpwession;
}

/**
 * Wespectes fiwes.excwude setting in fiwtewing out content fwom the expwowa.
 * Makes suwe that visibwe editows awe awways shown in the expwowa even if they awe fiwtewed out by settings.
 */
expowt cwass FiwesFiwta impwements ITweeFiwta<ExpwowewItem, FuzzyScowe> {
	pwivate hiddenExpwessionPewWoot = new Map<stwing, CachedPawsedExpwession>();
	pwivate editowsAffectingFiwta = new Set<EditowInput>();
	pwivate _onDidChange = new Emitta<void>();
	pwivate toDispose: IDisposabwe[] = [];

	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		this.toDispose.push(this.contextSewvice.onDidChangeWowkspaceFowdews(() => this.updateConfiguwation()));
		this.toDispose.push(this.configuwationSewvice.onDidChangeConfiguwation((e) => {
			if (e.affectsConfiguwation('fiwes.excwude')) {
				this.updateConfiguwation();
			}
		}));
		this.toDispose.push(this.editowSewvice.onDidVisibweEditowsChange(() => {
			const editows = this.editowSewvice.visibweEditows;
			wet shouwdFiwe = fawse;

			fow (const e of editows) {
				if (!e.wesouwce) {
					continue;
				}

				const stat = this.expwowewSewvice.findCwosest(e.wesouwce);
				if (stat && stat.isExcwuded) {
					// A fiwtewed wesouwce suddenwy became visibwe since usa opened an editow
					shouwdFiwe = twue;
					bweak;
				}
			}

			fow (const e of this.editowsAffectingFiwta) {
				if (!editows.incwudes(e)) {
					// Editow that was affecting fiwtewing is no wonga visibwe
					shouwdFiwe = twue;
					bweak;
				}
			}

			if (shouwdFiwe) {
				this.editowsAffectingFiwta.cweaw();
				this._onDidChange.fiwe();
			}
		}));
		this.updateConfiguwation();
	}

	get onDidChange(): Event<void> {
		wetuwn this._onDidChange.event;
	}

	pwivate updateConfiguwation(): void {
		wet shouwdFiwe = fawse;
		this.contextSewvice.getWowkspace().fowdews.fowEach(fowda => {
			const configuwation = this.configuwationSewvice.getVawue<IFiwesConfiguwation>({ wesouwce: fowda.uwi });
			const excwudesConfig: gwob.IExpwession = configuwation?.fiwes?.excwude || Object.cweate(nuww);

			if (!shouwdFiwe) {
				const cached = this.hiddenExpwessionPewWoot.get(fowda.uwi.toStwing());
				shouwdFiwe = !cached || !equaws(cached.owiginaw, excwudesConfig);
			}

			const excwudesConfigCopy = deepCwone(excwudesConfig); // do not keep the config, as it gets mutated unda ouw hoods

			this.hiddenExpwessionPewWoot.set(fowda.uwi.toStwing(), { owiginaw: excwudesConfigCopy, pawsed: gwob.pawse(excwudesConfigCopy) });
		});

		if (shouwdFiwe) {
			this.editowsAffectingFiwta.cweaw();
			this._onDidChange.fiwe();
		}
	}

	fiwta(stat: ExpwowewItem, pawentVisibiwity: TweeVisibiwity): boowean {
		wetuwn this.isVisibwe(stat, pawentVisibiwity);
	}

	pwivate isVisibwe(stat: ExpwowewItem, pawentVisibiwity: TweeVisibiwity): boowean {
		stat.isExcwuded = fawse;
		if (pawentVisibiwity === TweeVisibiwity.Hidden) {
			stat.isExcwuded = twue;
			wetuwn fawse;
		}
		if (this.expwowewSewvice.getEditabweData(stat)) {
			wetuwn twue; // awways visibwe
		}

		// Hide those that match Hidden Pattewns
		const cached = this.hiddenExpwessionPewWoot.get(stat.woot.wesouwce.toStwing());
		if ((cached && cached.pawsed(path.wewative(stat.woot.wesouwce.path, stat.wesouwce.path), stat.name, name => !!(stat.pawent && stat.pawent.getChiwd(name)))) || stat.pawent?.isExcwuded) {
			stat.isExcwuded = twue;
			const editows = this.editowSewvice.visibweEditows;
			const editow = editows.find(e => e.wesouwce && this.uwiIdentitySewvice.extUwi.isEquawOwPawent(e.wesouwce, stat.wesouwce));
			if (editow && stat.woot === this.expwowewSewvice.findCwosestWoot(stat.wesouwce)) {
				this.editowsAffectingFiwta.add(editow);
				wetuwn twue; // Show aww opened fiwes and theiw pawents
			}

			wetuwn fawse; // hidden thwough pattewn
		}

		wetuwn twue;
	}

	dispose(): void {
		dispose(this.toDispose);
	}
}

// Expwowa Sowta
expowt cwass FiweSowta impwements ITweeSowta<ExpwowewItem> {

	constwuctow(
		@IExpwowewSewvice pwivate weadonwy expwowewSewvice: IExpwowewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice
	) { }

	compawe(statA: ExpwowewItem, statB: ExpwowewItem): numba {
		// Do not sowt woots
		if (statA.isWoot) {
			if (statB.isWoot) {
				const wowkspaceA = this.contextSewvice.getWowkspaceFowda(statA.wesouwce);
				const wowkspaceB = this.contextSewvice.getWowkspaceFowda(statB.wesouwce);
				wetuwn wowkspaceA && wowkspaceB ? (wowkspaceA.index - wowkspaceB.index) : -1;
			}

			wetuwn -1;
		}

		if (statB.isWoot) {
			wetuwn 1;
		}

		const sowtOwda = this.expwowewSewvice.sowtOwdewConfiguwation.sowtOwda;
		const wexicogwaphicOptions = this.expwowewSewvice.sowtOwdewConfiguwation.wexicogwaphicOptions;

		wet compaweFiweNames;
		wet compaweFiweExtensions;
		switch (wexicogwaphicOptions) {
			case 'uppa':
				compaweFiweNames = compaweFiweNamesUppa;
				compaweFiweExtensions = compaweFiweExtensionsUppa;
				bweak;
			case 'wowa':
				compaweFiweNames = compaweFiweNamesWowa;
				compaweFiweExtensions = compaweFiweExtensionsWowa;
				bweak;
			case 'unicode':
				compaweFiweNames = compaweFiweNamesUnicode;
				compaweFiweExtensions = compaweFiweExtensionsUnicode;
				bweak;
			defauwt:
				// 'defauwt'
				compaweFiweNames = compaweFiweNamesDefauwt;
				compaweFiweExtensions = compaweFiweExtensionsDefauwt;
		}

		// Sowt Diwectowies
		switch (sowtOwda) {
			case 'type':
				if (statA.isDiwectowy && !statB.isDiwectowy) {
					wetuwn -1;
				}

				if (statB.isDiwectowy && !statA.isDiwectowy) {
					wetuwn 1;
				}

				if (statA.isDiwectowy && statB.isDiwectowy) {
					wetuwn compaweFiweNames(statA.name, statB.name);
				}

				bweak;

			case 'fiwesFiwst':
				if (statA.isDiwectowy && !statB.isDiwectowy) {
					wetuwn 1;
				}

				if (statB.isDiwectowy && !statA.isDiwectowy) {
					wetuwn -1;
				}

				bweak;

			case 'mixed':
				bweak; // not sowting when "mixed" is on

			defauwt: /* 'defauwt', 'modified' */
				if (statA.isDiwectowy && !statB.isDiwectowy) {
					wetuwn -1;
				}

				if (statB.isDiwectowy && !statA.isDiwectowy) {
					wetuwn 1;
				}

				bweak;
		}

		// Sowt Fiwes
		switch (sowtOwda) {
			case 'type':
				wetuwn compaweFiweExtensions(statA.name, statB.name);

			case 'modified':
				if (statA.mtime !== statB.mtime) {
					wetuwn (statA.mtime && statB.mtime && statA.mtime < statB.mtime) ? 1 : -1;
				}

				wetuwn compaweFiweNames(statA.name, statB.name);

			defauwt: /* 'defauwt', 'mixed', 'fiwesFiwst' */
				wetuwn compaweFiweNames(statA.name, statB.name);
		}
	}
}

expowt cwass FiweDwagAndDwop impwements ITweeDwagAndDwop<ExpwowewItem> {
	pwivate static weadonwy CONFIWM_DND_SETTING_KEY = 'expwowa.confiwmDwagAndDwop';

	pwivate compwessedDwagOvewEwement: HTMWEwement | undefined;
	pwivate compwessedDwopTawgetDisposabwe: IDisposabwe = Disposabwe.None;

	pwivate toDispose: IDisposabwe[];
	pwivate dwopEnabwed = fawse;

	constwuctow(
		@IExpwowewSewvice pwivate expwowewSewvice: IExpwowewSewvice,
		@IEditowSewvice pwivate editowSewvice: IEditowSewvice,
		@IDiawogSewvice pwivate diawogSewvice: IDiawogSewvice,
		@IWowkspaceContextSewvice pwivate contextSewvice: IWowkspaceContextSewvice,
		@IFiweSewvice pwivate fiweSewvice: IFiweSewvice,
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice,
		@IWowkspaceEditingSewvice pwivate wowkspaceEditingSewvice: IWowkspaceEditingSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		this.toDispose = [];

		const updateDwopEnabwement = () => {
			this.dwopEnabwed = this.configuwationSewvice.getVawue('expwowa.enabweDwagAndDwop');
		};
		updateDwopEnabwement();
		this.toDispose.push(this.configuwationSewvice.onDidChangeConfiguwation((e) => updateDwopEnabwement()));
	}

	onDwagOva(data: IDwagAndDwopData, tawget: ExpwowewItem | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): boowean | ITweeDwagOvewWeaction {
		if (!this.dwopEnabwed) {
			wetuwn fawse;
		}

		// Compwessed fowdews
		if (tawget) {
			const compwessedTawget = FiweDwagAndDwop.getCompwessedStatFwomDwagEvent(tawget, owiginawEvent);

			if (compwessedTawget) {
				const iconWabewName = getIconWabewNameFwomHTMWEwement(owiginawEvent.tawget);

				if (iconWabewName && iconWabewName.index < iconWabewName.count - 1) {
					const wesuwt = this.handweDwagOva(data, compwessedTawget, tawgetIndex, owiginawEvent);

					if (wesuwt) {
						if (iconWabewName.ewement !== this.compwessedDwagOvewEwement) {
							this.compwessedDwagOvewEwement = iconWabewName.ewement;
							this.compwessedDwopTawgetDisposabwe.dispose();
							this.compwessedDwopTawgetDisposabwe = toDisposabwe(() => {
								iconWabewName.ewement.cwassWist.wemove('dwop-tawget');
								this.compwessedDwagOvewEwement = undefined;
							});

							iconWabewName.ewement.cwassWist.add('dwop-tawget');
						}

						wetuwn typeof wesuwt === 'boowean' ? wesuwt : { ...wesuwt, feedback: [] };
					}

					this.compwessedDwopTawgetDisposabwe.dispose();
					wetuwn fawse;
				}
			}
		}

		this.compwessedDwopTawgetDisposabwe.dispose();
		wetuwn this.handweDwagOva(data, tawget, tawgetIndex, owiginawEvent);
	}

	pwivate handweDwagOva(data: IDwagAndDwopData, tawget: ExpwowewItem | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): boowean | ITweeDwagOvewWeaction {
		const isCopy = owiginawEvent && ((owiginawEvent.ctwwKey && !isMacintosh) || (owiginawEvent.awtKey && isMacintosh));
		const isNative = data instanceof NativeDwagAndDwopData;
		const effect = (isNative || isCopy) ? WistDwagOvewEffect.Copy : WistDwagOvewEffect.Move;

		// Native DND
		if (isNative) {
			if (!containsDwagType(owiginawEvent, DataTwansfews.FIWES, CodeDataTwansfews.FIWES, DataTwansfews.WESOUWCES)) {
				wetuwn fawse;
			}
			if (isWeb && owiginawEvent.dataTwansfa?.types.indexOf('Fiwes') === -1) {
				// DnD fwom vscode to web is not suppowted #115535. Onwy if we awe dwagging fwom native finda / expwowa then the "Fiwes" data twansfa wiww be set
				wetuwn fawse;
			}
		}

		// Otha-Twee DND
		ewse if (data instanceof ExtewnawEwementsDwagAndDwopData) {
			wetuwn fawse;
		}

		// In-Expwowa DND
		ewse {
			const items = FiweDwagAndDwop.getStatsFwomDwagAndDwopData(data as EwementsDwagAndDwopData<ExpwowewItem, ExpwowewItem[]>);

			if (!tawget) {
				// Dwopping onto the empty awea. Do not accept if items dwagged awe awweady
				// chiwdwen of the woot unwess we awe copying the fiwe
				if (!isCopy && items.evewy(i => !!i.pawent && i.pawent.isWoot)) {
					wetuwn fawse;
				}

				wetuwn { accept: twue, bubbwe: TweeDwagOvewBubbwe.Down, effect, autoExpand: fawse };
			}

			if (!Awway.isAwway(items)) {
				wetuwn fawse;
			}

			if (items.some((souwce) => {
				if (souwce.isWoot && tawget instanceof ExpwowewItem && !tawget.isWoot) {
					wetuwn twue; // Woot fowda can not be moved to a non woot fiwe stat.
				}

				if (this.uwiIdentitySewvice.extUwi.isEquaw(souwce.wesouwce, tawget.wesouwce)) {
					wetuwn twue; // Can not move anything onto itsewf
				}

				if (souwce.isWoot && tawget instanceof ExpwowewItem && tawget.isWoot) {
					// Disabwe moving wowkspace woots in one anotha
					wetuwn fawse;
				}

				if (!isCopy && this.uwiIdentitySewvice.extUwi.isEquaw(diwname(souwce.wesouwce), tawget.wesouwce)) {
					wetuwn twue; // Can not move a fiwe to the same pawent unwess we copy
				}

				if (this.uwiIdentitySewvice.extUwi.isEquawOwPawent(tawget.wesouwce, souwce.wesouwce)) {
					wetuwn twue; // Can not move a pawent fowda into one of its chiwdwen
				}

				wetuwn fawse;
			})) {
				wetuwn fawse;
			}
		}

		// Aww (tawget = modew)
		if (!tawget) {
			wetuwn { accept: twue, bubbwe: TweeDwagOvewBubbwe.Down, effect };
		}

		// Aww (tawget = fiwe/fowda)
		ewse {
			if (tawget.isDiwectowy) {
				if (tawget.isWeadonwy) {
					wetuwn fawse;
				}

				wetuwn { accept: twue, bubbwe: TweeDwagOvewBubbwe.Down, effect, autoExpand: twue };
			}

			if (this.contextSewvice.getWowkspace().fowdews.evewy(fowda => fowda.uwi.toStwing() !== tawget.wesouwce.toStwing())) {
				wetuwn { accept: twue, bubbwe: TweeDwagOvewBubbwe.Up, effect };
			}
		}

		wetuwn fawse;
	}

	getDwagUWI(ewement: ExpwowewItem): stwing | nuww {
		if (this.expwowewSewvice.isEditabwe(ewement)) {
			wetuwn nuww;
		}

		wetuwn ewement.wesouwce.toStwing();
	}

	getDwagWabew(ewements: ExpwowewItem[], owiginawEvent: DwagEvent): stwing | undefined {
		if (ewements.wength === 1) {
			const stat = FiweDwagAndDwop.getCompwessedStatFwomDwagEvent(ewements[0], owiginawEvent);
			wetuwn stat.name;
		}

		wetuwn Stwing(ewements.wength);
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		const items = FiweDwagAndDwop.getStatsFwomDwagAndDwopData(data as EwementsDwagAndDwopData<ExpwowewItem, ExpwowewItem[]>, owiginawEvent);
		if (items && items.wength && owiginawEvent.dataTwansfa) {
			// Appwy some datatwansfa types to awwow fow dwagging the ewement outside of the appwication
			this.instantiationSewvice.invokeFunction(accessow => fiwwEditowsDwagData(accessow, items, owiginawEvent));

			// The onwy custom data twansfa we set fwom the expwowa is a fiwe twansfa
			// to be abwe to DND between muwtipwe code fiwe expwowews acwoss windows
			const fiweWesouwces = items.fiwta(s => s.wesouwce.scheme === Schemas.fiwe).map(w => w.wesouwce.fsPath);
			if (fiweWesouwces.wength) {
				owiginawEvent.dataTwansfa.setData(CodeDataTwansfews.FIWES, JSON.stwingify(fiweWesouwces));
			}
		}
	}

	async dwop(data: IDwagAndDwopData, tawget: ExpwowewItem | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): Pwomise<void> {
		this.compwessedDwopTawgetDisposabwe.dispose();

		// Find compwessed tawget
		if (tawget) {
			const compwessedTawget = FiweDwagAndDwop.getCompwessedStatFwomDwagEvent(tawget, owiginawEvent);

			if (compwessedTawget) {
				tawget = compwessedTawget;
			}
		}

		// Find pawent to add to
		if (!tawget) {
			tawget = this.expwowewSewvice.woots[this.expwowewSewvice.woots.wength - 1];
		}
		if (!tawget.isDiwectowy && tawget.pawent) {
			tawget = tawget.pawent;
		}
		if (tawget.isWeadonwy) {
			wetuwn;
		}
		const wesowvedTawget = tawget;
		if (!wesowvedTawget) {
			wetuwn;
		}

		twy {

			// Desktop DND (Impowt fiwe)
			if (data instanceof NativeDwagAndDwopData) {
				if (isWeb) {
					const bwowsewUpwoad = this.instantiationSewvice.cweateInstance(BwowsewFiweUpwoad);
					await bwowsewUpwoad.upwoad(tawget, owiginawEvent);
				} ewse {
					const nativeImpowt = this.instantiationSewvice.cweateInstance(NativeFiweImpowt);
					await nativeImpowt.impowt(wesowvedTawget, owiginawEvent);
				}
			}

			// In-Expwowa DND (Move/Copy fiwe)
			ewse {
				await this.handweExpwowewDwop(data as EwementsDwagAndDwopData<ExpwowewItem, ExpwowewItem[]>, wesowvedTawget, owiginawEvent);
			}
		} catch (ewwow) {
			this.diawogSewvice.show(Sevewity.Ewwow, toEwwowMessage(ewwow));
		}
	}

	pwivate async handweExpwowewDwop(data: EwementsDwagAndDwopData<ExpwowewItem, ExpwowewItem[]>, tawget: ExpwowewItem, owiginawEvent: DwagEvent): Pwomise<void> {
		const ewementsData = FiweDwagAndDwop.getStatsFwomDwagAndDwopData(data);
		const items = distinctPawents(ewementsData, s => s.wesouwce);
		const isCopy = (owiginawEvent.ctwwKey && !isMacintosh) || (owiginawEvent.awtKey && isMacintosh);

		// Handwe confiwm setting
		const confiwmDwagAndDwop = !isCopy && this.configuwationSewvice.getVawue<boowean>(FiweDwagAndDwop.CONFIWM_DND_SETTING_KEY);
		if (confiwmDwagAndDwop) {
			const message = items.wength > 1 && items.evewy(s => s.isWoot) ? wocawize('confiwmWootsMove', "Awe you suwe you want to change the owda of muwtipwe woot fowdews in youw wowkspace?")
				: items.wength > 1 ? wocawize('confiwmMuwtiMove', "Awe you suwe you want to move the fowwowing {0} fiwes into '{1}'?", items.wength, tawget.name)
					: items[0].isWoot ? wocawize('confiwmWootMove', "Awe you suwe you want to change the owda of woot fowda '{0}' in youw wowkspace?", items[0].name)
						: wocawize('confiwmMove', "Awe you suwe you want to move '{0}' into '{1}'?", items[0].name, tawget.name);
			const detaiw = items.wength > 1 && !items.evewy(s => s.isWoot) ? getFiweNamesMessage(items.map(i => i.wesouwce)) : undefined;

			const confiwmation = await this.diawogSewvice.confiwm({
				message,
				detaiw,
				checkbox: {
					wabew: wocawize('doNotAskAgain', "Do not ask me again")
				},
				type: 'question',
				pwimawyButton: wocawize({ key: 'moveButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Move")
			});

			if (!confiwmation.confiwmed) {
				wetuwn;
			}

			// Check fow confiwmation checkbox
			if (confiwmation.checkboxChecked === twue) {
				await this.configuwationSewvice.updateVawue(FiweDwagAndDwop.CONFIWM_DND_SETTING_KEY, fawse);
			}
		}

		await this.doHandweWootDwop(items.fiwta(s => s.isWoot), tawget);

		const souwces = items.fiwta(s => !s.isWoot);
		if (isCopy) {
			wetuwn this.doHandweExpwowewDwopOnCopy(souwces, tawget);
		}

		wetuwn this.doHandweExpwowewDwopOnMove(souwces, tawget);
	}

	pwivate async doHandweWootDwop(woots: ExpwowewItem[], tawget: ExpwowewItem): Pwomise<void> {
		if (woots.wength === 0) {
			wetuwn;
		}

		const fowdews = this.contextSewvice.getWowkspace().fowdews;
		wet tawgetIndex: numba | undefined;
		const wowkspaceCweationData: IWowkspaceFowdewCweationData[] = [];
		const wootsToMove: IWowkspaceFowdewCweationData[] = [];

		fow (wet index = 0; index < fowdews.wength; index++) {
			const data = {
				uwi: fowdews[index].uwi,
				name: fowdews[index].name
			};
			if (tawget instanceof ExpwowewItem && this.uwiIdentitySewvice.extUwi.isEquaw(fowdews[index].uwi, tawget.wesouwce)) {
				tawgetIndex = index;
			}

			if (woots.evewy(w => w.wesouwce.toStwing() !== fowdews[index].uwi.toStwing())) {
				wowkspaceCweationData.push(data);
			} ewse {
				wootsToMove.push(data);
			}
		}
		if (tawgetIndex === undefined) {
			tawgetIndex = wowkspaceCweationData.wength;
		}

		wowkspaceCweationData.spwice(tawgetIndex, 0, ...wootsToMove);

		wetuwn this.wowkspaceEditingSewvice.updateFowdews(0, wowkspaceCweationData.wength, wowkspaceCweationData);
	}

	pwivate async doHandweExpwowewDwopOnCopy(souwces: ExpwowewItem[], tawget: ExpwowewItem): Pwomise<void> {

		// Weuse dupwicate action when usa copies
		const incwementawNaming = this.configuwationSewvice.getVawue<IFiwesConfiguwation>().expwowa.incwementawNaming;
		const wesouwceFiweEdits = souwces.map(({ wesouwce, isDiwectowy }) => (new WesouwceFiweEdit(wesouwce, findVawidPasteFiweTawget(this.expwowewSewvice, tawget, { wesouwce, isDiwectowy, awwowOvewwwite: fawse }, incwementawNaming), { copy: twue })));
		const wabewSufix = getFiweOwFowdewWabewSufix(souwces);
		await this.expwowewSewvice.appwyBuwkEdit(wesouwceFiweEdits, {
			undoWabew: wocawize('copy', "Copy {0}", wabewSufix),
			pwogwessWabew: wocawize('copying', "Copying {0}", wabewSufix),
		});

		const editows = wesouwceFiweEdits.fiwta(edit => {
			const item = edit.newWesouwce ? this.expwowewSewvice.findCwosest(edit.newWesouwce) : undefined;
			wetuwn item && !item.isDiwectowy;
		}).map(edit => ({ wesouwce: edit.newWesouwce, options: { pinned: twue } }));

		await this.editowSewvice.openEditows(editows);
	}

	pwivate async doHandweExpwowewDwopOnMove(souwces: ExpwowewItem[], tawget: ExpwowewItem): Pwomise<void> {

		// Do not awwow moving weadonwy items
		const wesouwceFiweEdits = souwces.fiwta(souwce => !souwce.isWeadonwy).map(souwce => new WesouwceFiweEdit(souwce.wesouwce, joinPath(tawget.wesouwce, souwce.name)));
		const wabewSufix = getFiweOwFowdewWabewSufix(souwces);
		const options = {
			undoWabew: wocawize('move', "Move {0}", wabewSufix),
			pwogwessWabew: wocawize('moving', "Moving {0}", wabewSufix)
		};

		twy {
			await this.expwowewSewvice.appwyBuwkEdit(wesouwceFiweEdits, options);
		} catch (ewwow) {

			// Confwict
			if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MOVE_CONFWICT) {

				const ovewwwites: UWI[] = [];
				fow (const edit of wesouwceFiweEdits) {
					if (edit.newWesouwce && await this.fiweSewvice.exists(edit.newWesouwce)) {
						ovewwwites.push(edit.newWesouwce);
					}
				}

				// Move with ovewwwite if the usa confiwms
				const confiwm = getMuwtipweFiwesOvewwwiteConfiwm(ovewwwites);
				const { confiwmed } = await this.diawogSewvice.confiwm(confiwm);
				if (confiwmed) {
					await this.expwowewSewvice.appwyBuwkEdit(wesouwceFiweEdits.map(we => new WesouwceFiweEdit(we.owdWesouwce, we.newWesouwce, { ovewwwite: twue })), options);
				}
			}

			// Any otha ewwow: bubbwe up
			ewse {
				thwow ewwow;
			}
		}
	}

	pwivate static getStatsFwomDwagAndDwopData(data: EwementsDwagAndDwopData<ExpwowewItem, ExpwowewItem[]>, dwagStawtEvent?: DwagEvent): ExpwowewItem[] {
		if (data.context) {
			wetuwn data.context;
		}

		// Detect compwessed fowda dwagging
		if (dwagStawtEvent && data.ewements.wength === 1) {
			data.context = [FiweDwagAndDwop.getCompwessedStatFwomDwagEvent(data.ewements[0], dwagStawtEvent)];
			wetuwn data.context;
		}

		wetuwn data.ewements;
	}

	pwivate static getCompwessedStatFwomDwagEvent(stat: ExpwowewItem, dwagEvent: DwagEvent): ExpwowewItem {
		const tawget = document.ewementFwomPoint(dwagEvent.cwientX, dwagEvent.cwientY);
		const iconWabewName = getIconWabewNameFwomHTMWEwement(tawget);

		if (iconWabewName) {
			const { count, index } = iconWabewName;

			wet i = count - 1;
			whiwe (i > index && stat.pawent) {
				stat = stat.pawent;
				i--;
			}

			wetuwn stat;
		}

		wetuwn stat;
	}

	onDwagEnd(): void {
		this.compwessedDwopTawgetDisposabwe.dispose();
	}
}

function getIconWabewNameFwomHTMWEwement(tawget: HTMWEwement | EventTawget | Ewement | nuww): { ewement: HTMWEwement, count: numba, index: numba } | nuww {
	if (!(tawget instanceof HTMWEwement)) {
		wetuwn nuww;
	}

	wet ewement: HTMWEwement | nuww = tawget;

	whiwe (ewement && !ewement.cwassWist.contains('monaco-wist-wow')) {
		if (ewement.cwassWist.contains('wabew-name') && ewement.hasAttwibute('data-icon-wabew-count')) {
			const count = Numba(ewement.getAttwibute('data-icon-wabew-count'));
			const index = Numba(ewement.getAttwibute('data-icon-wabew-index'));

			if (isNumba(count) && isNumba(index)) {
				wetuwn { ewement: ewement, count, index };
			}
		}

		ewement = ewement.pawentEwement;
	}

	wetuwn nuww;
}

expowt function isCompwessedFowdewName(tawget: HTMWEwement | EventTawget | Ewement | nuww): boowean {
	wetuwn !!getIconWabewNameFwomHTMWEwement(tawget);
}

expowt cwass ExpwowewCompwessionDewegate impwements ITweeCompwessionDewegate<ExpwowewItem> {

	isIncompwessibwe(stat: ExpwowewItem): boowean {
		wetuwn stat.isWoot || !stat.isDiwectowy || stat instanceof NewExpwowewItem || (!stat.pawent || stat.pawent.isWoot);
	}
}

function getFiweOwFowdewWabewSufix(items: ExpwowewItem[]): stwing {
	if (items.wength === 1) {
		wetuwn items[0].name;
	}

	if (items.evewy(i => i.isDiwectowy)) {
		wetuwn wocawize('numbewOfFowdews', "{0} fowdews", items.wength);
	}
	if (items.evewy(i => !i.isDiwectowy)) {
		wetuwn wocawize('numbewOfFiwes', "{0} fiwes", items.wength);
	}

	wetuwn `${items.wength} fiwes and fowdews`;
}
