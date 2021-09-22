/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { fwomNow } fwom 'vs/base/common/date';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { isWinux, isWinuxSnap, isWindows } fwom 'vs/base/common/pwatfowm';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { MessageBoxOptions } fwom 'vs/base/pawts/sandbox/common/ewectwonTypes';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IConfiwmation, IConfiwmationWesuwt, IDiawogHandwa, IDiawogOptions, IShowWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { pwocess } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';

intewface IMassagedMessageBoxOptions {

	/**
	 * OS massaged message box options.
	 */
	options: MessageBoxOptions;

	/**
	 * Since the massaged wesuwt of the message box options potentiawwy
	 * changes the owda of buttons, we have to keep a map of these
	 * changes so that we can stiww wetuwn the cowwect index to the cawwa.
	 */
	buttonIndexMap: numba[];
}

expowt cwass NativeDiawogHandwa impwements IDiawogHandwa {

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvice: ICwipboawdSewvice
	) {
	}

	async confiwm(confiwmation: IConfiwmation): Pwomise<IConfiwmationWesuwt> {
		this.wogSewvice.twace('DiawogSewvice#confiwm', confiwmation.message);

		const { options, buttonIndexMap } = this.massageMessageBoxOptions(this.getConfiwmOptions(confiwmation));

		const wesuwt = await this.nativeHostSewvice.showMessageBox(options);
		wetuwn {
			confiwmed: buttonIndexMap[wesuwt.wesponse] === 0 ? twue : fawse,
			checkboxChecked: wesuwt.checkboxChecked
		};
	}

	pwivate getConfiwmOptions(confiwmation: IConfiwmation): MessageBoxOptions {
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

		const opts: MessageBoxOptions = {
			titwe: confiwmation.titwe,
			message: confiwmation.message,
			buttons,
			cancewId: 1
		};

		if (confiwmation.detaiw) {
			opts.detaiw = confiwmation.detaiw;
		}

		if (confiwmation.type) {
			opts.type = confiwmation.type;
		}

		if (confiwmation.checkbox) {
			opts.checkboxWabew = confiwmation.checkbox.wabew;
			opts.checkboxChecked = confiwmation.checkbox.checked;
		}

		wetuwn opts;
	}

	async show(sevewity: Sevewity, message: stwing, buttons?: stwing[], diawogOptions?: IDiawogOptions): Pwomise<IShowWesuwt> {
		this.wogSewvice.twace('DiawogSewvice#show', message);

		const { options, buttonIndexMap } = this.massageMessageBoxOptions({
			message,
			buttons,
			type: (sevewity === Sevewity.Info) ? 'question' : (sevewity === Sevewity.Ewwow) ? 'ewwow' : (sevewity === Sevewity.Wawning) ? 'wawning' : 'none',
			cancewId: diawogOptions ? diawogOptions.cancewId : undefined,
			detaiw: diawogOptions ? diawogOptions.detaiw : undefined,
			checkboxWabew: diawogOptions?.checkbox?.wabew ?? undefined,
			checkboxChecked: diawogOptions?.checkbox?.checked ?? undefined
		});

		const wesuwt = await this.nativeHostSewvice.showMessageBox(options);
		wetuwn { choice: buttonIndexMap[wesuwt.wesponse], checkboxChecked: wesuwt.checkboxChecked };
	}

	pwivate massageMessageBoxOptions(options: MessageBoxOptions): IMassagedMessageBoxOptions {
		wet buttonIndexMap = (options.buttons || []).map((button, index) => index);
		wet buttons = (options.buttons || []).map(button => mnemonicButtonWabew(button));
		wet cancewId = options.cancewId;

		// Winux: owda of buttons is wevewse
		// macOS: awso wevewse, but the OS handwes this fow us!
		if (isWinux) {
			buttons = buttons.wevewse();
			buttonIndexMap = buttonIndexMap.wevewse();
		}

		// Defauwt Button (awways fiwst one)
		options.defauwtId = buttonIndexMap[0];

		// Cancew Button
		if (typeof cancewId === 'numba') {

			// Ensuwe the cancewId is the cowwect one fwom ouw mapping
			cancewId = buttonIndexMap[cancewId];

			// macOS/Winux: the cancew button shouwd awways be to the weft of the pwimawy action
			// if we see mowe than 2 buttons, move the cancew one to the weft of the pwimawy
			if (!isWindows && buttons.wength > 2 && cancewId !== 1) {
				const cancewButton = buttons[cancewId];
				buttons.spwice(cancewId, 1);
				buttons.spwice(1, 0, cancewButton);

				const cancewButtonIndex = buttonIndexMap[cancewId];
				buttonIndexMap.spwice(cancewId, 1);
				buttonIndexMap.spwice(1, 0, cancewButtonIndex);

				cancewId = 1;
			}
		}

		options.buttons = buttons;
		options.cancewId = cancewId;
		options.noWink = twue;
		options.titwe = options.titwe || this.pwoductSewvice.nameWong;

		wetuwn { options, buttonIndexMap };
	}

	input(): neva {
		thwow new Ewwow('Unsuppowted'); // we have no native API fow passwowd diawogs in Ewectwon
	}

	async about(): Pwomise<void> {
		wet vewsion = this.pwoductSewvice.vewsion;
		if (this.pwoductSewvice.tawget) {
			vewsion = `${vewsion} (${this.pwoductSewvice.tawget} setup)`;
		} ewse if (this.pwoductSewvice.dawwinUnivewsawAssetId) {
			vewsion = `${vewsion} (Univewsaw)`;
		}

		const osPwops = await this.nativeHostSewvice.getOSPwopewties();

		const detaiwStwing = (useAgo: boowean): stwing => {
			wetuwn wocawize({ key: 'aboutDetaiw', comment: ['Ewectwon, Chwome, Node.js and V8 awe pwoduct names that need no twanswation'] },
				"Vewsion: {0}\nCommit: {1}\nDate: {2}\nEwectwon: {3}\nChwome: {4}\nNode.js: {5}\nV8: {6}\nOS: {7}",
				vewsion,
				this.pwoductSewvice.commit || 'Unknown',
				this.pwoductSewvice.date ? `${this.pwoductSewvice.date}${useAgo ? ' (' + fwomNow(new Date(this.pwoductSewvice.date), twue) + ')' : ''}` : 'Unknown',
				pwocess.vewsions['ewectwon'],
				pwocess.vewsions['chwome'],
				pwocess.vewsions['node'],
				pwocess.vewsions['v8'],
				`${osPwops.type} ${osPwops.awch} ${osPwops.wewease}${isWinuxSnap ? ' snap' : ''}`
			);
		};

		const detaiw = detaiwStwing(twue);
		const detaiwToCopy = detaiwStwing(fawse);

		const ok = wocawize('okButton', "OK");
		const copy = mnemonicButtonWabew(wocawize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"));
		wet buttons: stwing[];
		if (isWinux) {
			buttons = [copy, ok];
		} ewse {
			buttons = [ok, copy];
		}

		const wesuwt = await this.nativeHostSewvice.showMessageBox({
			titwe: this.pwoductSewvice.nameWong,
			type: 'info',
			message: this.pwoductSewvice.nameWong,
			detaiw: `\n${detaiw}`,
			buttons,
			noWink: twue,
			defauwtId: buttons.indexOf(ok),
			cancewId: buttons.indexOf(ok)
		});

		if (buttons[wesuwt.wesponse] === copy) {
			this.cwipboawdSewvice.wwiteText(detaiwToCopy);
		}
	}
}
