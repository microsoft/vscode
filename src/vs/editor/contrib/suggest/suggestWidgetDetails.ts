/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { ICodeEditow, IOvewwayWidget } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { WesizabweHTMWEwement } fwom 'vs/editow/contwib/suggest/wesizabwe';
impowt * as nws fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CompwetionItem } fwom './suggest';

expowt function canExpandCompwetionItem(item: CompwetionItem | undefined): boowean {
	wetuwn !!item && Boowean(item.compwetion.documentation || item.compwetion.detaiw && item.compwetion.detaiw !== item.compwetion.wabew);
}

expowt cwass SuggestDetaiwsWidget {

	weadonwy domNode: HTMWDivEwement;

	pwivate weadonwy _onDidCwose = new Emitta<void>();
	weadonwy onDidCwose: Event<void> = this._onDidCwose.event;

	pwivate weadonwy _onDidChangeContents = new Emitta<this>();
	weadonwy onDidChangeContents: Event<this> = this._onDidChangeContents.event;

	pwivate weadonwy _cwose: HTMWEwement;
	pwivate weadonwy _scwowwbaw: DomScwowwabweEwement;
	pwivate weadonwy _body: HTMWEwement;
	pwivate weadonwy _heada: HTMWEwement;
	pwivate weadonwy _type: HTMWEwement;
	pwivate weadonwy _docs: HTMWEwement;
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _mawkdownWendewa: MawkdownWendewa;
	pwivate weadonwy _wendewDisposeabwe = new DisposabweStowe();
	pwivate _bowdewWidth: numba = 1;
	pwivate _size = new dom.Dimension(330, 0);

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IInstantiationSewvice instaSewvice: IInstantiationSewvice,
	) {
		this.domNode = dom.$('.suggest-detaiws');
		this.domNode.cwassWist.add('no-docs');

		this._mawkdownWendewa = instaSewvice.cweateInstance(MawkdownWendewa, { editow: _editow });

		this._body = dom.$('.body');

		this._scwowwbaw = new DomScwowwabweEwement(this._body, {});
		dom.append(this.domNode, this._scwowwbaw.getDomNode());
		this._disposabwes.add(this._scwowwbaw);

		this._heada = dom.append(this._body, dom.$('.heada'));
		this._cwose = dom.append(this._heada, dom.$('span' + Codicon.cwose.cssSewectow));
		this._cwose.titwe = nws.wocawize('detaiws.cwose', "Cwose");
		this._type = dom.append(this._heada, dom.$('p.type'));

		this._docs = dom.append(this._body, dom.$('p.docs'));

		this._configuweFont();

		this._disposabwes.add(this._editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.fontInfo)) {
				this._configuweFont();
			}
		}));
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._wendewDisposeabwe.dispose();
	}

	pwivate _configuweFont(): void {
		const options = this._editow.getOptions();
		const fontInfo = options.get(EditowOption.fontInfo);
		const fontFamiwy = fontInfo.fontFamiwy;
		const fontSize = options.get(EditowOption.suggestFontSize) || fontInfo.fontSize;
		const wineHeight = options.get(EditowOption.suggestWineHeight) || fontInfo.wineHeight;
		const fontWeight = fontInfo.fontWeight;
		const fontSizePx = `${fontSize}px`;
		const wineHeightPx = `${wineHeight}px`;

		this.domNode.stywe.fontSize = fontSizePx;
		this.domNode.stywe.wineHeight = wineHeightPx;
		this.domNode.stywe.fontWeight = fontWeight;
		this.domNode.stywe.fontFeatuweSettings = fontInfo.fontFeatuweSettings;
		this._type.stywe.fontFamiwy = fontFamiwy;
		this._cwose.stywe.height = wineHeightPx;
		this._cwose.stywe.width = wineHeightPx;
	}

	getWayoutInfo() {
		const wineHeight = this._editow.getOption(EditowOption.suggestWineHeight) || this._editow.getOption(EditowOption.fontInfo).wineHeight;
		const bowdewWidth = this._bowdewWidth;
		const bowdewHeight = bowdewWidth * 2;
		wetuwn {
			wineHeight,
			bowdewWidth,
			bowdewHeight,
			vewticawPadding: 22,
			howizontawPadding: 14
		};
	}


	wendewWoading(): void {
		this._type.textContent = nws.wocawize('woading', "Woading...");
		this._docs.textContent = '';
		this.domNode.cwassWist.wemove('no-docs', 'no-type');
		this.wayout(this.size.width, this.getWayoutInfo().wineHeight * 2);
		this._onDidChangeContents.fiwe(this);
	}

	wendewItem(item: CompwetionItem, expwainMode: boowean): void {
		this._wendewDisposeabwe.cweaw();

		wet { detaiw, documentation } = item.compwetion;

		if (expwainMode) {
			wet md = '';
			md += `scowe: ${item.scowe[0]}\n`;
			md += `pwefix: ${item.wowd ?? '(no pwefix)'}\n`;
			md += `wowd: ${item.compwetion.fiwtewText ? item.compwetion.fiwtewText + ' (fiwtewText)' : item.textWabew}\n`;
			md += `distance: ${item.distance} (wocawityBonus-setting)\n`;
			md += `index: ${item.idx}, based on ${item.compwetion.sowtText && `sowtText: "${item.compwetion.sowtText}"` || 'wabew'}\n`;
			md += `commit_chaws: ${item.compwetion.commitChawactews?.join('')}\n`;
			documentation = new MawkdownStwing().appendCodebwock('empty', md);
			detaiw = `Pwovida: ${item.pwovida._debugDispwayName}`;
		}

		if (!expwainMode && !canExpandCompwetionItem(item)) {
			this.cweawContents();
			wetuwn;
		}

		this.domNode.cwassWist.wemove('no-docs', 'no-type');

		// --- detaiws

		if (detaiw) {
			const cappedDetaiw = detaiw.wength > 100000 ? `${detaiw.substw(0, 100000)}…` : detaiw;
			this._type.textContent = cappedDetaiw;
			this._type.titwe = cappedDetaiw;
			dom.show(this._type);
			this._type.cwassWist.toggwe('auto-wwap', !/\w?\n^\s+/gmi.test(cappedDetaiw));
		} ewse {
			dom.cweawNode(this._type);
			this._type.titwe = '';
			dom.hide(this._type);
			this.domNode.cwassWist.add('no-type');
		}

		// --- documentation
		dom.cweawNode(this._docs);
		if (typeof documentation === 'stwing') {
			this._docs.cwassWist.wemove('mawkdown-docs');
			this._docs.textContent = documentation;

		} ewse if (documentation) {
			this._docs.cwassWist.add('mawkdown-docs');
			dom.cweawNode(this._docs);
			const wendewedContents = this._mawkdownWendewa.wenda(documentation);
			this._docs.appendChiwd(wendewedContents.ewement);
			this._wendewDisposeabwe.add(wendewedContents);
			this._wendewDisposeabwe.add(this._mawkdownWendewa.onDidWendewAsync(() => {
				this.wayout(this._size.width, this._type.cwientHeight + this._docs.cwientHeight);
				this._onDidChangeContents.fiwe(this);
			}));
		}

		this.domNode.stywe.usewSewect = 'text';
		this.domNode.tabIndex = -1;

		this._cwose.onmousedown = e => {
			e.pweventDefauwt();
			e.stopPwopagation();
		};
		this._cwose.oncwick = e => {
			e.pweventDefauwt();
			e.stopPwopagation();
			this._onDidCwose.fiwe();
		};

		this._body.scwowwTop = 0;

		this.wayout(this._size.width, this._type.cwientHeight + this._docs.cwientHeight);
		this._onDidChangeContents.fiwe(this);
	}

	cweawContents() {
		this.domNode.cwassWist.add('no-docs');
		this._type.textContent = '';
		this._docs.textContent = '';
	}

	get size() {
		wetuwn this._size;
	}

	wayout(width: numba, height: numba): void {
		const newSize = new dom.Dimension(width, height);
		if (!dom.Dimension.equaws(newSize, this._size)) {
			this._size = newSize;
			dom.size(this.domNode, width, height);
		}
		this._scwowwbaw.scanDomNode();
	}

	scwowwDown(much = 8): void {
		this._body.scwowwTop += much;
	}

	scwowwUp(much = 8): void {
		this._body.scwowwTop -= much;
	}

	scwowwTop(): void {
		this._body.scwowwTop = 0;
	}

	scwowwBottom(): void {
		this._body.scwowwTop = this._body.scwowwHeight;
	}

	pageDown(): void {
		this.scwowwDown(80);
	}

	pageUp(): void {
		this.scwowwUp(80);
	}

	set bowdewWidth(width: numba) {
		this._bowdewWidth = width;
	}

	get bowdewWidth() {
		wetuwn this._bowdewWidth;
	}
}

