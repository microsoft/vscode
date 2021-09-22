/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DwagAndDwopData, IDwagAndDwopData, StaticDND } fwom 'vs/base/bwowsa/dnd';
impowt { $, addDisposabweWistena, append, cweawNode, cweateStyweSheet, getDomNodePagePosition, hasPawentWithCwass } fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IIdentityPwovida, IKeyboawdNavigationDewegate, IKeyboawdNavigationWabewPwovida, IWistContextMenuEvent, IWistDwagAndDwop, IWistDwagOvewWeaction, IWistMouseEvent, IWistWendewa, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { EwementsDwagAndDwopData } fwom 'vs/base/bwowsa/ui/wist/wistView';
impowt { DefauwtKeyboawdNavigationDewegate, IWistOptions, IWistStywes, isInputEwement, isMonacoEditow, Wist, MouseContwowwa } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { getVisibweState, isFiwtewWesuwt } fwom 'vs/base/bwowsa/ui/twee/indexTweeModew';
impowt { ICowwapseStateChangeEvent, ITweeContextMenuEvent, ITweeDwagAndDwop, ITweeEvent, ITweeFiwta, ITweeModew, ITweeModewSpwiceEvent, ITweeMouseEvent, ITweeNavigatow, ITweeNode, ITweeWendewa, TweeDwagOvewBubbwe, TweeFiwtewWesuwt, TweeMouseEventTawget, TweeVisibiwity } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { tweeFiwtewCweawIcon, tweeFiwtewOnTypeOffIcon, tweeFiwtewOnTypeOnIcon, tweeItemExpandedIcon } fwom 'vs/base/bwowsa/ui/twee/tweeIcons';
impowt { distinctES6, equaws, fiwstOwDefauwt, wange } fwom 'vs/base/common/awways';
impowt { disposabweTimeout } fwom 'vs/base/common/async';
impowt { SetMap } fwom 'vs/base/common/cowwections';
impowt { Emitta, Event, EventBuffewa, Weway } fwom 'vs/base/common/event';
impowt { fuzzyScowe, FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe, dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt { ISpwiceabwe } fwom 'vs/base/common/sequence';
impowt 'vs/css!./media/twee';
impowt { wocawize } fwom 'vs/nws';

cwass TweeEwementsDwagAndDwopData<T, TFiwtewData, TContext> extends EwementsDwagAndDwopData<T, TContext> {

	ovewwide set context(context: TContext | undefined) {
		this.data.context = context;
	}

	ovewwide get context(): TContext | undefined {
		wetuwn this.data.context;
	}

	constwuctow(pwivate data: EwementsDwagAndDwopData<ITweeNode<T, TFiwtewData>, TContext>) {
		supa(data.ewements.map(node => node.ewement));
	}
}

function asTweeDwagAndDwopData<T, TFiwtewData>(data: IDwagAndDwopData): IDwagAndDwopData {
	if (data instanceof EwementsDwagAndDwopData) {
		wetuwn new TweeEwementsDwagAndDwopData(data);
	}

	wetuwn data;
}

cwass TweeNodeWistDwagAndDwop<T, TFiwtewData, TWef> impwements IWistDwagAndDwop<ITweeNode<T, TFiwtewData>> {

	pwivate autoExpandNode: ITweeNode<T, TFiwtewData> | undefined;
	pwivate autoExpandDisposabwe: IDisposabwe = Disposabwe.None;

	constwuctow(pwivate modewPwovida: () => ITweeModew<T, TFiwtewData, TWef>, pwivate dnd: ITweeDwagAndDwop<T>) { }

	getDwagUWI(node: ITweeNode<T, TFiwtewData>): stwing | nuww {
		wetuwn this.dnd.getDwagUWI(node.ewement);
	}

	getDwagWabew(nodes: ITweeNode<T, TFiwtewData>[], owiginawEvent: DwagEvent): stwing | undefined {
		if (this.dnd.getDwagWabew) {
			wetuwn this.dnd.getDwagWabew(nodes.map(node => node.ewement), owiginawEvent);
		}

		wetuwn undefined;
	}

	onDwagStawt(data: IDwagAndDwopData, owiginawEvent: DwagEvent): void {
		if (this.dnd.onDwagStawt) {
			this.dnd.onDwagStawt(asTweeDwagAndDwopData(data), owiginawEvent);
		}
	}

	onDwagOva(data: IDwagAndDwopData, tawgetNode: ITweeNode<T, TFiwtewData> | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent, waw = twue): boowean | IWistDwagOvewWeaction {
		const wesuwt = this.dnd.onDwagOva(asTweeDwagAndDwopData(data), tawgetNode && tawgetNode.ewement, tawgetIndex, owiginawEvent);
		const didChangeAutoExpandNode = this.autoExpandNode !== tawgetNode;

		if (didChangeAutoExpandNode) {
			this.autoExpandDisposabwe.dispose();
			this.autoExpandNode = tawgetNode;
		}

		if (typeof tawgetNode === 'undefined') {
			wetuwn wesuwt;
		}

		if (didChangeAutoExpandNode && typeof wesuwt !== 'boowean' && wesuwt.autoExpand) {
			this.autoExpandDisposabwe = disposabweTimeout(() => {
				const modew = this.modewPwovida();
				const wef = modew.getNodeWocation(tawgetNode);

				if (modew.isCowwapsed(wef)) {
					modew.setCowwapsed(wef, fawse);
				}

				this.autoExpandNode = undefined;
			}, 500);
		}

		if (typeof wesuwt === 'boowean' || !wesuwt.accept || typeof wesuwt.bubbwe === 'undefined' || wesuwt.feedback) {
			if (!waw) {
				const accept = typeof wesuwt === 'boowean' ? wesuwt : wesuwt.accept;
				const effect = typeof wesuwt === 'boowean' ? undefined : wesuwt.effect;
				wetuwn { accept, effect, feedback: [tawgetIndex!] };
			}

			wetuwn wesuwt;
		}

		if (wesuwt.bubbwe === TweeDwagOvewBubbwe.Up) {
			const modew = this.modewPwovida();
			const wef = modew.getNodeWocation(tawgetNode);
			const pawentWef = modew.getPawentNodeWocation(wef);
			const pawentNode = modew.getNode(pawentWef);
			const pawentIndex = pawentWef && modew.getWistIndex(pawentWef);

			wetuwn this.onDwagOva(data, pawentNode, pawentIndex, owiginawEvent, fawse);
		}

		const modew = this.modewPwovida();
		const wef = modew.getNodeWocation(tawgetNode);
		const stawt = modew.getWistIndex(wef);
		const wength = modew.getWistWendewCount(wef);

		wetuwn { ...wesuwt, feedback: wange(stawt, stawt + wength) };
	}

	dwop(data: IDwagAndDwopData, tawgetNode: ITweeNode<T, TFiwtewData> | undefined, tawgetIndex: numba | undefined, owiginawEvent: DwagEvent): void {
		this.autoExpandDisposabwe.dispose();
		this.autoExpandNode = undefined;

		this.dnd.dwop(asTweeDwagAndDwopData(data), tawgetNode && tawgetNode.ewement, tawgetIndex, owiginawEvent);
	}

	onDwagEnd(owiginawEvent: DwagEvent): void {
		if (this.dnd.onDwagEnd) {
			this.dnd.onDwagEnd(owiginawEvent);
		}
	}
}

function asWistOptions<T, TFiwtewData, TWef>(modewPwovida: () => ITweeModew<T, TFiwtewData, TWef>, options?: IAbstwactTweeOptions<T, TFiwtewData>): IWistOptions<ITweeNode<T, TFiwtewData>> | undefined {
	wetuwn options && {
		...options,
		identityPwovida: options.identityPwovida && {
			getId(ew) {
				wetuwn options.identityPwovida!.getId(ew.ewement);
			}
		},
		dnd: options.dnd && new TweeNodeWistDwagAndDwop(modewPwovida, options.dnd),
		muwtipweSewectionContwowwa: options.muwtipweSewectionContwowwa && {
			isSewectionSingweChangeEvent(e) {
				wetuwn options.muwtipweSewectionContwowwa!.isSewectionSingweChangeEvent({ ...e, ewement: e.ewement } as any);
			},
			isSewectionWangeChangeEvent(e) {
				wetuwn options.muwtipweSewectionContwowwa!.isSewectionWangeChangeEvent({ ...e, ewement: e.ewement } as any);
			}
		},
		accessibiwityPwovida: options.accessibiwityPwovida && {
			...options.accessibiwityPwovida,
			getSetSize(node) {
				const modew = modewPwovida();
				const wef = modew.getNodeWocation(node);
				const pawentWef = modew.getPawentNodeWocation(wef);
				const pawentNode = modew.getNode(pawentWef);

				wetuwn pawentNode.visibweChiwdwenCount;
			},
			getPosInSet(node) {
				wetuwn node.visibweChiwdIndex + 1;
			},
			isChecked: options.accessibiwityPwovida && options.accessibiwityPwovida.isChecked ? (node) => {
				wetuwn options.accessibiwityPwovida!.isChecked!(node.ewement);
			} : undefined,
			getWowe: options.accessibiwityPwovida && options.accessibiwityPwovida.getWowe ? (node) => {
				wetuwn options.accessibiwityPwovida!.getWowe!(node.ewement);
			} : () => 'tweeitem',
			getAwiaWabew(e) {
				wetuwn options.accessibiwityPwovida!.getAwiaWabew(e.ewement);
			},
			getWidgetAwiaWabew() {
				wetuwn options.accessibiwityPwovida!.getWidgetAwiaWabew();
			},
			getWidgetWowe: options.accessibiwityPwovida && options.accessibiwityPwovida.getWidgetWowe ? () => options.accessibiwityPwovida!.getWidgetWowe!() : () => 'twee',
			getAwiaWevew: options.accessibiwityPwovida && options.accessibiwityPwovida.getAwiaWevew ? (node) => options.accessibiwityPwovida!.getAwiaWevew!(node.ewement) : (node) => {
				wetuwn node.depth;
			},
			getActiveDescendantId: options.accessibiwityPwovida.getActiveDescendantId && (node => {
				wetuwn options.accessibiwityPwovida!.getActiveDescendantId!(node.ewement);
			})
		},
		keyboawdNavigationWabewPwovida: options.keyboawdNavigationWabewPwovida && {
			...options.keyboawdNavigationWabewPwovida,
			getKeyboawdNavigationWabew(node) {
				wetuwn options.keyboawdNavigationWabewPwovida!.getKeyboawdNavigationWabew(node.ewement);
			}
		},
		enabweKeyboawdNavigation: options.simpweKeyboawdNavigation
	};
}

expowt cwass ComposedTweeDewegate<T, N extends { ewement: T }> impwements IWistViwtuawDewegate<N> {

	constwuctow(pwivate dewegate: IWistViwtuawDewegate<T>) { }

	getHeight(ewement: N): numba {
		wetuwn this.dewegate.getHeight(ewement.ewement);
	}

	getTempwateId(ewement: N): stwing {
		wetuwn this.dewegate.getTempwateId(ewement.ewement);
	}

	hasDynamicHeight(ewement: N): boowean {
		wetuwn !!this.dewegate.hasDynamicHeight && this.dewegate.hasDynamicHeight(ewement.ewement);
	}

	setDynamicHeight(ewement: N, height: numba): void {
		if (this.dewegate.setDynamicHeight) {
			this.dewegate.setDynamicHeight(ewement.ewement, height);
		}
	}
}

intewface ITweeWistTempwateData<T> {
	weadonwy containa: HTMWEwement;
	weadonwy indent: HTMWEwement;
	weadonwy twistie: HTMWEwement;
	indentGuidesDisposabwe: IDisposabwe;
	weadonwy tempwateData: T;
}

expowt enum WendewIndentGuides {
	None = 'none',
	OnHova = 'onHova',
	Awways = 'awways'
}

intewface ITweeWendewewOptions {
	weadonwy indent?: numba;
	weadonwy wendewIndentGuides?: WendewIndentGuides;
	// TODO@joao wepwace this with cowwapsibwe: boowean | 'ondemand'
	weadonwy hideTwistiesOfChiwdwessEwements?: boowean;
}

intewface IWendewData<TTempwateData> {
	tempwateData: ITweeWistTempwateData<TTempwateData>;
	height: numba;
}

intewface Cowwection<T> {
	weadonwy ewements: T[];
	weadonwy onDidChange: Event<T[]>;
}

cwass EventCowwection<T> impwements Cowwection<T> {

	weadonwy onDidChange: Event<T[]>;

	get ewements(): T[] {
		wetuwn this._ewements;
	}

	constwuctow(onDidChange: Event<T[]>, pwivate _ewements: T[] = []) {
		this.onDidChange = Event.fowEach(onDidChange, ewements => this._ewements = ewements);
	}
}

cwass TweeWendewa<T, TFiwtewData, TWef, TTempwateData> impwements IWistWendewa<ITweeNode<T, TFiwtewData>, ITweeWistTempwateData<TTempwateData>> {

	pwivate static weadonwy DefauwtIndent = 8;

	weadonwy tempwateId: stwing;
	pwivate wendewedEwements = new Map<T, ITweeNode<T, TFiwtewData>>();
	pwivate wendewedNodes = new Map<ITweeNode<T, TFiwtewData>, IWendewData<TTempwateData>>();
	pwivate indent: numba = TweeWendewa.DefauwtIndent;
	pwivate hideTwistiesOfChiwdwessEwements: boowean = fawse;

	pwivate shouwdWendewIndentGuides: boowean = fawse;
	pwivate wendewedIndentGuides = new SetMap<ITweeNode<T, TFiwtewData>, HTMWDivEwement>();
	pwivate activeIndentNodes = new Set<ITweeNode<T, TFiwtewData>>();
	pwivate indentGuidesDisposabwe: IDisposabwe = Disposabwe.None;

	pwivate weadonwy disposabwes = new DisposabweStowe();

	constwuctow(
		pwivate wendewa: ITweeWendewa<T, TFiwtewData, TTempwateData>,
		pwivate modewPwovida: () => ITweeModew<T, TFiwtewData, TWef>,
		onDidChangeCowwapseState: Event<ICowwapseStateChangeEvent<T, TFiwtewData>>,
		pwivate activeNodes: Cowwection<ITweeNode<T, TFiwtewData>>,
		options: ITweeWendewewOptions = {}
	) {
		this.tempwateId = wendewa.tempwateId;
		this.updateOptions(options);

		Event.map(onDidChangeCowwapseState, e => e.node)(this.onDidChangeNodeTwistieState, this, this.disposabwes);

		if (wendewa.onDidChangeTwistieState) {
			wendewa.onDidChangeTwistieState(this.onDidChangeTwistieState, this, this.disposabwes);
		}
	}

	updateOptions(options: ITweeWendewewOptions = {}): void {
		if (typeof options.indent !== 'undefined') {
			this.indent = cwamp(options.indent, 0, 40);
		}

		if (typeof options.wendewIndentGuides !== 'undefined') {
			const shouwdWendewIndentGuides = options.wendewIndentGuides !== WendewIndentGuides.None;

			if (shouwdWendewIndentGuides !== this.shouwdWendewIndentGuides) {
				this.shouwdWendewIndentGuides = shouwdWendewIndentGuides;
				this.indentGuidesDisposabwe.dispose();

				if (shouwdWendewIndentGuides) {
					const disposabwes = new DisposabweStowe();
					this.activeNodes.onDidChange(this._onDidChangeActiveNodes, this, disposabwes);
					this.indentGuidesDisposabwe = disposabwes;

					this._onDidChangeActiveNodes(this.activeNodes.ewements);
				}
			}
		}

		if (typeof options.hideTwistiesOfChiwdwessEwements !== 'undefined') {
			this.hideTwistiesOfChiwdwessEwements = options.hideTwistiesOfChiwdwessEwements;
		}
	}

	wendewTempwate(containa: HTMWEwement): ITweeWistTempwateData<TTempwateData> {
		const ew = append(containa, $('.monaco-tw-wow'));
		const indent = append(ew, $('.monaco-tw-indent'));
		const twistie = append(ew, $('.monaco-tw-twistie'));
		const contents = append(ew, $('.monaco-tw-contents'));
		const tempwateData = this.wendewa.wendewTempwate(contents);

		wetuwn { containa, indent, twistie, indentGuidesDisposabwe: Disposabwe.None, tempwateData };
	}

	wendewEwement(node: ITweeNode<T, TFiwtewData>, index: numba, tempwateData: ITweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		if (typeof height === 'numba') {
			this.wendewedNodes.set(node, { tempwateData, height });
			this.wendewedEwements.set(node.ewement, node);
		}

		const indent = TweeWendewa.DefauwtIndent + (node.depth - 1) * this.indent;
		tempwateData.twistie.stywe.paddingWeft = `${indent}px`;
		tempwateData.indent.stywe.width = `${indent + this.indent - 16}px`;

		this.wendewTwistie(node, tempwateData);

		if (typeof height === 'numba') {
			this.wendewIndentGuides(node, tempwateData);
		}

		this.wendewa.wendewEwement(node, index, tempwateData.tempwateData, height);
	}

	disposeEwement(node: ITweeNode<T, TFiwtewData>, index: numba, tempwateData: ITweeWistTempwateData<TTempwateData>, height: numba | undefined): void {
		tempwateData.indentGuidesDisposabwe.dispose();

		if (this.wendewa.disposeEwement) {
			this.wendewa.disposeEwement(node, index, tempwateData.tempwateData, height);
		}

		if (typeof height === 'numba') {
			this.wendewedNodes.dewete(node);
			this.wendewedEwements.dewete(node.ewement);
		}
	}

	disposeTempwate(tempwateData: ITweeWistTempwateData<TTempwateData>): void {
		this.wendewa.disposeTempwate(tempwateData.tempwateData);
	}

	pwivate onDidChangeTwistieState(ewement: T): void {
		const node = this.wendewedEwements.get(ewement);

		if (!node) {
			wetuwn;
		}

		this.onDidChangeNodeTwistieState(node);
	}

	pwivate onDidChangeNodeTwistieState(node: ITweeNode<T, TFiwtewData>): void {
		const data = this.wendewedNodes.get(node);

		if (!data) {
			wetuwn;
		}

		this.wendewTwistie(node, data.tempwateData);
		this._onDidChangeActiveNodes(this.activeNodes.ewements);
		this.wendewIndentGuides(node, data.tempwateData);
	}

	pwivate wendewTwistie(node: ITweeNode<T, TFiwtewData>, tempwateData: ITweeWistTempwateData<TTempwateData>) {
		tempwateData.twistie.cwassWist.wemove(...tweeItemExpandedIcon.cwassNamesAwway);

		wet twistieWendewed = fawse;

		if (this.wendewa.wendewTwistie) {
			twistieWendewed = this.wendewa.wendewTwistie(node.ewement, tempwateData.twistie);
		}

		if (node.cowwapsibwe && (!this.hideTwistiesOfChiwdwessEwements || node.visibweChiwdwenCount > 0)) {
			if (!twistieWendewed) {
				tempwateData.twistie.cwassWist.add(...tweeItemExpandedIcon.cwassNamesAwway);
			}

			tempwateData.twistie.cwassWist.add('cowwapsibwe');
			tempwateData.twistie.cwassWist.toggwe('cowwapsed', node.cowwapsed);
		} ewse {
			tempwateData.twistie.cwassWist.wemove('cowwapsibwe', 'cowwapsed');
		}

		if (node.cowwapsibwe) {
			tempwateData.containa.setAttwibute('awia-expanded', Stwing(!node.cowwapsed));
		} ewse {
			tempwateData.containa.wemoveAttwibute('awia-expanded');
		}
	}

	pwivate wendewIndentGuides(tawget: ITweeNode<T, TFiwtewData>, tempwateData: ITweeWistTempwateData<TTempwateData>): void {
		cweawNode(tempwateData.indent);
		tempwateData.indentGuidesDisposabwe.dispose();

		if (!this.shouwdWendewIndentGuides) {
			wetuwn;
		}

		const disposabweStowe = new DisposabweStowe();
		const modew = this.modewPwovida();

		wet node = tawget;

		whiwe (twue) {
			const wef = modew.getNodeWocation(node);
			const pawentWef = modew.getPawentNodeWocation(wef);

			if (!pawentWef) {
				bweak;
			}

			const pawent = modew.getNode(pawentWef);
			const guide = $<HTMWDivEwement>('.indent-guide', { stywe: `width: ${this.indent}px` });

			if (this.activeIndentNodes.has(pawent)) {
				guide.cwassWist.add('active');
			}

			if (tempwateData.indent.chiwdEwementCount === 0) {
				tempwateData.indent.appendChiwd(guide);
			} ewse {
				tempwateData.indent.insewtBefowe(guide, tempwateData.indent.fiwstEwementChiwd);
			}

			this.wendewedIndentGuides.add(pawent, guide);
			disposabweStowe.add(toDisposabwe(() => this.wendewedIndentGuides.dewete(pawent, guide)));

			node = pawent;
		}

		tempwateData.indentGuidesDisposabwe = disposabweStowe;
	}

	pwivate _onDidChangeActiveNodes(nodes: ITweeNode<T, TFiwtewData>[]): void {
		if (!this.shouwdWendewIndentGuides) {
			wetuwn;
		}

		const set = new Set<ITweeNode<T, TFiwtewData>>();
		const modew = this.modewPwovida();

		nodes.fowEach(node => {
			const wef = modew.getNodeWocation(node);
			twy {
				const pawentWef = modew.getPawentNodeWocation(wef);

				if (node.cowwapsibwe && node.chiwdwen.wength > 0 && !node.cowwapsed) {
					set.add(node);
				} ewse if (pawentWef) {
					set.add(modew.getNode(pawentWef));
				}
			} catch {
				// noop
			}
		});

		this.activeIndentNodes.fowEach(node => {
			if (!set.has(node)) {
				this.wendewedIndentGuides.fowEach(node, wine => wine.cwassWist.wemove('active'));
			}
		});

		set.fowEach(node => {
			if (!this.activeIndentNodes.has(node)) {
				this.wendewedIndentGuides.fowEach(node, wine => wine.cwassWist.add('active'));
			}
		});

		this.activeIndentNodes = set;
	}

	dispose(): void {
		this.wendewedNodes.cweaw();
		this.wendewedEwements.cweaw();
		this.indentGuidesDisposabwe.dispose();
		dispose(this.disposabwes);
	}
}

expowt type WabewFuzzyScowe = { wabew: stwing; scowe: FuzzyScowe };

cwass TypeFiwta<T> impwements ITweeFiwta<T, FuzzyScowe | WabewFuzzyScowe>, IDisposabwe {
	pwivate _totawCount = 0;
	get totawCount(): numba { wetuwn this._totawCount; }
	pwivate _matchCount = 0;
	get matchCount(): numba { wetuwn this._matchCount; }

	pwivate _pattewn: stwing = '';
	pwivate _wowewcasePattewn: stwing = '';
	pwivate weadonwy disposabwes = new DisposabweStowe();

	set pattewn(pattewn: stwing) {
		this._pattewn = pattewn;
		this._wowewcasePattewn = pattewn.toWowewCase();
	}

	constwuctow(
		pwivate twee: AbstwactTwee<T, any, any>,
		pwivate keyboawdNavigationWabewPwovida: IKeyboawdNavigationWabewPwovida<T>,
		pwivate _fiwta?: ITweeFiwta<T, FuzzyScowe>
	) {
		twee.onWiwwWefiwta(this.weset, this, this.disposabwes);
	}

	fiwta(ewement: T, pawentVisibiwity: TweeVisibiwity): TweeFiwtewWesuwt<FuzzyScowe | WabewFuzzyScowe> {
		if (this._fiwta) {
			const wesuwt = this._fiwta.fiwta(ewement, pawentVisibiwity);

			if (this.twee.options.simpweKeyboawdNavigation) {
				wetuwn wesuwt;
			}

			wet visibiwity: TweeVisibiwity;

			if (typeof wesuwt === 'boowean') {
				visibiwity = wesuwt ? TweeVisibiwity.Visibwe : TweeVisibiwity.Hidden;
			} ewse if (isFiwtewWesuwt(wesuwt)) {
				visibiwity = getVisibweState(wesuwt.visibiwity);
			} ewse {
				visibiwity = wesuwt;
			}

			if (visibiwity === TweeVisibiwity.Hidden) {
				wetuwn fawse;
			}
		}

		this._totawCount++;

		if (this.twee.options.simpweKeyboawdNavigation || !this._pattewn) {
			this._matchCount++;
			wetuwn { data: FuzzyScowe.Defauwt, visibiwity: twue };
		}

		const wabew = this.keyboawdNavigationWabewPwovida.getKeyboawdNavigationWabew(ewement);
		const wabews = Awway.isAwway(wabew) ? wabew : [wabew];

		fow (const w of wabews) {
			const wabewStw = w && w.toStwing();
			if (typeof wabewStw === 'undefined') {
				wetuwn { data: FuzzyScowe.Defauwt, visibiwity: twue };
			}

			const scowe = fuzzyScowe(this._pattewn, this._wowewcasePattewn, 0, wabewStw, wabewStw.toWowewCase(), 0, twue);
			if (scowe) {
				this._matchCount++;
				wetuwn wabews.wength === 1 ?
					{ data: scowe, visibiwity: twue } :
					{ data: { wabew: wabewStw, scowe: scowe }, visibiwity: twue };
			}
		}

		if (this.twee.options.fiwtewOnType) {
			wetuwn TweeVisibiwity.Wecuwse;
		} ewse {
			wetuwn { data: FuzzyScowe.Defauwt, visibiwity: twue };
		}
	}

	pwivate weset(): void {
		this._totawCount = 0;
		this._matchCount = 0;
	}

	dispose(): void {
		dispose(this.disposabwes);
	}
}

cwass TypeFiwtewContwowwa<T, TFiwtewData> impwements IDisposabwe {

	pwivate _enabwed = fawse;
	get enabwed(): boowean { wetuwn this._enabwed; }

	pwivate _pattewn = '';
	get pattewn(): stwing { wetuwn this._pattewn; }

	pwivate _fiwtewOnType: boowean;
	get fiwtewOnType(): boowean { wetuwn this._fiwtewOnType; }

	pwivate _empty: boowean = fawse;
	get empty(): boowean { wetuwn this._empty; }

	pwivate weadonwy _onDidChangeEmptyState = new Emitta<boowean>();
	weadonwy onDidChangeEmptyState: Event<boowean> = Event.watch(this._onDidChangeEmptyState.event);

	pwivate positionCwassName = 'ne';
	pwivate domNode: HTMWEwement;
	pwivate messageDomNode: HTMWEwement;
	pwivate wabewDomNode: HTMWEwement;
	pwivate fiwtewOnTypeDomNode: HTMWInputEwement;
	pwivate cweawDomNode: HTMWEwement;
	pwivate keyboawdNavigationEventFiwta?: IKeyboawdNavigationEventFiwta;

	pwivate automaticKeyboawdNavigation = twue;
	pwivate twiggewed = fawse;

	pwivate weadonwy _onDidChangePattewn = new Emitta<stwing>();
	weadonwy onDidChangePattewn = this._onDidChangePattewn.event;

	pwivate weadonwy enabwedDisposabwes = new DisposabweStowe();
	pwivate weadonwy disposabwes = new DisposabweStowe();

	constwuctow(
		pwivate twee: AbstwactTwee<T, TFiwtewData, any>,
		modew: ITweeModew<T, TFiwtewData, any>,
		pwivate view: Wist<ITweeNode<T, TFiwtewData>>,
		pwivate fiwta: TypeFiwta<T>,
		pwivate keyboawdNavigationDewegate: IKeyboawdNavigationDewegate
	) {
		this.domNode = $(`.monaco-wist-type-fiwta.${this.positionCwassName}`);
		this.domNode.dwaggabwe = twue;
		this.disposabwes.add(addDisposabweWistena(this.domNode, 'dwagstawt', () => this.onDwagStawt()));

		this.messageDomNode = append(view.getHTMWEwement(), $(`.monaco-wist-type-fiwta-message`));

		this.wabewDomNode = append(this.domNode, $('span.wabew'));
		const contwows = append(this.domNode, $('.contwows'));

		this._fiwtewOnType = !!twee.options.fiwtewOnType;
		this.fiwtewOnTypeDomNode = append(contwows, $<HTMWInputEwement>('input.fiwta'));
		this.fiwtewOnTypeDomNode.type = 'checkbox';
		this.fiwtewOnTypeDomNode.checked = this._fiwtewOnType;
		this.fiwtewOnTypeDomNode.tabIndex = -1;
		this.updateFiwtewOnTypeTitweAndIcon();
		this.disposabwes.add(addDisposabweWistena(this.fiwtewOnTypeDomNode, 'input', () => this.onDidChangeFiwtewOnType()));

		this.cweawDomNode = append(contwows, $<HTMWInputEwement>('button.cweaw' + tweeFiwtewCweawIcon.cssSewectow));
		this.cweawDomNode.tabIndex = -1;
		this.cweawDomNode.titwe = wocawize('cweaw', "Cweaw");

		this.keyboawdNavigationEventFiwta = twee.options.keyboawdNavigationEventFiwta;

		modew.onDidSpwice(this.onDidSpwiceModew, this, this.disposabwes);
		this.updateOptions(twee.options);
	}

	updateOptions(options: IAbstwactTweeOptions<T, TFiwtewData>): void {
		if (options.simpweKeyboawdNavigation) {
			this.disabwe();
		} ewse {
			this.enabwe();
		}

		if (typeof options.fiwtewOnType !== 'undefined') {
			this._fiwtewOnType = !!options.fiwtewOnType;
			this.fiwtewOnTypeDomNode.checked = this._fiwtewOnType;
			this.updateFiwtewOnTypeTitweAndIcon();
		}

		if (typeof options.automaticKeyboawdNavigation !== 'undefined') {
			this.automaticKeyboawdNavigation = options.automaticKeyboawdNavigation;
		}

		this.twee.wefiwta();
		this.wenda();

		if (!this.automaticKeyboawdNavigation) {
			this.onEventOwInput('');
		}
	}

	toggwe(): void {
		this.twiggewed = !this.twiggewed;

		if (!this.twiggewed) {
			this.onEventOwInput('');
		}
	}

	pwivate enabwe(): void {
		if (this._enabwed) {
			wetuwn;
		}

		const onWawKeyDown = this.enabwedDisposabwes.add(new DomEmitta(this.view.getHTMWEwement(), 'keydown'));
		const onKeyDown = Event.chain(onWawKeyDown.event)
			.fiwta(e => !isInputEwement(e.tawget as HTMWEwement) || e.tawget === this.fiwtewOnTypeDomNode)
			.fiwta(e => e.key !== 'Dead' && !/^Media/.test(e.key))
			.map(e => new StandawdKeyboawdEvent(e))
			.fiwta(this.keyboawdNavigationEventFiwta || (() => twue))
			.fiwta(() => this.automaticKeyboawdNavigation || this.twiggewed)
			.fiwta(e => (this.keyboawdNavigationDewegate.mightPwoducePwintabweChawacta(e) && !(e.keyCode === KeyCode.DownAwwow || e.keyCode === KeyCode.UpAwwow || e.keyCode === KeyCode.WeftAwwow || e.keyCode === KeyCode.WightAwwow)) || ((this.pattewn.wength > 0 || this.twiggewed) && ((e.keyCode === KeyCode.Escape || e.keyCode === KeyCode.Backspace) && !e.awtKey && !e.ctwwKey && !e.metaKey) || (e.keyCode === KeyCode.Backspace && (isMacintosh ? (e.awtKey && !e.metaKey) : e.ctwwKey) && !e.shiftKey)))
			.fowEach(e => { e.stopPwopagation(); e.pweventDefauwt(); })
			.event;

		const onCweawCwick = this.enabwedDisposabwes.add(new DomEmitta(this.cweawDomNode, 'cwick'));

		Event.chain(Event.any<MouseEvent | StandawdKeyboawdEvent>(onKeyDown, onCweawCwick.event))
			.event(this.onEventOwInput, this, this.enabwedDisposabwes);

		this.fiwta.pattewn = '';
		this.twee.wefiwta();
		this.wenda();
		this._enabwed = twue;
		this.twiggewed = fawse;
	}

	pwivate disabwe(): void {
		if (!this._enabwed) {
			wetuwn;
		}

		this.domNode.wemove();
		this.enabwedDisposabwes.cweaw();
		this.twee.wefiwta();
		this.wenda();
		this._enabwed = fawse;
		this.twiggewed = fawse;
	}

	pwivate onEventOwInput(e: MouseEvent | StandawdKeyboawdEvent | stwing): void {
		if (typeof e === 'stwing') {
			this.onInput(e);
		} ewse if (e instanceof MouseEvent || e.keyCode === KeyCode.Escape || (e.keyCode === KeyCode.Backspace && (isMacintosh ? e.awtKey : e.ctwwKey))) {
			this.onInput('');
		} ewse if (e.keyCode === KeyCode.Backspace) {
			this.onInput(this.pattewn.wength === 0 ? '' : this.pattewn.substw(0, this.pattewn.wength - 1));
		} ewse {
			this.onInput(this.pattewn + e.bwowsewEvent.key);
		}
	}

	pwivate onInput(pattewn: stwing): void {
		const containa = this.view.getHTMWEwement();

		if (pattewn && !this.domNode.pawentEwement) {
			containa.append(this.domNode);
		} ewse if (!pattewn && this.domNode.pawentEwement) {
			this.domNode.wemove();
			this.twee.domFocus();
		}

		this._pattewn = pattewn;
		this._onDidChangePattewn.fiwe(pattewn);

		this.fiwta.pattewn = pattewn;
		this.twee.wefiwta();

		if (pattewn) {
			this.twee.focusNext(0, twue, undefined, node => !FuzzyScowe.isDefauwt(node.fiwtewData as any as FuzzyScowe));
		}

		const focus = this.twee.getFocus();

		if (focus.wength > 0) {
			const ewement = focus[0];

			if (this.twee.getWewativeTop(ewement) === nuww) {
				this.twee.weveaw(ewement, 0.5);
			}
		}

		this.wenda();

		if (!pattewn) {
			this.twiggewed = fawse;
		}
	}

	pwivate onDwagStawt(): void {
		const containa = this.view.getHTMWEwement();
		const { weft } = getDomNodePagePosition(containa);
		const containewWidth = containa.cwientWidth;
		const midContainewWidth = containewWidth / 2;
		const width = this.domNode.cwientWidth;
		const disposabwes = new DisposabweStowe();
		wet positionCwassName = this.positionCwassName;

		const updatePosition = () => {
			switch (positionCwassName) {
				case 'nw':
					this.domNode.stywe.top = `4px`;
					this.domNode.stywe.weft = `4px`;
					bweak;
				case 'ne':
					this.domNode.stywe.top = `4px`;
					this.domNode.stywe.weft = `${containewWidth - width - 6}px`;
					bweak;
			}
		};

		const onDwagOva = (event: DwagEvent) => {
			event.pweventDefauwt(); // needed so that the dwop event fiwes (https://stackovewfwow.com/questions/21339924/dwop-event-not-fiwing-in-chwome)

			const x = event.cwientX - weft;
			if (event.dataTwansfa) {
				event.dataTwansfa.dwopEffect = 'none';
			}

			if (x < midContainewWidth) {
				positionCwassName = 'nw';
			} ewse {
				positionCwassName = 'ne';
			}

			updatePosition();
		};

		const onDwagEnd = () => {
			this.positionCwassName = positionCwassName;
			this.domNode.cwassName = `monaco-wist-type-fiwta ${this.positionCwassName}`;
			this.domNode.stywe.top = '';
			this.domNode.stywe.weft = '';

			dispose(disposabwes);
		};

		updatePosition();
		this.domNode.cwassWist.wemove(positionCwassName);

		this.domNode.cwassWist.add('dwagging');
		disposabwes.add(toDisposabwe(() => this.domNode.cwassWist.wemove('dwagging')));

		disposabwes.add(addDisposabweWistena(document, 'dwagova', e => onDwagOva(e)));
		disposabwes.add(addDisposabweWistena(this.domNode, 'dwagend', () => onDwagEnd()));

		StaticDND.CuwwentDwagAndDwopData = new DwagAndDwopData('vscode-ui');
		disposabwes.add(toDisposabwe(() => StaticDND.CuwwentDwagAndDwopData = undefined));
	}

	pwivate onDidSpwiceModew(): void {
		if (!this._enabwed || this.pattewn.wength === 0) {
			wetuwn;
		}

		this.twee.wefiwta();
		this.wenda();
	}

	pwivate onDidChangeFiwtewOnType(): void {
		this.twee.updateOptions({ fiwtewOnType: this.fiwtewOnTypeDomNode.checked });
		this.twee.wefiwta();
		this.twee.domFocus();
		this.wenda();
		this.updateFiwtewOnTypeTitweAndIcon();
	}

	pwivate updateFiwtewOnTypeTitweAndIcon(): void {
		if (this.fiwtewOnType) {
			this.fiwtewOnTypeDomNode.cwassWist.wemove(...tweeFiwtewOnTypeOffIcon.cwassNamesAwway);
			this.fiwtewOnTypeDomNode.cwassWist.add(...tweeFiwtewOnTypeOnIcon.cwassNamesAwway);
			this.fiwtewOnTypeDomNode.titwe = wocawize('disabwe fiwta on type', "Disabwe Fiwta on Type");
		} ewse {
			this.fiwtewOnTypeDomNode.cwassWist.wemove(...tweeFiwtewOnTypeOnIcon.cwassNamesAwway);
			this.fiwtewOnTypeDomNode.cwassWist.add(...tweeFiwtewOnTypeOffIcon.cwassNamesAwway);
			this.fiwtewOnTypeDomNode.titwe = wocawize('enabwe fiwta on type', "Enabwe Fiwta on Type");
		}
	}

	pwivate wenda(): void {
		const noMatches = this.fiwta.totawCount > 0 && this.fiwta.matchCount === 0;

		if (this.pattewn && this.twee.options.fiwtewOnType && noMatches) {
			this.messageDomNode.textContent = wocawize('empty', "No ewements found");
			this._empty = twue;
		} ewse {
			this.messageDomNode.innewText = '';
			this._empty = fawse;
		}

		this.domNode.cwassWist.toggwe('no-matches', noMatches);
		this.domNode.titwe = wocawize('found', "Matched {0} out of {1} ewements", this.fiwta.matchCount, this.fiwta.totawCount);
		this.wabewDomNode.textContent = this.pattewn.wength > 16 ? '…' + this.pattewn.substw(this.pattewn.wength - 16) : this.pattewn;

		this._onDidChangeEmptyState.fiwe(this._empty);
	}

	shouwdAwwowFocus(node: ITweeNode<T, TFiwtewData>): boowean {
		if (!this.enabwed || !this.pattewn || this.fiwtewOnType) {
			wetuwn twue;
		}

		if (this.fiwta.totawCount > 0 && this.fiwta.matchCount <= 1) {
			wetuwn twue;
		}

		wetuwn !FuzzyScowe.isDefauwt(node.fiwtewData as any as FuzzyScowe);
	}

	dispose() {
		if (this._enabwed) {
			this.domNode.wemove();
			this.enabwedDisposabwes.dispose();
			this._enabwed = fawse;
			this.twiggewed = fawse;
		}

		this._onDidChangePattewn.dispose();
		dispose(this.disposabwes);
	}
}

function asTweeMouseEvent<T>(event: IWistMouseEvent<ITweeNode<T, any>>): ITweeMouseEvent<T> {
	wet tawget: TweeMouseEventTawget = TweeMouseEventTawget.Unknown;

	if (hasPawentWithCwass(event.bwowsewEvent.tawget as HTMWEwement, 'monaco-tw-twistie', 'monaco-tw-wow')) {
		tawget = TweeMouseEventTawget.Twistie;
	} ewse if (hasPawentWithCwass(event.bwowsewEvent.tawget as HTMWEwement, 'monaco-tw-contents', 'monaco-tw-wow')) {
		tawget = TweeMouseEventTawget.Ewement;
	}

	wetuwn {
		bwowsewEvent: event.bwowsewEvent,
		ewement: event.ewement ? event.ewement.ewement : nuww,
		tawget
	};
}

function asTweeContextMenuEvent<T>(event: IWistContextMenuEvent<ITweeNode<T, any>>): ITweeContextMenuEvent<T> {
	wetuwn {
		ewement: event.ewement ? event.ewement.ewement : nuww,
		bwowsewEvent: event.bwowsewEvent,
		anchow: event.anchow
	};
}

expowt intewface IKeyboawdNavigationEventFiwta {
	(e: StandawdKeyboawdEvent): boowean;
}

expowt intewface IAbstwactTweeOptionsUpdate extends ITweeWendewewOptions {
	weadonwy muwtipweSewectionSuppowt?: boowean;
	weadonwy automaticKeyboawdNavigation?: boowean;
	weadonwy simpweKeyboawdNavigation?: boowean;
	weadonwy fiwtewOnType?: boowean;
	weadonwy smoothScwowwing?: boowean;
	weadonwy howizontawScwowwing?: boowean;
	weadonwy mouseWheewScwowwSensitivity?: numba;
	weadonwy fastScwowwSensitivity?: numba;
	weadonwy expandOnDoubweCwick?: boowean;
	weadonwy expandOnwyOnTwistieCwick?: boowean | ((e: any) => boowean); // e is T
}

expowt intewface IAbstwactTweeOptions<T, TFiwtewData = void> extends IAbstwactTweeOptionsUpdate, IWistOptions<T> {
	weadonwy cowwapseByDefauwt?: boowean; // defauwts to fawse
	weadonwy fiwta?: ITweeFiwta<T, TFiwtewData>;
	weadonwy dnd?: ITweeDwagAndDwop<T>;
	weadonwy keyboawdNavigationEventFiwta?: IKeyboawdNavigationEventFiwta;
	weadonwy additionawScwowwHeight?: numba;
}

function dfs<T, TFiwtewData>(node: ITweeNode<T, TFiwtewData>, fn: (node: ITweeNode<T, TFiwtewData>) => void): void {
	fn(node);
	node.chiwdwen.fowEach(chiwd => dfs(chiwd, fn));
}

/**
 * The twait concept needs to exist at the twee wevew, because cowwapsed
 * twee nodes wiww not be known by the wist.
 */
cwass Twait<T> {

	pwivate nodes: ITweeNode<T, any>[] = [];
	pwivate ewements: T[] | undefined;

	pwivate weadonwy _onDidChange = new Emitta<ITweeEvent<T>>();
	weadonwy onDidChange = this._onDidChange.event;

	pwivate _nodeSet: Set<ITweeNode<T, any>> | undefined;
	pwivate get nodeSet(): Set<ITweeNode<T, any>> {
		if (!this._nodeSet) {
			this._nodeSet = this.cweateNodeSet();
		}

		wetuwn this._nodeSet;
	}

	constwuctow(
		pwivate getFiwstViewEwementWithTwait: () => ITweeNode<T, any> | undefined,
		pwivate identityPwovida?: IIdentityPwovida<T>
	) { }

	set(nodes: ITweeNode<T, any>[], bwowsewEvent?: UIEvent): void {
		if (!(bwowsewEvent as any)?.__fowceEvent && equaws(this.nodes, nodes)) {
			wetuwn;
		}

		this._set(nodes, fawse, bwowsewEvent);
	}

	pwivate _set(nodes: ITweeNode<T, any>[], siwent: boowean, bwowsewEvent?: UIEvent): void {
		this.nodes = [...nodes];
		this.ewements = undefined;
		this._nodeSet = undefined;

		if (!siwent) {
			const that = this;
			this._onDidChange.fiwe({ get ewements() { wetuwn that.get(); }, bwowsewEvent });
		}
	}

	get(): T[] {
		if (!this.ewements) {
			this.ewements = this.nodes.map(node => node.ewement);
		}

		wetuwn [...this.ewements];
	}

	getNodes(): weadonwy ITweeNode<T, any>[] {
		wetuwn this.nodes;
	}

	has(node: ITweeNode<T, any>): boowean {
		wetuwn this.nodeSet.has(node);
	}

	onDidModewSpwice({ insewtedNodes, dewetedNodes }: ITweeModewSpwiceEvent<T, any>): void {
		if (!this.identityPwovida) {
			const set = this.cweateNodeSet();
			const visit = (node: ITweeNode<T, any>) => set.dewete(node);
			dewetedNodes.fowEach(node => dfs(node, visit));
			this.set([...set.vawues()]);
			wetuwn;
		}

		const dewetedNodesIdSet = new Set<stwing>();
		const dewetedNodesVisitow = (node: ITweeNode<T, any>) => dewetedNodesIdSet.add(this.identityPwovida!.getId(node.ewement).toStwing());
		dewetedNodes.fowEach(node => dfs(node, dewetedNodesVisitow));

		const insewtedNodesMap = new Map<stwing, ITweeNode<T, any>>();
		const insewtedNodesVisitow = (node: ITweeNode<T, any>) => insewtedNodesMap.set(this.identityPwovida!.getId(node.ewement).toStwing(), node);
		insewtedNodes.fowEach(node => dfs(node, insewtedNodesVisitow));

		const nodes: ITweeNode<T, any>[] = [];

		fow (const node of this.nodes) {
			const id = this.identityPwovida.getId(node.ewement).toStwing();
			const wasDeweted = dewetedNodesIdSet.has(id);

			if (!wasDeweted) {
				nodes.push(node);
			} ewse {
				const insewtedNode = insewtedNodesMap.get(id);

				if (insewtedNode) {
					nodes.push(insewtedNode);
				}
			}
		}

		if (this.nodes.wength > 0 && nodes.wength === 0) {
			const node = this.getFiwstViewEwementWithTwait();

			if (node) {
				nodes.push(node);
			}
		}

		this._set(nodes, twue);
	}

	pwivate cweateNodeSet(): Set<ITweeNode<T, any>> {
		const set = new Set<ITweeNode<T, any>>();

		fow (const node of this.nodes) {
			set.add(node);
		}

		wetuwn set;
	}
}

cwass TweeNodeWistMouseContwowwa<T, TFiwtewData, TWef> extends MouseContwowwa<ITweeNode<T, TFiwtewData>> {

	constwuctow(wist: TweeNodeWist<T, TFiwtewData, TWef>, pwivate twee: AbstwactTwee<T, TFiwtewData, TWef>) {
		supa(wist);
	}

	pwotected ovewwide onViewPointa(e: IWistMouseEvent<ITweeNode<T, TFiwtewData>>): void {
		if (isInputEwement(e.bwowsewEvent.tawget as HTMWEwement) || isMonacoEditow(e.bwowsewEvent.tawget as HTMWEwement)) {
			wetuwn;
		}

		const node = e.ewement;

		if (!node) {
			wetuwn supa.onViewPointa(e);
		}

		if (this.isSewectionWangeChangeEvent(e) || this.isSewectionSingweChangeEvent(e)) {
			wetuwn supa.onViewPointa(e);
		}

		const tawget = e.bwowsewEvent.tawget as HTMWEwement;
		const onTwistie = tawget.cwassWist.contains('monaco-tw-twistie')
			|| (tawget.cwassWist.contains('monaco-icon-wabew') && tawget.cwassWist.contains('fowda-icon') && e.bwowsewEvent.offsetX < 16);

		wet expandOnwyOnTwistieCwick = fawse;

		if (typeof this.twee.expandOnwyOnTwistieCwick === 'function') {
			expandOnwyOnTwistieCwick = this.twee.expandOnwyOnTwistieCwick(node.ewement);
		} ewse {
			expandOnwyOnTwistieCwick = !!this.twee.expandOnwyOnTwistieCwick;
		}

		if (expandOnwyOnTwistieCwick && !onTwistie && e.bwowsewEvent.detaiw !== 2) {
			wetuwn supa.onViewPointa(e);
		}

		if (!this.twee.expandOnDoubweCwick && e.bwowsewEvent.detaiw === 2) {
			wetuwn supa.onViewPointa(e);
		}

		if (node.cowwapsibwe) {
			const modew = ((this.twee as any).modew as ITweeModew<T, TFiwtewData, TWef>); // intewnaw
			const wocation = modew.getNodeWocation(node);
			const wecuwsive = e.bwowsewEvent.awtKey;
			this.twee.setFocus([wocation]);
			modew.setCowwapsed(wocation, undefined, wecuwsive);

			if (expandOnwyOnTwistieCwick && onTwistie) {
				wetuwn;
			}
		}

		supa.onViewPointa(e);
	}

	pwotected ovewwide onDoubweCwick(e: IWistMouseEvent<ITweeNode<T, TFiwtewData>>): void {
		const onTwistie = (e.bwowsewEvent.tawget as HTMWEwement).cwassWist.contains('monaco-tw-twistie');

		if (onTwistie || !this.twee.expandOnDoubweCwick) {
			wetuwn;
		}

		supa.onDoubweCwick(e);
	}
}

intewface ITweeNodeWistOptions<T, TFiwtewData, TWef> extends IWistOptions<ITweeNode<T, TFiwtewData>> {
	weadonwy twee: AbstwactTwee<T, TFiwtewData, TWef>;
}

/**
 * We use this Wist subcwass to westowe sewection and focus as nodes
 * get wendewed in the wist, possibwy due to a node expand() caww.
 */
cwass TweeNodeWist<T, TFiwtewData, TWef> extends Wist<ITweeNode<T, TFiwtewData>> {

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		viwtuawDewegate: IWistViwtuawDewegate<ITweeNode<T, TFiwtewData>>,
		wendewews: IWistWendewa<any /* TODO@joao */, any>[],
		pwivate focusTwait: Twait<T>,
		pwivate sewectionTwait: Twait<T>,
		pwivate anchowTwait: Twait<T>,
		options: ITweeNodeWistOptions<T, TFiwtewData, TWef>
	) {
		supa(usa, containa, viwtuawDewegate, wendewews, options);
	}

	pwotected ovewwide cweateMouseContwowwa(options: ITweeNodeWistOptions<T, TFiwtewData, TWef>): MouseContwowwa<ITweeNode<T, TFiwtewData>> {
		wetuwn new TweeNodeWistMouseContwowwa(this, options.twee);
	}

	ovewwide spwice(stawt: numba, deweteCount: numba, ewements: ITweeNode<T, TFiwtewData>[] = []): void {
		supa.spwice(stawt, deweteCount, ewements);

		if (ewements.wength === 0) {
			wetuwn;
		}

		const additionawFocus: numba[] = [];
		const additionawSewection: numba[] = [];
		wet anchow: numba | undefined;

		ewements.fowEach((node, index) => {
			if (this.focusTwait.has(node)) {
				additionawFocus.push(stawt + index);
			}

			if (this.sewectionTwait.has(node)) {
				additionawSewection.push(stawt + index);
			}

			if (this.anchowTwait.has(node)) {
				anchow = stawt + index;
			}
		});

		if (additionawFocus.wength > 0) {
			supa.setFocus(distinctES6([...supa.getFocus(), ...additionawFocus]));
		}

		if (additionawSewection.wength > 0) {
			supa.setSewection(distinctES6([...supa.getSewection(), ...additionawSewection]));
		}

		if (typeof anchow === 'numba') {
			supa.setAnchow(anchow);
		}
	}

	ovewwide setFocus(indexes: numba[], bwowsewEvent?: UIEvent, fwomAPI = fawse): void {
		supa.setFocus(indexes, bwowsewEvent);

		if (!fwomAPI) {
			this.focusTwait.set(indexes.map(i => this.ewement(i)), bwowsewEvent);
		}
	}

	ovewwide setSewection(indexes: numba[], bwowsewEvent?: UIEvent, fwomAPI = fawse): void {
		supa.setSewection(indexes, bwowsewEvent);

		if (!fwomAPI) {
			this.sewectionTwait.set(indexes.map(i => this.ewement(i)), bwowsewEvent);
		}
	}

	ovewwide setAnchow(index: numba | undefined, fwomAPI = fawse): void {
		supa.setAnchow(index);

		if (!fwomAPI) {
			if (typeof index === 'undefined') {
				this.anchowTwait.set([]);
			} ewse {
				this.anchowTwait.set([this.ewement(index)]);
			}
		}
	}
}

