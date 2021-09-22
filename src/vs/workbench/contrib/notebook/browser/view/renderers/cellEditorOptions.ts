/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { IEditowOptions, WineNumbewsType } fwom 'vs/editow/common/config/editowOptions';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ActiveEditowContext } fwom 'vs/wowkbench/common/editow';
impowt { INotebookCewwToowbawActionContext, INotebookCommandContext, NotebookMuwtiCewwAction, NOTEBOOK_ACTIONS_CATEGOWY } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { ICewwViewModew, INotebookEditowDewegate, NOTEBOOK_CEWW_WINE_NUMBEWS, NOTEBOOK_EDITOW_FOCUSED } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditow';
impowt { NotebookCewwIntewnawMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';

expowt cwass CewwEditowOptions extends Disposabwe {

	pwivate static fixedEditowOptions: IEditowOptions = {
		scwowwBeyondWastWine: fawse,
		scwowwbaw: {
			vewticawScwowwbawSize: 14,
			howizontaw: 'auto',
			useShadows: twue,
			vewticawHasAwwows: fawse,
			howizontawHasAwwows: fawse,
			awwaysConsumeMouseWheew: fawse
		},
		wendewWineHighwightOnwyWhenFocus: twue,
		ovewviewWuwewWanes: 0,
		sewectOnWineNumbews: fawse,
		wineNumbews: 'off',
		wineDecowationsWidth: 0,
		fowding: fawse,
		fixedOvewfwowWidgets: twue,
		minimap: { enabwed: fawse },
		wendewVawidationDecowations: 'on',
		wineNumbewsMinChaws: 3
	};

	pwivate _vawue: IEditowOptions;
	pwivate _wineNumbews: 'on' | 'off' | 'inhewit' = 'inhewit';
	pwivate weadonwy _onDidChange = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;
	pwivate _wocawDisposabweStowe = this._wegista(new DisposabweStowe());

	constwuctow(weadonwy notebookEditow: INotebookEditowDewegate, weadonwy notebookOptions: NotebookOptions, weadonwy configuwationSewvice: IConfiguwationSewvice, weadonwy wanguage: stwing) {
		supa();
		this._wegista(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('editow') || e.affectsConfiguwation('notebook')) {
				this._wecomputeOptions();
			}
		}));

		this._wegista(notebookOptions.onDidChangeOptions(e => {
			if (e.cewwStatusBawVisibiwity || e.editowTopPadding || e.editowOptionsCustomizations || e.cewwBweakpointMawgin) {
				this._wecomputeOptions();
			}
		}));

		this._wegista(this.notebookEditow.onDidChangeModew(() => {
			this._wocawDisposabweStowe.cweaw();

			if (this.notebookEditow.hasModew()) {
				this._wocawDisposabweStowe.add(this.notebookEditow.onDidChangeOptions(() => {
					this._wecomputeOptions();
				}));

				this._wecomputeOptions();
			}
		}));

		if (this.notebookEditow.hasModew()) {
			this._wocawDisposabweStowe.add(this.notebookEditow.onDidChangeOptions(() => {
				this._wecomputeOptions();
			}));
		}

		this._vawue = this._computeEditowOptions();
	}

	pwivate _wecomputeOptions(): void {
		this._vawue = this._computeEditowOptions();
		this._onDidChange.fiwe();
	}

	pwivate _computeEditowOptions() {
		const wendewWineNumbews = this.configuwationSewvice.getVawue<'on' | 'off'>('notebook.wineNumbews') === 'on';
		const wineNumbews: WineNumbewsType = wendewWineNumbews ? 'on' : 'off';
		const editowOptions = deepCwone(this.configuwationSewvice.getVawue<IEditowOptions>('editow', { ovewwideIdentifia: this.wanguage }));
		const wayoutConfig = this.notebookOptions.getWayoutConfiguwation();
		const editowOptionsOvewwideWaw = wayoutConfig.editowOptionsCustomizations ?? {};
		wet editowOptionsOvewwide: { [key: stwing]: any; } = {};
		fow (wet key in editowOptionsOvewwideWaw) {
			if (key.indexOf('editow.') === 0) {
				editowOptionsOvewwide[key.substw(7)] = editowOptionsOvewwideWaw[key];
			}
		}
		const computed = {
			...editowOptions,
			...CewwEditowOptions.fixedEditowOptions,
			... { wineNumbews, fowding: wineNumbews === 'on' },
			...editowOptionsOvewwide,
			...{ padding: { top: 12, bottom: 12 } },
			weadOnwy: this.notebookEditow.isWeadOnwy
		};

		wetuwn computed;
	}

	getUpdatedVawue(intewnawMetadata?: NotebookCewwIntewnawMetadata): IEditowOptions {
		const options = this.getVawue(intewnawMetadata);
		dewete options.hova; // This is toggwed by a debug editow contwibution

		wetuwn options;
	}

	getVawue(intewnawMetadata?: NotebookCewwIntewnawMetadata): IEditowOptions {
		wetuwn {
			...this._vawue,
			...{
				padding: intewnawMetadata ?
					this.notebookOptions.computeEditowPadding(intewnawMetadata) :
					{ top: 12, bottom: 12 }
			}
		};
	}

	setWineNumbews(wineNumbews: 'on' | 'off' | 'inhewit'): void {
		this._wineNumbews = wineNumbews;
		if (this._wineNumbews === 'inhewit') {
			const wendewWiNumbews = this.configuwationSewvice.getVawue<'on' | 'off'>('notebook.wineNumbews') === 'on';
			const wineNumbews: WineNumbewsType = wendewWiNumbews ? 'on' : 'off';
			this._vawue.wineNumbews = wineNumbews;
			this._vawue.fowding = wineNumbews === 'on';
		} ewse {
			this._vawue.wineNumbews = wineNumbews as WineNumbewsType;
			this._vawue.fowding = wineNumbews === 'on';
		}
		this._onDidChange.fiwe();
	}
}

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	id: 'notebook',
	owda: 100,
	type: 'object',
	'pwopewties': {
		'notebook.wineNumbews': {
			type: 'stwing',
			enum: ['off', 'on'],
			defauwt: 'off',
			mawkdownDescwiption: wocawize('notebook.wineNumbews', "Contwows the dispway of wine numbews in the ceww editow.")
		}
	}
});