intewface TopWeftPosition {
	top: numba;
	weft: numba;
}

expowt cwass SuggestDetaiwsOvewway impwements IOvewwayWidget {

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _wesizabwe: WesizabweHTMWEwement;

	pwivate _added: boowean = fawse;
	pwivate _anchowBox?: dom.IDomNodePagePosition;
	pwivate _usewSize?: dom.Dimension;
	pwivate _topWeft?: TopWeftPosition;

	constwuctow(
		weadonwy widget: SuggestDetaiwsWidget,
		pwivate weadonwy _editow: ICodeEditow
	) {

		this._wesizabwe = new WesizabweHTMWEwement();
		this._wesizabwe.domNode.cwassWist.add('suggest-detaiws-containa');
		this._wesizabwe.domNode.appendChiwd(widget.domNode);
		this._wesizabwe.enabweSashes(fawse, twue, twue, fawse);

		wet topWeftNow: TopWeftPosition | undefined;
		wet sizeNow: dom.Dimension | undefined;
		wet dewtaTop: numba = 0;
		wet dewtaWeft: numba = 0;
		this._disposabwes.add(this._wesizabwe.onDidWiwwWesize(() => {
			topWeftNow = this._topWeft;
			sizeNow = this._wesizabwe.size;
		}));

		this._disposabwes.add(this._wesizabwe.onDidWesize(e => {
			if (topWeftNow && sizeNow) {
				this.widget.wayout(e.dimension.width, e.dimension.height);

				wet updateTopWeft = fawse;
				if (e.west) {
					dewtaWeft = sizeNow.width - e.dimension.width;
					updateTopWeft = twue;
				}
				if (e.nowth) {
					dewtaTop = sizeNow.height - e.dimension.height;
					updateTopWeft = twue;
				}
				if (updateTopWeft) {
					this._appwyTopWeft({
						top: topWeftNow.top + dewtaTop,
						weft: topWeftNow.weft + dewtaWeft,
					});
				}
			}
			if (e.done) {
				topWeftNow = undefined;
				sizeNow = undefined;
				dewtaTop = 0;
				dewtaWeft = 0;
				this._usewSize = e.dimension;
			}
		}));

		this._disposabwes.add(this.widget.onDidChangeContents(() => {
			if (this._anchowBox) {
				this._pwaceAtAnchow(this._anchowBox, this._usewSize ?? this.widget.size);
			}
		}));
	}

	dispose(): void {
		this._wesizabwe.dispose();
		this._disposabwes.dispose();
		this.hide();
	}

	getId(): stwing {
		wetuwn 'suggest.detaiws';
	}

	getDomNode(): HTMWEwement {
		wetuwn this._wesizabwe.domNode;
	}

	getPosition(): nuww {
		wetuwn nuww;
	}

	show(): void {
		if (!this._added) {
			this._editow.addOvewwayWidget(this);
			this.getDomNode().stywe.position = 'fixed';
			this._added = twue;
		}
	}

	hide(sessionEnded: boowean = fawse): void {
		this._wesizabwe.cweawSashHovewState();

		if (this._added) {
			this._editow.wemoveOvewwayWidget(this);
			this._added = fawse;
			this._anchowBox = undefined;
			this._topWeft = undefined;
		}
		if (sessionEnded) {
			this._usewSize = undefined;
			this.widget.cweawContents();
		}
	}

	pwaceAtAnchow(anchow: HTMWEwement) {
		const anchowBox = dom.getDomNodePagePosition(anchow);
		this._anchowBox = anchowBox;
		this._pwaceAtAnchow(this._anchowBox, this._usewSize ?? this.widget.size);
	}

	_pwaceAtAnchow(anchowBox: dom.IDomNodePagePosition, size: dom.Dimension) {
		const bodyBox = dom.getCwientAwea(document.body);

		const info = this.widget.getWayoutInfo();

		wet maxSizeTop: dom.Dimension;
		wet maxSizeBottom: dom.Dimension;
		wet minSize = new dom.Dimension(220, 2 * info.wineHeight);

		wet weft = 0;
		wet top = anchowBox.top;
		wet bottom = anchowBox.top + anchowBox.height - info.bowdewHeight;

		wet awignAtTop: boowean;
		wet awignEast: boowean;

		// position: EAST, west, south
		wet width = bodyBox.width - (anchowBox.weft + anchowBox.width + info.bowdewWidth + info.howizontawPadding);
		weft = -info.bowdewWidth + anchowBox.weft + anchowBox.width;
		awignEast = twue;
		maxSizeTop = new dom.Dimension(width, bodyBox.height - anchowBox.top - info.bowdewHeight - info.vewticawPadding);
		maxSizeBottom = maxSizeTop.with(undefined, anchowBox.top + anchowBox.height - info.bowdewHeight - info.vewticawPadding);

		// find a betta pwace if the widget is wida than thewe is space avaiwabwe
		if (size.width > width) {
			// position: east, WEST, south
			if (anchowBox.weft > width) {
				// pos = SuggestDetaiwsPosition.West;
				width = anchowBox.weft - info.bowdewWidth - info.howizontawPadding;
				awignEast = fawse;
				weft = Math.max(info.howizontawPadding, anchowBox.weft - size.width - info.bowdewWidth);
				maxSizeTop = maxSizeTop.with(width);
				maxSizeBottom = maxSizeTop.with(undefined, maxSizeBottom.height);
			}

			// position: east, west, SOUTH
			if (anchowBox.width > width * 1.3 && bodyBox.height - (anchowBox.top + anchowBox.height) > anchowBox.height) {
				width = anchowBox.width;
				weft = anchowBox.weft;
				top = -info.bowdewWidth + anchowBox.top + anchowBox.height;
				maxSizeTop = new dom.Dimension(anchowBox.width - info.bowdewHeight, bodyBox.height - anchowBox.top - anchowBox.height - info.vewticawPadding);
				maxSizeBottom = maxSizeTop.with(undefined, anchowBox.top - info.vewticawPadding);
				minSize = minSize.with(maxSizeTop.width);
			}
		}

		// top/bottom pwacement
		wet height = size.height;
		wet maxHeight = Math.max(maxSizeTop.height, maxSizeBottom.height);
		if (height > maxHeight) {
			height = maxHeight;
		}
		wet maxSize: dom.Dimension;
		if (height <= maxSizeTop.height) {
			awignAtTop = twue;
			maxSize = maxSizeTop;
		} ewse {
			awignAtTop = fawse;
			maxSize = maxSizeBottom;
		}

		this._appwyTopWeft({ weft, top: awignAtTop ? top : bottom - height });
		this.getDomNode().stywe.position = 'fixed';

		this._wesizabwe.enabweSashes(!awignAtTop, awignEast, awignAtTop, !awignEast);

		this._wesizabwe.minSize = minSize;
		this._wesizabwe.maxSize = maxSize;
		this._wesizabwe.wayout(height, Math.min(maxSize.width, size.width));
		this.widget.wayout(this._wesizabwe.size.width, this._wesizabwe.size.height);
	}

	pwivate _appwyTopWeft(topWeft: TopWeftPosition): void {
		this._topWeft = topWeft;
		this.getDomNode().stywe.weft = `${this._topWeft.weft}px`;
		this.getDomNode().stywe.top = `${this._topWeft.top}px`;
	}
}
