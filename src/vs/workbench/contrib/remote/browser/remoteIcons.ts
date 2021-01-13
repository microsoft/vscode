/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export const getStartedIcon = registerIcon('remote-explorer-get-started', Codicon.star, nls.localize('getStartedIcon', 'Getting started icon in the remote explorer view.'));
export const documentationIcon = registerIcon('remote-explorer-documentation', Codicon.book, nls.localize('documentationIcon', 'Documentation icon in the remote explorer view.'));
export const feedbackIcon = registerIcon('remote-explorer-feedback', Codicon.twitter, nls.localize('feedbackIcon', 'Feedback icon in the remote explorer view.'));
export const reviewIssuesIcon = registerIcon('remote-explorer-review-issues', Codicon.issues, nls.localize('reviewIssuesIcon', 'Review issue icon in the remote explorer view.'));
export const reportIssuesIcon = registerIcon('remote-explorer-report-issues', Codicon.comment, nls.localize('reportIssuesIcon', 'Report issue icon in the remote explorer view.'));
export const remoteExplorerViewIcon = registerIcon('remote-explorer-view-icon', Codicon.remoteExplorer, nls.localize('remoteExplorerViewIcon', 'View icon of the remote explorer view.'));

export const portsViewIcon = registerIcon('ports-view-icon', Codicon.plug, nls.localize('portsViewIcon', 'View icon of the remote ports view.'));
export const portIcon = registerIcon('ports-view-icon', Codicon.plug, nls.localize('portIcon', 'Icon representing a remote port.'));
export const privatePortIcon = registerIcon('private-ports-view-icon', Codicon.lock, nls.localize('privatePortIcon', 'Icon representing a private remote port.'));
export const publicPortIcon = registerIcon('public-ports-view-icon', Codicon.eye, nls.localize('publicPortIcon', 'Icon representing a public remote port.'));

export const forwardPortIcon = registerIcon('ports-forward-icon', Codicon.plus, nls.localize('forwardPortIcon', 'Icon for the forward action.'));
export const stopForwardIcon = registerIcon('ports-stop-forward-icon', Codicon.x, nls.localize('stopForwardIcon', 'Icon for the stop forwarding action.'));
export const openBrowserIcon = registerIcon('ports-open-browser-icon', Codicon.globe, nls.localize('openBrowserIcon', 'Icon for the open browser action.'));
