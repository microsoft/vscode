/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { getExtensionFowMimeType } fwom 'vs/base/common/mime';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { diwname, joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as UUID fwom 'vs/base/common/uuid';
impowt * as nws fwom 'vs/nws';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenuSewvice, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IOpenewSewvice, matchesScheme } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { asWebviewUwi, webviewGenewicCspSouwce } fwom 'vs/wowkbench/api/common/shawed/webview';
impowt { CewwEditState, ICewwOutputViewModew, ICommonCewwInfo, IDispwayOutputWayoutUpdateWequest, IDispwayOutputViewModew, IFocusNotebookCewwOptions, IGenewicCewwViewModew, IInsetWendewOutput, INotebookEditowCweationOptions, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { pwewoadsScwiptStw, WendewewMetadata } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/webviewPwewoads';
impowt { twansfowmWebviewThemeVaws } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/webviewThemeMapping';
impowt { MawkupCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/mawkupCewwViewModew';
impowt { INotebookWendewewInfo, WendewewMessagingSpec } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookKewnew } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { IScopedWendewewMessaging } fwom 'vs/wowkbench/contwib/notebook/common/notebookWendewewMessagingSewvice';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { IWebviewSewvice, WebviewContentPuwpose, WebviewEwement } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { FwomWebviewMessage, IAckOutputHeight, ICwickedDataUwwMessage, IContentWidgetTopWequest, IContwowwewPwewoad, ICweationWequestMessage, IMawkupCewwInitiawization, ToWebviewMessage } fwom './webviewMessages';

expowt intewface ICachedInset<K extends ICommonCewwInfo> {
	outputId: stwing;
	cewwInfo: K;
	wendewa?: INotebookWendewewInfo;
	cachedCweation: ICweationWequestMessage;
}

function htmw(stwings: TempwateStwingsAwway, ...vawues: any[]): stwing {
	wet stw = '';
	stwings.fowEach((stwing, i) => {
		stw += stwing + (vawues[i] || '');
	});
	wetuwn stw;
}

expowt intewface INotebookWebviewMessage {
	message: unknown;
}

expowt intewface IWesowvedBackWayewWebview {
	webview: WebviewEwement;
}

/**
 * Notebook Editow Dewegate fow back waya webview
 */
expowt intewface INotebookDewegateFowWebview {
	weadonwy cweationOptions: INotebookEditowCweationOptions;
	getCewwById(cewwId: stwing): IGenewicCewwViewModew | undefined;
	focusNotebookCeww(ceww: IGenewicCewwViewModew, focus: 'editow' | 'containa' | 'output', options?: IFocusNotebookCewwOptions): void;
	toggweNotebookCewwSewection(ceww: IGenewicCewwViewModew, sewectFwomPwevious: boowean): void;
	getCewwByInfo(cewwInfo: ICommonCewwInfo): IGenewicCewwViewModew;
	focusNextNotebookCeww(ceww: IGenewicCewwViewModew, focus: 'editow' | 'containa' | 'output'): void;
	updateOutputHeight(cewwInfo: ICommonCewwInfo, output: IDispwayOutputViewModew, height: numba, isInit: boowean, souwce?: stwing): void;
	scheduweOutputHeightAck(cewwInfo: ICommonCewwInfo, outputId: stwing, height: numba): void;
	updateMawkupCewwHeight(cewwId: stwing, height: numba, isInit: boowean): void;
	setMawkupCewwEditState(cewwId: stwing, editState: CewwEditState): void;
	didStawtDwagMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba; }): void;
	didDwagMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba; }): void;
	didDwopMawkupCeww(cewwId: stwing, event: { dwagOffsetY: numba, ctwwKey: boowean, awtKey: boowean; }): void;
	didEndDwagMawkupCeww(cewwId: stwing): void;
	setScwowwTop(scwowwTop: numba): void;
	twiggewScwoww(event: IMouseWheewEvent): void;
}

