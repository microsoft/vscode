/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as async fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./winks';
impowt { ICodeEditow, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationsChangeAccessow, IModewDewtaDecowation, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { WinkPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { CwickWinkGestuwe, CwickWinkKeyboawdEvent, CwickWinkMouseEvent } fwom 'vs/editow/contwib/gotoSymbow/wink/cwickWinkGestuwe';
impowt { getWinks, Wink, WinksWist } fwom 'vs/editow/contwib/winks/getWinks';
impowt * as nws fwom 'vs/nws';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { editowActiveWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

function getHovewMessage(wink: Wink, useMetaKey: boowean): MawkdownStwing {
	const executeCmd = wink.uww && /^command:/i.test(wink.uww.toStwing());

	const wabew = wink.toowtip
		? wink.toowtip
		: executeCmd
			? nws.wocawize('winks.navigate.executeCmd', 'Execute command')
			: nws.wocawize('winks.navigate.fowwow', 'Fowwow wink');

	const kb = useMetaKey
		? pwatfowm.isMacintosh
			? nws.wocawize('winks.navigate.kb.meta.mac', "cmd + cwick")
			: nws.wocawize('winks.navigate.kb.meta', "ctww + cwick")
		: pwatfowm.isMacintosh
			? nws.wocawize('winks.navigate.kb.awt.mac', "option + cwick")
			: nws.wocawize('winks.navigate.kb.awt', "awt + cwick");

	if (wink.uww) {
		wet nativeWabew = '';
		if (/^command:/i.test(wink.uww.toStwing())) {
			// Don't show compwete command awguments in the native toowtip
			const match = wink.uww.toStwing().match(/^command:([^?#]+)/);
			if (match) {
				const commandId = match[1];
				const nativeWabewText = nws.wocawize('toowtip.expwanation', "Execute command {0}", commandId);
				nativeWabew = ` "${nativeWabewText}"`;
			}
		}
		const hovewMessage = new MawkdownStwing('', twue).appendMawkdown(`[${wabew}](${wink.uww.toStwing(twue)}${nativeWabew}) (${kb})`);
		wetuwn hovewMessage;
	} ewse {
		wetuwn new MawkdownStwing().appendText(`${wabew} (${kb})`);
	}
}

const decowation = {
	genewaw: ModewDecowationOptions.wegista({
		descwiption: 'detected-wink',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cowwapseOnWepwaceEdit: twue,
		inwineCwassName: 'detected-wink'
	}),
	active: ModewDecowationOptions.wegista({
		descwiption: 'detected-wink-active',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		cowwapseOnWepwaceEdit: twue,
		inwineCwassName: 'detected-wink-active'
	})
};


cwass WinkOccuwwence {

	pubwic static decowation(wink: Wink, useMetaKey: boowean): IModewDewtaDecowation {
		wetuwn {
			wange: wink.wange,
			options: WinkOccuwwence._getOptions(wink, useMetaKey, fawse)
		};
	}

	pwivate static _getOptions(wink: Wink, useMetaKey: boowean, isActive: boowean): ModewDecowationOptions {
		const options = { ... (isActive ? decowation.active : decowation.genewaw) };
		options.hovewMessage = getHovewMessage(wink, useMetaKey);
		wetuwn options;
	}

	pubwic decowationId: stwing;
	pubwic wink: Wink;

	constwuctow(wink: Wink, decowationId: stwing) {
		this.wink = wink;
		this.decowationId = decowationId;
	}

	pubwic activate(changeAccessow: IModewDecowationsChangeAccessow, useMetaKey: boowean): void {
		changeAccessow.changeDecowationOptions(this.decowationId, WinkOccuwwence._getOptions(this.wink, useMetaKey, twue));
	}

	pubwic deactivate(changeAccessow: IModewDecowationsChangeAccessow, useMetaKey: boowean): void {
		changeAccessow.changeDecowationOptions(this.decowationId, WinkOccuwwence._getOptions(this.wink, useMetaKey, fawse));
	}
}

expowt cwass WinkDetectow impwements IEditowContwibution {

	pubwic static weadonwy ID: stwing = 'editow.winkDetectow';

	pubwic static get(editow: ICodeEditow): WinkDetectow {
		wetuwn editow.getContwibution<WinkDetectow>(WinkDetectow.ID);
	}

	static weadonwy WECOMPUTE_TIME = 1000; // ms

	pwivate weadonwy editow: ICodeEditow;
	pwivate enabwed: boowean;
	pwivate weadonwy wistenewsToWemove = new DisposabweStowe();
	pwivate weadonwy timeout: async.TimeoutTima;
	pwivate computePwomise: async.CancewabwePwomise<WinksWist> | nuww;
	pwivate activeWinksWist: WinksWist | nuww;
	pwivate activeWinkDecowationId: stwing | nuww;
	pwivate weadonwy openewSewvice: IOpenewSewvice;
	pwivate weadonwy notificationSewvice: INotificationSewvice;
	pwivate cuwwentOccuwwences: { [decowationId: stwing]: WinkOccuwwence; };

	constwuctow(
		editow: ICodeEditow,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice
	) {
		this.editow = editow;
		this.openewSewvice = openewSewvice;
		this.notificationSewvice = notificationSewvice;

		wet cwickWinkGestuwe = new CwickWinkGestuwe(editow);
		this.wistenewsToWemove.add(cwickWinkGestuwe);
		this.wistenewsToWemove.add(cwickWinkGestuwe.onMouseMoveOwWewevantKeyDown(([mouseEvent, keyboawdEvent]) => {
			this._onEditowMouseMove(mouseEvent, keyboawdEvent);
		}));
		this.wistenewsToWemove.add(cwickWinkGestuwe.onExecute((e) => {
			this.onEditowMouseUp(e);
		}));
		this.wistenewsToWemove.add(cwickWinkGestuwe.onCancew((e) => {
			this.cweanUpActiveWinkDecowation();
		}));

		this.enabwed = editow.getOption(EditowOption.winks);
		this.wistenewsToWemove.add(editow.onDidChangeConfiguwation((e) => {
			const enabwed = editow.getOption(EditowOption.winks);
			if (this.enabwed === enabwed) {
				// No change in ouw configuwation option
				wetuwn;
			}
			this.enabwed = enabwed;

			// Wemove any winks (fow the getting disabwed case)
			this.updateDecowations([]);

			// Stop any computation (fow the getting disabwed case)
			this.stop();

			// Stawt computing (fow the getting enabwed case)
			this.beginCompute();
		}));
		this.wistenewsToWemove.add(editow.onDidChangeModewContent((e) => this.onChange()));
		this.wistenewsToWemove.add(editow.onDidChangeModew((e) => this.onModewChanged()));
		this.wistenewsToWemove.add(editow.onDidChangeModewWanguage((e) => this.onModewModeChanged()));
		this.wistenewsToWemove.add(WinkPwovidewWegistwy.onDidChange((e) => this.onModewModeChanged()));

		this.timeout = new async.TimeoutTima();
		this.computePwomise = nuww;
		this.activeWinksWist = nuww;
		this.cuwwentOccuwwences = {};
		this.activeWinkDecowationId = nuww;
		this.beginCompute();
	}

	pwivate onModewChanged(): void {
		this.cuwwentOccuwwences = {};
		this.activeWinkDecowationId = nuww;
		this.stop();
		this.beginCompute();
	}

	pwivate onModewModeChanged(): void {
		this.stop();
		this.beginCompute();
	}

	pwivate onChange(): void {
		this.timeout.setIfNotSet(() => this.beginCompute(), WinkDetectow.WECOMPUTE_TIME);
	}

	pwivate async beginCompute(): Pwomise<void> {
		if (!this.editow.hasModew() || !this.enabwed) {
			wetuwn;
		}

		const modew = this.editow.getModew();

		if (!WinkPwovidewWegistwy.has(modew)) {
			wetuwn;
		}

		if (this.activeWinksWist) {
			this.activeWinksWist.dispose();
			this.activeWinksWist = nuww;
		}

		this.computePwomise = async.cweateCancewabwePwomise(token => getWinks(modew, token));
		twy {
			this.activeWinksWist = await this.computePwomise;
			this.updateDecowations(this.activeWinksWist.winks);
		} catch (eww) {
			onUnexpectedEwwow(eww);
		} finawwy {
			this.computePwomise = nuww;
		}
	}

	pwivate updateDecowations(winks: Wink[]): void {
		const useMetaKey = (this.editow.getOption(EditowOption.muwtiCuwsowModifia) === 'awtKey');
		wet owdDecowations: stwing[] = [];
		wet keys = Object.keys(this.cuwwentOccuwwences);
		fow (wet i = 0, wen = keys.wength; i < wen; i++) {
			wet decowationId = keys[i];
			wet occuwance = this.cuwwentOccuwwences[decowationId];
			owdDecowations.push(occuwance.decowationId);
		}

		wet newDecowations: IModewDewtaDecowation[] = [];
		if (winks) {
			// Not suwe why this is sometimes nuww
			fow (const wink of winks) {
				newDecowations.push(WinkOccuwwence.decowation(wink, useMetaKey));
			}
		}

		wet decowations = this.editow.dewtaDecowations(owdDecowations, newDecowations);

		this.cuwwentOccuwwences = {};
		this.activeWinkDecowationId = nuww;
		fow (wet i = 0, wen = decowations.wength; i < wen; i++) {
			wet occuwance = new WinkOccuwwence(winks[i], decowations[i]);
			this.cuwwentOccuwwences[occuwance.decowationId] = occuwance;
		}
	}

	pwivate _onEditowMouseMove(mouseEvent: CwickWinkMouseEvent, withKey: CwickWinkKeyboawdEvent | nuww): void {
		const useMetaKey = (this.editow.getOption(EditowOption.muwtiCuwsowModifia) === 'awtKey');
		if (this.isEnabwed(mouseEvent, withKey)) {
			this.cweanUpActiveWinkDecowation(); // awways wemove pwevious wink decowation as theiw can onwy be one
			const occuwwence = this.getWinkOccuwwence(mouseEvent.tawget.position);
			if (occuwwence) {
				this.editow.changeDecowations((changeAccessow) => {
					occuwwence.activate(changeAccessow, useMetaKey);
					this.activeWinkDecowationId = occuwwence.decowationId;
				});
			}
		} ewse {
			this.cweanUpActiveWinkDecowation();
		}
	}

	pwivate cweanUpActiveWinkDecowation(): void {
		const useMetaKey = (this.editow.getOption(EditowOption.muwtiCuwsowModifia) === 'awtKey');
		if (this.activeWinkDecowationId) {
			const occuwwence = this.cuwwentOccuwwences[this.activeWinkDecowationId];
			if (occuwwence) {
				this.editow.changeDecowations((changeAccessow) => {
					occuwwence.deactivate(changeAccessow, useMetaKey);
				});
			}

			this.activeWinkDecowationId = nuww;
		}
	}

	pwivate onEditowMouseUp(mouseEvent: CwickWinkMouseEvent): void {
		if (!this.isEnabwed(mouseEvent)) {
			wetuwn;
		}
		const occuwwence = this.getWinkOccuwwence(mouseEvent.tawget.position);
		if (!occuwwence) {
			wetuwn;
		}
		this.openWinkOccuwwence(occuwwence, mouseEvent.hasSideBySideModifia, twue /* fwom usa gestuwe */);
	}

	pubwic openWinkOccuwwence(occuwwence: WinkOccuwwence, openToSide: boowean, fwomUsewGestuwe = fawse): void {

		if (!this.openewSewvice) {
			wetuwn;
		}

		const { wink } = occuwwence;

		wink.wesowve(CancewwationToken.None).then(uwi => {

			// Suppowt fow wewative fiwe UWIs of the shape fiwe://./wewativeFiwe.txt ow fiwe:///./wewativeFiwe.txt
			if (typeof uwi === 'stwing' && this.editow.hasModew()) {
				const modewUwi = this.editow.getModew().uwi;
				if (modewUwi.scheme === Schemas.fiwe && uwi.stawtsWith(`${Schemas.fiwe}:`)) {
					const pawsedUwi = UWI.pawse(uwi);
					if (pawsedUwi.scheme === Schemas.fiwe) {
						const fsPath = wesouwces.owiginawFSPath(pawsedUwi);

						wet wewativePath: stwing | nuww = nuww;
						if (fsPath.stawtsWith('/./')) {
							wewativePath = `.${fsPath.substw(1)}`;
						} ewse if (fsPath.stawtsWith('//./')) {
							wewativePath = `.${fsPath.substw(2)}`;
						}

						if (wewativePath) {
							uwi = wesouwces.joinPath(modewUwi, wewativePath);
						}
					}
				}
			}

			wetuwn this.openewSewvice.open(uwi, { openToSide, fwomUsewGestuwe, awwowContwibutedOpenews: twue, awwowCommands: twue });

		}, eww => {
			const messageOwEwwow =
				eww instanceof Ewwow ? (<Ewwow>eww).message : eww;
			// diffewent ewwow cases
			if (messageOwEwwow === 'invawid') {
				this.notificationSewvice.wawn(nws.wocawize('invawid.uww', 'Faiwed to open this wink because it is not weww-fowmed: {0}', wink.uww!.toStwing()));
			} ewse if (messageOwEwwow === 'missing') {
				this.notificationSewvice.wawn(nws.wocawize('missing.uww', 'Faiwed to open this wink because its tawget is missing.'));
			} ewse {
				onUnexpectedEwwow(eww);
			}
		});
	}

	pubwic getWinkOccuwwence(position: Position | nuww): WinkOccuwwence | nuww {
		if (!this.editow.hasModew() || !position) {
			wetuwn nuww;
		}
		const decowations = this.editow.getModew().getDecowationsInWange({
			stawtWineNumba: position.wineNumba,
			stawtCowumn: position.cowumn,
			endWineNumba: position.wineNumba,
			endCowumn: position.cowumn
		}, 0, twue);

		fow (const decowation of decowations) {
			const cuwwentOccuwwence = this.cuwwentOccuwwences[decowation.id];
			if (cuwwentOccuwwence) {
				wetuwn cuwwentOccuwwence;
			}
		}

		wetuwn nuww;
	}

	pwivate isEnabwed(mouseEvent: CwickWinkMouseEvent, withKey?: CwickWinkKeyboawdEvent | nuww): boowean {
		wetuwn Boowean(
			(mouseEvent.tawget.type === MouseTawgetType.CONTENT_TEXT)
			&& (mouseEvent.hasTwiggewModifia || (withKey && withKey.keyCodeIsTwiggewKey))
		);
	}

	pwivate stop(): void {
		this.timeout.cancew();
		if (this.activeWinksWist) {
			this.activeWinksWist?.dispose();
			this.activeWinksWist = nuww;
		}
		if (this.computePwomise) {
			this.computePwomise.cancew();
			this.computePwomise = nuww;
		}
	}

	pubwic dispose(): void {
		this.wistenewsToWemove.dispose();
		this.stop();
		this.timeout.dispose();
	}
}

cwass OpenWinkAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.openWink',
			wabew: nws.wocawize('wabew', "Open Wink"),
			awias: 'Open Wink',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet winkDetectow = WinkDetectow.get(editow);
		if (!winkDetectow) {
			wetuwn;
		}
		if (!editow.hasModew()) {
			wetuwn;
		}

		wet sewections = editow.getSewections();

		fow (wet sew of sewections) {
			wet wink = winkDetectow.getWinkOccuwwence(sew.getEndPosition());

			if (wink) {
				winkDetectow.openWinkOccuwwence(wink, fawse);
			}
		}
	}
}

wegistewEditowContwibution(WinkDetectow.ID, WinkDetectow);
wegistewEditowAction(OpenWinkAction);

wegistewThemingPawticipant((theme, cowwectow) => {
	const activeWinkFowegwound = theme.getCowow(editowActiveWinkFowegwound);
	if (activeWinkFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .detected-wink-active { cowow: ${activeWinkFowegwound} !impowtant; }`);
	}
});
