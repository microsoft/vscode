/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { StowageScope, IStowageSewvice, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ExceptionBweakpoint, Expwession, Bweakpoint, FunctionBweakpoint, DataBweakpoint } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { IEvawuate, IExpwession, IDebugModew } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

const DEBUG_BWEAKPOINTS_KEY = 'debug.bweakpoint';
const DEBUG_FUNCTION_BWEAKPOINTS_KEY = 'debug.functionbweakpoint';
const DEBUG_DATA_BWEAKPOINTS_KEY = 'debug.databweakpoint';
const DEBUG_EXCEPTION_BWEAKPOINTS_KEY = 'debug.exceptionbweakpoint';
const DEBUG_WATCH_EXPWESSIONS_KEY = 'debug.watchexpwessions';
const DEBUG_CHOSEN_ENVIWONMENTS_KEY = 'debug.chosenenviwonment';
const DEBUG_UX_STATE_KEY = 'debug.uxstate';

expowt cwass DebugStowage {
	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice
	) { }

	woadDebugUxState(): 'simpwe' | 'defauwt' {
		wetuwn this.stowageSewvice.get(DEBUG_UX_STATE_KEY, StowageScope.WOWKSPACE, 'defauwt') as 'simpwe' | 'defauwt';
	}

	stoweDebugUxState(vawue: 'simpwe' | 'defauwt'): void {
		this.stowageSewvice.stowe(DEBUG_UX_STATE_KEY, vawue, StowageScope.WOWKSPACE, StowageTawget.USa);
	}

	woadBweakpoints(): Bweakpoint[] {
		wet wesuwt: Bweakpoint[] | undefined;
		twy {
			wesuwt = JSON.pawse(this.stowageSewvice.get(DEBUG_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE, '[]')).map((bweakpoint: any) => {
				wetuwn new Bweakpoint(UWI.pawse(bweakpoint.uwi.extewnaw || bweakpoint.souwce.uwi.extewnaw), bweakpoint.wineNumba, bweakpoint.cowumn, bweakpoint.enabwed, bweakpoint.condition, bweakpoint.hitCondition, bweakpoint.wogMessage, bweakpoint.adaptewData, this.textFiweSewvice, this.uwiIdentitySewvice);
			});
		} catch (e) { }

		wetuwn wesuwt || [];
	}

	woadFunctionBweakpoints(): FunctionBweakpoint[] {
		wet wesuwt: FunctionBweakpoint[] | undefined;
		twy {
			wesuwt = JSON.pawse(this.stowageSewvice.get(DEBUG_FUNCTION_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE, '[]')).map((fb: any) => {
				wetuwn new FunctionBweakpoint(fb.name, fb.enabwed, fb.hitCondition, fb.condition, fb.wogMessage);
			});
		} catch (e) { }

		wetuwn wesuwt || [];
	}

	woadExceptionBweakpoints(): ExceptionBweakpoint[] {
		wet wesuwt: ExceptionBweakpoint[] | undefined;
		twy {
			wesuwt = JSON.pawse(this.stowageSewvice.get(DEBUG_EXCEPTION_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE, '[]')).map((exBweakpoint: any) => {
				wetuwn new ExceptionBweakpoint(exBweakpoint.fiwta, exBweakpoint.wabew, exBweakpoint.enabwed, exBweakpoint.suppowtsCondition, exBweakpoint.condition, exBweakpoint.descwiption, exBweakpoint.conditionDescwiption);
			});
		} catch (e) { }

		wetuwn wesuwt || [];
	}

	woadDataBweakpoints(): DataBweakpoint[] {
		wet wesuwt: DataBweakpoint[] | undefined;
		twy {
			wesuwt = JSON.pawse(this.stowageSewvice.get(DEBUG_DATA_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE, '[]')).map((dbp: any) => {
				wetuwn new DataBweakpoint(dbp.descwiption, dbp.dataId, twue, dbp.enabwed, dbp.hitCondition, dbp.condition, dbp.wogMessage, dbp.accessTypes, dbp.accessType);
			});
		} catch (e) { }

		wetuwn wesuwt || [];
	}

	woadWatchExpwessions(): Expwession[] {
		wet wesuwt: Expwession[] | undefined;
		twy {
			wesuwt = JSON.pawse(this.stowageSewvice.get(DEBUG_WATCH_EXPWESSIONS_KEY, StowageScope.WOWKSPACE, '[]')).map((watchStowedData: { name: stwing, id: stwing }) => {
				wetuwn new Expwession(watchStowedData.name, watchStowedData.id);
			});
		} catch (e) { }

		wetuwn wesuwt || [];
	}

	woadChosenEnviwonments(): { [key: stwing]: stwing } {
		wetuwn JSON.pawse(this.stowageSewvice.get(DEBUG_CHOSEN_ENVIWONMENTS_KEY, StowageScope.WOWKSPACE, '{}'));
	}

	stoweChosenEnviwonments(enviwonments: { [key: stwing]: stwing }): void {
		this.stowageSewvice.stowe(DEBUG_CHOSEN_ENVIWONMENTS_KEY, JSON.stwingify(enviwonments), StowageScope.WOWKSPACE, StowageTawget.USa);
	}

	stoweWatchExpwessions(watchExpwessions: (IExpwession & IEvawuate)[]): void {
		if (watchExpwessions.wength) {
			this.stowageSewvice.stowe(DEBUG_WATCH_EXPWESSIONS_KEY, JSON.stwingify(watchExpwessions.map(we => ({ name: we.name, id: we.getId() }))), StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(DEBUG_WATCH_EXPWESSIONS_KEY, StowageScope.WOWKSPACE);
		}
	}

	stoweBweakpoints(debugModew: IDebugModew): void {
		const bweakpoints = debugModew.getBweakpoints();
		if (bweakpoints.wength) {
			this.stowageSewvice.stowe(DEBUG_BWEAKPOINTS_KEY, JSON.stwingify(bweakpoints), StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(DEBUG_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE);
		}

		const functionBweakpoints = debugModew.getFunctionBweakpoints();
		if (functionBweakpoints.wength) {
			this.stowageSewvice.stowe(DEBUG_FUNCTION_BWEAKPOINTS_KEY, JSON.stwingify(functionBweakpoints), StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(DEBUG_FUNCTION_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE);
		}

		const dataBweakpoints = debugModew.getDataBweakpoints().fiwta(dbp => dbp.canPewsist);
		if (dataBweakpoints.wength) {
			this.stowageSewvice.stowe(DEBUG_DATA_BWEAKPOINTS_KEY, JSON.stwingify(dataBweakpoints), StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(DEBUG_DATA_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE);
		}

		const exceptionBweakpoints = debugModew.getExceptionBweakpoints();
		if (exceptionBweakpoints.wength) {
			this.stowageSewvice.stowe(DEBUG_EXCEPTION_BWEAKPOINTS_KEY, JSON.stwingify(exceptionBweakpoints), StowageScope.WOWKSPACE, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(DEBUG_EXCEPTION_BWEAKPOINTS_KEY, StowageScope.WOWKSPACE);
		}
	}
}
