/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// file generated from css-schema.xml using css-exclude_generate_browserjs.js
define(["require", "exports"], function(require, exports) {

exports.data ={
	"css": {
		"atdirectives": [
			{
				"name": "@charset",
				"desc": "Defines character set of the document."
			},
			{
				"name": "@counter-style",
				"desc": "Defines a custom counter style.",
				"browsers": "FF33"
			},
			{
				"name": "@font-face",
				"desc": "Allows for linking to fonts that are automatically activated when needed. This permits authors to work around the limitation of 'web-safe' fonts, allowing for consistent rendering independent of the fonts available in a given user's environment."
			},
			{
				"name": "@font-feature-values",
				"desc": "Defines named values for the indices used to select alternate glyphs for a given font family.",
				"browsers": "FF34"
			},
			{
				"name": "@import",
				"desc": "Includes content of another file."
			},
			{
				"name": "@keyframes",
				"desc": "Defines set of animation key frames.",
				"browsers": "E,C43,FF16,IE10,O30,S9"
			},
			{
				"name": "@media",
				"desc": "Defines a stylesheet for a particular media type."
			},
			{
				"name": "@-moz-document",
				"desc": "Gecko-specific at-rule that restricts the style rules contained within it based on the URL of the document.",
				"browsers": "FF1.8"
			},
			{
				"name": "@-moz-keyframes",
				"desc": "Defines set of animation key frames.",
				"browsers": "FF5"
			},
			{
				"name": "@-ms-viewport",
				"desc": "Specifies the size, zoom factor, and orientation of the viewport.",
				"browsers": "E,IE10"
			},
			{
				"name": "@namespace",
				"desc": "Declares a prefix and associates it with a namespace name.",
				"browsers": "E,C,FF1,IE9,O8,S1"
			},
			{
				"name": "@-o-keyframes",
				"desc": "Defines set of animation key frames.",
				"browsers": "O12"
			},
			{
				"name": "@-o-viewport",
				"desc": "Specifies the size, zoom factor, and orientation of the viewport.",
				"browsers": "O11"
			},
			{
				"name": "@page",
				"desc": "Directive defines various page parameters."
			},
			{
				"name": "@supports",
				"desc": "A conditional group rule whose condition tests whether the user agent supports CSS property:value pairs.",
				"browsers": "E,C28,FF22,O12.1,S9"
			},
			{
				"name": "@-webkit-keyframes",
				"desc": "Defines set of animation key frames.",
				"browsers": "C,S4"
			}
		],
		"pseudoclasses": [
			{
				"name": ":active",
				"desc": "Applies while an element is being activated by the user. For example, between the times the user presses the mouse button and releases it."
			},
			{
				"name": ":any-link",
				"desc": "Represents an element that acts as the source anchor of a hyperlink. Applies to both visited and unvisited links.",
				"browsers": "S9"
			},
			{
				"name": ":checked",
				"desc": "Radio and checkbox elements can be toggled by the user. Some menu items are 'checked' when the user selects them. When such elements are toggled 'on' the :checked pseudo-class applies.",
				"browsers": "E,C,FF1,IE9,O9,S3.13"
			},
			{
				"name": ":corner-present",
				"desc": "Non-standard. Indicates whether or not a scrollbar corner is present.",
				"browsers": "C,S5"
			},
			{
				"name": ":decrement",
				"desc": "Non-standard. Applies to buttons and track pieces. Indicates whether or not the button or track piece will decrement the view’s position when used.",
				"browsers": "C,S5"
			},
			{
				"name": ":default",
				"desc": "Applies to the one or more UI elements that are the default among a set of similar elements. Typically applies to context menu items, buttons, and select lists/menus.",
				"browsers": "C,FF3,O10,S5"
			},
			{
				"name": ":disabled",
				"desc": "Represents user interface elements that are in a disabled state; such elements have a corresponding enabled state.",
				"browsers": "E,C,FF1.5,IE9,O9,S3.1"
			},
			{
				"name": ":double-button",
				"desc": "Non-standard. Applies to buttons and track pieces. Applies when both buttons are displayed together at the same end of the scrollbar.",
				"browsers": "C,S5"
			},
			{
				"name": ":empty",
				"desc": "Represents an element that has no children at all.",
				"browsers": "E,C,FF1.5,IE9,O9,S3.1"
			},
			{
				"name": ":enabled",
				"desc": "Represents user interface elements that are in an enabled state; such elements have a corresponding disabled state.",
				"browsers": "E,C,FF1.5,IE9,O9,S3.1"
			},
			{
				"name": ":end",
				"desc": "Non-standard. Applies to buttons and track pieces. Indicates whether the object is placed after the thumb.",
				"browsers": "C,S5"
			},
			{
				"name": ":first",
				"desc": "When printing double-sided documents, the page boxes on left and right pages may be different. This can be expressed through CSS pseudo-classes defined in the  page context."
			},
			{
				"name": ":first-child",
				"desc": "Same as :nth-child(1). Represents an element that is the first child of some other element.",
				"browsers": "E,C,FF3,IE7,O9.5,S3.1"
			},
			{
				"name": ":first-of-type",
				"desc": "Same as :nth-of-type(1). Represents an element that is the first sibling of its type in the list of children of its parent element.",
				"browsers": "E,C,FF3.5,IE9,O9.5,S3.2"
			},
			{
				"name": ":focus",
				"desc": "Applies while an element has the focus (accepts keyboard or mouse events, or other forms of input)."
			},
			{
				"name": ":fullscreen",
				"desc": "Matches any element that has its fullscreen flag set.",
				"browsers": "E"
			},
			{
				"name": ":future",
				"desc": "Represents any element that is defined to occur entirely after a :current element.",
				"browsers": "C,O16,S6"
			},
			{
				"name": ":horizontal",
				"desc": "Non-standard. Applies to any scrollbar pieces that have a horizontal orientation.",
				"browsers": "C,S5"
			},
			{
				"name": ":host",
				"desc": "When evaluated in the context of a shadow tree, matches the shadow tree’s host element.",
				"browsers": "C35,O22"
			},
			{
				"name": ":host()",
				"desc": "When evaluated in the context of a shadow tree, it matches the shadow tree’s host element if the host element, in its normal context, matches the selector argument.",
				"browsers": "C35,O22"
			},
			{
				"name": ":host-context()",
				"desc": "Tests whether there is an ancestor, outside the shadow tree, which matches a particular selector.",
				"browsers": "C35,O22"
			},
			{
				"name": ":hover",
				"desc": "Applies while the user designates an element with a pointing device, but does not necessarily activate it. For example, a visual user agent could apply this pseudo-class when the cursor (mouse pointer) hovers over a box generated by the element."
			},
			{
				"name": ":increment",
				"desc": "Non-standard. Applies to buttons and track pieces. Indicates whether or not the button or track piece will increment the view’s position when used.",
				"browsers": "C,S5"
			},
			{
				"name": ":indeterminate",
				"desc": "Applies to UI elements whose value is in an indeterminate state.",
				"browsers": "E,C,FF3.6,IE9,O10.6,S3"
			},
			{
				"name": ":in-range",
				"desc": "Used in conjunction with the min and max attributes, whether on a range input, a number field, or any other types that accept those attributes.",
				"browsers": "E13,C,FF10,O9.6,S5.1"
			},
			{
				"name": ":invalid",
				"desc": "An element is :valid or :invalid when it is, respectively, valid or invalid with respect to data validity semantics defined by a different specification.",
				"browsers": "E,C,FF4,IE10,O10,S5"
			},
			{
				"name": ":lang()",
				"desc": "Represents an element that is in language specified.",
				"browsers": "E,C,FF1,IE8,O8,S3"
			},
			{
				"name": ":last-child",
				"desc": "Same as :nth-last-child(1). Represents an element that is the last child of some other element.",
				"browsers": "E,C,FF1,IE9,O9.5,S3.1"
			},
			{
				"name": ":last-of-type",
				"desc": "Same as :nth-last-of-type(1). Represents an element that is the last sibling of its type in the list of children of its parent element.",
				"browsers": "E,C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":left",
				"desc": "When printing double-sided documents, the page boxes on left and right pages may be different. This can be expressed through CSS pseudo-classes defined in the  page context."
			},
			{
				"name": ":link",
				"desc": "Applies to links that have not yet been visited."
			},
			{
				"name": ":matches()",
				"desc": "Takes a selector list as its argument. It represents an element that is represented by its argument.",
				"browsers": "S9"
			},
			{
				"name": ":-moz-any()",
				"desc": "Represents an element that is represented by the selector list passed as its argument. Standardized as :matches().",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-any-link",
				"desc": "Represents an element that acts as the source anchor of a hyperlink. Applies to both visited and unvisited links.",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-broken",
				"desc": "Non-standard. Matches elements representing broken images.",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-drag-over",
				"desc": "Non-standard. Matches elements when a drag-over event applies to it.",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-first-node",
				"desc": "Non-standard. Represents an element that is the first child node of some other element.",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-focusring",
				"desc": "Non-standard. Matches an element that has focus and focus ring drawing is enabled in the browser.",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-full-screen",
				"desc": "Matches any element that has its fullscreen flag set. Standardized as :fullscreen.",
				"browsers": "FF9"
			},
			{
				"name": ":-moz-last-node",
				"desc": "Non-standard. Represents an element that is the last child node of some other element.",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-loading",
				"desc": "Non-standard. Matches elements, such as images, that haven’t started loading yet.",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-only-whitespace",
				"desc": "The same as :empty, except that it additionally matches elements that only contain code points affected by whitespace processing. Standardized as :blank.",
				"browsers": "FF1.5"
			},
			{
				"name": ":-moz-placeholder",
				"desc": "Deprecated. Represents placeholder text in an input field. Use ::-moz-placeholder for Firefox 19+.",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-submit-invalid",
				"desc": "Non-standard. Represents any submit button when the contents of the associated form are not valid.",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-suppressed",
				"desc": "Non-standard. Matches elements representing images that have been blocked from loading.",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-ui-invalid",
				"desc": "Non-standard. Represents any validated form element whose value isn't valid ",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-ui-valid",
				"desc": "Non-standard. Represents any validated form element whose value is valid ",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-user-disabled",
				"desc": "Non-standard. Matches elements representing images that have been disabled due to the user’s preferences.",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-window-inactive",
				"desc": "Non-standard. Matches elements in an inactive window.",
				"browsers": "FF4"
			},
			{
				"name": ":-ms-fullscreen",
				"desc": "Matches any element that has its fullscreen flag set.",
				"browsers": "IE11"
			},
			{
				"name": ":-ms-input-placeholder",
				"desc": "Represents placeholder text in an input field. Note: for Edge use the pseudo-element ::-ms-input-placeholder. Standardized as ::placeholder.",
				"browsers": "IE10"
			},
			{
				"name": ":-ms-keyboard-active",
				"desc": "Windows Store apps only. Applies one or more styles to an element when it has focus and the user presses the space bar.",
				"browsers": "IE10"
			},
			{
				"name": ":-ms-lang()",
				"desc": "Represents an element that is in the language specified. Accepts a comma seperated list of language tokens.",
				"browsers": "E,IE10"
			},
			{
				"name": ":no-button",
				"desc": "Non-standard. Applies to track pieces. Applies when there is no button at that end of the track.",
				"browsers": "C,S5"
			},
			{
				"name": ":not()",
				"desc": "The negation pseudo-class, :not(X), is a functional notation taking a simple selector (excluding the negation pseudo-class itself) as an argument. It represents an element that is not represented by its argument.",
				"browsers": "E,C,FF1,IE9,O9.5,S2"
			},
			{
				"name": ":nth-child()",
				"desc": "Represents an element that has an+b-1 siblings before it in the document tree, for any positive integer or zero value of n, and has a parent element.",
				"browsers": "E,C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":nth-last-child()",
				"desc": "Represents an element that has an+b-1 siblings after it in the document tree, for any positive integer or zero value of n, and has a parent element.",
				"browsers": "E,C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":nth-last-of-type()",
				"desc": "Represents an element that has an+b-1 siblings with the same expanded element name after it in the document tree, for any zero or positive integer value of n, and has a parent element.",
				"browsers": "E,C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":nth-of-type()",
				"desc": "Represents an element that has an+b-1 siblings with the same expanded element name before it in the document tree, for any zero or positive integer value of n, and has a parent element.",
				"browsers": "E,C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":only-child",
				"desc": "Represents an element that has a parent element and whose parent element has no other element children. Same as :first-child:last-child or :nth-child(1):nth-last-child(1), but with a lower specificity.",
				"browsers": "E,C,FF1.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":only-of-type",
				"desc": "Matches every element that is the only child of its type, of its parent. Same as :first-of-type:last-of-type or :nth-of-type(1):nth-last-of-type(1), but with a lower specificity.",
				"browsers": "E,C,FF3.5,IE9,O9.5,S3.2"
			},
			{
				"name": ":optional",
				"desc": "A form element is :required or :optional if a value for it is, respectively, required or optional before the form it belongs to is submitted. Elements that are not form elements are neither required nor optional.",
				"browsers": "E,C,FF4,IE10,O10,S5"
			},
			{
				"name": ":out-of-range",
				"desc": "Used in conjunction with the min and max attributes, whether on a range input, a number field, or any other types that accept those attributes.",
				"browsers": "E13,C,FF10,O9.6,S5.1"
			},
			{
				"name": ":past",
				"desc": "Represents any element that is defined to occur entirely prior to a :current element.",
				"browsers": "C,O16,S6"
			},
			{
				"name": ":read-only",
				"desc": "An element whose contents are not user-alterable is :read-only. However, elements whose contents are user-alterable (such as text input fields) are considered to be in a :read-write state. In typical documents, most elements are :read-only.",
				"browsers": "E13,C,FF10,O9,S4"
			},
			{
				"name": ":read-write",
				"desc": "An element whose contents are not user-alterable is :read-only. However, elements whose contents are user-alterable (such as text input fields) are considered to be in a :read-write state. In typical documents, most elements are :read-only.",
				"browsers": "E13,C,FF10,O9,S4"
			},
			{
				"name": ":required",
				"desc": "A form element is :required or :optional if a value for it is, respectively, required or optional before the form it belongs to is submitted. Elements that are not form elements are neither required nor optional.",
				"browsers": "E,C,FF4,IE10,O10,S5"
			},
			{
				"name": ":right",
				"desc": "When printing double-sided documents, the page boxes on left and right pages may be different. This can be expressed through CSS pseudo-classes defined in the  page context."
			},
			{
				"name": ":root",
				"desc": "Represents an element that is the root of the document. In HTML 4, this is always the HTML element.",
				"browsers": "E,C,FF1,IE9,O9.5,S1"
			},
			{
				"name": ":scope",
				"desc": "Represents any element that is in the contextual reference element set.",
				"browsers": "FF32,S6"
			},
			{
				"name": ":single-button",
				"desc": "Non-standard. Applies to buttons and track pieces. Applies when both buttons are displayed separately at either end of the scrollbar.",
				"browsers": "C,S5"
			},
			{
				"name": ":start",
				"desc": "Non-standard. Applies to buttons and track pieces. Indicates whether the object is placed before the thumb.",
				"browsers": "C,S5"
			},
			{
				"name": ":target",
				"desc": "Some URIs refer to a location within a resource. This kind of URI ends with a 'number sign' (#) followed by an anchor identifier (called the fragment identifier).",
				"browsers": "E,C,FF1,IE9,O9.5,S1"
			},
			{
				"name": ":valid",
				"desc": "An element is :valid or :invalid when it is, respectively, valid or invalid with respect to data validity semantics defined by a different specification.",
				"browsers": "E,C,FF4,IE10,O10,S5"
			},
			{
				"name": ":vertical",
				"desc": "Non-standard. Applies to any scrollbar pieces that have a vertical orientation.",
				"browsers": "C,S5"
			},
			{
				"name": ":visited",
				"desc": "Applies once the link has been visited by the user."
			},
			{
				"name": ":-webkit-any()",
				"desc": "Represents an element that is represented by the selector list passed as its argument. Standardized as :matches().",
				"browsers": "C,S5"
			},
			{
				"name": ":-webkit-full-screen",
				"desc": "Matches any element that has its fullscreen flag set. Standardized as :fullscreen.",
				"browsers": "C,S6"
			},
			{
				"name": ":window-inactive",
				"desc": "Non-standard. Applies to all scrollbar pieces. Indicates whether or not the window containing the scrollbar is currently active.",
				"browsers": "C,S3"
			}
		],
		"pseudoelements": [
			{
				"name": "::after",
				"desc": "Represents a styleable child pseudo-element immediately after the originating element’s actual content.",
				"browsers": "E,C,FF1.5,IE9,O9,S4"
			},
			{
				"name": "::backdrop",
				"desc": "Used to create a backdrop that hides the underlying document for an element in a top layer (such as an element that is displayed fullscreen).",
				"browsers": "E"
			},
			{
				"name": "::before",
				"desc": "Represents a styleable child pseudo-element immediately before the originating element’s actual content.",
				"browsers": "E,C,FF1.5,IE9,O9,S4"
			},
			{
				"name": "::content",
				"desc": "Deprecated. Matches the distribution list itself, on elements that have one. Use ::slotted for forward compatibility.",
				"browsers": "C35,O22"
			},
			{
				"name": "::cue",
				"browsers": "C,O16,S6"
			},
			{
				"name": "::cue()",
				"browsers": "C,O16,S6"
			},
			{
				"name": "::cue-region",
				"browsers": "C,O16,S6"
			},
			{
				"name": "::cue-region()",
				"browsers": "C,O16,S6"
			},
			{
				"name": "::first-letter",
				"desc": "Represents the first letter of an element, if it is not preceded by any other content (such as images or inline tables) on its line.",
				"browsers": "E,C,FF1.5,IE9,O7,S1"
			},
			{
				"name": "::first-line",
				"desc": "Describes the contents of the first formatted line of its originating element.",
				"browsers": "E,C,FF1.5,IE9,O7,S1"
			},
			{
				"name": "::-moz-focus-inner",
				"browsers": "FF4"
			},
			{
				"name": "::-moz-focus-outer",
				"browsers": "FF4"
			},
			{
				"name": "::-moz-list-bullet",
				"desc": "Used to style the bullet of a list element. Similar to the standardized ::marker.",
				"browsers": "FF1"
			},
			{
				"name": "::-moz-list-number",
				"desc": "Used to style the numbers of a list element. Similar to the standardized ::marker.",
				"browsers": "FF1"
			},
			{
				"name": "::-moz-placeholder",
				"desc": "Represents placeholder text in an input field",
				"browsers": "FF19"
			},
			{
				"name": "::-moz-progress-bar",
				"desc": "Represents the bar portion of a progress bar.",
				"browsers": "FF9"
			},
			{
				"name": "::-moz-selection",
				"desc": "Represents the portion of a document that has been highlighted by the user.",
				"browsers": "FF1"
			},
			{
				"name": "::-ms-backdrop",
				"desc": "Used to create a backdrop that hides the underlying document for an element in a top layer (such as an element that is displayed fullscreen).",
				"browsers": "IE11"
			},
			{
				"name": "::-ms-browse",
				"desc": "Represents the browse button of an input type=file control.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-check",
				"desc": "Represents the check of a checkbox or radio button input control.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-clear",
				"desc": "Represents the clear button of a text input control",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-expand",
				"desc": "Represents the drop-down button of a select control.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-fill",
				"desc": "Represents the bar portion of a progress bar.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-fill-lower",
				"desc": "Represents the portion of the slider track from its smallest value up to the value currently selected by the thumb. In a left-to-right layout, this is the portion of the slider track to the left of the thumb.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-fill-upper",
				"desc": "Represents the portion of the slider track from the value currently selected by the thumb up to the slider's largest value. In a left-to-right layout, this is the portion of the slider track to the right of the thumb.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-reveal",
				"desc": "Represents the password reveal button of an input type=password control.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-thumb",
				"desc": "Represents the portion of range input control (also known as a slider control) that the user drags.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-ticks-after",
				"desc": "Represents the tick marks of a slider that begin just after the thumb and continue up to the slider's largest value. In a left-to-right layout, these are the ticks to the right of the thumb.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-ticks-before",
				"desc": "Represents the tick marks of a slider that represent its smallest values up to the value currently selected by the thumb. In a left-to-right layout, these are the ticks to the left of the thumb.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-tooltip",
				"desc": "Represents the tooltip of a slider (input type=range).",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-track",
				"desc": "Represents the track of a slider.",
				"browsers": "E,IE10"
			},
			{
				"name": "::-ms-value",
				"desc": "Represents the content of a text or password input control, or a select control.",
				"browsers": "E,IE10"
			},
			{
				"name": "::selection",
				"desc": "Represents the portion of a document that has been highlighted by the user.",
				"browsers": "E,C,IE9,O9.5,S1.1"
			},
			{
				"name": "::shadow",
				"desc": "Matches the shadow root if an element has a shadow tree.",
				"browsers": "C35,O22"
			},
			{
				"name": "::-webkit-file-upload-button",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-inner-spin-button",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-input-placeholder",
				"browsers": "C,S4"
			},
			{
				"name": "::-webkit-keygen-select",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-meter-bar",
				"browsers": "E13,C,O15,S6"
			},
			{
				"name": "::-webkit-meter-even-less-good-value",
				"browsers": "E13,C,O15,S6"
			},
			{
				"name": "::-webkit-meter-optimum-value",
				"browsers": "E13,C,O15,S6"
			},
			{
				"name": "::-webkit-meter-suboptimal-value",
				"browsers": "E13,C,O15,S6"
			},
			{
				"name": "::-webkit-ouer-spin-button",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-progress-bar",
				"browsers": "C,S3"
			},
			{
				"name": "::-webkit-progress-inner-element",
				"browsers": "C,S3"
			},
			{
				"name": "::-webkit-progress-value",
				"browsers": "C,S3"
			},
			{
				"name": "::-webkit-resizer",
				"browsers": "C,S5"
			},
			{
				"name": "::-webkit-scrollbar",
				"browsers": "C,S5"
			},
			{
				"name": "::-webkit-scrollbar-button",
				"browsers": "C,S5"
			},
			{
				"name": "::-webkit-scrollbar-corner",
				"browsers": "C,S5"
			},
			{
				"name": "::-webkit-scrollbar-thumb",
				"browsers": "C,S5"
			},
			{
				"name": "::-webkit-scrollbar-track",
				"browsers": "C,S5"
			},
			{
				"name": "::-webkit-scrollbar-track-piece",
				"browsers": "C,S5"
			},
			{
				"name": "::-webkit-search-cancel-button",
				"browsers": "C,S4"
			},
			{
				"name": "::-webkit-search-decoration",
				"browsers": "C,S4"
			},
			{
				"name": "::-webkit-search-results-button",
				"browsers": "C,S4"
			},
			{
				"name": "::-webkit-search-results-decoration",
				"browsers": "C,S4"
			},
			{
				"name": "::-webkit-slider-runnable-track",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-slider-thumb",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-textfield-decoration-container",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-validation-bubble",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-validation-bubble-arrow",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-validation-bubble-arrow-clipper",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-validation-bubble-heading",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-validation-bubble-message",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-validation-bubble-text-block",
				"browsers": "C,O,S6"
			}
		],
		"properties": [
			{
				"name": "additive-symbols",
				"desc": "@counter-style descriptor. Specifies the symbols used by the marker-construction algorithm specified by the system descriptor. Needs to be specified if the counter system is 'additive'.",
				"browsers": "FF33",
				"restriction": "integer, string, image, identifier"
			},
			{
				"name": "align-content",
				"desc": "Aligns a flex container’s lines within the flex container when there is extra space in the cross-axis, similar to how 'justify-content' aligns individual items within the main-axis.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "Lines are packed toward the center of the flex container."
					},
					{
						"name": "flex-end",
						"desc": "Lines are packed toward the end of the flex container."
					},
					{
						"name": "flex-start",
						"desc": "Lines are packed toward the start of the flex container."
					},
					{
						"name": "space-around",
						"desc": "Lines are evenly distributed in the flex container, with half-size spaces on either end."
					},
					{
						"name": "space-between",
						"desc": "Lines are evenly distributed in the flex container."
					},
					{
						"name": "stretch",
						"desc": "Lines stretch to take up the remaining space."
					}
				]
			},
			{
				"name": "align-items",
				"desc": "Aligns flex items along the cross axis of the current line of the flex container.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "baseline",
						"desc": "If the flex item’s inline axis is the same as the cross axis, this value is identical to 'flex-start'. Otherwise, it participates in baseline alignment."
					},
					{
						"name": "center",
						"desc": "The flex item’s margin box is centered in the cross axis within the line."
					},
					{
						"name": "flex-end",
						"desc": "The cross-end margin edge of the flex item is placed flush with the cross-end edge of the line."
					},
					{
						"name": "flex-start",
						"desc": "The cross-start margin edge of the flex item is placed flush with the cross-start edge of the line."
					},
					{
						"name": "stretch",
						"desc": "If the cross size property of the flex item computes to auto, and neither of the cross-axis margins are auto, the flex item is stretched."
					}
				]
			},
			{
				"name": "align-self",
				"desc": "Allows the default alignment along the cross axis to be overridden for individual flex items.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Computes to the value of 'align-items' on the element’s parent, or 'stretch' if the element has no parent. On absolutely positioned elements, it computes to itself."
					},
					{
						"name": "baseline",
						"desc": "If the flex item’s inline axis is the same as the cross axis, this value is identical to 'flex-start'. Otherwise, it participates in baseline alignment."
					},
					{
						"name": "center",
						"desc": "The flex item’s margin box is centered in the cross axis within the line."
					},
					{
						"name": "flex-end",
						"desc": "The cross-end margin edge of the flex item is placed flush with the cross-end edge of the line."
					},
					{
						"name": "flex-start",
						"desc": "The cross-start margin edge of the flex item is placed flush with the cross-start edge of the line."
					},
					{
						"name": "stretch",
						"desc": "If the cross size property of the flex item computes to auto, and neither of the cross-axis margins are auto, the flex item is stretched."
					}
				]
			},
			{
				"name": "all",
				"desc": "Shorthand that resets all properties except 'direction' and 'unicode-bidi'.",
				"browsers": "C37,FF27,O24",
				"restriction": "enum",
				"values": []
			},
			{
				"name": "alt",
				"desc": "Provides alternative text for assistive technology to replace the genenerated content of a ::before or ::after element.",
				"browsers": "S9",
				"restriction": "string, enum",
				"values": []
			},
			{
				"name": "animation",
				"desc": "Shorthand property combines six of the animation properties into a single property.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "time, timing-function, enum, identifier, number",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "backwards"
					},
					{
						"name": "both",
						"desc": "Both forwards and backwards fill modes are applied."
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					},
					{
						"name": "none",
						"desc": "No animation is performed"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "animation-delay",
				"desc": "Defines when the animation will start.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "time"
			},
			{
				"name": "animation-direction",
				"desc": "Defines whether or not the animation should play in reverse on alternate cycles.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "animation-duration",
				"desc": "Defines the length of time that an animation takes to complete one cycle.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "time"
			},
			{
				"name": "animation-fill-mode",
				"desc": "Defines what values are applied by the animation outside the time it is executing.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "backwards"
					},
					{
						"name": "both",
						"desc": "Both forwards and backwards fill modes are applied."
					},
					{
						"name": "forwards"
					},
					{
						"name": "none",
						"desc": "There is no change to the property value between the time the animation is applied and the time the animation begins playing or after the animation completes."
					}
				]
			},
			{
				"name": "animation-iteration-count",
				"desc": "Defines the number of times an animation cycle is played. The default value is one, meaning the animation will play from beginning to end once.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "number, enum",
				"values": [
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					}
				]
			},
			{
				"name": "animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "identifier, enum",
				"values": [
					{
						"name": "none",
						"desc": "No animation is performed"
					}
				]
			},
			{
				"name": "animation-play-state",
				"desc": "Defines whether the animation is running or paused.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "paused"
					},
					{
						"name": "running"
					}
				]
			},
			{
				"name": "animation-timing-function",
				"desc": "Describes how the animation will progress over one cycle of its duration.",
				"browsers": "E,C43,FF16,IE10,O12.1,S9",
				"restriction": "timing-function"
			},
			{
				"name": "backface-visibility",
				"desc": "Determines whether or not the 'back' side of a transformed element is visible when facing the viewer. With an identity transform, the front side of an element faces the viewer.",
				"browsers": "E,C36,FF16,IE10,O23",
				"restriction": "enum",
				"values": [
					{
						"name": "hidden",
						"desc": "Back side is hidden."
					},
					{
						"name": "visible",
						"desc": "Back side is visible."
					}
				]
			},
			{
				"name": "background",
				"desc": "Shorthand property for setting most background properties at the same place in the style sheet.",
				"restriction": "enum, image, color, position, length, repeat, percentage, box",
				"values": [
					{
						"name": "fixed",
						"desc": "The background is fixed with regard to the viewport. In paged media where there is no viewport, a 'fixed' background is fixed with respect to the page box and therefore replicated on every page."
					},
					{
						"name": "local",
						"desc": "The background is fixed with regard to the element's contents: if the element has a scrolling mechanism, the background scrolls with the element's contents."
					},
					{
						"name": "scroll",
						"desc": "The background is fixed with regard to the element itself and does not scroll with its contents. (It is effectively attached to the element's border.)"
					}
				]
			},
			{
				"name": "background-attachment",
				"desc": "Specifies whether the background images are fixed with regard to the viewport ('fixed') or scroll along with the element ('scroll') or its contents ('local').",
				"restriction": "enum",
				"values": [
					{
						"name": "fixed",
						"desc": "The background is fixed with regard to the viewport. In paged media where there is no viewport, a 'fixed' background is fixed with respect to the page box and therefore replicated on every page."
					},
					{
						"name": "local",
						"desc": "The background is fixed with regard to the element’s contents: if the element has a scrolling mechanism, the background scrolls with the element’s contents.",
						"browsers": "E,C,FF25,IE9,O11.5,S5"
					},
					{
						"name": "scroll",
						"desc": "The background is fixed with regard to the element itself and does not scroll with its contents. (It is effectively attached to the element’s border.)"
					}
				]
			},
			{
				"name": "background-blend-mode",
				"desc": "Defines the blending mode of each background layer.",
				"browsers": "C35,FF30,O22,S7.1",
				"restriction": "enum",
				"values": [
					{
						"name": "normal",
						"desc": "Default attribute which specifies no blending"
					},
					{
						"name": "multiply"
					},
					{
						"name": "screen"
					},
					{
						"name": "overlay"
					},
					{
						"name": "darken"
					},
					{
						"name": "lighten"
					},
					{
						"name": "color-dodge"
					},
					{
						"name": "color-burn"
					},
					{
						"name": "hard-light"
					},
					{
						"name": "soft-light"
					},
					{
						"name": "difference"
					},
					{
						"name": "exclusion"
					},
					{
						"name": "hue",
						"browsers": "C35,FF30,O22"
					},
					{
						"name": "saturation",
						"browsers": "C35,FF30,O22"
					},
					{
						"name": "color",
						"browsers": "C35,FF30,O22"
					},
					{
						"name": "luminosity",
						"browsers": "C35,FF30,O22"
					}
				]
			},
			{
				"name": "background-clip",
				"desc": "Determines the background painting area.",
				"browsers": "E,C,FF4,IE9,O10.5,S3",
				"restriction": "box"
			},
			{
				"name": "background-color",
				"desc": "Sets the background color of an element.",
				"restriction": "color"
			},
			{
				"name": "background-image",
				"desc": "Sets the background image(s) of an element.",
				"restriction": "image, enum",
				"values": [
					{
						"name": "none",
						"desc": "Counts as an image layer but draws nothing."
					}
				]
			},
			{
				"name": "background-origin",
				"desc": "For elements rendered as a single box, specifies the background positioning area. For elements rendered as multiple boxes (e.g., inline boxes on several lines, boxes on several pages) specifies which boxes 'box-decoration-break' operates on to determine the background positioning area(s).",
				"browsers": "E,C,FF4,IE9,O10.5,S3",
				"restriction": "box"
			},
			{
				"name": "background-position",
				"desc": "Specifies the initial position of the background image(s) (after any resizing) within their corresponding background positioning area.",
				"restriction": "position, length, percentage"
			},
			{
				"name": "background-position-x",
				"desc": "If background images have been specified, this property specifies their initial position (after any resizing) within their corresponding background positioning area.",
				"browsers": "E,IE6",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "center",
						"desc": "Equivalent to '50%' ('left 50%') for the horizontal position if the horizontal position is not otherwise specified, or '50%' ('top 50%') for the vertical position if it is."
					},
					{
						"name": "left",
						"desc": "Equivalent to '0%' for the horizontal position if one or two values are given, otherwise specifies the left edge as the origin for the next offset."
					},
					{
						"name": "right",
						"desc": "Equivalent to '100%' for the horizontal position if one or two values are given, otherwise specifies the right edge as the origin for the next offset."
					}
				]
			},
			{
				"name": "background-position-y",
				"desc": "If background images have been specified, this property specifies their initial position (after any resizing) within their corresponding background positioning area.",
				"browsers": "E,IE6",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "bottom",
						"desc": "Equivalent to '100%' for the vertical position if one or two values are given, otherwise specifies the bottom edge as the origin for the next offset."
					},
					{
						"name": "center",
						"desc": "Equivalent to '50%' ('left 50%') for the horizontal position if the horizontal position is not otherwise specified, or '50%' ('top 50%') for the vertical position if it is."
					},
					{
						"name": "top",
						"desc": "Equivalent to '0%' for the vertical position if one or two values are given, otherwise specifies the top edge as the origin for the next offset."
					}
				]
			},
			{
				"name": "background-repeat",
				"desc": "Specifies how background images are tiled after they have been sized and positioned.",
				"restriction": "repeat",
				"values": []
			},
			{
				"name": "background-size",
				"desc": "Specifies the size of the background images.",
				"browsers": "E,C,FF4,IE9,O10,S4.1",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Resolved by using the image’s intrinsic ratio and the size of the other dimension, or failing that, using the image’s intrinsic size, or failing that, treating it as 100%."
					},
					{
						"name": "contain",
						"desc": "Scale the image, while preserving its intrinsic aspect ratio (if any), to the largest size such that both its width and its height can fit inside the background positioning area."
					},
					{
						"name": "cover",
						"desc": "Scale the image, while preserving its intrinsic aspect ratio (if any), to the smallest size such that both its width and its height can completely cover the background positioning area."
					}
				]
			},
			{
				"name": "behavior",
				"desc": "IE only. Used to extend behaviors of the browser.",
				"browsers": "IE6",
				"restriction": "url"
			},
			{
				"name": "block-size",
				"desc": "Logical 'width'. Mapping depends on the element’s 'writing-mode'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Depends on the values of other properties."
					}
				]
			},
			{
				"name": "border",
				"desc": "Shorthand property for setting border width, style, and color.",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-block-end",
				"desc": "Logical 'border-bottom'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-block-start",
				"desc": "Logical 'border-top'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-block-end-color",
				"desc": "Logical 'border-bottom-color'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "color"
			},
			{
				"name": "border-block-start-color",
				"desc": "Logical 'border-top-color'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "color"
			},
			{
				"name": "border-block-end-style",
				"desc": "Logical 'border-bottom-style'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "line-style"
			},
			{
				"name": "border-block-start-style",
				"desc": "Logical 'border-top-style'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "lline-style"
			},
			{
				"name": "border-block-end-width",
				"desc": "Logical 'border-bottom-width'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width"
			},
			{
				"name": "border-block-start-width",
				"desc": "Logical 'border-top-width'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width"
			},
			{
				"name": "border-bottom",
				"desc": "Shorthand property for setting border width, style and color.",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-bottom-color",
				"desc": "Sets the color of the bottom border.",
				"restriction": "color"
			},
			{
				"name": "border-bottom-left-radius",
				"desc": "Defines the radii of the bottom left outer border edge.",
				"browsers": "E,C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-bottom-right-radius",
				"desc": "Defines the radii of the bottom right outer border edge.",
				"browsers": "E,C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-bottom-style",
				"desc": "Sets the style of the bottom border.",
				"restriction": "line-style"
			},
			{
				"name": "border-bottom-width",
				"desc": "Sets the thickness of the bottom border.",
				"restriction": "length, line-width"
			},
			{
				"name": "border-collapse",
				"desc": "Selects a table's border model.",
				"restriction": "enum",
				"values": [
					{
						"name": "collapse",
						"desc": "Selects the collapsing borders model."
					},
					{
						"name": "separate",
						"desc": "Selects the separated borders border model."
					}
				]
			},
			{
				"name": "border-color",
				"desc": "The color of the border around all four edges of an element.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "border-image",
				"desc": "Shorthand property for setting 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset' and 'border-image-repeat'. Omitted values are set to their initial values.",
				"browsers": "E,C16,FF15,IE11,O15,S6",
				"restriction": "length, percentage, number, url, enum",
				"values": [
					{
						"name": "auto",
						"desc": "If 'auto' is specified then the border image width is the intrinsic width or height (whichever is applicable) of the corresponding image slice. If the image does not have the required intrinsic dimension then the corresponding border-width is used instead."
					},
					{
						"name": "fill",
						"desc": "Causes the middle part of the border-image to be preserved."
					},
					{
						"name": "none",
						"desc": "Use the border styles."
					},
					{
						"name": "repeat"
					},
					{
						"name": "round",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the image is rescaled so that it does."
					},
					{
						"name": "space",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the extra space is distributed around the tiles."
					},
					{
						"name": "stretch",
						"desc": "The image is stretched to fill the area."
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "border-image-outset",
				"desc": "The values specify the amount by which the border image area extends beyond the border box on the top, right, bottom, and left sides respectively. If the fourth value is absent, it is the same as the second. If the third one is also absent, it is the same as the first. If the second one is also absent, it is the same as the first. Numbers represent multiples of the corresponding border-width.",
				"browsers": "E,C16,FF15,IE11,O15,S6",
				"restriction": "length, number"
			},
			{
				"name": "border-image-repeat",
				"desc": "Specifies how the images for the sides and the middle part of the border image are scaled and tiled. If the second keyword is absent, it is assumed to be the same as the first.",
				"browsers": "E,C16,FF15,IE11,O15,S6",
				"restriction": "enum",
				"values": [
					{
						"name": "repeat"
					},
					{
						"name": "round",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the image is rescaled so that it does."
					},
					{
						"name": "space",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the extra space is distributed around the tiles."
					},
					{
						"name": "stretch",
						"desc": "The image is stretched to fill the area."
					}
				]
			},
			{
				"name": "border-image-slice",
				"desc": "Specifies inward offsets from the top, right, bottom, and left edges of the image, dividing it into nine regions: four corners, four edges and a middle.",
				"browsers": "E,C16,FF15,IE11,O15,S6",
				"restriction": "number, percentage",
				"values": [
					{
						"name": "fill",
						"desc": "Causes the middle part of the border-image to be preserved."
					}
				]
			},
			{
				"name": "border-image-source",
				"desc": "Specifies an image to use instead of the border styles given by the 'border-style' properties and as an additional background layer for the element. If the value is 'none' or if the image cannot be displayed, the border styles will be used.",
				"browsers": "E,C16,FF15,IE11,O15,S6",
				"restriction": "image",
				"values": [
					{
						"name": "none",
						"desc": "Use the border styles."
					}
				]
			},
			{
				"name": "border-image-width",
				"desc": "The four values of 'border-image-width' specify offsets that are used to divide the border image area into nine parts. They represent inward distances from the top, right, bottom, and left sides of the area, respectively.",
				"browsers": "E,C16,FF15,IE11,O15,S6",
				"restriction": "length, percentage, number",
				"values": [
					{
						"name": "auto",
						"desc": "The border image width is the intrinsic width or height (whichever is applicable) of the corresponding image slice. If the image does not have the required intrinsic dimension then the corresponding border-width is used instead."
					}
				]
			},
			{
				"name": "border-inline-end",
				"desc": "Logical 'border-right'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-inline-start",
				"desc": "Logical 'border-left'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-inline-end-color",
				"desc": "Logical 'border-right-color'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "color"
			},
			{
				"name": "border-inline-start-color",
				"desc": "Logical 'border-left-color'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "color"
			},
			{
				"name": "border-inline-end-style",
				"desc": "Logical 'border-right-style'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "line-style"
			},
			{
				"name": "border-inline-start-style",
				"desc": "Logical 'border-left-style'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "lline-style"
			},
			{
				"name": "border-inline-end-width",
				"desc": "Logical 'border-right-width'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width"
			},
			{
				"name": "border-inline-start-width",
				"desc": "Logical 'border-left-width'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, line-width"
			},
			{
				"name": "border-left",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-left-color",
				"desc": "Sets the color of the left border.",
				"restriction": "color"
			},
			{
				"name": "border-left-style",
				"desc": "Sets the style of the left border.",
				"restriction": "line-style"
			},
			{
				"name": "border-left-width",
				"desc": "Sets the thickness of the left border.",
				"restriction": "length, line-width"
			},
			{
				"name": "border-radius",
				"desc": "Defines the radii of the outer border edge.",
				"browsers": "E,C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-right",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-right-color",
				"desc": "Sets the color of the right border.",
				"restriction": "color"
			},
			{
				"name": "border-right-style",
				"desc": "Sets the style of the right border.",
				"restriction": "line-style"
			},
			{
				"name": "border-right-width",
				"desc": "Sets the thickness of the right border.",
				"restriction": "length, line-width"
			},
			{
				"name": "border-spacing",
				"desc": "The lengths specify the distance that separates adjoining cell borders. If one length is specified, it gives both the horizontal and vertical spacing. If two are specified, the first gives the horizontal spacing and the second the vertical spacing. Lengths may not be negative.",
				"browsers": "E,C,FF1,IE8,O7,S1.2",
				"restriction": "length"
			},
			{
				"name": "border-style",
				"desc": "The style of the border around edges of an element.",
				"restriction": "line-style",
				"values": []
			},
			{
				"name": "border-top",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "border-top-color",
				"desc": "Sets the color of the top border.",
				"restriction": "color"
			},
			{
				"name": "border-top-left-radius",
				"desc": "Defines the radii of the top left outer border edge.",
				"browsers": "E,C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-top-right-radius",
				"desc": "Defines the radii of the top right outer border edge.",
				"browsers": "E,C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-top-style",
				"desc": "Sets the style of the top border.",
				"restriction": "line-style"
			},
			{
				"name": "border-top-width",
				"desc": "Sets the thickness of the top border.",
				"restriction": "length, line-width"
			},
			{
				"name": "border-width",
				"desc": "Shorthand that sets the four 'border-*-width' properties. If it has four values, they set top, right, bottom and left in that order. If left is missing, it is the same as right; if bottom is missing, it is the same as top; if right is missing, it is the same as top.",
				"restriction": "length, line-width",
				"values": []
			},
			{
				"name": "bottom",
				"desc": "Specifies how far an absolutely positioned box's bottom margin edge is offset above the bottom edge of the box's 'containing block'.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well"
					}
				]
			},
			{
				"name": "box-decoration-break",
				"desc": "Specifies whether individual boxes are treated as broken pieces of one continuous box, or whether each box is individually wrapped with the border and padding.",
				"browsers": "FF32,O11",
				"restriction": "enum",
				"values": [
					{
						"name": "clone"
					},
					{
						"name": "slice"
					}
				]
			},
			{
				"name": "box-shadow",
				"desc": "Attaches one or more drop-shadows to the box. The property is a comma-separated list of shadows, each specified by 2-4 length values, an optional color, and an optional 'inset' keyword. Omitted lengths are 0; omitted colors are a user agent chosen color.",
				"browsers": "E,C,FF4,IE9,O11.5,S5.1",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "inset"
					}
				]
			},
			{
				"name": "box-sizing",
				"desc": "Specifies the behavior of the 'width' and 'height' properties.",
				"browsers": "E,C10,FF29,IE8,O8,S5.1",
				"restriction": "enum",
				"values": [
					{
						"name": "border-box"
					},
					{
						"name": "content-box"
					}
				]
			},
			{
				"name": "break-after",
				"desc": "Describes the page/column/region break behavior after the generated box.",
				"browsers": "E,IE10,O11.5",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break before/after the principal box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a break before/after the principal box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break before/after the principal box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break before/after the principal box."
					},
					{
						"name": "column",
						"desc": "Always force a column break before/after the principal box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "page",
						"desc": "Always force a page break before/after the principal box."
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "break-before",
				"desc": "Describes the page/column/region break behavior before the generated box.",
				"browsers": "E,IE10,O11.5",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break before/after the principal box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a break before/after the principal box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break before/after the principal box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break before/after the principal box."
					},
					{
						"name": "column",
						"desc": "Always force a column break before/after the principal box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "page",
						"desc": "Always force a page break before/after the principal box."
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "break-inside",
				"desc": "Describes the page/column/region break behavior inside the principal box.",
				"browsers": "E,IE10,O11.5",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Impose no additional breaking constraints within the box."
					},
					{
						"name": "avoid",
						"desc": "Avoid breaks within the box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break within the box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break within the box."
					}
				]
			},
			{
				"name": "caption-side",
				"desc": "Specifies the position of the caption box with respect to the table box.",
				"browsers": "E,C,FF,IE8,O,S",
				"restriction": "enum",
				"values": [
					{
						"name": "bottom",
						"desc": "Positions the caption box below the table box."
					},
					{
						"name": "top",
						"desc": "Positions the caption box above the table box."
					}
				]
			},
			{
				"name": "clear",
				"desc": "Indicates which sides of an element's box(es) may not be adjacent to an earlier floating box. The 'clear' property does not consider floats inside the element itself or in other block formatting contexts.",
				"restriction": "enum",
				"values": [
					{
						"name": "both",
						"desc": "The clearance of the generated box is set to the amount necessary to place the top border edge below the bottom outer edge of any right-floating and left-floating boxes that resulted from elements earlier in the source document."
					},
					{
						"name": "left",
						"desc": "The clearance of the generated box is set to the amount necessary to place the top border edge below the bottom outer edge of any left-floating boxes that resulted from elements earlier in the source document."
					},
					{
						"name": "none",
						"desc": "No constraint on the box's position with respect to floats."
					},
					{
						"name": "right",
						"desc": "The clearance of the generated box is set to the amount necessary to place the top border edge below the bottom outer edge of any right-floating boxes that resulted from elements earlier in the source document."
					}
				]
			},
			{
				"name": "clip",
				"desc": "Deprecated. Use the 'clip-path' property when support allows. Defines the visible portion of an element’s box.",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The element does not clip."
					},
					{
						"name": "rect()"
					}
				]
			},
			{
				"name": "clip-path",
				"desc": "Specifies a clipping path where everything inside the path is visable and everything outside is clipped out.",
				"browsers": "FF3.5",
				"restriction": "url, shape, geometry-box, enum",
				"values": [
					{
						"name": "none",
						"desc": "No clipping path gets created."
					},
					{
						"name": "url()",
						"desc": "References a <clipPath> element to create a clipping path."
					}
				]
			},
			{
				"name": "clip-rule",
				"desc": "Indicates the algorithm which is to be used to determine what parts of the canvas are included inside the shape.",
				"browsers": "E,C5,FF3,IE10,O9,S6",
				"restriction": "enum",
				"values": [
					{
						"name": "evenodd"
					},
					{
						"name": "nonzero"
					}
				]
			},
			{
				"name": "color",
				"desc": "Color of an element's text",
				"restriction": "color"
			},
			{
				"name": "color-interpolation-filters",
				"desc": "Specifies the color space for imaging operations performed via filter effects.",
				"browsers": "E,C5,FF3,IE10,O9,S6",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Color operations are not required to occur in a particular color space."
					},
					{
						"name": "linearRGB"
					},
					{
						"name": "sRGB"
					}
				]
			},
			{
				"name": "column-count",
				"desc": "Describes the optimal number of columns into which the content of the element will be flowed.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "integer, enum",
				"values": [
					{
						"name": "auto",
						"desc": "Determines the number of columns by the 'column-width' property and the element width."
					}
				]
			},
			{
				"name": "column-fill",
				"desc": "In continuous media, this property will only be consulted if the length of columns has been constrained. Otherwise, columns will automatically be balanced.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Fills columns sequentially."
					},
					{
						"name": "balance"
					}
				]
			},
			{
				"name": "column-gap",
				"desc": "Sets the gap between columns. If there is a column rule between columns, it will appear in the middle of the gap.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "length, enum",
				"values": [
					{
						"name": "normal",
						"desc": "User agent specific and typically equivalent to 1em."
					}
				]
			},
			{
				"name": "column-rule",
				"desc": "Shorthand for setting 'column-rule-width', 'column-rule-style', and 'column-rule-color' at the same place in the style sheet. Omitted values are set to their initial values.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "column-rule-color",
				"desc": "Sets the color of the column rule",
				"browsers": "E,IE10,O11.6",
				"restriction": "color"
			},
			{
				"name": "column-rule-style",
				"desc": "Sets the style of the rule between columns of an element.",
				"browsers": "E,IE10,O11.5,S6",
				"restriction": "line-style"
			},
			{
				"name": "column-rule-width",
				"desc": "Sets the width of the rule between columns. Negative values are not allowed.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "length, line-width"
			},
			{
				"name": "columns",
				"desc": "A shorthand property which sets both 'column-width' and 'column-count'.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "length, integer, enum",
				"values": [
					{
						"name": "auto",
						"desc": "The width depends on the values of other properties."
					}
				]
			},
			{
				"name": "column-span",
				"desc": "Describes the page/column break behavior after the generated box.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "all",
						"desc": "The element spans across all columns. Content in the normal flow that appears before the element is automatically balanced across all columns before the element appear."
					},
					{
						"name": "none",
						"desc": "The element does not span multiple columns."
					}
				]
			},
			{
				"name": "column-width",
				"desc": "Describes the width of columns in multicol elements.",
				"browsers": "E,IE10,O11.5,S9",
				"restriction": "length, enum",
				"values": [
					{
						"name": "auto",
						"desc": "The width depends on the values of other properties."
					}
				]
			},
			{
				"name": "content",
				"desc": "Determines which page-based occurrence of a given element is applied to a counter or string value.",
				"browsers": "E,C,FF1,IE8,O4,S1",
				"restriction": "string, url",
				"values": [
					{
						"name": "attr()"
					},
					{
						"name": "counter(name)"
					},
					{
						"name": "icon",
						"desc": "The (pseudo-)element is replaced in its entirety by the resource referenced by its 'icon' property, and treated as a replaced element."
					},
					{
						"name": "none",
						"desc": "On elements, this inhibits the children of the element from being rendered as children of this element, as if the element was empty. On pseudo-elements it causes the pseudo-element to have no content."
					},
					{
						"name": "normal",
						"desc": "See http://www.w3.org/TR/css3-content/#content for computation rules."
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "counter-increment",
				"desc": "Manipulate the value of existing counters.",
				"browsers": "E,C,FF1.5,IE8,O10.5,S3",
				"restriction": "identifier, integer",
				"values": [
					{
						"name": "none",
						"desc": "This element does not alter the value of any counters."
					}
				]
			},
			{
				"name": "counter-reset",
				"desc": "Property accepts one or more names of counters (identifiers), each one optionally followed by an integer. The integer gives the value that the counter is set to on each occurrence of the element.",
				"browsers": "E,C,FF1.5,IE8,O10.5,S3",
				"restriction": "identifier, integer",
				"values": [
					{
						"name": "none",
						"desc": "The counter is not modified."
					}
				]
			},
			{
				"name": "cursor",
				"desc": "Allows control over cursor appearance in an element",
				"restriction": "url, number, enum",
				"values": [
					{
						"name": "alias"
					},
					{
						"name": "all-scroll"
					},
					{
						"name": "auto",
						"desc": "The UA determines the cursor to display based on the current context."
					},
					{
						"name": "cell"
					},
					{
						"name": "col-resize"
					},
					{
						"name": "context-menu"
					},
					{
						"name": "copy"
					},
					{
						"name": "crosshair"
					},
					{
						"name": "default",
						"desc": "The platform-dependent default cursor. Often rendered as an arrow."
					},
					{
						"name": "e-resize"
					},
					{
						"name": "ew-resize"
					},
					{
						"name": "grab",
						"browsers": "FF27"
					},
					{
						"name": "grabbing",
						"browsers": "FF27"
					},
					{
						"name": "help"
					},
					{
						"name": "move"
					},
					{
						"name": "-moz-grab",
						"browsers": "FF1.5"
					},
					{
						"name": "-moz-grabbing",
						"browsers": "FF1.5"
					},
					{
						"name": "-moz-zoom-in",
						"browsers": "FF"
					},
					{
						"name": "-moz-zoom-out",
						"browsers": "FF"
					},
					{
						"name": "ne-resize"
					},
					{
						"name": "nesw-resize"
					},
					{
						"name": "no-drop"
					},
					{
						"name": "none",
						"desc": "No cursor is rendered for the element."
					},
					{
						"name": "not-allowed"
					},
					{
						"name": "n-resize"
					},
					{
						"name": "ns-resize"
					},
					{
						"name": "nw-resize"
					},
					{
						"name": "nwse-resize"
					},
					{
						"name": "pointer"
					},
					{
						"name": "progress"
					},
					{
						"name": "row-resize"
					},
					{
						"name": "se-resize"
					},
					{
						"name": "s-resize"
					},
					{
						"name": "sw-resize"
					},
					{
						"name": "text",
						"desc": "Indicates text that may be selected. Often rendered as a vertical I-beam."
					},
					{
						"name": "vertical-text"
					},
					{
						"name": "wait"
					},
					{
						"name": "-webkit-grab",
						"browsers": "C,S4"
					},
					{
						"name": "-webkit-grabbing",
						"browsers": "C,S4"
					},
					{
						"name": "-webkit-zoom-in",
						"browsers": "C,S1.2"
					},
					{
						"name": "-webkit-zoom-out",
						"browsers": "C,S1.2"
					},
					{
						"name": "w-resize"
					},
					{
						"name": "zoom-in",
						"browsers": "E,C37,FF24,O12.1,S9"
					},
					{
						"name": "zoom-out",
						"browsers": "E,C37,FF24,O12.1,S9"
					}
				]
			},
			{
				"name": "direction",
				"desc": "Specifies the inline base direction or directionality of any bidi paragraph, embedding, isolate, or override established by the box. Note: for HTML content use the 'dir' attribute and 'bdo' element rather than this property.",
				"restriction": "enum",
				"values": [
					{
						"name": "ltr"
					},
					{
						"name": "rtl"
					}
				]
			},
			{
				"name": "display",
				"desc": "In combination with 'float' and 'position', determines the type of box or boxes that are generated for an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "block"
					},
					{
						"name": "flex",
						"browsers": "E,C29,FF22,IE11,O12.1,S9"
					},
					{
						"name": "flexbox",
						"browsers": "O12.1"
					},
					{
						"name": "inline",
						"desc": "The element generates an inline-level box."
					},
					{
						"name": "inline-block"
					},
					{
						"name": "inline-flex",
						"browsers": "E,C29,FF22,IE11,O12.1,S9"
					},
					{
						"name": "inline-flexbox",
						"browsers": "O12.1"
					},
					{
						"name": "inline-table"
					},
					{
						"name": "list-item"
					},
					{
						"name": "-moz-box",
						"browsers": "FF"
					},
					{
						"name": "-moz-deck",
						"browsers": "FF"
					},
					{
						"name": "-moz-grid",
						"browsers": "FF"
					},
					{
						"name": "-moz-grid-group",
						"browsers": "FF"
					},
					{
						"name": "-moz-grid-line",
						"browsers": "FF"
					},
					{
						"name": "-moz-groupbox",
						"browsers": "FF"
					},
					{
						"name": "-moz-inline-box",
						"browsers": "FF"
					},
					{
						"name": "-moz-inline-grid",
						"browsers": "FF"
					},
					{
						"name": "-moz-inline-stack",
						"browsers": "FF"
					},
					{
						"name": "-moz-marker",
						"browsers": "FF"
					},
					{
						"name": "-moz-popup",
						"browsers": "FF"
					},
					{
						"name": "-moz-stack",
						"browsers": "FF"
					},
					{
						"name": "-ms-flexbox",
						"browsers": "IE10"
					},
					{
						"name": "-ms-grid",
						"browsers": "E,IE10"
					},
					{
						"name": "-ms-inline-flexbox",
						"browsers": "IE10"
					},
					{
						"name": "-ms-inline-grid",
						"browsers": "E,IE10"
					},
					{
						"name": "none",
						"desc": "The element and its descendants generates no boxes."
					},
					{
						"name": "ruby",
						"desc": "The element generates a principal ruby container box, and establishes a ruby formatting context."
					},
					{
						"name": "ruby-base"
					},
					{
						"name": "ruby-base-container"
					},
					{
						"name": "ruby-text"
					},
					{
						"name": "ruby-text-container"
					},
					{
						"name": "run-in",
						"browsers": "IE8"
					},
					{
						"name": "table"
					},
					{
						"name": "table-caption"
					},
					{
						"name": "table-cell"
					},
					{
						"name": "table-column"
					},
					{
						"name": "table-column-group"
					},
					{
						"name": "table-footer-group"
					},
					{
						"name": "table-header-group"
					},
					{
						"name": "table-row"
					},
					{
						"name": "table-row-group"
					},
					{
						"name": "-webkit-box",
						"browsers": "C,S1"
					},
					{
						"name": "-webkit-flex",
						"browsers": "C21,O15,S6.1"
					},
					{
						"name": "-webkit-inline-box",
						"browsers": "C,S1"
					},
					{
						"name": "-webkit-inline-flex",
						"browsers": "C21,O15,S6.1"
					}
				]
			},
			{
				"name": "empty-cells",
				"desc": "In the separated borders model, this property controls the rendering of borders and backgrounds around cells that have no visible content.",
				"browsers": "E,C,FF1,IE7,O4,S1.2",
				"restriction": "enum",
				"values": [
					{
						"name": "hide"
					},
					{
						"name": "-moz-show-background",
						"browsers": "FF"
					},
					{
						"name": "show"
					}
				]
			},
			{
				"name": "enable-background",
				"desc": "Deprecated. Use 'isolation' property instead when support allows. Specifies how the accumulation of the background image is managed.",
				"restriction": "integer, length, percentage, enum",
				"values": [
					{
						"name": "accumulate"
					},
					{
						"name": "new"
					}
				]
			},
			{
				"name": "fallback",
				"desc": "@counter-style descriptor. Specifies a fallback counter style to be used when the current counter style can’t create a representation for a given counter value.",
				"browsers": "FF33",
				"restriction": "identifier"
			},
			{
				"name": "fill",
				"desc": "Paints the interior of the given graphical element.",
				"restriction": "color, enum, url",
				"values": [
					{
						"name": "url()",
						"desc": "A URL reference to a paint server element, which is an element that defines a paint server: ‘hatch’, ‘linearGradient’, ‘mesh’, ‘pattern’, ‘radialGradient’ and ‘solidcolor’."
					}
				]
			},
			{
				"name": "fill-opacity",
				"desc": "Specifies the opacity of the painting operation used to paint the interior the current object.",
				"restriction": "number(0-1)"
			},
			{
				"name": "fill-rule",
				"desc": "Indicates the algorithm (or winding rule) which is to be used to determine what parts of the canvas are included inside the shape.",
				"restriction": "enum",
				"values": [
					{
						"name": "evenodd"
					},
					{
						"name": "nonzero"
					}
				]
			},
			{
				"name": "filter",
				"desc": "Processes an element’s rendering before it is displayed in the document, by applying one or more filter effects.",
				"browsers": "E13,FF35",
				"restriction": "enum, url",
				"values": [
					{
						"name": "none",
						"desc": "No filter effects are applied."
					},
					{
						"name": "blur()"
					},
					{
						"name": "brightness()"
					},
					{
						"name": "contrast()"
					},
					{
						"name": "drop-shadow()"
					},
					{
						"name": "grayscale()"
					},
					{
						"name": "hue-rotate()"
					},
					{
						"name": "invert()"
					},
					{
						"name": "opacity()"
					},
					{
						"name": "saturate()"
					},
					{
						"name": "sepia()"
					},
					{
						"name": "url()",
						"desc": "A filter reference to a <filter> element.",
						"browsers": "FF3.6"
					}
				]
			},
			{
				"name": "flex",
				"desc": "Specifies the components of a flexible length: the flex grow factor and flex shrink factor, and the flex basis.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "length, number, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Retrieves the value of the main size property as the used 'flex-basis'."
					},
					{
						"name": "content",
						"browsers": "E,IE11"
					},
					{
						"name": "none",
						"desc": "Expands to '0 0 auto'."
					}
				]
			},
			{
				"name": "flex-basis",
				"desc": "Sets the flex basis.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "length, number, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Retrieves the value of the main size property as the used 'flex-basis'."
					},
					{
						"name": "content",
						"browsers": "E,IE11"
					}
				]
			},
			{
				"name": "flex-direction",
				"desc": "Specifies how flex items are placed in the flex container, by setting the direction of the flex container’s main axis.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "column",
						"desc": "The flex container’s main axis has the same orientation as the block axis of the current writing mode."
					},
					{
						"name": "column-reverse"
					},
					{
						"name": "row"
					},
					{
						"name": "row-reverse"
					}
				]
			},
			{
				"name": "flex-flow",
				"desc": "Specifies how flexbox items are placed in the flexbox.",
				"browsers": "E,C29,FF28,IE11,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "column",
						"desc": "The flex container’s main axis has the same orientation as the block axis of the current writing mode."
					},
					{
						"name": "column-reverse"
					},
					{
						"name": "nowrap",
						"desc": "The flex container is single-line."
					},
					{
						"name": "row"
					},
					{
						"name": "row-reverse"
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line."
					},
					{
						"name": "wrap-reverse"
					}
				]
			},
			{
				"name": "flex-grow",
				"desc": "Sets the flex grow factor. Negative numbers are invalid.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "number"
			},
			{
				"name": "flex-shrink",
				"desc": "Sets the flex shrink factor. Negative numbers are invalid.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "number"
			},
			{
				"name": "flex-wrap",
				"desc": "Controls whether the flex container is single-line or multi-line, and the direction of the cross-axis, which determines the direction new lines are stacked in.",
				"browsers": "E,C29,FF28,IE11,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "nowrap",
						"desc": "The flex container is single-line."
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line."
					},
					{
						"name": "wrap-reverse"
					}
				]
			},
			{
				"name": "float",
				"desc": "Specifies how a box should be floated. It may be set for any element, but only applies to elements that generate boxes that are not absolutely positioned.",
				"restriction": "enum",
				"values": [
					{
						"name": "left",
						"desc": "The element generates a block box that is floated to the left. Content flows on the right side of the box, starting at the top (subject to the 'clear' property)."
					},
					{
						"name": "none",
						"desc": "The box is not floated."
					},
					{
						"name": "right",
						"desc": "Similar to 'left', except the box is floated to the right, and content flows on the left side of the box, starting at the top."
					}
				]
			},
			{
				"name": "flood-color",
				"desc": "Indicates what color to use to flood the current filter primitive subregion.",
				"browsers": "E,C5,FF3,IE10,O9,S6",
				"restriction": "color"
			},
			{
				"name": "flood-opacity",
				"desc": "Indicates what opacity to use to flood the current filter primitive subregion.",
				"browsers": "E,C5,FF3,IE10,O9,S6",
				"restriction": "number(0-1), percentage"
			},
			{
				"name": "font",
				"desc": "Shorthand property for setting 'font-style', 'font-variant', 'font-weight', 'font-size', 'line-height', and 'font-family', at the same place in the style sheet. The syntax of this property is based on a traditional typographical shorthand notation to set multiple properties related to fonts.",
				"restriction": "font",
				"values": [
					{
						"name": "100"
					},
					{
						"name": "200"
					},
					{
						"name": "300"
					},
					{
						"name": "400"
					},
					{
						"name": "500"
					},
					{
						"name": "600"
					},
					{
						"name": "700"
					},
					{
						"name": "800"
					},
					{
						"name": "900"
					},
					{
						"name": "bold"
					},
					{
						"name": "bolder"
					},
					{
						"name": "caption"
					},
					{
						"name": "icon",
						"desc": "The font used to label icons."
					},
					{
						"name": "italic",
						"desc": "Selects a font that is labeled 'italic', or, if that is not available, one labeled 'oblique'."
					},
					{
						"name": "large"
					},
					{
						"name": "larger"
					},
					{
						"name": "lighter"
					},
					{
						"name": "medium"
					},
					{
						"name": "menu"
					},
					{
						"name": "message-box"
					},
					{
						"name": "normal",
						"desc": "Specifies a face that is not labeled as a small-caps font."
					},
					{
						"name": "oblique",
						"desc": "Selects a font that is labeled 'oblique'."
					},
					{
						"name": "small"
					},
					{
						"name": "small-caps",
						"desc": "Specifies a font that is labeled as a small-caps font. If a genuine small-caps font is not available, user agents should simulate a small-caps font."
					},
					{
						"name": "small-caption"
					},
					{
						"name": "smaller"
					},
					{
						"name": "status-bar"
					},
					{
						"name": "x-large"
					},
					{
						"name": "x-small"
					},
					{
						"name": "xx-large"
					},
					{
						"name": "xx-small"
					}
				]
			},
			{
				"name": "font-family",
				"desc": "Specifies a prioritized list of font family names or generic family names. A user agent iterates through the list of family names until it matches an available font that contains a glyph for the character to be rendered.",
				"restriction": "font",
				"values": [
					{
						"name": "Arial, Helvetica, sans-serif"
					},
					{
						"name": "Cambria, Cochin, Georgia, Times, Times New Roman, serif"
					},
					{
						"name": "Courier New, Courier, monospace"
					},
					{
						"name": "cursive"
					},
					{
						"name": "fantasy"
					},
					{
						"name": "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif"
					},
					{
						"name": "Georgia, 'Times New Roman', Times, serif"
					},
					{
						"name": "'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif"
					},
					{
						"name": "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif"
					},
					{
						"name": "'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif"
					},
					{
						"name": "monospace"
					},
					{
						"name": "sans-serif"
					},
					{
						"name": "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
					},
					{
						"name": "serif"
					},
					{
						"name": "'Times New Roman', Times, serif"
					},
					{
						"name": "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif"
					},
					{
						"name": "Verdana, Geneva, Tahoma, sans-serif"
					}
				]
			},
			{
				"name": "font-feature-settings",
				"desc": "Provides low-level control over OpenType font features. It is intended as a way of providing access to font features that are not widely used but are needed for a particular use case.",
				"browsers": "E,FF34,IE10",
				"restriction": "string, integer",
				"values": [
					{
						"name": "\"aalt\""
					},
					{
						"name": "\"abvf\""
					},
					{
						"name": "\"abvm\""
					},
					{
						"name": "\"abvs\""
					},
					{
						"name": "\"afrc\""
					},
					{
						"name": "\"akhn\""
					},
					{
						"name": "\"blwf\""
					},
					{
						"name": "\"blwm\""
					},
					{
						"name": "\"blws\""
					},
					{
						"name": "\"calt\""
					},
					{
						"name": "\"case\""
					},
					{
						"name": "\"ccmp\""
					},
					{
						"name": "\"cfar\""
					},
					{
						"name": "\"cjct\""
					},
					{
						"name": "\"clig\""
					},
					{
						"name": "\"cpct\""
					},
					{
						"name": "\"cpsp\""
					},
					{
						"name": "\"cswh\""
					},
					{
						"name": "\"curs\""
					},
					{
						"name": "\"c2pc\""
					},
					{
						"name": "\"c2cs\"",
						"desc": "Small Capitals From Capitals. Applies only to bicameral scripts."
					},
					{
						"name": "\"dist\""
					},
					{
						"name": "\"dlig\"",
						"desc": "Discretionary ligatures."
					},
					{
						"name": "\"dnom\""
					},
					{
						"name": "\"dtls\""
					},
					{
						"name": "\"expt\""
					},
					{
						"name": "\"falt\""
					},
					{
						"name": "\"fin2\""
					},
					{
						"name": "\"fin3\""
					},
					{
						"name": "\"fina\""
					},
					{
						"name": "\"flac\""
					},
					{
						"name": "\"frac\""
					},
					{
						"name": "\"fwid\""
					},
					{
						"name": "\"half\""
					},
					{
						"name": "\"haln\""
					},
					{
						"name": "\"halt\""
					},
					{
						"name": "\"hist\""
					},
					{
						"name": "\"hkna\""
					},
					{
						"name": "\"hlig\""
					},
					{
						"name": "\"hngl\""
					},
					{
						"name": "\"hojo\""
					},
					{
						"name": "\"hwid\""
					},
					{
						"name": "\"init\""
					},
					{
						"name": "\"isol\""
					},
					{
						"name": "\"ital\""
					},
					{
						"name": "\"jalt\""
					},
					{
						"name": "\"jp78\""
					},
					{
						"name": "\"jp83\""
					},
					{
						"name": "\"jp90\""
					},
					{
						"name": "\"jp04\""
					},
					{
						"name": "\"kern\"",
						"desc": "Kerning."
					},
					{
						"name": "\"lfbd\""
					},
					{
						"name": "\"liga\"",
						"desc": "Standard Ligatures."
					},
					{
						"name": "\"ljmo\""
					},
					{
						"name": "\"lnum\"",
						"desc": "Lining Figures."
					},
					{
						"name": "\"locl\""
					},
					{
						"name": "\"ltra\""
					},
					{
						"name": "\"ltrm\""
					},
					{
						"name": "\"mark\""
					},
					{
						"name": "\"med2\""
					},
					{
						"name": "\"medi\""
					},
					{
						"name": "\"mgrk\""
					},
					{
						"name": "\"mkmk\""
					},
					{
						"name": "\"nalt\""
					},
					{
						"name": "\"nlck\""
					},
					{
						"name": "\"nukt\""
					},
					{
						"name": "\"numr\""
					},
					{
						"name": "\"onum\"",
						"desc": "Oldstyle Figures."
					},
					{
						"name": "\"opbd\""
					},
					{
						"name": "\"ordn\""
					},
					{
						"name": "\"ornm\""
					},
					{
						"name": "\"palt\""
					},
					{
						"name": "\"pcap\""
					},
					{
						"name": "\"pkna\""
					},
					{
						"name": "\"pnum\""
					},
					{
						"name": "\"pref\""
					},
					{
						"name": "\"pres\""
					},
					{
						"name": "\"pstf\""
					},
					{
						"name": "\"psts\""
					},
					{
						"name": "\"pwid\""
					},
					{
						"name": "\"qwid\""
					},
					{
						"name": "\"rand\""
					},
					{
						"name": "\"rclt\""
					},
					{
						"name": "\"rlig\""
					},
					{
						"name": "\"rkrf\""
					},
					{
						"name": "\"rphf\""
					},
					{
						"name": "\"rtbd\""
					},
					{
						"name": "\"rtla\""
					},
					{
						"name": "\"rtlm\""
					},
					{
						"name": "\"ruby\""
					},
					{
						"name": "\"salt\""
					},
					{
						"name": "\"sinf\""
					},
					{
						"name": "\"size\""
					},
					{
						"name": "\"smcp\"",
						"desc": "Small Capitals. Applies only to bicameral scripts."
					},
					{
						"name": "\"smpl\""
					},
					{
						"name": "\"ssty\""
					},
					{
						"name": "\"stch\""
					},
					{
						"name": "\"subs\""
					},
					{
						"name": "\"sups\""
					},
					{
						"name": "\"swsh\"",
						"desc": "Swash. Does not apply to ideographic scripts."
					},
					{
						"name": "\"titl\""
					},
					{
						"name": "\"tjmo\""
					},
					{
						"name": "\"tnam\""
					},
					{
						"name": "\"tnum\"",
						"desc": "Tabular Figures."
					},
					{
						"name": "\"trad\""
					},
					{
						"name": "\"twid\""
					},
					{
						"name": "\"unic\""
					},
					{
						"name": "\"valt\""
					},
					{
						"name": "\"vatu\""
					},
					{
						"name": "\"vert\""
					},
					{
						"name": "\"vhal\""
					},
					{
						"name": "\"vjmo\""
					},
					{
						"name": "\"vkna\""
					},
					{
						"name": "\"vkrn\""
					},
					{
						"name": "\"vpal\""
					},
					{
						"name": "\"vrt2\""
					},
					{
						"name": "\"zero\""
					},
					{
						"name": "normal",
						"desc": "No change in glyph substitution or positioning occurs."
					},
					{
						"name": "off",
						"desc": "Disable feature."
					},
					{
						"name": "on",
						"desc": "Enable feature."
					}
				]
			},
			{
				"name": "font-kerning",
				"desc": "Kerning is the contextual adjustment of inter-glyph spacing. This property controls metric kerning, kerning that utilizes adjustment data contained in the font.",
				"browsers": "C33,FF34,O20",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Specifies that kerning is applied at the discretion of the user agent."
					},
					{
						"name": "none",
						"desc": "Specifies that kerning is not applied."
					},
					{
						"name": "normal",
						"desc": "Specifies that kerning is applied."
					}
				]
			},
			{
				"name": "font-language-override",
				"desc": "The value of 'normal' implies that when rendering with OpenType fonts the language of the document is used to infer the OpenType language system, used to select language specific features when rendering.",
				"browsers": "FF34",
				"restriction": "string",
				"values": [
					{
						"name": "normal",
						"desc": "Implies that when rendering with OpenType fonts the language of the document is used to infer the OpenType language system, used to select language specific features when rendering."
					}
				]
			},
			{
				"name": "font-size",
				"desc": "Indicates the desired height of glyphs from the font. For scalable fonts, the font-size is a scale factor applied to the EM unit of the font. (Note that certain glyphs may bleed outside their EM box.) For non-scalable fonts, the font-size is converted into absolute units and matched against the declared font-size of the font, using the same absolute coordinate space for both of the matched values.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "large"
					},
					{
						"name": "larger"
					},
					{
						"name": "medium"
					},
					{
						"name": "small"
					},
					{
						"name": "smaller"
					},
					{
						"name": "x-large"
					},
					{
						"name": "x-small"
					},
					{
						"name": "xx-large"
					},
					{
						"name": "xx-small"
					}
				]
			},
			{
				"name": "font-size-adjust",
				"desc": "Preserves the readability of text when font fallback occurs by adjusting the font-size so that the x-height is the same irregardless of the font used.",
				"browsers": "E,FF3,IE10",
				"restriction": "number",
				"values": [
					{
						"name": "none",
						"desc": "Do not preserve the font’s x-height."
					}
				]
			},
			{
				"name": "font-stretch",
				"desc": "Selects a normal, condensed, or expanded face from a font family.",
				"browsers": "E,FF9,IE9",
				"restriction": "enum",
				"values": [
					{
						"name": "condensed"
					},
					{
						"name": "expanded"
					},
					{
						"name": "extra-condensed"
					},
					{
						"name": "extra-expanded"
					},
					{
						"name": "narrower",
						"browsers": "E,IE10"
					},
					{
						"name": "normal"
					},
					{
						"name": "semi-condensed"
					},
					{
						"name": "semi-expanded"
					},
					{
						"name": "ultra-condensed"
					},
					{
						"name": "ultra-expanded"
					},
					{
						"name": "wider",
						"browsers": "E,IE10"
					}
				]
			},
			{
				"name": "font-style",
				"desc": "Allows italic or oblique faces to be selected. Italic forms are generally cursive in nature while oblique faces are typically sloped versions of the regular face.",
				"restriction": "enum",
				"values": [
					{
						"name": "italic",
						"desc": "Selects a font that is labeled as an 'italic' face, or an 'oblique' face if one is not"
					},
					{
						"name": "normal",
						"desc": "Selects a face that is classified as 'normal'."
					},
					{
						"name": "oblique",
						"desc": "Selects a font that is labeled as an 'oblique' face, or an 'italic' face if one is not."
					}
				]
			},
			{
				"name": "font-synthesis",
				"desc": "Controls whether user agents are allowed to synthesize bold or oblique font faces when a font family lacks bold or italic faces.",
				"browsers": "FF34,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "none",
						"desc": "Disallow all synthetic faces."
					},
					{
						"name": "style"
					},
					{
						"name": "weight"
					}
				]
			},
			{
				"name": "font-variant",
				"desc": "Specifies variant representations of the font",
				"restriction": "enum",
				"values": [
					{
						"name": "normal",
						"desc": "Specifies a face that is not labeled as a small-caps font."
					},
					{
						"name": "small-caps",
						"desc": "Specifies a font that is labeled as a small-caps font. If a genuine small-caps font is not available, user agents should simulate a small-caps font."
					}
				]
			},
			{
				"name": "font-variant-alternates",
				"desc": "For any given character, fonts can provide a variety of alternate glyphs in addition to the default glyph for that character. This property provides control over the selection of these alternate glyphs.",
				"browsers": "FF34",
				"restriction": "enum",
				"values": [
					{
						"name": "annotation()"
					},
					{
						"name": "character-variant()"
					},
					{
						"name": "historical-forms"
					},
					{
						"name": "normal",
						"desc": "None of the features are enabled."
					},
					{
						"name": "ornaments()"
					},
					{
						"name": "styleset()"
					},
					{
						"name": "stylistic()"
					},
					{
						"name": "swash()"
					}
				]
			},
			{
				"name": "font-variant-caps",
				"desc": "Specifies control over capitalized forms.",
				"browsers": "FF34",
				"restriction": "enum",
				"values": [
					{
						"name": "all-petite-caps"
					},
					{
						"name": "all-small-caps"
					},
					{
						"name": "normal",
						"desc": "None of the features are enabled."
					},
					{
						"name": "petite-caps"
					},
					{
						"name": "small-caps",
						"desc": "Enables display of small capitals. Small-caps glyphs typically use the form of uppercase letters but are reduced to the size of lowercase letters."
					},
					{
						"name": "titling-caps"
					},
					{
						"name": "unicase"
					}
				]
			},
			{
				"name": "font-variant-east-asian",
				"desc": "Allows control of glyph substitute and positioning in East Asian text.",
				"browsers": "FF34",
				"restriction": "enum",
				"values": [
					{
						"name": "full-width"
					},
					{
						"name": "jis04"
					},
					{
						"name": "jis78"
					},
					{
						"name": "jis83"
					},
					{
						"name": "jis90"
					},
					{
						"name": "normal",
						"desc": "None of the features are enabled."
					},
					{
						"name": "proportional-width"
					},
					{
						"name": "ruby",
						"desc": "Enables display of ruby variant glyphs."
					},
					{
						"name": "simplified"
					},
					{
						"name": "traditional"
					}
				]
			},
			{
				"name": "font-variant-ligatures",
				"desc": "Specifies control over which ligatures are enabled or disabled. A value of ‘normal’ implies that the defaults set by the font are used.",
				"browsers": "C18,FF34,O15,S6",
				"restriction": "enum",
				"values": [
					{
						"name": "additional-ligatures"
					},
					{
						"name": "common-ligatures"
					},
					{
						"name": "contextual",
						"browsers": "C35,F34,O22"
					},
					{
						"name": "discretionary-ligatures"
					},
					{
						"name": "historical-ligatures"
					},
					{
						"name": "no-additional-ligatures"
					},
					{
						"name": "no-common-ligatures"
					},
					{
						"name": "no-contextual",
						"browsers": "C35,F34,O22"
					},
					{
						"name": "no-discretionary-ligatures"
					},
					{
						"name": "no-historical-ligatures"
					},
					{
						"name": "none",
						"desc": "Disables all ligatures.",
						"browsers": "FF34"
					},
					{
						"name": "normal",
						"desc": "Implies that the defaults set by the font are used."
					}
				]
			},
			{
				"name": "font-variant-numeric",
				"desc": "Specifies control over numerical forms.",
				"browsers": "FF34",
				"restriction": "enum",
				"values": [
					{
						"name": "diagonal-fractions"
					},
					{
						"name": "lining-nums"
					},
					{
						"name": "normal",
						"desc": "None of the features are enabled."
					},
					{
						"name": "oldstyle-nums"
					},
					{
						"name": "ordinal"
					},
					{
						"name": "proportional-nums"
					},
					{
						"name": "slashed-zero"
					},
					{
						"name": "stacked-fractions"
					},
					{
						"name": "tabular-nums"
					}
				]
			},
			{
				"name": "font-variant-position",
				"desc": "Specifies the vertical position",
				"browsers": "FF34",
				"restriction": "enum",
				"values": [
					{
						"name": "normal",
						"desc": "None of the features are enabled."
					},
					{
						"name": "sub",
						"desc": "Enables display of subscript variants (OpenType feature: subs)."
					},
					{
						"name": "super",
						"desc": "Enables display of superscript variants (OpenType feature: sups)."
					}
				]
			},
			{
				"name": "font-weight",
				"desc": "Specifies weight of glyphs in the font, their degree of blackness or stroke thickness.",
				"restriction": "enum",
				"values": [
					{
						"name": "100"
					},
					{
						"name": "200"
					},
					{
						"name": "300"
					},
					{
						"name": "400"
					},
					{
						"name": "500"
					},
					{
						"name": "600"
					},
					{
						"name": "700"
					},
					{
						"name": "800"
					},
					{
						"name": "900"
					},
					{
						"name": "bold"
					},
					{
						"name": "bolder"
					},
					{
						"name": "lighter"
					},
					{
						"name": "normal",
						"desc": "Same as 400"
					}
				]
			},
			{
				"name": "glyph-orientation-horizontal",
				"desc": "Controls glyph orientation when the inline-progression-direction is horizontal.",
				"restriction": "angle, number"
			},
			{
				"name": "glyph-orientation-vertical",
				"desc": "Controls glyph orientation when the inline-progression-direction is vertical.",
				"restriction": "angle, number, enum",
				"values": [
					{
						"name": "auto",
						"desc": "Sets the orientation based on the fullwidth or non-fullwidth characters and the most common orientation."
					}
				]
			},
			{
				"name": "height",
				"desc": "Specifies the height of the content area, padding area or border area (depending on 'box-sizing') of certain boxes.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "The height depends on the values of other properties."
					},
					{
						"name": "fit-content",
						"browsers": "C46,O33"
					},
					{
						"name": "max-content",
						"browsers": "C46,O33"
					},
					{
						"name": "min-content",
						"browsers": "C46,O33"
					}
				]
			},
			{
				"name": "image-orientation",
				"desc": "Specifies an orthogonal rotation to be applied to an image before it is laid out.",
				"browsers": "FF26",
				"restriction": "angle",
				"values": [
					{
						"name": "flip"
					},
					{
						"name": "from-image"
					}
				]
			},
			{
				"name": "image-rendering",
				"desc": "Provides a hint to the user-agent about what aspects of an image are most important to preserve when the image is scaled, to aid the user-agent in the choice of an appropriate scaling algorithm.",
				"browsers": "C,FF3.6,O11.6,S",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The image should be scaled with an algorithm that maximizes the appearance of the image."
					},
					{
						"name": "crisp-edges"
					},
					{
						"name": "-moz-crisp-edges",
						"browsers": "FF"
					},
					{
						"name": "optimizeQuality"
					},
					{
						"name": "optimizeSpeed",
						"desc": "Deprecated."
					},
					{
						"name": "pixelated"
					}
				]
			},
			{
				"name": "ime-mode",
				"desc": "Controls the state of the input method editor for text fields.",
				"browsers": "E,FF3,IE5",
				"restriction": "enum",
				"values": [
					{
						"name": "active"
					},
					{
						"name": "auto",
						"desc": "No change is made to the current input method editor state. This is the default."
					},
					{
						"name": "disabled"
					},
					{
						"name": "inactive"
					},
					{
						"name": "normal",
						"desc": "The IME state should be normal; this value can be used in a user style sheet to override the page setting."
					}
				]
			},
			{
				"name": "inline-size",
				"desc": "Logical 'height'. Mapping depends on the element’s 'writing-mode'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Depends on the values of other properties."
					}
				]
			},
			{
				"name": "isolation",
				"desc": "In CSS setting to 'isolate' will turn the element into a stacking context. In SVG, it defines whether an element is isolated or not.",
				"browsers": "C,FF,O,S",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Elements are not isolated unless an operation is applied that causes the creation of a stacking context."
					},
					{
						"name": "isolate",
						"desc": "In CSS will turn the element into a stacking context."
					}
				]
			},
			{
				"name": "justify-content",
				"desc": "Aligns flex items along the main axis of the current line of the flex container.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "Flex items are packed toward the center of the line."
					},
					{
						"name": "flex-end",
						"desc": "Flex items are packed toward the end of the line."
					},
					{
						"name": "flex-start",
						"desc": "Flex items are packed toward the start of the line."
					},
					{
						"name": "space-around",
						"desc": "Flex items are evenly distributed in the line, with half-size spaces on either end."
					},
					{
						"name": "space-between",
						"desc": "Flex items are evenly distributed in the line."
					}
				]
			},
			{
				"name": "kerning",
				"desc": "Indicates whether the user agent should adjust inter-glyph spacing based on kerning tables that are included in the relevant font or instead disable auto-kerning and set inter-character spacing to a specific length.",
				"restriction": "length, enum",
				"values": [
					{
						"name": "auto",
						"desc": "Indicates that the user agent should adjust inter-glyph spacing based on kerning tables that are included in the font that will be used."
					}
				]
			},
			{
				"name": "left",
				"desc": "Specifies how far an absolutely positioned box's left margin edge is offset to the right of the left edge of the box's 'containing block'.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well"
					}
				]
			},
			{
				"name": "letter-spacing",
				"desc": "Specifies the minimum, maximum, and optimal spacing between grapheme clusters.",
				"restriction": "length",
				"values": [
					{
						"name": "normal",
						"desc": "The spacing is the normal spacing for the current font. It is typically zero-length."
					}
				]
			},
			{
				"name": "lighting-color",
				"desc": "Defines the color of the light source for filter primitives 'feDiffuseLighting' and 'feSpecularLighting'.",
				"browsers": "E,C5,FF3,IE10,O9,S6",
				"restriction": "color"
			},
			{
				"name": "line-height",
				"desc": "Determines the block-progression dimension of the text content area of an inline box.",
				"restriction": "number, length, percentage",
				"values": [
					{
						"name": "normal",
						"desc": "Tells user agents to set the computed value to a 'reasonable' value based on the font size of the element."
					}
				]
			},
			{
				"name": "list-style",
				"desc": "Shorthand for setting 'list-style-type', 'list-style-position' and 'list-style-image'",
				"restriction": "image, enum, url",
				"values": [
					{
						"name": "armenian"
					},
					{
						"name": "circle"
					},
					{
						"name": "decimal"
					},
					{
						"name": "decimal-leading-zero"
					},
					{
						"name": "disc"
					},
					{
						"name": "georgian"
					},
					{
						"name": "inside"
					},
					{
						"name": "lower-alpha"
					},
					{
						"name": "lower-greek"
					},
					{
						"name": "lower-latin"
					},
					{
						"name": "lower-roman"
					},
					{
						"name": "none"
					},
					{
						"name": "outside"
					},
					{
						"name": "square",
						"desc": "A filled square."
					},
					{
						"name": "symbols()",
						"browsers": "FF35"
					},
					{
						"name": "upper-alpha"
					},
					{
						"name": "upper-latin"
					},
					{
						"name": "upper-roman"
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "list-style-image",
				"desc": "Sets the image that will be used as the list item marker. When the image is available, it will replace the marker set with the 'list-style-type' marker.",
				"restriction": "image",
				"values": [
					{
						"name": "none",
						"desc": "The default contents of the of the list item’s marker are given by 'list-style-type' instead."
					}
				]
			},
			{
				"name": "list-style-position",
				"desc": "Specifies the position of the '::marker' pseudo-element's box in the list item.",
				"restriction": "enum",
				"values": [
					{
						"name": "inside"
					},
					{
						"name": "outside"
					}
				]
			},
			{
				"name": "list-style-type",
				"desc": "Used to construct the default contents of a list item’s marker",
				"restriction": "enum, string",
				"values": [
					{
						"name": "armenian",
						"desc": "Traditional uppercase Armenian numbering."
					},
					{
						"name": "circle"
					},
					{
						"name": "decimal",
						"desc": "Western decimal numbers."
					},
					{
						"name": "decimal-leading-zero",
						"desc": "Decimal numbers padded by initial zeros."
					},
					{
						"name": "disc"
					},
					{
						"name": "georgian",
						"desc": "Traditional Georgian numbering."
					},
					{
						"name": "lower-alpha",
						"desc": "Lowercase ASCII letters."
					},
					{
						"name": "lower-greek",
						"desc": "Lowercase classical Greek."
					},
					{
						"name": "lower-latin",
						"desc": "Lowercase ASCII letters."
					},
					{
						"name": "lower-roman",
						"desc": "Lowercase ASCII Roman numerals."
					},
					{
						"name": "none",
						"desc": "No marker"
					},
					{
						"name": "square",
						"desc": "A filled square."
					},
					{
						"name": "symbols()",
						"browsers": "FF35"
					},
					{
						"name": "upper-alpha",
						"desc": "Uppercase ASCII letters."
					},
					{
						"name": "upper-latin",
						"desc": "Uppercase ASCII letters."
					},
					{
						"name": "upper-roman",
						"desc": "Uppercase ASCII Roman numerals."
					}
				]
			},
			{
				"name": "margin",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-block-end",
				"desc": "Logical 'margin-bottom'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-block-start",
				"desc": "Logical 'margin-top'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-bottom",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-inline-end",
				"desc": "Logical 'margin-right'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-inline-start",
				"desc": "Logical 'margin-left'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-left",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-right",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "margin-top",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "marker",
				"desc": "Specifies the marker symbol that shall be used for all points on the sets the value for all vertices on the given ‘path’ element or basic shape.",
				"restriction": "url",
				"values": [
					{
						"name": "none",
						"desc": "Indicates that no marker symbol will be drawn at the given vertex or vertices."
					},
					{
						"name": "url()",
						"desc": "Indicates that the <marker> element referenced will be used."
					}
				]
			},
			{
				"name": "marker-end",
				"desc": "Specifies the marker that will be drawn at the last vertices of the given markable element.",
				"restriction": "url",
				"values": [
					{
						"name": "none",
						"desc": "Indicates that no marker symbol will be drawn at the given vertex or vertices."
					},
					{
						"name": "url()",
						"desc": "Indicates that the <marker> element referenced will be used."
					}
				]
			},
			{
				"name": "marker-mid",
				"desc": "Specifies the marker that will be drawn at all vertices except the first and last.",
				"restriction": "url",
				"values": [
					{
						"name": "none",
						"desc": "Indicates that no marker symbol will be drawn at the given vertex or vertices."
					},
					{
						"name": "url()",
						"desc": "Indicates that the <marker> element referenced will be used."
					}
				]
			},
			{
				"name": "marker-start",
				"desc": "Specifies the marker that will be drawn at the first vertices of the given markable element.",
				"restriction": "url",
				"values": [
					{
						"name": "none",
						"desc": "Indicates that no marker symbol will be drawn at the given vertex or vertices."
					},
					{
						"name": "url()",
						"desc": "Indicates that the <marker> element referenced will be used."
					}
				]
			},
			{
				"name": "mask-type",
				"desc": "Defines whether the content of the <mask> element is treated as as luminance mask or alpha mask.",
				"browsers": "C24,FF35,O15,S7",
				"restriction": "enum",
				"values": [
					{
						"name": "alpha"
					},
					{
						"name": "luminance"
					}
				]
			},
			{
				"name": "max-block-size",
				"desc": "Logical 'max-width'. Mapping depends on the element’s 'writing-mode'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "none",
						"desc": "No limit on the width of the box."
					}
				]
			},
			{
				"name": "max-height",
				"desc": "Allows authors to constrain content height to a certain range.",
				"browsers": "E,C,FF1,IE7,O7,S1",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "none",
						"desc": "No limit on the height of the box."
					},
					{
						"name": "fit-content",
						"browsers": "C46,O33"
					},
					{
						"name": "max-content",
						"browsers": "C46,O33"
					},
					{
						"name": "min-content",
						"browsers": "C46,O33"
					}
				]
			},
			{
				"name": "max-inline-size",
				"desc": "Logical 'max-height'. Mapping depends on the element’s 'writing-mode'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "none",
						"desc": "No limit on the height of the box."
					}
				]
			},
			{
				"name": "max-width",
				"desc": "Allows authors to constrain content width to a certain range.",
				"browsers": "E,C,FF1,IE7,O7,S1",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "none",
						"desc": "No limit on the width of the box."
					},
					{
						"name": "fit-content",
						"browsers": "C46,O33"
					},
					{
						"name": "max-content",
						"browsers": "C46,O33"
					},
					{
						"name": "min-content",
						"browsers": "C46,O33"
					}
				]
			},
			{
				"name": "min-block-size",
				"desc": "Logical 'min-width'. Mapping depends on the element’s 'writing-mode'.",
				"browsers": "FF41",
				"restriction": "length, percentage"
			},
			{
				"name": "min-height",
				"desc": "Allows authors to constrain content height to a certain range.",
				"browsers": "E,C,FF1,IE7,O7,S1",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"browsers": "E,IE11"
					},
					{
						"name": "fit-content",
						"browsers": "C46,O33"
					},
					{
						"name": "max-content",
						"browsers": "C46,O33"
					},
					{
						"name": "min-content",
						"browsers": "C46,O33"
					}
				]
			},
			{
				"name": "min-inline-size",
				"desc": "Logical 'min-height'. Mapping depends on the element’s 'writing-mode'.",
				"browsers": "FF41",
				"restriction": "length, percentage"
			},
			{
				"name": "min-width",
				"desc": "Allows authors to constrain content width to a certain range.",
				"browsers": "E,C,FF1,IE7,O7,S1",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"browsers": "E,IE11"
					},
					{
						"name": "fit-content",
						"browsers": "C46,O33"
					},
					{
						"name": "max-content",
						"browsers": "C46,O33"
					},
					{
						"name": "min-content",
						"browsers": "C46,O33"
					}
				]
			},
			{
				"name": "mix-blend-mode",
				"desc": "Defines the formula that must be used to mix the colors with the backdrop.",
				"browsers": "C41,FF32,O29,S7.1",
				"restriction": "enum",
				"values": [
					{
						"name": "normal",
						"desc": "Default attribute which specifies no blending"
					},
					{
						"name": "multiply"
					},
					{
						"name": "screen"
					},
					{
						"name": "overlay"
					},
					{
						"name": "darken"
					},
					{
						"name": "lighten"
					},
					{
						"name": "color-dodge"
					},
					{
						"name": "color-burn"
					},
					{
						"name": "hard-light"
					},
					{
						"name": "soft-light"
					},
					{
						"name": "difference"
					},
					{
						"name": "exclusion"
					},
					{
						"name": "hue",
						"browsers": "C41,FF32,O29"
					},
					{
						"name": "saturation",
						"browsers": "C41,FF32,O29"
					},
					{
						"name": "color",
						"browsers": "C41,FF32,O29"
					},
					{
						"name": "luminosity",
						"browsers": "C41,FF32,O29"
					}
				]
			},
			{
				"name": "motion",
				"desc": "Shorthand property for setting 'motion-path', 'motion-offset' and 'motion-rotation'.",
				"browsers": "C46,O33",
				"restriction": "url, length, percentage, angle, shape, geometry-box, enum",
				"values": [
					{
						"name": "none",
						"desc": "No motion path gets created."
					},
					{
						"name": "path()"
					},
					{
						"name": "auto",
						"desc": "Indicates that the object is rotated by the angle of the direction of the motion path."
					},
					{
						"name": "reverse",
						"desc": "Indicates that the object is rotated by the angle of the direction of the motion path plus 180 degrees."
					}
				]
			},
			{
				"name": "motion-offset",
				"desc": "A distance that describes the position along the specified motion path.",
				"browsers": "C46,O33",
				"restriction": "length, percentage"
			},
			{
				"name": "motion-path",
				"desc": "Specifies the motion path the element gets positioned at.",
				"browsers": "C46,O33",
				"restriction": "url, shape, geometry-box, enum",
				"values": [
					{
						"name": "none",
						"desc": "No motion path gets created."
					},
					{
						"name": "path()"
					}
				]
			},
			{
				"name": "motion-rotation",
				"desc": "Defines the direction of the element while positioning along the motion path.",
				"browsers": "C46,O33",
				"restriction": "angle",
				"values": [
					{
						"name": "auto",
						"desc": "Indicates that the object is rotated by the angle of the direction of the motion path."
					},
					{
						"name": "reverse",
						"desc": "Indicates that the object is rotated by the angle of the direction of the motion path plus 180 degrees."
					}
				]
			},
			{
				"name": "-moz-animation",
				"desc": "Shorthand property combines six of the animation properties into a single property.",
				"browsers": "FF9",
				"restriction": "time, enum, timing-function, identifier, number",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "backwards"
					},
					{
						"name": "both",
						"desc": "Both forwards and backwards fill modes are applied."
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					},
					{
						"name": "none",
						"desc": "No animation is performed"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "-moz-animation-delay",
				"desc": "Defines when the animation will start.",
				"browsers": "FF9",
				"restriction": "time"
			},
			{
				"name": "-moz-animation-direction",
				"desc": "Defines whether or not the animation should play in reverse on alternate cycles.",
				"browsers": "FF9",
				"restriction": "enum",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "-moz-animation-duration",
				"desc": "Defines the length of time that an animation takes to complete one cycle.",
				"browsers": "FF9",
				"restriction": "time"
			},
			{
				"name": "-moz-animation-iteration-count",
				"desc": "Defines the number of times an animation cycle is played. The default value is one, meaning the animation will play from beginning to end once.",
				"browsers": "FF9",
				"restriction": "number, enum",
				"values": [
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					}
				]
			},
			{
				"name": "-moz-animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "FF9",
				"restriction": "identifier, enum",
				"values": [
					{
						"name": "none",
						"desc": "No animation is performed"
					}
				]
			},
			{
				"name": "-moz-animation-play-state",
				"desc": "Defines whether the animation is running or paused.",
				"browsers": "FF9",
				"restriction": "enum",
				"values": [
					{
						"name": "paused"
					},
					{
						"name": "running"
					}
				]
			},
			{
				"name": "-moz-animation-timing-function",
				"desc": "Describes how the animation will progress over one cycle of its duration. See the 'transition-timing-function'.",
				"browsers": "FF9",
				"restriction": "timing-function"
			},
			{
				"name": "-moz-appearance",
				"desc": "Used in Gecko (Firefox) to display an element using a platform-native styling based on the operating system's theme.",
				"browsers": "FF1",
				"restriction": "enum",
				"values": [
					{
						"name": "button"
					},
					{
						"name": "button-arrow-down"
					},
					{
						"name": "button-arrow-next"
					},
					{
						"name": "button-arrow-previous"
					},
					{
						"name": "button-arrow-up"
					},
					{
						"name": "button-bevel"
					},
					{
						"name": "checkbox"
					},
					{
						"name": "checkbox-container"
					},
					{
						"name": "checkbox-label"
					},
					{
						"name": "dialog"
					},
					{
						"name": "groupbox"
					},
					{
						"name": "listbox"
					},
					{
						"name": "menuarrow"
					},
					{
						"name": "menuimage"
					},
					{
						"name": "menuitem"
					},
					{
						"name": "menuitemtext"
					},
					{
						"name": "menulist"
					},
					{
						"name": "menulist-button"
					},
					{
						"name": "menulist-text"
					},
					{
						"name": "menulist-textfield"
					},
					{
						"name": "menupopup"
					},
					{
						"name": "menuradio"
					},
					{
						"name": "menuseparator"
					},
					{
						"name": "-moz-mac-unified-toolbar"
					},
					{
						"name": "-moz-win-borderless-glass"
					},
					{
						"name": "-moz-win-browsertabbar-toolbox"
					},
					{
						"name": "-moz-win-communications-toolbox"
					},
					{
						"name": "-moz-win-glass"
					},
					{
						"name": "-moz-win-media-toolbox"
					},
					{
						"name": "none"
					},
					{
						"name": "progressbar"
					},
					{
						"name": "progresschunk"
					},
					{
						"name": "radio"
					},
					{
						"name": "radio-container"
					},
					{
						"name": "radio-label"
					},
					{
						"name": "radiomenuitem"
					},
					{
						"name": "resizer"
					},
					{
						"name": "resizerpanel"
					},
					{
						"name": "scrollbarbutton-down"
					},
					{
						"name": "scrollbarbutton-left"
					},
					{
						"name": "scrollbarbutton-right"
					},
					{
						"name": "scrollbarbutton-up"
					},
					{
						"name": "scrollbar-small"
					},
					{
						"name": "scrollbartrack-horizontal"
					},
					{
						"name": "scrollbartrack-vertical"
					},
					{
						"name": "separator"
					},
					{
						"name": "spinner"
					},
					{
						"name": "spinner-downbutton"
					},
					{
						"name": "spinner-textfield"
					},
					{
						"name": "spinner-upbutton"
					},
					{
						"name": "statusbar"
					},
					{
						"name": "statusbarpanel"
					},
					{
						"name": "tab"
					},
					{
						"name": "tabpanels"
					},
					{
						"name": "tab-scroll-arrow-back"
					},
					{
						"name": "tab-scroll-arrow-forward"
					},
					{
						"name": "textfield"
					},
					{
						"name": "textfield-multiline"
					},
					{
						"name": "toolbar"
					},
					{
						"name": "toolbox"
					},
					{
						"name": "tooltip"
					},
					{
						"name": "treeheadercell"
					},
					{
						"name": "treeheadersortarrow"
					},
					{
						"name": "treeitem"
					},
					{
						"name": "treetwistyopen"
					},
					{
						"name": "treeview"
					},
					{
						"name": "treewisty"
					},
					{
						"name": "window"
					}
				]
			},
			{
				"name": "-moz-backface-visibility",
				"desc": "Determines whether or not the 'back' side of a transformed element is visible when facing the viewer. With an identity transform, the front side of an element faces the viewer.",
				"browsers": "FF10",
				"restriction": "enum",
				"values": [
					{
						"name": "hidden"
					},
					{
						"name": "visible"
					}
				]
			},
			{
				"name": "-moz-background-clip",
				"desc": "Determines the background painting area.",
				"browsers": "FF1-3.6",
				"restriction": "box, enum",
				"values": [
					{
						"name": "padding"
					}
				]
			},
			{
				"name": "-moz-background-inline-policy",
				"desc": "In Gecko-based applications like Firefox, the -moz-background-inline-policy CSS property specifies how the background image of an inline element is determined when the content of the inline element wraps onto multiple lines. The choice of position has significant effects on repetition.",
				"browsers": "FF1",
				"restriction": "enum",
				"values": [
					{
						"name": "bounding-box"
					},
					{
						"name": "continuous"
					},
					{
						"name": "each-box"
					}
				]
			},
			{
				"name": "-moz-background-origin",
				"desc": "For elements rendered as a single box, specifies the background positioning area. For elements rendered as multiple boxes (e.g., inline boxes on several lines, boxes on several pages) specifies which boxes 'box-decoration-break' operates on to determine the background positioning area(s).",
				"browsers": "FF1",
				"restriction": "box"
			},
			{
				"name": "-moz-border-bottom-colors",
				"desc": "Sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color"
			},
			{
				"name": "-moz-border-image",
				"desc": "Shorthand property for setting 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset' and 'border-image-repeat'. Omitted values are set to their initial values.",
				"browsers": "FF3.6",
				"restriction": "length, percentage, number, url, enum",
				"values": [
					{
						"name": "auto",
						"desc": "If 'auto' is specified then the border image width is the intrinsic width or height (whichever is applicable) of the corresponding image slice. If the image does not have the required intrinsic dimension then the corresponding border-width is used instead."
					},
					{
						"name": "fill",
						"desc": "Causes the middle part of the border-image to be preserved."
					},
					{
						"name": "none"
					},
					{
						"name": "repeat"
					},
					{
						"name": "round",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the image is rescaled so that it does."
					},
					{
						"name": "space",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the extra space is distributed around the tiles."
					},
					{
						"name": "stretch",
						"desc": "The image is stretched to fill the area."
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "-moz-border-left-colors",
				"desc": "Sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color"
			},
			{
				"name": "-moz-border-right-colors",
				"desc": "Sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color"
			},
			{
				"name": "-moz-border-top-colors",
				"desc": "Ske Firefox, -moz-border-bottom-colors sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color"
			},
			{
				"name": "-moz-box-align",
				"desc": "Specifies how a XUL box aligns its contents across (perpendicular to) the direction of its layout. The effect of this is only visible if there is extra space in the box.",
				"browsers": "FF1",
				"restriction": "enum",
				"values": [
					{
						"name": "baseline",
						"desc": "If this box orientation is inline-axis or horizontal, all children are placed with their baselines aligned, and extra space placed before or after as necessary. For block flows, the baseline of the first non-empty line box located within the element is used. For tables, the baseline of the first cell is used."
					},
					{
						"name": "center",
						"desc": "Any extra space is divided evenly, with half placed above the child and the other half placed after the child."
					},
					{
						"name": "end",
						"desc": "For normal direction boxes, the bottom edge of each child is placed along the bottom of the box. Extra space is placed above the element. For reverse direction boxes, the top edge of each child is placed along the top of the box. Extra space is placed below the element."
					},
					{
						"name": "start",
						"desc": "For normal direction boxes, the top edge of each child is placed along the top of the box. Extra space is placed below the element. For reverse direction boxes, the bottom edge of each child is placed along the bottom of the box. Extra space is placed above the element."
					},
					{
						"name": "stretch",
						"desc": "The height of each child is adjusted to that of the containing block."
					}
				]
			},
			{
				"name": "-moz-box-direction",
				"desc": "Specifies whether a box lays out its contents normally (from the top or left edge), or in reverse (from the bottom or right edge).",
				"browsers": "FF1",
				"restriction": "enum",
				"values": [
					{
						"name": "normal",
						"desc": "A box with a computed value of horizontal for box-orient displays its children from left to right. A box with a computed value of vertical displays its children from top to bottom."
					},
					{
						"name": "reverse",
						"desc": "A box with a computed value of horizontal for box-orient displays its children from right to left. A box with a computed value of vertical displays its children from bottom to top."
					}
				]
			},
			{
				"name": "-moz-box-flex",
				"desc": "Specifies how a box grows to fill the box that contains it, in the direction of the containing box's layout.",
				"browsers": "FF1",
				"restriction": "number"
			},
			{
				"name": "-moz-box-flexgroup",
				"desc": "Flexible elements can be assigned to flex groups using the 'box-flex-group' property.",
				"browsers": "FF1",
				"restriction": "integer"
			},
			{
				"name": "-moz-box-ordinal-group",
				"desc": "Indicates the ordinal group the element belongs to. Elements with a lower ordinal group are displayed before those with a higher ordinal group.",
				"browsers": "FF1",
				"restriction": "integer"
			},
			{
				"name": "-moz-box-orient",
				"desc": "In Mozilla applications, -moz-box-orient specifies whether a box lays out its contents horizontally or vertically.",
				"browsers": "FF1",
				"restriction": "enum",
				"values": [
					{
						"name": "block-axis"
					},
					{
						"name": "horizontal",
						"desc": "The box displays its children from left to right in a horizontal line."
					},
					{
						"name": "inline-axis"
					},
					{
						"name": "vertical",
						"desc": "The box displays its children from stacked from top to bottom vertically."
					}
				]
			},
			{
				"name": "-moz-box-pack",
				"desc": "Specifies how a box packs its contents in the direction of its layout. The effect of this is only visible if there is extra space in the box.",
				"browsers": "FF1",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "The extra space is divided evenly, with half placed before the first child and the other half placed after the last child."
					},
					{
						"name": "end",
						"desc": "For normal direction boxes, the right edge of the last child is placed at the right side, with all extra space placed before the first child. For reverse direction boxes, the left edge of the first child is placed at the left side, with all extra space placed after the last child."
					},
					{
						"name": "justify",
						"desc": "The space is divided evenly in-between each child, with none of the extra space placed before the first child or after the last child. If there is only one child, treat the pack value as if it were start."
					},
					{
						"name": "start",
						"desc": "For normal direction boxes, the left edge of the first child is placed at the left side, with all extra space placed after the last child. For reverse direction boxes, the right edge of the last child is placed at the right side, with all extra space placed before the first child."
					}
				]
			},
			{
				"name": "-moz-box-sizing",
				"desc": "Box Model addition in CSS3.",
				"browsers": "FF1",
				"restriction": "enum",
				"values": [
					{
						"name": "border-box"
					},
					{
						"name": "content-box"
					},
					{
						"name": "padding-box"
					}
				]
			},
			{
				"name": "-moz-column-count",
				"desc": "Describes the optimal number of columns into which the content of the element will be flowed.",
				"browsers": "FF3.5",
				"restriction": "integer",
				"values": [
					{
						"name": "auto",
						"desc": "Determines the number of columns by the 'column-width' property and the element width."
					}
				]
			},
			{
				"name": "-moz-column-gap",
				"desc": "Sets the gap between columns. If there is a column rule between columns, it will appear in the middle of the gap.",
				"browsers": "FF3.5",
				"restriction": "length",
				"values": [
					{
						"name": "normal",
						"desc": "User agent specific and typically equivalent to 1em."
					}
				]
			},
			{
				"name": "-moz-column-rule",
				"desc": "Shorthand for setting 'column-rule-width', 'column-rule-style', and 'column-rule-color' at the same place in the style sheet. Omitted values are set to their initial values.",
				"browsers": "FF3.5",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "-moz-column-rule-color",
				"desc": "Sets the color of the column rule",
				"browsers": "FF3.5",
				"restriction": "color"
			},
			{
				"name": "-moz-column-rule-style",
				"desc": "Sets the style of the rule between columns of an element.",
				"browsers": "FF3.5",
				"restriction": "line-style"
			},
			{
				"name": "-moz-column-rule-width",
				"desc": "Sets the width of the rule between columns. Negative values are not allowed.",
				"browsers": "FF3.5",
				"restriction": "length, line-width"
			},
			{
				"name": "-moz-columns",
				"desc": "A shorthand property which sets both 'column-width' and 'column-count'.",
				"browsers": "FF9",
				"restriction": "length, integer",
				"values": [
					{
						"name": "auto",
						"desc": "The width depends on the values of other properties."
					}
				]
			},
			{
				"name": "-moz-column-width",
				"desc": "This property describes the width of columns in multicol elements.",
				"browsers": "FF3.5",
				"restriction": "length",
				"values": [
					{
						"name": "auto",
						"desc": "The width depends on the values of other properties."
					}
				]
			},
			{
				"name": "-moz-font-feature-settings",
				"desc": "Provides low-level control over OpenType font features. It is intended as a way of providing access to font features that are not widely used but are needed for a particular use case.",
				"browsers": "FF4",
				"restriction": "string, integer",
				"values": [
					{
						"name": "\"c2cs\""
					},
					{
						"name": "\"dlig\""
					},
					{
						"name": "\"kern\""
					},
					{
						"name": "\"liga\""
					},
					{
						"name": "\"lnum\""
					},
					{
						"name": "\"onum\""
					},
					{
						"name": "\"smcp\""
					},
					{
						"name": "\"swsh\""
					},
					{
						"name": "\"tnum\""
					},
					{
						"name": "normal",
						"desc": "No change in glyph substitution or positioning occurs."
					},
					{
						"name": "off",
						"browsers": "FF15"
					},
					{
						"name": "on",
						"browsers": "FF15"
					}
				]
			},
			{
				"name": "-moz-hyphens",
				"desc": "Controls whether hyphenation is allowed to create more break opportunities within a line of text.",
				"browsers": "FF9",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Conditional hyphenation characters inside a word, if present, take priority over automatic resources when determining hyphenation points within the word."
					},
					{
						"name": "manual"
					},
					{
						"name": "none",
						"desc": "Words are not broken at line breaks, even if characters inside the word suggest line break points."
					}
				]
			},
			{
				"name": "-moz-perspective",
				"desc": "Applies the same transform as the perspective(<number>) transform function, except that it applies only to the positioned or transformed children of the element, not to the transform on the element itself.",
				"browsers": "FF10",
				"restriction": "length",
				"values": [
					{
						"name": "none",
						"desc": "No perspective transform is applied."
					}
				]
			},
			{
				"name": "-moz-perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "FF10",
				"restriction": "position, percentage, length"
			},
			{
				"name": "-moz-text-align-last",
				"desc": "Describes how the last line of a block or a line right before a forced line break is aligned when 'text-align' is set to 'justify'.",
				"browsers": "FF12",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "center",
						"desc": "The inline contents are centered within the line box."
					},
					{
						"name": "justify",
						"desc": "The text is justified according to the method specified by the 'text-justify' property."
					},
					{
						"name": "left",
						"desc": "The inline contents are aligned to the left edge of the line box. In vertical text, 'left' aligns to the edge of the line box that would be the start edge for left-to-right text."
					},
					{
						"name": "right",
						"desc": "The inline contents are aligned to the right edge of the line box. In vertical text, 'right' aligns to the edge of the line box that would be the end edge for left-to-right text."
					}
				]
			},
			{
				"name": "-moz-text-decoration-color",
				"desc": "Specifies the color of text decoration (underlines overlines, and line-throughs) set on the element with text-decoration-line.",
				"browsers": "FF6",
				"restriction": "color"
			},
			{
				"name": "-moz-text-decoration-line",
				"desc": "Specifies what line decorations, if any, are added to the element.",
				"browsers": "FF6",
				"restriction": "enum",
				"values": [
					{
						"name": "line-through"
					},
					{
						"name": "none",
						"desc": "Neither produces nor inhibits text decoration."
					},
					{
						"name": "overline"
					},
					{
						"name": "underline"
					}
				]
			},
			{
				"name": "-moz-text-decoration-style",
				"desc": "Specifies the line style for underline, line-through and overline text decoration.",
				"browsers": "FF6",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed"
					},
					{
						"name": "dotted"
					},
					{
						"name": "double"
					},
					{
						"name": "none",
						"desc": "Produces no line."
					},
					{
						"name": "solid"
					},
					{
						"name": "wavy"
					}
				]
			},
			{
				"name": "-moz-text-size-adjust",
				"desc": "Specifies a size adjustment for displaying text content in mobile browsers.",
				"browsers": "FF",
				"restriction": "enum, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Renderers must use the default size adjustment when displaying on a small device."
					},
					{
						"name": "none",
						"desc": "Renderers must not do size adjustment when displaying on a small device."
					}
				]
			},
			{
				"name": "-moz-transform",
				"desc": "A two-dimensional transformation is applied to an element through the 'transform' property. This property contains a list of transform functions similar to those allowed by SVG.",
				"browsers": "FF3.5",
				"restriction": "enum",
				"values": [
					{
						"name": "matrix()"
					},
					{
						"name": "matrix3d()"
					},
					{
						"name": "none"
					},
					{
						"name": "perspective"
					},
					{
						"name": "rotate()"
					},
					{
						"name": "rotate3d()"
					},
					{
						"name": "rotateX('angle')"
					},
					{
						"name": "rotateY('angle')"
					},
					{
						"name": "rotateZ('angle')"
					},
					{
						"name": "scale()"
					},
					{
						"name": "scale3d()"
					},
					{
						"name": "scaleX()"
					},
					{
						"name": "scaleY()"
					},
					{
						"name": "scaleZ()"
					},
					{
						"name": "skew()"
					},
					{
						"name": "skewX()"
					},
					{
						"name": "skewY()"
					},
					{
						"name": "translate()"
					},
					{
						"name": "translate3d()"
					},
					{
						"name": "translateX()"
					},
					{
						"name": "translateY()"
					},
					{
						"name": "translateZ()"
					}
				]
			},
			{
				"name": "-moz-transform-origin",
				"desc": "Establishes the origin of transformation for an element.",
				"browsers": "FF3.5",
				"restriction": "position, length, percentage"
			},
			{
				"name": "-moz-transition",
				"desc": "Shorthand property combines four of the transition properties into a single property.",
				"browsers": "FF4",
				"restriction": "time, property, timing-function, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "-moz-transition-delay",
				"desc": "Defines when the transition will start. It allows a transition to begin execution some period of time from when it is applied.",
				"browsers": "FF4",
				"restriction": "time"
			},
			{
				"name": "-moz-transition-duration",
				"desc": "Specifies how long the transition from the old value to the new value should take.",
				"browsers": "FF4",
				"restriction": "time"
			},
			{
				"name": "-moz-transition-property",
				"desc": "Specifies the name of the CSS property to which the transition is applied.",
				"browsers": "FF4",
				"restriction": "property",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "-moz-transition-timing-function",
				"desc": "Describes how the intermediate values used during a transition will be calculated.",
				"browsers": "FF4",
				"restriction": "timing-function"
			},
			{
				"name": "-moz-user-focus",
				"desc": "Used to indicate whether the element can have focus.",
				"browsers": "FF1.5",
				"values": [
					{
						"name": "ignore"
					},
					{
						"name": "normal"
					}
				]
			},
			{
				"name": "-moz-user-select",
				"desc": "Controls the appearance of selection.",
				"browsers": "FF1.5",
				"restriction": "enum",
				"values": [
					{
						"name": "all"
					},
					{
						"name": "element"
					},
					{
						"name": "elements"
					},
					{
						"name": "-moz-all"
					},
					{
						"name": "-moz-none"
					},
					{
						"name": "none"
					},
					{
						"name": "text"
					},
					{
						"name": "toggle"
					}
				]
			},
			{
				"name": "-ms-accelerator",
				"desc": "IE only. Has the ability to turn off its system underlines for accelerator keys until the ALT key is pressed",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "false"
					},
					{
						"name": "true"
					}
				]
			},
			{
				"name": "-ms-behavior",
				"desc": "IE only. Used to extend behaviors of the browser",
				"browsers": "IE8",
				"restriction": "url"
			},
			{
				"name": "-ms-block-progression",
				"desc": "Sets the block-progression value and the flow orientation",
				"browsers": "IE8",
				"restriction": "enum",
				"values": [
					{
						"name": "bt"
					},
					{
						"name": "lr"
					},
					{
						"name": "rl"
					},
					{
						"name": "tb"
					}
				]
			},
			{
				"name": "-ms-content-zoom-chaining",
				"desc": "Specifies the zoom behavior that occurs when a user hits the zoom limit during a manipulation.",
				"browsers": "E,IE10",
				"values": [
					{
						"name": "chained",
						"desc": "The nearest zoomable parent element begins zooming when the user hits a zoom limit during a manipulation. No bounce effect is shown."
					},
					{
						"name": "none",
						"desc": "A bounce effect is shown when the user hits a zoom limit during a manipulation."
					}
				]
			},
			{
				"name": "-ms-content-zooming",
				"desc": "Specifies whether zooming is enabled.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "none",
						"desc": "The element is not zoomable."
					},
					{
						"name": "zoom"
					}
				]
			},
			{
				"name": "-ms-content-zoom-limit",
				"desc": "Shorthand property for the -ms-content-zoom-limit-min and -ms-content-zoom-limit-max properties.",
				"browsers": "E,IE10",
				"restriction": "percentage"
			},
			{
				"name": "-ms-content-zoom-limit-max",
				"desc": "Specifies the maximum zoom factor.",
				"browsers": "E,IE10",
				"restriction": "percentage"
			},
			{
				"name": "-ms-content-zoom-limit-min",
				"desc": "Specifies the minimum zoom factor.",
				"browsers": "E,IE10",
				"restriction": "percentage"
			},
			{
				"name": "-ms-content-zoom-snap",
				"desc": "Shorthand property for the -ms-content-zoom-snap-type and -ms-content-zoom-snap-points properties.",
				"browsers": "E,IE10",
				"values": [
					{
						"name": "mandatory",
						"desc": "Indicates that the motion of the content after the contact is picked up is always adjusted so that it lands on a snap-point."
					},
					{
						"name": "none",
						"desc": "Indicates that zooming is unaffected by any defined snap-points."
					},
					{
						"name": "proximity",
						"desc": "Indicates that the motion of the content after the contact is picked up may be adjusted if the content would normally stop \"close enough\" to a snap-point."
					},
					{
						"name": "snapInterval(100%, 100%)",
						"desc": "Specifies where the snap-points will be placed."
					},
					{
						"name": "snapList()",
						"desc": "Specifies the position of individual snap-points as a comma-separated list of zoom factors."
					}
				]
			},
			{
				"name": "-ms-content-zoom-snap-points",
				"desc": "Defines where zoom snap-points are located.",
				"browsers": "E,IE10",
				"values": [
					{
						"name": "snapInterval(100%, 100%)",
						"desc": "Specifies where the snap-points will be placed."
					},
					{
						"name": "snapList()",
						"desc": "Specifies the position of individual snap-points as a comma-separated list of zoom factors."
					}
				]
			},
			{
				"name": "-ms-content-zoom-snap-type",
				"desc": "Specifies how zooming is affected by defined snap-points.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "mandatory",
						"desc": "Indicates that the motion of the content after the contact is picked up is always adjusted so that it lands on a snap-point."
					},
					{
						"name": "none",
						"desc": "Indicates that zooming is unaffected by any defined snap-points."
					},
					{
						"name": "proximity",
						"desc": "Indicates that the motion of the content after the contact is picked up may be adjusted if the content would normally stop \"close enough\" to a snap-point."
					}
				]
			},
			{
				"name": "-ms-filter",
				"desc": "IE only. Used to produce visual effects.",
				"browsers": "IE8-9",
				"restriction": "string"
			},
			{
				"name": "-ms-flex",
				"desc": "specifies the parameters of a flexible length: the positive and negative flexibility, and the preferred size.",
				"browsers": "IE10",
				"restriction": "length, number, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Retrieves the value of the main size property as the used 'flex-basis'."
					},
					{
						"name": "none",
						"desc": "Expands to '0 0 auto'."
					}
				]
			},
			{
				"name": "-ms-flex-align",
				"desc": "Aligns flex items along the cross axis of the current line of the flex container.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "baseline",
						"desc": "If the flex item’s inline axis is the same as the cross axis, this value is identical to 'flex-start'. Otherwise, it participates in baseline alignment."
					},
					{
						"name": "center",
						"desc": "The flex item’s margin box is centered in the cross axis within the line."
					},
					{
						"name": "end",
						"desc": "The cross-end margin edge of the flex item is placed flush with the cross-end edge of the line."
					},
					{
						"name": "start",
						"desc": "The cross-start margin edge of the flexbox item is placed flush with the cross-start edge of the line."
					},
					{
						"name": "stretch",
						"desc": "If the cross size property of the flexbox item is anything other than 'auto', this value is identical to 'start'."
					}
				]
			},
			{
				"name": "-ms-flex-direction",
				"desc": "Specifies how flex items are placed in the flex container, by setting the direction of the flex container’s main axis.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "column",
						"desc": "The flex container’s main axis has the same orientation as the block axis of the current writing mode."
					},
					{
						"name": "column-reverse"
					},
					{
						"name": "row"
					},
					{
						"name": "row-reverse"
					}
				]
			},
			{
				"name": "-ms-flex-flow",
				"desc": "Specifies how flexbox items are placed in the flexbox.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "column",
						"desc": "The flex container’s main axis has the same orientation as the block axis of the current writing mode."
					},
					{
						"name": "column-reverse"
					},
					{
						"name": "nowrap",
						"desc": "The flex container is single-line."
					},
					{
						"name": "row"
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line."
					},
					{
						"name": "wrap-reverse"
					}
				]
			},
			{
				"name": "-ms-flex-item-align",
				"desc": "Allows the default alignment along the cross axis to be overridden for individual flex items.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Computes to the value of 'align-items' on the element’s parent, or 'stretch' if the element has no parent. On absolutely positioned elements, it computes to itself."
					},
					{
						"name": "baseline",
						"desc": "If the flex item’s inline axis is the same as the cross axis, this value is identical to 'flex-start'. Otherwise, it participates in baseline alignment."
					},
					{
						"name": "center",
						"desc": "The flex item’s margin box is centered in the cross axis within the line."
					},
					{
						"name": "end",
						"desc": "The cross-end margin edge of the flex item is placed flush with the cross-end edge of the line."
					},
					{
						"name": "start",
						"desc": "The cross-start margin edge of the flex item is placed flush with the cross-start edge of the line."
					},
					{
						"name": "stretch",
						"desc": "If the cross size property of the flex item computes to auto, and neither of the cross-axis margins are auto, the flex item is stretched."
					}
				]
			},
			{
				"name": "-ms-flex-line-pack",
				"desc": "Aligns a flex container’s lines within the flex container when there is extra space in the cross-axis, similar to how 'justify-content' aligns individual items within the main-axis.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "Lines are packed toward the center of the flex container."
					},
					{
						"name": "distribute",
						"desc": "Lines are evenly distributed in the flex container, with half-size spaces on either end."
					},
					{
						"name": "end",
						"desc": "Lines are packed toward the end of the flex container."
					},
					{
						"name": "justify",
						"desc": "Lines are evenly distributed in the flex container."
					},
					{
						"name": "start",
						"desc": "Lines are packed toward the start of the flex container."
					},
					{
						"name": "stretch",
						"desc": "Lines stretch to take up the remaining space."
					}
				]
			},
			{
				"name": "-ms-flex-order",
				"desc": "Controls the order in which children of a flex container appear within the flex container, by assigning them to ordinal groups.",
				"browsers": "IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-flex-pack",
				"desc": "Aligns flex items along the main axis of the current line of the flex container.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "Flex items are packed toward the center of the line."
					},
					{
						"name": "distribute",
						"desc": "Flex items are evenly distributed in the line, with half-size spaces on either end."
					},
					{
						"name": "end",
						"desc": "Flex items are packed toward the end of the line."
					},
					{
						"name": "justify",
						"desc": "Flex items are evenly distributed in the line."
					},
					{
						"name": "start",
						"desc": "Flex items are packed toward the start of the line."
					}
				]
			},
			{
				"name": "-ms-flex-wrap",
				"desc": "Controls whether the flex container is single-line or multi-line, and the direction of the cross-axis, which determines the direction new lines are stacked in.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "nowrap",
						"desc": "The flex container is single-line."
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line."
					},
					{
						"name": "wrap-reverse"
					}
				]
			},
			{
				"name": "-ms-flow-from",
				"desc": "Makes a block container a region and associates it with a named flow.",
				"browsers": "E,IE10",
				"restriction": "identifier",
				"values": [
					{
						"name": "none",
						"desc": "The block container is not a CSS Region."
					}
				]
			},
			{
				"name": "-ms-flow-into",
				"desc": "Places an element or its contents into a named flow.",
				"browsers": "E,IE10",
				"restriction": "identifier",
				"values": [
					{
						"name": "none",
						"desc": "The element is not moved to a named flow and normal CSS processing takes place."
					}
				]
			},
			{
				"name": "-ms-grid-column",
				"desc": "Used to place grid items and explicitly defined grid cells in the Grid.",
				"browsers": "E,IE10",
				"restriction": "integer, string, enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "end"
					},
					{
						"name": "start"
					}
				]
			},
			{
				"name": "-ms-grid-column-align",
				"desc": "Aligns the columns in a grid.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "Places the center of the Grid Item's margin box at the center of the Grid Item's column."
					},
					{
						"name": "end",
						"desc": "Aligns the end edge of the Grid Item's margin box to the end edge of the Grid Item's column."
					},
					{
						"name": "start",
						"desc": "Aligns the starting edge of the Grid Item's margin box to the starting edge of the Grid Item's column."
					},
					{
						"name": "stretch",
						"desc": "Ensures that the Grid Item's margin box is equal to the size of the Grid Item's column."
					}
				]
			},
			{
				"name": "-ms-grid-columns",
				"desc": "Lays out the columns of the grid.",
				"browsers": "E,IE10"
			},
			{
				"name": "-ms-grid-column-span",
				"desc": "Specifies the number of columns to span.",
				"browsers": "E,IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-grid-layer",
				"desc": "Grid-layer is similar in concept to z-index, but avoids overloading the meaning of the z-index property, which is applicable only to positioned elements.",
				"browsers": "E,IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-grid-row",
				"desc": "grid-row is used to place grid items and explicitly defined grid cells in the Grid.",
				"browsers": "E,IE10",
				"restriction": "integer, string, enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "end"
					},
					{
						"name": "start"
					}
				]
			},
			{
				"name": "-ms-grid-row-align",
				"desc": "Aligns the rows in a grid.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "Places the center of the Grid Item's margin box at the center of the Grid Item's row."
					},
					{
						"name": "end",
						"desc": "Aligns the end edge of the Grid Item's margin box to the end edge of the Grid Item's row."
					},
					{
						"name": "start",
						"desc": "Aligns the starting edge of the Grid Item's margin box to the starting edge of the Grid Item's row."
					},
					{
						"name": "stretch",
						"desc": "Ensures that the Grid Item's margin box is equal to the size of the Grid Item's row."
					}
				]
			},
			{
				"name": "-ms-grid-rows",
				"desc": "Lays out the columns of the grid.",
				"browsers": "E,IE10"
			},
			{
				"name": "-ms-grid-row-span",
				"desc": "Specifies the number of rows to span.",
				"browsers": "E,IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-high-contrast-adjust",
				"desc": "Specifies if properties should be adjusted in high contrast mode.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Properties will be adjusted as applicable."
					},
					{
						"name": "none",
						"desc": "No adjustments will be applied."
					}
				]
			},
			{
				"name": "-ms-hyphenate-limit-chars",
				"desc": "Specifies the minimum number of characters in a hyphenated word.",
				"browsers": "E,IE10",
				"restriction": "integer",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent chooses a value that adapts to the current layout."
					}
				]
			},
			{
				"name": "-ms-hyphenate-limit-lines",
				"desc": "Indicates the maximum number of successive hyphenated lines in an element.",
				"browsers": "E,IE10",
				"restriction": "integer",
				"values": [
					{
						"name": "no-limit"
					}
				]
			},
			{
				"name": "-ms-hyphenate-limit-zone",
				"desc": "Specifies the maximum amount of unfilled space (before justification) that may be left in the line box before hyphenation is triggered to pull part of a word from the next line back up into the current line.",
				"browsers": "E,IE10",
				"restriction": "percentage, length"
			},
			{
				"name": "-ms-hyphens",
				"desc": "Controls whether hyphenation is allowed to create more break opportunities within a line of text.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Conditional hyphenation characters inside a word, if present, take priority over automatic resources when determining hyphenation points within the word."
					},
					{
						"name": "manual"
					},
					{
						"name": "none",
						"desc": "Words are not broken at line breaks, even if characters inside the word suggest line break points."
					}
				]
			},
			{
				"name": "-ms-ime-mode",
				"desc": "Controls the state of the input method editor for text fields.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "active"
					},
					{
						"name": "auto",
						"desc": "No change is made to the current input method editor state. This is the default."
					},
					{
						"name": "disabled"
					},
					{
						"name": "inactive"
					},
					{
						"name": "normal",
						"desc": "The IME state should be normal; this value can be used in a user style sheet to override the page setting."
					}
				]
			},
			{
				"name": "-ms-interpolation-mode",
				"desc": "Gets or sets the interpolation (resampling) method used to stretch images.",
				"browsers": "IE7",
				"restriction": "enum",
				"values": [
					{
						"name": "bicubic"
					},
					{
						"name": "nearest-neighbor"
					}
				]
			},
			{
				"name": "-ms-layout-grid",
				"desc": "Sets or retrieves the composite document grid properties that specify the layout of text characters.",
				"browsers": "E,IE10",
				"values": [
					{
						"name": "char",
						"desc": "Any of the range of character values available to the -ms-layout-grid-char property."
					},
					{
						"name": "line",
						"desc": "Any of the range of line values available to the -ms-layout-grid-line property."
					},
					{
						"name": "mode"
					},
					{
						"name": "type"
					}
				]
			},
			{
				"name": "-ms-layout-grid-char",
				"desc": "Sets or retrieves the size of the character grid used for rendering the text content of an element.",
				"browsers": "E,IE10",
				"restriction": "enum, length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Largest character in the font of the element is used to set the character grid."
					},
					{
						"name": "none",
						"desc": "Default. No character grid is set."
					}
				]
			},
			{
				"name": "-ms-layout-grid-line",
				"desc": "Sets or retrieves the gridline value used for rendering the text content of an element.",
				"browsers": "E,IE10",
				"restriction": "length",
				"values": [
					{
						"name": "auto",
						"desc": "Largest character in the font of the element is used to set the character grid."
					},
					{
						"name": "none",
						"desc": "Default. No grid line is set."
					}
				]
			},
			{
				"name": "-ms-layout-grid-mode",
				"desc": "Gets or sets whether the text layout grid uses two dimensions.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "both",
						"desc": "Default. Both the char and line grid modes are enabled. This setting is necessary to fully enable the layout grid on an element."
					},
					{
						"name": "char",
						"desc": "Only a character grid is used. This is recommended for use with block-level elements, such as a blockquote, where the line grid is intended to be disabled."
					},
					{
						"name": "line",
						"desc": "Only a line grid is used. This is recommended for use with inline elements, such as a span, to disable the horizontal grid on runs of text that act as a single entity in the grid layout."
					},
					{
						"name": "none",
						"desc": "No grid is used."
					}
				]
			},
			{
				"name": "-ms-layout-grid-type",
				"desc": "Sets or retrieves the type of grid used for rendering the text content of an element.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "fixed",
						"desc": "Grid used for monospaced layout. All noncursive characters are treated as equal; every character is centered within a single grid space by default."
					},
					{
						"name": "loose"
					},
					{
						"name": "strict",
						"desc": "Grid used for Chinese, as well as Japanese (Genko) and Korean characters. Only the ideographs, kanas, and wide characters are snapped to the grid."
					}
				]
			},
			{
				"name": "-ms-line-break",
				"desc": "Specifies what set of line breaking restrictions are in effect within the element.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The UA determines the set of line-breaking restrictions to use for CJK scripts, and it may vary the restrictions based on the length of the line; e.g., use a less restrictive set of line-break rules for short lines."
					},
					{
						"name": "keep-all",
						"desc": "Sequences of CJK characters can no longer break on implied break points. This option should only be used where the presence of word separator characters still creates line-breaking opportunities, as in Korean."
					},
					{
						"name": "newspaper",
						"desc": "Breaks CJK scripts using the least restrictive set of line-breaking rules. Typically used for short lines, such as in newspapers."
					},
					{
						"name": "normal",
						"desc": "Breaks CJK scripts using a normal set of line-breaking rules."
					},
					{
						"name": "strict",
						"desc": "Breaks CJK scripts using a more restrictive set of line-breaking rules than 'normal'."
					}
				]
			},
			{
				"name": "-ms-overflow-style",
				"desc": "Specify whether content is clipped when it overflows the element's content area.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "No preference, UA should use the first scrolling method in the list that it supports."
					},
					{
						"name": "-ms-autohiding-scrollbar"
					},
					{
						"name": "none",
						"desc": "Indicates the element does not display scrollbars or panning indicators, even when its content overflows."
					},
					{
						"name": "scrollbar"
					}
				]
			},
			{
				"name": "-ms-perspective",
				"desc": "Applies the same transform as the perspective(<number>) transform function, except that it applies only to the positioned or transformed children of the element, not to the transform on the element itself.",
				"browsers": "IE10",
				"restriction": "length",
				"values": [
					{
						"name": "none",
						"desc": "No perspective transform is applied."
					}
				]
			},
			{
				"name": "-ms-perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "IE10",
				"restriction": "position, percentage, length"
			},
			{
				"name": "-ms-perspective-origin-x",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X  position at which the viewer appears to be looking at the children of the element.",
				"browsers": "IE10",
				"restriction": "position, percentage, length"
			},
			{
				"name": "-ms-perspective-origin-y",
				"desc": "Establishes the origin for the perspective property. It effectively sets the Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "IE10",
				"restriction": "position, percentage, length"
			},
			{
				"name": "-ms-progress-appearance",
				"desc": "Gets or sets a value that specifies whether a progress control displays as a bar or a ring.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "bar"
					},
					{
						"name": "ring"
					}
				]
			},
			{
				"name": "-ms-scrollbar-3dlight-color",
				"desc": "Determines the color of the top and left edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scrollbar-arrow-color",
				"desc": "Determines the color of the arrow elements of a scroll arrow.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scrollbar-base-color",
				"desc": "Determines the color of the main elements of a scroll bar, which include the scroll box, track, and scroll arrows.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scrollbar-darkshadow-color",
				"desc": "Determines the color of the gutter of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scrollbar-face-color",
				"desc": "Determines the color of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scrollbar-highlight-color",
				"desc": "Determines the color of the top and left edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scrollbar-shadow-color",
				"desc": "Determines the color of the bottom and right edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scrollbar-track-color",
				"desc": "Determines the color of the track element of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color"
			},
			{
				"name": "-ms-scroll-chaining",
				"desc": "Gets or sets a value that indicates the scrolling behavior that occurs when a user hits the content boundary during a manipulation.",
				"browsers": "E,IE10",
				"restriction": "enum, length",
				"values": [
					{
						"name": "chained"
					},
					{
						"name": "none"
					}
				]
			},
			{
				"name": "-ms-scroll-limit",
				"desc": "Gets or sets a shorthand value that sets values for the -ms-scroll-limit-x-min, -ms-scroll-limit-y-min, -ms-scroll-limit-x-max, and -ms-scroll-limit-y-max properties.",
				"browsers": "E,IE10",
				"restriction": "length",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "-ms-scroll-limit-x-max",
				"desc": "Gets or sets a value that specifies the maximum value for the scrollLeft property.",
				"browsers": "E,IE10",
				"restriction": "length",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "-ms-scroll-limit-x-min",
				"desc": "Gets or sets a value that specifies the minimum value for the scrollLeft property.",
				"browsers": "E,IE10",
				"restriction": "length"
			},
			{
				"name": "-ms-scroll-limit-y-max",
				"desc": "Gets or sets a value that specifies the maximum value for the scrollTop property.",
				"browsers": "E,IE10",
				"restriction": "length",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "-ms-scroll-limit-y-min",
				"desc": "Gets or sets a value that specifies the minimum value for the scrollTop property.",
				"browsers": "E,IE10",
				"restriction": "length"
			},
			{
				"name": "-ms-scroll-rails",
				"desc": "Gets or sets a value that indicates whether or not small motions perpendicular to the primary axis of motion will result in either changes to both the scrollTop and scrollLeft properties or a change to the primary axis (for instance, either the scrollTop or scrollLeft properties will change, but not both).",
				"browsers": "E,IE10",
				"restriction": "enum, length",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "railed"
					}
				]
			},
			{
				"name": "-ms-scroll-snap-points-x",
				"desc": "Gets or sets a value that defines where snap-points will be located along the x-axis.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "snapInterval(100%, 100%)"
					},
					{
						"name": "snapList()"
					}
				]
			},
			{
				"name": "-ms-scroll-snap-points-y",
				"desc": "Gets or sets a value that defines where snap-points will be located along the y-axis.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "snapInterval(100%, 100%)"
					},
					{
						"name": "snapList()"
					}
				]
			},
			{
				"name": "-ms-scroll-snap-type",
				"desc": "Gets or sets a value that defines what type of snap-point should be used for the current element. There are two type of snap-points, with the primary difference being whether or not the user is guaranteed to always stop on a snap-point.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "none",
						"desc": "The visual viewport of this scroll container must ignore snap points, if any, when scrolled."
					},
					{
						"name": "mandatory",
						"desc": "The visual viewport of this scroll container is guaranteed to rest on a snap point when there are no active scrolling operations."
					},
					{
						"name": "proximity",
						"desc": "The visual viewport of this scroll container may come to rest on a snap point at the termination of a scroll at the discretion of the UA given the parameters of the scroll."
					}
				]
			},
			{
				"name": "-ms-scroll-snap-x",
				"desc": "Gets or sets a shorthand value that sets values for the -ms-scroll-snap-type and -ms-scroll-snap-points-x properties.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "mandatory"
					},
					{
						"name": "none"
					},
					{
						"name": "proximity"
					},
					{
						"name": "snapInterval(100%, 100%)"
					},
					{
						"name": "snapList()"
					}
				]
			},
			{
				"name": "-ms-scroll-snap-y",
				"desc": "Gets or sets a shorthand value that sets values for the -ms-scroll-snap-type and -ms-scroll-snap-points-y properties.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "mandatory"
					},
					{
						"name": "none"
					},
					{
						"name": "proximity"
					},
					{
						"name": "snapInterval(100%, 100%)"
					},
					{
						"name": "snapList()"
					}
				]
			},
			{
				"name": "-ms-scroll-translation",
				"desc": "Gets or sets a value that specifies whether vertical-to-horizontal scroll wheel translation occurs on the specified element.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "vertical-to-horizontal"
					}
				]
			},
			{
				"name": "-ms-text-align-last",
				"desc": "Describes how the last line of a block or a line right before a forced line break is aligned when 'text-align' is set to 'justify'.",
				"browsers": "E,IE8",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "center",
						"desc": "The inline contents are centered within the line box."
					},
					{
						"name": "justify",
						"desc": "The text is justified according to the method specified by the 'text-justify' property."
					},
					{
						"name": "left",
						"desc": "The inline contents are aligned to the left edge of the line box. In vertical text, 'left' aligns to the edge of the line box that would be the start edge for left-to-right text."
					},
					{
						"name": "right",
						"desc": "The inline contents are aligned to the right edge of the line box. In vertical text, 'right' aligns to the edge of the line box that would be the end edge for left-to-right text."
					}
				]
			},
			{
				"name": "-ms-text-autospace",
				"desc": "Determines whether or not a full-width punctuation mark character should be trimmed if it appears at the beginning of a line, so that its 'ink' lines up with the first glyph in the line above and below.",
				"browsers": "E,IE8",
				"restriction": "enum",
				"values": [
					{
						"name": "ideograph-alpha"
					},
					{
						"name": "ideograph-numeric"
					},
					{
						"name": "ideograph-parenthesis"
					},
					{
						"name": "ideograph-space"
					},
					{
						"name": "none",
						"desc": "No extra space is created."
					},
					{
						"name": "punctuation"
					}
				]
			},
			{
				"name": "-ms-text-combine-horizontal",
				"desc": "This property specifies the combination of multiple characters into the space of a single character.",
				"browsers": "E,IE11",
				"restriction": "enum, integer",
				"values": [
					{
						"name": "all",
						"desc": "Attempt to typeset horizontally all consecutive characters within the box such that they take up the space of a single character within the vertical line box."
					},
					{
						"name": "digits"
					},
					{
						"name": "none",
						"desc": "No special processing."
					}
				]
			},
			{
				"name": "-ms-text-justify",
				"desc": "Selects the justification algorithm used when 'text-align' is set to 'justify'. The property applies to block containers, but the UA may (but is not required to) also support it on inline elements.",
				"browsers": "E,IE8",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The UA determines the justification algorithm to follow, based on a balance between performance and adequate presentation quality."
					},
					{
						"name": "distribute",
						"desc": "Justification primarily changes spacing both at word separators and at grapheme cluster boundaries in all scripts except those in the connected and cursive groups. This value is sometimes used in e.g. Japanese, often with the 'text-align-last' property."
					},
					{
						"name": "inter-cluster"
					},
					{
						"name": "inter-ideograph"
					},
					{
						"name": "inter-word"
					},
					{
						"name": "kashida"
					}
				]
			},
			{
				"name": "-ms-text-kashida-space",
				"desc": "Sets or retrieves the ratio of kashida expansion to white space expansion when justifying lines of text in the object.",
				"browsers": "E,IE10",
				"restriction": "percentage"
			},
			{
				"name": "-ms-text-overflow",
				"desc": "Text can overflow for example when it is prevented from wrapping",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "clip"
					},
					{
						"name": "ellipsis"
					}
				]
			},
			{
				"name": "-ms-text-size-adjust",
				"desc": "Specifies a size adjustment for displaying text content in mobile browsers.",
				"browsers": "E,IE10",
				"restriction": "enum, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Renderers must use the default size adjustment when displaying on a small device."
					},
					{
						"name": "none",
						"desc": "Renderers must not do size adjustment when displaying on a small device."
					}
				]
			},
			{
				"name": "-ms-text-underline-position",
				"desc": "Sets the position of an underline specified on the same element: it does not affect underlines specified by ancestor elements.This property is typically used in vertical writing contexts such as in Japanese documents where it often desired to have the underline appear 'over' (to the right of) the affected run of text",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "alphabetic",
						"desc": "The underline is aligned with the alphabetic baseline. In this case the underline is likely to cross some descenders."
					},
					{
						"name": "auto",
						"desc": "The user agent may use any algorithm to determine the underline's position. In horizontal line layout, the underline should be aligned as for alphabetic. In vertical line layout, if the language is set to Japanese or Korean, the underline should be aligned as for over."
					},
					{
						"name": "over"
					},
					{
						"name": "under"
					}
				]
			},
			{
				"name": "-ms-touch-action",
				"desc": "Gets or sets a value that indicates whether and how a given region can be manipulated by the user.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The element is a passive element, with several exceptions."
					},
					{
						"name": "double-tap-zoom",
						"desc": "The element will zoom on double-tap."
					},
					{
						"name": "manipulation",
						"desc": "The element is a manipulation-causing element."
					},
					{
						"name": "none",
						"desc": "The element is a manipulation-blocking element."
					},
					{
						"name": "pan-x",
						"desc": "The element permits touch-driven panning on the horizontal axis. The touch pan is performed on the nearest ancestor with horizontally scrollable content."
					},
					{
						"name": "pan-y",
						"desc": "The element permits touch-driven panning on the vertical axis. The touch pan is performed on the nearest ancestor with vertically scrollable content."
					},
					{
						"name": "pinch-zoom",
						"desc": "The element permits pinch-zooming. The pinch-zoom is performed on the nearest ancestor with zoomable content."
					}
				]
			},
			{
				"name": "-ms-touch-select",
				"desc": "Gets or sets a value that toggles the 'gripper' visual elements that enable touch text selection.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "grippers"
					},
					{
						"name": "none",
						"desc": "Grippers are always off."
					}
				]
			},
			{
				"name": "-ms-transform",
				"desc": "A two-dimensional transformation is applied to an element through the 'transform' property. This property contains a list of transform functions similar to those allowed by SVG.",
				"browsers": "IE9-9",
				"restriction": "enum",
				"values": [
					{
						"name": "matrix()"
					},
					{
						"name": "matrix3d()"
					},
					{
						"name": "none"
					},
					{
						"name": "rotate()"
					},
					{
						"name": "rotate3d()"
					},
					{
						"name": "rotateX('angle')"
					},
					{
						"name": "rotateY('angle')"
					},
					{
						"name": "rotateZ('angle')"
					},
					{
						"name": "scale()"
					},
					{
						"name": "scale3d()"
					},
					{
						"name": "scaleX()"
					},
					{
						"name": "scaleY()"
					},
					{
						"name": "scaleZ()"
					},
					{
						"name": "skew()"
					},
					{
						"name": "skewX()"
					},
					{
						"name": "skewY()"
					},
					{
						"name": "translate()"
					},
					{
						"name": "translate3d()"
					},
					{
						"name": "translateX()"
					},
					{
						"name": "translateY()"
					},
					{
						"name": "translateZ()"
					}
				]
			},
			{
				"name": "-ms-transform-origin",
				"desc": "Establishes the origin of transformation for an element.",
				"browsers": "IE9-9",
				"restriction": "position, length, percentage"
			},
			{
				"name": "-ms-transform-origin-x",
				"desc": "The x coordinate of the origin for transforms applied to an element with respect to its border box.",
				"browsers": "IE10",
				"restriction": "length, percentage"
			},
			{
				"name": "-ms-transform-origin-y",
				"desc": "The y coordinate of the origin for transforms applied to an element with respect to its border box.",
				"browsers": "IE10",
				"restriction": "length, percentage"
			},
			{
				"name": "-ms-transform-origin-z",
				"desc": "The z coordinate of the origin for transforms applied to an element with respect to its border box.",
				"browsers": "IE10",
				"restriction": "length, percentage"
			},
			{
				"name": "-ms-user-select",
				"desc": "Controls the appearance of selection.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "element"
					},
					{
						"name": "none"
					},
					{
						"name": "text"
					}
				]
			},
			{
				"name": "-ms-word-break",
				"desc": "Specifies line break opportunities for non-CJK scripts.",
				"browsers": "IE8",
				"restriction": "enum",
				"values": [
					{
						"name": "break-all"
					},
					{
						"name": "keep-all",
						"desc": "Block characters can no longer create implied break points."
					},
					{
						"name": "normal",
						"desc": "Breaks non-CJK scripts according to their own rules."
					}
				]
			},
			{
				"name": "-ms-word-wrap",
				"desc": "Specifies whether the UA may break within a word to prevent overflow when an otherwise-unbreakable string is too long to fit.",
				"browsers": "IE8",
				"restriction": "enum",
				"values": [
					{
						"name": "break-word",
						"desc": "An unbreakable 'word' may be broken at an arbitrary point if there are no otherwise-acceptable break points in the line."
					},
					{
						"name": "normal",
						"desc": "Lines may break only at allowed break points."
					}
				]
			},
			{
				"name": "-ms-wrap-flow",
				"desc": "An element becomes an exclusion when its 'wrap-flow' property has a computed value other than 'auto'.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "For floats an exclusion is created, for all other elements an exclusion is not created."
					},
					{
						"name": "both",
						"desc": "Inline flow content can flow on all sides of the exclusion."
					},
					{
						"name": "clear"
					},
					{
						"name": "end",
						"desc": "Inline flow content can wrap on the end side of the exclusion area but must leave the area to the start edge of the exclusion area empty."
					},
					{
						"name": "maximum"
					},
					{
						"name": "minimum"
					},
					{
						"name": "start",
						"desc": "Inline flow content can wrap on the start edge of the exclusion area but must leave the area to end edge of the exclusion area empty."
					}
				]
			},
			{
				"name": "-ms-wrap-margin",
				"desc": "Gets or sets a value that is used to offset the inner wrap shape from other shapes.",
				"browsers": "E,IE10",
				"restriction": "length, percentage"
			},
			{
				"name": "-ms-wrap-through",
				"desc": "Specifies if an element inherits its parent wrapping context. In other words if it is subject to the exclusions defined outside the element.",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "none",
						"desc": "The exclusion element does not inherit its parent node's wrapping context. Its descendants are only subject to exclusion shapes defined inside the element."
					},
					{
						"name": "wrap",
						"desc": "The exclusion element inherits its parent node's wrapping context. Its descendant inline content wraps around exclusions defined outside the element."
					}
				]
			},
			{
				"name": "-ms-writing-mode",
				"desc": "Shorthand property for both 'direction' and 'block-progression'.",
				"browsers": "IE8",
				"restriction": "enum",
				"values": [
					{
						"name": "bt-lr"
					},
					{
						"name": "bt-rl"
					},
					{
						"name": "lr-bt"
					},
					{
						"name": "lr-tb"
					},
					{
						"name": "rl-bt"
					},
					{
						"name": "rl-tb"
					},
					{
						"name": "tb-lr"
					},
					{
						"name": "tb-rl"
					}
				]
			},
			{
				"name": "-ms-zoom",
				"desc": "Sets or retrieves the magnification scale of the object.",
				"browsers": "IE8",
				"restriction": "enum, integer, number, percentage",
				"values": [
					{
						"name": "normal"
					}
				]
			},
			{
				"name": "-ms-zoom-animation",
				"desc": "Gets or sets a value that indicates whether an animation is used when zooming.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "default"
					},
					{
						"name": "none"
					}
				]
			},
			{
				"name": "nav-down",
				"desc": "Provides an way to control directional focus navigation.",
				"browsers": "O9.5",
				"restriction": "enum, identifier, string",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent automatically determines which element to navigate the focus to in response to directional navigational input."
					},
					{
						"name": "current"
					},
					{
						"name": "root"
					}
				]
			},
			{
				"name": "nav-index",
				"desc": "Provides an input-method-neutral way of specifying the sequential navigation order (also known as 'tabbing order').",
				"browsers": "O9.5",
				"restriction": "number",
				"values": [
					{
						"name": "auto",
						"desc": "The element's sequential navigation order is assigned automatically by the user agent."
					}
				]
			},
			{
				"name": "nav-left",
				"desc": "Provides an way to control directional focus navigation.",
				"browsers": "O9.5",
				"restriction": "enum, identifier, string",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent automatically determines which element to navigate the focus to in response to directional navigational input."
					},
					{
						"name": "current"
					},
					{
						"name": "root"
					}
				]
			},
			{
				"name": "nav-right",
				"desc": "Provides an way to control directional focus navigation.",
				"browsers": "O9.5",
				"restriction": "enum, identifier, string",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent automatically determines which element to navigate the focus to in response to directional navigational input."
					},
					{
						"name": "current"
					},
					{
						"name": "root"
					}
				]
			},
			{
				"name": "nav-up",
				"desc": "Provides an way to control directional focus navigation.",
				"browsers": "O9.5",
				"restriction": "enum, identifier, string",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent automatically determines which element to navigate the focus to in response to directional navigational input."
					},
					{
						"name": "current"
					},
					{
						"name": "root"
					}
				]
			},
			{
				"name": "negative",
				"desc": "@counter-style descriptor. Defines how to alter the representation when the counter value is negative.",
				"browsers": "FF33",
				"restriction": "image, identifier, string"
			},
			{
				"name": "-o-animation",
				"desc": "Shorthand property combines six of the animation properties into a single property.",
				"browsers": "O12",
				"restriction": "time, enum, timing-function, identifier, number",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "backwards"
					},
					{
						"name": "both",
						"desc": "Both forwards and backwards fill modes are applied."
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					},
					{
						"name": "none",
						"desc": "No animation is performed"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "-o-animation-delay",
				"desc": "Defines when the animation will start.",
				"browsers": "O12",
				"restriction": "time"
			},
			{
				"name": "-o-animation-direction",
				"desc": "Defines whether or not the animation should play in reverse on alternate cycles.",
				"browsers": "O12",
				"restriction": "enum",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "-o-animation-duration",
				"desc": "Defines the length of time that an animation takes to complete one cycle.",
				"browsers": "O12",
				"restriction": "time"
			},
			{
				"name": "-o-animation-fill-mode",
				"desc": "Defines what values are applied by the animation outside the time it is executing.",
				"browsers": "O12",
				"restriction": "enum",
				"values": [
					{
						"name": "backwards"
					},
					{
						"name": "both",
						"desc": "Both forwards and backwards fill modes are applied."
					},
					{
						"name": "forwards"
					},
					{
						"name": "none",
						"desc": "There is no change to the property value between the time the animation is applied and the time the animation begins playing or after the animation completes."
					}
				]
			},
			{
				"name": "-o-animation-iteration-count",
				"desc": "Defines the number of times an animation cycle is played. The default value is one, meaning the animation will play from beginning to end once.",
				"browsers": "O12",
				"restriction": "number, enum",
				"values": [
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					}
				]
			},
			{
				"name": "-o-animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "O12",
				"restriction": "identifier, enum",
				"values": [
					{
						"name": "none",
						"desc": "No animation is performed"
					}
				]
			},
			{
				"name": "-o-animation-play-state",
				"desc": "Defines whether the animation is running or paused.",
				"browsers": "O12",
				"restriction": "enum",
				"values": [
					{
						"name": "paused"
					},
					{
						"name": "running"
					}
				]
			},
			{
				"name": "-o-animation-timing-function",
				"desc": "Describes how the animation will progress over one cycle of its duration. See the 'transition-timing-function'.",
				"browsers": "O12",
				"restriction": "timing-function"
			},
			{
				"name": "object-fit",
				"desc": "Specifies how the contents of a replaced element should be scaled relative to the box established by its used height and width.",
				"browsers": "C32,FF36,O19,S7.1",
				"restriction": "enum",
				"values": [
					{
						"name": "contain",
						"desc": "The replaced content is sized to maintain its aspect ratio while fitting within the element’s content box: its concrete object size is resolved as a contain constraint against the element's used width and height."
					},
					{
						"name": "cover",
						"desc": "The replaced content is sized to maintain its aspect ratio while filling the element's entire content box: its concrete object size is resolved as a cover constraint against the element’s used width and height."
					},
					{
						"name": "fill",
						"desc": "The replaced content is sized to fill the element’s content box: the object's concrete object size is the element's used width and height."
					},
					{
						"name": "none",
						"desc": "The replaced content is not resized to fit inside the element's content box"
					},
					{
						"name": "scale-down"
					}
				]
			},
			{
				"name": "object-position",
				"desc": "Determines the alignment of the replaced element inside its box.",
				"browsers": "C32,FF36,O19",
				"restriction": "position, length, percentage"
			},
			{
				"name": "-o-border-image",
				"desc": "Shorthand property for setting 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset' and 'border-image-repeat'. Omitted values are set to their initial values.",
				"browsers": "O11.6",
				"restriction": "length, percentage, number, image, enum",
				"values": [
					{
						"name": "auto",
						"desc": "If 'auto' is specified then the border image width is the intrinsic width or height (whichever is applicable) of the corresponding image slice. If the image does not have the required intrinsic dimension then the corresponding border-width is used instead."
					},
					{
						"name": "fill",
						"desc": "Causes the middle part of the border-image to be preserved."
					},
					{
						"name": "none"
					},
					{
						"name": "repeat"
					},
					{
						"name": "round",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the image is rescaled so that it does."
					},
					{
						"name": "space",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the extra space is distributed around the tiles."
					},
					{
						"name": "stretch",
						"desc": "The image is stretched to fill the area."
					}
				]
			},
			{
				"name": "-o-object-fit",
				"desc": "Specifies how the contents of a replaced element should be scaled relative to the box established by its used height and width.",
				"browsers": "O10.6",
				"restriction": "enum",
				"values": [
					{
						"name": "contain",
						"desc": "The replaced content is sized to maintain its aspect ratio while fitting within the element’s content box: its concrete object size is resolved as a contain constraint against the element's used width and height."
					},
					{
						"name": "cover",
						"desc": "The replaced content is sized to maintain its aspect ratio while filling the element's entire content box: its concrete object size is resolved as a cover constraint against the element’s used width and height."
					},
					{
						"name": "fill",
						"desc": "The replaced content is sized to fill the element’s content box: the object's concrete object size is the element's used width and height."
					},
					{
						"name": "none",
						"desc": "The replaced content is not resized to fit inside the element's content box"
					},
					{
						"name": "scale-down"
					}
				]
			},
			{
				"name": "-o-object-position",
				"desc": "Determines the alignment of the replaced element inside its box.",
				"browsers": "O10.6",
				"restriction": "position, length, percentage"
			},
			{
				"name": "opacity",
				"desc": "Opacity of an element's text, where 1 is opaque and 0 is entirely transparent.",
				"browsers": "C,FF3.6,IE9,O9,S1.2",
				"restriction": "number(0-1)"
			},
			{
				"name": "order",
				"desc": "Controls the order in which children of a flex container appear within the flex container, by assigning them to ordinal groups.",
				"browsers": "E,C29,FF22,IE11,O12.1,S9",
				"restriction": "integer"
			},
			{
				"name": "orphans",
				"desc": "Specifies the minimum number of line boxes in a block container that must be left in a fragment before a fragmentation break.",
				"browsers": "C,IE8,O7,S1.3",
				"restriction": "integer"
			},
			{
				"name": "-o-table-baseline",
				"desc": "Determines which row of a inline-table should be used as baseline of inline-table.",
				"browsers": "O9.6",
				"restriction": "integer"
			},
			{
				"name": "-o-tab-size",
				"desc": "This property determines the width of the tab character (U+0009), in space characters (U+0020), when rendered.",
				"browsers": "O10.6",
				"restriction": "integer, length"
			},
			{
				"name": "-o-text-overflow",
				"desc": "Text can overflow for example when it is prevented from wrapping",
				"browsers": "O10",
				"restriction": "enum",
				"values": [
					{
						"name": "clip"
					},
					{
						"name": "ellipsis"
					}
				]
			},
			{
				"name": "-o-transform",
				"desc": "A two-dimensional transformation is applied to an element through the 'transform' property. This property contains a list of transform functions similar to those allowed by SVG.",
				"browsers": "O10.5",
				"restriction": "enum",
				"values": [
					{
						"name": "matrix()"
					},
					{
						"name": "matrix3d()"
					},
					{
						"name": "none"
					},
					{
						"name": "rotate()"
					},
					{
						"name": "rotate3d()"
					},
					{
						"name": "rotateX('angle')"
					},
					{
						"name": "rotateY('angle')"
					},
					{
						"name": "rotateZ('angle')"
					},
					{
						"name": "scale()"
					},
					{
						"name": "scale3d()"
					},
					{
						"name": "scaleX()"
					},
					{
						"name": "scaleY()"
					},
					{
						"name": "scaleZ()"
					},
					{
						"name": "skew()"
					},
					{
						"name": "skewX()"
					},
					{
						"name": "skewY()"
					},
					{
						"name": "translate()"
					},
					{
						"name": "translate3d()"
					},
					{
						"name": "translateX()"
					},
					{
						"name": "translateY()"
					},
					{
						"name": "translateZ()"
					}
				]
			},
			{
				"name": "-o-transform-origin",
				"desc": "Establishes the origin of transformation for an element.",
				"browsers": "O10.5",
				"restriction": "positon, length, percentage"
			},
			{
				"name": "-o-transition",
				"desc": "Shorthand property combines four of the transition properties into a single property.",
				"browsers": "O11.5",
				"restriction": "time, property, timing-function, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "-o-transition-delay",
				"desc": "Defines when the transition will start. It allows a transition to begin execution some period of time from when it is applied.",
				"browsers": "O11.5",
				"restriction": "time"
			},
			{
				"name": "-o-transition-duration",
				"desc": "Specifies how long the transition from the old value to the new value should take.",
				"browsers": "O11.5",
				"restriction": "time"
			},
			{
				"name": "-o-transition-property",
				"desc": "Specifies the name of the CSS property to which the transition is applied.",
				"browsers": "O11.5",
				"restriction": "property",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "-o-transition-timing-function",
				"desc": "Describes how the intermediate values used during a transition will be calculated.",
				"browsers": "O11.5",
				"restriction": "timing-function"
			},
			{
				"name": "offset-block-end",
				"desc": "Logical 'bottom'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well."
					}
				]
			},
			{
				"name": "offset-block-start",
				"desc": "Logical 'top'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well."
					}
				]
			},
			{
				"name": "offset-inline-end",
				"desc": "Logical 'right'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well."
					}
				]
			},
			{
				"name": "offset-inline-start",
				"desc": "Logical 'left'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well."
					}
				]
			},
			{
				"name": "outline",
				"desc": "Shorthand property for 'outline-style', 'outline-width', and 'outline-color'.",
				"browsers": "E,C,FF1.5,IE8,O8,S1.2",
				"restriction": "length, line-width, line-style, color, enum",
				"values": [
					{
						"name": "auto",
						"desc": "Permits the user agent to render a custom outline style, typically the default platform style."
					},
					{
						"name": "invert",
						"browsers": "E,IE8,O"
					}
				]
			},
			{
				"name": "outline-color",
				"desc": "The color of the outline.",
				"browsers": "E,C,FF1.5,IE8,O8,S1.2",
				"restriction": "enum, color",
				"values": [
					{
						"name": "invert",
						"browsers": "E,IE8,O"
					}
				]
			},
			{
				"name": "outline-offset",
				"desc": "Offset the outline and draw it beyond the border edge.",
				"browsers": "C,FF1.5,O9.5,S1.2",
				"restriction": "length"
			},
			{
				"name": "outline-style",
				"desc": "Style of the outline.",
				"browsers": "E,C,FF1.5,IE8,O8,S1.2",
				"restriction": "line-style, enum",
				"values": [
					{
						"name": "auto",
						"desc": "Permits the user agent to render a custom outline style, typically the default platform style."
					}
				]
			},
			{
				"name": "outline-width",
				"desc": "Width of the outline.",
				"browsers": "E,C,FF1.5,IE8,O8,S1.2",
				"restriction": "length, line-width"
			},
			{
				"name": "overflow",
				"desc": "Shorthand for setting 'overflow-x' and 'overflow-y'.",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The behavior of the 'auto' value is UA-dependent, but should cause a scrolling mechanism to be provided for overflowing boxes."
					},
					{
						"name": "hidden",
						"desc": "Content is clipped and no scrolling mechanism should be provided to view the content outside the clipping region."
					},
					{
						"name": "-moz-hidden-unscrollable",
						"browsers": "FF"
					},
					{
						"name": "scroll",
						"desc": "Content is clipped and if the user agent uses a scrolling mechanism that is visible on the screen (such as a scroll bar or a panner), that mechanism should be displayed for a box whether or not any of its content is clipped."
					},
					{
						"name": "visible",
						"desc": "Content is not clipped, i.e., it may be rendered outside the content box."
					}
				]
			},
			{
				"name": "overflow-wrap",
				"desc": "Specifies whether the UA may break within a word to prevent overflow when an otherwise-unbreakable string is too long to fit within the line box.",
				"browsers": "C23,O12.1,S6.1",
				"restriction": "enum",
				"values": [
					{
						"name": "break-word",
						"desc": "An otherwise unbreakable sequence of characters may be broken at an arbitrary point if there are no otherwise-acceptable break points in the line."
					},
					{
						"name": "normal",
						"desc": "Lines may break only at allowed break points."
					}
				]
			},
			{
				"name": "overflow-x",
				"desc": "Specifies the handling of overflow in the horizontal direction.",
				"browsers": "E,C,FF1.5,IE5,O9.5,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The behavior of the 'auto' value is UA-dependent, but should cause a scrolling mechanism to be provided for overflowing boxes."
					},
					{
						"name": "hidden",
						"desc": "Content is clipped and no scrolling mechanism should be provided to view the content outside the clipping region."
					},
					{
						"name": "scroll",
						"desc": "Content is clipped and if the user agent uses a scrolling mechanism that is visible on the screen (such as a scroll bar or a panner), that mechanism should be displayed for a box whether or not any of its content is clipped."
					},
					{
						"name": "visible",
						"desc": "Content is not clipped, i.e., it may be rendered outside the content box."
					}
				]
			},
			{
				"name": "overflow-y",
				"desc": "Specifies the handling of overflow in the vertical direction.",
				"browsers": "E,C,FF1.5,IE5,O9.5,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The behavior of the 'auto' value is UA-dependent, but should cause a scrolling mechanism to be provided for overflowing boxes."
					},
					{
						"name": "hidden",
						"desc": "Content is clipped and no scrolling mechanism should be provided to view the content outside the clipping region."
					},
					{
						"name": "scroll",
						"desc": "Content is clipped and if the user agent uses a scrolling mechanism that is visible on the screen (such as a scroll bar or a panner), that mechanism should be displayed for a box whether or not any of its content is clipped."
					},
					{
						"name": "visible",
						"desc": "Content is not clipped, i.e., it may be rendered outside the content box."
					}
				]
			},
			{
				"name": "pad",
				"desc": "@counter-style descriptor. Specifies a “fixed-width” counter style, where representations shorter than the pad value are padded with a particular <symbol>",
				"browsers": "FF33",
				"restriction": "integer, image, string, identifier"
			},
			{
				"name": "padding",
				"desc": "Shorthand property to set values the thickness of the padding area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "padding-bottom",
				"desc": "Shorthand property to set values the thickness of the padding area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-block-end",
				"desc": "Logical 'padding-bottom'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-block-start",
				"desc": "Logical 'padding-top'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-inline-end",
				"desc": "Logical 'padding-right'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-inline-start",
				"desc": "Logical 'padding-left'. Mapping depends on the parent element’s 'writing-mode', 'direction', and 'text-orientation'.",
				"browsers": "FF41",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-left",
				"desc": "Shorthand property to set values the thickness of the padding area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-right",
				"desc": "Shorthand property to set values the thickness of the padding area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-top",
				"desc": "Shorthand property to set values the thickness of the padding area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage"
			},
			{
				"name": "page-break-after",
				"desc": "Defines rules for page breaks after an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break after the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page break after generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page break after the generated box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks after the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks after the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "page-break-before",
				"desc": "Defines rules for page breaks before an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break before the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page break before the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page break before the generated box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks before the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks before the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "page-break-inside",
				"desc": "Defines rules for page breaks inside an element.",
				"browsers": "C,IE8,O7,S1.3",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page break inside the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page break inside the generated box."
					}
				]
			},
			{
				"name": "paint-order",
				"desc": "Controls the order that the three paint operations that shapes and text are rendered with: their fill, their stroke and any markers they might have.",
				"browsers": "C35,FF31,O22,S7.1",
				"restriction": "enum",
				"values": [
					{
						"name": "fill"
					},
					{
						"name": "markers"
					},
					{
						"name": "normal",
						"desc": "The element is painted with the standard order of painting operations: the 'fill' is painted first, then its 'stroke' and finally its markers."
					},
					{
						"name": "stroke"
					}
				]
			},
			{
				"name": "perspective",
				"desc": "Applies the same transform as the perspective(<number>) transform function, except that it applies only to the positioned or transformed children of the element, not to the transform on the element itself.",
				"browsers": "E,C36,FF16,IE10,O23,S9",
				"restriction": "length, enum",
				"values": [
					{
						"name": "none",
						"desc": "No perspective transform is applied."
					}
				]
			},
			{
				"name": "perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "E,C36,FF16,IE10,O23,S9",
				"restriction": "position, percentage, length"
			},
			{
				"name": "pointer-events",
				"desc": "Specifies under what circumstances a given element can be the target element for a pointer event.",
				"restriction": "enum",
				"values": [
					{
						"name": "all",
						"desc": "The given element can be the target element for pointer events whenever the pointer is over either the interior or the perimeter of the element."
					},
					{
						"name": "fill",
						"desc": "The given element can be the target element for pointer events whenever the pointer is over the interior of the element."
					},
					{
						"name": "none",
						"desc": "The given element does not receive pointer events."
					},
					{
						"name": "painted"
					},
					{
						"name": "stroke",
						"desc": "The given element can be the target element for pointer events whenever the pointer is over the perimeter of the element."
					},
					{
						"name": "visible",
						"desc": "The given element can be the target element for pointer events when the ‘visibility’ property is set to visible and the pointer is over either the interior or the perimete of the element."
					},
					{
						"name": "visibleFill"
					},
					{
						"name": "visiblePainted"
					},
					{
						"name": "visibleStroke"
					}
				]
			},
			{
				"name": "position",
				"restriction": "enum",
				"values": [
					{
						"name": "absolute"
					},
					{
						"name": "fixed",
						"desc": "The box's position is calculated according to the 'absolute' model, but in addition, the box is fixed with respect to some reference. As with the 'absolute' model, the box's margins do not collapse with any other margins."
					},
					{
						"name": "-ms-page",
						"browsers": "E,IE10"
					},
					{
						"name": "relative"
					},
					{
						"name": "static"
					},
					{
						"name": "sticky",
						"browsers": "FF32"
					},
					{
						"name": "-webkit-sticky",
						"browsers": "S6.1"
					}
				]
			},
			{
				"name": "prefix",
				"desc": "@counter-style descriptor. Specifies a <symbol> that is prepended to the marker representation.",
				"browsers": "FF33",
				"restriction": "image, string, identifier"
			},
			{
				"name": "quotes",
				"desc": "Specifies quotation marks for any number of embedded quotations.",
				"browsers": "E,C,FF1.5,IE8,O8,S5.1",
				"restriction": "string",
				"values": [
					{
						"name": "none",
						"desc": "The 'open-quote' and 'close-quote' values of the 'content' property produce no quotations marks, as if they were 'no-open-quote' and 'no-close-quote' respectively."
					}
				]
			},
			{
				"name": "range",
				"desc": "@counter-style descriptor. Defines the ranges over which the counter style is defined.",
				"browsers": "FF33",
				"restriction": "integer, enum",
				"values": [
					{
						"name": "auto",
						"desc": "The range depends on the counter system."
					},
					{
						"name": "infinite",
						"desc": "If used as the first value in a range, it represents negative infinity; if used as the second value, it represents positive infinity."
					}
				]
			},
			{
				"name": "resize",
				"desc": "Specifies whether or not an element is resizable by the user, and if so, along which axis/axes.",
				"browsers": "C,FF4,O15,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "both",
						"desc": "The UA presents a bidirectional resizing mechanism to allow the user to adjust both the height and the width of the element."
					},
					{
						"name": "horizontal",
						"desc": "The UA presents a unidirectional horizontal resizing mechanism to allow the user to adjust only the width of the element."
					},
					{
						"name": "none",
						"desc": "The UA does not present a resizing mechanism on the element, and the user is given no direct manipulation mechanism to resize the element."
					},
					{
						"name": "vertical",
						"desc": "The UA presents a unidirectional vertical resizing mechanism to allow the user to adjust only the height of the element."
					}
				]
			},
			{
				"name": "right",
				"desc": "Specifies how far an absolutely positioned box's right margin edge is offset to the left of the right edge of the box's 'containing block'.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well"
					}
				]
			},
			{
				"name": "ruby-align",
				"desc": "Specifies how text is distributed within the various ruby boxes when their contents do not exactly fill their respective boxes.",
				"browsers": "FF10,IE5",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent determines how the ruby contents are aligned. This is the initial value.",
						"browsers": "E,IE5"
					},
					{
						"name": "center",
						"desc": "The ruby content is centered within its box."
					},
					{
						"name": "distribute-letter",
						"browsers": "E,IE5"
					},
					{
						"name": "distribute-space",
						"browsers": "E,IE5"
					},
					{
						"name": "left",
						"desc": "The ruby text content is aligned with the start edge of the base."
					},
					{
						"name": "line-edge",
						"browsers": "E,IE5"
					},
					{
						"name": "right",
						"desc": "The ruby text content is aligned with the end edge of the base.",
						"browsers": "E,IE5"
					},
					{
						"name": "start",
						"desc": "The ruby text content is aligned with the start edge of the base.",
						"browsers": "FF10"
					},
					{
						"name": "space-between",
						"desc": "The ruby content expands as defined for normal text justification (as defined by 'text-justify'),",
						"browsers": "FF10"
					},
					{
						"name": "space-around",
						"desc": "As for 'space-between' except that there exists an extra justification opportunities whose space is distributed half before and half after the ruby content.",
						"browsers": "FF10"
					}
				]
			},
			{
				"name": "ruby-overhang",
				"desc": "Determines whether, and on which side, ruby text is allowed to partially overhang any adjacent text in addition to its own base, when the ruby text is wider than the ruby base.",
				"browsers": "FF10,IE5",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The ruby text can overhang text adjacent to the base on either side. This is the initial value."
					},
					{
						"name": "end",
						"desc": "The ruby text can overhang the text that follows it."
					},
					{
						"name": "none",
						"desc": "The ruby text cannot overhang any text adjacent to its base, only its own base."
					},
					{
						"name": "start",
						"desc": "The ruby text can overhang the text that precedes it."
					}
				]
			},
			{
				"name": "ruby-position",
				"desc": "Used by the parent of elements with display: ruby-text to control the position of the ruby text with respect to its base.",
				"browsers": "FF10,IE5",
				"restriction": "enum",
				"values": [
					{
						"name": "after"
					},
					{
						"name": "before"
					},
					{
						"name": "inline"
					},
					{
						"name": "right",
						"desc": "The ruby text appears on the right of the base. Unlike 'before' and 'after', this value is not relative to the text flow direction."
					}
				]
			},
			{
				"name": "ruby-span",
				"desc": "Determines whether, and on which side, ruby text is allowed to partially overhang any adjacent text in addition to its own base, when the ruby text is wider than the ruby base.",
				"browsers": "FF10",
				"restriction": "enum",
				"values": [
					{
						"name": "attr(x)"
					},
					{
						"name": "none",
						"desc": "No spanning. The computed value is '1'."
					}
				]
			},
			{
				"name": "scrollbar-3dlight-color",
				"desc": "Determines the color of the top and left edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scrollbar-arrow-color",
				"desc": "Determines the color of the arrow elements of a scroll arrow.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scrollbar-base-color",
				"desc": "Determines the color of the main elements of a scroll bar, which include the scroll box, track, and scroll arrows.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scrollbar-darkshadow-color",
				"desc": "Determines the color of the gutter of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scrollbar-face-color",
				"desc": "Determines the color of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scrollbar-highlight-color",
				"desc": "Determines the color of the top and left edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scrollbar-shadow-color",
				"desc": "Determines the color of the bottom and right edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scrollbar-track-color",
				"desc": "Determines the color of the track element of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color"
			},
			{
				"name": "scroll-behavior",
				"desc": "Specifies the scrolling behavior for a scrolling box, when scrolling happens due to navigation or CSSOM scrolling APIs.",
				"browsers": "FF36",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Scrolls in an instant fashion."
					},
					{
						"name": "smooth"
					}
				]
			},
			{
				"name": "scroll-snap-coordinate",
				"desc": "Defines the x and y coordinate within the element which will align with the nearest ancestor scroll container’s snap-destination for the respective axis.",
				"browsers": "FF39",
				"restriction": "position, length, percentage, enum",
				"values": [
					{
						"name": "none",
						"desc": "Specifies that this element does not contribute a snap point."
					}
				]
			},
			{
				"name": "scroll-snap-destination",
				"desc": "Define the x and y coordinate within the scroll container’s visual viewport which element snap points will align with.",
				"browsers": "FF39",
				"restriction": "position, length, percentage"
			},
			{
				"name": "scroll-snap-points-x",
				"desc": "Defines the positioning of snap points along the x axis of the scroll container it is applied to.",
				"browsers": "FF39",
				"restriction": "enum",
				"values": [
					{
						"name": "none",
						"desc": "No snap points are defined by this scroll container."
					},
					{
						"name": "repeat()"
					}
				]
			},
			{
				"name": "scroll-snap-points-y",
				"desc": "Defines the positioning of snap points alobg the y axis of the scroll container it is applied to.",
				"browsers": "FF39",
				"restriction": "enum",
				"values": [
					{
						"name": "none",
						"desc": "No snap points are defined by this scroll container."
					},
					{
						"name": "repeat()"
					}
				]
			},
			{
				"name": "scroll-snap-type",
				"desc": "Defines how strictly snap points are enforced on the scroll container.",
				"browsers": "FF39",
				"restriction": "enum",
				"values": [
					{
						"name": "none",
						"desc": "The visual viewport of this scroll container must ignore snap points, if any, when scrolled."
					},
					{
						"name": "mandatory",
						"desc": "The visual viewport of this scroll container is guaranteed to rest on a snap point when there are no active scrolling operations."
					},
					{
						"name": "proximity",
						"desc": "The visual viewport of this scroll container may come to rest on a snap point at the termination of a scroll at the discretion of the UA given the parameters of the scroll."
					}
				]
			},
			{
				"name": "shape-image-threshold",
				"desc": "Defines the alpha channel threshold used to extract the shape using an image. A value of 0.5 means that the shape will enclose all the pixels that are more than 50% opaque.",
				"browsers": "C37,O24",
				"restriction": "number"
			},
			{
				"name": "shape-margin",
				"desc": "Adds a margin to a 'shape-outside'. This defines a new shape that is the smallest contour that includes all the points that are the 'shape-margin' distance outward in the perpendicular direction from a point on the underlying shape.",
				"browsers": "C37,O24",
				"restriction": "url, length, percentage"
			},
			{
				"name": "shape-outside",
				"desc": "Specifies an orthogonal rotation to be applied to an image before it is laid out.",
				"browsers": "C37,O24",
				"restriction": "image, box, shape, enum",
				"values": [
					{
						"name": "margin-box"
					},
					{
						"name": "none",
						"desc": "The float area is unaffected."
					}
				]
			},
			{
				"name": "size",
				"browsers": "C,O8",
				"restriction": "length"
			},
			{
				"name": "src",
				"desc": "@font-face descriptor. Specifies the resource containing font data. It is required, whether the font is downloadable or locally installed.",
				"restriction": "enum, url, identifier",
				"values": [
					{
						"name": "url()",
						"desc": "Reference font by URL"
					},
					{
						"name": "format()"
					},
					{
						"name": "local()"
					}
				]
			},
			{
				"name": "stop-color",
				"desc": "Indicates what color to use at that gradient stop.",
				"restriction": "color"
			},
			{
				"name": "stop-opacity",
				"desc": "Defines the opacity of a given gradient stop.",
				"restriction": "number(0-1)"
			},
			{
				"name": "stroke",
				"desc": "Paints along the outline of the given graphical element.",
				"restriction": "color, enum, url",
				"values": [
					{
						"name": "url()",
						"desc": "A URL reference to a paint server element, which is an element that defines a paint server: ‘hatch’, ‘linearGradient’, ‘mesh’, ‘pattern’, ‘radialGradient’ and ‘solidcolor’."
					}
				]
			},
			{
				"name": "stroke-dasharray",
				"desc": "Controls the pattern of dashes and gaps used to stroke paths.",
				"restriction": "length, percentage, number, enum",
				"values": [
					{
						"name": "none",
						"desc": "Indicates that no dashing is used."
					}
				]
			},
			{
				"name": "stroke-dashoffset",
				"desc": "Specifies the distance into the dash pattern to start the dash.",
				"restriction": "percentage, length"
			},
			{
				"name": "stroke-linecap",
				"desc": "Specifies the shape to be used at the end of open subpaths when they are stroked.",
				"restriction": "enum",
				"values": [
					{
						"name": "butt"
					},
					{
						"name": "round",
						"desc": "Indicates that at each end of each subpath, the shape representing the stroke will be extended by a half circle with a radius equal to the stroke width."
					},
					{
						"name": "square",
						"desc": "Indicates that at the end of each subpath, the shape representing the stroke will be extended by a rectangle with the same width as the stroke width and whose length is half of the stroke width."
					}
				]
			},
			{
				"name": "stroke-linejoin",
				"desc": "Specifies the shape to be used at the corners of paths or basic shapes when they are stroked.",
				"restriction": "enum",
				"values": [
					{
						"name": "bevel"
					},
					{
						"name": "miter"
					},
					{
						"name": "round",
						"desc": "Indicates that a round corner is to be used to join path segments."
					}
				]
			},
			{
				"name": "stroke-miterlimit",
				"desc": "When two line segments meet at a sharp angle and miter joins have been specified for 'stroke-linejoin', it is possible for the miter to extend far beyond the thickness of the line stroking the path.",
				"restriction": "number"
			},
			{
				"name": "stroke-opacity",
				"desc": "Specifies the opacity of the painting operation used to stroke the current object.",
				"restriction": "number(0-1)"
			},
			{
				"name": "stroke-width",
				"desc": "Specifies the width of the stroke on the current object.",
				"restriction": "percentage, length"
			},
			{
				"name": "suffix",
				"desc": "@counter-style descriptor. Specifies a <symbol> that is appended to the marker representation.",
				"browsers": "FF33",
				"restriction": "image, string, identifier"
			},
			{
				"name": "system",
				"desc": "@counter-style descriptor. Specifies which algorithm will be used to construct the counter’s representation based on the counter value.",
				"browsers": "FF33",
				"restriction": "enum, integer",
				"values": [
					{
						"name": "additive"
					},
					{
						"name": "alphabetic",
						"desc": "Interprets the list of counter symbols as digits to an alphabetic numbering system, similar to the default lower-alpha counter style, which wraps from \"a\", \"b\", \"c\", to \"aa\", \"ab\", \"ac\"."
					},
					{
						"name": "cyclic"
					},
					{
						"name": "extends"
					},
					{
						"name": "fixed",
						"desc": "Runs through its list of counter symbols once, then falls back."
					},
					{
						"name": "numeric"
					},
					{
						"name": "symbolic"
					}
				]
			},
			{
				"name": "symbols",
				"desc": "@counter-style descriptor. Specifies the symbols used by the marker-construction algorithm specified by the system descriptor.",
				"browsers": "FF33",
				"restriction": "image, string, identifier"
			},
			{
				"name": "table-layout",
				"desc": "Controls the algorithm used to lay out the table cells, rows, and columns.",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Use any automatic table layout algorithm."
					},
					{
						"name": "fixed",
						"desc": "Use the fixed table layout algorithm."
					}
				]
			},
			{
				"name": "tab-size",
				"desc": "Determines the width of the tab character (U+0009), in space characters (U+0020), when rendered.",
				"browsers": "C21,O15,S6.1",
				"restriction": "integer, length"
			},
			{
				"name": "text-align",
				"desc": "Describes how inline contents of a block are horizontally aligned if the contents do not completely fill the line box.",
				"restriction": "string",
				"values": [
					{
						"name": "center",
						"desc": "The inline contents are centered within the line box."
					},
					{
						"name": "end",
						"desc": "The inline contents are aligned to the end edge of the line box.",
						"browsers": "C,FF3.6,O15,S3.1"
					},
					{
						"name": "justify",
						"desc": "The text is justified according to the method specified by the 'text-justify' property."
					},
					{
						"name": "left",
						"desc": "The inline contents are aligned to the left edge of the line box. In vertical text, 'left' aligns to the edge of the line box that would be the start edge for left-to-right text."
					},
					{
						"name": "right",
						"desc": "The inline contents are aligned to the right edge of the line box. In vertical text, 'right' aligns to the edge of the line box that would be the end edge for left-to-right text."
					},
					{
						"name": "start",
						"desc": "The inline contents are aligned to the start edge of the line box.",
						"browsers": "C,FF1,O15,S3.1"
					}
				]
			},
			{
				"name": "text-align-last",
				"desc": "Describes how the last line of a block or a line right before a forced line break is aligned when 'text-align' is set to 'justify'.",
				"browsers": "E,FF12,IE5",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Content on the affected line is aligned per 'text-align' unless 'text-align' is set to 'justify', in which case it is 'start-aligned'."
					},
					{
						"name": "center",
						"desc": "The inline contents are centered within the line box."
					},
					{
						"name": "justify",
						"desc": "The text is justified according to the method specified by the 'text-justify' property."
					},
					{
						"name": "left",
						"desc": "The inline contents are aligned to the left edge of the line box. In vertical text, 'left' aligns to the edge of the line box that would be the start edge for left-to-right text."
					},
					{
						"name": "right",
						"desc": "The inline contents are aligned to the right edge of the line box. In vertical text, 'right' aligns to the edge of the line box that would be the end edge for left-to-right text."
					}
				]
			},
			{
				"name": "text-anchor",
				"desc": "Used to align (start-, middle- or end-alignment) a string of text relative to a given point.",
				"restriction": "enum",
				"values": [
					{
						"name": "end",
						"desc": "The rendered characters are aligned such that the end of the resulting rendered text is at the initial current text position."
					},
					{
						"name": "middle",
						"desc": "The rendered characters are aligned such that the geometric middle of the resulting rendered text is at the initial current text position."
					},
					{
						"name": "start",
						"desc": "The rendered characters are aligned such that the start of the resulting rendered text is at the initial current text position."
					}
				]
			},
			{
				"name": "text-decoration",
				"desc": "Decorations applied to font used for an element's text.",
				"restriction": "enum, color",
				"values": [
					{
						"name": "dashed"
					},
					{
						"name": "dotted"
					},
					{
						"name": "double"
					},
					{
						"name": "line-through"
					},
					{
						"name": "overline"
					},
					{
						"name": "none",
						"desc": "Produces no text decoration."
					},
					{
						"name": "solid"
					},
					{
						"name": "underline"
					},
					{
						"name": "wavy"
					}
				]
			},
			{
				"name": "text-decoration-line",
				"desc": "Specifies what line decorations, if any, are added to the element.",
				"browsers": "FF36",
				"restriction": "enum",
				"values": [
					{
						"name": "line-through"
					},
					{
						"name": "none",
						"desc": "Produces no text decoration."
					},
					{
						"name": "overline"
					},
					{
						"name": "underline"
					}
				]
			},
			{
				"name": "text-decoration-style",
				"desc": "Specifies the line style for underline, line-through and overline text decoration.",
				"browsers": "FF36",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed"
					},
					{
						"name": "dotted"
					},
					{
						"name": "double"
					},
					{
						"name": "none"
					},
					{
						"name": "solid"
					},
					{
						"name": "wavy"
					}
				]
			},
			{
				"name": "text-indent",
				"desc": "Specifies the indentation applied to lines of inline content in a block. The indentation only affects the first line of inline content in the block unless the 'hanging' keyword is specified, in which case it affects all lines except the first.",
				"restriction": "percentage, length",
				"values": []
			},
			{
				"name": "text-justify",
				"desc": "Selects the justification algorithm used when 'text-align' is set to 'justify'. The property applies to block containers, but the UA may (but is not required to) also support it on inline elements.",
				"browsers": "E,IE5.5",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The UA determines the justification algorithm to follow, based on a balance between performance and adequate presentation quality."
					},
					{
						"name": "distribute",
						"desc": "Justification primarily changes spacing both at word separators and at grapheme cluster boundaries in all scripts except those in the connected and cursive groups. This value is sometimes used in e.g. Japanese, often with the 'text-align-last' property."
					},
					{
						"name": "distribute-all-lines"
					},
					{
						"name": "inter-cluster"
					},
					{
						"name": "inter-ideograph"
					},
					{
						"name": "inter-word"
					},
					{
						"name": "kashida"
					},
					{
						"name": "newspaper"
					}
				]
			},
			{
				"name": "text-orientation",
				"desc": "Specifies the orientation of text within a line.",
				"browsers": "C,O15,S5.1",
				"restriction": "enum",
				"values": [
					{
						"name": "sideways",
						"browsers": "C25,O15,S6.1"
					},
					{
						"name": "sideways-right",
						"browsers": "C25,O15,S6.1"
					},
					{
						"name": "upright"
					}
				]
			},
			{
				"name": "text-overflow",
				"desc": "Text can overflow for example when it is prevented from wrapping.",
				"browsers": "E,C,FF9,IE5.5,O11.6,S2",
				"restriction": "enum, string",
				"values": [
					{
						"name": "clip"
					},
					{
						"name": "ellipsis"
					}
				]
			},
			{
				"name": "text-rendering",
				"desc": "The creator of SVG content might want to provide a hint to the implementation about what tradeoffs to make as it renders text. The ‘text-rendering’ property provides these hints.",
				"browsers": "C,FF3,O9,S5",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "geometricPrecision"
					},
					{
						"name": "optimizeLegibility"
					},
					{
						"name": "optimizeSpeed",
						"desc": "Indicates that the user agent shall emphasize rendering speed over legibility and geometric precision."
					}
				]
			},
			{
				"name": "text-shadow",
				"desc": "Enables shadow effects to be applied to the text of the element.",
				"browsers": "E,C,FF3.6,IE10,O9.5,S1.1",
				"restriction": "length, color",
				"values": []
			},
			{
				"name": "text-transform",
				"desc": "Controls capitalization effects of an element’s text.",
				"restriction": "enum",
				"values": [
					{
						"name": "capitalize"
					},
					{
						"name": "lowercase"
					},
					{
						"name": "none",
						"desc": "No effects."
					},
					{
						"name": "uppercase"
					}
				]
			},
			{
				"name": "text-underline-position",
				"desc": "Sets the position of an underline specified on the same element: it does not affect underlines specified by ancestor elements. This property is typically used in vertical writing contexts such as in Japanese documents where it often desired to have the underline appear 'over' (to the right of) the affected run of text",
				"browsers": "E,IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "above"
					},
					{
						"name": "auto",
						"desc": "The user agent may use any algorithm to determine the underline’s position. In horizontal line layout, the underline should be aligned as for alphabetic. In vertical line layout, if the language is set to Japanese or Korean, the underline should be aligned as for over."
					},
					{
						"name": "below",
						"desc": "The underline is aligned with the under edge of the element’s content box."
					}
				]
			},
			{
				"name": "top",
				"desc": "Specifies how far an absolutely positioned box's top margin edge is offset below the top edge of the box's 'containing block'.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "For non-replaced elements, the effect of this value depends on which of related properties have the value 'auto' as well"
					}
				]
			},
			{
				"name": "touch-action",
				"desc": "Determines whether touch input may trigger default behavior supplied by user agent.",
				"browsers": "E,C36,IE11,O23",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent may determine any permitted touch behaviors for touches that begin on the element."
					},
					{
						"name": "cross-slide-x",
						"browsers": "E,IE11"
					},
					{
						"name": "cross-slide-y",
						"browsers": "E,IE11"
					},
					{
						"name": "double-tap-zoom",
						"browsers": "E,IE11"
					},
					{
						"name": "manipulation",
						"desc": "The user agent may consider touches that begin on the element only for the purposes of scrolling and continuous zooming."
					},
					{
						"name": "none",
						"desc": "Touches that begin on the element must not trigger default touch behaviors."
					},
					{
						"name": "pan-x",
						"desc": "The user agent may consider touches that begin on the element only for the purposes of horizontally scrolling the element’s nearest ancestor with horizontally scrollable content."
					},
					{
						"name": "pan-y",
						"desc": "The user agent may consider touches that begin on the element only for the purposes of vertically scrolling the element’s nearest ancestor with vertically scrollable content."
					},
					{
						"name": "pinch-zoom",
						"browsers": "E,IE11"
					}
				]
			},
			{
				"name": "transform",
				"desc": "A two-dimensional transformation is applied to an element through the 'transform' property. This property contains a list of transform functions similar to those allowed by SVG.",
				"browsers": "E,C36,FF16,IE10,O12.1,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "matrix()"
					},
					{
						"name": "matrix3d()"
					},
					{
						"name": "none"
					},
					{
						"name": "perspective()"
					},
					{
						"name": "rotate()"
					},
					{
						"name": "rotate3d()"
					},
					{
						"name": "rotateX('angle')"
					},
					{
						"name": "rotateY('angle')"
					},
					{
						"name": "rotateZ('angle')"
					},
					{
						"name": "scale()"
					},
					{
						"name": "scale3d()"
					},
					{
						"name": "scaleX()"
					},
					{
						"name": "scaleY()"
					},
					{
						"name": "scaleZ()"
					},
					{
						"name": "skew()"
					},
					{
						"name": "skewX()"
					},
					{
						"name": "skewY()"
					},
					{
						"name": "translate()"
					},
					{
						"name": "translate3d()"
					},
					{
						"name": "translateX()"
					},
					{
						"name": "translateY()"
					},
					{
						"name": "translateZ()"
					}
				]
			},
			{
				"name": "transform-origin",
				"desc": "Establishes the origin of transformation for an element.",
				"browsers": "E,C36,FF16,IE10,O12.1,S9",
				"restriction": "position, length, percentage"
			},
			{
				"name": "transform-style",
				"desc": "Defines how nested elements are rendered in 3D space.",
				"browsers": "E,C36,FF16,IE10,O23,S9",
				"restriction": "enum",
				"values": [
					{
						"name": "flat"
					},
					{
						"name": "preserve-3d",
						"browsers": "E,C36,FF16,O23,S9"
					}
				]
			},
			{
				"name": "transition",
				"desc": "Shorthand property combines four of the transition properties into a single property.",
				"browsers": "E,FF16,IE10,O12.5",
				"restriction": "time, property, timing-function, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "transition-delay",
				"desc": "Defines when the transition will start. It allows a transition to begin execution some period of time from when it is applied.",
				"browsers": "E,FF16,IE10,O12.5",
				"restriction": "time"
			},
			{
				"name": "transition-duration",
				"desc": "Specifies how long the transition from the old value to the new value should take.",
				"browsers": "E,FF16,IE10,O12.5",
				"restriction": "time"
			},
			{
				"name": "transition-property",
				"desc": "Specifies the name of the CSS property to which the transition is applied.",
				"browsers": "E,FF16,IE10,O12.5",
				"restriction": "property",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "transition-timing-function",
				"desc": "Describes how the intermediate values used during a transition will be calculated.",
				"browsers": "E,FF16,IE10,O12.5",
				"restriction": "timing-function"
			},
			{
				"name": "unicode-bidi",
				"desc": "The level of embedding with respect to the bidirectional algorithm.",
				"restriction": "enum",
				"values": [
					{
						"name": "bidi-override"
					},
					{
						"name": "embed"
					},
					{
						"name": "isolate",
						"desc": "The contents of the element are considered to be inside a separate, independent paragraph.",
						"browsers": "C,FF10,O15,S5.1"
					},
					{
						"name": "isolate-override",
						"browsers": "C,FF17,O15,S6.1"
					},
					{
						"name": "normal",
						"desc": "The element does not open an additional level of embedding with respect to the bidirectional algorithm. For inline-level elements, implicit reordering works across element boundaries."
					},
					{
						"name": "plaintext",
						"browsers": "C,FF10,O15,S6"
					}
				]
			},
			{
				"name": "unicode-range",
				"desc": "@font-face descriptor. Defines the set of Unicode codepoints that may be supported by the font face for which it is declared.",
				"restriction": "unicode-range",
				"values": [
					{
						"name": "U+26"
					},
					{
						"name": "U+20-24F, U+2B0-2FF, U+370-4FF, U+1E00-1EFF, U+2000-20CF, U+2100-23FF, U+2500-26FF, U+E000-F8FF, U+FB00–FB4F"
					},
					{
						"name": "U+20-17F, U+2B0-2FF, U+2000-206F, U+20A0-20CF, U+2100-21FF, U+2600-26FF"
					},
					{
						"name": "U+20-2FF, U+370-4FF, U+1E00-20CF, U+2100-23FF, U+2500-26FF, U+FB00-FB4F, U+FFF0-FFFD"
					},
					{
						"name": "U+20-4FF, U+530-58F, U+10D0-10FF, U+1E00-23FF, U+2440-245F, U+2500-26FF, U+FB00-FB4F, U+FE20-FE2F, U+FFF0-FFFD"
					},
					{
						"name": "U+00-7F"
					},
					{
						"name": "U+80-FF"
					},
					{
						"name": "U+100-17F"
					},
					{
						"name": "U+180-24F"
					},
					{
						"name": "U+1E00-1EFF"
					},
					{
						"name": "U+250-2AF"
					},
					{
						"name": "U+370-3FF"
					},
					{
						"name": "U+1F00-1FFF"
					},
					{
						"name": "U+400-4FF"
					},
					{
						"name": "U+500-52F"
					},
					{
						"name": "U+00-52F, U+1E00-1FFF, U+2200–22FF"
					},
					{
						"name": "U+530–58F"
					},
					{
						"name": "U+590–5FF"
					},
					{
						"name": "U+600–6FF"
					},
					{
						"name": "U+750–77F"
					},
					{
						"name": "U+8A0–8FF"
					},
					{
						"name": "U+700–74F"
					},
					{
						"name": "U+900–97F"
					},
					{
						"name": "U+980–9FF"
					},
					{
						"name": "U+A00–A7F"
					},
					{
						"name": "U+A80–AFF"
					},
					{
						"name": "U+B00–B7F"
					},
					{
						"name": "U+B80–BFF"
					},
					{
						"name": "U+C00–C7F"
					},
					{
						"name": "U+C80–CFF"
					},
					{
						"name": "U+D00–D7F"
					},
					{
						"name": "U+D80–DFF"
					},
					{
						"name": "U+118A0–118FF"
					},
					{
						"name": "U+E00–E7F"
					},
					{
						"name": "U+1A20–1AAF"
					},
					{
						"name": "U+AA80–AADF"
					},
					{
						"name": "U+E80–EFF"
					},
					{
						"name": "U+F00–FFF"
					},
					{
						"name": "U+1000–109F"
					},
					{
						"name": "U+10A0–10FF"
					},
					{
						"name": "U+1200–137F"
					},
					{
						"name": "U+1380–139F"
					},
					{
						"name": "U+2D80–2DDF"
					},
					{
						"name": "U+AB00–AB2F"
					},
					{
						"name": "U+1780–17FF"
					},
					{
						"name": "U+1800–18AF"
					},
					{
						"name": "U+1B80–1BBF"
					},
					{
						"name": "U+1CC0–1CCF"
					},
					{
						"name": "U+4E00–9FD5"
					},
					{
						"name": "U+3400–4DB5"
					},
					{
						"name": "U+2F00–2FDF"
					},
					{
						"name": "U+2E80–2EFF"
					},
					{
						"name": "U+1100–11FF"
					},
					{
						"name": "U+AC00–D7AF"
					},
					{
						"name": "U+3040–309F"
					},
					{
						"name": "U+30A0–30FF"
					},
					{
						"name": "U+A5, U+4E00-9FFF, U+30??, U+FF00-FF9F"
					},
					{
						"name": "U+A4D0–A4FF"
					},
					{
						"name": "U+A000–A48F"
					},
					{
						"name": "U+A490–A4CF"
					},
					{
						"name": "U+2000-206F"
					},
					{
						"name": "U+3000–303F"
					},
					{
						"name": "U+2070–209F"
					},
					{
						"name": "U+20A0–20CF"
					},
					{
						"name": "U+2100–214F"
					},
					{
						"name": "U+2150–218F"
					},
					{
						"name": "U+2190–21FF"
					},
					{
						"name": "U+2200–22FF"
					},
					{
						"name": "U+2300–23FF"
					},
					{
						"name": "U+E000-F8FF"
					},
					{
						"name": "U+FB00–FB4F"
					},
					{
						"name": "U+FB50–FDFF"
					},
					{
						"name": "U+1F600–1F64F"
					},
					{
						"name": "U+2600–26FF"
					},
					{
						"name": "U+1F300–1F5FF"
					},
					{
						"name": "U+1F900–1F9FF"
					},
					{
						"name": "U+1F680–1F6FF"
					}
				]
			},
			{
				"name": "vertical-align",
				"desc": "Affects the vertical positioning of the inline boxes generated by an inline-level element inside a line box.",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "auto",
						"desc": "Align the dominant baseline of the parent box with the equivalent, or heuristically reconstructed, baseline of the element inline box."
					},
					{
						"name": "baseline",
						"desc": "Align the 'alphabetic' baseline of the element with the 'alphabetic' baseline of the parent element."
					},
					{
						"name": "bottom",
						"desc": "Align the after edge of the extended inline box with the after-edge of the line box."
					},
					{
						"name": "middle",
						"desc": "Align the 'middle' baseline of the inline element with the middle baseline of the parent."
					},
					{
						"name": "sub",
						"desc": "Lower the baseline of the box to the proper position for subscripts of the parent's box. (This value has no effect on the font size of the element's text.)"
					},
					{
						"name": "super",
						"desc": "Raise the baseline of the box to the proper position for superscripts of the parent's box. (This value has no effect on the font size of the element's text.)"
					},
					{
						"name": "text-bottom"
					},
					{
						"name": "text-top"
					},
					{
						"name": "top",
						"desc": "Align the before edge of the extended inline box with the before-edge of the line box."
					},
					{
						"name": "-webkit-baseline-middle",
						"browsers": "C,S1"
					}
				]
			},
			{
				"name": "visibility",
				"desc": "Specifies whether the boxes generated by an element are rendered. Invisible boxes still affect layout (set the ‘display’ property to ‘none’ to suppress box generation altogether).",
				"restriction": "enum",
				"values": [
					{
						"name": "collapse",
						"desc": "Table-specific. If used on elements other than rows, row groups, columns, or column groups, 'collapse' has the same meaning as 'hidden'."
					},
					{
						"name": "hidden",
						"desc": "The generated box is invisible (fully transparent, nothing is drawn), but still affects layout."
					},
					{
						"name": "visible",
						"desc": "The generated box is visible."
					}
				]
			},
			{
				"name": "-webkit-animation",
				"desc": "Shorthand property combines six of the animation properties into a single property.",
				"browsers": "C,S5",
				"restriction": "time, enum, timing-function, identifier, number",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "backwards"
					},
					{
						"name": "both",
						"desc": "Both forwards and backwards fill modes are applied."
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					},
					{
						"name": "none",
						"desc": "No animation is performed"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "-webkit-animation-delay",
				"desc": "Defines when the animation will start.",
				"browsers": "C,S5",
				"restriction": "time"
			},
			{
				"name": "-webkit-animation-direction",
				"desc": "Defines whether or not the animation should play in reverse on alternate cycles.",
				"browsers": "C,S5",
				"restriction": "enum",
				"values": [
					{
						"name": "alternate"
					},
					{
						"name": "alternate-reverse"
					},
					{
						"name": "normal",
						"desc": "Normal playback."
					},
					{
						"name": "reverse",
						"desc": "All iterations of the animation are played in the reverse direction from the way they were specified."
					}
				]
			},
			{
				"name": "-webkit-animation-duration",
				"desc": "Defines the length of time that an animation takes to complete one cycle.",
				"browsers": "C,S5",
				"restriction": "time"
			},
			{
				"name": "-webkit-animation-fill-mode",
				"desc": "Defines what values are applied by the animation outside the time it is executing.",
				"browsers": "C,S5",
				"restriction": "enum",
				"values": [
					{
						"name": "backwards"
					},
					{
						"name": "both",
						"desc": "Both forwards and backwards fill modes are applied."
					},
					{
						"name": "forwards"
					},
					{
						"name": "none",
						"desc": "There is no change to the property value between the time the animation is applied and the time the animation begins playing or after the animation completes."
					}
				]
			},
			{
				"name": "-webkit-animation-iteration-count",
				"desc": "Defines the number of times an animation cycle is played. The default value is one, meaning the animation will play from beginning to end once.",
				"browsers": "C,S5",
				"restriction": "number, enum",
				"values": [
					{
						"name": "infinite",
						"desc": "Causes the animation to repeat forever."
					}
				]
			},
			{
				"name": "-webkit-animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "C,S5",
				"restriction": "identifier, enum",
				"values": [
					{
						"name": "none",
						"desc": "No animation is performed"
					}
				]
			},
			{
				"name": "-webkit-animation-play-state",
				"desc": "Defines whether the animation is running or paused.",
				"browsers": "C,S5",
				"restriction": "enum",
				"values": [
					{
						"name": "paused"
					},
					{
						"name": "running"
					}
				]
			},
			{
				"name": "-webkit-animation-timing-function",
				"desc": "Describes how the animation will progress over one cycle of its duration. See the 'transition-timing-function'.",
				"browsers": "C,S5",
				"restriction": "timing-function"
			},
			{
				"name": "-webkit-appearance",
				"desc": "Changes the appearance of buttons and other controls to resemble native controls.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "button"
					},
					{
						"name": "button-bevel"
					},
					{
						"name": "caps-lock-indicator"
					},
					{
						"name": "caret"
					},
					{
						"name": "checkbox"
					},
					{
						"name": "default-button"
					},
					{
						"name": "listbox"
					},
					{
						"name": "listitem"
					},
					{
						"name": "media-fullscreen-button"
					},
					{
						"name": "media-mute-button"
					},
					{
						"name": "media-play-button"
					},
					{
						"name": "media-seek-back-button"
					},
					{
						"name": "media-seek-forward-button"
					},
					{
						"name": "media-slider"
					},
					{
						"name": "media-sliderthumb"
					},
					{
						"name": "menulist"
					},
					{
						"name": "menulist-button"
					},
					{
						"name": "menulist-text"
					},
					{
						"name": "menulist-textfield"
					},
					{
						"name": "none"
					},
					{
						"name": "push-button"
					},
					{
						"name": "radio"
					},
					{
						"name": "scrollbarbutton-down"
					},
					{
						"name": "scrollbarbutton-left"
					},
					{
						"name": "scrollbarbutton-right"
					},
					{
						"name": "scrollbarbutton-up"
					},
					{
						"name": "scrollbargripper-horizontal"
					},
					{
						"name": "scrollbargripper-vertical"
					},
					{
						"name": "scrollbarthumb-horizontal"
					},
					{
						"name": "scrollbarthumb-vertical"
					},
					{
						"name": "scrollbartrack-horizontal"
					},
					{
						"name": "scrollbartrack-vertical"
					},
					{
						"name": "searchfield"
					},
					{
						"name": "searchfield-cancel-button"
					},
					{
						"name": "searchfield-decoration"
					},
					{
						"name": "searchfield-results-button"
					},
					{
						"name": "searchfield-results-decoration"
					},
					{
						"name": "slider-horizontal"
					},
					{
						"name": "sliderthumb-horizontal"
					},
					{
						"name": "sliderthumb-vertical"
					},
					{
						"name": "slider-vertical"
					},
					{
						"name": "square-button"
					},
					{
						"name": "textarea"
					},
					{
						"name": "textfield"
					}
				]
			},
			{
				"name": "-webkit-backdrop-filter",
				"desc": "Applies a filter effect where the first filter in the list takes the element's background image as the input image.",
				"browsers": "S9",
				"restriction": "enum, url",
				"values": [
					{
						"name": "none",
						"desc": "No filter effects are applied."
					},
					{
						"name": "blur()"
					},
					{
						"name": "brightness()"
					},
					{
						"name": "contrast()"
					},
					{
						"name": "drop-shadow()"
					},
					{
						"name": "grayscale()"
					},
					{
						"name": "hue-rotate()"
					},
					{
						"name": "invert()"
					},
					{
						"name": "opacity()"
					},
					{
						"name": "saturate()"
					},
					{
						"name": "sepia()"
					},
					{
						"name": "url()",
						"desc": "A filter reference to a <filter> element."
					}
				]
			},
			{
				"name": "-webkit-backface-visibility",
				"desc": "Determines whether or not the 'back' side of a transformed element is visible when facing the viewer. With an identity transform, the front side of an element faces the viewer.",
				"browsers": "C,S5",
				"restriction": "enum",
				"values": [
					{
						"name": "hidden"
					},
					{
						"name": "visible"
					}
				]
			},
			{
				"name": "-webkit-background-clip",
				"desc": "Determines the background painting area.",
				"browsers": "C,S3",
				"restriction": "box"
			},
			{
				"name": "-webkit-background-composite",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "border"
					},
					{
						"name": "padding"
					}
				]
			},
			{
				"name": "-webkit-background-origin",
				"desc": "For elements rendered as a single box, specifies the background positioning area. For elements rendered as multiple boxes (e.g., inline boxes on several lines, boxes on several pages) specifies which boxes 'box-decoration-break' operates on to determine the background positioning area(s).",
				"browsers": "C,S3",
				"restriction": "box"
			},
			{
				"name": "-webkit-border-image",
				"desc": "Shorthand property for setting 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset' and 'border-image-repeat'. Omitted values are set to their initial values.",
				"browsers": "C,S5",
				"restriction": "length, percentage, number, url, enum",
				"values": [
					{
						"name": "auto",
						"desc": "If 'auto' is specified then the border image width is the intrinsic width or height (whichever is applicable) of the corresponding image slice. If the image does not have the required intrinsic dimension then the corresponding border-width is used instead."
					},
					{
						"name": "fill",
						"desc": "Causes the middle part of the border-image to be preserved."
					},
					{
						"name": "none"
					},
					{
						"name": "repeat"
					},
					{
						"name": "round",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the image is rescaled so that it does."
					},
					{
						"name": "space",
						"desc": "The image is tiled (repeated) to fill the area. If it does not fill the area with a whole number of tiles, the extra space is distributed around the tiles."
					},
					{
						"name": "stretch",
						"desc": "The image is stretched to fill the area."
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "-webkit-box-align",
				"desc": "Specifies the alignment of nested elements within an outer flexible box element.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "baseline",
						"desc": "If this box orientation is inline-axis or horizontal, all children are placed with their baselines aligned, and extra space placed before or after as necessary. For block flows, the baseline of the first non-empty line box located within the element is used. For tables, the baseline of the first cell is used."
					},
					{
						"name": "center",
						"desc": "Any extra space is divided evenly, with half placed above the child and the other half placed after the child."
					},
					{
						"name": "end",
						"desc": "For normal direction boxes, the bottom edge of each child is placed along the bottom of the box. Extra space is placed above the element. For reverse direction boxes, the top edge of each child is placed along the top of the box. Extra space is placed below the element."
					},
					{
						"name": "start",
						"desc": "For normal direction boxes, the top edge of each child is placed along the top of the box. Extra space is placed below the element. For reverse direction boxes, the bottom edge of each child is placed along the bottom of the box. Extra space is placed above the element."
					},
					{
						"name": "stretch",
						"desc": "The height of each child is adjusted to that of the containing block."
					}
				]
			},
			{
				"name": "-webkit-box-direction",
				"desc": "In webkit applications, -webkit-box-direction specifies whether a box lays out its contents normally (from the top or left edge), or in reverse (from the bottom or right edge).",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "normal",
						"desc": "A box with a computed value of horizontal for box-orient displays its children from left to right. A box with a computed value of vertical displays its children from top to bottom."
					},
					{
						"name": "reverse",
						"desc": "A box with a computed value of horizontal for box-orient displays its children from right to left. A box with a computed value of vertical displays its children from bottom to top."
					}
				]
			},
			{
				"name": "-webkit-box-flex",
				"desc": "Specifies an element's flexibility.",
				"browsers": "C,S3",
				"restriction": "number"
			},
			{
				"name": "-webkit-box-flex-group",
				"desc": "Flexible elements can be assigned to flex groups using the 'box-flex-group' property.",
				"browsers": "C,S3",
				"restriction": "integer"
			},
			{
				"name": "-webkit-box-ordinal-group",
				"desc": "Indicates the ordinal group the element belongs to. Elements with a lower ordinal group are displayed before those with a higher ordinal group.",
				"browsers": "C,S3",
				"restriction": "integer"
			},
			{
				"name": "-webkit-box-orient",
				"desc": "In webkit applications, -webkit-box-orient specifies whether a box lays out its contents horizontally or vertically.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "block-axis"
					},
					{
						"name": "horizontal",
						"desc": "The box displays its children from left to right in a horizontal line."
					},
					{
						"name": "inline-axis"
					},
					{
						"name": "vertical",
						"desc": "The box displays its children from stacked from top to bottom vertically."
					}
				]
			},
			{
				"name": "-webkit-box-pack",
				"desc": "Specifies alignment of child elements within the current element in the direction of orientation.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "The extra space is divided evenly, with half placed before the first child and the other half placed after the last child."
					},
					{
						"name": "end",
						"desc": "For normal direction boxes, the right edge of the last child is placed at the right side, with all extra space placed before the first child. For reverse direction boxes, the left edge of the first child is placed at the left side, with all extra space placed after the last child."
					},
					{
						"name": "justify",
						"desc": "The space is divided evenly in-between each child, with none of the extra space placed before the first child or after the last child. If there is only one child, treat the pack value as if it were start."
					},
					{
						"name": "start",
						"desc": "For normal direction boxes, the left edge of the first child is placed at the left side, with all extra space placed after the last child. For reverse direction boxes, the right edge of the last child is placed at the right side, with all extra space placed before the first child."
					}
				]
			},
			{
				"name": "-webkit-box-reflect",
				"desc": "Defines a reflection of a border box.",
				"browsers": "C,S4",
				"values": [
					{
						"name": "above",
						"desc": "The reflection appears above the border box."
					},
					{
						"name": "below",
						"desc": "The reflection appears below the border box."
					},
					{
						"name": "left",
						"desc": "The reflection appears to the left of the border box."
					},
					{
						"name": "right",
						"desc": "The reflection appears to the right of the border box."
					}
				]
			},
			{
				"name": "-webkit-box-sizing",
				"desc": "Box Model addition in CSS3.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "border-box"
					},
					{
						"name": "content-box"
					}
				]
			},
			{
				"name": "-webkit-break-after",
				"desc": "Describes the page/column break behavior before the generated box.",
				"browsers": "S7",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break before/after the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page/column break before/after the generated box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break before/after the generated box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break before/after the generated box."
					},
					{
						"name": "avoid-region"
					},
					{
						"name": "column",
						"desc": "Always force a column break before/after the generated box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "page",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "region"
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "-webkit-break-before",
				"desc": "Describes the page/column break behavior before the generated box.",
				"browsers": "S7",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break before/after the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page/column break before/after the generated box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break before/after the generated box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break before/after the generated box."
					},
					{
						"name": "avoid-region"
					},
					{
						"name": "column",
						"desc": "Always force a column break before/after the generated box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "page",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "region"
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "-webkit-break-inside",
				"desc": "Describes the page/column break behavior inside the generated box.",
				"browsers": "S7",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break inside the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page/column break inside the generated box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break inside the generated box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break inside the generated box."
					},
					{
						"name": "avoid-region"
					}
				]
			},
			{
				"name": "-webkit-column-break-after",
				"desc": "Describes the page/column break behavior before the generated box.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break before/after the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page/column break before/after the generated box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break before/after the generated box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break before/after the generated box."
					},
					{
						"name": "avoid-region"
					},
					{
						"name": "column",
						"desc": "Always force a column break before/after the generated box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "page",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "region"
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "-webkit-column-break-before",
				"desc": "Describes the page/column break behavior before the generated box.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "always",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break before/after the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page/column break before/after the generated box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break before/after the generated box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break before/after the generated box."
					},
					{
						"name": "avoid-region"
					},
					{
						"name": "column",
						"desc": "Always force a column break before/after the generated box."
					},
					{
						"name": "left",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a left page."
					},
					{
						"name": "page",
						"desc": "Always force a page break before/after the generated box."
					},
					{
						"name": "region"
					},
					{
						"name": "right",
						"desc": "Force one or two page breaks before/after the generated box so that the next page is formatted as a right page."
					}
				]
			},
			{
				"name": "-webkit-column-break-inside",
				"desc": "Describes the page/column break behavior inside the generated box.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Neither force nor forbid a page/column break inside the generated box."
					},
					{
						"name": "avoid",
						"desc": "Avoid a page/column break inside the generated box."
					},
					{
						"name": "avoid-column",
						"desc": "Avoid a column break inside the generated box."
					},
					{
						"name": "avoid-page",
						"desc": "Avoid a page break inside the generated box."
					},
					{
						"name": "avoid-region"
					}
				]
			},
			{
				"name": "-webkit-column-count",
				"desc": "Describes the optimal number of columns into which the content of the element will be flowed.",
				"browsers": "C,S3",
				"restriction": "integer",
				"values": [
					{
						"name": "auto",
						"desc": "Determines the number of columns by the 'column-width' property and the element width."
					}
				]
			},
			{
				"name": "-webkit-column-gap",
				"desc": "Sets the gap between columns. If there is a column rule between columns, it will appear in the middle of the gap.",
				"browsers": "C,S3",
				"restriction": "length",
				"values": [
					{
						"name": "normal",
						"desc": "User agent specific and typically equivalent to 1em."
					}
				]
			},
			{
				"name": "-webkit-column-rule",
				"desc": "This property is a shorthand for setting 'column-rule-width', 'column-rule-style', and 'column-rule-color' at the same place in the style sheet. Omitted values are set to their initial values.",
				"browsers": "C,S3",
				"restriction": "length, line-width, line-style, color"
			},
			{
				"name": "-webkit-column-rule-color",
				"desc": "Sets the color of the column rule",
				"browsers": "C,S3",
				"restriction": "color"
			},
			{
				"name": "-webkit-column-rule-style",
				"desc": "Sets the style of the rule between columns of an element.",
				"browsers": "C,S3",
				"restriction": "line-style"
			},
			{
				"name": "-webkit-column-rule-width",
				"desc": "Sets the width of the rule between columns. Negative values are not allowed.",
				"browsers": "C,S3",
				"restriction": "length, line-width"
			},
			{
				"name": "-webkit-columns",
				"desc": "A shorthand property which sets both 'column-width' and 'column-count'.",
				"browsers": "C,S3",
				"restriction": "length, integer",
				"values": [
					{
						"name": "auto",
						"desc": "The width depends on the values of other properties."
					}
				]
			},
			{
				"name": "-webkit-column-span",
				"desc": "Describes the page/column break behavior after the generated box.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "all",
						"desc": "The element spans across all columns. Content in the normal flow that appears before the element is automatically balanced across all columns before the element appear."
					},
					{
						"name": "none",
						"desc": "The element does not span multiple columns."
					}
				]
			},
			{
				"name": "-webkit-column-width",
				"desc": "This property describes the width of columns in multicol elements.",
				"browsers": "C,S3",
				"restriction": "length",
				"values": [
					{
						"name": "auto",
						"desc": "The width depends on the values of other properties."
					}
				]
			},
			{
				"name": "-webkit-filter",
				"desc": "Processes an element’s rendering before it is displayed in the document, by applying one or more filter effects.",
				"browsers": "C18,O15,S6",
				"restriction": "enum, url",
				"values": [
					{
						"name": "none",
						"desc": "No filter effects are applied."
					},
					{
						"name": "blur()"
					},
					{
						"name": "brightness()"
					},
					{
						"name": "contrast()"
					},
					{
						"name": "drop-shadow()"
					},
					{
						"name": "grayscale()"
					},
					{
						"name": "hue-rotate()"
					},
					{
						"name": "invert()"
					},
					{
						"name": "opacity()"
					},
					{
						"name": "saturate()"
					},
					{
						"name": "sepia()"
					},
					{
						"name": "url()",
						"desc": "A filter reference to a <filter> element."
					}
				]
			},
			{
				"name": "-webkit-flow-from",
				"desc": "Makes a block container a region and associates it with a named flow.",
				"browsers": "S6.1",
				"restriction": "identifier",
				"values": [
					{
						"name": "none",
						"desc": "The block container is not a CSS Region."
					}
				]
			},
			{
				"name": "-webkit-flow-into",
				"desc": "Places an element or its contents into a named flow.",
				"browsers": "S6.1",
				"restriction": "identifier",
				"values": [
					{
						"name": "none",
						"desc": "The element is not moved to a named flow and normal CSS processing takes place."
					}
				]
			},
			{
				"name": "-webkit-font-feature-settings",
				"desc": "This property provides low-level control over OpenType font features. It is intended as a way of providing access to font features that are not widely used but are needed for a particular use case.",
				"browsers": "C16",
				"restriction": "string, integer",
				"values": [
					{
						"name": "\"c2cs\""
					},
					{
						"name": "\"dlig\""
					},
					{
						"name": "\"kern\""
					},
					{
						"name": "\"liga\""
					},
					{
						"name": "\"lnum\""
					},
					{
						"name": "\"onum\""
					},
					{
						"name": "\"smcp\""
					},
					{
						"name": "\"swsh\""
					},
					{
						"name": "\"tnum\""
					},
					{
						"name": "normal",
						"desc": "No change in glyph substitution or positioning occurs."
					},
					{
						"name": "off"
					},
					{
						"name": "on"
					}
				]
			},
			{
				"name": "-webkit-hyphens",
				"desc": "Controls whether hyphenation is allowed to create more break opportunities within a line of text.",
				"browsers": "S5.1",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Conditional hyphenation characters inside a word, if present, take priority over automatic resources when determining hyphenation points within the word."
					},
					{
						"name": "manual"
					},
					{
						"name": "none",
						"desc": "Words are not broken at line breaks, even if characters inside the word suggest line break points."
					}
				]
			},
			{
				"name": "-webkit-line-break",
				"desc": "Specifies line-breaking rules for CJK (Chinese, Japanese, and Korean) text.",
				"browsers": "C,S3",
				"values": [
					{
						"name": "after-white-space"
					},
					{
						"name": "normal"
					}
				]
			},
			{
				"name": "-webkit-margin-bottom-collapse",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "collapse"
					},
					{
						"name": "discard"
					},
					{
						"name": "separate"
					}
				]
			},
			{
				"name": "-webkit-margin-collapse",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "collapse"
					},
					{
						"name": "discard"
					},
					{
						"name": "separate"
					}
				]
			},
			{
				"name": "-webkit-margin-start",
				"browsers": "C,S3",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "auto"
					}
				]
			},
			{
				"name": "-webkit-margin-top-collapse",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "collapse"
					},
					{
						"name": "discard"
					},
					{
						"name": "separate"
					}
				]
			},
			{
				"name": "-webkit-mask-clip",
				"desc": "Determines the mask painting area, which determines the area that is affected by the mask.",
				"browsers": "C,O15,S4",
				"restriction": "box"
			},
			{
				"name": "-webkit-mask-image",
				"desc": "Sets the mask layer image of an element.",
				"browsers": "C,O15,S4",
				"restriction": "url, image, enum",
				"values": [
					{
						"name": "none",
						"desc": "Counts as a transparent black image layer."
					},
					{
						"name": "url()",
						"desc": "Reference to a <mask element or to a CSS image."
					}
				]
			},
			{
				"name": "-webkit-mask-origin",
				"desc": "Specifies the mask positioning area.",
				"browsers": "C,O15,S4",
				"restriction": "box"
			},
			{
				"name": "-webkit-mask-repeat",
				"desc": "Specifies how mask layer images are tiled after they have been sized and positioned.",
				"browsers": "C,O15,S4",
				"restriction": "repeat"
			},
			{
				"name": "-webkit-mask-size",
				"desc": "Specifies the size of the mask layer images.",
				"browsers": "C,O15,S4",
				"restriction": "length, percentage, enum",
				"values": [
					{
						"name": "auto",
						"desc": "Resolved by using the image’s intrinsic ratio and the size of the other dimension, or failing that, using the image’s intrinsic size, or failing that, treating it as 100%."
					},
					{
						"name": "contain",
						"desc": "Scale the image, while preserving its intrinsic aspect ratio (if any), to the largest size such that both its width and its height can fit inside the background positioning area."
					},
					{
						"name": "cover",
						"desc": "Scale the image, while preserving its intrinsic aspect ratio (if any), to the smallest size such that both its width and its height can completely cover the background positioning area."
					}
				]
			},
			{
				"name": "-webkit-nbsp-mode",
				"desc": "Defines the behavior of nonbreaking spaces within text.",
				"browsers": "C,S3",
				"values": [
					{
						"name": "normal"
					},
					{
						"name": "space"
					}
				]
			},
			{
				"name": "-webkit-overflow-scrolling",
				"desc": "Specifies whether to use native-style scrolling in an overflow:scroll element.",
				"browsers": "C,S5",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "touch"
					}
				]
			},
			{
				"name": "-webkit-padding-start",
				"browsers": "C,S3",
				"restriction": "percentage, length"
			},
			{
				"name": "-webkit-perspective",
				"desc": "Applies the same transform as the perspective(<number>) transform function, except that it applies only to the positioned or transformed children of the element, not to the transform on the element itself.",
				"browsers": "C,S4",
				"restriction": "length",
				"values": [
					{
						"name": "none",
						"desc": "No perspective transform is applied."
					}
				]
			},
			{
				"name": "-webkit-perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "C,S4",
				"restriction": "position, percentage, length"
			},
			{
				"name": "-webkit-region-fragment",
				"desc": "The 'region-fragment' property controls the behavior of the last region associated with a named flow.",
				"browsers": "S7",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "Content flows as it would in a regular content box."
					},
					{
						"name": "break"
					}
				]
			},
			{
				"name": "-webkit-tap-highlight-color",
				"browsers": "E,C,S3.1",
				"restriction": "color"
			},
			{
				"name": "-webkit-text-fill-color",
				"browsers": "E,C,S3",
				"restriction": "color"
			},
			{
				"name": "-webkit-text-size-adjust",
				"desc": "Specifies a size adjustment for displaying text content in mobile browsers.",
				"browsers": "E,C,S3",
				"restriction": "percentage",
				"values": [
					{
						"name": "auto",
						"desc": "Renderers must use the default size adjustment when displaying on a small device."
					},
					{
						"name": "none",
						"desc": "Renderers must not do size adjustment when displaying on a small device."
					}
				]
			},
			{
				"name": "-webkit-text-stroke",
				"browsers": "S3",
				"restriction": "length, line-width, color, percentage"
			},
			{
				"name": "-webkit-text-stroke-color",
				"browsers": "S3",
				"restriction": "color"
			},
			{
				"name": "-webkit-text-stroke-width",
				"browsers": "S3",
				"restriction": "length, line-width, percentage"
			},
			{
				"name": "-webkit-touch-callout",
				"browsers": "S3",
				"restriction": "enum",
				"values": [
					{
						"name": "none"
					}
				]
			},
			{
				"name": "-webkit-transform",
				"desc": "A two-dimensional transformation is applied to an element through the 'transform' property. This property contains a list of transform functions similar to those allowed by SVG.",
				"browsers": "C,O12,S3.1",
				"restriction": "enum",
				"values": [
					{
						"name": "matrix()"
					},
					{
						"name": "matrix3d()"
					},
					{
						"name": "none"
					},
					{
						"name": "perspective()"
					},
					{
						"name": "rotate()"
					},
					{
						"name": "rotate3d()"
					},
					{
						"name": "rotateX('angle')"
					},
					{
						"name": "rotateY('angle')"
					},
					{
						"name": "rotateZ('angle')"
					},
					{
						"name": "scale()"
					},
					{
						"name": "scale3d()"
					},
					{
						"name": "scaleX()"
					},
					{
						"name": "scaleY()"
					},
					{
						"name": "scaleZ()"
					},
					{
						"name": "skew()"
					},
					{
						"name": "skewX()"
					},
					{
						"name": "skewY()"
					},
					{
						"name": "translate()"
					},
					{
						"name": "translate3d()"
					},
					{
						"name": "translateX()"
					},
					{
						"name": "translateY()"
					},
					{
						"name": "translateZ()"
					}
				]
			},
			{
				"name": "-webkit-transform-origin",
				"desc": "Establishes the origin of transformation for an element.",
				"browsers": "C,O15,S3.1",
				"restriction": "position, length, percentage"
			},
			{
				"name": "-webkit-transform-origin-x",
				"desc": "The x coordinate of the origin for transforms applied to an element with respect to its border box.",
				"browsers": "C,S3.1",
				"restriction": "length, percentage"
			},
			{
				"name": "-webkit-transform-origin-y",
				"desc": "The y coordinate of the origin for transforms applied to an element with respect to its border box.",
				"browsers": "C,S3.1",
				"restriction": "length, percentage"
			},
			{
				"name": "-webkit-transform-origin-z",
				"desc": "The z coordinate of the origin for transforms applied to an element with respect to its border box.",
				"browsers": "C,S4",
				"restriction": "length, percentage"
			},
			{
				"name": "-webkit-transform-style",
				"desc": "Defines how nested elements are rendered in 3D space.",
				"browsers": "C,S4",
				"restriction": "enum",
				"values": [
					{
						"name": "flat"
					}
				]
			},
			{
				"name": "-webkit-transition",
				"desc": "Shorthand property combines four of the transition properties into a single property.",
				"browsers": "C,O12,S5",
				"restriction": "time, property, timing-function, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "-webkit-transition-delay",
				"desc": "Defines when the transition will start. It allows a transition to begin execution some period of time from when it is applied.",
				"browsers": "C,O12,S5",
				"restriction": "time"
			},
			{
				"name": "-webkit-transition-duration",
				"desc": "Specifies how long the transition from the old value to the new value should take.",
				"browsers": "C,O12,S5",
				"restriction": "time"
			},
			{
				"name": "-webkit-transition-property",
				"desc": "Specifies the name of the CSS property to which the transition is applied.",
				"browsers": "C,O12,S5",
				"restriction": "property",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "none",
						"desc": "No property will transition."
					}
				]
			},
			{
				"name": "-webkit-transition-timing-function",
				"desc": "Describes how the intermediate values used during a transition will be calculated.",
				"browsers": "C,O12,S5",
				"restriction": "timing-function"
			},
			{
				"name": "-webkit-user-drag",
				"browsers": "S3",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "element"
					},
					{
						"name": "none"
					}
				]
			},
			{
				"name": "-webkit-user-modify",
				"desc": "Determines whether a user can edit the content of an element.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "read-only"
					},
					{
						"name": "read-write"
					},
					{
						"name": "read-write-plaintext-only"
					}
				]
			},
			{
				"name": "-webkit-user-select",
				"desc": "Controls the appearance of selection.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "none"
					},
					{
						"name": "text"
					}
				]
			},
			{
				"name": "white-space",
				"desc": "Shorthand property for the 'white-space-collapsing' and 'text-wrap' properties.",
				"restriction": "enum",
				"values": [
					{
						"name": "normal",
						"desc": "Sets 'white-space-collapsing' to 'collapse' and 'text-wrap' to 'normal'."
					},
					{
						"name": "nowrap",
						"desc": "Sets 'white-space-collapsing' to 'collapse' and 'text-wrap' to 'none'."
					},
					{
						"name": "pre"
					},
					{
						"name": "pre-line"
					},
					{
						"name": "pre-wrap"
					}
				]
			},
			{
				"name": "widows",
				"desc": "Specifies the minimum number of line boxes of a block container that must be left in a fragment after a break.",
				"browsers": "C,IE8,O9.5,S1",
				"restriction": "integer"
			},
			{
				"name": "width",
				"desc": "Specifies the width of the content area, padding area or border area (depending on 'box-sizing') of certain boxes.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto",
						"desc": "The width depends on the values of other properties."
					},
					{
						"name": "fit-content",
						"browsers": "C46,O33"
					},
					{
						"name": "max-content",
						"browsers": "C46,O33"
					},
					{
						"name": "min-content",
						"browsers": "C46,O33"
					}
				]
			},
			{
				"name": "will-change",
				"desc": "Provides a rendering hint to the user agent, stating what kinds of changes the author expects to perform on the element.",
				"browsers": "C36,FF36,O24",
				"restriction": "enum, identifier",
				"values": [
					{
						"name": "auto",
						"desc": "Expresses no particular intent."
					},
					{
						"name": "contents"
					},
					{
						"name": "scroll-position"
					}
				]
			},
			{
				"name": "word-break",
				"desc": "Specifies line break opportunities for non-CJK scripts.",
				"browsers": "E,C,FF15,IE5,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "break-all"
					},
					{
						"name": "keep-all",
						"desc": "Block characters can no longer create implied break points."
					},
					{
						"name": "normal",
						"desc": "Breaks non-CJK scripts according to their own rules."
					}
				]
			},
			{
				"name": "word-spacing",
				"desc": "Specifies additional spacing between “words”.",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "normal",
						"desc": "No additional spacing is applied. Computes to zero."
					}
				]
			},
			{
				"name": "word-wrap",
				"desc": "Specifies whether the UA may break within a word to prevent overflow when an otherwise-unbreakable string is too long to fit.",
				"restriction": "enum",
				"values": [
					{
						"name": "break-word",
						"desc": "An otherwise unbreakable sequence of characters may be broken at an arbitrary point if there are no otherwise-acceptable break points in the line."
					},
					{
						"name": "normal",
						"desc": "Lines may break only at allowed break points."
					}
				]
			},
			{
				"name": "writing-mode",
				"desc": "This is a shorthand property for both 'direction' and 'block-progression'.",
				"browsers": "E,FF41",
				"restriction": "enum",
				"values": [
					{
						"name": "horizontal-tb"
					},
					{
						"name": "sideways-lr",
						"browsers": "FF43"
					},
					{
						"name": "sideways-rl",
						"browsers": "FF43"
					},
					{
						"name": "vertical-lr"
					},
					{
						"name": "vertical-rl"
					}
				]
			},
			{
				"name": "z-index",
				"desc": "For a positioned box, the 'z-index' property specifies the stack level of the box in the current stacking context and whether the box establishes a local stacking context.",
				"restriction": "integer",
				"values": [
					{
						"name": "auto",
						"desc": "The stack level of the generated box in the current stacking context is 0. The box does not establish a new stacking context unless it is the root element."
					}
				]
			},
			{
				"name": "zoom",
				"desc": "Non-standard. Specifies the magnification scale of the object. See 'transform: scale()' for a standards-based alternative.",
				"browsers": "E,C,IE6,O15,S4",
				"restriction": "enum, integer, number, percentage",
				"values": [
					{
						"name": "normal"
					}
				]
			}
		]
	}
};

