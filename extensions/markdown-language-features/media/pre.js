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
            this.messaging.postCommand('markdown.showPreviewSecuritySelector', [settings.source]);
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
                this.poster.postCommand('_markdown.onPreviewStyleLoadError', [this.unloadedStyles]);
            }
        });
    }
    setPoster(poster) {
        this.poster = poster;
        if (this.finishedLoading) {
            poster.postCommand('_markdown.onPreviewStyleLoadError', [this.unloadedStyles]);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly8vd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vLy4vcHJldmlldy1zcmMvY3NwLnRzIiwid2VicGFjazovLy8uL3ByZXZpZXctc3JjL2xvYWRpbmcudHMiLCJ3ZWJwYWNrOi8vLy4vcHJldmlldy1zcmMvcHJlLnRzIiwid2VicGFjazovLy8uL3ByZXZpZXctc3JjL3NldHRpbmdzLnRzIiwid2VicGFjazovLy8uL3ByZXZpZXctc3JjL3N0cmluZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOzs7QUFHQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxhQUFLO0FBQ0w7QUFDQTs7QUFFQTtBQUNBO0FBQ0EseURBQWlELGNBQWM7QUFDL0Q7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsbUNBQTJCLDBCQUEwQixFQUFFO0FBQ3ZELHlDQUFpQyxlQUFlO0FBQ2hEO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLDhEQUFzRCwrREFBK0Q7O0FBRXJIO0FBQ0E7OztBQUdBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FDbkVBOzs7Z0dBR2dHOztBQUdoRyxzRkFBeUM7QUFDekMsbUZBQXVDO0FBRXZDOztHQUVHO0FBQ0g7SUFNQztRQUxRLFlBQU8sR0FBRyxLQUFLLENBQUM7UUFDaEIsc0JBQWlCLEdBQUcsS0FBSyxDQUFDO1FBS2pDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7WUFDekQsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lB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O1FBQ3ZDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDVixNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixDQUFDO0lBQ0YsQ0FBQztJQUVELE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDbkQsQ0FBQztBQVZELDBCQVVDO0FBRUQ7SUFDQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxjQUFjLENBQUM7SUFDdkIsQ0FBQztJQUVELGNBQWMsR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDMUMsRUFBRSxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUNwQixNQUFNLENBQUMsY0FBYyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7QUFDNUMsQ0FBQztBQVhELGtDQVdDOzs7Ozs7Ozs7Ozs7OztBQ3hDRDs7O2dHQUdnRzs7QUFFaEc7SUFDQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLDhCQUE4QixDQUFDLENBQUM7SUFDdEUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNYLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDaEQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNWLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pCLENBQUM7SUFDRixDQUFDO0lBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQzNDLENBQUM7QUFURCxnQ0FTQyIsImZpbGUiOiJwcmUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIgXHQvLyBUaGUgbW9kdWxlIGNhY2hlXG4gXHR2YXIgaW5zdGFsbGVkTW9kdWxlcyA9IHt9O1xuXG4gXHQvLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuIFx0ZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXG4gXHRcdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuIFx0XHRpZihpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXSkge1xuIFx0XHRcdHJldHVybiBpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXS5leHBvcnRzO1xuIFx0XHR9XG4gXHRcdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG4gXHRcdHZhciBtb2R1bGUgPSBpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXSA9IHtcbiBcdFx0XHRpOiBtb2R1bGVJZCxcbiBcdFx0XHRsOiBmYWxzZSxcbiBcdFx0XHRleHBvcnRzOiB7fVxuIFx0XHR9O1xuXG4gXHRcdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuIFx0XHRtb2R1bGVzW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuIFx0XHQvLyBGbGFnIHRoZSBtb2R1bGUgYXMgbG9hZGVkXG4gXHRcdG1vZHVsZS5sID0gdHJ1ZTtcblxuIFx0XHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuIFx0XHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG4gXHR9XG5cblxuIFx0Ly8gZXhwb3NlIHRoZSBtb2R1bGVzIG9iamVjdCAoX193ZWJwYWNrX21vZHVsZXNfXylcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubSA9IG1vZHVsZXM7XG5cbiBcdC8vIGV4cG9zZSB0aGUgbW9kdWxlIGNhY2hlXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLmMgPSBpbnN0YWxsZWRNb2R1bGVzO1xuXG4gXHQvLyBkZWZpbmUgZ2V0dGVyIGZ1bmN0aW9uIGZvciBoYXJtb255IGV4cG9ydHNcbiBcdF9fd2VicGFja19yZXF1aXJlX18uZCA9IGZ1bmN0aW9uKGV4cG9ydHMsIG5hbWUsIGdldHRlcikge1xuIFx0XHRpZighX193ZWJwYWNrX3JlcXVpcmVfXy5vKGV4cG9ydHMsIG5hbWUpKSB7XG4gXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIG5hbWUsIHtcbiBcdFx0XHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gXHRcdFx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuIFx0XHRcdFx0Z2V0OiBnZXR0ZXJcbiBcdFx0XHR9KTtcbiBcdFx0fVxuIFx0fTtcblxuIFx0Ly8gZGVmaW5lIF9fZXNNb2R1bGUgb24gZXhwb3J0c1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5yID0gZnVuY3Rpb24oZXhwb3J0cykge1xuIFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xuIFx0fTtcblxuIFx0Ly8gZ2V0RGVmYXVsdEV4cG9ydCBmdW5jdGlvbiBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIG5vbi1oYXJtb255IG1vZHVsZXNcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubiA9IGZ1bmN0aW9uKG1vZHVsZSkge1xuIFx0XHR2YXIgZ2V0dGVyID0gbW9kdWxlICYmIG1vZHVsZS5fX2VzTW9kdWxlID9cbiBcdFx0XHRmdW5jdGlvbiBnZXREZWZhdWx0KCkgeyByZXR1cm4gbW9kdWxlWydkZWZhdWx0J107IH0gOlxuIFx0XHRcdGZ1bmN0aW9uIGdldE1vZHVsZUV4cG9ydHMoKSB7IHJldHVybiBtb2R1bGU7IH07XG4gXHRcdF9fd2VicGFja19yZXF1aXJlX18uZChnZXR0ZXIsICdhJywgZ2V0dGVyKTtcbiBcdFx0cmV0dXJuIGdldHRlcjtcbiBcdH07XG5cbiBcdC8vIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbFxuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5vID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSkgeyByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgcHJvcGVydHkpOyB9O1xuXG4gXHQvLyBfX3dlYnBhY2tfcHVibGljX3BhdGhfX1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5wID0gXCJcIjtcblxuXG4gXHQvLyBMb2FkIGVudHJ5IG1vZHVsZSBhbmQgcmV0dXJuIGV4cG9ydHNcbiBcdHJldHVybiBfX3dlYnBhY2tfcmVxdWlyZV9fKF9fd2VicGFja19yZXF1aXJlX18ucyA9IFwiLi9wcmV2aWV3LXNyYy9wcmUudHNcIik7XG4iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbmltcG9ydCB7IE1lc3NhZ2VQb3N0ZXIgfSBmcm9tICcuL21lc3NhZ2luZyc7XHJcbmltcG9ydCB7IGdldFNldHRpbmdzIH0gZnJvbSAnLi9zZXR0aW5ncyc7XHJcbmltcG9ydCB7IGdldFN0cmluZ3MgfSBmcm9tICcuL3N0cmluZ3MnO1xyXG5cclxuLyoqXHJcbiAqIFNob3dzIGFuIGFsZXJ0IHdoZW4gdGhlcmUgaXMgYSBjb250ZW50IHNlY3VyaXR5IHBvbGljeSB2aW9sYXRpb24uXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQ3NwQWxlcnRlciB7XHJcblx0cHJpdmF0ZSBkaWRTaG93ID0gZmFsc2U7XHJcblx0cHJpdmF0ZSBkaWRIYXZlQ3NwV2FybmluZyA9IGZhbHNlO1xyXG5cclxuXHRwcml2YXRlIG1lc3NhZ2luZz86IE1lc3NhZ2VQb3N0ZXI7XHJcblxyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignc2VjdXJpdHlwb2xpY3l2aW9sYXRpb24nLCAoKSA9PiB7XHJcblx0XHRcdHRoaXMub25Dc3BXYXJuaW5nKCk7XHJcblx0XHR9KTtcclxuXHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIChldmVudCkgPT4ge1xyXG5cdFx0XHRpZiAoZXZlbnQgJiYgZXZlbnQuZGF0YSAmJiBldmVudC5kYXRhLm5hbWUgPT09ICd2c2NvZGUtZGlkLWJsb2NrLXN2ZycpIHtcclxuXHRcdFx0XHR0aGlzLm9uQ3NwV2FybmluZygpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXRQb3N0ZXIocG9zdGVyOiBNZXNzYWdlUG9zdGVyKSB7XHJcblx0XHR0aGlzLm1lc3NhZ2luZyA9IHBvc3RlcjtcclxuXHRcdGlmICh0aGlzLmRpZEhhdmVDc3BXYXJuaW5nKSB7XHJcblx0XHRcdHRoaXMuc2hvd0NzcFdhcm5pbmcoKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgb25Dc3BXYXJuaW5nKCkge1xyXG5cdFx0dGhpcy5kaWRIYXZlQ3NwV2FybmluZyA9IHRydWU7XHJcblx0XHR0aGlzLnNob3dDc3BXYXJuaW5nKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHNob3dDc3BXYXJuaW5nKCkge1xyXG5cdFx0Y29uc3Qgc3RyaW5ncyA9IGdldFN0cmluZ3MoKTtcclxuXHRcdGNvbnN0IHNldHRpbmdzID0gZ2V0U2V0dGluZ3MoKTtcclxuXHJcblx0XHRpZiAodGhpcy5kaWRTaG93IHx8IHNldHRpbmdzLmRpc2FibGVTZWN1cml0eVdhcm5pbmdzIHx8ICF0aGlzLm1lc3NhZ2luZykge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblx0XHR0aGlzLmRpZFNob3cgPSB0cnVlO1xyXG5cclxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcclxuXHRcdG5vdGlmaWNhdGlvbi5pbm5lclRleHQgPSBzdHJpbmdzLmNzcEFsZXJ0TWVzc2FnZVRleHQ7XHJcblx0XHRub3RpZmljYXRpb24uc2V0QXR0cmlidXRlKCdpZCcsICdjb2RlLWNzcC13YXJuaW5nJyk7XHJcblx0XHRub3RpZmljYXRpb24uc2V0QXR0cmlidXRlKCd0aXRsZScsIHN0cmluZ3MuY3NwQWxlcnRNZXNzYWdlVGl0bGUpO1xyXG5cclxuXHRcdG5vdGlmaWNhdGlvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XHJcblx0XHRub3RpZmljYXRpb24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgc3RyaW5ncy5jc3BBbGVydE1lc3NhZ2VMYWJlbCk7XHJcblx0XHRub3RpZmljYXRpb24ub25jbGljayA9ICgpID0+IHtcclxuXHRcdFx0dGhpcy5tZXNzYWdpbmchLnBvc3RDb21tYW5kKCdtYXJrZG93bi5zaG93UHJldmlld1NlY3VyaXR5U2VsZWN0b3InLCBbc2V0dGluZ3Muc291cmNlXSk7XHJcblx0XHR9O1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChub3RpZmljYXRpb24pO1xyXG5cdH1cclxufVxyXG4iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuaW1wb3J0IHsgTWVzc2FnZVBvc3RlciB9IGZyb20gJy4vbWVzc2FnaW5nJztcclxuXHJcbmV4cG9ydCBjbGFzcyBTdHlsZUxvYWRpbmdNb25pdG9yIHtcclxuXHRwcml2YXRlIHVubG9hZGVkU3R5bGVzOiBzdHJpbmdbXSA9IFtdO1xyXG5cdHByaXZhdGUgZmluaXNoZWRMb2FkaW5nOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG5cdHByaXZhdGUgcG9zdGVyPzogTWVzc2FnZVBvc3RlcjtcclxuXHJcblx0Y29uc3RydWN0b3IoKSB7XHJcblx0XHRjb25zdCBvblN0eWxlTG9hZEVycm9yID0gKGV2ZW50OiBhbnkpID0+IHtcclxuXHRcdFx0Y29uc3Qgc291cmNlID0gZXZlbnQudGFyZ2V0LmRhdGFzZXQuc291cmNlO1xyXG5cdFx0XHR0aGlzLnVubG9hZGVkU3R5bGVzLnB1c2goc291cmNlKTtcclxuXHRcdH07XHJcblxyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcblx0XHRcdGZvciAoY29uc3QgbGluayBvZiBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdjb2RlLXVzZXItc3R5bGUnKSBhcyBIVE1MQ29sbGVjdGlvbk9mPEhUTUxFbGVtZW50Pikge1xyXG5cdFx0XHRcdGlmIChsaW5rLmRhdGFzZXQuc291cmNlKSB7XHJcblx0XHRcdFx0XHRsaW5rLm9uZXJyb3IgPSBvblN0eWxlTG9hZEVycm9yO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCAoKSA9PiB7XHJcblx0XHRcdGlmICghdGhpcy51bmxvYWRlZFN0eWxlcy5sZW5ndGgpIHtcclxuXHRcdFx0XHRyZXR1cm47XHJcblx0XHRcdH1cclxuXHRcdFx0dGhpcy5maW5pc2hlZExvYWRpbmcgPSB0cnVlO1xyXG5cdFx0XHRpZiAodGhpcy5wb3N0ZXIpIHtcclxuXHRcdFx0XHR0aGlzLnBvc3Rlci5wb3N0Q29tbWFuZCgnX21hcmtkb3duLm9uUHJldmlld1N0eWxlTG9hZEVycm9yJywgW3RoaXMudW5sb2FkZWRTdHlsZXNdKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0UG9zdGVyKHBvc3RlcjogTWVzc2FnZVBvc3Rlcik6IHZvaWQge1xyXG5cdFx0dGhpcy5wb3N0ZXIgPSBwb3N0ZXI7XHJcblx0XHRpZiAodGhpcy5maW5pc2hlZExvYWRpbmcpIHtcclxuXHRcdFx0cG9zdGVyLnBvc3RDb21tYW5kKCdfbWFya2Rvd24ub25QcmV2aWV3U3R5bGVMb2FkRXJyb3InLCBbdGhpcy51bmxvYWRlZFN0eWxlc10pO1xyXG5cdFx0fVxyXG5cdH1cclxufSIsIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG5cclxuaW1wb3J0IHsgQ3NwQWxlcnRlciB9IGZyb20gJy4vY3NwJztcclxuaW1wb3J0IHsgU3R5bGVMb2FkaW5nTW9uaXRvciB9IGZyb20gJy4vbG9hZGluZyc7XHJcblxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcblx0aW50ZXJmYWNlIFdpbmRvdyB7XHJcblx0XHRjc3BBbGVydGVyOiBDc3BBbGVydGVyO1xyXG5cdFx0c3R5bGVMb2FkaW5nTW9uaXRvcjogU3R5bGVMb2FkaW5nTW9uaXRvcjtcclxuXHR9XHJcbn1cclxuXHJcbndpbmRvdy5jc3BBbGVydGVyID0gbmV3IENzcEFsZXJ0ZXIoKTtcclxud2luZG93LnN0eWxlTG9hZGluZ01vbml0b3IgPSBuZXcgU3R5bGVMb2FkaW5nTW9uaXRvcigpOyIsIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXHJcbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQcmV2aWV3U2V0dGluZ3Mge1xyXG5cdHNvdXJjZTogc3RyaW5nO1xyXG5cdGxpbmU6IG51bWJlcjtcclxuXHRsaW5lQ291bnQ6IG51bWJlcjtcclxuXHRzY3JvbGxQcmV2aWV3V2l0aEVkaXRvcj86IGJvb2xlYW47XHJcblx0c2Nyb2xsRWRpdG9yV2l0aFByZXZpZXc6IGJvb2xlYW47XHJcblx0ZGlzYWJsZVNlY3VyaXR5V2FybmluZ3M6IGJvb2xlYW47XHJcblx0ZG91YmxlQ2xpY2tUb1N3aXRjaFRvRWRpdG9yOiBib29sZWFuO1xyXG59XHJcblxyXG5sZXQgY2FjaGVkU2V0dGluZ3M6IFByZXZpZXdTZXR0aW5ncyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXREYXRhKGtleTogc3RyaW5nKTogUHJldmlld1NldHRpbmdzIHtcclxuXHRjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3ZzY29kZS1tYXJrZG93bi1wcmV2aWV3LWRhdGEnKTtcclxuXHRpZiAoZWxlbWVudCkge1xyXG5cdFx0Y29uc3QgZGF0YSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKGtleSk7XHJcblx0XHRpZiAoZGF0YSkge1xyXG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShkYXRhKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGxvYWQgZGF0YSBmb3IgJHtrZXl9YCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXR0aW5ncygpOiBQcmV2aWV3U2V0dGluZ3Mge1xyXG5cdGlmIChjYWNoZWRTZXR0aW5ncykge1xyXG5cdFx0cmV0dXJuIGNhY2hlZFNldHRpbmdzO1xyXG5cdH1cclxuXHJcblx0Y2FjaGVkU2V0dGluZ3MgPSBnZXREYXRhKCdkYXRhLXNldHRpbmdzJyk7XHJcblx0aWYgKGNhY2hlZFNldHRpbmdzKSB7XHJcblx0XHRyZXR1cm4gY2FjaGVkU2V0dGluZ3M7XHJcblx0fVxyXG5cclxuXHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBsb2FkIHNldHRpbmdzJyk7XHJcbn1cclxuIiwiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxyXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cclxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RyaW5ncygpOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9IHtcclxuXHRjb25zdCBzdG9yZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2c2NvZGUtbWFya2Rvd24tcHJldmlldy1kYXRhJyk7XHJcblx0aWYgKHN0b3JlKSB7XHJcblx0XHRjb25zdCBkYXRhID0gc3RvcmUuZ2V0QXR0cmlidXRlKCdkYXRhLXN0cmluZ3MnKTtcclxuXHRcdGlmIChkYXRhKSB7XHJcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBsb2FkIHN0cmluZ3MnKTtcclxufVxyXG4iXSwic291cmNlUm9vdCI6IiJ9