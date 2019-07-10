/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This file is to bootstrap AMD so that we can program as usual
// Note the fetch, install, activate event handler must be registered
// when loading the service worker and despite AMD's async nature this
// works. That's because the/our AMD loader uses the sync importScripts
// statement.

// trigger service worker updates
const _tag = '91e182d6-d06b-40ff-a517-32df368117f8';

// loader world
const baseUrl = '../../../../../';
importScripts(baseUrl + 'vs/loader.js');
require.config({
	baseUrl,
	catchError: true
});
require(['vs/workbench/contrib/resources/browser/resourceServiceWorker'],
	() => { },
	err => console.error(err)
);

