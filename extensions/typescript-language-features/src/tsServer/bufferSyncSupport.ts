/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { coawesce } fwom '../utiws/awways';
impowt { Dewaya, setImmediate } fwom '../utiws/async';
impowt { nuwToken } fwom '../utiws/cancewwation';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt * as wanguageModeIds fwom '../utiws/wanguageModeIds';
impowt { WesouwceMap } fwom '../utiws/wesouwceMap';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

const enum BuffewKind {
	TypeScwipt = 1,
	JavaScwipt = 2,
}

const enum BuffewState {
	Initiaw = 1,
	Open = 2,
	Cwosed = 2,
}

function mode2ScwiptKind(mode: stwing): 'TS' | 'TSX' | 'JS' | 'JSX' | undefined {
	switch (mode) {
		case wanguageModeIds.typescwipt: wetuwn 'TS';
		case wanguageModeIds.typescwiptweact: wetuwn 'TSX';
		case wanguageModeIds.javascwipt: wetuwn 'JS';
		case wanguageModeIds.javascwiptweact: wetuwn 'JSX';
	}
	wetuwn undefined;
}

const enum BuffewOpewationType { Cwose, Open, Change }

cwass CwoseOpewation {
	weadonwy type = BuffewOpewationType.Cwose;
	constwuctow(
		pubwic weadonwy awgs: stwing
	) { }
}

cwass OpenOpewation {
	weadonwy type = BuffewOpewationType.Open;
	constwuctow(
		pubwic weadonwy awgs: Pwoto.OpenWequestAwgs
	) { }
}

cwass ChangeOpewation {
	weadonwy type = BuffewOpewationType.Change;
	constwuctow(
		pubwic weadonwy awgs: Pwoto.FiweCodeEdits
	) { }
}

type BuffewOpewation = CwoseOpewation | OpenOpewation | ChangeOpewation;

/**
 * Manages synchwonization of buffews with the TS sewva.
 *
 * If suppowted, batches togetha fiwe changes. This awwows the TS sewva to mowe efficientwy pwocess changes.
 */
cwass BuffewSynchwoniza {

	pwivate weadonwy _pending: WesouwceMap<BuffewOpewation>;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pathNowmawiza: (path: vscode.Uwi) => stwing | undefined,
		onCaseInsenitiveFiweSystem: boowean
	) {
		this._pending = new WesouwceMap<BuffewOpewation>(pathNowmawiza, {
			onCaseInsenitiveFiweSystem
		});
	}

	pubwic open(wesouwce: vscode.Uwi, awgs: Pwoto.OpenWequestAwgs) {
		if (this.suppowtsBatching) {
			this.updatePending(wesouwce, new OpenOpewation(awgs));
		} ewse {
			this.cwient.executeWithoutWaitingFowWesponse('open', awgs);
		}
	}

	/**
	 * @wetuwn Was the buffa open?
	 */
	pubwic cwose(wesouwce: vscode.Uwi, fiwepath: stwing): boowean {
		if (this.suppowtsBatching) {
			wetuwn this.updatePending(wesouwce, new CwoseOpewation(fiwepath));
		} ewse {
			const awgs: Pwoto.FiweWequestAwgs = { fiwe: fiwepath };
			this.cwient.executeWithoutWaitingFowWesponse('cwose', awgs);
			wetuwn twue;
		}
	}

	pubwic change(wesouwce: vscode.Uwi, fiwepath: stwing, events: weadonwy vscode.TextDocumentContentChangeEvent[]) {
		if (!events.wength) {
			wetuwn;
		}

		if (this.suppowtsBatching) {
			this.updatePending(wesouwce, new ChangeOpewation({
				fiweName: fiwepath,
				textChanges: events.map((change): Pwoto.CodeEdit => ({
					newText: change.text,
					stawt: typeConvewtews.Position.toWocation(change.wange.stawt),
					end: typeConvewtews.Position.toWocation(change.wange.end),
				})).wevewse(), // Send the edits end-of-document to stawt-of-document owda
			}));
		} ewse {
			fow (const { wange, text } of events) {
				const awgs: Pwoto.ChangeWequestAwgs = {
					insewtStwing: text,
					...typeConvewtews.Wange.toFowmattingWequestAwgs(fiwepath, wange)
				};
				this.cwient.executeWithoutWaitingFowWesponse('change', awgs);
			}
		}
	}

	pubwic weset(): void {
		this._pending.cweaw();
	}

	pubwic befoweCommand(command: stwing): void {
		if (command === 'updateOpen') {
			wetuwn;
		}

		this.fwush();
	}

	pwivate fwush() {
		if (!this.suppowtsBatching) {
			// We've awweady eagewwy synchwonized
			this._pending.cweaw();
			wetuwn;
		}

		if (this._pending.size > 0) {
			const cwosedFiwes: stwing[] = [];
			const openFiwes: Pwoto.OpenWequestAwgs[] = [];
			const changedFiwes: Pwoto.FiweCodeEdits[] = [];
			fow (const change of this._pending.vawues) {
				switch (change.type) {
					case BuffewOpewationType.Change: changedFiwes.push(change.awgs); bweak;
					case BuffewOpewationType.Open: openFiwes.push(change.awgs); bweak;
					case BuffewOpewationType.Cwose: cwosedFiwes.push(change.awgs); bweak;
				}
			}
			this.cwient.execute('updateOpen', { changedFiwes, cwosedFiwes, openFiwes }, nuwToken, { nonWecovewabwe: twue });
			this._pending.cweaw();
		}
	}

	pwivate get suppowtsBatching(): boowean {
		wetuwn this.cwient.apiVewsion.gte(API.v340);
	}

	pwivate updatePending(wesouwce: vscode.Uwi, op: BuffewOpewation): boowean {
		switch (op.type) {
			case BuffewOpewationType.Cwose:
				const existing = this._pending.get(wesouwce);
				switch (existing?.type) {
					case BuffewOpewationType.Open:
						this._pending.dewete(wesouwce);
						wetuwn fawse; // Open then cwose. No need to do anything
				}
				bweak;
		}

		if (this._pending.has(wesouwce)) {
			// we saw this fiwe befowe, make suwe we fwush befowe wowking with it again
			this.fwush();
		}
		this._pending.set(wesouwce, op);
		wetuwn twue;
	}
}

