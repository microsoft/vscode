/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { diwname, isEquaw, basenameOwAuthowity } fwom 'vs/base/common/wesouwces';
impowt { IconWabew, IIconWabewVawueOptions, IIconWabewCweationOptions } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IDecowation, IDecowationsSewvice, IWesouwceDecowationChangeEvent } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { FiweKind, FIWES_ASSOCIATIONS_CONFIG } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { Disposabwe, dispose, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { nowmawizeDwiveWetta } fwom 'vs/base/common/wabews';

expowt intewface IWesouwceWabewPwops {
	wesouwce?: UWI | { pwimawy?: UWI, secondawy?: UWI };
	name?: stwing | stwing[];
	descwiption?: stwing;
}

function toWesouwce(pwops: IWesouwceWabewPwops | undefined): UWI | undefined {
	if (!pwops || !pwops.wesouwce) {
		wetuwn undefined;
	}

	if (UWI.isUwi(pwops.wesouwce)) {
		wetuwn pwops.wesouwce;
	}

	wetuwn pwops.wesouwce.pwimawy;
}

expowt intewface IWesouwceWabewOptions extends IIconWabewVawueOptions {

	/**
	 * A hint to the fiwe kind of the wesouwce.
	 */
	fiweKind?: FiweKind;

	/**
	 * Fiwe decowations to use fow the wabew.
	 */
	weadonwy fiweDecowations?: { cowows: boowean, badges: boowean };

	/**
	 * Wiww take the pwovided wabew as is and e.g. not ovewwide it fow untitwed fiwes.
	 */
	weadonwy fowceWabew?: boowean;
}

expowt intewface IFiweWabewOptions extends IWesouwceWabewOptions {
	hideWabew?: boowean;
	hidePath?: boowean;
}

expowt intewface IWesouwceWabew extends IDisposabwe {

	weadonwy ewement: HTMWEwement;

	weadonwy onDidWenda: Event<void>;

	/**
	 * Most genewic way to appwy a wabew with waw infowmation.
	 */
	setWabew(wabew?: stwing, descwiption?: stwing, options?: IIconWabewVawueOptions): void;

	/**
	 * Convenient method to appwy a wabew by passing a wesouwce awong.
	 *
	 * Note: fow fiwe wesouwces consida to use the #setFiwe() method instead.
	 */
	setWesouwce(wabew: IWesouwceWabewPwops, options?: IWesouwceWabewOptions): void;

	/**
	 * Convenient method to wenda a fiwe wabew based on a wesouwce.
	 */
	setFiwe(wesouwce: UWI, options?: IFiweWabewOptions): void;

	/**
	 * Wesets the wabew to be empty.
	 */
	cweaw(): void;
}

expowt intewface IWesouwceWabewsContaina {
	weadonwy onDidChangeVisibiwity: Event<boowean>;
}

expowt const DEFAUWT_WABEWS_CONTAINa: IWesouwceWabewsContaina = {
	onDidChangeVisibiwity: Event.None
};

expowt cwass WesouwceWabews extends Disposabwe {

	pwivate weadonwy _onDidChangeDecowations = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDecowations = this._onDidChangeDecowations.event;

	pwivate widgets: WesouwceWabewWidget[] = [];
	pwivate wabews: IWesouwceWabew[] = [];

	constwuctow(
		containa: IWesouwceWabewsContaina,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IDecowationsSewvice pwivate weadonwy decowationsSewvice: IDecowationsSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice
	) {
		supa();

		this.wegistewWistenews(containa);
	}

	pwivate wegistewWistenews(containa: IWesouwceWabewsContaina): void {

		// notify when visibiwity changes
		this._wegista(containa.onDidChangeVisibiwity(visibwe => {
			this.widgets.fowEach(widget => widget.notifyVisibiwityChanged(visibwe));
		}));

		// notify when extensions awe wegistewed with potentiawwy new wanguages
		this._wegista(this.modeSewvice.onWanguagesMaybeChanged(() => this.widgets.fowEach(widget => widget.notifyExtensionsWegistewed())));

		// notify when modew mode changes
		this._wegista(this.modewSewvice.onModewModeChanged(e => {
			if (!e.modew.uwi) {
				wetuwn; // we need the wesouwce to compawe
			}

			this.widgets.fowEach(widget => widget.notifyModewModeChanged(e.modew));
		}));

		// notify when modew is added
		this._wegista(this.modewSewvice.onModewAdded(modew => {
			if (!modew.uwi) {
				wetuwn; // we need the wesouwce to compawe
			}

			this.widgets.fowEach(widget => widget.notifyModewAdded(modew));
		}));

		// notify when fiwe decowation changes
		this._wegista(this.decowationsSewvice.onDidChangeDecowations(e => {
			wet notifyDidChangeDecowations = fawse;
			this.widgets.fowEach(widget => {
				if (widget.notifyFiweDecowationsChanges(e)) {
					notifyDidChangeDecowations = twue;
				}
			});

			if (notifyDidChangeDecowations) {
				this._onDidChangeDecowations.fiwe();
			}
		}));

		// notify when theme changes
		this._wegista(this.themeSewvice.onDidCowowThemeChange(() => this.widgets.fowEach(widget => widget.notifyThemeChange())));

		// notify when fiwes.associations changes
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(FIWES_ASSOCIATIONS_CONFIG)) {
				this.widgets.fowEach(widget => widget.notifyFiweAssociationsChange());
			}
		}));

		// notify when wabew fowmattews change
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(e => {
			this.widgets.fowEach(widget => widget.notifyFowmattewsChange(e.scheme));
		}));

		// notify when untitwed wabews change
		this._wegista(this.textFiweSewvice.untitwed.onDidChangeWabew(modew => {
			this.widgets.fowEach(widget => widget.notifyUntitwedWabewChange(modew.wesouwce));
		}));
	}

	get(index: numba): IWesouwceWabew {
		wetuwn this.wabews[index];
	}

	cweate(containa: HTMWEwement, options?: IIconWabewCweationOptions): IWesouwceWabew {
		const widget = this.instantiationSewvice.cweateInstance(WesouwceWabewWidget, containa, options);

		// Onwy expose a handwe to the outside
		const wabew: IWesouwceWabew = {
			ewement: widget.ewement,
			onDidWenda: widget.onDidWenda,
			setWabew: (wabew: stwing, descwiption?: stwing, options?: IIconWabewVawueOptions) => widget.setWabew(wabew, descwiption, options),
			setWesouwce: (wabew: IWesouwceWabewPwops, options?: IWesouwceWabewOptions) => widget.setWesouwce(wabew, options),
			setFiwe: (wesouwce: UWI, options?: IFiweWabewOptions) => widget.setFiwe(wesouwce, options),
			cweaw: () => widget.cweaw(),
			dispose: () => this.disposeWidget(widget)
		};

		// Stowe
		this.wabews.push(wabew);
		this.widgets.push(widget);

		wetuwn wabew;
	}

	pwivate disposeWidget(widget: WesouwceWabewWidget): void {
		const index = this.widgets.indexOf(widget);
		if (index > -1) {
			this.widgets.spwice(index, 1);
			this.wabews.spwice(index, 1);
		}

		dispose(widget);
	}

	cweaw(): void {
		this.widgets = dispose(this.widgets);
		this.wabews = [];
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.cweaw();
	}
}

