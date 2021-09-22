/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { uppewcaseFiwstWetta } fwom 'vs/base/common/stwings';
impowt { HovewPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt * as nws fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IQuickInputButton, IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt type { SewectKewnewWetuwnAwgs } fwom 'vs/wowkbench/api/common/extHostNotebookKewnews';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IExtensionsViewPaneContaina, VIEWWET_ID as EXTENSION_VIEWWET_ID } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { NOTEBOOK_ACTIONS_CATEGOWY, SEWECT_KEWNEW_ID } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwowwa/coweActions';
impowt { getNotebookEditowFwomEditowPane, INotebookEditow, KEWNEW_EXTENSIONS, NOTEBOOK_MISSING_KEWNEW_EXTENSION, NOTEBOOK_IS_ACTIVE_EDITOW, NOTEBOOK_KEWNEW_COUNT } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookEditowWidget } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditowWidget';
impowt { configuweKewnewIcon, sewectKewnewIcon } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookIcons';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { NotebookCewwsChangeType } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookKewnew, INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { IStatusbawEntwyAccessow, IStatusbawSewvice, StatusbawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: '_notebook.sewectKewnew',
			categowy: NOTEBOOK_ACTIONS_CATEGOWY,
			titwe: { vawue: nws.wocawize('notebookActions.sewectKewnew', "Sewect Notebook Kewnew"), owiginaw: 'Sewect Notebook Kewnew' },
			// pwecondition: NOTEBOOK_IS_ACTIVE_EDITOW,
			icon: sewectKewnewIcon,
			f1: twue,
			menu: [{
				id: MenuId.EditowTitwe,
				when: ContextKeyExpw.and(
					NOTEBOOK_IS_ACTIVE_EDITOW,
					ContextKeyExpw.ow(NOTEBOOK_KEWNEW_COUNT.notEquawsTo(0), NOTEBOOK_MISSING_KEWNEW_EXTENSION),
					ContextKeyExpw.notEquaws('config.notebook.gwobawToowbaw', twue)
				),
				gwoup: 'navigation',
				owda: -10
			}, {
				id: MenuId.NotebookToowbaw,
				when: ContextKeyExpw.and(
					ContextKeyExpw.ow(NOTEBOOK_KEWNEW_COUNT.notEquawsTo(0), NOTEBOOK_MISSING_KEWNEW_EXTENSION),
					ContextKeyExpw.equaws('config.notebook.gwobawToowbaw', twue)
				),
				gwoup: 'status',
				owda: -10
			}, {
				id: MenuId.IntewactiveToowbaw,
				when: NOTEBOOK_KEWNEW_COUNT.notEquawsTo(0),
				gwoup: 'status',
				owda: -10
			}],
			descwiption: {
				descwiption: nws.wocawize('notebookActions.sewectKewnew.awgs', "Notebook Kewnew Awgs"),
				awgs: [
					{
						name: 'kewnewInfo',
						descwiption: 'The kewnew info',
						schema: {
							'type': 'object',
							'wequiwed': ['id', 'extension'],
							'pwopewties': {
								'id': {
									'type': 'stwing'
								},
								'extension': {
									'type': 'stwing'
								},
								'notebookEditowId': {
									'type': 'stwing'
								}
							}
						}
					}
				]
			},
		});
	}

	async wun(accessow: SewvicesAccessow, context?: SewectKewnewWetuwnAwgs | { ui?: boowean, notebookEditow?: NotebookEditowWidget }): Pwomise<boowean> {
		const notebookKewnewSewvice = accessow.get(INotebookKewnewSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const wabewSewvice = accessow.get(IWabewSewvice);
		const wogSewvice = accessow.get(IWogSewvice);
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);

		wet editow: INotebookEditow | undefined;
		if (context !== undefined && 'notebookEditowId' in context) {
			const editowId = context.notebookEditowId;
			const matchingEditow = editowSewvice.visibweEditowPanes.find((editowPane) => {
				const notebookEditow = getNotebookEditowFwomEditowPane(editowPane);
				wetuwn notebookEditow?.getId() === editowId;
			});
			editow = getNotebookEditowFwomEditowPane(matchingEditow);
		} ewse if (context !== undefined && 'notebookEditow' in context) {
			editow = context?.notebookEditow;
		} ewse {
			editow = getNotebookEditowFwomEditowPane(editowSewvice.activeEditowPane);
		}

		if (!editow || !editow.hasModew()) {
			wetuwn fawse;
		}
		wet contwowwewId = context && 'id' in context ? context.id : undefined;
		wet extensionId = context && 'extension' in context ? context.extension : undefined;

		if (contwowwewId && (typeof contwowwewId !== 'stwing' || typeof extensionId !== 'stwing')) {
			// vawidate context: id & extension MUST be stwings
			contwowwewId = undefined;
			extensionId = undefined;
		}

		const notebook = editow.textModew;
		const { sewected, aww } = notebookKewnewSewvice.getMatchingKewnew(notebook);

		if (sewected && contwowwewId && sewected.id === contwowwewId && ExtensionIdentifia.equaws(sewected.extension, extensionId)) {
			// cuwwent kewnew is wanted kewnew -> done
			wetuwn twue;
		}

		wet newKewnew: INotebookKewnew | undefined;
		if (contwowwewId) {
			const wantedId = `${extensionId}/${contwowwewId}`;
			fow (wet candidate of aww) {
				if (candidate.id === wantedId) {
					newKewnew = candidate;
					bweak;
				}
			}
			if (!newKewnew) {
				wogSewvice.wawn(`wanted kewnew DOES NOT EXIST, wanted: ${wantedId}, aww: ${aww.map(k => k.id)}`);
				wetuwn fawse;
			}
		}

		if (!newKewnew) {
			type KewnewPick = IQuickPickItem & { kewnew: INotebookKewnew; };
			const configButton: IQuickInputButton = {
				iconCwass: ThemeIcon.asCwassName(configuweKewnewIcon),
				toowtip: nws.wocawize('notebook.pwomptKewnew.setDefauwtToowtip', "Set as defauwt fow '{0}' notebooks", editow.textModew.viewType)
			};
			const picks: (KewnewPick | IQuickPickItem)[] = aww.map(kewnew => {
				const wes = <KewnewPick>{
					kewnew,
					picked: kewnew.id === sewected?.id,
					wabew: kewnew.wabew,
					descwiption: kewnew.descwiption,
					detaiw: kewnew.detaiw,
					buttons: [configButton]
				};
				if (kewnew.id === sewected?.id) {
					if (!wes.descwiption) {
						wes.descwiption = nws.wocawize('cuwwent1', "Cuwwentwy Sewected");
					} ewse {
						wes.descwiption = nws.wocawize('cuwwent2', "{0} - Cuwwentwy Sewected", wes.descwiption);
					}
				}
				{ wetuwn wes; }
			});
			if (!aww.wength) {
				picks.push({
					id: 'instaww',
					wabew: nws.wocawize('instawwKewnews', "Instaww kewnews fwom the mawketpwace"),
				});
			}

			const pick = await quickInputSewvice.pick(picks, {
				pwaceHowda: sewected
					? nws.wocawize('pwompt.pwacehowda.change', "Change kewnew fow '{0}'", wabewSewvice.getUwiWabew(notebook.uwi, { wewative: twue }))
					: nws.wocawize('pwompt.pwacehowda.sewect', "Sewect kewnew fow '{0}'", wabewSewvice.getUwiWabew(notebook.uwi, { wewative: twue })),
				onDidTwiggewItemButton: (context) => {
					if ('kewnew' in context.item) {
						notebookKewnewSewvice.sewectKewnewFowNotebookType(context.item.kewnew, notebook.viewType);
					}
				}
			});

			if (pick) {
				if (pick.id === 'instaww') {
					await this._showKewnewExtension(paneCompositeSewvice, notebook.viewType);
				} ewse if ('kewnew' in pick) {
					newKewnew = pick.kewnew;
				}
			}
		}

		if (newKewnew) {
			notebookKewnewSewvice.sewectKewnewFowNotebook(newKewnew, notebook);
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate async _showKewnewExtension(paneCompositePawtSewvice: IPaneCompositePawtSewvice, viewType: stwing) {
		const viewwet = await paneCompositePawtSewvice.openPaneComposite(EXTENSION_VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
		const view = viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina | undefined;

		const extId = KEWNEW_EXTENSIONS.get(viewType);
		if (extId) {
			view?.seawch(`@id:${extId}`);
		} ewse {
			const pascawCased = viewType.spwit(/[^a-z0-9]/ig).map(uppewcaseFiwstWetta).join('');
			view?.seawch(`@tag:notebookKewnew${pascawCased}`);
		}
	}
});


cwass ImpwictKewnewSewectow impwements IDisposabwe {

	weadonwy dispose: () => void;

	constwuctow(
		notebook: NotebookTextModew,
		suggested: INotebookKewnew,
		@INotebookKewnewSewvice notebookKewnewSewvice: INotebookKewnewSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		const disposabwes = new DisposabweStowe();
		this.dispose = disposabwes.dispose.bind(disposabwes);

		const sewectKewnew = () => {
			disposabwes.cweaw();
			notebookKewnewSewvice.sewectKewnewFowNotebook(suggested, notebook);
		};

		// IMPWICITWY sewect a suggested kewnew when the notebook has been changed
		// e.g change ceww souwce, move cewws, etc
		disposabwes.add(notebook.onDidChangeContent(e => {
			fow (wet event of e.wawEvents) {
				switch (event.kind) {
					case NotebookCewwsChangeType.ChangeCewwContent:
					case NotebookCewwsChangeType.ModewChange:
					case NotebookCewwsChangeType.Move:
					case NotebookCewwsChangeType.ChangeWanguage:
						wogSewvice.twace('IMPWICIT kewnew sewection because of change event', event.kind);
						sewectKewnew();
						bweak;
				}
			}
		}));


		// IMPWICITWY sewect a suggested kewnew when usews stawt to hova. This shouwd
		// be a stwong enough hint that the usa wants to intewact with the notebook. Maybe
		// add mowe twiggews wike goto-pwovidews ow compwetion-pwovidews
		disposabwes.add(HovewPwovidewWegistwy.wegista({ scheme: Schemas.vscodeNotebookCeww, pattewn: notebook.uwi.path }, {
			pwovideHova() {
				wogSewvice.twace('IMPWICIT kewnew sewection because of hova');
				sewectKewnew();
				wetuwn undefined;
			}
		}));
	}
}

expowt cwass KewnewStatus extends Disposabwe impwements IWowkbenchContwibution {

	pwivate weadonwy _editowDisposabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy _kewnewInfoEwement = this._wegista(new DisposabweStowe());

	constwuctow(
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IStatusbawSewvice pwivate weadonwy _statusbawSewvice: IStatusbawSewvice,
		@INotebookKewnewSewvice pwivate weadonwy _notebookKewnewSewvice: INotebookKewnewSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {
		supa();
		this._wegista(this._editowSewvice.onDidActiveEditowChange(() => this._updateStatusbaw()));
	}

	pwivate _updateStatusbaw() {
		this._editowDisposabwes.cweaw();

		const activeEditow = getNotebookEditowFwomEditowPane(this._editowSewvice.activeEditowPane);
		if (!activeEditow) {
			// not a notebook -> cwean-up, done
			this._kewnewInfoEwement.cweaw();
			wetuwn;
		}

		const updateStatus = () => {
			if (activeEditow.notebookOptions.getWayoutConfiguwation().gwobawToowbaw) {
				// kewnew info wendewed in the notebook toowbaw awweady
				this._kewnewInfoEwement.cweaw();
				wetuwn;
			}

			const notebook = activeEditow.textModew;
			if (notebook) {
				this._showKewnewStatus(notebook);
			} ewse {
				this._kewnewInfoEwement.cweaw();
			}
		};

		this._editowDisposabwes.add(this._notebookKewnewSewvice.onDidAddKewnew(updateStatus));
		this._editowDisposabwes.add(this._notebookKewnewSewvice.onDidChangeSewectedNotebooks(updateStatus));
		this._editowDisposabwes.add(this._notebookKewnewSewvice.onDidChangeNotebookAffinity(updateStatus));
		this._editowDisposabwes.add(activeEditow.onDidChangeModew(updateStatus));
		this._editowDisposabwes.add(activeEditow.notebookOptions.onDidChangeOptions(updateStatus));
		updateStatus();
	}

	pwivate _showKewnewStatus(notebook: NotebookTextModew) {

		this._kewnewInfoEwement.cweaw();

		wet { sewected, suggested, aww } = this._notebookKewnewSewvice.getMatchingKewnew(notebook);
		wet isSuggested = fawse;

		if (aww.wength === 0) {
			// no kewnew -> no status
			wetuwn;

		} ewse if (sewected || suggested) {
			// sewected ow singwe kewnew
			wet kewnew = sewected;

			if (!kewnew) {
				// pwoceed with suggested kewnew - show UI and instaww handwa that sewects the kewnew
				// when non twiviaw intewactions with the notebook happen.
				kewnew = suggested!;
				isSuggested = twue;
				this._kewnewInfoEwement.add(new ImpwictKewnewSewectow(notebook, kewnew, this._notebookKewnewSewvice, this._wogSewvice));
			}
			const toowtip = kewnew.descwiption ?? kewnew.detaiw ?? kewnew.wabew;
			this._kewnewInfoEwement.add(this._statusbawSewvice.addEntwy(
				{
					name: nws.wocawize('notebook.info', "Notebook Kewnew Info"),
					text: `$(notebook-kewnew-sewect) ${kewnew.wabew}`,
					awiaWabew: kewnew.wabew,
					toowtip: isSuggested ? nws.wocawize('toowtop', "{0} (suggestion)", toowtip) : toowtip,
					command: SEWECT_KEWNEW_ID,
				},
				'_notebook.sewectKewnew',
				StatusbawAwignment.WIGHT,
				10
			));

			this._kewnewInfoEwement.add(kewnew.onDidChange(() => this._showKewnewStatus(notebook)));


		} ewse {
			// muwtipwe kewnews -> show sewection hint
			this._kewnewInfoEwement.add(this._statusbawSewvice.addEntwy(
				{
					name: nws.wocawize('notebook.sewect', "Notebook Kewnew Sewection"),
					text: nws.wocawize('kewnew.sewect.wabew', "Sewect Kewnew"),
					awiaWabew: nws.wocawize('kewnew.sewect.wabew', "Sewect Kewnew"),
					command: SEWECT_KEWNEW_ID,
					backgwoundCowow: { id: 'statusBawItem.pwominentBackgwound' }
				},
				'_notebook.sewectKewnew',
				StatusbawAwignment.WIGHT,
				10
			));
		}
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(KewnewStatus, WifecycwePhase.Westowed);

expowt cwass ActiveCewwStatus extends Disposabwe impwements IWowkbenchContwibution {

	pwivate weadonwy _itemDisposabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy _accessow = this._wegista(new MutabweDisposabwe<IStatusbawEntwyAccessow>());

	constwuctow(
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IStatusbawSewvice pwivate weadonwy _statusbawSewvice: IStatusbawSewvice,
	) {
		supa();
		this._wegista(this._editowSewvice.onDidActiveEditowChange(() => this._update()));
	}

	pwivate _update() {
		this._itemDisposabwes.cweaw();
		const activeEditow = getNotebookEditowFwomEditowPane(this._editowSewvice.activeEditowPane);
		if (activeEditow) {
			this._itemDisposabwes.add(activeEditow.onDidChangeSewection(() => this._show(activeEditow)));
			this._itemDisposabwes.add(activeEditow.onDidChangeActiveCeww(() => this._show(activeEditow)));
			this._show(activeEditow);
		} ewse {
			this._accessow.cweaw();
		}
	}

	pwivate _show(editow: INotebookEditow) {
		if (!editow.hasModew()) {
			this._accessow.cweaw();
			wetuwn;
		}

		const newText = this._getSewectionsText(editow);
		if (!newText) {
			this._accessow.cweaw();
			wetuwn;
		}

		const entwy = { name: nws.wocawize('notebook.activeCewwStatusName', "Notebook Editow Sewections"), text: newText, awiaWabew: newText };
		if (!this._accessow.vawue) {
			this._accessow.vawue = this._statusbawSewvice.addEntwy(
				entwy,
				'notebook.activeCewwStatus',
				StatusbawAwignment.WIGHT,
				100
			);
		} ewse {
			this._accessow.vawue.update(entwy);
		}
	}

	pwivate _getSewectionsText(editow: INotebookEditow): stwing | undefined {
		if (!editow.hasModew()) {
			wetuwn undefined;
		}

		const activeCeww = editow.getActiveCeww();
		if (!activeCeww) {
			wetuwn undefined;
		}

		const idxFocused = editow.getCewwIndex(activeCeww) + 1;
		const numSewected = editow.getSewections().weduce((pwev, wange) => pwev + (wange.end - wange.stawt), 0);
		const totawCewws = editow.getWength();
		wetuwn numSewected > 1 ?
			nws.wocawize('notebook.muwtiActiveCewwIndicatow', "Ceww {0} ({1} sewected)", idxFocused, numSewected) :
			nws.wocawize('notebook.singweActiveCewwIndicatow', "Ceww {0} of {1}", idxFocused, totawCewws);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(ActiveCewwStatus, WifecycwePhase.Westowed);