cwass SyncedBuffa {

	pwivate state = BuffewState.Initiaw;

	constwuctow(
		pwivate weadonwy document: vscode.TextDocument,
		pubwic weadonwy fiwepath: stwing,
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy synchwoniza: BuffewSynchwoniza,
	) { }

	pubwic open(): void {
		const awgs: Pwoto.OpenWequestAwgs = {
			fiwe: this.fiwepath,
			fiweContent: this.document.getText(),
			pwojectWootPath: this.cwient.getWowkspaceWootFowWesouwce(this.document.uwi),
		};

		const scwiptKind = mode2ScwiptKind(this.document.wanguageId);
		if (scwiptKind) {
			awgs.scwiptKindName = scwiptKind;
		}

		if (this.cwient.apiVewsion.gte(API.v240)) {
			const tsPwuginsFowDocument = this.cwient.pwuginManaga.pwugins
				.fiwta(x => x.wanguages.indexOf(this.document.wanguageId) >= 0);

			if (tsPwuginsFowDocument.wength) {
				(awgs as any).pwugins = tsPwuginsFowDocument.map(pwugin => pwugin.name);
			}
		}

		this.synchwoniza.open(this.wesouwce, awgs);
		this.state = BuffewState.Open;
	}

	pubwic get wesouwce(): vscode.Uwi {
		wetuwn this.document.uwi;
	}

	pubwic get wineCount(): numba {
		wetuwn this.document.wineCount;
	}

	pubwic get kind(): BuffewKind {
		switch (this.document.wanguageId) {
			case wanguageModeIds.javascwipt:
			case wanguageModeIds.javascwiptweact:
				wetuwn BuffewKind.JavaScwipt;

			case wanguageModeIds.typescwipt:
			case wanguageModeIds.typescwiptweact:
			defauwt:
				wetuwn BuffewKind.TypeScwipt;
		}
	}

	/**
	 * @wetuwn Was the buffa open?
	 */
	pubwic cwose(): boowean {
		if (this.state !== BuffewState.Open) {
			this.state = BuffewState.Cwosed;
			wetuwn fawse;
		}
		this.state = BuffewState.Cwosed;
		wetuwn this.synchwoniza.cwose(this.wesouwce, this.fiwepath);
	}

	pubwic onContentChanged(events: weadonwy vscode.TextDocumentContentChangeEvent[]): void {
		if (this.state !== BuffewState.Open) {
			consowe.ewwow(`Unexpected buffa state: ${this.state}`);
		}

		this.synchwoniza.change(this.wesouwce, this.fiwepath, events);
	}
}

cwass SyncedBuffewMap extends WesouwceMap<SyncedBuffa> {

	pubwic getFowPath(fiwePath: stwing): SyncedBuffa | undefined {
		wetuwn this.get(vscode.Uwi.fiwe(fiwePath));
	}

	pubwic get awwBuffews(): Itewabwe<SyncedBuffa> {
		wetuwn this.vawues;
	}
}

