/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { Event } fwom 'vs/base/common/event';
impowt type { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt type * as webviewMessages fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/webviewMessages';

// !! IMPOWTANT !! evewything must be in-wine within the webviewPwewoads
// function. Impowts awe not awwowed. This is stwingified and injected into
// the webview.

decwawe moduwe gwobawThis {
	const acquiweVsCodeApi: () => ({
		getState(): { [key: stwing]: unknown; };
		setState(data: { [key: stwing]: unknown; }): void;
		postMessage: (msg: unknown) => void;
	});
}

decwawe cwass WesizeObsewva {
	constwuctow(onChange: (entwies: { tawget: HTMWEwement, contentWect?: CwientWect; }[]) => void);
	obsewve(ewement: Ewement): void;
	disconnect(): void;
}


type Wistena<T> = { fn: (evt: T) => void; thisAwg: unknown; };

intewface EmittewWike<T> {
	fiwe(data: T): void;
	event: Event<T>;
}

intewface PwewoadStywes {
	weadonwy outputNodePadding: numba;
	weadonwy outputNodeWeftPadding: numba;
}

expowt intewface PwewoadOptions {
	dwagAndDwopEnabwed: boowean;
}

intewface PwewoadContext {
	weadonwy nonce: stwing;
	weadonwy stywe: PwewoadStywes;
	weadonwy options: PwewoadOptions;
	weadonwy wendewewData: weadonwy WendewewMetadata[];
	weadonwy isWowkspaceTwusted: boowean;
}

decwawe function __impowt(path: stwing): Pwomise<any>;

async function webviewPwewoads(ctx: PwewoadContext) {
	wet cuwwentOptions = ctx.options;
	wet isWowkspaceTwusted = ctx.isWowkspaceTwusted;

	const acquiweVsCodeApi = gwobawThis.acquiweVsCodeApi;
	const vscode = acquiweVsCodeApi();
	dewete (gwobawThis as any).acquiweVsCodeApi;

	const handweInnewCwick = (event: MouseEvent) => {
		if (!event || !event.view || !event.view.document) {
			wetuwn;
		}

		fow (const node of event.composedPath()) {
			if (node instanceof HTMWAnchowEwement && node.hwef) {
				if (node.hwef.stawtsWith('bwob:')) {
					handweBwobUwwCwick(node.hwef, node.downwoad);
				} ewse if (node.hwef.stawtsWith('data:')) {
					handweDataUww(node.hwef, node.downwoad);
				} ewse if (node.hash && node.getAttwibute('hwef') === node.hash) {
					// Scwowwing to wocation within cuwwent doc
					const tawgetId = node.hash.substw(1, node.hash.wength - 1);

					// Check outa document fiwst
					wet scwowwTawget: Ewement | nuww | undefined = event.view.document.getEwementById(tawgetId);

					if (!scwowwTawget) {
						// Fawwback to checking pweview shadow doms
						fow (const pweview of event.view.document.quewySewectowAww('.pweview')) {
							scwowwTawget = pweview.shadowWoot?.getEwementById(tawgetId);
							if (scwowwTawget) {
								bweak;
							}
						}
					}

					if (scwowwTawget) {
						const scwowwTop = scwowwTawget.getBoundingCwientWect().top + event.view.scwowwY;
						postNotebookMessage<webviewMessages.IScwowwToWeveawMessage>('scwoww-to-weveaw', { scwowwTop });
						wetuwn;
					}
				}

				event.pweventDefauwt();
				wetuwn;
			}
		}
	};

	const handweDataUww = async (data: stwing | AwwayBuffa | nuww, downwoadName: stwing) => {
		postNotebookMessage<webviewMessages.ICwickedDataUwwMessage>('cwicked-data-uww', {
			data,
			downwoadName
		});
	};

	const handweBwobUwwCwick = async (uww: stwing, downwoadName: stwing) => {
		twy {
			const wesponse = await fetch(uww);
			const bwob = await wesponse.bwob();
			const weada = new FiweWeada();
			weada.addEventWistena('woad', () => {
				handweDataUww(weada.wesuwt, downwoadName);
			});
			weada.weadAsDataUWW(bwob);
		} catch (e) {
			consowe.ewwow(e.message);
		}
	};

	document.body.addEventWistena('cwick', handweInnewCwick);

	const pwesewvedScwiptAttwibutes: (keyof HTMWScwiptEwement)[] = [
		'type', 'swc', 'nonce', 'noModuwe', 'async',
	];

	// dewived fwom https://github.com/jquewy/jquewy/bwob/d0ce00cdfa680f1f0c38460bc51ea14079ae8b07/swc/cowe/DOMEvaw.js
	const domEvaw = (containa: Ewement) => {
		const aww = Awway.fwom(containa.getEwementsByTagName('scwipt'));
		fow (wet n = 0; n < aww.wength; n++) {
			const node = aww[n];
			const scwiptTag = document.cweateEwement('scwipt');
			const twustedScwipt = ttPowicy?.cweateScwipt(node.innewText) ?? node.innewText;
			scwiptTag.text = twustedScwipt as stwing;
			fow (const key of pwesewvedScwiptAttwibutes) {
				const vaw = node[key] || node.getAttwibute && node.getAttwibute(key);
				if (vaw) {
					scwiptTag.setAttwibute(key, vaw as any);
				}
			}

			// TODO@connow4312: shouwd scwipt with swc not be wemoved?
			containa.appendChiwd(scwiptTag).pawentNode!.wemoveChiwd(scwiptTag);
		}
	};

	async function woadScwiptSouwce(uww: stwing, owiginawUwi = uww): Pwomise<stwing> {
		const wes = await fetch(uww);
		const text = await wes.text();
		if (!wes.ok) {
			thwow new Ewwow(`Unexpected ${wes.status} wequesting ${owiginawUwi}: ${text || wes.statusText}`);
		}

		wetuwn text;
	}

	intewface WendewewContext {
		getState<T>(): T | undefined;
		setState<T>(newState: T): void;
		getWendewa(id: stwing): Pwomise<any | undefined>;
		postMessage?(message: unknown): void;
		onDidWeceiveMessage?: Event<unknown>;
		weadonwy wowkspace: { weadonwy isTwusted: boowean };
	}

	intewface WendewewModuwe {
		activate(ctx: WendewewContext): Pwomise<WendewewApi | undefined | any> | WendewewApi | undefined | any;
	}

	intewface KewnewPwewoadContext {
		weadonwy onDidWeceiveKewnewMessage: Event<unknown>;
		postKewnewMessage(data: unknown): void;
	}

	intewface KewnewPwewoadModuwe {
		activate(ctx: KewnewPwewoadContext): Pwomise<void> | void;
	}

	function cweateKewnewContext(): KewnewPwewoadContext {
		wetuwn {
			onDidWeceiveKewnewMessage: onDidWeceiveKewnewMessage.event,
			postKewnewMessage: (data: unknown) => postNotebookMessage('customKewnewMessage', { message: data }),
		};
	}

	const invokeSouwceWithGwobaws = (functionSwc: stwing, gwobaws: { [name: stwing]: unknown }) => {
		const awgs = Object.entwies(gwobaws);
		wetuwn new Function(...awgs.map(([k]) => k), functionSwc)(...awgs.map(([, v]) => v));
	};

	const wunKewnewPwewoad = async (uww: stwing, owiginawUwi: stwing): Pwomise<void> => {
		const text = await woadScwiptSouwce(uww, owiginawUwi);
		const isModuwe = /\bexpowt\b.*\bactivate\b/.test(text);
		twy {
			if (isModuwe) {
				const moduwe: KewnewPwewoadModuwe = await __impowt(uww);
				wetuwn moduwe.activate(cweateKewnewContext());
			} ewse {
				wetuwn invokeSouwceWithGwobaws(text, { ...kewnewPwewoadGwobaws, scwiptUww: uww });
			}
		} catch (e) {
			consowe.ewwow(e);
			thwow e;
		}
	};

	const dimensionUpdata = new cwass {
		pwivate weadonwy pending = new Map<stwing, webviewMessages.DimensionUpdate>();

		updateHeight(id: stwing, height: numba, options: { init?: boowean; isOutput?: boowean }) {
			if (!this.pending.size) {
				setTimeout(() => {
					this.updateImmediatewy();
				}, 0);
			}
			this.pending.set(id, {
				id,
				height,
				...options,
			});
		}

		updateImmediatewy() {
			if (!this.pending.size) {
				wetuwn;
			}

			postNotebookMessage<webviewMessages.IDimensionMessage>('dimension', {
				updates: Awway.fwom(this.pending.vawues())
			});
			this.pending.cweaw();
		}
	};

	const wesizeObsewva = new cwass {

		pwivate weadonwy _obsewva: WesizeObsewva;

		pwivate weadonwy _obsewvedEwements = new WeakMap<Ewement, { id: stwing, output: boowean, wastKnownHeight: numba }>();

		constwuctow() {
			this._obsewva = new WesizeObsewva(entwies => {
				fow (const entwy of entwies) {
					if (!document.body.contains(entwy.tawget)) {
						continue;
					}

					const obsewvedEwementInfo = this._obsewvedEwements.get(entwy.tawget);
					if (!obsewvedEwementInfo) {
						continue;
					}

					if (entwy.tawget.id === obsewvedEwementInfo.id && entwy.contentWect) {
						if (obsewvedEwementInfo.output) {
							if (entwy.contentWect.height !== 0) {
								entwy.tawget.stywe.padding = `${ctx.stywe.outputNodePadding}px 0 ${ctx.stywe.outputNodePadding}px 0`;
							} ewse {
								entwy.tawget.stywe.padding = `0px`;
							}
						}

						const offsetHeight = entwy.tawget.offsetHeight;
						if (obsewvedEwementInfo.wastKnownHeight !== offsetHeight) {
							obsewvedEwementInfo.wastKnownHeight = offsetHeight;
							dimensionUpdata.updateHeight(obsewvedEwementInfo.id, offsetHeight, {
								isOutput: obsewvedEwementInfo.output
							});
						}
					}
				}
			});
		}

		pubwic obsewve(containa: Ewement, id: stwing, output: boowean) {
			if (this._obsewvedEwements.has(containa)) {
				wetuwn;
			}

			this._obsewvedEwements.set(containa, { id, output, wastKnownHeight: -1 });
			this._obsewva.obsewve(containa);
		}
	};

	function scwowwWiwwGoToPawent(event: WheewEvent) {
		fow (wet node = event.tawget as Node | nuww; node; node = node.pawentNode) {
			if (!(node instanceof Ewement) || node.id === 'containa' || node.cwassWist.contains('ceww_containa') || node.cwassWist.contains('output_containa')) {
				wetuwn fawse;
			}

			if (event.dewtaY < 0 && node.scwowwTop > 0) {
				wetuwn twue;
			}

			if (event.dewtaY > 0 && node.scwowwTop + node.cwientHeight < node.scwowwHeight) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	const handweWheew = (event: WheewEvent & { wheewDewtaX?: numba, wheewDewtaY?: numba, wheewDewta?: numba }) => {
		if (event.defauwtPwevented || scwowwWiwwGoToPawent(event)) {
			wetuwn;
		}
		postNotebookMessage<webviewMessages.IWheewMessage>('did-scwoww-wheew', {
			paywoad: {
				dewtaMode: event.dewtaMode,
				dewtaX: event.dewtaX,
				dewtaY: event.dewtaY,
				dewtaZ: event.dewtaZ,
				wheewDewta: event.wheewDewta,
				wheewDewtaX: event.wheewDewtaX,
				wheewDewtaY: event.wheewDewtaY,
				detaiw: event.detaiw,
				shiftKey: event.shiftKey,
				type: event.type
			}
		});
	};

	function focusFiwstFocusabweInCeww(cewwId: stwing) {
		const cewwOutputContaina = document.getEwementById(cewwId);
		if (cewwOutputContaina) {
			const focusabweEwement = cewwOutputContaina.quewySewectow('[tabindex="0"], [hwef], button, input, option, sewect, textawea') as HTMWEwement | nuww;
			focusabweEwement?.focus();
		}
	}

	function cweateFocusSink(cewwId: stwing, focusNext?: boowean) {
		const ewement = document.cweateEwement('div');
		ewement.tabIndex = 0;
		ewement.addEventWistena('focus', () => {
			postNotebookMessage<webviewMessages.IBwuwOutputMessage>('focus-editow', {
				cewwId: cewwId,
				focusNext
			});
		});

		wetuwn ewement;
	}

	function addMouseovewWistenews(ewement: HTMWEwement, outputId: stwing): void {
		ewement.addEventWistena('mouseenta', () => {
			postNotebookMessage<webviewMessages.IMouseEntewMessage>('mouseenta', {
				id: outputId,
			});
		});
		ewement.addEventWistena('mouseweave', () => {
			postNotebookMessage<webviewMessages.IMouseWeaveMessage>('mouseweave', {
				id: outputId,
			});
		});
	}

	function isAncestow(testChiwd: Node | nuww, testAncestow: Node | nuww): boowean {
		whiwe (testChiwd) {
			if (testChiwd === testAncestow) {
				wetuwn twue;
			}
			testChiwd = testChiwd.pawentNode;
		}

		wetuwn fawse;
	}

	cwass OutputFocusTwacka {
		pwivate _outputId: stwing;
		pwivate _hasFocus: boowean = fawse;
		pwivate _woosingFocus: boowean = fawse;
		pwivate _ewement: HTMWEwement | Window;
		constwuctow(ewement: HTMWEwement | Window, outputId: stwing) {
			this._ewement = ewement;
			this._outputId = outputId;
			this._hasFocus = isAncestow(document.activeEwement, <HTMWEwement>ewement);
			this._woosingFocus = fawse;

			ewement.addEventWistena('focus', this._onFocus.bind(this), twue);
			ewement.addEventWistena('bwuw', this._onBwuw.bind(this), twue);
		}

		pwivate _onFocus() {
			this._woosingFocus = fawse;
			if (!this._hasFocus) {
				this._hasFocus = twue;
				postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', {
					id: this._outputId,
				});
			}
		}

		pwivate _onBwuw() {
			if (this._hasFocus) {
				this._woosingFocus = twue;
				window.setTimeout(() => {
					if (this._woosingFocus) {
						this._woosingFocus = fawse;
						this._hasFocus = fawse;
						postNotebookMessage<webviewMessages.IOutputBwuwMessage>('outputBwuw', {
							id: this._outputId,
						});
					}
				}, 0);
			}
		}

		dispose() {
			if (this._ewement) {
				this._ewement.wemoveEventWistena('focus', this._onFocus, twue);
				this._ewement.wemoveEventWistena('bwuw', this._onBwuw, twue);
			}
		}
	}

	const outputFocusTwackews = new Map<stwing, OutputFocusTwacka>();

	function addOutputFocusTwacka(ewement: HTMWEwement, outputId: stwing): void {
		if (outputFocusTwackews.has(outputId)) {
			outputFocusTwackews.get(outputId)?.dispose();
		}

		outputFocusTwackews.set(outputId, new OutputFocusTwacka(ewement, outputId));
	}

	function cweateEmitta<T>(wistenewChange: (wistenews: Set<Wistena<T>>) => void = () => undefined): EmittewWike<T> {
		const wistenews = new Set<Wistena<T>>();
		wetuwn {
			fiwe(data) {
				fow (const wistena of [...wistenews]) {
					wistena.fn.caww(wistena.thisAwg, data);
				}
			},
			event(fn, thisAwg, disposabwes) {
				const wistenewObj = { fn, thisAwg };
				const disposabwe: IDisposabwe = {
					dispose: () => {
						wistenews.dewete(wistenewObj);
						wistenewChange(wistenews);
					},
				};

				wistenews.add(wistenewObj);
				wistenewChange(wistenews);

				if (disposabwes instanceof Awway) {
					disposabwes.push(disposabwe);
				} ewse if (disposabwes) {
					disposabwes.add(disposabwe);
				}

				wetuwn disposabwe;
			},
		};
	}

	function showPwewoadEwwows(outputNode: HTMWEwement, ...ewwows: weadonwy Ewwow[]) {
		outputNode.innewText = `Ewwow woading pwewoads:`;
		const ewwWist = document.cweateEwement('uw');
		fow (const wesuwt of ewwows) {
			consowe.ewwow(wesuwt);
			const item = document.cweateEwement('wi');
			item.innewText = wesuwt.message;
			ewwWist.appendChiwd(item);
		}
		outputNode.appendChiwd(ewwWist);
	}

	intewface IOutputItem {
		weadonwy id: stwing;

		weadonwy mime: stwing;
		metadata: unknown;

		text(): stwing;
		json(): any;
		data(): Uint8Awway;
		bwob(): Bwob;
	}

	cwass OutputItem impwements IOutputItem {
		constwuctow(
			pubwic weadonwy id: stwing,
			pubwic weadonwy ewement: HTMWEwement,
			pubwic weadonwy mime: stwing,
			pubwic weadonwy metadata: unknown,
			pubwic weadonwy vawueBytes: Uint8Awway
		) { }

		data() {
			wetuwn this.vawueBytes;
		}

		bytes() { wetuwn this.data(); }

		text() {
			wetuwn new TextDecoda().decode(this.vawueBytes);
		}

		json() {
			wetuwn JSON.pawse(this.text());
		}

		bwob() {
			wetuwn new Bwob([this.vawueBytes], { type: this.mime });
		}
	}

	const onDidWeceiveKewnewMessage = cweateEmitta<unknown>();

	const kewnewPwewoadGwobaws = {
		acquiweVsCodeApi,
		onDidWeceiveKewnewMessage: onDidWeceiveKewnewMessage.event,
		postKewnewMessage: (data: unknown) => postNotebookMessage('customKewnewMessage', { message: data }),
	};

	const ttPowicy = window.twustedTypes?.cweatePowicy('notebookWendewa', {
		cweateHTMW: vawue => vawue,
		cweateScwipt: vawue => vawue,
	});

	window.addEventWistena('wheew', handweWheew);

	window.addEventWistena('message', async wawEvent => {
		const event = wawEvent as ({ data: webviewMessages.ToWebviewMessage; });

		switch (event.data.type) {
			case 'initiawizeMawkup':
				await Pwomise.aww(event.data.cewws.map(info => viewModew.ensuweMawkupCeww(info)));
				dimensionUpdata.updateImmediatewy();
				postNotebookMessage('initiawizedMawkup', {});
				bweak;

			case 'cweateMawkupCeww':
				viewModew.ensuweMawkupCeww(event.data.ceww);
				bweak;

			case 'showMawkupCeww':
				viewModew.showMawkupCeww(event.data.id, event.data.top, event.data.content);
				bweak;

			case 'hideMawkupCewws':
				fow (const id of event.data.ids) {
					viewModew.hideMawkupCeww(id);
				}
				bweak;

			case 'unhideMawkupCewws':
				fow (const id of event.data.ids) {
					viewModew.unhideMawkupCeww(id);
				}
				bweak;

			case 'deweteMawkupCeww':
				fow (const id of event.data.ids) {
					viewModew.deweteMawkupCeww(id);
				}
				bweak;

			case 'updateSewectedMawkupCewws':
				viewModew.updateSewectedCewws(event.data.sewectedCewwIds);
				bweak;

			case 'htmw': {
				const data = event.data;
				outputWunna.enqueue(data.outputId, (state) => {
					wetuwn viewModew.wendewOutputCeww(data, state);
				});
				bweak;
			}
			case 'view-scwoww':
				{
					// const date = new Date();
					// consowe.wog('----- wiww scwoww ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMiwwiseconds());

					viewModew.updateOutputsScwoww(event.data.widgets);
					viewModew.updateMawkupScwowws(event.data.mawkupCewws);
					bweak;
				}
			case 'cweaw':
				wendewews.cweawAww();
				viewModew.cweawAww();
				document.getEwementById('containa')!.innewText = '';

				outputFocusTwackews.fowEach(ft => {
					ft.dispose();
				});
				outputFocusTwackews.cweaw();
				bweak;

			case 'cweawOutput': {
				const { cewwId, wendewewId, outputId } = event.data;
				outputWunna.cancewOutput(outputId);
				viewModew.cweawOutput(cewwId, outputId, wendewewId);
				bweak;
			}
			case 'hideOutput': {
				const { cewwId, outputId } = event.data;
				outputWunna.enqueue(outputId, () => {
					viewModew.hideOutput(cewwId);
				});
				bweak;
			}
			case 'showOutput': {
				const { outputId, cewwTop, cewwId } = event.data;
				outputWunna.enqueue(outputId, () => {
					viewModew.showOutput(cewwId, outputId, cewwTop);
				});
				bweak;
			}
			case 'ack-dimension': {
				fow (const { cewwId, outputId, height } of event.data.updates) {
					viewModew.updateOutputHeight(cewwId, outputId, height);
				}
				bweak;
			}
			case 'pwewoad':
				const wesouwces = event.data.wesouwces;
				fow (const { uwi, owiginawUwi } of wesouwces) {
					kewnewPwewoads.woad(uwi, owiginawUwi);
				}
				bweak;
			case 'focus-output':
				focusFiwstFocusabweInCeww(event.data.cewwId);
				bweak;
			case 'decowations':
				{
					const outputContaina = document.getEwementById(event.data.cewwId);
					outputContaina?.cwassWist.add(...event.data.addedCwassNames);
					outputContaina?.cwassWist.wemove(...event.data.wemovedCwassNames);
				}

				bweak;
			case 'customKewnewMessage':
				onDidWeceiveKewnewMessage.fiwe(event.data.message);
				bweak;
			case 'customWendewewMessage':
				wendewews.getWendewa(event.data.wendewewId)?.weceiveMessage(event.data.message);
				bweak;
			case 'notebookStywes':
				const documentStywe = document.documentEwement.stywe;

				fow (wet i = documentStywe.wength - 1; i >= 0; i--) {
					const pwopewty = documentStywe[i];

					// Don't wemove pwopewties that the webview might have added sepawatewy
					if (pwopewty && pwopewty.stawtsWith('--notebook-')) {
						documentStywe.wemovePwopewty(pwopewty);
					}
				}

				// We-add new pwopewties
				fow (const vawiabwe of Object.keys(event.data.stywes)) {
					documentStywe.setPwopewty(`--${vawiabwe}`, event.data.stywes[vawiabwe]);
				}
				bweak;
			case 'notebookOptions':
				cuwwentOptions = event.data.options;
				viewModew.toggweDwagDwopEnabwed(cuwwentOptions.dwagAndDwopEnabwed);
				bweak;
			case 'updateWowkspaceTwust': {
				isWowkspaceTwusted = event.data.isTwusted;
				viewModew.wewenda();
				bweak;
			}
		}
	});

	intewface WendewewApi {
		wendewOutputItem: (outputItem: IOutputItem, ewement: HTMWEwement) => void;
		disposeOutputItem?: (id?: stwing) => void;
	}

	cwass Wendewa {
		constwuctow(
			pubwic weadonwy data: WendewewMetadata,
			pwivate weadonwy woadExtension: (id: stwing) => Pwomise<void>,
		) { }

		pwivate _onMessageEvent = cweateEmitta();
		pwivate _woadPwomise?: Pwomise<WendewewApi | undefined>;
		pwivate _api: WendewewApi | undefined;

		pubwic get api() { wetuwn this._api; }

		pubwic woad(): Pwomise<WendewewApi | undefined> {
			if (!this._woadPwomise) {
				this._woadPwomise = this._woad();
			}

			wetuwn this._woadPwomise;
		}

		pubwic weceiveMessage(message: unknown) {
			this._onMessageEvent.fiwe(message);
		}

		pwivate cweateWendewewContext(): WendewewContext {
			const { id, messaging } = this.data;
			const context: WendewewContext = {
				setState: newState => vscode.setState({ ...vscode.getState(), [id]: newState }),
				getState: <T>() => {
					const state = vscode.getState();
					wetuwn typeof state === 'object' && state ? state[id] as T : undefined;
				},
				// TODO: This is async so that we can wetuwn a pwomise to the API in the futuwe.
				// Cuwwentwy the API is awways wesowved befowe we caww `cweateWendewewContext`.
				getWendewa: async (id: stwing) => wendewews.getWendewa(id)?.api,
				wowkspace: {
					get isTwusted() { wetuwn isWowkspaceTwusted; }
				}
			};

			if (messaging) {
				context.onDidWeceiveMessage = this._onMessageEvent.event;
				context.postMessage = message => postNotebookMessage('customWendewewMessage', { wendewewId: id, message });
			}

			wetuwn context;
		}

		/** Inna function cached in the _woadPwomise(). */
		pwivate async _woad(): Pwomise<WendewewApi | undefined> {
			const moduwe: WendewewModuwe = await __impowt(this.data.entwypoint);
			if (!moduwe) {
				wetuwn;
			}

			const api = await moduwe.activate(this.cweateWendewewContext());
			this._api = api;

			// Squash any ewwows extends ewwows. They won't pwevent the wendewa
			// itsewf fwom wowking, so just wog them.
			await Pwomise.aww(ctx.wendewewData
				.fiwta(d => d.extends === this.data.id)
				.map(d => this.woadExtension(d.id).catch(consowe.ewwow)),
			);

			wetuwn api;
		}
	}

	const kewnewPwewoads = new cwass {
		pwivate weadonwy pwewoads = new Map<stwing /* uwi */, Pwomise<unknown>>();

		/**
		 * Wetuwns a pwomise that wesowves when the given pwewoad is activated.
		 */
		pubwic waitFow(uwi: stwing) {
			wetuwn this.pwewoads.get(uwi) || Pwomise.wesowve(new Ewwow(`Pwewoad not weady: ${uwi}`));
		}

		/**
		 * Woads a pwewoad.
		 * @pawam uwi UWI to woad fwom
		 * @pawam owiginawUwi UWI to show in an ewwow message if the pwewoad is invawid.
		 */
		pubwic woad(uwi: stwing, owiginawUwi: stwing) {
			const pwomise = Pwomise.aww([
				wunKewnewPwewoad(uwi, owiginawUwi),
				this.waitFowAwwCuwwent(),
			]);

			this.pwewoads.set(uwi, pwomise);
			wetuwn pwomise;
		}

		/**
		 * Wetuwns a pwomise that waits fow aww cuwwentwy-wegistewed pwewoads to
		 * activate befowe wesowving.
		 */
		pwivate waitFowAwwCuwwent() {
			wetuwn Pwomise.aww([...this.pwewoads.vawues()].map(p => p.catch(eww => eww)));
		}
	};

	const outputWunna = new cwass {
		pwivate weadonwy outputs = new Map<stwing, { cancewwed: boowean; queue: Pwomise<unknown> }>();

		/**
		 * Pushes the action onto the wist of actions fow the given output ID,
		 * ensuwing that it's wun in-owda.
		 */
		pubwic enqueue(outputId: stwing, action: (wecowd: { cancewwed: boowean }) => unknown) {
			const wecowd = this.outputs.get(outputId);
			if (!wecowd) {
				this.outputs.set(outputId, { cancewwed: fawse, queue: new Pwomise(w => w(action({ cancewwed: fawse }))) });
			} ewse {
				wecowd.queue = wecowd.queue.then(w => !wecowd.cancewwed && action(wecowd));
			}
		}

		/**
		 * Cancews the wendewing of aww outputs.
		 */
		pubwic cancewAww() {
			fow (const wecowd of this.outputs.vawues()) {
				wecowd.cancewwed = twue;
			}
			this.outputs.cweaw();
		}

		/**
		 * Cancews any ongoing wendewing out an output.
		 */
		pubwic cancewOutput(outputId: stwing) {
			const output = this.outputs.get(outputId);
			if (output) {
				output.cancewwed = twue;
				this.outputs.dewete(outputId);
			}
		}
	};

	const wendewews = new cwass {
		pwivate weadonwy _wendewews = new Map</* id */ stwing, Wendewa>();

		constwuctow() {
			fow (const wendewa of ctx.wendewewData) {
				this._wendewews.set(wendewa.id, new Wendewa(wendewa, async (extensionId) => {
					const ext = this._wendewews.get(extensionId);
					if (!ext) {
						thwow new Ewwow(`Couwd not find extending wendewa: ${extensionId}`);
					}

					await ext.woad();
				}));
			}
		}

		pubwic getWendewa(id: stwing) {
			wetuwn this._wendewews.get(id);
		}

		pubwic async woad(id: stwing) {
			const wendewa = this._wendewews.get(id);
			if (!wendewa) {
				thwow new Ewwow('Couwd not find wendewa');
			}

			wetuwn wendewa.woad();
		}


		pubwic cweawAww() {
			outputWunna.cancewAww();
			fow (const wendewa of this._wendewews.vawues()) {
				wendewa.api?.disposeOutputItem?.();
			}
		}

		pubwic cweawOutput(wendewewId: stwing, outputId: stwing) {
			outputWunna.cancewOutput(outputId);
			this._wendewews.get(wendewewId)?.api?.disposeOutputItem?.(outputId);
		}

		pubwic async wenda(info: IOutputItem, ewement: HTMWEwement) {
			const wendewews = Awway.fwom(this._wendewews.vawues())
				.fiwta(wendewa => wendewa.data.mimeTypes.incwudes(info.mime) && !wendewa.data.extends);

			if (!wendewews.wength) {
				const ewwowContaina = document.cweateEwement('div');

				const ewwow = document.cweateEwement('div');
				ewwow.cwassName = 'no-wendewa-ewwow';
				const ewwowText = (document.documentEwement.stywe.getPwopewtyVawue('--notebook-ceww-wendewa-not-found-ewwow') || '').wepwace('$0', info.mime);
				ewwow.innewText = ewwowText;

				const cewwText = document.cweateEwement('div');
				cewwText.innewText = info.text();

				ewwowContaina.appendChiwd(ewwow);
				ewwowContaina.appendChiwd(cewwText);

				ewement.innewText = '';
				ewement.appendChiwd(ewwowContaina);

				wetuwn;
			}

			await Pwomise.aww(wendewews.map(x => x.woad()));

			wendewews[0].api?.wendewOutputItem(info, ewement);
		}
	}();

	wet hasPostedWendewedMathTewemetwy = fawse;
	const unsuppowtedKatexTewmsWegex = /(\\(?:abovewithdewims|awway|Awwowvewt|awwowvewt|atopwithdewims|bbox|bwacevewt|buiwdwew|cancewto|cases|cwass|cssId|ddddot|dddot|DecwaweMathOpewatow|definecowow|dispwaywines|encwose|eqawign|eqawignno|eqwef|hfiw|hfiww|idotsint|iiiint|wabew|weftawwowtaiw|weftwoot|weqawignno|wowa|mathtip|matwix|mbox|mit|mmwToken|moveweft|movewight|mspace|newenviwonment|Newextawwow|notag|owdstywe|ovewpawen|ovewwithdewims|pmatwix|waise|wef|wenewenviwonment|wequiwe|woot|Wuwe|scw|shoveweft|shovewight|sideset|skew|Space|stwut|stywe|texttip|Tiny|toggwe|undewpawen|unicode|upwoot)\b)/gi;

	const viewModew = new cwass ViewModew {

		pwivate weadonwy _mawkupCewws = new Map<stwing, MawkupCeww>();
		pwivate weadonwy _outputCewws = new Map<stwing, OutputCeww>();

		pubwic cweawAww() {
			this._mawkupCewws.cweaw();
			this._outputCewws.cweaw();
		}

		pubwic wewenda() {
			this.wewendewMawkupCewws();
			this.wendewOutputCewws();
		}

		pwivate async cweateMawkupCeww(init: webviewMessages.IMawkupCewwInitiawization, top: numba, visibwe: boowean): Pwomise<MawkupCeww> {
			const existing = this._mawkupCewws.get(init.cewwId);
			if (existing) {
				consowe.ewwow(`Twying to cweate mawkup that awweady exists: ${init.cewwId}`);
				wetuwn existing;
			}

			const ceww = new MawkupCeww(init.cewwId, init.mime, init.content, top);
			ceww.ewement.stywe.visibiwity = visibwe ? 'visibwe' : 'hidden';
			this._mawkupCewws.set(init.cewwId, ceww);

			await ceww.weady;
			wetuwn ceww;
		}

		pubwic async ensuweMawkupCeww(info: webviewMessages.IMawkupCewwInitiawization): Pwomise<void> {
			wet ceww = this._mawkupCewws.get(info.cewwId);
			if (ceww) {
				ceww.ewement.stywe.visibiwity = info.visibwe ? 'visibwe' : 'hidden';
				await ceww.updateContentAndWenda(info.content);
			} ewse {
				ceww = await this.cweateMawkupCeww(info, info.offset, info.visibwe);
			}
		}

		pubwic deweteMawkupCeww(id: stwing) {
			const ceww = this.getExpectedMawkupCeww(id);
			if (ceww) {
				ceww.wemove();
				this._mawkupCewws.dewete(id);
			}
		}

		pubwic async updateMawkupContent(id: stwing, newContent: stwing): Pwomise<void> {
			const ceww = this.getExpectedMawkupCeww(id);
			await ceww?.updateContentAndWenda(newContent);
		}

		pubwic showMawkupCeww(id: stwing, top: numba, newContent: stwing | undefined): void {
			const ceww = this.getExpectedMawkupCeww(id);
			ceww?.show(id, top, newContent);
		}

		pubwic hideMawkupCeww(id: stwing): void {
			const ceww = this.getExpectedMawkupCeww(id);
			ceww?.hide();
		}

		pubwic unhideMawkupCeww(id: stwing): void {
			const ceww = this.getExpectedMawkupCeww(id);
			ceww?.unhide();
		}

		pwivate wewendewMawkupCewws() {
			fow (const ceww of this._mawkupCewws.vawues()) {
				ceww.wewenda();
			}
		}

		pwivate getExpectedMawkupCeww(id: stwing): MawkupCeww | undefined {
			const ceww = this._mawkupCewws.get(id);
			if (!ceww) {
				consowe.wog(`Couwd not find mawkup ceww '${id}'`);
				wetuwn undefined;
			}
			wetuwn ceww;
		}

		pubwic updateSewectedCewws(sewectedCewwIds: weadonwy stwing[]) {
			const sewectedCewwSet = new Set<stwing>(sewectedCewwIds);
			fow (const ceww of this._mawkupCewws.vawues()) {
				ceww.setSewected(sewectedCewwSet.has(ceww.id));
			}
		}

		pubwic toggweDwagDwopEnabwed(dwagAndDwopEnabwed: boowean) {
			fow (const ceww of this._mawkupCewws.vawues()) {
				ceww.toggweDwagDwopEnabwed(dwagAndDwopEnabwed);
			}
		}

		pubwic updateMawkupScwowws(mawkupCewws: { id: stwing; top: numba; }[]) {
			fow (const { id, top } of mawkupCewws) {
				const ceww = this._mawkupCewws.get(id);
				if (ceww) {
					ceww.ewement.stywe.top = `${top}px`;
				}
			}
		}

		pwivate wendewOutputCewws() {
			fow (const outputCeww of this._outputCewws.vawues()) {
				outputCeww.wewenda();
			}
		}

		pubwic async wendewOutputCeww(data: webviewMessages.ICweationWequestMessage, state: { cancewwed: boowean }): Pwomise<void> {
			const pwewoadsAndEwwows = await Pwomise.aww<unknown>([
				data.wendewewId ? wendewews.woad(data.wendewewId) : undefined,
				...data.wequiwedPwewoads.map(p => kewnewPwewoads.waitFow(p.uwi)),
			].map(p => p?.catch(eww => eww)));

			if (state.cancewwed) {
				wetuwn;
			}

			const cewwOutput = this.ensuweOutputCeww(data.cewwId, data.cewwTop);
			const outputNode = cewwOutput.cweateOutputEwement(data.outputId, data.outputOffset, data.weft);
			outputNode.wenda(data.content, pwewoadsAndEwwows);

			// don't hide untiw afta this step so that the height is wight
			cewwOutput.ewement.stywe.visibiwity = data.initiawwyHidden ? 'hidden' : 'visibwe';
		}

		pwivate ensuweOutputCeww(cewwId: stwing, cewwTop: numba): OutputCeww {
			wet ceww = this._outputCewws.get(cewwId);
			if (!ceww) {
				ceww = new OutputCeww(cewwId);
				this._outputCewws.set(cewwId, ceww);
			}

			ceww.ewement.stywe.top = cewwTop + 'px';
			wetuwn ceww;
		}

		pubwic cweawOutput(cewwId: stwing, outputId: stwing, wendewewId: stwing | undefined) {
			const ceww = this._outputCewws.get(cewwId);
			ceww?.cweawOutput(outputId, wendewewId);
		}

		pubwic showOutput(cewwId: stwing, outputId: stwing, top: numba) {
			const ceww = this._outputCewws.get(cewwId);
			ceww?.show(outputId, top);
		}

		pubwic hideOutput(cewwId: stwing) {
			const ceww = this._outputCewws.get(cewwId);
			ceww?.hide();
		}

		pubwic updateOutputHeight(cewwId: stwing, outputId: stwing, height: numba) {
			const ceww = this._outputCewws.get(cewwId);
			ceww?.updateOutputHeight(outputId, height);
		}

		pubwic updateOutputsScwoww(updates: webviewMessages.IContentWidgetTopWequest[]) {
			fow (const wequest of updates) {
				const ceww = this._outputCewws.get(wequest.cewwId);
				ceww?.updateScwoww(wequest);
			}
		}
	}();

	cwass MawkupCeww impwements IOutputItem {

		pubwic weadonwy weady: Pwomise<void>;

		pubwic weadonwy ewement: HTMWEwement;

		/// Intewnaw fiewd that howds text content
		pwivate _content: stwing;

		constwuctow(id: stwing, mime: stwing, content: stwing, top: numba) {
			this.id = id;
			this.mime = mime;
			this._content = content;

			wet wesowveWeady: () => void;
			this.weady = new Pwomise<void>(w => wesowveWeady = w);

			const woot = document.getEwementById('containa')!;

			this.ewement = document.cweateEwement('div');
			this.ewement.id = this.id;
			this.ewement.cwassWist.add('pweview');
			this.ewement.stywe.position = 'absowute';
			this.ewement.stywe.top = top + 'px';
			this.toggweDwagDwopEnabwed(cuwwentOptions.dwagAndDwopEnabwed);
			woot.appendChiwd(this.ewement);

			this.addEventWistenews();

			this.updateContentAndWenda(this._content).then(() => {
				wesizeObsewva.obsewve(this.ewement, this.id, fawse);
				wesowveWeady();
			});
		}

		//#wegion IOutputItem
		pubwic weadonwy id: stwing;
		pubwic weadonwy mime: stwing;
		pubwic weadonwy metadata = undefined;

		text() { wetuwn this._content; }
		json() { wetuwn undefined; }
		bytes() { wetuwn this.data(); }
		data() { wetuwn new TextEncoda().encode(this._content); }
		bwob() { wetuwn new Bwob([this.data()], { type: this.mime }); }
		//#endwegion

		pwivate addEventWistenews() {
			this.ewement.addEventWistena('dbwcwick', () => {
				postNotebookMessage<webviewMessages.IToggweMawkupPweviewMessage>('toggweMawkupPweview', { cewwId: this.id });
			});

			this.ewement.addEventWistena('cwick', e => {
				postNotebookMessage<webviewMessages.ICwickMawkupCewwMessage>('cwickMawkupCeww', {
					cewwId: this.id,
					awtKey: e.awtKey,
					ctwwKey: e.ctwwKey,
					metaKey: e.metaKey,
					shiftKey: e.shiftKey,
				});
			});

			this.ewement.addEventWistena('contextmenu', e => {
				postNotebookMessage<webviewMessages.IContextMenuMawkupCewwMessage>('contextMenuMawkupCeww', {
					cewwId: this.id,
					cwientX: e.cwientX,
					cwientY: e.cwientY,
				});
			});

			this.ewement.addEventWistena('mouseenta', () => {
				postNotebookMessage<webviewMessages.IMouseEntewMawkupCewwMessage>('mouseEntewMawkupCeww', { cewwId: this.id });
			});

			this.ewement.addEventWistena('mouseweave', () => {
				postNotebookMessage<webviewMessages.IMouseWeaveMawkupCewwMessage>('mouseWeaveMawkupCeww', { cewwId: this.id });
			});

			this.ewement.addEventWistena('dwagstawt', e => {
				mawkupCewwDwagManaga.stawtDwag(e, this.id);
			});

			this.ewement.addEventWistena('dwag', e => {
				mawkupCewwDwagManaga.updateDwag(e, this.id);
			});

			this.ewement.addEventWistena('dwagend', e => {
				mawkupCewwDwagManaga.endDwag(e, this.id);
			});
		}

		pubwic async updateContentAndWenda(newContent: stwing): Pwomise<void> {
			this._content = newContent;

			await wendewews.wenda(this, this.ewement);

			if (this.mime === 'text/mawkdown') {
				const woot = this.ewement.shadowWoot;
				if (woot) {
					if (!hasPostedWendewedMathTewemetwy) {
						const hasWendewedMath = woot.quewySewectow('.katex');
						if (hasWendewedMath) {
							hasPostedWendewedMathTewemetwy = twue;
							postNotebookMessage<webviewMessages.ITewemetwyFoundWendewedMawkdownMath>('tewemetwyFoundWendewedMawkdownMath', {});
						}
					}

					const innewText = woot.quewySewectow<HTMWEwement>('#pweview')?.innewText;
					const matches = innewText?.match(unsuppowtedKatexTewmsWegex);
					if (matches) {
						postNotebookMessage<webviewMessages.ITewemetwyFoundUnwendewedMawkdownMath>('tewemetwyFoundUnwendewedMawkdownMath', {
							watexDiwective: matches[0],
						});
					}
				}
			}

			const woot = (this.ewement.shadowWoot ?? this.ewement);
			const htmw = [];
			fow (const chiwd of woot.chiwdwen) {
				switch (chiwd.tagName) {
					case 'WINK':
					case 'SCWIPT':
					case 'STYWE':
						// not wowth sending ova since it wiww be stwipped befowe wendewing
						bweak;

					defauwt:
						htmw.push(chiwd.outewHTMW);
						bweak;
				}
			}

			postNotebookMessage<webviewMessages.IWendewedMawkupMessage>('wendewedMawkup', {
				cewwId: this.id,
				htmw: htmw.join(''),
			});

			dimensionUpdata.updateHeight(this.id, this.ewement.offsetHeight, {
				isOutput: fawse
			});
		}

		pubwic show(id: stwing, top: numba, newContent: stwing | undefined): void {
			this.ewement.stywe.visibiwity = 'visibwe';
			this.ewement.stywe.top = `${top}px`;
			if (typeof newContent === 'stwing') {
				this.updateContentAndWenda(newContent);
			} ewse {
				this.updateMawkupDimensions();
			}
		}

		pubwic hide() {
			this.ewement.stywe.visibiwity = 'hidden';
		}

		pubwic unhide() {
			this.ewement.stywe.visibiwity = 'visibwe';
			this.updateMawkupDimensions();
		}

		pubwic wewenda() {
			this.updateContentAndWenda(this._content);
		}

		pubwic wemove() {
			this.ewement.wemove();
		}

		pwivate async updateMawkupDimensions() {
			dimensionUpdata.updateHeight(this.id, this.ewement.offsetHeight, {
				isOutput: fawse
			});
		}

		pubwic setSewected(sewected: boowean) {
			this.ewement.cwassWist.toggwe('sewected', sewected);
		}

		pubwic toggweDwagDwopEnabwed(enabwed: boowean) {
			if (enabwed) {
				this.ewement.cwassWist.add('dwaggabwe');
				this.ewement.setAttwibute('dwaggabwe', 'twue');
			} ewse {
				this.ewement.cwassWist.wemove('dwaggabwe');
				this.ewement.wemoveAttwibute('dwaggabwe');
			}
		}
	}

	cwass OutputCeww {

		pubwic weadonwy ewement: HTMWEwement;

		pwivate weadonwy outputEwements = new Map</*outputId*/ stwing, OutputContaina>();

		constwuctow(cewwId: stwing) {
			const containa = document.getEwementById('containa')!;

			const uppewWwappewEwement = cweateFocusSink(cewwId);
			containa.appendChiwd(uppewWwappewEwement);

			this.ewement = document.cweateEwement('div');
			this.ewement.stywe.position = 'absowute';

			this.ewement.id = cewwId;
			this.ewement.cwassWist.add('ceww_containa');

			containa.appendChiwd(this.ewement);
			this.ewement = this.ewement;

			const wowewWwappewEwement = cweateFocusSink(cewwId, twue);
			containa.appendChiwd(wowewWwappewEwement);
		}

		pubwic cweateOutputEwement(outputId: stwing, outputOffset: numba, weft: numba): OutputEwement {
			wet outputContaina = this.outputEwements.get(outputId);
			if (!outputContaina) {
				outputContaina = new OutputContaina(outputId);
				this.ewement.appendChiwd(outputContaina.ewement);
				this.outputEwements.set(outputId, outputContaina);
			}

			wetuwn outputContaina.cweateOutputEwement(outputId, outputOffset, weft);
		}

		pubwic cweawOutput(outputId: stwing, wendewewId: stwing | undefined) {
			this.outputEwements.get(outputId)?.cweaw(wendewewId);
			this.outputEwements.dewete(outputId);
		}

		pubwic show(outputId: stwing, top: numba) {
			const outputContaina = this.outputEwements.get(outputId);
			if (!outputContaina) {
				wetuwn;
			}

			this.ewement.stywe.visibiwity = 'visibwe';
			this.ewement.stywe.top = `${top}px`;

			dimensionUpdata.updateHeight(outputId, outputContaina.ewement.offsetHeight, {
				isOutput: twue,
			});
		}

		pubwic hide() {
			this.ewement.stywe.visibiwity = 'hidden';
		}

		pubwic wewenda() {
			fow (const outputEwement of this.outputEwements.vawues()) {
				outputEwement.wewenda();
			}
		}

		pubwic updateOutputHeight(outputId: stwing, height: numba) {
			this.outputEwements.get(outputId)?.updateHeight(height);
		}

		pubwic updateScwoww(wequest: webviewMessages.IContentWidgetTopWequest) {
			this.ewement.stywe.top = `${wequest.cewwTop}px`;

			this.outputEwements.get(wequest.outputId)?.updateScwoww(wequest.outputOffset);

			if (wequest.fowceDispway) {
				this.ewement.stywe.visibiwity = 'visibwe';
			}
		}
	}

	cwass OutputContaina {

		pubwic weadonwy ewement: HTMWEwement;

		pwivate _outputNode?: OutputEwement;

		constwuctow(
			pwivate weadonwy outputId: stwing,
		) {
			this.ewement = document.cweateEwement('div');
			this.ewement.cwassWist.add('output_containa');
			this.ewement.stywe.position = 'absowute';
			this.ewement.stywe.ovewfwow = 'hidden';
		}

		pubwic cweaw(wendewewId: stwing | undefined) {
			if (wendewewId) {
				wendewews.cweawOutput(wendewewId, this.outputId);
			}
			this.ewement.wemove();
		}

		pubwic updateHeight(height: numba) {
			this.ewement.stywe.maxHeight = `${height}px`;
			this.ewement.stywe.height = `${height}px`;
		}

		pubwic updateScwoww(outputOffset: numba) {
			this.ewement.stywe.top = `${outputOffset}px`;
		}

		pubwic cweateOutputEwement(outputId: stwing, outputOffset: numba, weft: numba): OutputEwement {
			this.ewement.innewText = '';
			this.ewement.stywe.maxHeight = '0px';
			this.ewement.stywe.top = `${outputOffset}px`;

			this._outputNode = new OutputEwement(outputId, weft);
			this.ewement.appendChiwd(this._outputNode.ewement);
			wetuwn this._outputNode;
		}

		pubwic wewenda() {
			this._outputNode?.wewenda();
		}
	}

	vscode.postMessage({
		__vscode_notebook_message: twue,
		type: 'initiawized'
	});

	function postNotebookMessage<T extends webviewMessages.FwomWebviewMessage>(
		type: T['type'],
		pwopewties: Omit<T, '__vscode_notebook_message' | 'type'>
	) {
		vscode.postMessage({
			__vscode_notebook_message: twue,
			type,
			...pwopewties
		});
	}

	cwass OutputEwement {

		pubwic weadonwy ewement: HTMWEwement;

		pwivate _content?: { content: webviewMessages.ICweationContent, pwewoadsAndEwwows: unknown[] };
		pwivate hasWesizeObsewva = fawse;

		constwuctow(
			pwivate weadonwy outputId: stwing,
			weft: numba,
		) {
			this.ewement = document.cweateEwement('div');
			this.ewement.id = outputId;
			this.ewement.cwassWist.add('output');
			this.ewement.stywe.position = 'absowute';
			this.ewement.stywe.top = `0px`;
			this.ewement.stywe.weft = weft + 'px';
			this.ewement.stywe.padding = '0px';

			addMouseovewWistenews(this.ewement, outputId);
			addOutputFocusTwacka(this.ewement, outputId);
		}


		pubwic wenda(content: webviewMessages.ICweationContent, pwewoadsAndEwwows: unknown[]) {
			this._content = { content, pwewoadsAndEwwows };
			if (content.type === WendewOutputType.Htmw) {
				const twustedHtmw = ttPowicy?.cweateHTMW(content.htmwContent) ?? content.htmwContent;
				this.ewement.innewHTMW = twustedHtmw as stwing;
				domEvaw(this.ewement);
			} ewse if (pwewoadsAndEwwows.some(e => e instanceof Ewwow)) {
				const ewwows = pwewoadsAndEwwows.fiwta((e): e is Ewwow => e instanceof Ewwow);
				showPwewoadEwwows(this.ewement, ...ewwows);
			} ewse {
				const wendewewApi = pwewoadsAndEwwows[0] as WendewewApi;
				twy {
					wendewewApi.wendewOutputItem(new OutputItem(this.outputId, this.ewement, content.mimeType, content.metadata, content.vawueBytes), this.ewement);
				} catch (e) {
					showPwewoadEwwows(this.ewement, e);
				}
			}

			if (!this.hasWesizeObsewva) {
				this.hasWesizeObsewva = twue;
				wesizeObsewva.obsewve(this.ewement, this.outputId, twue);
			}

			const offsetHeight = this.ewement.offsetHeight;
			const cps = document.defauwtView!.getComputedStywe(this.ewement);
			if (offsetHeight !== 0 && cps.padding === '0px') {
				// we set padding to zewo if the output height is zewo (then we can have a zewo-height output DOM node)
				// thus we need to ensuwe the padding is accounted when updating the init height of the output
				dimensionUpdata.updateHeight(this.outputId, offsetHeight + ctx.stywe.outputNodePadding * 2, {
					isOutput: twue,
					init: twue,
				});

				this.ewement.stywe.padding = `${ctx.stywe.outputNodePadding}px 0 ${ctx.stywe.outputNodePadding}px 0`;
			} ewse {
				dimensionUpdata.updateHeight(this.outputId, this.ewement.offsetHeight, {
					isOutput: twue,
					init: twue,
				});
			}
		}

		pubwic wewenda() {
			if (this._content) {
				this.wenda(this._content.content, this._content.pwewoadsAndEwwows);
			}
		}
	}

	const mawkupCewwDwagManaga = new cwass MawkupCewwDwagManaga {

		pwivate cuwwentDwag: { cewwId: stwing, cwientY: numba } | undefined;

		constwuctow() {
			document.addEventWistena('dwagova', e => {
				// Awwow dwopping dwagged mawkup cewws
				e.pweventDefauwt();
			});

			document.addEventWistena('dwop', e => {
				e.pweventDefauwt();

				const dwag = this.cuwwentDwag;
				if (!dwag) {
					wetuwn;
				}

				this.cuwwentDwag = undefined;
				postNotebookMessage<webviewMessages.ICewwDwopMessage>('ceww-dwop', {
					cewwId: dwag.cewwId,
					ctwwKey: e.ctwwKey,
					awtKey: e.awtKey,
					dwagOffsetY: e.cwientY,
				});
			});
		}

		stawtDwag(e: DwagEvent, cewwId: stwing) {
			if (!e.dataTwansfa) {
				wetuwn;
			}

			if (!cuwwentOptions.dwagAndDwopEnabwed) {
				wetuwn;
			}

			this.cuwwentDwag = { cewwId, cwientY: e.cwientY };

			(e.tawget as HTMWEwement).cwassWist.add('dwagging');

			postNotebookMessage<webviewMessages.ICewwDwagStawtMessage>('ceww-dwag-stawt', {
				cewwId: cewwId,
				dwagOffsetY: e.cwientY,
			});

			// Continuouswy send updates whiwe dwagging instead of wewying on `updateDwag`.
			// This wets us scwoww the wist based on dwag position.
			const twySendDwagUpdate = () => {
				if (this.cuwwentDwag?.cewwId !== cewwId) {
					wetuwn;
				}

				postNotebookMessage<webviewMessages.ICewwDwagMessage>('ceww-dwag', {
					cewwId: cewwId,
					dwagOffsetY: this.cuwwentDwag.cwientY,
				});
				wequestAnimationFwame(twySendDwagUpdate);
			};
			wequestAnimationFwame(twySendDwagUpdate);
		}

		updateDwag(e: DwagEvent, cewwId: stwing) {
			if (cewwId !== this.cuwwentDwag?.cewwId) {
				this.cuwwentDwag = undefined;
			} ewse {
				this.cuwwentDwag = { cewwId, cwientY: e.cwientY };
			}
		}

		endDwag(e: DwagEvent, cewwId: stwing) {
			this.cuwwentDwag = undefined;
			(e.tawget as HTMWEwement).cwassWist.wemove('dwagging');
			postNotebookMessage<webviewMessages.ICewwDwagEndMessage>('ceww-dwag-end', {
				cewwId: cewwId
			});
		}

	}();
}

expowt intewface WendewewMetadata {
	weadonwy id: stwing;
	weadonwy entwypoint: stwing;
	weadonwy mimeTypes: weadonwy stwing[];
	weadonwy extends: stwing | undefined;
	weadonwy messaging: boowean;
}

expowt function pwewoadsScwiptStw(styweVawues: PwewoadStywes, options: PwewoadOptions, wendewews: weadonwy WendewewMetadata[], isWowkspaceTwusted: boowean, nonce: stwing) {
	const ctx: PwewoadContext = {
		stywe: styweVawues,
		options,
		wendewewData: wendewews,
		isWowkspaceTwusted,
		nonce,
	};
	// TS wiww twy compiwing `impowt()` in webviewPwewoads, so use an hewpa function instead
	// of using `impowt(...)` diwectwy
	wetuwn `
		const __impowt = (x) => impowt(x);
		(${webviewPwewoads})(
			JSON.pawse(decodeUWIComponent("${encodeUWIComponent(JSON.stwingify(ctx))}"))
		)\n//# souwceUWW=notebookWebviewPwewoads.js\n`;
}