exports.descriptions = {
	"100": "Thin",
	"200": "Extra Light (Ultra Light)",
	"300": "Light",
	"400": "Normal",
	"500": "Medium",
	"600": "Semi Bold (Demi Bold)",
	"700": "Bold",
	"800": "Extra Bold (Ultra Bold)",
	"900": "Black (Heavy)",
	"alternate": "The animation cycle iterations that are odd counts are played in the normal direction, and the animation cycle iterations that are even counts are played in a reverse direction.",
	"alternate-reverse": "The animation cycle iterations that are odd counts are played in the reverse direction, and the animation cycle iterations that are even counts are played in a normal direction.",
	"backwards": "The beginning property value (as defined in the first @keyframes at-rule) is applied before the animation is displayed, during the period defined by 'animation-delay'.",
	"forwards": "The final property value (as defined in the last @keyframes at-rule) is maintained after the animation completes.",
	"paused": "A running animation will be paused.",
	"running": "Resume playback of a paused animation.",
	"multiply": "The source color is multiplied by the destination color and replaces the destination.",
	"screen": "Multiplies the complements of the backdrop and source color values, then complements the result.",
	"overlay": "Multiplies or screens the colors, depending on the backdrop color value.",
	"darken": "Selects the darker of the backdrop and source colors.",
	"lighten": "Selects the lighter of the backdrop and source colors.",
	"color-dodge": "Brightens the backdrop color to reflect the source color.",
	"color-burn": "Darkens the backdrop color to reflect the source color.",
	"hard-light": "Multiplies or screens the colors, depending on the source color value.",
	"soft-light": "Darkens or lightens the colors, depending on the source color value.",
	"difference": "Subtracts the darker of the two constituent colors from the lighter color..",
	"exclusion": "Produces an effect similar to that of the Difference mode but lower in contrast.",
	"hue": "Creates a color with the hue of the source color and the saturation and luminosity of the backdrop color.",
	"saturation": "Creates a color with the saturation of the source color and the hue and luminosity of the backdrop color.",
	"color": "Creates a color with the hue and saturation of the source color and the luminosity of the backdrop color.",
	"luminosity": "Creates a color with the luminosity of the source color and the hue and saturation of the backdrop color.",
	"repeat": "The image is tiled (repeated) to fill the area.",
	"clone": "Each box is independently wrapped with the border and padding.",
	"slice": "The effect is as though the element were rendered with no breaks present, and then sliced by the breaks afterward.",
	"inset": "Changes the drop shadow from an outer shadow (one that shadows the box onto the canvas, as if it were lifted above the canvas) to an inner shadow (one that shadows the canvas onto the box, as if the box were cut out of the canvas and shifted behind it).",
	"border-box": "The specified width and height (and respective min/max properties) on this element determine the border box of the element.",
	"content-box": "Behavior of width and height as specified by CSS2.1. The specified width and height (and respective min/max properties) apply to the width and height respectively of the content box of the element.",
	"rect()": "Specifies offsets from the edges of the border box.",
	"evenodd": "Determines the ‘insideness’ of a point on the canvas by drawing a ray from that point to infinity in any direction and counting the number of path segments from the given shape that the ray crosses.",
	"nonzero": "Determines the ‘insideness’ of a point on the canvas by drawing a ray from that point to infinity in any direction and then examining the places where a segment of the shape crosses the ray.",
	"linearRGB": "Color operations should occur in the linearized RGB color space.",
	"sRGB": "Color operations should occur in the sRGB color space.",
	"balance": "Balance content equally between columns, if possible.",
	"attr()": "The attr(n) function returns as a string the value of attribute n for the subject of the selector.",
	"counter(name)": "Counters are denoted by identifiers (see the 'counter-increment' and 'counter-reset' properties).",
	"alias": "Indicates an alias of/shortcut to something is to be created. Often rendered as an arrow with a small curved arrow next to it.",
	"all-scroll": "Indicates that the something can be scrolled in any direction. Often rendered as arrows pointing up, down, left, and right with a dot in the middle.",
	"cell": "Indicates that a cell or set of cells may be selected. Often rendered as a thick plus-sign with a dot in the middle.",
	"col-resize": "Indicates that the item/column can be resized horizontally. Often rendered as arrows pointing left and right with a vertical bar separating them.",
	"context-menu": "A context menu is available for the object under the cursor. Often rendered as an arrow with a small menu-like graphic next to it.",
	"copy": "Indicates something is to be copied. Often rendered as an arrow with a small plus sign next to it.",
	"crosshair": "A simple crosshair (e.g., short line segments resembling a '+' sign). Often used to indicate a two dimensional bitmap selection mode.",
	"e-resize": "Indicates that east edge is to be moved.",
	"ew-resize": "Indicates a bidirectional east-west resize cursor.",
	"grab": "Indicates that something can be grabbed.",
	"grabbing": "Indicates that something is being grabbed.",
	"help": "Help is available for the object under the cursor. Often rendered as a question mark or a balloon.",
	"move": "Indicates something is to be moved.",
	"-moz-grab": "Indicates that something can be grabbed.",
	"-moz-grabbing": "Indicates that something is being grabbed.",
	"-moz-zoom-in": "Indicates that something can be zoomed (magnified) in.",
	"-moz-zoom-out": "Indicates that something can be zoomed (magnified) out.",
	"ne-resize": "Indicates that movement starts from north-east corner.",
	"nesw-resize": "Indicates a bidirectional north-east/south-west cursor.",
	"no-drop": "Indicates that the dragged item cannot be dropped at the current cursor location. Often rendered as a hand or pointer with a small circle with a line through it.",
	"not-allowed": "Indicates that the requested action will not be carried out. Often rendered as a circle with a line through it.",
	"n-resize": "Indicates that north edge is to be moved.",
	"ns-resize": "Indicates a bidirectional north-south cursor.",
	"nw-resize": "Indicates that movement starts from north-west corner.",
	"nwse-resize": "Indicates a bidirectional north-west/south-east cursor.",
	"pointer": "The cursor is a pointer that indicates a link.",
	"progress": "A progress indicator. The program is performing some processing, but is different from 'wait' in that the user may still interact with the program. Often rendered as a spinning beach ball, or an arrow with a watch or hourglass.",
	"row-resize": "Indicates that the item/row can be resized vertically. Often rendered as arrows pointing up and down with a horizontal bar separating them.",
	"se-resize": "Indicates that movement starts from south-east corner.",
	"s-resize": "Indicates that south edge is to be moved.",
	"sw-resize": "Indicates that movement starts from south-west corner.",
	"vertical-text": "Indicates vertical-text that may be selected. Often rendered as a horizontal I-beam.",
	"wait": "Indicates that the program is busy and the user should wait. Often rendered as a watch or hourglass.",
	"-webkit-grab": "Indicates that something can be grabbed.",
	"-webkit-grabbing": "Indicates that something is being grabbed.",
	"-webkit-zoom-in": "Indicates that something can be zoomed (magnified) in.",
	"-webkit-zoom-out": "Indicates that something can be zoomed (magnified) out.",
	"w-resize": "Indicates that west edge is to be moved.",
	"zoom-in": "Indicates that something can be zoomed (magnified) in.",
	"zoom-out": "Indicates that something can be zoomed (magnified) out.",
	"ltr": "Left-to-right direction.",
	"rtl": "Right-to-left direction.",
	"block": "The element generates a block-level box",
	"flex": "The element generates a principal flex container box and establishes a flex formatting context.",
	"flexbox": "The element lays out its contents using flow layout (block-and-inline layout). Standardized as 'flex'.",
	"inline-block": "A block box, which itself is flowed as a single inline box, similar to a replaced element. The inside of an inline-block is formatted as a block box, and the box itself is formatted as an inline box.",
	"inline-flex": "Inline-level flex container.",
	"inline-flexbox": "Inline-level flex container. Standardized as 'inline-flex'",
	"inline-table": "Inline-level table wrapper box containing table box.",
	"list-item": "One or more block boxes and one marker box.",
	"-moz-box": "The element lays out its contents using flow layout (block-and-inline layout). Standardized as 'flex'.",
	"-moz-inline-box": "Inline-level flex container. Standardized as 'inline-flex'",
	"-ms-flexbox": "The element lays out its contents using flow layout (block-and-inline layout). Standardized as 'flex'.",
	"-ms-grid": "The element generates a principal grid container box, and establishes a grid formatting context.",
	"-ms-inline-flexbox": "Inline-level flex container. Standardized as 'inline-flex'",
	"-ms-inline-grid": "Inline-level grid container.",
	"run-in": "The element generates a run-in box. Run-in elements act like inlines or blocks, depending on the surrounding elements.",
	"table": "The element generates a principal table wrapper box containing an additionally-generated table box, and establishes a table formatting context.",
	"-webkit-box": "The element lays out its contents using flow layout (block-and-inline layout). Standardized as 'flex'.",
	"-webkit-flex": "The element lays out its contents using flow layout (block-and-inline layout).",
	"-webkit-inline-box": "Inline-level flex container. Standardized as 'inline-flex'",
	"-webkit-inline-flex": "Inline-level flex container.",
	"hide": "No borders or backgrounds are drawn around/behind empty cells.",
	"show": "Borders and backgrounds are drawn around/behind empty cells (like normal cells).",
	"accumulate": "If the ancestor container element has a property of new, then all graphics elements within the current container are rendered both on the parent's background image and onto the target.",
	"new": "Create a new background image canvas. All children of the current container element can access the background, and they will be rendered onto both the parent's background image canvas in addition to the target device.",
	"blur()": "Applies a Gaussian blur to the input image.",
	"brightness()": "Applies a linear multiplier to input image, making it appear more or less bright.",
	"contrast()": "Adjusts the contrast of the input.",
	"drop-shadow()": "Applies a drop shadow effect to the input image.",
	"grayscale()": "Converts the input image to grayscale.",
	"hue-rotate()": "Applies a hue rotation on the input image. ",
	"invert()": "Inverts the samples in the input image.",
	"opacity()": "Applies transparency to the samples in the input image.",
	"saturate()": "Saturates the input image.",
	"sepia()": "Converts the input image to sepia.",
	"content": "Indicates automatic sizing, based on the flex item’s content.",
	"column-reverse": "Same as 'column', except the main-start and main-end directions are swapped.",
	"row": "The flex container’s main axis has the same orientation as the inline axis of the current writing mode.",
	"row-reverse": "Same as 'row', except the main-start and main-end directions are swapped.",
	"wrap-reverse": "Same as 'wrap', except the cross-start and cross-end directions are swapped.",
	"bold": "Same as 700",
	"bolder": "Specifies the weight of the face bolder than the inherited value.",
	"caption": "The font used for captioned controls (e.g., buttons, drop-downs, etc.).",
	"lighter": "Specifies the weight of the face lighter than the inherited value.",
	"menu": "The font used in menus (e.g., dropdown menus and menu lists).",
	"message-box": "The font used in dialog boxes.",
	"small-caption": "The font used for labeling small controls.",
	"status-bar": "The font used in window status bars.",
	"\"aalt\"": "Access All Alternates.",
	"\"abvf\"": "Above-base Forms. Required in Khmer script.",
	"\"abvm\"": "Above-base Mark Positioning. Required in Indic scripts.",
	"\"abvs\"": "Above-base Substitutions. Required in Indic scripts.",
	"\"afrc\"": "Alternative Fractions.",
	"\"akhn\"": "Akhand. Required in most Indic scripts.",
	"\"blwf\"": "Below-base Form. Required in a number of Indic scripts.",
	"\"blwm\"": "Below-base Mark Positioning. Required in Indic scripts.",
	"\"blws\"": "Below-base Substitutions. Required in Indic scripts.",
	"\"calt\"": "Contextual Alternates.",
	"\"case\"": "Case-Sensitive Forms. Applies only to European scripts; particularly prominent in Spanish-language setting.",
	"\"ccmp\"": "Glyph Composition/Decomposition.",
	"\"cfar\"": "Conjunct Form After Ro. Required in Khmer scripts.",
	"\"cjct\"": "Conjunct Forms. Required in Indic scripts that show similarity to Devanagari.",
	"\"clig\"": "Contextual Ligatures.",
	"\"cpct\"": "Centered CJK Punctuation. Used primarily in Chinese fonts.",
	"\"cpsp\"": "Capital Spacing. Should not be used in connecting scripts (e.g. most Arabic).",
	"\"cswh\"": "Contextual Swash.",
	"\"curs\"": "Cursive Positioning. Can be used in any cursive script.",
	"\"c2pc\"": "Petite Capitals From Capitals. Applies only to bicameral scripts.",
	"\"dist\"": "Distances. Required in Indic scripts.",
	"\"dnom\"": "Denominators.",
	"\"dtls\"": "Dotless Forms. Applied to math formula layout.",
	"\"expt\"": "Expert Forms. Applies only to Japanese.",
	"\"falt\"": "Final Glyph on Line Alternates. Can be used in any cursive script.",
	"\"fin2\"": "Terminal Form #2. Used only with the Syriac script.",
	"\"fin3\"": "Terminal Form #3. Used only with the Syriac script.",
	"\"fina\"": "Terminal Forms. Can be used in any alphabetic script.",
	"\"flac\"": "Flattened ascent forms. Applied to math formula layout.",
	"\"frac\"": "Fractions.",
	"\"fwid\"": "Full Widths. Applies to any script which can use monospaced forms.",
	"\"half\"": "Half Forms. Required in Indic scripts that show similarity to Devanagari.",
	"\"haln\"": "Halant Forms. Required in Indic scripts.",
	"\"halt\"": "Alternate Half Widths. Used only in CJKV fonts.",
	"\"hist\"": "Historical Forms.",
	"\"hkna\"": "Horizontal Kana Alternates. Applies only to fonts that support kana (hiragana and katakana).",
	"\"hlig\"": "Historical Ligatures.",
	"\"hngl\"": "Hangul. Korean only.",
	"\"hojo\"": "Hojo Kanji Forms (JIS X 0212-1990 Kanji Forms). Used only with Kanji script.",
	"\"hwid\"": "Half Widths. Generally used only in CJKV fonts.",
	"\"init\"": "Initial Forms. Can be used in any alphabetic script.",
	"\"isol\"": "Isolated Forms. Can be used in any cursive script.",
	"\"ital\"": "Italics. Applies mostly to Latin; note that many non-Latin fonts contain Latin as well.",
	"\"jalt\"": "Justification Alternates. Can be used in any cursive script.",
	"\"jp78\"": "JIS78 Forms. Applies only to Japanese.",
	"\"jp83\"": "JIS83 Forms. Applies only to Japanese.",
	"\"jp90\"": "JIS90 Forms. Applies only to Japanese.",
	"\"jp04\"": "JIS2004 Forms. Applies only to Japanese.",
	"\"lfbd\"": "Left Bounds.",
	"\"ljmo\"": "Leading Jamo Forms. Required for Hangul script when Ancient Hangul writing system is supported.",
	"\"locl\"": "Localized Forms.",
	"\"ltra\"": "Left-to-right glyph alternates.",
	"\"ltrm\"": "Left-to-right mirrored forms.",
	"\"mark\"": "Mark Positioning.",
	"\"med2\"": "Medial Form #2. Used only with the Syriac script.",
	"\"medi\"": "Medial Forms.",
	"\"mgrk\"": "Mathematical Greek.",
	"\"mkmk\"": "Mark to Mark Positioning.",
	"\"nalt\"": "Alternate Annotation Forms.",
	"\"nlck\"": "NLC Kanji Forms. Used only with Kanji script.",
	"\"nukt\"": "Nukta Forms. Required in Indic scripts..",
	"\"numr\"": "Numerators.",
	"\"opbd\"": "Optical Bounds.",
	"\"ordn\"": "Ordinals. Applies mostly to Latin script.",
	"\"ornm\"": "Ornaments.",
	"\"palt\"": "Proportional Alternate Widths. Used mostly in CJKV fonts.",
	"\"pcap\"": "Petite Capitals.",
	"\"pkna\"": "Proportional Kana. Generally used only in Japanese fonts.",
	"\"pnum\"": "Proportional Figures.",
	"\"pref\"": "Pre-base Forms. Required in Khmer and Myanmar (Burmese) scripts and southern Indic scripts that may display a pre-base form of Ra.",
	"\"pres\"": "Pre-base Substitutions. Required in Indic scripts.",
	"\"pstf\"": "Post-base Forms. Required in scripts of south and southeast Asia that have post-base forms for consonants eg: Gurmukhi, Malayalam, Khmer.",
	"\"psts\"": "Post-base Substitutions.",
	"\"pwid\"": "Proportional Widths.",
	"\"qwid\"": "Quarter Widths. Generally used only in CJKV fonts.",
	"\"rand\"": "Randomize.",
	"\"rclt\"": "Required Contextual Alternates. May apply to any script, but is especially important for many styles of Arabic.",
	"\"rlig\"": "Required Ligatures. Applies to Arabic and Syriac. May apply to some other scripts.",
	"\"rkrf\"": "Rakar Forms. Required in Devanagari and Gujarati scripts.",
	"\"rphf\"": "Reph Form. Required in Indic scripts. E.g. Devanagari, Kannada.",
	"\"rtbd\"": "Right Bounds.",
	"\"rtla\"": "Right-to-left alternates.",
	"\"rtlm\"": "Right-to-left mirrored forms.",
	"\"ruby\"": "Ruby Notation Forms. Applies only to Japanese.",
	"\"salt\"": "Stylistic Alternates.",
	"\"sinf\"": "Scientific Inferiors.",
	"\"size\"": "Optical size.",
	"\"smpl\"": "Simplified Forms. Applies only to Chinese and Japanese.",
	"\"ssty\"": "Math script style alternates.",
	"\"stch\"": "Stretching Glyph Decomposition.",
	"\"subs\"": "Subscript.",
	"\"sups\"": "Superscript.",
	"\"titl\"": "Titling.",
	"\"tjmo\"": "Trailing Jamo Forms. Required for Hangul script when Ancient Hangul writing system is supported.",
	"\"tnam\"": "Traditional Name Forms. Applies only to Japanese.",
	"\"trad\"": "Traditional Forms. Applies only to Chinese and Japanese.",
	"\"twid\"": "Third Widths. Generally used only in CJKV fonts.",
	"\"unic\"": "Unicase.",
	"\"valt\"": "Alternate Vertical Metrics. Applies only to scripts with vertical writing modes.",
	"\"vatu\"": "Vattu Variants. Used for Indic scripts. E.g. Devanagari.",
	"\"vert\"": "Vertical Alternates. Applies only to scripts with vertical writing modes.",
	"\"vhal\"": "Alternate Vertical Half Metrics. Used only in CJKV fonts.",
	"\"vjmo\"": "Vowel Jamo Forms. Required for Hangul script when Ancient Hangul writing system is supported.",
	"\"vkna\"": "Vertical Kana Alternates. Applies only to fonts that support kana (hiragana and katakana).",
	"\"vkrn\"": "Vertical Kerning.",
	"\"vpal\"": "Proportional Alternate Vertical Metrics. Used mostly in CJKV fonts.",
	"\"vrt2\"": "Vertical Alternates and Rotation. Applies only to scripts with vertical writing modes.",
	"\"zero\"": "Slashed Zero.",
	"narrower": "Indicates a narrower value relative to the width of the parent element.",
	"wider": "Indicates a wider value relative to the width of the parent element.",
	"style": "Allow synthetic italic faces.",
	"weight": "Allow synthetic bold faces.",
	"annotation()": "Enables display of alternate annotation forms.",
	"character-variant()": "Enables display of specific character variants.",
	"historical-forms": "Enables display of historical forms.",
	"ornaments()": "Enables replacement of default glyphs with ornaments, if provided in the font.",
	"styleset()": "Enables display with stylistic sets.",
	"stylistic()": "Enables display of stylistic alternates.",
	"swash()": "Enables display of swash glyphs.",
	"all-petite-caps": "Enables display of petite capitals for both upper and lowercase letters.",
	"all-small-caps": "Enables display of small capitals for both upper and lowercase letters.",
	"petite-caps": "Enables display of petite capitals.",
	"titling-caps": "Enables display of titling capitals.",
	"unicase": "Enables display of mixture of small capitals for uppercase letters with normal lowercase letters.",
	"full-width": "Enables rendering of full-width variants.",
	"jis04": "Enables rendering of JIS04 forms.",
	"jis78": "Enables rendering of JIS78 forms.",
	"jis83": "Enables rendering of JIS83 forms.",
	"jis90": "Enables rendering of JIS90 forms.",
	"proportional-width": "Enables rendering of proportionally-spaced variants.",
	"simplified": "Enables rendering of simplified forms.",
	"traditional": "Enables rendering of traditional forms.",
	"additional-ligatures": "Enables display of additional ligatures.",
	"common-ligatures": "Enables display of common ligatures.",
	"contextual": "Enables display of contextual alternates.",
	"discretionary-ligatures": "Enables display of discretionary ligatures.",
	"historical-ligatures": "Enables display of historical ligatures.",
	"no-additional-ligatures": "Disables display of additional ligatures.",
	"no-common-ligatures": "Disables display of common ligatures.",
	"no-contextual": "Disables display of contextual alternates.",
	"no-discretionary-ligatures": "Disables display of discretionary ligatures.",
	"no-historical-ligatures": "Disables display of historical ligatures.",
	"diagonal-fractions": "Enables display of lining diagonal fractions.",
	"lining-nums": "Enables display of lining numerals.",
	"oldstyle-nums": "Enables display of old-style numerals.",
	"ordinal": "Enables display of letter forms used with ordinal numbers.",
	"proportional-nums": "Enables display of proportional numerals.",
	"slashed-zero": "Enables display of slashed zeros.",
	"stacked-fractions": "Enables display of lining stacked fractions.",
	"tabular-nums": "Enables display of tabular numerals.",
	"fit-content": "Use the fit-content inline size or fit-content block size, as appropriate to the writing mode.",
	"max-content": "Use the max-content inline size or max-content block size, as appropriate to the writing mode.",
	"min-content": "Use the min-content inline size or min-content block size, as appropriate to the writing mode.",
	"flip": "After rotating by the precededing angle, the image is flipped horizontally. Defaults to 0deg if the angle is ommitted.",
	"from-image": "If the image has an orientation specified in its metadata, such as EXIF, this value computes to the angle that the metadata specifies is necessary to correctly orient the image.",
	"crisp-edges": "The image must be scaled with an algorithm that preserves contrast and edges in the image, and which does not smooth colors or introduce blur to the image in the process.",
	"optimizeQuality": "Deprecated.",
	"pixelated": "When scaling the image up, the 'nearest neighbor' or similar algorithm must be used, so that the image appears to be simply composed of very large pixels.",
	"active": "The input method editor is initially active; text entry is performed using it unless the user specifically dismisses it.",
	"disabled": "The input method editor is disabled and may not be activated by the user.",
	"inactive": "The input method editor is initially inactive, but the user may activate it if they wish.",
	"circle": "A hollow circle.",
	"disc": "A filled circle.",
	"inside": "The marker box is outside the principal block box, as described in the section on the ::marker pseudo-element below.",
	"outside": "The ::marker pseudo-element is an inline element placed immediately before all ::before pseudo-elements in the principal block box, after which the element's content flows.",
	"symbols()": "Allows a counter style to be defined inline.",
	"alpha": "Indicates that the alpha values of the mask should be used.",
	"luminance": "Indicates that the luminance values of the mask should be used.",
	"path()": "Defines an SVG path as a string, with optional 'fill-rule' as the first argument.",
	"block-axis": "Elements are oriented along the box's axis.",
	"inline-axis": "Elements are oriented vertically.",
	"padding-box": "The specified width and height (and respective min/max properties) on this element determine the padding box of the element.",
	"manual": "Words are only broken at line breaks where there are characters inside the word that suggest line break opportunities",
	"line-through": "Each line of text has a line through the middle.",
	"overline": "Each line of text has a line above it.",
	"underline": "Each line of text is underlined.",
	"dashed": "Produces a dashed line style.",
	"dotted": "Produces a dotted line.",
	"double": "Produces a double line.",
	"solid": "Produces a solid line.",
	"wavy": "Produces a wavy line.",
	"matrix()": "Specifies a 2D transformation in the form of a transformation matrix of six values. matrix(a,b,c,d,e,f) is equivalent to applying the transformation matrix [a b c d e f]",
	"matrix3d()": "Specifies a 3D transformation as a 4x4 homogeneous matrix of 16 values in column-major order.",
	"perspective": "Specifies a perspective projection matrix.",
	"rotate()": "Specifies a 2D rotation by the angle specified in the parameter about the origin of the element, as defined by the transform-origin property.",
	"rotate3d()": "Specifies a clockwise 3D rotation by the angle specified in last parameter about the [x,y,z] direction vector described by the first 3 parameters.",
	"rotateX('angle')": "Specifies a clockwise rotation by the given angle about the X axis.",
	"rotateY('angle')": "Specifies a clockwise rotation by the given angle about the Y axis.",
	"rotateZ('angle')": "Specifies a clockwise rotation by the given angle about the Z axis.",
	"scale()": "Specifies a 2D scale operation by the [sx,sy] scaling vector described by the 2 parameters. If the second parameter is not provided, it is takes a value equal to the first.",
	"scale3d()": "Specifies a 3D scale operation by the [sx,sy,sz] scaling vector described by the 3 parameters.",
	"scaleX()": "Specifies a scale operation using the [sx,1] scaling vector, where sx is given as the parameter.",
	"scaleY()": "Specifies a scale operation using the [sy,1] scaling vector, where sy is given as the parameter.",
	"scaleZ()": "Specifies a scale operation using the [1,1,sz] scaling vector, where sz is given as the parameter.",
	"skew()": "Specifies a skew transformation along the X and Y axes. The first angle parameter specifies the skew on the X axis. The second angle parameter specifies the skew on the Y axis. If the second parameter is not given then a value of 0 is used for the Y angle (ie: no skew on the Y axis).",
	"skewX()": "Specifies a skew transformation along the X axis by the given angle.",
	"skewY()": "Specifies a skew transformation along the Y axis by the given angle.",
	"translate()": "Specifies a 2D translation by the vector [tx, ty], where tx is the first translation-value parameter and ty is the optional second translation-value parameter.",
	"translate3d()": "Specifies a 3D translation by the vector [tx,ty,tz], with tx, ty and tz being the first, second and third translation-value parameters respectively.",
	"translateX()": "Specifies a translation by the given amount in the X direction.",
	"translateY()": "Specifies a translation by the given amount in the Y direction.",
	"translateZ()": "Specifies a translation by the given amount in the Z direction. Note that percentage values are not allowed in the translateZ translation-value, and if present are evaluated as 0.",
	"false": "The element does not contain an accelerator key sequence.",
	"true": "The element contains an accelerator key sequence.",
	"bt": "Bottom-to-top block flow. Layout is horizontal.",
	"lr": "Left-to-right direction. The flow orientation is vertical.",
	"rl": "Right-to-left direction. The flow orientation is vertical.",
	"tb": "Top-to-bottom direction. The flow orientation is horizontal.",
	"zoom": "The element is zoomable.",
	"no-limit": "There is no limit.",
	"mode": "Any of the range of mode values available to the -ms-layout-grid-mode property.",
	"type": "Any of the range of type values available to the -ms-layout-grid-type property.",
	"loose": "Default. Grid used for Japanese and Korean characters.",
	"-ms-autohiding-scrollbar": "Indicates the element displays auto-hiding scrollbars during mouse interactions and panning indicators during touch and keyboard interactions.",
	"scrollbar": "Scrollbars are typically narrow strips inserted on one or two edges of an element and which often have arrows to click on and a \"thumb\" to drag up and down (or left and right) to move the contents of the element.",
	"ideograph-alpha": "Creates 1/4em extra spacing between runs of ideographic letters and non-ideographic letters, such as Latin-based, Cyrillic, Greek, Arabic or Hebrew.",
	"ideograph-numeric": "Creates 1/4em extra spacing between runs of ideographic letters and numeric glyphs.",
	"ideograph-parenthesis": "Creates extra spacing between normal (non wide) parenthesis and ideographs.",
	"ideograph-space": "Extends the width of the space character while surrounded by ideographs.",
	"punctuation": "Creates extra non-breaking spacing around punctuation as required by language-specific typographic conventions.",
	"digits": "Attempt to typeset horizontally each maximal sequence of consecutive ASCII digits (U+0030–U+0039) that has as many or fewer characters than the specified integer such that it takes up the space of a single character within the vertical line box.",
	"inter-cluster": "Justification primarily changes spacing at word separators and at grapheme cluster boundaries in clustered scripts. This value is typically used for Southeast Asian scripts such as Thai.",
	"inter-ideograph": "Justification primarily changes spacing at word separators and at inter-graphemic boundaries in scripts that use no word spaces. This value is typically used for CJK languages.",
	"inter-word": "Justification primarily changes spacing at word separators. This value is typically used for languages that separate words using spaces, like English or (sometimes) Korean.",
	"kashida": "Justification primarily stretches Arabic and related scripts through the use of kashida or other calligraphic elongation.",
	"clip": "Clip inline content that overflows. Characters may be only partially rendered.",
	"ellipsis": "Render an ellipsis character (U+2026) to represent clipped inline content.",
	"over": "The underline is aligned with the 'top' (right in vertical writing) edge of the element's em-box. In this mode, an overline also switches sides.",
	"under": "The underline is aligned with the 'bottom' (left in vertical writing) edge of the element's em-box. In this case the underline usually does not cross the descenders. This is sometimes called 'accounting' underline.",
	"grippers": "Grippers are always on.",
	"break-all": "Lines may break between any two grapheme clusters for non-CJK scripts.",
	"clear": "Inline flow content can only wrap on top and bottom of the exclusion and must leave the areas to the start and end edges of the exclusion box empty.",
	"maximum": "Inline flow content can wrap on the side of the exclusion with the largest available space for the given line, and must leave the other side of the exclusion empty.",
	"minimum": "Inline flow content can flow around the edge of the exclusion with the smallest available space within the flow content’s containing block, and must leave the other edge of the exclusion empty.",
	"current": "Indicates that the user agent should target the frame that the element is in.",
	"root": "Indicates that the user agent should target the full window.",
	"scale-down": "Size the content as if ‘none’ or ‘contain’ were specified, whichever would result in a smaller concrete object size.",
	"invert": "Performs a color inversion on the pixels on the screen.",
	"-moz-hidden-unscrollable": "Same as the standardized 'clip', except doesn’t establish a block formatting context.",
	"painted": "The given element can be the target element for pointer events when the pointer is over a \"painted\" area. ",
	"visibleFill": "The given element can be the target element for pointer events when the ‘visibility’ property is set to visible and when the pointer is over the interior of the element.",
	"visiblePainted": "The given element can be the target element for pointer events when the ‘visibility’ property is set to visible and when the pointer is over a ‘painted’ area.",
	"visibleStroke": "The given element can be the target element for pointer events when the ‘visibility’ property is set to visible and when the pointer is over the perimeter of the element.",
	"absolute": "The box's position (and possibly size) is specified with the 'top', 'right', 'bottom', and 'left' properties. These properties specify offsets with respect to the box's 'containing block'.",
	"-ms-page": "The box's position is calculated according to the 'absolute' model.",
	"relative": "The box's position is calculated according to the normal flow (this is called the position in normal flow). Then the box is offset relative to its normal position.",
	"static": "The box is a normal box, laid out according to the normal flow. The 'top', 'right', 'bottom', and 'left' properties do not apply.",
	"sticky": "The box's position is calculated according to the normal flow. Then the box is offset relative to its flow root and containing block and in all cases, including table elements, does not affect the position of any following boxes.",
	"-webkit-sticky": "The box's position is calculated according to the normal flow. Then the box is offset relative to its flow root and containing block and in all cases, including table elements, does not affect the position of any following boxes.",
	"distribute-letter": "If the width of the ruby text is smaller than that of the base, then the ruby text contents are evenly distributed across the width of the base, with the first and last ruby text glyphs lining up with the corresponding first and last base glyphs. If the width of the ruby text is at least the width of the base, then the letters of the base are evenly distributed across the width of the ruby text.",
	"distribute-space": "If the width of the ruby text is smaller than that of the base, then the ruby text contents are evenly distributed across the width of the base, with a certain amount of white space preceding the first and following the last character in the ruby text. That amount of white space is normally equal to half the amount of inter-character space of the ruby text.",
	"line-edge": "If the ruby text is not adjacent to a line edge, it is aligned as in 'auto'. If it is adjacent to a line edge, then it is still aligned as in auto, but the side of the ruby text that touches the end of the line is lined up with the corresponding edge of the base.",
	"after": "The ruby text appears after the base. This is a relatively rare setting used in ideographic East Asian writing systems, most easily found in educational text.",
	"before": "The ruby text appears before the base. This is the most common setting used in ideographic East Asian writing systems.",
	"attr(x)": "The value of attribute 'x' is a string value. The string value is evaluated as a <number> to determine the number of ruby base elements to be spanned by the annotation element.",
	"smooth": "Scrolls in a smooth fashion using a user-agent-defined timing function and time period.",
	"repeat()": "Defines an interval at which snap points are defined, starting from the container’s relevant start edge.",
	"margin-box": "The background is painted within (clipped to) the margin box.",
	"format()": "Optional hint describing the format of the font resource.",
	"local()": "Format-specific string that identifies a locally available copy of a given font.",
	"butt": "Indicates that the stroke for each subpath does not extend beyond its two endpoints.",
	"bevel": "Indicates that a bevelled corner is to be used to join path segments.",
	"miter": "Indicates that a sharp corner is to be used to join path segments.",
	"additive": "Represents “sign-value” numbering systems, which, rather than using reusing digits in different positions to change their value, define additional digits with much larger values, so that the value of the number can be obtained by adding all the digits together.",
	"cyclic": "Cycles repeatedly through its provided symbols, looping back to the beginning when it reaches the end of the list.",
	"extends": "Use the algorithm of another counter style, but alter other aspects.",
	"numeric": "interprets the list of counter symbols as digits to a \"place-value\" numbering system, similar to the default 'decimal' counter style.",
	"symbolic": "Cycles repeatedly through its provided symbols, doubling, tripling, etc. the symbols on each successive pass through the list.",
	"sideways": "This value is equivalent to 'sideways-right' in 'vertical-rl' writing mode and equivalent to 'sideways-left' in 'vertical-lr' writing mode.",
	"sideways-right": "In vertical writing modes, this causes text to be set as if in a horizontal layout, but rotated 90° clockwise.",
	"upright": "In vertical writing modes, characters from horizontal-only scripts are rendered upright, i.e. in their standard horizontal orientation.",
	"geometricPrecision": "Indicates that the user agent shall emphasize geometric precision over legibility and rendering speed.",
	"optimizeLegibility": "Indicates that the user agent shall emphasize legibility over rendering speed and geometric precision.",
	"capitalize": "Puts the first typographic letter unit of each word in titlecase.",
	"lowercase": "Puts all letters in lowercase.",
	"uppercase": "Puts all letters in uppercase.",
	"perspective()": "Specifies a perspective projection matrix.",
	"flat": "All children of this element are rendered flattened into the 2D plane of the element.",
	"preserve-3d": "Flattening is not performed, so children maintain their position in 3D space.",
	"bidi-override": "Inside the element, reordering is strictly in sequence according to the 'direction' property; the implicit part of the bidirectional algorithm is ignored.",
	"embed": "If the element is inline-level, this value opens an additional level of embedding with respect to the bidirectional algorithm. The direction of this embedding level is given by the 'direction' property.",
	"isolate-override": "This combines the isolation behavior of 'isolate' with the directional override behavior of 'bidi-override'",
	"plaintext": "For the purposes of the Unicode bidirectional algorithm, the base directionality of each bidi paragraph for which the element forms the containing block is determined not by the element's computed 'direction'.",
	"U+26": "Ampersand.",
	"U+20-24F, U+2B0-2FF, U+370-4FF, U+1E00-1EFF, U+2000-20CF, U+2100-23FF, U+2500-26FF, U+E000-F8FF, U+FB00–FB4F": "WGL4 character set (Pan-European).",
	"U+20-17F, U+2B0-2FF, U+2000-206F, U+20A0-20CF, U+2100-21FF, U+2600-26FF": "The Multilingual European Subset No. 1. Latin. Covers ~44 languages.",
	"U+20-2FF, U+370-4FF, U+1E00-20CF, U+2100-23FF, U+2500-26FF, U+FB00-FB4F, U+FFF0-FFFD": "The Multilingual European Subset No. 2. Latin, Greek, and Cyrillic. Covers ~128 language.",
	"U+20-4FF, U+530-58F, U+10D0-10FF, U+1E00-23FF, U+2440-245F, U+2500-26FF, U+FB00-FB4F, U+FE20-FE2F, U+FFF0-FFFD": "The Multilingual European Subset No. 3. Covers all characters belonging to European scripts.",
	"U+00-7F": "Basic Latin (ASCII).",
	"U+80-FF": "Latin-1 Supplement. Accented characters for Western European languages, common punctuation characters, multiplication and division signs.",
	"U+100-17F": "Latin Extended-A. Accented characters for for Czech, Dutch, Polish, and Turkish.",
	"U+180-24F": "Latin Extended-B. Croatian, Slovenian, Romanian, Non-European and historic latin, Khoisan, Pinyin, Livonian, Sinology.",
	"U+1E00-1EFF": "Latin Extended Additional. Vietnamese, German captial sharp s, Medievalist, Latin general use.",
	"U+250-2AF": "International Phonetic Alphabet Extensions.",
	"U+370-3FF": "Greek and Coptic.",
	"U+1F00-1FFF": "Greek Extended. Accented characters for polytonic Greek.",
	"U+400-4FF": "Cyrillic.",
	"U+500-52F": "Cyrillic Supplement. Extra letters for Komi, Khanty, Chukchi, Mordvin, Kurdish, Aleut, Chuvash, Abkhaz, Azerbaijani, and Orok.",
	"U+00-52F, U+1E00-1FFF, U+2200–22FF": "Latin, Greek, Cyrillic, some punctuation and symbols.",
	"U+530–58F": "Armenian.",
	"U+590–5FF": "Hebrew.",
	"U+600–6FF": "Arabic.",
	"U+750–77F": "Arabic Supplement. Additional letters for African languages, Khowar, Torwali, Burushaski, and early Persian.",
	"U+8A0–8FF": "Arabic Extended-A. Additional letters for African languages, European and Central Asian languages, Rohingya, Berber, Arwi, and Koranic annotation signs.",
	"U+700–74F": "Syriac.",
	"U+900–97F": "Devanagari.",
	"U+980–9FF": "Bengali.",
	"U+A00–A7F": "Gurmukhi.",
	"U+A80–AFF": "Gujarati.",
	"U+B00–B7F": "Oriya.",
	"U+B80–BFF": "Tamil.",
	"U+C00–C7F": "Telugu.",
	"U+C80–CFF": "Kannada.",
	"U+D00–D7F": "Malayalam.",
	"U+D80–DFF": "Sinhala.",
	"U+118A0–118FF": "Warang Citi.",
	"U+E00–E7F": "Thai.",
	"U+1A20–1AAF": "Tai Tham.",
	"U+AA80–AADF": "Tai Viet.",
	"U+E80–EFF": "Lao.",
	"U+F00–FFF": "Tibetan.",
	"U+1000–109F": "Myanmar (Burmese).",
	"U+10A0–10FF": "Georgian.",
	"U+1200–137F": "Ethiopic.",
	"U+1380–139F": "Ethiopic Supplement. Extra Syllables for Sebatbeit, and Tonal marks",
	"U+2D80–2DDF": "Ethiopic Extended. Extra Syllables for Me'en, Blin, and Sebatbeit.",
	"U+AB00–AB2F": "Ethiopic Extended-A. Extra characters for Gamo-Gofa-Dawro, Basketo, and Gumuz.",
	"U+1780–17FF": "Khmer.",
	"U+1800–18AF": "Mongolian.",
	"U+1B80–1BBF": "Sundanese.",
	"U+1CC0–1CCF": "Sundanese Supplement. Punctuation.",
	"U+4E00–9FD5": "CJK (Chinese, Japanese, Korean) Unified Ideographs. Most common ideographs for modern Chinese and Japanese.",
	"U+3400–4DB5": "CJK Unified Ideographs Extension A. Rare ideographs.",
	"U+2F00–2FDF": "Kangxi Radicals.",
	"U+2E80–2EFF": "CJK Radicals Supplement. Alternative forms of Kangxi Radicals.",
	"U+1100–11FF": "Hangul Jamo.",
	"U+AC00–D7AF": "Hangul Syllables.",
	"U+3040–309F": "Hiragana.",
	"U+30A0–30FF": "Katakana.",
	"U+A5, U+4E00-9FFF, U+30??, U+FF00-FF9F": "Japanese Kanji, Hiragana and Katakana characters plus Yen/Yuan symbol.",
	"U+A4D0–A4FF": "Lisu.",
	"U+A000–A48F": "Yi Syllables.",
	"U+A490–A4CF": "Yi Radicals.",
	"U+2000-206F": "General Punctuation.",
	"U+3000–303F": "CJK Symbols and Punctuation.",
	"U+2070–209F": "Superscripts and Subscripts.",
	"U+20A0–20CF": "Currency Symbols.",
	"U+2100–214F": "Letterlike Symbols.",
	"U+2150–218F": "Number Forms.",
	"U+2190–21FF": "Arrows.",
	"U+2200–22FF": "Mathematical Operators.",
	"U+2300–23FF": "Miscellaneous Technical.",
	"U+E000-F8FF": "Private Use Area.",
	"U+FB00–FB4F": "Alphabetic Presentation Forms. Ligatures for latin, Armenian, and Hebrew.",
	"U+FB50–FDFF": "Arabic Presentation Forms-A. Contextual forms / ligatures for Persian, Urdu, Sindhi, Central Asian languages, etc, Arabic pedagogical symbols, word ligatures.",
	"U+1F600–1F64F": "Emoji: Emoticons.",
	"U+2600–26FF": "Emoji: Miscellaneous Symbols.",
	"U+1F300–1F5FF": "Emoji: Miscellaneous Symbols and Pictographs.",
	"U+1F900–1F9FF": "Emoji: Supplemental Symbols and Pictographs.",
	"U+1F680–1F6FF": "Emoji: Transport and Map Symbols.",
	"text-bottom": "Align the bottom of the box with the after-edge of the parent element's font.",
	"text-top": "Align the top of the box with the before-edge of the parent element's font.",
	"break": "If the content fits within the CSS Region, then this property has no effect.",
	"pre": "Sets 'white-space-collapsing' to 'preserve' and 'text-wrap' to 'none'.",
	"pre-line": "Sets 'white-space-collapsing' to 'preserve-breaks' and 'text-wrap' to 'normal'.",
	"pre-wrap": "Sets 'white-space-collapsing' to 'preserve' and 'text-wrap' to 'normal'.",
	"contents": "Indicates that the author expects to animate or change something about the element’s contents in the near future.",
	"scroll-position": "Indicates that the author expects to animate or change the scroll position of the element in the near future.",
	"horizontal-tb": "Top-to-bottom block flow direction. The writing mode is horizontal.",
	"sideways-lr": "Left-to-right block flow direction. The writing mode is vertical, while the typographic mode is horizontal.",
	"sideways-rl": "Right-to-left block flow direction. The writing mode is vertical, while the typographic mode is horizontal.",
	"vertical-lr": "Left-to-right block flow direction. The writing mode is vertical.",
	"vertical-rl": "Right-to-left block flow direction. The writing mode is vertical."
};
});