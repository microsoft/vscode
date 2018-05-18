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
/******/ 	return __webpack_require__(__webpack_require__.s = "./preview-src/index.ts");
/******/ })
/************************************************************************/
/******/ ({

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
const pullRequestOverviewRenderer_1 = __webpack_require__(/*! ./pullRequestOverviewRenderer */ "./preview-src/pullRequestOverviewRenderer.ts");
// declare var acquireVsCodeApi: any;
// const vscode = acquireVsCodeApi();
function handleMessage(event) {
	const message = event.data; // The json data that the extension sent
	switch (message.command) {
		case 'initialize':
			document.getElementById('pullrequest').innerHTML = message.pullrequest.events.map(pullRequestOverviewRenderer_1.renderTimelineEvent).join('');
			setTitleHTML(message.pullrequest);
			break;
		default:
			break;
	}
}
window.addEventListener('message', handleMessage);
function setTitleHTML(pr) {
	document.getElementById('title').innerHTML = `
			<div class="prIcon"><svg width="64" height="64" class="octicon octicon-git-compare" viewBox="0 0 14 16" version="1.1" aria-hidden="true"><path fill="#FFFFFF" fill-rule="evenodd" d="M5 12H4c-.27-.02-.48-.11-.69-.31-.21-.2-.3-.42-.31-.69V4.72A1.993 1.993 0 0 0 2 1a1.993 1.993 0 0 0-1 3.72V11c.03.78.34 1.47.94 2.06.6.59 1.28.91 2.06.94h1v2l3-3-3-3v2zM2 1.8c.66 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2C1.35 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2zm11 9.48V5c-.03-.78-.34-1.47-.94-2.06-.6-.59-1.28-.91-2.06-.94H9V0L6 3l3 3V4h1c.27.02.48.11.69.31.21.2.3.42.31.69v6.28A1.993 1.993 0 0 0 12 15a1.993 1.993 0 0 0 1-3.72zm-1 2.92c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"></path></svg></div>
			<div class="details">
				<div>
					<h2>${pr.title} (<a href=${pr.html_url}>#${pr.number}</a>) </h2>
				</div>
				<div>
					<div class="status">${pullRequestOverviewRenderer_1.getStatus(pr)}</div>
					<img class="avatar" src="${pr.author.avatar_url}">
					<strong class="author"><a href="${pr.author.html_url}">${pr.author.login}</a></strong>
				</div>
				<div class="comment-body">
					${pr.body}
				</div>
			</div>
		`;
}


/***/ }),

/***/ "./preview-src/pullRequestOverviewRenderer.ts":
/*!****************************************************!*\
  !*** ./preview-src/pullRequestOverviewRenderer.ts ***!
  \****************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
var EventType;
(function (EventType) {
	EventType[EventType["Committed"] = 0] = "Committed";
	EventType[EventType["Mentioned"] = 1] = "Mentioned";
	EventType[EventType["Subscribed"] = 2] = "Subscribed";
	EventType[EventType["Commented"] = 3] = "Commented";
	EventType[EventType["Reviewed"] = 4] = "Reviewed";
	EventType[EventType["Other"] = 5] = "Other";
})(EventType = exports.EventType || (exports.EventType = {}));
function renderComment(user, body) {
	return `<hr><div class="comment-container">

	<div class="review-comment" tabindex="0" role="treeitem">
		<div class="avatar-container">
			<img class="avatar" src="${user.avatar_url}">
		</div>
		<div class="review-comment-contents">
			<div>
				<strong class="author"><a href="${user.html_url}">${user.login}</a></strong>
			</div>
			<div class="comment-body">
				${body}
			</div>
		</div>
	</div>
</div>`;
}
exports.renderComment = renderComment;
function renderCommit(timelineEvent) {
	return `<hr><div class="comment-container">

	<div class="review-comment" tabindex="0" role="treeitem">
		<div class="review-comment-contents">
			<div>
				<strong>${timelineEvent.author.name} commit: <a href="${timelineEvent.html_url}">${timelineEvent.message} (${timelineEvent.sha})</a></strong>
			</div>
		</div>
	</div>
</div>`;
}
exports.renderCommit = renderCommit;
function renderReview(timelineEvent) {
	return `<hr><div class="comment-container">

	<div class="review-comment" tabindex="0" role="treeitem">
		<div class="review-comment-contents">
			<div>
				<strong><a href="${timelineEvent.html_url}">${timelineEvent.user.login} left a review.</a></strong><span></span>
			</div>
		</div>
	</div>
</div>`;
}
exports.renderReview = renderReview;
function renderTimelineEvent(timelineEvent) {
	switch (timelineEvent.event) {
		case EventType.Committed:
			return renderCommit(timelineEvent);
		case EventType.Commented:
			return renderComment(timelineEvent.user, timelineEvent.body);
		case EventType.Reviewed:
			return renderReview(timelineEvent);
	}
	return '';
}
exports.renderTimelineEvent = renderTimelineEvent;
// export function getStatusBGCoor(pr: any) {
// 	if (pr.isMerged) {
// 		return '#6f42c1';
// 	} else if (pr.isOpen) {
// 		return '#2cbe4e';
// 	} else {
// 		return '#cb2431';
// 	}
// }
function getStatus(pr) {
	if (pr.isMerged) {
		return 'Merged';
	}
	else if (pr.isOpen) {
		return 'Open';
	}
	else {
		return 'Closed';
	}
}
exports.getStatus = getStatus;


/***/ })