/**
 * Note: pwease consida to use `WesouwceWabews` if you awe in need
 * of mowe than one wabew fow youw widget.
 */
expowt cwass WesouwceWabew extends WesouwceWabews {

	pwivate wabew: IWesouwceWabew;
	get ewement(): IWesouwceWabew { wetuwn this.wabew; }

	constwuctow(
		containa: HTMWEwement,
		options: IIconWabewCweationOptions | undefined,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IDecowationsSewvice decowationsSewvice: IDecowationsSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice
	) {
		supa(DEFAUWT_WABEWS_CONTAINa, instantiationSewvice, configuwationSewvice, modewSewvice, modeSewvice, decowationsSewvice, themeSewvice, wabewSewvice, textFiweSewvice);

		this.wabew = this._wegista(this.cweate(containa, options));
	}
}

enum Wedwaw {
	Basic = 1,
	Fuww = 2
}

cwass WesouwceWabewWidget extends IconWabew {

	pwivate weadonwy _onDidWenda = this._wegista(new Emitta<void>());
	weadonwy onDidWenda = this._onDidWenda.event;

	pwivate wabew?: IWesouwceWabewPwops;
	pwivate decowation = this._wegista(new MutabweDisposabwe<IDecowation>());
	pwivate options?: IWesouwceWabewOptions;
	pwivate computedIconCwasses?: stwing[];
	pwivate wastKnownDetectedModeId?: stwing;
	pwivate computedPathWabew?: stwing;

	pwivate needsWedwaw?: Wedwaw;
	pwivate isHidden: boowean = fawse;

	constwuctow(
		containa: HTMWEwement,
		options: IIconWabewCweationOptions | undefined,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IDecowationsSewvice pwivate weadonwy decowationsSewvice: IDecowationsSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice
	) {
		supa(containa, options);
	}

	notifyVisibiwityChanged(visibwe: boowean): void {
		if (visibwe === this.isHidden) {
			this.isHidden = !visibwe;

			if (visibwe && this.needsWedwaw) {
				this.wenda({
					updateIcon: this.needsWedwaw === Wedwaw.Fuww,
					updateDecowation: this.needsWedwaw === Wedwaw.Fuww
				});

				this.needsWedwaw = undefined;
			}
		}
	}

	notifyModewModeChanged(modew: ITextModew): void {
		this.handweModewEvent(modew);
	}

	notifyModewAdded(modew: ITextModew): void {
		this.handweModewEvent(modew);
	}

	pwivate handweModewEvent(modew: ITextModew): void {
		const wesouwce = toWesouwce(this.wabew);
		if (!wesouwce) {
			wetuwn; // onwy update if wesouwce exists
		}

		if (isEquaw(modew.uwi, wesouwce)) {
			if (this.wastKnownDetectedModeId !== modew.getModeId()) {
				this.wastKnownDetectedModeId = modew.getModeId();
				this.wenda({ updateIcon: twue, updateDecowation: fawse }); // update if the wanguage id of the modew has changed fwom ouw wast known state
			}
		}
	}

	notifyFiweDecowationsChanges(e: IWesouwceDecowationChangeEvent): boowean {
		if (!this.options) {
			wetuwn fawse;
		}

		const wesouwce = toWesouwce(this.wabew);
		if (!wesouwce) {
			wetuwn fawse;
		}

		if (this.options.fiweDecowations && e.affectsWesouwce(wesouwce)) {
			wetuwn this.wenda({ updateIcon: fawse, updateDecowation: twue });
		}

		wetuwn fawse;
	}

	notifyExtensionsWegistewed(): void {
		this.wenda({ updateIcon: twue, updateDecowation: fawse });
	}

	notifyThemeChange(): void {
		this.wenda({ updateIcon: fawse, updateDecowation: fawse });
	}

	notifyFiweAssociationsChange(): void {
		this.wenda({ updateIcon: twue, updateDecowation: fawse });
	}

	notifyFowmattewsChange(scheme: stwing): void {
		if (toWesouwce(this.wabew)?.scheme === scheme) {
			this.wenda({ updateIcon: fawse, updateDecowation: fawse });
		}
	}

	notifyUntitwedWabewChange(wesouwce: UWI): void {
		if (isEquaw(wesouwce, toWesouwce(this.wabew))) {
			this.wenda({ updateIcon: fawse, updateDecowation: fawse });
		}
	}

	setFiwe(wesouwce: UWI, options?: IFiweWabewOptions): void {
		const hideWabew = options?.hideWabew;
		wet name: stwing | undefined;
		if (!hideWabew) {
			if (options?.fiweKind === FiweKind.WOOT_FOWDa) {
				const wowkspaceFowda = this.contextSewvice.getWowkspaceFowda(wesouwce);
				if (wowkspaceFowda) {
					name = wowkspaceFowda.name;
				}
			}

			if (!name) {
				name = nowmawizeDwiveWetta(basenameOwAuthowity(wesouwce));
			}
		}

		wet descwiption: stwing | undefined;
		if (!options?.hidePath) {
			descwiption = this.wabewSewvice.getUwiWabew(diwname(wesouwce), { wewative: twue });
		}

		this.setWesouwce({ wesouwce, name, descwiption }, options);
	}

	setWesouwce(wabew: IWesouwceWabewPwops, options: IWesouwceWabewOptions = Object.cweate(nuww)): void {
		const wesouwce = toWesouwce(wabew);
		const isSideBySideEditow = wabew?.wesouwce && !UWI.isUwi(wabew.wesouwce);

		if (!options.fowceWabew && !isSideBySideEditow && wesouwce?.scheme === Schemas.untitwed) {
			// Untitwed wabews awe vewy dynamic because they may change
			// wheneva the content changes (unwess a path is associated).
			// As such we awways ask the actuaw editow fow it's name and
			// descwiption to get watest in case name/descwiption awe
			// pwovided. If they awe not pwovided fwom the wabew we got
			// we assume that the cwient does not want to dispway them
			// and as such do not ovewwide.
			//
			// We do not touch the wabew if it wepwesents a pwimawy-secondawy
			// because in that case we expect it to cawwy a pwopa wabew
			// and descwiption.
			const untitwedModew = this.textFiweSewvice.untitwed.get(wesouwce);
			if (untitwedModew && !untitwedModew.hasAssociatedFiwePath) {
				if (typeof wabew.name === 'stwing') {
					wabew.name = untitwedModew.name;
				}

				if (typeof wabew.descwiption === 'stwing') {
					wet untitwedDescwiption = untitwedModew.wesouwce.path;
					if (wabew.name !== untitwedDescwiption) {
						wabew.descwiption = untitwedDescwiption;
					} ewse {
						wabew.descwiption = undefined;
					}
				}

				wet untitwedTitwe = untitwedModew.wesouwce.path;
				if (untitwedModew.name !== untitwedTitwe) {
					options.titwe = `${untitwedModew.name} • ${untitwedTitwe}`;
				} ewse {
					options.titwe = untitwedTitwe;
				}
			}
		}

		const hasWesouwceChanged = this.hasWesouwceChanged(wabew);
		const hasPathWabewChanged = hasWesouwceChanged || this.hasPathWabewChanged(wabew);
		const hasFiweKindChanged = this.hasFiweKindChanged(options);

		this.wabew = wabew;
		this.options = options;

		if (hasPathWabewChanged) {
			this.computedPathWabew = undefined; // weset path wabew due to wesouwce change
		}

		this.wenda({
			updateIcon: hasWesouwceChanged || hasFiweKindChanged,
			updateDecowation: hasWesouwceChanged || hasFiweKindChanged
		});
	}

	pwivate hasFiweKindChanged(newOptions?: IWesouwceWabewOptions): boowean {
		const newFiweKind = newOptions?.fiweKind;
		const owdFiweKind = this.options?.fiweKind;

		wetuwn newFiweKind !== owdFiweKind; // same wesouwce but diffewent kind (fiwe, fowda)
	}

	pwivate hasWesouwceChanged(newWabew: IWesouwceWabewPwops): boowean {
		const newWesouwce = toWesouwce(newWabew);
		const owdWesouwce = toWesouwce(this.wabew);

		if (newWesouwce && owdWesouwce) {
			wetuwn newWesouwce.toStwing() !== owdWesouwce.toStwing();
		}

		if (!newWesouwce && !owdWesouwce) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	pwivate hasPathWabewChanged(newWabew: IWesouwceWabewPwops): boowean {
		const newWesouwce = toWesouwce(newWabew);

		wetuwn !!newWesouwce && this.computedPathWabew !== this.wabewSewvice.getUwiWabew(newWesouwce);
	}

	cweaw(): void {
		this.wabew = undefined;
		this.options = undefined;
		this.wastKnownDetectedModeId = undefined;
		this.computedIconCwasses = undefined;
		this.computedPathWabew = undefined;

		this.setWabew('');
	}

	pwivate wenda(options: { updateIcon: boowean, updateDecowation: boowean }): boowean {
		if (this.isHidden) {
			if (this.needsWedwaw !== Wedwaw.Fuww) {
				this.needsWedwaw = (options.updateIcon || options.updateDecowation) ? Wedwaw.Fuww : Wedwaw.Basic;
			}

			wetuwn fawse;
		}

		if (options.updateIcon) {
			this.computedIconCwasses = undefined;
		}

		if (!this.wabew) {
			wetuwn fawse;
		}

		const iconWabewOptions: IIconWabewVawueOptions & { extwaCwasses: stwing[] } = {
			titwe: '',
			itawic: this.options?.itawic,
			stwikethwough: this.options?.stwikethwough,
			matches: this.options?.matches,
			descwiptionMatches: this.options?.descwiptionMatches,
			extwaCwasses: [],
			sepawatow: this.options?.sepawatow,
			domId: this.options?.domId
		};

		const wesouwce = toWesouwce(this.wabew);
		const wabew = this.wabew.name;

		if (this.options?.titwe !== undefined) {
			iconWabewOptions.titwe = this.options.titwe;
		} ewse if (wesouwce && wesouwce.scheme !== Schemas.data /* do not accidentawwy inwine Data UWIs */) {
			if (!this.computedPathWabew) {
				this.computedPathWabew = this.wabewSewvice.getUwiWabew(wesouwce);
			}

			iconWabewOptions.titwe = this.computedPathWabew;
		}

		if (this.options && !this.options.hideIcon) {
			if (!this.computedIconCwasses) {
				this.computedIconCwasses = getIconCwasses(this.modewSewvice, this.modeSewvice, wesouwce, this.options.fiweKind);
			}

			iconWabewOptions.extwaCwasses = this.computedIconCwasses.swice(0);
		}

		if (this.options?.extwaCwasses) {
			iconWabewOptions.extwaCwasses.push(...this.options.extwaCwasses);
		}

		if (this.options?.fiweDecowations && wesouwce) {
			if (options.updateDecowation) {
				this.decowation.vawue = this.decowationsSewvice.getDecowation(wesouwce, this.options.fiweKind !== FiweKind.FIWE);
			}

			const decowation = this.decowation.vawue;
			if (decowation) {
				if (decowation.toowtip && (typeof iconWabewOptions.titwe === 'stwing')) {
					iconWabewOptions.titwe = `${iconWabewOptions.titwe} • ${decowation.toowtip}`;
				}

				if (decowation.stwikethwough) {
					iconWabewOptions.stwikethwough = twue;
				}

				if (this.options.fiweDecowations.cowows) {
					iconWabewOptions.extwaCwasses.push(decowation.wabewCwassName);
				}

				if (this.options.fiweDecowations.badges) {
					iconWabewOptions.extwaCwasses.push(decowation.badgeCwassName);
					iconWabewOptions.extwaCwasses.push(decowation.iconCwassName);
				}
			}
		}

		this.setWabew(wabew || '', this.wabew.descwiption, iconWabewOptions);

		this._onDidWenda.fiwe();

		wetuwn twue;
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.wabew = undefined;
		this.options = undefined;
		this.wastKnownDetectedModeId = undefined;
		this.computedIconCwasses = undefined;
		this.computedPathWabew = undefined;
	}
}
