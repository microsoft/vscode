/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export interface IConfig {
	// The macOS broker redirect URI which is dependent on the bundle identifier of the app.
	// Other platforms do not require a redirect URI to be set.
	// Example formats:
	// msauth.com.msauth.unsignedapp://auth or msauth.<bundleId>://auth
	macOSBrokerRedirectUri: string;
}

export const Config: IConfig = {
	// TODO: This needs to be brought in via distro...
	macOSBrokerRedirectUri: 'msauth.com.microsoft.VSCodeInsiders.helper://auth'
};
