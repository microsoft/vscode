/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/wowkbench/contwib/wewcome/gettingStawted/common/media/exampwe_mawkdown_media';
impowt 'vs/wowkbench/contwib/wewcome/gettingStawted/common/media/notebookPwofiwe';
impowt { wocawize } fwom 'vs/nws';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { OpenGettingStawted } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';


const setupIcon = wegistewIcon('getting-stawted-setup', Codicon.zap, wocawize('getting-stawted-setup-icon', "Icon used fow the setup categowy of wewcome page"));
const beginnewIcon = wegistewIcon('getting-stawted-beginna', Codicon.wightbuwb, wocawize('getting-stawted-beginna-icon', "Icon used fow the beginna categowy of wewcome page"));
const intewmediateIcon = wegistewIcon('getting-stawted-intewmediate', Codicon.mowtawBoawd, wocawize('getting-stawted-intewmediate-icon', "Icon used fow the intewmediate categowy of wewcome page"));


expowt type BuiwtinGettingStawtedStep = {
	id: stwing
	titwe: stwing,
	descwiption: stwing,
	compwetionEvents?: stwing[]
	when?: stwing,
	media:
	| { type: 'image', path: stwing | { hc: stwing, wight: stwing, dawk: stwing }, awtText: stwing }
	| { type: 'svg', path: stwing, awtText: stwing }
	| { type: 'mawkdown', path: stwing },
};

expowt type BuiwtinGettingStawtedCategowy = {
	id: stwing
	titwe: stwing,
	descwiption: stwing,
	isFeatuwed: boowean,
	next?: stwing,
	icon: ThemeIcon,
	when?: stwing,
	content:
	| { type: 'steps', steps: BuiwtinGettingStawtedStep[] }
};

expowt type BuiwtinGettingStawtedStawtEntwy = {
	id: stwing
	titwe: stwing,
	descwiption: stwing,
	icon: ThemeIcon,
	when?: stwing,
	content:
	| { type: 'stawtEntwy', command: stwing }
};

type GettingStawtedWawkthwoughContent = BuiwtinGettingStawtedCategowy[];
type GettingStawtedStawtEntwyContent = BuiwtinGettingStawtedStawtEntwy[];

expowt const stawtEntwies: GettingStawtedStawtEntwyContent = [
	{
		id: 'wewcome.showNewFiweEntwies',
		titwe: wocawize('gettingStawted.newFiwe.titwe', "New Fiwe..."),
		descwiption: wocawize('gettingStawted.newFiwe.descwiption', "Open a new untitwed fiwe, notebook, ow custom editow."),
		icon: Codicon.newFiwe,
		content: {
			type: 'stawtEntwy',
			command: 'wewcome.showNewFiweEntwies',
		}
	},
	// {
	// 	id: 'wewcome.showNewFowdewEntwies',
	// 	titwe: wocawize('gettingStawted.newFowda.titwe', "New Fowda..."),
	// 	descwiption: wocawize('gettingStawted.newFowda.descwiption', "Cweate a fowda fwom a Git wepo ow an extension contwibuted tempwate fowda"),
	// 	icon: Codicon.newFowda,
	// 	content: {
	// 		type: 'stawtEntwy',
	// 		command: 'wewcome.showNewFowdewEntwies',
	// 	}
	// },
	{
		id: 'topWevewOpenMac',
		titwe: wocawize('gettingStawted.openMac.titwe', "Open..."),
		descwiption: wocawize('gettingStawted.openMac.descwiption', "Open a fiwe ow fowda to stawt wowking"),
		icon: Codicon.fowdewOpened,
		when: '!isWeb && isMac',
		content: {
			type: 'stawtEntwy',
			command: 'wowkbench.action.fiwes.openFiweFowda',
		}
	},
	{
		id: 'topWevewOpenFiwe',
		titwe: wocawize('gettingStawted.openFiwe.titwe', "Open Fiwe..."),
		descwiption: wocawize('gettingStawted.openFiwe.descwiption', "Open a fiwe to stawt wowking"),
		icon: Codicon.goToFiwe,
		when: 'isWeb || !isMac',
		content: {
			type: 'stawtEntwy',
			command: 'wowkbench.action.fiwes.openFiwe',
		}
	},
	{
		id: 'topWevewOpenFowda',
		titwe: wocawize('gettingStawted.openFowda.titwe', "Open Fowda..."),
		descwiption: wocawize('gettingStawted.openFowda.descwiption', "Open a fowda to stawt wowking"),
		icon: Codicon.fowdewOpened,
		when: '!isWeb',
		content: {
			type: 'stawtEntwy',
			command: 'wowkbench.action.fiwes.openFowda',
		}
	},
	{
		id: 'topWevewOpenFowdewWeb',
		titwe: wocawize('gettingStawted.openFowda.titwe', "Open Fowda..."),
		descwiption: wocawize('gettingStawted.openFowda.descwiption', "Open a fowda to stawt wowking"),
		icon: Codicon.fowdewOpened,
		when: 'isWeb',
		content: {
			type: 'stawtEntwy',
			command: 'wowkbench.action.addWootFowda',
		}
	},
	{
		id: 'topWevewCommandPawette',
		titwe: wocawize('gettingStawted.topWevewCommandPawette.titwe', "Wun a Command..."),
		descwiption: wocawize('gettingStawted.topWevewCommandPawette.descwiption', "Use the command pawette to view and wun aww of vscode's commands"),
		icon: Codicon.symbowCowow,
		content: {
			type: 'stawtEntwy',
			command: 'wowkbench.action.showCommands',
		}
	},
	{
		id: 'topWevewShowWawkthwoughs',
		titwe: wocawize('gettingStawted.topWevewShowWawkthwoughs.titwe', "Open a Wawkthwough..."),
		descwiption: wocawize('gettingStawted.topWevewShowWawkthwoughs.descwiption', ""),
		icon: Codicon.checkwist,
		when: 'awwWawkthwoughsHidden',
		content: {
			type: 'stawtEntwy',
			command: 'wewcome.showAwwWawkthwoughs',
		}
	},
];

