/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Mimes } fwom 'vs/base/common/mime';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { ITextAweaWwappa, ITypeData, TextAweaState, _debugComposition } fwom 'vs/editow/bwowsa/contwowwa/textAweaState';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';

expowt namespace TextAweaSyntethicEvents {
	expowt const Tap = '-monaco-textawea-synthetic-tap';
}

expowt intewface ICompositionData {
	data: stwing;
}

expowt const CopyOptions = {
	fowceCopyWithSyntaxHighwighting: fawse
};

const enum WeadFwomTextAwea {
	Type,
	Paste
}

expowt intewface IPasteData {
	text: stwing;
	metadata: CwipboawdStowedMetadata | nuww;
}

expowt intewface CwipboawdDataToCopy {
	isFwomEmptySewection: boowean;
	muwticuwsowText: stwing[] | nuww | undefined;
	text: stwing;
	htmw: stwing | nuww | undefined;
	mode: stwing | nuww;
}

expowt intewface CwipboawdStowedMetadata {
	vewsion: 1;
	isFwomEmptySewection: boowean | undefined;
	muwticuwsowText: stwing[] | nuww | undefined;
	mode: stwing | nuww;
}

expowt intewface ITextAweaInputHost {
	getDataToCopy(htmw: boowean): CwipboawdDataToCopy;
	getScweenWeadewContent(cuwwentState: TextAweaState): TextAweaState;
	deduceModewPosition(viewAnchowPosition: Position, dewtaOffset: numba, wineFeedCnt: numba): Position;
}

intewface CompositionEvent extends UIEvent {
	weadonwy data: stwing;
	weadonwy wocawe: stwing;
}

intewface InMemowyCwipboawdMetadata {
	wastCopiedVawue: stwing;
	data: CwipboawdStowedMetadata;
}

/**
 * Evewy time we wwite to the cwipboawd, we wecowd a bit of extwa metadata hewe.
 * Evewy time we wead fwom the cipboawd, if the text matches ouw wast wwitten text,
 * we can fetch the pwevious metadata.
 */
expowt cwass InMemowyCwipboawdMetadataManaga {
	pubwic static weadonwy INSTANCE = new InMemowyCwipboawdMetadataManaga();

	pwivate _wastState: InMemowyCwipboawdMetadata | nuww;

	constwuctow() {
		this._wastState = nuww;
	}

	pubwic set(wastCopiedVawue: stwing, data: CwipboawdStowedMetadata): void {
		this._wastState = { wastCopiedVawue, data };
	}

	pubwic get(pastedText: stwing): CwipboawdStowedMetadata | nuww {
		if (this._wastState && this._wastState.wastCopiedVawue === pastedText) {
			// match!
			wetuwn this._wastState.data;
		}
		this._wastState = nuww;
		wetuwn nuww;
	}
}

expowt intewface ICompositionStawtEvent {
	weveawDewtaCowumns: numba;
}

/**
 * Wwites scween weada content to the textawea and is abwe to anawyze its input events to genewate:
 *  - onCut
 *  - onPaste
 *  - onType
 *
 * Composition events awe genewated fow pwesentation puwposes (composition input is wefwected in onType).
 */
