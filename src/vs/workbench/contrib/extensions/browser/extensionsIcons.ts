/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

export const extensionsViewIcon = registerIcon('extensions-view-icon', Codicon.extensions, localize('extensionsViewIcon', 'View icon of the extensions view.'));

export const manageExtensionIcon = registerIcon('extensions-manage', Codicon.gear, localize('manageExtensionIcon', 'Icon for the \'Manage\' action in the extensions view.'));

export const clearSearchResultsIcon = registerIcon('extensions-clear-search-results', Codicon.clearAll, localize('clearSearchResultsIcon', 'Icon for the \'Clear Search Result\' action in the extensions view.'));
export const refreshIcon = registerIcon('extensions-refresh', Codicon.refresh, localize('refreshIcon', 'Icon for the \'Refresh\' action in the extensions view.'));
export const filterIcon = registerIcon('extensions-filter', Codicon.filter, localize('filterIcon', 'Icon for the \'Filter\' action in the extensions view.'));

export const installLocalInRemoteIcon = registerIcon('extensions-install-local-in-remote', Codicon.cloudDownload, localize('installLocalInRemoteIcon', 'Icon for the \'Install Local Extension in Remote\' action in the extensions view.'));
export const installWorkspaceRecommendedIcon = registerIcon('extensions-install-workspace-recommended', Codicon.cloudDownload, localize('installWorkspaceRecommendedIcon', 'Icon for the \'Install Workspace Recommended Extensions\' action in the extensions view.'));
export const configureRecommendedIcon = registerIcon('extensions-configure-recommended', Codicon.pencil, localize('configureRecommendedIcon', 'Icon for the \'Configure Recommended Extensions\' action in the extensions view.'));

export const syncEnabledIcon = registerIcon('extensions-sync-enabled', Codicon.sync, localize('syncEnabledIcon', 'Icon to indicate that an extension is synced.'));
export const syncIgnoredIcon = registerIcon('extensions-sync-ignored', Codicon.syncIgnored, localize('syncIgnoredIcon', 'Icon to indicate that an extension is ignored when syncing.'));
export const remoteIcon = registerIcon('extensions-remote', Codicon.remote, localize('remoteIcon', 'Icon to indicate that an extension is remote in the extensions view and editor.'));
export const installCountIcon = registerIcon('extensions-install-count', Codicon.cloudDownload, localize('installCountIcon', 'Icon shown along with the install count in the extensions view and editor.'));
export const ratingIcon = registerIcon('extensions-rating', Codicon.star, localize('ratingIcon', 'Icon shown along with the rating in the extensions view and editor.'));
export const preReleaseIcon = registerIcon('extensions-pre-release', Codicon.versions, localize('preReleaseIcon', 'Icon shown for extensions having pre-release versions in extensions view and editor.'));
export const sponsorIcon = registerIcon('extensions-sponsor', Codicon.heartFilled, localize('sponsorIcon', 'Icon used for sponsoring extensions in the extensions view and editor.'));

export const starFullIcon = registerIcon('extensions-star-full', Codicon.starFull, localize('starFullIcon', 'Full star icon used for the rating in the extensions editor.'));
export const starHalfIcon = registerIcon('extensions-star-half', Codicon.starHalf, localize('starHalfIcon', 'Half star icon used for the rating in the extensions editor.'));
export const starEmptyIcon = registerIcon('extensions-star-empty', Codicon.starEmpty, localize('starEmptyIcon', 'Empty star icon used for the rating in the extensions editor.'));

export const errorIcon = registerIcon('extensions-error-message', Codicon.error, localize('errorIcon', 'Icon shown with a error message in the extensions editor.'));
export const warningIcon = registerIcon('extensions-warning-message', Codicon.warning, localize('warningIcon', 'Icon shown with a warning message in the extensions editor.'));
export const infoIcon = registerIcon('extensions-info-message', Codicon.info, localize('infoIcon', 'Icon shown with an info message in the extensions editor.'));

export const trustIcon = registerIcon('extension-workspace-trust', Codicon.shield, localize('trustIcon', 'Icon shown with a workspace trust message in the extension editor.'));
export const activationTimeIcon = registerIcon('extension-activation-time', Codicon.history, localize('activationtimeIcon', 'Icon shown with a activation time message in the extension editor.'));
