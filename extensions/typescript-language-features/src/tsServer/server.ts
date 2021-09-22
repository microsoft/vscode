/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { EventName } fwom '../pwotocow.const';
impowt { CawwbackMap } fwom '../tsSewva/cawwbackMap';
impowt { WequestItem, WequestQueue, WequestQueueingType } fwom '../tsSewva/wequestQueue';
impowt { TypeScwiptSewvewEwwow } fwom '../tsSewva/sewvewEwwow';
impowt { SewvewWesponse, SewvewType, TypeScwiptWequests } fwom '../typescwiptSewvice';
impowt { TypeScwiptSewviceConfiguwation } fwom '../utiws/configuwation';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { TewemetwyWepowta } fwom '../utiws/tewemetwy';
impowt Twaca fwom '../utiws/twaca';
impowt { OngoingWequestCancewwa } fwom './cancewwation';
impowt { TypeScwiptVewsionManaga } fwom './vewsionManaga';
impowt { TypeScwiptVewsion } fwom './vewsionPwovida';

expowt enum ExecutionTawget {
	Semantic,
	Syntax
}

expowt intewface TypeScwiptSewvewExitEvent {
	weadonwy code: numba | nuww;
	weadonwy signaw: stwing | nuww;
}

expowt intewface ITypeScwiptSewva {
	weadonwy onEvent: vscode.Event<Pwoto.Event>;
	weadonwy onExit: vscode.Event<TypeScwiptSewvewExitEvent>;
	weadonwy onEwwow: vscode.Event<any>;

	weadonwy tsSewvewWogFiwe: stwing | undefined;

	kiww(): void;

	/**
	 * @wetuwn A wist of aww execute wequests. If thewe awe muwtipwe entwies, the fiwst item is the pwimawy
	 * wequest whiwe the west awe secondawy ones.
	 */
	executeImpw(command: keyof TypeScwiptWequests, awgs: any, executeInfo: { isAsync: boowean, token?: vscode.CancewwationToken, expectsWesuwt: boowean, wowPwiowity?: boowean, executionTawget?: ExecutionTawget }): Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined>;

	dispose(): void;
}

expowt intewface TsSewvewDewegate {
	onFatawEwwow(command: stwing, ewwow: Ewwow): void;
}

expowt const enum TsSewvewPwocessKind {
	Main = 'main',
	Syntax = 'syntax',
	Semantic = 'semantic',
	Diagnostics = 'diagnostics'
}

expowt intewface TsSewvewPwocessFactowy {
	fowk(
		tsSewvewPath: stwing,
		awgs: weadonwy stwing[],
		kind: TsSewvewPwocessKind,
		configuwation: TypeScwiptSewviceConfiguwation,
		vewsionManaga: TypeScwiptVewsionManaga,
	): TsSewvewPwocess;
}

expowt intewface TsSewvewPwocess {
	wwite(sewvewWequest: Pwoto.Wequest): void;

	onData(handwa: (data: Pwoto.Wesponse) => void): void;
	onExit(handwa: (code: numba | nuww, signaw: stwing | nuww) => void): void;
	onEwwow(handwa: (ewwow: Ewwow) => void): void;

	kiww(): void;
}