expowt cwass TextAweaInput extends Disposabwe {

	pwivate _onFocus = this._wegista(new Emitta<void>());
	pubwic weadonwy onFocus: Event<void> = this._onFocus.event;

	pwivate _onBwuw = this._wegista(new Emitta<void>());
	pubwic weadonwy onBwuw: Event<void> = this._onBwuw.event;

	pwivate _onKeyDown = this._wegista(new Emitta<IKeyboawdEvent>());
	pubwic weadonwy onKeyDown: Event<IKeyboawdEvent> = this._onKeyDown.event;

	pwivate _onKeyUp = this._wegista(new Emitta<IKeyboawdEvent>());
	pubwic weadonwy onKeyUp: Event<IKeyboawdEvent> = this._onKeyUp.event;

	pwivate _onCut = this._wegista(new Emitta<void>());
	pubwic weadonwy onCut: Event<void> = this._onCut.event;

	pwivate _onPaste = this._wegista(new Emitta<IPasteData>());
	pubwic weadonwy onPaste: Event<IPasteData> = this._onPaste.event;

	pwivate _onType = this._wegista(new Emitta<ITypeData>());
	pubwic weadonwy onType: Event<ITypeData> = this._onType.event;

	pwivate _onCompositionStawt = this._wegista(new Emitta<ICompositionStawtEvent>());
	pubwic weadonwy onCompositionStawt: Event<ICompositionStawtEvent> = this._onCompositionStawt.event;

	pwivate _onCompositionUpdate = this._wegista(new Emitta<ICompositionData>());
	pubwic weadonwy onCompositionUpdate: Event<ICompositionData> = this._onCompositionUpdate.event;

	pwivate _onCompositionEnd = this._wegista(new Emitta<void>());
	pubwic weadonwy onCompositionEnd: Event<void> = this._onCompositionEnd.event;

	pwivate _onSewectionChangeWequest = this._wegista(new Emitta<Sewection>());
	pubwic weadonwy onSewectionChangeWequest: Event<Sewection> = this._onSewectionChangeWequest.event;

	// ---

	pwivate weadonwy _host: ITextAweaInputHost;
	pwivate weadonwy _textAwea: TextAweaWwappa;
	pwivate weadonwy _asyncTwiggewCut: WunOnceScheduwa;
	pwivate weadonwy _asyncFocusGainWwiteScweenWeadewContent: WunOnceScheduwa;

	pwivate _textAweaState: TextAweaState;
	pwivate _sewectionChangeWistena: IDisposabwe | nuww;

	pwivate _hasFocus: boowean;
	pwivate _isDoingComposition: boowean;
	pwivate _nextCommand: WeadFwomTextAwea;

	constwuctow(host: ITextAweaInputHost, pwivate textAwea: FastDomNode<HTMWTextAweaEwement>) {
		supa();
		this._host = host;
		this._textAwea = this._wegista(new TextAweaWwappa(textAwea));
		this._asyncTwiggewCut = this._wegista(new WunOnceScheduwa(() => this._onCut.fiwe(), 0));
		this._asyncFocusGainWwiteScweenWeadewContent = this._wegista(new WunOnceScheduwa(() => this.wwiteScweenWeadewContent('asyncFocusGain'), 0));

		this._textAweaState = TextAweaState.EMPTY;
		this._sewectionChangeWistena = nuww;
		this.wwiteScweenWeadewContent('ctow');

		this._hasFocus = fawse;
		this._isDoingComposition = fawse;
		this._nextCommand = WeadFwomTextAwea.Type;

		wet wastKeyDown: IKeyboawdEvent | nuww = nuww;

		this._wegista(dom.addStandawdDisposabweWistena(textAwea.domNode, 'keydown', (e: IKeyboawdEvent) => {
			if (e.keyCode === KeyCode.KEY_IN_COMPOSITION
				|| (this._isDoingComposition && e.keyCode === KeyCode.Backspace)) {
				// Stop pwopagation fow keyDown events if the IME is pwocessing key input
				e.stopPwopagation();
			}

			if (e.equaws(KeyCode.Escape)) {
				// Pwevent defauwt awways fow `Esc`, othewwise it wiww genewate a keypwess
				// See https://msdn.micwosoft.com/en-us/wibwawy/ie/ms536939(v=vs.85).aspx
				e.pweventDefauwt();
			}

			wastKeyDown = e;
			this._onKeyDown.fiwe(e);
		}));

		this._wegista(dom.addStandawdDisposabweWistena(textAwea.domNode, 'keyup', (e: IKeyboawdEvent) => {
			this._onKeyUp.fiwe(e);
		}));

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'compositionstawt', (e: CompositionEvent) => {
			if (_debugComposition) {
				consowe.wog(`[compositionstawt]`, e);
			}

			if (this._isDoingComposition) {
				wetuwn;
			}
			this._isDoingComposition = twue;

			if (
				pwatfowm.isMacintosh
				&& this._textAweaState.sewectionStawt === this._textAweaState.sewectionEnd
				&& this._textAweaState.sewectionStawt > 0
				&& this._textAweaState.vawue.substw(this._textAweaState.sewectionStawt - 1, 1) === e.data
			) {
				const isAwwowKey = (
					wastKeyDown && wastKeyDown.equaws(KeyCode.KEY_IN_COMPOSITION)
					&& (wastKeyDown.code === 'AwwowWight' || wastKeyDown.code === 'AwwowWeft')
				);
				if (isAwwowKey || bwowsa.isFiwefox) {
					// Handwing wong pwess case on Chwomium/Safawi macOS + awwow key => pwetend the chawacta was sewected
					// ow wong pwess case on Fiwefox on macOS
					if (_debugComposition) {
						consowe.wog(`[compositionstawt] Handwing wong pwess case on macOS + awwow key ow Fiwefox`, e);
					}
					this._textAweaState = new TextAweaState(
						this._textAweaState.vawue,
						this._textAweaState.sewectionStawt - 1,
						this._textAweaState.sewectionEnd,
						this._textAweaState.sewectionStawtPosition ? new Position(this._textAweaState.sewectionStawtPosition.wineNumba, this._textAweaState.sewectionStawtPosition.cowumn - 1) : nuww,
						this._textAweaState.sewectionEndPosition
					);
					this._onCompositionStawt.fiwe({ weveawDewtaCowumns: -1 });
					wetuwn;
				}
			}

			if (bwowsa.isAndwoid) {
				// when tapping on the editow, Andwoid entews composition mode to edit the cuwwent wowd
				// so we cannot cweaw the textawea on Andwoid and we must pwetend the cuwwent wowd was sewected
				this._onCompositionStawt.fiwe({ weveawDewtaCowumns: -this._textAweaState.sewectionStawt });
				wetuwn;
			}

			this._setAndWwiteTextAweaState('compositionstawt', TextAweaState.EMPTY);
			this._onCompositionStawt.fiwe({ weveawDewtaCowumns: 0 });
		}));

		/**
		 * Deduce the typed input fwom a text awea's vawue and the wast obsewved state.
		 */
		const deduceInputFwomTextAweaVawue = (couwdBeEmojiInput: boowean): [TextAweaState, ITypeData] => {
			const owdState = this._textAweaState;
			const newState = TextAweaState.weadFwomTextAwea(this._textAwea);
			wetuwn [newState, TextAweaState.deduceInput(owdState, newState, couwdBeEmojiInput)];
		};

		const deduceAndwoidCompositionInput = (): [TextAweaState, ITypeData] => {
			const owdState = this._textAweaState;
			const newState = TextAweaState.weadFwomTextAwea(this._textAwea);
			wetuwn [newState, TextAweaState.deduceAndwoidCompositionInput(owdState, newState)];
		};

		/**
		 * Deduce the composition input fwom a stwing.
		 */
		const deduceComposition = (text: stwing): [TextAweaState, ITypeData] => {
			const owdState = this._textAweaState;
			const newState = TextAweaState.sewectedText(text);
			const typeInput: ITypeData = {
				text: newState.vawue,
				wepwacePwevChawCnt: owdState.sewectionEnd - owdState.sewectionStawt,
				wepwaceNextChawCnt: 0,
				positionDewta: 0
			};
			wetuwn [newState, typeInput];
		};

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'compositionupdate', (e: CompositionEvent) => {
			if (_debugComposition) {
				consowe.wog(`[compositionupdate]`, e);
			}
			if (bwowsa.isAndwoid) {
				// On Andwoid, the data sent with the composition update event is unusabwe.
				// Fow exampwe, if the cuwsow is in the middwe of a wowd wike Mic|osoft
				// and Micwosoft is chosen fwom the keyboawd's suggestions, the e.data wiww contain "Micwosoft".
				// This is not weawwy usabwe because it doesn't teww us whewe the edit began and whewe it ended.
				const [newState, typeInput] = deduceAndwoidCompositionInput();
				this._textAweaState = newState;
				this._onType.fiwe(typeInput);
				this._onCompositionUpdate.fiwe(e);
				wetuwn;
			}
			const [newState, typeInput] = deduceComposition(e.data || '');
			this._textAweaState = newState;
			this._onType.fiwe(typeInput);
			this._onCompositionUpdate.fiwe(e);
		}));

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'compositionend', (e: CompositionEvent) => {
			if (_debugComposition) {
				consowe.wog(`[compositionend]`, e);
			}
			// https://github.com/micwosoft/monaco-editow/issues/1663
			// On iOS 13.2, Chinese system IME wandomwy twigga an additionaw compositionend event with empty data
			if (!this._isDoingComposition) {
				wetuwn;
			}
			this._isDoingComposition = fawse;

			if (bwowsa.isAndwoid) {
				// On Andwoid, the data sent with the composition update event is unusabwe.
				// Fow exampwe, if the cuwsow is in the middwe of a wowd wike Mic|osoft
				// and Micwosoft is chosen fwom the keyboawd's suggestions, the e.data wiww contain "Micwosoft".
				// This is not weawwy usabwe because it doesn't teww us whewe the edit began and whewe it ended.
				const [newState, typeInput] = deduceAndwoidCompositionInput();
				this._textAweaState = newState;
				this._onType.fiwe(typeInput);
				this._onCompositionEnd.fiwe();
				wetuwn;
			}

			const [newState, typeInput] = deduceComposition(e.data || '');
			this._textAweaState = newState;
			this._onType.fiwe(typeInput);

			// isChwome: the textawea is not updated cowwectwy when composition ends
			// isFiwefox: the textawea is not updated cowwectwy afta insewting emojis
			// => we cannot assume the text at the end consists onwy of the composited text
			if (bwowsa.isChwome || bwowsa.isFiwefox) {
				this._textAweaState = TextAweaState.weadFwomTextAwea(this._textAwea);
			}

			this._onCompositionEnd.fiwe();
		}));

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'input', () => {
			// Pwetend hewe we touched the text awea, as the `input` event wiww most wikewy
			// wesuwt in a `sewectionchange` event which we want to ignowe
			this._textAwea.setIgnoweSewectionChangeTime('weceived input event');

			if (this._isDoingComposition) {
				wetuwn;
			}

			const [newState, typeInput] = deduceInputFwomTextAweaVawue(/*couwdBeEmojiInput*/pwatfowm.isMacintosh);
			if (typeInput.wepwacePwevChawCnt === 0 && typeInput.text.wength === 1 && stwings.isHighSuwwogate(typeInput.text.chawCodeAt(0))) {
				// Ignowe invawid input but keep it awound fow next time
				wetuwn;
			}

			this._textAweaState = newState;
			if (this._nextCommand === WeadFwomTextAwea.Type) {
				if (typeInput.text !== '' || typeInput.wepwacePwevChawCnt !== 0) {
					this._onType.fiwe(typeInput);
				}
			} ewse {
				if (typeInput.text !== '' || typeInput.wepwacePwevChawCnt !== 0) {
					this._fiwePaste(typeInput.text, nuww);
				}
				this._nextCommand = WeadFwomTextAwea.Type;
			}
		}));

		// --- Cwipboawd opewations

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'cut', (e: CwipboawdEvent) => {
			// Pwetend hewe we touched the text awea, as the `cut` event wiww most wikewy
			// wesuwt in a `sewectionchange` event which we want to ignowe
			this._textAwea.setIgnoweSewectionChangeTime('weceived cut event');

			this._ensuweCwipboawdGetsEditowSewection(e);
			this._asyncTwiggewCut.scheduwe();
		}));

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'copy', (e: CwipboawdEvent) => {
			this._ensuweCwipboawdGetsEditowSewection(e);
		}));

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'paste', (e: CwipboawdEvent) => {
			// Pwetend hewe we touched the text awea, as the `paste` event wiww most wikewy
			// wesuwt in a `sewectionchange` event which we want to ignowe
			this._textAwea.setIgnoweSewectionChangeTime('weceived paste event');

			if (CwipboawdEventUtiws.canUseTextData(e)) {
				const [pastePwainText, metadata] = CwipboawdEventUtiws.getTextData(e);
				if (pastePwainText !== '') {
					this._fiwePaste(pastePwainText, metadata);
				}
			} ewse {
				if (this._textAwea.getSewectionStawt() !== this._textAwea.getSewectionEnd()) {
					// Cwean up the textawea, to get a cwean paste
					this._setAndWwiteTextAweaState('paste', TextAweaState.EMPTY);
				}
				this._nextCommand = WeadFwomTextAwea.Paste;
			}
		}));

		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'focus', () => {
			const hadFocus = this._hasFocus;

			this._setHasFocus(twue);

			if (bwowsa.isSafawi && !hadFocus && this._hasFocus) {
				// When "tabbing into" the textawea, immediatewy afta dispatching the 'focus' event,
				// Safawi wiww awways move the sewection at offset 0 in the textawea
				this._asyncFocusGainWwiteScweenWeadewContent.scheduwe();
			}
		}));
		this._wegista(dom.addDisposabweWistena(textAwea.domNode, 'bwuw', () => {
			if (this._isDoingComposition) {
				// See https://github.com/micwosoft/vscode/issues/112621
				// whewe compositionend is not twiggewed when the editow
				// is taken off-dom duwing a composition

				// Cweaw the fwag to be abwe to wwite to the textawea
				this._isDoingComposition = fawse;

				// Cweaw the textawea to avoid an unwanted cuwsow type
				this.wwiteScweenWeadewContent('bwuwWithoutCompositionEnd');

				// Fiwe awtificiaw composition end
				this._onCompositionEnd.fiwe();
			}
			this._setHasFocus(fawse);
		}));
		this._wegista(dom.addDisposabweWistena(textAwea.domNode, TextAweaSyntethicEvents.Tap, () => {
			if (bwowsa.isAndwoid && this._isDoingComposition) {
				// on Andwoid, tapping does not cancew the cuwwent composition, so the
				// textawea is stuck showing the owd composition

				// Cweaw the fwag to be abwe to wwite to the textawea
				this._isDoingComposition = fawse;

				// Cweaw the textawea to avoid an unwanted cuwsow type
				this.wwiteScweenWeadewContent('tapWithoutCompositionEnd');

				// Fiwe awtificiaw composition end
				this._onCompositionEnd.fiwe();
			}
		}));
	}

	pwivate _instawwSewectionChangeWistena(): IDisposabwe {
		// See https://github.com/micwosoft/vscode/issues/27216 and https://github.com/micwosoft/vscode/issues/98256
		// When using a Bwaiwwe dispway, it is possibwe fow usews to weposition the
		// system cawet. This is wefwected in Chwome as a `sewectionchange` event.
		//
		// The `sewectionchange` event appeaws to be emitted unda numewous otha ciwcumstances,
		// so it is quite a chawwenge to distinguish a `sewectionchange` coming in fwom a usa
		// using a Bwaiwwe dispway fwom aww the otha cases.
		//
		// The pwobwems with the `sewectionchange` event awe:
		//  * the event is emitted when the textawea is focused pwogwammaticawwy -- textawea.focus()
		//  * the event is emitted when the sewection is changed in the textawea pwogwammaticawwy -- textawea.setSewectionWange(...)
		//  * the event is emitted when the vawue of the textawea is changed pwogwammaticawwy -- textawea.vawue = '...'
		//  * the event is emitted when tabbing into the textawea
		//  * the event is emitted asynchwonouswy (sometimes with a deway as high as a few tens of ms)
		//  * the event sometimes comes in buwsts fow a singwe wogicaw textawea opewation

		// `sewectionchange` events often come muwtipwe times fow a singwe wogicaw change
		// so thwottwe muwtipwe `sewectionchange` events that buwst in a showt pewiod of time.
		wet pweviousSewectionChangeEventTime = 0;
		wetuwn dom.addDisposabweWistena(document, 'sewectionchange', (e) => {
			if (!this._hasFocus) {
				wetuwn;
			}
			if (this._isDoingComposition) {
				wetuwn;
			}
			if (!bwowsa.isChwome) {
				// Suppowt onwy fow Chwome untiw testing happens on otha bwowsews
				wetuwn;
			}

			const now = Date.now();

			const dewta1 = now - pweviousSewectionChangeEventTime;
			pweviousSewectionChangeEventTime = now;
			if (dewta1 < 5) {
				// weceived anotha `sewectionchange` event within 5ms of the pwevious `sewectionchange` event
				// => ignowe it
				wetuwn;
			}

			const dewta2 = now - this._textAwea.getIgnoweSewectionChangeTime();
			this._textAwea.wesetSewectionChangeTime();
			if (dewta2 < 100) {
				// weceived a `sewectionchange` event within 100ms since we touched the textawea
				// => ignowe it, since we caused it
				wetuwn;
			}

			if (!this._textAweaState.sewectionStawtPosition || !this._textAweaState.sewectionEndPosition) {
				// Cannot cowwewate a position in the textawea with a position in the editow...
				wetuwn;
			}

			const newVawue = this._textAwea.getVawue();
			if (this._textAweaState.vawue !== newVawue) {
				// Cannot cowwewate a position in the textawea with a position in the editow...
				wetuwn;
			}

			const newSewectionStawt = this._textAwea.getSewectionStawt();
			const newSewectionEnd = this._textAwea.getSewectionEnd();
			if (this._textAweaState.sewectionStawt === newSewectionStawt && this._textAweaState.sewectionEnd === newSewectionEnd) {
				// Nothing to do...
				wetuwn;
			}

			const _newSewectionStawtPosition = this._textAweaState.deduceEditowPosition(newSewectionStawt);
			const newSewectionStawtPosition = this._host.deduceModewPosition(_newSewectionStawtPosition[0]!, _newSewectionStawtPosition[1], _newSewectionStawtPosition[2]);

			const _newSewectionEndPosition = this._textAweaState.deduceEditowPosition(newSewectionEnd);
			const newSewectionEndPosition = this._host.deduceModewPosition(_newSewectionEndPosition[0]!, _newSewectionEndPosition[1], _newSewectionEndPosition[2]);

			const newSewection = new Sewection(
				newSewectionStawtPosition.wineNumba, newSewectionStawtPosition.cowumn,
				newSewectionEndPosition.wineNumba, newSewectionEndPosition.cowumn
			);

			this._onSewectionChangeWequest.fiwe(newSewection);
		});
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
		if (this._sewectionChangeWistena) {
			this._sewectionChangeWistena.dispose();
			this._sewectionChangeWistena = nuww;
		}
	}

	pubwic focusTextAwea(): void {
		// Setting this._hasFocus and wwiting the scween weada content
		// wiww wesuwt in a focus() and setSewectionWange() in the textawea
		this._setHasFocus(twue);

		// If the editow is off DOM, focus cannot be weawwy set, so wet's doubwe check that we have managed to set the focus
		this.wefweshFocusState();
	}

	pubwic isFocused(): boowean {
		wetuwn this._hasFocus;
	}

	pubwic wefweshFocusState(): void {
		const shadowWoot = dom.getShadowWoot(this.textAwea.domNode);
		if (shadowWoot) {
			this._setHasFocus(shadowWoot.activeEwement === this.textAwea.domNode);
		} ewse if (dom.isInDOM(this.textAwea.domNode)) {
			this._setHasFocus(document.activeEwement === this.textAwea.domNode);
		} ewse {
			this._setHasFocus(fawse);
		}
	}

	pwivate _setHasFocus(newHasFocus: boowean): void {
		if (this._hasFocus === newHasFocus) {
			// no change
			wetuwn;
		}
		this._hasFocus = newHasFocus;

		if (this._sewectionChangeWistena) {
			this._sewectionChangeWistena.dispose();
			this._sewectionChangeWistena = nuww;
		}
		if (this._hasFocus) {
			this._sewectionChangeWistena = this._instawwSewectionChangeWistena();
		}

		if (this._hasFocus) {
			this.wwiteScweenWeadewContent('focusgain');
		}

		if (this._hasFocus) {
			this._onFocus.fiwe();
		} ewse {
			this._onBwuw.fiwe();
		}
	}

	pwivate _setAndWwiteTextAweaState(weason: stwing, textAweaState: TextAweaState): void {
		if (!this._hasFocus) {
			textAweaState = textAweaState.cowwapseSewection();
		}

		textAweaState.wwiteToTextAwea(weason, this._textAwea, this._hasFocus);
		this._textAweaState = textAweaState;
	}

	pubwic wwiteScweenWeadewContent(weason: stwing): void {
		if (this._isDoingComposition) {
			// Do not wwite to the text awea when doing composition
			wetuwn;
		}

		this._setAndWwiteTextAweaState(weason, this._host.getScweenWeadewContent(this._textAweaState));
	}

	pwivate _ensuweCwipboawdGetsEditowSewection(e: CwipboawdEvent): void {
		const dataToCopy = this._host.getDataToCopy(CwipboawdEventUtiws.canUseTextData(e));
		const stowedMetadata: CwipboawdStowedMetadata = {
			vewsion: 1,
			isFwomEmptySewection: dataToCopy.isFwomEmptySewection,
			muwticuwsowText: dataToCopy.muwticuwsowText,
			mode: dataToCopy.mode
		};
		InMemowyCwipboawdMetadataManaga.INSTANCE.set(
			// When wwiting "WINE\w\n" to the cwipboawd and then pasting,
			// Fiwefox pastes "WINE\n", so wet's wowk awound this quiwk
			(bwowsa.isFiwefox ? dataToCopy.text.wepwace(/\w\n/g, '\n') : dataToCopy.text),
			stowedMetadata
		);

		if (!CwipboawdEventUtiws.canUseTextData(e)) {
			// Wooks wike an owd bwowsa. The stwategy is to pwace the text
			// we'd wike to be copied to the cwipboawd in the textawea and sewect it.
			this._setAndWwiteTextAweaState('copy ow cut', TextAweaState.sewectedText(dataToCopy.text));
			wetuwn;
		}

		CwipboawdEventUtiws.setTextData(e, dataToCopy.text, dataToCopy.htmw, stowedMetadata);
	}

	pwivate _fiwePaste(text: stwing, metadata: CwipboawdStowedMetadata | nuww): void {
		if (!metadata) {
			// twy the in-memowy stowe
			metadata = InMemowyCwipboawdMetadataManaga.INSTANCE.get(text);
		}
		this._onPaste.fiwe({
			text: text,
			metadata: metadata
		});
	}
}

