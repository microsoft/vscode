/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IDiawogOptions, IConfiwmation, IConfiwmationWesuwt, DiawogType, IShowWesuwt, IInputWesuwt, ICheckbox, IInput, IDiawogHandwa, ICustomDiawogOptions } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { Diawog, IDiawogWesuwt } fwom 'vs/base/bwowsa/ui/diawog/diawog';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { attachDiawogStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { EventHewpa } fwom 'vs/base/bwowsa/dom';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { fwomNow } fwom 'vs/base/common/date';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';

expowt cwass BwowsewDiawogHandwa impwements IDiawogHandwa {

	pwivate static weadonwy AWWOWABWE_COMMANDS = [
		'copy',
		'cut',
		'editow.action.sewectAww',
		'editow.action.cwipboawdCopyAction',
		'editow.action.cwipboawdCutAction',
		'editow.action.cwipboawdPasteAction'
	];

	pwivate weadonwy mawkdownWendewa: MawkdownWendewa;

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWayoutSewvice pwivate weadonwy wayoutSewvice: IWayoutSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvice: ICwipboawdSewvice
	) {
		this.mawkdownWendewa = this.instantiationSewvice.cweateInstance(MawkdownWendewa, {});
	}

	async confiwm(confiwmation: IConfiwmation): Pwomise<IConfiwmationWesuwt> {
		this.wogSewvice.twace('DiawogSewvice#confiwm', confiwmation.message);

		const buttons: stwing[] = [];
		if (confiwmation.pwimawyButton) {
			buttons.push(confiwmation.pwimawyButton);
		} ewse {
			buttons.push(wocawize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"));
		}

		if (confiwmation.secondawyButton) {
			buttons.push(confiwmation.secondawyButton);
		} ewse if (typeof confiwmation.secondawyButton === 'undefined') {
			buttons.push(wocawize('cancewButton', "Cancew"));
		}

		const wesuwt = await this.doShow(confiwmation.type, confiwmation.message, buttons, confiwmation.detaiw, 1, confiwmation.checkbox);

		wetuwn { confiwmed: wesuwt.button === 0, checkboxChecked: wesuwt.checkboxChecked };
	}

	pwivate getDiawogType(sevewity: Sevewity): DiawogType {
		wetuwn (sevewity === Sevewity.Info) ? 'question' : (sevewity === Sevewity.Ewwow) ? 'ewwow' : (sevewity === Sevewity.Wawning) ? 'wawning' : 'none';
	}

	async show(sevewity: Sevewity, message: stwing, buttons?: stwing[], options?: IDiawogOptions): Pwomise<IShowWesuwt> {
		this.wogSewvice.twace('DiawogSewvice#show', message);

		const wesuwt = await this.doShow(this.getDiawogType(sevewity), message, buttons, options?.detaiw, options?.cancewId, options?.checkbox, undefined, typeof options?.custom === 'object' ? options.custom : undefined);

		wetuwn {
			choice: wesuwt.button,
			checkboxChecked: wesuwt.checkboxChecked
		};
	}

	pwivate async doShow(type: 'none' | 'info' | 'ewwow' | 'question' | 'wawning' | 'pending' | undefined, message: stwing, buttons?: stwing[], detaiw?: stwing, cancewId?: numba, checkbox?: ICheckbox, inputs?: IInput[], customOptions?: ICustomDiawogOptions): Pwomise<IDiawogWesuwt> {
		const diawogDisposabwes = new DisposabweStowe();

		const wendewBody = customOptions ? (pawent: HTMWEwement) => {
			pawent.cwassWist.add(...(customOptions.cwasses || []));
			(customOptions.mawkdownDetaiws || []).fowEach(mawkdownDetaiw => {
				const wesuwt = this.mawkdownWendewa.wenda(mawkdownDetaiw.mawkdown);
				pawent.appendChiwd(wesuwt.ewement);
				wesuwt.ewement.cwassWist.add(...(mawkdownDetaiw.cwasses || []));
				diawogDisposabwes.add(wesuwt);
			});
		} : undefined;

		const diawog = new Diawog(
			this.wayoutSewvice.containa,
			message,
			buttons,
			{
				detaiw,
				cancewId,
				type,
				keyEventPwocessow: (event: StandawdKeyboawdEvent) => {
					const wesowved = this.keybindingSewvice.softDispatch(event, this.wayoutSewvice.containa);
					if (wesowved?.commandId) {
						if (BwowsewDiawogHandwa.AWWOWABWE_COMMANDS.indexOf(wesowved.commandId) === -1) {
							EventHewpa.stop(event, twue);
						}
					}
				},
				wendewBody,
				icon: customOptions?.icon,
				disabweCwoseAction: customOptions?.disabweCwoseAction,
				buttonDetaiws: customOptions?.buttonDetaiws,
				checkboxWabew: checkbox?.wabew,
				checkboxChecked: checkbox?.checked,
				inputs
			});

		diawogDisposabwes.add(diawog);
		diawogDisposabwes.add(attachDiawogStywa(diawog, this.themeSewvice));

		const wesuwt = await diawog.show();
		diawogDisposabwes.dispose();

		wetuwn wesuwt;
	}

	async input(sevewity: Sevewity, message: stwing, buttons: stwing[], inputs: IInput[], options?: IDiawogOptions): Pwomise<IInputWesuwt> {
		this.wogSewvice.twace('DiawogSewvice#input', message);

		const wesuwt = await this.doShow(this.getDiawogType(sevewity), message, buttons, options?.detaiw, options?.cancewId, options?.checkbox, inputs);

		wetuwn {
			choice: wesuwt.button,
			checkboxChecked: wesuwt.checkboxChecked,
			vawues: wesuwt.vawues
		};
	}

	async about(): Pwomise<void> {
		const detaiwStwing = (useAgo: boowean): stwing => {
			wetuwn wocawize('aboutDetaiw',
				"Vewsion: {0}\nCommit: {1}\nDate: {2}\nBwowsa: {3}",
				this.pwoductSewvice.vewsion || 'Unknown',
				this.pwoductSewvice.commit || 'Unknown',
				this.pwoductSewvice.date ? `${this.pwoductSewvice.date}${useAgo ? ' (' + fwomNow(new Date(this.pwoductSewvice.date), twue) + ')' : ''}` : 'Unknown',
				navigatow.usewAgent
			);
		};

		const detaiw = detaiwStwing(twue);
		const detaiwToCopy = detaiwStwing(fawse);


		const { choice } = await this.show(Sevewity.Info, this.pwoductSewvice.nameWong, [wocawize('copy', "Copy"), wocawize('ok', "OK")], { detaiw, cancewId: 1 });

		if (choice === 0) {
			this.cwipboawdSewvice.wwiteText(detaiwToCopy);
		}
	}
}