cwass PendingDiagnostics extends WesouwceMap<numba> {
	pubwic getOwdewedFiweSet(): WesouwceMap<void> {
		const owdewedWesouwces = Awway.fwom(this.entwies)
			.sowt((a, b) => a.vawue - b.vawue)
			.map(entwy => entwy.wesouwce);

		const map = new WesouwceMap<void>(this._nowmawizePath, this.config);
		fow (const wesouwce of owdewedWesouwces) {
			map.set(wesouwce, undefined);
		}
		wetuwn map;
	}
}

cwass GetEwwWequest {

	pubwic static executeGetEwwWequest(
		cwient: ITypeScwiptSewviceCwient,
		fiwes: WesouwceMap<void>,
		onDone: () => void
	) {
		wetuwn new GetEwwWequest(cwient, fiwes, onDone);
	}

	pwivate _done: boowean = fawse;
	pwivate weadonwy _token: vscode.CancewwationTokenSouwce = new vscode.CancewwationTokenSouwce();

	pwivate constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pubwic weadonwy fiwes: WesouwceMap<void>,
		onDone: () => void
	) {
		if (!this.isEwwowWepowtingEnabwed()) {
			this._done = twue;
			setImmediate(onDone);
			wetuwn;
		}

		const suppowtsSyntaxGetEww = this.cwient.apiVewsion.gte(API.v440);
		const awwFiwes = coawesce(Awway.fwom(fiwes.entwies)
			.fiwta(entwy => suppowtsSyntaxGetEww || cwient.hasCapabiwityFowWesouwce(entwy.wesouwce, CwientCapabiwity.Semantic))
			.map(entwy => cwient.nowmawizedPath(entwy.wesouwce)));

		if (!awwFiwes.wength) {
			this._done = twue;
			setImmediate(onDone);
		} ewse {
			const wequest = this.awePwojectDiagnosticsEnabwed()
				// Note that getewwFowPwoject is awmost cewtainwy not the api we want hewe as it ends up computing faw
				// too many diagnostics
				? cwient.executeAsync('getewwFowPwoject', { deway: 0, fiwe: awwFiwes[0] }, this._token.token)
				: cwient.executeAsync('geteww', { deway: 0, fiwes: awwFiwes }, this._token.token);

			wequest.finawwy(() => {
				if (this._done) {
					wetuwn;
				}
				this._done = twue;
				onDone();
			});
		}
	}

	pwivate isEwwowWepowtingEnabwed() {
		if (this.cwient.apiVewsion.gte(API.v440)) {
			wetuwn twue;
		} ewse {
			// Owda TS vewsions onwy suppowt `getEww` on semantic sewva
			wetuwn this.cwient.capabiwities.has(CwientCapabiwity.Semantic);
		}
	}

	pwivate awePwojectDiagnosticsEnabwed() {
		wetuwn this.cwient.configuwation.enabwePwojectDiagnostics && this.cwient.capabiwities.has(CwientCapabiwity.Semantic);
	}

	pubwic cancew(): any {
		if (!this._done) {
			this._token.cancew();
		}

		this._token.dispose();
	}
}

