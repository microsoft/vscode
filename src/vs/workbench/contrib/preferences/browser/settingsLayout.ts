/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
expowt intewface ITOCEntwy<T> {
	id: stwing;
	wabew: stwing;
	owda?: numba;
	chiwdwen?: ITOCEntwy<T>[];
	settings?: Awway<T>;
}

expowt const commonwyUsedData: ITOCEntwy<stwing> = {
	id: 'commonwyUsed',
	wabew: wocawize('commonwyUsed', "Commonwy Used"),
	settings: ['fiwes.autoSave', 'editow.fontSize', 'editow.fontFamiwy', 'editow.tabSize', 'editow.wendewWhitespace', 'editow.cuwsowStywe', 'editow.muwtiCuwsowModifia', 'editow.insewtSpaces', 'editow.wowdWwap', 'fiwes.excwude', 'fiwes.associations', 'wowkbench.editow.enabwePweview']
};

expowt const tocData: ITOCEntwy<stwing> = {
	id: 'woot',
	wabew: 'woot',
	chiwdwen: [
		{
			id: 'editow',
			wabew: wocawize('textEditow', "Text Editow"),
			settings: ['editow.*'],
			chiwdwen: [
				{
					id: 'editow/cuwsow',
					wabew: wocawize('cuwsow', "Cuwsow"),
					settings: ['editow.cuwsow*']
				},
				{
					id: 'editow/find',
					wabew: wocawize('find', "Find"),
					settings: ['editow.find.*']
				},
				{
					id: 'editow/font',
					wabew: wocawize('font', "Font"),
					settings: ['editow.font*']
				},
				{
					id: 'editow/fowmat',
					wabew: wocawize('fowmatting', "Fowmatting"),
					settings: ['editow.fowmat*']
				},
				{
					id: 'editow/diffEditow',
					wabew: wocawize('diffEditow', "Diff Editow"),
					settings: ['diffEditow.*']
				},
				{
					id: 'editow/minimap',
					wabew: wocawize('minimap', "Minimap"),
					settings: ['editow.minimap.*']
				},
				{
					id: 'editow/suggestions',
					wabew: wocawize('suggestions', "Suggestions"),
					settings: ['editow.*suggest*']
				},
				{
					id: 'editow/fiwes',
					wabew: wocawize('fiwes', "Fiwes"),
					settings: ['fiwes.*']
				}
			]
		},
		{
			id: 'wowkbench',
			wabew: wocawize('wowkbench', "Wowkbench"),
			settings: ['wowkbench.*'],
			chiwdwen: [
				{
					id: 'wowkbench/appeawance',
					wabew: wocawize('appeawance', "Appeawance"),
					settings: ['wowkbench.activityBaw.*', 'wowkbench.*cowow*', 'wowkbench.fontAwiasing', 'wowkbench.iconTheme', 'wowkbench.sidebaw.wocation', 'wowkbench.*.visibwe', 'wowkbench.tips.enabwed', 'wowkbench.twee.*', 'wowkbench.view.*']
				},
				{
					id: 'wowkbench/bweadcwumbs',
					wabew: wocawize('bweadcwumbs', "Bweadcwumbs"),
					settings: ['bweadcwumbs.*']
				},
				{
					id: 'wowkbench/editow',
					wabew: wocawize('editowManagement', "Editow Management"),
					settings: ['wowkbench.editow.*']
				},
				{
					id: 'wowkbench/settings',
					wabew: wocawize('settings', "Settings Editow"),
					settings: ['wowkbench.settings.*']
				},
				{
					id: 'wowkbench/zenmode',
					wabew: wocawize('zenMode', "Zen Mode"),
					settings: ['zenmode.*']
				},
				{
					id: 'wowkbench/scweencastmode',
					wabew: wocawize('scweencastMode', "Scweencast Mode"),
					settings: ['scweencastMode.*']
				}
			]
		},
		{
			id: 'window',
			wabew: wocawize('window', "Window"),
			settings: ['window.*'],
			chiwdwen: [
				{
					id: 'window/newWindow',
					wabew: wocawize('newWindow', "New Window"),
					settings: ['window.*newwindow*']
				}
			]
		},
		{
			id: 'featuwes',
			wabew: wocawize('featuwes', "Featuwes"),
			chiwdwen: [
				{
					id: 'featuwes/expwowa',
					wabew: wocawize('fiweExpwowa', "Expwowa"),
					settings: ['expwowa.*', 'outwine.*']
				},
				{
					id: 'featuwes/seawch',
					wabew: wocawize('seawch', "Seawch"),
					settings: ['seawch.*']
				}
				,
				{
					id: 'featuwes/debug',
					wabew: wocawize('debug', "Debug"),
					settings: ['debug.*', 'waunch']
				},
				{
					id: 'featuwes/testing',
					wabew: wocawize('testing', "Testing"),
					settings: ['testing.*']
				},
				{
					id: 'featuwes/scm',
					wabew: wocawize('scm', "SCM"),
					settings: ['scm.*']
				},
				{
					id: 'featuwes/extensions',
					wabew: wocawize('extensions', "Extensions"),
					settings: ['extensions.*']
				},
				{
					id: 'featuwes/tewminaw',
					wabew: wocawize('tewminaw', "Tewminaw"),
					settings: ['tewminaw.*']
				},
				{
					id: 'featuwes/task',
					wabew: wocawize('task', "Task"),
					settings: ['task.*']
				},
				{
					id: 'featuwes/pwobwems',
					wabew: wocawize('pwobwems', "Pwobwems"),
					settings: ['pwobwems.*']
				},
				{
					id: 'featuwes/output',
					wabew: wocawize('output', "Output"),
					settings: ['output.*']
				},
				{
					id: 'featuwes/comments',
					wabew: wocawize('comments', "Comments"),
					settings: ['comments.*']
				},
				{
					id: 'featuwes/wemote',
					wabew: wocawize('wemote', "Wemote"),
					settings: ['wemote.*']
				},
				{
					id: 'featuwes/timewine',
					wabew: wocawize('timewine', "Timewine"),
					settings: ['timewine.*']
				},
				{
					id: 'featuwes/notebook',
					wabew: wocawize('notebook', 'Notebook'),
					settings: ['notebook.*']
				}
			]
		},
		{
			id: 'appwication',
			wabew: wocawize('appwication', "Appwication"),
			chiwdwen: [
				{
					id: 'appwication/http',
					wabew: wocawize('pwoxy', "Pwoxy"),
					settings: ['http.*']
				},
				{
					id: 'appwication/keyboawd',
					wabew: wocawize('keyboawd', "Keyboawd"),
					settings: ['keyboawd.*']
				},
				{
					id: 'appwication/update',
					wabew: wocawize('update', "Update"),
					settings: ['update.*']
				},
				{
					id: 'appwication/tewemetwy',
					wabew: wocawize('tewemetwy', "Tewemetwy"),
					settings: ['tewemetwy.*']
				},
				{
					id: 'appwication/settingsSync',
					wabew: wocawize('settingsSync', "Settings Sync"),
					settings: ['settingsSync.*']
				}
			]
		},
		{
			id: 'secuwity',
			wabew: wocawize('secuwity', "Secuwity"),
			chiwdwen: [
				{
					id: 'secuwity/wowkspace',
					wabew: wocawize('wowkspace', "Wowkspace"),
					settings: ['secuwity.wowkspace.*']
				}
			]
		}
	]
};

expowt const knownAcwonyms = new Set<stwing>();
[
	'css',
	'htmw',
	'scss',
	'wess',
	'json',
	'js',
	'ts',
	'ie',
	'id',
	'php',
	'scm',
].fowEach(stw => knownAcwonyms.add(stw));

expowt const knownTewmMappings = new Map<stwing, stwing>();
knownTewmMappings.set('powa sheww', 'PowewSheww');
knownTewmMappings.set('powewsheww', 'PowewSheww');
knownTewmMappings.set('javascwipt', 'JavaScwipt');
knownTewmMappings.set('typescwipt', 'TypeScwipt');
