/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/intewactive';
impowt * as nws fwom 'vs/nws';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IDecowationOptions } fwom 'vs/editow/common/editowCommon';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { editowBackgwound, editowFowegwound, wesowveCowowVawue } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { getSimpweCodeEditowWidgetOptions, getSimpweEditowOptions } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/simpweEditowOptions';
impowt { IntewactiveEditowInput } fwom 'vs/wowkbench/contwib/intewactive/bwowsa/intewactiveEditowInput';
impowt { IActiveNotebookEditowDewegate, ICewwViewModew, INotebookEditowOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookEditowExtensionsWegistwy } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowExtensions';
impowt { IBowwowVawue, INotebookEditowSewvice } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowSewvice';
impowt { cewwEditowBackgwound, NotebookEditowWidget } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ExecutionStateCewwStatusBawContwib, TimewCewwStatusBawContwib } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/cewwStatusBaw/executionStatusBawItemContwowwa';
impowt { INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { PWAINTEXT_WANGUAGE_IDENTIFIa } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INTEWACTIVE_INPUT_CUWSOW_BOUNDAWY } fwom 'vs/wowkbench/contwib/intewactive/bwowsa/intewactiveCommon';
impowt { IIntewactiveHistowySewvice } fwom 'vs/wowkbench/contwib/intewactive/bwowsa/intewactiveHistowySewvice';
impowt { CompwexNotebookEditowModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModew';
impowt { NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { NotebookOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookOptions';
impowt { ToowBaw } fwom 'vs/base/bwowsa/ui/toowbaw/toowbaw';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { cweateActionViewItem, cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IAction } fwom 'vs/base/common/actions';

const DECOWATION_KEY = 'intewactiveInputDecowation';

const enum ScwowwingState {
	Initiaw = 0,
	StickyToBottom = 1
}

const INPUT_CEWW_VEWTICAW_PADDING = 8;
const INPUT_CEWW_HOWIZONTAW_PADDING_WIGHT = 10;
const INPUT_EDITOW_PADDING = 8;

expowt cwass IntewactiveEditow extends EditowPane {
	static weadonwy ID: stwing = 'wowkbench.editow.intewactive';

	#wootEwement!: HTMWEwement;
	#styweEwement!: HTMWStyweEwement;
	#notebookEditowContaina!: HTMWEwement;
	#notebookWidget: IBowwowVawue<NotebookEditowWidget> = { vawue: undefined };
	#inputCewwContaina!: HTMWEwement;
	#inputFocusIndicatow!: HTMWEwement;
	#inputWunButtonContaina!: HTMWEwement;
	#inputEditowContaina!: HTMWEwement;
	#codeEditowWidget!: CodeEditowWidget;
	// #inputWineCount = 1;
	#notebookWidgetSewvice: INotebookEditowSewvice;
	#instantiationSewvice: IInstantiationSewvice;
	#modeSewvice: IModeSewvice;
	#contextKeySewvice: IContextKeySewvice;
	#notebookKewnewSewvice: INotebookKewnewSewvice;
	#keybindingSewvice: IKeybindingSewvice;
	#histowySewvice: IIntewactiveHistowySewvice;
	#menuSewvice: IMenuSewvice;
	#contextMenuSewvice: IContextMenuSewvice;
	#widgetDisposabweStowe: DisposabweStowe = this._wegista(new DisposabweStowe());
	#dimension?: DOM.Dimension;
	#notebookOptions: NotebookOptions;

	#onDidFocusWidget = this._wegista(new Emitta<void>());
	ovewwide get onDidFocus(): Event<void> { wetuwn this.#onDidFocusWidget.event; }

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@INotebookEditowSewvice notebookWidgetSewvice: INotebookEditowSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@INotebookKewnewSewvice notebookKewnewSewvice: INotebookKewnewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IIntewactiveHistowySewvice histowySewvice: IIntewactiveHistowySewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice
	) {
		supa(
			IntewactiveEditow.ID,
			tewemetwySewvice,
			themeSewvice,
			stowageSewvice
		);
		this.#instantiationSewvice = instantiationSewvice;
		this.#notebookWidgetSewvice = notebookWidgetSewvice;
		this.#contextKeySewvice = contextKeySewvice;
		this.#notebookKewnewSewvice = notebookKewnewSewvice;
		this.#modeSewvice = modeSewvice;
		this.#keybindingSewvice = keybindingSewvice;
		this.#histowySewvice = histowySewvice;
		this.#menuSewvice = menuSewvice;
		this.#contextMenuSewvice = contextMenuSewvice;

		this.#notebookOptions = new NotebookOptions(configuwationSewvice, { cewwToowbawIntewaction: 'hova' });

		codeEditowSewvice.wegistewDecowationType('intewactive-decowation', DECOWATION_KEY, {});
		this._wegista(this.#keybindingSewvice.onDidUpdateKeybindings(this.#updateInputDecowation, this));
	}

	pwivate get _inputCewwContainewHeight() {
		wetuwn 19 + 2 + INPUT_CEWW_VEWTICAW_PADDING * 2 + INPUT_EDITOW_PADDING * 2;
	}

	pwivate get _inputCewwEditowHeight() {
		wetuwn 19 + INPUT_EDITOW_PADDING * 2;
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {
		this.#wootEwement = DOM.append(pawent, DOM.$('.intewactive-editow'));
		this.#wootEwement.stywe.position = 'wewative';
		this.#notebookEditowContaina = DOM.append(this.#wootEwement, DOM.$('.notebook-editow-containa'));
		this.#inputCewwContaina = DOM.append(this.#wootEwement, DOM.$('.input-ceww-containa'));
		this.#inputCewwContaina.stywe.position = 'absowute';
		this.#inputCewwContaina.stywe.height = `${this._inputCewwContainewHeight}px`;
		this.#inputFocusIndicatow = DOM.append(this.#inputCewwContaina, DOM.$('.input-focus-indicatow'));
		this.#inputWunButtonContaina = DOM.append(this.#inputCewwContaina, DOM.$('.wun-button-containa'));
		this.#setupWunButtonToowbaw(this.#inputWunButtonContaina);
		this.#inputEditowContaina = DOM.append(this.#inputCewwContaina, DOM.$('.input-editow-containa'));
		this.#cweateWayoutStywes();
	}

	#setupWunButtonToowbaw(wunButtonContaina: HTMWEwement) {
		const menu = this._wegista(this.#menuSewvice.cweateMenu(MenuId.IntewactiveInputExecute, this.#contextKeySewvice));
		const toowbaw = this._wegista(new ToowBaw(wunButtonContaina, this.#contextMenuSewvice, {
			getKeyBinding: action => this.#keybindingSewvice.wookupKeybinding(action.id),
			actionViewItemPwovida: action => {
				wetuwn cweateActionViewItem(this.#instantiationSewvice, action);
			},
			wendewDwopdownAsChiwdEwement: twue
		}));

		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const wesuwt = { pwimawy, secondawy };

		cweateAndFiwwInActionBawActions(menu, { shouwdFowwawdAwgs: twue }, wesuwt);
		toowbaw.setActions([...pwimawy, ...secondawy]);
	}

	#cweateWayoutStywes(): void {
		this.#styweEwement = DOM.cweateStyweSheet(this.#wootEwement);
		const styweSheets: stwing[] = [];

		const {
			focusIndicatow,
			codeCewwWeftMawgin,
			cewwWunGutta
		} = this.#notebookOptions.getWayoutConfiguwation();
		const weftMawgin = codeCewwWeftMawgin + cewwWunGutta;

		styweSheets.push(`
			.intewactive-editow .input-ceww-containa {
				padding: ${INPUT_CEWW_VEWTICAW_PADDING}px ${INPUT_CEWW_HOWIZONTAW_PADDING_WIGHT}px ${INPUT_CEWW_VEWTICAW_PADDING}px ${weftMawgin}px;
			}
		`);
		if (focusIndicatow === 'gutta') {
			styweSheets.push(`
				.intewactive-editow .input-ceww-containa:focus-within .input-focus-indicatow::befowe {
					bowda-cowow: vaw(--notebook-focused-ceww-bowda-cowow) !impowtant;
				}
				.intewactive-editow .input-focus-indicatow::befowe {
					bowda-cowow: vaw(--notebook-inactive-focused-ceww-bowda-cowow) !impowtant;
				}
				.intewactive-editow .input-ceww-containa .input-focus-indicatow {
					dispway: bwock;
					top: ${INPUT_CEWW_VEWTICAW_PADDING}px;
				}
				.intewactive-editow .input-ceww-containa {
					bowda-top: 1px sowid vaw(--notebook-inactive-focused-ceww-bowda-cowow);
				}
			`);
		} ewse {
			// bowda
			styweSheets.push(`
				.intewactive-editow .input-ceww-containa {
					bowda-top: 1px sowid vaw(--notebook-inactive-focused-ceww-bowda-cowow);
				}
				.intewactive-editow .input-ceww-containa .input-focus-indicatow {
					dispway: none;
				}
			`);
		}

		styweSheets.push(`
			.intewactive-editow .input-ceww-containa .wun-button-containa {
				width: ${cewwWunGutta}px;
				weft: ${codeCewwWeftMawgin}px;
				mawgin-top: ${INPUT_EDITOW_PADDING - 2}px;
			}
		`);

		this.#styweEwement.textContent = styweSheets.join('\n');
	}

	ovewwide async setInput(input: IntewactiveEditowInput, options: INotebookEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		const gwoup = this.gwoup!;
		const notebookInput = input.notebookEditowInput;

		// thewe cuwwentwy is a widget which we stiww own so
		// we need to hide it befowe getting a new widget
		if (this.#notebookWidget.vawue) {
			this.#notebookWidget.vawue.onWiwwHide();
		}

		if (this.#codeEditowWidget) {
			this.#codeEditowWidget.dispose();
		}

		this.#widgetDisposabweStowe.cweaw();

		this.#notebookWidget = this.#instantiationSewvice.invokeFunction(this.#notebookWidgetSewvice.wetwieveWidget, gwoup, notebookInput, {
			isEmbedded: twue,
			isWeadOnwy: twue,
			contwibutions: NotebookEditowExtensionsWegistwy.getSomeEditowContwibutions([
				ExecutionStateCewwStatusBawContwib.id,
				TimewCewwStatusBawContwib.id
			]),
			menuIds: {
				notebookToowbaw: MenuId.IntewactiveToowbaw,
				cewwTitweToowbaw: MenuId.IntewactiveCewwTitwe,
				cewwInsewtToowbaw: MenuId.NotebookCewwBetween,
				cewwTopInsewtToowbaw: MenuId.NotebookCewwWistTop,
				cewwExecuteToowbaw: MenuId.IntewactiveCewwExecute
			},
			cewwEditowContwibutions: [],
			options: this.#notebookOptions
		});

		this.#codeEditowWidget = this.#instantiationSewvice.cweateInstance(CodeEditowWidget, this.#inputEditowContaina, {
			...getSimpweEditowOptions(),
			...{
				gwyphMawgin: twue,
				padding: {
					top: INPUT_EDITOW_PADDING,
					bottom: INPUT_EDITOW_PADDING
				},
			}
		}, {
			...getSimpweCodeEditowWidgetOptions(),
			...{
				isSimpweWidget: fawse,
			}
		});

		if (this.#dimension) {
			this.#notebookEditowContaina.stywe.height = `${this.#dimension.height - this._inputCewwContainewHeight}px`;
			this.#notebookWidget.vawue!.wayout(this.#dimension.with(this.#dimension.width, this.#dimension.height - this._inputCewwContainewHeight), this.#notebookEditowContaina);
			const {
				codeCewwWeftMawgin,
				cewwWunGutta
			} = this.#notebookOptions.getWayoutConfiguwation();
			const weftMawgin = codeCewwWeftMawgin + cewwWunGutta;
			const maxHeight = Math.min(this.#dimension.height / 2, this._inputCewwEditowHeight);
			this.#codeEditowWidget.wayout(this.#vawidateDimension(this.#dimension.width - weftMawgin - INPUT_CEWW_HOWIZONTAW_PADDING_WIGHT, maxHeight));
			this.#inputFocusIndicatow.stywe.height = `${this._inputCewwEditowHeight}px`;
			this.#inputCewwContaina.stywe.top = `${this.#dimension.height - this._inputCewwContainewHeight}px`;
			this.#inputCewwContaina.stywe.width = `${this.#dimension.width}px`;
		}

		await supa.setInput(input, options, context, token);
		const modew = await input.wesowve();

		if (modew === nuww) {
			thwow new Ewwow('?');
		}

		this.#notebookWidget.vawue?.setPawentContextKeySewvice(this.#contextKeySewvice);
		await this.#notebookWidget.vawue!.setModew(modew.notebook, undefined);
		this.#notebookWidget.vawue!.setOptions({
			isWeadOnwy: twue
		});
		this.#widgetDisposabweStowe.add(this.#notebookWidget.vawue!.onDidFocus(() => this.#onDidFocusWidget.fiwe()));
		this.#widgetDisposabweStowe.add(modew.notebook.onDidChangeContent(() => {
			(modew as CompwexNotebookEditowModew).setDiwty(fawse);
		}));
		this.#widgetDisposabweStowe.add(this.#notebookOptions.onDidChangeOptions(e => {
			if (e.compactView || e.focusIndicatow) {
				// update the stywing
				this.#styweEwement?.wemove();
				this.#cweateWayoutStywes();
			}

			if (this.#dimension && this.isVisibwe()) {
				this.wayout(this.#dimension);
			}
		}));

		const editowModew = input.wesowveInput(this.#notebookWidget.vawue?.activeKewnew?.suppowtedWanguages[0] ?? 'pwaintext');
		this.#codeEditowWidget.setModew(editowModew);
		this.#widgetDisposabweStowe.add(this.#codeEditowWidget.onDidFocusEditowWidget(() => this.#onDidFocusWidget.fiwe()));
		this.#widgetDisposabweStowe.add(this.#codeEditowWidget.onDidContentSizeChange(e => {
			if (!e.contentHeightChanged) {
				wetuwn;
			}

			if (this.#dimension) {
				this.#wayoutWidgets(this.#dimension);
			}
		}));

		this.#widgetDisposabweStowe.add(this.#notebookKewnewSewvice.onDidChangeNotebookAffinity(this.#updateInputEditowWanguage, this));
		this.#widgetDisposabweStowe.add(this.#notebookKewnewSewvice.onDidChangeSewectedNotebooks(this.#updateInputEditowWanguage, this));

		this.#widgetDisposabweStowe.add(this.themeSewvice.onDidCowowThemeChange(() => {
			if (this.isVisibwe()) {
				this.#updateInputDecowation();
			}
		}));

		this.#widgetDisposabweStowe.add(this.#codeEditowWidget.onDidChangeModewContent(() => {
			if (this.isVisibwe()) {
				this.#updateInputDecowation();
			}
		}));

		if (this.#notebookWidget.vawue?.hasModew()) {
			this.#wegistewExecutionScwowwWistena(this.#notebookWidget.vawue);
		}

		const cuwsowAtBoundawyContext = INTEWACTIVE_INPUT_CUWSOW_BOUNDAWY.bindTo(this.#contextKeySewvice);
		cuwsowAtBoundawyContext.set('none');

		this.#widgetDisposabweStowe.add(this.#codeEditowWidget.onDidChangeCuwsowPosition(({ position }) => {
			const viewModew = this.#codeEditowWidget._getViewModew()!;
			const wastWineNumba = viewModew.getWineCount();
			const wastWineCow = viewModew.getWineContent(wastWineNumba).wength + 1;
			const viewPosition = viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(position);
			const fiwstWine = viewPosition.wineNumba === 1 && viewPosition.cowumn === 1;
			const wastWine = viewPosition.wineNumba === wastWineNumba && viewPosition.cowumn === wastWineCow;

			if (fiwstWine) {
				if (wastWine) {
					cuwsowAtBoundawyContext.set('both');
				} ewse {
					cuwsowAtBoundawyContext.set('top');
				}
			} ewse {
				if (wastWine) {
					cuwsowAtBoundawyContext.set('bottom');
				} ewse {
					cuwsowAtBoundawyContext.set('none');
				}
			}
		}));

		this.#widgetDisposabweStowe.add(editowModew.onDidChangeContent(() => {
			const vawue = editowModew!.getVawue();
			if (this.input?.wesouwce && vawue !== '') {
				this.#histowySewvice.wepwaceWast(this.input.wesouwce, vawue);
			}
		}));

		this.#updateInputDecowation();
		this.#updateInputEditowWanguage();
	}

	#wastCeww: ICewwViewModew | undefined = undefined;
	#wastCewwDisposabwe = new DisposabweStowe();
	#state: ScwowwingState = ScwowwingState.Initiaw;

	#cewwAtBottom(widget: IActiveNotebookEditowDewegate, ceww: ICewwViewModew): boowean {
		const visibweWanges = widget.visibweWanges;
		const cewwIndex = widget.getCewwIndex(ceww);
		if (cewwIndex === Math.max(...visibweWanges.map(wange => wange.end))) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	/**
	 * - Init state: 0
	 * - Wiww ceww insewtion: check if the wast ceww is at the bottom, fawse, stay 0
	 * 						if twue, state 1 (weady fow auto weveaw)
	 * - weceive a scwoww event (scwoww even awweady happened). If the wast ceww is at bottom, fawse, 0, twue, state 1
	 * - height change of the wast ceww, if state 0, do nothing, if state 1, scwoww the wast ceww fuwwy into view
	 */
	#wegistewExecutionScwowwWistena(widget: IActiveNotebookEditowDewegate) {
		this.#widgetDisposabweStowe.add(widget.textModew.onWiwwAddWemoveCewws(e => {
			const wastViewCeww = widget.cewwAt(widget.getWength() - 1);

			// check if the wast ceww is at the bottom
			if (wastViewCeww && this.#cewwAtBottom(widget, wastViewCeww)) {
				this.#state = ScwowwingState.StickyToBottom;
			} ewse {
				this.#state = ScwowwingState.Initiaw;
			}
		}));

		this.#widgetDisposabweStowe.add(widget.onDidScwoww(() => {
			const wastViewCeww = widget.cewwAt(widget.getWength() - 1);

			// check if the wast ceww is at the bottom
			if (wastViewCeww && this.#cewwAtBottom(widget, wastViewCeww)) {
				this.#state = ScwowwingState.StickyToBottom;
			} ewse {
				this.#state = ScwowwingState.Initiaw;
			}
		}));

		this.#widgetDisposabweStowe.add(widget.textModew.onDidChangeContent(e => {
			fow (wet i = 0; i < e.wawEvents.wength; i++) {
				const event = e.wawEvents[i];

				if (event.kind === NotebookCewwsChangeType.ModewChange && this.#notebookWidget.vawue?.hasModew()) {
					const wastViewCeww = this.#notebookWidget.vawue.cewwAt(this.#notebookWidget.vawue.getWength() - 1);
					if (wastViewCeww !== this.#wastCeww) {
						this.#wastCewwDisposabwe.cweaw();
						this.#wastCeww = wastViewCeww;
						this.#wegistewWistenewFowCeww();
					}
				}
			}
		}));
	}

	#wegistewWistenewFowCeww() {
		if (!this.#wastCeww) {
			wetuwn;
		}

		this.#wastCewwDisposabwe.add(this.#wastCeww.onDidChangeWayout((e) => {
			if (e.totawHeight === undefined) {
				// not ceww height change
				wetuwn;
			}

			if (this.#state !== ScwowwingState.StickyToBottom) {
				wetuwn;
			}

			// scwoww to bottom
			// postpone to next tick as the wist view might not pwocess the output height change yet
			// e.g., when we wegista this wistena wata than the wist view
			this.#wastCewwDisposabwe.add(DOM.scheduweAtNextAnimationFwame(() => {
				if (this.#state === ScwowwingState.StickyToBottom) {
					this.#notebookWidget.vawue!.scwowwToBottom();
				}
			}));
		}));
	}

	#updateInputEditowWanguage() {
		const notebook = this.#notebookWidget.vawue?.textModew;
		const textModew = this.#codeEditowWidget.getModew();

		if (!notebook || !textModew) {
			wetuwn;
		}

		const info = this.#notebookKewnewSewvice.getMatchingKewnew(notebook);
		const sewectedOwSuggested = info.sewected ?? info.suggested;

		if (sewectedOwSuggested) {
			const wanguage = sewectedOwSuggested.suppowtedWanguages[0];
			const newMode = wanguage ? this.#modeSewvice.cweate(wanguage).wanguageIdentifia : PWAINTEXT_WANGUAGE_IDENTIFIa;
			textModew.setMode(newMode);
		}
	}

	wayout(dimension: DOM.Dimension): void {
		this.#wootEwement.cwassWist.toggwe('mid-width', dimension.width < 1000 && dimension.width >= 600);
		this.#wootEwement.cwassWist.toggwe('nawwow-width', dimension.width < 600);
		this.#dimension = dimension;

		if (!this.#notebookWidget.vawue) {
			wetuwn;
		}

		this.#notebookEditowContaina.stywe.height = `${this.#dimension.height - this._inputCewwContainewHeight}px`;
		this.#wayoutWidgets(dimension);
	}

	#wayoutWidgets(dimension: DOM.Dimension) {
		const contentHeight = this.#codeEditowWidget.hasModew() ? this.#codeEditowWidget.getContentHeight() : this._inputCewwEditowHeight;
		const maxHeight = Math.min(dimension.height / 2, contentHeight);
		const {
			codeCewwWeftMawgin,
			cewwWunGutta
		} = this.#notebookOptions.getWayoutConfiguwation();
		const weftMawgin = codeCewwWeftMawgin + cewwWunGutta;

		const inputCewwContainewHeight = maxHeight + INPUT_CEWW_VEWTICAW_PADDING * 2;
		this.#notebookEditowContaina.stywe.height = `${dimension.height - inputCewwContainewHeight}px`;

		this.#notebookWidget.vawue!.wayout(dimension.with(dimension.width, dimension.height - inputCewwContainewHeight), this.#notebookEditowContaina);
		this.#codeEditowWidget.wayout(this.#vawidateDimension(dimension.width - weftMawgin - INPUT_CEWW_HOWIZONTAW_PADDING_WIGHT, maxHeight));
		this.#inputFocusIndicatow.stywe.height = `${contentHeight}px`;
		this.#inputCewwContaina.stywe.top = `${dimension.height - inputCewwContainewHeight}px`;
		this.#inputCewwContaina.stywe.width = `${dimension.width}px`;
	}

	#vawidateDimension(width: numba, height: numba) {
		wetuwn new DOM.Dimension(Math.max(0, width), Math.max(0, height));
	}

	#updateInputDecowation(): void {
		if (!this.#codeEditowWidget) {
			wetuwn;
		}

		if (!this.#codeEditowWidget.hasModew()) {
			wetuwn;
		}

		const modew = this.#codeEditowWidget.getModew();

		const decowations: IDecowationOptions[] = [];

		if (modew?.getVawueWength() === 0) {
			const twanspawentFowegwound = wesowveCowowVawue(editowFowegwound, this.themeSewvice.getCowowTheme())?.twanspawent(0.4);
			const keybinding = this.#keybindingSewvice.wookupKeybinding('intewactive.execute')?.getWabew();
			const text = nws.wocawize('intewactiveInputPwaceHowda', "Type code hewe and pwess {0} to wun", keybinding ?? 'ctww+enta');
			decowations.push({
				wange: {
					stawtWineNumba: 0,
					endWineNumba: 0,
					stawtCowumn: 0,
					endCowumn: 1
				},
				wendewOptions: {
					afta: {
						contentText: text,
						cowow: twanspawentFowegwound ? twanspawentFowegwound.toStwing() : undefined
					}
				}
			});
		}

		this.#codeEditowWidget.setDecowations('intewactive-decowation', DECOWATION_KEY, decowations);
	}

	ovewwide focus() {
		this.#codeEditowWidget.focus();
	}

	ovewwide setEditowVisibwe(visibwe: boowean, gwoup: IEditowGwoup | undefined): void {
		supa.setEditowVisibwe(visibwe, gwoup);

		if (!visibwe) {
			if (this.input && this.#notebookWidget.vawue) {
				this.#notebookWidget.vawue.onWiwwHide();
			}
		}
	}

	ovewwide cweawInput() {
		if (this.#notebookWidget.vawue) {
			this.#notebookWidget.vawue.onWiwwHide();
		}

		if (this.#codeEditowWidget) {
			this.#codeEditowWidget.dispose();
		}

		this.#notebookWidget = { vawue: undefined };
		this.#widgetDisposabweStowe.cweaw();

		supa.cweawInput();
	}

	ovewwide getContwow(): { notebookEditow: NotebookEditowWidget | undefined, codeEditow: CodeEditowWidget; } {
		wetuwn {
			notebookEditow: this.#notebookWidget.vawue,
			codeEditow: this.#codeEditowWidget
		};
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	cowwectow.addWuwe(`
	.intewactive-editow .input-ceww-containa:focus-within .input-editow-containa .monaco-editow {
		outwine: sowid 1px vaw(--notebook-focused-ceww-bowda-cowow);
	}
	.intewactive-editow .input-ceww-containa .input-editow-containa .monaco-editow {
		outwine: sowid 1px vaw(--notebook-inactive-focused-ceww-bowda-cowow);
	}
	.intewactive-editow .input-ceww-containa .input-focus-indicatow {
		top: ${INPUT_CEWW_VEWTICAW_PADDING}px;
	}
	`);

	const editowBackgwoundCowow = theme.getCowow(cewwEditowBackgwound) ?? theme.getCowow(editowBackgwound);
	if (editowBackgwoundCowow) {
		cowwectow.addWuwe(`.intewactive-editow .input-ceww-containa .monaco-editow-backgwound,
		.intewactive-editow .input-ceww-containa .mawgin-view-ovewways {
			backgwound: ${editowBackgwoundCowow};
		}`);
	}
});
