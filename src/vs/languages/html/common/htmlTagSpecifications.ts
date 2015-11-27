/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class HTMLTagSpecification {
	constructor(public label: string, public attributes: string[] = []) {}
}

// HTML tag information sourced from http://www.w3.org/TR/2015/WD-html51-20151008/
export const HTML_TAGS : { [tag:string]: HTMLTagSpecification } = {
	// The root element
	html: new HTMLTagSpecification(
		'The html element represents the root of an HTML document.',
		['manifest']),
	// Document metadata
	head: new HTMLTagSpecification(
		'The head element represents a collection of metadata for the Document.'),
	title: new HTMLTagSpecification(
		'The title element represents the document\'s title or name. Authors should use titles that identify their documents even when they are used out of context, for example in a user\'s history or bookmarks, or in search results. The document\'s title is often different from its first heading, since the first heading does not have to stand alone when taken out of context.'),
	base: new HTMLTagSpecification(
		'The base element allows authors to specify the document base URL for the purposes of resolving relative URLs, and the name of the default browsing context for the purposes of following hyperlinks. The element does not represent any content beyond this information.',
		['href', 'target']),
	link: new HTMLTagSpecification(
		'The link element allows authors to link their document to other resources.',
		['href', 'crossorigin:xo', 'rel', 'media', 'hreflang', 'type', 'sizes']),
	meta: new HTMLTagSpecification(
		'The meta element represents various kinds of metadata that cannot be expressed using the title, base, link, style, and script elements.',
		['name', 'http-equiv', 'content', 'charset']),
	style: new HTMLTagSpecification(
		'The style element allows authors to embed style information in their documents. The style element is one of several inputs to the styling processing model. The element does not represent content for the user.',
		['media', 'nonce', 'type', 'scoped:v']),
	// Sections
	body: new HTMLTagSpecification(
		'The body element represents the content of the document.',
		['onafterprint', 'onbeforeprint', 'onbeforeunload', 'onhashchange', 'onlanguagechange', 'onmessage', 'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpopstate', 'onstorage', 'onunload']),
	article: new HTMLTagSpecification(
		'The article element represents a complete, or self-contained, composition in a document, page, application, or site and that is, in principle, independently distributable or reusable, e.g. in syndication. This could be a forum post, a magazine or newspaper article, a blog entry, a user-submitted comment, an interactive widget or gadget, or any other independent item of content. Each article should be identified, typically by including a heading (h1–h6 element) as a child of the article element.'),
	section: new HTMLTagSpecification(
		'The section element represents a generic section of a document or application. A section, in this context, is a thematic grouping of content. Each section should be identified, typically by including a heading ( h1- h6 element) as a child of the section element.'),
	nav: new HTMLTagSpecification(
		'The nav element represents a section of a page that links to other pages or to parts within the page: a section with navigation links.'),
	aside: new HTMLTagSpecification(
		'The aside element represents a section of a page that consists of content that is tangentially related to the content around the aside element, and which could be considered separate from that content. Such sections are often represented as sidebars in printed typography.'),
	h1: new HTMLTagSpecification(
		'The h1 element represents a section heading.'),
	h2: new HTMLTagSpecification(
		'The h2 element represents a section heading.'),
	h3: new HTMLTagSpecification(
		'The h3 element represents a section heading.'),
	h4: new HTMLTagSpecification(
		'The h4 element represents a section heading.'),
	h5: new HTMLTagSpecification(
		'The h5 element represents a section heading.'),
	h6: new HTMLTagSpecification(
		'The h6 element represents a section heading.'),
	header: new HTMLTagSpecification(
		'The header element represents introductory content for its nearest ancestor sectioning content or sectioning root element. A header typically contains a group of introductory or navigational aids. When the nearest ancestor sectioning content or sectioning root element is the body element, then it applies to the whole page.'),
	footer: new HTMLTagSpecification(
		'The footer element represents a footer for its nearest ancestor sectioning content or sectioning root element. A footer typically contains information about its section such as who wrote it, links to related documents, copyright data, and the like.'),
	address: new HTMLTagSpecification(
		'The address element represents the contact information for its nearest article or body element ancestor. If that is the body element, then the contact information applies to the document as a whole.'),
	// Grouping content
	p: new HTMLTagSpecification(
		'The p element represents a paragraph.'),
	hr: new HTMLTagSpecification(
		'The hr element represents a paragraph-level thematic break, e.g. a scene change in a story, or a transition to another topic within a section of a reference book.'),
	pre: new HTMLTagSpecification(
		'The pre element represents a block of preformatted text, in which structure is represented by typographic conventions rather than by elements.'),
	blockquote: new HTMLTagSpecification(
		'The blockquote element represents content that is quoted from another source, optionally with a citation which must be within a footer or cite element, and optionally with in-line changes such as annotations and abbreviations.',
		['cite']),
	ol: new HTMLTagSpecification(
		'The ol element represents a list of items, where the items have been intentionally ordered, such that changing the order would change the meaning of the document.',
		['reversed:v', 'start', 'type:lt']),
	ul: new HTMLTagSpecification(
		'The ul element represents a list of items, where the order of the items is not important — that is, where changing the order would not materially change the meaning of the document.'),
	li: new HTMLTagSpecification(
		'The li element represents a list item. If its parent element is an ol, ul, or menu element, then the element is an item of the parent element\'s list, as defined for those elements. Otherwise, the list item has no defined list-related relationship to any other li element.',
		['value']),
	dl: new HTMLTagSpecification(
		'The dl element represents an association list consisting of zero or more name-value groups (a description list). A name-value group consists of one or more names (dt elements) followed by one or more values (dd elements), ignoring any nodes other than dt and dd elements. Within a single dl element, there should not be more than one dt element for each name.'),
	dt: new HTMLTagSpecification(
		'The dt element represents the term, or name, part of a term-description group in a description list (dl element).'),
	dd: new HTMLTagSpecification(
		'The dd element represents the description, definition, or value, part of a term-description group in a description list (dl element).'),
	figure: new HTMLTagSpecification(
		'The figure element represents some flow content, optionally with a caption, that is self-contained (like a complete sentence) and is typically referenced as a single unit from the main flow of the document.'),
	figcaption: new HTMLTagSpecification(
		'The figcaption element represents a caption or legend for the rest of the contents of the figcaption element\'s parent figure element, if any.'),
	main: new HTMLTagSpecification(
		'The main element represents the main content of the body of a document or application. The main content area consists of content that is directly related to or expands upon the central topic of a document or central functionality of an application.'),
	div: new HTMLTagSpecification(
		'The div element has no special meaning at all. It represents its children. It can be used with the class, lang, and title attributes to mark up semantics common to a group of consecutive elements.'),
	// Text-level semantics
	a: new HTMLTagSpecification(
		'If the a element has an href attribute, then it represents a hyperlink (a hypertext anchor) labeled by its contents.',
		['href', 'target', 'download', 'ping', 'rel', 'hreflang', 'type']),
	em: new HTMLTagSpecification(
		'The em element represents stress emphasis of its contents.'),
	strong: new HTMLTagSpecification(
		'The strong element represents strong importance, seriousness, or urgency for its contents.'),
	small: new HTMLTagSpecification(
		'The small element represents side comments such as small print.'),
	s: new HTMLTagSpecification(
		'The s element represents contents that are no longer accurate or no longer relevant.'),
	cite: new HTMLTagSpecification(
		'The cite element represents a reference to a creative work. It must include the title of the work or the name of the author(person, people or organization) or an URL reference, or a reference in abbreviated form as per the conventions used for the addition of citation metadata.'),
	q: new HTMLTagSpecification(
		'The q element represents some phrasing content quoted from another source.',
		['cite']),
	dfn: new HTMLTagSpecification(
		'The dfn element represents the defining instance of a term. The paragraph, description list group, or section that is the nearest ancestor of the dfn element must also contain the definition(s) for the term given by the dfn element.'),
	abbr: new HTMLTagSpecification(
		'The abbr element represents an abbreviation or acronym, optionally with its expansion. The title attribute may be used to provide an expansion of the abbreviation. The attribute, if specified, must contain an expansion of the abbreviation, and nothing else.'),
	ruby: new HTMLTagSpecification(
		'The ruby element allows one or more spans of phrasing content to be marked with ruby annotations. Ruby annotations are short runs of text presented alongside base text, primarily used in East Asian typography as a guide for pronunciation or to include other annotations. In Japanese, this form of typography is also known as furigana. Ruby text can appear on either side, and sometimes both sides, of the base text, and it is possible to control its position using CSS. A more complete introduction to ruby can be found in the Use Cases & Exploratory Approaches for Ruby Markup document as well as in CSS Ruby Module Level 1. [RUBY-UC] [CSSRUBY]'),
	rb: new HTMLTagSpecification(
		'The rb element marks the base text component of a ruby annotation. When it is the child of a ruby element, it doesn\'t represent anything itself, but its parent ruby element uses it as part of determining what it represents.'),
	rt: new HTMLTagSpecification(
		'The rt element marks the ruby text component of a ruby annotation. When it is the child of a ruby element or of an rtc element that is itself the child of a ruby element, it doesn\'t represent anything itself, but its ancestor ruby element uses it as part of determining what it represents.'),
	rtc: new HTMLTagSpecification(
		'The rtc element marks a ruby text container for ruby text components in a ruby annotation. When it is the child of a ruby element it doesn\'t represent anything itself, but its parent ruby element uses it as part of determining what it represents.'),
	rp: new HTMLTagSpecification(
		'The rp element is used to provide fallback text to be shown by user agents that don\'t support ruby annotations. One widespread convention is to provide parentheses around the ruby text component of a ruby annotation.'),
	data: new HTMLTagSpecification(
		'The data element represents its contents, along with a machine-readable form of those contents in the value attribute.'),
	time: new HTMLTagSpecification(
		'The time element represents its contents, along with a machine-readable form of those contents in the datetime attribute. The kind of content is limited to various kinds of dates, times, time-zone offsets, and durations, as described below.',
		['datetime']),
	code: new HTMLTagSpecification(
		'The code element represents a fragment of computer code. This could be an XML element name, a file name, a computer program, or any other string that a computer would recognize.'),
	var: new HTMLTagSpecification(
		'The var element represents a variable. This could be an actual variable in a mathematical expression or programming context, an identifier representing a constant, a symbol identifying a physical quantity, a function parameter, or just be a term used as a placeholder in prose.'),
	samp: new HTMLTagSpecification(
		'The samp element represents sample or quoted output from another program or computing system.'),
	kbd: new HTMLTagSpecification(
		'The kbd element represents user input (typically keyboard input, although it may also be used to represent other input, such as voice commands).'),
	sub: new HTMLTagSpecification(
		'The sub element represents a subscript.'),
	sup: new HTMLTagSpecification(
		'The sup element represents a superscript.'),
	i: new HTMLTagSpecification(
		'The i element represents a span of text in an alternate voice or mood, or otherwise offset from the normal prose in a manner indicating a different quality of text, such as a taxonomic designation, a technical term, an idiomatic phrase from another language, transliteration, a thought, or a ship name in Western texts.'),
	b: new HTMLTagSpecification(
		'The b element represents a span of text to which attention is being drawn for utilitarian purposes without conveying any extra importance and with no implication of an alternate voice or mood, such as key words in a document abstract, product names in a review, actionable words in interactive text-driven software, or an article lede.'),
	u: new HTMLTagSpecification(
		'The u element represents a span of text with an unarticulated, though explicitly rendered, non-textual annotation, such as labeling the text as being a proper name in Chinese text (a Chinese proper name mark), or labeling the text as being misspelt.'),
	mark: new HTMLTagSpecification(
		'The mark element represents a run of text in one document marked or highlighted for reference purposes, due to its relevance in another context. When used in a quotation or other block of text referred to from the prose, it indicates a highlight that was not originally present but which has been added to bring the reader\'s attention to a part of the text that might not have been considered important by the original author when the block was originally written, but which is now under previously unexpected scrutiny. When used in the main prose of a document, it indicates a part of the document that has been highlighted due to its likely relevance to the user\'s current activity.'),
	bdi: new HTMLTagSpecification(
		'The bdi element represents a span of text that is to be isolated from its surroundings for the purposes of bidirectional text formatting. [BIDI]'),
	bdo: new HTMLTagSpecification(
		'The bdo element represents explicit text directionality formatting control for its children. It allows authors to override the Unicode bidirectional algorithm by explicitly specifying a direction override. [BIDI]'),
	span: new HTMLTagSpecification(
		'The span element doesn\'t mean anything on its own, but can be useful when used together with the global attributes, e.g. class, lang, or dir. It represents its children.'),
	br: new HTMLTagSpecification(
		'The br element represents a line break.'),
	wbr: new HTMLTagSpecification(
		'The wbr element represents a line break opportunity.'),
	// Edits
	ins: new HTMLTagSpecification(
		'The ins element represents an addition to the document.'),
	del: new HTMLTagSpecification(
		'The del element represents a removal from the document.',
		['cite', 'datetime']),
	// Embedded content
	picture: new HTMLTagSpecification(
		'The picture element is a container which provides multiple sources to its contained img element to allow authors to declaratively control or give hints to the user agent about which image resource to use, based on the screen pixel density, viewport size, image format, and other factors. It represents its children.'),
	img: new HTMLTagSpecification(
		'An img element represents an image.',
		['alt', 'src', 'srcset', 'crossorigin:xo', 'usemap', 'ismap:v', 'width', 'height']),
	iframe: new HTMLTagSpecification(
		'The iframe element represents a nested browsing context.',
		['src', 'srcdoc', 'name', 'sandbox:sb', 'seamless:v', 'allowfullscreen:v', 'width', 'height']),
	embed: new HTMLTagSpecification(
		'The embed element provides an integration point for an external (typically non-HTML) application or interactive content.',
		['src', 'type', 'width', 'height']),
	object: new HTMLTagSpecification(
		'The object element can represent an external resource, which, depending on the type of the resource, will either be treated as an image, as a nested browsing context, or as an external resource to be processed by a plugin.',
		['data', 'type', 'typemustmatch:v', 'name', 'usemap', 'form', 'width', 'height']),
	param: new HTMLTagSpecification(
		'The param element defines parameters for plugins invoked by object elements. It does not represent anything on its own.',
		['name', 'value']),
	video: new HTMLTagSpecification(
		'A video element is used for playing videos or movies, and audio files with captions.',
		['src', 'crossorigin:xo', 'poster', 'preload:pl', 'autoplay:v', 'mediagroup', 'loop:v', 'muted:v', 'controls:v', 'width', 'height']),
	audio: new HTMLTagSpecification(
		'An audio element represents a sound or audio stream.',
		['src', 'crossorigin:xo', 'preload:pl', 'autoplay:v', 'mediagroup', 'loop:v', 'muted:v', 'controls:v']),
	source: new HTMLTagSpecification(
		'The source element allows authors to specify multiple alternative media resources for media elements. It does not represent anything on its own.',
	// 'When the source element has a parent that is a picture element, the source element allows authors to specify multiple alternative source sets for img elements.'
		['src', 'type']),
	track: new HTMLTagSpecification(
		'The track element allows authors to specify explicit external timed text tracks for media elements. It does not represent anything on its own.',
		['default:v', 'kind:tk', 'label', 'src', 'srclang']),
	map: new HTMLTagSpecification(
		'The map element, in conjunction with an img element and any area element descendants, defines an image map. The element represents its children.',
		['name']),
	area: new HTMLTagSpecification(
		'The area element represents either a hyperlink with some text and a corresponding area on an image map, or a dead area on an image map.',
		['alt', 'coords', 'shape:sh', 'href', 'target', 'download', 'ping', 'rel', 'hreflang', 'type']),
	// Tabular data
	table: new HTMLTagSpecification(
		'The table element represents data with more than one dimension, in the form of a table.',
		['sortable:v', 'border']),
	caption: new HTMLTagSpecification(
		'The caption element represents the title of the table that is its parent, if it has a parent and that is a table element.'),
	colgroup: new HTMLTagSpecification(
		'The colgroup element represents a group of one or more columns in the table that is its parent, if it has a parent and that is a table element.',
		['span']),
	col: new HTMLTagSpecification(
		'If a col element has a parent and that is a colgroup element that itself has a parent that is a table element, then the col element represents one or more columns in the column group represented by that colgroup.',
		['span']),
	tbody: new HTMLTagSpecification(
		'The tbody element represents a block of rows that consist of a body of data for the parent table element, if the tbody element has a parent and it is a table.'),
	thead: new HTMLTagSpecification(
		'The thead element represents the block of rows that consist of the column labels (headers) for the parent table element, if the thead element has a parent and it is a table.'),
	tfoot: new HTMLTagSpecification(
		'The tfoot element represents the block of rows that consist of the column summaries (footers) for the parent table element, if the tfoot element has a parent and it is a table.'),
	tr: new HTMLTagSpecification(
		'The tr element represents a row of cells in a table.'),
	td: new HTMLTagSpecification(
		'The td element represents a data cell in a table.',
		['colspan', 'rowspan', 'headers']),
	th: new HTMLTagSpecification(
		'The th element represents a header cell in a table.',
		['colspan', 'rowspan', 'headers', 'scope:s', 'sorted', 'abbr']),
	// Forms
	form: new HTMLTagSpecification(
		'The form element represents a collection of form-associated elements, some of which can represent editable values that can be submitted to a server for processing.',
		['accept-charset', 'action', 'autocomplete:o', 'enctype:et', 'method:m', 'name', 'novalidate:v', 'target']),
	label: new HTMLTagSpecification(
		'The label element represents a caption in a user interface. The caption can be associated with a specific form control, known as the label element\'s labeled control, either using the for attribute, or by putting the form control inside the label element itself.',
		['form', 'for']),
	input: new HTMLTagSpecification(
		'The input element represents a typed data field, usually with a form control to allow the user to edit the data.',
		['accept', 'alt', 'autocomplete:o', 'autofocus:v', 'checked:v', 'dirname', 'disabled:v', 'form', 'formaction', 'formenctype:et', 'formmethod:fm', 'formnovalidate:v', 'formtarget', 'height', 'inputmode:im', 'list', 'max', 'maxlength', 'min', 'minlength', 'multiple:v', 'name', 'pattern', 'placeholder', 'readonly:v', 'required:v', 'size', 'src', 'step', 'type:t', 'value', 'width']),
	button: new HTMLTagSpecification(
		'The button element represents a button labeled by its contents.',
		['autofocus:v', 'disabled:v', 'form', 'formaction', 'formenctype:et', 'formmethod:fm', 'formnovalidate:v', 'formtarget', 'name', 'type:bt', 'value']),
	select: new HTMLTagSpecification(
		'The select element represents a control for selecting amongst a set of options.',
		['autocomplete:o', 'autofocus:v', 'disabled:v', 'form', 'multiple:v', 'name', 'required:v', 'size']),
	datalist: new HTMLTagSpecification(
		'The datalist element represents a set of option elements that represent predefined options for other controls. In the rendering, the datalist element represents nothing and it, along with its children, should be hidden.'),
	optgroup: new HTMLTagSpecification(
		'The optgroup element represents a group of option elements with a common label.',
		['disabled:v', 'label']),
	option: new HTMLTagSpecification(
		'The option element represents an option in a select element or as part of a list of suggestions in a datalist element.',
		['disabled:v', 'label', 'selected:v', 'value']),
	textarea: new HTMLTagSpecification(
		'The textarea element represents a multiline plain text edit control for the element\'s raw value. The contents of the control represent the control\'s default value.',
		['autocomplete:o', 'autofocus:v', 'cols', 'dirname', 'disabled:v', 'form', 'inputmode:im', 'maxlength', 'minlength', 'name', 'placeholder', 'readonly:v', 'required:v', 'rows', 'wrap:w']),
	output: new HTMLTagSpecification(
		'The output element represents the result of a calculation performed by the application, or the result of a user action.',
		['for', 'form', 'name']),
	progress: new HTMLTagSpecification(
		'The progress element represents the completion progress of a task. The progress is either indeterminate, indicating that progress is being made but that it is not clear how much more work remains to be done before the task is complete (e.g. because the task is waiting for a remote host to respond), or the progress is a number in the range zero to a maximum, giving the fraction of work that has so far been completed.',
		['value', 'max']),
	meter: new HTMLTagSpecification(
		'The meter element represents a scalar measurement within a known range, or a fractional value; for example disk usage, the relevance of a query result, or the fraction of a voting population to have selected a particular candidate.',
		['value', 'min', 'max', 'low', 'high', 'optimum']),
	fieldset: new HTMLTagSpecification(
		'The fieldset element represents a set of form controls optionally grouped under a common name.',
		['disabled:v', 'form', 'name']),
	legend: new HTMLTagSpecification(
		'The legend element represents a caption for the rest of the contents of the legend element\'s parent fieldset element, if any.'),
	// Interactive elements
	details: new HTMLTagSpecification(
		'The details element represents a disclosure widget from which the user can obtain additional information or controls.',
		['open:v']),
	summary: new HTMLTagSpecification(
		'The summary element represents a summary, caption, or legend for the rest of the contents of the summary element\'s parent details element, if any.'),
	menu: new HTMLTagSpecification(
		'The menu element represents a list of commands.',
		['type:mt', 'label']),
	menuitem: new HTMLTagSpecification(
		'The menuitem element represents a command that the user can invoke from a popup menu (either a context menu or the menu of a menu button).'),
	dialog: new HTMLTagSpecification(
		'The dialog element represents a part of an application that a user interacts with to perform a task, for example a dialog box, inspector, or window.'),
	// Scripting
	script: new HTMLTagSpecification(
		'The script element allows authors to include dynamic script and data blocks in their documents. The element does not represent content for the user.',
		['src', 'type', 'charset', 'async:v', 'defer:v', 'crossorigin:xo', 'nonce']),
	noscript: new HTMLTagSpecification(
		'The noscript element represents nothing if scripting is enabled, and represents its children if scripting is disabled. It is used to present different markup to user agents that support scripting and those that don\'t support scripting, by affecting how the document is parsed.'),
	template: new HTMLTagSpecification(
		'The template element is used to declare fragments of HTML that can be cloned and inserted in the document by script.'),
	canvas: new HTMLTagSpecification(
		'The canvas element provides scripts with a resolution-dependent bitmap canvas, which can be used for rendering graphs, game graphics, art, or other visual images on the fly.',
		['width', 'height'])
};
