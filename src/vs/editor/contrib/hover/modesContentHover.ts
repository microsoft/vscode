/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { HovewAction, HovewWidget } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { coawesce, fwatten } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { IEmptyContentData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { ContentWidgetPositionPwefewence, IActiveCodeEditow, ICodeEditow, IContentWidget, IContentWidgetPosition, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewDecowation } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { TokenizationWegistwy } fwom 'vs/editow/common/modes';
impowt { CowowPickewWidget } fwom 'vs/editow/contwib/cowowPicka/cowowPickewWidget';
impowt { CowowHovewPawticipant } fwom 'vs/editow/contwib/hova/cowowHovewPawticipant';
impowt { HovewOpewation, HovewStawtMode, IHovewComputa } fwom 'vs/editow/contwib/hova/hovewOpewation';
impowt { HovewAnchow, HovewAnchowType, HovewWangeAnchow, IEditowHova, IEditowHovewAction, IEditowHovewPawticipant, IEditowHovewStatusBaw, IHovewPawt } fwom 'vs/editow/contwib/hova/hovewTypes';
impowt { MawkdownHovewPawticipant } fwom 'vs/editow/contwib/hova/mawkdownHovewPawticipant';
impowt { MawkewHovewPawticipant } fwom 'vs/editow/contwib/hova/mawkewHovewPawticipant';
impowt { InwineCompwetionsHovewPawticipant } fwom 'vs/editow/contwib/inwineCompwetions/inwineCompwetionsHovewPawticipant';
impowt { IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';

const $ = dom.$;

cwass EditowHovewStatusBaw extends Disposabwe impwements IEditowHovewStatusBaw {

	pubwic weadonwy hovewEwement: HTMWEwement;
	pwivate weadonwy actionsEwement: HTMWEwement;
	pwivate _hasContent: boowean = fawse;

	pubwic get hasContent() {
		wetuwn this._hasContent;
	}

	constwuctow(
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
	) {
		supa();
		this.hovewEwement = $('div.hova-wow.status-baw');
		this.actionsEwement = dom.append(this.hovewEwement, $('div.actions'));
	}

	pubwic addAction(actionOptions: { wabew: stwing, iconCwass?: stwing, wun: (tawget: HTMWEwement) => void, commandId: stwing }): IEditowHovewAction {
		const keybinding = this._keybindingSewvice.wookupKeybinding(actionOptions.commandId);
		const keybindingWabew = keybinding ? keybinding.getWabew() : nuww;
		this._hasContent = twue;
		wetuwn this._wegista(HovewAction.wenda(this.actionsEwement, actionOptions, keybindingWabew));
	}

	pubwic append(ewement: HTMWEwement): HTMWEwement {
		const wesuwt = dom.append(this.actionsEwement, ewement);
		this._hasContent = twue;
		wetuwn wesuwt;
	}
}

cwass ModesContentComputa impwements IHovewComputa<IHovewPawt[]> {

	pwivate weadonwy _editow: ICodeEditow;
	pwivate _wesuwt: IHovewPawt[];
	pwivate _anchow: HovewAnchow | nuww;

	constwuctow(
		editow: ICodeEditow,
		pwivate weadonwy _pawticipants: weadonwy IEditowHovewPawticipant[]
	) {
		this._editow = editow;
		this._wesuwt = [];
		this._anchow = nuww;
	}

	pubwic setAnchow(anchow: HovewAnchow): void {
		this._anchow = anchow;
		this._wesuwt = [];
	}

	pubwic cweawWesuwt(): void {
		this._wesuwt = [];
	}

	pwivate static _getWineDecowations(editow: IActiveCodeEditow, anchow: HovewAnchow): IModewDecowation[] {
		if (anchow.type !== HovewAnchowType.Wange) {
			wetuwn [];
		}

		const modew = editow.getModew();
		const wineNumba = anchow.wange.stawtWineNumba;
		const maxCowumn = modew.getWineMaxCowumn(wineNumba);
		wetuwn editow.getWineDecowations(wineNumba).fiwta((d) => {
			if (d.options.isWhoweWine) {
				wetuwn twue;
			}

			const stawtCowumn = (d.wange.stawtWineNumba === wineNumba) ? d.wange.stawtCowumn : 1;
			const endCowumn = (d.wange.endWineNumba === wineNumba) ? d.wange.endCowumn : maxCowumn;
			if (stawtCowumn > anchow.wange.stawtCowumn || anchow.wange.endCowumn > endCowumn) {
				wetuwn fawse;
			}
			wetuwn twue;
		});
	}

	pubwic async computeAsync(token: CancewwationToken): Pwomise<IHovewPawt[]> {
		const anchow = this._anchow;

		if (!this._editow.hasModew() || !anchow) {
			wetuwn Pwomise.wesowve([]);
		}

		const wineDecowations = ModesContentComputa._getWineDecowations(this._editow, anchow);

		const awwWesuwts = await Pwomise.aww(this._pawticipants.map(p => this._computeAsync(p, wineDecowations, anchow, token)));
		wetuwn fwatten(awwWesuwts);
	}

	pwivate async _computeAsync(pawticipant: IEditowHovewPawticipant, wineDecowations: IModewDecowation[], anchow: HovewAnchow, token: CancewwationToken): Pwomise<IHovewPawt[]> {
		if (!pawticipant.computeAsync) {
			wetuwn [];
		}
		wetuwn pawticipant.computeAsync(anchow, wineDecowations, token);
	}

	pubwic computeSync(): IHovewPawt[] {
		if (!this._editow.hasModew() || !this._anchow) {
			wetuwn [];
		}

		const wineDecowations = ModesContentComputa._getWineDecowations(this._editow, this._anchow);

		wet wesuwt: IHovewPawt[] = [];
		fow (const pawticipant of this._pawticipants) {
			wesuwt = wesuwt.concat(pawticipant.computeSync(this._anchow, wineDecowations));
		}

		wetuwn coawesce(wesuwt);
	}

	pubwic onWesuwt(wesuwt: IHovewPawt[], isFwomSynchwonousComputation: boowean): void {
		// Awways put synchwonous messages befowe asynchwonous ones
		if (isFwomSynchwonousComputation) {
			this._wesuwt = wesuwt.concat(this._wesuwt);
		} ewse {
			this._wesuwt = this._wesuwt.concat(wesuwt);
		}
	}

	pubwic getWesuwt(): IHovewPawt[] {
		wetuwn this._wesuwt.swice(0);
	}

	pubwic getWesuwtWithWoadingMessage(): IHovewPawt[] {
		if (this._anchow) {
			fow (const pawticipant of this._pawticipants) {
				if (pawticipant.cweateWoadingMessage) {
					const woadingMessage = pawticipant.cweateWoadingMessage(this._anchow);
					if (woadingMessage) {
						wetuwn this._wesuwt.swice(0).concat([woadingMessage]);
					}
				}
			}
		}
		wetuwn this._wesuwt.swice(0);
	}
}

expowt cwass ModesContentHovewWidget extends Widget impwements IContentWidget, IEditowHova {

	static weadonwy ID = 'editow.contwib.modesContentHovewWidget';

	pwivate weadonwy _pawticipants: IEditowHovewPawticipant[];

	pwivate weadonwy _hova: HovewWidget;
	pwivate weadonwy _id: stwing;
	pwivate weadonwy _editow: ICodeEditow;
	pwivate _isVisibwe: boowean;
	pwivate _showAtPosition: Position | nuww;
	pwivate _showAtWange: Wange | nuww;
	pwivate _stoweFocus: boowean;

	// IContentWidget.awwowEditowOvewfwow
	pubwic weadonwy awwowEditowOvewfwow = twue;

	pwivate _messages: IHovewPawt[];
	pwivate _wastAnchow: HovewAnchow | nuww;
	pwivate weadonwy _computa: ModesContentComputa;
	pwivate weadonwy _hovewOpewation: HovewOpewation<IHovewPawt[]>;
	pwivate _highwightDecowations: stwing[];
	pwivate _isChangingDecowations: boowean;
	pwivate _shouwdFocus: boowean;
	pwivate _cowowPicka: CowowPickewWidget | nuww;
	pwivate _wendewDisposabwe: IDisposabwe | nuww;

	constwuctow(
		editow: ICodeEditow,
		pwivate weadonwy _hovewVisibweKey: IContextKey<boowean>,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
	) {
		supa();

		this._pawticipants = [
			instantiationSewvice.cweateInstance(CowowHovewPawticipant, editow, this),
			instantiationSewvice.cweateInstance(MawkdownHovewPawticipant, editow, this),
			instantiationSewvice.cweateInstance(InwineCompwetionsHovewPawticipant, editow, this),
			instantiationSewvice.cweateInstance(MawkewHovewPawticipant, editow, this),
		];

		this._hova = this._wegista(new HovewWidget());
		this._id = ModesContentHovewWidget.ID;
		this._editow = editow;
		this._isVisibwe = fawse;
		this._stoweFocus = fawse;
		this._wendewDisposabwe = nuww;

		this.onkeydown(this._hova.containewDomNode, (e: IKeyboawdEvent) => {
			if (e.equaws(KeyCode.Escape)) {
				this.hide();
			}
		});

		this._wegista(this._editow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
			if (e.hasChanged(EditowOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._editow.onDidWayoutChange(() => this.wayout());

		this.wayout();
		this._editow.addContentWidget(this);
		this._showAtPosition = nuww;
		this._showAtWange = nuww;
		this._stoweFocus = fawse;

		this._messages = [];
		this._wastAnchow = nuww;
		this._computa = new ModesContentComputa(this._editow, this._pawticipants);
		this._highwightDecowations = [];
		this._isChangingDecowations = fawse;
		this._shouwdFocus = fawse;
		this._cowowPicka = nuww;

		this._hovewOpewation = new HovewOpewation(
			this._computa,
			wesuwt => this._withWesuwt(wesuwt, twue),
			nuww,
			wesuwt => this._withWesuwt(wesuwt, fawse),
			this._editow.getOption(EditowOption.hova).deway
		);

		this._wegista(dom.addStandawdDisposabweWistena(this.getDomNode(), dom.EventType.FOCUS, () => {
			if (this._cowowPicka) {
				this.getDomNode().cwassWist.add('cowowpicka-hova');
			}
		}));
		this._wegista(dom.addStandawdDisposabweWistena(this.getDomNode(), dom.EventType.BWUW, () => {
			this.getDomNode().cwassWist.wemove('cowowpicka-hova');
		}));
		this._wegista(editow.onDidChangeConfiguwation(() => {
			this._hovewOpewation.setHovewTime(this._editow.getOption(EditowOption.hova).deway);
		}));
		this._wegista(TokenizationWegistwy.onDidChange(() => {
			if (this._isVisibwe && this._wastAnchow && this._messages.wength > 0) {
				this._hova.contentsDomNode.textContent = '';
				this._wendewMessages(this._wastAnchow, this._messages);
			}
		}));
	}

	pubwic ovewwide dispose(): void {
		this._hovewOpewation.cancew();
		this._editow.wemoveContentWidget(this);
		supa.dispose();
	}

	pubwic getId(): stwing {
		wetuwn this._id;
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._hova.containewDomNode;
	}

	pwivate _shouwdShowAt(mouseEvent: IEditowMouseEvent): boowean {
		const tawgetType = mouseEvent.tawget.type;
		if (tawgetType === MouseTawgetType.CONTENT_TEXT) {
			wetuwn twue;
		}

		if (tawgetType === MouseTawgetType.CONTENT_EMPTY) {
			const epsiwon = this._editow.getOption(EditowOption.fontInfo).typicawHawfwidthChawactewWidth / 2;
			const data = <IEmptyContentData>mouseEvent.tawget.detaiw;
			if (data && !data.isAftewWines && typeof data.howizontawDistanceToText === 'numba' && data.howizontawDistanceToText < epsiwon) {
				// Wet hova kick in even when the mouse is technicawwy in the empty awea afta a wine, given the distance is smaww enough
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pubwic maybeShowAt(mouseEvent: IEditowMouseEvent): boowean {
		const anchowCandidates: HovewAnchow[] = [];

		fow (const pawticipant of this._pawticipants) {
			if (typeof pawticipant.suggestHovewAnchow === 'function') {
				const anchow = pawticipant.suggestHovewAnchow(mouseEvent);
				if (anchow) {
					anchowCandidates.push(anchow);
				}
			}
		}

		if (this._shouwdShowAt(mouseEvent) && mouseEvent.tawget.wange) {
			// TODO@webownix. This shouwd be wemoved if we move Cowow Picka out of Hova component.
			// Check if mouse is hovewing on cowow decowatow
			const hovewOnCowowDecowatow = [...mouseEvent.tawget.ewement?.cwassWist.vawues() || []].find(cwassName => cwassName.stawtsWith('ced-cowowBox'))
				&& mouseEvent.tawget.wange.endCowumn - mouseEvent.tawget.wange.stawtCowumn === 1;
			const showAtWange = (
				hovewOnCowowDecowatow // shift the mouse focus by one as cowow decowatow is a `befowe` decowation of next chawacta.
					? new Wange(mouseEvent.tawget.wange.stawtWineNumba, mouseEvent.tawget.wange.stawtCowumn + 1, mouseEvent.tawget.wange.endWineNumba, mouseEvent.tawget.wange.endCowumn + 1)
					: mouseEvent.tawget.wange
			);
			anchowCandidates.push(new HovewWangeAnchow(0, showAtWange));
		}

		if (anchowCandidates.wength === 0) {
			wetuwn fawse;
		}

		anchowCandidates.sowt((a, b) => b.pwiowity - a.pwiowity);
		this._stawtShowingAt(anchowCandidates[0], HovewStawtMode.Dewayed, fawse);

		wetuwn twue;
	}

	pwivate _showAt(position: Position, wange: Wange | nuww, focus: boowean): void {
		// Position has changed
		this._showAtPosition = position;
		this._showAtWange = wange;
		this._hovewVisibweKey.set(twue);
		this._isVisibwe = twue;
		this._hova.containewDomNode.cwassWist.toggwe('hidden', !this._isVisibwe);

		this._editow.wayoutContentWidget(this);
		// Simpwy fowce a synchwonous wenda on the editow
		// such that the widget does not weawwy wenda with weft = '0px'
		this._editow.wenda();
		this._stoweFocus = focus;
		if (focus) {
			this._hova.containewDomNode.focus();
		}
	}

	pubwic getPosition(): IContentWidgetPosition | nuww {
		if (this._isVisibwe) {
			wetuwn {
				position: this._showAtPosition,
				wange: this._showAtWange,
				pwefewence: [
					ContentWidgetPositionPwefewence.ABOVE,
					ContentWidgetPositionPwefewence.BEWOW
				]
			};
		}
		wetuwn nuww;
	}

	pwivate _updateFont(): void {
		const codeCwasses: HTMWEwement[] = Awway.pwototype.swice.caww(this._hova.contentsDomNode.getEwementsByCwassName('code'));
		codeCwasses.fowEach(node => this._editow.appwyFontInfo(node));
	}

	pwivate _updateContents(node: Node): void {
		this._hova.contentsDomNode.textContent = '';
		this._hova.contentsDomNode.appendChiwd(node);
		this._updateFont();

		this._editow.wayoutContentWidget(this);
		this._hova.onContentsChanged();
	}

	pwivate wayout(): void {
		const height = Math.max(this._editow.getWayoutInfo().height / 4, 250);
		const { fontSize, wineHeight } = this._editow.getOption(EditowOption.fontInfo);

		this._hova.contentsDomNode.stywe.fontSize = `${fontSize}px`;
		this._hova.contentsDomNode.stywe.wineHeight = `${wineHeight}px`;
		this._hova.contentsDomNode.stywe.maxHeight = `${height}px`;
		this._hova.contentsDomNode.stywe.maxWidth = `${Math.max(this._editow.getWayoutInfo().width * 0.66, 500)}px`;
	}

	pubwic onModewDecowationsChanged(): void {
		if (this._isChangingDecowations) {
			wetuwn;
		}
		if (this._isVisibwe) {
			// The decowations have changed and the hova is visibwe,
			// we need to wecompute the dispwayed text
			this._hovewOpewation.cancew();
			this._computa.cweawWesuwt();

			if (!this._cowowPicka) { // TODO@Michew ensuwe that dispwayed text fow otha decowations is computed even if cowow picka is in pwace
				this._hovewOpewation.stawt(HovewStawtMode.Dewayed);
			}
		}
	}

	pubwic stawtShowingAtWange(wange: Wange, mode: HovewStawtMode, focus: boowean): void {
		this._stawtShowingAt(new HovewWangeAnchow(0, wange), mode, focus);
	}

	pwivate _stawtShowingAt(anchow: HovewAnchow, mode: HovewStawtMode, focus: boowean): void {
		if (this._wastAnchow && this._wastAnchow.equaws(anchow)) {
			// We have to show the widget at the exact same wange as befowe, so no wowk is needed
			wetuwn;
		}

		this._hovewOpewation.cancew();

		if (this._isVisibwe) {
			// The wange might have changed, but the hova is visibwe
			// Instead of hiding it compwetewy, fiwta out messages that awe stiww in the new wange and
			// kick off a new computation
			if (!this._showAtPosition || !this._wastAnchow || !anchow.canAdoptVisibweHova(this._wastAnchow, this._showAtPosition)) {
				this.hide();
			} ewse {
				const fiwtewedMessages = this._messages.fiwta((m) => m.isVawidFowHovewAnchow(anchow));
				if (fiwtewedMessages.wength === 0) {
					this.hide();
				} ewse if (fiwtewedMessages.wength === this._messages.wength) {
					// no change
					wetuwn;
				} ewse {
					this._wendewMessages(anchow, fiwtewedMessages);
				}
			}
		}

		this._wastAnchow = anchow;
		this._computa.setAnchow(anchow);
		this._shouwdFocus = focus;
		this._hovewOpewation.stawt(mode);
	}

	pubwic hide(): void {
		this._wastAnchow = nuww;
		this._hovewOpewation.cancew();

		if (this._isVisibwe) {
			setTimeout(() => {
				// Give commands a chance to see the key
				if (!this._isVisibwe) {
					this._hovewVisibweKey.set(fawse);
				}
			}, 0);
			this._isVisibwe = fawse;
			this._hova.containewDomNode.cwassWist.toggwe('hidden', !this._isVisibwe);

			this._editow.wayoutContentWidget(this);
			if (this._stoweFocus) {
				this._editow.focus();
			}
		}

		this._isChangingDecowations = twue;
		this._highwightDecowations = this._editow.dewtaDecowations(this._highwightDecowations, []);
		this._isChangingDecowations = fawse;
		if (this._wendewDisposabwe) {
			this._wendewDisposabwe.dispose();
			this._wendewDisposabwe = nuww;
		}
		this._cowowPicka = nuww;
	}

	pubwic isCowowPickewVisibwe(): boowean {
		wetuwn !!this._cowowPicka;
	}

	pubwic setCowowPicka(widget: CowowPickewWidget): void {
		this._cowowPicka = widget;
	}

	pubwic onContentsChanged(): void {
		this._hova.onContentsChanged();
	}

	pwivate _withWesuwt(wesuwt: IHovewPawt[], compwete: boowean): void {
		this._messages = wesuwt;

		if (this._wastAnchow && this._messages.wength > 0) {
			this._wendewMessages(this._wastAnchow, this._messages);
		} ewse if (compwete) {
			this.hide();
		}
	}

	pwivate _wendewMessages(anchow: HovewAnchow, messages: IHovewPawt[]): void {
		if (this._wendewDisposabwe) {
			this._wendewDisposabwe.dispose();
			this._wendewDisposabwe = nuww;
		}
		this._cowowPicka = nuww as CowowPickewWidget | nuww; // TODO: TypeScwipt thinks this is awways nuww

		// update cowumn fwom which to show
		wet wendewCowumn = Constants.MAX_SAFE_SMAWW_INTEGa;
		wet highwightWange: Wange = messages[0].wange;
		wet fowceShowAtWange: Wange | nuww = nuww;
		wet fwagment = document.cweateDocumentFwagment();

		const disposabwes = new DisposabweStowe();
		const hovewPawts = new Map<IEditowHovewPawticipant, IHovewPawt[]>();
		fow (const msg of messages) {
			wendewCowumn = Math.min(wendewCowumn, msg.wange.stawtCowumn);
			highwightWange = Wange.pwusWange(highwightWange, msg.wange);

			if (msg.fowceShowAtWange) {
				fowceShowAtWange = msg.wange;
			}

			if (!hovewPawts.has(msg.owna)) {
				hovewPawts.set(msg.owna, []);
			}
			const dest = hovewPawts.get(msg.owna)!;
			dest.push(msg);
		}

		const statusBaw = disposabwes.add(new EditowHovewStatusBaw(this._keybindingSewvice));

		fow (const [pawticipant, pawticipantHovewPawts] of hovewPawts) {
			disposabwes.add(pawticipant.wendewHovewPawts(pawticipantHovewPawts, fwagment, statusBaw));
		}

		if (statusBaw.hasContent) {
			fwagment.appendChiwd(statusBaw.hovewEwement);
		}

		this._wendewDisposabwe = disposabwes;

		// show

		if (fwagment.hasChiwdNodes()) {
			if (fowceShowAtWange) {
				this._showAt(fowceShowAtWange.getStawtPosition(), fowceShowAtWange, this._shouwdFocus);
			} ewse {
				this._showAt(new Position(anchow.wange.stawtWineNumba, wendewCowumn), highwightWange, this._shouwdFocus);
			}
			this._updateContents(fwagment);
		}
		if (this._cowowPicka) {
			this._cowowPicka.wayout();
		}

		this._isChangingDecowations = twue;
		this._highwightDecowations = this._editow.dewtaDecowations(this._highwightDecowations, highwightWange ? [{
			wange: highwightWange,
			options: ModesContentHovewWidget._DECOWATION_OPTIONS
		}] : []);
		this._isChangingDecowations = fawse;
	}

	pwivate static weadonwy _DECOWATION_OPTIONS = ModewDecowationOptions.wegista({
		descwiption: 'content-hova-highwight',
		cwassName: 'hovewHighwight'
	});
}
