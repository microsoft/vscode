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
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const settings_1 = __webpack_require__(/*! ./settings */ "./preview-src/settings.ts");
const strings_1 = __webpack_require__(/*! ./strings */ "./preview-src/strings.ts");
/**
 * Shows an alert when there is a content security policy violation.
 */
class CspAlerter {
    constructor() {
        this.didShow = false;
        this.didHaveCspWarning = false;
        document.addEventListener('securitypolicyviolation', () => {
            this.onCspWarning();
        });
        window.addEventListener('message', (event) => {
            if (event && event.data && event.data.name === 'vscode-did-block-svg') {
                this.onCspWarning();
            }
        });
    }
    setPoster(poster) {
        this.messaging = poster;
        if (this.didHaveCspWarning) {
            this.showCspWarning();
        }
    }
    onCspWarning() {
        this.didHaveCspWarning = true;
        this.showCspWarning();
    }
    showCspWarning() {
        const strings = strings_1.getStrings();
        const settings = settings_1.getSettings();
        if (this.didShow || settings.disableSecurityWarnings || !this.messaging) {
            return;
        }
        this.didShow = true;
        const notification = document.createElement('a');
        notification.innerText = strings.cspAlertMessageText;
        notification.setAttribute('id', 'code-csp-warning');
        notification.setAttribute('title', strings.cspAlertMessageTitle);
        notification.setAttribute('role', 'button');
        notification.setAttribute('aria-label', strings.cspAlertMessageLabel);
        notification.onclick = () => {
            this.messaging.postMessage('showPreviewSecuritySelector', { source: settings.source });
        };
        document.body.appendChild(notification);
    }
}
exports.CspAlerter = CspAlerter;


/***/ }),

/***/ "./preview-src/loading.ts":
/*!********************************!*\
  !*** ./preview-src/loading.ts ***!
  \********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
class StyleLoadingMonitor {
    constructor() {
        this.unloadedStyles = [];
        this.finishedLoading = false;
        const onStyleLoadError = (event) => {
            const source = event.target.dataset.source;
            this.unloadedStyles.push(source);
        };
        window.addEventListener('DOMContentLoaded', () => {
            for (const link of document.getElementsByClassName('code-user-style')) {
                if (link.dataset.source) {
                    link.onerror = onStyleLoadError;
                }
            }
        });
        window.addEventListener('load', () => {
            if (!this.unloadedStyles.length) {
                return;
            }
            this.finishedLoading = true;
            if (this.poster) {
                this.poster.postMessage('previewStyleLoadError', { unloadedStyles: this.unloadedStyles });
            }
        });
    }
    setPoster(poster) {
        this.poster = poster;
        if (this.finishedLoading) {
            poster.postMessage('previewStyleLoadError', { unloadedStyles: this.unloadedStyles });
        }
    }
}
exports.StyleLoadingMonitor = StyleLoadingMonitor;


/***/ }),

/***/ "./preview-src/pre.ts":
/*!****************************!*\
  !*** ./preview-src/pre.ts ***!
  \****************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const csp_1 = __webpack_require__(/*! ./csp */ "./preview-src/csp.ts");
const loading_1 = __webpack_require__(/*! ./loading */ "./preview-src/loading.ts");
window.cspAlerter = new csp_1.CspAlerter();
window.styleLoadingMonitor = new loading_1.StyleLoadingMonitor();


/***/ }),

/***/ "./preview-src/settings.ts":
/*!*********************************!*\
  !*** ./preview-src/settings.ts ***!
  \*********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
let cachedSettings = undefined;
function getData(key) {
    const element = document.getElementById('vscode-markdown-preview-data');
    if (element) {
        const data = element.getAttribute(key);
        if (data) {
            return JSON.parse(data);
        }
    }
    throw new Error(`Could not load data for ${key}`);
}
exports.getData = getData;
function getSettings() {
    if (cachedSettings) {
        return cachedSettings;
    }
    cachedSettings = getData('data-settings');
    if (cachedSettings) {
        return cachedSettings;
    }
    throw new Error('Could not load settings');
}
exports.getSettings = getSettings;


/***/ }),

/***/ "./preview-src/strings.ts":
/*!********************************!*\
  !*** ./preview-src/strings.ts ***!
  \********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
function getStrings() {
    const store = document.getElementById('vscode-markdown-preview-data');
    if (store) {
        const data = store.getAttribute('data-strings');
        if (data) {
            return JSON.parse(data);
        }
    }
    throw new Error('Could not load strings');
}
exports.getStrings = getStrings;


/***/ })

