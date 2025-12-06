/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const SLACK_AUTH_PROVIDER_ID = 'slack';
export const SLACK_AUTH_PROVIDER_LABEL = 'Slack';
export const SESSIONS_SECRET_KEY = 'slack.sessions';

// These values come from the slack app
export const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || '';
export const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || '';

// Deployed the oauth-redirect/index.html to Vercel
export const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || '';

export const SLACK_SCOPES = [
	'channels:history',
	'channels:read',
	'groups:history',
	'groups:read',
	'users:read',
	'im:history',
	'im:read'
].join(',');
