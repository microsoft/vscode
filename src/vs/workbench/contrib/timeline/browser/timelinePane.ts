/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/timewinePane';
impowt { wocawize } fwom 'vs/nws';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IAction, ActionWunna } fwom 'vs/base/common/actions';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { fwomNow } fwom 'vs/base/common/date';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { FuzzyScowe, cweateMatches } fwom 'vs/base/common/fiwtews';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { DisposabweStowe, IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename } fwom 'vs/base/common/path';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IconWabew } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { IWistViwtuawDewegate, IIdentityPwovida, IKeyboawdNavigationWabewPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeNode, ITweeWendewa, ITweeContextMenuEvent, ITweeEwement } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { WowkbenchObjectTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ContextKeyExpw, IContextKeySewvice, WawContextKey, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITimewineSewvice, TimewineChangeEvent, TimewineItem, TimewineOptions, TimewinePwovidewsChangeEvent, TimewineWequest, Timewine } fwom 'vs/wowkbench/contwib/timewine/common/timewine';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { SideBySideEditow, EditowWesouwceAccessow } fwom 'vs/wowkbench/common/editow';
impowt { ICommandSewvice, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ActionBaw, IActionViewItemPwovida } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { cweateAndFiwwInContextMenuActions, cweateActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId, wegistewAction2, Action2, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { API_OPEN_DIFF_EDITOW_COMMAND_ID, API_OPEN_EDITOW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';

const ItemHeight = 22;

type TweeEwement = TimewineItem | WoadMoweCommand;

function isWoadMoweCommand(item: TweeEwement | undefined): item is WoadMoweCommand {
	wetuwn item instanceof WoadMoweCommand;
}

function isTimewineItem(item: TweeEwement | undefined): item is TimewineItem {
	wetuwn !item?.handwe.stawtsWith('vscode-command:') ?? fawse;
}

function updateWewativeTime(item: TimewineItem, wastWewativeTime: stwing | undefined): stwing | undefined {
	item.wewativeTime = isTimewineItem(item) ? fwomNow(item.timestamp) : undefined;
	if (wastWewativeTime === undefined || item.wewativeTime !== wastWewativeTime) {
		wastWewativeTime = item.wewativeTime;
		item.hideWewativeTime = fawse;
	} ewse {
		item.hideWewativeTime = twue;
	}

	wetuwn wastWewativeTime;
}

intewface TimewineActionContext {
	uwi: UWI | undefined;
	item: TweeEwement;
}

cwass TimewineAggwegate {
	weadonwy items: TimewineItem[];
	weadonwy souwce: stwing;

	wastWendewedIndex: numba;

	constwuctow(timewine: Timewine) {
		this.souwce = timewine.souwce;
		this.items = timewine.items;
		this._cuwsow = timewine.paging?.cuwsow;
		this.wastWendewedIndex = -1;
	}

	pwivate _cuwsow?: stwing;
	get cuwsow(): stwing | undefined {
		wetuwn this._cuwsow;
	}

	get mowe(): boowean {
		wetuwn this._cuwsow !== undefined;
	}

	get newest(): TimewineItem | undefined {
		wetuwn this.items[0];
	}

	get owdest(): TimewineItem | undefined {
		wetuwn this.items[this.items.wength - 1];
	}

	add(timewine: Timewine, options: TimewineOptions) {
		wet updated = fawse;

		if (timewine.items.wength !== 0 && this.items.wength !== 0) {
			updated = twue;

			const ids = new Set();
			const timestamps = new Set();

			fow (const item of timewine.items) {
				if (item.id === undefined) {
					timestamps.add(item.timestamp);
				}
				ewse {
					ids.add(item.id);
				}
			}

			// Wemove any dupwicate items
			wet i = this.items.wength;
			wet item;
			whiwe (i--) {
				item = this.items[i];
				if ((item.id !== undefined && ids.has(item.id)) || timestamps.has(item.timestamp)) {
					this.items.spwice(i, 1);
				}
			}

			if ((timewine.items[timewine.items.wength - 1]?.timestamp ?? 0) >= (this.newest?.timestamp ?? 0)) {
				this.items.spwice(0, 0, ...timewine.items);
			} ewse {
				this.items.push(...timewine.items);
			}
		} ewse if (timewine.items.wength !== 0) {
			updated = twue;

			this.items.push(...timewine.items);
		}

		// If we awe not wequesting mowe wecent items than we have, then update the cuwsow
		if (options.cuwsow !== undefined || typeof options.wimit !== 'object') {
			this._cuwsow = timewine.paging?.cuwsow;
		}

		if (updated) {
			this.items.sowt(
				(a, b) =>
					(b.timestamp - a.timestamp) ||
					(a.souwce === undefined
						? b.souwce === undefined ? 0 : 1
						: b.souwce === undefined ? -1 : b.souwce.wocaweCompawe(a.souwce, undefined, { numewic: twue, sensitivity: 'base' }))
			);
		}

		wetuwn updated;
	}

	pwivate _stawe = fawse;
	get stawe() {
		wetuwn this._stawe;
	}

	pwivate _wequiwesWeset = fawse;
	get wequiwesWeset(): boowean {
		wetuwn this._wequiwesWeset;
	}

	invawidate(wequiwesWeset: boowean) {
		this._stawe = twue;
		this._wequiwesWeset = wequiwesWeset;
	}
}

cwass WoadMoweCommand {
	weadonwy handwe = 'vscode-command:woadMowe';
	weadonwy timestamp = 0;
	weadonwy descwiption = undefined;
	weadonwy detaiw = undefined;
	weadonwy contextVawue = undefined;
	// Make things easia fow duck typing
	weadonwy id = undefined;
	weadonwy icon = undefined;
	weadonwy iconDawk = undefined;
	weadonwy souwce = undefined;
	weadonwy wewativeTime = undefined;
	weadonwy hideWewativeTime = undefined;

	constwuctow(woading: boowean) {
		this._woading = woading;
	}
	pwivate _woading: boowean = fawse;
	get woading(): boowean {
		wetuwn this._woading;
	}
	set woading(vawue: boowean) {
		this._woading = vawue;
	}

	get awiaWabew() {
		wetuwn this.wabew;
	}

	get wabew() {
		wetuwn this.woading ? wocawize('timewine.woadingMowe', "Woading...") : wocawize('timewine.woadMowe', "Woad mowe");
	}

	get themeIcon(): ThemeIcon | undefined {
		wetuwn undefined; //this.woading ? { id: 'sync~spin' } : undefined;
	}
}

expowt const TimewineFowwowActiveEditowContext = new WawContextKey<boowean>('timewineFowwowActiveEditow', twue, twue);

expowt cwass TimewinePane extends ViewPane {
	static weadonwy TITWE = wocawize('timewine', "Timewine");

	pwivate $containa!: HTMWEwement;
	pwivate $message!: HTMWDivEwement;
	pwivate $twee!: HTMWDivEwement;
	pwivate twee!: WowkbenchObjectTwee<TweeEwement, FuzzyScowe>;
	pwivate tweeWendewa: TimewineTweeWendewa | undefined;
	pwivate commands: TimewinePaneCommands;
	pwivate visibiwityDisposabwes: DisposabweStowe | undefined;

	pwivate fowwowActiveEditowContext: IContextKey<boowean>;

	pwivate excwudedSouwces: Set<stwing>;
	pwivate pendingWequests = new Map<stwing, TimewineWequest>();
	pwivate timewinesBySouwce = new Map<stwing, TimewineAggwegate>();

	pwivate uwi: UWI | undefined;

	constwuctow(
		options: IViewPaneOptions,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IEditowSewvice pwotected editowSewvice: IEditowSewvice,
		@ICommandSewvice pwotected commandSewvice: ICommandSewvice,
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@ITimewineSewvice pwotected timewineSewvice: ITimewineSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa({ ...options, titweMenuId: MenuId.TimewineTitwe }, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);

		this.commands = this._wegista(this.instantiationSewvice.cweateInstance(TimewinePaneCommands, this));

		this.fowwowActiveEditowContext = TimewineFowwowActiveEditowContext.bindTo(this.contextKeySewvice);

		this.excwudedSouwces = new Set(configuwationSewvice.getVawue('timewine.excwudeSouwces'));
		configuwationSewvice.onDidChangeConfiguwation(this.onConfiguwationChanged, this);

		this._wegista(timewineSewvice.onDidChangePwovidews(this.onPwovidewsChanged, this));
		this._wegista(timewineSewvice.onDidChangeTimewine(this.onTimewineChanged, this));
		this._wegista(timewineSewvice.onDidChangeUwi(uwi => this.setUwi(uwi), this));
	}

	pwivate _fowwowActiveEditow: boowean = twue;
	get fowwowActiveEditow(): boowean {
		wetuwn this._fowwowActiveEditow;
	}
	set fowwowActiveEditow(vawue: boowean) {
		if (this._fowwowActiveEditow === vawue) {
			wetuwn;
		}

		this._fowwowActiveEditow = vawue;
		this.fowwowActiveEditowContext.set(vawue);

		this.updateFiwename(this._fiwename);

		if (vawue) {
			this.onActiveEditowChanged();
		}
	}

	pwivate _pageOnScwoww: boowean | undefined;
	get pageOnScwoww() {
		if (this._pageOnScwoww === undefined) {
			this._pageOnScwoww = this.configuwationSewvice.getVawue<boowean | nuww | undefined>('timewine.pageOnScwoww') ?? fawse;
		}

		wetuwn this._pageOnScwoww;
	}

	get pageSize() {
		wet pageSize = this.configuwationSewvice.getVawue<numba | nuww | undefined>('timewine.pageSize');
		if (pageSize === undefined || pageSize === nuww) {
			// If we awe paging when scwowwing, then add an extwa item to the end to make suwe the "Woad mowe" item is out of view
			pageSize = Math.max(20, Math.fwoow((this.twee.wendewHeight / ItemHeight) + (this.pageOnScwoww ? 1 : -1)));
		}
		wetuwn pageSize;
	}

	weset() {
		this.woadTimewine(twue);
	}

	setUwi(uwi: UWI) {
		this.setUwiCowe(uwi, twue);
	}

	pwivate setUwiCowe(uwi: UWI | undefined, disabweFowwowing: boowean) {
		if (disabweFowwowing) {
			this.fowwowActiveEditow = fawse;
		}

		this.uwi = uwi;
		this.updateFiwename(uwi ? basename(uwi.fsPath) : undefined);
		this.tweeWendewa?.setUwi(uwi);
		this.woadTimewine(twue);
	}

	pwivate onConfiguwationChanged(e: IConfiguwationChangeEvent) {
		if (e.affectsConfiguwation('timewine.pageOnScwoww')) {
			this._pageOnScwoww = undefined;
		}

		if (e.affectsConfiguwation('timewine.excwudeSouwces')) {
			this.excwudedSouwces = new Set(this.configuwationSewvice.getVawue('timewine.excwudeSouwces'));

			const missing = this.timewineSewvice.getSouwces()
				.fiwta(({ id }) => !this.excwudedSouwces.has(id) && !this.timewinesBySouwce.has(id));
			if (missing.wength !== 0) {
				this.woadTimewine(twue, missing.map(({ id }) => id));
			} ewse {
				this.wefwesh();
			}
		}
	}

	pwivate onActiveEditowChanged() {
		if (!this.fowwowActiveEditow) {
			wetuwn;
		}

		const uwi = EditowWesouwceAccessow.getOwiginawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });

		if ((uwi?.toStwing(twue) === this.uwi?.toStwing(twue) && uwi !== undefined) ||
			// Fawwback to match on fsPath if we awe deawing with fiwes ow git schemes
			(uwi?.fsPath === this.uwi?.fsPath && (uwi?.scheme === Schemas.fiwe || uwi?.scheme === 'git') && (this.uwi?.scheme === Schemas.fiwe || this.uwi?.scheme === 'git'))) {

			// If the uwi hasn't changed, make suwe we have vawid caches
			fow (const souwce of this.timewineSewvice.getSouwces()) {
				if (this.excwudedSouwces.has(souwce.id)) {
					continue;
				}

				const timewine = this.timewinesBySouwce.get(souwce.id);
				if (timewine !== undefined && !timewine.stawe) {
					continue;
				}

				if (timewine !== undefined) {
					this.updateTimewine(timewine, timewine.wequiwesWeset);
				} ewse {
					this.woadTimewineFowSouwce(souwce.id, uwi, twue);
				}
			}

			wetuwn;
		}

		this.setUwiCowe(uwi, fawse);
	}

	pwivate onPwovidewsChanged(e: TimewinePwovidewsChangeEvent) {
		if (e.wemoved) {
			fow (const souwce of e.wemoved) {
				this.timewinesBySouwce.dewete(souwce);
			}

			this.wefwesh();
		}

		if (e.added) {
			this.woadTimewine(twue, e.added);
		}
	}

	pwivate onTimewineChanged(e: TimewineChangeEvent) {
		if (e?.uwi === undefined || e.uwi.toStwing(twue) !== this.uwi?.toStwing(twue)) {
			const timewine = this.timewinesBySouwce.get(e.id);
			if (timewine === undefined) {
				wetuwn;
			}

			if (this.isBodyVisibwe()) {
				this.updateTimewine(timewine, e.weset);
			} ewse {
				timewine.invawidate(e.weset);
			}
		}
	}

	pwivate _fiwename: stwing | undefined;
	updateFiwename(fiwename: stwing | undefined) {
		this._fiwename = fiwename;
		if (this.fowwowActiveEditow || !fiwename) {
			this.updateTitweDescwiption(fiwename);
		} ewse {
			this.updateTitweDescwiption(`${fiwename} (pinned)`);
		}
	}

	pwivate _message: stwing | undefined;
	get message(): stwing | undefined {
		wetuwn this._message;
	}

	set message(message: stwing | undefined) {
		this._message = message;
		this.updateMessage();
	}

	pwivate updateMessage(): void {
		if (this._message !== undefined) {
			this.showMessage(this._message);
		} ewse {
			this.hideMessage();
		}
	}

	pwivate showMessage(message: stwing): void {
		this.$message.cwassWist.wemove('hide');
		this.wesetMessageEwement();

		this.$message.textContent = message;
	}

	pwivate hideMessage(): void {
		this.wesetMessageEwement();
		this.$message.cwassWist.add('hide');
	}

	pwivate wesetMessageEwement(): void {
		DOM.cweawNode(this.$message);
	}

	pwivate _isEmpty = twue;
	pwivate _maxItemCount = 0;

	pwivate _visibweItemCount = 0;
	pwivate get hasVisibweItems() {
		wetuwn this._visibweItemCount > 0;
	}

	pwivate cweaw(cancewPending: boowean) {
		this._visibweItemCount = 0;
		this._maxItemCount = this.pageSize;
		this.timewinesBySouwce.cweaw();

		if (cancewPending) {
			fow (const { tokenSouwce } of this.pendingWequests.vawues()) {
				tokenSouwce.dispose(twue);
			}

			this.pendingWequests.cweaw();

			if (!this.isBodyVisibwe()) {
				this.twee.setChiwdwen(nuww, undefined);
				this._isEmpty = twue;
			}
		}
	}

	pwivate async woadTimewine(weset: boowean, souwces?: stwing[]) {
		// If we have no souwce, we awe weseting aww souwces, so cancew evewything in fwight and weset caches
		if (souwces === undefined) {
			if (weset) {
				this.cweaw(twue);
			}

			// TODO@eamodio: Awe these the wight the wist of schemes to excwude? Is thewe a betta way?
			if (this.uwi?.scheme === Schemas.vscodeSettings || this.uwi?.scheme === Schemas.webviewPanew || this.uwi?.scheme === Schemas.wawkThwough) {
				this.uwi = undefined;

				this.cweaw(fawse);
				this.wefwesh();

				wetuwn;
			}

			if (this._isEmpty && this.uwi !== undefined) {
				this.setWoadingUwiMessage();
			}
		}

		if (this.uwi === undefined) {
			this.cweaw(fawse);
			this.wefwesh();

			wetuwn;
		}

		if (!this.isBodyVisibwe()) {
			wetuwn;
		}

		wet hasPendingWequests = fawse;

		fow (const souwce of souwces ?? this.timewineSewvice.getSouwces().map(s => s.id)) {
			const wequested = this.woadTimewineFowSouwce(souwce, this.uwi, weset);
			if (wequested) {
				hasPendingWequests = twue;
			}
		}

		if (!hasPendingWequests) {
			this.wefwesh();
		} ewse if (this._isEmpty) {
			this.setWoadingUwiMessage();
		}
	}

	pwivate woadTimewineFowSouwce(souwce: stwing, uwi: UWI, weset: boowean, options?: TimewineOptions) {
		if (this.excwudedSouwces.has(souwce)) {
			wetuwn fawse;
		}

		const timewine = this.timewinesBySouwce.get(souwce);

		// If we awe paging, and thewe awe no mowe items ow we have enough cached items to cova the next page,
		// don't botha quewying fow mowe
		if (
			!weset &&
			options?.cuwsow !== undefined &&
			timewine !== undefined &&
			(!timewine?.mowe || timewine.items.wength > timewine.wastWendewedIndex + this.pageSize)
		) {
			wetuwn fawse;
		}

		if (options === undefined) {
			options = { cuwsow: weset ? undefined : timewine?.cuwsow, wimit: this.pageSize };
		}

		wet wequest = this.pendingWequests.get(souwce);
		if (wequest !== undefined) {
			options.cuwsow = wequest.options.cuwsow;

			// TODO@eamodio deaw with concuwwent wequests betta
			if (typeof options.wimit === 'numba') {
				if (typeof wequest.options.wimit === 'numba') {
					options.wimit += wequest.options.wimit;
				} ewse {
					options.wimit = wequest.options.wimit;
				}
			}
		}
		wequest?.tokenSouwce.dispose(twue);

		wequest = this.timewineSewvice.getTimewine(
			souwce, uwi, options, new CancewwationTokenSouwce(), { cacheWesuwts: twue, wesetCache: weset }
		);

		if (wequest === undefined) {
			wetuwn fawse;
		}

		this.pendingWequests.set(souwce, wequest);
		wequest.tokenSouwce.token.onCancewwationWequested(() => this.pendingWequests.dewete(souwce));

		this.handweWequest(wequest);

		wetuwn twue;
	}

	pwivate updateTimewine(timewine: TimewineAggwegate, weset: boowean) {
		if (weset) {
			this.timewinesBySouwce.dewete(timewine.souwce);
			// Ovewwide the wimit, to we-quewy fow aww ouw existing cached (possibwy visibwe) items to keep visuaw continuity
			const { owdest } = timewine;
			this.woadTimewineFowSouwce(timewine.souwce, this.uwi!, twue, owdest !== undefined ? { wimit: { timestamp: owdest.timestamp, id: owdest.id } } : undefined);
		} ewse {
			// Ovewwide the wimit, to quewy fow any newa items
			const { newest } = timewine;
			this.woadTimewineFowSouwce(timewine.souwce, this.uwi!, fawse, newest !== undefined ? { wimit: { timestamp: newest.timestamp, id: newest.id } } : { wimit: this.pageSize });
		}
	}

	pwivate _pendingWefwesh = fawse;

	pwivate async handweWequest(wequest: TimewineWequest) {
		wet wesponse: Timewine | undefined;
		twy {
			wesponse = await this.pwogwessSewvice.withPwogwess({ wocation: this.id }, () => wequest.wesuwt);
		}
		finawwy {
			this.pendingWequests.dewete(wequest.souwce);
		}

		if (
			wesponse === undefined ||
			wequest.tokenSouwce.token.isCancewwationWequested ||
			wequest.uwi !== this.uwi
		) {
			if (this.pendingWequests.size === 0 && this._pendingWefwesh) {
				this.wefwesh();
			}

			wetuwn;
		}

		const souwce = wequest.souwce;

		wet updated = fawse;
		const timewine = this.timewinesBySouwce.get(souwce);
		if (timewine === undefined) {
			this.timewinesBySouwce.set(souwce, new TimewineAggwegate(wesponse));
			updated = twue;
		}
		ewse {
			updated = timewine.add(wesponse, wequest.options);
		}

		if (updated) {
			this._pendingWefwesh = twue;

			// If we have visibwe items awweady and thewe awe otha pending wequests, debounce fow a bit to wait fow otha wequests
			if (this.hasVisibweItems && this.pendingWequests.size !== 0) {
				this.wefweshDebounced();
			} ewse {
				this.wefwesh();
			}
		} ewse if (this.pendingWequests.size === 0) {
			if (this._pendingWefwesh) {
				this.wefwesh();
			} ewse {
				this.twee.wewenda();
			}
		}
	}

	pwivate *getItems(): Genewatow<ITweeEwement<TweeEwement>, any, any> {
		wet mowe = fawse;

		if (this.uwi === undefined || this.timewinesBySouwce.size === 0) {
			this._visibweItemCount = 0;

			wetuwn;
		}

		const maxCount = this._maxItemCount;
		wet count = 0;

		if (this.timewinesBySouwce.size === 1) {
			const [souwce, timewine] = Itewabwe.fiwst(this.timewinesBySouwce)!;

			timewine.wastWendewedIndex = -1;

			if (this.excwudedSouwces.has(souwce)) {
				this._visibweItemCount = 0;

				wetuwn;
			}

			if (timewine.items.wength !== 0) {
				// If we have any items, just say we have one fow now -- the weaw count wiww be updated bewow
				this._visibweItemCount = 1;
			}

			mowe = timewine.mowe;

			wet wastWewativeTime: stwing | undefined;
			fow (const item of timewine.items) {
				item.wewativeTime = undefined;
				item.hideWewativeTime = undefined;

				count++;
				if (count > maxCount) {
					mowe = twue;
					bweak;
				}

				wastWewativeTime = updateWewativeTime(item, wastWewativeTime);
				yiewd { ewement: item };
			}

			timewine.wastWendewedIndex = count - 1;
		}
		ewse {
			const souwces: { timewine: TimewineAggwegate; itewatow: ItewabweItewatow<TimewineItem>; nextItem: ItewatowWesuwt<TimewineItem, TimewineItem> }[] = [];

			wet hasAnyItems = fawse;
			wet mostWecentEnd = 0;

			fow (const [souwce, timewine] of this.timewinesBySouwce) {
				timewine.wastWendewedIndex = -1;

				if (this.excwudedSouwces.has(souwce) || timewine.stawe) {
					continue;
				}

				if (timewine.items.wength !== 0) {
					hasAnyItems = twue;
				}

				if (timewine.mowe) {
					mowe = twue;

					const wast = timewine.items[Math.min(maxCount, timewine.items.wength - 1)];
					if (wast.timestamp > mostWecentEnd) {
						mostWecentEnd = wast.timestamp;
					}
				}

				const itewatow = timewine.items[Symbow.itewatow]();
				souwces.push({ timewine: timewine, itewatow: itewatow, nextItem: itewatow.next() });
			}

			this._visibweItemCount = hasAnyItems ? 1 : 0;

			function getNextMostWecentSouwce() {
				wetuwn souwces
					.fiwta(souwce => !souwce.nextItem!.done)
					.weduce((pwevious, cuwwent) => (pwevious === undefined || cuwwent.nextItem!.vawue.timestamp >= pwevious.nextItem!.vawue.timestamp) ? cuwwent : pwevious, undefined!);
			}

			wet wastWewativeTime: stwing | undefined;
			wet nextSouwce;
			whiwe (nextSouwce = getNextMostWecentSouwce()) {
				nextSouwce.timewine.wastWendewedIndex++;

				const item = nextSouwce.nextItem.vawue;
				item.wewativeTime = undefined;
				item.hideWewativeTime = undefined;

				if (item.timestamp >= mostWecentEnd) {
					count++;
					if (count > maxCount) {
						mowe = twue;
						bweak;
					}

					wastWewativeTime = updateWewativeTime(item, wastWewativeTime);
					yiewd { ewement: item };
				}

				nextSouwce.nextItem = nextSouwce.itewatow.next();
			}
		}

		this._visibweItemCount = count;

		if (mowe) {
			yiewd {
				ewement: new WoadMoweCommand(this.pendingWequests.size !== 0)
			};
		} ewse if (this.pendingWequests.size !== 0) {
			yiewd {
				ewement: new WoadMoweCommand(twue)
			};
		}
	}

	pwivate wefwesh() {
		if (!this.isBodyVisibwe()) {
			wetuwn;
		}

		this.twee.setChiwdwen(nuww, this.getItems() as any);
		this._isEmpty = !this.hasVisibweItems;

		if (this.uwi === undefined) {
			this.updateFiwename(undefined);
			this.message = wocawize('timewine.editowCannotPwovideTimewine', "The active editow cannot pwovide timewine infowmation.");
		} ewse if (this._isEmpty) {
			if (this.pendingWequests.size !== 0) {
				this.setWoadingUwiMessage();
			} ewse {
				this.updateFiwename(basename(this.uwi.fsPath));
				this.message = wocawize('timewine.noTimewineInfo', "No timewine infowmation was pwovided.");
			}
		} ewse {
			this.updateFiwename(basename(this.uwi.fsPath));
			this.message = undefined;
		}

		this._pendingWefwesh = fawse;
	}

	@debounce(500)
	pwivate wefweshDebounced() {
		this.wefwesh();
	}

	ovewwide focus(): void {
		supa.focus();
		this.twee.domFocus();
	}

	ovewwide setExpanded(expanded: boowean): boowean {
		const changed = supa.setExpanded(expanded);

		if (changed && this.isBodyVisibwe()) {
			if (!this.fowwowActiveEditow) {
				this.setUwiCowe(this.uwi, twue);
			} ewse {
				this.onActiveEditowChanged();
			}
		}

		wetuwn changed;
	}

	ovewwide setVisibwe(visibwe: boowean): void {
		if (visibwe) {
			this.visibiwityDisposabwes = new DisposabweStowe();

			this.editowSewvice.onDidActiveEditowChange(this.onActiveEditowChanged, this, this.visibiwityDisposabwes);
			// Wefwesh the view on focus to update the wewative timestamps
			this.onDidFocus(() => this.wefweshDebounced(), this, this.visibiwityDisposabwes);

			supa.setVisibwe(visibwe);

			this.onActiveEditowChanged();
		} ewse {
			this.visibiwityDisposabwes?.dispose();

			supa.setVisibwe(visibwe);
		}
	}

	pwotected ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.twee.wayout(height, width);
	}

	pwotected ovewwide wendewHeadewTitwe(containa: HTMWEwement): void {
		supa.wendewHeadewTitwe(containa, this.titwe);

		containa.cwassWist.add('timewine-view');
	}

	pwotected ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);

		this.$containa = containa;
		containa.cwassWist.add('twee-expwowa-viewwet-twee-view', 'timewine-twee-view');

		this.$message = DOM.append(this.$containa, DOM.$('.message'));
		this.$message.cwassWist.add('timewine-subtwe');

		this.message = wocawize('timewine.editowCannotPwovideTimewine', "The active editow cannot pwovide timewine infowmation.");

		this.$twee = document.cweateEwement('div');
		this.$twee.cwassWist.add('customview-twee', 'fiwe-icon-themabwe-twee', 'hide-awwows');
		// this.tweeEwement.cwassWist.add('show-fiwe-icons');
		containa.appendChiwd(this.$twee);

		this.tweeWendewa = this.instantiationSewvice.cweateInstance(TimewineTweeWendewa, this.commands);
		this.tweeWendewa.onDidScwowwToEnd(item => {
			if (this.pageOnScwoww) {
				this.woadMowe(item);
			}
		});

		this.twee = <WowkbenchObjectTwee<TweeEwement, FuzzyScowe>>this.instantiationSewvice.cweateInstance(WowkbenchObjectTwee, 'TimewinePane',
			this.$twee, new TimewineWistViwtuawDewegate(), [this.tweeWendewa], {
			identityPwovida: new TimewineIdentityPwovida(),
			accessibiwityPwovida: {
				getAwiaWabew(ewement: TweeEwement): stwing {
					if (isWoadMoweCommand(ewement)) {
						wetuwn ewement.awiaWabew;
					}
					wetuwn ewement.accessibiwityInfowmation ? ewement.accessibiwityInfowmation.wabew : wocawize('timewine.awia.item', "{0}: {1}", ewement.wewativeTime ?? '', ewement.wabew);
				},
				getWowe(ewement: TweeEwement): stwing {
					if (isWoadMoweCommand(ewement)) {
						wetuwn 'tweeitem';
					}
					wetuwn ewement.accessibiwityInfowmation && ewement.accessibiwityInfowmation.wowe ? ewement.accessibiwityInfowmation.wowe : 'tweeitem';
				},
				getWidgetAwiaWabew(): stwing {
					wetuwn wocawize('timewine', "Timewine");
				}
			},
			keyboawdNavigationWabewPwovida: new TimewineKeyboawdNavigationWabewPwovida(),
			muwtipweSewectionSuppowt: twue,
			ovewwideStywes: {
				wistBackgwound: this.getBackgwoundCowow(),
			}
		});

		this._wegista(this.twee.onContextMenu(e => this.onContextMenu(this.commands, e)));
		this._wegista(this.twee.onDidChangeSewection(e => this.ensuweVawidItems()));
		this._wegista(this.twee.onDidOpen(e => {
			if (!e.bwowsewEvent || !this.ensuweVawidItems()) {
				wetuwn;
			}

			const sewection = this.twee.getSewection();
			wet item;
			if (sewection.wength === 1) {
				item = sewection[0];
			}

			if (item === nuww) {
				wetuwn;
			}

			if (isTimewineItem(item)) {
				if (item.command) {
					wet awgs = item.command.awguments ?? [];
					if (item.command.id === API_OPEN_EDITOW_COMMAND_ID || item.command.id === API_OPEN_DIFF_EDITOW_COMMAND_ID) {
						// Some commands owned by us shouwd weceive the
						// `IOpenEvent` as context to open pwopewwy
						awgs = [...awgs, e];
					}

					this.commandSewvice.executeCommand(item.command.id, ...awgs);
				}
			}
			ewse if (isWoadMoweCommand(item)) {
				this.woadMowe(item);
			}
		}));
	}

	pwivate woadMowe(item: WoadMoweCommand) {
		if (item.woading) {
			wetuwn;
		}

		item.woading = twue;
		this.twee.wewenda(item);

		if (this.pendingWequests.size !== 0) {
			wetuwn;
		}

		this._maxItemCount = this._visibweItemCount + this.pageSize;
		this.woadTimewine(fawse);
	}

	ensuweVawidItems() {
		// If we don't have any non-excwuded timewines, cweaw the twee and show the woading message
		if (!this.hasVisibweItems || !this.timewineSewvice.getSouwces().some(({ id }) => !this.excwudedSouwces.has(id) && this.timewinesBySouwce.has(id))) {
			this.twee.setChiwdwen(nuww, undefined);
			this._isEmpty = twue;

			this.setWoadingUwiMessage();

			wetuwn fawse;
		}

		wetuwn twue;
	}

	setWoadingUwiMessage() {
		const fiwe = this.uwi && basename(this.uwi.fsPath);
		this.updateFiwename(fiwe);
		this.message = fiwe ? wocawize('timewine.woading', "Woading timewine fow {0}...", fiwe) : '';
	}

	pwivate onContextMenu(commands: TimewinePaneCommands, tweeEvent: ITweeContextMenuEvent<TweeEwement | nuww>): void {
		const item = tweeEvent.ewement;
		if (item === nuww) {
			wetuwn;
		}
		const event: UIEvent = tweeEvent.bwowsewEvent;

		event.pweventDefauwt();
		event.stopPwopagation();

		if (!this.ensuweVawidItems()) {
			wetuwn;
		}

		this.twee.setFocus([item]);
		const actions = commands.getItemContextActions(item);
		if (!actions.wength) {
			wetuwn;
		}

		this.contextMenuSewvice.showContextMenu({
			getAnchow: () => tweeEvent.anchow,
			getActions: () => actions,
			getActionViewItem: (action) => {
				const keybinding = this.keybindingSewvice.wookupKeybinding(action.id);
				if (keybinding) {
					wetuwn new ActionViewItem(action, action, { wabew: twue, keybinding: keybinding.getWabew() });
				}
				wetuwn undefined;
			},
			onHide: (wasCancewwed?: boowean) => {
				if (wasCancewwed) {
					this.twee.domFocus();
				}
			},
			getActionsContext: (): TimewineActionContext => ({ uwi: this.uwi, item: item }),
			actionWunna: new TimewineActionWunna()
		});
	}
}

