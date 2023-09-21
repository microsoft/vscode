/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';

export const DEFAULT_ICON = Codicon.settingsGear;

export const ICONS = [

	/* Default */
	DEFAULT_ICON,

	/* hardware/devices */
	registerIcon('profile-icon-vm', Codicon.vm, localize('vm', 'Virtual Machine')),
	registerIcon('profile-icon-server', Codicon.server, localize('server', 'Server')),
	registerIcon('profile-icon-recordKeys', Codicon.recordKeys, localize('recordkeys', 'Record Keys')),
	registerIcon('profile-icon-deviceMobile', Codicon.deviceMobile, localize('deviceMobile', 'Mobile Device')),
	registerIcon('profile-icon-watch', Codicon.watch, localize('watch', 'Watch')),

	/* languages */
	registerIcon('profile-icon-ruby', Codicon.ruby, localize('ruby', 'Ruby Language')),
	registerIcon('profile-icon-code', Codicon.code, localize('code', 'Coding')),

	/* project types */
	registerIcon('profile-icon-window', Codicon.window, localize('window', 'Window')),
	registerIcon('profile-icon-library', Codicon.library, localize('library', 'Library')),
	registerIcon('profile-icon-extensions', Codicon.extensions, localize('extensions', 'Extensions')),
	registerIcon('profile-icon-terminal', Codicon.terminal, localize('terminal', 'Terminal')),
	registerIcon('profile-icon-beaker', Codicon.beaker, localize('testing', 'Testing')),
	registerIcon('profile-icon-package', Codicon.package, localize('package', 'Package')),
	registerIcon('profile-icon-cloud', Codicon.cloud, localize('cloud', 'Cloud')),
	registerIcon('profile-icon-book', Codicon.book, localize('book', 'Book')),
	registerIcon('profile-icon-globe', Codicon.globe, localize('globe', 'Globe')),
	registerIcon('profile-icon-database', Codicon.database, localize('database', 'Database')),
	registerIcon('profile-icon-notebook', Codicon.notebook, localize('notebook', 'Notebook')),

	/* misc */
	registerIcon('profile-icon-gift', Codicon.gift, localize('gift', 'Gift')),
	registerIcon('profile-icon-send', Codicon.send, localize('send', 'Send')),
	registerIcon('profile-icon-briefcase', Codicon.briefcase, localize('briefcase', 'Briefcase')),
	registerIcon('profile-icon-megaphone', Codicon.megaphone, localize('megaphone', 'Megaphone')),
	registerIcon('profile-icon-comment', Codicon.comment, localize('comment', 'Comment')),
	registerIcon('profile-icon-telescope', Codicon.telescope, localize('telescope', 'Telecope')),
	registerIcon('profile-icon-creditCard', Codicon.creditCard, localize('creditcard', 'Credit Card')),
	registerIcon('profile-icon-map', Codicon.map, localize('map', 'Map')),
	registerIcon('profile-icon-deviceCameraVideo', Codicon.deviceCameraVideo, localize('cameraVideo', 'Video Camera')),
	registerIcon('profile-icon-unmute', Codicon.unmute, localize('unmute', 'Unmute')),
	registerIcon('profile-icon-law', Codicon.law, localize('law', 'Law')),
	registerIcon('profile-icon-graphLine', Codicon.graphLine, localize('graphLine', 'Graph Line')),
	registerIcon('profile-icon-heart', Codicon.heart, localize('heart', 'Heart')),
	registerIcon('profile-icon-home', Codicon.home, localize('home', 'Home')),
	registerIcon('profile-icon-inbox', Codicon.inbox, localize('inbox', 'Inbox')),
	registerIcon('profile-icon-mortarBoard', Codicon.mortarBoard, localize('mortarBoard', 'Mortar Board')),
	registerIcon('profile-icon-rocket', Codicon.rocket, localize('rocket', 'Rocket')),
	registerIcon('profile-icon-magnet', Codicon.magnet, localize('magnet', 'Magnet')),
	registerIcon('profile-icon-lock', Codicon.lock, localize('lock', 'Lock')),
	registerIcon('profile-icon-milestone', Codicon.milestone, localize('milestone', 'Milestone')),
	registerIcon('profile-icon-tag', Codicon.tag, localize('tag', 'Tag')),
	registerIcon('profile-icon-pulse', Codicon.pulse, localize('pulse', 'Pulse')),
	registerIcon('profile-icon-radioTower', Codicon.radioTower, localize('radioTower', 'Radio Tower')),
	registerIcon('profile-icon-smiley', Codicon.smiley, localize('smiley', 'Smiley')),
	registerIcon('profile-icon-symbolEvent', Codicon.symbolEvent, localize('symbol event', 'Event Symbol')),
	registerIcon('profile-icon-squirrel', Codicon.squirrel, localize('squirrel', 'Squirrel')),
	registerIcon('profile-icon-symbolColor', Codicon.symbolColor, localize('symbolColor', 'Color Symbol')),
	registerIcon('profile-icon-mail', Codicon.mail, localize('mail', 'Mail')),
	registerIcon('profile-icon-key', Codicon.key, localize('key', 'Key')),
	registerIcon('profile-icon-pieChart', Codicon.pieChart, localize('pieChart', 'Pie Chart')),
	registerIcon('profile-icon-organization', Codicon.organization, localize('organization', 'Organization')),
	registerIcon('profile-icon-preview', Codicon.preview, localize('preview', 'Preview')),
	registerIcon('profile-icon-wand', Codicon.wand, localize('wand', 'Wand')),
	registerIcon('profile-icon-starEmpty', Codicon.starEmpty, localize('startEmpty', 'Empty Star')),
	registerIcon('profile-icon-lightbulb', Codicon.lightbulb, localize('lightBulb', 'Idea')),
	registerIcon('profile-icon-symbolRuler', Codicon.symbolRuler, localize('symbolRuler', 'Ruler Symbol')),
	registerIcon('profile-icon-dashboard', Codicon.dashboard, localize('dashboard', 'Dashboard')),
	registerIcon('profile-icon-calendar', Codicon.calendar, localize('calendar', 'Calendar')),
	registerIcon('profile-icon-shield', Codicon.shield, localize('shield', 'Shield')),
	registerIcon('profile-icon-flame', Codicon.flame, localize('flame', 'Flame')),
	registerIcon('profile-icon-compass', Codicon.compass, localize('compass', 'Compass')),
	registerIcon('profile-icon-paintcan', Codicon.paintcan, localize('paintcan', 'Paint Can')),
	registerIcon('profile-icon-archive', Codicon.archive, localize('archive', 'Archive')),

];
