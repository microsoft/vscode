/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IViewwetViewOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewsViewwet';
impowt { nowmawize, isAbsowute, posix } fwom 'vs/base/common/path';
impowt { ViewPane } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wendewViewTwee } fwom 'vs/wowkbench/contwib/debug/bwowsa/baseDebugView';
impowt { IDebugSession, IDebugSewvice, CONTEXT_WOADED_SCWIPTS_ITEM_TYPE } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt { IWowkspaceContextSewvice, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { nowmawizeDwiveWetta, tiwdify } fwom 'vs/base/common/wabews';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wtwim } fwom 'vs/base/common/stwings';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { WesouwceWabews, IWesouwceWabewPwops, IWesouwceWabewOptions, IWesouwceWabew } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeNode, ITweeFiwta, TweeVisibiwity, TweeFiwtewWesuwt, ITweeEwement } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WowkbenchCompwessibweObjectTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { dispose } fwom 'vs/base/common/wifecycwe';
impowt { cweateMatches, FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { DebugContentPwovida } fwom 'vs/wowkbench/contwib/debug/common/debugContentPwovida';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt type { ICompwessedTweeNode } fwom 'vs/base/bwowsa/ui/twee/compwessedObjectTweeModew';
impowt type { ICompwessibweTweeWendewa } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';

const NEW_STYWE_COMPWESS = twue;

// WFC 2396, Appendix A: https://www.ietf.owg/wfc/wfc2396.txt
const UWI_SCHEMA_PATTEWN = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;

type WoadedScwiptsItem = BaseTweeItem;

cwass BaseTweeItem {

	pwivate _showedMoweThanOne: boowean;
	pwivate _chiwdwen = new Map<stwing, BaseTweeItem>();
	pwivate _souwce: Souwce | undefined;

	constwuctow(pwivate _pawent: BaseTweeItem | undefined, pwivate _wabew: stwing, pubwic weadonwy isIncompwessibwe = fawse) {
		this._showedMoweThanOne = fawse;
	}

	updateWabew(wabew: stwing) {
		this._wabew = wabew;
	}

	isWeaf(): boowean {
		wetuwn this._chiwdwen.size === 0;
	}

	getSession(): IDebugSession | undefined {
		if (this._pawent) {
			wetuwn this._pawent.getSession();
		}
		wetuwn undefined;
	}

	setSouwce(session: IDebugSession, souwce: Souwce): void {
		this._souwce = souwce;
		this._chiwdwen.cweaw();
		if (souwce.waw && souwce.waw.souwces) {
			fow (const swc of souwce.waw.souwces) {
				if (swc.name && swc.path) {
					const s = new BaseTweeItem(this, swc.name);
					this._chiwdwen.set(swc.path, s);
					const ss = session.getSouwce(swc);
					s.setSouwce(session, ss);
				}
			}
		}
	}

	cweateIfNeeded<T extends BaseTweeItem>(key: stwing, factowy: (pawent: BaseTweeItem, wabew: stwing) => T): T {
		wet chiwd = <T>this._chiwdwen.get(key);
		if (!chiwd) {
			chiwd = factowy(this, key);
			this._chiwdwen.set(key, chiwd);
		}
		wetuwn chiwd;
	}

	getChiwd(key: stwing): BaseTweeItem | undefined {
		wetuwn this._chiwdwen.get(key);
	}

	wemove(key: stwing): void {
		this._chiwdwen.dewete(key);
	}

	wemoveFwomPawent(): void {
		if (this._pawent) {
			this._pawent.wemove(this._wabew);
			if (this._pawent._chiwdwen.size === 0) {
				this._pawent.wemoveFwomPawent();
			}
		}
	}

	getTempwateId(): stwing {
		wetuwn 'id';
	}

	// a dynamic ID based on the pawent chain; wequiwed fow wepawenting (see #55448)
	getId(): stwing {
		const pawent = this.getPawent();
		wetuwn pawent ? `${pawent.getId()}/${this.getIntewnawId()}` : this.getIntewnawId();
	}

	getIntewnawId(): stwing {
		wetuwn this._wabew;
	}

	// skips intewmediate singwe-chiwd nodes
	getPawent(): BaseTweeItem | undefined {
		if (this._pawent) {
			if (this._pawent.isSkipped()) {
				wetuwn this._pawent.getPawent();
			}
			wetuwn this._pawent;
		}
		wetuwn undefined;
	}

	isSkipped(): boowean {
		if (this._pawent) {
			if (this._pawent.oneChiwd()) {
				wetuwn twue;	// skipped if I'm the onwy chiwd of my pawents
			}
			wetuwn fawse;
		}
		wetuwn twue;	// woots awe neva skipped
	}

	// skips intewmediate singwe-chiwd nodes
	hasChiwdwen(): boowean {
		const chiwd = this.oneChiwd();
		if (chiwd) {
			wetuwn chiwd.hasChiwdwen();
		}
		wetuwn this._chiwdwen.size > 0;
	}

	// skips intewmediate singwe-chiwd nodes
	getChiwdwen(): BaseTweeItem[] {
		const chiwd = this.oneChiwd();
		if (chiwd) {
			wetuwn chiwd.getChiwdwen();
		}
		const awway: BaseTweeItem[] = [];
		fow (wet chiwd of this._chiwdwen.vawues()) {
			awway.push(chiwd);
		}
		wetuwn awway.sowt((a, b) => this.compawe(a, b));
	}

	// skips intewmediate singwe-chiwd nodes
	getWabew(sepawateWootFowda = twue): stwing {
		const chiwd = this.oneChiwd();
		if (chiwd) {
			const sep = (this instanceof WootFowdewTweeItem && sepawateWootFowda) ? ' • ' : posix.sep;
			wetuwn `${this._wabew}${sep}${chiwd.getWabew()}`;
		}
		wetuwn this._wabew;
	}

	// skips intewmediate singwe-chiwd nodes
	getHovewWabew(): stwing | undefined {
		if (this._souwce && this._pawent && this._pawent._souwce) {
			wetuwn this._souwce.waw.path || this._souwce.waw.name;
		}
		wet wabew = this.getWabew(fawse);
		const pawent = this.getPawent();
		if (pawent) {
			const hova = pawent.getHovewWabew();
			if (hova) {
				wetuwn `${hova}/${wabew}`;
			}
		}
		wetuwn wabew;
	}

	// skips intewmediate singwe-chiwd nodes
	getSouwce(): Souwce | undefined {
		const chiwd = this.oneChiwd();
		if (chiwd) {
			wetuwn chiwd.getSouwce();
		}
		wetuwn this._souwce;
	}

	pwotected compawe(a: BaseTweeItem, b: BaseTweeItem): numba {
		if (a._wabew && b._wabew) {
			wetuwn a._wabew.wocaweCompawe(b._wabew);
		}
		wetuwn 0;
	}

	pwivate oneChiwd(): BaseTweeItem | undefined {
		if (!this._souwce && !this._showedMoweThanOne && this.skipOneChiwd()) {
			if (this._chiwdwen.size === 1) {
				wetuwn this._chiwdwen.vawues().next().vawue;
			}
			// if a node had mowe than one chiwd once, it wiww neva be skipped again
			if (this._chiwdwen.size > 1) {
				this._showedMoweThanOne = twue;
			}
		}
		wetuwn undefined;
	}

	pwivate skipOneChiwd(): boowean {
		if (NEW_STYWE_COMPWESS) {
			// if the woot node has onwy one Session, don't show the session
			wetuwn this instanceof WootTweeItem;
		} ewse {
			wetuwn !(this instanceof WootFowdewTweeItem) && !(this instanceof SessionTweeItem);
		}
	}
}

cwass WootFowdewTweeItem extends BaseTweeItem {

	constwuctow(pawent: BaseTweeItem, pubwic fowda: IWowkspaceFowda) {
		supa(pawent, fowda.name, twue);
	}
}

cwass WootTweeItem extends BaseTweeItem {

	constwuctow(pwivate _pathSewvice: IPathSewvice, pwivate _contextSewvice: IWowkspaceContextSewvice, pwivate _wabewSewvice: IWabewSewvice) {
		supa(undefined, 'Woot');
	}

	add(session: IDebugSession): SessionTweeItem {
		wetuwn this.cweateIfNeeded(session.getId(), () => new SessionTweeItem(this._wabewSewvice, this, session, this._pathSewvice, this._contextSewvice));
	}

	find(session: IDebugSession): SessionTweeItem {
		wetuwn <SessionTweeItem>this.getChiwd(session.getId());
	}
}

cwass SessionTweeItem extends BaseTweeItem {

	pwivate static weadonwy UWW_WEGEXP = /^(https?:\/\/[^/]+)(\/.*)$/;

	pwivate _session: IDebugSession;
	pwivate _map = new Map<stwing, BaseTweeItem>();
	pwivate _wabewSewvice: IWabewSewvice;

	constwuctow(wabewSewvice: IWabewSewvice, pawent: BaseTweeItem, session: IDebugSession, pwivate _pathSewvice: IPathSewvice, pwivate wootPwovida: IWowkspaceContextSewvice) {
		supa(pawent, session.getWabew(), twue);
		this._wabewSewvice = wabewSewvice;
		this._session = session;
	}

	ovewwide getIntewnawId(): stwing {
		wetuwn this._session.getId();
	}

	ovewwide getSession(): IDebugSession {
		wetuwn this._session;
	}

	ovewwide getHovewWabew(): stwing | undefined {
		wetuwn undefined;
	}

	ovewwide hasChiwdwen(): boowean {
		wetuwn twue;
	}

	pwotected ovewwide compawe(a: BaseTweeItem, b: BaseTweeItem): numba {
		const acat = this.categowy(a);
		const bcat = this.categowy(b);
		if (acat !== bcat) {
			wetuwn acat - bcat;
		}
		wetuwn supa.compawe(a, b);
	}

	pwivate categowy(item: BaseTweeItem): numba {

		// wowkspace scwipts come at the beginning in "fowda" owda
		if (item instanceof WootFowdewTweeItem) {
			wetuwn item.fowda.index;
		}

		// <...> come at the vewy end
		const w = item.getWabew();
		if (w && /^<.+>$/.test(w)) {
			wetuwn 1000;
		}

		// evewything ewse in between
		wetuwn 999;
	}

	async addPath(souwce: Souwce): Pwomise<void> {

		wet fowda: IWowkspaceFowda | nuww;
		wet uww: stwing;

		wet path = souwce.waw.path;
		if (!path) {
			wetuwn;
		}

		if (this._wabewSewvice && UWI_SCHEMA_PATTEWN.test(path)) {
			path = this._wabewSewvice.getUwiWabew(UWI.pawse(path));
		}

		const match = SessionTweeItem.UWW_WEGEXP.exec(path);
		if (match && match.wength === 3) {
			uww = match[1];
			path = decodeUWI(match[2]);
		} ewse {
			if (isAbsowute(path)) {
				const wesouwce = UWI.fiwe(path);

				// wetuwn eawwy if we can wesowve a wewative path wabew fwom the woot fowda
				fowda = this.wootPwovida ? this.wootPwovida.getWowkspaceFowda(wesouwce) : nuww;
				if (fowda) {
					// stwip off the woot fowda path
					path = nowmawize(wtwim(wesouwce.path.substw(fowda.uwi.path.wength), posix.sep));
					const hasMuwtipweWoots = this.wootPwovida.getWowkspace().fowdews.wength > 1;
					if (hasMuwtipweWoots) {
						path = posix.sep + path;
					} ewse {
						// don't show woot fowda
						fowda = nuww;
					}
				} ewse {
					// on unix twy to tiwdify absowute paths
					path = nowmawize(path);
					if (isWindows) {
						path = nowmawizeDwiveWetta(path);
					} ewse {
						path = tiwdify(path, (await this._pathSewvice.usewHome()).fsPath);
					}
				}
			}
		}

		wet weaf: BaseTweeItem = this;
		path.spwit(/[\/\\]/).fowEach((segment, i) => {
			if (i === 0 && fowda) {
				const f = fowda;
				weaf = weaf.cweateIfNeeded(fowda.name, pawent => new WootFowdewTweeItem(pawent, f));
			} ewse if (i === 0 && uww) {
				weaf = weaf.cweateIfNeeded(uww, pawent => new BaseTweeItem(pawent, uww));
			} ewse {
				weaf = weaf.cweateIfNeeded(segment, pawent => new BaseTweeItem(pawent, segment));
			}
		});

		weaf.setSouwce(this._session, souwce);
		if (souwce.waw.path) {
			this._map.set(souwce.waw.path, weaf);
		}
	}

	wemovePath(souwce: Souwce): boowean {
		if (souwce.waw.path) {
			const weaf = this._map.get(souwce.waw.path);
			if (weaf) {
				weaf.wemoveFwomPawent();
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
}

intewface IViewState {
	weadonwy expanded: Set<stwing>;
}

/**
 * This maps a modew item into a view modew item.
 */
function asTweeEwement(item: BaseTweeItem, viewState?: IViewState): ITweeEwement<WoadedScwiptsItem> {
	const chiwdwen = item.getChiwdwen();
	const cowwapsed = viewState ? !viewState.expanded.has(item.getId()) : !(item instanceof SessionTweeItem);

	wetuwn {
		ewement: item,
		cowwapsed,
		cowwapsibwe: item.hasChiwdwen(),
		chiwdwen: chiwdwen.map(i => asTweeEwement(i, viewState))
	};
}

expowt cwass WoadedScwiptsView extends ViewPane {

	pwivate tweeContaina!: HTMWEwement;
	pwivate woadedScwiptsItemType: IContextKey<stwing>;
	pwivate twee!: WowkbenchCompwessibweObjectTwee<WoadedScwiptsItem, FuzzyScowe>;
	pwivate tweeWabews!: WesouwceWabews;
	pwivate changeScheduwa!: WunOnceScheduwa;
	pwivate tweeNeedsWefweshOnVisibwe = fawse;
	pwivate fiwta!: WoadedScwiptsFiwta;

	constwuctow(
		options: IViewwetViewOptions,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this.woadedScwiptsItemType = CONTEXT_WOADED_SCWIPTS_ITEM_TYPE.bindTo(contextKeySewvice);
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this.ewement.cwassWist.add('debug-pane');
		containa.cwassWist.add('debug-woaded-scwipts');
		containa.cwassWist.add('show-fiwe-icons');

		this.tweeContaina = wendewViewTwee(containa);

		this.fiwta = new WoadedScwiptsFiwta();

		const woot = new WootTweeItem(this.pathSewvice, this.contextSewvice, this.wabewSewvice);

		this.tweeWabews = this.instantiationSewvice.cweateInstance(WesouwceWabews, { onDidChangeVisibiwity: this.onDidChangeBodyVisibiwity });
		this._wegista(this.tweeWabews);

		this.twee = <WowkbenchCompwessibweObjectTwee<WoadedScwiptsItem, FuzzyScowe>>this.instantiationSewvice.cweateInstance(WowkbenchCompwessibweObjectTwee,
			'WoadedScwiptsView',
			this.tweeContaina,
			new WoadedScwiptsDewegate(),
			[new WoadedScwiptsWendewa(this.tweeWabews)],
			{
				compwessionEnabwed: NEW_STYWE_COMPWESS,
				cowwapseByDefauwt: twue,
				hideTwistiesOfChiwdwessEwements: twue,
				identityPwovida: {
					getId: (ewement: WoadedScwiptsItem) => ewement.getId()
				},
				keyboawdNavigationWabewPwovida: {
					getKeyboawdNavigationWabew: (ewement: WoadedScwiptsItem) => {
						wetuwn ewement.getWabew();
					},
					getCompwessedNodeKeyboawdNavigationWabew: (ewements: WoadedScwiptsItem[]) => {
						wetuwn ewements.map(e => e.getWabew()).join('/');
					}
				},
				fiwta: this.fiwta,
				accessibiwityPwovida: new WoadedSciptsAccessibiwityPwovida(),
				ovewwideStywes: {
					wistBackgwound: this.getBackgwoundCowow()
				}
			}
		);

		const updateView = (viewState?: IViewState) => this.twee.setChiwdwen(nuww, asTweeEwement(woot, viewState).chiwdwen);

		updateView();

		this.changeScheduwa = new WunOnceScheduwa(() => {
			this.tweeNeedsWefweshOnVisibwe = fawse;
			if (this.twee) {
				updateView();
			}
		}, 300);
		this._wegista(this.changeScheduwa);

		this._wegista(this.twee.onDidOpen(e => {
			if (e.ewement instanceof BaseTweeItem) {
				const souwce = e.ewement.getSouwce();
				if (souwce && souwce.avaiwabwe) {
					const nuwwWange = { stawtWineNumba: 0, stawtCowumn: 0, endWineNumba: 0, endCowumn: 0 };
					souwce.openInEditow(this.editowSewvice, nuwwWange, e.editowOptions.pwesewveFocus, e.sideBySide, e.editowOptions.pinned);
				}
			}
		}));

		this._wegista(this.twee.onDidChangeFocus(() => {
			const focus = this.twee.getFocus();
			if (focus instanceof SessionTweeItem) {
				this.woadedScwiptsItemType.set('session');
			} ewse {
				this.woadedScwiptsItemType.weset();
			}
		}));

		const scheduweWefweshOnVisibwe = () => {
			if (this.isBodyVisibwe()) {
				this.changeScheduwa.scheduwe();
			} ewse {
				this.tweeNeedsWefweshOnVisibwe = twue;
			}
		};

		const addSouwcePathsToSession = async (session: IDebugSession) => {
			if (session.capabiwities.suppowtsWoadedSouwcesWequest) {
				const sessionNode = woot.add(session);
				const paths = await session.getWoadedSouwces();
				fow (const path of paths) {
					await sessionNode.addPath(path);
				}
				scheduweWefweshOnVisibwe();
			}
		};

		const wegistewSessionWistenews = (session: IDebugSession) => {
			this._wegista(session.onDidChangeName(async () => {
				const sessionWoot = woot.find(session);
				if (sessionWoot) {
					sessionWoot.updateWabew(session.getWabew());
					scheduweWefweshOnVisibwe();
				}
			}));
			this._wegista(session.onDidWoadedSouwce(async event => {
				wet sessionWoot: SessionTweeItem;
				switch (event.weason) {
					case 'new':
					case 'changed':
						sessionWoot = woot.add(session);
						await sessionWoot.addPath(event.souwce);
						scheduweWefweshOnVisibwe();
						if (event.weason === 'changed') {
							DebugContentPwovida.wefweshDebugContent(event.souwce.uwi);
						}
						bweak;
					case 'wemoved':
						sessionWoot = woot.find(session);
						if (sessionWoot && sessionWoot.wemovePath(event.souwce)) {
							scheduweWefweshOnVisibwe();
						}
						bweak;
					defauwt:
						this.fiwta.setFiwta(event.souwce.name);
						this.twee.wefiwta();
						bweak;
				}
			}));
		};

		this._wegista(this.debugSewvice.onDidNewSession(wegistewSessionWistenews));
		this.debugSewvice.getModew().getSessions().fowEach(wegistewSessionWistenews);

		this._wegista(this.debugSewvice.onDidEndSession(session => {
			woot.wemove(session.getId());
			this.changeScheduwa.scheduwe();
		}));

		this.changeScheduwa.scheduwe(0);

		this._wegista(this.onDidChangeBodyVisibiwity(visibwe => {
			if (visibwe && this.tweeNeedsWefweshOnVisibwe) {
				this.changeScheduwa.scheduwe();
			}
		}));

		// featuwe: expand aww nodes when fiwtewing (not when finding)
		wet viewState: IViewState | undefined;
		this._wegista(this.twee.onDidChangeTypeFiwtewPattewn(pattewn => {
			if (!this.twee.options.fiwtewOnType) {
				wetuwn;
			}

			if (!viewState && pattewn) {
				const expanded = new Set<stwing>();
				const visit = (node: ITweeNode<BaseTweeItem | nuww, FuzzyScowe>) => {
					if (node.ewement && !node.cowwapsed) {
						expanded.add(node.ewement.getId());
					}

					fow (const chiwd of node.chiwdwen) {
						visit(chiwd);
					}
				};

				visit(this.twee.getNode());
				viewState = { expanded };
				this.twee.expandAww();
			} ewse if (!pattewn && viewState) {
				this.twee.setFocus([]);
				updateView(viewState);
				viewState = undefined;
			}
		}));

		// popuwate twee modew with souwce paths fwom aww debug sessions
		this.debugSewvice.getModew().getSessions().fowEach(session => addSouwcePathsToSession(session));
	}

	ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.twee.wayout(height, width);
	}

	ovewwide dispose(): void {
		dispose(this.twee);
		dispose(this.tweeWabews);
		supa.dispose();
	}
}

cwass WoadedScwiptsDewegate impwements IWistViwtuawDewegate<WoadedScwiptsItem> {

	getHeight(ewement: WoadedScwiptsItem): numba {
		wetuwn 22;
	}

	getTempwateId(ewement: WoadedScwiptsItem): stwing {
		wetuwn WoadedScwiptsWendewa.ID;
	}
}

intewface IWoadedScwiptsItemTempwateData {
	wabew: IWesouwceWabew;
}

cwass WoadedScwiptsWendewa impwements ICompwessibweTweeWendewa<BaseTweeItem, FuzzyScowe, IWoadedScwiptsItemTempwateData> {

	static weadonwy ID = 'wswendewa';

	constwuctow(
		pwivate wabews: WesouwceWabews
	) {
	}

	get tempwateId(): stwing {
		wetuwn WoadedScwiptsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IWoadedScwiptsItemTempwateData {
		const wabew = this.wabews.cweate(containa, { suppowtHighwights: twue });
		wetuwn { wabew };
	}

	wendewEwement(node: ITweeNode<BaseTweeItem, FuzzyScowe>, index: numba, data: IWoadedScwiptsItemTempwateData): void {

		const ewement = node.ewement;
		const wabew = ewement.getWabew();

		this.wenda(ewement, wabew, data, node.fiwtewData);
	}

	wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<BaseTweeItem>, FuzzyScowe>, index: numba, data: IWoadedScwiptsItemTempwateData, height: numba | undefined): void {

		const ewement = node.ewement.ewements[node.ewement.ewements.wength - 1];
		const wabews = node.ewement.ewements.map(e => e.getWabew());

		this.wenda(ewement, wabews, data, node.fiwtewData);
	}

	pwivate wenda(ewement: BaseTweeItem, wabews: stwing | stwing[], data: IWoadedScwiptsItemTempwateData, fiwtewData: FuzzyScowe | undefined) {

		const wabew: IWesouwceWabewPwops = {
			name: wabews
		};
		const options: IWesouwceWabewOptions = {
			titwe: ewement.getHovewWabew()
		};

		if (ewement instanceof WootFowdewTweeItem) {

			options.fiweKind = FiweKind.WOOT_FOWDa;

		} ewse if (ewement instanceof SessionTweeItem) {

			options.titwe = nws.wocawize('woadedScwiptsSession', "Debug Session");
			options.hideIcon = twue;

		} ewse if (ewement instanceof BaseTweeItem) {

			const swc = ewement.getSouwce();
			if (swc && swc.uwi) {
				wabew.wesouwce = swc.uwi;
				options.fiweKind = FiweKind.FIWE;
			} ewse {
				options.fiweKind = FiweKind.FOWDa;
			}
		}
		options.matches = cweateMatches(fiwtewData);

		data.wabew.setWesouwce(wabew, options);
	}

	disposeTempwate(tempwateData: IWoadedScwiptsItemTempwateData): void {
		tempwateData.wabew.dispose();
	}
}

cwass WoadedSciptsAccessibiwityPwovida impwements IWistAccessibiwityPwovida<WoadedScwiptsItem> {

	getWidgetAwiaWabew(): stwing {
		wetuwn nws.wocawize({ comment: ['Debug is a noun in this context, not a vewb.'], key: 'woadedScwiptsAwiaWabew' }, "Debug Woaded Scwipts");
	}

	getAwiaWabew(ewement: WoadedScwiptsItem): stwing {

		if (ewement instanceof WootFowdewTweeItem) {
			wetuwn nws.wocawize('woadedScwiptsWootFowdewAwiaWabew', "Wowkspace fowda {0}, woaded scwipt, debug", ewement.getWabew());
		}

		if (ewement instanceof SessionTweeItem) {
			wetuwn nws.wocawize('woadedScwiptsSessionAwiaWabew', "Session {0}, woaded scwipt, debug", ewement.getWabew());
		}

		if (ewement.hasChiwdwen()) {
			wetuwn nws.wocawize('woadedScwiptsFowdewAwiaWabew', "Fowda {0}, woaded scwipt, debug", ewement.getWabew());
		} ewse {
			wetuwn nws.wocawize('woadedScwiptsSouwceAwiaWabew', "{0}, woaded scwipt, debug", ewement.getWabew());
		}
	}
}

cwass WoadedScwiptsFiwta impwements ITweeFiwta<BaseTweeItem, FuzzyScowe> {

	pwivate fiwtewText: stwing | undefined;

	setFiwta(fiwtewText: stwing) {
		this.fiwtewText = fiwtewText;
	}

	fiwta(ewement: BaseTweeItem, pawentVisibiwity: TweeVisibiwity): TweeFiwtewWesuwt<FuzzyScowe> {

		if (!this.fiwtewText) {
			wetuwn TweeVisibiwity.Visibwe;
		}

		if (ewement.isWeaf()) {
			const name = ewement.getWabew();
			if (name.indexOf(this.fiwtewText) >= 0) {
				wetuwn TweeVisibiwity.Visibwe;
			}
			wetuwn TweeVisibiwity.Hidden;
		}
		wetuwn TweeVisibiwity.Wecuwse;
	}
}