/******/ });
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly8vd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vLy4vcHJldmlldy1zcmMvY3NwLnRzIiwid2VicGFjazovLy8uL3ByZXZpZXctc3JjL2xvYWRpbmcudHMiLCJ3ZWJwYWNrOi8vLy4vcHJldmlldy1zcmMvcHJlLnRzIiwid2VicGFjazovLy8uL3ByZXZpZXctc3JjL3NldHRpbmdzLnRzIiwid2VicGFjazovLy8uL3ByZXZpZXctc3JjL3N0cmluZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxhQUFLO0FBQ0w7QUFDQTs7QUFFQTtBQUNBO0FBQ0EseURBQWlELGNBQWM7QUFDL0Q7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsbUNBQTJCLDBCQUEwQixFQUFFO0FBQ3ZELHlDQUFpQyxlQUFlO0FBQ2hEO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLDhEQUFzRCwrREFBK0Q7O0FBRXJIO0FBQ0E7OztBQUdBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FDbkVBOzs7Z0dBR2dHOztBQUdoRyxzRkFBeUM7QUFDekMsbUZBQXVDO0FBRXZDOztHQUVHO0FBQ0gsTUFBYSxVQUFVO0lBTXRCO1FBTFEsWUFBTyxHQUFHLEtBQUssQ0FBQztRQUNoQixzQkFBaUIsR0FBRyxLQUFLLENBQUM7UUFLakMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtZQUN6RCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDckIsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLENBQUMsS0FBSyxF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O0lBQzFCLElBQUksY0FBYyxFQUFFO1FBQ25CLE9BQU8sY0FBYyxDQUFDO0tBQ3RCO0lBRUQsY0FBYyxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztJQUMxQyxJQUFJLGNBQWMsRUFBRTtRQUNuQixPQUFPLGNBQWMsQ0FBQztLQUN0QjtJQUVELE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUM1QyxDQUFDO0FBWEQsa0NBV0M7Ozs7Ozs7Ozs7Ozs7O0FDeENEOzs7Z0dBR2dHOztBQUVoRyxTQUFnQixVQUFVO0lBQ3pCLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsOEJBQThCLENBQUMsQ0FBQztJQUN0RSxJQUFJLEtBQUssRUFBRTtRQUNWLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDaEQsSUFBSSxJQUFJLEVBQUU7WUFDVCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDeEI7S0FDRDtJQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQztBQUMzQyxDQUFDO0FBVEQsZ0NBU0MiLCJmaWxlIjoicHJlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiIFx0Ly8gVGhlIG1vZHVsZSBjYWNoZVxuIFx0dmFyIGluc3RhbGxlZE1vZHVsZXMgPSB7fTtcblxuIFx0Ly8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbiBcdGZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblxuIFx0XHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcbiBcdFx0aWYoaW5zdGFsbGVkTW9kdWxlc1ttb2R1bGVJZF0pIHtcbiBcdFx0XHRyZXR1cm4gaW5zdGFsbGVkTW9kdWxlc1ttb2R1bGVJZF0uZXhwb3J0cztcbiBcdFx0fVxuIFx0XHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuIFx0XHR2YXIgbW9kdWxlID0gaW5zdGFsbGVkTW9kdWxlc1ttb2R1bGVJZF0gPSB7XG4gXHRcdFx0aTogbW9kdWxlSWQsXG4gXHRcdFx0bDogZmFsc2UsXG4gXHRcdFx0ZXhwb3J0czoge31cbiBcdFx0fTtcblxuIFx0XHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cbiBcdFx0bW9kdWxlc1ttb2R1bGVJZF0uY2FsbChtb2R1bGUuZXhwb3J0cywgbW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cbiBcdFx0Ly8gRmxhZyB0aGUgbW9kdWxlIGFzIGxvYWRlZFxuIFx0XHRtb2R1bGUubCA9IHRydWU7XG5cbiBcdFx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcbiBcdFx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xuIFx0fVxuXG5cbiBcdC8vIGV4cG9zZSB0aGUgbW9kdWxlcyBvYmplY3QgKF9fd2VicGFja19tb2R1bGVzX18pXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLm0gPSBtb2R1bGVzO1xuXG4gXHQvLyBleHBvc2UgdGhlIG1vZHVsZSBjYWNoZVxuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5jID0gaW5zdGFsbGVkTW9kdWxlcztcblxuIFx0Ly8gZGVmaW5lIGdldHRlciBmdW5jdGlvbiBmb3IgaGFybW9ueSBleHBvcnRzXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLmQgPSBmdW5jdGlvbihleHBvcnRzLCBuYW1lLCBnZXR0ZXIpIHtcbiBcdFx0aWYoIV9fd2VicGFja19yZXF1aXJlX18ubyhleHBvcnRzLCBuYW1lKSkge1xuIFx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBuYW1lLCB7XG4gXHRcdFx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuIFx0XHRcdFx0ZW51bWVyYWJsZTogdHJ1ZSxcbiBcdFx0XHRcdGdldDogZ2V0dGVyXG4gXHRcdFx0fSk7XG4gXHRcdH1cbiBcdH07XG5cbiBcdC8vIGRlZmluZSBfX2VzTW9kdWxlIG9uIGV4cG9ydHNcbiBcdF9fd2VicGFja19yZXF1aXJlX18uciA9IGZ1bmN0aW9uKGV4cG9ydHMpIHtcbiBcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsICdfX2VzTW9kdWxlJywgeyB2YWx1ZTogdHJ1ZSB9KTtcbiBcdH07XG5cbiBcdC8vIGdldERlZmF1bHRFeHBvcnQgZnVuY3Rpb24gZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBub24taGFybW9ueSBtb2R1bGVzXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLm4gPSBmdW5jdGlvbihtb2R1bGUpIHtcbiBcdFx0dmFyIGdldHRlciA9IG1vZHVsZSAmJiBtb2R1bGUuX19lc01vZHVsZSA/XG4gXHRcdFx0ZnVuY3Rpb24gZ2V0RGVmYXVsdCgpIHsgcmV0dXJuIG1vZHVsZVsnZGVmYXVsdCddOyB9IDpcbiBcdFx0XHRmdW5jdGlvbiBnZXRNb2R1bGVFeHBvcnRzKCkgeyByZXR1cm4gbW9kdWxlOyB9O1xuIFx0XHRfX3dlYnBhY2tfcmVxdWlyZV9fLmQoZ2V0dGVyLCAnYScsIGdldHRlcik7XG4gXHRcdHJldHVybiBnZXR0ZXI7XG4gXHR9O1xuXG4gXHQvLyBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGxcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubyA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHkpIHsgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIHByb3BlcnR5KTsgfTtcblxuIFx0Ly8gX193ZWJwYWNrX3B1YmxpY19wYXRoX19cbiBcdF9fd2VicGFja19yZXF1aXJlX18ucCA9IFwiXCI7XG5cblxuIFx0Ly8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4gXHRyZXR1cm4gX193ZWJwYWNrX3JlcXVpcmVfXyhfX3dlYnBhY2tfcmVxdWlyZV9fLnMgPSBcIi4vcHJldmlldy1zcmMvcHJlLnRzXCIpO1xuIiwiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE1lc3NhZ2VQb3N0ZXIgfSBmcm9tICcuL21lc3NhZ2luZyc7XG5pbXBvcnQgeyBnZXRTZXR0aW5ncyB9IGZyb20gJy4vc2V0dGluZ3MnO1xuaW1wb3J0IHsgZ2V0U3RyaW5ncyB9IGZyb20gJy4vc3RyaW5ncyc7XG5cbi8qKlxuICogU2hvd3MgYW4gYWxlcnQgd2hlbiB0aGVyZSBpcyBhIGNvbnRlbnQgc2VjdXJpdHkgcG9saWN5IHZpb2xhdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIENzcEFsZXJ0ZXIge1xuXHRwcml2YXRlIGRpZFNob3cgPSBmYWxzZTtcblx0cHJpdmF0ZSBkaWRIYXZlQ3NwV2FybmluZyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgbWVzc2FnaW5nPzogTWVzc2FnZVBvc3RlcjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdzZWN1cml0eXBvbGljeXZpb2xhdGlvbicsICgpID0+IHtcblx0XHRcdHRoaXMub25Dc3BXYXJuaW5nKCk7XG5cdFx0fSk7XG5cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xuXHRcdFx0aWYgKGV2ZW50ICYmIGV2ZW50LmRhdGEgJiYgZXZlbnQuZGF0YS5uYW1lID09PSAndnNjb2RlLWRpZC1ibG9jay1zdmcnKSB7XG5cdFx0XHRcdHRoaXMub25Dc3BXYXJuaW5nKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0UG9zdGVyKHBvc3RlcjogTWVzc2FnZVBvc3Rlcikge1xuXHRcdHRoaXMubWVzc2FnaW5nID0gcG9zdGVyO1xuXHRcdGlmICh0aGlzLmRpZEhhdmVDc3BXYXJuaW5nKSB7XG5cdFx0XHR0aGlzLnNob3dDc3BXYXJuaW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNzcFdhcm5pbmcoKSB7XG5cdFx0dGhpcy5kaWRIYXZlQ3NwV2FybmluZyA9IHRydWU7XG5cdFx0dGhpcy5zaG93Q3NwV2FybmluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93Q3NwV2FybmluZygpIHtcblx0XHRjb25zdCBzdHJpbmdzID0gZ2V0U3RyaW5ncygpO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3MoKTtcblxuXHRcdGlmICh0aGlzLmRpZFNob3cgfHwgc2V0dGluZ3MuZGlzYWJsZVNlY3VyaXR5V2FybmluZ3MgfHwgIXRoaXMubWVzc2FnaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZGlkU2hvdyA9IHRydWU7XG5cblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0bm90aWZpY2F0aW9uLmlubmVyVGV4dCA9IHN0cmluZ3MuY3NwQWxlcnRNZXNzYWdlVGV4dDtcblx0XHRub3RpZmljYXRpb24uc2V0QXR0cmlidXRlKCdpZCcsICdjb2RlLWNzcC13YXJuaW5nJyk7XG5cdFx0bm90aWZpY2F0aW9uLnNldEF0dHJpYnV0ZSgndGl0bGUnLCBzdHJpbmdzLmNzcEFsZXJ0TWVzc2FnZVRpdGxlKTtcblxuXHRcdG5vdGlmaWNhdGlvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0bm90aWZpY2F0aW9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHN0cmluZ3MuY3NwQWxlcnRNZXNzYWdlTGFiZWwpO1xuXHRcdG5vdGlmaWNhdGlvbi5vbmNsaWNrID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5tZXNzYWdpbmchLnBvc3RNZXNzYWdlKCdzaG93UHJldmlld1NlY3VyaXR5U2VsZWN0b3InLCB7IHNvdXJjZTogc2V0dGluZ3Muc291cmNlIH0pO1xuXHRcdH07XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChub3RpZmljYXRpb24pO1xuXHR9XG59XG4iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IE1lc3NhZ2VQb3N0ZXIgfSBmcm9tICcuL21lc3NhZ2luZyc7XG5cbmV4cG9ydCBjbGFzcyBTdHlsZUxvYWRpbmdNb25pdG9yIHtcblx0cHJpdmF0ZSB1bmxvYWRlZFN0eWxlczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBmaW5pc2hlZExvYWRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHBvc3Rlcj86IE1lc3NhZ2VQb3N0ZXI7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3Qgb25TdHlsZUxvYWRFcnJvciA9IChldmVudDogYW55KSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBldmVudC50YXJnZXQuZGF0YXNldC5zb3VyY2U7XG5cdFx0XHR0aGlzLnVubG9hZGVkU3R5bGVzLnB1c2goc291cmNlKTtcblx0XHR9O1xuXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGxpbmsgb2YgZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnY29kZS11c2VyLXN0eWxlJykgYXMgSFRNTENvbGxlY3Rpb25PZjxIVE1MRWxlbWVudD4pIHtcblx0XHRcdFx0aWYgKGxpbmsuZGF0YXNldC5zb3VyY2UpIHtcblx0XHRcdFx0XHRsaW5rLm9uZXJyb3IgPSBvblN0eWxlTG9hZEVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsICgpID0+IHtcblx0XHRcdGlmICghdGhpcy51bmxvYWRlZFN0eWxlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5maW5pc2hlZExvYWRpbmcgPSB0cnVlO1xuXHRcdFx0aWYgKHRoaXMucG9zdGVyKSB7XG5cdFx0XHRcdHRoaXMucG9zdGVyLnBvc3RNZXNzYWdlKCdwcmV2aWV3U3R5bGVMb2FkRXJyb3InLCB7IHVubG9hZGVkU3R5bGVzOiB0aGlzLnVubG9hZGVkU3R5bGVzIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHNldFBvc3Rlcihwb3N0ZXI6IE1lc3NhZ2VQb3N0ZXIpOiB2b2lkIHtcblx0XHR0aGlzLnBvc3RlciA9IHBvc3Rlcjtcblx0XHRpZiAodGhpcy5maW5pc2hlZExvYWRpbmcpIHtcblx0XHRcdHBvc3Rlci5wb3N0TWVzc2FnZSgncHJldmlld1N0eWxlTG9hZEVycm9yJywgeyB1bmxvYWRlZFN0eWxlczogdGhpcy51bmxvYWRlZFN0eWxlcyB9KTtcblx0XHR9XG5cdH1cbn0iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ3NwQWxlcnRlciB9IGZyb20gJy4vY3NwJztcbmltcG9ydCB7IFN0eWxlTG9hZGluZ01vbml0b3IgfSBmcm9tICcuL2xvYWRpbmcnO1xuXG5kZWNsYXJlIGdsb2JhbCB7XG5cdGludGVyZmFjZSBXaW5kb3cge1xuXHRcdGNzcEFsZXJ0ZXI6IENzcEFsZXJ0ZXI7XG5cdFx0c3R5bGVMb2FkaW5nTW9uaXRvcjogU3R5bGVMb2FkaW5nTW9uaXRvcjtcblx0fVxufVxuXG53aW5kb3cuY3NwQWxlcnRlciA9IG5ldyBDc3BBbGVydGVyKCk7XG53aW5kb3cuc3R5bGVMb2FkaW5nTW9uaXRvciA9IG5ldyBTdHlsZUxvYWRpbmdNb25pdG9yKCk7IiwiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJldmlld1NldHRpbmdzIHtcblx0c291cmNlOiBzdHJpbmc7XG5cdGxpbmU6IG51bWJlcjtcblx0bGluZUNvdW50OiBudW1iZXI7XG5cdHNjcm9sbFByZXZpZXdXaXRoRWRpdG9yPzogYm9vbGVhbjtcblx0c2Nyb2xsRWRpdG9yV2l0aFByZXZpZXc6IGJvb2xlYW47XG5cdGRpc2FibGVTZWN1cml0eVdhcm5pbmdzOiBib29sZWFuO1xuXHRkb3VibGVDbGlja1RvU3dpdGNoVG9FZGl0b3I6IGJvb2xlYW47XG59XG5cbmxldCBjYWNoZWRTZXR0aW5nczogUHJldmlld1NldHRpbmdzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGF0YShrZXk6IHN0cmluZyk6IFByZXZpZXdTZXR0aW5ncyB7XG5cdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndnNjb2RlLW1hcmtkb3duLXByZXZpZXctZGF0YScpO1xuXHRpZiAoZWxlbWVudCkge1xuXHRcdGNvbnN0IGRhdGEgPSBlbGVtZW50LmdldEF0dHJpYnV0ZShrZXkpO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShkYXRhKTtcblx0XHR9XG5cdH1cblxuXHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBsb2FkIGRhdGEgZm9yICR7a2V5fWApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2V0dGluZ3MoKTogUHJldmlld1NldHRpbmdzIHtcblx0aWYgKGNhY2hlZFNldHRpbmdzKSB7XG5cdFx0cmV0dXJuIGNhY2hlZFNldHRpbmdzO1xuXHR9XG5cblx0Y2FjaGVkU2V0dGluZ3MgPSBnZXREYXRhKCdkYXRhLXNldHRpbmdzJyk7XG5cdGlmIChjYWNoZWRTZXR0aW5ncykge1xuXHRcdHJldHVybiBjYWNoZWRTZXR0aW5ncztcblx0fVxuXG5cdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGxvYWQgc2V0dGluZ3MnKTtcbn1cbiIsIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RyaW5ncygpOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9IHtcblx0Y29uc3Qgc3RvcmUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndnNjb2RlLW1hcmtkb3duLXByZXZpZXctZGF0YScpO1xuXHRpZiAoc3RvcmUpIHtcblx0XHRjb25zdCBkYXRhID0gc3RvcmUuZ2V0QXR0cmlidXRlKCdkYXRhLXN0cmluZ3MnKTtcblx0XHRpZiAoZGF0YSkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0fVxuXHR9XG5cdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGxvYWQgc3RyaW5ncycpO1xufVxuIl0sInNvdXJjZVJvb3QiOiIifQ==