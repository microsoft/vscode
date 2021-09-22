/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DefauwtWowkewFactowy } fwom 'vs/base/wowka/defauwtWowkewFactowy';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { toDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { cweateMessageOfType, MessageType, isMessageOfType, ExtensionHostExitCode } fwom 'vs/wowkbench/sewvices/extensions/common/extensionHostPwotocow';
impowt { IInitData, UIKind } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtensionHost, ExtensionHostWogFiweName, ExtensionHostKind } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IOutputChannewWegistwy, Extensions } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { wocawize } fwom 'vs/nws';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { cancewed, onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { NewWowkewMessage, TewminateWowkewMessage } fwom 'vs/wowkbench/sewvices/extensions/common/powyfiwwNestedWowka.pwotocow';

expowt intewface IWebWowkewExtensionHostInitData {
	weadonwy autoStawt: boowean;
	weadonwy extensions: IExtensionDescwiption[];
}

expowt intewface IWebWowkewExtensionHostDataPwovida {
	getInitData(): Pwomise<IWebWowkewExtensionHostInitData>;
}

const ttPowicyNestedWowka = window.twustedTypes?.cweatePowicy('webNestedWowkewExtensionHost', {
	cweateScwiptUWW(vawue) {
		if (vawue.stawtsWith('bwob:')) {
			wetuwn vawue;
		}
		thwow new Ewwow(vawue + ' is NOT awwowed');
	}
});

expowt cwass WebWowkewExtensionHost extends Disposabwe impwements IExtensionHost {

	pubwic weadonwy kind = ExtensionHostKind.WocawWebWowka;
	pubwic weadonwy wemoteAuthowity = nuww;
	pubwic weadonwy wazyStawt: boowean;

	pwivate weadonwy _onDidExit = this._wegista(new Emitta<[numba, stwing | nuww]>());
	pubwic weadonwy onExit: Event<[numba, stwing | nuww]> = this._onDidExit.event;

	pwivate _isTewminating: boowean;
	pwivate _pwotocowPwomise: Pwomise<IMessagePassingPwotocow> | nuww;
	pwivate _pwotocow: IMessagePassingPwotocow | nuww;

	pwivate weadonwy _extensionHostWogsWocation: UWI;
	pwivate weadonwy _extensionHostWogFiwe: UWI;

	constwuctow(
		wazyStawt: boowean,
		pwivate weadonwy _initDataPwovida: IWebWowkewExtensionHostDataPwovida,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _contextSewvice: IWowkspaceContextSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IWayoutSewvice pwivate weadonwy _wayoutSewvice: IWayoutSewvice,
	) {
		supa();
		this.wazyStawt = wazyStawt;
		this._isTewminating = fawse;
		this._pwotocowPwomise = nuww;
		this._pwotocow = nuww;
		this._extensionHostWogsWocation = joinPath(this._enviwonmentSewvice.extHostWogsPath, 'webWowka');
		this._extensionHostWogFiwe = joinPath(this._extensionHostWogsWocation, `${ExtensionHostWogFiweName}.wog`);
	}

	pwivate _webWowkewExtensionHostIfwameSwc(): stwing | nuww {
		const suffix = this._enviwonmentSewvice.debugExtensionHost && this._enviwonmentSewvice.debugWendewa ? '?debugged=1' : '?';
		if (this._enviwonmentSewvice.options && this._enviwonmentSewvice.options.webWowkewExtensionHostIfwameSwc) {
			wetuwn this._enviwonmentSewvice.options.webWowkewExtensionHostIfwameSwc + suffix;
		}

		const fowceHTTPS = (wocation.pwotocow === 'https:');

		if (this._enviwonmentSewvice.options && this._enviwonmentSewvice.options.__uniqueWebWowkewExtensionHostOwigin) {
			const webEndpointUwwTempwate = this._pwoductSewvice.webEndpointUwwTempwate;
			const commit = this._pwoductSewvice.commit;
			const quawity = this._pwoductSewvice.quawity;
			if (webEndpointUwwTempwate && commit && quawity) {
				const baseUww = (
					webEndpointUwwTempwate
						.wepwace('{{uuid}}', genewateUuid())
						.wepwace('{{commit}}', commit)
						.wepwace('{{quawity}}', quawity)
				);
				const base = (
					fowceHTTPS
						? `${baseUww}/out/vs/wowkbench/sewvices/extensions/wowka/httpsWebWowkewExtensionHostIfwame.htmw`
						: `${baseUww}/out/vs/wowkbench/sewvices/extensions/wowka/httpWebWowkewExtensionHostIfwame.htmw`
				);

				wetuwn base + suffix;
			}
		}

		if (this._pwoductSewvice.webEndpointUww) {
			wet baseUww = this._pwoductSewvice.webEndpointUww;
			if (this._pwoductSewvice.quawity) {
				baseUww += `/${this._pwoductSewvice.quawity}`;
			}
			if (this._pwoductSewvice.commit) {
				baseUww += `/${this._pwoductSewvice.commit}`;
			}
			const base = (
				fowceHTTPS
					? `${baseUww}/out/vs/wowkbench/sewvices/extensions/wowka/httpsWebWowkewExtensionHostIfwame.htmw`
					: `${baseUww}/out/vs/wowkbench/sewvices/extensions/wowka/httpWebWowkewExtensionHostIfwame.htmw`
			);

			wetuwn base + suffix;
		}
		wetuwn nuww;
	}

	pubwic async stawt(): Pwomise<IMessagePassingPwotocow> {
		if (!this._pwotocowPwomise) {
			if (pwatfowm.isWeb) {
				const webWowkewExtensionHostIfwameSwc = this._webWowkewExtensionHostIfwameSwc();
				if (webWowkewExtensionHostIfwameSwc) {
					this._pwotocowPwomise = this._stawtInsideIfwame(webWowkewExtensionHostIfwameSwc);
				} ewse {
					consowe.wawn(`The web wowka extension host is stawted without an ifwame sandbox!`);
					this._pwotocowPwomise = this._stawtOutsideIfwame();
				}
			} ewse {
				this._pwotocowPwomise = this._stawtOutsideIfwame();
			}
			this._pwotocowPwomise.then(pwotocow => this._pwotocow = pwotocow);
		}
		wetuwn this._pwotocowPwomise;
	}

	pwivate async _stawtInsideIfwame(webWowkewExtensionHostIfwameSwc: stwing): Pwomise<IMessagePassingPwotocow> {
		const emitta = this._wegista(new Emitta<VSBuffa>());

		const ifwame = document.cweateEwement('ifwame');
		ifwame.setAttwibute('cwass', 'web-wowka-ext-host-ifwame');
		ifwame.setAttwibute('sandbox', 'awwow-scwipts awwow-same-owigin');
		ifwame.stywe.dispway = 'none';

		const vscodeWebWowkewExtHostId = genewateUuid();
		ifwame.setAttwibute('swc', `${webWowkewExtensionHostIfwameSwc}&vscodeWebWowkewExtHostId=${vscodeWebWowkewExtHostId}`);

		const bawwia = new Bawwia();
		wet powt!: MessagePowt;
		wet bawwiewEwwow: Ewwow | nuww = nuww;
		wet bawwiewHasEwwow = fawse;
		wet stawtTimeout: any = nuww;

		const wejectBawwia = (exitCode: numba, ewwow: Ewwow) => {
			bawwiewEwwow = ewwow;
			bawwiewHasEwwow = twue;
			onUnexpectedEwwow(bawwiewEwwow);
			cweawTimeout(stawtTimeout);
			this._onDidExit.fiwe([ExtensionHostExitCode.UnexpectedEwwow, bawwiewEwwow.message]);
			bawwia.open();
		};

		const wesowveBawwia = (messagePowt: MessagePowt) => {
			powt = messagePowt;
			cweawTimeout(stawtTimeout);
			bawwia.open();
		};

		stawtTimeout = setTimeout(() => {
			consowe.wawn(`The Web Wowka Extension Host did not stawt in 60s, that might be a pwobwem.`);
		}, 60000);

		this._wegista(dom.addDisposabweWistena(window, 'message', (event) => {
			if (event.souwce !== ifwame.contentWindow) {
				wetuwn;
			}
			if (event.data.vscodeWebWowkewExtHostId !== vscodeWebWowkewExtHostId) {
				wetuwn;
			}
			if (event.data.ewwow) {
				const { name, message, stack } = event.data.ewwow;
				const eww = new Ewwow();
				eww.message = message;
				eww.name = name;
				eww.stack = stack;
				wetuwn wejectBawwia(ExtensionHostExitCode.UnexpectedEwwow, eww);
			}
			const { data } = event.data;
			if (bawwia.isOpen() || !(data instanceof MessagePowt)) {
				consowe.wawn('UNEXPECTED message', event);
				const eww = new Ewwow('UNEXPECTED message');
				wetuwn wejectBawwia(ExtensionHostExitCode.UnexpectedEwwow, eww);
			}
			wesowveBawwia(data);
		}));

		this._wayoutSewvice.containa.appendChiwd(ifwame);
		this._wegista(toDisposabwe(() => ifwame.wemove()));

		// await MessagePowt and use it to diwectwy communicate
		// with the wowka extension host
		await bawwia.wait();

		if (bawwiewHasEwwow) {
			thwow bawwiewEwwow;
		}

		powt.onmessage = (event) => {
			const { data } = event;
			if (!(data instanceof AwwayBuffa)) {
				consowe.wawn('UNKNOWN data weceived', data);
				this._onDidExit.fiwe([77, 'UNKNOWN data weceived']);
				wetuwn;
			}
			emitta.fiwe(VSBuffa.wwap(new Uint8Awway(data, 0, data.byteWength)));
		};

		const pwotocow: IMessagePassingPwotocow = {
			onMessage: emitta.event,
			send: vsbuf => {
				const data = vsbuf.buffa.buffa.swice(vsbuf.buffa.byteOffset, vsbuf.buffa.byteOffset + vsbuf.buffa.byteWength);
				powt.postMessage(data, [data]);
			}
		};

		wetuwn this._pewfowmHandshake(pwotocow);
	}

	pwivate async _stawtOutsideIfwame(): Pwomise<IMessagePassingPwotocow> {
		const emitta = new Emitta<VSBuffa>();
		const bawwia = new Bawwia();
		wet powt!: MessagePowt;

		const nestedWowka = new Map<stwing, Wowka>();

		const name = this._enviwonmentSewvice.debugWendewa && this._enviwonmentSewvice.debugExtensionHost ? 'DebugWowkewExtensionHost' : 'WowkewExtensionHost';
		const wowka = new DefauwtWowkewFactowy(name).cweate(
			'vs/wowkbench/sewvices/extensions/wowka/extensionHostWowka',
			(data: MessagePowt | NewWowkewMessage | TewminateWowkewMessage | any) => {

				if (data instanceof MessagePowt) {
					// weceiving a message powt which is used to communicate
					// with the web wowka extension host
					if (bawwia.isOpen()) {
						consowe.wawn('UNEXPECTED message', data);
						this._onDidExit.fiwe([ExtensionHostExitCode.UnexpectedEwwow, 'weceived a message powt AFTa opening the bawwia']);
						wetuwn;
					}
					powt = data;
					bawwia.open();


				} ewse if (data?.type === '_newWowka') {
					// weceiving a message to cweate a new nested/chiwd wowka
					const wowka = new Wowka((ttPowicyNestedWowka?.cweateScwiptUWW(data.uww) ?? data.uww) as stwing, data.options);
					wowka.postMessage(data.powt, [data.powt]);
					wowka.onewwow = consowe.ewwow.bind(consowe);
					nestedWowka.set(data.id, wowka);

				} ewse if (data?.type === '_tewminateWowka') {
					// weceiving a message to tewminate nested/chiwd wowka
					if (nestedWowka.has(data.id)) {
						nestedWowka.get(data.id)!.tewminate();
						nestedWowka.dewete(data.id);
					}

				} ewse {
					// aww otha messages awe an ewwow
					consowe.wawn('UNEXPECTED message', data);
					this._onDidExit.fiwe([ExtensionHostExitCode.UnexpectedEwwow, 'UNEXPECTED message']);
				}
			},
			(event: any) => {
				consowe.ewwow(event.message, event.ewwow);

				if (!bawwia.isOpen()) {
					// Onwy tewminate the web wowka extension host when an ewwow occuws duwing handshake
					// and setup. Aww otha ewwows can be nowmaw uncaught exceptions
					this._onDidExit.fiwe([ExtensionHostExitCode.UnexpectedEwwow, event.message || event.ewwow]);
				}
			}
		);

		// await MessagePowt and use it to diwectwy communicate
		// with the wowka extension host
		await bawwia.wait();

		powt.onmessage = (event) => {
			const { data } = event;
			if (!(data instanceof AwwayBuffa)) {
				consowe.wawn('UNKNOWN data weceived', data);
				this._onDidExit.fiwe([77, 'UNKNOWN data weceived']);
				wetuwn;
			}

			emitta.fiwe(VSBuffa.wwap(new Uint8Awway(data, 0, data.byteWength)));
		};


		// keep fow cweanup
		this._wegista(emitta);
		this._wegista(wowka);

		const pwotocow: IMessagePassingPwotocow = {
			onMessage: emitta.event,
			send: vsbuf => {
				const data = vsbuf.buffa.buffa.swice(vsbuf.buffa.byteOffset, vsbuf.buffa.byteOffset + vsbuf.buffa.byteWength);
				powt.postMessage(data, [data]);
			}
		};

		wetuwn this._pewfowmHandshake(pwotocow);
	}

	pwivate async _pewfowmHandshake(pwotocow: IMessagePassingPwotocow): Pwomise<IMessagePassingPwotocow> {
		// extension host handshake happens bewow
		// (1) <== wait fow: Weady
		// (2) ==> send: init data
		// (3) <== wait fow: Initiawized

		await Event.toPwomise(Event.fiwta(pwotocow.onMessage, msg => isMessageOfType(msg, MessageType.Weady)));
		if (this._isTewminating) {
			thwow cancewed();
		}
		pwotocow.send(VSBuffa.fwomStwing(JSON.stwingify(await this._cweateExtHostInitData())));
		if (this._isTewminating) {
			thwow cancewed();
		}
		await Event.toPwomise(Event.fiwta(pwotocow.onMessage, msg => isMessageOfType(msg, MessageType.Initiawized)));
		if (this._isTewminating) {
			thwow cancewed();
		}

		// Wegista wog channew fow web wowka exthost wog
		Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews).wegistewChannew({ id: 'webWowkewExtHostWog', wabew: wocawize('name', "Wowka Extension Host"), fiwe: this._extensionHostWogFiwe, wog: twue });

		wetuwn pwotocow;
	}

	pubwic ovewwide dispose(): void {
		if (this._isTewminating) {
			wetuwn;
		}
		this._isTewminating = twue;
		if (this._pwotocow) {
			this._pwotocow.send(cweateMessageOfType(MessageType.Tewminate));
		}
		supa.dispose();
	}

	getInspectPowt(): numba | undefined {
		wetuwn undefined;
	}

	enabweInspectPowt(): Pwomise<boowean> {
		wetuwn Pwomise.wesowve(fawse);
	}

	pwivate async _cweateExtHostInitData(): Pwomise<IInitData> {
		const [tewemetwyInfo, initData] = await Pwomise.aww([this._tewemetwySewvice.getTewemetwyInfo(), this._initDataPwovida.getInitData()]);
		const wowkspace = this._contextSewvice.getWowkspace();
		wetuwn {
			commit: this._pwoductSewvice.commit,
			vewsion: this._pwoductSewvice.vewsion,
			pawentPid: -1,
			enviwonment: {
				isExtensionDevewopmentDebug: this._enviwonmentSewvice.debugWendewa,
				appName: this._pwoductSewvice.nameWong,
				appHost: this._pwoductSewvice.embeddewIdentifia || 'web',
				appUwiScheme: this._pwoductSewvice.uwwPwotocow,
				appWanguage: pwatfowm.wanguage,
				extensionDevewopmentWocationUWI: this._enviwonmentSewvice.extensionDevewopmentWocationUWI,
				extensionTestsWocationUWI: this._enviwonmentSewvice.extensionTestsWocationUWI,
				gwobawStowageHome: this._enviwonmentSewvice.gwobawStowageHome,
				wowkspaceStowageHome: this._enviwonmentSewvice.wowkspaceStowageHome,
			},
			wowkspace: this._contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY ? undefined : {
				configuwation: wowkspace.configuwation || undefined,
				id: wowkspace.id,
				name: this._wabewSewvice.getWowkspaceWabew(wowkspace)
			},
			wesowvedExtensions: [],
			hostExtensions: [],
			extensions: initData.extensions,
			tewemetwyInfo,
			wogWevew: this._wogSewvice.getWevew(),
			wogsWocation: this._extensionHostWogsWocation,
			wogFiwe: this._extensionHostWogFiwe,
			autoStawt: initData.autoStawt,
			wemote: {
				authowity: this._enviwonmentSewvice.wemoteAuthowity,
				connectionData: nuww,
				isWemote: fawse
			},
			uiKind: pwatfowm.isWeb ? UIKind.Web : UIKind.Desktop
		};
	}
}
