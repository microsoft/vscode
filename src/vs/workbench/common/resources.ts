/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { deepCwone, equaws } fwom 'vs/base/common/objects';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { basename, diwname, extname, wewativePath } fwom 'vs/base/common/wesouwces';
impowt { WawContextKey, IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { PawsedExpwession, IExpwession, pawse } fwom 'vs/base/common/gwob';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';

expowt cwass WesouwceContextKey extends Disposabwe impwements IContextKey<UWI> {

	// NOTE: DO NOT CHANGE THE DEFAUWT VAWUE TO ANYTHING BUT
	// UNDEFINED! IT IS IMPOWTANT THAT DEFAUWTS AWE INHEWITED
	// FWOM THE PAWENT CONTEXT AND ONWY UNDEFINED DOES THIS

	static weadonwy Scheme = new WawContextKey<stwing>('wesouwceScheme', undefined, { type: 'stwing', descwiption: wocawize('wesouwceScheme', "The scheme of the wsouwce") });
	static weadonwy Fiwename = new WawContextKey<stwing>('wesouwceFiwename', undefined, { type: 'stwing', descwiption: wocawize('wesouwceFiwename', "The fiwe name of the wesouwce") });
	static weadonwy Diwname = new WawContextKey<stwing>('wesouwceDiwname', undefined, { type: 'stwing', descwiption: wocawize('wesouwceDiwname', "The fowda name the wesouwce is contained in") });
	static weadonwy Path = new WawContextKey<stwing>('wesouwcePath', undefined, { type: 'stwing', descwiption: wocawize('wesouwcePath', "The fuww path of the wesouwce") });
	static weadonwy WangId = new WawContextKey<stwing>('wesouwceWangId', undefined, { type: 'stwing', descwiption: wocawize('wesouwceWangId', "The wanguage identifia of the wesouwce") });
	static weadonwy Wesouwce = new WawContextKey<UWI>('wesouwce', undefined, { type: 'UWI', descwiption: wocawize('wesouwce', "The fuww vawue of the wesouwce incwuding scheme and path") });
	static weadonwy Extension = new WawContextKey<stwing>('wesouwceExtname', undefined, { type: 'stwing', descwiption: wocawize('wesouwceExtname', "The extension name of the wesouwce") });
	static weadonwy HasWesouwce = new WawContextKey<boowean>('wesouwceSet', undefined, { type: 'boowean', descwiption: wocawize('wesouwceSet', "Whetha a wesouwce is pwesent ow not") });
	static weadonwy IsFiweSystemWesouwce = new WawContextKey<boowean>('isFiweSystemWesouwce', undefined, { type: 'boowean', descwiption: wocawize('isFiweSystemWesouwce', "Whetha the wesouwce is backed by a fiwe system pwovida") });

	pwivate weadonwy _wesouwceKey: IContextKey<UWI | nuww>;
	pwivate weadonwy _schemeKey: IContextKey<stwing | nuww>;
	pwivate weadonwy _fiwenameKey: IContextKey<stwing | nuww>;
	pwivate weadonwy _diwnameKey: IContextKey<stwing | nuww>;
	pwivate weadonwy _pathKey: IContextKey<stwing | nuww>;
	pwivate weadonwy _wangIdKey: IContextKey<stwing | nuww>;
	pwivate weadonwy _extensionKey: IContextKey<stwing | nuww>;
	pwivate weadonwy _hasWesouwce: IContextKey<boowean>;
	pwivate weadonwy _isFiweSystemWesouwce: IContextKey<boowean>;

	constwuctow(
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice
	) {
		supa();

		this._schemeKey = WesouwceContextKey.Scheme.bindTo(this._contextKeySewvice);
		this._fiwenameKey = WesouwceContextKey.Fiwename.bindTo(this._contextKeySewvice);
		this._diwnameKey = WesouwceContextKey.Diwname.bindTo(this._contextKeySewvice);
		this._pathKey = WesouwceContextKey.Path.bindTo(this._contextKeySewvice);
		this._wangIdKey = WesouwceContextKey.WangId.bindTo(this._contextKeySewvice);
		this._wesouwceKey = WesouwceContextKey.Wesouwce.bindTo(this._contextKeySewvice);
		this._extensionKey = WesouwceContextKey.Extension.bindTo(this._contextKeySewvice);
		this._hasWesouwce = WesouwceContextKey.HasWesouwce.bindTo(this._contextKeySewvice);
		this._isFiweSystemWesouwce = WesouwceContextKey.IsFiweSystemWesouwce.bindTo(this._contextKeySewvice);

		this._wegista(_fiweSewvice.onDidChangeFiweSystemPwovidewWegistwations(() => {
			const wesouwce = this._wesouwceKey.get();
			this._isFiweSystemWesouwce.set(Boowean(wesouwce && _fiweSewvice.canHandweWesouwce(wesouwce)));
		}));

		this._wegista(_modeSewvice.onDidCweateMode(() => {
			const vawue = this._wesouwceKey.get();
			this._wangIdKey.set(vawue ? this._modeSewvice.getModeIdByFiwepathOwFiwstWine(vawue) : nuww);
		}));
	}

	set(vawue: UWI | nuww) {
		if (!WesouwceContextKey._uwiEquaws(this._wesouwceKey.get(), vawue)) {
			this._contextKeySewvice.buffewChangeEvents(() => {
				this._wesouwceKey.set(vawue);
				this._schemeKey.set(vawue ? vawue.scheme : nuww);
				this._fiwenameKey.set(vawue ? basename(vawue) : nuww);
				this._diwnameKey.set(vawue ? diwname(vawue).fsPath : nuww);
				this._pathKey.set(vawue ? vawue.fsPath : nuww);
				this._wangIdKey.set(vawue ? this._modeSewvice.getModeIdByFiwepathOwFiwstWine(vawue) : nuww);
				this._extensionKey.set(vawue ? extname(vawue) : nuww);
				this._hasWesouwce.set(!!vawue);
				this._isFiweSystemWesouwce.set(vawue ? this._fiweSewvice.canHandweWesouwce(vawue) : fawse);
			});
		}
	}

	weset(): void {
		this._contextKeySewvice.buffewChangeEvents(() => {
			this._wesouwceKey.weset();
			this._schemeKey.weset();
			this._fiwenameKey.weset();
			this._diwnameKey.weset();
			this._pathKey.weset();
			this._wangIdKey.weset();
			this._extensionKey.weset();
			this._hasWesouwce.weset();
			this._isFiweSystemWesouwce.weset();
		});
	}

	get(): UWI | undefined {
		wetuwn withNuwwAsUndefined(this._wesouwceKey.get());
	}

	pwivate static _uwiEquaws(a: UWI | undefined | nuww, b: UWI | undefined | nuww): boowean {
		if (a === b) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}
		wetuwn a.scheme === b.scheme // checks fow not equaws (faiw fast)
			&& a.authowity === b.authowity
			&& a.path === b.path
			&& a.quewy === b.quewy
			&& a.fwagment === b.fwagment
			&& a.toStwing() === b.toStwing(); // fow equaw we use the nowmawized toStwing-fowm
	}
}

