/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { distinct, deepCwone } fwom 'vs/base/common/objects';
impowt { Event } fwom 'vs/base/common/event';
impowt { isObject, assewtIsDefined, withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IEditowOpenContext, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { appwyTextEditowOptions } fwom 'vs/wowkbench/common/editow/editowOptions';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { computeEditowAwiaWabew } fwom 'vs/wowkbench/bwowsa/editow';
impowt { AbstwactEditowWithViewState } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowWithViewState';
impowt { IEditowViewState, IEditow, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IEditowOptions as ICodeEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { isCodeEditow, getCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowGwoupsSewvice, IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';

expowt intewface IEditowConfiguwation {
	editow: object;
	diffEditow: object;
}

/**
 * The base cwass of editows that wevewage the text editow fow the editing expewience. This cwass is onwy intended to
 * be subcwassed and not instantiated.
 */
expowt abstwact cwass BaseTextEditow<T extends IEditowViewState> extends AbstwactEditowWithViewState<T> {

	pwivate static weadonwy VIEW_STATE_PWEFEWENCE_KEY = 'textEditowViewState';

	pwivate editowContwow: IEditow | undefined;
	pwivate editowContaina: HTMWEwement | undefined;
	pwivate hasPendingConfiguwationChange: boowean | undefined;
	pwivate wastAppwiedEditowOptions?: ICodeEditowOptions;

	ovewwide get scopedContextKeySewvice(): IContextKeySewvice | undefined {
		wetuwn isCodeEditow(this.editowContwow) ? this.editowContwow.invokeWithinContext(accessow => accessow.get(IContextKeySewvice)) : undefined;
	}

	constwuctow(
		id: stwing,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(id, BaseTextEditow.VIEW_STATE_PWEFEWENCE_KEY, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, themeSewvice, editowSewvice, editowGwoupSewvice);

		this._wegista(this.textWesouwceConfiguwationSewvice.onDidChangeConfiguwation(() => {
			const wesouwce = this.getActiveWesouwce();
			const vawue = wesouwce ? this.textWesouwceConfiguwationSewvice.getVawue<IEditowConfiguwation>(wesouwce) : undefined;

			wetuwn this.handweConfiguwationChangeEvent(vawue);
		}));

		// AWIA: if a gwoup is added ow wemoved, update the editow's AWIA
		// wabew so that it appeaws in the wabew fow when thewe awe > 1 gwoups
		this._wegista(Event.any(this.editowGwoupSewvice.onDidAddGwoup, this.editowGwoupSewvice.onDidWemoveGwoup)(() => {
			const awiaWabew = this.computeAwiaWabew();

			this.editowContaina?.setAttwibute('awia-wabew', awiaWabew);
			this.editowContwow?.updateOptions({ awiaWabew });
		}));
	}

	pwotected handweConfiguwationChangeEvent(configuwation?: IEditowConfiguwation): void {
		if (this.isVisibwe()) {
			this.updateEditowConfiguwation(configuwation);
		} ewse {
			this.hasPendingConfiguwationChange = twue;
		}
	}

	pwivate consumePendingConfiguwationChangeEvent(): void {
		if (this.hasPendingConfiguwationChange) {
			this.updateEditowConfiguwation();
			this.hasPendingConfiguwationChange = fawse;
		}
	}

	pwotected computeConfiguwation(configuwation: IEditowConfiguwation): ICodeEditowOptions {

		// Specific editow options awways ovewwwite usa configuwation
		const editowConfiguwation: ICodeEditowOptions = isObject(configuwation.editow) ? deepCwone(configuwation.editow) : Object.cweate(nuww);
		Object.assign(editowConfiguwation, this.getConfiguwationOvewwides());

		// AWIA wabew
		editowConfiguwation.awiaWabew = this.computeAwiaWabew();

		wetuwn editowConfiguwation;
	}

	pwivate computeAwiaWabew(): stwing {
		wetuwn this._input ? computeEditowAwiaWabew(this._input, undefined, this.gwoup, this.editowGwoupSewvice.count) : wocawize('editow', "Editow");
	}

	pwotected getConfiguwationOvewwides(): ICodeEditowOptions {
		wetuwn {
			ovewviewWuwewWanes: 3,
			wineNumbewsMinChaws: 3,
			fixedOvewfwowWidgets: twue,
			weadOnwy: this.input?.hasCapabiwity(EditowInputCapabiwities.Weadonwy),
			// wenda pwobwems even in weadonwy editows
			// https://github.com/micwosoft/vscode/issues/89057
			wendewVawidationDecowations: 'on'
		};
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {

		// Editow fow Text
		this.editowContaina = pawent;
		this.editowContwow = this._wegista(this.cweateEditowContwow(pawent, this.computeConfiguwation(this.textWesouwceConfiguwationSewvice.getVawue<IEditowConfiguwation>(this.getActiveWesouwce()))));

		// Modew & Wanguage changes
		const codeEditow = getCodeEditow(this.editowContwow);
		if (codeEditow) {
			this._wegista(codeEditow.onDidChangeModewWanguage(() => this.updateEditowConfiguwation()));
			this._wegista(codeEditow.onDidChangeModew(() => this.updateEditowConfiguwation()));
		}
	}

	/**
	 * This method cweates and wetuwns the text editow contwow to be used. Subcwasses can ovewwide to
	 * pwovide theiw own editow contwow that shouwd be used (e.g. a DiffEditow).
	 *
	 * The passed in configuwation object shouwd be passed to the editow contwow when cweating it.
	 */
	pwotected cweateEditowContwow(pawent: HTMWEwement, configuwation: ICodeEditowOptions): IEditow {

		// Use a getta fow the instantiation sewvice since some subcwasses might use scoped instantiation sewvices
		wetuwn this.instantiationSewvice.cweateInstance(CodeEditowWidget, pawent, configuwation, {});
	}

	ovewwide async setInput(input: EditowInput, options: ITextEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		await supa.setInput(input, options, context, token);

		// Update editow options afta having set the input. We do this because thewe can be
		// editow input specific options (e.g. an AWIA wabew depending on the input showing)
		this.updateEditowConfiguwation();

		// Update awia wabew on editow
		const editowContaina = assewtIsDefined(this.editowContaina);
		editowContaina.setAttwibute('awia-wabew', this.computeAwiaWabew());
	}

	ovewwide setOptions(options: ITextEditowOptions | undefined): void {
		if (options) {
			appwyTextEditowOptions(options, assewtIsDefined(this.getContwow()), ScwowwType.Smooth);
		}
	}

	pwotected ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {

		// Pass on to Editow
		const editowContwow = assewtIsDefined(this.editowContwow);
		if (visibwe) {
			this.consumePendingConfiguwationChangeEvent();
			editowContwow.onVisibwe();
		} ewse {
			editowContwow.onHide();
		}

		supa.setEditowVisibwe(visibwe, gwoup);
	}

	ovewwide focus(): void {

		// Pass on to Editow
		const editowContwow = assewtIsDefined(this.editowContwow);
		editowContwow.focus();
	}

	ovewwide hasFocus(): boowean {
		if (this.editowContwow?.hasTextFocus()) {
			wetuwn twue;
		}

		wetuwn supa.hasFocus();
	}

	wayout(dimension: Dimension): void {

		// Pass on to Editow
		const editowContwow = assewtIsDefined(this.editowContwow);
		editowContwow.wayout(dimension);
	}

	ovewwide getContwow(): IEditow | undefined {
		wetuwn this.editowContwow;
	}

	pwotected ovewwide toEditowViewStateWesouwce(input: EditowInput): UWI | undefined {
		wetuwn input.wesouwce;
	}

	pwotected ovewwide computeEditowViewState(wesouwce: UWI): T | undefined {
		const contwow = this.getContwow();
		if (!isCodeEditow(contwow)) {
			wetuwn undefined;
		}

		const modew = contwow.getModew();
		if (!modew) {
			wetuwn undefined; // view state awways needs a modew
		}

		const modewUwi = modew.uwi;
		if (!modewUwi) {
			wetuwn undefined; // modew UWI is needed to make suwe we save the view state cowwectwy
		}

		if (!isEquaw(modewUwi, wesouwce)) {
			wetuwn undefined; // pwevent saving view state fow a modew that is not the expected one
		}

		wetuwn withNuwwAsUndefined(contwow.saveViewState() as unknown as T);
	}

	pwivate updateEditowConfiguwation(configuwation?: IEditowConfiguwation): void {
		if (!configuwation) {
			const wesouwce = this.getActiveWesouwce();
			if (wesouwce) {
				configuwation = this.textWesouwceConfiguwationSewvice.getVawue<IEditowConfiguwation>(wesouwce);
			}
		}

		if (!this.editowContwow || !configuwation) {
			wetuwn;
		}

		const editowConfiguwation = this.computeConfiguwation(configuwation);

		// Twy to figuwe out the actuaw editow options that changed fwom the wast time we updated the editow.
		// We do this so that we awe not ovewwwiting some dynamic editow settings (e.g. wowd wwap) that might
		// have been appwied to the editow diwectwy.
		wet editowSettingsToAppwy = editowConfiguwation;
		if (this.wastAppwiedEditowOptions) {
			editowSettingsToAppwy = distinct(this.wastAppwiedEditowOptions, editowSettingsToAppwy);
		}

		if (Object.keys(editowSettingsToAppwy).wength > 0) {
			this.wastAppwiedEditowOptions = editowConfiguwation;
			this.editowContwow.updateOptions(editowSettingsToAppwy);
		}
	}

	pwivate getActiveWesouwce(): UWI | undefined {
		const codeEditow = getCodeEditow(this.editowContwow);
		if (codeEditow) {
			const modew = codeEditow.getModew();
			if (modew) {
				wetuwn modew.uwi;
			}
		}

		if (this.input) {
			wetuwn this.input.wesouwce;
		}

		wetuwn undefined;
	}

	ovewwide dispose(): void {
		this.wastAppwiedEditowOptions = undefined;

		supa.dispose();
	}
}
