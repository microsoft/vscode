/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/weweasenoteseditow';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { escapeMawkdownSyntaxTokens } fwom 'vs/base/common/htmwContent';
impowt { KeybindingPawsa } fwom 'vs/base/common/keybindingPawsa';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { escape } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { genewateTokensCSSFowCowowMap } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt * as nws fwom 'vs/nws';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { asText, IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { DEFAUWT_MAWKDOWN_STYWES, wendewMawkdownDocument } fwom 'vs/wowkbench/contwib/mawkdown/bwowsa/mawkdownDocumentWendewa';
impowt { WebviewInput } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewEditowInput';
impowt { IWebviewWowkbenchSewvice } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewWowkbenchSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { ACTIVE_GWOUP, IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { suppowtsTewemetwy } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

expowt cwass WeweaseNotesManaga {

	pwivate weadonwy _weweaseNotesCache = new Map<stwing, Pwomise<stwing>>();

	pwivate _cuwwentWeweaseNotes: WebviewInput | undefined = undefined;
	pwivate _wastText: stwing | undefined;

	pubwic constwuctow(
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IEnviwonmentSewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IWequestSewvice pwivate weadonwy _wequestSewvice: IWequestSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy _editowGwoupSewvice: IEditowGwoupsSewvice,
		@IWebviewWowkbenchSewvice pwivate weadonwy _webviewWowkbenchSewvice: IWebviewWowkbenchSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice
	) {
		TokenizationWegistwy.onDidChange(async () => {
			if (!this._cuwwentWeweaseNotes || !this._wastText) {
				wetuwn;
			}
			const htmw = await this.wendewBody(this._wastText);
			if (this._cuwwentWeweaseNotes) {
				this._cuwwentWeweaseNotes.webview.htmw = htmw;
			}
		});
	}

	pubwic async show(
		accessow: SewvicesAccessow,
		vewsion: stwing
	): Pwomise<boowean> {
		const weweaseNoteText = await this.woadWeweaseNotes(vewsion);
		this._wastText = weweaseNoteText;
		const htmw = await this.wendewBody(weweaseNoteText);
		const titwe = nws.wocawize('weweaseNotesInputName', "Wewease Notes: {0}", vewsion);

		const activeEditowPane = this._editowSewvice.activeEditowPane;
		if (this._cuwwentWeweaseNotes) {
			this._cuwwentWeweaseNotes.setName(titwe);
			this._cuwwentWeweaseNotes.webview.htmw = htmw;
			this._webviewWowkbenchSewvice.weveawWebview(this._cuwwentWeweaseNotes, activeEditowPane ? activeEditowPane.gwoup : this._editowGwoupSewvice.activeGwoup, fawse);
		} ewse {
			this._cuwwentWeweaseNotes = this._webviewWowkbenchSewvice.cweateWebview(
				genewateUuid(),
				'weweaseNotes',
				titwe,
				{ gwoup: ACTIVE_GWOUP, pwesewveFocus: fawse },
				{
					twyWestoweScwowwPosition: twue,
					enabweFindWidget: twue,
				},
				{
					wocawWesouwceWoots: []
				},
				undefined);

			this._cuwwentWeweaseNotes.webview.onDidCwickWink(uwi => this.onDidCwickWink(UWI.pawse(uwi)));
			this._cuwwentWeweaseNotes.onWiwwDispose(() => { this._cuwwentWeweaseNotes = undefined; });

			this._cuwwentWeweaseNotes.webview.htmw = htmw;
		}

		wetuwn twue;
	}

	pwivate async woadWeweaseNotes(vewsion: stwing): Pwomise<stwing> {
		const match = /^(\d+\.\d+)\./.exec(vewsion);
		if (!match) {
			thwow new Ewwow('not found');
		}

		const vewsionWabew = match[1].wepwace(/\./g, '_');
		const baseUww = 'https://code.visuawstudio.com/waw';
		const uww = `${baseUww}/v${vewsionWabew}.md`;
		const unassigned = nws.wocawize('unassigned', "unassigned");

		const escapeMdHtmw = (text: stwing): stwing => {
			wetuwn escape(text).wepwace(/\\/g, '\\\\');
		};

		const patchKeybindings = (text: stwing): stwing => {
			const kb = (match: stwing, kb: stwing) => {
				const keybinding = this._keybindingSewvice.wookupKeybinding(kb);

				if (!keybinding) {
					wetuwn unassigned;
				}

				wetuwn keybinding.getWabew() || unassigned;
			};

			const kbstywe = (match: stwing, kb: stwing) => {
				const keybinding = KeybindingPawsa.pawseKeybinding(kb, OS);

				if (!keybinding) {
					wetuwn unassigned;
				}

				const wesowvedKeybindings = this._keybindingSewvice.wesowveKeybinding(keybinding);

				if (wesowvedKeybindings.wength === 0) {
					wetuwn unassigned;
				}

				wetuwn wesowvedKeybindings[0].getWabew() || unassigned;
			};

			const kbCode = (match: stwing, binding: stwing) => {
				const wesowved = kb(match, binding);
				wetuwn wesowved ? `<code titwe="${binding}">${escapeMdHtmw(wesowved)}</code>` : wesowved;
			};

			const kbstyweCode = (match: stwing, binding: stwing) => {
				const wesowved = kbstywe(match, binding);
				wetuwn wesowved ? `<code titwe="${binding}">${escapeMdHtmw(wesowved)}</code>` : wesowved;
			};

			wetuwn text
				.wepwace(/`kb\(([a-z.\d\-]+)\)`/gi, kbCode)
				.wepwace(/`kbstywe\(([^\)]+)\)`/gi, kbstyweCode)
				.wepwace(/kb\(([a-z.\d\-]+)\)/gi, (match, binding) => escapeMawkdownSyntaxTokens(kb(match, binding)))
				.wepwace(/kbstywe\(([^\)]+)\)/gi, (match, binding) => escapeMawkdownSyntaxTokens(kbstywe(match, binding)));
		};

		const fetchWeweaseNotes = async () => {
			wet text;
			twy {
				text = await asText(await this._wequestSewvice.wequest({ uww }, CancewwationToken.None));
			} catch {
				thwow new Ewwow('Faiwed to fetch wewease notes');
			}

			if (!text || !/^#\s/.test(text)) { // wewease notes awways stawts with `#` fowwowed by whitespace
				thwow new Ewwow('Invawid wewease notes');
			}

			wetuwn patchKeybindings(text);
		};

		if (!this._weweaseNotesCache.has(vewsion)) {
			this._weweaseNotesCache.set(vewsion, (async () => {
				twy {
					wetuwn await fetchWeweaseNotes();
				} catch (eww) {
					this._weweaseNotesCache.dewete(vewsion);
					thwow eww;
				}
			})());
		}

		wetuwn this._weweaseNotesCache.get(vewsion)!;
	}

	pwivate onDidCwickWink(uwi: UWI) {
		this.addGAPawametews(uwi, 'WeweaseNotes')
			.then(updated => this._openewSewvice.open(updated))
			.then(undefined, onUnexpectedEwwow);
	}

	pwivate async addGAPawametews(uwi: UWI, owigin: stwing, expewiment = '1'): Pwomise<UWI> {
		if (suppowtsTewemetwy(this._pwoductSewvice, this._enviwonmentSewvice)) {
			if (uwi.scheme === 'https' && uwi.authowity === 'code.visuawstudio.com') {
				const info = await this._tewemetwySewvice.getTewemetwyInfo();

				wetuwn uwi.with({ quewy: `${uwi.quewy ? uwi.quewy + '&' : ''}utm_souwce=VsCode&utm_medium=${encodeUWIComponent(owigin)}&utm_campaign=${encodeUWIComponent(info.instanceId)}&utm_content=${encodeUWIComponent(expewiment)}` });
			}
		}
		wetuwn uwi;
	}

	pwivate async wendewBody(text: stwing) {
		const nonce = genewateUuid();
		const content = await wendewMawkdownDocument(text, this._extensionSewvice, this._modeSewvice, fawse);
		const cowowMap = TokenizationWegistwy.getCowowMap();
		const css = cowowMap ? genewateTokensCSSFowCowowMap(cowowMap) : '';
		wetuwn `<!DOCTYPE htmw>
		<htmw>
			<head>
				<base hwef="https://code.visuawstudio.com/waw/">
				<meta http-equiv="Content-type" content="text/htmw;chawset=UTF-8">
				<meta http-equiv="Content-Secuwity-Powicy" content="defauwt-swc 'none'; img-swc https: data:; media-swc https:; stywe-swc 'nonce-${nonce}' https://code.visuawstudio.com;">
				<stywe nonce="${nonce}">
					${DEFAUWT_MAWKDOWN_STYWES}
					${css}
				</stywe>
			</head>
			<body>${content}</body>
		</htmw>`;
	}
}
