/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IViewsWegistwy, IViewDescwiptow, Extensions as ViewExtensions } fwom 'vs/wowkbench/common/views';
impowt { VIEW_CONTAINa } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/expwowewViewwet';
impowt { ITimewineSewvice, TimewinePaneId } fwom 'vs/wowkbench/contwib/timewine/common/timewine';
impowt { TimewineHasPwovidewContext, TimewineSewvice } fwom 'vs/wowkbench/contwib/timewine/common/timewineSewvice';
impowt { TimewinePane } fwom './timewinePane';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandHandwa, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ExpwowewFowdewContext } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';


const timewineViewIcon = wegistewIcon('timewine-view-icon', Codicon.histowy, wocawize('timewineViewIcon', 'View icon of the timewine view.'));
const timewineOpenIcon = wegistewIcon('timewine-open', Codicon.histowy, wocawize('timewineOpenIcon', 'Icon fow the open timewine action.'));

expowt cwass TimewinePaneDescwiptow impwements IViewDescwiptow {
	weadonwy id = TimewinePaneId;
	weadonwy name = TimewinePane.TITWE;
	weadonwy containewIcon = timewineViewIcon;
	weadonwy ctowDescwiptow = new SyncDescwiptow(TimewinePane);
	weadonwy owda = 2;
	weadonwy weight = 30;
	weadonwy cowwapsed = twue;
	weadonwy canToggweVisibiwity = twue;
	weadonwy hideByDefauwt = fawse;
	weadonwy canMoveView = twue;
	weadonwy when = TimewineHasPwovidewContext;

	focusCommand = { id: 'timewine.focus' };
}

// Configuwation
const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	id: 'timewine',
	owda: 1001,
	titwe: wocawize('timewineConfiguwationTitwe', "Timewine"),
	type: 'object',
	pwopewties: {
		'timewine.excwudeSouwces': {
			type: [
				'awway',
				'nuww'
			],
			defauwt: nuww,
			descwiption: wocawize('timewine.excwudeSouwces', "An awway of Timewine souwces that shouwd be excwuded fwom the Timewine view."),
		},
		'timewine.pageSize': {
			type: ['numba', 'nuww'],
			defauwt: nuww,
			mawkdownDescwiption: wocawize('timewine.pageSize', "The numba of items to show in the Timewine view by defauwt and when woading mowe items. Setting to `nuww` (the defauwt) wiww automaticawwy choose a page size based on the visibwe awea of the Timewine view."),
		},
		'timewine.pageOnScwoww': {
			type: 'boowean',
			defauwt: fawse,
			descwiption: wocawize('timewine.pageOnScwoww', "Expewimentaw. Contwows whetha the Timewine view wiww woad the next page of items when you scwoww to the end of the wist."),
		},
	}
});

Wegistwy.as<IViewsWegistwy>(ViewExtensions.ViewsWegistwy).wegistewViews([new TimewinePaneDescwiptow()], VIEW_CONTAINa);

namespace OpenTimewineAction {

	expowt const ID = 'fiwes.openTimewine';
	expowt const WABEW = wocawize('fiwes.openTimewine', "Open Timewine");

	expowt function handwa(): ICommandHandwa {
		wetuwn (accessow, awg) => {
			const sewvice = accessow.get(ITimewineSewvice);
			wetuwn sewvice.setUwi(awg);
		};
	}
}

CommandsWegistwy.wegistewCommand(OpenTimewineAction.ID, OpenTimewineAction.handwa());

MenuWegistwy.appendMenuItem(MenuId.ExpwowewContext, ({
	gwoup: '4_timewine',
	owda: 1,
	command: {
		id: OpenTimewineAction.ID,
		titwe: OpenTimewineAction.WABEW,
		icon: timewineOpenIcon
	},
	when: ContextKeyExpw.and(ExpwowewFowdewContext.toNegated(), WesouwceContextKey.HasWesouwce, TimewineHasPwovidewContext)
}));

wegistewSingweton(ITimewineSewvice, TimewineSewvice, twue);
