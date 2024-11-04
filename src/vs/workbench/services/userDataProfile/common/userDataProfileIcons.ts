/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

// Function to retrieve a custom icon from user settings or local storage
function getCustomUserIcon() {
    // Example logic to retrieve the custom icon path or base64 string from user settings or storage
    const userSettings = getUserSettings(); // You'd need to define this function to get user settings
    return userSettings?.customProfileIcon || null;
}

const customIcon = getCustomUserIcon();

// Register the profile icon, falling back to the default if no custom icon is available
export const PROFILE_ICON = registerIcon(
    'settings-view-bar-icon',
    customIcon || Codicon.settingsGear, // Use custom icon if available, otherwise use the default settings gear icon
    localize('settingsViewBarIcon', "Custom or default settings icon in the view bar.")
);

// Existing icons array
export const ICONS = [

    /* User or default profile icon */
    PROFILE_ICON,

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
    Codicon.project,
    Codicon.window,
    Codicon.library,
    Codicon.extensions,
    Codicon.terminal,
    Codicon.terminalDebian,
    Codicon.terminalLinux,
    Codicon.terminalUbuntu,
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
    Codicon.remoteExplorer,
    Codicon.github,
    Codicon.azure,
    Codicon.vscode,
    Codicon.extensions,

    /* misc */
    Codicon.gift,
    Codicon.send,
    Codicon.bookmark,
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
    Codicon.verified,
    Codicon.debug,
    Codicon.flame,
    Codicon.compass,
    Codicon.paintcan,
    Codicon.archive,
    Codicon.mic,
    Codicon.jersey,
];