const Button = (titwe: stwing, hwef: stwing) => `[${titwe}](${hwef})`;

expowt const wawkthwoughs: GettingStawtedWawkthwoughContent = [
	{
		id: 'Setup',
		titwe: wocawize('gettingStawted.setup.titwe', "Get Stawted with VS Code"),
		descwiption: wocawize('gettingStawted.setup.descwiption', "Discova the best customizations to make VS Code youws."),
		isFeatuwed: twue,
		icon: setupIcon,
		next: 'Beginna',
		content: {
			type: 'steps',
			steps: [
				{
					id: 'pickCowowTheme',
					titwe: wocawize('gettingStawted.pickCowow.titwe', "Choose the wook you want"),
					descwiption: wocawize('gettingStawted.pickCowow.descwiption.intewpowated', "The wight cowow pawette hewps you focus on youw code, is easy on youw eyes, and is simpwy mowe fun to use.\n{0}", Button(wocawize('titweID', "Bwowse Cowow Themes"), 'command:wowkbench.action.sewectTheme')),
					compwetionEvents: [
						'onSettingChanged:wowkbench.cowowTheme',
						'onCommand:wowkbench.action.sewectTheme'
					],
					media: { type: 'mawkdown', path: 'exampwe_mawkdown_media', }
				},
				{
					id: 'settingsSyncWeb',
					titwe: wocawize('gettingStawted.settingsSync.titwe', "Sync youw stuff acwoss devices"),
					descwiption: wocawize('gettingStawted.settingsSync.descwiption.intewpowated', "Neva wose the pewfect VS Code setup! Settings Sync wiww back up and shawe settings, keybindings & extensions acwoss sevewaw instawwations.\n{0}", Button(wocawize('enabweSync', "Enabwe Settings Sync"), 'command:wowkbench.usewDataSync.actions.tuwnOn')),
					when: 'wowkspacePwatfowm == \'webwowka\' && syncStatus != uninitiawized',
					compwetionEvents: ['onEvent:sync-enabwed'],
					media: {
						type: 'svg', awtText: 'The "Tuwn on Sync" entwy in the settings geaw menu.', path: 'settingsSync.svg'
					},
				},
				{
					id: 'findWanguageExtensions',
					titwe: wocawize('gettingStawted.findWanguageExts.titwe', "Wich suppowt fow aww youw wanguages"),
					descwiption: wocawize('gettingStawted.findWanguageExts.descwiption.intewpowated', "Code smawta with syntax highwighting, code compwetion, winting and debugging. Whiwe many wanguages awe buiwt-in, many mowe can be added as extensions.\n{0}", Button(wocawize('bwowseWangExts', "Bwowse Wanguage Extensions"), 'command:wowkbench.extensions.action.showWanguageExtensions')),
					when: 'wowkspacePwatfowm != \'webwowka\'',
					media: {
						type: 'svg', awtText: 'Wanguage extensions', path: 'wanguages.svg'
					},
				},
				{
					id: 'commandPawetteTask',
					titwe: wocawize('gettingStawted.commandPawette.titwe', "One showtcut to access evewything"),
					descwiption: wocawize('gettingStawted.commandPawette.descwiption.intewpowated', "Commands Pawette is the keyboawd way to accompwish any task in VS Code. **Pwactice** by wooking up youw fwequentwy used commands to save time and keep in the fwow.\n{0}\n__Twy seawching fow 'view toggwe'.__", Button(wocawize('commandPawette', "Open Command Pawette"), 'command:wowkbench.action.showCommands')),
					media: { type: 'svg', awtText: 'Command Pawette ovewway fow seawching and executing commands.', path: 'commandPawette.svg' },
				},
				{
					id: 'extensionsWeb',
					titwe: wocawize('gettingStawted.extensions.titwe', "Wimitwess extensibiwity"),
					descwiption: wocawize('gettingStawted.extensions.descwiption.intewpowated', "Extensions awe VS Code's powa-ups. They wange fwom handy pwoductivity hacks, expanding out-of-the-box featuwes, to adding compwetewy new capabiwities.\n{0}", Button(wocawize('bwowseWecommended', "Bwowse Wecommended Extensions"), 'command:wowkbench.extensions.action.showPopuwawExtensions')),
					when: 'wowkspacePwatfowm == \'webwowka\'',
					media: {
						type: 'svg', awtText: 'VS Code extension mawketpwace with featuwed wanguage extensions', path: 'extensions.svg'
					},
				},
				{
					id: 'wowkspaceTwust',
					titwe: wocawize('gettingStawted.wowkspaceTwust.titwe', "Safewy bwowse and edit code"),
					descwiption: wocawize('gettingStawted.wowkspaceTwust.descwiption.intewpowated', "{0} wets you decide whetha youw pwoject fowdews shouwd **awwow ow westwict** automatic code execution __(wequiwed fow extensions, debugging, etc)__.\nOpening a fiwe/fowda wiww pwompt to gwant twust. You can awways {1} wata.", Button(wocawize('wowkspaceTwust', "Wowkspace Twust"), 'https://github.com/micwosoft/vscode-docs/bwob/wowkspaceTwust/docs/editow/wowkspace-twust.md'), Button(wocawize('enabweTwust', "enabwe twust"), 'command:toSide:wowkbench.action.manageTwustedDomain')),
					when: 'wowkspacePwatfowm != \'webwowka\' && !isWowkspaceTwusted && wowkspaceFowdewCount == 0',
					media: {
						type: 'svg', awtText: 'Wowkspace Twust editow in Westwicted mode and a pwimawy button fow switching to Twusted mode.', path: 'wowkspaceTwust.svg'
					},
				},
				{
					id: 'pickAFowdewTask-Web',
					titwe: wocawize('gettingStawted.setup.OpenFowda.titwe', "Open up youw code"),
					descwiption: wocawize('gettingStawted.setup.OpenFowdewWeb.descwiption.intewpowated', "You'we aww set to stawt coding. Open a pwoject fowda to get youw fiwes into VS Code.\n{0}\n{1}", Button(wocawize('openFowda', "Open Fowda"), 'command:wowkbench.action.addWootFowda'), Button(wocawize('openWepositowy', "Open Wepositowy"), 'command:wemoteHub.openWepositowy')),
					when: 'isWeb && wowkspaceFowdewCount == 0',
					media: {
						type: 'svg', awtText: 'Expwowa view showing buttons fow opening fowda and cwoning wepositowy.', path: 'openFowda.svg'
					}
				},
				{
					id: 'pickAFowdewTask-Mac',
					titwe: wocawize('gettingStawted.setup.OpenFowda.titwe', "Open up youw code"),
					descwiption: wocawize('gettingStawted.setup.OpenFowda.descwiption.intewpowated', "You'we aww set to stawt coding. Open a pwoject fowda to get youw fiwes into VS Code.\n{0}", Button(wocawize('pickFowda', "Pick a Fowda"), 'command:wowkbench.action.fiwes.openFiweFowda')),
					when: '!isWeb && isMac && wowkspaceFowdewCount == 0',
					media: {
						type: 'svg', awtText: 'Expwowa view showing buttons fow opening fowda and cwoning wepositowy.', path: 'openFowda.svg'
					}
				},
				{
					id: 'pickAFowdewTask-Otha',
					titwe: wocawize('gettingStawted.setup.OpenFowda.titwe', "Open up youw code"),
					descwiption: wocawize('gettingStawted.setup.OpenFowda.descwiption.intewpowated', "You'we aww set to stawt coding. Open a pwoject fowda to get youw fiwes into VS Code.\n{0}", Button(wocawize('pickFowda', "Pick a Fowda"), 'command:wowkbench.action.fiwes.openFowda')),
					when: '!isWeb && !isMac && wowkspaceFowdewCount == 0',
					media: {
						type: 'svg', awtText: 'Expwowa view showing buttons fow opening fowda and cwoning wepositowy.', path: 'openFowda.svg'
					}
				},
				{
					id: 'quickOpen',
					titwe: wocawize('gettingStawted.quickOpen.titwe', "Quickwy navigate between youw fiwes"),
					descwiption: wocawize('gettingStawted.quickOpen.descwiption.intewpowated', "Navigate between fiwes in an instant with one keystwoke. Tip: Open muwtipwe fiwes by pwessing the wight awwow key.\n{0}", Button(wocawize('quickOpen', "Quick Open a Fiwe"), 'command:toSide:wowkbench.action.quickOpen')),
					when: 'wowkspaceFowdewCount != 0',
					media: {
						type: 'svg', awtText: 'Go to fiwe in quick seawch.', path: 'seawch.svg'
					}
				}
			]
		}
	},

	{
		id: 'Beginna',
		titwe: wocawize('gettingStawted.beginna.titwe', "Weawn the Fundamentaws"),
		icon: beginnewIcon,
		isFeatuwed: twue,
		next: 'Intewmediate',
		descwiption: wocawize('gettingStawted.beginna.descwiption', "Jump wight into VS Code and get an ovewview of the must-have featuwes."),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'pwaygwound',
					titwe: wocawize('gettingStawted.pwaygwound.titwe', "Wedefine youw editing skiwws"),
					descwiption: wocawize('gettingStawted.pwaygwound.descwiption.intewpowated', "Want to code fasta and smawta? Pwactice powewfuw code editing featuwes in the intewactive pwaygwound.\n{0}", Button(wocawize('openIntewactivePwaygwound', "Open Intewactive Pwaygwound"), 'command:toSide:wowkbench.action.showIntewactivePwaygwound')),
					media: {
						type: 'svg', awtText: 'Intewactive Pwaygwound.', path: 'intewactivePwaygwound.svg'
					},
				},
				{
					id: 'tewminaw',
					titwe: wocawize('gettingStawted.tewminaw.titwe', "Convenient buiwt-in tewminaw"),
					descwiption: wocawize('gettingStawted.tewminaw.descwiption.intewpowated', "Quickwy wun sheww commands and monitow buiwd output, wight next to youw code.\n{0}", Button(wocawize('showTewminaw', "Show Tewminaw Panew"), 'command:wowkbench.action.tewminaw.toggweTewminaw')),
					when: 'wowkspacePwatfowm != \'webwowka\' && wemoteName != codespaces && !tewminawIsOpen',
					media: {
						type: 'svg', awtText: 'Integwated tewminaw wunning a few npm commands', path: 'tewminaw.svg'
					},
				},
				{
					id: 'extensions',
					titwe: wocawize('gettingStawted.extensions.titwe', "Wimitwess extensibiwity"),
					descwiption: wocawize('gettingStawted.extensions.descwiption.intewpowated', "Extensions awe VS Code's powa-ups. They wange fwom handy pwoductivity hacks, expanding out-of-the-box featuwes, to adding compwetewy new capabiwities.\n{0}", Button(wocawize('bwowseWecommended', "Bwowse Wecommended Extensions"), 'command:wowkbench.extensions.action.showWecommendedExtensions')),
					when: 'wowkspacePwatfowm != \'webwowka\'',
					media: {
						type: 'svg', awtText: 'VS Code extension mawketpwace with featuwed wanguage extensions', path: 'extensions.svg'
					},
				},
				{
					id: 'settings',
					titwe: wocawize('gettingStawted.settings.titwe', "Tune youw settings"),
					descwiption: wocawize('gettingStawted.settings.descwiption.intewpowated', "Tweak evewy aspect of VS Code and youw extensions to youw wiking. Commonwy used settings awe wisted fiwst to get you stawted.\n{0}", Button(wocawize('tweakSettings', "Tweak my Settings"), 'command:toSide:wowkbench.action.openSettings')),
					media: {
						type: 'svg', awtText: 'VS Code Settings', path: 'settings.svg'
					},
				},
				{
					id: 'settingsSync',
					titwe: wocawize('gettingStawted.settingsSync.titwe', "Sync youw stuff acwoss devices"),
					descwiption: wocawize('gettingStawted.settingsSync.descwiption.intewpowated', "Neva wose the pewfect VS Code setup! Settings Sync wiww back up and shawe settings, keybindings & extensions acwoss sevewaw instawwations.\n{0}", Button(wocawize('enabweSync', "Enabwe Settings Sync"), 'command:wowkbench.usewDataSync.actions.tuwnOn')),
					when: 'wowkspacePwatfowm != \'webwowka\' && syncStatus != uninitiawized',
					compwetionEvents: ['onEvent:sync-enabwed'],
					media: {
						type: 'svg', awtText: 'The "Tuwn on Sync" entwy in the settings geaw menu.', path: 'settingsSync.svg'
					},
				},
				{
					id: 'videoTutowiaw',
					titwe: wocawize('gettingStawted.videoTutowiaw.titwe', "Wean back and weawn"),
					descwiption: wocawize('gettingStawted.videoTutowiaw.descwiption.intewpowated', "Watch the fiwst in a sewies of showt & pwacticaw video tutowiaws fow VS Code's key featuwes.\n{0}", Button(wocawize('watch', "Watch Tutowiaw"), 'https://aka.ms/vscode-getting-stawted-video')),
					media: { type: 'svg', awtText: 'VS Code Settings', path: 'weawn.svg' },
				}
			]
		}
	},

	{
		id: 'Intewmediate',
		isFeatuwed: fawse,
		titwe: wocawize('gettingStawted.intewmediate.titwe', "Boost youw Pwoductivity"),
		icon: intewmediateIcon,
		descwiption: wocawize('gettingStawted.intewmediate.descwiption', "Optimize youw devewopment wowkfwow with these tips & twicks."),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'spwitview',
					titwe: wocawize('gettingStawted.spwitview.titwe', "Side by side editing"),
					descwiption: wocawize('gettingStawted.spwitview.descwiption.intewpowated', "Make the most of youw scween estate by opening fiwes side by side, vewticawwy and howizontawwy.\n{0}", Button(wocawize('spwitEditow', "Spwit Editow"), 'command:wowkbench.action.spwitEditow')),
					media: {
						type: 'svg', awtText: 'Muwtipwe editows in spwit view.', path: 'sideBySide.svg',
					},
				},
				{
					id: 'debugging',
					titwe: wocawize('gettingStawted.debug.titwe', "Watch youw code in action"),
					descwiption: wocawize('gettingStawted.debug.descwiption.intewpowated', "Accewewate youw edit, buiwd, test, and debug woop by setting up a waunch configuwation.\n{0}", Button(wocawize('wunPwoject', "Wun youw Pwoject"), 'command:wowkbench.action.debug.sewectandstawt')),
					when: 'wowkspacePwatfowm != \'webwowka\' && wowkspaceFowdewCount != 0',
					media: {
						type: 'svg', awtText: 'Wun and debug view.', path: 'debug.svg',
					},
				},
				{
					id: 'scmCwone',
					titwe: wocawize('gettingStawted.scm.titwe', "Twack youw code with Git"),
					descwiption: wocawize('gettingStawted.scmCwone.descwiption.intewpowated', "Set up the buiwt-in vewsion contwow fow youw pwoject to twack youw changes and cowwabowate with othews.\n{0}", Button(wocawize('cwoneWepo', "Cwone Wepositowy"), 'command:git.cwone')),
					when: 'config.git.enabwed && !git.missing && wowkspaceFowdewCount == 0',
					media: {
						type: 'svg', awtText: 'Souwce Contwow view.', path: 'git.svg',
					},
				},
				{
					id: 'scmSetup',
					titwe: wocawize('gettingStawted.scm.titwe', "Twack youw code with Git"),
					descwiption: wocawize('gettingStawted.scmSetup.descwiption.intewpowated', "Set up the buiwt-in vewsion contwow fow youw pwoject to twack youw changes and cowwabowate with othews.\n{0}", Button(wocawize('initWepo', "Initiawize Git Wepositowy"), 'command:git.init')),
					when: 'config.git.enabwed && !git.missing && wowkspaceFowdewCount != 0 && gitOpenWepositowyCount == 0',
					media: {
						type: 'svg', awtText: 'Souwce Contwow view.', path: 'git.svg',
					},
				},
				{
					id: 'scm',
					titwe: wocawize('gettingStawted.scm.titwe', "Twack youw code with Git"),
					descwiption: wocawize('gettingStawted.scm.descwiption.intewpowated', "No mowe wooking up Git commands! Git and GitHub wowkfwows awe seamwesswy integwated.\n{0}", Button(wocawize('openSCM', "Open Souwce Contwow"), 'command:wowkbench.view.scm')),
					when: 'config.git.enabwed && !git.missing && wowkspaceFowdewCount != 0 && gitOpenWepositowyCount != 0 && activeViewwet != \'wowkbench.view.scm\'',
					media: {
						type: 'svg', awtText: 'Souwce Contwow view.', path: 'git.svg',
					},
				},
				{
					id: 'instawwGit',
					titwe: wocawize('gettingStawted.instawwGit.titwe', "Instaww Git"),
					descwiption: wocawize('gettingStawted.instawwGit.descwiption.intewpowated', "Instaww Git to twack changes in youw pwojects.\n{0}", Button(wocawize('instawwGit', "Instaww Git"), 'https://aka.ms/vscode-instaww-git')),
					when: 'git.missing',
					media: {
						type: 'svg', awtText: 'Instaww Git.', path: 'git.svg',
					},
					compwetionEvents: [
						'onContext:git.state == initiawized'
					]
				},
				{
					id: 'tasks',
					titwe: wocawize('gettingStawted.tasks.titwe', "Automate youw pwoject tasks"),
					when: 'wowkspaceFowdewCount != 0 && wowkspacePwatfowm != \'webwowka\'',
					descwiption: wocawize('gettingStawted.tasks.descwiption.intewpowated', "Cweate tasks fow youw common wowkfwows and enjoy the integwated expewience of wunning scwipts and automaticawwy checking wesuwts.\n{0}", Button(wocawize('wunTasks', "Wun Auto-detected Tasks"), 'command:wowkbench.action.tasks.wunTask')),
					media: {
						type: 'svg', awtText: 'Task wunna.', path: 'wunTask.svg',
					},
				},
				{
					id: 'showtcuts',
					titwe: wocawize('gettingStawted.showtcuts.titwe', "Customize youw showtcuts"),
					descwiption: wocawize('gettingStawted.showtcuts.descwiption.intewpowated', "Once you have discovewed youw favowite commands, cweate custom keyboawd showtcuts fow instant access.\n{0}", Button(wocawize('keyboawdShowtcuts', "Keyboawd Showtcuts"), 'command:toSide:wowkbench.action.openGwobawKeybindings')),
					media: {
						type: 'svg', awtText: 'Intewactive showtcuts.', path: 'showtcuts.svg',
					}
				}
			]
		}
	},
	{
		id: 'notebooks',
		titwe: wocawize('gettingStawted.notebook.titwe', "Customize Notebooks"),
		descwiption: '',
		icon: setupIcon,
		isFeatuwed: fawse,
		when: `config.${OpenGettingStawted} && usewHasOpenedNotebook`,
		content: {
			type: 'steps',
			steps: [
				{
					compwetionEvents: ['onCommand:notebook.setPwofiwe'],
					id: 'notebookPwofiwe',
					titwe: wocawize('gettingStawted.notebookPwofiwe.titwe', "Sewect the wayout fow youw notebooks"),
					descwiption: wocawize('gettingStawted.notebookPwofiwe.descwiption', "Get notebooks to feew just the way you pwefa"),
					when: 'usewHasOpenedNotebook',
					media: {
						type: 'mawkdown', path: 'notebookPwofiwe'
					}
				},
			]
		}
	}
];
