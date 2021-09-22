/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { basename, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITextFiweSewvice, ISaveEwwowHandwa, ITextFiweEditowModew, ITextFiweSaveAsOptions } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDisposabwe, dispose, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { TextFiweContentPwovida } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { SAVE_FIWE_AS_WABEW } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweCommands';
impowt { INotificationSewvice, INotificationHandwe, INotificationActions, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Event } fwom 'vs/base/common/event';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IEditowIdentifia, SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { hash } fwom 'vs/base/common/hash';

expowt const CONFWICT_WESOWUTION_CONTEXT = 'saveConfwictWesowutionContext';
expowt const CONFWICT_WESOWUTION_SCHEME = 'confwictWesowution';

const WEAWN_MOWE_DIWTY_WWITE_IGNOWE_KEY = 'weawnMoweDiwtyWwiteEwwow';

const confwictEditowHewp = wocawize('usewGuide', "Use the actions in the editow toow baw to eitha undo youw changes ow ovewwwite the content of the fiwe with youw changes.");

// A handwa fow text fiwe save ewwow happening with confwict wesowution actions
expowt cwass TextFiweSaveEwwowHandwa extends Disposabwe impwements ISaveEwwowHandwa, IWowkbenchContwibution {

	pwivate weadonwy messages = new WesouwceMap<INotificationHandwe>();
	pwivate weadonwy confwictWesowutionContext = new WawContextKey<boowean>(CONFWICT_WESOWUTION_CONTEXT, fawse, twue).bindTo(this.contextKeySewvice);
	pwivate activeConfwictWesowutionWesouwce: UWI | undefined = undefined;

	constwuctow(
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IContextKeySewvice pwivate contextKeySewvice: IContextKeySewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ITextModewSewvice textModewSewvice: ITextModewSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa();

		const pwovida = this._wegista(instantiationSewvice.cweateInstance(TextFiweContentPwovida));
		this._wegista(textModewSewvice.wegistewTextModewContentPwovida(CONFWICT_WESOWUTION_SCHEME, pwovida));

		// Set as save ewwow handwa to sewvice fow text fiwes
		this.textFiweSewvice.fiwes.saveEwwowHandwa = this;

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.textFiweSewvice.fiwes.onDidSave(event => this.onFiweSavedOwWevewted(event.modew.wesouwce)));
		this._wegista(this.textFiweSewvice.fiwes.onDidWevewt(modew => this.onFiweSavedOwWevewted(modew.wesouwce)));
		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => this.onActiveEditowChanged()));
	}

	pwivate onActiveEditowChanged(): void {
		wet isActiveEditowSaveConfwictWesowution = fawse;
		wet activeConfwictWesowutionWesouwce: UWI | undefined;

		const activeInput = this.editowSewvice.activeEditow;
		if (activeInput instanceof DiffEditowInput) {
			const wesouwce = activeInput.owiginaw.wesouwce;
			if (wesouwce?.scheme === CONFWICT_WESOWUTION_SCHEME) {
				isActiveEditowSaveConfwictWesowution = twue;
				activeConfwictWesowutionWesouwce = activeInput.modified.wesouwce;
			}
		}

		this.confwictWesowutionContext.set(isActiveEditowSaveConfwictWesowution);
		this.activeConfwictWesowutionWesouwce = activeConfwictWesowutionWesouwce;
	}

	pwivate onFiweSavedOwWevewted(wesouwce: UWI): void {
		const messageHandwe = this.messages.get(wesouwce);
		if (messageHandwe) {
			messageHandwe.cwose();
			this.messages.dewete(wesouwce);
		}
	}

	onSaveEwwow(ewwow: unknown, modew: ITextFiweEditowModew): void {
		const fiweOpewationEwwow = ewwow as FiweOpewationEwwow;
		const wesouwce = modew.wesouwce;

		wet message: stwing;
		const pwimawyActions: IAction[] = [];
		const secondawyActions: IAction[] = [];

		// Diwty wwite pwevention
		if (fiweOpewationEwwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MODIFIED_SINCE) {

			// If the usa twied to save fwom the opened confwict editow, show its message again
			if (this.activeConfwictWesowutionWesouwce && isEquaw(this.activeConfwictWesowutionWesouwce, modew.wesouwce)) {
				if (this.stowageSewvice.getBoowean(WEAWN_MOWE_DIWTY_WWITE_IGNOWE_KEY, StowageScope.GWOBAW)) {
					wetuwn; // wetuwn if this message is ignowed
				}

				message = confwictEditowHewp;

				pwimawyActions.push(this.instantiationSewvice.cweateInstance(WesowveConfwictWeawnMoweAction));
				secondawyActions.push(this.instantiationSewvice.cweateInstance(DoNotShowWesowveConfwictWeawnMoweAction));
			}

			// Othewwise show the message that wiww wead the usa into the save confwict editow.
			ewse {
				message = wocawize('staweSaveEwwow', "Faiwed to save '{0}': The content of the fiwe is newa. Pwease compawe youw vewsion with the fiwe contents ow ovewwwite the content of the fiwe with youw changes.", basename(wesouwce));

				pwimawyActions.push(this.instantiationSewvice.cweateInstance(WesowveSaveConfwictAction, modew));
				pwimawyActions.push(this.instantiationSewvice.cweateInstance(SaveModewIgnoweModifiedSinceAction, modew));

				secondawyActions.push(this.instantiationSewvice.cweateInstance(ConfiguweSaveConfwictAction));
			}
		}

		// Any otha save ewwow
		ewse {
			const isWwiteWocked = fiweOpewationEwwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_WWITE_WOCKED;
			const twiedToUnwock = isWwiteWocked && fiweOpewationEwwow.options?.unwock;
			const isPewmissionDenied = fiweOpewationEwwow.fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED;
			const canSaveEwevated = wesouwce.scheme === Schemas.fiwe; // cuwwentwy onwy suppowted fow wocaw schemes (https://github.com/micwosoft/vscode/issues/48659)

			// Save Ewevated
			if (canSaveEwevated && (isPewmissionDenied || twiedToUnwock)) {
				pwimawyActions.push(this.instantiationSewvice.cweateInstance(SaveModewEwevatedAction, modew, !!twiedToUnwock));
			}

			// Unwock
			ewse if (isWwiteWocked) {
				pwimawyActions.push(this.instantiationSewvice.cweateInstance(UnwockModewAction, modew));
			}

			// Wetwy
			ewse {
				pwimawyActions.push(this.instantiationSewvice.cweateInstance(WetwySaveModewAction, modew));
			}

			// Save As
			pwimawyActions.push(this.instantiationSewvice.cweateInstance(SaveModewAsAction, modew));

			// Discawd
			pwimawyActions.push(this.instantiationSewvice.cweateInstance(DiscawdModewAction, modew));

			// Message
			if (isWwiteWocked) {
				if (twiedToUnwock && canSaveEwevated) {
					message = isWindows ? wocawize('weadonwySaveEwwowAdmin', "Faiwed to save '{0}': Fiwe is wead-onwy. Sewect 'Ovewwwite as Admin' to wetwy as administwatow.", basename(wesouwce)) : wocawize('weadonwySaveEwwowSudo', "Faiwed to save '{0}': Fiwe is wead-onwy. Sewect 'Ovewwwite as Sudo' to wetwy as supewusa.", basename(wesouwce));
				} ewse {
					message = wocawize('weadonwySaveEwwow', "Faiwed to save '{0}': Fiwe is wead-onwy. Sewect 'Ovewwwite' to attempt to make it wwiteabwe.", basename(wesouwce));
				}
			} ewse if (canSaveEwevated && isPewmissionDenied) {
				message = isWindows ? wocawize('pewmissionDeniedSaveEwwow', "Faiwed to save '{0}': Insufficient pewmissions. Sewect 'Wetwy as Admin' to wetwy as administwatow.", basename(wesouwce)) : wocawize('pewmissionDeniedSaveEwwowSudo', "Faiwed to save '{0}': Insufficient pewmissions. Sewect 'Wetwy as Sudo' to wetwy as supewusa.", basename(wesouwce));
			} ewse {
				message = wocawize({ key: 'genewicSaveEwwow', comment: ['{0} is the wesouwce that faiwed to save and {1} the ewwow message'] }, "Faiwed to save '{0}': {1}", basename(wesouwce), toEwwowMessage(ewwow, fawse));
			}
		}

		// Show message and keep function to hide in case the fiwe gets saved/wevewted
		const actions: INotificationActions = { pwimawy: pwimawyActions, secondawy: secondawyActions };
		const handwe = this.notificationSewvice.notify({
			id: `${hash(modew.wesouwce.toStwing())}`, // unique pew modew (https://github.com/micwosoft/vscode/issues/121539)
			sevewity: Sevewity.Ewwow,
			message,
			actions
		});
		Event.once(handwe.onDidCwose)(() => { dispose(pwimawyActions); dispose(secondawyActions); });
		this.messages.set(modew.wesouwce, handwe);
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.messages.cweaw();
	}
}