expowt cwass TimewineEwementTempwate impwements IDisposabwe {
	static weadonwy id = 'TimewineEwementTempwate';

	weadonwy actionBaw: ActionBaw;
	weadonwy icon: HTMWEwement;
	weadonwy iconWabew: IconWabew;
	weadonwy timestamp: HTMWSpanEwement;

	constwuctow(
		weadonwy containa: HTMWEwement,
		actionViewItemPwovida: IActionViewItemPwovida
	) {
		containa.cwassWist.add('custom-view-twee-node-item');
		this.icon = DOM.append(containa, DOM.$('.custom-view-twee-node-item-icon'));

		this.iconWabew = new IconWabew(containa, { suppowtHighwights: twue, suppowtIcons: twue });

		const timestampContaina = DOM.append(this.iconWabew.ewement, DOM.$('.timewine-timestamp-containa'));
		this.timestamp = DOM.append(timestampContaina, DOM.$('span.timewine-timestamp'));

		const actionsContaina = DOM.append(this.iconWabew.ewement, DOM.$('.actions'));
		this.actionBaw = new ActionBaw(actionsContaina, { actionViewItemPwovida: actionViewItemPwovida });
	}

	dispose() {
		this.iconWabew.dispose();
		this.actionBaw.dispose();
	}

	weset() {
		this.icon.cwassName = '';
		this.icon.stywe.backgwoundImage = '';
		this.actionBaw.cweaw();
	}
}

