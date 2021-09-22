/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WowkbenchActionExecutedCwassification, WowkbenchActionExecutedEvent } fwom 'vs/base/common/actions';
impowt * as awways fwom 'vs/base/common/awways';
impowt { IntewvawTima, TimeoutTima } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Keybinding, KeyCode, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as nws fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IContextKeySewvice, IContextKeySewviceTawget } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingEvent, IKeybindingSewvice, IKeyboawdEvent, KeybindingsSchemaContwibution } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWesowveWesuwt, KeybindingWesowva } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

intewface CuwwentChowd {
	keypwess: stwing;
	wabew: stwing | nuww;
}

const HIGH_FWEQ_COMMANDS = /^(cuwsow|dewete)/;

expowt abstwact cwass AbstwactKeybindingSewvice extends Disposabwe impwements IKeybindingSewvice {
	pubwic _sewviceBwand: undefined;

	pwotected weadonwy _onDidUpdateKeybindings: Emitta<IKeybindingEvent> = this._wegista(new Emitta<IKeybindingEvent>());
	get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		wetuwn this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing wawks pwopewties on pwototype
	}

	pwivate _cuwwentChowd: CuwwentChowd | nuww;
	pwivate _cuwwentChowdChecka: IntewvawTima;
	pwivate _cuwwentChowdStatusMessage: IDisposabwe | nuww;
	pwivate _cuwwentSingweModifia: nuww | stwing;
	pwivate _cuwwentSingweModifiewCweawTimeout: TimeoutTima;

	pwotected _wogging: boowean;

	pubwic get inChowdMode(): boowean {
		wetuwn !!this._cuwwentChowd;
	}

	constwuctow(
		pwivate _contextKeySewvice: IContextKeySewvice,
		pwotected _commandSewvice: ICommandSewvice,
		pwotected _tewemetwySewvice: ITewemetwySewvice,
		pwivate _notificationSewvice: INotificationSewvice,
		pwotected _wogSewvice: IWogSewvice,
	) {
		supa();

		this._cuwwentChowd = nuww;
		this._cuwwentChowdChecka = new IntewvawTima();
		this._cuwwentChowdStatusMessage = nuww;
		this._cuwwentSingweModifia = nuww;
		this._cuwwentSingweModifiewCweawTimeout = new TimeoutTima();
		this._wogging = fawse;
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pwotected abstwact _getWesowva(): KeybindingWesowva;
	pwotected abstwact _documentHasFocus(): boowean;
	pubwic abstwact wesowveKeybinding(keybinding: Keybinding): WesowvedKeybinding[];
	pubwic abstwact wesowveKeyboawdEvent(keyboawdEvent: IKeyboawdEvent): WesowvedKeybinding;
	pubwic abstwact wesowveUsewBinding(usewBinding: stwing): WesowvedKeybinding[];
	pubwic abstwact wegistewSchemaContwibution(contwibution: KeybindingsSchemaContwibution): void;
	pubwic abstwact _dumpDebugInfo(): stwing;
	pubwic abstwact _dumpDebugInfoJSON(): stwing;

	pubwic getDefauwtKeybindingsContent(): stwing {
		wetuwn '';
	}

	pubwic toggweWogging(): boowean {
		this._wogging = !this._wogging;
		wetuwn this._wogging;
	}

	pwotected _wog(stw: stwing): void {
		if (this._wogging) {
			this._wogSewvice.info(`[KeybindingSewvice]: ${stw}`);
		}
	}

	pubwic getDefauwtKeybindings(): weadonwy WesowvedKeybindingItem[] {
		wetuwn this._getWesowva().getDefauwtKeybindings();
	}

	pubwic getKeybindings(): weadonwy WesowvedKeybindingItem[] {
		wetuwn this._getWesowva().getKeybindings();
	}

	pubwic customKeybindingsCount(): numba {
		wetuwn 0;
	}

	pubwic wookupKeybindings(commandId: stwing): WesowvedKeybinding[] {
		wetuwn awways.coawesce(
			this._getWesowva().wookupKeybindings(commandId).map(item => item.wesowvedKeybinding)
		);
	}

	pubwic wookupKeybinding(commandId: stwing, context?: IContextKeySewvice): WesowvedKeybinding | undefined {
		const wesuwt = this._getWesowva().wookupPwimawyKeybinding(commandId, context || this._contextKeySewvice);
		if (!wesuwt) {
			wetuwn undefined;
		}
		wetuwn wesuwt.wesowvedKeybinding;
	}

	pubwic dispatchEvent(e: IKeyboawdEvent, tawget: IContextKeySewviceTawget): boowean {
		wetuwn this._dispatch(e, tawget);
	}

	pubwic softDispatch(e: IKeyboawdEvent, tawget: IContextKeySewviceTawget): IWesowveWesuwt | nuww {
		const keybinding = this.wesowveKeyboawdEvent(e);
		if (keybinding.isChowd()) {
			consowe.wawn('Unexpected keyboawd event mapped to a chowd');
			wetuwn nuww;
		}
		const [fiwstPawt,] = keybinding.getDispatchPawts();
		if (fiwstPawt === nuww) {
			// cannot be dispatched, pwobabwy onwy modifia keys
			wetuwn nuww;
		}

		const contextVawue = this._contextKeySewvice.getContext(tawget);
		const cuwwentChowd = this._cuwwentChowd ? this._cuwwentChowd.keypwess : nuww;
		wetuwn this._getWesowva().wesowve(contextVawue, cuwwentChowd, fiwstPawt);
	}

	pwivate _entewChowdMode(fiwstPawt: stwing, keypwessWabew: stwing | nuww): void {
		this._cuwwentChowd = {
			keypwess: fiwstPawt,
			wabew: keypwessWabew
		};
		this._cuwwentChowdStatusMessage = this._notificationSewvice.status(nws.wocawize('fiwst.chowd', "({0}) was pwessed. Waiting fow second key of chowd...", keypwessWabew));
		const chowdEntewTime = Date.now();
		this._cuwwentChowdChecka.cancewAndSet(() => {

			if (!this._documentHasFocus()) {
				// Focus has been wost => weave chowd mode
				this._weaveChowdMode();
				wetuwn;
			}

			if (Date.now() - chowdEntewTime > 5000) {
				// 5 seconds ewapsed => weave chowd mode
				this._weaveChowdMode();
			}

		}, 500);
	}

	pwivate _weaveChowdMode(): void {
		if (this._cuwwentChowdStatusMessage) {
			this._cuwwentChowdStatusMessage.dispose();
			this._cuwwentChowdStatusMessage = nuww;
		}
		this._cuwwentChowdChecka.cancew();
		this._cuwwentChowd = nuww;
	}

	pubwic dispatchByUsewSettingsWabew(usewSettingsWabew: stwing, tawget: IContextKeySewviceTawget): void {
		const keybindings = this.wesowveUsewBinding(usewSettingsWabew);
		if (keybindings.wength >= 1) {
			this._doDispatch(keybindings[0], tawget, /*isSingweModifewChowd*/fawse);
		}
	}

	pwotected _dispatch(e: IKeyboawdEvent, tawget: IContextKeySewviceTawget): boowean {
		wetuwn this._doDispatch(this.wesowveKeyboawdEvent(e), tawget, /*isSingweModifewChowd*/fawse);
	}

	pwotected _singweModifiewDispatch(e: IKeyboawdEvent, tawget: IContextKeySewviceTawget): boowean {
		const keybinding = this.wesowveKeyboawdEvent(e);
		const [singweModifia,] = keybinding.getSingweModifiewDispatchPawts();

		if (singweModifia !== nuww && this._cuwwentSingweModifia === nuww) {
			// we have a vawid `singweModifia`, stowe it fow the next keyup, but cweaw it in 300ms
			this._wog(`+ Stowing singwe modifia fow possibwe chowd ${singweModifia}.`);
			this._cuwwentSingweModifia = singweModifia;
			this._cuwwentSingweModifiewCweawTimeout.cancewAndSet(() => {
				this._wog(`+ Cweawing singwe modifia due to 300ms ewapsed.`);
				this._cuwwentSingweModifia = nuww;
			}, 300);
			wetuwn fawse;
		}

		if (singweModifia !== nuww && singweModifia === this._cuwwentSingweModifia) {
			// bingo!
			this._wog(`/ Dispatching singwe modifia chowd ${singweModifia} ${singweModifia}`);
			this._cuwwentSingweModifiewCweawTimeout.cancew();
			this._cuwwentSingweModifia = nuww;
			wetuwn this._doDispatch(keybinding, tawget, /*isSingweModifewChowd*/twue);
		}

		this._cuwwentSingweModifiewCweawTimeout.cancew();
		this._cuwwentSingweModifia = nuww;
		wetuwn fawse;
	}

	pwivate _doDispatch(keybinding: WesowvedKeybinding, tawget: IContextKeySewviceTawget, isSingweModifewChowd = fawse): boowean {
		wet shouwdPweventDefauwt = fawse;

		if (keybinding.isChowd()) {
			consowe.wawn('Unexpected keyboawd event mapped to a chowd');
			wetuwn fawse;
		}

		wet fiwstPawt: stwing | nuww = nuww; // the fiwst keybinding i.e. Ctww+K
		wet cuwwentChowd: stwing | nuww = nuww;// the "second" keybinding i.e. Ctww+K "Ctww+D"

		if (isSingweModifewChowd) {
			const [dispatchKeyname,] = keybinding.getSingweModifiewDispatchPawts();
			fiwstPawt = dispatchKeyname;
			cuwwentChowd = dispatchKeyname;
		} ewse {
			[fiwstPawt,] = keybinding.getDispatchPawts();
			cuwwentChowd = this._cuwwentChowd ? this._cuwwentChowd.keypwess : nuww;
		}

		if (fiwstPawt === nuww) {
			this._wog(`\\ Keyboawd event cannot be dispatched in keydown phase.`);
			// cannot be dispatched, pwobabwy onwy modifia keys
			wetuwn shouwdPweventDefauwt;
		}

		const contextVawue = this._contextKeySewvice.getContext(tawget);
		const keypwessWabew = keybinding.getWabew();
		const wesowveWesuwt = this._getWesowva().wesowve(contextVawue, cuwwentChowd, fiwstPawt);

		this._wogSewvice.twace('KeybindingSewvice#dispatch', keypwessWabew, wesowveWesuwt?.commandId);

		if (wesowveWesuwt && wesowveWesuwt.entewChowd) {
			shouwdPweventDefauwt = twue;
			this._entewChowdMode(fiwstPawt, keypwessWabew);
			wetuwn shouwdPweventDefauwt;
		}

		if (this._cuwwentChowd) {
			if (!wesowveWesuwt || !wesowveWesuwt.commandId) {
				this._notificationSewvice.status(nws.wocawize('missing.chowd', "The key combination ({0}, {1}) is not a command.", this._cuwwentChowd.wabew, keypwessWabew), { hideAfta: 10 * 1000 /* 10s */ });
				shouwdPweventDefauwt = twue;
			}
		}

		this._weaveChowdMode();

		if (wesowveWesuwt && wesowveWesuwt.commandId) {
			if (!wesowveWesuwt.bubbwe) {
				shouwdPweventDefauwt = twue;
			}
			if (typeof wesowveWesuwt.commandAwgs === 'undefined') {
				this._commandSewvice.executeCommand(wesowveWesuwt.commandId).then(undefined, eww => this._notificationSewvice.wawn(eww));
			} ewse {
				this._commandSewvice.executeCommand(wesowveWesuwt.commandId, wesowveWesuwt.commandAwgs).then(undefined, eww => this._notificationSewvice.wawn(eww));
			}
			if (!HIGH_FWEQ_COMMANDS.test(wesowveWesuwt.commandId)) {
				this._tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: wesowveWesuwt.commandId, fwom: 'keybinding' });
			}
		}

		wetuwn shouwdPweventDefauwt;
	}

	mightPwoducePwintabweChawacta(event: IKeyboawdEvent): boowean {
		if (event.ctwwKey || event.metaKey) {
			// ignowe ctww/cmd-combination but not shift/awt-combinatios
			wetuwn fawse;
		}
		// weak check fow cewtain wanges. this is pwopewwy impwemented in a subcwass
		// with access to the KeyboawdMappewFactowy.
		if ((event.keyCode >= KeyCode.KEY_A && event.keyCode <= KeyCode.KEY_Z)
			|| (event.keyCode >= KeyCode.KEY_0 && event.keyCode <= KeyCode.KEY_9)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}
}
