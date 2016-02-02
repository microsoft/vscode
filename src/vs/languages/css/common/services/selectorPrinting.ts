/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nodes = require('vs/languages/css/common/parser/cssNodes');
import strings = require('vs/base/common/strings');
import HtmlContent = require('vs/base/common/htmlContent');

export interface IElement {
	name?:string;
	children?:IElement[];
	attributes?:{[name:string]:string;};
}

export class Element implements IElement {

	public name:string;
	public parent:Element;
	public children:Element[];
	public attributes:{[name:string]:string;};

	public addChild(child:Element):void {
		if(child instanceof Element) {
			(<Element> child).parent = this;
		}
		if(!this.children) {
			this.children = [];
		}
		this.children.push(child);
	}

	public findRoot(): Element {
		var curr: Element = this;
		while (curr.parent && !(curr.parent instanceof RootElement)) {
			curr = curr.parent;
		}
		return curr;
	}

	public removeChild(child: Element) : boolean {
		if (this.children) {
			var index = this.children.indexOf(child);
			if (index !== -1) {
				this.children.splice(index, 1);
				return true;
			}
		}
		return false;
	}

	public addAttr(name:string, value:string):void {
		if(!this.attributes) {
			this.attributes = {};
		}
		if(this.attributes.hasOwnProperty(name)) {
			this.attributes[name] += ' ' + value;
		} else {
			this.attributes[name] = value;
		}
	}

	public clone(cloneChildren: boolean = true): Element {
		var elem = new Element();
		elem.name = this.name;
		if (this.attributes) {
			elem.attributes = {};
			for (var key in this.attributes) {
				elem.addAttr(key, this.attributes[key]);
			}
		}
		if (cloneChildren && this.children) {
			elem.children = [];
			for (var index = 0; index < this.children.length; index++) {
				elem.addChild(this.children[index].clone());
			}
		}
		return elem;
	}

	public cloneWithParent(): Element {
		var clone = this.clone(false);
		if (this.parent && !(this.parent instanceof RootElement)) {
			var parentClone = this.parent.cloneWithParent();
			parentClone.addChild(clone);
		}
		return clone;
	}
}

export class RootElement extends Element {

}

export class LabelElement extends Element {

	constructor(label:string) {
		super();
		this.name = label;
	}
}

class HtmlPrinter {

	constructor(public quote:string) {
		// empty
	}

	public print(element:IElement):HtmlContent.IHTMLContentElement[] {

		if(element instanceof RootElement) {
			return this.doPrint(element.children);
		} else {
			return this.doPrint([element]);
		}
	}

	private doPrint(elements:IElement[]):HtmlContent.IHTMLContentElement[] {

		var root:HtmlContent.IHTMLContentElement = { children: <HtmlContent.IHTMLContentElement[]> []},
			parent = root;

		while(elements.length > 0) {

			var element = elements.shift(),
				content = this.doPrintElement(element);

			parent.children.push(content);

			if(element.children) {
				elements.push.apply(elements, element.children);
				parent = content;
			}
		}

		return root.children;
	}

	private doPrintElement(element:IElement):HtmlContent.IHTMLContentElement {

		// special case: a simple label
		if(element instanceof LabelElement) {
			return {
				tagName: 'ul',
				children: [{
					tagName: 'li',
					children: [{
						tagName: 'span',
						className: 'label',
						text: element.name
					}]
				}]
			};
		}

		// the real deal
		var children:HtmlContent.IHTMLContentElement[] = [{
			isText: true,
			text: '<'
		}];

		// element name
		if(element.name) {
			children.push({
				tagName: 'span',
				className: 'name',
				text: element.name
			});
		} else {
			children.push({
				tagName: 'span',
				text: 'element'
			});
		}

		// attributes
		if(element.attributes) {
			Object.keys(element.attributes).forEach((attr) => {

				children.push({
					isText: true,
					text: ' '
				});

				children.push({
					tagName: 'span',
					className: 'key',
					text: attr
				});
				var value = element.attributes[attr];
				if(value) {
					children.push({
						isText: true,
						text: '='
					});
					children.push({
						tagName: 'span',
						className: 'value',
						text: quotes.ensure(value, this.quote)
					});
				}
			});
		}
		children.push({
			isText: true,
			text: '>'
		});

		return {
			tagName: 'ul',
			children: [{
				tagName: 'li',
				children: children
			}]
		};
	}
}

namespace quotes {

	export function ensure(value:string, which:string):string {
		return which + remove(value) + which;
	}

	export function remove(value:string):string {
		value = strings.trim(value, '\'');
		value = strings.trim(value, '"');
		return value;
	}
}