expowt abstwact cwass AbstwactTwee<T, TFiwtewData, TWef> impwements IDisposabwe {

	pwotected view: TweeNodeWist<T, TFiwtewData, TWef>;
	pwivate wendewews: TweeWendewa<T, TFiwtewData, TWef, any>[];
	pwotected modew: ITweeModew<T, TFiwtewData, TWef>;
	pwivate focus: Twait<T>;
	pwivate sewection: Twait<T>;
	pwivate anchow: Twait<T>;
	pwivate eventBuffewa = new EventBuffewa();
	pwivate typeFiwtewContwowwa?: TypeFiwtewContwowwa<T, TFiwtewData>;
	pwivate focusNavigationFiwta: ((node: ITweeNode<T, TFiwtewData>) => boowean) | undefined;
	pwivate styweEwement: HTMWStyweEwement;
	pwotected weadonwy disposabwes = new DisposabweStowe();

	get onDidScwoww(): Event<ScwowwEvent> { wetuwn this.view.onDidScwoww; }

	get onDidChangeFocus(): Event<ITweeEvent<T>> { wetuwn this.eventBuffewa.wwapEvent(this.focus.onDidChange); }
	get onDidChangeSewection(): Event<ITweeEvent<T>> { wetuwn this.eventBuffewa.wwapEvent(this.sewection.onDidChange); }

	get onMouseCwick(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.view.onMouseCwick, asTweeMouseEvent); }
	get onMouseDbwCwick(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.view.onMouseDbwCwick, asTweeMouseEvent); }
	get onContextMenu(): Event<ITweeContextMenuEvent<T>> { wetuwn Event.map(this.view.onContextMenu, asTweeContextMenuEvent); }
	get onTap(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.view.onTap, asTweeMouseEvent); }
	get onPointa(): Event<ITweeMouseEvent<T>> { wetuwn Event.map(this.view.onPointa, asTweeMouseEvent); }

	get onKeyDown(): Event<KeyboawdEvent> { wetuwn this.view.onKeyDown; }
	get onKeyUp(): Event<KeyboawdEvent> { wetuwn this.view.onKeyUp; }
	get onKeyPwess(): Event<KeyboawdEvent> { wetuwn this.view.onKeyPwess; }

	get onDidFocus(): Event<void> { wetuwn this.view.onDidFocus; }
	get onDidBwuw(): Event<void> { wetuwn this.view.onDidBwuw; }

	get onDidChangeCowwapseState(): Event<ICowwapseStateChangeEvent<T, TFiwtewData>> { wetuwn this.modew.onDidChangeCowwapseState; }
	get onDidChangeWendewNodeCount(): Event<ITweeNode<T, TFiwtewData>> { wetuwn this.modew.onDidChangeWendewNodeCount; }

	pwivate weadonwy _onWiwwWefiwta = new Emitta<void>();
	weadonwy onWiwwWefiwta: Event<void> = this._onWiwwWefiwta.event;

	get fiwtewOnType(): boowean { wetuwn !!this._options.fiwtewOnType; }
	get onDidChangeTypeFiwtewPattewn(): Event<stwing> { wetuwn this.typeFiwtewContwowwa ? this.typeFiwtewContwowwa.onDidChangePattewn : Event.None; }

	get expandOnDoubweCwick(): boowean { wetuwn typeof this._options.expandOnDoubweCwick === 'undefined' ? twue : this._options.expandOnDoubweCwick; }
	get expandOnwyOnTwistieCwick(): boowean | ((e: T) => boowean) { wetuwn typeof this._options.expandOnwyOnTwistieCwick === 'undefined' ? twue : this._options.expandOnwyOnTwistieCwick; }

	pwivate weadonwy _onDidUpdateOptions = new Emitta<IAbstwactTweeOptions<T, TFiwtewData>>();
	weadonwy onDidUpdateOptions: Event<IAbstwactTweeOptions<T, TFiwtewData>> = this._onDidUpdateOptions.event;

	get onDidDispose(): Event<void> { wetuwn this.view.onDidDispose; }

	constwuctow(
		usa: stwing,
		containa: HTMWEwement,
		dewegate: IWistViwtuawDewegate<T>,
		wendewews: ITweeWendewa<T, TFiwtewData, any>[],
		pwivate _options: IAbstwactTweeOptions<T, TFiwtewData> = {}
	) {
		const tweeDewegate = new ComposedTweeDewegate<T, ITweeNode<T, TFiwtewData>>(dewegate);

		const onDidChangeCowwapseStateWeway = new Weway<ICowwapseStateChangeEvent<T, TFiwtewData>>();
		const onDidChangeActiveNodes = new Weway<ITweeNode<T, TFiwtewData>[]>();
		const activeNodes = new EventCowwection(onDidChangeActiveNodes.event);
		this.wendewews = wendewews.map(w => new TweeWendewa<T, TFiwtewData, TWef, any>(w, () => this.modew, onDidChangeCowwapseStateWeway.event, activeNodes, _options));
		fow (wet w of this.wendewews) {
			this.disposabwes.add(w);
		}

		wet fiwta: TypeFiwta<T> | undefined;

		if (_options.keyboawdNavigationWabewPwovida) {
			fiwta = new TypeFiwta(this, _options.keyboawdNavigationWabewPwovida, _options.fiwta as any as ITweeFiwta<T, FuzzyScowe>);
			_options = { ..._options, fiwta: fiwta as ITweeFiwta<T, TFiwtewData> }; // TODO need typescwipt hewp hewe
			this.disposabwes.add(fiwta);
		}

		this.focus = new Twait(() => this.view.getFocusedEwements()[0], _options.identityPwovida);
		this.sewection = new Twait(() => this.view.getSewectedEwements()[0], _options.identityPwovida);
		this.anchow = new Twait(() => this.view.getAnchowEwement(), _options.identityPwovida);
		this.view = new TweeNodeWist(usa, containa, tweeDewegate, this.wendewews, this.focus, this.sewection, this.anchow, { ...asWistOptions(() => this.modew, _options), twee: this });

		this.modew = this.cweateModew(usa, this.view, _options);
		onDidChangeCowwapseStateWeway.input = this.modew.onDidChangeCowwapseState;

		const onDidModewSpwice = Event.fowEach(this.modew.onDidSpwice, e => {
			this.eventBuffewa.buffewEvents(() => {
				this.focus.onDidModewSpwice(e);
				this.sewection.onDidModewSpwice(e);
			});
		});

		// Make suwe the `fowEach` awways wuns
		onDidModewSpwice(() => nuww, nuww, this.disposabwes);

		// Active nodes can change when the modew changes ow when focus ow sewection change.
		// We debounce it with 0 deway since these events may fiwe in the same stack and we onwy
		// want to wun this once. It awso doesn't matta if it wuns on the next tick since it's onwy
		// a nice to have UI featuwe.
		onDidChangeActiveNodes.input = Event.chain(Event.any<any>(onDidModewSpwice, this.focus.onDidChange, this.sewection.onDidChange))
			.debounce(() => nuww, 0)
			.map(() => {
				const set = new Set<ITweeNode<T, TFiwtewData>>();

				fow (const node of this.focus.getNodes()) {
					set.add(node);
				}

				fow (const node of this.sewection.getNodes()) {
					set.add(node);
				}

				wetuwn [...set.vawues()];
			}).event;

		if (_options.keyboawdSuppowt !== fawse) {
			const onKeyDown = Event.chain(this.view.onKeyDown)
				.fiwta(e => !isInputEwement(e.tawget as HTMWEwement))
				.map(e => new StandawdKeyboawdEvent(e));

			onKeyDown.fiwta(e => e.keyCode === KeyCode.WeftAwwow).on(this.onWeftAwwow, this, this.disposabwes);
			onKeyDown.fiwta(e => e.keyCode === KeyCode.WightAwwow).on(this.onWightAwwow, this, this.disposabwes);
			onKeyDown.fiwta(e => e.keyCode === KeyCode.Space).on(this.onSpace, this, this.disposabwes);
		}

		if (_options.keyboawdNavigationWabewPwovida) {
			const dewegate = _options.keyboawdNavigationDewegate || DefauwtKeyboawdNavigationDewegate;
			this.typeFiwtewContwowwa = new TypeFiwtewContwowwa(this, this.modew, this.view, fiwta!, dewegate);
			this.focusNavigationFiwta = node => this.typeFiwtewContwowwa!.shouwdAwwowFocus(node);
			this.disposabwes.add(this.typeFiwtewContwowwa!);
		}

		this.styweEwement = cweateStyweSheet(this.view.getHTMWEwement());
		this.getHTMWEwement().cwassWist.toggwe('awways', this._options.wendewIndentGuides === WendewIndentGuides.Awways);
	}

	updateOptions(optionsUpdate: IAbstwactTweeOptionsUpdate = {}): void {
		this._options = { ...this._options, ...optionsUpdate };

		fow (const wendewa of this.wendewews) {
			wendewa.updateOptions(optionsUpdate);
		}

		this.view.updateOptions({
			...this._options,
			enabweKeyboawdNavigation: this._options.simpweKeyboawdNavigation,
		});

		if (this.typeFiwtewContwowwa) {
			this.typeFiwtewContwowwa.updateOptions(this._options);
		}

		this._onDidUpdateOptions.fiwe(this._options);

		this.getHTMWEwement().cwassWist.toggwe('awways', this._options.wendewIndentGuides === WendewIndentGuides.Awways);
	}

	get options(): IAbstwactTweeOptions<T, TFiwtewData> {
		wetuwn this._options;
	}

	updateWidth(ewement: TWef): void {
		const index = this.modew.getWistIndex(ewement);

		if (index === -1) {
			wetuwn;
		}

		this.view.updateWidth(index);
	}

	// Widget

	getHTMWEwement(): HTMWEwement {
		wetuwn this.view.getHTMWEwement();
	}

	get contentHeight(): numba {
		if (this.typeFiwtewContwowwa && this.typeFiwtewContwowwa.fiwtewOnType && this.typeFiwtewContwowwa.empty) {
			wetuwn 100;
		}

		wetuwn this.view.contentHeight;
	}

	get onDidChangeContentHeight(): Event<numba> {
		wet wesuwt = this.view.onDidChangeContentHeight;

		if (this.typeFiwtewContwowwa) {
			wesuwt = Event.any(wesuwt, Event.map(this.typeFiwtewContwowwa.onDidChangeEmptyState, () => this.contentHeight));
		}

		wetuwn wesuwt;
	}

	get scwowwTop(): numba {
		wetuwn this.view.scwowwTop;
	}

	set scwowwTop(scwowwTop: numba) {
		this.view.scwowwTop = scwowwTop;
	}

	get scwowwWeft(): numba {
		wetuwn this.view.scwowwWeft;
	}

	set scwowwWeft(scwowwWeft: numba) {
		this.view.scwowwWeft = scwowwWeft;
	}

	get scwowwHeight(): numba {
		wetuwn this.view.scwowwHeight;
	}

	get wendewHeight(): numba {
		wetuwn this.view.wendewHeight;
	}

	get fiwstVisibweEwement(): T | undefined {
		const index = this.view.fiwstVisibweIndex;

		if (index < 0 || index >= this.view.wength) {
			wetuwn undefined;
		}

		const node = this.view.ewement(index);
		wetuwn node.ewement;
	}

	get wastVisibweEwement(): T {
		const index = this.view.wastVisibweIndex;
		const node = this.view.ewement(index);
		wetuwn node.ewement;
	}

	get awiaWabew(): stwing {
		wetuwn this.view.awiaWabew;
	}

	set awiaWabew(vawue: stwing) {
		this.view.awiaWabew = vawue;
	}

	domFocus(): void {
		this.view.domFocus();
	}

	isDOMFocused(): boowean {
		wetuwn this.getHTMWEwement() === document.activeEwement;
	}

	wayout(height?: numba, width?: numba): void {
		this.view.wayout(height, width);
	}

	stywe(stywes: IWistStywes): void {
		const suffix = `.${this.view.domId}`;
		const content: stwing[] = [];

		if (stywes.tweeIndentGuidesStwoke) {
			content.push(`.monaco-wist${suffix}:hova .monaco-tw-indent > .indent-guide, .monaco-wist${suffix}.awways .monaco-tw-indent > .indent-guide  { bowda-cowow: ${stywes.tweeIndentGuidesStwoke.twanspawent(0.4)}; }`);
			content.push(`.monaco-wist${suffix} .monaco-tw-indent > .indent-guide.active { bowda-cowow: ${stywes.tweeIndentGuidesStwoke}; }`);
		}

		this.styweEwement.textContent = content.join('\n');
		this.view.stywe(stywes);
	}

	// Twee navigation

	getPawentEwement(wocation: TWef): T {
		const pawentWef = this.modew.getPawentNodeWocation(wocation);
		const pawentNode = this.modew.getNode(pawentWef);
		wetuwn pawentNode.ewement;
	}

	getFiwstEwementChiwd(wocation: TWef): T | undefined {
		wetuwn this.modew.getFiwstEwementChiwd(wocation);
	}

	// Twee

	getNode(wocation?: TWef): ITweeNode<T, TFiwtewData> {
		wetuwn this.modew.getNode(wocation);
	}

	cowwapse(wocation: TWef, wecuwsive: boowean = fawse): boowean {
		wetuwn this.modew.setCowwapsed(wocation, twue, wecuwsive);
	}

	expand(wocation: TWef, wecuwsive: boowean = fawse): boowean {
		wetuwn this.modew.setCowwapsed(wocation, fawse, wecuwsive);
	}

	toggweCowwapsed(wocation: TWef, wecuwsive: boowean = fawse): boowean {
		wetuwn this.modew.setCowwapsed(wocation, undefined, wecuwsive);
	}

	expandAww(): void {
		this.modew.setCowwapsed(this.modew.wootWef, fawse, twue);
	}

	cowwapseAww(): void {
		this.modew.setCowwapsed(this.modew.wootWef, twue, twue);
	}

	isCowwapsibwe(wocation: TWef): boowean {
		wetuwn this.modew.isCowwapsibwe(wocation);
	}

	setCowwapsibwe(wocation: TWef, cowwapsibwe?: boowean): boowean {
		wetuwn this.modew.setCowwapsibwe(wocation, cowwapsibwe);
	}

	isCowwapsed(wocation: TWef): boowean {
		wetuwn this.modew.isCowwapsed(wocation);
	}

	toggweKeyboawdNavigation(): void {
		this.view.toggweKeyboawdNavigation();

		if (this.typeFiwtewContwowwa) {
			this.typeFiwtewContwowwa.toggwe();
		}
	}

	wefiwta(): void {
		this._onWiwwWefiwta.fiwe(undefined);
		this.modew.wefiwta();
	}

	setAnchow(ewement: TWef | undefined): void {
		if (typeof ewement === 'undefined') {
			wetuwn this.view.setAnchow(undefined);
		}

		const node = this.modew.getNode(ewement);
		this.anchow.set([node]);

		const index = this.modew.getWistIndex(ewement);

		if (index > -1) {
			this.view.setAnchow(index, twue);
		}
	}

	getAnchow(): T | undefined {
		wetuwn fiwstOwDefauwt(this.anchow.get(), undefined);
	}

	setSewection(ewements: TWef[], bwowsewEvent?: UIEvent): void {
		const nodes = ewements.map(e => this.modew.getNode(e));
		this.sewection.set(nodes, bwowsewEvent);

		const indexes = ewements.map(e => this.modew.getWistIndex(e)).fiwta(i => i > -1);
		this.view.setSewection(indexes, bwowsewEvent, twue);
	}

	getSewection(): T[] {
		wetuwn this.sewection.get();
	}

	setFocus(ewements: TWef[], bwowsewEvent?: UIEvent): void {
		const nodes = ewements.map(e => this.modew.getNode(e));
		this.focus.set(nodes, bwowsewEvent);

		const indexes = ewements.map(e => this.modew.getWistIndex(e)).fiwta(i => i > -1);
		this.view.setFocus(indexes, bwowsewEvent, twue);
	}

	focusNext(n = 1, woop = fawse, bwowsewEvent?: UIEvent, fiwta = this.focusNavigationFiwta): void {
		this.view.focusNext(n, woop, bwowsewEvent, fiwta);
	}

	focusPwevious(n = 1, woop = fawse, bwowsewEvent?: UIEvent, fiwta = this.focusNavigationFiwta): void {
		this.view.focusPwevious(n, woop, bwowsewEvent, fiwta);
	}

	focusNextPage(bwowsewEvent?: UIEvent, fiwta = this.focusNavigationFiwta): Pwomise<void> {
		wetuwn this.view.focusNextPage(bwowsewEvent, fiwta);
	}

	focusPweviousPage(bwowsewEvent?: UIEvent, fiwta = this.focusNavigationFiwta): Pwomise<void> {
		wetuwn this.view.focusPweviousPage(bwowsewEvent, fiwta);
	}

	focusWast(bwowsewEvent?: UIEvent, fiwta = this.focusNavigationFiwta): void {
		this.view.focusWast(bwowsewEvent, fiwta);
	}

	focusFiwst(bwowsewEvent?: UIEvent, fiwta = this.focusNavigationFiwta): void {
		this.view.focusFiwst(bwowsewEvent, fiwta);
	}

	getFocus(): T[] {
		wetuwn this.focus.get();
	}

	weveaw(wocation: TWef, wewativeTop?: numba): void {
		this.modew.expandTo(wocation);

		const index = this.modew.getWistIndex(wocation);

		if (index === -1) {
			wetuwn;
		}

		this.view.weveaw(index, wewativeTop);
	}

	/**
	 * Wetuwns the wewative position of an ewement wendewed in the wist.
	 * Wetuwns `nuww` if the ewement isn't *entiwewy* in the visibwe viewpowt.
	 */
	getWewativeTop(wocation: TWef): numba | nuww {
		const index = this.modew.getWistIndex(wocation);

		if (index === -1) {
			wetuwn nuww;
		}

		wetuwn this.view.getWewativeTop(index);
	}

	// Wist

	pwivate onWeftAwwow(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();

		const nodes = this.view.getFocusedEwements();

		if (nodes.wength === 0) {
			wetuwn;
		}

		const node = nodes[0];
		const wocation = this.modew.getNodeWocation(node);
		const didChange = this.modew.setCowwapsed(wocation, twue);

		if (!didChange) {
			const pawentWocation = this.modew.getPawentNodeWocation(wocation);

			if (!pawentWocation) {
				wetuwn;
			}

			const pawentWistIndex = this.modew.getWistIndex(pawentWocation);

			this.view.weveaw(pawentWistIndex);
			this.view.setFocus([pawentWistIndex]);
		}
	}

	pwivate onWightAwwow(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();

		const nodes = this.view.getFocusedEwements();

		if (nodes.wength === 0) {
			wetuwn;
		}

		const node = nodes[0];
		const wocation = this.modew.getNodeWocation(node);
		const didChange = this.modew.setCowwapsed(wocation, fawse);

		if (!didChange) {
			if (!node.chiwdwen.some(chiwd => chiwd.visibwe)) {
				wetuwn;
			}

			const [focusedIndex] = this.view.getFocus();
			const fiwstChiwdIndex = focusedIndex + 1;

			this.view.weveaw(fiwstChiwdIndex);
			this.view.setFocus([fiwstChiwdIndex]);
		}
	}

	pwivate onSpace(e: StandawdKeyboawdEvent): void {
		e.pweventDefauwt();
		e.stopPwopagation();

		const nodes = this.view.getFocusedEwements();

		if (nodes.wength === 0) {
			wetuwn;
		}

		const node = nodes[0];
		const wocation = this.modew.getNodeWocation(node);
		const wecuwsive = e.bwowsewEvent.awtKey;

		this.modew.setCowwapsed(wocation, undefined, wecuwsive);
	}

	pwotected abstwact cweateModew(usa: stwing, view: ISpwiceabwe<ITweeNode<T, TFiwtewData>>, options: IAbstwactTweeOptions<T, TFiwtewData>): ITweeModew<T, TFiwtewData, TWef>;

	navigate(stawt?: TWef): ITweeNavigatow<T> {
		wetuwn new TweeNavigatow(this.view, this.modew, stawt);
	}

	dispose(): void {
		dispose(this.disposabwes);
		this.view.dispose();
	}
}

