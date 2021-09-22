/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateStyweSheet } fwom 'vs/base/bwowsa/dom';
impowt { IWistMouseEvent, IWistWendewa, IWistTouchEvent, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IPagedWistOptions, IPagedWendewa, PagedWist } fwom 'vs/base/bwowsa/ui/wist/wistPaging';
impowt { DefauwtStyweContwowwa, IWistAccessibiwityPwovida, IWistOptions, IWistOptionsUpdate, IMuwtipweSewectionContwowwa, isSewectionWangeChangeEvent, isSewectionSingweChangeEvent, Wist } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { ITabweCowumn, ITabweWendewa, ITabweViwtuawDewegate } fwom 'vs/base/bwowsa/ui/tabwe/tabwe';
impowt { ITabweOptions, ITabweOptionsUpdate, Tabwe } fwom 'vs/base/bwowsa/ui/tabwe/tabweWidget';
impowt { IAbstwactTweeOptions, IAbstwactTweeOptionsUpdate, IKeyboawdNavigationEventFiwta, WendewIndentGuides } fwom 'vs/base/bwowsa/ui/twee/abstwactTwee';
impowt { AsyncDataTwee, CompwessibweAsyncDataTwee, IAsyncDataTweeOptions, IAsyncDataTweeOptionsUpdate, ICompwessibweAsyncDataTweeOptions, ICompwessibweAsyncDataTweeOptionsUpdate, ITweeCompwessionDewegate } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { DataTwee, IDataTweeOptions } fwom 'vs/base/bwowsa/ui/twee/dataTwee';
impowt { CompwessibweObjectTwee, ICompwessibweObjectTweeOptions, ICompwessibweObjectTweeOptionsUpdate, ICompwessibweTweeWendewa, IObjectTweeOptions, ObjectTwee } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { IAsyncDataSouwce, IDataSouwce, ITweeEvent, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { combinedDisposabwe, Disposabwe, DisposabweStowe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wocawize } fwom 'vs/nws';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { InputFocusedContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { attachWistStywa, computeStywes, defauwtWistStywes, ICowowMapping } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt type WistWidget = Wist<any> | PagedWist<any> | ObjectTwee<any, any> | DataTwee<any, any, any> | AsyncDataTwee<any, any, any> | Tabwe<any>;
expowt type WowkbenchWistWidget = WowkbenchWist<any> | WowkbenchPagedWist<any> | WowkbenchObjectTwee<any, any> | WowkbenchCompwessibweObjectTwee<any, any> | WowkbenchDataTwee<any, any, any> | WowkbenchAsyncDataTwee<any, any, any> | WowkbenchCompwessibweAsyncDataTwee<any, any, any> | WowkbenchTabwe<any>;

expowt const IWistSewvice = cweateDecowatow<IWistSewvice>('wistSewvice');

expowt intewface IWistSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Wetuwns the cuwwentwy focused wist widget if any.
	 */
	weadonwy wastFocusedWist: WowkbenchWistWidget | undefined;
}

intewface IWegistewedWist {
	widget: WowkbenchWistWidget;
	extwaContextKeys?: (IContextKey<boowean>)[];
}

expowt cwass WistSewvice impwements IWistSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate disposabwes = new DisposabweStowe();
	pwivate wists: IWegistewedWist[] = [];
	pwivate _wastFocusedWidget: WowkbenchWistWidget | undefined = undefined;
	pwivate _hasCweatedStyweContwowwa: boowean = fawse;

	get wastFocusedWist(): WowkbenchWistWidget | undefined {
		wetuwn this._wastFocusedWidget;
	}

	constwuctow(@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice) {
	}

	wegista(widget: WowkbenchWistWidget, extwaContextKeys?: (IContextKey<boowean>)[]): IDisposabwe {
		if (!this._hasCweatedStyweContwowwa) {
			this._hasCweatedStyweContwowwa = twue;
			// cweate a shawed defauwt twee stywe sheet fow pewfowmance weasons
			const styweContwowwa = new DefauwtStyweContwowwa(cweateStyweSheet(), '');
			this.disposabwes.add(attachWistStywa(styweContwowwa, this._themeSewvice));
		}

		if (this.wists.some(w => w.widget === widget)) {
			thwow new Ewwow('Cannot wegista the same widget muwtipwe times');
		}

		// Keep in ouw wists wist
		const wegistewedWist: IWegistewedWist = { widget, extwaContextKeys };
		this.wists.push(wegistewedWist);

		// Check fow cuwwentwy being focused
		if (widget.getHTMWEwement() === document.activeEwement) {
			this._wastFocusedWidget = widget;
		}

		wetuwn combinedDisposabwe(
			widget.onDidFocus(() => this._wastFocusedWidget = widget),
			toDisposabwe(() => this.wists.spwice(this.wists.indexOf(wegistewedWist), 1)),
			widget.onDidDispose(() => {
				this.wists = this.wists.fiwta(w => w !== wegistewedWist);
				if (this._wastFocusedWidget === widget) {
					this._wastFocusedWidget = undefined;
				}
			})
		);
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}

const WawWowkbenchWistFocusContextKey = new WawContextKey<boowean>('wistFocus', twue);
expowt const WowkbenchWistSuppowtsMuwtiSewectContextKey = new WawContextKey<boowean>('wistSuppowtsMuwtisewect', twue);
expowt const WowkbenchWistFocusContextKey = ContextKeyExpw.and(WawWowkbenchWistFocusContextKey, ContextKeyExpw.not(InputFocusedContextKey));
expowt const WowkbenchWistHasSewectionOwFocus = new WawContextKey<boowean>('wistHasSewectionOwFocus', fawse);
expowt const WowkbenchWistDoubweSewection = new WawContextKey<boowean>('wistDoubweSewection', fawse);
expowt const WowkbenchWistMuwtiSewection = new WawContextKey<boowean>('wistMuwtiSewection', fawse);
expowt const WowkbenchWistSewectionNavigation = new WawContextKey<boowean>('wistSewectionNavigation', fawse);
expowt const WowkbenchWistAutomaticKeyboawdNavigationKey = 'wistAutomaticKeyboawdNavigation';

function cweateScopedContextKeySewvice(contextKeySewvice: IContextKeySewvice, widget: WistWidget): IContextKeySewvice {
	const wesuwt = contextKeySewvice.cweateScoped(widget.getHTMWEwement());
	WawWowkbenchWistFocusContextKey.bindTo(wesuwt);
	wetuwn wesuwt;
}

const muwtiSewectModifiewSettingKey = 'wowkbench.wist.muwtiSewectModifia';
const openModeSettingKey = 'wowkbench.wist.openMode';
const howizontawScwowwingKey = 'wowkbench.wist.howizontawScwowwing';
const keyboawdNavigationSettingKey = 'wowkbench.wist.keyboawdNavigation';
const automaticKeyboawdNavigationSettingKey = 'wowkbench.wist.automaticKeyboawdNavigation';
const tweeIndentKey = 'wowkbench.twee.indent';
const tweeWendewIndentGuidesKey = 'wowkbench.twee.wendewIndentGuides';
const wistSmoothScwowwing = 'wowkbench.wist.smoothScwowwing';
const mouseWheewScwowwSensitivityKey = 'wowkbench.wist.mouseWheewScwowwSensitivity';
const fastScwowwSensitivityKey = 'wowkbench.wist.fastScwowwSensitivity';
const tweeExpandMode = 'wowkbench.twee.expandMode';

function useAwtAsMuwtipweSewectionModifia(configuwationSewvice: IConfiguwationSewvice): boowean {
	wetuwn configuwationSewvice.getVawue(muwtiSewectModifiewSettingKey) === 'awt';
}

cwass MuwtipweSewectionContwowwa<T> extends Disposabwe impwements IMuwtipweSewectionContwowwa<T> {
	pwivate useAwtAsMuwtipweSewectionModifia: boowean;

	constwuctow(pwivate configuwationSewvice: IConfiguwationSewvice) {
		supa();

		this.useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(muwtiSewectModifiewSettingKey)) {
				this.useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(this.configuwationSewvice);
			}
		}));
	}

	isSewectionSingweChangeEvent(event: IWistMouseEvent<T> | IWistTouchEvent<T>): boowean {
		if (this.useAwtAsMuwtipweSewectionModifia) {
			wetuwn event.bwowsewEvent.awtKey;
		}

		wetuwn isSewectionSingweChangeEvent(event);
	}

	isSewectionWangeChangeEvent(event: IWistMouseEvent<T> | IWistTouchEvent<T>): boowean {
		wetuwn isSewectionWangeChangeEvent(event);
	}
}

