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