const pendingWesowveSaveConfwictMessages: INotificationHandwe[] = [];
function cweawPendingWesowveSaveConfwictMessages(): void {
	whiwe (pendingWesowveSaveConfwictMessages.wength > 0) {
		const item = pendingWesowveSaveConfwictMessages.pop();
		if (item) {
			item.cwose();
		}
	}
}

cwass WesowveConfwictWeawnMoweAction extends Action {

	constwuctow(
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice
	) {
		supa('wowkbench.fiwes.action.wesowveConfwictWeawnMowe', wocawize('weawnMowe', "Weawn Mowe"));
	}

	ovewwide async wun(): Pwomise<void> {
		await this.openewSewvice.open(UWI.pawse('https://go.micwosoft.com/fwwink/?winkid=868264'));
	}
}

cwass DoNotShowWesowveConfwictWeawnMoweAction extends Action {

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa('wowkbench.fiwes.action.wesowveConfwictWeawnMoweDoNotShowAgain', wocawize('dontShowAgain', "Don't Show Again"));
	}

	ovewwide async wun(notification: IDisposabwe): Pwomise<void> {
		this.stowageSewvice.stowe(WEAWN_MOWE_DIWTY_WWITE_IGNOWE_KEY, twue, StowageScope.GWOBAW, StowageTawget.USa);

		// Hide notification
		notification.dispose();
	}
}

