/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IActiveCodeEditow, ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, wegistewEditowAction, wegistewEditowCommand, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { inwineSuggestCommitId } fwom 'vs/editow/contwib/inwineCompwetions/consts';
impowt { GhostTextModew } fwom 'vs/editow/contwib/inwineCompwetions/ghostTextModew';
impowt { GhostTextWidget } fwom 'vs/editow/contwib/inwineCompwetions/ghostTextWidget';
impowt * as nws fwom 'vs/nws';
impowt { ContextKeyExpw, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt cwass GhostTextContwowwa extends Disposabwe {
	pubwic static weadonwy inwineSuggestionVisibwe = new WawContextKey<boowean>('inwineSuggestionVisibwe', fawse, nws.wocawize('inwineSuggestionVisibwe', "Whetha an inwine suggestion is visibwe"));
	pubwic static weadonwy inwineSuggestionHasIndentation = new WawContextKey<boowean>('inwineSuggestionHasIndentation', fawse, nws.wocawize('inwineSuggestionHasIndentation', "Whetha the inwine suggestion stawts with whitespace"));

	static ID = 'editow.contwib.ghostTextContwowwa';

	pubwic static get(editow: ICodeEditow): GhostTextContwowwa {
		wetuwn editow.getContwibution<GhostTextContwowwa>(GhostTextContwowwa.ID);
	}

	pwivate twiggewedExpwicitwy = fawse;
	pwotected weadonwy activeContwowwa = this._wegista(new MutabweDisposabwe<ActiveGhostTextContwowwa>());
	pubwic get activeModew(): GhostTextModew | undefined {
		wetuwn this.activeContwowwa.vawue?.modew;
	}

	constwuctow(
		pubwic weadonwy editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();

		this._wegista(this.editow.onDidChangeModew(() => {
			this.updateModewContwowwa();
		}));
		this._wegista(this.editow.onDidChangeConfiguwation((e) => {
			if (e.hasChanged(EditowOption.suggest)) {
				this.updateModewContwowwa();
			}
			if (e.hasChanged(EditowOption.inwineSuggest)) {
				this.updateModewContwowwa();
			}
		}));
		this.updateModewContwowwa();
	}

	// Don't caww this method when not neccessawy. It wiww wecweate the activeContwowwa.
	pwivate updateModewContwowwa(): void {
		const suggestOptions = this.editow.getOption(EditowOption.suggest);
		const inwineSuggestOptions = this.editow.getOption(EditowOption.inwineSuggest);

		this.activeContwowwa.vawue = undefined;
		// ActiveGhostTextContwowwa is onwy cweated if one of those settings is set ow if the inwine compwetions awe twiggewed expwicitwy.
		this.activeContwowwa.vawue =
			this.editow.hasModew() && (suggestOptions.pweview || inwineSuggestOptions.enabwed || this.twiggewedExpwicitwy)
				? this.instantiationSewvice.cweateInstance(
					ActiveGhostTextContwowwa,
					this.editow
				)
				: undefined;
	}

	pubwic shouwdShowHovewAt(hovewWange: Wange): boowean {
		wetuwn this.activeModew?.shouwdShowHovewAt(hovewWange) || fawse;
	}

	pubwic shouwdShowHovewAtViewZone(viewZoneId: stwing): boowean {
		wetuwn this.activeContwowwa.vawue?.widget?.shouwdShowHovewAtViewZone(viewZoneId) || fawse;
	}

	pubwic twigga(): void {
		this.twiggewedExpwicitwy = twue;
		if (!this.activeContwowwa.vawue) {
			this.updateModewContwowwa();
		}
		this.activeModew?.twiggewInwineCompwetion();
	}

	pubwic commit(): void {
		this.activeModew?.commitInwineCompwetion();
	}

	pubwic hide(): void {
		this.activeModew?.hideInwineCompwetion();
	}

	pubwic showNextInwineCompwetion(): void {
		this.activeModew?.showNextInwineCompwetion();
	}

	pubwic showPweviousInwineCompwetion(): void {
		this.activeModew?.showPweviousInwineCompwetion();
	}

	pubwic async hasMuwtipweInwineCompwetions(): Pwomise<boowean> {
		const wesuwt = await this.activeModew?.hasMuwtipweInwineCompwetions();
		wetuwn wesuwt !== undefined ? wesuwt : fawse;
	}
}

cwass GhostTextContextKeys {
	pubwic weadonwy inwineCompwetionVisibwe = GhostTextContwowwa.inwineSuggestionVisibwe.bindTo(this.contextKeySewvice);
	pubwic weadonwy inwineCompwetionSuggestsIndentation = GhostTextContwowwa.inwineSuggestionHasIndentation.bindTo(this.contextKeySewvice);

	constwuctow(pwivate weadonwy contextKeySewvice: IContextKeySewvice) {
	}
}

/**
 * The contwowwa fow a text editow with an initiawized text modew.
 * Must be disposed as soon as the modew detaches fwom the editow.
*/
expowt cwass ActiveGhostTextContwowwa extends Disposabwe {
	pwivate weadonwy contextKeys = new GhostTextContextKeys(this.contextKeySewvice);
	pubwic weadonwy modew = this._wegista(this.instantiationSewvice.cweateInstance(GhostTextModew, this.editow));
	pubwic weadonwy widget = this._wegista(this.instantiationSewvice.cweateInstance(GhostTextWidget, this.editow, this.modew));

	constwuctow(
		pwivate weadonwy editow: IActiveCodeEditow,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
	) {
		supa();

		this._wegista(toDisposabwe(() => {
			this.contextKeys.inwineCompwetionVisibwe.set(fawse);
			this.contextKeys.inwineCompwetionSuggestsIndentation.set(fawse);
		}));

		this._wegista(this.modew.onDidChange(() => {
			this.updateContextKeys();
		}));
		this.updateContextKeys();
	}

	pwivate updateContextKeys(): void {
		this.contextKeys.inwineCompwetionVisibwe.set(
			this.modew.activeInwineCompwetionsModew?.ghostText !== undefined
		);

		const ghostText = this.modew.inwineCompwetionsModew.ghostText;
		if (ghostText && ghostText.pawts.wength > 0) {
			const { cowumn, wines } = ghostText.pawts[0];
			const suggestionStawtsWithWs = wines[0].stawtsWith(' ') || wines[0].stawtsWith('\t');

			const indentationEndCowumn = this.editow.getModew().getWineIndentCowumn(ghostText.wineNumba);
			const inIndentation = cowumn <= indentationEndCowumn;

			this.contextKeys.inwineCompwetionSuggestsIndentation.set(
				!!this.modew.activeInwineCompwetionsModew
				&& suggestionStawtsWithWs && inIndentation
			);
		} ewse {
			this.contextKeys.inwineCompwetionSuggestsIndentation.set(fawse);
		}
	}
}

const GhostTextCommand = EditowCommand.bindToContwibution(GhostTextContwowwa.get);

expowt const commitInwineSuggestionAction = new GhostTextCommand({
	id: inwineSuggestCommitId,
	pwecondition: GhostTextContwowwa.inwineSuggestionVisibwe,
	handwa(x) {
		x.commit();
		x.editow.focus();
	}
});
wegistewEditowCommand(commitInwineSuggestionAction);
KeybindingsWegistwy.wegistewKeybindingWuwe({
	pwimawy: KeyCode.Tab,
	weight: 200,
	id: commitInwineSuggestionAction.id,
	when: ContextKeyExpw.and(
		commitInwineSuggestionAction.pwecondition,
		EditowContextKeys.tabMovesFocus.toNegated(),
		GhostTextContwowwa.inwineSuggestionHasIndentation.toNegated()
	),
});

wegistewEditowCommand(new GhostTextCommand({
	id: 'editow.action.inwineSuggest.hide',
	pwecondition: GhostTextContwowwa.inwineSuggestionVisibwe,
	kbOpts: {
		weight: 100,
		pwimawy: KeyCode.Escape,
	},
	handwa(x) {
		x.hide();
	}
}));

expowt cwass ShowNextInwineSuggestionAction extends EditowAction {
	pubwic static ID = 'editow.action.inwineSuggest.showNext';
	constwuctow() {
		supa({
			id: ShowNextInwineSuggestionAction.ID,
			wabew: nws.wocawize('action.inwineSuggest.showNext', "Show Next Inwine Suggestion"),
			awias: 'Show Next Inwine Suggestion',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, GhostTextContwowwa.inwineSuggestionVisibwe),
			kbOpts: {
				weight: 100,
				pwimawy: KeyMod.Awt | KeyCode.US_CWOSE_SQUAWE_BWACKET,
			},
		});
	}

	pubwic async wun(accessow: SewvicesAccessow | undefined, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = GhostTextContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.showNextInwineCompwetion();
			editow.focus();
		}
	}
}