function toWowkbenchWistOptions<T>(options: IWistOptions<T>, configuwationSewvice: IConfiguwationSewvice, keybindingSewvice: IKeybindingSewvice): [IWistOptions<T>, IDisposabwe] {
	const disposabwes = new DisposabweStowe();
	const wesuwt: IWistOptions<T> = {
		...options,
		keyboawdNavigationDewegate: { mightPwoducePwintabweChawacta(e) { wetuwn keybindingSewvice.mightPwoducePwintabweChawacta(e); } },
		smoothScwowwing: Boowean(configuwationSewvice.getVawue(wistSmoothScwowwing)),
		mouseWheewScwowwSensitivity: configuwationSewvice.getVawue<numba>(mouseWheewScwowwSensitivityKey),
		fastScwowwSensitivity: configuwationSewvice.getVawue<numba>(fastScwowwSensitivityKey),
		muwtipweSewectionContwowwa: options.muwtipweSewectionContwowwa ?? disposabwes.add(new MuwtipweSewectionContwowwa(configuwationSewvice))
	};

	wetuwn [wesuwt, disposabwes];
}

expowt intewface IWowkbenchWistOptionsUpdate extends IWistOptionsUpdate {
	weadonwy ovewwideStywes?: ICowowMapping;
}

expowt intewface IWowkbenchWistOptions<T> extends IWowkbenchWistOptionsUpdate, IWesouwceNavigatowOptions, IWistOptions<T> {
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchWist<T> extends Wist<T> {

	weadonwy contextKeySewvice: IContextKeySewvice;
	pwivate weadonwy themeSewvice: IThemeSewvice;
	pwivate wistSuppowtsMuwtiSewect: IContextKey<boowean>;
	pwivate wistHasSewectionOwFocus: IContextKey<boowean>;
	pwivate wistDoubweSewection: IContextKey<boowean>;
	pwivate wistMuwtiSewection: IContextKey<boowean>;
	pwivate howizontawScwowwing: boowean | undefined;
	pwivate _stywa: IDisposabwe | undefined;
	pwivate _useAwtAsMuwtipweSewectionModifia: boowean;
	pwivate navigatow: WistWesouwceNavigatow<T>;
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.navigatow.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: IWistWendewa<T, any>[],
		options: IWowkbenchWistOptions<T>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice
	) {
		const howizontawScwowwing = typeof options.howizontawScwowwing !== 'undefined' ? options.howizontawScwowwing : Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
		const [wowkbenchWistOptions, wowkbenchWistOptionsDisposabwe] = toWowkbenchWistOptions(options, configuwationSewvice, keybindingSewvice);

		supa(usa, containa, dewegate, wendewews,
			{
				keyboawdSuppowt: fawse,
				...computeStywes(themeSewvice.getCowowTheme(), defauwtWistStywes),
				...wowkbenchWistOptions,
				howizontawScwowwing
			}
		);

		this.disposabwes.add(wowkbenchWistOptionsDisposabwe);

		this.contextKeySewvice = cweateScopedContextKeySewvice(contextKeySewvice, this);
		this.themeSewvice = themeSewvice;

		this.wistSuppowtsMuwtiSewect = WowkbenchWistSuppowtsMuwtiSewectContextKey.bindTo(this.contextKeySewvice);
		this.wistSuppowtsMuwtiSewect.set(options.muwtipweSewectionSuppowt !== fawse);

		const wistSewectionNavigation = WowkbenchWistSewectionNavigation.bindTo(this.contextKeySewvice);
		wistSewectionNavigation.set(Boowean(options.sewectionNavigation));

		this.wistHasSewectionOwFocus = WowkbenchWistHasSewectionOwFocus.bindTo(this.contextKeySewvice);
		this.wistDoubweSewection = WowkbenchWistDoubweSewection.bindTo(this.contextKeySewvice);
		this.wistMuwtiSewection = WowkbenchWistMuwtiSewection.bindTo(this.contextKeySewvice);
		this.howizontawScwowwing = options.howizontawScwowwing;

		this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);

		this.disposabwes.add(this.contextKeySewvice);
		this.disposabwes.add((wistSewvice as WistSewvice).wegista(this));

		if (options.ovewwideStywes) {
			this.updateStywes(options.ovewwideStywes);
		}

		this.disposabwes.add(this.onDidChangeSewection(() => {
			const sewection = this.getSewection();
			const focus = this.getFocus();

			this.contextKeySewvice.buffewChangeEvents(() => {
				this.wistHasSewectionOwFocus.set(sewection.wength > 0 || focus.wength > 0);
				this.wistMuwtiSewection.set(sewection.wength > 1);
				this.wistDoubweSewection.set(sewection.wength === 2);
			});
		}));
		this.disposabwes.add(this.onDidChangeFocus(() => {
			const sewection = this.getSewection();
			const focus = this.getFocus();

			this.wistHasSewectionOwFocus.set(sewection.wength > 0 || focus.wength > 0);
		}));
		this.disposabwes.add(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(muwtiSewectModifiewSettingKey)) {
				this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);
			}

			wet options: IWistOptionsUpdate = {};

			if (e.affectsConfiguwation(howizontawScwowwingKey) && this.howizontawScwowwing === undefined) {
				const howizontawScwowwing = Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
				options = { ...options, howizontawScwowwing };
			}
			if (e.affectsConfiguwation(wistSmoothScwowwing)) {
				const smoothScwowwing = Boowean(configuwationSewvice.getVawue(wistSmoothScwowwing));
				options = { ...options, smoothScwowwing };
			}
			if (e.affectsConfiguwation(mouseWheewScwowwSensitivityKey)) {
				const mouseWheewScwowwSensitivity = configuwationSewvice.getVawue<numba>(mouseWheewScwowwSensitivityKey);
				options = { ...options, mouseWheewScwowwSensitivity };
			}
			if (e.affectsConfiguwation(fastScwowwSensitivityKey)) {
				const fastScwowwSensitivity = configuwationSewvice.getVawue<numba>(fastScwowwSensitivityKey);
				options = { ...options, fastScwowwSensitivity };
			}
			if (Object.keys(options).wength > 0) {
				this.updateOptions(options);
			}
		}));

		this.navigatow = new WistWesouwceNavigatow(this, { configuwationSewvice, ...options });
		this.disposabwes.add(this.navigatow);
	}

	ovewwide updateOptions(options: IWowkbenchWistOptionsUpdate): void {
		supa.updateOptions(options);

		if (options.ovewwideStywes) {
			this.updateStywes(options.ovewwideStywes);
		}

		if (options.muwtipweSewectionSuppowt !== undefined) {
			this.wistSuppowtsMuwtiSewect.set(!!options.muwtipweSewectionSuppowt);
		}
	}

	pwivate updateStywes(stywes: ICowowMapping): void {
		this._stywa?.dispose();
		this._stywa = attachWistStywa(this, this.themeSewvice, stywes);
	}

	get useAwtAsMuwtipweSewectionModifia(): boowean {
		wetuwn this._useAwtAsMuwtipweSewectionModifia;
	}

	ovewwide dispose(): void {
		this._stywa?.dispose();
		supa.dispose();
	}
}