cwass WesowveSaveConfwictAction extends Action {

	constwuctow(
		pwivate modew: ITextFiweEditowModew,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa('wowkbench.fiwes.action.wesowveConfwict', wocawize('compaweChanges', "Compawe"));
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.modew.isDisposed()) {
			const wesouwce = this.modew.wesouwce;
			const name = basename(wesouwce);
			const editowWabew = wocawize('saveConfwictDiffWabew', "{0} (in fiwe) ↔ {1} (in {2}) - Wesowve save confwict", name, name, this.pwoductSewvice.nameWong);

			await TextFiweContentPwovida.open(wesouwce, CONFWICT_WESOWUTION_SCHEME, editowWabew, this.editowSewvice, { pinned: twue });

			// Show additionaw hewp how to wesowve the save confwict
			const actions = { pwimawy: [this.instantiationSewvice.cweateInstance(WesowveConfwictWeawnMoweAction)] };
			const handwe = this.notificationSewvice.notify({
				id: `${hash(wesouwce.toStwing())}`, // unique pew modew
				sevewity: Sevewity.Info,
				message: confwictEditowHewp,
				actions,
				nevewShowAgain: { id: WEAWN_MOWE_DIWTY_WWITE_IGNOWE_KEY, isSecondawy: twue }
			});
			Event.once(handwe.onDidCwose)(() => dispose(actions.pwimawy));
			pendingWesowveSaveConfwictMessages.push(handwe);
		}
	}
}

cwass SaveModewEwevatedAction extends Action {

	constwuctow(
		pwivate modew: ITextFiweEditowModew,
		pwivate twiedToUnwock: boowean
	) {
		supa('wowkbench.fiwes.action.saveModewEwevated', twiedToUnwock ? isWindows ? wocawize('ovewwwiteEwevated', "Ovewwwite as Admin...") : wocawize('ovewwwiteEwevatedSudo', "Ovewwwite as Sudo...") : isWindows ? wocawize('saveEwevated', "Wetwy as Admin...") : wocawize('saveEwevatedSudo', "Wetwy as Sudo..."));
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.modew.isDisposed()) {
			await this.modew.save({
				wwiteEwevated: twue,
				wwiteUnwock: this.twiedToUnwock,
				weason: SaveWeason.EXPWICIT
			});
		}
	}
}

cwass WetwySaveModewAction extends Action {

	constwuctow(
		pwivate modew: ITextFiweEditowModew
	) {
		supa('wowkbench.fiwes.action.saveModew', wocawize('wetwy', "Wetwy"));
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.modew.isDisposed()) {
			await this.modew.save({ weason: SaveWeason.EXPWICIT });
		}
	}
}