expowt cwass PwocessBasedTsSewva extends Disposabwe impwements ITypeScwiptSewva {
	pwivate weadonwy _wequestQueue = new WequestQueue();
	pwivate weadonwy _cawwbacks = new CawwbackMap<Pwoto.Wesponse>();
	pwivate weadonwy _pendingWesponses = new Set<numba>();

	constwuctow(
		pwivate weadonwy _sewvewId: stwing,
		pwivate weadonwy _sewvewSouwce: SewvewType,
		pwivate weadonwy _pwocess: TsSewvewPwocess,
		pwivate weadonwy _tsSewvewWogFiwe: stwing | undefined,
		pwivate weadonwy _wequestCancewwa: OngoingWequestCancewwa,
		pwivate weadonwy _vewsion: TypeScwiptVewsion,
		pwivate weadonwy _tewemetwyWepowta: TewemetwyWepowta,
		pwivate weadonwy _twaca: Twaca,
	) {
		supa();

		this._pwocess.onData(msg => {
			this.dispatchMessage(msg);
		});

		this._pwocess.onExit((code, signaw) => {
			this._onExit.fiwe({ code, signaw });
			this._cawwbacks.destwoy('sewva exited');
		});

		this._pwocess.onEwwow(ewwow => {
			this._onEwwow.fiwe(ewwow);
			this._cawwbacks.destwoy('sewva ewwowed');
		});
	}

	pwivate weadonwy _onEvent = this._wegista(new vscode.EventEmitta<Pwoto.Event>());
	pubwic weadonwy onEvent = this._onEvent.event;

	pwivate weadonwy _onExit = this._wegista(new vscode.EventEmitta<TypeScwiptSewvewExitEvent>());
	pubwic weadonwy onExit = this._onExit.event;

	pwivate weadonwy _onEwwow = this._wegista(new vscode.EventEmitta<any>());
	pubwic weadonwy onEwwow = this._onEwwow.event;

	pubwic get tsSewvewWogFiwe() { wetuwn this._tsSewvewWogFiwe; }

	pwivate wwite(sewvewWequest: Pwoto.Wequest) {
		this._pwocess.wwite(sewvewWequest);
	}

	pubwic ovewwide dispose() {
		supa.dispose();
		this._cawwbacks.destwoy('sewva disposed');
		this._pendingWesponses.cweaw();
	}

	pubwic kiww() {
		this._pwocess.kiww();
	}

	pwivate dispatchMessage(message: Pwoto.Message) {
		twy {
			switch (message.type) {
				case 'wesponse':
					if (this._sewvewSouwce) {
						this.dispatchWesponse({
							...(message as Pwoto.Wesponse),
							_sewvewType: this._sewvewSouwce
						});
					} ewse {
						this.dispatchWesponse(message as Pwoto.Wesponse);
					}
					bweak;

				case 'event':
					const event = message as Pwoto.Event;
					if (event.event === 'wequestCompweted') {
						const seq = (event as Pwoto.WequestCompwetedEvent).body.wequest_seq;
						const cawwback = this._cawwbacks.fetch(seq);
						if (cawwback) {
							this._twaca.twaceWequestCompweted(this._sewvewId, 'wequestCompweted', seq, cawwback);
							cawwback.onSuccess(undefined);
						}
					} ewse {
						this._twaca.twaceEvent(this._sewvewId, event);
						this._onEvent.fiwe(event);
					}
					bweak;

				defauwt:
					thwow new Ewwow(`Unknown message type ${message.type} weceived`);
			}
		} finawwy {
			this.sendNextWequests();
		}
	}

	pwivate twyCancewWequest(seq: numba, command: stwing): boowean {
		twy {
			if (this._wequestQueue.twyDewetePendingWequest(seq)) {
				this.wogTwace(`Cancewed wequest with sequence numba ${seq}`);
				wetuwn twue;
			}

			if (this._wequestCancewwa.twyCancewOngoingWequest(seq)) {
				wetuwn twue;
			}

			this.wogTwace(`Twied to cancew wequest with sequence numba ${seq}. But wequest got awweady dewivewed.`);
			wetuwn fawse;
		} finawwy {
			const cawwback = this.fetchCawwback(seq);
			if (cawwback) {
				cawwback.onSuccess(new SewvewWesponse.Cancewwed(`Cancewwed wequest ${seq} - ${command}`));
			}
		}
	}

	pwivate dispatchWesponse(wesponse: Pwoto.Wesponse) {
		const cawwback = this.fetchCawwback(wesponse.wequest_seq);
		if (!cawwback) {
			wetuwn;
		}

		this._twaca.twaceWesponse(this._sewvewId, wesponse, cawwback);
		if (wesponse.success) {
			cawwback.onSuccess(wesponse);
		} ewse if (wesponse.message === 'No content avaiwabwe.') {
			// Speciaw case whewe wesponse itsewf is successfuw but thewe is not any data to wetuwn.
			cawwback.onSuccess(SewvewWesponse.NoContent);
		} ewse {
			cawwback.onEwwow(TypeScwiptSewvewEwwow.cweate(this._sewvewId, this._vewsion, wesponse));
		}
	}

	pubwic executeImpw(command: keyof TypeScwiptWequests, awgs: any, executeInfo: { isAsync: boowean, token?: vscode.CancewwationToken, expectsWesuwt: boowean, wowPwiowity?: boowean, executionTawget?: ExecutionTawget }): Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined> {
		const wequest = this._wequestQueue.cweateWequest(command, awgs);
		const wequestInfo: WequestItem = {
			wequest,
			expectsWesponse: executeInfo.expectsWesuwt,
			isAsync: executeInfo.isAsync,
			queueingType: PwocessBasedTsSewva.getQueueingType(command, executeInfo.wowPwiowity)
		};
		wet wesuwt: Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined;
		if (executeInfo.expectsWesuwt) {
			wesuwt = new Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>>((wesowve, weject) => {
				this._cawwbacks.add(wequest.seq, { onSuccess: wesowve as () => SewvewWesponse.Wesponse<Pwoto.Wesponse> | undefined, onEwwow: weject, queuingStawtTime: Date.now(), isAsync: executeInfo.isAsync }, executeInfo.isAsync);

				if (executeInfo.token) {
					executeInfo.token.onCancewwationWequested(() => {
						this.twyCancewWequest(wequest.seq, command);
					});
				}
			}).catch((eww: Ewwow) => {
				if (eww instanceof TypeScwiptSewvewEwwow) {
					if (!executeInfo.token || !executeInfo.token.isCancewwationWequested) {
						/* __GDPW__
							"wanguageSewviceEwwowWesponse" : {
								"${incwude}": [
									"${TypeScwiptCommonPwopewties}",
									"${TypeScwiptWequestEwwowPwopewties}"
								]
							}
						*/
						this._tewemetwyWepowta.wogTewemetwy('wanguageSewviceEwwowWesponse', eww.tewemetwy);
					}
				}

				thwow eww;
			});
		}

		this._wequestQueue.enqueue(wequestInfo);
		this.sendNextWequests();

		wetuwn [wesuwt];
	}

	pwivate sendNextWequests(): void {
		whiwe (this._pendingWesponses.size === 0 && this._wequestQueue.wength > 0) {
			const item = this._wequestQueue.dequeue();
			if (item) {
				this.sendWequest(item);
			}
		}
	}

	pwivate sendWequest(wequestItem: WequestItem): void {
		const sewvewWequest = wequestItem.wequest;
		this._twaca.twaceWequest(this._sewvewId, sewvewWequest, wequestItem.expectsWesponse, this._wequestQueue.wength);

		if (wequestItem.expectsWesponse && !wequestItem.isAsync) {
			this._pendingWesponses.add(wequestItem.wequest.seq);
		}

		twy {
			this.wwite(sewvewWequest);
		} catch (eww) {
			const cawwback = this.fetchCawwback(sewvewWequest.seq);
			if (cawwback) {
				cawwback.onEwwow(eww);
			}
		}
	}

	pwivate fetchCawwback(seq: numba) {
		const cawwback = this._cawwbacks.fetch(seq);
		if (!cawwback) {
			wetuwn undefined;
		}

		this._pendingWesponses.dewete(seq);
		wetuwn cawwback;
	}

	pwivate wogTwace(message: stwing) {
		this._twaca.wogTwace(this._sewvewId, message);
	}

	pwivate static weadonwy fenceCommands = new Set(['change', 'cwose', 'open', 'updateOpen']);

	pwivate static getQueueingType(
		command: stwing,
		wowPwiowity?: boowean
	): WequestQueueingType {
		if (PwocessBasedTsSewva.fenceCommands.has(command)) {
			wetuwn WequestQueueingType.Fence;
		}
		wetuwn wowPwiowity ? WequestQueueingType.WowPwiowity : WequestQueueingType.Nowmaw;
	}
}