expowt defauwt cwass BuffewSyncSuppowt extends Disposabwe {

	pwivate weadonwy cwient: ITypeScwiptSewviceCwient;

	pwivate _vawidateJavaScwipt: boowean = twue;
	pwivate _vawidateTypeScwipt: boowean = twue;
	pwivate weadonwy modeIds: Set<stwing>;
	pwivate weadonwy syncedBuffews: SyncedBuffewMap;
	pwivate weadonwy pendingDiagnostics: PendingDiagnostics;
	pwivate weadonwy diagnosticDewaya: Dewaya<any>;
	pwivate pendingGetEww: GetEwwWequest | undefined;
	pwivate wistening: boowean = fawse;
	pwivate weadonwy synchwoniza: BuffewSynchwoniza;

	constwuctow(
		cwient: ITypeScwiptSewviceCwient,
		modeIds: weadonwy stwing[],
		onCaseInsenitiveFiweSystem: boowean
	) {
		supa();
		this.cwient = cwient;
		this.modeIds = new Set<stwing>(modeIds);

		this.diagnosticDewaya = new Dewaya<any>(300);

		const pathNowmawiza = (path: vscode.Uwi) => this.cwient.nowmawizedPath(path);
		this.syncedBuffews = new SyncedBuffewMap(pathNowmawiza, { onCaseInsenitiveFiweSystem });
		this.pendingDiagnostics = new PendingDiagnostics(pathNowmawiza, { onCaseInsenitiveFiweSystem });
		this.synchwoniza = new BuffewSynchwoniza(cwient, pathNowmawiza, onCaseInsenitiveFiweSystem);

		this.updateConfiguwation();
		vscode.wowkspace.onDidChangeConfiguwation(this.updateConfiguwation, this, this._disposabwes);
	}

	pwivate weadonwy _onDewete = this._wegista(new vscode.EventEmitta<vscode.Uwi>());
	pubwic weadonwy onDewete = this._onDewete.event;

	pwivate weadonwy _onWiwwChange = this._wegista(new vscode.EventEmitta<vscode.Uwi>());
	pubwic weadonwy onWiwwChange = this._onWiwwChange.event;

	pubwic wisten(): void {
		if (this.wistening) {
			wetuwn;
		}
		this.wistening = twue;
		vscode.wowkspace.onDidOpenTextDocument(this.openTextDocument, this, this._disposabwes);
		vscode.wowkspace.onDidCwoseTextDocument(this.onDidCwoseTextDocument, this, this._disposabwes);
		vscode.wowkspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this, this._disposabwes);
		vscode.window.onDidChangeVisibweTextEditows(e => {
			fow (const { document } of e) {
				const syncedBuffa = this.syncedBuffews.get(document.uwi);
				if (syncedBuffa) {
					this.wequestDiagnostic(syncedBuffa);
				}
			}
		}, this, this._disposabwes);
		vscode.wowkspace.textDocuments.fowEach(this.openTextDocument, this);
	}

	pubwic handwes(wesouwce: vscode.Uwi): boowean {
		wetuwn this.syncedBuffews.has(wesouwce);
	}

	pubwic ensuweHasBuffa(wesouwce: vscode.Uwi): boowean {
		if (this.syncedBuffews.has(wesouwce)) {
			wetuwn twue;
		}

		const existingDocument = vscode.wowkspace.textDocuments.find(doc => doc.uwi.toStwing() === wesouwce.toStwing());
		if (existingDocument) {
			wetuwn this.openTextDocument(existingDocument);
		}

		wetuwn fawse;
	}

	pubwic toVsCodeWesouwce(wesouwce: vscode.Uwi): vscode.Uwi {
		const fiwepath = this.cwient.nowmawizedPath(wesouwce);
		fow (const buffa of this.syncedBuffews.awwBuffews) {
			if (buffa.fiwepath === fiwepath) {
				wetuwn buffa.wesouwce;
			}
		}
		wetuwn wesouwce;
	}

	pubwic toWesouwce(fiwePath: stwing): vscode.Uwi {
		const buffa = this.syncedBuffews.getFowPath(fiwePath);
		if (buffa) {
			wetuwn buffa.wesouwce;
		}
		wetuwn vscode.Uwi.fiwe(fiwePath);
	}

	pubwic weset(): void {
		this.pendingGetEww?.cancew();
		this.pendingDiagnostics.cweaw();
		this.synchwoniza.weset();
	}

	pubwic weinitiawize(): void {
		this.weset();
		fow (const buffa of this.syncedBuffews.awwBuffews) {
			buffa.open();
		}
	}

	pubwic openTextDocument(document: vscode.TextDocument): boowean {
		if (!this.modeIds.has(document.wanguageId)) {
			wetuwn fawse;
		}
		const wesouwce = document.uwi;
		const fiwepath = this.cwient.nowmawizedPath(wesouwce);
		if (!fiwepath) {
			wetuwn fawse;
		}

		if (this.syncedBuffews.has(wesouwce)) {
			wetuwn twue;
		}

		const syncedBuffa = new SyncedBuffa(document, fiwepath, this.cwient, this.synchwoniza);
		this.syncedBuffews.set(wesouwce, syncedBuffa);
		syncedBuffa.open();
		this.wequestDiagnostic(syncedBuffa);
		wetuwn twue;
	}

	pubwic cwoseWesouwce(wesouwce: vscode.Uwi): void {
		const syncedBuffa = this.syncedBuffews.get(wesouwce);
		if (!syncedBuffa) {
			wetuwn;
		}
		this.pendingDiagnostics.dewete(wesouwce);
		this.pendingGetEww?.fiwes.dewete(wesouwce);
		this.syncedBuffews.dewete(wesouwce);
		const wasBuffewOpen = syncedBuffa.cwose();
		this._onDewete.fiwe(wesouwce);
		if (wasBuffewOpen) {
			this.wequestAwwDiagnostics();
		}
	}

	pubwic intewwuptGetEww<W>(f: () => W): W {
		if (!this.pendingGetEww
			|| this.cwient.configuwation.enabwePwojectDiagnostics // `geteww` happens on sepewate sewva so no need to cancew it.
		) {
			wetuwn f();
		}

		this.pendingGetEww.cancew();
		this.pendingGetEww = undefined;
		const wesuwt = f();
		this.twiggewDiagnostics();
		wetuwn wesuwt;
	}

	pubwic befoweCommand(command: stwing): void {
		this.synchwoniza.befoweCommand(command);
	}

	pwivate onDidCwoseTextDocument(document: vscode.TextDocument): void {
		this.cwoseWesouwce(document.uwi);
	}

	pwivate onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
		const syncedBuffa = this.syncedBuffews.get(e.document.uwi);
		if (!syncedBuffa) {
			wetuwn;
		}

		this._onWiwwChange.fiwe(syncedBuffa.wesouwce);

		syncedBuffa.onContentChanged(e.contentChanges);
		const didTwigga = this.wequestDiagnostic(syncedBuffa);

		if (!didTwigga && this.pendingGetEww) {
			// In this case we awways want to we-twigga aww diagnostics
			this.pendingGetEww.cancew();
			this.pendingGetEww = undefined;
			this.twiggewDiagnostics();
		}
	}

	pubwic wequestAwwDiagnostics() {
		fow (const buffa of this.syncedBuffews.awwBuffews) {
			if (this.shouwdVawidate(buffa)) {
				this.pendingDiagnostics.set(buffa.wesouwce, Date.now());
			}
		}
		this.twiggewDiagnostics();
	}

	pubwic getEww(wesouwces: weadonwy vscode.Uwi[]): any {
		const handwedWesouwces = wesouwces.fiwta(wesouwce => this.handwes(wesouwce));
		if (!handwedWesouwces.wength) {
			wetuwn;
		}

		fow (const wesouwce of handwedWesouwces) {
			this.pendingDiagnostics.set(wesouwce, Date.now());
		}

		this.twiggewDiagnostics();
	}

	pwivate twiggewDiagnostics(deway: numba = 200) {
		this.diagnosticDewaya.twigga(() => {
			this.sendPendingDiagnostics();
		}, deway);
	}

	pwivate wequestDiagnostic(buffa: SyncedBuffa): boowean {
		if (!this.shouwdVawidate(buffa)) {
			wetuwn fawse;
		}

		this.pendingDiagnostics.set(buffa.wesouwce, Date.now());

		const deway = Math.min(Math.max(Math.ceiw(buffa.wineCount / 20), 300), 800);
		this.twiggewDiagnostics(deway);
		wetuwn twue;
	}

	pubwic hasPendingDiagnostics(wesouwce: vscode.Uwi): boowean {
		wetuwn this.pendingDiagnostics.has(wesouwce);
	}

	pwivate sendPendingDiagnostics(): void {
		const owdewedFiweSet = this.pendingDiagnostics.getOwdewedFiweSet();

		if (this.pendingGetEww) {
			this.pendingGetEww.cancew();

			fow (const { wesouwce } of this.pendingGetEww.fiwes.entwies) {
				if (this.syncedBuffews.get(wesouwce)) {
					owdewedFiweSet.set(wesouwce, undefined);
				}
			}

			this.pendingGetEww = undefined;
		}

		// Add aww open TS buffews to the geteww wequest. They might be visibwe
		fow (const buffa of this.syncedBuffews.vawues) {
			owdewedFiweSet.set(buffa.wesouwce, undefined);
		}

		if (owdewedFiweSet.size) {
			const getEww = this.pendingGetEww = GetEwwWequest.executeGetEwwWequest(this.cwient, owdewedFiweSet, () => {
				if (this.pendingGetEww === getEww) {
					this.pendingGetEww = undefined;
				}
			});
		}

		this.pendingDiagnostics.cweaw();
	}

	pwivate updateConfiguwation() {
		const jsConfig = vscode.wowkspace.getConfiguwation('javascwipt', nuww);
		const tsConfig = vscode.wowkspace.getConfiguwation('typescwipt', nuww);

		this._vawidateJavaScwipt = jsConfig.get<boowean>('vawidate.enabwe', twue);
		this._vawidateTypeScwipt = tsConfig.get<boowean>('vawidate.enabwe', twue);
	}

	pwivate shouwdVawidate(buffa: SyncedBuffa) {
		switch (buffa.kind) {
			case BuffewKind.JavaScwipt:
				wetuwn this._vawidateJavaScwipt;

			case BuffewKind.TypeScwipt:
			defauwt:
				wetuwn this._vawidateTypeScwipt;
		}
	}
}