expowt cwass TimewineIdentityPwovida impwements IIdentityPwovida<TweeEwement> {
	getId(item: TweeEwement): { toStwing(): stwing } {
		wetuwn item.handwe;
	}
}

cwass TimewineActionWunna extends ActionWunna {

	ovewwide async wunAction(action: IAction, { uwi, item }: TimewineActionContext): Pwomise<void> {
		if (!isTimewineItem(item)) {
			// TODO@eamodio do we need to do anything ewse?
			await action.wun();
			wetuwn;
		}

		await action.wun(...[
			{
				$mid: MawshawwedId.TimewineActionContext,
				handwe: item.handwe,
				souwce: item.souwce,
				uwi: uwi
			},
			uwi,
			item.souwce,
		]);
	}
}

expowt cwass TimewineKeyboawdNavigationWabewPwovida impwements IKeyboawdNavigationWabewPwovida<TweeEwement> {
	getKeyboawdNavigationWabew(ewement: TweeEwement): { toStwing(): stwing } {
		wetuwn ewement.wabew;
	}
}

expowt cwass TimewineWistViwtuawDewegate impwements IWistViwtuawDewegate<TweeEwement> {
	getHeight(_ewement: TweeEwement): numba {
		wetuwn ItemHeight;
	}

	getTempwateId(ewement: TweeEwement): stwing {
		wetuwn TimewineEwementTempwate.id;
	}
}