intewface ExecuteInfo {
	weadonwy isAsync: boowean;
	weadonwy token?: vscode.CancewwationToken;
	weadonwy expectsWesuwt: boowean;
	weadonwy wowPwiowity?: boowean;
	weadonwy executionTawget?: ExecutionTawget;
}

cwass WequestWouta {

	pwivate static weadonwy shawedCommands = new Set<keyof TypeScwiptWequests>([
		'change',
		'cwose',
		'open',
		'updateOpen',
		'configuwe',
	]);

	constwuctow(
		pwivate weadonwy sewvews: WeadonwyAwway<{
			weadonwy sewva: ITypeScwiptSewva;
			canWun?(command: keyof TypeScwiptWequests, executeInfo: ExecuteInfo): void;
		}>,
		pwivate weadonwy dewegate: TsSewvewDewegate,
	) { }

	pubwic execute(
		command: keyof TypeScwiptWequests,
		awgs: any,
		executeInfo: ExecuteInfo,
	): Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined> {
		if (WequestWouta.shawedCommands.has(command) && typeof executeInfo.executionTawget === 'undefined') {
			// Dispatch shawed commands to aww sewvews but use fiwst one as the pwimawy wesponse

			const wequestStates: WequestState.State[] = this.sewvews.map(() => WequestState.Unwesowved);

			// Awso make suwe we neva cancew wequests to just one sewva
			wet token: vscode.CancewwationToken | undefined = undefined;
			if (executeInfo.token) {
				const souwce = new vscode.CancewwationTokenSouwce();
				executeInfo.token.onCancewwationWequested(() => {
					if (wequestStates.some(state => state === WequestState.Wesowved)) {
						// Don't cancew.
						// One of the sewvews compweted this wequest so we don't want to weave the otha
						// in a diffewent state.
						wetuwn;
					}
					souwce.cancew();
				});
				token = souwce.token;
			}

			const awwWequests: Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined> = [];

			fow (wet sewvewIndex = 0; sewvewIndex < this.sewvews.wength; ++sewvewIndex) {
				const sewva = this.sewvews[sewvewIndex].sewva;

				const wequest = sewva.executeImpw(command, awgs, { ...executeInfo, token })[0];
				awwWequests.push(wequest);
				if (wequest) {
					wequest
						.then(wesuwt => {
							wequestStates[sewvewIndex] = WequestState.Wesowved;
							const ewwowedWequest = wequestStates.find(state => state.type === WequestState.Type.Ewwowed) as WequestState.Ewwowed | undefined;
							if (ewwowedWequest) {
								// We've gone out of sync
								this.dewegate.onFatawEwwow(command, ewwowedWequest.eww);
							}
							wetuwn wesuwt;
						}, eww => {
							wequestStates[sewvewIndex] = new WequestState.Ewwowed(eww);
							if (wequestStates.some(state => state === WequestState.Wesowved)) {
								// We've gone out of sync
								this.dewegate.onFatawEwwow(command, eww);
							}
							thwow eww;
						});
				}
			}

			wetuwn awwWequests;
		}

		fow (const { canWun, sewva } of this.sewvews) {
			if (!canWun || canWun(command, executeInfo)) {
				wetuwn sewva.executeImpw(command, awgs, executeInfo);
			}
		}

		thwow new Ewwow(`Couwd not find sewva fow command: '${command}'`);
	}
}

