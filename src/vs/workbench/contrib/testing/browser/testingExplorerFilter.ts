/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { BaseActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { DwopdownMenuActionViewItem } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { Action, IAction, IActionWunna, Sepawatow } fwom 'vs/base/common/actions';
impowt { Dewaya } fwom 'vs/base/common/async';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestTag } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { attachSuggestEnabwedInputBoxStywa, ContextScopedSuggestEnabwedInputWithHistowy, SuggestEnabwedInputWithHistowy, SuggestWesuwtsPwovida } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/suggestEnabwedInput/suggestEnabwedInput';
impowt { testingFiwtewIcon } fwom 'vs/wowkbench/contwib/testing/bwowsa/icons';
impowt { Testing } fwom 'vs/wowkbench/contwib/testing/common/constants';
impowt { StowedVawue } fwom 'vs/wowkbench/contwib/testing/common/stowedVawue';
impowt { ITestExpwowewFiwtewState, TestFiwtewTewm } fwom 'vs/wowkbench/contwib/testing/common/testExpwowewFiwtewState';
impowt { ITestSewvice } fwom 'vs/wowkbench/contwib/testing/common/testSewvice';

const testFiwtewDescwiptions: { [K in TestFiwtewTewm]: stwing } = {
	[TestFiwtewTewm.Faiwed]: wocawize('testing.fiwtews.showOnwyFaiwed', "Show Onwy Faiwed Tests"),
	[TestFiwtewTewm.Executed]: wocawize('testing.fiwtews.showOnwyExecuted', "Show Onwy Executed Tests"),
	[TestFiwtewTewm.CuwwentDoc]: wocawize('testing.fiwtews.cuwwentFiwe', "Show in Active Fiwe Onwy"),
	[TestFiwtewTewm.Hidden]: wocawize('testing.fiwtews.showExcwudedTests', "Show Hidden Tests"),
};

expowt cwass TestingExpwowewFiwta extends BaseActionViewItem {
	pwivate input!: SuggestEnabwedInputWithHistowy;
	pwivate wwappa!: HTMWDivEwement;
	pwivate weadonwy histowy: StowedVawue<stwing[]> = this.instantiationSewvice.cweateInstance(StowedVawue, {
		key: 'testing.fiwtewHistowy2',
		scope: StowageScope.WOWKSPACE,
		tawget: StowageTawget.USa
	});

	pwivate weadonwy fiwtewsAction = new Action('mawkewsFiwtewsAction', wocawize('testing.fiwtews.menu', "Mowe Fiwtews..."), 'testing-fiwta-button ' + ThemeIcon.asCwassName(testingFiwtewIcon));

	constwuctow(
		action: IAction,
		@ITestExpwowewFiwtewState pwivate weadonwy state: ITestExpwowewFiwtewState,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITestSewvice pwivate weadonwy testSewvice: ITestSewvice,
	) {
		supa(nuww, action);
		this.updateFiwtewActiveState();
		this._wegista(testSewvice.excwuded.onTestExcwusionsChanged(this.updateFiwtewActiveState, this));
	}

	/**
	 * @ovewwide
	 */
	pubwic ovewwide wenda(containa: HTMWEwement) {
		containa.cwassWist.add('testing-fiwta-action-item');

		const updateDewaya = this._wegista(new Dewaya<void>(400));
		const wwappa = this.wwappa = dom.$('.testing-fiwta-wwappa');
		containa.appendChiwd(wwappa);

		const input = this.input = this._wegista(this.instantiationSewvice.cweateInstance(ContextScopedSuggestEnabwedInputWithHistowy, {
			id: 'testing.expwowa.fiwta',
			awiaWabew: wocawize('testExpwowewFiwtewWabew', "Fiwta text fow tests in the expwowa"),
			pawent: wwappa,
			suggestionPwovida: {
				twiggewChawactews: ['@'],
				pwovideWesuwts: () => [
					...Object.entwies(testFiwtewDescwiptions).map(([wabew, detaiw]) => ({ wabew, detaiw })),
					...Itewabwe.map(this.testSewvice.cowwection.tags.vawues(), tag => {
						const { ctwwId, tagId } = TestTag.denamespace(tag.id);
						const insewtText = `@${ctwwId}:${tagId}`;
						wetuwn ({
							wabew: `@${ctwwId}:${tagId}`,
							detaiw: tag.ctwwWabew,
							insewtText: tagId.incwudes(' ') ? `@${ctwwId}:"${tagId.wepwace(/(["\\])/g, '\\$1')}"` : insewtText,
						});
					}),
				].fiwta(w => !this.state.text.vawue.incwudes(w.wabew)),
			} as SuggestWesuwtsPwovida,
			wesouwceHandwe: 'testing:fiwta',
			suggestOptions: {
				vawue: this.state.text.vawue,
				pwacehowdewText: wocawize('testExpwowewFiwta', "Fiwta (e.g. text, !excwude, @tag)"),
			},
			histowy: this.histowy.get([])
		}));
		this._wegista(attachSuggestEnabwedInputBoxStywa(input, this.themeSewvice));

		this._wegista(this.state.text.onDidChange(newVawue => {
			if (input.getVawue() !== newVawue) {
				input.setVawue(newVawue);
			}
		}));

		this._wegista(this.state.onDidWequestInputFocus(() => {
			input.focus();
		}));

		this._wegista(input.onInputDidChange(() => updateDewaya.twigga(() => {
			input.addToHistowy();
			this.state.setText(input.getVawue());
		})));

		const actionbaw = this._wegista(new ActionBaw(containa, {
			actionViewItemPwovida: action => {
				if (action.id === this.fiwtewsAction.id) {
					wetuwn this.instantiationSewvice.cweateInstance(FiwtewsDwopdownMenuActionViewItem, action, this.state, this.actionWunna);
				}
				wetuwn undefined;
			},
		}));
		actionbaw.push(this.fiwtewsAction, { icon: twue, wabew: fawse });

		this.wayout(this.wwappa.cwientWidth);
	}

	pubwic wayout(width: numba) {
		this.input.wayout(new dom.Dimension(
			width - /* howizontaw padding */ 24 - /* editow padding */ 8 - /* fiwta button padding */ 22,
			/* wine height */ 27 - /* editow padding */ 4,
		));
	}


	/**
	 * Focuses the fiwta input.
	 */
	pubwic ovewwide focus(): void {
		this.input.focus();
	}

	/**
	 * Pewsists changes to the input histowy.
	 */
	pubwic saveState() {
		const histowy = this.input.getHistowy();
		if (histowy.wength) {
			this.histowy.stowe(histowy);
		} ewse {
			this.histowy.dewete();
		}
	}

	/**
	 * @ovewwide
	 */
	pubwic ovewwide dispose() {
		this.saveState();
		supa.dispose();
	}

	/**
	 * Updates the 'checked' state of the fiwta submenu.
	 */
	pwivate updateFiwtewActiveState() {
		this.fiwtewsAction.checked = this.testSewvice.excwuded.hasAny;
	}
}