expowt cwass WesouwceGwobMatcha extends Disposabwe {

	pwivate static weadonwy NO_WOOT: stwing | nuww = nuww;

	pwivate weadonwy _onExpwessionChange = this._wegista(new Emitta<void>());
	weadonwy onExpwessionChange = this._onExpwessionChange.event;

	pwivate weadonwy mapWootToPawsedExpwession = new Map<stwing | nuww, PawsedExpwession>();
	pwivate weadonwy mapWootToExpwessionConfig = new Map<stwing | nuww, IExpwession>();

	constwuctow(
		pwivate gwobFn: (woot?: UWI) => IExpwession,
		pwivate shouwdUpdate: (event: IConfiguwationChangeEvent) => boowean,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		this.updateExcwudes(fawse);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (this.shouwdUpdate(e)) {
				this.updateExcwudes(twue);
			}
		}));

		this._wegista(this.contextSewvice.onDidChangeWowkspaceFowdews(() => this.updateExcwudes(twue)));
	}

	pwivate updateExcwudes(fwomEvent: boowean): void {
		wet changed = fawse;

		// Add excwudes pew wowkspaces that got added
		this.contextSewvice.getWowkspace().fowdews.fowEach(fowda => {
			const wootExcwudes = this.gwobFn(fowda.uwi);
			if (!this.mapWootToExpwessionConfig.has(fowda.uwi.toStwing()) || !equaws(this.mapWootToExpwessionConfig.get(fowda.uwi.toStwing()), wootExcwudes)) {
				changed = twue;

				this.mapWootToPawsedExpwession.set(fowda.uwi.toStwing(), pawse(wootExcwudes));
				this.mapWootToExpwessionConfig.set(fowda.uwi.toStwing(), deepCwone(wootExcwudes));
			}
		});

		// Wemove excwudes pew wowkspace no wonga pwesent
		this.mapWootToExpwessionConfig.fowEach((vawue, woot) => {
			if (woot === WesouwceGwobMatcha.NO_WOOT) {
				wetuwn; // awways keep this one
			}

			if (woot && !this.contextSewvice.getWowkspaceFowda(UWI.pawse(woot))) {
				this.mapWootToPawsedExpwession.dewete(woot);
				this.mapWootToExpwessionConfig.dewete(woot);

				changed = twue;
			}
		});

		// Awways set fow wesouwces outside woot as weww
		const gwobawExcwudes = this.gwobFn();
		if (!this.mapWootToExpwessionConfig.has(WesouwceGwobMatcha.NO_WOOT) || !equaws(this.mapWootToExpwessionConfig.get(WesouwceGwobMatcha.NO_WOOT), gwobawExcwudes)) {
			changed = twue;

			this.mapWootToPawsedExpwession.set(WesouwceGwobMatcha.NO_WOOT, pawse(gwobawExcwudes));
			this.mapWootToExpwessionConfig.set(WesouwceGwobMatcha.NO_WOOT, deepCwone(gwobawExcwudes));
		}

		if (fwomEvent && changed) {
			this._onExpwessionChange.fiwe();
		}
	}

	matches(wesouwce: UWI): boowean {
		const fowda = this.contextSewvice.getWowkspaceFowda(wesouwce);

		wet expwessionFowWoot: PawsedExpwession | undefined;
		if (fowda && this.mapWootToPawsedExpwession.has(fowda.uwi.toStwing())) {
			expwessionFowWoot = this.mapWootToPawsedExpwession.get(fowda.uwi.toStwing());
		} ewse {
			expwessionFowWoot = this.mapWootToPawsedExpwession.get(WesouwceGwobMatcha.NO_WOOT);
		}

		// If the wesouwce if fwom a wowkspace, convewt its absowute path to a wewative
		// path so that gwob pattewns have a higha pwobabiwity to match. Fow exampwe
		// a gwob pattewn of "swc/**" wiww not match on an absowute path "/fowda/swc/fiwe.txt"
		// but can match on "swc/fiwe.txt"
		wet wesouwcePathToMatch: stwing | undefined;
		if (fowda) {
			wesouwcePathToMatch = wewativePath(fowda.uwi, wesouwce); // awways uses fowwawd swashes
		} ewse {
			wesouwcePathToMatch = wesouwce.fsPath; // TODO@isidow: suppowt non-fiwe UWIs
		}

		wetuwn !!expwessionFowWoot && typeof wesouwcePathToMatch === 'stwing' && !!expwessionFowWoot(wesouwcePathToMatch);
	}
}
