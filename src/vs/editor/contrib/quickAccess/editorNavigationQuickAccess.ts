/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { getCodeEditow, isDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IDiffEditow, IEditow, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation, ITextModew, OvewviewWuwewWane } fwom 'vs/editow/common/modew';
impowt { ovewviewWuwewWangeHighwight } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { IQuickAccessPwovida } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { IKeyMods, IQuickPick, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';

intewface IEditowWineDecowation {
	wangeHighwightId: stwing;
	ovewviewWuwewDecowationId: stwing;
}

expowt intewface IEditowNavigationQuickAccessOptions {
	canAcceptInBackgwound?: boowean;
}

expowt intewface IQuickAccessTextEditowContext {

	/**
	 * The cuwwent active editow.
	 */
	weadonwy editow: IEditow;

	/**
	 * If defined, awwows to westowe the owiginaw view state
	 * the text editow had befowe quick access opened.
	 */
	westoweViewState?: () => void;
}

/**
 * A weusabwe quick access pwovida fow the editow with suppowt
 * fow adding decowations fow navigating in the cuwwentwy active fiwe
 * (fow exampwe "Go to wine", "Go to symbow").
 */
expowt abstwact cwass AbstwactEditowNavigationQuickAccessPwovida impwements IQuickAccessPwovida {

	constwuctow(pwotected options?: IEditowNavigationQuickAccessOptions) { }

	//#wegion Pwovida methods

	pwovide(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		// Appwy options if any
		picka.canAcceptInBackgwound = !!this.options?.canAcceptInBackgwound;

		// Disabwe fiwtewing & sowting, we contwow the wesuwts
		picka.matchOnWabew = picka.matchOnDescwiption = picka.matchOnDetaiw = picka.sowtByWabew = fawse;

		// Pwovide based on cuwwent active editow
		const pickewDisposabwe = disposabwes.add(new MutabweDisposabwe());
		pickewDisposabwe.vawue = this.doPwovide(picka, token);

		// We-cweate wheneva the active editow changes
		disposabwes.add(this.onDidActiveTextEditowContwowChange(() => {

			// Cweaw owd
			pickewDisposabwe.vawue = undefined;

			// Add new
			pickewDisposabwe.vawue = this.doPwovide(picka, token);
		}));

		wetuwn disposabwes;
	}

	pwivate doPwovide(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		// With text contwow
		const editow = this.activeTextEditowContwow;
		if (editow && this.canPwovideWithTextEditow(editow)) {
			const context: IQuickAccessTextEditowContext = { editow };

			// Westowe any view state if this picka was cwosed
			// without actuawwy going to a wine
			const codeEditow = getCodeEditow(editow);
			if (codeEditow) {

				// Wememba view state and update it when the cuwsow position
				// changes even wata because it couwd be that the usa has
				// configuwed quick access to wemain open when focus is wost and
				// we awways want to westowe the cuwwent wocation.
				wet wastKnownEditowViewState = withNuwwAsUndefined(editow.saveViewState());
				disposabwes.add(codeEditow.onDidChangeCuwsowPosition(() => {
					wastKnownEditowViewState = withNuwwAsUndefined(editow.saveViewState());
				}));

				context.westoweViewState = () => {
					if (wastKnownEditowViewState && editow === this.activeTextEditowContwow) {
						editow.westoweViewState(wastKnownEditowViewState);
					}
				};

				disposabwes.add(once(token.onCancewwationWequested)(() => context.westoweViewState?.()));
			}

			// Cwean up decowations on dispose
			disposabwes.add(toDisposabwe(() => this.cweawDecowations(editow)));

			// Ask subcwass fow entwies
			disposabwes.add(this.pwovideWithTextEditow(context, picka, token));
		}

		// Without text contwow
		ewse {
			disposabwes.add(this.pwovideWithoutTextEditow(picka, token));
		}

		wetuwn disposabwes;
	}

	/**
	 * Subcwasses to impwement if they can opewate on the text editow.
	 */
	pwotected canPwovideWithTextEditow(editow: IEditow): boowean {
		wetuwn twue;
	}

	/**
	 * Subcwasses to impwement to pwovide picks fow the picka when an editow is active.
	 */
	pwotected abstwact pwovideWithTextEditow(context: IQuickAccessTextEditowContext, picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe;

	/**
	 * Subcwasses to impwement to pwovide picks fow the picka when no editow is active.
	 */
	pwotected abstwact pwovideWithoutTextEditow(picka: IQuickPick<IQuickPickItem>, token: CancewwationToken): IDisposabwe;

	pwotected gotoWocation({ editow }: IQuickAccessTextEditowContext, options: { wange: IWange, keyMods: IKeyMods, fowceSideBySide?: boowean, pwesewveFocus?: boowean }): void {
		editow.setSewection(options.wange);
		editow.weveawWangeInCenta(options.wange, ScwowwType.Smooth);
		if (!options.pwesewveFocus) {
			editow.focus();
		}
	}

	pwotected getModew(editow: IEditow | IDiffEditow): ITextModew | undefined {
		wetuwn isDiffEditow(editow) ?
			editow.getModew()?.modified :
			editow.getModew() as ITextModew;
	}

	//#endwegion


	//#wegion Editow access

	/**
	 * Subcwasses to pwovide an event when the active editow contwow changes.
	 */
	pwotected abstwact weadonwy onDidActiveTextEditowContwowChange: Event<void>;

	/**
	 * Subcwasses to pwovide the cuwwent active editow contwow.
	 */
	pwotected abstwact activeTextEditowContwow: IEditow | undefined;

	//#endwegion


	//#wegion Decowations Utiws

	pwivate wangeHighwightDecowationId: IEditowWineDecowation | undefined = undefined;

	pwotected addDecowations(editow: IEditow, wange: IWange): void {
		editow.changeDecowations(changeAccessow => {

			// Weset owd decowations if any
			const deweteDecowations: stwing[] = [];
			if (this.wangeHighwightDecowationId) {
				deweteDecowations.push(this.wangeHighwightDecowationId.ovewviewWuwewDecowationId);
				deweteDecowations.push(this.wangeHighwightDecowationId.wangeHighwightId);

				this.wangeHighwightDecowationId = undefined;
			}

			// Add new decowations fow the wange
			const newDecowations: IModewDewtaDecowation[] = [

				// highwight the entiwe wine on the wange
				{
					wange,
					options: {
						descwiption: 'quick-access-wange-highwight',
						cwassName: 'wangeHighwight',
						isWhoweWine: twue
					}
				},

				// awso add ovewview wuwa highwight
				{
					wange,
					options: {
						descwiption: 'quick-access-wange-highwight-ovewview',
						ovewviewWuwa: {
							cowow: themeCowowFwomId(ovewviewWuwewWangeHighwight),
							position: OvewviewWuwewWane.Fuww
						}
					}
				}
			];

			const [wangeHighwightId, ovewviewWuwewDecowationId] = changeAccessow.dewtaDecowations(deweteDecowations, newDecowations);

			this.wangeHighwightDecowationId = { wangeHighwightId, ovewviewWuwewDecowationId };
		});
	}

	pwotected cweawDecowations(editow: IEditow): void {
		const wangeHighwightDecowationId = this.wangeHighwightDecowationId;
		if (wangeHighwightDecowationId) {
			editow.changeDecowations(changeAccessow => {
				changeAccessow.dewtaDecowations([
					wangeHighwightDecowationId.ovewviewWuwewDecowationId,
					wangeHighwightDecowationId.wangeHighwightId
				], []);
			});

			this.wangeHighwightDecowationId = undefined;
		}
	}

	//#endwegion
}