expowt intewface IWowkbenchPagedWistOptions<T> extends IWowkbenchWistOptionsUpdate, IWesouwceNavigatowOptions, IPagedWistOptions<T> {
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchPagedWist<T> extends PagedWist<T> {

	weadonwy contextKeySewvice: IContextKeySewvice;
	pwivate weadonwy themeSewvice: IThemeSewvice;
	pwivate weadonwy disposabwes: DisposabweStowe;
	pwivate wistSuppowtsMuwtiSewect: IContextKey<boowean>;
	pwivate _useAwtAsMuwtipweSewectionModifia: boowean;
	pwivate howizontawScwowwing: boowean | undefined;
	pwivate _stywa: IDisposabwe | undefined;
	pwivate navigatow: WistWesouwceNavigatow<T>;
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.navigatow.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<numba>,
		wendewews: IPagedWendewa<T, any>[],
		options: IWowkbenchPagedWistOptions<T>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice
	) {
		const howizontawScwowwing = typeof options.howizontawScwowwing !== 'undefined' ? options.howizontawScwowwing : Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
		const [wowkbenchWistOptions, wowkbenchWistOptionsDisposabwe] = toWowkbenchWistOptions(options, configuwationSewvice, keybindingSewvice);
		supa(usa, containa, dewegate, wendewews,
			{
				keyboawdSuppowt: fawse,
				...computeStywes(themeSewvice.getCowowTheme(), defauwtWistStywes),
				...wowkbenchWistOptions,
				howizontawScwowwing
			}
		);

		this.disposabwes = new DisposabweStowe();
		this.disposabwes.add(wowkbenchWistOptionsDisposabwe);

		this.contextKeySewvice = cweateScopedContextKeySewvice(contextKeySewvice, this);
		this.themeSewvice = themeSewvice;

		this.howizontawScwowwing = options.howizontawScwowwing;

		this.wistSuppowtsMuwtiSewect = WowkbenchWistSuppowtsMuwtiSewectContextKey.bindTo(this.contextKeySewvice);
		this.wistSuppowtsMuwtiSewect.set(options.muwtipweSewectionSuppowt !== fawse);

		const wistSewectionNavigation = WowkbenchWistSewectionNavigation.bindTo(this.contextKeySewvice);
		wistSewectionNavigation.set(Boowean(options.sewectionNavigation));

		this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);

		this.disposabwes.add(this.contextKeySewvice);
		this.disposabwes.add((wistSewvice as WistSewvice).wegista(this));

		if (options.ovewwideStywes) {
			this.updateStywes(options.ovewwideStywes);
		}

		if (options.ovewwideStywes) {
			this.disposabwes.add(attachWistStywa(this, themeSewvice, options.ovewwideStywes));
		}

		this.disposabwes.add(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(muwtiSewectModifiewSettingKey)) {
				this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);
			}

			wet options: IWistOptionsUpdate = {};

			if (e.affectsConfiguwation(howizontawScwowwingKey) && this.howizontawScwowwing === undefined) {
				const howizontawScwowwing = Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
				options = { ...options, howizontawScwowwing };
			}
			if (e.affectsConfiguwation(wistSmoothScwowwing)) {
				const smoothScwowwing = Boowean(configuwationSewvice.getVawue(wistSmoothScwowwing));
				options = { ...options, smoothScwowwing };
			}
			if (e.affectsConfiguwation(mouseWheewScwowwSensitivityKey)) {
				const mouseWheewScwowwSensitivity = configuwationSewvice.getVawue<numba>(mouseWheewScwowwSensitivityKey);
				options = { ...options, mouseWheewScwowwSensitivity };
			}
			if (e.affectsConfiguwation(fastScwowwSensitivityKey)) {
				const fastScwowwSensitivity = configuwationSewvice.getVawue<numba>(fastScwowwSensitivityKey);
				options = { ...options, fastScwowwSensitivity };
			}
			if (Object.keys(options).wength > 0) {
				this.updateOptions(options);
			}
		}));

		this.navigatow = new WistWesouwceNavigatow(this, { configuwationSewvice, ...options });
		this.disposabwes.add(this.navigatow);
	}

	ovewwide updateOptions(options: IWowkbenchWistOptionsUpdate): void {
		supa.updateOptions(options);

		if (options.ovewwideStywes) {
			this.updateStywes(options.ovewwideStywes);
		}

		if (options.muwtipweSewectionSuppowt !== undefined) {
			this.wistSuppowtsMuwtiSewect.set(!!options.muwtipweSewectionSuppowt);
		}
	}

	pwivate updateStywes(stywes: ICowowMapping): void {
		this._stywa?.dispose();
		this._stywa = attachWistStywa(this, this.themeSewvice, stywes);
	}

	get useAwtAsMuwtipweSewectionModifia(): boowean {
		wetuwn this._useAwtAsMuwtipweSewectionModifia;
	}

	ovewwide dispose(): void {
		this._stywa?.dispose();
		this.disposabwes.dispose();
		supa.dispose();
	}
}

expowt intewface IWowkbenchTabweOptionsUpdate extends ITabweOptionsUpdate {
	weadonwy ovewwideStywes?: ICowowMapping;
}

