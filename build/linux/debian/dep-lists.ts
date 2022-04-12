/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/additional_deps
// Additional dependencies not in the dpkg-shlibdeps output.
export const additionalDeps = [
	'ca-certificates', // Make sure users have SSL certificates.
	'fonts-liberation', // This is for viewing PDFs. Do we need this?
	'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
	'libnss3 (>= 3.26)',
	'wget', // For Breakpad crash reports.
	'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3', // For Breakpad crash reports.
	'xdg-utils (>= 1.0.2)' // OS integration
];

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/manual_recommends
// Dependencies that we can only recommend
// for now since some of the older distros don't support them.
export const recommendedDeps = [
	'libu2f-udev', // Move to additionalDeps once support for Jessie, Stretch, Trusty, and Xenial are dropped.
	'libvulkan1' // Move to additionalDeps once support for Trusty and Jessie are dropped.
];

// Based on https://source.chromium.org/chromium/chromium/src/+/refs/tags/98.0.4758.109:chrome/installer/linux/BUILD.gn;l=64-80
// and the Linux Archive build
// Shared library dependencies that we already bundle.
export const bundledDeps = [
	'libEGL.so',
	'libGLESv2.so',
	'libvulkan.so.1',
	'swiftshader_libEGL.so',
	'swiftshader_libGLESv2.so',
	'libvk_swiftshader.so',
	'libffmpeg.so'
];

export const referenceGeneratedDepsByArch = {
	'amd64': [
		'ca-certificates',
		'fonts-liberation',
		'libasound2 (>= 1.0.16)',
		'libatk-bridge2.0-0 (>= 2.5.3)',
		'libatk1.0-0 (>= 2.2.0)',
		'libatspi2.0-0 (>= 2.9.90)',
		'libc6 (>= 2.14)',
		'libc6 (>= 2.17)',
		'libc6 (>= 2.2.5)',
		'libcairo2 (>= 1.6.0)',
		'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
		'libdbus-1-3 (>= 1.5.12)',
		'libdrm2 (>= 2.4.38)',
		'libexpat1 (>= 2.0.1)',
		'libgbm1 (>= 17.1.0~rc2)',
		'libgcc1 (>= 1:3.0)',
		'libgdk-pixbuf-2.0-0 (>= 2.22.0)',
		'libglib2.0-0 (>= 2.16.0)',
		'libglib2.0-0 (>= 2.39.4)',
		'libgtk-3-0 (>= 3.9.10)',
		'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
		'libnspr4 (>= 2:4.9-2~)',
		'libnss3 (>= 2:3.22)',
		'libnss3 (>= 3.26)',
		'libpango-1.0-0 (>= 1.14.0)',
		'libsecret-1-0 (>= 0.18)',
		'libx11-6',
		'libx11-6 (>= 2:1.4.99.1)',
		'libxcb1 (>= 1.9.2)',
		'libxcomposite1 (>= 1:0.4.4-1)',
		'libxdamage1 (>= 1:1.1)',
		'libxext6',
		'libxfixes3',
		'libxkbcommon0 (>= 0.4.1)',
		'libxkbfile1',
		'libxrandr2',
		'wget',
		'xdg-utils (>= 1.0.2)'
	],
	'armhf': [
		'ca-certificates',
		'fonts-liberation',
		'libasound2 (>= 1.0.16)',
		'libatk-bridge2.0-0 (>= 2.5.3)',
		'libatk1.0-0 (>= 2.2.0)',
		'libatspi2.0-0 (>= 2.9.90)',
		'libc6 (>= 2.17)',
		'libc6 (>= 2.4)',
		'libc6 (>= 2.9)',
		'libcairo2 (>= 1.6.0)',
		'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
		'libdbus-1-3 (>= 1.5.12)',
		'libdrm2 (>= 2.4.38)',
		'libexpat1 (>= 2.0.1)',
		'libgbm1 (>= 17.1.0~rc2)',
		'libgcc1 (>= 1:3.0)',
		'libgcc1 (>= 1:3.5)',
		'libgdk-pixbuf-2.0-0 (>= 2.22.0)',
		'libglib2.0-0 (>= 2.16.0)',
		'libglib2.0-0 (>= 2.39.4)',
		'libgtk-3-0 (>= 3.9.10)',
		'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
		'libnspr4 (>= 2:4.9-2~)',
		'libnss3 (>= 2:3.22)',
		'libnss3 (>= 3.26)',
		'libpango-1.0-0 (>= 1.14.0)',
		'libsecret-1-0 (>= 0.18)',
		'libstdc++6 (>= 4.1.1)',
		'libstdc++6 (>= 5)',
		'libstdc++6 (>= 5.2)',
		'libstdc++6 (>= 6)',
		'libx11-6',
		'libx11-6 (>= 2:1.4.99.1)',
		'libxcb1 (>= 1.9.2)',
		'libxcomposite1 (>= 1:0.4.4-1)',
		'libxdamage1 (>= 1:1.1)',
		'libxext6',
		'libxfixes3',
		'libxkbcommon0 (>= 0.4.1)',
		'libxkbfile1',
		'libxrandr2',
		'wget',
		'xdg-utils (>= 1.0.2)'
	],
	'arm64': [
		'ca-certificates',
		'fonts-liberation',
		'libasound2 (>= 1.0.16)',
		'libatk-bridge2.0-0 (>= 2.5.3)',
		'libatk1.0-0 (>= 2.2.0)',
		'libatspi2.0-0 (>= 2.9.90)',
		'libc6 (>= 2.17)',
		'libcairo2 (>= 1.6.0)',
		'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
		'libdbus-1-3 (>= 1.0.2)',
		'libdrm2 (>= 2.4.38)',
		'libexpat1 (>= 2.0.1)',
		'libgbm1 (>= 17.1.0~rc2)',
		'libgcc1 (>= 1:3.0)',
		'libgcc1 (>= 1:4.2)',
		'libgcc1 (>= 1:4.5)',
		'libgdk-pixbuf-2.0-0 (>= 2.22.0)',
		'libglib2.0-0 (>= 2.16.0)',
		'libglib2.0-0 (>= 2.39.4)',
		'libgtk-3-0 (>= 3.9.10)',
		'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
		'libnspr4 (>= 2:4.9-2~)',
		'libnss3 (>= 2:3.22)',
		'libnss3 (>= 3.26)',
		'libpango-1.0-0 (>= 1.14.0)',
		'libsecret-1-0 (>= 0.18)',
		'libstdc++6 (>= 4.1.1)',
		'libstdc++6 (>= 5)',
		'libstdc++6 (>= 5.2)',
		'libstdc++6 (>= 6)',
		'libx11-6',
		'libx11-6 (>= 2:1.4.99.1)',
		'libxcb1 (>= 1.9.2)',
		'libxcomposite1 (>= 1:0.4.4-1)',
		'libxdamage1 (>= 1:1.1)',
		'libxext6',
		'libxfixes3',
		'libxkbcommon0 (>= 0.4.1)',
		'libxkbfile1',
		'libxrandr2',
		'wget',
		'xdg-utils (>= 1.0.2)'
	]
};