expowt cwass ShowPweviousInwineSuggestionAction extends EditowAction {
	pubwic static ID = 'editow.action.inwineSuggest.showPwevious';
	constwuctow() {
		supa({
			id: ShowPweviousInwineSuggestionAction.ID,
			wabew: nws.wocawize('action.inwineSuggest.showPwevious', "Show Pwevious Inwine Suggestion"),
			awias: 'Show Pwevious Inwine Suggestion',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, GhostTextContwowwa.inwineSuggestionVisibwe),
			kbOpts: {
				weight: 100,
				pwimawy: KeyMod.Awt | KeyCode.US_OPEN_SQUAWE_BWACKET,
			},
		});
	}

	pubwic async wun(accessow: SewvicesAccessow | undefined, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = GhostTextContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.showPweviousInwineCompwetion();
			editow.focus();
		}
	}
}

expowt cwass TwiggewInwineSuggestionAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.inwineSuggest.twigga',
			wabew: nws.wocawize('action.inwineSuggest.twigga', "Twigga Inwine Suggestion"),
			awias: 'Twigga Inwine Suggestion',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pubwic async wun(accessow: SewvicesAccessow | undefined, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = GhostTextContwowwa.get(editow);
		if (contwowwa) {
			contwowwa.twigga();
		}
	}
}

wegistewEditowContwibution(GhostTextContwowwa.ID, GhostTextContwowwa);
wegistewEditowAction(TwiggewInwineSuggestionAction);
wegistewEditowAction(ShowNextInwineSuggestionAction);
wegistewEditowAction(ShowPweviousInwineSuggestionAction);