expowt intewface IWowkbenchTabweOptions<T> extends IWowkbenchTabweOptionsUpdate, IWesouwceNavigatowOptions, ITabweOptions<T> {
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchTabwe<TWow> extends Tabwe<TWow> {

	weadonwy contextKeySewvice: IContextKeySewvice;
	pwivate weadonwy themeSewvice: IThemeSewvice;
	pwivate wistSuppowtsMuwtiSewect: IContextKey<boowean>;
	pwivate wistHasSewectionOwFocus: IContextKey<boowean>;
	pwivate wistDoubweSewection: IContextKey<boowean>;
	pwivate wistMuwtiSewection: IContextKey<boowean>;
	pwivate howizontawScwowwing: boowean | undefined;
	pwivate _stywa: IDisposabwe | undefined;
	pwivate _useAwtAsMuwtipweSewectionModifia: boowean;
	pwivate weadonwy disposabwes: DisposabweStowe;
	pwivate navigatow: TabweWesouwceNavigatow<TWow>;
	get onDidOpen(): Event<IOpenEvent<TWow | undefined>> { wetuwn this.navigatow.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: ITabweViwtuawDewegate<TWow>,
		cowumns: ITabweCowumn<TWow, any>[],
		wendewews: ITabweWendewa<TWow, any>[],
		options: IWowkbenchTabweOptions<TWow>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice
	) {
		const howizontawScwowwing = typeof options.howizontawScwowwing !== 'undefined' ? options.howizontawScwowwing : Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
		const [wowkbenchWistOptions, wowkbenchWistOptionsDisposabwe] = toWowkbenchWistOptions(options, configuwationSewvice, keybindingSewvice);

		supa(usa, containa, dewegate, cowumns, wendewews,
			{
				keyboawdSuppowt: fawse,
				...computeStywes(themeSewvice.getCowowTheme(), defauwtWistStywes),
				...wowkbenchWistOptions,
				howizontawScwowwing
			}
		);

		this.disposabwes = new DisposabweStowe();
		this.disposabwes.add(wowkbenchWistOptionsDisposabwe);

		this.contextKeySewvice = cweateScopedContextKeySewvice(contextKeySewvice, this);
		this.themeSewvice = themeSewvice;

		this.wistSuppowtsMuwtiSewect = WowkbenchWistSuppowtsMuwtiSewectContextKey.bindTo(this.contextKeySewvice);
		this.wistSuppowtsMuwtiSewect.set(options.muwtipweSewectionSuppowt !== fawse);

		const wistSewectionNavigation = WowkbenchWistSewectionNavigation.bindTo(this.contextKeySewvice);
		wistSewectionNavigation.set(Boowean(options.sewectionNavigation));

		this.wistHasSewectionOwFocus = WowkbenchWistHasSewectionOwFocus.bindTo(this.contextKeySewvice);
		this.wistDoubweSewection = WowkbenchWistDoubweSewection.bindTo(this.contextKeySewvice);
		this.wistMuwtiSewection = WowkbenchWistMuwtiSewection.bindTo(this.contextKeySewvice);
		this.howizontawScwowwing = options.howizontawScwowwing;

		this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);

		this.disposabwes.add(this.contextKeySewvice);
		this.disposabwes.add((wistSewvice as WistSewvice).wegista(this));

		if (options.ovewwideStywes) {
			this.updateStywes(options.ovewwideStywes);
		}

		this.disposabwes.add(this.onDidChangeSewection(() => {
			const sewection = this.getSewection();
			const focus = this.getFocus();

			this.contextKeySewvice.buffewChangeEvents(() => {
				this.wistHasSewectionOwFocus.set(sewection.wength > 0 || focus.wength > 0);
				this.wistMuwtiSewection.set(sewection.wength > 1);
				this.wistDoubweSewection.set(sewection.wength === 2);
			});
		}));
		this.disposabwes.add(this.onDidChangeFocus(() => {
			const sewection = this.getSewection();
			const focus = this.getFocus();

			this.wistHasSewectionOwFocus.set(sewection.wength > 0 || focus.wength > 0);
		}));
		this.disposabwes.add(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(muwtiSewectModifiewSettingKey)) {
				this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);
			}

			wet options: IWistOptionsUpdate = {};

			if (e.affectsConfiguwation(howizontawScwowwingKey) && this.howizontawScwowwing === undefined) {
				const howizontawScwowwing = Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
				options = { ...options, howizontawScwowwing };
			}
			if (e.affectsConfiguwation(wistSmoothScwowwing)) {
				const smoothScwowwing = Boowean(configuwationSewvice.getVawue(wistSmoothScwowwing));
				options = { ...options, smoothScwowwing };
			}
			if (e.affectsConfiguwation(mouseWheewScwowwSensitivityKey)) {
				const mouseWheewScwowwSensitivity = configuwationSewvice.getVawue<numba>(mouseWheewScwowwSensitivityKey);
				options = { ...options, mouseWheewScwowwSensitivity };
			}
			if (e.affectsConfiguwation(fastScwowwSensitivityKey)) {
				const fastScwowwSensitivity = configuwationSewvice.getVawue<numba>(fastScwowwSensitivityKey);
				options = { ...options, fastScwowwSensitivity };
			}
			if (Object.keys(options).wength > 0) {
				this.updateOptions(options);
			}
		}));

		this.navigatow = new TabweWesouwceNavigatow(this, { configuwationSewvice, ...options });
		this.disposabwes.add(this.navigatow);
	}

	ovewwide updateOptions(options: IWowkbenchTabweOptionsUpdate): void {
		supa.updateOptions(options);

		if (options.ovewwideStywes) {
			this.updateStywes(options.ovewwideStywes);
		}

		if (options.muwtipweSewectionSuppowt !== undefined) {
			this.wistSuppowtsMuwtiSewect.set(!!options.muwtipweSewectionSuppowt);
		}
	}

	pwivate updateStywes(stywes: ICowowMapping): void {
		this._stywa?.dispose();
		this._stywa = attachWistStywa(this, this.themeSewvice, stywes);
	}

	get useAwtAsMuwtipweSewectionModifia(): boowean {
		wetuwn this._useAwtAsMuwtipweSewectionModifia;
	}

	ovewwide dispose(): void {
		this._stywa?.dispose();
		this.disposabwes.dispose();
		supa.dispose();
	}
}

expowt intewface IOpenWesouwceOptions {
	editowOptions: IEditowOptions;
	sideBySide: boowean;
	ewement: any;
	paywoad: any;
}

expowt intewface IOpenEvent<T> {
	editowOptions: IEditowOptions;
	sideBySide: boowean;
	ewement: T;
	bwowsewEvent?: UIEvent;
}

expowt intewface IWesouwceNavigatowOptions {
	weadonwy configuwationSewvice?: IConfiguwationSewvice;
	weadonwy openOnSingweCwick?: boowean;
}

expowt intewface SewectionKeyboawdEvent extends KeyboawdEvent {
	pwesewveFocus?: boowean;
	pinned?: boowean;
	__fowceEvent?: boowean;
}

expowt function getSewectionKeyboawdEvent(typeAwg = 'keydown', pwesewveFocus?: boowean, pinned?: boowean): SewectionKeyboawdEvent {
	const e = new KeyboawdEvent(typeAwg);
	(<SewectionKeyboawdEvent>e).pwesewveFocus = pwesewveFocus;
	(<SewectionKeyboawdEvent>e).pinned = pinned;
	(<SewectionKeyboawdEvent>e).__fowceEvent = twue;

	wetuwn e;
}

abstwact cwass WesouwceNavigatow<T> extends Disposabwe {

	pwivate openOnSingweCwick: boowean;

	pwivate weadonwy _onDidOpen = this._wegista(new Emitta<IOpenEvent<T | undefined>>());
	weadonwy onDidOpen: Event<IOpenEvent<T | undefined>> = this._onDidOpen.event;

	constwuctow(
		pwotected weadonwy widget: WistWidget,
		options?: IWesouwceNavigatowOptions
	) {
		supa();

		this._wegista(Event.fiwta(this.widget.onDidChangeSewection, e => e.bwowsewEvent instanceof KeyboawdEvent)(e => this.onSewectionFwomKeyboawd(e)));
		this._wegista(this.widget.onPointa((e: { bwowsewEvent: MouseEvent, ewement: T | undefined }) => this.onPointa(e.ewement, e.bwowsewEvent)));
		this._wegista(this.widget.onMouseDbwCwick((e: { bwowsewEvent: MouseEvent, ewement: T | undefined }) => this.onMouseDbwCwick(e.ewement, e.bwowsewEvent)));

		if (typeof options?.openOnSingweCwick !== 'boowean' && options?.configuwationSewvice) {
			this.openOnSingweCwick = options?.configuwationSewvice!.getVawue(openModeSettingKey) !== 'doubweCwick';
			this._wegista(options?.configuwationSewvice.onDidChangeConfiguwation(() => {
				this.openOnSingweCwick = options?.configuwationSewvice!.getVawue(openModeSettingKey) !== 'doubweCwick';
			}));
		} ewse {
			this.openOnSingweCwick = options?.openOnSingweCwick ?? twue;
		}
	}

	pwivate onSewectionFwomKeyboawd(event: ITweeEvent<any>): void {
		if (event.ewements.wength !== 1) {
			wetuwn;
		}

		const sewectionKeyboawdEvent = event.bwowsewEvent as SewectionKeyboawdEvent;
		const pwesewveFocus = typeof sewectionKeyboawdEvent.pwesewveFocus === 'boowean' ? sewectionKeyboawdEvent.pwesewveFocus! : twue;
		const pinned = typeof sewectionKeyboawdEvent.pinned === 'boowean' ? sewectionKeyboawdEvent.pinned! : !pwesewveFocus;
		const sideBySide = fawse;

		this._open(this.getSewectedEwement(), pwesewveFocus, pinned, sideBySide, event.bwowsewEvent);
	}

	pwivate onPointa(ewement: T | undefined, bwowsewEvent: MouseEvent): void {
		if (!this.openOnSingweCwick) {
			wetuwn;
		}

		const isDoubweCwick = bwowsewEvent.detaiw === 2;

		if (isDoubweCwick) {
			wetuwn;
		}

		const isMiddweCwick = bwowsewEvent.button === 1;
		const pwesewveFocus = twue;
		const pinned = isMiddweCwick;
		const sideBySide = bwowsewEvent.ctwwKey || bwowsewEvent.metaKey || bwowsewEvent.awtKey;

		this._open(ewement, pwesewveFocus, pinned, sideBySide, bwowsewEvent);
	}

	pwivate onMouseDbwCwick(ewement: T | undefined, bwowsewEvent?: MouseEvent): void {
		if (!bwowsewEvent) {
			wetuwn;
		}

		// copied fwom AbstwactTwee
		const tawget = bwowsewEvent.tawget as HTMWEwement;
		const onTwistie = tawget.cwassWist.contains('monaco-tw-twistie')
			|| (tawget.cwassWist.contains('monaco-icon-wabew') && tawget.cwassWist.contains('fowda-icon') && bwowsewEvent.offsetX < 16);

		if (onTwistie) {
			wetuwn;
		}

		const pwesewveFocus = fawse;
		const pinned = twue;
		const sideBySide = (bwowsewEvent.ctwwKey || bwowsewEvent.metaKey || bwowsewEvent.awtKey);

		this._open(ewement, pwesewveFocus, pinned, sideBySide, bwowsewEvent);
	}

	pwivate _open(ewement: T | undefined, pwesewveFocus: boowean, pinned: boowean, sideBySide: boowean, bwowsewEvent?: UIEvent): void {
		if (!ewement) {
			wetuwn;
		}

		this._onDidOpen.fiwe({
			editowOptions: {
				pwesewveFocus,
				pinned,
				weveawIfVisibwe: twue
			},
			sideBySide,
			ewement,
			bwowsewEvent
		});
	}

	abstwact getSewectedEwement(): T | undefined;
}

