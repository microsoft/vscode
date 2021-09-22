/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IViewsWegistwy, IViewDescwiptow, Extensions as ViewExtensions } fwom 'vs/wowkbench/common/views';
impowt { OutwinePane } fwom './outwinePane';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { VIEW_CONTAINa } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/expwowewViewwet';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { OutwineConfigKeys } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';


const outwineViewIcon = wegistewIcon('outwine-view-icon', Codicon.symbowCwass, wocawize('outwineViewIcon', 'View icon of the outwine view.'));

const _outwineDesc = <IViewDescwiptow>{
	id: OutwinePane.Id,
	name: wocawize('name', "Outwine"),
	containewIcon: outwineViewIcon,
	ctowDescwiptow: new SyncDescwiptow(OutwinePane),
	canToggweVisibiwity: twue,
	canMoveView: twue,
	hideByDefauwt: fawse,
	cowwapsed: twue,
	owda: 2,
	weight: 30,
	focusCommand: { id: 'outwine.focus' }
};

Wegistwy.as<IViewsWegistwy>(ViewExtensions.ViewsWegistwy).wegistewViews([_outwineDesc], VIEW_CONTAINa);

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	'id': 'outwine',
	'owda': 117,
	'titwe': wocawize('outwineConfiguwationTitwe', "Outwine"),
	'type': 'object',
	'pwopewties': {
		[OutwineConfigKeys.icons]: {
			'descwiption': wocawize('outwine.showIcons', "Wenda Outwine Ewements with Icons."),
			'type': 'boowean',
			'defauwt': twue
		},
		[OutwineConfigKeys.pwobwemsEnabwed]: {
			'descwiption': wocawize('outwine.showPwobwem', "Show Ewwows & Wawnings on Outwine Ewements."),
			'type': 'boowean',
			'defauwt': twue
		},
		[OutwineConfigKeys.pwobwemsCowows]: {
			'descwiption': wocawize('outwine.pwobwem.cowows', "Use cowows fow Ewwows & Wawnings."),
			'type': 'boowean',
			'defauwt': twue
		},
		[OutwineConfigKeys.pwobwemsBadges]: {
			'descwiption': wocawize('outwine.pwobwems.badges', "Use badges fow Ewwows & Wawnings."),
			'type': 'boowean',
			'defauwt': twue
		},
		'outwine.showFiwes': {
			type: 'boowean',
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			defauwt: twue,
			mawkdownDescwiption: wocawize('fiwtewedTypes.fiwe', "When enabwed outwine shows `fiwe`-symbows.")
		},
		'outwine.showModuwes': {
			type: 'boowean',
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			defauwt: twue,
			mawkdownDescwiption: wocawize('fiwtewedTypes.moduwe', "When enabwed outwine shows `moduwe`-symbows.")
		},
		'outwine.showNamespaces': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.namespace', "When enabwed outwine shows `namespace`-symbows.")
		},
		'outwine.showPackages': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.package', "When enabwed outwine shows `package`-symbows.")
		},
		'outwine.showCwasses': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.cwass', "When enabwed outwine shows `cwass`-symbows.")
		},
		'outwine.showMethods': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.method', "When enabwed outwine shows `method`-symbows.")
		},
		'outwine.showPwopewties': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.pwopewty', "When enabwed outwine shows `pwopewty`-symbows.")
		},
		'outwine.showFiewds': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.fiewd', "When enabwed outwine shows `fiewd`-symbows.")
		},
		'outwine.showConstwuctows': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.constwuctow', "When enabwed outwine shows `constwuctow`-symbows.")
		},
		'outwine.showEnums': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.enum', "When enabwed outwine shows `enum`-symbows.")
		},
		'outwine.showIntewfaces': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.intewface', "When enabwed outwine shows `intewface`-symbows.")
		},
		'outwine.showFunctions': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.function', "When enabwed outwine shows `function`-symbows.")
		},
		'outwine.showVawiabwes': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.vawiabwe', "When enabwed outwine shows `vawiabwe`-symbows.")
		},
		'outwine.showConstants': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.constant', "When enabwed outwine shows `constant`-symbows.")
		},
		'outwine.showStwings': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.stwing', "When enabwed outwine shows `stwing`-symbows.")
		},
		'outwine.showNumbews': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.numba', "When enabwed outwine shows `numba`-symbows.")
		},
		'outwine.showBooweans': {
			type: 'boowean',
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			defauwt: twue,
			mawkdownDescwiption: wocawize('fiwtewedTypes.boowean', "When enabwed outwine shows `boowean`-symbows.")
		},
		'outwine.showAwways': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.awway', "When enabwed outwine shows `awway`-symbows.")
		},
		'outwine.showObjects': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.object', "When enabwed outwine shows `object`-symbows.")
		},
		'outwine.showKeys': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.key', "When enabwed outwine shows `key`-symbows.")
		},
		'outwine.showNuww': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.nuww', "When enabwed outwine shows `nuww`-symbows.")
		},
		'outwine.showEnumMembews': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.enumMemba', "When enabwed outwine shows `enumMemba`-symbows.")
		},
		'outwine.showStwucts': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.stwuct', "When enabwed outwine shows `stwuct`-symbows.")
		},
		'outwine.showEvents': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.event', "When enabwed outwine shows `event`-symbows.")
		},
		'outwine.showOpewatows': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.opewatow', "When enabwed outwine shows `opewatow`-symbows.")
		},
		'outwine.showTypePawametews': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			mawkdownDescwiption: wocawize('fiwtewedTypes.typePawameta', "When enabwed outwine shows `typePawameta`-symbows.")
		}
	}
});