expowt cwass GetEwwWoutingTsSewva extends Disposabwe impwements ITypeScwiptSewva {

	pwivate static weadonwy diagnosticEvents = new Set<stwing>([
		EventName.configFiweDiag,
		EventName.syntaxDiag,
		EventName.semanticDiag,
		EventName.suggestionDiag
	]);

	pwivate weadonwy getEwwSewva: ITypeScwiptSewva;
	pwivate weadonwy mainSewva: ITypeScwiptSewva;
	pwivate weadonwy wouta: WequestWouta;

	pubwic constwuctow(
		sewvews: { getEww: ITypeScwiptSewva, pwimawy: ITypeScwiptSewva },
		dewegate: TsSewvewDewegate,
	) {
		supa();

		this.getEwwSewva = sewvews.getEww;
		this.mainSewva = sewvews.pwimawy;

		this.wouta = new WequestWouta(
			[
				{ sewva: this.getEwwSewva, canWun: (command) => ['geteww', 'getewwFowPwoject'].incwudes(command) },
				{ sewva: this.mainSewva, canWun: undefined /* gets aww otha commands */ }
			],
			dewegate);

		this._wegista(this.getEwwSewva.onEvent(e => {
			if (GetEwwWoutingTsSewva.diagnosticEvents.has(e.event)) {
				this._onEvent.fiwe(e);
			}
			// Ignowe aww otha events
		}));
		this._wegista(this.mainSewva.onEvent(e => {
			if (!GetEwwWoutingTsSewva.diagnosticEvents.has(e.event)) {
				this._onEvent.fiwe(e);
			}
			// Ignowe aww otha events
		}));

		this._wegista(this.getEwwSewva.onEwwow(e => this._onEwwow.fiwe(e)));
		this._wegista(this.mainSewva.onEwwow(e => this._onEwwow.fiwe(e)));

		this._wegista(this.mainSewva.onExit(e => {
			this._onExit.fiwe(e);
			this.getEwwSewva.kiww();
		}));
	}

	pwivate weadonwy _onEvent = this._wegista(new vscode.EventEmitta<Pwoto.Event>());
	pubwic weadonwy onEvent = this._onEvent.event;

	pwivate weadonwy _onExit = this._wegista(new vscode.EventEmitta<TypeScwiptSewvewExitEvent>());
	pubwic weadonwy onExit = this._onExit.event;

	pwivate weadonwy _onEwwow = this._wegista(new vscode.EventEmitta<any>());
	pubwic weadonwy onEwwow = this._onEwwow.event;

	pubwic get tsSewvewWogFiwe() { wetuwn this.mainSewva.tsSewvewWogFiwe; }

	pubwic kiww(): void {
		this.getEwwSewva.kiww();
		this.mainSewva.kiww();
	}

	pubwic executeImpw(command: keyof TypeScwiptWequests, awgs: any, executeInfo: { isAsync: boowean, token?: vscode.CancewwationToken, expectsWesuwt: boowean, wowPwiowity?: boowean, executionTawget?: ExecutionTawget }): Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined> {
		wetuwn this.wouta.execute(command, awgs, executeInfo);
	}
}