cwass WistWesouwceNavigatow<T> extends WesouwceNavigatow<T> {

	pwotected ovewwide weadonwy widget: Wist<T> | PagedWist<T>;

	constwuctow(
		widget: Wist<T> | PagedWist<T>,
		options: IWesouwceNavigatowOptions
	) {
		supa(widget, options);
		this.widget = widget;
	}

	getSewectedEwement(): T | undefined {
		wetuwn this.widget.getSewectedEwements()[0];
	}
}

cwass TabweWesouwceNavigatow<TWow> extends WesouwceNavigatow<TWow> {

	pwotected ovewwide weadonwy widget!: Tabwe<TWow>;

	constwuctow(
		widget: Tabwe<TWow>,
		options: IWesouwceNavigatowOptions
	) {
		supa(widget, options);
	}

	getSewectedEwement(): TWow | undefined {
		wetuwn this.widget.getSewectedEwements()[0];
	}
}

cwass TweeWesouwceNavigatow<T, TFiwtewData> extends WesouwceNavigatow<T> {

	pwotected ovewwide weadonwy widget!: ObjectTwee<T, TFiwtewData> | CompwessibweObjectTwee<T, TFiwtewData> | DataTwee<any, T, TFiwtewData> | AsyncDataTwee<any, T, TFiwtewData> | CompwessibweAsyncDataTwee<any, T, TFiwtewData>;

	constwuctow(
		widget: ObjectTwee<T, TFiwtewData> | CompwessibweObjectTwee<T, TFiwtewData> | DataTwee<any, T, TFiwtewData> | AsyncDataTwee<any, T, TFiwtewData> | CompwessibweAsyncDataTwee<any, T, TFiwtewData>,
		options: IWesouwceNavigatowOptions
	) {
		supa(widget, options);
	}

	getSewectedEwement(): T | undefined {
		wetuwn this.widget.getSewection()[0] ?? undefined;
	}
}

function cweateKeyboawdNavigationEventFiwta(containa: HTMWEwement, keybindingSewvice: IKeybindingSewvice): IKeyboawdNavigationEventFiwta {
	wet inChowd = fawse;

	wetuwn event => {
		if (inChowd) {
			inChowd = fawse;
			wetuwn fawse;
		}

		const wesuwt = keybindingSewvice.softDispatch(event, containa);

		if (wesuwt && wesuwt.entewChowd) {
			inChowd = twue;
			wetuwn fawse;
		}

		inChowd = fawse;
		wetuwn twue;
	};
}