export function toElement(node:nodes.SimpleSelector, parentElement?: Element):Element {

	var result = new Element();
	node.getChildren().forEach((child) => {
		switch(child.type) {
			case nodes.NodeType.SelectorCombinator:
				if (parentElement) {
					var segments = child.getText().split('&');
					if (segments.length === 1) {
						// should not happen
						result.name = segments[0];
						break;
					}
					result = parentElement.cloneWithParent();
					if (segments[0]) {
						var root = result.findRoot();
						root.name = segments[0] + root.name;
					}
					for (var i = 1; i < segments.length; i++) {
						if (i > 1) {
							var clone = parentElement.cloneWithParent();
							result.addChild(clone.findRoot());
							result = clone;
						}
						result.name += segments[i];
					}
				}
				break;
			case nodes.NodeType.SelectorPlaceholder:
			case nodes.NodeType.ElementNameSelector:
				var text = child.getText();
				result.name = text === '*' ? 'element' : text;
				break;
			case nodes.NodeType.ClassSelector:
				result.addAttr('class', child.getText().substring(1));
				break;
			case nodes.NodeType.IdentifierSelector:
				result.addAttr('id', child.getText().substring(1));
				break;
			case nodes.NodeType.MixinDeclaration:
				result.addAttr('class', (<nodes.MixinDeclaration> child).getName());
				break;
			case nodes.NodeType.PseudoSelector:
				result.addAttr(child.getText(), strings.empty);
				break;
			case nodes.NodeType.AttributeSelector:
				var expr = <nodes.BinaryExpression> child.getChildren()[0];
				if (expr) {
					if (expr.getRight()) {
						var value:string;
						switch (expr.getOperator().getText()) {
							case '|=':
								// excatly or followed by -words
								value = strings.format('{0}-\u2026', quotes.remove(expr.getRight().getText()));
								break;
							case '^=':
								// prefix
								value = strings.format('{0}\u2026', quotes.remove(expr.getRight().getText()));
								break;
							case '$=':
								// suffix
								value = strings.format('\u2026{0}', quotes.remove(expr.getRight().getText()));
								break;
							case '~=':
								// one of a list of words
								value = strings.format(' \u2026 {0} \u2026 ', quotes.remove(expr.getRight().getText()));
								break;
							case '*=':
								// substring
								value = strings.format('\u2026{0}\u2026', quotes.remove(expr.getRight().getText()));
								break;
							default:
								value = quotes.remove(expr.getRight().getText());
								break;
						}
					}
					result.addAttr(expr.getLeft().getText(), value);
				}
				break;
		}
	});
	return result;
}

export function simpleSelectorToHtml(node:nodes.SimpleSelector):HtmlContent.IHTMLContentElement {
	var element = toElement(node);
	var body = new HtmlPrinter('"').print(element);
	return {
		tagName: 'span',
		className: 'css-selector-hover',
		children: body
	};
}

class SelectorElementBuilder {

	private prev:nodes.Node;
	private element:Element;

	public constructor(element:Element) {
		this.prev = null;
		this.element = element;
	}

	public processSelector(selector:nodes.Selector) : void {
		var parentElement : Element = null;

		if (!(this.element instanceof RootElement)) {
			if (selector.getChildren().some((c) => c.hasChildren() && c.getChild(0).type === nodes.NodeType.SelectorCombinator)) {
				var curr = this.element.findRoot();
				if (curr.parent instanceof RootElement) {
					parentElement = this.element;

					this.element = curr.parent;
					this.element.removeChild(curr);
					this.prev = null;
				}
			}
		}

		selector.getChildren().forEach((selectorChild) => {
			if (selectorChild instanceof nodes.SimpleSelector) {
				if (this.prev instanceof nodes.SimpleSelector) {
					var labelElement = new LabelElement('\u2026');
					this.element.addChild(labelElement);
					this.element = labelElement;
				} else if (this.prev && (this.prev.matches('+') || this.prev.matches('~'))) {
					this.element = <Element> this.element.parent;
				}

				if (this.prev && this.prev.matches('~')) {
					this.element.addChild(toElement(<nodes.SimpleSelector> selectorChild));
					this.element.addChild(new LabelElement('\u22EE'));
				}

				var thisElement = toElement(<nodes.SimpleSelector> selectorChild, parentElement);
				var root = thisElement.findRoot();

				this.element.addChild(root);
				this.element = thisElement;
			}

			if (selectorChild instanceof nodes.SimpleSelector ||
				selectorChild.type === nodes.NodeType.SelectorCombinatorParent ||
				selectorChild.type === nodes.NodeType.SelectorCombinatorSibling ||
				selectorChild.type === nodes.NodeType.SelectorCombinatorAllSiblings) {

				this.prev = selectorChild;
			}
		});
	}
}

function isNewSelectorContext(node: nodes.Node): boolean {
	switch (node.type) {
		case nodes.NodeType.MixinDeclaration:
		case nodes.NodeType.Stylesheet:
			return true;
	}
	return false;
}

export function selectorToElement(node:nodes.Selector):Element {
	var root: Element = new RootElement();
	var parentRuleSets: nodes.RuleSet[] = [];

	if (node.getParent() instanceof nodes.RuleSet) {
		var parent = node.getParent().getParent(); // parent of the selector's ruleset
		while (parent && !isNewSelectorContext(parent)) {
			if (parent instanceof nodes.RuleSet) {
				parentRuleSets.push(<nodes.RuleSet> parent);
			}
			parent = parent.getParent();
		}
	}

	var builder = new SelectorElementBuilder(root);

	for (var i = parentRuleSets.length - 1; i >= 0; i--) {
		var selector = parentRuleSets[i].getSelectors().getChild(0);
		if (selector) {
			builder.processSelector(selector);
		}
	}

	builder.processSelector(node);
	return root;
}


export function selectorToHtml(node:nodes.Selector):HtmlContent.IHTMLContentElement {
	var root = selectorToElement(node);
	var body = new HtmlPrinter('"').print(root);
	return {
		tagName: 'span',
		className: 'css-selector-hover',
		children: body
	};
}