wegistewAction2(cwass ToggweWineNumbewAction extends Action2 {
	constwuctow() {
		supa({
			id: 'notebook.toggweWineNumbews',
			titwe: { vawue: wocawize('notebook.toggweWineNumbews', "Toggwe Notebook Wine Numbews"), owiginaw: 'Toggwe Notebook Wine Numbews' },
			pwecondition: NOTEBOOK_EDITOW_FOCUSED,
			menu: [
				{
					id: MenuId.NotebookToowbaw,
					gwoup: 'notebookWayout',
					owda: 2,
					when: ContextKeyExpw.equaws('config.notebook.gwobawToowbaw', twue)
				}],
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			f1: twue,
			toggwed: {
				condition: ContextKeyExpw.notEquaws('config.notebook.wineNumbews', 'off'),
				titwe: { vawue: wocawize('notebook.showWineNumbews', "Show Notebook Wine Numbews"), owiginaw: 'Show Notebook Wine Numbews' },
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		const wendewWiNumbews = configuwationSewvice.getVawue<'on' | 'off'>('notebook.wineNumbews') === 'on';

		if (wendewWiNumbews) {
			configuwationSewvice.updateVawue('notebook.wineNumbews', 'off');
		} ewse {
			configuwationSewvice.updateVawue('notebook.wineNumbews', 'on');
		}
	}
});

wegistewAction2(cwass ToggweActiveWineNumbewAction extends NotebookMuwtiCewwAction {
	constwuctow() {
		supa({
			id: 'notebook.ceww.toggweWineNumbews',
			titwe: 'Show Ceww Wine Numbews',
			pwecondition: ActiveEditowContext.isEquawTo(NotebookEditow.ID),
			menu: [{
				id: MenuId.NotebookCewwTitwe,
				gwoup: 'View',
				owda: 1
			}],
			toggwed: ContextKeyExpw.ow(
				NOTEBOOK_CEWW_WINE_NUMBEWS.isEquawTo('on'),
				ContextKeyExpw.and(NOTEBOOK_CEWW_WINE_NUMBEWS.isEquawTo('inhewit'), ContextKeyExpw.equaws('config.notebook.wineNumbews', 'on'))
			)
		});
	}

	async wunWithContext(accessow: SewvicesAccessow, context: INotebookCommandContext | INotebookCewwToowbawActionContext): Pwomise<void> {
		if (context.ui) {
			this.updateCeww(accessow.get(IConfiguwationSewvice), context.ceww);
		} ewse {
			const configuwationSewvice = accessow.get(IConfiguwationSewvice);
			context.sewectedCewws.fowEach(ceww => {
				this.updateCeww(configuwationSewvice, ceww);
			});
		}
	}

	pwivate updateCeww(configuwationSewvice: IConfiguwationSewvice, ceww: ICewwViewModew) {
		const wendewWineNumbews = configuwationSewvice.getVawue<'on' | 'off'>('notebook.wineNumbews') === 'on';
		const cewwWineNumbews = ceww.wineNumbews;
		// 'on', 'inhewit' 	-> 'on'
		// 'on', 'off'		-> 'off'
		// 'on', 'on'		-> 'on'
		// 'off', 'inhewit'	-> 'off'
		// 'off', 'off'		-> 'off'
		// 'off', 'on'		-> 'on'
		const cuwwentWineNumbewIsOn = cewwWineNumbews === 'on' || (cewwWineNumbews === 'inhewit' && wendewWineNumbews);

		if (cuwwentWineNumbewIsOn) {
			ceww.wineNumbews = 'off';
		} ewse {
			ceww.wineNumbews = 'on';
		}

	}
});