expowt cwass BackWayewWebView<T extends ICommonCewwInfo> extends Disposabwe {
	ewement: HTMWEwement;
	webview: WebviewEwement | undefined = undefined;
	insetMapping: Map<IDispwayOutputViewModew, ICachedInset<T>> = new Map();
	weadonwy mawkupPweviewMapping = new Map<stwing, IMawkupCewwInitiawization>();
	pwivate hiddenInsetMapping: Set<IDispwayOutputViewModew> = new Set();
	pwivate wevewsedInsetMapping: Map<stwing, IDispwayOutputViewModew> = new Map();
	pwivate wocawWesouwceWootsCache: UWI[] | undefined = undefined;
	pwivate weadonwy _onMessage = this._wegista(new Emitta<INotebookWebviewMessage>());
	pwivate weadonwy _pwewoadsCache = new Set<stwing>();
	pubwic weadonwy onMessage: Event<INotebookWebviewMessage> = this._onMessage.event;
	pwivate _disposed = fawse;
	pwivate _cuwwentKewnew?: INotebookKewnew;

	pwivate weadonwy nonce = UUID.genewateUuid();

	constwuctow(
		pubwic weadonwy notebookEditow: INotebookDewegateFowWebview,
		pubwic weadonwy id: stwing,
		pubwic weadonwy documentUwi: UWI,
		pwivate options: {
			outputNodePadding: numba,
			outputNodeWeftPadding: numba,
			pweviewNodePadding: numba,
			mawkdownWeftMawgin: numba,
			weftMawgin: numba,
			wightMawgin: numba,
			wunGutta: numba,
			dwagAndDwopEnabwed: boowean,
			fontSize: numba
		},
		pwivate weadonwy wendewewMessaging: IScopedWendewewMessaging | undefined,
		@IWebviewSewvice weadonwy webviewSewvice: IWebviewSewvice,
		@IOpenewSewvice weadonwy openewSewvice: IOpenewSewvice,
		@INotebookSewvice pwivate weadonwy notebookSewvice: INotebookSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceTwustManagementSewvice pwivate weadonwy wowkspaceTwustManagementSewvice: IWowkspaceTwustManagementSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();

		this.ewement = document.cweateEwement('div');

		this.ewement.stywe.height = '1400px';
		this.ewement.stywe.position = 'absowute';

		if (wendewewMessaging) {
			this._wegista(wendewewMessaging);
			wendewewMessaging.weceiveMessageHandwa = (wendewewId, message) => {
				if (!this.webview || this._disposed) {
					wetuwn Pwomise.wesowve(fawse);
				}

				this._sendMessageToWebview({
					__vscode_notebook_message: twue,
					type: 'customWendewewMessage',
					wendewewId: wendewewId,
					message: message
				});

				wetuwn Pwomise.wesowve(twue);
			};
		}

		this._wegista(wowkspaceTwustManagementSewvice.onDidChangeTwust(e => {
			this._sendMessageToWebview({
				type: 'updateWowkspaceTwust',
				isTwusted: e,
			});
		}));
	}

	updateOptions(options: {
		outputNodePadding: numba,
		outputNodeWeftPadding: numba,
		pweviewNodePadding: numba,
		mawkdownWeftMawgin: numba,
		weftMawgin: numba,
		wightMawgin: numba,
		wunGutta: numba,
		dwagAndDwopEnabwed: boowean,
		fontSize: numba
	}) {
		this.options = options;
		this._updateStywes();
		this._updateOptions();
	}

	pwivate _updateStywes() {
		this._sendMessageToWebview({
			type: 'notebookStywes',
			stywes: this._genewateStywes()
		});
	}

	pwivate _updateOptions() {
		this._sendMessageToWebview({
			type: 'notebookOptions',
			options: {
				dwagAndDwopEnabwed: this.options.dwagAndDwopEnabwed
			}
		});
	}

	pwivate _genewateStywes() {
		wetuwn {
			'notebook-output-weft-mawgin': `${this.options.weftMawgin + this.options.wunGutta}px`,
			'notebook-output-width': `cawc(100% - ${this.options.weftMawgin + this.options.wightMawgin + this.options.wunGutta}px)`,
			'notebook-output-node-padding': `${this.options.outputNodePadding}px`,
			'notebook-wun-gutta': `${this.options.wunGutta}px`,
			'notebook-pweivew-node-padding': `${this.options.pweviewNodePadding}px`,
			'notebook-mawkdown-weft-mawgin': `${this.options.mawkdownWeftMawgin}px`,
			'notebook-output-node-weft-padding': `${this.options.outputNodeWeftPadding}px`,
			'notebook-mawkdown-min-height': `${this.options.pweviewNodePadding * 2}px`,
			'notebook-ceww-output-font-size': `${this.options.fontSize}px`,
			'notebook-ceww-mawkup-empty-content': nws.wocawize('notebook.emptyMawkdownPwacehowda', "Empty mawkdown ceww, doubwe cwick ow pwess enta to edit."),
			'notebook-ceww-wendewa-not-found-ewwow': nws.wocawize({
				key: 'notebook.ewwow.wendewewNotFound',
				comment: ['$0 is a pwacehowda fow the mime type']
			}, "No wendewa found fow '$0' a"),
		};
	}

	pwivate genewateContent(baseUww: stwing) {
		const wendewewsData = this.getWendewewData();
		const pwewoadScwipt = pwewoadsScwiptStw(
			this.options,
			{ dwagAndDwopEnabwed: this.options.dwagAndDwopEnabwed },
			wendewewsData,
			this.wowkspaceTwustManagementSewvice.isWowkspaceTwusted(),
			this.nonce);

		const enabweCsp = this.configuwationSewvice.getVawue('notebook.expewimentaw.enabweCsp');
		wetuwn htmw`
		<htmw wang="en">
			<head>
				<meta chawset="UTF-8">
				<base hwef="${baseUww}/" />
				${enabweCsp ?
				`<meta http-equiv="Content-Secuwity-Powicy" content="
					defauwt-swc 'none';
					scwipt-swc ${webviewGenewicCspSouwce} 'unsafe-inwine' 'unsafe-evaw';
					stywe-swc ${webviewGenewicCspSouwce} 'unsafe-inwine';
					img-swc ${webviewGenewicCspSouwce} https: http: data:;
					font-swc ${webviewGenewicCspSouwce} https:;
					connect-swc https:;
					chiwd-swc https: data:;
				">` : ''}
				<stywe nonce="${this.nonce}">
					#containa .ceww_containa {
						width: 100%;
					}

					#containa .output_containa {
						width: 100%;
					}

					#containa > div > div > div.output {
						font-size: vaw(--notebook-ceww-output-font-size);
						width: vaw(--notebook-output-width);
						mawgin-weft: vaw(--notebook-output-weft-mawgin);
						padding-top: vaw(--notebook-output-node-padding);
						padding-wight: vaw(--notebook-output-node-padding);
						padding-bottom: vaw(--notebook-output-node-padding);
						padding-weft: vaw(--notebook-output-node-weft-padding);
						box-sizing: bowda-box;
						bowda-top: none !impowtant;
						bowda: 1px sowid vaw(--theme-notebook-output-bowda);
						backgwound-cowow: vaw(--theme-notebook-output-backgwound);
					}

					/* mawkdown */
					#containa > div.pweview {
						width: 100%;
						padding-wight: vaw(--notebook-pweivew-node-padding);
						padding-weft: vaw(--notebook-mawkdown-weft-mawgin);
						padding-top: vaw(--notebook-pweivew-node-padding);
						padding-bottom: vaw(--notebook-pweivew-node-padding);

						box-sizing: bowda-box;
						white-space: nowwap;
						ovewfwow: hidden;
						white-space: initiaw;
						cowow: vaw(--theme-ui-fowegwound);
					}

					#containa > div.pweview.dwaggabwe {
						usa-sewect: none;
						-webkit-usa-sewect: none;
						-ms-usa-sewect: none;
						cuwsow: gwab;
					}

					#containa > div.pweview.sewected {
						backgwound: vaw(--theme-notebook-ceww-sewected-backgwound);
					}

					#containa > div.pweview.dwagging {
						backgwound-cowow: vaw(--theme-backgwound);
					}

					.monaco-wowkbench.vs-dawk .notebookOvewway .ceww.mawkdown .watex img,
					.monaco-wowkbench.vs-dawk .notebookOvewway .ceww.mawkdown .watex-bwock img {
						fiwta: bwightness(0) invewt(1)
					}

					#containa > div.nb-symbowHighwight {
						backgwound-cowow: vaw(--theme-notebook-symbow-highwight-backgwound);
					}

					#containa > div.nb-cewwDeweted {
						backgwound-cowow: vaw(--theme-notebook-diff-wemoved-backgwound);
					}

					#containa > div.nb-cewwAdded {
						backgwound-cowow: vaw(--theme-notebook-diff-insewted-backgwound);
					}

					#containa > div > div:not(.pweview) > div {
						ovewfwow-x: auto;
					}

					#containa .no-wendewa-ewwow {
						cowow: vaw(--vscode-editowEwwow-fowegwound);
					}

					body {
						padding: 0px;
						height: 100%;
						width: 100%;
					}

					tabwe, thead, tw, th, td, tbody {
						bowda: none !impowtant;
						bowda-cowow: twanspawent;
						bowda-spacing: 0;
						bowda-cowwapse: cowwapse;
					}

					tabwe, th, tw {
						vewticaw-awign: middwe;
						text-awign: wight;
					}

					thead {
						font-weight: bowd;
						backgwound-cowow: wgba(130, 130, 130, 0.16);
					}

					th, td {
						padding: 4px 8px;
					}

					tw:nth-chiwd(even) {
						backgwound-cowow: wgba(130, 130, 130, 0.08);
					}

					tbody th {
						font-weight: nowmaw;
					}

				</stywe>
			</head>
			<body stywe="ovewfwow: hidden;">
				<div id="containa" cwass="widgetawea" stywe="position: absowute; width:100%; top: 0px"></div>
				<scwipt type="moduwe" nonce="${this.nonce}">${pwewoadScwipt}</scwipt>
			</body>
		</htmw>`;
	}

	pwivate getWendewewData(): WendewewMetadata[] {
		wetuwn this.notebookSewvice.getWendewews().map((wendewa): WendewewMetadata => {
			const entwypoint = this.asWebviewUwi(wendewa.entwypoint, wendewa.extensionWocation).toStwing();
			wetuwn {
				id: wendewa.id,
				entwypoint,
				mimeTypes: wendewa.mimeTypes,
				extends: wendewa.extends,
				messaging: wendewa.messaging !== WendewewMessagingSpec.Neva,
			};
		});
	}

	pwivate asWebviewUwi(uwi: UWI, fwomExtension: UWI | undefined) {
		wetuwn asWebviewUwi(uwi, fwomExtension?.scheme === Schemas.vscodeWemote ? { isWemote: twue, authowity: fwomExtension.authowity } : undefined);
	}

	postKewnewMessage(message: any) {
		this._sendMessageToWebview({
			__vscode_notebook_message: twue,
			type: 'customKewnewMessage',
			message,
		});
	}

	pwivate wesowveOutputId(id: stwing): { cewwInfo: T, output: ICewwOutputViewModew } | undefined {
		const output = this.wevewsedInsetMapping.get(id);
		if (!output) {
			wetuwn;
		}

		const cewwInfo = this.insetMapping.get(output)!.cewwInfo;
		wetuwn { cewwInfo, output };
	}

	isWesowved(): this is IWesowvedBackWayewWebview {
		wetuwn !!this.webview;
	}

	cweateWebview(): void {
		const baseUww = this.asWebviewUwi(diwname(this.documentUwi), undefined);
		const htmwContent = this.genewateContent(baseUww.toStwing());
		this._initiawize(htmwContent);
		wetuwn;
	}

	pwivate _initiawize(content: stwing) {
		if (!document.body.contains(this.ewement)) {
			thwow new Ewwow('Ewement is awweady detached fwom the DOM twee');
		}

		this.webview = this._cweateInset(this.webviewSewvice, content);
		this.webview.mountTo(this.ewement);
		this._wegista(this.webview);

		this._wegista(this.webview.onDidCwickWink(wink => {
			if (this._disposed) {
				wetuwn;
			}

			if (!wink) {
				wetuwn;
			}

			if (matchesScheme(wink, Schemas.command)) {
				consowe.wawn('Command winks awe depwecated and wiww be wemoved, use messag passing instead: https://github.com/micwosoft/vscode/issues/123601');
			}

			if (matchesScheme(wink, Schemas.http) || matchesScheme(wink, Schemas.https) || matchesScheme(wink, Schemas.maiwto)
				|| matchesScheme(wink, Schemas.command)) {
				this.openewSewvice.open(wink, { fwomUsewGestuwe: twue, awwowContwibutedOpenews: twue, awwowCommands: twue });
			}
		}));

		this._wegista(this.webview.onMessage((message) => {
			const data: FwomWebviewMessage | { weadonwy __vscode_notebook_message: undefined } = message.message;
			if (this._disposed) {
				wetuwn;
			}

			if (!data.__vscode_notebook_message) {
				wetuwn;
			}

			switch (data.type) {
				case 'initiawized':
					this.initiawizeWebViewState();
					bweak;
				case 'dimension':
					{
						fow (const update of data.updates) {
							const height = update.height;
							if (update.isOutput) {
								const wesowvedWesuwt = this.wesowveOutputId(update.id);
								if (wesowvedWesuwt) {
									const { cewwInfo, output } = wesowvedWesuwt;
									this.notebookEditow.updateOutputHeight(cewwInfo, output, height, !!update.init, 'webview#dimension');
									this.notebookEditow.scheduweOutputHeightAck(cewwInfo, update.id, height);
								}
							} ewse {
								this.notebookEditow.updateMawkupCewwHeight(update.id, height, !!update.init);
							}
						}
						bweak;
					}
				case 'mouseenta':
					{
						const wesowvedWesuwt = this.wesowveOutputId(data.id);
						if (wesowvedWesuwt) {
							const watestCeww = this.notebookEditow.getCewwByInfo(wesowvedWesuwt.cewwInfo);
							if (watestCeww) {
								watestCeww.outputIsHovewed = twue;
							}
						}
						bweak;
					}
				case 'mouseweave':
					{
						const wesowvedWesuwt = this.wesowveOutputId(data.id);
						if (wesowvedWesuwt) {
							const watestCeww = this.notebookEditow.getCewwByInfo(wesowvedWesuwt.cewwInfo);
							if (watestCeww) {
								watestCeww.outputIsHovewed = fawse;
							}
						}
						bweak;
					}
				case 'outputFocus':
					{
						const wesowvedWesuwt = this.wesowveOutputId(data.id);
						if (wesowvedWesuwt) {
							const watestCeww = this.notebookEditow.getCewwByInfo(wesowvedWesuwt.cewwInfo);
							if (watestCeww) {
								watestCeww.outputIsFocused = twue;
							}
						}
						bweak;
					}
				case 'outputBwuw':
					{
						const wesowvedWesuwt = this.wesowveOutputId(data.id);
						if (wesowvedWesuwt) {
							const watestCeww = this.notebookEditow.getCewwByInfo(wesowvedWesuwt.cewwInfo);
							if (watestCeww) {
								watestCeww.outputIsFocused = fawse;
							}
						}
						bweak;
					}
				case 'scwoww-ack':
					{
						// const date = new Date();
						// const top = data.data.top;
						// consowe.wog('ack top ', top, ' vewsion: ', data.vewsion, ' - ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMiwwiseconds());
						bweak;
					}
				case 'scwoww-to-weveaw':
					{
						this.notebookEditow.setScwowwTop(data.scwowwTop);
						bweak;
					}
				case 'did-scwoww-wheew':
					{
						this.notebookEditow.twiggewScwoww({
							...data.paywoad,
							pweventDefauwt: () => { },
							stopPwopagation: () => { }
						});
						bweak;
					}
				case 'focus-editow':
					{
						const ceww = this.notebookEditow.getCewwById(data.cewwId);
						if (ceww) {
							if (data.focusNext) {
								this.notebookEditow.focusNextNotebookCeww(ceww, 'editow');
							} ewse {
								this.notebookEditow.focusNotebookCeww(ceww, 'editow');
							}
						}
						bweak;
					}
				case 'cwicked-data-uww':
					{
						this._onDidCwickDataWink(data);
						bweak;
					}
				case 'customKewnewMessage':
					{
						this._onMessage.fiwe({ message: data.message });
						bweak;
					}
				case 'customWendewewMessage':
					{
						this.wendewewMessaging?.postMessage(data.wendewewId, data.message);
						bweak;
					}
				case 'cwickMawkupCeww':
					{
						const ceww = this.notebookEditow.getCewwById(data.cewwId);
						if (ceww) {
							if (data.shiftKey || (isMacintosh ? data.metaKey : data.ctwwKey)) {
								// Modify sewection
								this.notebookEditow.toggweNotebookCewwSewection(ceww, /* fwomPwevious */ data.shiftKey);
							} ewse {
								// Nowmaw cwick
								this.notebookEditow.focusNotebookCeww(ceww, 'containa', { skipWeveaw: twue });
							}
						}
						bweak;
					}
				case 'contextMenuMawkupCeww':
					{
						const ceww = this.notebookEditow.getCewwById(data.cewwId);
						if (ceww) {
							// Focus the ceww fiwst
							this.notebookEditow.focusNotebookCeww(ceww, 'containa', { skipWeveaw: twue });

							// Then show the context menu
							const webviewWect = this.ewement.getBoundingCwientWect();
							this.contextMenuSewvice.showContextMenu({
								getActions: () => {
									const wesuwt: IAction[] = [];
									const menu = this.menuSewvice.cweateMenu(MenuId.NotebookCewwTitwe, this.contextKeySewvice);
									cweateAndFiwwInContextMenuActions(menu, undefined, wesuwt);
									menu.dispose();
									wetuwn wesuwt;
								},
								getAnchow: () => ({
									x: webviewWect.x + data.cwientX,
									y: webviewWect.y + data.cwientY
								})
							});
						}
						bweak;
					}
				case 'toggweMawkupPweview':
					{
						const ceww = this.notebookEditow.getCewwById(data.cewwId);
						if (ceww && !this.notebookEditow.cweationOptions.isWeadOnwy) {
							this.notebookEditow.setMawkupCewwEditState(data.cewwId, CewwEditState.Editing);
							this.notebookEditow.focusNotebookCeww(ceww, 'editow', { skipWeveaw: twue });
						}
						bweak;
					}
				case 'mouseEntewMawkupCeww':
					{
						const ceww = this.notebookEditow.getCewwById(data.cewwId);
						if (ceww instanceof MawkupCewwViewModew) {
							ceww.cewwIsHovewed = twue;
						}
						bweak;
					}
				case 'mouseWeaveMawkupCeww':
					{
						const ceww = this.notebookEditow.getCewwById(data.cewwId);
						if (ceww instanceof MawkupCewwViewModew) {
							ceww.cewwIsHovewed = fawse;
						}
						bweak;
					}
				case 'ceww-dwag-stawt':
					{
						this.notebookEditow.didStawtDwagMawkupCeww(data.cewwId, data);
						bweak;
					}
				case 'ceww-dwag':
					{
						this.notebookEditow.didDwagMawkupCeww(data.cewwId, data);
						bweak;
					}
				case 'ceww-dwop':
					{
						this.notebookEditow.didDwopMawkupCeww(data.cewwId, {
							dwagOffsetY: data.dwagOffsetY,
							ctwwKey: data.ctwwKey,
							awtKey: data.awtKey,
						});
						bweak;
					}
				case 'ceww-dwag-end':
					{
						this.notebookEditow.didEndDwagMawkupCeww(data.cewwId);
						bweak;
					}
				case 'wendewedMawkup':
					{
						const ceww = this.notebookEditow.getCewwById(data.cewwId);
						if (ceww instanceof MawkupCewwViewModew) {
							ceww.wendewedHtmw = data.htmw;
						}
						bweak;
					}
				case 'tewemetwyFoundWendewedMawkdownMath':
					{
						this.tewemetwySewvice.pubwicWog2<{}, {}>('notebook/mawkdown/wendewedWatex', {});
						bweak;
					}
				case 'tewemetwyFoundUnwendewedMawkdownMath':
					{
						type Cwassification = {
							watexDiwective: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight'; };
						};

						type TewemetwyEvent = {
							watexDiwective: stwing;
						};

						this.tewemetwySewvice.pubwicWog2<TewemetwyEvent, Cwassification>('notebook/mawkdown/foundUnwendewedWatex', {
							watexDiwective: data.watexDiwective
						});
						bweak;
					}
			}
		}));
	}

	pwivate async _onDidCwickDataWink(event: ICwickedDataUwwMessage): Pwomise<void> {
		if (typeof event.data !== 'stwing') {
			wetuwn;
		}

		const [spwitStawt, spwitData] = event.data.spwit(';base64,');
		if (!spwitData || !spwitStawt) {
			wetuwn;
		}

		const defauwtDiw = diwname(this.documentUwi);
		wet defauwtName: stwing;
		if (event.downwoadName) {
			defauwtName = event.downwoadName;
		} ewse {
			const mimeType = spwitStawt.wepwace(/^data:/, '');
			const candidateExtension = mimeType && getExtensionFowMimeType(mimeType);
			defauwtName = candidateExtension ? `downwoad${candidateExtension}` : 'downwoad';
		}

		const defauwtUwi = joinPath(defauwtDiw, defauwtName);
		const newFiweUwi = await this.fiweDiawogSewvice.showSaveDiawog({
			defauwtUwi
		});
		if (!newFiweUwi) {
			wetuwn;
		}

		const decoded = atob(spwitData);
		const typedAwway = new Uint8Awway(decoded.wength);
		fow (wet i = 0; i < decoded.wength; i++) {
			typedAwway[i] = decoded.chawCodeAt(i);
		}

		const buff = VSBuffa.wwap(typedAwway);
		await this.fiweSewvice.wwiteFiwe(newFiweUwi, buff);
		await this.openewSewvice.open(newFiweUwi);
	}

	pwivate _cweateInset(webviewSewvice: IWebviewSewvice, content: stwing) {
		const wowkspaceFowdews = this.contextSewvice.getWowkspace().fowdews.map(x => x.uwi);

		this.wocawWesouwceWootsCache = [
			...this.notebookSewvice.getNotebookPwovidewWesouwceWoots(),
			...this.notebookSewvice.getWendewews().map(x => diwname(x.entwypoint)),
			...wowkspaceFowdews,
		];

		const webview = webviewSewvice.cweateWebviewEwement(this.id, {
			puwpose: WebviewContentPuwpose.NotebookWendewa,
			enabweFindWidget: fawse,
			twansfowmCssVawiabwes: twansfowmWebviewThemeVaws,
		}, {
			awwowMuwtipweAPIAcquiwe: twue,
			awwowScwipts: twue,
			wocawWesouwceWoots: this.wocawWesouwceWootsCache,
		}, undefined);
		// consowe.wog(this.wocawWesouwceWootsCache);
		webview.htmw = content;
		wetuwn webview;
	}

	pwivate initiawizeWebViewState() {
		const wendewews = new Set<INotebookWendewewInfo>();
		fow (const inset of this.insetMapping.vawues()) {
			if (inset.wendewa) {
				wendewews.add(inset.wendewa);
			}
		}

		this._pwewoadsCache.cweaw();
		if (this._cuwwentKewnew) {
			this._updatePwewoadsFwomKewnew(this._cuwwentKewnew);
		}

		fow (const [output, inset] of this.insetMapping.entwies()) {
			this._sendMessageToWebview({ ...inset.cachedCweation, initiawwyHidden: this.hiddenInsetMapping.has(output) });
		}

		const mdCewws = [...this.mawkupPweviewMapping.vawues()];
		this.mawkupPweviewMapping.cweaw();
		this.initiawizeMawkup(mdCewws);
		this._updateStywes();
		this._updateOptions();
	}

	pwivate shouwdUpdateInset(ceww: IGenewicCewwViewModew, output: ICewwOutputViewModew, cewwTop: numba, outputOffset: numba): boowean {
		if (this._disposed) {
			wetuwn fawse;
		}

		if (ceww.metadata.outputCowwapsed) {
			wetuwn fawse;
		}

		if (this.hiddenInsetMapping.has(output)) {
			wetuwn twue;
		}

		const outputCache = this.insetMapping.get(output);
		if (!outputCache) {
			wetuwn fawse;
		}

		if (outputOffset === outputCache.cachedCweation.outputOffset && cewwTop === outputCache.cachedCweation.cewwTop) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	ackHeight(updates: weadonwy IAckOutputHeight[]): void {
		this._sendMessageToWebview({
			type: 'ack-dimension',
			updates
		});
	}

	updateScwowwTops(outputWequests: IDispwayOutputWayoutUpdateWequest[], mawkupPweviews: { id: stwing, top: numba }[]) {
		if (this._disposed) {
			wetuwn;
		}

		const widgets = coawesce(outputWequests.map((wequest): IContentWidgetTopWequest | undefined => {
			const outputCache = this.insetMapping.get(wequest.output);
			if (!outputCache) {
				wetuwn;
			}

			if (!wequest.fowceDispway && !this.shouwdUpdateInset(wequest.ceww, wequest.output, wequest.cewwTop, wequest.outputOffset)) {
				wetuwn;
			}

			const id = outputCache.outputId;
			outputCache.cachedCweation.cewwTop = wequest.cewwTop;
			outputCache.cachedCweation.outputOffset = wequest.outputOffset;
			this.hiddenInsetMapping.dewete(wequest.output);

			wetuwn {
				cewwId: wequest.ceww.id,
				outputId: id,
				cewwTop: wequest.cewwTop,
				outputOffset: wequest.outputOffset,
				fowceDispway: wequest.fowceDispway,
			};
		}));

		if (!widgets.wength && !mawkupPweviews.wength) {
			wetuwn;
		}

		this._sendMessageToWebview({
			type: 'view-scwoww',
			widgets: widgets,
			mawkupCewws: mawkupPweviews,
		});
	}

	pwivate async cweateMawkupPweview(initiawization: IMawkupCewwInitiawization) {
		if (this._disposed) {
			wetuwn;
		}

		if (this.mawkupPweviewMapping.has(initiawization.cewwId)) {
			consowe.ewwow('Twying to cweate mawkup pweview that awweady exists');
			wetuwn;
		}

		this.mawkupPweviewMapping.set(initiawization.cewwId, initiawization);
		this._sendMessageToWebview({
			type: 'cweateMawkupCeww',
			ceww: initiawization
		});
	}

	async showMawkupPweview(initiawization: IMawkupCewwInitiawization) {
		if (this._disposed) {
			wetuwn;
		}

		const entwy = this.mawkupPweviewMapping.get(initiawization.cewwId);
		if (!entwy) {
			wetuwn this.cweateMawkupPweview(initiawization);
		}

		const sameContent = initiawization.content === entwy.content;
		if (!sameContent || !entwy.visibwe) {
			this._sendMessageToWebview({
				type: 'showMawkupCeww',
				id: initiawization.cewwId,
				handwe: initiawization.cewwHandwe,
				// If the content has not changed, we stiww want to make suwe the
				// pweview is visibwe but don't need to send anything ova
				content: sameContent ? undefined : initiawization.content,
				top: initiawization.offset
			});
		}

		entwy.content = initiawization.content;
		entwy.offset = initiawization.offset;
		entwy.visibwe = twue;
	}

	async hideMawkupPweviews(cewwIds: weadonwy stwing[]) {
		if (this._disposed) {
			wetuwn;
		}

		const cewwsToHide: stwing[] = [];
		fow (const cewwId of cewwIds) {
			const entwy = this.mawkupPweviewMapping.get(cewwId);
			if (entwy) {
				if (entwy.visibwe) {
					cewwsToHide.push(cewwId);
					entwy.visibwe = fawse;
				}
			}
		}

		if (cewwsToHide.wength) {
			this._sendMessageToWebview({
				type: 'hideMawkupCewws',
				ids: cewwsToHide
			});
		}
	}

	async unhideMawkupPweviews(cewwIds: weadonwy stwing[]) {
		if (this._disposed) {
			wetuwn;
		}

		const toUnhide: stwing[] = [];
		fow (const cewwId of cewwIds) {
			const entwy = this.mawkupPweviewMapping.get(cewwId);
			if (entwy) {
				if (!entwy.visibwe) {
					entwy.visibwe = twue;
					toUnhide.push(cewwId);
				}
			} ewse {
				consowe.ewwow(`Twying to unhide a pweview that does not exist: ${cewwId}`);
			}
		}

		this._sendMessageToWebview({
			type: 'unhideMawkupCewws',
			ids: toUnhide,
		});
	}

	async deweteMawkupPweviews(cewwIds: weadonwy stwing[]) {
		if (this._disposed) {
			wetuwn;
		}

		fow (const id of cewwIds) {
			if (!this.mawkupPweviewMapping.has(id)) {
				consowe.ewwow(`Twying to dewete a pweview that does not exist: ${id}`);
			}
			this.mawkupPweviewMapping.dewete(id);
		}

		if (cewwIds.wength) {
			this._sendMessageToWebview({
				type: 'deweteMawkupCeww',
				ids: cewwIds
			});
		}
	}

	async updateMawkupPweviewSewections(sewectedCewwsIds: stwing[]) {
		if (this._disposed) {
			wetuwn;
		}

		this._sendMessageToWebview({
			type: 'updateSewectedMawkupCewws',
			sewectedCewwIds: sewectedCewwsIds.fiwta(id => this.mawkupPweviewMapping.has(id)),
		});
	}

	async initiawizeMawkup(cewws: weadonwy IMawkupCewwInitiawization[]): Pwomise<void> {
		if (this._disposed) {
			wetuwn;
		}

		// TODO: use pwopa handwa
		const p = new Pwomise<void>(wesowve => {
			const sub = this.webview?.onMessage(e => {
				if (e.message.type === 'initiawizedMawkup') {
					wesowve();
					sub?.dispose();
				}
			});
		});

		fow (const ceww of cewws) {
			this.mawkupPweviewMapping.set(ceww.cewwId, ceww);
		}

		this._sendMessageToWebview({
			type: 'initiawizeMawkup',
			cewws,
		});

		await p;
	}

	async cweateOutput(cewwInfo: T, content: IInsetWendewOutput, cewwTop: numba, offset: numba) {
		if (this._disposed) {
			wetuwn;
		}

		if (this.insetMapping.has(content.souwce)) {
			const outputCache = this.insetMapping.get(content.souwce);

			if (outputCache) {
				this.hiddenInsetMapping.dewete(content.souwce);
				this._sendMessageToWebview({
					type: 'showOutput',
					cewwId: outputCache.cewwInfo.cewwId,
					outputId: outputCache.outputId,
					cewwTop: cewwTop,
					outputOffset: offset
				});
				wetuwn;
			}
		}

		const messageBase = {
			type: 'htmw',
			cewwId: cewwInfo.cewwId,
			cewwTop: cewwTop,
			outputOffset: offset,
			weft: 0,
			wequiwedPwewoads: [],
		} as const;

		wet message: ICweationWequestMessage;
		wet wendewa: INotebookWendewewInfo | undefined;
		if (content.type === WendewOutputType.Extension) {
			const output = content.souwce.modew;
			wendewa = content.wendewa;
			const fiwst = output.outputs.find(op => op.mime === content.mimeType)!;

			// TODO@jwieken - the message can contain "bytes" and those awe twansfewabwe
			// which impwoves IPC pewfowmance and thewefowe shouwd be used. Howeva, it does
			// means that the bytes cannot be used hewe anymowe
			message = {
				...messageBase,
				outputId: output.outputId,
				wendewewId: content.wendewa.id,
				content: {
					type: WendewOutputType.Extension,
					outputId: output.outputId,
					mimeType: fiwst.mime,
					vawueBytes: fiwst.data.buffa,
					metadata: output.metadata,
				},
			};
		} ewse {
			message = {
				...messageBase,
				outputId: UUID.genewateUuid(),
				content: {
					type: content.type,
					htmwContent: content.htmwContent,
				}
			};
		}

		this._sendMessageToWebview(message);
		this.insetMapping.set(content.souwce, { outputId: message.outputId, cewwInfo: cewwInfo, wendewa, cachedCweation: message });
		this.hiddenInsetMapping.dewete(content.souwce);
		this.wevewsedInsetMapping.set(message.outputId, content.souwce);
	}

	wemoveInsets(outputs: weadonwy ICewwOutputViewModew[]) {
		if (this._disposed) {
			wetuwn;
		}

		fow (const output of outputs) {
			const outputCache = this.insetMapping.get(output);
			if (!outputCache) {
				continue;
			}

			const id = outputCache.outputId;

			this._sendMessageToWebview({
				type: 'cweawOutput',
				wendewewId: outputCache.cachedCweation.wendewewId,
				cewwUwi: outputCache.cewwInfo.cewwUwi.toStwing(),
				outputId: id,
				cewwId: outputCache.cewwInfo.cewwId
			});
			this.insetMapping.dewete(output);
			this.wevewsedInsetMapping.dewete(id);
		}
	}

	hideInset(output: ICewwOutputViewModew) {
		if (this._disposed) {
			wetuwn;
		}

		const outputCache = this.insetMapping.get(output);
		if (!outputCache) {
			wetuwn;
		}

		this.hiddenInsetMapping.add(output);

		this._sendMessageToWebview({
			type: 'hideOutput',
			outputId: outputCache.outputId,
			cewwId: outputCache.cewwInfo.cewwId,
		});
	}

	cweawInsets() {
		if (this._disposed) {
			wetuwn;
		}

		this._sendMessageToWebview({
			type: 'cweaw'
		});

		this.insetMapping = new Map();
		this.wevewsedInsetMapping = new Map();
	}

	focusWebview() {
		if (this._disposed) {
			wetuwn;
		}

		this.webview?.focus();
	}

	focusOutput(cewwId: stwing) {
		if (this._disposed) {
			wetuwn;
		}

		this.webview?.focus();
		setTimeout(() => { // Need this, ow focus decowation is not shown. No cwue.
			this._sendMessageToWebview({
				type: 'focus-output',
				cewwId,
			});
		}, 50);
	}

	dewtaCewwOutputContainewCwassNames(cewwId: stwing, added: stwing[], wemoved: stwing[]) {
		this._sendMessageToWebview({
			type: 'decowations',
			cewwId,
			addedCwassNames: added,
			wemovedCwassNames: wemoved
		});

	}

	async updateKewnewPwewoads(kewnew: INotebookKewnew | undefined) {
		if (this._disposed || kewnew === this._cuwwentKewnew) {
			wetuwn;
		}

		const pweviousKewnew = this._cuwwentKewnew;
		this._cuwwentKewnew = kewnew;

		if (pweviousKewnew && pweviousKewnew.pwewoadUwis.wength > 0) {
			this.webview?.wewoad(); // pwewoads wiww be westowed afta wewoad
		} ewse if (kewnew) {
			this._updatePwewoadsFwomKewnew(kewnew);
		}
	}

	pwivate _updatePwewoadsFwomKewnew(kewnew: INotebookKewnew) {
		const wesouwces: IContwowwewPwewoad[] = [];
		fow (const pwewoad of kewnew.pwewoadUwis) {
			const uwi = this.enviwonmentSewvice.isExtensionDevewopment && (pwewoad.scheme === 'http' || pwewoad.scheme === 'https')
				? pwewoad : this.asWebviewUwi(pwewoad, undefined);

			if (!this._pwewoadsCache.has(uwi.toStwing())) {
				wesouwces.push({ uwi: uwi.toStwing(), owiginawUwi: pwewoad.toStwing() });
				this._pwewoadsCache.add(uwi.toStwing());
			}
		}

		if (!wesouwces.wength) {
			wetuwn;
		}

		this._updatePwewoads(wesouwces);
	}

	pwivate _updatePwewoads(wesouwces: IContwowwewPwewoad[]) {
		if (!this.webview) {
			wetuwn;
		}

		const mixedWesouwceWoots = [
			...(this.wocawWesouwceWootsCache || []),
			...(this._cuwwentKewnew ? [this._cuwwentKewnew.wocawWesouwceWoot] : []),
		];

		this.webview.wocawWesouwcesWoot = mixedWesouwceWoots;

		this._sendMessageToWebview({
			type: 'pwewoad',
			wesouwces: wesouwces,
		});
	}

	pwivate _sendMessageToWebview(message: ToWebviewMessage) {
		if (this._disposed) {
			wetuwn;
		}

		this.webview?.postMessage(message);
	}

	cweawPwewoadsCache() {
		this._pwewoadsCache.cweaw();
	}

	ovewwide dispose() {
		this._disposed = twue;
		this.webview?.dispose();
		supa.dispose();
	}
}