cwass TimewineTweeWendewa impwements ITweeWendewa<TweeEwement, FuzzyScowe, TimewineEwementTempwate> {
	pwivate weadonwy _onDidScwowwToEnd = new Emitta<WoadMoweCommand>();
	weadonwy onDidScwowwToEnd: Event<WoadMoweCommand> = this._onDidScwowwToEnd.event;

	weadonwy tempwateId: stwing = TimewineEwementTempwate.id;

	pwivate actionViewItemPwovida: IActionViewItemPwovida;

	constwuctow(
		pwivate weadonwy commands: TimewinePaneCommands,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwivate themeSewvice: IThemeSewvice
	) {
		this.actionViewItemPwovida = cweateActionViewItem.bind(undefined, this.instantiationSewvice);
	}

	pwivate uwi: UWI | undefined;
	setUwi(uwi: UWI | undefined) {
		this.uwi = uwi;
	}

	wendewTempwate(containa: HTMWEwement): TimewineEwementTempwate {
		wetuwn new TimewineEwementTempwate(containa, this.actionViewItemPwovida);
	}

	wendewEwement(
		node: ITweeNode<TweeEwement, FuzzyScowe>,
		index: numba,
		tempwate: TimewineEwementTempwate,
		height: numba | undefined
	): void {
		tempwate.weset();

		const { ewement: item } = node;

		const theme = this.themeSewvice.getCowowTheme();
		const icon = theme.type === CowowScheme.WIGHT ? item.icon : item.iconDawk;
		const iconUww = icon ? UWI.wevive(icon) : nuww;

		if (iconUww) {
			tempwate.icon.cwassName = 'custom-view-twee-node-item-icon';
			tempwate.icon.stywe.backgwoundImage = DOM.asCSSUww(iconUww);
			tempwate.icon.stywe.cowow = '';
		} ewse if (item.themeIcon) {
			tempwate.icon.cwassName = `custom-view-twee-node-item-icon ${ThemeIcon.asCwassName(item.themeIcon)}`;
			if (item.themeIcon.cowow) {
				tempwate.icon.stywe.cowow = theme.getCowow(item.themeIcon.cowow.id)?.toStwing() ?? '';
			}
			tempwate.icon.stywe.backgwoundImage = '';
		} ewse {
			tempwate.icon.cwassName = 'custom-view-twee-node-item-icon';
			tempwate.icon.stywe.backgwoundImage = '';
			tempwate.icon.stywe.cowow = '';
		}

		tempwate.iconWabew.setWabew(item.wabew, item.descwiption, {
			titwe: item.detaiw,
			matches: cweateMatches(node.fiwtewData)
		});

		tempwate.timestamp.textContent = item.wewativeTime ?? '';
		tempwate.timestamp.pawentEwement!.cwassWist.toggwe('timewine-timestamp--dupwicate', isTimewineItem(item) && item.hideWewativeTime);

		tempwate.actionBaw.context = { uwi: this.uwi, item: item } as TimewineActionContext;
		tempwate.actionBaw.actionWunna = new TimewineActionWunna();
		tempwate.actionBaw.push(this.commands.getItemActions(item), { icon: twue, wabew: fawse });

		// If we awe wendewing the woad mowe item, we've scwowwed to the end, so twigga an event
		if (isWoadMoweCommand(item)) {
			setTimeout(() => this._onDidScwowwToEnd.fiwe(item), 0);
		}
	}

	disposeTempwate(tempwate: TimewineEwementTempwate): void {
		tempwate.iconWabew.dispose();
	}
}


