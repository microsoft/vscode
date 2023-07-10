"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.referenceGeneratedDepsByArch = exports.recommendedDeps = exports.additionalDeps = void 0;
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/additional_deps
// Additional dependencies not in the dpkg-shlibdeps output.
exports.additionalDeps = [
    'ca-certificates',
    'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
    'libnss3 (>= 3.26)',
    'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
    'xdg-utils (>= 1.0.2)' // OS integration
];
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/manual_recommends
// Dependencies that we can only recommend
// for now since some of the older distros don't support them.
exports.recommendedDeps = [
    'libvulkan1' // Move to additionalDeps once support for Trusty and Jessie are dropped.
];
exports.referenceGeneratedDepsByArch = {
    'amd64': [
        'ca-certificates',
        'libasound2 (>= 1.0.17)',
        'libatk-bridge2.0-0 (>= 2.5.3)',
        'libatk1.0-0 (>= 2.2.0)',
        'libatspi2.0-0 (>= 2.9.90)',
        'libc6 (>= 2.14)',
        'libc6 (>= 2.17)',
        'libc6 (>= 2.2.5)',
        'libcairo2 (>= 1.6.0)',
        'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
        'libdbus-1-3 (>= 1.5.12)',
        'libdrm2 (>= 2.4.60)',
        'libexpat1 (>= 2.0.1)',
        'libgbm1 (>= 17.1.0~rc2)',
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
        'xdg-utils (>= 1.0.2)'
    ],
    'armhf': [
        'ca-certificates',
        'libasound2 (>= 1.0.17)',
        'libatk-bridge2.0-0 (>= 2.5.3)',
        'libatk1.0-0 (>= 2.2.0)',
        'libatspi2.0-0 (>= 2.9.90)',
        'libc6 (>= 2.15)',
        'libc6 (>= 2.17)',
        'libc6 (>= 2.4)',
        'libc6 (>= 2.8)',
        'libc6 (>= 2.9)',
        'libcairo2 (>= 1.6.0)',
        'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
        'libdbus-1-3 (>= 1.5.12)',
        'libdrm2 (>= 2.4.60)',
        'libexpat1 (>= 2.0.1)',
        'libgbm1 (>= 17.1.0~rc2)',
        'libglib2.0-0 (>= 2.12.0)',
        'libglib2.0-0 (>= 2.39.4)',
        'libgtk-3-0 (>= 3.9.10)',
        'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
        'libnspr4 (>= 2:4.9-2~)',
        'libnss3 (>= 2:3.22)',
        'libnss3 (>= 3.26)',
        'libpango-1.0-0 (>= 1.14.0)',
        'libsecret-1-0 (>= 0.18)',
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
        'xdg-utils (>= 1.0.2)'
    ],
    'arm64': [
        'ca-certificates',
        'libasound2 (>= 1.0.17)',
        'libatk-bridge2.0-0 (>= 2.5.3)',
        'libatk1.0-0 (>= 2.2.0)',
        'libatspi2.0-0 (>= 2.9.90)',
        'libc6 (>= 2.17)',
        'libcairo2 (>= 1.6.0)',
        'libcurl3-gnutls | libcurl3-nss | libcurl4 | libcurl3',
        'libdbus-1-3 (>= 1.0.2)',
        'libdrm2 (>= 2.4.60)',
        'libexpat1 (>= 2.0.1)',
        'libgbm1 (>= 17.1.0~rc2)',
        'libglib2.0-0 (>= 2.12.0)',
        'libglib2.0-0 (>= 2.39.4)',
        'libgtk-3-0 (>= 3.9.10)',
        'libgtk-3-0 (>= 3.9.10) | libgtk-4-1',
        'libnspr4 (>= 2:4.9-2~)',
        'libnss3 (>= 2:3.22)',
        'libnss3 (>= 3.26)',
        'libpango-1.0-0 (>= 1.14.0)',
        'libsecret-1-0 (>= 0.18)',
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
        'xdg-utils (>= 1.0.2)'
    ]
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVwLWxpc3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGVwLWxpc3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7O0FBRWhHLGtIQUFrSDtBQUNsSCw0REFBNEQ7QUFDL0MsUUFBQSxjQUFjLEdBQUc7SUFDN0IsaUJBQWlCO0lBQ2pCLHFDQUFxQztJQUNyQyxtQkFBbUI7SUFDbkIsc0RBQXNEO0lBQ3RELHNCQUFzQixDQUFDLGlCQUFpQjtDQUN4QyxDQUFDO0FBRUYsb0hBQW9IO0FBQ3BILDBDQUEwQztBQUMxQyw4REFBOEQ7QUFDakQsUUFBQSxlQUFlLEdBQUc7SUFDOUIsWUFBWSxDQUFDLHlFQUF5RTtDQUN0RixDQUFDO0FBRVcsUUFBQSw0QkFBNEIsR0FBRztJQUMzQyxPQUFPLEVBQUU7UUFDUixpQkFBaUI7UUFDakIsd0JBQXdCO1FBQ3hCLCtCQUErQjtRQUMvQix3QkFBd0I7UUFDeEIsMkJBQTJCO1FBQzNCLGlCQUFpQjtRQUNqQixpQkFBaUI7UUFDakIsa0JBQWtCO1FBQ2xCLHNCQUFzQjtRQUN0QixzREFBc0Q7UUFDdEQseUJBQXlCO1FBQ3pCLHFCQUFxQjtRQUNyQixzQkFBc0I7UUFDdEIseUJBQXlCO1FBQ3pCLDBCQUEwQjtRQUMxQiwwQkFBMEI7UUFDMUIsd0JBQXdCO1FBQ3hCLHFDQUFxQztRQUNyQyx3QkFBd0I7UUFDeEIscUJBQXFCO1FBQ3JCLG1CQUFtQjtRQUNuQiw0QkFBNEI7UUFDNUIseUJBQXlCO1FBQ3pCLFVBQVU7UUFDViwwQkFBMEI7UUFDMUIsb0JBQW9CO1FBQ3BCLCtCQUErQjtRQUMvQix3QkFBd0I7UUFDeEIsVUFBVTtRQUNWLFlBQVk7UUFDWiwwQkFBMEI7UUFDMUIsYUFBYTtRQUNiLFlBQVk7UUFDWixzQkFBc0I7S0FDdEI7SUFDRCxPQUFPLEVBQUU7UUFDUixpQkFBaUI7UUFDakIsd0JBQXdCO1FBQ3hCLCtCQUErQjtRQUMvQix3QkFBd0I7UUFDeEIsMkJBQTJCO1FBQzNCLGlCQUFpQjtRQUNqQixpQkFBaUI7UUFDakIsZ0JBQWdCO1FBQ2hCLGdCQUFnQjtRQUNoQixnQkFBZ0I7UUFDaEIsc0JBQXNCO1FBQ3RCLHNEQUFzRDtRQUN0RCx5QkFBeUI7UUFDekIscUJBQXFCO1FBQ3JCLHNCQUFzQjtRQUN0Qix5QkFBeUI7UUFDekIsMEJBQTBCO1FBQzFCLDBCQUEwQjtRQUMxQix3QkFBd0I7UUFDeEIscUNBQXFDO1FBQ3JDLHdCQUF3QjtRQUN4QixxQkFBcUI7UUFDckIsbUJBQW1CO1FBQ25CLDRCQUE0QjtRQUM1Qix5QkFBeUI7UUFDekIsbUJBQW1CO1FBQ25CLHFCQUFxQjtRQUNyQixtQkFBbUI7UUFDbkIsVUFBVTtRQUNWLDBCQUEwQjtRQUMxQixvQkFBb0I7UUFDcEIsK0JBQStCO1FBQy9CLHdCQUF3QjtRQUN4QixVQUFVO1FBQ1YsWUFBWTtRQUNaLDBCQUEwQjtRQUMxQixhQUFhO1FBQ2IsWUFBWTtRQUNaLHNCQUFzQjtLQUN0QjtJQUNELE9BQU8sRUFBRTtRQUNSLGlCQUFpQjtRQUNqQix3QkFBd0I7UUFDeEIsK0JBQStCO1FBQy9CLHdCQUF3QjtRQUN4QiwyQkFBMkI7UUFDM0IsaUJBQWlCO1FBQ2pCLHNCQUFzQjtRQUN0QixzREFBc0Q7UUFDdEQsd0JBQXdCO1FBQ3hCLHFCQUFxQjtRQUNyQixzQkFBc0I7UUFDdEIseUJBQXlCO1FBQ3pCLDBCQUEwQjtRQUMxQiwwQkFBMEI7UUFDMUIsd0JBQXdCO1FBQ3hCLHFDQUFxQztRQUNyQyx3QkFBd0I7UUFDeEIscUJBQXFCO1FBQ3JCLG1CQUFtQjtRQUNuQiw0QkFBNEI7UUFDNUIseUJBQXlCO1FBQ3pCLG1CQUFtQjtRQUNuQixxQkFBcUI7UUFDckIsbUJBQW1CO1FBQ25CLFVBQVU7UUFDViwwQkFBMEI7UUFDMUIsb0JBQW9CO1FBQ3BCLCtCQUErQjtRQUMvQix3QkFBd0I7UUFDeEIsVUFBVTtRQUNWLFlBQVk7UUFDWiwwQkFBMEI7UUFDMUIsYUFBYTtRQUNiLFlBQVk7UUFDWixzQkFBc0I7S0FDdEI7Q0FDRCxDQUFDIn0=