/******/ });
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly8vd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vLy4vcHJldmlldy1zcmMvaW5kZXgudHMiLCJ3ZWJwYWNrOi8vLy4vcHJldmlldy1zcmMvcHVsbFJlcXVlc3RPdmVydmlld1JlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsYUFBSztBQUNMO0FBQ0E7O0FBRUE7QUFDQTtBQUNBLHlEQUFpRCxjQUFjO0FBQy9EOztBQUVBO0FBQ0E7QUFDQTtBQUNBLG1DQUEyQiwwQkFBMEIsRUFBRTtBQUN2RCx5Q0FBaUMsZUFBZTtBQUNoRDtBQUNBO0FBQ0E7O0FBRUE7QUFDQSw4REFBc0QsK0RBQStEOztBQUVySDtBQUNBOzs7QUFHQTtBQUNBOzs7Ozs7Ozs7Ozs7OztBQ25FQTs7O2dHQUdnRzs7QUFFaEcsK0lBQStFO0FBRS9FLHFDQUFxQztBQUNyQyxxQ0FBcUM7QUFFckMsdUJBQXVCLEtBQVU7SUFDaEMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLHdDQUF3QztJQUNwRSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUN6QixLQUFLLFlBQVk7WUFDaEIsUUFBUSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUUsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLGlEQUFtQixDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2pILFlBQVksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7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b3VyY2VzQ29udGVudCI6WyIgXHQvLyBUaGUgbW9kdWxlIGNhY2hlXG4gXHR2YXIgaW5zdGFsbGVkTW9kdWxlcyA9IHt9O1xuXG4gXHQvLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuIFx0ZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXG4gXHRcdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuIFx0XHRpZihpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXSkge1xuIFx0XHRcdHJldHVybiBpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXS5leHBvcnRzO1xuIFx0XHR9XG4gXHRcdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG4gXHRcdHZhciBtb2R1bGUgPSBpbnN0YWxsZWRNb2R1bGVzW21vZHVsZUlkXSA9IHtcbiBcdFx0XHRpOiBtb2R1bGVJZCxcbiBcdFx0XHRsOiBmYWxzZSxcbiBcdFx0XHRleHBvcnRzOiB7fVxuIFx0XHR9O1xuXG4gXHRcdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuIFx0XHRtb2R1bGVzW21vZHVsZUlkXS5jYWxsKG1vZHVsZS5leHBvcnRzLCBtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuIFx0XHQvLyBGbGFnIHRoZSBtb2R1bGUgYXMgbG9hZGVkXG4gXHRcdG1vZHVsZS5sID0gdHJ1ZTtcblxuIFx0XHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuIFx0XHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG4gXHR9XG5cblxuIFx0Ly8gZXhwb3NlIHRoZSBtb2R1bGVzIG9iamVjdCAoX193ZWJwYWNrX21vZHVsZXNfXylcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubSA9IG1vZHVsZXM7XG5cbiBcdC8vIGV4cG9zZSB0aGUgbW9kdWxlIGNhY2hlXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLmMgPSBpbnN0YWxsZWRNb2R1bGVzO1xuXG4gXHQvLyBkZWZpbmUgZ2V0dGVyIGZ1bmN0aW9uIGZvciBoYXJtb255IGV4cG9ydHNcbiBcdF9fd2VicGFja19yZXF1aXJlX18uZCA9IGZ1bmN0aW9uKGV4cG9ydHMsIG5hbWUsIGdldHRlcikge1xuIFx0XHRpZighX193ZWJwYWNrX3JlcXVpcmVfXy5vKGV4cG9ydHMsIG5hbWUpKSB7XG4gXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIG5hbWUsIHtcbiBcdFx0XHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gXHRcdFx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuIFx0XHRcdFx0Z2V0OiBnZXR0ZXJcbiBcdFx0XHR9KTtcbiBcdFx0fVxuIFx0fTtcblxuIFx0Ly8gZGVmaW5lIF9fZXNNb2R1bGUgb24gZXhwb3J0c1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5yID0gZnVuY3Rpb24oZXhwb3J0cykge1xuIFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xuIFx0fTtcblxuIFx0Ly8gZ2V0RGVmYXVsdEV4cG9ydCBmdW5jdGlvbiBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIG5vbi1oYXJtb255IG1vZHVsZXNcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubiA9IGZ1bmN0aW9uKG1vZHVsZSkge1xuIFx0XHR2YXIgZ2V0dGVyID0gbW9kdWxlICYmIG1vZHVsZS5fX2VzTW9kdWxlID9cbiBcdFx0XHRmdW5jdGlvbiBnZXREZWZhdWx0KCkgeyByZXR1cm4gbW9kdWxlWydkZWZhdWx0J107IH0gOlxuIFx0XHRcdGZ1bmN0aW9uIGdldE1vZHVsZUV4cG9ydHMoKSB7IHJldHVybiBtb2R1bGU7IH07XG4gXHRcdF9fd2VicGFja19yZXF1aXJlX18uZChnZXR0ZXIsICdhJywgZ2V0dGVyKTtcbiBcdFx0cmV0dXJuIGdldHRlcjtcbiBcdH07XG5cbiBcdC8vIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbFxuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5vID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSkgeyByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgcHJvcGVydHkpOyB9O1xuXG4gXHQvLyBfX3dlYnBhY2tfcHVibGljX3BhdGhfX1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5wID0gXCJcIjtcblxuXG4gXHQvLyBMb2FkIGVudHJ5IG1vZHVsZSBhbmQgcmV0dXJuIGV4cG9ydHNcbiBcdHJldHVybiBfX3dlYnBhY2tfcmVxdWlyZV9fKF9fd2VicGFja19yZXF1aXJlX18ucyA9IFwiLi9wcmV2aWV3LXNyYy9pbmRleC50c1wiKTtcbiIsIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZW5kZXJUaW1lbGluZUV2ZW50LCBnZXRTdGF0dXMgfSBmcm9tICcuL3B1bGxSZXF1ZXN0T3ZlcnZpZXdSZW5kZXJlcic7XG5cbi8vIGRlY2xhcmUgdmFyIGFjcXVpcmVWc0NvZGVBcGk6IGFueTtcbi8vIGNvbnN0IHZzY29kZSA9IGFjcXVpcmVWc0NvZGVBcGkoKTtcblxuZnVuY3Rpb24gaGFuZGxlTWVzc2FnZShldmVudDogYW55KSB7XG5cdGNvbnN0IG1lc3NhZ2UgPSBldmVudC5kYXRhOyAvLyBUaGUganNvbiBkYXRhIHRoYXQgdGhlIGV4dGVuc2lvbiBzZW50XG5cdHN3aXRjaCAobWVzc2FnZS5jb21tYW5kKSB7XG5cdFx0Y2FzZSAnaW5pdGlhbGl6ZSc6XG5cdFx0XHRkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHVsbHJlcXVlc3QnKSEuaW5uZXJIVE1MID0gbWVzc2FnZS5wdWxscmVxdWVzdC5ldmVudHMubWFwKHJlbmRlclRpbWVsaW5lRXZlbnQpLmpvaW4oJycpO1xuXHRcdFx0c2V0VGl0bGVIVE1MKG1lc3NhZ2UucHVsbHJlcXVlc3QpO1xuXHRcdFx0YnJlYWs7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGJyZWFrO1xuXHR9XG59XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgaGFuZGxlTWVzc2FnZSk7XG5cblxuZnVuY3Rpb24gc2V0VGl0bGVIVE1MKHByOiBhbnkpe1xuXHRkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndGl0bGUnKSEuaW5uZXJIVE1MID0gYFxuXHRcdFx0PGRpdiBjbGFzcz1cInBySWNvblwiPjxzdmcgd2lkdGg9XCI2NFwiIGhlaWdodD1cIjY0XCIgY2xhc3M9XCJvY3RpY29uIG9jdGljb24tZ2l0LWNvbXBhcmVcIiB2aWV3Qm94PVwiMCAwIDE0IDE2XCIgdmVyc2lvbj1cIjEuMVwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPjxwYXRoIGZpbGw9XCIjRkZGRkZGXCIgZmlsbC1ydWxlPVwiZXZlbm9kZFwiIGQ9XCJNNSAxMkg0Yy0uMjctLjAyLS40OC0uMTEtLjY5LS4zMS0uMjEtLjItLjMtLjQyLS4zMS0uNjlWNC43MkExLjk5MyAxLjk5MyAwIDAgMCAyIDFhMS45OTMgMS45OTMgMCAwIDAtMSAzLjcyVjExYy4wMy43OC4zNCAxLjQ3Ljk0IDIuMDYuNi41OSAxLjI4LjkxIDIuMDYuOTRoMXYybDMtMy0zLTN2MnpNMiAxLjhjLjY2IDAgMS4yLjU1IDEuMiAxLjIgMCAuNjUtLjU1IDEuMi0xLjIgMS4yQzEuMzUgNC4yLjggMy42NS44IDNjMC0uNjUuNTUtMS4yIDEuMi0xLjJ6bTExIDkuNDhWNWMtLjAzLS43OC0uMzQtMS40Ny0uOTQtMi4wNi0uNi0uNTktMS4yOC0uOTEtMi4wNi0uOTRIOVYwTDYgM2wzIDNWNGgxYy4yNy4wMi40OC4xMS42OS4zMS4yMS4yLjMuNDIuMzEuNjl2Ni4yOEExLjk5MyAxLjk5MyAwIDAgMCAxMiAxNWExLjk5MyAxLjk5MyAwIDAgMCAxLTMuNzJ6bS0xIDIuOTJjLS42NiAwLTEuMi0uNTUtMS4yLTEuMiAwLS42NS41NS0xLjIgMS4yLTEuMi42NSAwIDEuMi41NSAxLjIgMS4yIDAgLjY1LS41NSAxLjItMS4yIDEuMnpcIj48L3BhdGg+PC9zdmc+PC9kaXY+XG5cdFx0XHQ8ZGl2IGNsYXNzPVwiZGV0YWlsc1wiPlxuXHRcdFx0XHQ8ZGl2PlxuXHRcdFx0XHRcdDxoMj4ke3ByLnRpdGxlfSAoPGEgaHJlZj0ke3ByLmh0bWxfdXJsfT4jJHtwci5udW1iZXJ9PC9hPikgPC9oMj5cblx0XHRcdFx0PC9kaXY+XG5cdFx0XHRcdDxkaXY+XG5cdFx0XHRcdFx0PGRpdiBjbGFzcz1cInN0YXR1c1wiPiR7Z2V0U3RhdHVzKHByKX08L2Rpdj5cblx0XHRcdFx0XHQ8aW1nIGNsYXNzPVwiYXZhdGFyXCIgc3JjPVwiJHtwci5hdXRob3IuYXZhdGFyX3VybH1cIj5cblx0XHRcdFx0XHQ8c3Ryb25nIGNsYXNzPVwiYXV0aG9yXCI+PGEgaHJlZj1cIiR7cHIuYXV0aG9yLmh0bWxfdXJsfVwiPiR7cHIuYXV0aG9yLmxvZ2lufTwvYT48L3N0cm9uZz5cblx0XHRcdFx0PC9kaXY+XG5cdFx0XHRcdDxkaXYgY2xhc3M9XCJjb21tZW50LWJvZHlcIj5cblx0XHRcdFx0XHQke3ByLmJvZHl9XG5cdFx0XHRcdDwvZGl2PlxuXHRcdFx0PC9kaXY+XG5cdFx0YDtcbn0iLCIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuZXhwb3J0IGVudW0gRXZlbnRUeXBlIHtcblx0Q29tbWl0dGVkLFxuXHRNZW50aW9uZWQsXG5cdFN1YnNjcmliZWQsXG5cdENvbW1lbnRlZCxcblx0UmV2aWV3ZWQsXG5cdE90aGVyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aG9yIHtcblx0bmFtZTogc3RyaW5nO1xuXHRlbWFpbDogc3RyaW5nO1xuXHRkYXRlOiBEYXRlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbW1pdHRlciB7XG5cdG5hbWU6IHN0cmluZztcblx0ZW1haWw6IHN0cmluZztcblx0ZGF0ZTogRGF0ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUcmVlIHtcblx0c2hhOiBzdHJpbmc7XG5cdHVybDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcmVudCB7XG5cdHNoYTogc3RyaW5nO1xuXHR1cmw6IHN0cmluZztcblx0aHRtbF91cmw6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBWZXJpZmljYXRpb24ge1xuXHR2ZXJpZmllZDogYm9vbGVhbjtcblx0cmVhc29uOiBzdHJpbmc7XG5cdHNpZ25hdHVyZT86IGFueTtcblx0cGF5bG9hZD86IGFueTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBVc2VyIHtcblx0bG9naW46IHN0cmluZztcblx0aWQ6IG51bWJlcjtcblx0YXZhdGFyX3VybDogc3RyaW5nO1xuXHRncmF2YXRhcl9pZDogc3RyaW5nO1xuXHR1cmw6IHN0cmluZztcblx0aHRtbF91cmw6IHN0cmluZztcblx0Zm9sbG93ZXJzX3VybDogc3RyaW5nO1xuXHRmb2xsb3dpbmdfdXJsOiBzdHJpbmc7XG5cdGdpc3RzX3VybDogc3RyaW5nO1xuXHRzdGFycmVkX3VybDogc3RyaW5nO1xuXHRzdWJzY3JpcHRpb25zX3VybDogc3RyaW5nO1xuXHRvcmdhbml6YXRpb25zX3VybDogc3RyaW5nO1xuXHRyZXBvc191cmw6IHN0cmluZztcblx0ZXZlbnRzX3VybDogc3RyaW5nO1xuXHRyZWNlaXZlZF9ldmVudHNfdXJsOiBzdHJpbmc7XG5cdHR5cGU6IHN0cmluZztcblx0c2l0ZV9hZG1pbjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIdG1sIHtcblx0aHJlZjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFB1bGxSZXF1ZXN0IHtcblx0aHJlZjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExpbmtzIHtcblx0aHRtbDogSHRtbDtcblx0cHVsbF9yZXF1ZXN0OiBQdWxsUmVxdWVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNZW50aW9uRXZlbnQge1xuXHRpZDogbnVtYmVyO1xuXHR1cmw6IHN0cmluZztcblx0YWN0b3I6IFVzZXI7XG5cdGV2ZW50OiBFdmVudFR5cGU7XG5cdGNvbW1pdF9pZDogc3RyaW5nO1xuXHRjb21taXRfdXJsOiBzdHJpbmc7XG5cdGNyZWF0ZWRfYXQ6IERhdGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3Vic2NyaWJlRXZlbnQge1xuXHRpZDogbnVtYmVyO1xuXHR1cmw6IHN0cmluZztcblx0YWN0b3I6IFVzZXI7XG5cdGV2ZW50OiBFdmVudFR5cGU7XG5cdGNvbW1pdF9pZDogc3RyaW5nO1xuXHRjb21taXRfdXJsOiBzdHJpbmc7XG5cdGNyZWF0ZWRfYXQ6IERhdGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWVudEV2ZW50IHtcblx0dXJsOiBzdHJpbmc7XG5cdGh0bWxfdXJsOiBzdHJpbmc7XG5cdGF1dGhvcjogQXV0aG9yO1xuXHR1c2VyOiBVc2VyO1xuXHRjcmVhdGVkX2F0OiBEYXRlO1xuXHR1cGRhdGVkX2F0OiBEYXRlO1xuXHRpZDogbnVtYmVyO1xuXHRldmVudDogRXZlbnRUeXBlO1xuXHRhY3RvcjogVXNlcjtcblx0YXV0aG9yX2Fzc29jaWF0aW9uOiBzdHJpbmc7XG5cdGJvZHk6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZXZpZXdFdmVudCB7XG5cdGlkOiBudW1iZXI7XG5cdHVzZXI6IFVzZXI7XG5cdGJvZHk6IHN0cmluZztcblx0Y29tbWl0X2lkOiBzdHJpbmc7XG5cdHN1Ym1pdHRlZF9hdDogRGF0ZTtcblx0c3RhdGU6IHN0cmluZztcblx0aHRtbF91cmw6IHN0cmluZztcblx0cHVsbF9yZXF1ZXN0X3VybDogc3RyaW5nO1xuXHRhdXRob3JfYXNzb2NpYXRpb246IHN0cmluZztcblx0X2xpbmtzOiBMaW5rcztcblx0ZXZlbnQ6IEV2ZW50VHlwZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21taXRFdmVudCB7XG5cdHNoYTogc3RyaW5nO1xuXHR1cmw6IHN0cmluZztcblx0aHRtbF91cmw6IHN0cmluZztcblx0YXV0aG9yOiBBdXRob3I7XG5cdGNvbW1pdHRlcjogQ29tbWl0dGVyO1xuXHR0cmVlOiBUcmVlO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHBhcmVudHM6IFBhcmVudFtdO1xuXHR2ZXJpZmljYXRpb246IFZlcmlmaWNhdGlvbjtcblx0ZXZlbnQ6IEV2ZW50VHlwZTtcbn1cblxuZXhwb3J0IHR5cGUgVGltZWxpbmVFdmVudCA9IENvbW1pdEV2ZW50IHwgUmV2aWV3RXZlbnQgfCBTdWJzY3JpYmVFdmVudCB8IENvbW1lbnRFdmVudCB8IE1lbnRpb25FdmVudDtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckNvbW1lbnQodXNlcjogYW55LCBib2R5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYDxocj48ZGl2IGNsYXNzPVwiY29tbWVudC1jb250YWluZXJcIj5cblxuXHQ8ZGl2IGNsYXNzPVwicmV2aWV3LWNvbW1lbnRcIiB0YWJpbmRleD1cIjBcIiByb2xlPVwidHJlZWl0ZW1cIj5cblx0XHQ8ZGl2IGNsYXNzPVwiYXZhdGFyLWNvbnRhaW5lclwiPlxuXHRcdFx0PGltZyBjbGFzcz1cImF2YXRhclwiIHNyYz1cIiR7dXNlci5hdmF0YXJfdXJsfVwiPlxuXHRcdDwvZGl2PlxuXHRcdDxkaXYgY2xhc3M9XCJyZXZpZXctY29tbWVudC1jb250ZW50c1wiPlxuXHRcdFx0PGRpdj5cblx0XHRcdFx0PHN0cm9uZyBjbGFzcz1cImF1dGhvclwiPjxhIGhyZWY9XCIke3VzZXIuaHRtbF91cmx9XCI+JHt1c2VyLmxvZ2lufTwvYT48L3N0cm9uZz5cblx0XHRcdDwvZGl2PlxuXHRcdFx0PGRpdiBjbGFzcz1cImNvbW1lbnQtYm9keVwiPlxuXHRcdFx0XHQke2JvZHl9XG5cdFx0XHQ8L2Rpdj5cblx0XHQ8L2Rpdj5cblx0PC9kaXY+XG48L2Rpdj5gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQ29tbWl0KHRpbWVsaW5lRXZlbnQ6IENvbW1pdEV2ZW50KTogc3RyaW5nIHtcblx0cmV0dXJuIGA8aHI+PGRpdiBjbGFzcz1cImNvbW1lbnQtY29udGFpbmVyXCI+XG5cblx0PGRpdiBjbGFzcz1cInJldmlldy1jb21tZW50XCIgdGFiaW5kZXg9XCIwXCIgcm9sZT1cInRyZWVpdGVtXCI+XG5cdFx0PGRpdiBjbGFzcz1cInJldmlldy1jb21tZW50LWNvbnRlbnRzXCI+XG5cdFx0XHQ8ZGl2PlxuXHRcdFx0XHQ8c3Ryb25nPiR7dGltZWxpbmVFdmVudC5hdXRob3IubmFtZX0gY29tbWl0OiA8YSBocmVmPVwiJHt0aW1lbGluZUV2ZW50Lmh0bWxfdXJsfVwiPiR7dGltZWxpbmVFdmVudC5tZXNzYWdlfSAoJHt0aW1lbGluZUV2ZW50LnNoYX0pPC9hPjwvc3Ryb25nPlxuXHRcdFx0PC9kaXY+XG5cdFx0PC9kaXY+XG5cdDwvZGl2PlxuPC9kaXY+YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlclJldmlldyh0aW1lbGluZUV2ZW50OiBSZXZpZXdFdmVudCk6IHN0cmluZyB7XG5cdHJldHVybiBgPGhyPjxkaXYgY2xhc3M9XCJjb21tZW50LWNvbnRhaW5lclwiPlxuXG5cdDxkaXYgY2xhc3M9XCJyZXZpZXctY29tbWVudFwiIHRhYmluZGV4PVwiMFwiIHJvbGU9XCJ0cmVlaXRlbVwiPlxuXHRcdDxkaXYgY2xhc3M9XCJyZXZpZXctY29tbWVudC1jb250ZW50c1wiPlxuXHRcdFx0PGRpdj5cblx0XHRcdFx0PHN0cm9uZz48YSBocmVmPVwiJHt0aW1lbGluZUV2ZW50Lmh0bWxfdXJsfVwiPiR7dGltZWxpbmVFdmVudC51c2VyLmxvZ2lufSBsZWZ0IGEgcmV2aWV3LjwvYT48L3N0cm9uZz48c3Bhbj48L3NwYW4+XG5cdFx0XHQ8L2Rpdj5cblx0XHQ8L2Rpdj5cblx0PC9kaXY+XG48L2Rpdj5gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyVGltZWxpbmVFdmVudCh0aW1lbGluZUV2ZW50OiBUaW1lbGluZUV2ZW50KTogc3RyaW5nIHtcblx0c3dpdGNoICh0aW1lbGluZUV2ZW50LmV2ZW50KSB7XG5cdFx0Y2FzZSBFdmVudFR5cGUuQ29tbWl0dGVkOlxuXHRcdFx0cmV0dXJuIHJlbmRlckNvbW1pdCgoPENvbW1pdEV2ZW50PnRpbWVsaW5lRXZlbnQpKTtcblx0XHRjYXNlIEV2ZW50VHlwZS5Db21tZW50ZWQ6XG5cdFx0XHRyZXR1cm4gcmVuZGVyQ29tbWVudCgoPENvbW1lbnRFdmVudD50aW1lbGluZUV2ZW50KS51c2VyLCAoPENvbW1lbnRFdmVudD50aW1lbGluZUV2ZW50KS5ib2R5KTtcblx0XHRjYXNlIEV2ZW50VHlwZS5SZXZpZXdlZDpcblx0XHRcdHJldHVybiByZW5kZXJSZXZpZXcoKDxSZXZpZXdFdmVudD50aW1lbGluZUV2ZW50KSk7XG5cdH1cblx0cmV0dXJuICcnO1xufVxuXG4vLyBleHBvcnQgZnVuY3Rpb24gZ2V0U3RhdHVzQkdDb29yKHByOiBhbnkpIHtcbi8vIFx0aWYgKHByLmlzTWVyZ2VkKSB7XG4vLyBcdFx0cmV0dXJuICcjNmY0MmMxJztcbi8vIFx0fSBlbHNlIGlmIChwci5pc09wZW4pIHtcbi8vIFx0XHRyZXR1cm4gJyMyY2JlNGUnO1xuLy8gXHR9IGVsc2Uge1xuLy8gXHRcdHJldHVybiAnI2NiMjQzMSc7XG4vLyBcdH1cbi8vIH1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0YXR1cyhwcjogYW55KSB7XG5cdGlmIChwci5pc01lcmdlZCkge1xuXHRcdHJldHVybiAnTWVyZ2VkJztcblx0fSBlbHNlIGlmIChwci5pc09wZW4pIHtcblx0XHRyZXR1cm4gJ09wZW4nO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiAnQ2xvc2VkJztcblx0fVxufSJdLCJzb3VyY2VSb290IjoiIn0=