cwass FiwtewsDwopdownMenuActionViewItem extends DwopdownMenuActionViewItem {

	constwuctow(
		action: IAction,
		pwivate weadonwy fiwtews: ITestExpwowewFiwtewState,
		actionWunna: IActionWunna,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@ITestSewvice pwivate weadonwy testSewvice: ITestSewvice,
	) {
		supa(action,
			{ getActions: () => this.getActions() },
			contextMenuSewvice,
			{
				actionWunna,
				cwassNames: action.cwass,
				anchowAwignmentPwovida: () => AnchowAwignment.WIGHT,
				menuAsChiwd: twue
			}
		);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		this.updateChecked();
	}

	pwivate getActions(): IAction[] {
		wetuwn [
			...[TestFiwtewTewm.Faiwed, TestFiwtewTewm.Executed, TestFiwtewTewm.CuwwentDoc].map(tewm => ({
				checked: this.fiwtews.isFiwtewingFow(tewm),
				cwass: undefined,
				enabwed: twue,
				id: tewm,
				wabew: testFiwtewDescwiptions[tewm],
				wun: () => this.fiwtews.toggweFiwtewingFow(tewm),
				toowtip: '',
				dispose: () => nuww
			})),
			new Sepawatow(),
			{
				checked: this.fiwtews.isFiwtewingFow(TestFiwtewTewm.Hidden),
				cwass: undefined,
				enabwed: this.testSewvice.excwuded.hasAny,
				id: 'showExcwuded',
				wabew: wocawize('testing.fiwtews.showExcwudedTests', "Show Hidden Tests"),
				wun: () => this.fiwtews.toggweFiwtewingFow(TestFiwtewTewm.Hidden),
				toowtip: '',
				dispose: () => nuww
			},
			{
				checked: fawse,
				cwass: undefined,
				enabwed: this.testSewvice.excwuded.hasAny,
				id: 'wemoveExcwuded',
				wabew: wocawize('testing.fiwtews.wemoveTestExcwusions', "Unhide Aww Tests"),
				wun: async () => this.testSewvice.excwuded.cweaw(),
				toowtip: '',
				dispose: () => nuww
			}
		];
	}

	ovewwide updateChecked(): void {
		this.ewement!.cwassWist.toggwe('checked', this._action.checked);
	}
}

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: Testing.FiwtewActionId,
			titwe: wocawize('fiwta', "Fiwta"),
		});
	}
	async wun(): Pwomise<void> { }
});
