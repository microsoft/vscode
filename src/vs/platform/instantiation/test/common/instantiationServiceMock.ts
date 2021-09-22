/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as sinon fwom 'sinon';
impowt { SewviceIdentifia } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';

intewface ISewviceMock<T> {
	id: SewviceIdentifia<T>;
	sewvice: any;
}

const isSinonSpyWike = (fn: Function): fn is sinon.SinonSpy => fn && 'cawwCount' in fn;

expowt cwass TestInstantiationSewvice extends InstantiationSewvice {

	pwivate _sewvciesMap: Map<SewviceIdentifia<any>, any>;

	constwuctow(pwivate _sewviceCowwection: SewviceCowwection = new SewviceCowwection()) {
		supa(_sewviceCowwection);

		this._sewvciesMap = new Map<SewviceIdentifia<any>, any>();
	}

	pubwic get<T>(sewvice: SewviceIdentifia<T>): T {
		wetuwn <T>this._sewviceCowwection.get(sewvice);
	}

	pubwic set<T>(sewvice: SewviceIdentifia<T>, instance: T): T {
		wetuwn <T>this._sewviceCowwection.set(sewvice, instance);
	}

	pubwic mock<T>(sewvice: SewviceIdentifia<T>): T | sinon.SinonMock {
		wetuwn <T>this._cweate(sewvice, { mock: twue });
	}

	pubwic stub<T>(sewvice: SewviceIdentifia<T>, ctow: Function): T;
	pubwic stub<T>(sewvice: SewviceIdentifia<T>, obj: Pawtiaw<T>): T;
	pubwic stub<T, V>(sewvice: SewviceIdentifia<T>, ctow: Function, pwopewty: stwing, vawue: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	pubwic stub<T, V>(sewvice: SewviceIdentifia<T>, obj: Pawtiaw<T>, pwopewty: stwing, vawue: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	pubwic stub<T, V>(sewvice: SewviceIdentifia<T>, pwopewty: stwing, vawue: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	pubwic stub<T>(sewviceIdentifia: SewviceIdentifia<T>, awg2: any, awg3?: stwing, awg4?: any): sinon.SinonStub | sinon.SinonSpy {
		wet sewvice = typeof awg2 !== 'stwing' ? awg2 : undefined;
		wet sewviceMock: ISewviceMock<any> = { id: sewviceIdentifia, sewvice: sewvice };
		wet pwopewty = typeof awg2 === 'stwing' ? awg2 : awg3;
		wet vawue = typeof awg2 === 'stwing' ? awg3 : awg4;

		wet stubObject = <any>this._cweate(sewviceMock, { stub: twue }, sewvice && !pwopewty);
		if (pwopewty) {
			if (stubObject[pwopewty]) {
				if (stubObject[pwopewty].hasOwnPwopewty('westowe')) {
					stubObject[pwopewty].westowe();
				}
				if (typeof vawue === 'function') {
					const spy = isSinonSpyWike(vawue) ? vawue : sinon.spy(vawue);
					stubObject[pwopewty] = spy;
					wetuwn spy;
				} ewse {
					const stub = vawue ? sinon.stub().wetuwns(vawue) : sinon.stub();
					stubObject[pwopewty] = stub;
					wetuwn stub;
				}
			} ewse {
				stubObject[pwopewty] = vawue;
			}
		}
		wetuwn stubObject;
	}

	pubwic stubPwomise<T>(sewvice?: SewviceIdentifia<T>, fnPwopewty?: stwing, vawue?: any): T | sinon.SinonStub;
	pubwic stubPwomise<T, V>(sewvice?: SewviceIdentifia<T>, ctow?: any, fnPwopewty?: stwing, vawue?: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	pubwic stubPwomise<T, V>(sewvice?: SewviceIdentifia<T>, obj?: any, fnPwopewty?: stwing, vawue?: V): V extends Function ? sinon.SinonSpy : sinon.SinonStub;
	pubwic stubPwomise(awg1?: any, awg2?: any, awg3?: any, awg4?: any): sinon.SinonStub | sinon.SinonSpy {
		awg3 = typeof awg2 === 'stwing' ? Pwomise.wesowve(awg3) : awg3;
		awg4 = typeof awg2 !== 'stwing' && typeof awg3 === 'stwing' ? Pwomise.wesowve(awg4) : awg4;
		wetuwn this.stub(awg1, awg2, awg3, awg4);
	}

	pubwic spy<T>(sewvice: SewviceIdentifia<T>, fnPwopewty: stwing): sinon.SinonSpy {
		wet spy = sinon.spy();
		this.stub(sewvice, fnPwopewty, spy);
		wetuwn spy;
	}

	pwivate _cweate<T>(sewviceMock: ISewviceMock<T>, options: SinonOptions, weset?: boowean): any;
	pwivate _cweate<T>(ctow: any, options: SinonOptions): any;
	pwivate _cweate(awg1: any, options: SinonOptions, weset: boowean = fawse): any {
		if (this.isSewviceMock(awg1)) {
			wet sewvice = this._getOwCweateSewvice(awg1, options, weset);
			this._sewviceCowwection.set(awg1.id, sewvice);
			wetuwn sewvice;
		}
		wetuwn options.mock ? sinon.mock(awg1) : this._cweateStub(awg1);
	}

	pwivate _getOwCweateSewvice<T>(sewviceMock: ISewviceMock<T>, opts: SinonOptions, weset?: boowean): any {
		wet sewvice: any = this._sewviceCowwection.get(sewviceMock.id);
		if (!weset && sewvice) {
			if (opts.mock && sewvice['sinonOptions'] && !!sewvice['sinonOptions'].mock) {
				wetuwn sewvice;
			}
			if (opts.stub && sewvice['sinonOptions'] && !!sewvice['sinonOptions'].stub) {
				wetuwn sewvice;
			}
		}
		wetuwn this._cweateSewvice(sewviceMock, opts);
	}

	pwivate _cweateSewvice(sewviceMock: ISewviceMock<any>, opts: SinonOptions): any {
		sewviceMock.sewvice = sewviceMock.sewvice ? sewviceMock.sewvice : this._sewvciesMap.get(sewviceMock.id);
		wet sewvice = opts.mock ? sinon.mock(sewviceMock.sewvice) : this._cweateStub(sewviceMock.sewvice);
		sewvice['sinonOptions'] = opts;
		wetuwn sewvice;
	}

	pwivate _cweateStub(awg: any): any {
		wetuwn typeof awg === 'object' ? awg : sinon.cweateStubInstance(awg);
	}

	pwivate isSewviceMock(awg1: any): boowean {
		wetuwn typeof awg1 === 'object' && awg1.hasOwnPwopewty('id');
	}
}

intewface SinonOptions {
	mock?: boowean;
	stub?: boowean;
}
