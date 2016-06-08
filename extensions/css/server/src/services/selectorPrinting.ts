/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/cssNodes';
import {MarkedString} from 'vscode-languageserver';

export class Element {

	public name: string;
	public parent: Element;
	public children: Element[];
	public attributes: { [name: string]: string; };

	public addChild(child: Element): void {
		if (child instanceof Element) {
			(<Element>child).parent = this;
		}
		if (!this.children) {
			this.children = [];
		}
		this.children.push(child);
	}

	public findRoot(): Element {
		let curr: Element = this;
		while (curr.parent && !(curr.parent instanceof RootElement)) {
			curr = curr.parent;
		}
		return curr;
	}

	public removeChild(child: Element): boolean {
		if (this.children) {
			let index = this.children.indexOf(child);
			if (index !== -1) {
				this.children.splice(index, 1);
				return true;
			}
		}
		return false;
	}

	public addAttr(name: string, value: string): void {
		if (!this.attributes) {
			this.attributes = {};
		}
		if (this.attributes.hasOwnProperty(name)) {
			this.attributes[name] += ' ' + value;
		} else {
			this.attributes[name] = value;
		}
	}

	public clone(cloneChildren: boolean = true): Element {
		let elem = new Element();
		elem.name = this.name;
		if (this.attributes) {
			elem.attributes = {};
			for (let key in this.attributes) {
				elem.addAttr(key, this.attributes[key]);
			}
		}
		if (cloneChildren && this.children) {
			elem.children = [];
			for (let index = 0; index < this.children.length; index++) {
				elem.addChild(this.children[index].clone());
			}
		}
		return elem;
	}

	public cloneWithParent(): Element {
		let clone = this.clone(false);
		if (this.parent && !(this.parent instanceof RootElement)) {
			let parentClone = this.parent.cloneWithParent();
			parentClone.addChild(clone);
		}
		return clone;
	}
}

export class RootElement extends Element {

}

export class LabelElement extends Element {

	constructor(label: string) {
		super();
		this.name = label;
	}
}

class MarkedStringPrinter {

	private result: MarkedString[];

	constructor(public quote: string) {
		// empty
	}

	public print(element: Element): MarkedString[] {
		this.result = [];
		if (element instanceof RootElement) {
			this.doPrint(element.children, 0);
		} else {
			this.doPrint([element], 0);
		}
		return this.result;
	}

	private doPrint(elements: Element[], indent: number) {
		for (let element of elements) {
			this.doPrintElement(element, indent);
			if (element.children) {
				this.doPrint(element.children, indent + 1);
			}
		}
	}

	private writeLine(level: number, content: string) {
		let indent = new Array(level).join('  ');
		this.result.push({ language: 'html', value: indent + content });
	}

	private doPrintElement(element: Element, indent: number) {

		// special case: a simple label
		if (element instanceof LabelElement) {
			this.writeLine(indent, element.name);
			return;
		}

		// the real deal
		let content = ['<'];

		// element name
		if (element.name) {
			content.push(element.name);
		} else {
			content.push('element');
		}

		// attributes
		if (element.attributes) {
			Object.keys(element.attributes).forEach((attr) => {

				content.push(' ');
				content.push(attr);
				let value = element.attributes[attr];
				if (value) {
					content.push('=');
					content.push(quotes.ensure(value, this.quote));
				}
			});
		}
		content.push('>');

		this.writeLine(indent, content.join(''));
	}
}


namespace quotes {

	export function ensure(value: string, which: string): string {
		return which + remove(value) + which;
	}

	export function remove(value: string): string {
		let match = value.match(/^['"](.*)["']$/);
		if (match) {
			return match[1];
		}
		return value;
	}
}