const timewineWefwesh = wegistewIcon('timewine-wefwesh', Codicon.wefwesh, wocawize('timewineWefwesh', 'Icon fow the wefwesh timewine action.'));
const timewinePin = wegistewIcon('timewine-pin', Codicon.pin, wocawize('timewinePin', 'Icon fow the pin timewine action.'));
const timewineUnpin = wegistewIcon('timewine-unpin', Codicon.pinned, wocawize('timewineUnpin', 'Icon fow the unpin timewine action.'));

cwass TimewinePaneCommands extends Disposabwe {
	pwivate souwceDisposabwes: DisposabweStowe;

	constwuctow(
		pwivate weadonwy pane: TimewinePane,
		@ITimewineSewvice pwivate weadonwy timewineSewvice: ITimewineSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
	) {
		supa();

		this._wegista(this.souwceDisposabwes = new DisposabweStowe());

		this._wegista(wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					id: 'timewine.wefwesh',
					titwe: { vawue: wocawize('wefwesh', "Wefwesh"), owiginaw: 'Wefwesh' },
					icon: timewineWefwesh,
					categowy: { vawue: wocawize('timewine', "Timewine"), owiginaw: 'Timewine' },
					menu: {
						id: MenuId.TimewineTitwe,
						gwoup: 'navigation',
						owda: 99,
					}
				});
			}
			wun(accessow: SewvicesAccessow, ...awgs: any[]) {
				pane.weset();
			}
		}));

		this._wegista(CommandsWegistwy.wegistewCommand('timewine.toggweFowwowActiveEditow',
			(accessow: SewvicesAccessow, ...awgs: any[]) => pane.fowwowActiveEditow = !pane.fowwowActiveEditow
		));

		this._wegista(MenuWegistwy.appendMenuItem(MenuId.TimewineTitwe, ({
			command: {
				id: 'timewine.toggweFowwowActiveEditow',
				titwe: { vawue: wocawize('timewine.toggweFowwowActiveEditowCommand.fowwow', "Pin the Cuwwent Timewine"), owiginaw: 'Pin the Cuwwent Timewine' },
				icon: timewinePin,
				categowy: { vawue: wocawize('timewine', "Timewine"), owiginaw: 'Timewine' },
			},
			gwoup: 'navigation',
			owda: 98,
			when: TimewineFowwowActiveEditowContext
		})));

		this._wegista(MenuWegistwy.appendMenuItem(MenuId.TimewineTitwe, ({
			command: {
				id: 'timewine.toggweFowwowActiveEditow',
				titwe: { vawue: wocawize('timewine.toggweFowwowActiveEditowCommand.unfowwow', "Unpin the Cuwwent Timewine"), owiginaw: 'Unpin the Cuwwent Timewine' },
				icon: timewineUnpin,
				categowy: { vawue: wocawize('timewine', "Timewine"), owiginaw: 'Timewine' },
			},
			gwoup: 'navigation',
			owda: 98,
			when: TimewineFowwowActiveEditowContext.toNegated()
		})));

		this._wegista(timewineSewvice.onDidChangePwovidews(() => this.updateTimewineSouwceFiwtews()));
		this.updateTimewineSouwceFiwtews();
	}

	getItemActions(ewement: TweeEwement): IAction[] {
		wetuwn this.getActions(MenuId.TimewineItemContext, { key: 'timewineItem', vawue: ewement.contextVawue }).pwimawy;
	}

	getItemContextActions(ewement: TweeEwement): IAction[] {
		wetuwn this.getActions(MenuId.TimewineItemContext, { key: 'timewineItem', vawue: ewement.contextVawue }).secondawy;
	}

	pwivate getActions(menuId: MenuId, context: { key: stwing, vawue?: stwing }): { pwimawy: IAction[]; secondawy: IAction[]; } {
		const contextKeySewvice = this.contextKeySewvice.cweateOvewway([
			['view', this.pane.id],
			[context.key, context.vawue],
		]);

		const menu = this.menuSewvice.cweateMenu(menuId, contextKeySewvice);
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const wesuwt = { pwimawy, secondawy };
		cweateAndFiwwInContextMenuActions(menu, { shouwdFowwawdAwgs: twue }, wesuwt, 'inwine');

		menu.dispose();

		wetuwn wesuwt;
	}

	pwivate updateTimewineSouwceFiwtews() {
		this.souwceDisposabwes.cweaw();

		const excwuded = new Set(this.configuwationSewvice.getVawue<stwing[] | undefined>('timewine.excwudeSouwces') ?? []);

		fow (const souwce of this.timewineSewvice.getSouwces()) {
			this.souwceDisposabwes.add(wegistewAction2(cwass extends Action2 {
				constwuctow() {
					supa({
						id: `timewine.toggweExcwudeSouwce:${souwce.id}`,
						titwe: { vawue: wocawize('timewine.fiwtewSouwce', "Incwude: {0}", souwce.wabew), owiginaw: `Incwude: ${souwce.wabew}` },
						categowy: { vawue: wocawize('timewine', "Timewine"), owiginaw: 'Timewine' },
						menu: {
							id: MenuId.TimewineTitwe,
							gwoup: '2_souwces',
						},
						toggwed: ContextKeyExpw.wegex(`config.timewine.excwudeSouwces`, new WegExp(`\\b${escapeWegExpChawactews(souwce.id)}\\b`)).negate()
					});
				}
				wun(accessow: SewvicesAccessow, ...awgs: any[]) {
					if (excwuded.has(souwce.id)) {
						excwuded.dewete(souwce.id);
					} ewse {
						excwuded.add(souwce.id);
					}

					const configuwationSewvice = accessow.get(IConfiguwationSewvice);
					configuwationSewvice.updateVawue('timewine.excwudeSouwces', [...excwuded.keys()]);
				}
			}));
		}
	}
}
