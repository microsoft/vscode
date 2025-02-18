/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/additional_deps
// Additional dependencies not in the dpkg-shlibdeps output.
export const additionalDeps = [
	'ca-certificates', // Make sure users have SSL certificates.
	'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
	'libnss3 (>= 3.26)',
	'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3', // For Breakpad crash reports.
	'xdg-utils (>= 1.0.2)', // OS integration
];

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/manual_recommends
// Dependencies that we can only recommend
// for now since some of the older distros don't support them.
export const recommendedDeps = [
	'libvulkan1' // Move to additionalDeps once support for Trusty and Jessie are dropped.
];

export const referenceGeneratedDepsByArch = {
	'amd64': [
		'ca-certificates',
		'libasound2 (>= 1.0.17)',
		'libatk-bridge2.0-0 (>= 2.5.3)',
		'libatk1.0-0 (>= 2.11.90)',
		'libatspi2.0-0 (>= 2.9.90)',
		'libc6 (>= 2.14)',
		'libc6 (>= 2.16)',
		'libc6 (>= 2.17)',
		'libc6 (>= 2.2.5)',
		'libc6 (>= 2.25)',
		'libc6 (>= 2.28)',
		'libcairo2 (>= 1.6.0)',
		'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
		'libdbus-1-3 (>= 1.9.14)',
		'libexpat1 (>= 2.1~beta3)',
		'libgbm1 (>= 17.1.0~rc2)',
		'libglib2.0-0 (>= 2.37.3)',
		'libgtk-3-0 (>= 3.9.10)',
		'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
		'libnspr4 (>= 2:4.9-2~)',
		'libnss3 (>= 2:3.30)',
		'libnss3 (>= 3.26)',
		'libpango-1.0-0 (>= 1.14.0)',
		'libudev1 (>= 183)',
		'libx11-6',
		'libx11-6 (>= 2:1.4.99.1)',
		'libxcb1 (>= 1.9.2)',
		'libxcomposite1 (>= 1:0.4.4-1)',
		'libxdamage1 (>= 1:1.1)',
		'libxext6',
		'libxfixes3',
		'libxkbcommon0 (>= 0.5.0)',
		'libxkbfile1 (>= 1:1.1.0)',
		'libxrandr2',
		'xdg-utils (>= 1.0.2)'
	],
	'armhf': [
		'ca-certificates',
		'libasound2 (>= 1.0.17)',
		'libatk-bridge2.0-0 (>= 2.5.3)',
		'libatk1.0-0 (>= 2.11.90)',
		'libatspi2.0-0 (>= 2.9.90)',
		'libc6 (>= 2.16)',
		'libc6 (>= 2.17)',
		'libc6 (>= 2.25)',
		'libc6 (>= 2.28)',
		'libc6 (>= 2.4)',
		'libc6 (>= 2.9)',
		'libcairo2 (>= 1.6.0)',
		'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
		'libdbus-1-3 (>= 1.9.14)',
		'libexpat1 (>= 2.1~beta3)',
		'libgbm1 (>= 17.1.0~rc2)',
		'libglib2.0-0 (>= 2.37.3)',
		'libgtk-3-0 (>= 3.9.10)',
		'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
		'libnspr4 (>= 2:4.9-2~)',
		'libnss3 (>= 2:3.30)',
		'libnss3 (>= 3.26)',
		'libpango-1.0-0 (>= 1.14.0)',
		'libstdc++6 (>= 4.1.1)',
		'libstdc++6 (>= 5)',
		'libstdc++6 (>= 5.2)',
		'libstdc++6 (>= 6)',
		'libudev1 (>= 183)',
		'libx11-6',
		'libx11-6 (>= 2:1.4.99.1)',
		'libxcb1 (>= 1.9.2)',
		'libxcomposite1 (>= 1:0.4.4-1)',
		'libxdamage1 (>= 1:1.1)',
		'libxext6',
		'libxfixes3',
		'libxkbcommon0 (>= 0.5.0)',
		'libxkbfile1 (>= 1:1.1.0)',
		'libxrandr2',
		'xdg-utils (>= 1.0.2)'
	],
	'arm64': [
		'ca-certificates',
		'libasound2 (>= 1.0.17)',
		'libatk-bridge2.0-0 (>= 2.5.3)',
		'libatk1.0-0 (>= 2.11.90)',
		'libatspi2.0-0 (>= 2.9.90)',
		'libc6 (>= 2.17)',
		'libc6 (>= 2.25)',
		'libc6 (>= 2.28)',
		'libcairo2 (>= 1.6.0)',
		'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
		'libdbus-1-3 (>= 1.9.14)',
		'libexpat1 (>= 2.1~beta3)',
		'libgbm1 (>= 17.1.0~rc2)',
		'libglib2.0-0 (>= 2.37.3)',
		'libgtk-3-0 (>= 3.9.10)',
		'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
		'libnspr4 (>= 2:4.9-2~)',
		'libnss3 (>= 2:3.30)',
		'libnss3 (>= 3.26)',
		'libpango-1.0-0 (>= 1.14.0)',
		'libstdc++6 (>= 4.1.1)',
		'libstdc++6 (>= 5)',
		'libstdc++6 (>= 5.2)',
		'libstdc++6 (>= 6)',
		'libudev1 (>= 183)',
		'libx11-6',
		'libx11-6 (>= 2:1.4.99.1)',
		'libxcb1 (>= 1.9.2)',
		'libxcomposite1 (>= 1:0.4.4-1)',
		'libxdamage1 (>= 1:1.1)',
		'libxext6',
		'libxfixes3',
		'libxkbcommon0 (>= 0.5.0)',
		'libxkbfile1 (>= 1:1.1.0)',
		'libxrandr2',
		'xdg-utils (>= 1.0.2)'
	]
};