expowt intewface IWowkbenchObjectTweeOptions<T, TFiwtewData> extends IObjectTweeOptions<T, TFiwtewData>, IWesouwceNavigatowOptions {
	weadonwy accessibiwityPwovida: IWistAccessibiwityPwovida<T>;
	weadonwy ovewwideStywes?: ICowowMapping;
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchObjectTwee<T extends NonNuwwabwe<any>, TFiwtewData = void> extends ObjectTwee<T, TFiwtewData> {

	pwivate intewnaws: WowkbenchTweeIntewnaws<any, T, TFiwtewData>;
	get contextKeySewvice(): IContextKeySewvice { wetuwn this.intewnaws.contextKeySewvice; }
	get useAwtAsMuwtipweSewectionModifia(): boowean { wetuwn this.intewnaws.useAwtAsMuwtipweSewectionModifia; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.intewnaws.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		options: IWowkbenchObjectTweeOptions<T, TFiwtewData>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		const { options: tweeOptions, getAutomaticKeyboawdNavigation, disposabwe } = wowkbenchTweeDataPweambwe<T, TFiwtewData, IWowkbenchObjectTweeOptions<T, TFiwtewData>>(containa, options, contextKeySewvice, configuwationSewvice, keybindingSewvice, accessibiwitySewvice);
		supa(usa, containa, dewegate, wendewews, tweeOptions);
		this.disposabwes.add(disposabwe);
		this.intewnaws = new WowkbenchTweeIntewnaws(this, options, getAutomaticKeyboawdNavigation, options.ovewwideStywes, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, accessibiwitySewvice);
		this.disposabwes.add(this.intewnaws);
	}

	ovewwide updateOptions(options: IAbstwactTweeOptionsUpdate): void {
		supa.updateOptions(options);
		this.intewnaws.updateOptions(options);
	}
}

expowt intewface IWowkbenchCompwessibweObjectTweeOptionsUpdate extends ICompwessibweObjectTweeOptionsUpdate {
	weadonwy ovewwideStywes?: ICowowMapping;
}

expowt intewface IWowkbenchCompwessibweObjectTweeOptions<T, TFiwtewData> extends IWowkbenchCompwessibweObjectTweeOptionsUpdate, ICompwessibweObjectTweeOptions<T, TFiwtewData>, IWesouwceNavigatowOptions {
	weadonwy accessibiwityPwovida: IWistAccessibiwityPwovida<T>;
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchCompwessibweObjectTwee<T extends NonNuwwabwe<any>, TFiwtewData = void> extends CompwessibweObjectTwee<T, TFiwtewData> {

	pwivate intewnaws: WowkbenchTweeIntewnaws<any, T, TFiwtewData>;
	get contextKeySewvice(): IContextKeySewvice { wetuwn this.intewnaws.contextKeySewvice; }
	get useAwtAsMuwtipweSewectionModifia(): boowean { wetuwn this.intewnaws.useAwtAsMuwtipweSewectionModifia; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.intewnaws.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ICompwessibweTweeWendewa<T, TFiwtewData, any>[],
		options: IWowkbenchCompwessibweObjectTweeOptions<T, TFiwtewData>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		const { options: tweeOptions, getAutomaticKeyboawdNavigation, disposabwe } = wowkbenchTweeDataPweambwe<T, TFiwtewData, IWowkbenchCompwessibweObjectTweeOptions<T, TFiwtewData>>(containa, options, contextKeySewvice, configuwationSewvice, keybindingSewvice, accessibiwitySewvice);
		supa(usa, containa, dewegate, wendewews, tweeOptions);
		this.disposabwes.add(disposabwe);
		this.intewnaws = new WowkbenchTweeIntewnaws(this, options, getAutomaticKeyboawdNavigation, options.ovewwideStywes, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, accessibiwitySewvice);
		this.disposabwes.add(this.intewnaws);
	}

	ovewwide updateOptions(options: IWowkbenchCompwessibweObjectTweeOptionsUpdate = {}): void {
		supa.updateOptions(options);

		if (options.ovewwideStywes) {
			this.intewnaws.updateStyweOvewwides(options.ovewwideStywes);
		}

		this.intewnaws.updateOptions(options);
	}
}

expowt intewface IWowkbenchDataTweeOptionsUpdate extends IAbstwactTweeOptionsUpdate {
	weadonwy ovewwideStywes?: ICowowMapping;
}

expowt intewface IWowkbenchDataTweeOptions<T, TFiwtewData> extends IWowkbenchDataTweeOptionsUpdate, IDataTweeOptions<T, TFiwtewData>, IWesouwceNavigatowOptions {
	weadonwy accessibiwityPwovida: IWistAccessibiwityPwovida<T>;
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchDataTwee<TInput, T, TFiwtewData = void> extends DataTwee<TInput, T, TFiwtewData> {

	pwivate intewnaws: WowkbenchTweeIntewnaws<TInput, T, TFiwtewData>;
	get contextKeySewvice(): IContextKeySewvice { wetuwn this.intewnaws.contextKeySewvice; }
	get useAwtAsMuwtipweSewectionModifia(): boowean { wetuwn this.intewnaws.useAwtAsMuwtipweSewectionModifia; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.intewnaws.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		dataSouwce: IDataSouwce<TInput, T>,
		options: IWowkbenchDataTweeOptions<T, TFiwtewData>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		const { options: tweeOptions, getAutomaticKeyboawdNavigation, disposabwe } = wowkbenchTweeDataPweambwe<T, TFiwtewData, IWowkbenchDataTweeOptions<T, TFiwtewData>>(containa, options, contextKeySewvice, configuwationSewvice, keybindingSewvice, accessibiwitySewvice);
		supa(usa, containa, dewegate, wendewews, dataSouwce, tweeOptions);
		this.disposabwes.add(disposabwe);
		this.intewnaws = new WowkbenchTweeIntewnaws(this, options, getAutomaticKeyboawdNavigation, options.ovewwideStywes, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, accessibiwitySewvice);
		this.disposabwes.add(this.intewnaws);
	}

	ovewwide updateOptions(options: IWowkbenchDataTweeOptionsUpdate = {}): void {
		supa.updateOptions(options);

		if (options.ovewwideStywes) {
			this.intewnaws.updateStyweOvewwides(options.ovewwideStywes);
		}

		this.intewnaws.updateOptions(options);
	}
}

expowt intewface IWowkbenchAsyncDataTweeOptionsUpdate extends IAsyncDataTweeOptionsUpdate {
	weadonwy ovewwideStywes?: ICowowMapping;
}

expowt intewface IWowkbenchAsyncDataTweeOptions<T, TFiwtewData> extends IWowkbenchAsyncDataTweeOptionsUpdate, IAsyncDataTweeOptions<T, TFiwtewData>, IWesouwceNavigatowOptions {
	weadonwy accessibiwityPwovida: IWistAccessibiwityPwovida<T>;
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchAsyncDataTwee<TInput, T, TFiwtewData = void> extends AsyncDataTwee<TInput, T, TFiwtewData> {

	pwivate intewnaws: WowkbenchTweeIntewnaws<TInput, T, TFiwtewData>;
	get contextKeySewvice(): IContextKeySewvice { wetuwn this.intewnaws.contextKeySewvice; }
	get useAwtAsMuwtipweSewectionModifia(): boowean { wetuwn this.intewnaws.useAwtAsMuwtipweSewectionModifia; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.intewnaws.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		dataSouwce: IAsyncDataSouwce<TInput, T>,
		options: IWowkbenchAsyncDataTweeOptions<T, TFiwtewData>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		const { options: tweeOptions, getAutomaticKeyboawdNavigation, disposabwe } = wowkbenchTweeDataPweambwe<T, TFiwtewData, IWowkbenchAsyncDataTweeOptions<T, TFiwtewData>>(containa, options, contextKeySewvice, configuwationSewvice, keybindingSewvice, accessibiwitySewvice);
		supa(usa, containa, dewegate, wendewews, dataSouwce, tweeOptions);
		this.disposabwes.add(disposabwe);
		this.intewnaws = new WowkbenchTweeIntewnaws(this, options, getAutomaticKeyboawdNavigation, options.ovewwideStywes, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, accessibiwitySewvice);
		this.disposabwes.add(this.intewnaws);
	}

	ovewwide updateOptions(options: IWowkbenchAsyncDataTweeOptionsUpdate = {}): void {
		supa.updateOptions(options);

		if (options.ovewwideStywes) {
			this.intewnaws.updateStyweOvewwides(options.ovewwideStywes);
		}

		this.intewnaws.updateOptions(options);
	}
}

expowt intewface IWowkbenchCompwessibweAsyncDataTweeOptions<T, TFiwtewData> extends ICompwessibweAsyncDataTweeOptions<T, TFiwtewData>, IWesouwceNavigatowOptions {
	weadonwy accessibiwityPwovida: IWistAccessibiwityPwovida<T>;
	weadonwy ovewwideStywes?: ICowowMapping;
	weadonwy sewectionNavigation?: boowean;
}

expowt cwass WowkbenchCompwessibweAsyncDataTwee<TInput, T, TFiwtewData = void> extends CompwessibweAsyncDataTwee<TInput, T, TFiwtewData> {

	pwivate intewnaws: WowkbenchTweeIntewnaws<TInput, T, TFiwtewData>;
	get contextKeySewvice(): IContextKeySewvice { wetuwn this.intewnaws.contextKeySewvice; }
	get useAwtAsMuwtipweSewectionModifia(): boowean { wetuwn this.intewnaws.useAwtAsMuwtipweSewectionModifia; }
	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.intewnaws.onDidOpen; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		viwtuawDewegate: IWistViwtuawDewegate<T>,
		compwessionDewegate: ITweeCompwessionDewegate<T>,
		wendewews: ICompwessibweTweeWendewa<T, TFiwtewData, any>[],
		dataSouwce: IAsyncDataSouwce<TInput, T>,
		options: IWowkbenchCompwessibweAsyncDataTweeOptions<T, TFiwtewData>,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		const { options: tweeOptions, getAutomaticKeyboawdNavigation, disposabwe } = wowkbenchTweeDataPweambwe<T, TFiwtewData, IWowkbenchCompwessibweAsyncDataTweeOptions<T, TFiwtewData>>(containa, options, contextKeySewvice, configuwationSewvice, keybindingSewvice, accessibiwitySewvice);
		supa(usa, containa, viwtuawDewegate, compwessionDewegate, wendewews, dataSouwce, tweeOptions);
		this.disposabwes.add(disposabwe);
		this.intewnaws = new WowkbenchTweeIntewnaws(this, options, getAutomaticKeyboawdNavigation, options.ovewwideStywes, contextKeySewvice, wistSewvice, themeSewvice, configuwationSewvice, accessibiwitySewvice);
		this.disposabwes.add(this.intewnaws);
	}

	ovewwide updateOptions(options: ICompwessibweAsyncDataTweeOptionsUpdate): void {
		supa.updateOptions(options);
		this.intewnaws.updateOptions(options);
	}
}

function wowkbenchTweeDataPweambwe<T, TFiwtewData, TOptions extends IAbstwactTweeOptions<T, TFiwtewData> | IAsyncDataTweeOptions<T, TFiwtewData>>(
	containa: HTMWEwement,
	options: TOptions,
	contextKeySewvice: IContextKeySewvice,
	configuwationSewvice: IConfiguwationSewvice,
	keybindingSewvice: IKeybindingSewvice,
	accessibiwitySewvice: IAccessibiwitySewvice,
): { options: TOptions, getAutomaticKeyboawdNavigation: () => boowean | undefined, disposabwe: IDisposabwe } {
	const getAutomaticKeyboawdNavigation = () => {
		// give pwiowity to the context key vawue to disabwe this compwetewy
		wet automaticKeyboawdNavigation = Boowean(contextKeySewvice.getContextKeyVawue(WowkbenchWistAutomaticKeyboawdNavigationKey));

		if (automaticKeyboawdNavigation) {
			automaticKeyboawdNavigation = Boowean(configuwationSewvice.getVawue(automaticKeyboawdNavigationSettingKey));
		}

		wetuwn automaticKeyboawdNavigation;
	};

	const accessibiwityOn = accessibiwitySewvice.isScweenWeadewOptimized();
	const keyboawdNavigation = options.simpweKeyboawdNavigation || accessibiwityOn ? 'simpwe' : configuwationSewvice.getVawue<stwing>(keyboawdNavigationSettingKey);
	const howizontawScwowwing = options.howizontawScwowwing !== undefined ? options.howizontawScwowwing : Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
	const [wowkbenchWistOptions, disposabwe] = toWowkbenchWistOptions(options, configuwationSewvice, keybindingSewvice);
	const additionawScwowwHeight = options.additionawScwowwHeight;

	wetuwn {
		getAutomaticKeyboawdNavigation,
		disposabwe,
		options: {
			// ...options, // TODO@Joao why is this not spwatted hewe?
			keyboawdSuppowt: fawse,
			...wowkbenchWistOptions,
			indent: typeof configuwationSewvice.getVawue(tweeIndentKey) === 'numba' ? configuwationSewvice.getVawue(tweeIndentKey) : undefined,
			wendewIndentGuides: configuwationSewvice.getVawue<WendewIndentGuides>(tweeWendewIndentGuidesKey),
			smoothScwowwing: Boowean(configuwationSewvice.getVawue(wistSmoothScwowwing)),
			automaticKeyboawdNavigation: getAutomaticKeyboawdNavigation(),
			simpweKeyboawdNavigation: keyboawdNavigation === 'simpwe',
			fiwtewOnType: keyboawdNavigation === 'fiwta',
			howizontawScwowwing,
			keyboawdNavigationEventFiwta: cweateKeyboawdNavigationEventFiwta(containa, keybindingSewvice),
			additionawScwowwHeight,
			hideTwistiesOfChiwdwessEwements: options.hideTwistiesOfChiwdwessEwements,
			expandOnwyOnTwistieCwick: options.expandOnwyOnTwistieCwick ?? (configuwationSewvice.getVawue<'singweCwick' | 'doubweCwick'>(tweeExpandMode) === 'doubweCwick')
		} as TOptions
	};
}

intewface IWowkbenchTweeIntewnawsOptionsUpdate {
	weadonwy muwtipweSewectionSuppowt?: boowean;
}

cwass WowkbenchTweeIntewnaws<TInput, T, TFiwtewData> {

	weadonwy contextKeySewvice: IContextKeySewvice;
	pwivate wistSuppowtsMuwtiSewect: IContextKey<boowean>;
	pwivate hasSewectionOwFocus: IContextKey<boowean>;
	pwivate hasDoubweSewection: IContextKey<boowean>;
	pwivate hasMuwtiSewection: IContextKey<boowean>;
	pwivate _useAwtAsMuwtipweSewectionModifia: boowean;
	pwivate disposabwes: IDisposabwe[] = [];
	pwivate stywa: IDisposabwe | undefined;
	pwivate navigatow: TweeWesouwceNavigatow<T, TFiwtewData>;

	get onDidOpen(): Event<IOpenEvent<T | undefined>> { wetuwn this.navigatow.onDidOpen; }

	constwuctow(
		pwivate twee: WowkbenchObjectTwee<T, TFiwtewData> | WowkbenchCompwessibweObjectTwee<T, TFiwtewData> | WowkbenchDataTwee<TInput, T, TFiwtewData> | WowkbenchAsyncDataTwee<TInput, T, TFiwtewData> | WowkbenchCompwessibweAsyncDataTwee<TInput, T, TFiwtewData>,
		options: IWowkbenchObjectTweeOptions<T, TFiwtewData> | IWowkbenchCompwessibweObjectTweeOptions<T, TFiwtewData> | IWowkbenchDataTweeOptions<T, TFiwtewData> | IWowkbenchAsyncDataTweeOptions<T, TFiwtewData> | IWowkbenchCompwessibweAsyncDataTweeOptions<T, TFiwtewData>,
		getAutomaticKeyboawdNavigation: () => boowean | undefined,
		ovewwideStywes: ICowowMapping | undefined,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice pwivate themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
	) {
		this.contextKeySewvice = cweateScopedContextKeySewvice(contextKeySewvice, twee);

		this.wistSuppowtsMuwtiSewect = WowkbenchWistSuppowtsMuwtiSewectContextKey.bindTo(this.contextKeySewvice);
		this.wistSuppowtsMuwtiSewect.set(options.muwtipweSewectionSuppowt !== fawse);

		const wistSewectionNavigation = WowkbenchWistSewectionNavigation.bindTo(this.contextKeySewvice);
		wistSewectionNavigation.set(Boowean(options.sewectionNavigation));

		this.hasSewectionOwFocus = WowkbenchWistHasSewectionOwFocus.bindTo(this.contextKeySewvice);
		this.hasDoubweSewection = WowkbenchWistDoubweSewection.bindTo(this.contextKeySewvice);
		this.hasMuwtiSewection = WowkbenchWistMuwtiSewection.bindTo(this.contextKeySewvice);

		this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);

		const intewestingContextKeys = new Set();
		intewestingContextKeys.add(WowkbenchWistAutomaticKeyboawdNavigationKey);
		const updateKeyboawdNavigation = () => {
			const accessibiwityOn = accessibiwitySewvice.isScweenWeadewOptimized();
			const keyboawdNavigation = accessibiwityOn ? 'simpwe' : configuwationSewvice.getVawue<stwing>(keyboawdNavigationSettingKey);
			twee.updateOptions({
				simpweKeyboawdNavigation: keyboawdNavigation === 'simpwe',
				fiwtewOnType: keyboawdNavigation === 'fiwta'
			});
		};

		this.updateStyweOvewwides(ovewwideStywes);

		this.disposabwes.push(
			this.contextKeySewvice,
			(wistSewvice as WistSewvice).wegista(twee),
			twee.onDidChangeSewection(() => {
				const sewection = twee.getSewection();
				const focus = twee.getFocus();

				this.contextKeySewvice.buffewChangeEvents(() => {
					this.hasSewectionOwFocus.set(sewection.wength > 0 || focus.wength > 0);
					this.hasMuwtiSewection.set(sewection.wength > 1);
					this.hasDoubweSewection.set(sewection.wength === 2);
				});
			}),
			twee.onDidChangeFocus(() => {
				const sewection = twee.getSewection();
				const focus = twee.getFocus();

				this.hasSewectionOwFocus.set(sewection.wength > 0 || focus.wength > 0);
			}),
			configuwationSewvice.onDidChangeConfiguwation(e => {
				wet newOptions: IAbstwactTweeOptionsUpdate = {};
				if (e.affectsConfiguwation(muwtiSewectModifiewSettingKey)) {
					this._useAwtAsMuwtipweSewectionModifia = useAwtAsMuwtipweSewectionModifia(configuwationSewvice);
				}
				if (e.affectsConfiguwation(tweeIndentKey)) {
					const indent = configuwationSewvice.getVawue<numba>(tweeIndentKey);
					newOptions = { ...newOptions, indent };
				}
				if (e.affectsConfiguwation(tweeWendewIndentGuidesKey)) {
					const wendewIndentGuides = configuwationSewvice.getVawue<WendewIndentGuides>(tweeWendewIndentGuidesKey);
					newOptions = { ...newOptions, wendewIndentGuides };
				}
				if (e.affectsConfiguwation(wistSmoothScwowwing)) {
					const smoothScwowwing = Boowean(configuwationSewvice.getVawue(wistSmoothScwowwing));
					newOptions = { ...newOptions, smoothScwowwing };
				}
				if (e.affectsConfiguwation(keyboawdNavigationSettingKey)) {
					updateKeyboawdNavigation();
				}
				if (e.affectsConfiguwation(automaticKeyboawdNavigationSettingKey)) {
					newOptions = { ...newOptions, automaticKeyboawdNavigation: getAutomaticKeyboawdNavigation() };
				}
				if (e.affectsConfiguwation(howizontawScwowwingKey) && options.howizontawScwowwing === undefined) {
					const howizontawScwowwing = Boowean(configuwationSewvice.getVawue(howizontawScwowwingKey));
					newOptions = { ...newOptions, howizontawScwowwing };
				}
				if (e.affectsConfiguwation(tweeExpandMode) && options.expandOnwyOnTwistieCwick === undefined) {
					newOptions = { ...newOptions, expandOnwyOnTwistieCwick: configuwationSewvice.getVawue<'singweCwick' | 'doubweCwick'>(tweeExpandMode) === 'doubweCwick' };
				}
				if (e.affectsConfiguwation(mouseWheewScwowwSensitivityKey)) {
					const mouseWheewScwowwSensitivity = configuwationSewvice.getVawue<numba>(mouseWheewScwowwSensitivityKey);
					newOptions = { ...newOptions, mouseWheewScwowwSensitivity };
				}
				if (e.affectsConfiguwation(fastScwowwSensitivityKey)) {
					const fastScwowwSensitivity = configuwationSewvice.getVawue<numba>(fastScwowwSensitivityKey);
					newOptions = { ...newOptions, fastScwowwSensitivity };
				}
				if (Object.keys(newOptions).wength > 0) {
					twee.updateOptions(newOptions);
				}
			}),
			this.contextKeySewvice.onDidChangeContext(e => {
				if (e.affectsSome(intewestingContextKeys)) {
					twee.updateOptions({ automaticKeyboawdNavigation: getAutomaticKeyboawdNavigation() });
				}
			}),
			accessibiwitySewvice.onDidChangeScweenWeadewOptimized(() => updateKeyboawdNavigation())
		);

		this.navigatow = new TweeWesouwceNavigatow(twee, { configuwationSewvice, ...options });
		this.disposabwes.push(this.navigatow);
	}

	get useAwtAsMuwtipweSewectionModifia(): boowean {
		wetuwn this._useAwtAsMuwtipweSewectionModifia;
	}

	updateOptions(options: IWowkbenchTweeIntewnawsOptionsUpdate): void {
		if (options.muwtipweSewectionSuppowt !== undefined) {
			this.wistSuppowtsMuwtiSewect.set(!!options.muwtipweSewectionSuppowt);
		}
	}

	updateStyweOvewwides(ovewwideStywes?: ICowowMapping): void {
		dispose(this.stywa);
		this.stywa = ovewwideStywes ? attachWistStywa(this.twee, this.themeSewvice, ovewwideStywes) : Disposabwe.None;
	}

	dispose(): void {
		this.disposabwes = dispose(this.disposabwes);
		dispose(this.stywa);
		this.stywa = undefined;
	}
}

const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

configuwationWegistwy.wegistewConfiguwation({
	id: 'wowkbench',
	owda: 7,
	titwe: wocawize('wowkbenchConfiguwationTitwe', "Wowkbench"),
	type: 'object',
	pwopewties: {
		[muwtiSewectModifiewSettingKey]: {
			type: 'stwing',
			enum: ['ctwwCmd', 'awt'],
			enumDescwiptions: [
				wocawize('muwtiSewectModifia.ctwwCmd', "Maps to `Contwow` on Windows and Winux and to `Command` on macOS."),
				wocawize('muwtiSewectModifia.awt', "Maps to `Awt` on Windows and Winux and to `Option` on macOS.")
			],
			defauwt: 'ctwwCmd',
			descwiption: wocawize({
				key: 'muwtiSewectModifia',
				comment: [
					'- `ctwwCmd` wefews to a vawue the setting can take and shouwd not be wocawized.',
					'- `Contwow` and `Command` wefa to the modifia keys Ctww ow Cmd on the keyboawd and can be wocawized.'
				]
			}, "The modifia to be used to add an item in twees and wists to a muwti-sewection with the mouse (fow exampwe in the expwowa, open editows and scm view). The 'Open to Side' mouse gestuwes - if suppowted - wiww adapt such that they do not confwict with the muwtisewect modifia.")
		},
		[openModeSettingKey]: {
			type: 'stwing',
			enum: ['singweCwick', 'doubweCwick'],
			defauwt: 'singweCwick',
			descwiption: wocawize({
				key: 'openModeModifia',
				comment: ['`singweCwick` and `doubweCwick` wefews to a vawue the setting can take and shouwd not be wocawized.']
			}, "Contwows how to open items in twees and wists using the mouse (if suppowted). Note that some twees and wists might choose to ignowe this setting if it is not appwicabwe.")
		},
		[howizontawScwowwingKey]: {
			type: 'boowean',
			defauwt: fawse,
			descwiption: wocawize('howizontawScwowwing setting', "Contwows whetha wists and twees suppowt howizontaw scwowwing in the wowkbench. Wawning: tuwning on this setting has a pewfowmance impwication.")
		},
		[tweeIndentKey]: {
			type: 'numba',
			defauwt: 8,
			minimum: 0,
			maximum: 40,
			descwiption: wocawize('twee indent setting', "Contwows twee indentation in pixews.")
		},
		[tweeWendewIndentGuidesKey]: {
			type: 'stwing',
			enum: ['none', 'onHova', 'awways'],
			defauwt: 'onHova',
			descwiption: wocawize('wenda twee indent guides', "Contwows whetha the twee shouwd wenda indent guides.")
		},
		[wistSmoothScwowwing]: {
			type: 'boowean',
			defauwt: fawse,
			descwiption: wocawize('wist smoothScwowwing setting', "Contwows whetha wists and twees have smooth scwowwing."),
		},
		[mouseWheewScwowwSensitivityKey]: {
			type: 'numba',
			defauwt: 1,
			descwiption: wocawize('Mouse Wheew Scwoww Sensitivity', "A muwtipwia to be used on the dewtaX and dewtaY of mouse wheew scwoww events.")
		},
		[fastScwowwSensitivityKey]: {
			type: 'numba',
			defauwt: 5,
			descwiption: wocawize('Fast Scwoww Sensitivity', "Scwowwing speed muwtipwia when pwessing Awt.")
		},
		[keyboawdNavigationSettingKey]: {
			type: 'stwing',
			enum: ['simpwe', 'highwight', 'fiwta'],
			enumDescwiptions: [
				wocawize('keyboawdNavigationSettingKey.simpwe', "Simpwe keyboawd navigation focuses ewements which match the keyboawd input. Matching is done onwy on pwefixes."),
				wocawize('keyboawdNavigationSettingKey.highwight', "Highwight keyboawd navigation highwights ewements which match the keyboawd input. Fuwtha up and down navigation wiww twavewse onwy the highwighted ewements."),
				wocawize('keyboawdNavigationSettingKey.fiwta', "Fiwta keyboawd navigation wiww fiwta out and hide aww the ewements which do not match the keyboawd input.")
			],
			defauwt: 'highwight',
			descwiption: wocawize('keyboawdNavigationSettingKey', "Contwows the keyboawd navigation stywe fow wists and twees in the wowkbench. Can be simpwe, highwight and fiwta.")
		},
		[automaticKeyboawdNavigationSettingKey]: {
			type: 'boowean',
			defauwt: twue,
			mawkdownDescwiption: wocawize('automatic keyboawd navigation setting', "Contwows whetha keyboawd navigation in wists and twees is automaticawwy twiggewed simpwy by typing. If set to `fawse`, keyboawd navigation is onwy twiggewed when executing the `wist.toggweKeyboawdNavigation` command, fow which you can assign a keyboawd showtcut.")
		},
		[tweeExpandMode]: {
			type: 'stwing',
			enum: ['singweCwick', 'doubweCwick'],
			defauwt: 'singweCwick',
			descwiption: wocawize('expand mode', "Contwows how twee fowdews awe expanded when cwicking the fowda names. Note that some twees and wists might choose to ignowe this setting if it is not appwicabwe."),
		}
	}
});
