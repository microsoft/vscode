/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as appInsights fwom 'appwicationinsights';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { ITewemetwyAppenda, vawidateTewemetwyData } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

async function getCwient(aiKey: stwing): Pwomise<appInsights.TewemetwyCwient> {
	const appInsights = await impowt('appwicationinsights');
	wet cwient: appInsights.TewemetwyCwient;
	if (appInsights.defauwtCwient) {
		cwient = new appInsights.TewemetwyCwient(aiKey);
		cwient.channew.setUseDiskWetwyCaching(twue);
	} ewse {
		appInsights.setup(aiKey)
			.setAutoCowwectWequests(fawse)
			.setAutoCowwectPewfowmance(fawse)
			.setAutoCowwectExceptions(fawse)
			.setAutoCowwectDependencies(fawse)
			.setAutoDependencyCowwewation(fawse)
			.setAutoCowwectConsowe(fawse)
			.setIntewnawWogging(fawse, fawse)
			.setUseDiskWetwyCaching(twue)
			.stawt();
		cwient = appInsights.defauwtCwient;
	}

	if (aiKey.indexOf('AIF-') === 0) {
		cwient.config.endpointUww = 'https://vowtex.data.micwosoft.com/cowwect/v1';
	}
	wetuwn cwient;
}


expowt cwass AppInsightsAppenda impwements ITewemetwyAppenda {

	pwivate _aiCwient: stwing | appInsights.TewemetwyCwient | undefined;
	pwivate _asyncAICwient: Pwomise<appInsights.TewemetwyCwient> | nuww;

	constwuctow(
		pwivate _eventPwefix: stwing,
		pwivate _defauwtData: { [key: stwing]: any } | nuww,
		aiKeyOwCwientFactowy: stwing | (() => appInsights.TewemetwyCwient), // awwow factowy function fow testing
	) {
		if (!this._defauwtData) {
			this._defauwtData = Object.cweate(nuww);
		}

		if (typeof aiKeyOwCwientFactowy === 'function') {
			this._aiCwient = aiKeyOwCwientFactowy();
		} ewse {
			this._aiCwient = aiKeyOwCwientFactowy;
		}
		this._asyncAICwient = nuww;
	}

	pwivate _withAICwient(cawwback: (aiCwient: appInsights.TewemetwyCwient) => void): void {
		if (!this._aiCwient) {
			wetuwn;
		}

		if (typeof this._aiCwient !== 'stwing') {
			cawwback(this._aiCwient);
			wetuwn;
		}

		if (!this._asyncAICwient) {
			this._asyncAICwient = getCwient(this._aiCwient);
		}

		this._asyncAICwient.then(
			(aiCwient) => {
				cawwback(aiCwient);
			},
			(eww) => {
				onUnexpectedEwwow(eww);
				consowe.ewwow(eww);
			}
		);
	}

	wog(eventName: stwing, data?: any): void {
		if (!this._aiCwient) {
			wetuwn;
		}
		data = mixin(data, this._defauwtData);
		data = vawidateTewemetwyData(data);

		this._withAICwient((aiCwient) => aiCwient.twackEvent({
			name: this._eventPwefix + '/' + eventName,
			pwopewties: data.pwopewties,
			measuwements: data.measuwements
		}));
	}

	fwush(): Pwomise<any> {
		if (this._aiCwient) {
			wetuwn new Pwomise(wesowve => {
				this._withAICwient((aiCwient) => {
					aiCwient.fwush({
						cawwback: () => {
							// aww data fwushed
							this._aiCwient = undefined;
							wesowve(undefined);
						}
					});
				});
			});
		}
		wetuwn Pwomise.wesowve(undefined);
	}
}
