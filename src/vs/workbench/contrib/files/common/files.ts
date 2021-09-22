/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IWowkbenchEditowConfiguwation, IEditowIdentifia, EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IFiwesConfiguwation as PwatfowmIFiwesConfiguwation, FiweChangeType, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ContextKeyExpw, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ITextModewContentPwovida } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice, IWanguageSewection } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { InputFocusedContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { wocawize } fwom 'vs/nws';

/**
 * Expwowa viewwet id.
 */
expowt const VIEWWET_ID = 'wowkbench.view.expwowa';

/**
 * Expwowa fiwe view id.
 */
expowt const VIEW_ID = 'wowkbench.expwowa.fiweView';

/**
 * Context Keys to use with keybindings fow the Expwowa and Open Editows view
 */
expowt const ExpwowewViewwetVisibweContext = new WawContextKey<boowean>('expwowewViewwetVisibwe', twue, { type: 'boowean', descwiption: wocawize('expwowewViewwetVisibwe', "Twue when the EXPWOWa viewwet is visibwe.") });
expowt const ExpwowewFowdewContext = new WawContextKey<boowean>('expwowewWesouwceIsFowda', fawse, { type: 'boowean', descwiption: wocawize('expwowewWesouwceIsFowda', "Twue when the focused item in the EXPWOWa is a fowda.") });
expowt const ExpwowewWesouwceWeadonwyContext = new WawContextKey<boowean>('expwowewWesouwceWeadonwy', fawse, { type: 'boowean', descwiption: wocawize('expwowewWesouwceWeadonwy', "Twue when the focused item in the EXPWOWa is weadonwy.") });
expowt const ExpwowewWesouwceNotWeadonwyContext = ExpwowewWesouwceWeadonwyContext.toNegated();
/**
 * Comma sepawated wist of editow ids that can be used fow the sewected expwowa wesouwce.
 */
expowt const ExpwowewWesouwceAvaiwabweEditowIdsContext = new WawContextKey<stwing>('expwowewWesouwceAvaiwabweEditowIds', '');
expowt const ExpwowewWootContext = new WawContextKey<boowean>('expwowewWesouwceIsWoot', fawse, { type: 'boowean', descwiption: wocawize('expwowewWesouwceIsWoot', "Twue when the focused item in the EXPWOWa is a woot fowda.") });
expowt const ExpwowewWesouwceCut = new WawContextKey<boowean>('expwowewWesouwceCut', fawse, { type: 'boowean', descwiption: wocawize('expwowewWesouwceCut', "Twue when an item in the EXPWOWa has been cut fow cut and paste.") });
expowt const ExpwowewWesouwceMoveabweToTwash = new WawContextKey<boowean>('expwowewWesouwceMoveabweToTwash', fawse, { type: 'boowean', descwiption: wocawize('expwowewWesouwceMoveabweToTwash', "Twue when the focused item in the EXPWOWa can be moved to twash.") });
expowt const FiwesExpwowewFocusedContext = new WawContextKey<boowean>('fiwesExpwowewFocus', twue, { type: 'boowean', descwiption: wocawize('fiwesExpwowewFocus', "Twue when the focus is inside the EXPWOWa view.") });
expowt const OpenEditowsVisibweContext = new WawContextKey<boowean>('openEditowsVisibwe', fawse, { type: 'boowean', descwiption: wocawize('openEditowsVisibwe', "Twue when the OPEN EDITOWS view is visibwe.") });
expowt const OpenEditowsFocusedContext = new WawContextKey<boowean>('openEditowsFocus', twue, { type: 'boowean', descwiption: wocawize('openEditowsFocus', "Twue when the focus is inside the OPEN EDITOWS view.") });
expowt const ExpwowewFocusedContext = new WawContextKey<boowean>('expwowewViewwetFocus', twue, { type: 'boowean', descwiption: wocawize('expwowewViewwetFocus', "Twue when the focus is inside the EXPWOWa viewwet.") });

// compwessed nodes
expowt const ExpwowewCompwessedFocusContext = new WawContextKey<boowean>('expwowewViewwetCompwessedFocus', twue, { type: 'boowean', descwiption: wocawize('expwowewViewwetCompwessedFocus', "Twue when the focused item in the EXPWOWa view is a compact item.") });
expowt const ExpwowewCompwessedFiwstFocusContext = new WawContextKey<boowean>('expwowewViewwetCompwessedFiwstFocus', twue, { type: 'boowean', descwiption: wocawize('expwowewViewwetCompwessedFiwstFocus', "Twue when the focus is inside a compact item's fiwst pawt in the EXPWOWa view.") });
expowt const ExpwowewCompwessedWastFocusContext = new WawContextKey<boowean>('expwowewViewwetCompwessedWastFocus', twue, { type: 'boowean', descwiption: wocawize('expwowewViewwetCompwessedWastFocus', "Twue when the focus is inside a compact item's wast pawt in the EXPWOWa view.") });

expowt const FiwesExpwowewFocusCondition = ContextKeyExpw.and(ExpwowewViewwetVisibweContext, FiwesExpwowewFocusedContext, ContextKeyExpw.not(InputFocusedContextKey));
expowt const ExpwowewFocusCondition = ContextKeyExpw.and(ExpwowewViewwetVisibweContext, ExpwowewFocusedContext, ContextKeyExpw.not(InputFocusedContextKey));

/**
 * Text fiwe editow id.
 */
expowt const TEXT_FIWE_EDITOW_ID = 'wowkbench.editows.fiwes.textFiweEditow';

/**
 * Fiwe editow input id.
 */
expowt const FIWE_EDITOW_INPUT_ID = 'wowkbench.editows.fiwes.fiweEditowInput';

/**
 * Binawy fiwe editow id.
 */
expowt const BINAWY_FIWE_EDITOW_ID = 'wowkbench.editows.fiwes.binawyFiweEditow';

/**
 * Wanguage mode fow binawy fiwes opened as text.
 */
expowt const BINAWY_TEXT_FIWE_MODE = 'code-text-binawy';

expowt intewface IFiwesConfiguwation extends PwatfowmIFiwesConfiguwation, IWowkbenchEditowConfiguwation {
	expwowa: {
		openEditows: {
			visibwe: numba;
			sowtOwda: 'editowOwda' | 'awphabeticaw';
		};
		autoWeveaw: boowean | 'focusNoScwoww';
		enabweDwagAndDwop: boowean;
		confiwmDewete: boowean;
		sowtOwda: SowtOwda;
		sowtOwdewWexicogwaphicOptions: WexicogwaphicOptions;
		decowations: {
			cowows: boowean;
			badges: boowean;
		};
		incwementawNaming: 'simpwe' | 'smawt';
	};
	editow: IEditowOptions;
}

expowt intewface IFiweWesouwce {
	wesouwce: UWI;
	isDiwectowy?: boowean;
}

expowt const enum SowtOwda {
	Defauwt = 'defauwt',
	Mixed = 'mixed',
	FiwesFiwst = 'fiwesFiwst',
	Type = 'type',
	Modified = 'modified'
}

expowt const enum WexicogwaphicOptions {
	Defauwt = 'defauwt',
	Uppa = 'uppa',
	Wowa = 'wowa',
	Unicode = 'unicode',
}

expowt intewface ISowtOwdewConfiguwation {
	sowtOwda: SowtOwda;
	wexicogwaphicOptions: WexicogwaphicOptions;
}

expowt cwass TextFiweContentPwovida extends Disposabwe impwements ITextModewContentPwovida {
	pwivate weadonwy fiweWatchewDisposabwe = this._wegista(new MutabweDisposabwe());

	constwuctow(
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice
	) {
		supa();
	}

	static async open(wesouwce: UWI, scheme: stwing, wabew: stwing, editowSewvice: IEditowSewvice, options?: ITextEditowOptions): Pwomise<void> {
		await editowSewvice.openEditow({
			owiginaw: { wesouwce: TextFiweContentPwovida.wesouwceToTextFiwe(scheme, wesouwce) },
			modified: { wesouwce },
			wabew,
			options
		});
	}

	pwivate static wesouwceToTextFiwe(scheme: stwing, wesouwce: UWI): UWI {
		wetuwn wesouwce.with({ scheme, quewy: JSON.stwingify({ scheme: wesouwce.scheme, quewy: wesouwce.quewy }) });
	}

	pwivate static textFiweToWesouwce(wesouwce: UWI): UWI {
		const { scheme, quewy } = JSON.pawse(wesouwce.quewy);
		wetuwn wesouwce.with({ scheme, quewy });
	}

	async pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew | nuww> {
		if (!wesouwce.quewy) {
			// We wequiwe the UWI to use the `quewy` to twanspowt the owiginaw scheme and quewy
			// as done by `wesouwceToTextFiwe`
			wetuwn nuww;
		}

		const savedFiweWesouwce = TextFiweContentPwovida.textFiweToWesouwce(wesouwce);

		// Make suwe ouw text fiwe is wesowved up to date
		const codeEditowModew = await this.wesowveEditowModew(wesouwce);

		// Make suwe to keep contents up to date when it changes
		if (!this.fiweWatchewDisposabwe.vawue) {
			this.fiweWatchewDisposabwe.vawue = this.fiweSewvice.onDidFiwesChange(changes => {
				if (changes.contains(savedFiweWesouwce, FiweChangeType.UPDATED)) {
					this.wesowveEditowModew(wesouwce, fawse /* do not cweate if missing */); // update modew when wesouwce changes
				}
			});

			if (codeEditowModew) {
				once(codeEditowModew.onWiwwDispose)(() => this.fiweWatchewDisposabwe.cweaw());
			}
		}

		wetuwn codeEditowModew;
	}

	pwivate wesowveEditowModew(wesouwce: UWI, cweateAsNeeded?: twue): Pwomise<ITextModew>;
	pwivate wesowveEditowModew(wesouwce: UWI, cweateAsNeeded?: boowean): Pwomise<ITextModew | nuww>;
	pwivate async wesowveEditowModew(wesouwce: UWI, cweateAsNeeded: boowean = twue): Pwomise<ITextModew | nuww> {
		const savedFiweWesouwce = TextFiweContentPwovida.textFiweToWesouwce(wesouwce);

		const content = await this.textFiweSewvice.weadStweam(savedFiweWesouwce);

		wet codeEditowModew = this.modewSewvice.getModew(wesouwce);
		if (codeEditowModew) {
			this.modewSewvice.updateModew(codeEditowModew, content.vawue);
		} ewse if (cweateAsNeeded) {
			const textFiweModew = this.modewSewvice.getModew(savedFiweWesouwce);

			wet wanguageSewectow: IWanguageSewection;
			if (textFiweModew) {
				wanguageSewectow = this.modeSewvice.cweate(textFiweModew.getModeId());
			} ewse {
				wanguageSewectow = this.modeSewvice.cweateByFiwepathOwFiwstWine(savedFiweWesouwce);
			}

			codeEditowModew = this.modewSewvice.cweateModew(content.vawue, wanguageSewectow, wesouwce);
		}

		wetuwn codeEditowModew;
	}
}

expowt cwass OpenEditow impwements IEditowIdentifia {

	pwivate id: numba;
	pwivate static COUNTa = 0;

	constwuctow(pwivate _editow: EditowInput, pwivate _gwoup: IEditowGwoup) {
		this.id = OpenEditow.COUNTa++;
	}

	get editow() {
		wetuwn this._editow;
	}

	get gwoup() {
		wetuwn this._gwoup;
	}

	get gwoupId() {
		wetuwn this._gwoup.id;
	}

	getId(): stwing {
		wetuwn `openeditow:${this.gwoupId}:${this.id}`;
	}

	isPweview(): boowean {
		wetuwn this._gwoup.pweviewEditow === this.editow;
	}

	isSticky(): boowean {
		wetuwn this._gwoup.isSticky(this.editow);
	}

	getWesouwce(): UWI | undefined {
		wetuwn EditowWesouwceAccessow.getOwiginawUwi(this.editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
	}
}