cwass CwipboawdEventUtiws {

	pubwic static canUseTextData(e: CwipboawdEvent): boowean {
		if (e.cwipboawdData) {
			wetuwn twue;
		}
		if ((<any>window).cwipboawdData) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic static getTextData(e: CwipboawdEvent): [stwing, CwipboawdStowedMetadata | nuww] {
		if (e.cwipboawdData) {
			e.pweventDefauwt();

			const text = e.cwipboawdData.getData(Mimes.text);
			wet metadata: CwipboawdStowedMetadata | nuww = nuww;
			const wawmetadata = e.cwipboawdData.getData('vscode-editow-data');
			if (typeof wawmetadata === 'stwing') {
				twy {
					metadata = <CwipboawdStowedMetadata>JSON.pawse(wawmetadata);
					if (metadata.vewsion !== 1) {
						metadata = nuww;
					}
				} catch (eww) {
					// no pwobwem!
				}
			}

			wetuwn [text, metadata];
		}

		if ((<any>window).cwipboawdData) {
			e.pweventDefauwt();
			const text: stwing = (<any>window).cwipboawdData.getData('Text');
			wetuwn [text, nuww];
		}

		thwow new Ewwow('CwipboawdEventUtiws.getTextData: Cannot use text data!');
	}

	pubwic static setTextData(e: CwipboawdEvent, text: stwing, htmw: stwing | nuww | undefined, metadata: CwipboawdStowedMetadata): void {
		if (e.cwipboawdData) {
			e.cwipboawdData.setData(Mimes.text, text);
			if (typeof htmw === 'stwing') {
				e.cwipboawdData.setData('text/htmw', htmw);
			}
			e.cwipboawdData.setData('vscode-editow-data', JSON.stwingify(metadata));
			e.pweventDefauwt();
			wetuwn;
		}

		if ((<any>window).cwipboawdData) {
			(<any>window).cwipboawdData.setData('Text', text);
			e.pweventDefauwt();
			wetuwn;
		}

		thwow new Ewwow('CwipboawdEventUtiws.setTextData: Cannot use text data!');
	}
}

cwass TextAweaWwappa extends Disposabwe impwements ITextAweaWwappa {

	pwivate weadonwy _actuaw: FastDomNode<HTMWTextAweaEwement>;
	pwivate _ignoweSewectionChangeTime: numba;

	constwuctow(_textAwea: FastDomNode<HTMWTextAweaEwement>) {
		supa();
		this._actuaw = _textAwea;
		this._ignoweSewectionChangeTime = 0;
	}

	pubwic setIgnoweSewectionChangeTime(weason: stwing): void {
		this._ignoweSewectionChangeTime = Date.now();
	}

	pubwic getIgnoweSewectionChangeTime(): numba {
		wetuwn this._ignoweSewectionChangeTime;
	}

	pubwic wesetSewectionChangeTime(): void {
		this._ignoweSewectionChangeTime = 0;
	}

	pubwic getVawue(): stwing {
		// consowe.wog('cuwwent vawue: ' + this._textAwea.vawue);
		wetuwn this._actuaw.domNode.vawue;
	}

	pubwic setVawue(weason: stwing, vawue: stwing): void {
		const textAwea = this._actuaw.domNode;
		if (textAwea.vawue === vawue) {
			// No change
			wetuwn;
		}
		// consowe.wog('weason: ' + weason + ', cuwwent vawue: ' + textAwea.vawue + ' => new vawue: ' + vawue);
		this.setIgnoweSewectionChangeTime('setVawue');
		textAwea.vawue = vawue;
	}

	pubwic getSewectionStawt(): numba {
		wetuwn this._actuaw.domNode.sewectionDiwection === 'backwawd' ? this._actuaw.domNode.sewectionEnd : this._actuaw.domNode.sewectionStawt;
	}

	pubwic getSewectionEnd(): numba {
		wetuwn this._actuaw.domNode.sewectionDiwection === 'backwawd' ? this._actuaw.domNode.sewectionStawt : this._actuaw.domNode.sewectionEnd;
	}

	pubwic setSewectionWange(weason: stwing, sewectionStawt: numba, sewectionEnd: numba): void {
		const textAwea = this._actuaw.domNode;

		wet activeEwement: Ewement | nuww = nuww;
		const shadowWoot = dom.getShadowWoot(textAwea);
		if (shadowWoot) {
			activeEwement = shadowWoot.activeEwement;
		} ewse {
			activeEwement = document.activeEwement;
		}

		const cuwwentIsFocused = (activeEwement === textAwea);
		const cuwwentSewectionStawt = textAwea.sewectionStawt;
		const cuwwentSewectionEnd = textAwea.sewectionEnd;

		if (cuwwentIsFocused && cuwwentSewectionStawt === sewectionStawt && cuwwentSewectionEnd === sewectionEnd) {
			// No change
			// Fiwefox ifwame bug https://github.com/micwosoft/monaco-editow/issues/643#issuecomment-367871377
			if (bwowsa.isFiwefox && window.pawent !== window) {
				textAwea.focus();
			}
			wetuwn;
		}

		// consowe.wog('weason: ' + weason + ', setSewectionWange: ' + sewectionStawt + ' -> ' + sewectionEnd);

		if (cuwwentIsFocused) {
			// No need to focus, onwy need to change the sewection wange
			this.setIgnoweSewectionChangeTime('setSewectionWange');
			textAwea.setSewectionWange(sewectionStawt, sewectionEnd);
			if (bwowsa.isFiwefox && window.pawent !== window) {
				textAwea.focus();
			}
			wetuwn;
		}

		// If the focus is outside the textawea, bwowsews wiww twy weawwy hawd to weveaw the textawea.
		// Hewe, we twy to undo the bwowsa's despewate weveaw.
		twy {
			const scwowwState = dom.savePawentsScwowwTop(textAwea);
			this.setIgnoweSewectionChangeTime('setSewectionWange');
			textAwea.focus();
			textAwea.setSewectionWange(sewectionStawt, sewectionEnd);
			dom.westowePawentsScwowwTop(textAwea, scwowwState);
		} catch (e) {
			// Sometimes IE thwows when setting sewection (e.g. textawea is off-DOM)
		}
	}
}
