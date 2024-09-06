/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

export const DEFAULT_ICON = registerIcon('settings-view-bar-icon', Codicon.settingsGear, localize('settingsViewBarIcon', "Settings icon in the view bar."));

export const ICONS = [

	/* Default */
	DEFAULT_ICON,

	/* hardware/devices */
	Codicon.vm,
	Codicon.server,
	Codicon.recordKeys,
	Codicon.deviceMobile,
	Codicon.watch,
	Codicon.vr,
	Codicon.piano,

	/* languages */
	Codicon.ruby,
	Codicon.code,
	Codicon.coffee,
	Codicon.snake,

	/* project types */
	Codicon.window,
	Codicon.library,
	Codicon.extensions,
	Codicon.terminal,
	Codicon.beaker,
	Codicon.package,
	Codicon.cloud,
	Codicon.book,
	Codicon.globe,
	Codicon.database,
	Codicon.notebook,
	Codicon.robot,
	Codicon.game,
	Codicon.chip,
	Codicon.music,

	/* misc */
	Codicon.gift,
	Codicon.send,
	Codicon.briefcase,
	Codicon.megaphone,
	Codicon.comment,
	Codicon.telescope,
	Codicon.creditCard,
	Codicon.map,
	Codicon.deviceCameraVideo,
	Codicon.unmute,
	Codicon.law,
	Codicon.graphLine,
	Codicon.heart,
	Codicon.home,
	Codicon.inbox,
	Codicon.mortarBoard,
	Codicon.rocket,
	Codicon.magnet,
	Codicon.lock,
	Codicon.milestone,
	Codicon.tag,
	Codicon.pulse,
	Codicon.radioTower,
	Codicon.smiley,
	Codicon.zap,
	Codicon.squirrel,
	Codicon.symbolColor,
	Codicon.mail,
	Codicon.key,
	Codicon.pieChart,
	Codicon.organization,
	Codicon.preview,
	Codicon.wand,
	Codicon.starEmpty,
	Codicon.lightbulb,
	Codicon.symbolRuler,
	Codicon.dashboard,
	Codicon.calendar,
	Codicon.shield,
	Codicon.flame,
	Codicon.compass,
	Codicon.paintcan,
	Codicon.archive,
	Codicon.mic,
	Codicon.jersey,

];