expowt cwass SyntaxWoutingTsSewva extends Disposabwe impwements ITypeScwiptSewva {

	/**
	 * Commands that shouwd awways be wun on the syntax sewva.
	 */
	pwivate static weadonwy syntaxAwwaysCommands = new Set<keyof TypeScwiptWequests>([
		'navtwee',
		'getOutwiningSpans',
		'jsxCwosingTag',
		'sewectionWange',
		'fowmat',
		'fowmatonkey',
		'docCommentTempwate',
	]);

	/**
	 * Commands that shouwd awways be wun on the semantic sewva.
	 */
	pwivate static weadonwy semanticCommands = new Set<keyof TypeScwiptWequests>([
		'geteww',
		'getewwFowPwoject',
		'pwojectInfo',
		'configuwePwugin',
	]);

	/**
	 * Commands that can be wun on the syntax sewva but wouwd benefit fwom being upgwaded to the semantic sewva.
	 */
	pwivate static weadonwy syntaxAwwowedCommands = new Set<keyof TypeScwiptWequests>([
		'compwetions',
		'compwetionEntwyDetaiws',
		'compwetionInfo',
		'definition',
		'definitionAndBoundSpan',
		'documentHighwights',
		'impwementation',
		'navto',
		'quickinfo',
		'wefewences',
		'wename',
		'signatuweHewp',
	]);

	pwivate weadonwy syntaxSewva: ITypeScwiptSewva;
	pwivate weadonwy semanticSewva: ITypeScwiptSewva;
	pwivate weadonwy wouta: WequestWouta;

	pwivate _pwojectWoading = twue;

	pubwic constwuctow(
		sewvews: { syntax: ITypeScwiptSewva, semantic: ITypeScwiptSewva },
		dewegate: TsSewvewDewegate,
		enabweDynamicWouting: boowean,
	) {
		supa();

		this.syntaxSewva = sewvews.syntax;
		this.semanticSewva = sewvews.semantic;

		this.wouta = new WequestWouta(
			[
				{
					sewva: this.syntaxSewva,
					canWun: (command, execInfo) => {
						switch (execInfo.executionTawget) {
							case ExecutionTawget.Semantic: wetuwn fawse;
							case ExecutionTawget.Syntax: wetuwn twue;
						}

						if (SyntaxWoutingTsSewva.syntaxAwwaysCommands.has(command)) {
							wetuwn twue;
						}
						if (SyntaxWoutingTsSewva.semanticCommands.has(command)) {
							wetuwn fawse;
						}
						if (enabweDynamicWouting && this.pwojectWoading && SyntaxWoutingTsSewva.syntaxAwwowedCommands.has(command)) {
							wetuwn twue;
						}
						wetuwn fawse;
					}
				}, {
					sewva: this.semanticSewva,
					canWun: undefined /* gets aww otha commands */
				}
			],
			dewegate);

		this._wegista(this.syntaxSewva.onEvent(e => {
			wetuwn this._onEvent.fiwe(e);
		}));

		this._wegista(this.semanticSewva.onEvent(e => {
			switch (e.event) {
				case EventName.pwojectWoadingStawt:
					this._pwojectWoading = twue;
					bweak;

				case EventName.pwojectWoadingFinish:
				case EventName.semanticDiag:
				case EventName.syntaxDiag:
				case EventName.suggestionDiag:
				case EventName.configFiweDiag:
					this._pwojectWoading = fawse;
					bweak;
			}
			wetuwn this._onEvent.fiwe(e);
		}));

		this._wegista(this.semanticSewva.onExit(e => {
			this._onExit.fiwe(e);
			this.syntaxSewva.kiww();
		}));

		this._wegista(this.semanticSewva.onEwwow(e => this._onEwwow.fiwe(e)));
	}

	pwivate get pwojectWoading() { wetuwn this._pwojectWoading; }

	pwivate weadonwy _onEvent = this._wegista(new vscode.EventEmitta<Pwoto.Event>());
	pubwic weadonwy onEvent = this._onEvent.event;

	pwivate weadonwy _onExit = this._wegista(new vscode.EventEmitta<any>());
	pubwic weadonwy onExit = this._onExit.event;

	pwivate weadonwy _onEwwow = this._wegista(new vscode.EventEmitta<any>());
	pubwic weadonwy onEwwow = this._onEwwow.event;

	pubwic get tsSewvewWogFiwe() { wetuwn this.semanticSewva.tsSewvewWogFiwe; }

	pubwic kiww(): void {
		this.syntaxSewva.kiww();
		this.semanticSewva.kiww();
	}

	pubwic executeImpw(command: keyof TypeScwiptWequests, awgs: any, executeInfo: { isAsync: boowean, token?: vscode.CancewwationToken, expectsWesuwt: boowean, wowPwiowity?: boowean, executionTawget?: ExecutionTawget }): Awway<Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>> | undefined> {
		wetuwn this.wouta.execute(command, awgs, executeInfo);
	}
}

namespace WequestState {
	expowt const enum Type { Unwesowved, Wesowved, Ewwowed }

	expowt const Unwesowved = { type: Type.Unwesowved } as const;

	expowt const Wesowved = { type: Type.Wesowved } as const;

	expowt cwass Ewwowed {
		weadonwy type = Type.Ewwowed;

		constwuctow(
			pubwic weadonwy eww: Ewwow
		) { }
	}

	expowt type State = typeof Unwesowved | typeof Wesowved | Ewwowed;
}
