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
/******/ 	return __webpack_require__(__webpack_require__.s = "./preview-src/pre.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./preview-src/csp.ts":
/*!****************************!*\
  !*** ./preview-src/csp.ts ***!
  \****************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\n/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation. All rights reserved.\n *  Licensed under the MIT License. See License.txt in the project root for license information.\n *--------------------------------------------------------------------------------------------*/\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.CspAlerter = void 0;\nconst settings_1 = __webpack_require__(/*! ./settings */ \"./preview-src/settings.ts\");\nconst strings_1 = __webpack_require__(/*! ./strings */ \"./preview-src/strings.ts\");\n/**\n * Shows an alert when there is a content security policy violation.\n */\nclass CspAlerter {\n    constructor() {\n        this.didShow = false;\n        this.didHaveCspWarning = false;\n        document.addEventListener('securitypolicyviolation', () => {\n            this.onCspWarning();\n        });\n        window.addEventListener('message', (event) => {\n            if (event && event.data && event.data.name === 'vscode-did-block-svg') {\n                this.onCspWarning();\n            }\n        });\n    }\n    setPoster(poster) {\n        this.messaging = poster;\n        if (this.didHaveCspWarning) {\n            this.showCspWarning();\n        }\n    }\n    onCspWarning() {\n        this.didHaveCspWarning = true;\n        this.showCspWarning();\n    }\n    showCspWarning() {\n        const strings = strings_1.getStrings();\n        const settings = settings_1.getSettings();\n        if (this.didShow || settings.disableSecurityWarnings || !this.messaging) {\n            return;\n        }\n        this.didShow = true;\n        const notification = document.createElement('a');\n        notification.innerText = strings.cspAlertMessageText;\n        notification.setAttribute('id', 'code-csp-warning');\n        notification.setAttribute('title', strings.cspAlertMessageTitle);\n        notification.setAttribute('role', 'button');\n        notification.setAttribute('aria-label', strings.cspAlertMessageLabel);\n        notification.onclick = () => {\n            this.messaging.postMessage('showPreviewSecuritySelector', { source: settings.source });\n        };\n        document.body.appendChild(notification);\n    }\n}\nexports.CspAlerter = CspAlerter;\n\n\n//# sourceURL=webpack:///./preview-src/csp.ts?");

/***/ }),

/***/ "./preview-src/loading.ts":
/*!********************************!*\
  !*** ./preview-src/loading.ts ***!
  \********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.StyleLoadingMonitor = void 0;\nclass StyleLoadingMonitor {\n    constructor() {\n        this.unloadedStyles = [];\n        this.finishedLoading = false;\n        const onStyleLoadError = (event) => {\n            const source = event.target.dataset.source;\n            this.unloadedStyles.push(source);\n        };\n        window.addEventListener('DOMContentLoaded', () => {\n            for (const link of document.getElementsByClassName('code-user-style')) {\n                if (link.dataset.source) {\n                    link.onerror = onStyleLoadError;\n                }\n            }\n        });\n        window.addEventListener('load', () => {\n            if (!this.unloadedStyles.length) {\n                return;\n            }\n            this.finishedLoading = true;\n            if (this.poster) {\n                this.poster.postMessage('previewStyleLoadError', { unloadedStyles: this.unloadedStyles });\n            }\n        });\n    }\n    setPoster(poster) {\n        this.poster = poster;\n        if (this.finishedLoading) {\n            poster.postMessage('previewStyleLoadError', { unloadedStyles: this.unloadedStyles });\n        }\n    }\n}\nexports.StyleLoadingMonitor = StyleLoadingMonitor;\n\n\n//# sourceURL=webpack:///./preview-src/loading.ts?");

/***/ }),

/***/ "./preview-src/pre.ts":
/*!****************************!*\
  !*** ./preview-src/pre.ts ***!
  \****************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\n/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation. All rights reserved.\n *  Licensed under the MIT License. See License.txt in the project root for license information.\n *--------------------------------------------------------------------------------------------*/\nObject.defineProperty(exports, \"__esModule\", { value: true });\nconst csp_1 = __webpack_require__(/*! ./csp */ \"./preview-src/csp.ts\");\nconst loading_1 = __webpack_require__(/*! ./loading */ \"./preview-src/loading.ts\");\nwindow.cspAlerter = new csp_1.CspAlerter();\nwindow.styleLoadingMonitor = new loading_1.StyleLoadingMonitor();\n\n\n//# sourceURL=webpack:///./preview-src/pre.ts?");

/***/ }),

/***/ "./preview-src/settings.ts":
/*!*********************************!*\
  !*** ./preview-src/settings.ts ***!
  \*********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\n/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation. All rights reserved.\n *  Licensed under the MIT License. See License.txt in the project root for license information.\n *--------------------------------------------------------------------------------------------*/\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.getSettings = exports.getData = void 0;\nlet cachedSettings = undefined;\nfunction getData(key) {\n    const element = document.getElementById('vscode-markdown-preview-data');\n    if (element) {\n        const data = element.getAttribute(key);\n        if (data) {\n            return JSON.parse(data);\n        }\n    }\n    throw new Error(`Could not load data for ${key}`);\n}\nexports.getData = getData;\nfunction getSettings() {\n    if (cachedSettings) {\n        return cachedSettings;\n    }\n    cachedSettings = getData('data-settings');\n    if (cachedSettings) {\n        return cachedSettings;\n    }\n    throw new Error('Could not load settings');\n}\nexports.getSettings = getSettings;\n\n\n//# sourceURL=webpack:///./preview-src/settings.ts?");

/***/ }),

/***/ "./preview-src/strings.ts":
/*!********************************!*\
  !*** ./preview-src/strings.ts ***!
  \********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
eval("\n/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation. All rights reserved.\n *  Licensed under the MIT License. See License.txt in the project root for license information.\n *--------------------------------------------------------------------------------------------*/\nObject.defineProperty(exports, \"__esModule\", { value: true });\nexports.getStrings = void 0;\nfunction getStrings() {\n    const store = document.getElementById('vscode-markdown-preview-data');\n    if (store) {\n        const data = store.getAttribute('data-strings');\n        if (data) {\n            return JSON.parse(data);\n        }\n    }\n    throw new Error('Could not load strings');\n}\nexports.getStrings = getStrings;\n\n\n//# sourceURL=webpack:///./preview-src/strings.ts?");

/***/ })

/******/ });