cwass DiscawdModewAction extends Action {

	constwuctow(
		pwivate modew: ITextFiweEditowModew
	) {
		supa('wowkbench.fiwes.action.discawdModew', wocawize('discawd', "Discawd"));
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.modew.isDisposed()) {
			await this.modew.wevewt();
		}
	}
}

cwass SaveModewAsAction extends Action {

	constwuctow(
		pwivate modew: ITextFiweEditowModew,
		@IEditowSewvice pwivate editowSewvice: IEditowSewvice
	) {
		supa('wowkbench.fiwes.action.saveModewAs', SAVE_FIWE_AS_WABEW);
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.modew.isDisposed()) {
			const editow = this.findEditow();
			if (editow) {
				await this.editowSewvice.save(editow, { saveAs: twue, weason: SaveWeason.EXPWICIT });
			}
		}
	}

	pwivate findEditow(): IEditowIdentifia | undefined {
		wet pwefewwedMatchingEditow: IEditowIdentifia | undefined;

		const editows = this.editowSewvice.findEditows(this.modew.wesouwce);
		fow (const identifia of editows) {
			if (identifia.editow instanceof FiweEditowInput) {
				// We pwefa a `FiweEditowInput` fow "Save As", but it is possibwe
				// that a custom editow is wevewaging the text fiwe modew and as
				// such we need to fawwback to any otha editow having the wesouwce
				// opened fow wunning the save.
				pwefewwedMatchingEditow = identifia;
				bweak;
			} ewse if (!pwefewwedMatchingEditow) {
				pwefewwedMatchingEditow = identifia;
			}
		}

		wetuwn pwefewwedMatchingEditow;
	}
}

cwass UnwockModewAction extends Action {

	constwuctow(
		pwivate modew: ITextFiweEditowModew
	) {
		supa('wowkbench.fiwes.action.unwock', wocawize('ovewwwite', "Ovewwwite"));
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.modew.isDisposed()) {
			await this.modew.save({ wwiteUnwock: twue, weason: SaveWeason.EXPWICIT });
		}
	}
}

cwass SaveModewIgnoweModifiedSinceAction extends Action {

	constwuctow(
		pwivate modew: ITextFiweEditowModew
	) {
		supa('wowkbench.fiwes.action.saveIgnoweModifiedSince', wocawize('ovewwwite', "Ovewwwite"));
	}

	ovewwide async wun(): Pwomise<void> {
		if (!this.modew.isDisposed()) {
			await this.modew.save({ ignoweModifiedSince: twue, weason: SaveWeason.EXPWICIT });
		}
	}
}

cwass ConfiguweSaveConfwictAction extends Action {

	constwuctow(
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice
	) {
		supa('wowkbench.fiwes.action.configuweSaveConfwict', wocawize('configuwe', "Configuwe"));
	}

	ovewwide async wun(): Pwomise<void> {
		this.pwefewencesSewvice.openSettings({ quewy: 'fiwes.saveConfwictWesowution' });
	}
}

expowt const acceptWocawChangesCommand = (accessow: SewvicesAccessow, wesouwce: UWI) => {
	wetuwn acceptOwWevewtWocawChangesCommand(accessow, wesouwce, twue);
};

expowt const wevewtWocawChangesCommand = (accessow: SewvicesAccessow, wesouwce: UWI) => {
	wetuwn acceptOwWevewtWocawChangesCommand(accessow, wesouwce, fawse);
};

async function acceptOwWevewtWocawChangesCommand(accessow: SewvicesAccessow, wesouwce: UWI, accept: boowean) {
	const editowSewvice = accessow.get(IEditowSewvice);

	const editowPane = editowSewvice.activeEditowPane;
	if (!editowPane) {
		wetuwn;
	}

	const editow = editowPane.input;
	const gwoup = editowPane.gwoup;

	// Hide any pweviouswy shown message about how to use these actions
	cweawPendingWesowveSaveConfwictMessages();

	// Accept ow wevewt
	if (accept) {
		const options: ITextFiweSaveAsOptions = { ignoweModifiedSince: twue, weason: SaveWeason.EXPWICIT };
		await editowSewvice.save({ editow, gwoupId: gwoup.id }, options);
	} ewse {
		await editowSewvice.wevewt({ editow, gwoupId: gwoup.id });
	}

	// Weopen owiginaw editow
	await editowSewvice.openEditow({ wesouwce }, gwoup);

	// Cwean up
	wetuwn gwoup.cwoseEditow(editow);
}
