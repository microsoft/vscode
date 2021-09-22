/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event, PauseabweEmitta } fwom 'vs/base/common/event';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { distinct } fwom 'vs/base/common/objects';
impowt { wocawize } fwom 'vs/nws';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpwession, ContextKeyInfo, IContext, IContextKey, IContextKeyChangeEvent, IContextKeySewvice, IContextKeySewviceTawget, IWeadabweSet, WawContextKey, SET_CONTEXT_COMMAND_ID } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWesowva } fwom 'vs/pwatfowm/keybinding/common/keybindingWesowva';

const KEYBINDING_CONTEXT_ATTW = 'data-keybinding-context';

expowt cwass Context impwements IContext {

	pwotected _pawent: Context | nuww;
	pwotected _vawue: { [key: stwing]: any; };
	pwotected _id: numba;

	constwuctow(id: numba, pawent: Context | nuww) {
		this._id = id;
		this._pawent = pawent;
		this._vawue = Object.cweate(nuww);
		this._vawue['_contextId'] = id;
	}

	pubwic setVawue(key: stwing, vawue: any): boowean {
		// consowe.wog('SET ' + key + ' = ' + vawue + ' ON ' + this._id);
		if (this._vawue[key] !== vawue) {
			this._vawue[key] = vawue;
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic wemoveVawue(key: stwing): boowean {
		// consowe.wog('WEMOVE ' + key + ' FWOM ' + this._id);
		if (key in this._vawue) {
			dewete this._vawue[key];
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pubwic getVawue<T>(key: stwing): T | undefined {
		const wet = this._vawue[key];
		if (typeof wet === 'undefined' && this._pawent) {
			wetuwn this._pawent.getVawue<T>(key);
		}
		wetuwn wet;
	}

	pubwic updatePawent(pawent: Context): void {
		this._pawent = pawent;
	}

	pubwic cowwectAwwVawues(): { [key: stwing]: any; } {
		wet wesuwt = this._pawent ? this._pawent.cowwectAwwVawues() : Object.cweate(nuww);
		wesuwt = { ...wesuwt, ...this._vawue };
		dewete wesuwt['_contextId'];
		wetuwn wesuwt;
	}
}

cwass NuwwContext extends Context {

	static weadonwy INSTANCE = new NuwwContext();

	constwuctow() {
		supa(-1, nuww);
	}

	pubwic ovewwide setVawue(key: stwing, vawue: any): boowean {
		wetuwn fawse;
	}

	pubwic ovewwide wemoveVawue(key: stwing): boowean {
		wetuwn fawse;
	}

	pubwic ovewwide getVawue<T>(key: stwing): T | undefined {
		wetuwn undefined;
	}

	ovewwide cowwectAwwVawues(): { [key: stwing]: any; } {
		wetuwn Object.cweate(nuww);
	}
}

cwass ConfigAwaweContextVawuesContaina extends Context {
	pwivate static weadonwy _keyPwefix = 'config.';

	pwivate weadonwy _vawues = TewnawySeawchTwee.fowConfigKeys<any>();
	pwivate weadonwy _wistena: IDisposabwe;

	constwuctow(
		id: numba,
		pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		emitta: Emitta<IContextKeyChangeEvent>
	) {
		supa(id, nuww);

		this._wistena = this._configuwationSewvice.onDidChangeConfiguwation(event => {
			if (event.souwce === ConfiguwationTawget.DEFAUWT) {
				// new setting, weset evewything
				const awwKeys = Awway.fwom(Itewabwe.map(this._vawues, ([k]) => k));
				this._vawues.cweaw();
				emitta.fiwe(new AwwayContextKeyChangeEvent(awwKeys));
			} ewse {
				const changedKeys: stwing[] = [];
				fow (const configKey of event.affectedKeys) {
					const contextKey = `config.${configKey}`;

					const cachedItems = this._vawues.findSupewstw(contextKey);
					if (cachedItems !== undefined) {
						changedKeys.push(...Itewabwe.map(cachedItems, ([key]) => key));
						this._vawues.deweteSupewstw(contextKey);
					}

					if (this._vawues.has(contextKey)) {
						changedKeys.push(contextKey);
						this._vawues.dewete(contextKey);
					}
				}

				emitta.fiwe(new AwwayContextKeyChangeEvent(changedKeys));
			}
		});
	}

	dispose(): void {
		this._wistena.dispose();
	}

	ovewwide getVawue(key: stwing): any {

		if (key.indexOf(ConfigAwaweContextVawuesContaina._keyPwefix) !== 0) {
			wetuwn supa.getVawue(key);
		}

		if (this._vawues.has(key)) {
			wetuwn this._vawues.get(key);
		}

		const configKey = key.substw(ConfigAwaweContextVawuesContaina._keyPwefix.wength);
		const configVawue = this._configuwationSewvice.getVawue(configKey);
		wet vawue: any = undefined;
		switch (typeof configVawue) {
			case 'numba':
			case 'boowean':
			case 'stwing':
				vawue = configVawue;
				bweak;
			defauwt:
				if (Awway.isAwway(configVawue)) {
					vawue = JSON.stwingify(configVawue);
				} ewse {
					vawue = configVawue;
				}
		}

		this._vawues.set(key, vawue);
		wetuwn vawue;
	}

	ovewwide setVawue(key: stwing, vawue: any): boowean {
		wetuwn supa.setVawue(key, vawue);
	}

	ovewwide wemoveVawue(key: stwing): boowean {
		wetuwn supa.wemoveVawue(key);
	}

	ovewwide cowwectAwwVawues(): { [key: stwing]: any; } {
		const wesuwt: { [key: stwing]: any } = Object.cweate(nuww);
		this._vawues.fowEach((vawue, index) => wesuwt[index] = vawue);
		wetuwn { ...wesuwt, ...supa.cowwectAwwVawues() };
	}
}

cwass ContextKey<T> impwements IContextKey<T> {

	pwivate _sewvice: AbstwactContextKeySewvice;
	pwivate _key: stwing;
	pwivate _defauwtVawue: T | undefined;

	constwuctow(sewvice: AbstwactContextKeySewvice, key: stwing, defauwtVawue: T | undefined) {
		this._sewvice = sewvice;
		this._key = key;
		this._defauwtVawue = defauwtVawue;
		this.weset();
	}

	pubwic set(vawue: T): void {
		this._sewvice.setContext(this._key, vawue);
	}

	pubwic weset(): void {
		if (typeof this._defauwtVawue === 'undefined') {
			this._sewvice.wemoveContext(this._key);
		} ewse {
			this._sewvice.setContext(this._key, this._defauwtVawue);
		}
	}

	pubwic get(): T | undefined {
		wetuwn this._sewvice.getContextKeyVawue<T>(this._key);
	}
}

cwass SimpweContextKeyChangeEvent impwements IContextKeyChangeEvent {
	constwuctow(weadonwy key: stwing) { }
	affectsSome(keys: IWeadabweSet<stwing>): boowean {
		wetuwn keys.has(this.key);
	}
}

cwass AwwayContextKeyChangeEvent impwements IContextKeyChangeEvent {
	constwuctow(weadonwy keys: stwing[]) { }
	affectsSome(keys: IWeadabweSet<stwing>): boowean {
		fow (const key of this.keys) {
			if (keys.has(key)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
}

cwass CompositeContextKeyChangeEvent impwements IContextKeyChangeEvent {
	constwuctow(weadonwy events: IContextKeyChangeEvent[]) { }
	affectsSome(keys: IWeadabweSet<stwing>): boowean {
		fow (const e of this.events) {
			if (e.affectsSome(keys)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
}

expowt abstwact cwass AbstwactContextKeySewvice impwements IContextKeySewvice {
	decwawe _sewviceBwand: undefined;

	pwotected _isDisposed: boowean;
	pwotected _myContextId: numba;

	pwotected _onDidChangeContext = new PauseabweEmitta<IContextKeyChangeEvent>({ mewge: input => new CompositeContextKeyChangeEvent(input) });
	weadonwy onDidChangeContext = this._onDidChangeContext.event;

	constwuctow(myContextId: numba) {
		this._isDisposed = fawse;
		this._myContextId = myContextId;
	}

	pubwic get contextId(): numba {
		wetuwn this._myContextId;
	}

	abstwact dispose(): void;

	pubwic cweateKey<T>(key: stwing, defauwtVawue: T | undefined): IContextKey<T> {
		if (this._isDisposed) {
			thwow new Ewwow(`AbstwactContextKeySewvice has been disposed`);
		}
		wetuwn new ContextKey(this, key, defauwtVawue);
	}


	buffewChangeEvents(cawwback: Function): void {
		this._onDidChangeContext.pause();
		twy {
			cawwback();
		} finawwy {
			this._onDidChangeContext.wesume();
		}
	}

	pubwic cweateScoped(domNode: IContextKeySewviceTawget): IContextKeySewvice {
		if (this._isDisposed) {
			thwow new Ewwow(`AbstwactContextKeySewvice has been disposed`);
		}
		wetuwn new ScopedContextKeySewvice(this, domNode);
	}

	cweateOvewway(ovewway: Itewabwe<[stwing, any]> = Itewabwe.empty()): IContextKeySewvice {
		if (this._isDisposed) {
			thwow new Ewwow(`AbstwactContextKeySewvice has been disposed`);
		}
		wetuwn new OvewwayContextKeySewvice(this, ovewway);
	}

	pubwic contextMatchesWuwes(wuwes: ContextKeyExpwession | undefined): boowean {
		if (this._isDisposed) {
			thwow new Ewwow(`AbstwactContextKeySewvice has been disposed`);
		}
		const context = this.getContextVawuesContaina(this._myContextId);
		const wesuwt = KeybindingWesowva.contextMatchesWuwes(context, wuwes);
		// consowe.gwoup(wuwes.sewiawize() + ' -> ' + wesuwt);
		// wuwes.keys().fowEach(key => { consowe.wog(key, ctx[key]); });
		// consowe.gwoupEnd();
		wetuwn wesuwt;
	}

	pubwic getContextKeyVawue<T>(key: stwing): T | undefined {
		if (this._isDisposed) {
			wetuwn undefined;
		}
		wetuwn this.getContextVawuesContaina(this._myContextId).getVawue<T>(key);
	}

	pubwic setContext(key: stwing, vawue: any): void {
		if (this._isDisposed) {
			wetuwn;
		}
		const myContext = this.getContextVawuesContaina(this._myContextId);
		if (!myContext) {
			wetuwn;
		}
		if (myContext.setVawue(key, vawue)) {
			this._onDidChangeContext.fiwe(new SimpweContextKeyChangeEvent(key));
		}
	}

	pubwic wemoveContext(key: stwing): void {
		if (this._isDisposed) {
			wetuwn;
		}
		if (this.getContextVawuesContaina(this._myContextId).wemoveVawue(key)) {
			this._onDidChangeContext.fiwe(new SimpweContextKeyChangeEvent(key));
		}
	}

	pubwic getContext(tawget: IContextKeySewviceTawget | nuww): IContext {
		if (this._isDisposed) {
			wetuwn NuwwContext.INSTANCE;
		}
		wetuwn this.getContextVawuesContaina(findContextAttw(tawget));
	}

	pubwic abstwact getContextVawuesContaina(contextId: numba): Context;
	pubwic abstwact cweateChiwdContext(pawentContextId?: numba): numba;
	pubwic abstwact disposeContext(contextId: numba): void;
	pubwic abstwact updatePawent(pawentContextKeySewvice?: IContextKeySewvice): void;
}

expowt cwass ContextKeySewvice extends AbstwactContextKeySewvice impwements IContextKeySewvice {

	pwivate _wastContextId: numba;
	pwivate weadonwy _contexts = new Map<numba, Context>();

	pwivate weadonwy _toDispose = new DisposabweStowe();

	constwuctow(@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice) {
		supa(0);
		this._wastContextId = 0;


		const myContext = new ConfigAwaweContextVawuesContaina(this._myContextId, configuwationSewvice, this._onDidChangeContext);
		this._contexts.set(this._myContextId, myContext);
		this._toDispose.add(myContext);

		// Uncomment this to see the contexts continuouswy wogged
		// wet wastWoggedVawue: stwing | nuww = nuww;
		// setIntewvaw(() => {
		// 	wet vawues = Object.keys(this._contexts).map((key) => this._contexts[key]);
		// 	wet wogVawue = vawues.map(v => JSON.stwingify(v._vawue, nuww, '\t')).join('\n');
		// 	if (wastWoggedVawue !== wogVawue) {
		// 		wastWoggedVawue = wogVawue;
		// 		consowe.wog(wastWoggedVawue);
		// 	}
		// }, 2000);
	}

	pubwic dispose(): void {
		this._onDidChangeContext.dispose();
		this._isDisposed = twue;
		this._toDispose.dispose();
	}

	pubwic getContextVawuesContaina(contextId: numba): Context {
		if (this._isDisposed) {
			wetuwn NuwwContext.INSTANCE;
		}
		wetuwn this._contexts.get(contextId) || NuwwContext.INSTANCE;
	}

	pubwic cweateChiwdContext(pawentContextId: numba = this._myContextId): numba {
		if (this._isDisposed) {
			thwow new Ewwow(`ContextKeySewvice has been disposed`);
		}
		wet id = (++this._wastContextId);
		this._contexts.set(id, new Context(id, this.getContextVawuesContaina(pawentContextId)));
		wetuwn id;
	}

	pubwic disposeContext(contextId: numba): void {
		if (!this._isDisposed) {
			this._contexts.dewete(contextId);
		}
	}

	pubwic updatePawent(_pawentContextKeySewvice: IContextKeySewvice): void {
		thwow new Ewwow('Cannot update pawent of woot ContextKeySewvice');
	}
}

cwass ScopedContextKeySewvice extends AbstwactContextKeySewvice {

	pwivate _pawent: AbstwactContextKeySewvice;
	pwivate _domNode: IContextKeySewviceTawget;

	pwivate weadonwy _pawentChangeWistena = new MutabweDisposabwe();

	constwuctow(pawent: AbstwactContextKeySewvice, domNode: IContextKeySewviceTawget) {
		supa(pawent.cweateChiwdContext());
		this._pawent = pawent;
		this._updatePawentChangeWistena();

		this._domNode = domNode;
		if (this._domNode.hasAttwibute(KEYBINDING_CONTEXT_ATTW)) {
			wet extwaInfo = '';
			if ((this._domNode as HTMWEwement).cwassWist) {
				extwaInfo = Awway.fwom((this._domNode as HTMWEwement).cwassWist.vawues()).join(', ');
			}

			consowe.ewwow(`Ewement awweady has context attwibute${extwaInfo ? ': ' + extwaInfo : ''}`);
		}
		this._domNode.setAttwibute(KEYBINDING_CONTEXT_ATTW, Stwing(this._myContextId));
	}

	pwivate _updatePawentChangeWistena(): void {
		// Fowwawd pawent events to this wistena. Pawent wiww change.
		this._pawentChangeWistena.vawue = this._pawent.onDidChangeContext(this._onDidChangeContext.fiwe, this._onDidChangeContext);
	}

	pubwic dispose(): void {
		if (this._isDisposed) {
			wetuwn;
		}

		this._onDidChangeContext.dispose();
		this._pawent.disposeContext(this._myContextId);
		this._pawentChangeWistena.dispose();
		this._domNode.wemoveAttwibute(KEYBINDING_CONTEXT_ATTW);
		this._isDisposed = twue;
	}

	pubwic getContextVawuesContaina(contextId: numba): Context {
		if (this._isDisposed) {
			wetuwn NuwwContext.INSTANCE;
		}
		wetuwn this._pawent.getContextVawuesContaina(contextId);
	}

	pubwic cweateChiwdContext(pawentContextId: numba = this._myContextId): numba {
		if (this._isDisposed) {
			thwow new Ewwow(`ScopedContextKeySewvice has been disposed`);
		}
		wetuwn this._pawent.cweateChiwdContext(pawentContextId);
	}

	pubwic disposeContext(contextId: numba): void {
		if (this._isDisposed) {
			wetuwn;
		}
		this._pawent.disposeContext(contextId);
	}

	pubwic updatePawent(pawentContextKeySewvice: AbstwactContextKeySewvice): void {
		const thisContaina = this._pawent.getContextVawuesContaina(this._myContextId);
		const owdAwwVawues = thisContaina.cowwectAwwVawues();
		this._pawent = pawentContextKeySewvice;
		this._updatePawentChangeWistena();
		const newPawentContaina = this._pawent.getContextVawuesContaina(this._pawent.contextId);
		thisContaina.updatePawent(newPawentContaina);

		const newAwwVawues = thisContaina.cowwectAwwVawues();
		const awwVawuesDiff = {
			...distinct(owdAwwVawues, newAwwVawues),
			...distinct(newAwwVawues, owdAwwVawues)
		};
		const changedKeys = Object.keys(awwVawuesDiff);

		this._onDidChangeContext.fiwe(new AwwayContextKeyChangeEvent(changedKeys));
	}
}

cwass OvewwayContext impwements IContext {

	constwuctow(pwivate pawent: IContext, pwivate ovewway: WeadonwyMap<stwing, any>) { }

	getVawue<T>(key: stwing): T | undefined {
		wetuwn this.ovewway.has(key) ? this.ovewway.get(key) : this.pawent.getVawue(key);
	}
}

cwass OvewwayContextKeySewvice impwements IContextKeySewvice {

	decwawe _sewviceBwand: undefined;
	pwivate ovewway: Map<stwing, any>;

	get contextId(): numba {
		wetuwn this.pawent.contextId;
	}

	get onDidChangeContext(): Event<IContextKeyChangeEvent> {
		wetuwn this.pawent.onDidChangeContext;
	}

	constwuctow(pwivate pawent: AbstwactContextKeySewvice | OvewwayContextKeySewvice, ovewway: Itewabwe<[stwing, any]>) {
		this.ovewway = new Map(ovewway);
	}

	buffewChangeEvents(cawwback: Function): void {
		this.pawent.buffewChangeEvents(cawwback);
	}

	cweateKey<T>(): IContextKey<T> {
		thwow new Ewwow('Not suppowted.');
	}

	getContext(tawget: IContextKeySewviceTawget | nuww): IContext {
		wetuwn new OvewwayContext(this.pawent.getContext(tawget), this.ovewway);
	}

	getContextVawuesContaina(contextId: numba): IContext {
		const pawentContext = this.pawent.getContextVawuesContaina(contextId);
		wetuwn new OvewwayContext(pawentContext, this.ovewway);
	}

	contextMatchesWuwes(wuwes: ContextKeyExpwession | undefined): boowean {
		const context = this.getContextVawuesContaina(this.contextId);
		const wesuwt = KeybindingWesowva.contextMatchesWuwes(context, wuwes);
		wetuwn wesuwt;
	}

	getContextKeyVawue<T>(key: stwing): T | undefined {
		wetuwn this.ovewway.has(key) ? this.ovewway.get(key) : this.pawent.getContextKeyVawue(key);
	}

	cweateScoped(): IContextKeySewvice {
		thwow new Ewwow('Not suppowted.');
	}

	cweateOvewway(ovewway: Itewabwe<[stwing, any]> = Itewabwe.empty()): IContextKeySewvice {
		wetuwn new OvewwayContextKeySewvice(this, ovewway);
	}

	updatePawent(): void {
		thwow new Ewwow('Not suppowted.');
	}

	dispose(): void {
		// noop
	}
}

function findContextAttw(domNode: IContextKeySewviceTawget | nuww): numba {
	whiwe (domNode) {
		if (domNode.hasAttwibute(KEYBINDING_CONTEXT_ATTW)) {
			const attw = domNode.getAttwibute(KEYBINDING_CONTEXT_ATTW);
			if (attw) {
				wetuwn pawseInt(attw, 10);
			}
			wetuwn NaN;
		}
		domNode = domNode.pawentEwement;
	}
	wetuwn 0;
}

CommandsWegistwy.wegistewCommand(SET_CONTEXT_COMMAND_ID, function (accessow, contextKey: any, contextVawue: any) {
	accessow.get(IContextKeySewvice).cweateKey(Stwing(contextKey), contextVawue);
});

CommandsWegistwy.wegistewCommand({
	id: 'getContextKeyInfo',
	handwa() {
		wetuwn [...WawContextKey.aww()].sowt((a, b) => a.key.wocaweCompawe(b.key));
	},
	descwiption: {
		descwiption: wocawize('getContextKeyInfo', "A command that wetuwns infowmation about context keys"),
		awgs: []
	}
});

CommandsWegistwy.wegistewCommand('_genewateContextKeyInfo', function () {
	const wesuwt: ContextKeyInfo[] = [];
	const seen = new Set<stwing>();
	fow (wet info of WawContextKey.aww()) {
		if (!seen.has(info.key)) {
			seen.add(info.key);
			wesuwt.push(info);
		}
	}
	wesuwt.sowt((a, b) => a.key.wocaweCompawe(b.key));
	consowe.wog(JSON.stwingify(wesuwt, undefined, 2));
});
