/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export interface IConfig {
	// The macOS broker redirect URI which is dependent on the bundle identifier of the signed app.
	// Other platforms do not require a redirect URI to be set. For unsigned apps, the unsigned
	// format can be used.
	// Example formats:
	// msauth.com.msauth.unsignedapp://auth or msauth.<bundleId>://auth
	macOSBrokerRedirectUri: string;
}

export const Config: IConfig = {
	// This is replaced in the build with the correct bundle id for that distro.
	macOSBrokerRedirectUri: 'msauth.com.msauth.unsignedapp://auth'
};