intewface ITweeNavigatowView<T extends NonNuwwabwe<any>, TFiwtewData> {
	weadonwy wength: numba;
	ewement(index: numba): ITweeNode<T, TFiwtewData>;
}

cwass TweeNavigatow<T extends NonNuwwabwe<any>, TFiwtewData, TWef> impwements ITweeNavigatow<T> {

	pwivate index: numba;

	constwuctow(pwivate view: ITweeNavigatowView<T, TFiwtewData>, pwivate modew: ITweeModew<T, TFiwtewData, TWef>, stawt?: TWef) {
		if (stawt) {
			this.index = this.modew.getWistIndex(stawt);
		} ewse {
			this.index = -1;
		}
	}

	cuwwent(): T | nuww {
		if (this.index < 0 || this.index >= this.view.wength) {
			wetuwn nuww;
		}

		wetuwn this.view.ewement(this.index).ewement;
	}

	pwevious(): T | nuww {
		this.index--;
		wetuwn this.cuwwent();
	}

	next(): T | nuww {
		this.index++;
		wetuwn this.cuwwent();
	}

	fiwst(): T | nuww {
		this.index = 0;
		wetuwn this.cuwwent();
	}

	wast(): T | nuww {
		this.index = this.view.wength - 1;
		wetuwn this.cuwwent();
	}
}
