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
				"name": "@host",
				"desc": "Applies to elements specified in shadow trees.",
				"browsers": "C"
			},
			{
				"name": "@import",
				"desc": "Includes content of another file."
			},
			{
				"name": "@keyframes",
				"desc": "Defines set of animation key frames.",
				"browsers": "C43,FF16,IE10,O12.5,S9"
			},
			{
				"name": "@media",
				"desc": "Defines a stylesheet for a particular media type."
			},
			{
				"name": "@-moz-document",
				"desc": "The @-moz-document rule is a Gecko-specific at-rule that restricts the style rules contained within it based on the URL of the document.",
				"browsers": "FF1.8"
			},
			{
				"name": "@-moz-keyframes",
				"desc": "Defines set of animation key frames.",
				"browsers": "FF5"
			},
			{
				"name": "@-ms-viewport",
				"browsers": "IE10"
			},
			{
				"name": "@namespace",
				"desc": "Declares a prefix and associates it with a namespace name.",
				"browsers": "C,FF1,IE9,O8,S1"
			},
			{
				"name": "@-o-keyframes",
				"browsers": "O12"
			},
			{
				"name": "@-o-viewport",
				"desc": "Sets the viewport properties in Opera Mobile 11 - 12.1.",
				"browsers": "O11"
			},
			{
				"name": "@page",
				"desc": "Directive defines various page parameters."
			},
			{
				"name": "@supports",
				"desc": "A conditional group rule whose condition tests whether the user agent supports CSS property:value pairs.",
				"browsers": "C,FF,O,S9"
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
				"desc": "The :active pseudo-class applies while an element is being activated by the user. For example, between the times the user presses the mouse button and releases it."
			},
			{
				"name": ":after",
				"desc": "Pseudo-element is used to insert content immediately after the content of an element (or other pseudo-element). The 'content' property is used to specify the content to insert.",
				"browsers": "C,FF1,IE8,O8,S1"
			},
			{
				"name": ":any-link"
			},
			{
				"name": ":before",
				"desc": "Pseudo-element is used to insert content immediately before the content of an element (or other pseudo-element). The 'content' property is used to specify the content to insert.",
				"browsers": "C,FF1,IE8,O8,S1"
			},
			{
				"name": ":checked",
				"desc": "Radio and checkbox elements can be toggled by the user. Some menu items are 'checked' when the user selects them. When such elements are toggled 'on' the :checked pseudo-class applies.",
				"browsers": "C,FF1,IE9,O9,S3.13"
			},
			{
				"name": ":corner-present",
				"browsers": "C,S5"
			},
			{
				"name": ":current"
			},
			{
				"name": ":current(div)"
			},
			{
				"name": ":decrement",
				"browsers": "C,S5"
			},
			{
				"name": ":default",
				"desc": "The :default selector applies to the one or more UI elements that are the default among a set of similar elements. This selector typically applies to context menu items, buttons, and select lists/menus.",
				"browsers": "C,FF3,IE10,O10,S5"
			},
			{
				"name": ":disabled",
				"desc": "The :disabled pseudo-class represents user interface elements that are in a disabled state; such elements have a corresponding enabled state.",
				"browsers": "C,FF1.5,IE9,O9,S3.1"
			},
			{
				"name": ":double-button",
				"browsers": "C,S5"
			},
			{
				"name": ":empty",
				"desc": "The :empty pseudo-class represents an element that has no children at all.",
				"browsers": "C,FF1.5,IE9,O9,S3.1"
			},
			{
				"name": ":enabled",
				"desc": "The :enabled pseudo-class represents user interface elements that are in an enabled state; such elements have a corresponding disabled state.",
				"browsers": "C,FF1.5,IE9,O9,S3.1"
			},
			{
				"name": ":end",
				"browsers": "C,S5"
			},
			{
				"name": ":first",
				"desc": "When printing double-sided documents, the page boxes on left and right pages may be different. This can be expressed through CSS pseudo-classes defined in the  page context."
			},
			{
				"name": ":first-child",
				"desc": "Same as :nth-child(1). The :first-child pseudo-class represents an element that is the first child of some other element.",
				"browsers": "C,FF3,IE7,O9.5,S3.1"
			},
			{
				"name": ":first-letter",
				"desc": "The :first-letter pseudo-element represents the first letter of an element, if it is not preceded by any other content (such as images or inline tables) on its line."
			},
			{
				"name": ":first-line",
				"desc": "The :first-line pseudo-element describes the contents of the first formatted line of an element."
			},
			{
				"name": ":first-of-type",
				"desc": "Same as :nth-of-type(1). The :first-of-type pseudo-class represents an element that is the first sibling of its type in the list of children of its parent element.",
				"browsers": "C,FF3.5,IE9,O9.5,S3.2"
			},
			{
				"name": ":focus",
				"desc": "The :focus pseudo-class applies while an element has the focus (accepts keyboard or mouse events, or other forms of input)."
			},
			{
				"name": ":future",
				"browsers": "C,O16,S6"
			},
			{
				"name": ":horizontal",
				"browsers": "C,S5"
			},
			{
				"name": ":host",
				"browsers": "C,FF,O"
			},
			{
				"name": ":host()",
				"browsers": "C,FF,O"
			},
			{
				"name": ":hover",
				"desc": "The :hover pseudo-class applies while the user designates an element with a pointing device, but does not necessarily activate it. For example, a visual user agent could apply this pseudo-class when the cursor (mouse pointer) hovers over a box generated by the element."
			},
			{
				"name": ":increment",
				"browsers": "C,S5"
			},
			{
				"name": ":indeterminate",
				"desc": "The :indeterminate pseudo-class applies to UI elements whose value is in an indeterminate state.",
				"browsers": "C,FF3.6,IE9,O10.6,S3"
			},
			{
				"name": ":in-range",
				"desc": "The in-range and out-of-range pseudo-classes should be used in conjunction with the min and max attributes, whether on a range input, a number field, or any other types that accept those attributes.",
				"browsers": "C,FF10,IE10,O9.6,S5.1"
			},
			{
				"name": ":invalid",
				"desc": "An element is :valid or :invalid when it is, respectively, valid or invalid with respect to data validity semantics defined by a different specification.",
				"browsers": "C,FF4,IE10,O10,S5"
			},
			{
				"name": ":lang(en)",
				"desc": "The pseudo-class :lang(C) represents an element that is in language C.",
				"browsers": "C,FF1,IE8,O8,S3"
			},
			{
				"name": ":last-child",
				"desc": "Same as :nth-last-child(1). The :last-child pseudo-class represents an element that is the last child of some other element.",
				"browsers": "C,FF1,IE9,O9.5,S3.1"
			},
			{
				"name": ":last-of-type",
				"desc": "Same as :nth-last-of-type(1). The :last-of-type pseudo-class represents an element that is the last sibling of its type in the list of children of its parent element.",
				"browsers": "C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":left",
				"desc": "When printing double-sided documents, the page boxes on left and right pages may be different. This can be expressed through CSS pseudo-classes defined in the  page context."
			},
			{
				"name": ":link",
				"desc": "The :link pseudo-class applies to links that have not yet been visited."
			},
			{
				"name": ":local-link"
			},
			{
				"name": ":local-link(0)"
			},
			{
				"name": ":-moz-any",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-any-link",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-broken",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-drag-over",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-first-node",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-focusring",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-full-screen",
				"browsers": "FF9"
			},
			{
				"name": ":-moz-last-node",
				"browsers": "FF1"
			},
			{
				"name": ":-moz-loading",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-only-whitespace",
				"browsers": "FF1.5"
			},
			{
				"name": ":-moz-placeholder",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-range-thumb",
				"browsers": "FF22"
			},
			{
				"name": ":-moz-range-track",
				"browsers": "FF22"
			},
			{
				"name": ":-moz-submit-invalid",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-suppressed",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-ui-invalid",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-ui-valid",
				"browsers": "FF4"
			},
			{
				"name": ":-moz-user-disabled",
				"browsers": "FF3"
			},
			{
				"name": ":-moz-window-inactive",
				"browsers": "FF4"
			},
			{
				"name": ":-ms-fullscreen",
				"browsers": "IE11"
			},
			{
				"name": ":-ms-input-placeholder",
				"browsers": "IE10"
			},
			{
				"name": ":-ms-keyboard-active",
				"browsers": "IE10"
			},
			{
				"name": ":-ms-lang(en)",
				"desc": "The pseudo-class :-ms-lang(C) represents an element that is in language C.",
				"browsers": "IE10"
			},
			{
				"name": ":no-button",
				"browsers": "C,S5"
			},
			{
				"name": ":not(:empty)",
				"desc": "The negation pseudo-class, :not(X), is a functional notation taking a simple selector (excluding the negation pseudo-class itself) as an argument. It represents an element that is not represented by its argument.",
				"browsers": "C,FF1,IE9,O9.5,S2"
			},
			{
				"name": ":nth-child(2n+1)",
				"desc": "The :nth-child(an+b) pseudo-class notation represents an element that has an+b-1 siblings before it in the document tree, for any positive integer or zero value of n, and has a parent element.",
				"browsers": "C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":nth-last-child(-n+2)",
				"desc": "The :nth-last-child(an+b) pseudo-class notation represents an element that has an+b-1 siblings after it in the document tree, for any positive integer or zero value of n, and has a parent element.",
				"browsers": "C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":nth-last-of-type(n+2)",
				"desc": "The :nth-last-of-type(an+b) pseudo-class notation represents an element that has an+b-1 siblings with the same expanded element name after it in the document tree, for any zero or positive integer value of n, and has a parent element.",
				"browsers": "C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":nth-of-type(2n+1)",
				"desc": "The :nth-of-type(an+b) pseudo-class notation represents an element that has an+b-1 siblings with the same expanded element name before it in the document tree, for any zero or positive integer value of n, and has a parent element.",
				"browsers": "C,FF3.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":only-child",
				"desc": "Represents an element that has a parent element and whose parent element has no other element children. Same as :first-child:last-child or :nth-child(1):nth-last-child(1), but with a lower specificity.",
				"browsers": "C,FF1.5,IE9,O9.5,S3.1"
			},
			{
				"name": ":only-of-type",
				"desc": "The :only-of-type selector matches every element that is the only child of its type, of its parent. Same as :first-of-type:last-of-type or :nth-of-type(1):nth-last-of-type(1), but with a lower specificity.",
				"browsers": "C,FF3.5,IE9,O9.5,S3.2"
			},
			{
				"name": ":optional",
				"desc": "A form element is :required or :optional if a value for it is, respectively, required or optional before the form it belongs to is submitted. Elements that are not form elements are neither required nor optional.",
				"browsers": "C,FF4,IE10,O10,S5"
			},
			{
				"name": ":out-of-range",
				"desc": "The in-range and out-of-range pseudo-classes should be used in conjunction with the min and max attributes, whether on a range input, a number field, or any other types that accept those attributes.",
				"browsers": "C,FF10,IE10,O9.6,S5.1"
			},
			{
				"name": ":past",
				"browsers": "C,O16,S6"
			},
			{
				"name": ":read-only",
				"desc": "An element whose contents are not user-alterable is :read-only. However, elements whose contents are user-alterable (such as text input fields) are considered to be in a :read-write state. In typical documents, most elements are :read-only.",
				"browsers": "C,FF10,IE10,O9,S4"
			},
			{
				"name": ":read-write",
				"desc": "An element whose contents are not user-alterable is :read-only. However, elements whose contents are user-alterable (such as text input fields) are considered to be in a :read-write state. In typical documents, most elements are :read-only.",
				"browsers": "C,FF10,IE10,O9,S4"
			},
			{
				"name": ":required",
				"desc": "A form element is :required or :optional if a value for it is, respectively, required or optional before the form it belongs to is submitted. Elements that are not form elements are neither required nor optional.",
				"browsers": "C,FF4,IE10,O10,S5"
			},
			{
				"name": ":right",
				"desc": "When printing double-sided documents, the page boxes on left and right pages may be different. This can be expressed through CSS pseudo-classes defined in the  page context."
			},
			{
				"name": ":root",
				"desc": "The :root pseudo-class represents an element that is the root of the document. In HTML 4, this is always the HTML element.",
				"browsers": "C,FF1,IE9,O9.5,S1"
			},
			{
				"name": ":single-button",
				"browsers": "C,S5"
			},
			{
				"name": ":start",
				"browsers": "C,S5"
			},
			{
				"name": ":target",
				"desc": "Some URIs refer to a location within a resource. This kind of URI ends with a 'number sign' (#) followed by an anchor identifier (called the fragment identifier).",
				"browsers": "C,FF1,IE9,O9.5,S1"
			},
			{
				"name": ":valid",
				"desc": "An element is :valid or :invalid when it is, respectively, valid or invalid with respect to data validity semantics defined by a different specification.",
				"browsers": "C,FF4,IE10,O10,S5"
			},
			{
				"name": ":vertical",
				"browsers": "C,S5"
			},
			{
				"name": ":visited",
				"desc": "The :visited pseudo-class applies once the link has been visited by the user."
			},
			{
				"name": ":-webkit-any",
				"browsers": "C,S5"
			},
			{
				"name": ":-webkit-full-screen",
				"browsers": "C,S6"
			},
			{
				"name": ":window-inactive",
				"browsers": "C,S3"
			}
		],
		"pseudoelements": [
			{
				"name": "::after",
				"desc": "Pseudo-element is used to insert content immediately after the content of an element (or other pseudo-element). The 'content' property is used to specify the content to insert.",
				"browsers": "C,FF1.5,IE10,O7,S4"
			},
			{
				"name": "::before",
				"desc": "Pseudo-element is used to insert content immediately before the content of an element (or other pseudo-element). The 'content' property is used to specify the content to insert.",
				"browsers": "C,FF1.5,IE10,O8,S1"
			},
			{
				"name": "::content",
				"browsers": "C,FF,O"
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
				"desc": "The ::first-letter pseudo-element represents the first letter of an element, if it is not preceded by any other content (such as images or inline tables) on its line.",
				"browsers": "C,FF1.5,IE10,O7,S1"
			},
			{
				"name": "::first-line",
				"desc": "The ::first-line pseudo-element describes the contents of the first formatted line of an element.",
				"browsers": "C,FF1.5,IE10,O7,S1"
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
				"browsers": "FF1"
			},
			{
				"name": "::-moz-list-number",
				"browsers": "FF1"
			},
			{
				"name": "::-moz-placeholder",
				"browsers": "FF9"
			},
			{
				"name": "::-moz-progress-bar",
				"browsers": "FF9"
			},
			{
				"name": "::-moz-selection",
				"browsers": "FF1"
			},
			{
				"name": "::-ms-backdrop",
				"browsers": "IE11"
			},
			{
				"name": "::-ms-browse",
				"desc": "Applies one or more styles to the browse button of an input type=file control.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-check",
				"desc": "Applies one or more styles to the check of a checkbox or radio button input control.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-clear",
				"desc": "Applies one or more styles to the entry area of a text input control when it contains no content.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-expand",
				"desc": "Applies one or more styles to the drop-down button of a select control.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-fill",
				"desc": "Applies one or more styles to the bar portion of a progress bar.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-fill-lower",
				"desc": "Applies one or more styles to portion of the slider track from its smallest value up to the value currently selected by the thumb. In a left-to-right layout, this is the portion of the slider track to the left of the thumb.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-fill-upper",
				"desc": "Applies one or more styles to portion of the slider track from the value currently selected by the thumb up to the slider's largest value. In a left-to-right layout, this is the portion of the slider track to the right of the thumb.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-reveal",
				"desc": "Applies one or more styles to the password reveal button of an input type=password control.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-thumb",
				"desc": "Applies one or more styles to portion of the range input control (also known as a slider control) that the user drags.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-ticks-after",
				"desc": "Applies one or more styles to the tick marks of a slider that begin just after the thumb and continue up to the slider's largest value. In a left-to-right layout, these are the ticks to the right of the thumb.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-ticks-before",
				"desc": "Applies one or more styles to the tick marks of a slider that represent its smallest values up to the value currently selected by the thumb. In a left-to-right layout, these are the ticks to the left of the thumb.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-tooltip",
				"desc": "Applies one or more styles to the tooltip of a slider (input type=range).",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-track",
				"desc": "Applies one or more styles to track of a slider.",
				"browsers": "IE10"
			},
			{
				"name": "::-ms-value",
				"desc": "Applies one or more styles to the content of a text or password input control, or a select control.",
				"browsers": "IE10"
			},
			{
				"name": "::selection",
				"desc": "The ::selection selector matches the portion of an element that is selected by a user. Only a few CSS properties can be applied to ::selection: color, background, cursor, and outline.",
				"browsers": "C,FF4,IE9,O9.5,S1.1"
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
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-meter-even-less-good-value",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-meter-optimum-value",
				"browsers": "C,O,S6"
			},
			{
				"name": "::-webkit-meter-suboptimal-value",
				"browsers": "C,O,S6"
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
				"name": "align-content",
				"desc": "Aligns a flex container's lines within the flex container when there is extra space in the cross-axis, similar to how 'justify-content' aligns individual items within the main-axis.",
				"browsers": "IE11,O12.1",
				"restriction": "enum",
				"values": [
					{
						"name": "center"
					},
					{
						"name": "flex-end"
					},
					{
						"name": "flex-start"
					},
					{
						"name": "space-around"
					},
					{
						"name": "space-between"
					},
					{
						"name": "stretch"
					}
				]
			},
			{
				"name": "align-items",
				"desc": "Flex items can be aligned in the cross axis of the current line of the flex container, similar to 'justify-content' but in the perpendicular direction.",
				"browsers": "IE11,O12.1",
				"restriction": "enum",
				"values": [
					{
						"name": "baseline"
					},
					{
						"name": "center"
					},
					{
						"name": "flex-end"
					},
					{
						"name": "flex-start"
					},
					{
						"name": "stretch"
					}
				]
			},
			{
				"name": "align-self",
				"desc": "Flex items can be aligned in the cross axis of the current line of the flex container, similar to 'justify-content' but in the perpendicular direction.",
				"browsers": "IE11,O12.1",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "baseline"
					},
					{
						"name": "center"
					},
					{
						"name": "flex-end"
					},
					{
						"name": "flex-start"
					},
					{
						"name": "stretch"
					}
				]
			},
			{
				"name": "animation",
				"desc": "Shorthand property combines six of the animation properties into a single property.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "time, enum, identifier, number",
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
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite"
					},
					{
						"name": "linear"
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
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "animation-delay",
				"desc": "Defines when the animation will start. An 'animation-delay' value of '0' means the animation will execute as soon as it is applied. Otherwise, the value specifies an offset from the moment the animation is applied, and the animation will delay execution by that offset.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "time"
			},
			{
				"name": "animation-direction",
				"desc": "Defines whether or not the animation should play in reverse on alternate cycles.",
				"browsers": "FF16,IE10,O12.5",
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
				"browsers": "FF16,IE10,O12.5",
				"restriction": "time"
			},
			{
				"name": "animation-fill-mode",
				"desc": "Defines what values are applied by the animation outside the time it is executing.",
				"browsers": "FF16,IE10,O12.5",
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
				"browsers": "FF16,IE10,O12.5",
				"restriction": "number",
				"values": []
			},
			{
				"name": "animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "identifier",
				"values": []
			},
			{
				"name": "animation-play-state",
				"desc": "Defines whether the animation is running or paused.",
				"browsers": "FF16,IE10,O12.5",
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
				"desc": "Describes how the animation will progress over one cycle of its duration. See the 'transition-timing-function'.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "backface-visibility",
				"desc": "Determines whether or not the 'back' side of a transformed element is visible when facing the viewer. With an identity transform, the front side of an element faces the viewer.",
				"browsers": "FF16,IE10,O12.5",
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
				"name": "background",
				"desc": "Background of an element",
				"restriction": "enum, color, length, percentage, url",
				"values": [
					{
						"name": "border-box",
						"desc": "The background is painted within (clipped to) the border box."
					},
					{
						"name": "bottom",
						"desc": "Equivalent to '100%' for the vertical position if one or two values are given, otherwise specifies the bottom edge as the origin for the next offset."
					},
					{
						"name": "center",
						"desc": "Equivalent to '50%' ('left 50%') for the horizontal position if the horizontal position is not otherwise specified, or '50%' ('top 50%') for the vertical position if it is."
					},
					{
						"name": "content-box",
						"desc": "The background is painted within (clipped to) the content box."
					},
					{
						"name": "fixed",
						"desc": "The background is fixed with regard to the viewport. In paged media where there is no viewport, a 'fixed' background is fixed with respect to the page box and therefore replicated on every page."
					},
					{
						"name": "left",
						"desc": "Equivalent to '0%' for the horizontal position if one or two values are given, otherwise specifies the left edge as the origin for the next offset."
					},
					{
						"name": "linear-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "local"
					},
					{
						"name": "-moz-element(#id)",
						"browsers": "FF3.6"
					},
					{
						"name": "-moz-linear-gradient()",
						"browsers": "FF3.6"
					},
					{
						"name": "-moz-radial-gradient()",
						"browsers": "FF3.6"
					},
					{
						"name": "-moz-repeating-linear-gradient()",
						"browsers": "FF10"
					},
					{
						"name": "-moz-repeating-radial-gradient()",
						"browsers": "FF10"
					},
					{
						"name": "no-repeat"
					},
					{
						"name": "-o-linear-gradient()",
						"browsers": "O11.1-12"
					},
					{
						"name": "-o-repeating-linear-gradient()",
						"browsers": "O11.1-12"
					},
					{
						"name": "padding-box"
					},
					{
						"name": "radial-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "repeat",
						"desc": "The image is repeated in this direction as often as needed to cover the background painting area."
					},
					{
						"name": "repeating-linear-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "repeating-radial-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "repeat-x"
					},
					{
						"name": "repeat-y"
					},
					{
						"name": "right",
						"desc": "Equivalent to '100%' for the horizontal position if one or two values are given, otherwise specifies the right edge as the origin for the next offset."
					},
					{
						"name": "round",
						"desc": "The image is repeated as often as will fit within the background positioning area. If it doesn't fit a whole number of times, it is rescaled so that it does."
					},
					{
						"name": "scroll",
						"desc": "The background is fixed with regard to the element itself and does not scroll with its contents. (It is effectively attached to the element's border.)"
					},
					{
						"name": "space",
						"desc": "The image is repeated as often as will fit within the background positioning area without being clipped and then the images are spaced out to fill the area. The first and last images touch the edges of the area."
					},
					{
						"name": "top",
						"desc": "Equivalent to '0%' for the vertical position if one or two values are given, otherwise specifies the top edge as the origin for the next offset."
					},
					{
						"name": "url()"
					},
					{
						"name": "-webkit-gradient()",
						"browsers": "C,S4"
					},
					{
						"name": "-webkit-image-set()",
						"browsers": "C,S6"
					},
					{
						"name": "-webkit-linear-gradient()",
						"browsers": "C,S5.1"
					},
					{
						"name": "-webkit-radial-gradient()",
						"browsers": "C,S5.1"
					},
					{
						"name": "-webkit-repeating-linear-gradient()",
						"browsers": "C,S5.1"
					},
					{
						"name": "-webkit-repeating-radial-gradient()",
						"browsers": "C,S5.1"
					}
				]
			},
			{
				"name": "background-attachment",
				"desc": "If background images are specified, this property specifies whether they are fixed with regard to the viewport ('fixed') or scroll along with the element ('scroll') or its contents ('local').",
				"restriction": "enum",
				"values": [
					{
						"name": "fixed",
						"desc": "The background is fixed with regard to the viewport. In paged media where there is no viewport, a 'fixed' background is fixed with respect to the page box and therefore replicated on every page."
					},
					{
						"name": "local"
					},
					{
						"name": "scroll",
						"desc": "The background is fixed with regard to the element itself and does not scroll with its contents. (It is effectively attached to the element's border.)"
					}
				]
			},
			{
				"name": "background-clip",
				"desc": "Determines the background painting area.",
				"browsers": "C,FF4,IE9,O10.5,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "border-box",
						"desc": "The background is painted within (clipped to) the border box."
					},
					{
						"name": "content-box",
						"desc": "The background is painted within (clipped to) the content box."
					},
					{
						"name": "padding-box"
					}
				]
			},
			{
				"name": "background-color",
				"desc": "Color used for an element's background",
				"restriction": "color",
				"values": []
			},
			{
				"name": "background-image",
				"desc": "Image used for an element's background",
				"restriction": "url, enum",
				"values": [
					{
						"name": "linear-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "-moz-image-rect()",
						"browsers": "FF3.6"
					},
					{
						"name": "-moz-linear-gradient()",
						"browsers": "FF3.6"
					},
					{
						"name": "-moz-radial-gradient()",
						"browsers": "FF3.6"
					},
					{
						"name": "-moz-repeating-linear-gradient()",
						"browsers": "FF10"
					},
					{
						"name": "-moz-repeating-radial-gradient()",
						"browsers": "FF10"
					},
					{
						"name": "none",
						"desc": "A value of 'none' counts as an image layer but draws nothing."
					},
					{
						"name": "-o-linear-gradient()",
						"browsers": "O11.1"
					},
					{
						"name": "-o-repeating-linear-gradient()",
						"browsers": "O11.1-12"
					},
					{
						"name": "radial-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "repeating-linear-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "repeating-radial-gradient()",
						"browsers": "FF16,IE10,O12.5"
					},
					{
						"name": "url()"
					},
					{
						"name": "-webkit-gradient()",
						"browsers": "C,S4"
					},
					{
						"name": "-webkit-image-set()",
						"browsers": "C,S6"
					},
					{
						"name": "-webkit-linear-gradient()",
						"browsers": "C,S5.1"
					},
					{
						"name": "-webkit-radial-gradient()",
						"browsers": "C,S5.1"
					},
					{
						"name": "-webkit-repeating-linear-gradient()",
						"browsers": "C,S5.1"
					},
					{
						"name": "-webkit-repeating-radial-gradient()",
						"browsers": "C,S5.1"
					}
				]
			},
			{
				"name": "background-origin",
				"desc": "For elements rendered as a single box, specifies the background positioning area. For elements rendered as multiple boxes (e.g., inline boxes on several lines, boxes on several pages) specifies which boxes 'box-decoration-break' operates on to determine the background positioning area(s).",
				"browsers": "C,FF4,IE9,O10.5,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "border-box",
						"desc": "The background is painted within (clipped to) the border box."
					},
					{
						"name": "content-box",
						"desc": "The background is painted within (clipped to) the content box."
					},
					{
						"name": "padding-box"
					}
				]
			},
			{
				"name": "background-position",
				"desc": "If background images have been specified, this property specifies their initial position (after any resizing) within their corresponding background positioning area.",
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
						"name": "left",
						"desc": "Equivalent to '0%' for the horizontal position if one or two values are given, otherwise specifies the left edge as the origin for the next offset."
					},
					{
						"name": "right",
						"desc": "Equivalent to '100%' for the horizontal position if one or two values are given, otherwise specifies the right edge as the origin for the next offset."
					},
					{
						"name": "top",
						"desc": "Equivalent to '0%' for the vertical position if one or two values are given, otherwise specifies the top edge as the origin for the next offset."
					}
				]
			},
			{
				"name": "background-position-x",
				"desc": "If background images have been specified, this property specifies their initial position (after any resizing) within their corresponding background positioning area.",
				"browsers": "IE6",
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
						"name": "left",
						"desc": "Equivalent to '0%' for the horizontal position if one or two values are given, otherwise specifies the left edge as the origin for the next offset."
					},
					{
						"name": "right",
						"desc": "Equivalent to '100%' for the horizontal position if one or two values are given, otherwise specifies the right edge as the origin for the next offset."
					},
					{
						"name": "top",
						"desc": "Equivalent to '0%' for the vertical position if one or two values are given, otherwise specifies the top edge as the origin for the next offset."
					}
				]
			},
			{
				"name": "background-position-y",
				"desc": "If background images have been specified, this property specifies their initial position (after any resizing) within their corresponding background positioning area.",
				"browsers": "IE6",
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
						"name": "left",
						"desc": "Equivalent to '0%' for the horizontal position if one or two values are given, otherwise specifies the left edge as the origin for the next offset."
					},
					{
						"name": "right",
						"desc": "Equivalent to '100%' for the horizontal position if one or two values are given, otherwise specifies the right edge as the origin for the next offset."
					},
					{
						"name": "top",
						"desc": "Equivalent to '0%' for the vertical position if one or two values are given, otherwise specifies the top edge as the origin for the next offset."
					}
				]
			},
			{
				"name": "background-repeat",
				"desc": "How the background image is tiled within an element",
				"restriction": "enum",
				"values": [
					{
						"name": "no-repeat"
					},
					{
						"name": "repeat",
						"desc": "The image is repeated in this direction as often as needed to cover the background painting area."
					},
					{
						"name": "repeat-x"
					},
					{
						"name": "repeat-y"
					},
					{
						"name": "round",
						"desc": "The image is repeated as often as will fit within the background positioning area. If it doesn't fit a whole number of times, it is rescaled so that it does."
					},
					{
						"name": "space",
						"desc": "The image is repeated as often as will fit within the background positioning area without being clipped and then the images are spaced out to fill the area. The first and last images touch the edges of the area."
					}
				]
			},
			{
				"name": "background-size",
				"desc": "Specifies the size of the background images.",
				"browsers": "C,FF4,IE9,O10,S4.1",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "auto"
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
				"desc": "IE only. Used to extend behaviors of the browser",
				"browsers": "IE6",
				"restriction": "url"
			},
			{
				"name": "border",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-bottom",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-bottom-color",
				"desc": "The color of the border around all four edges of an element.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "border-bottom-left-radius",
				"desc": "The two length or percentage values of the 'border-*-radius' properties define the radii of a quarter ellipse that defines the shape of the corner of the outer border edge. The first value is the horizontal radius, the second the vertical radius. If the second value is omitted it is copied from the first. If either length is zero, the corner is square, not rounded. Percentages for the horizontal radius refer to the width of the border box, whereas percentages for the vertical radius refer to the height of the border box.",
				"browsers": "C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-bottom-right-radius",
				"desc": "The two length or percentage values of the 'border-*-radius' properties define the radii of a quarter ellipse that defines the shape of the corner of the outer border edge. The first value is the horizontal radius, the second the vertical radius. If the second value is omitted it is copied from the first. If either length is zero, the corner is square, not rounded. Percentages for the horizontal radius refer to the width of the border box, whereas percentages for the vertical radius refer to the height of the border box.",
				"browsers": "C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-bottom-style",
				"desc": "The style of the border around edges of an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "border-bottom-width",
				"desc": "'Border-width' is a shorthand that sets the four 'border-*-width' properties. If it has four values, they set top, right, bottom and left in that order. If left is missing, it is the same as right; if bottom is missing, it is the same as top; if right is missing, it is the same as top.",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
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
				"browsers": "C,FF13,IE11",
				"restriction": "length, percentage, number, url, enum",
				"values": [
					{
						"name": "auto",
						"desc": "If 'auto' is specified then the border image width is the intrinsic width or height (whichever is applicable) of the corresponding image slice. If the image does not have the required intrinsic dimension then the corresponding border-width is used instead."
					},
					{
						"name": "fill",
						"desc": "Causes the middle part of the border-image to be preserved. (By default it is discarded, i.e., treated as empty.)"
					},
					{
						"name": "none"
					},
					{
						"name": "repeat",
						"desc": "The image is tiled (repeated) to fill the area."
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
				"browsers": "FF13,IE11",
				"restriction": "length, number"
			},
			{
				"name": "border-image-repeat",
				"desc": "Specifies how the images for the sides and the middle part of the border image are scaled and tiled. If the second keyword is absent, it is assumed to be the same as the first.",
				"browsers": "FF13,IE11",
				"restriction": "enum",
				"values": [
					{
						"name": "repeat",
						"desc": "The image is tiled (repeated) to fill the area."
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
				"desc": "The four 'border-image-slice' values represent inward offsets from the top, right, bottom, and left edges of the image respectively, dividing it into nine regions: four corners, four edges and a middle. The middle image part is discarded (treated as fully transparent) unless the 'fill' keyword is present. (It is drawn over the background; see the border-image drawing process.) If the fourth number/percentage is absent, it is the same as the second. If the third one is also absent, it is the same as the first. If the second one is also absent, it is the same as the first.",
				"browsers": "C,IE11,FF12",
				"restriction": "number, percentage",
				"values": []
			},
			{
				"name": "border-image-source",
				"desc": "Specifies an image to use instead of the border styles given by the 'border-style' properties and as an additional background layer for the element. If the value is 'none' or if the image cannot be displayed, the border styles will be used.",
				"browsers": "C,IE11,FF13",
				"restriction": "url",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "border-image-width",
				"desc": "The four values of 'border-image-width' specify offsets that are used to divide the border image area into nine parts. They represent inward distances from the top, right, bottom, and left sides of the area, respectively.",
				"browsers": "FF13,IE11",
				"restriction": "length, percentage, number",
				"values": []
			},
			{
				"name": "border-left",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-left-color",
				"desc": "The color of the border around all four edges of an element.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "border-left-style",
				"desc": "The style of the border around edges of an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "border-left-width",
				"desc": "'Border-width' is a shorthand that sets the four 'border-*-width' properties. If it has four values, they set top, right, bottom and left in that order. If left is missing, it is the same as right; if bottom is missing, it is the same as top; if right is missing, it is the same as top.",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-radius",
				"desc": "The two length or percentage values of the 'border-*-radius' properties define the radii of a quarter ellipse that defines the shape of the corner of the outer border edge. The first value is the horizontal radius, the second the vertical radius. If the second value is omitted it is copied from the first. If either length is zero, the corner is square, not rounded. Percentages for the horizontal radius refer to the width of the border box, whereas percentages for the vertical radius refer to the height of the border box.",
				"browsers": "C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-right",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-right-color",
				"desc": "The color of the border around all four edges of an element.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "border-right-style",
				"desc": "The style of the border around edges of an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "border-right-width",
				"desc": "'Border-width' is a shorthand that sets the four 'border-*-width' properties. If it has four values, they set top, right, bottom and left in that order. If left is missing, it is the same as right; if bottom is missing, it is the same as top; if right is missing, it is the same as top.",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-spacing",
				"desc": "The lengths specify the distance that separates adjoining cell borders. If one length is specified, it gives both the horizontal and vertical spacing. If two are specified, the first gives the horizontal spacing and the second the vertical spacing. Lengths may not be negative.",
				"browsers": "C,FF1,IE8,O7,S1.2",
				"restriction": "length"
			},
			{
				"name": "border-style",
				"desc": "The style of the border around edges of an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "border-top",
				"desc": "Shorthand property for setting border width, style and color",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-top-color",
				"desc": "The color of the border around all four edges of an element.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "border-top-left-radius",
				"desc": "The two length or percentage values of the 'border-*-radius' properties define the radii of a quarter ellipse that defines the shape of the corner of the outer border edge. The first value is the horizontal radius, the second the vertical radius. If the second value is omitted it is copied from the first. If either length is zero, the corner is square, not rounded. Percentages for the horizontal radius refer to the width of the border box, whereas percentages for the vertical radius refer to the height of the border box.",
				"browsers": "C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-top-right-radius",
				"desc": "The two length or percentage values of the 'border-*-radius' properties define the radii of a quarter ellipse that defines the shape of the corner of the outer border edge. The first value is the horizontal radius, the second the vertical radius. If the second value is omitted it is copied from the first. If either length is zero, the corner is square, not rounded. Percentages for the horizontal radius refer to the width of the border box, whereas percentages for the vertical radius refer to the height of the border box.",
				"browsers": "C,FF4,IE9,O10.5,S5",
				"restriction": "length, percentage"
			},
			{
				"name": "border-top-style",
				"desc": "The style of the border around edges of an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "border-top-width",
				"desc": "'Border-width' is a shorthand that sets the four 'border-*-width' properties. If it has four values, they set top, right, bottom and left in that order. If left is missing, it is the same as right; if bottom is missing, it is the same as top; if right is missing, it is the same as top.",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "border-width",
				"desc": "'Border-width' is a shorthand that sets the four 'border-*-width' properties. If it has four values, they set top, right, bottom and left in that order. If left is missing, it is the same as right; if bottom is missing, it is the same as top; if right is missing, it is the same as top.",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "bottom",
				"desc": "Specifies how far an absolutely positioned box's bottom margin edge is offset above the bottom edge of the box's 'containing block'.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "box-decoration-break",
				"desc": "Specifies whether individual boxes are treated as broken pieces of one continuous box, or whether each box is individually wrapped with the border and padding.",
				"browsers": "O11",
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
				"browsers": "C,FF9,IE9,O11.6,S5.1",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "inset",
						"desc": "Changes the drop shadow from an outer shadow (one that shadows the box onto the canvas, as if it were lifted above the canvas) to an inner shadow (one that shadows the canvas onto the box, as if the box were cut out of the canvas and shifted behind it)."
					}
				]
			},
			{
				"name": "box-sizing",
				"desc": "Box Model addition in CSS3.",
				"browsers": "C,IE8,O8,S5.1",
				"restriction": "enum",
				"values": [
					{
						"name": "border-box",
						"desc": "The specified width and height (and respective min/max properties) on this element determine the border box of the element."
					},
					{
						"name": "content-box",
						"desc": "Behavior of width and height as specified by CSS2.1. The specified width and height (and respective min/max properties) apply to the width and height respectively of the content box of the element."
					}
				]
			},
			{
				"name": "break-after",
				"desc": "Describes the page/column break behavior before the generated box.",
				"browsers": "IE10,O11.1",
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
				"name": "break-before",
				"desc": "Describes the page/column break behavior before the generated box.",
				"browsers": "IE10,O11.6",
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
				"name": "break-inside",
				"desc": "Describes the page/column break behavior inside the generated box.",
				"browsers": "IE10,O11.6",
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
				"name": "caption-side",
				"desc": "Specifies the position of the caption box with respect to the table box.",
				"browsers": "C,FF,IE8,O,S",
				"restriction": "enum",
				"values": [
					{
						"name": "block-end"
					},
					{
						"name": "block-start"
					},
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
				"desc": "Defines the visible portion of an element's box.",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "rect()"
					}
				]
			},
			{
				"name": "clip-path",
				"desc": "Allows authors to control under what circumstances (if any) a particular graphic element can become the target of mouse events.",
				"restriction": "url, enum",
				"values": []
			},
			{
				"name": "clip-rule",
				"desc": "Allows authors to control under what circumstances (if any) a particular graphic element can become the target of mouse events.",
				"restriction": "enum",
				"values": [
					{
						"name": "evenodd",
						"desc": "This rule determines the 'insideness' of a point on the canvas by drawing a ray from that point to infinity in any direction and counting the number of path segments from the given shape that the ray crosses."
					},
					{
						"name": "nonzero",
						"desc": "This rule determines the 'insideness' of a point on the canvas by drawing a ray from that point to infinity in any direction and then examining the places where a segment of the shape crosses the ray."
					}
				]
			},
			{
				"name": "color",
				"desc": "Color of an element's text",
				"restriction": "color",
				"values": []
			},
			{
				"name": "column-count",
				"desc": "Describes the optimal number of columns into which the content of the element will be flowed.",
				"browsers": "IE10,O11.6",
				"restriction": "integer",
				"values": []
			},
			{
				"name": "column-fill",
				"desc": "In continuous media, this property will only be consulted if the length of columns has been constrained. Otherwise, columns will automatically be balanced.",
				"browsers": "IE10,O11.6",
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
				"browsers": "IE10,O11.6",
				"restriction": "length",
				"values": []
			},
			{
				"name": "column-rule",
				"desc": "This property is a shorthand for setting 'column-rule-width', 'column-rule-style', and 'column-rule-color' at the same place in the style sheet. Omitted values are set to their initial values.",
				"browsers": "IE10,O11.6",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "column-rule-color",
				"desc": "Sets the color of the column rule",
				"browsers": "IE10,O11.6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "column-rule-style",
				"desc": "Sets the style of the rule between columns of an element.",
				"browsers": "IE10,O11.6",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "column-rule-width",
				"desc": "Sets the width of the rule between columns. Negative values are not allowed.",
				"browsers": "IE10,O11.6",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "columns",
				"desc": "A shorthand property which sets both 'column-width' and 'column-count'.",
				"browsers": "IE10,O11.6",
				"restriction": "length, integer",
				"values": []
			},
			{
				"name": "column-span",
				"desc": "Describes the page/column break behavior after the generated box.",
				"browsers": "IE10,O11.6",
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
				"desc": "This property describes the width of columns in multicol elements.",
				"browsers": "IE10,O11.6",
				"restriction": "length",
				"values": []
			},
			{
				"name": "content",
				"desc": "Determines which page-based occurrence of a given element is applied to a counter or string value.",
				"browsers": "C,FF1,IE8,O4,S1",
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
				"desc": "Counters are used with the 'counter()' and 'counters()' functions of the 'content' property.",
				"browsers": "C,FF1.5,IE8,O10.5,S3",
				"restriction": "identifier, integer",
				"values": []
			},
			{
				"name": "counter-reset",
				"desc": "Property accepts one or more names of counters (identifiers), each one optionally followed by an integer. The integer gives the value that the counter is set to on each occurrence of the element.",
				"browsers": "C,FF1.5,IE8,O10.5,S3",
				"restriction": "identifier, integer",
				"values": []
			},
			{
				"name": "cursor",
				"desc": "Allows control over cursor appearance in an element",
				"restriction": "url, number",
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
						"name": "help"
					},
					{
						"name": "move"
					},
					{
						"name": "-moz-grab",
						"browsers": "FF"
					},
					{
						"name": "-moz-grabbing",
						"browsers": "FF"
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
						"browsers": "C,S1.2"
					},
					{
						"name": "-webkit-grabbing",
						"browsers": "C,S1.2"
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
					}
				]
			},
			{
				"name": "direction",
				"desc": "Specifies the base directionality of text and elements on a line, and the directionality of embeddings and overrides for the Unicode bidirectional algorithm.",
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
				"desc": "This property, in combination with 'float' and 'position', determines the type of box or boxes that are generated for an element.",
				"restriction": "enum",
				"values": [
					{
						"name": "block"
					},
					{
						"name": "flex"
					},
					{
						"name": "flexbox",
						"browsers": "IE11,O12.1"
					},
					{
						"name": "inline",
						"desc": "Inline boxes."
					},
					{
						"name": "inline-block"
					},
					{
						"name": "inline-flex"
					},
					{
						"name": "inline-flexbox",
						"browsers": "IE11,O12.1"
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
						"browsers": "IE10"
					},
					{
						"name": "-ms-inline-flexbox",
						"browsers": "IE10"
					},
					{
						"name": "-ms-inline-grid",
						"browsers": "IE10"
					},
					{
						"name": "none",
						"desc": "This value causes an element to generate no boxes (i.e., the element has no effect on layout). Descendant elements do not generate any boxes either; this behavior cannot be overridden by setting the 'display' property on the descendants."
					},
					{
						"name": "normal"
					},
					{
						"name": "ruby"
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
						"name": "run-in"
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
						"name": "-webkit-inline-box",
						"browsers": "C,S1"
					}
				]
			},
			{
				"name": "empty-cells",
				"desc": "In the separated borders model, this property controls the rendering of borders and backgrounds around cells that have no visible content.",
				"browsers": "C,FF1,IE7,O4,S1.2",
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
				"desc": "Allocate a shared background image all graphic elements within a container.",
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
				"name": "fill",
				"desc": "The 'fill' property paints the interior of the given graphical element.",
				"restriction": "color, enum, url",
				"values": [
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "fill-opacity",
				"desc": "'fill-opacity' specifies the opacity of the painting operation used to paint the interior the current object.",
				"restriction": "number(0-1)"
			},
			{
				"name": "fill-rule",
				"desc": "The 'fill-rule' property indicates the algorithm which is to be used to determine what parts of the canvas are included inside the shape.",
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
				"desc": "IE only. Used to produce visual effects.",
				"browsers": "IE6-9"
			},
			{
				"name": "flex",
				"desc": "Specifies the components of a flexible length: the flex grow factor and flex shrink factor, and the flex basis.",
				"browsers": "IE11,O12.1",
				"restriction": "length, number, percentage",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "none"
					}
				]
			},
			{
				"name": "flex-basis",
				"desc": "The 'flex-basis' property sets the flex basis. Negative lengths are invalid.",
				"browsers": "IE11,O12.1",
				"restriction": "length, number, percentage",
				"values": []
			},
			{
				"name": "flex-direction",
				"desc": "Specifies how flexbox items are placed in the flexbox.",
				"browsers": "IE11,O12.1",
				"restriction": "enum",
				"values": [
					{
						"name": "column"
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
				"browsers": "IE11,O12.1",
				"restriction": "enum",
				"values": [
					{
						"name": "column"
					},
					{
						"name": "column-reverse"
					},
					{
						"name": "nowrap",
						"desc": "The flexbox is single-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
					},
					{
						"name": "row"
					},
					{
						"name": "row-reverse"
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
					},
					{
						"name": "wrap-reverse"
					}
				]
			},
			{
				"name": "flex-grow",
				"desc": "The 'flex-grow' property sets the flex grow factor. Negative numbers are invalid.",
				"browsers": "IE11,O12.1",
				"restriction": "number"
			},
			{
				"name": "flex-shrink",
				"desc": "The 'flex-shrink' property sets the flex shrink factor. Negative numbers are invalid.",
				"browsers": "IE11,O12.1",
				"restriction": "number"
			},
			{
				"name": "flex-wrap",
				"desc": "controls whether the flexbox is single-line or multi-line, and the direction of the cross axis, which affects the direction new lines are stacked in and the meaning of the 'flex-align', 'flex-item-align', and 'flex-line-pack' properties.",
				"browsers": "IE11,O12.1",
				"restriction": "enum",
				"values": [
					{
						"name": "nowrap",
						"desc": "The flexbox is single-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
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
				"restriction": "color",
				"values": []
			},
			{
				"name": "flood-opacity",
				"desc": "Indicates what opacity to use to flood the current filter primitive subregion.",
				"restriction": "number(0-1)"
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
						"name": "italic"
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
						"name": "oblique"
					},
					{
						"name": "small"
					},
					{
						"name": "small-caps"
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
				"desc": "This property provides low-level control over OpenType font features. It is intended as a way of providing access to font features that are not widely used but are needed for a particular use case.",
				"browsers": "IE10",
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
				"desc": "This property is a way to preserve the readability of text when font fallback occurs. It does this by adjusting the font-size so that the x-height is the same irregardless of the font used.",
				"browsers": "FF3.5,IE10",
				"restriction": "number",
				"values": []
			},
			{
				"name": "font-stretch",
				"desc": "The font-stretch property is used to expand or contract the horizontal width of the font. The change is relative to the normal width of the font as displayed by the browser.",
				"browsers": "FF9,IE9",
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
						"browsers": "IE10"
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
						"browsers": "IE10"
					}
				]
			},
			{
				"name": "font-style",
				"desc": "Allows italic or oblique faces to be selected. Italic forms are generally cursive in nature while oblique faces are typically sloped versions of the regular face.",
				"restriction": "enum",
				"values": [
					{
						"name": "italic"
					},
					{
						"name": "normal",
						"desc": "Selects a face that is classified as 'normal'."
					},
					{
						"name": "oblique"
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
						"name": "small-caps"
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
				"desc": "Sets or retrieves a value that alters the orientation of a sequence of characters relative to an inline-progression-direction of horizontal.",
				"restriction": "angle"
			},
			{
				"name": "glyph-orientation-vertical",
				"desc": "Sets or retrieves a value that alters the orientation of a sequence of characters relative to an inline-progression-direction of vertical.",
				"restriction": "angle, enum",
				"values": []
			},
			{
				"name": "height",
				"desc": "Specifies the height of the content area, padding area or border area (depending on 'box-sizing') of certain boxes.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "image-rendering",
				"desc": "The creator of SVG content might want to provide a hint to the implementation about how to make speed vs. quality tradeoffs as it performs image processing. The ‘image-rendering’ property provides a hint to the SVG user agent about how to optimize its image rendering.",
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
						"name": "optimizeSpeed"
					},
					{
						"name": "pixelated"
					}
				]
			},
			{
				"name": "ime-mode",
				"desc": "Controls the state of the input method editor for text fields.",
				"browsers": "FF3,IE5",
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
				"name": "justify-content",
				"desc": "Aligns a flex container's lines within the flex container when there is extra space in the cross-axis, similar to how 'justify-content' aligns individual items within the main-axis.",
				"browsers": "IE11,O12.1",
				"restriction": "enum",
				"values": [
					{
						"name": "center"
					},
					{
						"name": "flex-end"
					},
					{
						"name": "flex-start"
					},
					{
						"name": "space-around"
					},
					{
						"name": "space-between"
					}
				]
			},
			{
				"name": "kerning",
				"desc": "Indicates whether the user agent should adjust inter-glyph spacing based on kerning tables that are included in the relevant font or instead disable auto-kerning and set inter-character spacing to a specific length.",
				"restriction": "length, enum",
				"values": []
			},
			{
				"name": "left",
				"desc": "Specifies how far an absolutely positioned box's left margin edge is offset to the right of the left edge of the box's 'containing block'.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "letter-spacing",
				"desc": "Specifies the minimum, maximum, and optimal spacing between grapheme clusters.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "lighting-color",
				"desc": "Defines the color of the light source for filter primitives 'feDiffuseLighting' and 'feSpecularLighting'.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "line-height",
				"desc": "Determines the block-progression dimension of the text content area of an inline box.",
				"restriction": "number, length, percentage",
				"values": [
					{
						"name": "none",
						"desc": "The computed value of the property is the ancestor block element font-size."
					},
					{
						"name": "normal",
						"desc": "Tells user agents to set the computed value to a 'reasonable' value based on the font size of the element."
					}
				]
			},
			{
				"name": "list-style",
				"desc": "Shorthand for setting 'list-style-type', 'list-style-position' and 'list-style-image'",
				"restriction": "enum, url",
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
				"restriction": "url",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "url()"
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
				"desc": "Can be used to make an element look like a standard user interface element on the platform.",
				"restriction": "enum",
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
						"name": "square",
						"desc": "A filled square."
					},
					{
						"name": "upper-alpha"
					},
					{
						"name": "upper-latin"
					},
					{
						"name": "upper-roman"
					}
				]
			},
			{
				"name": "margin",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "margin-bottom",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "margin-left",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "margin-right",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "margin-top",
				"desc": "Shorthand property to set values the thickness of the margin area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "marker",
				"desc": "Specifies the marker symbol that shall be used for all points on the sets the value for all vertices on the given ‘path’ element or basic shape.",
				"restriction": "url",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "marker-end",
				"desc": "Defines the arrowhead or polymarker that shall be drawn at the final vertex.",
				"restriction": "url",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "marker-mid",
				"desc": "Defines the arrowhead or polymarker that shall be drawn at every other vertex.",
				"restriction": "url",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "marker-start",
				"desc": "Defines the arrowhead or polymarker that shall be drawn at the first vertex of the given ‘path’ element or basic shape.",
				"restriction": "url",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "url()"
					}
				]
			},
			{
				"name": "mask",
				"desc": "Allows authors to control under what circumstances (if any) a particular graphic element can become the target of mouse events.",
				"browsers": "FF3.5,IE10,O9",
				"restriction": "url, enum",
				"values": []
			},
			{
				"name": "max-height",
				"desc": "Allows authors to constrain content height to a certain range.",
				"browsers": "C,FF1,IE7,O7,S1",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "max-width",
				"desc": "Allows authors to constrain content width to a certain range.",
				"browsers": "C,FF1,IE7,O7,S1",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "max-zoom",
				"restriction": "number, percentage"
			},
			{
				"name": "min-height",
				"desc": "Allows authors to constrain content height to a certain range.",
				"browsers": "C,FF1,IE7,O7,S1",
				"restriction": "length, percentage"
			},
			{
				"name": "min-width",
				"desc": "Allows authors to constrain content width to a certain range.",
				"browsers": "C,FF1,IE7,O7,S1",
				"restriction": "length, percentage"
			},
			{
				"name": "min-zoom",
				"restriction": "number, percentage"
			},
			{
				"name": "-moz-animation",
				"desc": "Shorthand property combines six of the animation properties into a single property.",
				"browsers": "FF9",
				"restriction": "time, enum, identifier, number",
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
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite"
					},
					{
						"name": "linear"
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
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "-moz-animation-delay",
				"desc": "Defines when the animation will start. An 'animation-delay' value of '0' means the animation will execute as soon as it is applied. Otherwise, the value specifies an offset from the moment the animation is applied, and the animation will delay execution by that offset.",
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
				"restriction": "number",
				"values": []
			},
			{
				"name": "-moz-animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "FF9",
				"restriction": "identifier",
				"values": []
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
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "-moz-appearance",
				"desc": "The -moz-appearance CSS property is used in Gecko (Firefox) to display an element using a platform-native styling based on the operating system's theme.",
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
				"restriction": "enum",
				"values": [
					{
						"name": "border-box",
						"desc": "The background is painted within (clipped to) the border box."
					},
					{
						"name": "content-box",
						"desc": "The background is painted within (clipped to) the content box."
					},
					{
						"name": "padding"
					},
					{
						"name": "padding-box"
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
				"restriction": "enum",
				"values": [
					{
						"name": "border-box",
						"desc": "The background is painted within (clipped to) the border box."
					},
					{
						"name": "content-box",
						"desc": "The background is painted within (clipped to) the content box."
					},
					{
						"name": "padding-box"
					}
				]
			},
			{
				"name": "-moz-border-bottom-colors",
				"desc": "In Mozilla applications like Firefox, -moz-border-bottom-colors sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color",
				"values": []
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
						"desc": "Causes the middle part of the border-image to be preserved. (By default it is discarded, i.e., treated as empty.)"
					},
					{
						"name": "none"
					},
					{
						"name": "repeat",
						"desc": "The image is tiled (repeated) to fill the area."
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
				"desc": "In Mozilla applications like Firefox, -moz-border-bottom-colors sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-moz-border-right-colors",
				"desc": "In Mozilla applications like Firefox, -moz-border-bottom-colors sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-moz-border-top-colors",
				"desc": "In Mozilla applications like Firefox, -moz-border-bottom-colors sets a list of colors for the bottom border.",
				"browsers": "FF1",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-moz-box-align",
				"desc": "In Mozilla applications, -moz-box-align specifies how a XUL box aligns its contents across (perpendicular to) the direction of its layout. The effect of this is only visible if there is extra space in the box.",
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
				"desc": "In Mozilla applications, -moz-box-direction specifies whether a box lays out its contents normally (from the top or left edge), or in reverse (from the bottom or right edge).",
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
				"desc": "In Mozilla applications, -moz-box-flex specifies how a box grows to fill the box that contains it, in the direction of the containing box's layout.",
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
				"desc": "In Mozilla applications, -moz-box-pack specifies how a box packs its contents in the direction of its layout. The effect of this is only visible if there is extra space in the box.",
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
						"name": "border-box",
						"desc": "The specified width and height (and respective min/max properties) on this element determine the border box of the element."
					},
					{
						"name": "content-box",
						"desc": "Behavior of width and height as specified by CSS2.1. The specified width and height (and respective min/max properties) apply to the width and height respectively of the content box of the element."
					}
				]
			},
			{
				"name": "-moz-column-count",
				"desc": "Describes the optimal number of columns into which the content of the element will be flowed.",
				"browsers": "FF3.5",
				"restriction": "integer",
				"values": []
			},
			{
				"name": "-moz-column-gap",
				"desc": "Sets the gap between columns. If there is a column rule between columns, it will appear in the middle of the gap.",
				"browsers": "FF3.5",
				"restriction": "length",
				"values": []
			},
			{
				"name": "-moz-column-rule",
				"desc": "This property is a shorthand for setting 'column-rule-width', 'column-rule-style', and 'column-rule-color' at the same place in the style sheet. Omitted values are set to their initial values.",
				"browsers": "FF3.5",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "-moz-column-rule-color",
				"desc": "Sets the color of the column rule",
				"browsers": "FF3.5",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-moz-column-rule-style",
				"desc": "Sets the style of the rule between columns of an element.",
				"browsers": "FF3.5",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "-moz-column-rule-width",
				"desc": "Sets the width of the rule between columns. Negative values are not allowed.",
				"browsers": "FF3.5",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "-moz-columns",
				"desc": "A shorthand property which sets both 'column-width' and 'column-count'.",
				"browsers": "FF9",
				"restriction": "length, integer",
				"values": []
			},
			{
				"name": "-moz-column-width",
				"desc": "This property describes the width of columns in multicol elements.",
				"browsers": "FF3.5",
				"restriction": "length",
				"values": []
			},
			{
				"name": "-moz-font-feature-settings",
				"desc": "This property provides low-level control over OpenType font features. It is intended as a way of providing access to font features that are not widely used but are needed for a particular use case.",
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
					}
				]
			},
			{
				"name": "-moz-hyphens",
				"desc": "This property controls whether hyphenation is allowed to create more break opportunities within a line of text.",
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
				"values": []
			},
			{
				"name": "-moz-perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "FF10",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
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
				"restriction": "color",
				"values": []
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
						"name": "dashed",
						"desc": "Produces a dashed line style."
					},
					{
						"name": "dotted",
						"desc": "Produces a dotted line."
					},
					{
						"name": "double",
						"desc": "Produces a double line."
					},
					{
						"name": "none",
						"desc": "Produces no line."
					},
					{
						"name": "solid",
						"desc": "Produces a solid line."
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
						"name": "auto"
					},
					{
						"name": "none"
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
				"desc": "Establishes the origin of transformation for an element. This property is applied by first translating the element by the negated value of the property, then applying the element's transform, then translating by the property value.",
				"browsers": "FF3.5",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "-moz-transition",
				"desc": "Shorthand property combines four of the transition properties into a single property.",
				"browsers": "FF4",
				"restriction": "time, property, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "none",
						"desc": "No property will transition."
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
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
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
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
				"browsers": "IE10",
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
				"desc": "The 'block-progression' property sets the block-progression value and the flow orientation",
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
				"desc": "Gets or sets a value that indicates the zoom behavior that occurs when a user hits the content boundary during a manipulation.",
				"browsers": "IE10",
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
				"name": "-ms-content-zooming",
				"desc": "Gets or sets a value that indicates whether zooming is enabled.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "none"
					},
					{
						"name": "zoom"
					}
				]
			},
			{
				"name": "-ms-content-zoom-limit",
				"desc": "Gets or sets a shorthand value that sets values for the -ms-content-zoom-limit-min and the -ms-content-zoom-limit-max properties.",
				"browsers": "IE10",
				"restriction": "percentage"
			},
			{
				"name": "-ms-content-zoom-limit-max",
				"desc": "Gets or sets a value that specifies the maximum value for the msContentZoomFactor property.",
				"browsers": "IE10",
				"restriction": "percentage"
			},
			{
				"name": "-ms-content-zoom-limit-min",
				"desc": "Gets or sets a value that specifies the minimum value for the msContentZoomFactor property.",
				"browsers": "IE10",
				"restriction": "percentage"
			},
			{
				"name": "-ms-content-zoom-snap",
				"desc": "Gets or sets a shorthand value that sets values for the -ms-content-zoom-snap-type and the -ms-content-zoom-snap-points properties.",
				"browsers": "IE10",
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
				"name": "-ms-content-zoom-snap-points",
				"desc": "Gets or sets a value that defines where zoom snap-points are located.",
				"browsers": "IE10",
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
				"name": "-ms-content-zoom-snap-type",
				"desc": "Gets or sets a value that indicates how zooming is affected by defined snap-points.",
				"browsers": "IE10",
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
						"name": "auto"
					},
					{
						"name": "none"
					}
				]
			},
			{
				"name": "-ms-flex-align",
				"desc": "The 'flex-align' property changes the way free space is allocated in the length axis.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "baseline",
						"desc": "Align all flexbox items so that their baselines line up, then distribute free space above and below the content."
					},
					{
						"name": "center",
						"desc": "The flexbox item's margin box is centered in the cross axis within the line."
					},
					{
						"name": "end",
						"desc": "The cross-end margin edge of the flexbox item is placed flush with the cross-end edge of the line."
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
				"desc": "Specifies how flexbox items are placed in the flexbox.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "column"
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
						"name": "column"
					},
					{
						"name": "column-reverse"
					},
					{
						"name": "nowrap",
						"desc": "The flexbox is single-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
					},
					{
						"name": "row"
					},
					{
						"name": "row-reverse"
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
					},
					{
						"name": "wrap-reverse"
					}
				]
			},
			{
				"name": "-ms-flex-item-align",
				"desc": "The 'flex-align' property changes the way free space is allocated in the length axis.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "baseline",
						"desc": "Align all flexbox items so that their baselines line up, then distribute free space above and below the content."
					},
					{
						"name": "center",
						"desc": "The flexbox item's margin box is centered in the cross axis within the line."
					},
					{
						"name": "end",
						"desc": "The cross-end margin edge of the flexbox item is placed flush with the cross-end edge of the line."
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
				"name": "-ms-flex-line-pack",
				"desc": "The 'flex-line-pack' property aligns a flexbox's lines within the flexbox when there is extra space in the cross axis, similar to how 'flex-pack' aligns individual items within the main axis.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "The extra space is divided evenly, with half placed before the first child and the other half placed after the last child."
					},
					{
						"name": "distribute",
						"desc": "Lines are evenly distributed in the flexbox, with half-size spaces on either end."
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
					},
					{
						"name": "stretch",
						"desc": "Lines stretch to take up the remaining space. If the leftover free-space is negative, this value is identical to 'start'."
					}
				]
			},
			{
				"name": "-ms-flex-order",
				"desc": "This property is an integer with an initial value of 1.",
				"browsers": "IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-flex-pack",
				"desc": "The 'flex-pack' property defines the flexibility of these packing spaces.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "center",
						"desc": "The extra space is divided evenly, with half placed before the first child and the other half placed after the last child."
					},
					{
						"name": "distribute",
						"desc": "Lines are evenly distributed in the flexbox, with half-size spaces on either end."
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
				"name": "-ms-flex-wrap",
				"desc": "controls whether the flexbox is single-line or multi-line, and the direction of the cross axis, which affects the direction new lines are stacked in and the meaning of the 'flex-align', 'flex-item-align', and 'flex-line-pack' properties.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "nowrap",
						"desc": "The flexbox is single-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
					},
					{
						"name": "wrap",
						"desc": "The flexbox is multi-line. The cross-start direction is equivalent to either the 'start' or 'before' direction of the current writing mode, whichever is in the cross-axis, and the cross-end direction is the opposite direction of cross-start."
					},
					{
						"name": "wrap-reverse"
					}
				]
			},
			{
				"name": "-ms-flow-from",
				"desc": "Gets or sets a value that identifies a Connected Frame container in the document that accepts the content flow from the data source.",
				"browsers": "IE10",
				"restriction": "identifier",
				"values": []
			},
			{
				"name": "-ms-flow-into",
				"desc": "Gets or sets a value that identifies an iframe container in the document that serves as the Connected Frame data source.",
				"browsers": "IE10",
				"restriction": "identifier",
				"values": []
			},
			{
				"name": "-ms-grid-column",
				"desc": "grid-column is used to place grid items and explicitly defined grid cells in the Grid.",
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10"
			},
			{
				"name": "-ms-grid-column-span",
				"desc": "Specifies the number of columns to span.",
				"browsers": "IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-grid-layer",
				"desc": "Grid-layer is similar in concept to z-index, but avoids overloading the meaning of the z-index property, which is applicable only to positioned elements.",
				"browsers": "IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-grid-row",
				"desc": "grid-row is used to place grid items and explicitly defined grid cells in the Grid.",
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10"
			},
			{
				"name": "-ms-grid-row-span",
				"desc": "Specifies the number of rows to span.",
				"browsers": "IE10",
				"restriction": "integer"
			},
			{
				"name": "-ms-high-contrast-adjust",
				"desc": "Gets or sets a value that indicates whether to override any Cascading Style Sheets (CSS) properties that would have been set in high contrast mode.",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "none"
					}
				]
			},
			{
				"name": "-ms-hyphenate-limit-chars",
				"desc": "Gets or sets one to three values that indicates the minimum number of characters in a hyphenated word.",
				"browsers": "IE10",
				"restriction": "integer",
				"values": []
			},
			{
				"name": "-ms-hyphenate-limit-lines",
				"desc": "Gets or sets a value that indicates the maximum number of consecutive lines in an element that may be ended with a hyphenated word.",
				"browsers": "IE10",
				"restriction": "integer",
				"values": []
			},
			{
				"name": "-ms-hyphenate-limit-zone",
				"desc": "Gets or sets a value that defines the width of the hyphenation zone.",
				"browsers": "IE10",
				"restriction": "percentage, length"
			},
			{
				"name": "-ms-hyphens",
				"desc": "This property controls whether hyphenation is allowed to create more break opportunities within a line of text.",
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
						"name": "newspaper"
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
				"browsers": "IE10",
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
				"values": []
			},
			{
				"name": "-ms-perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "IE10",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "-ms-perspective-origin-x",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X  position at which the viewer appears to be looking at the children of the element.",
				"browsers": "IE10",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "-ms-perspective-origin-y",
				"desc": "Establishes the origin for the perspective property. It effectively sets the Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "IE10",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
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
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scrollbar-arrow-color",
				"desc": "Determines the color of the arrow elements of a scroll arrow.",
				"browsers": "IE8",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scrollbar-base-color",
				"desc": "Determines the color of the main elements of a scroll bar, which include the scroll box, track, and scroll arrows.",
				"browsers": "IE8",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scrollbar-darkshadow-color",
				"desc": "Determines the color of the gutter of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scrollbar-face-color",
				"desc": "Determines the color of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scrollbar-highlight-color",
				"desc": "Determines the color of the top and left edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scrollbar-shadow-color",
				"desc": "Determines the color of the bottom and right edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scrollbar-track-color",
				"desc": "Determines the color of the track element of a scroll bar.",
				"browsers": "IE8",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-ms-scroll-chaining",
				"desc": "Gets or sets a value that indicates the scrolling behavior that occurs when a user hits the content boundary during a manipulation.",
				"browsers": "IE10",
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
				"browsers": "IE10",
				"restriction": "length",
				"values": []
			},
			{
				"name": "-ms-scroll-limit-x-max",
				"desc": "Gets or sets a value that specifies the maximum value for the scrollLeft property.",
				"browsers": "IE10",
				"restriction": "length",
				"values": []
			},
			{
				"name": "-ms-scroll-limit-x-min",
				"desc": "Gets or sets a value that specifies the minimum value for the scrollLeft property.",
				"browsers": "IE10",
				"restriction": "length"
			},
			{
				"name": "-ms-scroll-limit-y-max",
				"desc": "Gets or sets a value that specifies the maximum value for the scrollTop property.",
				"browsers": "IE10",
				"restriction": "length",
				"values": []
			},
			{
				"name": "-ms-scroll-limit-y-min",
				"desc": "Gets or sets a value that specifies the minimum value for the scrollTop property.",
				"browsers": "IE10",
				"restriction": "length"
			},
			{
				"name": "-ms-scroll-rails",
				"desc": "Gets or sets a value that indicates whether or not small motions perpendicular to the primary axis of motion will result in either changes to both the scrollTop and scrollLeft properties or a change to the primary axis (for instance, either the scrollTop or scrollLeft properties will change, but not both).",
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
					}
				]
			},
			{
				"name": "-ms-scroll-snap-x",
				"desc": "Gets or sets a shorthand value that sets values for the -ms-scroll-snap-type and -ms-scroll-snap-points-x properties.",
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
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
				"browsers": "IE8",
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
				"browsers": "IE8",
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
				"name": "-ms-text-justify",
				"desc": "Selects the justification algorithm used when 'text-align' is set to 'justify'. The property applies to block containers, but the UA may (but is not required to) also support it on inline elements.",
				"browsers": "IE8",
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
				"browsers": "IE10",
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
				"browsers": "IE10",
				"restriction": "enum, percentage",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "none"
					}
				]
			},
			{
				"name": "-ms-text-underline-position",
				"desc": "Sets the position of an underline specified on the same element: it does not affect underlines specified by ancestor elements.This property is typically used in vertical writing contexts such as in Japanese documents where it often desired to have the underline appear 'over' (to the right of) the affected run of text",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "alphabetic"
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
				"browsers": "IE10",
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
				"desc": "Establishes the origin of transformation for an element. This property is applied by first translating the element by the negated value of the property, then applying the element's transform, then translating by the property value.",
				"browsers": "IE9-9",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
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
				"browsers": "IE10",
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
						"desc": "Block characters can no longer create implied break points. Otherwise this option is equivalent to 'normal'. This option is mostly used where the presence of word separator characters still creates line-breaking opportunities, as in Korean."
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
						"name": "break-word"
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
				"browsers": "IE10",
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
						"name": "start",
						"desc": "Inline flow content can wrap on the start edge of the exclusion area but must leave the area to end edge of the exclusion area empty."
					}
				]
			},
			{
				"name": "-ms-wrap-margin",
				"desc": "Gets or sets a value that is used to offset the inner wrap shape from other shapes.",
				"browsers": "IE10",
				"restriction": "length, percentage"
			},
			{
				"name": "-ms-wrap-through",
				"desc": "Gets or sets a value that specifies how content should wrap around an exclusion element.",
				"browsers": "IE10",
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
				"desc": "This is a shorthand property for both 'direction' and 'block-progression'.",
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
				"values": []
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
				"values": []
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
				"name": "-o-animation",
				"desc": "Shorthand property combines six of the animation properties into a single property.",
				"browsers": "O12",
				"restriction": "time, enum, identifier, number",
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
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite"
					},
					{
						"name": "linear"
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
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "-o-animation-delay",
				"desc": "Defines when the animation will start. An 'animation-delay' value of '0' means the animation will execute as soon as it is applied. Otherwise, the value specifies an offset from the moment the animation is applied, and the animation will delay execution by that offset.",
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
				"restriction": "number",
				"values": []
			},
			{
				"name": "-o-animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "O12",
				"restriction": "identifier",
				"values": []
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
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "object-position",
				"desc": "Determines the alignment of the replaced element inside its box.",
				"browsers": "O10.6",
				"restriction": "enum, length, percentage",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "-o-border-image",
				"desc": "Shorthand property for setting 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset' and 'border-image-repeat'. Omitted values are set to their initial values.",
				"browsers": "O11.6",
				"restriction": "length, percentage, number, url, enum",
				"values": [
					{
						"name": "auto",
						"desc": "If 'auto' is specified then the border image width is the intrinsic width or height (whichever is applicable) of the corresponding image slice. If the image does not have the required intrinsic dimension then the corresponding border-width is used instead."
					},
					{
						"name": "fill",
						"desc": "Causes the middle part of the border-image to be preserved. (By default it is discarded, i.e., treated as empty.)"
					},
					{
						"name": "none"
					},
					{
						"name": "repeat",
						"desc": "The image is tiled (repeated) to fill the area."
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
				"name": "-o-object-fit",
				"desc": "The object-fit property specifies how the contents of a replaced element should be scaled relative to the box established by its used height and width.",
				"browsers": "O10.6",
				"restriction": "enum",
				"values": [
					{
						"name": "contain"
					},
					{
						"name": "cover"
					},
					{
						"name": "fill"
					},
					{
						"name": "none"
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
				"restriction": "enum, length, percentage",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "opacity",
				"desc": "Opacity of an element's text, where 1 is opaque and 0 is entirely transparent.",
				"browsers": "C,FF3.6,IE9,O9,S1.2",
				"restriction": "number(0-1)"
			},
			{
				"name": "order",
				"desc": "Controls the order in which flex items appear within their flex container, by assigning them to ordinal groups.",
				"browsers": "IE11,O12.1",
				"restriction": "integer"
			},
			{
				"name": "orientation"
			},
			{
				"name": "orphans",
				"desc": "Specifies the minimum number of lines in a block element that must be left at the bottom of a page.",
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
				"desc": "This property determines the width of the tab character (U+0009), in space characters (U+0020), when rendered",
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
				"desc": "Establishes the origin of transformation for an element. This property is applied by first translating the element by the negated value of the property, then applying the element's transform, then translating by the property value.",
				"browsers": "O10.5",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "-o-transition",
				"desc": "Shorthand property combines four of the transition properties into a single property.",
				"browsers": "O11.5",
				"restriction": "time, property, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "none",
						"desc": "No property will transition."
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
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
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "outline",
				"desc": "Shorthand property, and sets all three of 'outline-style', 'outline-width', and 'outline-color'.",
				"browsers": "C,FF1.5,IE8,O8,S1.2",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "invert"
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "outline-color",
				"desc": "The color of the outline",
				"browsers": "C,FF1.5,IE8,O8,S1.2",
				"restriction": "color",
				"values": [
					{
						"name": "invert"
					}
				]
			},
			{
				"name": "outline-offset",
				"desc": "Width of the outline",
				"browsers": "C,FF1.5,O9.5,S1.2",
				"restriction": "length"
			},
			{
				"name": "outline-style",
				"desc": "Style of the outline",
				"browsers": "C,FF1.5,IE8,O8,S1.2",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "outline-width",
				"desc": "Width of the outline",
				"browsers": "C,FF1.5,IE8,O8,S1.2",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
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
				"name": "overflow-x",
				"desc": "Specify whether content is clipped when it overflows the element's content area.",
				"browsers": "C,FF1.5,IE5,O9.5,S3",
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
				"desc": "Specify whether content is clipped when it overflows the element's content area.",
				"browsers": "C,FF1.5,IE5,O9.5,S3",
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
				"name": "padding",
				"desc": "Shorthand property to set values the thickness of the padding area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
				"restriction": "length, percentage"
			},
			{
				"name": "padding-bottom",
				"desc": "Shorthand property to set values the thickness of the padding area. If left is omitted, it is the same as right. If bottom is omitted it is the same as top, if right is omitted it is the same as top. The value may not be negative.",
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
				"restriction": "enum",
				"values": [
					{
						"name": "fill"
					},
					{
						"name": "markers"
					},
					{
						"name": "normal"
					},
					{
						"name": "stroke"
					}
				]
			},
			{
				"name": "perspective",
				"desc": "Applies the same transform as the perspective(<number>) transform function, except that it applies only to the positioned or transformed children of the element, not to the transform on the element itself.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "length",
				"values": []
			},
			{
				"name": "perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "pointer-events",
				"desc": "Allows authors to control under what circumstances (if any) a particular graphic element can become the target of mouse events.",
				"restriction": "enum",
				"values": [
					{
						"name": "all"
					},
					{
						"name": "fill"
					},
					{
						"name": "none"
					},
					{
						"name": "painted"
					},
					{
						"name": "stroke"
					},
					{
						"name": "visible"
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
						"name": "center",
						"desc": "Center positioned boxes are taken out of the normal flow. This means they have no impact on the layout of later siblings."
					},
					{
						"name": "fixed",
						"desc": "The box's position is calculated according to the 'absolute' model, but in addition, the box is fixed with respect to some reference. As with the 'absolute' model, the box's margins do not collapse with any other margins."
					},
					{
						"name": "-ms-page",
						"browsers": "IE10"
					},
					{
						"name": "page",
						"desc": "The box's position is calculated according to the 'absolute' model."
					},
					{
						"name": "relative"
					},
					{
						"name": "static"
					},
					{
						"name": "sticky"
					},
					{
						"name": "-webkit-sticky",
						"browsers": "C"
					}
				]
			},
			{
				"name": "quotes",
				"desc": "Specifies quotation marks for any number of embedded quotations.",
				"browsers": "C,FF1.5,IE8,O8,S5.1",
				"restriction": "string",
				"values": []
			},
			{
				"name": "resize",
				"desc": "Allows control over the appearance and function of the resizing mechanism (e.g. a resize box or widget) on the element. Applies to elements with 'overflow' other than 'visible'.",
				"browsers": "C,FF4,S3",
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
				"values": []
			},
			{
				"name": "ruby-align",
				"desc": "This property can be used on any element to control the text alignment of the ruby text and ruby base contents relative to each other.",
				"browsers": "FF10,IE5",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent determines how the ruby contents are aligned. This is the initial value."
					},
					{
						"name": "center",
						"desc": "The ruby text content is centered within the width of the base. If the length of the base is smaller than the length of the ruby text, then the base is centered within the width of the ruby text."
					},
					{
						"name": "distribute-letter"
					},
					{
						"name": "distribute-space"
					},
					{
						"name": "end",
						"desc": "The ruby text content is aligned with the end edge of the base."
					},
					{
						"name": "left",
						"desc": "The ruby text content is aligned with the start edge of the base."
					},
					{
						"name": "line-edge"
					},
					{
						"name": "right",
						"desc": "The ruby text content is aligned with the end edge of the base."
					},
					{
						"name": "start",
						"desc": "The ruby text content is aligned with the start edge of the base."
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
				"desc": "This property is used by the parent of elements with display: ruby-text to control the position of the ruby text with respect to its base.",
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
				"restriction": "color",
				"values": []
			},
			{
				"name": "scrollbar-arrow-color",
				"desc": "Determines the color of the arrow elements of a scroll arrow.",
				"browsers": "IE6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "scrollbar-base-color",
				"desc": "Determines the color of the main elements of a scroll bar, which include the scroll box, track, and scroll arrows.",
				"browsers": "IE6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "scrollbar-darkshadow-color",
				"desc": "Determines the color of the gutter of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "scrollbar-face-color",
				"desc": "Determines the color of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "scrollbar-highlight-color",
				"desc": "Determines the color of the top and left edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "scrollbar-shadow-color",
				"desc": "Determines the color of the bottom and right edges of the scroll box and scroll arrows of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "scrollbar-track-color",
				"desc": "Determines the color of the track element of a scroll bar.",
				"browsers": "IE6",
				"restriction": "color",
				"values": []
			},
			{
				"name": "size",
				"browsers": "C,O8",
				"restriction": "length"
			},
			{
				"name": "src",
				"desc": "specifies the resource containing font data. It is required, whether the font is downloadable or locally installed. It's value is a prioritized, comma-separated list of external references or locally installed font face names.",
				"restriction": "enum, string, url, identifier"
			},
			{
				"name": "stop-color",
				"desc": "The 'stop-color' property indicates what color to use at that gradient stop.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "stop-opacity",
				"desc": "The 'stop-opacity' property defines the opacity of a given gradient stop.",
				"restriction": "number(0-1)"
			},
			{
				"name": "stroke",
				"desc": "The 'stroke' property paints along the outline of the given graphical element.",
				"restriction": "color",
				"values": []
			},
			{
				"name": "stroke-dasharray",
				"desc": "Controls the pattern of dashes and gaps used to stroke paths.",
				"restriction": "length, percentage, enum",
				"values": []
			},
			{
				"name": "stroke-dashoffset",
				"desc": "Specifies the distance into the dash pattern to start the dash.",
				"restriction": "percentage, length, integer"
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
						"name": "round"
					},
					{
						"name": "square"
					}
				]
			},
			{
				"name": "stroke-linejoin",
				"desc": "specifies the shape to be used at the corners of paths or basic shapes when they are stroked.",
				"restriction": "enum",
				"values": [
					{
						"name": "bevel"
					},
					{
						"name": "miter"
					},
					{
						"name": "round"
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
				"desc": "This property specifies the width of the stroke on the current object.",
				"restriction": "percentage, length, integer"
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
				"name": "text-align",
				"desc": "Describes how inline contents of a block are horizontally aligned if the contents do not completely fill the line box.",
				"restriction": "string",
				"values": [
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
				"name": "text-align-last",
				"desc": "Describes how the last line of a block or a line right before a forced line break is aligned when 'text-align' is set to 'justify'.",
				"browsers": "FF12,IE5",
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
				"name": "text-anchor",
				"desc": "Used to align (start-, middle- or end-alignment) a string of text relative to a given point.",
				"restriction": "enum",
				"values": [
					{
						"name": "end"
					},
					{
						"name": "middle"
					},
					{
						"name": "start"
					}
				]
			},
			{
				"name": "text-combine-upright",
				"desc": "This property specifies the combination of multiple characters into the space of a single character.",
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
				"name": "text-decoration",
				"desc": "Decorations applied to font used for an element's text.",
				"restriction": "enum, color",
				"values": [
					{
						"name": "dashed",
						"desc": "Produces a dashed line style."
					},
					{
						"name": "dotted",
						"desc": "Produces a dotted line."
					},
					{
						"name": "double",
						"desc": "Produces a double line."
					},
					{
						"name": "line-through"
					},
					{
						"name": "overline"
					},
					{
						"name": "solid",
						"desc": "Produces a solid line."
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
				"name": "text-indent",
				"desc": "Specifies the indentation applied to lines of inline content in a block. The indentation only affects the first line of inline content in the block unless the 'hanging' keyword is specified, in which case it affects all lines except the first.",
				"restriction": "percentage, length",
				"values": []
			},
			{
				"name": "text-justify",
				"desc": "Selects the justification algorithm used when 'text-align' is set to 'justify'. The property applies to block containers, but the UA may (but is not required to) also support it on inline elements.",
				"browsers": "IE5.5",
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
				"name": "text-orientation",
				"desc": "This property specifies the orientation of text within a line",
				"restriction": "enum",
				"values": [
					{
						"name": "mixed"
					},
					{
						"name": "sideways"
					},
					{
						"name": "sideways-left"
					},
					{
						"name": "sideways-right"
					},
					{
						"name": "upright"
					},
					{
						"name": "use-glyph-orientation"
					}
				]
			},
			{
				"name": "text-overflow",
				"desc": "Text can overflow for example when it is prevented from wrapping",
				"browsers": "C,FF9,IE5.5,O11.6,S2",
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
						"name": "optimizeSpeed"
					}
				]
			},
			{
				"name": "text-shadow",
				"desc": "Enables shadow effects to be applied to the text of the element.",
				"browsers": "C,FF3.6,IE10,O9.5,S1.1",
				"restriction": "length, color",
				"values": []
			},
			{
				"name": "text-transform",
				"desc": "Controls capitalization effects of an element's text.",
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
						"desc": "No capitalization effects."
					},
					{
						"name": "uppercase"
					}
				]
			},
			{
				"name": "text-underline-position",
				"desc": "Sets the position of an underline specified on the same element: it does not affect underlines specified by ancestor elements. This property is typically used in vertical writing contexts such as in Japanese documents where it often desired to have the underline appear 'over' (to the right of) the affected run of text",
				"browsers": "IE10",
				"restriction": "enum",
				"values": [
					{
						"name": "auto",
						"desc": "The user agent may use any algorithm to determine the underline's position. In horizontal line layout, the underline should be aligned as for alphabetic. In vertical line layout, if the language is set to Japanese or Korean, the underline should be aligned as for over."
					},
					{
						"name": "below",
						"desc": "The underline is aligned with the under edge of the element's content box."
					}
				]
			},
			{
				"name": "top",
				"desc": "Specifies how far an absolutely positioned box's top margin edge is offset below the top edge of the box's 'containing block'.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "touch-action",
				"browsers": "IE11",
				"restriction": "enum",
				"values": [
					{
						"name": "auto"
					},
					{
						"name": "double-tap-zoom"
					},
					{
						"name": "manipulation"
					},
					{
						"name": "none"
					},
					{
						"name": "pan-x"
					},
					{
						"name": "pan-y"
					},
					{
						"name": "pinch-zoom"
					}
				]
			},
			{
				"name": "transform",
				"desc": "A two-dimensional transformation is applied to an element through the 'transform' property. This property contains a list of transform functions similar to those allowed by SVG.",
				"browsers": "FF16,IE10,O12.5",
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
				"name": "transform-origin",
				"desc": "Establishes the origin of transformation for an element. This property is applied by first translating the element by the negated value of the property, then applying the element's transform, then translating by the property value.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
			},
			{
				"name": "transform-style",
				"desc": "Defines how nested elements are rendered in 3D space.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "enum",
				"values": [
					{
						"name": "flat"
					}
				]
			},
			{
				"name": "transition",
				"desc": "Shorthand property combines four of the transition properties into a single property.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "time, property, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "none",
						"desc": "No property will transition."
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "transition-delay",
				"desc": "Defines when the transition will start. It allows a transition to begin execution some period of time from when it is applied.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "time"
			},
			{
				"name": "transition-duration",
				"desc": "Specifies how long the transition from the old value to the new value should take.",
				"browsers": "FF16,IE10,O12.5",
				"restriction": "time"
			},
			{
				"name": "transition-property",
				"desc": "Specifies the name of the CSS property to which the transition is applied.",
				"browsers": "FF16,IE10,O12.5",
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
				"browsers": "FF16,IE10,O12.5",
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
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
						"name": "isolate-override"
					},
					{
						"name": "normal",
						"desc": "The element does not open an additional level of embedding with respect to the bidirectional algorithm. For inline-level elements, implicit reordering works across element boundaries."
					}
				]
			},
			{
				"name": "unicode-range",
				"desc": "Range of Unicode characters supported by a given font. Initial value is U+0-10FFFF",
				"restriction": "unicode-range"
			},
			{
				"name": "user-zoom"
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
						"name": "sub"
					},
					{
						"name": "super"
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
				"restriction": "time, enum, identifier, number",
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
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "forwards"
					},
					{
						"name": "infinite"
					},
					{
						"name": "linear"
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
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
			},
			{
				"name": "-webkit-animation-delay",
				"desc": "Defines when the animation will start. An 'animation-delay' value of '0' means the animation will execute as soon as it is applied. Otherwise, the value specifies an offset from the moment the animation is applied, and the animation will delay execution by that offset.",
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
				"restriction": "number",
				"values": []
			},
			{
				"name": "-webkit-animation-name",
				"desc": "Defines a list of animations that apply. Each name is used to select the keyframe at-rule that provides the property values for the animation.",
				"browsers": "C,S5",
				"restriction": "identifier",
				"values": []
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
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
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
				"restriction": "enum",
				"values": [
					{
						"name": "border-box",
						"desc": "The background is painted within (clipped to) the border box."
					},
					{
						"name": "content-box",
						"desc": "The background is painted within (clipped to) the content box."
					},
					{
						"name": "padding-box"
					}
				]
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
				"restriction": "enum",
				"values": [
					{
						"name": "border-box",
						"desc": "The background is painted within (clipped to) the border box."
					},
					{
						"name": "content-box",
						"desc": "The background is painted within (clipped to) the content box."
					},
					{
						"name": "padding-box"
					}
				]
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
						"desc": "Causes the middle part of the border-image to be preserved. (By default it is discarded, i.e., treated as empty.)"
					},
					{
						"name": "none"
					},
					{
						"name": "repeat",
						"desc": "The image is tiled (repeated) to fill the area."
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
						"name": "above"
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
						"name": "border-box",
						"desc": "The specified width and height (and respective min/max properties) on this element determine the border box of the element."
					},
					{
						"name": "content-box",
						"desc": "Behavior of width and height as specified by CSS2.1. The specified width and height (and respective min/max properties) apply to the width and height respectively of the content box of the element."
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
				"values": []
			},
			{
				"name": "-webkit-column-gap",
				"desc": "Sets the gap between columns. If there is a column rule between columns, it will appear in the middle of the gap.",
				"browsers": "C,S3",
				"restriction": "length",
				"values": []
			},
			{
				"name": "-webkit-column-rule",
				"desc": "This property is a shorthand for setting 'column-rule-width', 'column-rule-style', and 'column-rule-color' at the same place in the style sheet. Omitted values are set to their initial values.",
				"browsers": "C,S3",
				"restriction": "length, color, enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "medium"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "-webkit-column-rule-color",
				"desc": "Sets the color of the column rule",
				"browsers": "C,S3",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-webkit-column-rule-style",
				"desc": "Sets the style of the rule between columns of an element.",
				"browsers": "C,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "dashed",
						"desc": "A series of square-ended dashes."
					},
					{
						"name": "dotted",
						"desc": "A series of round dots."
					},
					{
						"name": "double",
						"desc": "Two parallel solid lines with some space between them. (The thickness of the lines is not specified, but the sum of the lines and the space must equal 'border-width'.)"
					},
					{
						"name": "groove"
					},
					{
						"name": "hidden",
						"desc": "Same as 'none', but has different behavior in the border conflict resolution rules for border-collapsed tables."
					},
					{
						"name": "inset",
						"desc": "Looks as if the content on the inside of the border is sunken into the canvas. Treated as 'ridge' in border-collapsed tables."
					},
					{
						"name": "none",
						"desc": "No border. Color and width are ignored (i.e., the border has width 0, unless the border is an image)"
					},
					{
						"name": "outset"
					},
					{
						"name": "ridge"
					},
					{
						"name": "solid",
						"desc": "A single line segment."
					}
				]
			},
			{
				"name": "-webkit-column-rule-width",
				"desc": "Sets the width of the rule between columns. Negative values are not allowed.",
				"browsers": "C,S3",
				"restriction": "length",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "-webkit-columns",
				"desc": "A shorthand property which sets both 'column-width' and 'column-count'.",
				"browsers": "C,S3",
				"restriction": "length, integer",
				"values": []
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
				"values": []
			},
			{
				"name": "-webkit-filter",
				"browsers": "S6",
				"restriction": "enum",
				"values": [
					{
						"name": "blur(3px)"
					},
					{
						"name": "brightness(2)"
					},
					{
						"name": "contrast(2)"
					},
					{
						"name": "grayscale()"
					},
					{
						"name": "hue-rotate(180deg)"
					},
					{
						"name": "invert()"
					},
					{
						"name": "saturate(3)"
					},
					{
						"name": "sepia()"
					}
				]
			},
			{
				"name": "-webkit-flow-from",
				"desc": "Gets or sets a value that identifies a Connected Frame container in the document that accepts the content flow from the data source.",
				"browsers": "C,S5.2",
				"restriction": "identifier",
				"values": []
			},
			{
				"name": "-webkit-flow-into",
				"desc": "Gets or sets a value that identifies an iframe container in the document that serves as the Connected Frame data source.",
				"browsers": "C,S5.2",
				"restriction": "identifier",
				"values": []
			},
			{
				"name": "-webkit-font-feature-settings",
				"desc": "This property provides low-level control over OpenType font features. It is intended as a way of providing access to font features that are not widely used but are needed for a particular use case.",
				"browsers": "C,S5.2",
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
					}
				]
			},
			{
				"name": "-webkit-hyphens",
				"desc": "This property controls whether hyphenation is allowed to create more break opportunities within a line of text.",
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
				"values": []
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
				"values": []
			},
			{
				"name": "-webkit-perspective-origin",
				"desc": "Establishes the origin for the perspective property. It effectively sets the X and Y position at which the viewer appears to be looking at the children of the element.",
				"browsers": "C,S4",
				"restriction": "percentage, length",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
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
				"browsers": "C,S3.1",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-webkit-text-fill-color",
				"browsers": "S3",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-webkit-text-size-adjust",
				"desc": "Specifies a size adjustment for displaying text content in Safari on iPhone.",
				"browsers": "C,S3",
				"restriction": "percentage",
				"values": [
					{
						"name": "auto",
						"desc": "The text size is automatically adjusted for Safari on iPhone."
					},
					{
						"name": "none",
						"desc": "The text size is not adjusted."
					}
				]
			},
			{
				"name": "-webkit-text-stroke",
				"browsers": "S3",
				"restriction": "color, length, percentage",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "-webkit-text-stroke-color",
				"browsers": "S3",
				"restriction": "color",
				"values": []
			},
			{
				"name": "-webkit-text-stroke-width",
				"browsers": "S3",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "medium"
					},
					{
						"name": "thick"
					},
					{
						"name": "thin"
					}
				]
			},
			{
				"name": "-webkit-touch-callout",
				"browsers": "S3",
				"restriction": "enum",
				"values": []
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
				"desc": "Establishes the origin of transformation for an element. This property is applied by first translating the element by the negated value of the property, then applying the element's transform, then translating by the property value.",
				"browsers": "C,O12,S3.1",
				"restriction": "length, percentage",
				"values": [
					{
						"name": "bottom"
					},
					{
						"name": "center"
					},
					{
						"name": "left"
					},
					{
						"name": "right"
					},
					{
						"name": "top"
					}
				]
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
				"restriction": "time, property, enum",
				"values": [
					{
						"name": "all",
						"desc": "Every property that is able to undergo a transition will do so."
					},
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "none",
						"desc": "No property will transition."
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
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
				"restriction": "enum",
				"values": [
					{
						"name": "cubic-bezier()"
					},
					{
						"name": "ease"
					},
					{
						"name": "ease-in"
					},
					{
						"name": "ease-in-out"
					},
					{
						"name": "ease-out"
					},
					{
						"name": "linear"
					},
					{
						"name": "step-end"
					},
					{
						"name": "steps(1, start)"
					},
					{
						"name": "step-start"
					}
				]
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
				"desc": "Specifies the minimum number of lines in a block element that must be left at the top of a page.",
				"browsers": "C,IE8,O9.5,S1",
				"restriction": "integer"
			},
			{
				"name": "width",
				"desc": "Specifies the width of the content area, padding area or border area (depending on 'box-sizing') of certain boxes.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "will-change",
				"desc": "Provides a rendering hint to the user agent, stating what kinds of changes the author expects to perform on the element.",
				"browsers": "C,FF",
				"restriction": "enum, identifier",
				"values": [
					{
						"name": "auto"
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
				"browsers": "C,FF15,IE5,S3",
				"restriction": "enum",
				"values": [
					{
						"name": "break-all"
					},
					{
						"name": "keep-all",
						"desc": "Block characters can no longer create implied break points. Otherwise this option is equivalent to 'normal'. This option is mostly used where the presence of word separator characters still creates line-breaking opportunities, as in Korean."
					},
					{
						"name": "normal",
						"desc": "Breaks non-CJK scripts according to their own rules."
					}
				]
			},
			{
				"name": "word-spacing",
				"desc": "Specifies the minimum, maximum, and optimal spacing between words.",
				"restriction": "length, percentage",
				"values": []
			},
			{
				"name": "word-wrap",
				"desc": "Specifies whether the UA may break within a word to prevent overflow when an otherwise-unbreakable string is too long to fit.",
				"restriction": "enum",
				"values": [
					{
						"name": "break-word"
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
				"restriction": "enum",
				"values": [
					{
						"name": "horizontal-tb"
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
				"values": []
			},
			{
				"name": "zoom",
				"desc": "Sets or retrieves the magnification scale of the object.",
				"browsers": "IE6,S4",
				"restriction": "enum, integer, number, percentage",
				"values": []
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
	"cubic-bezier()": "Specifies a cubic-bezier curve. The four values specify points P1 and P2  of the curve as (x1, y1, x2, y2). All values must be in the range [0, 1].",
	"ease": "Equivalent to cubic-bezier(0.25, 0.1, 0.25, 1.0).",
	"ease-in": "Equivalent to cubic-bezier(0.42, 0, 1.0, 1.0).",
	"ease-in-out": "Equivalent to cubic-bezier(0.42, 0, 0.58, 1.0).",
	"ease-out": "Equivalent to cubic-bezier(0, 0, 0.58, 1.0).",
	"forwards": "The final property value (as defined in the last @keyframes at-rule) is maintained after the animation completes.",
	"infinite": "Causes the animation to repeat forever.",
	"linear": "Equivalent to cubic-bezier(0.0, 0.0, 1.0, 1.0).",
	"step-end": "The step-end function is equivalent to steps(1, end).",
	"steps(1, start)": "The first parameter specifies the number of intervals in the function. The second parameter, which is optional, is either the value 'start' or 'end'.",
	"step-start": "The step-start function is equivalent to steps(1, start).",
	"paused": "A running animation will be paused.",
	"running": "Resume playback of a paused animation.",
	"local": "The background is fixed with regard to the element's contents: if the element has a scrolling mechanism, the background scrolls with the element's contents.",
	"no-repeat": "The image is placed once and not repeated in this direction.",
	"padding-box": "The background is painted within (clipped to) the padding box",
	"repeat-x": "Equivalent to 'repeat no-repeat'.",
	"repeat-y": "Equivalent to 'no-repeat repeat'.",
	"groove": "Looks as if it were carved in the canvas. (This is typically achieved by creating a \"shadow\" from two colors that are slightly lighter and darker than the 'border-color'.)",
	"outset": "Looks as if the content on the inside of the border is coming out of the canvas. Treated as 'groove' in border-collapsed tables.",
	"ridge": "Looks as if it were coming out of the canvas.",
	"clone": "Each box is independently wrapped with the border and padding. The 'border-radius' and 'border-image' and 'box-shadow', if any, are applied to each box independently. The background is drawn independently in each box of the element. A no-repeat background image will thus be rendered once in each box of the element.",
	"slice": "No border and no padding are inserted at the break. No box-shadow is drawn at the broken edge; 'border-radius' has no effect at its corners; and the 'border-image' is rendered for the whole box as if it were unbroken. The effect is as though the element were rendered with no break present, and then sliced by the break afterward.",
	"balance": "Balance content equally between columns, if possible.",
	"attr()": "The attr(n) function returns as a string the value of attribute n for the subject of the selector",
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
	"help": "Help is available for the object under the cursor. Often rendered as a question mark or a balloon.",
	"move": "Indicates something is to be moved.",
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
	"w-resize": "Indicates that west edge is to be moved.",
	"ltr": "Left-to-right direction.",
	"rtl": "Right-to-left direction.",
	"block": "Block boxes.",
	"inline-block": "A block box, which itself is flowed as a single inline box, similar to a replaced element. The inside of an inline-block is formatted as a block box, and the box itself is formatted as an inline box.",
	"list-item": "One or more block boxes and one marker box.",
	"-ms-grid": "A value of grid causes an element to display as a block-level Grid element",
	"-ms-inline-grid": "A value of inline-grid causes an element to display as an inline-level Grid element.",
	"run-in": "Either block or inline boxes, depending on context. Properties apply to run-in boxes based on their final status (inline-level or block-level).",
	"hide": "No borders or backgrounds are drawn around/behind empty cells.",
	"show": "Borders and backgrounds are drawn around/behind empty cells (like normal cells).",
	"accumulate": "If the ancestor container element has a property of new, then all graphics elements within the current container are rendered both on the parent's background image and onto the target.",
	"new": "Create a new background image canvas. All children of the current container element can access the background, and they will be rendered onto both the parent's background image canvas in addition to the target device.",
	"wrap-reverse": "Same as 'wrap', except the cross-start and cross-end directions are swapped.",
	"bold": "Same as 700",
	"bolder": "Specifies the weight of the face bolder than the inherited value.",
	"caption": "The font used for captioned controls (e.g., buttons, drop-downs, etc.).",
	"italic": "Selects a font that is labeled 'italic', or, if that is not available, one labeled 'oblique'.",
	"lighter": "Specifies the weight of the face lighter than the inherited value.",
	"menu": "The font used in menus (e.g., dropdown menus and menu lists).",
	"message-box": "The font used in dialog boxes.",
	"oblique": "Selects a font that is labeled 'oblique'.",
	"small-caps": "Specifies a font that is labeled as a small-caps font. If a genuine small-caps font is not available, user agents should simulate a small-caps font.",
	"small-caption": "The font used for labeling small controls.",
	"status-bar": "The font used in window status bars.",
	"narrower": "Indicates a narrower value relative to the width of the parent element.",
	"wider": "Indicates a wider value relative to the width of the parent element.",
	"crisp-edges": "The image must be scaled with an algorithm that preserves contrast and edges in the image, and which does not smooth colors or introduce blur to the image in the process.",
	"pixelated": "When scaling the image up, the 'nearest neighbor' or similar algorithm must be used, so that the image appears to be simply composed of very large pixels.",
	"active": "The input method editor is initially active; text entry is performed using it unless the user specifically dismisses it.",
	"disabled": "The input method editor is disabled and may not be activated by the user.",
	"inactive": "The input method editor is initially inactive, but the user may activate it if they wish.",
	"circle": "A hollow circle.",
	"disc": "A filled circle.",
	"inside": "The marker box is outside the principal block box, as described in the section on the ::marker pseudo-element below.",
	"outside": "The ::marker pseudo-element is an inline element placed immediately before all ::before pseudo-elements in the principal block box, after which the element's content flows.",
	"block-axis": "Elements are oriented along the box's axis.",
	"inline-axis": "Elements are oriented vertically.",
	"manual": "Words are only broken at line breaks where there are characters inside the word that suggest line break opportunities",
	"line-through": "Each line of text has a line through the middle.",
	"overline": "Each line of text has a line above it.",
	"underline": "Each line of text is underlined.",
	"wavy": "Produces a wavy line.",
	"matrix()": "Specifies a 2D transformation in the form of a transformation matrix of six values. matrix(a,b,c,d,e,f) is equivalent to applying the transformation matrix [a b c d e f]",
	"matrix3d()": "specifies a 3D transformation as a 4x4 homogeneous matrix of 16 values in column-major order.",
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
	"mode": "Any of the range of mode values available to the -ms-layout-grid-mode property.",
	"type": "Any of the range of type values available to the -ms-layout-grid-type property.",
	"loose": "Default. Grid used for Japanese and Korean characters.",
	"newspaper": "Breaks CJK scripts using the least restrictive set of line-breaking rules. Typically used for short lines, such as in newspapers.",
	"-ms-autohiding-scrollbar": "Indicates the element displays auto-hiding scrollbars during mouse interactions and panning indicators during touch and keyboard interactions.",
	"scrollbar": "Scrollbars are typically narrow strips inserted on one or two edges of an element and which often have arrows to click on and a \"thumb\" to drag up and down (or left and right) to move the contents of the element.",
	"ideograph-alpha": "Creates 1/4em extra spacing between runs of ideographic letters and non-ideographic letters, such as Latin-based, Cyrillic, Greek, Arabic or Hebrew.",
	"ideograph-numeric": "Creates 1/4em extra spacing between runs of ideographic letters and numeric glyphs.",
	"ideograph-parenthesis": "Creates extra spacing between normal (non wide) parenthesis and ideographs.",
	"ideograph-space": "Extends the width of the space character while surrounded by ideographs.",
	"punctuation": "Creates extra non-breaking spacing around punctuation as required by language-specific typographic conventions.",
	"inter-cluster": "Justification primarily changes spacing at word separators and at grapheme cluster boundaries in clustered scripts. This value is typically used for Southeast Asian scripts such as Thai.",
	"inter-ideograph": "Justification primarily changes spacing at word separators and at inter-graphemic boundaries in scripts that use no word spaces. This value is typically used for CJK languages.",
	"inter-word": "Justification primarily changes spacing at word separators. This value is typically used for languages that separate words using spaces, like English or (sometimes) Korean.",
	"kashida": "Justification primarily stretches Arabic and related scripts through the use of kashida or other calligraphic elongation.",
	"clip": "Clip inline content that overflows. Characters may be only partially rendered.",
	"ellipsis": "Render an ellipsis character (U+2026) to represent clipped inline content.",
	"alphabetic": "The underline is aligned with the alphabetic baseline. In this case the underline is likely to cross some descenders.",
	"over": "The underline is aligned with the 'top' (right in vertical writing) edge of the element's em-box. In this mode, an overline also switches sides.",
	"under": "The underline is aligned with the 'bottom' (left in vertical writing) edge of the element's em-box. In this case the underline usually does not cross the descenders. This is sometimes called 'accounting' underline.",
	"grippers": "Grippers are always on.",
	"break-all": "Lines may break between any two grapheme clusters for non-CJK scripts. This option is used mostly in a context where the text is predominantly using CJK characters with few non-CJK excerpts and it is desired that the text be better distributed on each line.",
	"break-word": "An unbreakable 'word' may be broken at an arbitrary point if there are no otherwise-acceptable break points in the line.",
	"clear": "Inline flow content can only wrap on top and bottom of the exclusion and must leave the areas to the start and end edges of the exclusion box empty.",
	"maximum": "Inline flow content can wrap on the side of the exclusion with the largest available space for the given line, and must leave the other side of the exclusion empty.",
	"invert": "'Invert' is expected to perform a color inversion on the pixels on the screen. This is a common way to ensure the focus border is visible, regardless of color background.",
	"absolute": "The box's position (and possibly size) is specified with the 'top', 'right', 'bottom', and 'left' properties. These properties specify offsets with respect to the box's 'containing block'.",
	"-ms-page": "The box's position is calculated according to the 'absolute' model.",
	"relative": "The box's position is calculated according to the normal flow (this is called the position in normal flow). Then the box is offset relative to its normal position.",
	"static": "The box is a normal box, laid out according to the normal flow. The 'top', 'right', 'bottom', and 'left' properties do not apply.",
	"sticky": "The box's position is calculated according to the normal flow. Then the box is offset relative to its flow root and containing block and in all cases, including table elements, does not affect the position of any following boxes.",
	"distribute-letter": "If the width of the ruby text is smaller than that of the base, then the ruby text contents are evenly distributed across the width of the base, with the first and last ruby text glyphs lining up with the corresponding first and last base glyphs. If the width of the ruby text is at least the width of the base, then the letters of the base are evenly distributed across the width of the ruby text.",
	"distribute-space": "If the width of the ruby text is smaller than that of the base, then the ruby text contents are evenly distributed across the width of the base, with a certain amount of white space preceding the first and following the last character in the ruby text. That amount of white space is normally equal to half the amount of inter-character space of the ruby text.",
	"line-edge": "If the ruby text is not adjacent to a line edge, it is aligned as in 'auto'. If it is adjacent to a line edge, then it is still aligned as in auto, but the side of the ruby text that touches the end of the line is lined up with the corresponding edge of the base.",
	"after": "The ruby text appears after the base. This is a relatively rare setting used in ideographic East Asian writing systems, most easily found in educational text.",
	"before": "The ruby text appears before the base. This is the most common setting used in ideographic East Asian writing systems.",
	"attr(x)": "The value of attribute 'x' is a string value. The string value is evaluated as a <number> to determine the number of ruby base elements to be spanned by the annotation element.",
	"digits": "Attempt to typeset horizontally each maximal sequence of consecutive ASCII digits (U+0030–U+0039) that has as many or fewer characters than the specified integer such that it takes up the space of a single character within the vertical line box.",
	"mixed": "In vertical writing modes, characters from horizontal-only scripts are set sideways, i.e. 90° clockwise from their standard orientation in horizontal text.",
	"sideways": "This value is equivalent to 'sideways-right' in 'vertical-rl' writing mode and equivalent to 'sideways-left' in 'vertical-lr' writing mode.",
	"sideways-left": "In vertical writing modes, this causes text to be set as if in a horizontal layout, but rotated 90° counter-clockwise.",
	"sideways-right": "In vertical writing modes, this causes text to be set as if in a horizontal layout, but rotated 90° clockwise.",
	"upright": "In vertical writing modes, characters from horizontal-only scripts are rendered upright, i.e. in their standard horizontal orientation.",
	"use-glyph-orientation": "This value deprecated and only applies to SVG.",
	"capitalize": "Puts all words in titlecase.",
	"lowercase": "Puts all characters of each word in lowercase.",
	"uppercase": "Puts all characters of each word in uppercase.",
	"flat": "All children of this element are rendered flattened into the 2D plane of the element.",
	"bidi-override": "Inside the element, reordering is strictly in sequence according to the 'direction' property; the implicit part of the bidirectional algorithm is ignored.",
	"embed": "If the element is inline-level, this value opens an additional level of embedding with respect to the bidirectional algorithm. The direction of this embedding level is given by the 'direction' property.",
	"isolate-override": "This combines the isolation behavior of 'isolate' with the directional override behavior of 'bidi-override'",
	"sub": "Lower the baseline of the box to the proper position for subscripts of the parent's box. (This value has no effect on the font size of the element's text.)",
	"super": "Raise the baseline of the box to the proper position for superscripts of the parent's box. (This value has no effect on the font size of the element's text.)",
	"text-bottom": "Align the bottom of the box with the after-edge of the parent element's font.",
	"text-top": "Align the top of the box with the before-edge of the parent element's font.",
	"above": "The reflection appears above the border box.",
	"break": "If the content fits within the CSS Region, then this property has no effect.",
	"pre": "Sets 'white-space-collapsing' to 'preserve' and 'text-wrap' to 'none'.",
	"pre-line": "Sets 'white-space-collapsing' to 'preserve-breaks' and 'text-wrap' to 'normal'.",
	"pre-wrap": "Sets 'white-space-collapsing' to 'preserve' and 'text-wrap' to 'normal'.",
	"horizontal-tb": "Top-to-bottom block flow direction. The writing mode is horizontal.",
	"vertical-lr": "Left-to-right block flow direction. The writing mode is vertical.",
	"vertical-rl": "Right-to-left block flow direction. The writing mode is vertical."
};
});