/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*--------------------------------------------------------------------------------------------
 *  This file is based on or incorporates material from the projects listed below (Third Party IP).
 *  The original copyright notice and the license under which Microsoft received such Third Party IP,
 *  are set forth below. Such licenses and notices are provided for informational purposes only.
 *  Microsoft licenses the Third Party IP to you under the licensing terms for the Microsoft product.
 *  Microsoft reserves all other rights not expressly granted under this agreement, whether by implication,
 *  estoppel or otherwise.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Copyright © 2015 W3C® (MIT, ERCIM, Keio, Beihang). This software or document includes includes material copied
 *  from or derived from HTML 5.1 W3C Working Draft (http://www.w3.org/TR/2015/WD-html51-20151008/.)"
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Ionic Main Site (https://github.com/driftyco/ionic-site).
 *  Copyright Drifty Co. http://drifty.com/.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file
 *  except in compliance with the License. You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
 *  WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
 *  MERCHANTABLITY OR NON-INFRINGEMENT.
 *
 *  See the Apache Version 2.0 License for specific language governing permissions
 *  and limitations under the License.
 *--------------------------------------------------------------------------------------------*/

import strings = require('vs/base/common/strings');
import nls = require('vs/nls');

export interface IHTMLTagProvider {
	collectTags(collector: (tag: string, label: string) => void): void;
	collectAttributes(tag: string, collector: (attribute: string, type: string) => void): void;
	collectValues(tag: string, attribute: string, collector: (value: string) => void): void;
}

export interface ITagSet {
	[tag: string]: HTMLTagSpecification;
}

export class HTMLTagSpecification {
	constructor(public label: string, public attributes: string[] = []) { }
}

interface IValueSets {
	[tag: string]: string[];
}

// HTML tag information sourced from http://www.w3.org/TR/2015/WD-html51-20151008/
export const HTML_TAGS: ITagSet = {
	// The root element
	html: new HTMLTagSpecification(
		nls.localize('tags.html', 'The html element represents the root of an HTML document.'),
		['manifest']),
	// Document metadata
	head: new HTMLTagSpecification(
		nls.localize('tags.head', 'The head element represents a collection of metadata for the Document.')),
	title: new HTMLTagSpecification(
		nls.localize('tags.title', 'The title element represents the document\'s title or name. Authors should use titles that identify their documents even when they are used out of context, for example in a user\'s history or bookmarks, or in search results. The document\'s title is often different from its first heading, since the first heading does not have to stand alone when taken out of context.')),
	base: new HTMLTagSpecification(
		nls.localize('tags.base', 'The base element allows authors to specify the document base URL for the purposes of resolving relative URLs, and the name of the default browsing context for the purposes of following hyperlinks. The element does not represent any content beyond this information.'),
		['href', 'target']),
	link: new HTMLTagSpecification(
		nls.localize('tags.link', 'The link element allows authors to link their document to other resources.'),
		['href', 'crossorigin:xo', 'rel', 'media', 'hreflang', 'type', 'sizes']),
	meta: new HTMLTagSpecification(
		nls.localize('tags.meta', 'The meta element represents various kinds of metadata that cannot be expressed using the title, base, link, style, and script elements.'),
		['name', 'http-equiv', 'content', 'charset']),
	style: new HTMLTagSpecification(
		nls.localize('tags.style', 'The style element allows authors to embed style information in their documents. The style element is one of several inputs to the styling processing model. The element does not represent content for the user.'),
		['media', 'nonce', 'type', 'scoped:v']),
	// Sections
	body: new HTMLTagSpecification(
		nls.localize('tags.body', 'The body element represents the content of the document.'),
		['onafterprint', 'onbeforeprint', 'onbeforeunload', 'onhashchange', 'onlanguagechange', 'onmessage', 'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpopstate', 'onstorage', 'onunload']),
	article: new HTMLTagSpecification(
		nls.localize('tags.article', 'The article element represents a complete, or self-contained, composition in a document, page, application, or site and that is, in principle, independently distributable or reusable, e.g. in syndication. This could be a forum post, a magazine or newspaper article, a blog entry, a user-submitted comment, an interactive widget or gadget, or any other independent item of content. Each article should be identified, typically by including a heading (h1–h6 element) as a child of the article element.')),
	section: new HTMLTagSpecification(
		nls.localize('tags.section', 'The section element represents a generic section of a document or application. A section, in this context, is a thematic grouping of content. Each section should be identified, typically by including a heading ( h1- h6 element) as a child of the section element.')),
	nav: new HTMLTagSpecification(
		nls.localize('tags.nav', 'The nav element represents a section of a page that links to other pages or to parts within the page: a section with navigation links.')),
	aside: new HTMLTagSpecification(
		nls.localize('tags.aside', 'The aside element represents a section of a page that consists of content that is tangentially related to the content around the aside element, and which could be considered separate from that content. Such sections are often represented as sidebars in printed typography.')),
	h1: new HTMLTagSpecification(
		nls.localize('tags.h1', 'The h1 element represents a section heading.')),
	h2: new HTMLTagSpecification(
		nls.localize('tags.h2', 'The h2 element represents a section heading.')),
	h3: new HTMLTagSpecification(
		nls.localize('tags.h3', 'The h3 element represents a section heading.')),
	h4: new HTMLTagSpecification(
		nls.localize('tags.h4', 'The h4 element represents a section heading.')),
	h5: new HTMLTagSpecification(
		nls.localize('tags.h5', 'The h5 element represents a section heading.')),
	h6: new HTMLTagSpecification(
		nls.localize('tags.h6', 'The h6 element represents a section heading.')),
	header: new HTMLTagSpecification(
		nls.localize('tags.header', 'The header element represents introductory content for its nearest ancestor sectioning content or sectioning root element. A header typically contains a group of introductory or navigational aids. When the nearest ancestor sectioning content or sectioning root element is the body element, then it applies to the whole page.')),
	footer: new HTMLTagSpecification(
		nls.localize('tags.footer', 'The footer element represents a footer for its nearest ancestor sectioning content or sectioning root element. A footer typically contains information about its section such as who wrote it, links to related documents, copyright data, and the like.')),
	address: new HTMLTagSpecification(
		nls.localize('tags.address', 'The address element represents the contact information for its nearest article or body element ancestor. If that is the body element, then the contact information applies to the document as a whole.')),
	// Grouping content
	p: new HTMLTagSpecification(
		nls.localize('tags.p', 'The p element represents a paragraph.')),
	hr: new HTMLTagSpecification(
		nls.localize('tags.hr', 'The hr element represents a paragraph-level thematic break, e.g. a scene change in a story, or a transition to another topic within a section of a reference book.')),
	pre: new HTMLTagSpecification(
		nls.localize('tags.pre', 'The pre element represents a block of preformatted text, in which structure is represented by typographic conventions rather than by elements.')),
	blockquote: new HTMLTagSpecification(
		nls.localize('tags.blockquote', 'The blockquote element represents content that is quoted from another source, optionally with a citation which must be within a footer or cite element, and optionally with in-line changes such as annotations and abbreviations.'),
		['cite']),
	ol: new HTMLTagSpecification(
		nls.localize('tags.ol', 'The ol element represents a list of items, where the items have been intentionally ordered, such that changing the order would change the meaning of the document.'),
		['reversed:v', 'start', 'type:lt']),
	ul: new HTMLTagSpecification(
		nls.localize('tags.ul', 'The ul element represents a list of items, where the order of the items is not important — that is, where changing the order would not materially change the meaning of the document.')),
	li: new HTMLTagSpecification(
		nls.localize('tags.li', 'The li element represents a list item. If its parent element is an ol, ul, or menu element, then the element is an item of the parent element\'s list, as defined for those elements. Otherwise, the list item has no defined list-related relationship to any other li element.'),
		['value']),
	dl: new HTMLTagSpecification(
		nls.localize('tags.dl', 'The dl element represents an association list consisting of zero or more name-value groups (a description list). A name-value group consists of one or more names (dt elements) followed by one or more values (dd elements), ignoring any nodes other than dt and dd elements. Within a single dl element, there should not be more than one dt element for each name.')),
	dt: new HTMLTagSpecification(
		nls.localize('tags.dt', 'The dt element represents the term, or name, part of a term-description group in a description list (dl element).')),
	dd: new HTMLTagSpecification(
		nls.localize('tags.dd', 'The dd element represents the description, definition, or value, part of a term-description group in a description list (dl element).')),
	figure: new HTMLTagSpecification(
		nls.localize('tags.figure', 'The figure element represents some flow content, optionally with a caption, that is self-contained (like a complete sentence) and is typically referenced as a single unit from the main flow of the document.')),
	figcaption: new HTMLTagSpecification(
		nls.localize('tags.figcaption', 'The figcaption element represents a caption or legend for the rest of the contents of the figcaption element\'s parent figure element, if any.')),
	main: new HTMLTagSpecification(
		nls.localize('tags.main', 'The main element represents the main content of the body of a document or application. The main content area consists of content that is directly related to or expands upon the central topic of a document or central functionality of an application.')),
	div: new HTMLTagSpecification(
		nls.localize('tags.div', 'The div element has no special meaning at all. It represents its children. It can be used with the class, lang, and title attributes to mark up semantics common to a group of consecutive elements.')),
	// Text-level semantics
	a: new HTMLTagSpecification(
		nls.localize('tags.a', 'If the a element has an href attribute, then it represents a hyperlink (a hypertext anchor) labeled by its contents.'),
		['href', 'target', 'download', 'ping', 'rel', 'hreflang', 'type']),
	em: new HTMLTagSpecification(
		nls.localize('tags.em', 'The em element represents stress emphasis of its contents.')),
	strong: new HTMLTagSpecification(
		nls.localize('tags.strong', 'The strong element represents strong importance, seriousness, or urgency for its contents.')),
	small: new HTMLTagSpecification(
		nls.localize('tags.small', 'The small element represents side comments such as small print.')),
	s: new HTMLTagSpecification(
		nls.localize('tags.s', 'The s element represents contents that are no longer accurate or no longer relevant.')),
	cite: new HTMLTagSpecification(
		nls.localize('tags.cite', 'The cite element represents a reference to a creative work. It must include the title of the work or the name of the author(person, people or organization) or an URL reference, or a reference in abbreviated form as per the conventions used for the addition of citation metadata.')),
	q: new HTMLTagSpecification(
		nls.localize('tags.q', 'The q element represents some phrasing content quoted from another source.'),
		['cite']),
	dfn: new HTMLTagSpecification(
		nls.localize('tags.dfn', 'The dfn element represents the defining instance of a term. The paragraph, description list group, or section that is the nearest ancestor of the dfn element must also contain the definition(s) for the term given by the dfn element.')),
	abbr: new HTMLTagSpecification(
		nls.localize('tags.abbr', 'The abbr element represents an abbreviation or acronym, optionally with its expansion. The title attribute may be used to provide an expansion of the abbreviation. The attribute, if specified, must contain an expansion of the abbreviation, and nothing else.')),
	ruby: new HTMLTagSpecification(
		nls.localize('tags.ruby', 'The ruby element allows one or more spans of phrasing content to be marked with ruby annotations. Ruby annotations are short runs of text presented alongside base text, primarily used in East Asian typography as a guide for pronunciation or to include other annotations. In Japanese, this form of typography is also known as furigana. Ruby text can appear on either side, and sometimes both sides, of the base text, and it is possible to control its position using CSS. A more complete introduction to ruby can be found in the Use Cases & Exploratory Approaches for Ruby Markup document as well as in CSS Ruby Module Level 1. [RUBY-UC] [CSSRUBY]')),
	rb: new HTMLTagSpecification(
		nls.localize('tags.rb', 'The rb element marks the base text component of a ruby annotation. When it is the child of a ruby element, it doesn\'t represent anything itself, but its parent ruby element uses it as part of determining what it represents.')),
	rt: new HTMLTagSpecification(
		nls.localize('tags.rt', 'The rt element marks the ruby text component of a ruby annotation. When it is the child of a ruby element or of an rtc element that is itself the child of a ruby element, it doesn\'t represent anything itself, but its ancestor ruby element uses it as part of determining what it represents.')),
	// <rtc> is not yet supported by 2+ browsers
	//rtc: new HTMLTagSpecification(
	//	nls.localize('tags.rtc', 'The rtc element marks a ruby text container for ruby text components in a ruby annotation. When it is the child of a ruby element it doesn\'t represent anything itself, but its parent ruby element uses it as part of determining what it represents.')),
	rp: new HTMLTagSpecification(
		nls.localize('tags.rp', 'The rp element is used to provide fallback text to be shown by user agents that don\'t support ruby annotations. One widespread convention is to provide parentheses around the ruby text component of a ruby annotation.')),
	// <data> is not yet supported by 2+ browsers
	//data: new HTMLTagSpecification(
	//	nls.localize('tags.data', 'The data element represents its contents, along with a machine-readable form of those contents in the value attribute.')),
	time: new HTMLTagSpecification(
		nls.localize('tags.time', 'The time element represents its contents, along with a machine-readable form of those contents in the datetime attribute. The kind of content is limited to various kinds of dates, times, time-zone offsets, and durations, as described below.'),
		['datetime']),
	code: new HTMLTagSpecification(
		nls.localize('tags.code', 'The code element represents a fragment of computer code. This could be an XML element name, a file name, a computer program, or any other string that a computer would recognize.')),
	var: new HTMLTagSpecification(
		nls.localize('tags.var', 'The var element represents a variable. This could be an actual variable in a mathematical expression or programming context, an identifier representing a constant, a symbol identifying a physical quantity, a function parameter, or just be a term used as a placeholder in prose.')),
	samp: new HTMLTagSpecification(
		nls.localize('tags.samp', 'The samp element represents sample or quoted output from another program or computing system.')),
	kbd: new HTMLTagSpecification(
		nls.localize('tags.kbd', 'The kbd element represents user input (typically keyboard input, although it may also be used to represent other input, such as voice commands).')),
	sub: new HTMLTagSpecification(
		nls.localize('tags.sub', 'The sub element represents a subscript.')),
	sup: new HTMLTagSpecification(
		nls.localize('tags.sup', 'The sup element represents a superscript.')),
	i: new HTMLTagSpecification(
		nls.localize('tags.i', 'The i element represents a span of text in an alternate voice or mood, or otherwise offset from the normal prose in a manner indicating a different quality of text, such as a taxonomic designation, a technical term, an idiomatic phrase from another language, transliteration, a thought, or a ship name in Western texts.')),
	b: new HTMLTagSpecification(
		nls.localize('tags.b', 'The b element represents a span of text to which attention is being drawn for utilitarian purposes without conveying any extra importance and with no implication of an alternate voice or mood, such as key words in a document abstract, product names in a review, actionable words in interactive text-driven software, or an article lede.')),
	u: new HTMLTagSpecification(
		nls.localize('tags.u', 'The u element represents a span of text with an unarticulated, though explicitly rendered, non-textual annotation, such as labeling the text as being a proper name in Chinese text (a Chinese proper name mark), or labeling the text as being misspelt.')),
	mark: new HTMLTagSpecification(
		nls.localize('tags.mark', 'The mark element represents a run of text in one document marked or highlighted for reference purposes, due to its relevance in another context. When used in a quotation or other block of text referred to from the prose, it indicates a highlight that was not originally present but which has been added to bring the reader\'s attention to a part of the text that might not have been considered important by the original author when the block was originally written, but which is now under previously unexpected scrutiny. When used in the main prose of a document, it indicates a part of the document that has been highlighted due to its likely relevance to the user\'s current activity.')),
	bdi: new HTMLTagSpecification(
		nls.localize('tags.bdi', 'The bdi element represents a span of text that is to be isolated from its surroundings for the purposes of bidirectional text formatting. [BIDI]')),
	bdo: new HTMLTagSpecification(
		nls.localize('tags.dbo', 'The bdo element represents explicit text directionality formatting control for its children. It allows authors to override the Unicode bidirectional algorithm by explicitly specifying a direction override. [BIDI]')),
	span: new HTMLTagSpecification(
		nls.localize('tags.span', 'The span element doesn\'t mean anything on its own, but can be useful when used together with the global attributes, e.g. class, lang, or dir. It represents its children.')),
	br: new HTMLTagSpecification(
		nls.localize('tags.br', 'The br element represents a line break.')),
	wbr: new HTMLTagSpecification(
		nls.localize('tags.wbr', 'The wbr element represents a line break opportunity.')),
	// Edits
	ins: new HTMLTagSpecification(
		nls.localize('tags.ins', 'The ins element represents an addition to the document.')),
	del: new HTMLTagSpecification(
		nls.localize('tags.del', 'The del element represents a removal from the document.'),
		['cite', 'datetime']),
	// Embedded content
	picture: new HTMLTagSpecification(
		nls.localize('tags.picture', 'The picture element is a container which provides multiple sources to its contained img element to allow authors to declaratively control or give hints to the user agent about which image resource to use, based on the screen pixel density, viewport size, image format, and other factors. It represents its children.')),
	img: new HTMLTagSpecification(
		nls.localize('tags.img', 'An img element represents an image.'),
		['alt', 'src', 'srcset', 'crossorigin:xo', 'usemap', 'ismap:v', 'width', 'height']),
	iframe: new HTMLTagSpecification(
		nls.localize('tags.iframe', 'The iframe element represents a nested browsing context.'),
		['src', 'srcdoc', 'name', 'sandbox:sb', 'seamless:v', 'allowfullscreen:v', 'width', 'height']),
	embed: new HTMLTagSpecification(
		nls.localize('tags.embed', 'The embed element provides an integration point for an external (typically non-HTML) application or interactive content.'),
		['src', 'type', 'width', 'height']),
	object: new HTMLTagSpecification(
		nls.localize('tags.object', 'The object element can represent an external resource, which, depending on the type of the resource, will either be treated as an image, as a nested browsing context, or as an external resource to be processed by a plugin.'),
		['data', 'type', 'typemustmatch:v', 'name', 'usemap', 'form', 'width', 'height']),
	param: new HTMLTagSpecification(
		nls.localize('tags.param', 'The param element defines parameters for plugins invoked by object elements. It does not represent anything on its own.'),
		['name', 'value']),
	video: new HTMLTagSpecification(
		nls.localize('tags.video', 'A video element is used for playing videos or movies, and audio files with captions.'),
		['src', 'crossorigin:xo', 'poster', 'preload:pl', 'autoplay:v', 'mediagroup', 'loop:v', 'muted:v', 'controls:v', 'width', 'height']),
	audio: new HTMLTagSpecification(
		nls.localize('tags.audio', 'An audio element represents a sound or audio stream.'),
		['src', 'crossorigin:xo', 'preload:pl', 'autoplay:v', 'mediagroup', 'loop:v', 'muted:v', 'controls:v']),
	source: new HTMLTagSpecification(
		nls.localize('tags.source', 'The source element allows authors to specify multiple alternative media resources for media elements. It does not represent anything on its own.'),
		// 'When the source element has a parent that is a picture element, the source element allows authors to specify multiple alternative source sets for img elements.'
		['src', 'type']),
	track: new HTMLTagSpecification(
		nls.localize('tags.track', 'The track element allows authors to specify explicit external timed text tracks for media elements. It does not represent anything on its own.'),
		['default:v', 'kind:tk', 'label', 'src', 'srclang']),
	map: new HTMLTagSpecification(
		nls.localize('tags.map', 'The map element, in conjunction with an img element and any area element descendants, defines an image map. The element represents its children.'),
		['name']),
	area: new HTMLTagSpecification(
		nls.localize('tags.area', 'The area element represents either a hyperlink with some text and a corresponding area on an image map, or a dead area on an image map.'),
		['alt', 'coords', 'shape:sh', 'href', 'target', 'download', 'ping', 'rel', 'hreflang', 'type']),
	// Tabular data
	table: new HTMLTagSpecification(
		nls.localize('tags.table', 'The table element represents data with more than one dimension, in the form of a table.'),
		['sortable:v', 'border']),
	caption: new HTMLTagSpecification(
		nls.localize('tags.caption', 'The caption element represents the title of the table that is its parent, if it has a parent and that is a table element.')),
	colgroup: new HTMLTagSpecification(
		nls.localize('tags.colgroup', 'The colgroup element represents a group of one or more columns in the table that is its parent, if it has a parent and that is a table element.'),
		['span']),
	col: new HTMLTagSpecification(
		nls.localize('tags.col', 'If a col element has a parent and that is a colgroup element that itself has a parent that is a table element, then the col element represents one or more columns in the column group represented by that colgroup.'),
		['span']),
	tbody: new HTMLTagSpecification(
		nls.localize('tags.tbody', 'The tbody element represents a block of rows that consist of a body of data for the parent table element, if the tbody element has a parent and it is a table.')),
	thead: new HTMLTagSpecification(
		nls.localize('tags.thead', 'The thead element represents the block of rows that consist of the column labels (headers) for the parent table element, if the thead element has a parent and it is a table.')),
	tfoot: new HTMLTagSpecification(
		nls.localize('tags.tfoot', 'The tfoot element represents the block of rows that consist of the column summaries (footers) for the parent table element, if the tfoot element has a parent and it is a table.')),
	tr: new HTMLTagSpecification(
		nls.localize('tags.tr', 'The tr element represents a row of cells in a table.')),
	td: new HTMLTagSpecification(
		nls.localize('tags.td', 'The td element represents a data cell in a table.'),
		['colspan', 'rowspan', 'headers']),
	th: new HTMLTagSpecification(
		nls.localize('tags.th', 'The th element represents a header cell in a table.'),
		['colspan', 'rowspan', 'headers', 'scope:s', 'sorted', 'abbr']),
	// Forms
	form: new HTMLTagSpecification(
		nls.localize('tags.form', 'The form element represents a collection of form-associated elements, some of which can represent editable values that can be submitted to a server for processing.'),
		['accept-charset', 'action', 'autocomplete:o', 'enctype:et', 'method:m', 'name', 'novalidate:v', 'target']),
	label: new HTMLTagSpecification(
		nls.localize('tags.label', 'The label element represents a caption in a user interface. The caption can be associated with a specific form control, known as the label element\'s labeled control, either using the for attribute, or by putting the form control inside the label element itself.'),
		['form', 'for']),
	input: new HTMLTagSpecification(
		nls.localize('tags.input', 'The input element represents a typed data field, usually with a form control to allow the user to edit the data.'),
		['accept', 'alt', 'autocomplete:o', 'autofocus:v', 'checked:v', 'dirname', 'disabled:v', 'form', 'formaction', 'formenctype:et', 'formmethod:fm', 'formnovalidate:v', 'formtarget', 'height', 'inputmode:im', 'list', 'max', 'maxlength', 'min', 'minlength', 'multiple:v', 'name', 'pattern', 'placeholder', 'readonly:v', 'required:v', 'size', 'src', 'step', 'type:t', 'value', 'width']),
	button: new HTMLTagSpecification(
		nls.localize('tags.button', 'The button element represents a button labeled by its contents.'),
		['autofocus:v', 'disabled:v', 'form', 'formaction', 'formenctype:et', 'formmethod:fm', 'formnovalidate:v', 'formtarget', 'name', 'type:bt', 'value']),
	select: new HTMLTagSpecification(
		nls.localize('tags.select', 'The select element represents a control for selecting amongst a set of options.'),
		['autocomplete:o', 'autofocus:v', 'disabled:v', 'form', 'multiple:v', 'name', 'required:v', 'size']),
	datalist: new HTMLTagSpecification(
		nls.localize('tags.datalist', 'The datalist element represents a set of option elements that represent predefined options for other controls. In the rendering, the datalist element represents nothing and it, along with its children, should be hidden.')),
	optgroup: new HTMLTagSpecification(
		nls.localize('tags.optgroup', 'The optgroup element represents a group of option elements with a common label.'),
		['disabled:v', 'label']),
	option: new HTMLTagSpecification(
		nls.localize('tags.option', 'The option element represents an option in a select element or as part of a list of suggestions in a datalist element.'),
		['disabled:v', 'label', 'selected:v', 'value']),
	textarea: new HTMLTagSpecification(
		nls.localize('tags.textarea', 'The textarea element represents a multiline plain text edit control for the element\'s raw value. The contents of the control represent the control\'s default value.'),
		['autocomplete:o', 'autofocus:v', 'cols', 'dirname', 'disabled:v', 'form', 'inputmode:im', 'maxlength', 'minlength', 'name', 'placeholder', 'readonly:v', 'required:v', 'rows', 'wrap:w']),
	output: new HTMLTagSpecification(
		nls.localize('tags.output', 'The output element represents the result of a calculation performed by the application, or the result of a user action.'),
		['for', 'form', 'name']),
	progress: new HTMLTagSpecification(
		nls.localize('tags.progress', 'The progress element represents the completion progress of a task. The progress is either indeterminate, indicating that progress is being made but that it is not clear how much more work remains to be done before the task is complete (e.g. because the task is waiting for a remote host to respond), or the progress is a number in the range zero to a maximum, giving the fraction of work that has so far been completed.'),
		['value', 'max']),
	meter: new HTMLTagSpecification(
		nls.localize('tags.meter', 'The meter element represents a scalar measurement within a known range, or a fractional value; for example disk usage, the relevance of a query result, or the fraction of a voting population to have selected a particular candidate.'),
		['value', 'min', 'max', 'low', 'high', 'optimum']),
	fieldset: new HTMLTagSpecification(
		nls.localize('tags.fieldset', 'The fieldset element represents a set of form controls optionally grouped under a common name.'),
		['disabled:v', 'form', 'name']),
	legend: new HTMLTagSpecification(
		nls.localize('tags.legend', 'The legend element represents a caption for the rest of the contents of the legend element\'s parent fieldset element, if any.')),
	// Interactive elements
	details: new HTMLTagSpecification(
		nls.localize('tags.details', 'The details element represents a disclosure widget from which the user can obtain additional information or controls.'),
		['open:v']),
	summary: new HTMLTagSpecification(
		nls.localize('tags.summary', 'The summary element represents a summary, caption, or legend for the rest of the contents of the summary element\'s parent details element, if any.')),
	// <menu> and <menuitem> are not yet supported by 2+ browsers
	//menu: new HTMLTagSpecification(
	//	nls.localize('tags.menu', 'The menu element represents a list of commands.'),
	//	['type:mt', 'label']),
	//menuitem: new HTMLTagSpecification(
	//	nls.localize('tags.menuitem', 'The menuitem element represents a command that the user can invoke from a popup menu (either a context menu or the menu of a menu button).')),
	dialog: new HTMLTagSpecification(
		nls.localize('tags.dialog', 'The dialog element represents a part of an application that a user interacts with to perform a task, for example a dialog box, inspector, or window.')),
	// Scripting
	script: new HTMLTagSpecification(
		nls.localize('tags.script', 'The script element allows authors to include dynamic script and data blocks in their documents. The element does not represent content for the user.'),
		['src', 'type', 'charset', 'async:v', 'defer:v', 'crossorigin:xo', 'nonce']),
	noscript: new HTMLTagSpecification(
		nls.localize('tags.noscript', 'The noscript element represents nothing if scripting is enabled, and represents its children if scripting is disabled. It is used to present different markup to user agents that support scripting and those that don\'t support scripting, by affecting how the document is parsed.')),
	template: new HTMLTagSpecification(
		nls.localize('tags.template', 'The template element is used to declare fragments of HTML that can be cloned and inserted in the document by script.')),
	canvas: new HTMLTagSpecification(
		nls.localize('tags.canvas', 'The canvas element provides scripts with a resolution-dependent bitmap canvas, which can be used for rendering graphs, game graphics, art, or other visual images on the fly.'),
		['width', 'height'])
};

// Ionic tag information sourced from Ionic main website (https://github.com/driftyco/ionic-site)
export const IONIC_TAGS: ITagSet = {
	'ion-checkbox': new HTMLTagSpecification(nls.localize('tags.ion.checkbox', 'The checkbox is no different than the HTML checkbox input, except it\'s styled differently. The checkbox behaves like any AngularJS checkbox.'),
		['name', 'ng-false-value', 'ng-model', 'ng-true-value']),
	'ion-content': new HTMLTagSpecification(nls.localize('tags.ion.content', 'The ionContent directive provides an easy to use content area that can be configured to use Ionic\'s custom Scroll View, or the built-in overflow scrolling of the browser.'),
		['delegate-handle', 'direction:scrolldir', 'has-bouncing:b', 'locking:b', 'on-scroll', 'on-scroll-complete', 'overflow-scroll:b', 'padding:b', 'scroll:b', 'scrollbar-x:b', 'scrollbar-y:b', 'start-x', 'start-y']),
	'ion-delete-button': new HTMLTagSpecification(nls.localize('tags.ion.deletebutton', 'Child of ionItem'),
		[]),
	'ion-footer-bar': new HTMLTagSpecification(nls.localize('tags.ion.footerbar', 'Adds a fixed footer bar below some content. Can also be a subfooter (higher up) if the "bar-subfooter" class is applied.'),
		['align-title:align', 'keyboard-attach:v']),
	'ion-header-bar': new HTMLTagSpecification(nls.localize('tags.ion.headerbar', 'Adds a fixed header bar above some content. Can also be a subheader (lower down) if the "bar-subheader" class is applied.'),
		['align-title:align', 'no-tap-scroll:b']),
	'ion-infinite-scroll': new HTMLTagSpecification(nls.localize('tags.ion.infinitescroll', 'Child of ionContent or ionScroll. The ionInfiniteScroll directive allows you to call a function whenever the user gets to the bottom of the page or near the bottom of the page.'),
		['distance', 'icon', 'immediate-check:b', 'on-infinite', 'spinner']),
	'ion-input': new HTMLTagSpecification(nls.localize('tags.ion.input', 'ionInput is meant for text type inputs only. Ionic uses an actual <input type="text"> HTML element within the component, with Ionic wrapping to better handle the user experience and interactivity.'),
		['type:inputtype', 'clearInput:v']),
	'ion-item': new HTMLTagSpecification(nls.localize('tags.ion.item', 'Child of ionList.'),
		[]),
	'ion-list': new HTMLTagSpecification(nls.localize('tags.ion.list', 'The List is a widely used interface element in almost any mobile app, and can include content ranging from basic text all the way to buttons, toggles, icons, and thumbnails.'),
		['can-swipe:b', 'delegate-handle', 'show-delete:b', 'show-reorder:b', 'type:listtype']),
	'ion-modal-view': new HTMLTagSpecification(nls.localize('tags.ion.modalview', 'The Modal is a content pane that can go over the user\'s main view temporarily. Usually used for making a choice or editing an item.'),
		[]),
	'ion-nav-back-button': new HTMLTagSpecification(nls.localize('tags.ion.navbackbutton', 'Child of ionNavBar. Creates a back button inside an ionNavBar. The back button will appear when the user is able to go back in the current navigation stack.'),
		[]),
	'ion-nav-bar': new HTMLTagSpecification(nls.localize('tags.ion.navbar', 'If you have an ionNavView directive, you can also create an <ion-nav-bar>, which will create a topbar that updates as the application state changes.'),
		['align-title:align', 'delegate-handle', 'no-tap-scroll:b']),
	'ion-nav-buttons': new HTMLTagSpecification(nls.localize('tags.ion.navbuttons', 'Child of ionNavView. Use ionNavButtons to set the buttons on your ionNavBar from within an ionView.'),
		['side:navsides']),
	'ion-nav-title': new HTMLTagSpecification(nls.localize('tags.ion.navtitle', 'Child of ionNavView. The ionNavTitle directive replaces an ionNavBar title text with custom HTML from within an ionView template.'),
		[]),
	'ion-nav-view': new HTMLTagSpecification(nls.localize('tags.ion.navview', 'The ionNavView directive is used to render templates in your application. Each template is part of a state. States are usually mapped to a url, and are defined programatically using angular-ui-router.'),
		['name']),
	'ion-option-button': new HTMLTagSpecification(nls.localize('tags.ion.optionbutton', 'Child of ionItem. Creates an option button inside a list item, that is visible when the item is swiped to the left by the user.'),
		[]),
	'ion-pane': new HTMLTagSpecification(nls.localize('tags.ion.pane', 'A simple container that fits content, with no side effects. Adds the "pane" class to the element.'),
		[]),
	'ion-popover-view': new HTMLTagSpecification(nls.localize('tags.ion.popoverview', 'The Popover is a view that floats above an app\'s content. Popovers provide an easy way to present or gather information from the user.'),
		[]),
	'ion-radio': new HTMLTagSpecification(nls.localize('tags.ion.radio', 'The radio ionRirective is no different than the HTML radio input, except it\'s styled differently. The ionRadio behaves like AngularJS radio input.'),
		['disabled:b', 'icon', 'name', 'ng-disabled:b', 'ng-model', 'ng-value', 'value']),
	'ion-refresher': new HTMLTagSpecification(nls.localize('tags.ion.refresher', 'Child of ionContent or ionScroll. Allows you to add pull-to-refresh to a scrollView. Place it as the first child of your ionContent or ionScroll element.'),
		['disable-pulling-rotation:b', 'on-pulling', 'on-refresh', 'pulling-icon', 'pulling-text', 'refreshing-icon', 'spinner']),
	'ion-reorder-button': new HTMLTagSpecification(nls.localize('tags.ion.reorderbutton', 'Child of ionItem.'),
		['on-reorder']),
	'ion-scroll': new HTMLTagSpecification(nls.localize('tags.ion.scroll', 'Creates a scrollable container for all content inside.'),
		['delegate-handle', 'direction:scrolldir', 'has-bouncing:b', 'locking:b', 'max-zoom', 'min-zoom', 'on-refresh', 'on-scroll', 'paging:b', 'scrollbar-x:b', 'scrollbar-y:b', 'zooming:b']),
	'ion-side-menu': new HTMLTagSpecification(nls.localize('tags.ion.sidemenu', 'Child of ionSideMenus. A container for a side menu, sibling to an ionSideMenuContent directive.'),
		['is-enabled:b', 'expose-aside-when', 'side:navsides', 'width']),
	'ion-side-menu-content': new HTMLTagSpecification(nls.localize('tags.ion.sidemenucontent', 'Child of ionSideMenus. A container for the main visible content, sibling to one or more ionSideMenu directives.'),
		['drag-content:b', 'edge-drag-threshold']),
	'ion-side-menus': new HTMLTagSpecification(nls.localize('tags.ion.sidemenus', 'A container element for side menu(s) and the main content. Allows the left and/or right side menu to be toggled by dragging the main content area side to side.'),
		['delegate-handle', 'enable-menu-with-back-views:b']),
	'ion-slide': new HTMLTagSpecification(nls.localize('tags.ion.slide', 'Child of ionSlideBox. Displays a slide inside of a slidebox.'),
		[]),
	'ion-slide-box': new HTMLTagSpecification(nls.localize('tags.ion.slidebox', 'The Slide Box is a multi-page container where each page can be swiped or dragged between.'),
		['active-slide', 'auto-play:b', 'delegate-handle', 'does-continue:b', 'on-slide-changed', 'pager-click', 'show-pager:b', 'slide-interval']),
	'ion-spinner': new HTMLTagSpecification(nls.localize('tags.ion.spinner', 'The ionSpinner directive provides a variety of animated spinners.'),
		['icon']),
	'ion-tab': new HTMLTagSpecification(nls.localize('tags.ion.tab', 'Child of ionTabs. Contains a tab\'s content. The content only exists while the given tab is selected.'),
		['badge', 'badge-style', 'disabled', 'hidden', 'href', 'icon', 'icon-off', 'icon-on', 'ng-click', 'on-deselect', 'on-select', 'title']),
	'ion-tabs': new HTMLTagSpecification(nls.localize('tags.ion.tabs', 'Powers a multi-tabbed interface with a tab bar and a set of "pages" that can be tabbed through.'),
		['delegate-handle']),
	'ion-title': new HTMLTagSpecification(nls.localize('tags.ion.title', 'ion-title is a component that sets the title of the ionNavbar'),
		[]),
	'ion-toggle': new HTMLTagSpecification(nls.localize('tags.ion.toggle', 'A toggle is an animated switch which binds a given model to a boolean. Allows dragging of the switch\'s nub. The toggle behaves like any AngularJS checkbox otherwise.'),
		['name', 'ng-false-value', 'ng-model', 'ng-true-value', 'toggle-class']),
	'ion-view ': new HTMLTagSpecification(nls.localize('tags.ion.view', 'Child of ionNavView. A container for view content and any navigational and header bar information.'),
		['cache-view:b', 'can-swipe-back:b', 'hide-back-button:b', 'hide-nav-bar:b', 'view-title'])
};

export function getHTML5TagProvider(): IHTMLTagProvider {
	var globalAttributes = [
		'aria-activedescendant', 'aria-atomic:b', 'aria-autocomplete:autocomplete', 'aria-busy:b', 'aria-checked:tristate', 'aria-colcount', 'aria-colindex', 'aria-colspan', 'aria-controls', 'aria-current:current', 'aria-describedat',
		'aria-describedby', 'aria-disabled:b', 'aria-dropeffect:dropeffect', 'aria-errormessage', 'aria-expanded:u', 'aria-flowto', 'aria-grabbed:u', 'aria-haspopup:b', 'aria-hidden:b', 'aria-invalid:invalid', 'aria-kbdshortcuts',
		'aria-label', 'aria-labelledby', 'aria-level', 'aria-live:live', 'aria-modal:b', 'aria-multiline:b', 'aria-multiselectable:b', 'aria-orientation:orientation', 'aria-owns', 'aria-placeholder', 'aria-posinset', 'aria-pressed:tristate',
		'aria-readonly:b', 'aria-relevant:relevant', 'aria-required:b', 'aria-roledescription', 'aria-rowcount', 'aria-rowindex', 'aria-rowspan', 'aria-selected:u', 'aria-setsize', 'aria-sort:sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext',
		'accesskey', 'class', 'contenteditable:b', 'contextmenu', 'dir:d', 'draggable:b', 'dropzone', 'hidden:v', 'id', 'itemid', 'itemprop', 'itemref', 'itemscope:v', 'itemtype', 'lang', 'role:roles', 'spellcheck:b', 'style', 'tabindex',
		'title', 'translate:y'];

	var eventHandlers = ['onabort', 'onblur', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'oncontextmenu', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover', 'ondragstart',
		'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus', 'onformchange', 'onforminput', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata',
		'onloadstart', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel', 'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange', 'onreset', 'onresize', 'onreadystatechange', 'onscroll',
		'onseeked', 'onseeking', 'onselect', 'onshow', 'onstalled', 'onsubmit', 'onsuspend', 'ontimeupdate', 'onvolumechange', 'onwaiting'];

	var valueSets: IValueSets = {
		b: ['true', 'false'],
		u: ['true', 'false', 'undefined'],
		o: ['on', 'off'],
		y: ['yes', 'no'],
		w: ['soft', 'hard'],
		d: ['ltr', 'rtl', 'auto'],
		m: ['GET', 'POST', 'dialog'],
		fm: ['GET', 'POST'],
		s: ['row', 'col', 'rowgroup', 'colgroup'],
		t: ['hidden', 'text', 'search', 'tel', 'url', 'email', 'password', 'datetime', 'date', 'month', 'week', 'time', 'datetime-local', 'number', 'range', 'color', 'checkbox', 'radio', 'file', 'submit', 'image', 'reset', 'button'],
		im: ['verbatim', 'latin', 'latin-name', 'latin-prose', 'full-width-latin', 'kana', 'kana-name', 'katakana', 'numeric', 'tel', 'email', 'url'],
		bt: ['button', 'submit', 'reset', 'menu'],
		lt: ['1', 'a', 'A', 'i', 'I'],
		mt: ['context', 'toolbar'],
		mit: ['command', 'checkbox', 'radio'],
		et: ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
		tk: ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'],
		pl: ['none', 'metadata', 'auto'],
		sh: ['circle', 'default', 'poly', 'rect'],
		xo: ['anonymous', 'use-credentials'],
		sb: ['allow-forms', 'allow-modals', 'allow-pointer-lock', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-same-origin', 'allow-scripts', 'allow-top-navigation'],
		tristate: ['true', 'false', 'mixed', 'undefined'],
		autocomplete: ['inline', 'list', 'both', 'none'],
		current: ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
		dropeffect: ['copy', 'move', 'link', 'execute', 'popup', 'none'],
		invalid: ['grammar', 'false', 'spelling', 'true'],
		live: ['off', 'polite', 'assertive'],
		orientation: ['vertical', 'horizontal', 'undefined'],
		relevant: ['additions', 'removals', 'text', 'all', 'additions text'],
		sort: ['ascending', 'descending', 'none', 'other'],
		roles: ['alert', 'alertdialog', 'button', 'checkbox', 'dialog', 'gridcell', 'link', 'log', 'marquee', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'progressbar', 'radio', 'scrollbar', 'searchbox', 'slider',
			'spinbutton', 'status', 'switch', 'tab', 'tabpanel', 'textbox', 'timer', 'tooltip', 'treeitem', 'combobox', 'grid', 'listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid',
			'application', 'article', 'cell', 'columnheader', 'definition', 'directory', 'document', 'feed', 'figure', 'group', 'heading', 'img', 'list', 'listitem', 'math', 'none', 'note', 'presentation', 'region', 'row', 'rowgroup',
			'rowheader', 'separator', 'table', 'term', 'text', 'toolbar',
			'banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search']
	};

	return {
		collectTags: (collector: (tag: string, label: string) => void) => collectTagsDefault(collector, HTML_TAGS),
		collectAttributes: (tag: string, collector: (attribute: string, type: string) => void) => {
			collectAttributesDefault(tag, collector, HTML_TAGS, globalAttributes);
			eventHandlers.forEach(handler => {
				collector(handler, 'event');
			});
		},
		collectValues: (tag: string, attribute: string, collector: (value: string) => void) => collectValuesDefault(tag, attribute, collector, HTML_TAGS, globalAttributes, valueSets)
	};
}


export function getAngularTagProvider(): IHTMLTagProvider {
	var customTags: { [tag: string]: string[] } = {
		input: ['ng-model', 'ng-required', 'ng-minlength', 'ng-maxlength', 'ng-pattern', 'ng-trim'],
		select: ['ng-model'],
		textarea: ['ng-model', 'ng-required', 'ng-minlength', 'ng-maxlength', 'ng-pattern', 'ng-trim']
	};

	var globalAttributes = ['ng-app', 'ng-bind', 'ng-bind-html', 'ng-bind-template', 'ng-blur', 'ng-change', 'ng-checked', 'ng-class', 'ng-class-even', 'ng-class-odd',
		'ng-click', 'ng-cloak', 'ng-controller', 'ng-copy', 'ng-csp', 'ng-cut', 'ng-dblclick', 'ng-disabled', 'ng-focus', 'ng-form', 'ng-hide', 'ng-href', 'ng-if',
		'ng-include', 'ng-init', 'ng-jq', 'ng-keydown', 'ng-keypress', 'ng-keyup', 'ng-list', 'ng-model-options', 'ng-mousedown', 'ng-mouseenter', 'ng-mouseleave',
		'ng-mousemove', 'ng-mouseover', 'ng-mouseup', 'ng-non-bindable', 'ng-open', 'ng-options', 'ng-paste', 'ng-pluralize', 'ng-readonly', 'ng-repeat', 'ng-selected',
		'ng-show', 'ng-src', 'ng-srcset', 'ng-style', 'ng-submit', 'ng-switch', 'ng-transclude', 'ng-value'
	];

	return {
		collectTags: (collector: (tag: string) => void) => {
			// no extra tags
		},
		collectAttributes: (tag: string, collector: (attribute: string, type: string) => void) => {
			if (tag) {
				var attributes = customTags[tag];
				if (attributes) {
					attributes.forEach((a) => {
						collector(a, null);
						collector('data-' + a, null);
					});
				}
			}
			globalAttributes.forEach((a) => {
				collector(a, null);
				collector('data-' + a, null);
			});
		},
		collectValues: (tag: string, attribute: string, collector: (value: string) => void) => {
			// no values
		}
	};
}

export function getIonicTagProvider(): IHTMLTagProvider {
	var customTags: { [tag: string]: string[] } = {
		a: ['nav-direction:navdir', 'nav-transition:trans'],
		button: ['menu-toggle:menusides']
	};

	var globalAttributes = ['collection-repeat', 'force-refresh-images:b', 'ion-stop-event', 'item-height', 'item-render-buffer', 'item-width', 'menu-close:v',
		'on-double-tap', 'on-drag', 'on-drag-down', 'on-drag-left', 'on-drag-right', 'on-drag-up', 'on-hold', 'on-release', 'on-swipe', 'on-swipe-down', 'on-swipe-left',
		'on-swipe-right', 'on-swipe-up', 'on-tap', 'on-touch'];

	var valueSets: IValueSets = {
		align: ['center', 'left', 'right'],
		b: ['true', 'false'],
		inputtype: ['email', 'number', 'password', 'search', 'tel', 'text', 'url'],
		listtype: ['card', 'list-inset'],
		menusides: ['left', 'right'],
		navdir: ['back', 'enter', 'exit', 'forward', 'swap'],
		navsides: ['left', 'primary', 'right', 'secondary'],
		scrolldir: ['x', 'xy', 'y'],
		trans: ['android', 'ios', 'none']
	};

	return {
		collectTags: (collector: (tag: string, label: string) => void) => collectTagsDefault(collector, IONIC_TAGS),
		collectAttributes: (tag: string, collector: (attribute: string, type: string) => void) => {
			collectAttributesDefault(tag, collector, IONIC_TAGS, globalAttributes);
			if (tag) {
				var attributes = customTags[tag];
				if (attributes) {
					attributes.forEach((a) => {
						var segments = a.split(':');
						collector(segments[0], segments[1]);
					});
				}
			}
		},
		collectValues: (tag: string, attribute: string, collector: (value: string) => void) => collectValuesDefault(tag, attribute, collector, IONIC_TAGS, globalAttributes, valueSets, customTags)
	};
}

function collectTagsDefault(collector: (tag: string, label: string) => void, tagSet: ITagSet): void {
	for (var tag in tagSet) {
		collector(tag, tagSet[tag].label);
	}
}

function collectAttributesDefault(tag: string, collector: (attribute: string, type: string) => void, tagSet: ITagSet, globalAttributes: string[]): void {
	globalAttributes.forEach(attr => {
		var segments = attr.split(':');
		collector(segments[0], segments[1]);
	});
	if (tag) {
		var tags = tagSet[tag];
		if (tags) {
			var attributes = tags.attributes;
			if (attributes) {
				attributes.forEach(attr => {
					var segments = attr.split(':');
					collector(segments[0], segments[1]);
				});
			}
		}
	}
}

function collectValuesDefault(tag: string, attribute: string, collector: (value: string) => void, tagSet: ITagSet, globalAttributes: string[], valueSets: IValueSets, customTags?: { [tag: string]: string[] }): void {
	var prefix = attribute + ':';
	var processAttributes = (attributes: string[]) => {
		attributes.forEach((attr) => {
			if (attr.length > prefix.length && strings.startsWith(attr, prefix)) {
				var typeInfo = attr.substr(prefix.length);
				if (typeInfo === 'v') {
					collector(attribute);
				} else {
					var values = valueSets[typeInfo];
					if (values) {
						values.forEach(collector);
					}
				}
			}
		});
	};
	if (tag) {
		var tags = tagSet[tag];
		if (tags) {
			var attributes = tags.attributes;
			if (attributes) {
				processAttributes(attributes);
			}
		}
	}
	processAttributes(globalAttributes);
	if (customTags) {
		var customTagAttributes = customTags[tag];
		if (customTagAttributes) {
			processAttributes(customTagAttributes);
		}
	}
}
