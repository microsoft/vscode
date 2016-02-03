/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDelegate, IRenderer } from './list';
import { List } from './listImpl';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import WinJS = require('vs/base/common/winjs.base');

interface Person {
	name: string;
	height: number;
}

interface PersonViewData {
	name: HTMLElement;
}

class Delegate implements IDelegate<Person> {
	getHeight(person: Person): number {
		return person.height;
	}

	getTemplateId(person: Person): string {
		return 'person';
	}
}

class PersonRenderer implements IRenderer<Person, PersonViewData> {
	renderTemplate(container: HTMLElement): PersonViewData {
		const name = document.createElement('span.name');
		container.appendChild(name);
		return { name };
	}

	renderElement(person: Person, templateData: PersonViewData): void {
		templateData.name.textContent = person.name;
	}

	disposeTemplate(templateData: PersonViewData): void {
		// noop
	}
}

function generatePerson() {
	return {
		name: new Array(16).join().replace(/(.|$)/g, function(){return ((Math.random()*36)|0).toString(36);}),
		height: Math.random() * 10 + 20
	};
}

function generateBoringPerson() {
	return {
		name: new Array(16).join().replace(/(.|$)/g, function(){return ((Math.random()*36)|0).toString(36);}),
		height: 24
	};
}

function generateRealPerson() {
	return {
		name: new Array(16).join().replace(/(.|$)/g, function(){return ((Math.random()*36)|0).toString(36);}),
		height: Math.random() < 0.01 ? 48 : 24
	};
}

const renderer = new PersonRenderer();
let list: List<Person>;
export function setupList(container: HTMLElement) {
	list = new List(container, new Delegate(), { person: renderer });
}

export function addPersonToList(name, index) {
	const person = name
		? { name, height: 24 }
		: {
		name: new Array(16).join().replace(/(.|$)/g, function(){return ((Math.random()*36)|0).toString(36);}),
		height: 24
	};

	index = Number(index);
	index = index === NaN ? list.length : Math.min(index, list.length);

	list.splice(index, 0, person);
}

export function removePersonFromList(index) {
	index = Number(index);
	index = index === NaN ? list.length : Math.min(index, list.length - 1);

	list.splice(index, 1);
}

export function addManyPeopleToList() {
	const people = [];

	for (var i = 0; i < 10000; i++) {
		people.push(generatePerson());
	}

	list.splice(list.length, 0, ...people);
}

export function addManyRealPeopleToList() {
	const people = [];

	for (var i = 0; i < 10000; i++) {
		people.push(generateRealPerson());
	}

	list.splice(list.length, 0, ...people);
}

export function addManyBoringPeopleToList() {
	const people = [];

	for (var i = 0; i < 10000; i++) {
		people.push(generateBoringPerson());
	}

	list.splice(list.length, 0, ...people);
}

const treeModel: Person[] = [];
let tree: Tree;
export function setupTree(container: HTMLElement) {
	tree = new Tree(container, {
		dataSource: {
			getId: (_, e) => e.length ? 'root' : e.name,
			hasChildren: (_, e) => !!e.length,
			getChildren: (_, e) => WinJS.Promise.as(e),
			getParent: () => null
		},
		renderer: {
			getHeight: (_, p) => p.height,
			getTemplateId: () => 'person',
			renderTemplate: (_, __, c) => renderer.renderTemplate(c),
			renderElement: (_, p, __, d) => renderer.renderElement(p, d),
			disposeTemplate: () => null
		}
	});

	tree.setInput(treeModel);
}

export function addPersonToTree() {
	treeModel.unshift(generatePerson());
	tree.refresh();
}

export function addManyPeopleToTree() {
	const people = [];

	for (var i = 0; i < 10000; i++) {
		people.push(generatePerson());
	}

	treeModel.push(...people);
	tree.refresh();
}

export function addManyRealPeopleToTree() {
	const people = [];

	for (var i = 0; i < 10000; i++) {
		people.push(generateRealPerson());
	}

	treeModel.push(...people);
	tree.refresh();
}

export function addManyBoringPeopleToTree() {
	const people = [];

	for (var i = 0; i < 10000; i++) {
		people.push(generateBoringPerson());
	}

	treeModel.unshift(...people);
	tree.refresh();
}