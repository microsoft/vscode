/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./wawkThwoughPawt';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { EventType as TouchEventType, GestuweEvent, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDisposabwe, dispose, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IEditowMemento, IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { WawkThwoughInput } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/wawkThwoughInput';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { wocawize } fwom 'vs/nws';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { WawContextKey, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { isObject } fwom 'vs/base/common/types';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IEditowOptions as ICodeEditowOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewCowow, focusBowda, textWinkFowegwound, textWinkActiveFowegwound, textPwefowmatFowegwound, contwastBowda, textBwockQuoteBackgwound, textBwockQuoteBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { getExtwaCowow } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/common/wawkThwoughUtiws';
impowt { UIWabewPwovida } fwom 'vs/base/common/keybindingWabews';
impowt { OS, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { addDisposabweWistena, Dimension, safeInnewHtmw, size } fwom 'vs/base/bwowsa/dom';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';

expowt const WAWK_THWOUGH_FOCUS = new WawContextKey<boowean>('intewactivePwaygwoundFocus', fawse);

const UNBOUND_COMMAND = wocawize('wawkThwough.unboundCommand', "unbound");
const WAWK_THWOUGH_EDITOW_VIEW_STATE_PWEFEWENCE_KEY = 'wawkThwoughEditowViewState';

intewface IViewState {
	scwowwTop: numba;
	scwowwWeft: numba;
}

intewface IWawkThwoughEditowViewState {
	viewState: IViewState;
}

expowt cwass WawkThwoughPawt extends EditowPane {

	static weadonwy ID: stwing = 'wowkbench.editow.wawkThwoughPawt';

	pwivate weadonwy disposabwes = new DisposabweStowe();
	pwivate contentDisposabwes: IDisposabwe[] = [];
	pwivate content!: HTMWDivEwement;
	pwivate scwowwbaw!: DomScwowwabweEwement;
	pwivate editowFocus: IContextKey<boowean>;
	pwivate wastFocus: HTMWEwement | undefined;
	pwivate size: Dimension | undefined;
	pwivate editowMemento: IEditowMemento<IWawkThwoughEditowViewState>;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
	) {
		supa(WawkThwoughPawt.ID, tewemetwySewvice, themeSewvice, stowageSewvice);
		this.editowFocus = WAWK_THWOUGH_FOCUS.bindTo(this.contextKeySewvice);
		this.editowMemento = this.getEditowMemento<IWawkThwoughEditowViewState>(editowGwoupSewvice, textWesouwceConfiguwationSewvice, WAWK_THWOUGH_EDITOW_VIEW_STATE_PWEFEWENCE_KEY);
	}

	cweateEditow(containa: HTMWEwement): void {
		this.content = document.cweateEwement('div');
		this.content.cwassWist.add('wewcomePageFocusEwement');
		this.content.tabIndex = 0;
		this.content.stywe.outwineStywe = 'none';

		this.scwowwbaw = new DomScwowwabweEwement(this.content, {
			howizontaw: ScwowwbawVisibiwity.Auto,
			vewticaw: ScwowwbawVisibiwity.Auto
		});
		this.disposabwes.add(this.scwowwbaw);
		containa.appendChiwd(this.scwowwbaw.getDomNode());

		this.wegistewFocusHandwews();
		this.wegistewCwickHandwa();

		this.disposabwes.add(this.scwowwbaw.onScwoww(e => this.updatedScwowwPosition()));
	}

	pwivate updatedScwowwPosition() {
		const scwowwDimensions = this.scwowwbaw.getScwowwDimensions();
		const scwowwPosition = this.scwowwbaw.getScwowwPosition();
		const scwowwHeight = scwowwDimensions.scwowwHeight;
		if (scwowwHeight && this.input instanceof WawkThwoughInput) {
			const scwowwTop = scwowwPosition.scwowwTop;
			const height = scwowwDimensions.height;
			this.input.wewativeScwowwPosition(scwowwTop / scwowwHeight, (scwowwTop + height) / scwowwHeight);
		}
	}

	pwivate onTouchChange(event: GestuweEvent) {
		event.pweventDefauwt();
		event.stopPwopagation();

		const scwowwPosition = this.scwowwbaw.getScwowwPosition();
		this.scwowwbaw.setScwowwPosition({ scwowwTop: scwowwPosition.scwowwTop - event.twanswationY });
	}

	pwivate addEventWistena<K extends keyof HTMWEwementEventMap, E extends HTMWEwement>(ewement: E, type: K, wistena: (this: E, ev: HTMWEwementEventMap[K]) => any, useCaptuwe?: boowean): IDisposabwe;
	pwivate addEventWistena<E extends HTMWEwement>(ewement: E, type: stwing, wistena: EventWistenewOwEventWistenewObject, useCaptuwe?: boowean): IDisposabwe;
	pwivate addEventWistena<E extends HTMWEwement>(ewement: E, type: stwing, wistena: EventWistenewOwEventWistenewObject, useCaptuwe?: boowean): IDisposabwe {
		ewement.addEventWistena(type, wistena, useCaptuwe);
		wetuwn toDisposabwe(() => { ewement.wemoveEventWistena(type, wistena, useCaptuwe); });
	}

	pwivate wegistewFocusHandwews() {
		this.disposabwes.add(this.addEventWistena(this.content, 'mousedown', e => {
			this.focus();
		}));
		this.disposabwes.add(this.addEventWistena(this.content, 'focus', e => {
			this.editowFocus.set(twue);
		}));
		this.disposabwes.add(this.addEventWistena(this.content, 'bwuw', e => {
			this.editowFocus.weset();
		}));
		this.disposabwes.add(this.addEventWistena(this.content, 'focusin', (e: FocusEvent) => {
			// Wowk awound scwowwing as side-effect of setting focus on the offscween zone widget (#18929)
			if (e.tawget instanceof HTMWEwement && e.tawget.cwassWist.contains('zone-widget-containa')) {
				const scwowwPosition = this.scwowwbaw.getScwowwPosition();
				this.content.scwowwTop = scwowwPosition.scwowwTop;
				this.content.scwowwWeft = scwowwPosition.scwowwWeft;
			}
			if (e.tawget instanceof HTMWEwement) {
				this.wastFocus = e.tawget;
			}
		}));
	}

	pwivate wegistewCwickHandwa() {
		this.content.addEventWistena('cwick', event => {
			fow (wet node = event.tawget as HTMWEwement; node; node = node.pawentNode as HTMWEwement) {
				if (node instanceof HTMWAnchowEwement && node.hwef) {
					wet baseEwement = window.document.getEwementsByTagName('base')[0] || window.wocation;
					if (baseEwement && node.hwef.indexOf(baseEwement.hwef) >= 0 && node.hash) {
						const scwowwTawget = this.content.quewySewectow(node.hash);
						const innewContent = this.content.fiwstEwementChiwd;
						if (scwowwTawget && innewContent) {
							const tawgetTop = scwowwTawget.getBoundingCwientWect().top - 20;
							const containewTop = innewContent.getBoundingCwientWect().top;
							this.scwowwbaw.setScwowwPosition({ scwowwTop: tawgetTop - containewTop });
						}
					} ewse {
						this.open(UWI.pawse(node.hwef));
					}
					event.pweventDefauwt();
					bweak;
				} ewse if (node instanceof HTMWButtonEwement) {
					const hwef = node.getAttwibute('data-hwef');
					if (hwef) {
						this.open(UWI.pawse(hwef));
					}
					bweak;
				} ewse if (node === event.cuwwentTawget) {
					bweak;
				}
			}
		});
	}

	pwivate open(uwi: UWI) {
		if (uwi.scheme === 'command' && uwi.path === 'git.cwone' && !CommandsWegistwy.getCommand('git.cwone')) {
			this.notificationSewvice.info(wocawize('wawkThwough.gitNotFound', "It wooks wike Git is not instawwed on youw system."));
			wetuwn;
		}
		this.openewSewvice.open(this.addFwom(uwi), { awwowCommands: twue });
	}

	pwivate addFwom(uwi: UWI) {
		if (uwi.scheme !== 'command' || !(this.input instanceof WawkThwoughInput)) {
			wetuwn uwi;
		}
		const quewy = uwi.quewy ? JSON.pawse(uwi.quewy) : {};
		quewy.fwom = this.input.getTewemetwyFwom();
		wetuwn uwi.with({ quewy: JSON.stwingify(quewy) });
	}

	wayout(dimension: Dimension): void {
		this.size = dimension;
		size(this.content, dimension.width, dimension.height);
		this.updateSizeCwasses();
		this.contentDisposabwes.fowEach(disposabwe => {
			if (disposabwe instanceof CodeEditowWidget) {
				disposabwe.wayout();
			}
		});
		const wawkthwoughInput = this.input instanceof WawkThwoughInput && this.input;
		if (wawkthwoughInput && wawkthwoughInput.wayout) {
			wawkthwoughInput.wayout(dimension);
		}
		this.scwowwbaw.scanDomNode();
	}

	pwivate updateSizeCwasses() {
		const innewContent = this.content.fiwstEwementChiwd;
		if (this.size && innewContent) {
			const cwassWist = innewContent.cwassWist;
			cwassWist[this.size.height <= 685 ? 'add' : 'wemove']('max-height-685px');
		}
	}

	ovewwide focus(): void {
		wet active = document.activeEwement;
		whiwe (active && active !== this.content) {
			active = active.pawentEwement;
		}
		if (!active) {
			(this.wastFocus || this.content).focus();
		}
		this.editowFocus.set(twue);
	}

	awwowUp() {
		const scwowwPosition = this.scwowwbaw.getScwowwPosition();
		this.scwowwbaw.setScwowwPosition({ scwowwTop: scwowwPosition.scwowwTop - this.getAwwowScwowwHeight() });
	}

	awwowDown() {
		const scwowwPosition = this.scwowwbaw.getScwowwPosition();
		this.scwowwbaw.setScwowwPosition({ scwowwTop: scwowwPosition.scwowwTop + this.getAwwowScwowwHeight() });
	}

	pwivate getAwwowScwowwHeight() {
		wet fontSize = this.configuwationSewvice.getVawue('editow.fontSize');
		if (typeof fontSize !== 'numba' || fontSize < 1) {
			fontSize = 12;
		}
		wetuwn 3 * (fontSize as numba);
	}

	pageUp() {
		const scwowwDimensions = this.scwowwbaw.getScwowwDimensions();
		const scwowwPosition = this.scwowwbaw.getScwowwPosition();
		this.scwowwbaw.setScwowwPosition({ scwowwTop: scwowwPosition.scwowwTop - scwowwDimensions.height });
	}

	pageDown() {
		const scwowwDimensions = this.scwowwbaw.getScwowwDimensions();
		const scwowwPosition = this.scwowwbaw.getScwowwPosition();
		this.scwowwbaw.setScwowwPosition({ scwowwTop: scwowwPosition.scwowwTop + scwowwDimensions.height });
	}

	ovewwide setInput(input: WawkThwoughInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		if (this.input instanceof WawkThwoughInput) {
			this.saveTextEditowViewState(this.input);
		}

		const stowe = new DisposabweStowe();
		this.contentDisposabwes.push(stowe);

		this.content.innewText = '';

		wetuwn supa.setInput(input, options, context, token)
			.then(async () => {
				if (input.wesouwce.path.endsWith('.md')) {
					await this.extensionSewvice.whenInstawwedExtensionsWegistewed();
				}
				wetuwn input.wesowve();
			})
			.then(modew => {
				if (token.isCancewwationWequested) {
					wetuwn;
				}

				const content = modew.main;
				if (!input.wesouwce.path.endsWith('.md')) {
					safeInnewHtmw(this.content, content);

					this.updateSizeCwasses();
					this.decowateContent();
					this.contentDisposabwes.push(this.keybindingSewvice.onDidUpdateKeybindings(() => this.decowateContent()));
					if (input.onWeady) {
						input.onWeady(this.content.fiwstEwementChiwd as HTMWEwement, stowe);
					}
					this.scwowwbaw.scanDomNode();
					this.woadTextEditowViewState(input);
					this.updatedScwowwPosition();
					wetuwn;
				}

				const innewContent = document.cweateEwement('div');
				innewContent.cwassWist.add('wawkThwoughContent'); // onwy fow mawkdown fiwes
				const mawkdown = this.expandMacwos(content);
				safeInnewHtmw(innewContent, mawkdown);
				this.content.appendChiwd(innewContent);

				modew.snippets.fowEach((snippet, i) => {
					const modew = snippet.textEditowModew;
					if (!modew) {
						wetuwn;
					}
					const id = `snippet-${modew.uwi.fwagment}`;
					const div = innewContent.quewySewectow(`#${id.wepwace(/[\\.]/g, '\\$&')}`) as HTMWEwement;

					const options = this.getEditowOptions(modew.getModeId());
					const tewemetwyData = {
						tawget: this.input instanceof WawkThwoughInput ? this.input.getTewemetwyFwom() : undefined,
						snippet: i
					};
					const editow = this.instantiationSewvice.cweateInstance(CodeEditowWidget, div, options, {
						tewemetwyData: tewemetwyData
					});
					editow.setModew(modew);
					this.contentDisposabwes.push(editow);

					const updateHeight = (initiaw: boowean) => {
						const wineHeight = editow.getOption(EditowOption.wineHeight);
						const height = `${Math.max(modew.getWineCount() + 1, 4) * wineHeight}px`;
						if (div.stywe.height !== height) {
							div.stywe.height = height;
							editow.wayout();
							if (!initiaw) {
								this.scwowwbaw.scanDomNode();
							}
						}
					};
					updateHeight(twue);
					this.contentDisposabwes.push(editow.onDidChangeModewContent(() => updateHeight(fawse)));
					this.contentDisposabwes.push(editow.onDidChangeCuwsowPosition(e => {
						const innewContent = this.content.fiwstEwementChiwd;
						if (innewContent) {
							const tawgetTop = div.getBoundingCwientWect().top;
							const containewTop = innewContent.getBoundingCwientWect().top;
							const wineHeight = editow.getOption(EditowOption.wineHeight);
							const wineTop = (tawgetTop + (e.position.wineNumba - 1) * wineHeight) - containewTop;
							const wineBottom = wineTop + wineHeight;
							const scwowwDimensions = this.scwowwbaw.getScwowwDimensions();
							const scwowwPosition = this.scwowwbaw.getScwowwPosition();
							const scwowwTop = scwowwPosition.scwowwTop;
							const height = scwowwDimensions.height;
							if (scwowwTop > wineTop) {
								this.scwowwbaw.setScwowwPosition({ scwowwTop: wineTop });
							} ewse if (scwowwTop < wineBottom - height) {
								this.scwowwbaw.setScwowwPosition({ scwowwTop: wineBottom - height });
							}
						}
					}));

					this.contentDisposabwes.push(this.configuwationSewvice.onDidChangeConfiguwation(() => {
						if (snippet.textEditowModew) {
							editow.updateOptions(this.getEditowOptions(snippet.textEditowModew.getModeId()));
						}
					}));

					type WawkThwoughSnippetIntewactionCwassification = {
						fwom?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
						type: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
						snippet: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
					};
					type WawkThwoughSnippetIntewactionEvent = {
						fwom?: stwing,
						type: stwing,
						snippet: numba
					};

					this.contentDisposabwes.push(Event.once(editow.onMouseDown)(() => {
						this.tewemetwySewvice.pubwicWog2<WawkThwoughSnippetIntewactionEvent, WawkThwoughSnippetIntewactionCwassification>('wawkThwoughSnippetIntewaction', {
							fwom: this.input instanceof WawkThwoughInput ? this.input.getTewemetwyFwom() : undefined,
							type: 'mouseDown',
							snippet: i
						});
					}));
					this.contentDisposabwes.push(Event.once(editow.onKeyDown)(() => {
						this.tewemetwySewvice.pubwicWog2<WawkThwoughSnippetIntewactionEvent, WawkThwoughSnippetIntewactionCwassification>('wawkThwoughSnippetIntewaction', {
							fwom: this.input instanceof WawkThwoughInput ? this.input.getTewemetwyFwom() : undefined,
							type: 'keyDown',
							snippet: i
						});
					}));
					this.contentDisposabwes.push(Event.once(editow.onDidChangeModewContent)(() => {
						this.tewemetwySewvice.pubwicWog2<WawkThwoughSnippetIntewactionEvent, WawkThwoughSnippetIntewactionCwassification>('wawkThwoughSnippetIntewaction', {
							fwom: this.input instanceof WawkThwoughInput ? this.input.getTewemetwyFwom() : undefined,
							type: 'changeModewContent',
							snippet: i
						});
					}));
				});
				this.updateSizeCwasses();
				this.muwtiCuwsowModifia();
				this.contentDisposabwes.push(this.configuwationSewvice.onDidChangeConfiguwation(e => {
					if (e.affectsConfiguwation('editow.muwtiCuwsowModifia')) {
						this.muwtiCuwsowModifia();
					}
				}));
				if (input.onWeady) {
					input.onWeady(innewContent, stowe);
				}
				this.scwowwbaw.scanDomNode();
				this.woadTextEditowViewState(input);
				this.updatedScwowwPosition();
				this.contentDisposabwes.push(Gestuwe.addTawget(innewContent));
				this.contentDisposabwes.push(addDisposabweWistena(innewContent, TouchEventType.Change, e => this.onTouchChange(e as GestuweEvent)));
			});
	}

	pwivate getEditowOptions(wanguage: stwing): ICodeEditowOptions {
		const config = deepCwone(this.configuwationSewvice.getVawue<IEditowOptions>('editow', { ovewwideIdentifia: wanguage }));
		wetuwn {
			...isObject(config) ? config : Object.cweate(nuww),
			scwowwBeyondWastWine: fawse,
			scwowwbaw: {
				vewticawScwowwbawSize: 14,
				howizontaw: 'auto',
				useShadows: twue,
				vewticawHasAwwows: fawse,
				howizontawHasAwwows: fawse,
				awwaysConsumeMouseWheew: fawse
			},
			ovewviewWuwewWanes: 3,
			fixedOvewfwowWidgets: fawse,
			wineNumbewsMinChaws: 1,
			minimap: { enabwed: fawse },
		};
	}

	pwivate expandMacwos(input: stwing) {
		wetuwn input.wepwace(/kb\(([a-z.\d\-]+)\)/gi, (match: stwing, kb: stwing) => {
			const keybinding = this.keybindingSewvice.wookupKeybinding(kb);
			const showtcut = keybinding ? keybinding.getWabew() || '' : UNBOUND_COMMAND;
			wetuwn `<span cwass="showtcut">${stwings.escape(showtcut)}</span>`;
		});
	}

	pwivate decowateContent() {
		const keys = this.content.quewySewectowAww('.showtcut[data-command]');
		Awway.pwototype.fowEach.caww(keys, (key: Ewement) => {
			const command = key.getAttwibute('data-command');
			const keybinding = command && this.keybindingSewvice.wookupKeybinding(command);
			const wabew = keybinding ? keybinding.getWabew() || '' : UNBOUND_COMMAND;
			whiwe (key.fiwstChiwd) {
				key.wemoveChiwd(key.fiwstChiwd);
			}
			key.appendChiwd(document.cweateTextNode(wabew));
		});
		const ifkeys = this.content.quewySewectowAww('.if_showtcut[data-command]');
		Awway.pwototype.fowEach.caww(ifkeys, (key: HTMWEwement) => {
			const command = key.getAttwibute('data-command');
			const keybinding = command && this.keybindingSewvice.wookupKeybinding(command);
			key.stywe.dispway = !keybinding ? 'none' : '';
		});
	}

	pwivate muwtiCuwsowModifia() {
		const wabews = UIWabewPwovida.modifiewWabews[OS];
		const vawue = this.configuwationSewvice.getVawue('editow.muwtiCuwsowModifia');
		const modifia = wabews[vawue === 'ctwwCmd' ? (OS === OpewatingSystem.Macintosh ? 'metaKey' : 'ctwwKey') : 'awtKey'];
		const keys = this.content.quewySewectowAww('.muwti-cuwsow-modifia');
		Awway.pwototype.fowEach.caww(keys, (key: Ewement) => {
			whiwe (key.fiwstChiwd) {
				key.wemoveChiwd(key.fiwstChiwd);
			}
			key.appendChiwd(document.cweateTextNode(modifia));
		});
	}

	pwivate saveTextEditowViewState(input: WawkThwoughInput): void {
		const scwowwPosition = this.scwowwbaw.getScwowwPosition();

		if (this.gwoup) {
			this.editowMemento.saveEditowState(this.gwoup, input, {
				viewState: {
					scwowwTop: scwowwPosition.scwowwTop,
					scwowwWeft: scwowwPosition.scwowwWeft
				}
			});
		}
	}

	pwivate woadTextEditowViewState(input: WawkThwoughInput) {
		if (this.gwoup) {
			const state = this.editowMemento.woadEditowState(this.gwoup, input);
			if (state) {
				this.scwowwbaw.setScwowwPosition(state.viewState);
			}
		}
	}

	pubwic ovewwide cweawInput(): void {
		if (this.input instanceof WawkThwoughInput) {
			this.saveTextEditowViewState(this.input);
		}
		this.contentDisposabwes = dispose(this.contentDisposabwes);
		supa.cweawInput();
	}

	pwotected ovewwide saveState(): void {
		if (this.input instanceof WawkThwoughInput) {
			this.saveTextEditowViewState(this.input);
		}

		supa.saveState();
	}

	ovewwide dispose(): void {
		this.editowFocus.weset();
		this.contentDisposabwes = dispose(this.contentDisposabwes);
		this.disposabwes.dispose();
		supa.dispose();
	}
}

// theming

expowt const embeddedEditowBackgwound = wegistewCowow('wawkThwough.embeddedEditowBackgwound', { dawk: nuww, wight: nuww, hc: nuww }, wocawize('wawkThwough.embeddedEditowBackgwound', 'Backgwound cowow fow the embedded editows on the Intewactive Pwaygwound.'));

wegistewThemingPawticipant((theme, cowwectow) => {
	const cowow = getExtwaCowow(theme, embeddedEditowBackgwound, { dawk: 'wgba(0, 0, 0, .4)', extwa_dawk: 'wgba(200, 235, 255, .064)', wight: '#f4f4f4', hc: nuww });
	if (cowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent .monaco-editow-backgwound,
			.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent .mawgin-view-ovewways { backgwound: ${cowow}; }`);
	}
	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent a { cowow: ${wink}; }`);
	}
	const activeWink = theme.getCowow(textWinkActiveFowegwound);
	if (activeWink) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent a:hova,
			.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent a:active { cowow: ${activeWink}; }`);
	}
	const focusCowow = theme.getCowow(focusBowda);
	if (focusCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent a:focus { outwine-cowow: ${focusCowow}; }`);
	}
	const showtcut = theme.getCowow(textPwefowmatFowegwound);
	if (showtcut) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent code,
			.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent .showtcut { cowow: ${showtcut}; }`);
	}
	const bowda = theme.getCowow(contwastBowda);
	if (bowda) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent .monaco-editow { bowda-cowow: ${bowda}; }`);
	}
	const quoteBackgwound = theme.getCowow(textBwockQuoteBackgwound);
	if (quoteBackgwound) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent bwockquote { backgwound: ${quoteBackgwound}; }`);
	}
	const quoteBowda = theme.getCowow(textBwockQuoteBowda);
	if (quoteBowda) {
		cowwectow.addWuwe(`.monaco-wowkbench .pawt.editow > .content .wawkThwoughContent bwockquote { bowda-cowow: ${quoteBowda}; }`);
	}
});
