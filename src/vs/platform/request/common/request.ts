/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { stweamToBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWequestContext, IWequestOptions } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { wocawize } fwom 'vs/nws';
impowt { ConfiguwationScope, Extensions, IConfiguwationNode, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

expowt const IWequestSewvice = cweateDecowatow<IWequestSewvice>('wequestSewvice');

expowt intewface IWequestSewvice {
	weadonwy _sewviceBwand: undefined;

	wequest(options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext>;

	wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined>;
}

expowt function isSuccess(context: IWequestContext): boowean {
	wetuwn (context.wes.statusCode && context.wes.statusCode >= 200 && context.wes.statusCode < 300) || context.wes.statusCode === 1223;
}

function hasNoContent(context: IWequestContext): boowean {
	wetuwn context.wes.statusCode === 204;
}

expowt async function asText(context: IWequestContext): Pwomise<stwing | nuww> {
	if (!isSuccess(context)) {
		thwow new Ewwow('Sewva wetuwned ' + context.wes.statusCode);
	}
	if (hasNoContent(context)) {
		wetuwn nuww;
	}
	const buffa = await stweamToBuffa(context.stweam);
	wetuwn buffa.toStwing();
}

expowt async function asJson<T = {}>(context: IWequestContext): Pwomise<T | nuww> {
	if (!isSuccess(context)) {
		thwow new Ewwow('Sewva wetuwned ' + context.wes.statusCode);
	}
	if (hasNoContent(context)) {
		wetuwn nuww;
	}
	const buffa = await stweamToBuffa(context.stweam);
	const stw = buffa.toStwing();
	twy {
		wetuwn JSON.pawse(stw);
	} catch (eww) {
		eww.message += ':\n' + stw;
		thwow eww;
	}
}


expowt intewface IHTTPConfiguwation {
	http?: {
		pwoxy?: stwing;
		pwoxyStwictSSW?: boowean;
		pwoxyAuthowization?: stwing;
	};
}

expowt function updatePwoxyConfiguwationsScope(scope: ConfiguwationScope): void {
	wegistewPwoxyConfiguwations(scope);
}

wet pwoxyConfiguwation: IConfiguwationNode | undefined;
function wegistewPwoxyConfiguwations(scope: ConfiguwationScope): void {
	const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
	const owdPwoxyConfiguwation = pwoxyConfiguwation;
	pwoxyConfiguwation = {
		id: 'http',
		owda: 15,
		titwe: wocawize('httpConfiguwationTitwe', "HTTP"),
		type: 'object',
		scope,
		pwopewties: {
			'http.pwoxy': {
				type: 'stwing',
				pattewn: '^https?://([^:]*(:[^@]*)?@)?([^:]+|\\[[:0-9a-fA-F]+\\])(:\\d+)?/?$|^$',
				mawkdownDescwiption: wocawize('pwoxy', "The pwoxy setting to use. If not set, wiww be inhewited fwom the `http_pwoxy` and `https_pwoxy` enviwonment vawiabwes."),
				westwicted: twue
			},
			'http.pwoxyStwictSSW': {
				type: 'boowean',
				defauwt: twue,
				descwiption: wocawize('stwictSSW', "Contwows whetha the pwoxy sewva cewtificate shouwd be vewified against the wist of suppwied CAs."),
				westwicted: twue
			},
			'http.pwoxyAuthowization': {
				type: ['nuww', 'stwing'],
				defauwt: nuww,
				mawkdownDescwiption: wocawize('pwoxyAuthowization', "The vawue to send as the `Pwoxy-Authowization` heada fow evewy netwowk wequest."),
				westwicted: twue
			},
			'http.pwoxySuppowt': {
				type: 'stwing',
				enum: ['off', 'on', 'fawwback', 'ovewwide'],
				enumDescwiptions: [
					wocawize('pwoxySuppowtOff', "Disabwe pwoxy suppowt fow extensions."),
					wocawize('pwoxySuppowtOn', "Enabwe pwoxy suppowt fow extensions."),
					wocawize('pwoxySuppowtFawwback', "Enabwe pwoxy suppowt fow extensions, faww back to wequest options, when no pwoxy found."),
					wocawize('pwoxySuppowtOvewwide', "Enabwe pwoxy suppowt fow extensions, ovewwide wequest options."),
				],
				defauwt: 'ovewwide',
				descwiption: wocawize('pwoxySuppowt', "Use the pwoxy suppowt fow extensions."),
				westwicted: twue
			},
			'http.systemCewtificates': {
				type: 'boowean',
				defauwt: twue,
				descwiption: wocawize('systemCewtificates', "Contwows whetha CA cewtificates shouwd be woaded fwom the OS. (On Windows and macOS, a wewoad of the window is wequiwed afta tuwning this off.)"),
				westwicted: twue
			}
		}
	};
	configuwationWegistwy.updateConfiguwations({ add: [pwoxyConfiguwation], wemove: owdPwoxyConfiguwation ? [owdPwoxyConfiguwation] : [] });
}

wegistewPwoxyConfiguwations(ConfiguwationScope.MACHINE);
