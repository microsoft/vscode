/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./preview-src/index.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./preview-src/events.ts":
/*!*******************************!*\
  !*** ./preview-src/events.ts ***!
  \*******************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.onceDocumentLoaded = void 0;
function onceDocumentLoaded(f) {
    if (document.readyState === 'loading' || document.readyState === 'uninitialized') {
        document.addEventListener('DOMContentLoaded', f);
    }
    else {
        f();
    }
}
exports.onceDocumentLoaded = onceDocumentLoaded;


/***/ }),

/***/ "./preview-src/index.ts":
/*!******************************!*\
  !*** ./preview-src/index.ts ***!
  \******************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __webpack_require__(/*! ./events */ "./preview-src/events.ts");
const vscode = acquireVsCodeApi();
function getSettings() {
    const element = document.getElementById('simple-browser-settings');
    if (element) {
        const data = element.getAttribute('data-settings');
        if (data) {
            return JSON.parse(data);
        }
    }
    throw new Error(`Could not load settings`);
}
const settings = getSettings();
const iframe = document.querySelector('iframe');
const header = document.querySelector('.header');
const input = header.querySelector('.url-input');
const forwardButton = header.querySelector('.forward-button');
const backButton = header.querySelector('.back-button');
const reloadButton = header.querySelector('.reload-button');
const openExternalButton = header.querySelector('.open-external-button');
window.addEventListener('message', e => {
    switch (e.data.type) {
        case 'focus':
            {
                iframe.focus();
                break;
            }
        case 'didChangeFocusLockIndicatorEnabled':
            {
                toggleFocusLockIndicatorEnabled(e.data.enabled);
                break;
            }
    }
});
events_1.onceDocumentLoaded(() => {
    setInterval(() => {
        var _a;
        const iframeFocused = ((_a = document.activeElement) === null || _a === void 0 ? void 0 : _a.tagName) === 'IFRAME';
        document.body.classList.toggle('iframe-focused', iframeFocused);
    }, 50);
    iframe.addEventListener('load', () => {
        // Noop
    });
    input.addEventListener('change', e => {
        const url = e.target.value;
        navigateTo(url);
    });
    forwardButton.addEventListener('click', () => {
        history.forward();
    });
    backButton.addEventListener('click', () => {
        history.back();
    });
    openExternalButton.addEventListener('click', () => {
        vscode.postMessage({
            type: 'openExternal',
            url: input.value
        });
    });
    reloadButton.addEventListener('click', () => {
        // This does not seem to trigger what we want
        // history.go(0);
        // This incorrectly adds entries to the history but does reload
        iframe.src = input.value;
    });
    navigateTo(settings.url);
    input.value = settings.url;
    toggleFocusLockIndicatorEnabled(settings.focusLockIndicatorEnabled);
    function navigateTo(rawUrl) {
        try {
            const url = new URL(rawUrl);
            // Try to bust the cache for the iframe
            // There does not appear to be any way to reliably do this except modifying the url
            url.searchParams.append('vscodeBrowserReqId', Date.now().toString());
            iframe.src = url.toString();
        }
        catch (_a) {
            iframe.src = rawUrl;
        }
    }
});
function toggleFocusLockIndicatorEnabled(enabled) {
    document.body.classList.toggle('enable-focus-lock-indicator', enabled);
}


/***/ })

/******/ });
//# sourceMappingURL=index.js.map