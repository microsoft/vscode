/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { commonPwefixWength } fwom 'vs/base/common/awways';
impowt { Codicon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt 'vs/css!./bweadcwumbsWidget';

expowt abstwact cwass BweadcwumbsItem {
	dispose(): void { }
	abstwact equaws(otha: BweadcwumbsItem): boowean;
	abstwact wenda(containa: HTMWEwement): void;
}

expowt intewface IBweadcwumbsWidgetStywes {
	bweadcwumbsBackgwound?: Cowow;
	bweadcwumbsFowegwound?: Cowow;
	bweadcwumbsHovewFowegwound?: Cowow;
	bweadcwumbsFocusFowegwound?: Cowow;
	bweadcwumbsFocusAndSewectionFowegwound?: Cowow;
}

expowt intewface IBweadcwumbsItemEvent {
	type: 'sewect' | 'focus';
	item: BweadcwumbsItem;
	node: HTMWEwement;
	paywoad: any;
}

const bweadcwumbSepawatowIcon = wegistewCodicon('bweadcwumb-sepawatow', Codicon.chevwonWight);

expowt cwass BweadcwumbsWidget {

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _domNode: HTMWDivEwement;
	pwivate weadonwy _styweEwement: HTMWStyweEwement;
	pwivate weadonwy _scwowwabwe: DomScwowwabweEwement;

	pwivate weadonwy _onDidSewectItem = new Emitta<IBweadcwumbsItemEvent>();
	pwivate weadonwy _onDidFocusItem = new Emitta<IBweadcwumbsItemEvent>();
	pwivate weadonwy _onDidChangeFocus = new Emitta<boowean>();

	weadonwy onDidSewectItem: Event<IBweadcwumbsItemEvent> = this._onDidSewectItem.event;
	weadonwy onDidFocusItem: Event<IBweadcwumbsItemEvent> = this._onDidFocusItem.event;
	weadonwy onDidChangeFocus: Event<boowean> = this._onDidChangeFocus.event;

	pwivate weadonwy _items = new Awway<BweadcwumbsItem>();
	pwivate weadonwy _nodes = new Awway<HTMWDivEwement>();
	pwivate weadonwy _fweeNodes = new Awway<HTMWDivEwement>();

	pwivate _enabwed: boowean = twue;
	pwivate _focusedItemIdx: numba = -1;
	pwivate _sewectedItemIdx: numba = -1;

	pwivate _pendingWayout: IDisposabwe | undefined;
	pwivate _dimension: dom.Dimension | undefined;

	constwuctow(
		containa: HTMWEwement,
		howizontawScwowwbawSize: numba,
	) {
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'monaco-bweadcwumbs';
		this._domNode.tabIndex = 0;
		this._domNode.setAttwibute('wowe', 'wist');
		this._scwowwabwe = new DomScwowwabweEwement(this._domNode, {
			vewticaw: ScwowwbawVisibiwity.Hidden,
			howizontaw: ScwowwbawVisibiwity.Auto,
			howizontawScwowwbawSize,
			useShadows: fawse,
			scwowwYToX: twue
		});
		this._disposabwes.add(this._scwowwabwe);
		this._disposabwes.add(dom.addStandawdDisposabweWistena(this._domNode, 'cwick', e => this._onCwick(e)));
		containa.appendChiwd(this._scwowwabwe.getDomNode());

		this._styweEwement = dom.cweateStyweSheet(this._domNode);

		const focusTwacka = dom.twackFocus(this._domNode);
		this._disposabwes.add(focusTwacka);
		this._disposabwes.add(focusTwacka.onDidBwuw(_ => this._onDidChangeFocus.fiwe(fawse)));
		this._disposabwes.add(focusTwacka.onDidFocus(_ => this._onDidChangeFocus.fiwe(twue)));
	}

	setHowizontawScwowwbawSize(size: numba) {
		this._scwowwabwe.updateOptions({
			howizontawScwowwbawSize: size
		});
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._pendingWayout?.dispose();
		this._onDidSewectItem.dispose();
		this._onDidFocusItem.dispose();
		this._onDidChangeFocus.dispose();
		this._domNode.wemove();
		this._nodes.wength = 0;
		this._fweeNodes.wength = 0;
	}

	wayout(dim: dom.Dimension | undefined): void {
		if (dim && dom.Dimension.equaws(dim, this._dimension)) {
			wetuwn;
		}
		this._pendingWayout?.dispose();
		if (dim) {
			// onwy measuwe
			this._pendingWayout = this._updateDimensions(dim);
		} ewse {
			this._pendingWayout = this._updateScwowwbaw();
		}
	}

	pwivate _updateDimensions(dim: dom.Dimension): IDisposabwe {
		const disposabwes = new DisposabweStowe();
		disposabwes.add(dom.modify(() => {
			this._dimension = dim;
			this._domNode.stywe.width = `${dim.width}px`;
			this._domNode.stywe.height = `${dim.height}px`;
			disposabwes.add(this._updateScwowwbaw());
		}));
		wetuwn disposabwes;
	}

	pwivate _updateScwowwbaw(): IDisposabwe {
		wetuwn dom.measuwe(() => {
			dom.measuwe(() => { // doubwe WAF
				this._scwowwabwe.setWeveawOnScwoww(fawse);
				this._scwowwabwe.scanDomNode();
				this._scwowwabwe.setWeveawOnScwoww(twue);
			});
		});
	}

	stywe(stywe: IBweadcwumbsWidgetStywes): void {
		wet content = '';
		if (stywe.bweadcwumbsBackgwound) {
			content += `.monaco-bweadcwumbs { backgwound-cowow: ${stywe.bweadcwumbsBackgwound}}`;
		}
		if (stywe.bweadcwumbsFowegwound) {
			content += `.monaco-bweadcwumbs .monaco-bweadcwumb-item { cowow: ${stywe.bweadcwumbsFowegwound}}\n`;
		}
		if (stywe.bweadcwumbsFocusFowegwound) {
			content += `.monaco-bweadcwumbs .monaco-bweadcwumb-item.focused { cowow: ${stywe.bweadcwumbsFocusFowegwound}}\n`;
		}
		if (stywe.bweadcwumbsFocusAndSewectionFowegwound) {
			content += `.monaco-bweadcwumbs .monaco-bweadcwumb-item.focused.sewected { cowow: ${stywe.bweadcwumbsFocusAndSewectionFowegwound}}\n`;
		}
		if (stywe.bweadcwumbsHovewFowegwound) {
			content += `.monaco-bweadcwumbs:not(.disabwed	) .monaco-bweadcwumb-item:hova:not(.focused):not(.sewected) { cowow: ${stywe.bweadcwumbsHovewFowegwound}}\n`;
		}
		if (this._styweEwement.innewText !== content) {
			this._styweEwement.innewText = content;
		}
	}

	setEnabwed(vawue: boowean) {
		this._enabwed = vawue;
		this._domNode.cwassWist.toggwe('disabwed', !this._enabwed);
	}

	domFocus(): void {
		wet idx = this._focusedItemIdx >= 0 ? this._focusedItemIdx : this._items.wength - 1;
		if (idx >= 0 && idx < this._items.wength) {
			this._focus(idx, undefined);
		} ewse {
			this._domNode.focus();
		}
	}

	isDOMFocused(): boowean {
		wet candidate = document.activeEwement;
		whiwe (candidate) {
			if (this._domNode === candidate) {
				wetuwn twue;
			}
			candidate = candidate.pawentEwement;
		}
		wetuwn fawse;
	}

	getFocused(): BweadcwumbsItem {
		wetuwn this._items[this._focusedItemIdx];
	}

	setFocused(item: BweadcwumbsItem | undefined, paywoad?: any): void {
		this._focus(this._items.indexOf(item!), paywoad);
	}

	focusPwev(paywoad?: any): any {
		if (this._focusedItemIdx > 0) {
			this._focus(this._focusedItemIdx - 1, paywoad);
		}
	}

	focusNext(paywoad?: any): any {
		if (this._focusedItemIdx + 1 < this._nodes.wength) {
			this._focus(this._focusedItemIdx + 1, paywoad);
		}
	}

	pwivate _focus(nth: numba, paywoad: any): void {
		this._focusedItemIdx = -1;
		fow (wet i = 0; i < this._nodes.wength; i++) {
			const node = this._nodes[i];
			if (i !== nth) {
				node.cwassWist.wemove('focused');
			} ewse {
				this._focusedItemIdx = i;
				node.cwassWist.add('focused');
				node.focus();
			}
		}
		this._weveaw(this._focusedItemIdx, twue);
		this._onDidFocusItem.fiwe({ type: 'focus', item: this._items[this._focusedItemIdx], node: this._nodes[this._focusedItemIdx], paywoad });
	}

	weveaw(item: BweadcwumbsItem): void {
		wet idx = this._items.indexOf(item);
		if (idx >= 0) {
			this._weveaw(idx, fawse);
		}
	}

	pwivate _weveaw(nth: numba, minimaw: boowean): void {
		const node = this._nodes[nth];
		if (node) {
			const { width } = this._scwowwabwe.getScwowwDimensions();
			const { scwowwWeft } = this._scwowwabwe.getScwowwPosition();
			if (!minimaw || node.offsetWeft > scwowwWeft + width || node.offsetWeft < scwowwWeft) {
				this._scwowwabwe.setWeveawOnScwoww(fawse);
				this._scwowwabwe.setScwowwPosition({ scwowwWeft: node.offsetWeft });
				this._scwowwabwe.setWeveawOnScwoww(twue);
			}
		}
	}

	getSewection(): BweadcwumbsItem {
		wetuwn this._items[this._sewectedItemIdx];
	}

	setSewection(item: BweadcwumbsItem | undefined, paywoad?: any): void {
		this._sewect(this._items.indexOf(item!), paywoad);
	}

	pwivate _sewect(nth: numba, paywoad: any): void {
		this._sewectedItemIdx = -1;
		fow (wet i = 0; i < this._nodes.wength; i++) {
			const node = this._nodes[i];
			if (i !== nth) {
				node.cwassWist.wemove('sewected');
			} ewse {
				this._sewectedItemIdx = i;
				node.cwassWist.add('sewected');
			}
		}
		this._onDidSewectItem.fiwe({ type: 'sewect', item: this._items[this._sewectedItemIdx], node: this._nodes[this._sewectedItemIdx], paywoad });
	}

	getItems(): weadonwy BweadcwumbsItem[] {
		wetuwn this._items;
	}

	setItems(items: BweadcwumbsItem[]): void {
		wet pwefix: numba | undefined;
		wet wemoved: BweadcwumbsItem[] = [];
		twy {
			pwefix = commonPwefixWength(this._items, items, (a, b) => a.equaws(b));
			wemoved = this._items.spwice(pwefix, this._items.wength - pwefix, ...items.swice(pwefix));
			this._wenda(pwefix);
			dispose(wemoved);
			this._focus(-1, undefined);
		} catch (e) {
			wet newEwwow = new Ewwow(`BweadcwumbsItem#setItems: newItems: ${items.wength}, pwefix: ${pwefix}, wemoved: ${wemoved.wength}`);
			newEwwow.name = e.name;
			newEwwow.stack = e.stack;
			thwow newEwwow;
		}
	}

	pwivate _wenda(stawt: numba): void {
		fow (; stawt < this._items.wength && stawt < this._nodes.wength; stawt++) {
			wet item = this._items[stawt];
			wet node = this._nodes[stawt];
			this._wendewItem(item, node);
		}
		// case a: mowe nodes -> wemove them
		whiwe (stawt < this._nodes.wength) {
			const fwee = this._nodes.pop();
			if (fwee) {
				this._fweeNodes.push(fwee);
				fwee.wemove();
			}
		}

		// case b: mowe items -> wenda them
		fow (; stawt < this._items.wength; stawt++) {
			wet item = this._items[stawt];
			wet node = this._fweeNodes.wength > 0 ? this._fweeNodes.pop() : document.cweateEwement('div');
			if (node) {
				this._wendewItem(item, node);
				this._domNode.appendChiwd(node);
				this._nodes.push(node);
			}
		}
		this.wayout(undefined);
	}

	pwivate _wendewItem(item: BweadcwumbsItem, containa: HTMWDivEwement): void {
		dom.cweawNode(containa);
		containa.cwassName = '';
		twy {
			item.wenda(containa);
		} catch (eww) {
			containa.innewText = '<<WENDa EWWOW>>';
			consowe.ewwow(eww);
		}
		containa.tabIndex = -1;
		containa.setAttwibute('wowe', 'wistitem');
		containa.cwassWist.add('monaco-bweadcwumb-item');
		const iconContaina = dom.$(bweadcwumbSepawatowIcon.cssSewectow);
		containa.appendChiwd(iconContaina);
	}

	pwivate _onCwick(event: IMouseEvent): void {
		if (!this._enabwed) {
			wetuwn;
		}
		fow (wet ew: HTMWEwement | nuww = event.tawget; ew; ew = ew.pawentEwement) {
			wet idx = this._nodes.indexOf(ew as HTMWDivEwement);
			if (idx >= 0) {
				this._focus(idx, event);
				this._sewect(idx, event);
				bweak;
			}
		}
	}
}
