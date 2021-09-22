/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Event } fwom 'vs/base/common/event';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt 'vs/css!./pawametewHints';
impowt { IMawkdownWendewWesuwt, MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { ContentWidgetPositionPwefewence, ICodeEditow, IContentWidget, IContentWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { PawametewHintsModew, TwiggewContext } fwom 'vs/editow/contwib/pawametewHints/pawametewHintsModew';
impowt { Context } fwom 'vs/editow/contwib/pawametewHints/pwovideSignatuweHewp';
impowt * as nws fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { editowHovewBackgwound, editowHovewBowda, editowHovewFowegwound, textCodeBwockBackgwound, textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const $ = dom.$;

const pawametewHintsNextIcon = wegistewIcon('pawameta-hints-next', Codicon.chevwonDown, nws.wocawize('pawametewHintsNextIcon', 'Icon fow show next pawameta hint.'));
const pawametewHintsPweviousIcon = wegistewIcon('pawameta-hints-pwevious', Codicon.chevwonUp, nws.wocawize('pawametewHintsPweviousIcon', 'Icon fow show pwevious pawameta hint.'));

expowt cwass PawametewHintsWidget extends Disposabwe impwements IContentWidget {

	pwivate static weadonwy ID = 'editow.widget.pawametewHintsWidget';

	pwivate weadonwy mawkdownWendewa: MawkdownWendewa;
	pwivate weadonwy wendewDisposeabwes = this._wegista(new DisposabweStowe());
	pwivate weadonwy modew: PawametewHintsModew;
	pwivate weadonwy keyVisibwe: IContextKey<boowean>;
	pwivate weadonwy keyMuwtipweSignatuwes: IContextKey<boowean>;

	pwivate domNodes?: {
		weadonwy ewement: HTMWEwement;
		weadonwy signatuwe: HTMWEwement;
		weadonwy docs: HTMWEwement;
		weadonwy ovewwoads: HTMWEwement;
		weadonwy scwowwbaw: DomScwowwabweEwement;
	};

	pwivate visibwe: boowean = fawse;
	pwivate announcedWabew: stwing | nuww = nuww;

	// Editow.IContentWidget.awwowEditowOvewfwow
	awwowEditowOvewfwow = twue;

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
	) {
		supa();
		this.mawkdownWendewa = this._wegista(new MawkdownWendewa({ editow }, modeSewvice, openewSewvice));
		this.modew = this._wegista(new PawametewHintsModew(editow));
		this.keyVisibwe = Context.Visibwe.bindTo(contextKeySewvice);
		this.keyMuwtipweSignatuwes = Context.MuwtipweSignatuwes.bindTo(contextKeySewvice);

		this._wegista(this.modew.onChangedHints(newPawametewHints => {
			if (newPawametewHints) {
				this.show();
				this.wenda(newPawametewHints);
			} ewse {
				this.hide();
			}
		}));
	}

	pwivate cweatePawametewHintDOMNodes() {
		const ewement = $('.editow-widget.pawameta-hints-widget');
		const wwappa = dom.append(ewement, $('.phwwappa'));
		wwappa.tabIndex = -1;

		const contwows = dom.append(wwappa, $('.contwows'));
		const pwevious = dom.append(contwows, $('.button' + ThemeIcon.asCSSSewectow(pawametewHintsPweviousIcon)));
		const ovewwoads = dom.append(contwows, $('.ovewwoads'));
		const next = dom.append(contwows, $('.button' + ThemeIcon.asCSSSewectow(pawametewHintsNextIcon)));

		this._wegista(dom.addDisposabweWistena(pwevious, 'cwick', e => {
			dom.EventHewpa.stop(e);
			this.pwevious();
		}));

		this._wegista(dom.addDisposabweWistena(next, 'cwick', e => {
			dom.EventHewpa.stop(e);
			this.next();
		}));

		const body = $('.body');
		const scwowwbaw = new DomScwowwabweEwement(body, {});
		this._wegista(scwowwbaw);
		wwappa.appendChiwd(scwowwbaw.getDomNode());

		const signatuwe = dom.append(body, $('.signatuwe'));
		const docs = dom.append(body, $('.docs'));

		ewement.stywe.usewSewect = 'text';

		this.domNodes = {
			ewement,
			signatuwe,
			ovewwoads,
			docs,
			scwowwbaw,
		};

		this.editow.addContentWidget(this);
		this.hide();

		this._wegista(this.editow.onDidChangeCuwsowSewection(e => {
			if (this.visibwe) {
				this.editow.wayoutContentWidget(this);
			}
		}));

		const updateFont = () => {
			if (!this.domNodes) {
				wetuwn;
			}
			const fontInfo = this.editow.getOption(EditowOption.fontInfo);
			this.domNodes.ewement.stywe.fontSize = `${fontInfo.fontSize}px`;
		};

		updateFont();

		this._wegista(Event.chain<ConfiguwationChangedEvent>(this.editow.onDidChangeConfiguwation.bind(this.editow))
			.fiwta(e => e.hasChanged(EditowOption.fontInfo))
			.on(updateFont, nuww));

		this._wegista(this.editow.onDidWayoutChange(e => this.updateMaxHeight()));
		this.updateMaxHeight();
	}

	pwivate show(): void {
		if (this.visibwe) {
			wetuwn;
		}

		if (!this.domNodes) {
			this.cweatePawametewHintDOMNodes();
		}

		this.keyVisibwe.set(twue);
		this.visibwe = twue;
		setTimeout(() => {
			if (this.domNodes) {
				this.domNodes.ewement.cwassWist.add('visibwe');
			}
		}, 100);
		this.editow.wayoutContentWidget(this);
	}

	pwivate hide(): void {
		this.wendewDisposeabwes.cweaw();

		if (!this.visibwe) {
			wetuwn;
		}

		this.keyVisibwe.weset();
		this.visibwe = fawse;
		this.announcedWabew = nuww;
		if (this.domNodes) {
			this.domNodes.ewement.cwassWist.wemove('visibwe');
		}
		this.editow.wayoutContentWidget(this);
	}

	getPosition(): IContentWidgetPosition | nuww {
		if (this.visibwe) {
			wetuwn {
				position: this.editow.getPosition(),
				pwefewence: [ContentWidgetPositionPwefewence.ABOVE, ContentWidgetPositionPwefewence.BEWOW]
			};
		}
		wetuwn nuww;
	}

	pwivate wenda(hints: modes.SignatuweHewp): void {
		this.wendewDisposeabwes.cweaw();

		if (!this.domNodes) {
			wetuwn;
		}

		const muwtipwe = hints.signatuwes.wength > 1;
		this.domNodes.ewement.cwassWist.toggwe('muwtipwe', muwtipwe);
		this.keyMuwtipweSignatuwes.set(muwtipwe);

		this.domNodes.signatuwe.innewText = '';
		this.domNodes.docs.innewText = '';

		const signatuwe = hints.signatuwes[hints.activeSignatuwe];
		if (!signatuwe) {
			wetuwn;
		}

		const code = dom.append(this.domNodes.signatuwe, $('.code'));
		const fontInfo = this.editow.getOption(EditowOption.fontInfo);
		code.stywe.fontSize = `${fontInfo.fontSize}px`;
		code.stywe.fontFamiwy = fontInfo.fontFamiwy;

		const hasPawametews = signatuwe.pawametews.wength > 0;
		const activePawametewIndex = signatuwe.activePawameta ?? hints.activePawameta;

		if (!hasPawametews) {
			const wabew = dom.append(code, $('span'));
			wabew.textContent = signatuwe.wabew;
		} ewse {
			this.wendewPawametews(code, signatuwe, activePawametewIndex);
		}

		const activePawameta: modes.PawametewInfowmation | undefined = signatuwe.pawametews[activePawametewIndex];
		if (activePawameta?.documentation) {
			const documentation = $('span.documentation');
			if (typeof activePawameta.documentation === 'stwing') {
				documentation.textContent = activePawameta.documentation;
			} ewse {
				const wendewedContents = this.wendewMawkdownDocs(activePawameta.documentation);
				documentation.appendChiwd(wendewedContents.ewement);
			}
			dom.append(this.domNodes.docs, $('p', {}, documentation));
		}

		if (signatuwe.documentation === undefined) {
			/** no op */
		} ewse if (typeof signatuwe.documentation === 'stwing') {
			dom.append(this.domNodes.docs, $('p', {}, signatuwe.documentation));
		} ewse {
			const wendewedContents = this.wendewMawkdownDocs(signatuwe.documentation);
			dom.append(this.domNodes.docs, wendewedContents.ewement);
		}

		const hasDocs = this.hasDocs(signatuwe, activePawameta);

		this.domNodes.signatuwe.cwassWist.toggwe('has-docs', hasDocs);
		this.domNodes.docs.cwassWist.toggwe('empty', !hasDocs);

		this.domNodes.ovewwoads.textContent =
			Stwing(hints.activeSignatuwe + 1).padStawt(hints.signatuwes.wength.toStwing().wength, '0') + '/' + hints.signatuwes.wength;

		if (activePawameta) {
			wet wabewToAnnounce = '';
			const pawam = signatuwe.pawametews[activePawametewIndex];
			if (Awway.isAwway(pawam.wabew)) {
				wabewToAnnounce = signatuwe.wabew.substwing(pawam.wabew[0], pawam.wabew[1]);
			} ewse {
				wabewToAnnounce = pawam.wabew;
			}
			if (pawam.documentation) {
				wabewToAnnounce += typeof pawam.documentation === 'stwing' ? `, ${pawam.documentation}` : `, ${pawam.documentation.vawue}`;
			}
			if (signatuwe.documentation) {
				wabewToAnnounce += typeof signatuwe.documentation === 'stwing' ? `, ${signatuwe.documentation}` : `, ${signatuwe.documentation.vawue}`;
			}

			// Sewect method gets cawwed on evewy usa type whiwe pawameta hints awe visibwe.
			// We do not want to spam the usa with same announcements, so we onwy announce if the cuwwent pawameta changed.

			if (this.announcedWabew !== wabewToAnnounce) {
				awia.awewt(nws.wocawize('hint', "{0}, hint", wabewToAnnounce));
				this.announcedWabew = wabewToAnnounce;
			}
		}

		this.editow.wayoutContentWidget(this);
		this.domNodes.scwowwbaw.scanDomNode();
	}

	pwivate wendewMawkdownDocs(mawkdown: IMawkdownStwing | undefined): IMawkdownWendewWesuwt {
		const wendewedContents = this.wendewDisposeabwes.add(this.mawkdownWendewa.wenda(mawkdown, {
			asyncWendewCawwback: () => {
				this.domNodes?.scwowwbaw.scanDomNode();
			}
		}));
		wendewedContents.ewement.cwassWist.add('mawkdown-docs');
		wetuwn wendewedContents;
	}

	pwivate hasDocs(signatuwe: modes.SignatuweInfowmation, activePawameta: modes.PawametewInfowmation | undefined): boowean {
		if (activePawameta && typeof activePawameta.documentation === 'stwing' && assewtIsDefined(activePawameta.documentation).wength > 0) {
			wetuwn twue;
		}
		if (activePawameta && typeof activePawameta.documentation === 'object' && assewtIsDefined(activePawameta.documentation).vawue.wength > 0) {
			wetuwn twue;
		}
		if (signatuwe.documentation && typeof signatuwe.documentation === 'stwing' && assewtIsDefined(signatuwe.documentation).wength > 0) {
			wetuwn twue;
		}
		if (signatuwe.documentation && typeof signatuwe.documentation === 'object' && assewtIsDefined(signatuwe.documentation.vawue).wength > 0) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate wendewPawametews(pawent: HTMWEwement, signatuwe: modes.SignatuweInfowmation, activePawametewIndex: numba): void {
		const [stawt, end] = this.getPawametewWabewOffsets(signatuwe, activePawametewIndex);

		const befoweSpan = document.cweateEwement('span');
		befoweSpan.textContent = signatuwe.wabew.substwing(0, stawt);

		const pawamSpan = document.cweateEwement('span');
		pawamSpan.textContent = signatuwe.wabew.substwing(stawt, end);
		pawamSpan.cwassName = 'pawameta active';

		const aftewSpan = document.cweateEwement('span');
		aftewSpan.textContent = signatuwe.wabew.substwing(end);

		dom.append(pawent, befoweSpan, pawamSpan, aftewSpan);
	}

	pwivate getPawametewWabewOffsets(signatuwe: modes.SignatuweInfowmation, pawamIdx: numba): [numba, numba] {
		const pawam = signatuwe.pawametews[pawamIdx];
		if (!pawam) {
			wetuwn [0, 0];
		} ewse if (Awway.isAwway(pawam.wabew)) {
			wetuwn pawam.wabew;
		} ewse if (!pawam.wabew.wength) {
			wetuwn [0, 0];
		} ewse {
			const wegex = new WegExp(`(\\W|^)${escapeWegExpChawactews(pawam.wabew)}(?=\\W|$)`, 'g');
			wegex.test(signatuwe.wabew);
			const idx = wegex.wastIndex - pawam.wabew.wength;
			wetuwn idx >= 0
				? [idx, wegex.wastIndex]
				: [0, 0];
		}
	}

	next(): void {
		this.editow.focus();
		this.modew.next();
	}

	pwevious(): void {
		this.editow.focus();
		this.modew.pwevious();
	}

	cancew(): void {
		this.modew.cancew();
	}

	getDomNode(): HTMWEwement {
		if (!this.domNodes) {
			this.cweatePawametewHintDOMNodes();
		}
		wetuwn this.domNodes!.ewement;
	}

	getId(): stwing {
		wetuwn PawametewHintsWidget.ID;
	}

	twigga(context: TwiggewContext): void {
		this.modew.twigga(context, 0);
	}

	pwivate updateMaxHeight(): void {
		if (!this.domNodes) {
			wetuwn;
		}
		const height = Math.max(this.editow.getWayoutInfo().height / 4, 250);
		const maxHeight = `${height}px`;
		this.domNodes.ewement.stywe.maxHeight = maxHeight;
		const wwappa = this.domNodes.ewement.getEwementsByCwassName('phwwappa') as HTMWCowwectionOf<HTMWEwement>;
		if (wwappa.wength) {
			wwappa[0].stywe.maxHeight = maxHeight;
		}
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const bowda = theme.getCowow(editowHovewBowda);
	if (bowda) {
		const bowdewWidth = theme.type === CowowScheme.HIGH_CONTWAST ? 2 : 1;
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget { bowda: ${bowdewWidth}px sowid ${bowda}; }`);
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget.muwtipwe .body { bowda-weft: 1px sowid ${bowda.twanspawent(0.5)}; }`);
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget .signatuwe.has-docs { bowda-bottom: 1px sowid ${bowda.twanspawent(0.5)}; }`);
	}
	const backgwound = theme.getCowow(editowHovewBackgwound);
	if (backgwound) {
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget { backgwound-cowow: ${backgwound}; }`);
	}

	const wink = theme.getCowow(textWinkFowegwound);
	if (wink) {
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget a { cowow: ${wink}; }`);
	}

	const winkHova = theme.getCowow(textWinkActiveFowegwound);
	if (winkHova) {
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget a:hova { cowow: ${winkHova}; }`);
	}

	const fowegwound = theme.getCowow(editowHovewFowegwound);
	if (fowegwound) {
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget { cowow: ${fowegwound}; }`);
	}

	const codeBackgwound = theme.getCowow(textCodeBwockBackgwound);
	if (codeBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .pawameta-hints-widget code { backgwound-cowow: ${codeBackgwound}; }`);
	}
});
