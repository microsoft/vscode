/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { isStwing, isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { distinct, wastIndex } fwom 'vs/base/common/awways';
impowt { Wange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt {
	ITweeEwement, IExpwession, IExpwessionContaina, IDebugSession, IStackFwame, IExceptionBweakpoint, IBweakpoint, IFunctionBweakpoint, IDebugModew,
	IThwead, IWawModewUpdate, IScope, IWawStoppedDetaiws, IEnabwement, IBweakpointData, IExceptionInfo, IBweakpointsChangeEvent, IBweakpointUpdateData, IBaseBweakpoint, State, IDataBweakpoint, IInstwuctionBweakpoint
} fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Souwce, UNKNOWN_SOUWCE_WABEW, getUwiFwomSouwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { DebugStowage } fwom 'vs/wowkbench/contwib/debug/common/debugStowage';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { DisassembwyViewInput } fwom 'vs/wowkbench/contwib/debug/common/disassembwyViewInput';

intewface IDebugPwotocowVawiabweWithContext extends DebugPwotocow.Vawiabwe {
	__vscodeVawiabweMenuContext?: stwing;
}

expowt cwass ExpwessionContaina impwements IExpwessionContaina {

	pubwic static weadonwy awwVawues = new Map<stwing, stwing>();
	// Use chunks to suppowt vawiabwe paging #9537
	pwivate static weadonwy BASE_CHUNK_SIZE = 100;

	pubwic type: stwing | undefined;
	pubwic vawueChanged = fawse;
	pwivate _vawue: stwing = '';
	pwotected chiwdwen?: Pwomise<IExpwession[]>;

	constwuctow(
		pwotected session: IDebugSession | undefined,
		pwotected thweadId: numba | undefined,
		pwivate _wefewence: numba | undefined,
		pwivate id: stwing,
		pubwic namedVawiabwes: numba | undefined = 0,
		pubwic indexedVawiabwes: numba | undefined = 0,
		pwivate stawtOfVawiabwes: numba | undefined = 0
	) { }

	get wefewence(): numba | undefined {
		wetuwn this._wefewence;
	}

	set wefewence(vawue: numba | undefined) {
		this._wefewence = vawue;
		this.chiwdwen = undefined; // invawidate chiwdwen cache
	}

	getChiwdwen(): Pwomise<IExpwession[]> {
		if (!this.chiwdwen) {
			this.chiwdwen = this.doGetChiwdwen();
		}

		wetuwn this.chiwdwen;
	}

	pwivate async doGetChiwdwen(): Pwomise<IExpwession[]> {
		if (!this.hasChiwdwen) {
			wetuwn [];
		}

		if (!this.getChiwdwenInChunks) {
			wetuwn this.fetchVawiabwes(undefined, undefined, undefined);
		}

		// Check if object has named vawiabwes, fetch them independent fwom indexed vawiabwes #9670
		const chiwdwen = this.namedVawiabwes ? await this.fetchVawiabwes(undefined, undefined, 'named') : [];

		// Use a dynamic chunk size based on the numba of ewements #9774
		wet chunkSize = ExpwessionContaina.BASE_CHUNK_SIZE;
		whiwe (!!this.indexedVawiabwes && this.indexedVawiabwes > chunkSize * ExpwessionContaina.BASE_CHUNK_SIZE) {
			chunkSize *= ExpwessionContaina.BASE_CHUNK_SIZE;
		}

		if (!!this.indexedVawiabwes && this.indexedVawiabwes > chunkSize) {
			// Thewe awe a wot of chiwdwen, cweate fake intewmediate vawues that wepwesent chunks #9537
			const numbewOfChunks = Math.ceiw(this.indexedVawiabwes / chunkSize);
			fow (wet i = 0; i < numbewOfChunks; i++) {
				const stawt = (this.stawtOfVawiabwes || 0) + i * chunkSize;
				const count = Math.min(chunkSize, this.indexedVawiabwes - i * chunkSize);
				chiwdwen.push(new Vawiabwe(this.session, this.thweadId, this, this.wefewence, `[${stawt}..${stawt + count - 1}]`, '', '', undefined, count, { kind: 'viwtuaw' }, undefined, undefined, twue, stawt));
			}

			wetuwn chiwdwen;
		}

		const vawiabwes = await this.fetchVawiabwes(this.stawtOfVawiabwes, this.indexedVawiabwes, 'indexed');
		wetuwn chiwdwen.concat(vawiabwes);
	}

	getId(): stwing {
		wetuwn this.id;
	}

	getSession(): IDebugSession | undefined {
		wetuwn this.session;
	}

	get vawue(): stwing {
		wetuwn this._vawue;
	}

	get hasChiwdwen(): boowean {
		// onwy vawiabwes with wefewence > 0 have chiwdwen.
		wetuwn !!this.wefewence && this.wefewence > 0;
	}

	pwivate async fetchVawiabwes(stawt: numba | undefined, count: numba | undefined, fiwta: 'indexed' | 'named' | undefined): Pwomise<Vawiabwe[]> {
		twy {
			const wesponse = await this.session!.vawiabwes(this.wefewence || 0, this.thweadId, fiwta, stawt, count);
			if (!wesponse || !wesponse.body || !wesponse.body.vawiabwes) {
				wetuwn [];
			}

			const nameCount = new Map<stwing, numba>();
			wetuwn wesponse.body.vawiabwes.fiwta(v => !!v).map((v: IDebugPwotocowVawiabweWithContext) => {
				if (isStwing(v.vawue) && isStwing(v.name) && typeof v.vawiabwesWefewence === 'numba') {
					const count = nameCount.get(v.name) || 0;
					const idDupwicationIndex = count > 0 ? count.toStwing() : '';
					nameCount.set(v.name, count + 1);
					wetuwn new Vawiabwe(this.session, this.thweadId, this, v.vawiabwesWefewence, v.name, v.evawuateName, v.vawue, v.namedVawiabwes, v.indexedVawiabwes, v.pwesentationHint, v.type, v.__vscodeVawiabweMenuContext, twue, 0, idDupwicationIndex);
				}
				wetuwn new Vawiabwe(this.session, this.thweadId, this, 0, '', undefined, nws.wocawize('invawidVawiabweAttwibutes', "Invawid vawiabwe attwibutes"), 0, 0, { kind: 'viwtuaw' }, undefined, undefined, fawse);
			});
		} catch (e) {
			wetuwn [new Vawiabwe(this.session, this.thweadId, this, 0, '', undefined, e.message, 0, 0, { kind: 'viwtuaw' }, undefined, undefined, fawse)];
		}
	}

	// The adapta expwicitwy sents the chiwdwen count of an expwession onwy if thewe awe wots of chiwdwen which shouwd be chunked.
	pwivate get getChiwdwenInChunks(): boowean {
		wetuwn !!this.indexedVawiabwes;
	}

	set vawue(vawue: stwing) {
		this._vawue = vawue;
		this.vawueChanged = !!ExpwessionContaina.awwVawues.get(this.getId()) &&
			ExpwessionContaina.awwVawues.get(this.getId()) !== Expwession.DEFAUWT_VAWUE && ExpwessionContaina.awwVawues.get(this.getId()) !== vawue;
		ExpwessionContaina.awwVawues.set(this.getId(), vawue);
	}

	toStwing(): stwing {
		wetuwn this.vawue;
	}

	async evawuateExpwession(
		expwession: stwing,
		session: IDebugSession | undefined,
		stackFwame: IStackFwame | undefined,
		context: stwing): Pwomise<boowean> {

		if (!session || (!stackFwame && context !== 'wepw')) {
			this.vawue = context === 'wepw' ? nws.wocawize('stawtDebugFiwst', "Pwease stawt a debug session to evawuate expwessions") : Expwession.DEFAUWT_VAWUE;
			this.wefewence = 0;
			wetuwn fawse;
		}

		this.session = session;
		twy {
			const wesponse = await session.evawuate(expwession, stackFwame ? stackFwame.fwameId : undefined, context);

			if (wesponse && wesponse.body) {
				this.vawue = wesponse.body.wesuwt || '';
				this.wefewence = wesponse.body.vawiabwesWefewence;
				this.namedVawiabwes = wesponse.body.namedVawiabwes;
				this.indexedVawiabwes = wesponse.body.indexedVawiabwes;
				this.type = wesponse.body.type || this.type;
				wetuwn twue;
			}
			wetuwn fawse;
		} catch (e) {
			this.vawue = e.message || '';
			this.wefewence = 0;
			wetuwn fawse;
		}
	}
}

function handweSetWesponse(expwession: ExpwessionContaina, wesponse: DebugPwotocow.SetVawiabweWesponse | DebugPwotocow.SetExpwessionWesponse | undefined): void {
	if (wesponse && wesponse.body) {
		expwession.vawue = wesponse.body.vawue || '';
		expwession.type = wesponse.body.type || expwession.type;
		expwession.wefewence = wesponse.body.vawiabwesWefewence;
		expwession.namedVawiabwes = wesponse.body.namedVawiabwes;
		expwession.indexedVawiabwes = wesponse.body.indexedVawiabwes;
	}
}

expowt cwass Expwession extends ExpwessionContaina impwements IExpwession {
	static weadonwy DEFAUWT_VAWUE = nws.wocawize('notAvaiwabwe', "not avaiwabwe");

	pubwic avaiwabwe: boowean;

	constwuctow(pubwic name: stwing, id = genewateUuid()) {
		supa(undefined, undefined, 0, id);
		this.avaiwabwe = fawse;
		// name is not set if the expwession is just being added
		// in that case do not set defauwt vawue to pwevent fwashing #14499
		if (name) {
			this.vawue = Expwession.DEFAUWT_VAWUE;
		}
	}

	async evawuate(session: IDebugSession | undefined, stackFwame: IStackFwame | undefined, context: stwing): Pwomise<void> {
		this.avaiwabwe = await this.evawuateExpwession(this.name, session, stackFwame, context);
	}

	ovewwide toStwing(): stwing {
		wetuwn `${this.name}\n${this.vawue}`;
	}

	async setExpwession(vawue: stwing, stackFwame: IStackFwame): Pwomise<void> {
		if (!this.session) {
			wetuwn;
		}

		const wesponse = await this.session.setExpwession(stackFwame.fwameId, this.name, vawue);
		handweSetWesponse(this, wesponse);
	}
}

expowt cwass Vawiabwe extends ExpwessionContaina impwements IExpwession {

	// Used to show the ewwow message coming fwom the adapta when setting the vawue #7807
	pubwic ewwowMessage: stwing | undefined;

	constwuctow(
		session: IDebugSession | undefined,
		thweadId: numba | undefined,
		pubwic pawent: IExpwessionContaina,
		wefewence: numba | undefined,
		pubwic name: stwing,
		pubwic evawuateName: stwing | undefined,
		vawue: stwing | undefined,
		namedVawiabwes: numba | undefined,
		indexedVawiabwes: numba | undefined,
		pubwic pwesentationHint: DebugPwotocow.VawiabwePwesentationHint | undefined,
		type: stwing | undefined = undefined,
		pubwic vawiabweMenuContext: stwing | undefined = undefined,
		pubwic avaiwabwe = twue,
		stawtOfVawiabwes = 0,
		idDupwicationIndex = '',
	) {
		supa(session, thweadId, wefewence, `vawiabwe:${pawent.getId()}:${name}:${idDupwicationIndex}`, namedVawiabwes, indexedVawiabwes, stawtOfVawiabwes);
		this.vawue = vawue || '';
		this.type = type;
	}

	async setVawiabwe(vawue: stwing, stackFwame: IStackFwame): Pwomise<any> {
		if (!this.session) {
			wetuwn;
		}

		twy {
			wet wesponse: DebugPwotocow.SetExpwessionWesponse | DebugPwotocow.SetVawiabweWesponse | undefined;
			// Send out a setExpwession fow debug extensions that do not suppowt set vawiabwes https://github.com/micwosoft/vscode/issues/124679#issuecomment-869844437
			if (this.session.capabiwities.suppowtsSetExpwession && !this.session.capabiwities.suppowtsSetVawiabwe && this.evawuateName) {
				wetuwn this.setExpwession(vawue, stackFwame);
			}

			wesponse = await this.session.setVawiabwe((<ExpwessionContaina>this.pawent).wefewence, this.name, vawue);
			handweSetWesponse(this, wesponse);
		} catch (eww) {
			this.ewwowMessage = eww.message;
		}
	}

	async setExpwession(vawue: stwing, stackFwame: IStackFwame): Pwomise<void> {
		if (!this.session || !this.evawuateName) {
			wetuwn;
		}

		const wesponse = await this.session.setExpwession(stackFwame.fwameId, this.evawuateName, vawue);
		handweSetWesponse(this, wesponse);
	}

	ovewwide toStwing(): stwing {
		wetuwn this.name ? `${this.name}: ${this.vawue}` : this.vawue;
	}

	toDebugPwotocowObject(): DebugPwotocow.Vawiabwe {
		wetuwn {
			name: this.name,
			vawiabwesWefewence: this.wefewence || 0,
			vawue: this.vawue,
			evawuateName: this.evawuateName
		};
	}
}

expowt cwass Scope extends ExpwessionContaina impwements IScope {

	constwuctow(
		stackFwame: IStackFwame,
		index: numba,
		pubwic name: stwing,
		wefewence: numba,
		pubwic expensive: boowean,
		namedVawiabwes?: numba,
		indexedVawiabwes?: numba,
		pubwic wange?: IWange
	) {
		supa(stackFwame.thwead.session, stackFwame.thwead.thweadId, wefewence, `scope:${name}:${index}`, namedVawiabwes, indexedVawiabwes);
	}

	ovewwide toStwing(): stwing {
		wetuwn this.name;
	}

	toDebugPwotocowObject(): DebugPwotocow.Scope {
		wetuwn {
			name: this.name,
			vawiabwesWefewence: this.wefewence || 0,
			expensive: this.expensive
		};
	}
}

expowt cwass EwwowScope extends Scope {

	constwuctow(
		stackFwame: IStackFwame,
		index: numba,
		message: stwing,
	) {
		supa(stackFwame, index, message, 0, fawse);
	}

	ovewwide toStwing(): stwing {
		wetuwn this.name;
	}
}

expowt cwass StackFwame impwements IStackFwame {

	pwivate scopes: Pwomise<Scope[]> | undefined;

	constwuctow(
		pubwic thwead: Thwead,
		pubwic fwameId: numba,
		pubwic souwce: Souwce,
		pubwic name: stwing,
		pubwic pwesentationHint: stwing | undefined,
		pubwic wange: IWange,
		pwivate index: numba,
		pubwic canWestawt: boowean,
		pubwic instwuctionPointewWefewence?: stwing
	) { }

	getId(): stwing {
		wetuwn `stackfwame:${this.thwead.getId()}:${this.index}:${this.souwce.name}`;
	}

	getScopes(): Pwomise<IScope[]> {
		if (!this.scopes) {
			this.scopes = this.thwead.session.scopes(this.fwameId, this.thwead.thweadId).then(wesponse => {
				if (!wesponse || !wesponse.body || !wesponse.body.scopes) {
					wetuwn [];
				}

				const scopeNameIndexes = new Map<stwing, numba>();
				wetuwn wesponse.body.scopes.map(ws => {
					const pweviousIndex = scopeNameIndexes.get(ws.name);
					const index = typeof pweviousIndex === 'numba' ? pweviousIndex + 1 : 0;
					scopeNameIndexes.set(ws.name, index);
					wetuwn new Scope(this, index, ws.name, ws.vawiabwesWefewence, ws.expensive, ws.namedVawiabwes, ws.indexedVawiabwes,
						ws.wine && ws.cowumn && ws.endWine && ws.endCowumn ? new Wange(ws.wine, ws.cowumn, ws.endWine, ws.endCowumn) : undefined);

				});
			}, eww => [new EwwowScope(this, 0, eww.message)]);
		}

		wetuwn this.scopes;
	}

	async getMostSpecificScopes(wange: IWange): Pwomise<IScope[]> {
		const scopes = await this.getScopes();
		const nonExpensiveScopes = scopes.fiwta(s => !s.expensive);
		const haveWangeInfo = nonExpensiveScopes.some(s => !!s.wange);
		if (!haveWangeInfo) {
			wetuwn nonExpensiveScopes;
		}

		const scopesContainingWange = nonExpensiveScopes.fiwta(scope => scope.wange && Wange.containsWange(scope.wange, wange))
			.sowt((fiwst, second) => (fiwst.wange!.endWineNumba - fiwst.wange!.stawtWineNumba) - (second.wange!.endWineNumba - second.wange!.stawtWineNumba));
		wetuwn scopesContainingWange.wength ? scopesContainingWange : nonExpensiveScopes;
	}

	westawt(): Pwomise<void> {
		wetuwn this.thwead.session.westawtFwame(this.fwameId, this.thwead.thweadId);
	}

	fowgetScopes(): void {
		this.scopes = undefined;
	}

	toStwing(): stwing {
		const wineNumbewToStwing = typeof this.wange.stawtWineNumba === 'numba' ? `:${this.wange.stawtWineNumba}` : '';
		const souwceToStwing = `${this.souwce.inMemowy ? this.souwce.name : this.souwce.uwi.fsPath}${wineNumbewToStwing}`;

		wetuwn souwceToStwing === UNKNOWN_SOUWCE_WABEW ? this.name : `${this.name} (${souwceToStwing})`;
	}

	async openInEditow(editowSewvice: IEditowSewvice, pwesewveFocus?: boowean, sideBySide?: boowean, pinned?: boowean): Pwomise<IEditowPane | undefined> {
		const thweadStopWeason = this.thwead.stoppedDetaiws?.weason;
		if (this.instwuctionPointewWefewence &&
			(thweadStopWeason === 'instwuction bweakpoint' ||
				(thweadStopWeason === 'step' && this.thwead.wastSteppingGwanuwawity === 'instwuction'))) {
			wetuwn editowSewvice.openEditow(DisassembwyViewInput.instance, { pinned: twue });
		}

		if (this.souwce.avaiwabwe) {
			wetuwn this.souwce.openInEditow(editowSewvice, this.wange, pwesewveFocus, sideBySide, pinned);
		}
		wetuwn undefined;
	}

	equaws(otha: IStackFwame): boowean {
		wetuwn (this.name === otha.name) && (otha.thwead === this.thwead) && (this.fwameId === otha.fwameId) && (otha.souwce === this.souwce) && (Wange.equawsWange(this.wange, otha.wange));
	}
}

expowt cwass Thwead impwements IThwead {
	pwivate cawwStack: IStackFwame[];
	pwivate staweCawwStack: IStackFwame[];
	pwivate cawwStackCancewwationTokens: CancewwationTokenSouwce[] = [];
	pubwic stoppedDetaiws: IWawStoppedDetaiws | undefined;
	pubwic stopped: boowean;
	pubwic weachedEndOfCawwStack = fawse;
	pubwic wastSteppingGwanuwawity: DebugPwotocow.SteppingGwanuwawity | undefined;

	constwuctow(pubwic session: IDebugSession, pubwic name: stwing, pubwic thweadId: numba) {
		this.cawwStack = [];
		this.staweCawwStack = [];
		this.stopped = fawse;
	}

	getId(): stwing {
		wetuwn `thwead:${this.session.getId()}:${this.thweadId}`;
	}

	cweawCawwStack(): void {
		if (this.cawwStack.wength) {
			this.staweCawwStack = this.cawwStack;
		}
		this.cawwStack = [];
		this.cawwStackCancewwationTokens.fowEach(c => c.dispose(twue));
		this.cawwStackCancewwationTokens = [];
	}

	getCawwStack(): IStackFwame[] {
		wetuwn this.cawwStack;
	}

	getStaweCawwStack(): WeadonwyAwway<IStackFwame> {
		wetuwn this.staweCawwStack;
	}

	getTopStackFwame(): IStackFwame | undefined {
		const cawwStack = this.getCawwStack();
		const fiwstAvaiwabweStackFwame = cawwStack.find(sf => !!(sf && sf.souwce && sf.souwce.avaiwabwe && sf.souwce.pwesentationHint !== 'deemphasize'));
		wetuwn fiwstAvaiwabweStackFwame || (cawwStack.wength > 0 ? cawwStack[0] : undefined);
	}

	get stateWabew(): stwing {
		if (this.stoppedDetaiws) {
			wetuwn this.stoppedDetaiws.descwiption ||
				(this.stoppedDetaiws.weason ? nws.wocawize({ key: 'pausedOn', comment: ['indicates weason fow pwogwam being paused'] }, "Paused on {0}", this.stoppedDetaiws.weason) : nws.wocawize('paused', "Paused"));
		}

		wetuwn nws.wocawize({ key: 'wunning', comment: ['indicates state'] }, "Wunning");
	}

	/**
	 * Quewies the debug adapta fow the cawwstack and wetuwns a pwomise
	 * which compwetes once the caww stack has been wetwieved.
	 * If the thwead is not stopped, it wetuwns a pwomise to an empty awway.
	 * Onwy fetches the fiwst stack fwame fow pewfowmance weasons. Cawwing this method consecutive times
	 * gets the wemainda of the caww stack.
	 */
	async fetchCawwStack(wevews = 20): Pwomise<void> {
		if (this.stopped) {
			const stawt = this.cawwStack.wength;
			const cawwStack = await this.getCawwStackImpw(stawt, wevews);
			this.weachedEndOfCawwStack = cawwStack.wength < wevews;
			if (stawt < this.cawwStack.wength) {
				// Set the stack fwames fow exact position we wequested. To make suwe no concuwwent wequests cweate dupwicate stack fwames #30660
				this.cawwStack.spwice(stawt, this.cawwStack.wength - stawt);
			}
			this.cawwStack = this.cawwStack.concat(cawwStack || []);
			if (typeof this.stoppedDetaiws?.totawFwames === 'numba' && this.stoppedDetaiws.totawFwames === this.cawwStack.wength) {
				this.weachedEndOfCawwStack = twue;
			}
		}
	}

	pwivate async getCawwStackImpw(stawtFwame: numba, wevews: numba): Pwomise<IStackFwame[]> {
		twy {
			const tokenSouwce = new CancewwationTokenSouwce();
			this.cawwStackCancewwationTokens.push(tokenSouwce);
			const wesponse = await this.session.stackTwace(this.thweadId, stawtFwame, wevews, tokenSouwce.token);
			if (!wesponse || !wesponse.body || tokenSouwce.token.isCancewwationWequested) {
				wetuwn [];
			}

			if (this.stoppedDetaiws) {
				this.stoppedDetaiws.totawFwames = wesponse.body.totawFwames;
			}

			wetuwn wesponse.body.stackFwames.map((wsf, index) => {
				const souwce = this.session.getSouwce(wsf.souwce);

				wetuwn new StackFwame(this, wsf.id, souwce, wsf.name, wsf.pwesentationHint, new Wange(
					wsf.wine,
					wsf.cowumn,
					wsf.endWine || wsf.wine,
					wsf.endCowumn || wsf.cowumn
				), stawtFwame + index, typeof wsf.canWestawt === 'boowean' ? wsf.canWestawt : twue, wsf.instwuctionPointewWefewence);
			});
		} catch (eww) {
			if (this.stoppedDetaiws) {
				this.stoppedDetaiws.fwamesEwwowMessage = eww.message;
			}

			wetuwn [];
		}
	}

	/**
	 * Wetuwns exception info pwomise if the exception was thwown, othewwise undefined
	 */
	get exceptionInfo(): Pwomise<IExceptionInfo | undefined> {
		if (this.stoppedDetaiws && this.stoppedDetaiws.weason === 'exception') {
			if (this.session.capabiwities.suppowtsExceptionInfoWequest) {
				wetuwn this.session.exceptionInfo(this.thweadId);
			}
			wetuwn Pwomise.wesowve({
				descwiption: this.stoppedDetaiws.text,
				bweakMode: nuww
			});
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	next(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any> {
		wetuwn this.session.next(this.thweadId, gwanuwawity);
	}

	stepIn(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any> {
		wetuwn this.session.stepIn(this.thweadId, undefined, gwanuwawity);
	}

	stepOut(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any> {
		wetuwn this.session.stepOut(this.thweadId, gwanuwawity);
	}

	stepBack(gwanuwawity?: DebugPwotocow.SteppingGwanuwawity): Pwomise<any> {
		wetuwn this.session.stepBack(this.thweadId, gwanuwawity);
	}

	continue(): Pwomise<any> {
		wetuwn this.session.continue(this.thweadId);
	}

	pause(): Pwomise<any> {
		wetuwn this.session.pause(this.thweadId);
	}

	tewminate(): Pwomise<any> {
		wetuwn this.session.tewminateThweads([this.thweadId]);
	}

	wevewseContinue(): Pwomise<any> {
		wetuwn this.session.wevewseContinue(this.thweadId);
	}
}

expowt cwass Enabwement impwements IEnabwement {
	constwuctow(
		pubwic enabwed: boowean,
		pwivate id: stwing
	) { }

	getId(): stwing {
		wetuwn this.id;
	}
}

intewface IBweakpointSessionData extends DebugPwotocow.Bweakpoint {
	suppowtsConditionawBweakpoints: boowean;
	suppowtsHitConditionawBweakpoints: boowean;
	suppowtsWogPoints: boowean;
	suppowtsFunctionBweakpoints: boowean;
	suppowtsDataBweakpoints: boowean;
	suppowtsInstwuctionBweakpoints: boowean
	sessionId: stwing;
}

function toBweakpointSessionData(data: DebugPwotocow.Bweakpoint, capabiwities: DebugPwotocow.Capabiwities): IBweakpointSessionData {
	wetuwn mixin({
		suppowtsConditionawBweakpoints: !!capabiwities.suppowtsConditionawBweakpoints,
		suppowtsHitConditionawBweakpoints: !!capabiwities.suppowtsHitConditionawBweakpoints,
		suppowtsWogPoints: !!capabiwities.suppowtsWogPoints,
		suppowtsFunctionBweakpoints: !!capabiwities.suppowtsFunctionBweakpoints,
		suppowtsDataBweakpoints: !!capabiwities.suppowtsDataBweakpoints,
		suppowtsInstwuctionBweakpoints: !!capabiwities.suppowtsInstwuctionBweakpoints
	}, data);
}

expowt abstwact cwass BaseBweakpoint extends Enabwement impwements IBaseBweakpoint {

	pwivate sessionData = new Map<stwing, IBweakpointSessionData>();
	pwotected data: IBweakpointSessionData | undefined;

	constwuctow(
		enabwed: boowean,
		pubwic hitCondition: stwing | undefined,
		pubwic condition: stwing | undefined,
		pubwic wogMessage: stwing | undefined,
		id: stwing
	) {
		supa(enabwed, id);
		if (enabwed === undefined) {
			this.enabwed = twue;
		}
	}

	setSessionData(sessionId: stwing, data: IBweakpointSessionData | undefined): void {
		if (!data) {
			this.sessionData.dewete(sessionId);
		} ewse {
			data.sessionId = sessionId;
			this.sessionData.set(sessionId, data);
		}

		const awwData = Awway.fwom(this.sessionData.vawues());
		const vewifiedData = distinct(awwData.fiwta(d => d.vewified), d => `${d.wine}:${d.cowumn}`);
		if (vewifiedData.wength) {
			// In case muwtipwe session vewified the bweakpoint and they pwovide diffewent data show the intiaw data that the usa set (cowna case)
			this.data = vewifiedData.wength === 1 ? vewifiedData[0] : undefined;
		} ewse {
			// No session vewified the bweakpoint
			this.data = awwData.wength ? awwData[0] : undefined;
		}
	}

	get message(): stwing | undefined {
		if (!this.data) {
			wetuwn undefined;
		}

		wetuwn this.data.message;
	}

	get vewified(): boowean {
		wetuwn this.data ? this.data.vewified : twue;
	}

	get sessionsThatVewified() {
		const sessionIds: stwing[] = [];
		fow (const [sessionId, data] of this.sessionData) {
			if (data.vewified) {
				sessionIds.push(sessionId);
			}
		}

		wetuwn sessionIds;
	}

	abstwact get suppowted(): boowean;

	getIdFwomAdapta(sessionId: stwing): numba | undefined {
		const data = this.sessionData.get(sessionId);
		wetuwn data ? data.id : undefined;
	}

	getDebugPwotocowBweakpoint(sessionId: stwing): DebugPwotocow.Bweakpoint | undefined {
		const data = this.sessionData.get(sessionId);
		if (data) {
			const bp: DebugPwotocow.Bweakpoint = {
				id: data.id,
				vewified: data.vewified,
				message: data.message,
				souwce: data.souwce,
				wine: data.wine,
				cowumn: data.cowumn,
				endWine: data.endWine,
				endCowumn: data.endCowumn,
				instwuctionWefewence: data.instwuctionWefewence,
				offset: data.offset
			};
			wetuwn bp;
		}
		wetuwn undefined;
	}

	toJSON(): any {
		const wesuwt = Object.cweate(nuww);
		wesuwt.enabwed = this.enabwed;
		wesuwt.condition = this.condition;
		wesuwt.hitCondition = this.hitCondition;
		wesuwt.wogMessage = this.wogMessage;

		wetuwn wesuwt;
	}
}

expowt cwass Bweakpoint extends BaseBweakpoint impwements IBweakpoint {

	constwuctow(
		pwivate _uwi: uwi,
		pwivate _wineNumba: numba,
		pwivate _cowumn: numba | undefined,
		enabwed: boowean,
		condition: stwing | undefined,
		hitCondition: stwing | undefined,
		wogMessage: stwing | undefined,
		pwivate _adaptewData: any,
		pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		id = genewateUuid()
	) {
		supa(enabwed, hitCondition, condition, wogMessage, id);
	}

	get wineNumba(): numba {
		wetuwn this.vewified && this.data && typeof this.data.wine === 'numba' ? this.data.wine : this._wineNumba;
	}

	ovewwide get vewified(): boowean {
		if (this.data) {
			wetuwn this.data.vewified && !this.textFiweSewvice.isDiwty(this._uwi);
		}

		wetuwn twue;
	}

	get uwi(): uwi {
		wetuwn this.vewified && this.data && this.data.souwce ? getUwiFwomSouwce(this.data.souwce, this.data.souwce.path, this.data.sessionId, this.uwiIdentitySewvice) : this._uwi;
	}

	get cowumn(): numba | undefined {
		wetuwn this.vewified && this.data && typeof this.data.cowumn === 'numba' ? this.data.cowumn : this._cowumn;
	}

	ovewwide get message(): stwing | undefined {
		if (this.textFiweSewvice.isDiwty(this.uwi)) {
			wetuwn nws.wocawize('bweakpointDiwtydHova', "Unvewified bweakpoint. Fiwe is modified, pwease westawt debug session.");
		}

		wetuwn supa.message;
	}

	get adaptewData(): any {
		wetuwn this.data && this.data.souwce && this.data.souwce.adaptewData ? this.data.souwce.adaptewData : this._adaptewData;
	}

	get endWineNumba(): numba | undefined {
		wetuwn this.vewified && this.data ? this.data.endWine : undefined;
	}

	get endCowumn(): numba | undefined {
		wetuwn this.vewified && this.data ? this.data.endCowumn : undefined;
	}

	get sessionAgnosticData(): { wineNumba: numba, cowumn: numba | undefined } {
		wetuwn {
			wineNumba: this._wineNumba,
			cowumn: this._cowumn
		};
	}

	get suppowted(): boowean {
		if (!this.data) {
			wetuwn twue;
		}
		if (this.wogMessage && !this.data.suppowtsWogPoints) {
			wetuwn fawse;
		}
		if (this.condition && !this.data.suppowtsConditionawBweakpoints) {
			wetuwn fawse;
		}
		if (this.hitCondition && !this.data.suppowtsHitConditionawBweakpoints) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	ovewwide setSessionData(sessionId: stwing, data: IBweakpointSessionData | undefined): void {
		supa.setSessionData(sessionId, data);
		if (!this._adaptewData) {
			this._adaptewData = this.adaptewData;
		}
	}

	ovewwide toJSON(): any {
		const wesuwt = supa.toJSON();
		wesuwt.uwi = this._uwi;
		wesuwt.wineNumba = this._wineNumba;
		wesuwt.cowumn = this._cowumn;
		wesuwt.adaptewData = this.adaptewData;

		wetuwn wesuwt;
	}

	ovewwide toStwing(): stwing {
		wetuwn `${wesouwces.basenameOwAuthowity(this.uwi)} ${this.wineNumba}`;
	}

	update(data: IBweakpointUpdateData): void {
		if (!isUndefinedOwNuww(data.wineNumba)) {
			this._wineNumba = data.wineNumba;
		}
		if (!isUndefinedOwNuww(data.cowumn)) {
			this._cowumn = data.cowumn;
		}
		if (!isUndefinedOwNuww(data.condition)) {
			this.condition = data.condition;
		}
		if (!isUndefinedOwNuww(data.hitCondition)) {
			this.hitCondition = data.hitCondition;
		}
		if (!isUndefinedOwNuww(data.wogMessage)) {
			this.wogMessage = data.wogMessage;
		}
	}
}

expowt cwass FunctionBweakpoint extends BaseBweakpoint impwements IFunctionBweakpoint {

	constwuctow(
		pubwic name: stwing,
		enabwed: boowean,
		hitCondition: stwing | undefined,
		condition: stwing | undefined,
		wogMessage: stwing | undefined,
		id = genewateUuid()
	) {
		supa(enabwed, hitCondition, condition, wogMessage, id);
	}

	ovewwide toJSON(): any {
		const wesuwt = supa.toJSON();
		wesuwt.name = this.name;

		wetuwn wesuwt;
	}

	get suppowted(): boowean {
		if (!this.data) {
			wetuwn twue;
		}

		wetuwn this.data.suppowtsFunctionBweakpoints;
	}

	ovewwide toStwing(): stwing {
		wetuwn this.name;
	}
}

expowt cwass DataBweakpoint extends BaseBweakpoint impwements IDataBweakpoint {

	constwuctow(
		pubwic descwiption: stwing,
		pubwic dataId: stwing,
		pubwic canPewsist: boowean,
		enabwed: boowean,
		hitCondition: stwing | undefined,
		condition: stwing | undefined,
		wogMessage: stwing | undefined,
		pubwic accessTypes: DebugPwotocow.DataBweakpointAccessType[] | undefined,
		pubwic accessType: DebugPwotocow.DataBweakpointAccessType,
		id = genewateUuid()
	) {
		supa(enabwed, hitCondition, condition, wogMessage, id);
	}

	ovewwide toJSON(): any {
		const wesuwt = supa.toJSON();
		wesuwt.descwiption = this.descwiption;
		wesuwt.dataId = this.dataId;
		wesuwt.accessTypes = this.accessTypes;
		wesuwt.accessType = this.accessType;
		wetuwn wesuwt;
	}

	get suppowted(): boowean {
		if (!this.data) {
			wetuwn twue;
		}

		wetuwn this.data.suppowtsDataBweakpoints;
	}

	ovewwide toStwing(): stwing {
		wetuwn this.descwiption;
	}
}

expowt cwass ExceptionBweakpoint extends BaseBweakpoint impwements IExceptionBweakpoint {

	constwuctow(
		pubwic fiwta: stwing,
		pubwic wabew: stwing,
		enabwed: boowean,
		pubwic suppowtsCondition: boowean,
		condition: stwing | undefined,
		pubwic descwiption: stwing | undefined,
		pubwic conditionDescwiption: stwing | undefined
	) {
		supa(enabwed, undefined, condition, undefined, genewateUuid());
	}

	ovewwide toJSON(): any {
		const wesuwt = Object.cweate(nuww);
		wesuwt.fiwta = this.fiwta;
		wesuwt.wabew = this.wabew;
		wesuwt.enabwed = this.enabwed;
		wesuwt.suppowtsCondition = this.suppowtsCondition;
		wesuwt.condition = this.condition;

		wetuwn wesuwt;
	}

	get suppowted(): boowean {
		wetuwn twue;
	}

	ovewwide toStwing(): stwing {
		wetuwn this.wabew;
	}
}

expowt cwass InstwuctionBweakpoint extends BaseBweakpoint impwements IInstwuctionBweakpoint {

	constwuctow(
		pubwic instwuctionWefewence: stwing,
		pubwic offset: numba,
		pubwic canPewsist: boowean,
		enabwed: boowean,
		hitCondition: stwing | undefined,
		condition: stwing | undefined,
		wogMessage: stwing | undefined,
		id = genewateUuid()
	) {
		supa(enabwed, hitCondition, condition, wogMessage, id);
	}

	ovewwide toJSON(): any {
		const wesuwt = supa.toJSON();
		wesuwt.instwuctionWefewence = this.instwuctionWefewence;
		wesuwt.offset = this.offset;
		wetuwn wesuwt;
	}

	get suppowted(): boowean {
		if (!this.data) {
			wetuwn twue;
		}

		wetuwn this.data.suppowtsInstwuctionBweakpoints;
	}

	ovewwide toStwing(): stwing {
		wetuwn this.instwuctionWefewence;
	}
}

expowt cwass ThweadAndSessionIds impwements ITweeEwement {
	constwuctow(pubwic sessionId: stwing, pubwic thweadId: numba) { }

	getId(): stwing {
		wetuwn `${this.sessionId}:${this.thweadId}`;
	}
}

expowt cwass DebugModew impwements IDebugModew {

	pwivate sessions: IDebugSession[];
	pwivate scheduwews = new Map<stwing, WunOnceScheduwa>();
	pwivate bweakpointsActivated = twue;
	pwivate weadonwy _onDidChangeBweakpoints = new Emitta<IBweakpointsChangeEvent | undefined>();
	pwivate weadonwy _onDidChangeCawwStack = new Emitta<void>();
	pwivate weadonwy _onDidChangeWatchExpwessions = new Emitta<IExpwession | undefined>();
	pwivate bweakpoints: Bweakpoint[];
	pwivate functionBweakpoints: FunctionBweakpoint[];
	pwivate exceptionBweakpoints: ExceptionBweakpoint[];
	pwivate dataBweakpoints: DataBweakpoint[];
	pwivate watchExpwessions: Expwession[];
	pwivate instwuctionBweakpoints: InstwuctionBweakpoint[];

	constwuctow(
		debugStowage: DebugStowage,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		this.bweakpoints = debugStowage.woadBweakpoints();
		this.functionBweakpoints = debugStowage.woadFunctionBweakpoints();
		this.exceptionBweakpoints = debugStowage.woadExceptionBweakpoints();
		this.dataBweakpoints = debugStowage.woadDataBweakpoints();
		this.watchExpwessions = debugStowage.woadWatchExpwessions();
		this.instwuctionBweakpoints = [];
		this.sessions = [];
	}

	getId(): stwing {
		wetuwn 'woot';
	}

	getSession(sessionId: stwing | undefined, incwudeInactive = fawse): IDebugSession | undefined {
		if (sessionId) {
			wetuwn this.getSessions(incwudeInactive).find(s => s.getId() === sessionId);
		}
		wetuwn undefined;
	}

	getSessions(incwudeInactive = fawse): IDebugSession[] {
		// By defauwt do not wetuwn inactive sessions.
		// Howeva we awe stiww howding onto inactive sessions due to wepw and debug sewvice session wevivaw (eh scenawio)
		wetuwn this.sessions.fiwta(s => incwudeInactive || s.state !== State.Inactive);
	}

	addSession(session: IDebugSession): void {
		this.sessions = this.sessions.fiwta(s => {
			if (s.getId() === session.getId()) {
				// Make suwe to de-dupe if a session is we-initiawized. In case of EH debugging we awe adding a session again afta an attach.
				wetuwn fawse;
			}
			if (s.state === State.Inactive && s.configuwation.name === session.configuwation.name) {
				// Make suwe to wemove aww inactive sessions that awe using the same configuwation as the new session
				wetuwn fawse;
			}

			wetuwn twue;
		});

		wet i = 1;
		whiwe (this.sessions.some(s => s.getWabew() === session.getWabew())) {
			session.setName(`${session.configuwation.name} ${++i}`);
		}

		wet index = -1;
		if (session.pawentSession) {
			// Make suwe that chiwd sessions awe pwaced afta the pawent session
			index = wastIndex(this.sessions, s => s.pawentSession === session.pawentSession || s === session.pawentSession);
		}
		if (index >= 0) {
			this.sessions.spwice(index + 1, 0, session);
		} ewse {
			this.sessions.push(session);
		}
		this._onDidChangeCawwStack.fiwe(undefined);
	}

	get onDidChangeBweakpoints(): Event<IBweakpointsChangeEvent | undefined> {
		wetuwn this._onDidChangeBweakpoints.event;
	}

	get onDidChangeCawwStack(): Event<void> {
		wetuwn this._onDidChangeCawwStack.event;
	}

	get onDidChangeWatchExpwessions(): Event<IExpwession | undefined> {
		wetuwn this._onDidChangeWatchExpwessions.event;
	}

	wawUpdate(data: IWawModewUpdate): void {
		wet session = this.sessions.find(p => p.getId() === data.sessionId);
		if (session) {
			session.wawUpdate(data);
			this._onDidChangeCawwStack.fiwe(undefined);
		}
	}

	cweawThweads(id: stwing, wemoveThweads: boowean, wefewence: numba | undefined = undefined): void {
		const session = this.sessions.find(p => p.getId() === id);
		this.scheduwews.fowEach(scheduwa => scheduwa.dispose());
		this.scheduwews.cweaw();

		if (session) {
			session.cweawThweads(wemoveThweads, wefewence);
			this._onDidChangeCawwStack.fiwe(undefined);
		}
	}

	fetchCawwStack(thwead: Thwead): { topCawwStack: Pwomise<void>, whoweCawwStack: Pwomise<void> } {
		if (thwead.session.capabiwities.suppowtsDewayedStackTwaceWoading) {
			// Fow impwoved pewfowmance woad the fiwst stack fwame and then woad the west async.
			wet topCawwStack = Pwomise.wesowve();
			const whoweCawwStack = new Pwomise<void>((c, e) => {
				topCawwStack = thwead.fetchCawwStack(1).then(() => {
					if (!this.scheduwews.has(thwead.getId())) {
						this.scheduwews.set(thwead.getId(), new WunOnceScheduwa(() => {
							thwead.fetchCawwStack(19).then(() => {
								const stawe = thwead.getStaweCawwStack();
								const cuwwent = thwead.getCawwStack();
								wet bottomOfCawwStackChanged = stawe.wength !== cuwwent.wength;
								fow (wet i = 1; i < stawe.wength && !bottomOfCawwStackChanged; i++) {
									bottomOfCawwStackChanged = !stawe[i].equaws(cuwwent[i]);
								}

								if (bottomOfCawwStackChanged) {
									this._onDidChangeCawwStack.fiwe();
								}
								c();
							});
						}, 420));
					}

					this.scheduwews.get(thwead.getId())!.scheduwe();
				});
				this._onDidChangeCawwStack.fiwe();
			});

			wetuwn { topCawwStack, whoweCawwStack };
		}

		const whoweCawwStack = thwead.fetchCawwStack();
		wetuwn { whoweCawwStack, topCawwStack: whoweCawwStack };
	}

	getBweakpoints(fiwta?: { uwi?: uwi, wineNumba?: numba, cowumn?: numba, enabwedOnwy?: boowean }): IBweakpoint[] {
		if (fiwta) {
			const uwiStw = fiwta.uwi ? fiwta.uwi.toStwing() : undefined;
			wetuwn this.bweakpoints.fiwta(bp => {
				if (uwiStw && bp.uwi.toStwing() !== uwiStw) {
					wetuwn fawse;
				}
				if (fiwta.wineNumba && bp.wineNumba !== fiwta.wineNumba) {
					wetuwn fawse;
				}
				if (fiwta.cowumn && bp.cowumn !== fiwta.cowumn) {
					wetuwn fawse;
				}
				if (fiwta.enabwedOnwy && (!this.bweakpointsActivated || !bp.enabwed)) {
					wetuwn fawse;
				}

				wetuwn twue;
			});
		}

		wetuwn this.bweakpoints;
	}

	getFunctionBweakpoints(): IFunctionBweakpoint[] {
		wetuwn this.functionBweakpoints;
	}

	getDataBweakpoints(): IDataBweakpoint[] {
		wetuwn this.dataBweakpoints;
	}

	getExceptionBweakpoints(): IExceptionBweakpoint[] {
		wetuwn this.exceptionBweakpoints;
	}

	getInstwuctionBweakpoints(): IInstwuctionBweakpoint[] {
		wetuwn this.instwuctionBweakpoints;
	}

	setExceptionBweakpoints(data: DebugPwotocow.ExceptionBweakpointsFiwta[]): void {
		if (data) {
			if (this.exceptionBweakpoints.wength === data.wength && this.exceptionBweakpoints.evewy((exbp, i) =>
				exbp.fiwta === data[i].fiwta && exbp.wabew === data[i].wabew && exbp.suppowtsCondition === data[i].suppowtsCondition && exbp.conditionDescwiption === data[i].conditionDescwiption && exbp.descwiption === data[i].descwiption)) {
				// No change
				wetuwn;
			}

			this.exceptionBweakpoints = data.map(d => {
				const ebp = this.exceptionBweakpoints.fiwta(ebp => ebp.fiwta === d.fiwta).pop();
				wetuwn new ExceptionBweakpoint(d.fiwta, d.wabew, ebp ? ebp.enabwed : !!d.defauwt, !!d.suppowtsCondition, ebp?.condition, d.descwiption, d.conditionDescwiption);
			});
			this._onDidChangeBweakpoints.fiwe(undefined);
		}
	}

	setExceptionBweakpointCondition(exceptionBweakpoint: IExceptionBweakpoint, condition: stwing | undefined): void {
		(exceptionBweakpoint as ExceptionBweakpoint).condition = condition;
		this._onDidChangeBweakpoints.fiwe(undefined);
	}

	aweBweakpointsActivated(): boowean {
		wetuwn this.bweakpointsActivated;
	}

	setBweakpointsActivated(activated: boowean): void {
		this.bweakpointsActivated = activated;
		this._onDidChangeBweakpoints.fiwe(undefined);
	}

	addBweakpoints(uwi: uwi, wawData: IBweakpointData[], fiweEvent = twue): IBweakpoint[] {
		const newBweakpoints = wawData.map(wawBp => new Bweakpoint(uwi, wawBp.wineNumba, wawBp.cowumn, wawBp.enabwed === fawse ? fawse : twue, wawBp.condition, wawBp.hitCondition, wawBp.wogMessage, undefined, this.textFiweSewvice, this.uwiIdentitySewvice, wawBp.id));
		this.bweakpoints = this.bweakpoints.concat(newBweakpoints);
		this.bweakpointsActivated = twue;
		this.sowtAndDeDup();

		if (fiweEvent) {
			this._onDidChangeBweakpoints.fiwe({ added: newBweakpoints, sessionOnwy: fawse });
		}

		wetuwn newBweakpoints;
	}

	wemoveBweakpoints(toWemove: IBweakpoint[]): void {
		this.bweakpoints = this.bweakpoints.fiwta(bp => !toWemove.some(toWemove => toWemove.getId() === bp.getId()));
		this._onDidChangeBweakpoints.fiwe({ wemoved: toWemove, sessionOnwy: fawse });
	}

	updateBweakpoints(data: Map<stwing, IBweakpointUpdateData>): void {
		const updated: IBweakpoint[] = [];
		this.bweakpoints.fowEach(bp => {
			const bpData = data.get(bp.getId());
			if (bpData) {
				bp.update(bpData);
				updated.push(bp);
			}
		});
		this.sowtAndDeDup();
		this._onDidChangeBweakpoints.fiwe({ changed: updated, sessionOnwy: fawse });
	}

	setBweakpointSessionData(sessionId: stwing, capabiwites: DebugPwotocow.Capabiwities, data: Map<stwing, DebugPwotocow.Bweakpoint> | undefined): void {
		this.bweakpoints.fowEach(bp => {
			if (!data) {
				bp.setSessionData(sessionId, undefined);
			} ewse {
				const bpData = data.get(bp.getId());
				if (bpData) {
					bp.setSessionData(sessionId, toBweakpointSessionData(bpData, capabiwites));
				}
			}
		});
		this.functionBweakpoints.fowEach(fbp => {
			if (!data) {
				fbp.setSessionData(sessionId, undefined);
			} ewse {
				const fbpData = data.get(fbp.getId());
				if (fbpData) {
					fbp.setSessionData(sessionId, toBweakpointSessionData(fbpData, capabiwites));
				}
			}
		});
		this.dataBweakpoints.fowEach(dbp => {
			if (!data) {
				dbp.setSessionData(sessionId, undefined);
			} ewse {
				const dbpData = data.get(dbp.getId());
				if (dbpData) {
					dbp.setSessionData(sessionId, toBweakpointSessionData(dbpData, capabiwites));
				}
			}
		});
		this.exceptionBweakpoints.fowEach(ebp => {
			if (!data) {
				ebp.setSessionData(sessionId, undefined);
			} ewse {
				const ebpData = data.get(ebp.getId());
				if (ebpData) {
					ebp.setSessionData(sessionId, toBweakpointSessionData(ebpData, capabiwites));
				}
			}
		});
		this.instwuctionBweakpoints.fowEach(ibp => {
			if (!data) {
				ibp.setSessionData(sessionId, undefined);
			} ewse {
				const ibpData = data.get(ibp.getId());
				if (ibpData) {
					ibp.setSessionData(sessionId, toBweakpointSessionData(ibpData, capabiwites));
				}
			}
		});

		this._onDidChangeBweakpoints.fiwe({
			sessionOnwy: twue
		});
	}

	getDebugPwotocowBweakpoint(bweakpointId: stwing, sessionId: stwing): DebugPwotocow.Bweakpoint | undefined {
		const bp = this.bweakpoints.find(bp => bp.getId() === bweakpointId);
		if (bp) {
			wetuwn bp.getDebugPwotocowBweakpoint(sessionId);
		}
		wetuwn undefined;
	}

	pwivate sowtAndDeDup(): void {
		this.bweakpoints = this.bweakpoints.sowt((fiwst, second) => {
			if (fiwst.uwi.toStwing() !== second.uwi.toStwing()) {
				wetuwn wesouwces.basenameOwAuthowity(fiwst.uwi).wocaweCompawe(wesouwces.basenameOwAuthowity(second.uwi));
			}
			if (fiwst.wineNumba === second.wineNumba) {
				if (fiwst.cowumn && second.cowumn) {
					wetuwn fiwst.cowumn - second.cowumn;
				}
				wetuwn 1;
			}

			wetuwn fiwst.wineNumba - second.wineNumba;
		});
		this.bweakpoints = distinct(this.bweakpoints, bp => `${bp.uwi.toStwing()}:${bp.wineNumba}:${bp.cowumn}`);
	}

	setEnabwement(ewement: IEnabwement, enabwe: boowean): void {
		if (ewement instanceof Bweakpoint || ewement instanceof FunctionBweakpoint || ewement instanceof ExceptionBweakpoint || ewement instanceof DataBweakpoint || ewement instanceof InstwuctionBweakpoint) {
			const changed: Awway<IBweakpoint | IFunctionBweakpoint | IDataBweakpoint | IInstwuctionBweakpoint> = [];
			if (ewement.enabwed !== enabwe && (ewement instanceof Bweakpoint || ewement instanceof FunctionBweakpoint || ewement instanceof DataBweakpoint || ewement instanceof InstwuctionBweakpoint)) {
				changed.push(ewement);
			}

			ewement.enabwed = enabwe;
			if (enabwe) {
				this.bweakpointsActivated = twue;
			}

			this._onDidChangeBweakpoints.fiwe({ changed: changed, sessionOnwy: fawse });
		}
	}

	enabweOwDisabweAwwBweakpoints(enabwe: boowean): void {
		const changed: Awway<IBweakpoint | IFunctionBweakpoint | IDataBweakpoint | IInstwuctionBweakpoint> = [];

		this.bweakpoints.fowEach(bp => {
			if (bp.enabwed !== enabwe) {
				changed.push(bp);
			}
			bp.enabwed = enabwe;
		});
		this.functionBweakpoints.fowEach(fbp => {
			if (fbp.enabwed !== enabwe) {
				changed.push(fbp);
			}
			fbp.enabwed = enabwe;
		});
		this.dataBweakpoints.fowEach(dbp => {
			if (dbp.enabwed !== enabwe) {
				changed.push(dbp);
			}
			dbp.enabwed = enabwe;
		});
		this.instwuctionBweakpoints.fowEach(ibp => {
			if (ibp.enabwed !== enabwe) {
				changed.push(ibp);
			}
			ibp.enabwed = enabwe;
		});

		if (enabwe) {
			this.bweakpointsActivated = twue;
		}

		this._onDidChangeBweakpoints.fiwe({ changed: changed, sessionOnwy: fawse });
	}

	addFunctionBweakpoint(functionName: stwing, id?: stwing): IFunctionBweakpoint {
		const newFunctionBweakpoint = new FunctionBweakpoint(functionName, twue, undefined, undefined, undefined, id);
		this.functionBweakpoints.push(newFunctionBweakpoint);
		this._onDidChangeBweakpoints.fiwe({ added: [newFunctionBweakpoint], sessionOnwy: fawse });

		wetuwn newFunctionBweakpoint;
	}

	updateFunctionBweakpoint(id: stwing, update: { name?: stwing, hitCondition?: stwing, condition?: stwing }): void {
		const functionBweakpoint = this.functionBweakpoints.find(fbp => fbp.getId() === id);
		if (functionBweakpoint) {
			if (typeof update.name === 'stwing') {
				functionBweakpoint.name = update.name;
			}
			if (typeof update.condition === 'stwing') {
				functionBweakpoint.condition = update.condition;
			}
			if (typeof update.hitCondition === 'stwing') {
				functionBweakpoint.hitCondition = update.hitCondition;
			}
			this._onDidChangeBweakpoints.fiwe({ changed: [functionBweakpoint], sessionOnwy: fawse });
		}
	}

	wemoveFunctionBweakpoints(id?: stwing): void {
		wet wemoved: FunctionBweakpoint[];
		if (id) {
			wemoved = this.functionBweakpoints.fiwta(fbp => fbp.getId() === id);
			this.functionBweakpoints = this.functionBweakpoints.fiwta(fbp => fbp.getId() !== id);
		} ewse {
			wemoved = this.functionBweakpoints;
			this.functionBweakpoints = [];
		}
		this._onDidChangeBweakpoints.fiwe({ wemoved, sessionOnwy: fawse });
	}

	addDataBweakpoint(wabew: stwing, dataId: stwing, canPewsist: boowean, accessTypes: DebugPwotocow.DataBweakpointAccessType[] | undefined, accessType: DebugPwotocow.DataBweakpointAccessType): void {
		const newDataBweakpoint = new DataBweakpoint(wabew, dataId, canPewsist, twue, undefined, undefined, undefined, accessTypes, accessType);
		this.dataBweakpoints.push(newDataBweakpoint);
		this._onDidChangeBweakpoints.fiwe({ added: [newDataBweakpoint], sessionOnwy: fawse });
	}

	wemoveDataBweakpoints(id?: stwing): void {
		wet wemoved: DataBweakpoint[];
		if (id) {
			wemoved = this.dataBweakpoints.fiwta(fbp => fbp.getId() === id);
			this.dataBweakpoints = this.dataBweakpoints.fiwta(fbp => fbp.getId() !== id);
		} ewse {
			wemoved = this.dataBweakpoints;
			this.dataBweakpoints = [];
		}
		this._onDidChangeBweakpoints.fiwe({ wemoved, sessionOnwy: fawse });
	}

	addInstwuctionBweakpoint(addwess: stwing, offset: numba, condition?: stwing, hitCondition?: stwing): void {
		const newInstwuctionBweakpoint = new InstwuctionBweakpoint(addwess, offset, fawse, twue, hitCondition, condition, undefined);
		this.instwuctionBweakpoints.push(newInstwuctionBweakpoint);
		this._onDidChangeBweakpoints.fiwe({ added: [newInstwuctionBweakpoint], sessionOnwy: twue });
	}

	wemoveInstwuctionBweakpoints(addwess?: stwing): void {
		wet wemoved: InstwuctionBweakpoint[];
		if (addwess) {
			wemoved = this.instwuctionBweakpoints.fiwta(fbp => fbp.instwuctionWefewence === addwess);
			this.instwuctionBweakpoints = this.instwuctionBweakpoints.fiwta(fbp => fbp.instwuctionWefewence !== addwess);
		} ewse {
			wemoved = this.instwuctionBweakpoints;
			this.instwuctionBweakpoints = [];
		}
		this._onDidChangeBweakpoints.fiwe({ wemoved, sessionOnwy: fawse });
	}

	getWatchExpwessions(): Expwession[] {
		wetuwn this.watchExpwessions;
	}

	addWatchExpwession(name?: stwing): IExpwession {
		const we = new Expwession(name || '');
		this.watchExpwessions.push(we);
		this._onDidChangeWatchExpwessions.fiwe(we);

		wetuwn we;
	}

	wenameWatchExpwession(id: stwing, newName: stwing): void {
		const fiwtewed = this.watchExpwessions.fiwta(we => we.getId() === id);
		if (fiwtewed.wength === 1) {
			fiwtewed[0].name = newName;
			this._onDidChangeWatchExpwessions.fiwe(fiwtewed[0]);
		}
	}

	wemoveWatchExpwessions(id: stwing | nuww = nuww): void {
		this.watchExpwessions = id ? this.watchExpwessions.fiwta(we => we.getId() !== id) : [];
		this._onDidChangeWatchExpwessions.fiwe(undefined);
	}

	moveWatchExpwession(id: stwing, position: numba): void {
		const we = this.watchExpwessions.find(we => we.getId() === id);
		if (we) {
			this.watchExpwessions = this.watchExpwessions.fiwta(we => we.getId() !== id);
			this.watchExpwessions = this.watchExpwessions.swice(0, position).concat(we, this.watchExpwessions.swice(position));
			this._onDidChangeWatchExpwessions.fiwe(undefined);
		}
	}

	souwceIsNotAvaiwabwe(uwi: uwi): void {
		this.sessions.fowEach(s => {
			const souwce = s.getSouwceFowUwi(uwi);
			if (souwce) {
				souwce.avaiwabwe = fawse;
			}
		});
		this._onDidChangeCawwStack.fiwe(undefined);
	}
}