export function toElement(node: nodes.SimpleSelector, parentElement?: Element): Element {

	let result = new Element();
	node.getChildren().forEach((child) => {
		switch (child.type) {
			case nodes.NodeType.SelectorCombinator:
				if (parentElement) {
					let segments = child.getText().split('&');
					if (segments.length === 1) {
						// should not happen
						result.name = segments[0];
						break;
					}
					result = parentElement.cloneWithParent();
					if (segments[0]) {
						let root = result.findRoot();
						root.name = segments[0] + root.name;
					}
					for (let i = 1; i < segments.length; i++) {
						if (i > 1) {
							let clone = parentElement.cloneWithParent();
							result.addChild(clone.findRoot());
							result = clone;
						}
						result.name += segments[i];
					}
				}
				break;
			case nodes.NodeType.SelectorPlaceholder:
			case nodes.NodeType.ElementNameSelector:
				let text = child.getText();
				result.name = text === '*' ? 'element' : text;
				break;
			case nodes.NodeType.ClassSelector:
				result.addAttr('class', child.getText().substring(1));
				break;
			case nodes.NodeType.IdentifierSelector:
				result.addAttr('id', child.getText().substring(1));
				break;
			case nodes.NodeType.MixinDeclaration:
				result.addAttr('class', (<nodes.MixinDeclaration>child).getName());
				break;
			case nodes.NodeType.PseudoSelector:
				result.addAttr(child.getText(), '');
				break;
			case nodes.NodeType.AttributeSelector:
				let expr = <nodes.BinaryExpression>child.getChildren()[0];
				if (expr) {
					let value: string;
					if (expr.getRight()) {
						switch (expr.getOperator().getText()) {
							case '|=':
								// excatly or followed by -words
								value = `${quotes.remove(expr.getRight().getText())}-\u2026`;
								break;
							case '^=':
								// prefix
								value = `${quotes.remove(expr.getRight().getText())}\u2026`;
								break;
							case '$=':
								// suffix
								value = `\u2026${quotes.remove(expr.getRight().getText())}`;
								break;
							case '~=':
								// one of a list of words
								value = ` \u2026 ${quotes.remove(expr.getRight().getText())} \u2026 `;
								break;
							case '*=':
								// substring
								value = `\u2026${quotes.remove(expr.getRight().getText())}\u2026`;
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

export function selectorToMarkedString(node: nodes.Selector): MarkedString[] {
	let root = selectorToElement(node);
	return new MarkedStringPrinter('"').print(root);
}

export function simpleSelectorToMarkedString(node: nodes.SimpleSelector): MarkedString[] {
	let element = toElement(node);
	return new MarkedStringPrinter('"').print(element);
}

class SelectorElementBuilder {

	private prev: nodes.Node;
	private element: Element;

	public constructor(element: Element) {
		this.prev = null;
		this.element = element;
	}

	public processSelector(selector: nodes.Selector): void {
		let parentElement: Element = null;

		if (!(this.element instanceof RootElement)) {
			if (selector.getChildren().some((c) => c.hasChildren() && c.getChild(0).type === nodes.NodeType.SelectorCombinator)) {
				let curr = this.element.findRoot();
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
					let labelElement = new LabelElement('\u2026');
					this.element.addChild(labelElement);
					this.element = labelElement;
				} else if (this.prev && (this.prev.matches('+') || this.prev.matches('~'))) {
					this.element = <Element>this.element.parent;
				}

				if (this.prev && this.prev.matches('~')) {
					this.element.addChild(toElement(<nodes.SimpleSelector>selectorChild));
					this.element.addChild(new LabelElement('\u22EE'));
				}

				let thisElement = toElement(<nodes.SimpleSelector>selectorChild, parentElement);
				let root = thisElement.findRoot();

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

export function selectorToElement(node: nodes.Selector): Element {
	let root: Element = new RootElement();
	let parentRuleSets: nodes.RuleSet[] = [];

	if (node.getParent() instanceof nodes.RuleSet) {
		let parent = node.getParent().getParent(); // parent of the selector's ruleset
		while (parent && !isNewSelectorContext(parent)) {
			if (parent instanceof nodes.RuleSet) {
				parentRuleSets.push(<nodes.RuleSet>parent);
			}
			parent = parent.getParent();
		}
	}

	let builder = new SelectorElementBuilder(root);

	for (let i = parentRuleSets.length - 1; i >= 0; i--) {
		let selector = parentRuleSets[i].getSelectors().getChild(0);
		if (selector) {
			builder.processSelector(selector);
		}
	}

	builder.processSelector(node);
	return root;
}
