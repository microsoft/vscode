
'use strict';

const path = require('path');
const cp = require('child_process');
const fs = require('fs');

const WORKSPACE_ROOT = path.join(__dirname, '..');


function getCommonProperties() {
	const cmd = `rg --files-with-matches --glob "*.ts" --regexp "//\\s*__GDPR__COMMON__"`;
	let filePaths = cp.execSync(cmd, { cwd: WORKSPACE_ROOT, encoding: 'ascii' });
	filePaths = filePaths.split(/(?:\r\n|\r|\n)/g);

	let commonPropertyDeclarations = [];
	filePaths.forEach(filePath => {
		if (filePath) {
			const cwdRelativePath = path.join(__dirname, `../${filePath}`);
			const fileContents = fs.readFileSync(cwdRelativePath, { encoding: 'utf8' });
			const commonPropertyMatcher = /\/\/\s*__GDPR__COMMON__(.*)$/mg;
			let m;
			while (m = commonPropertyMatcher.exec(fileContents)) {
				commonPropertyDeclarations.push(m[1]);
			}
		}
	}, this);

	const jsonString = `{ ${commonPropertyDeclarations.join(',')} }`;
	return JSON.parse(jsonString);
}

function addCommonProperties(events, commonProperties) {
	for (let e in events) {
		if (events.hasOwnProperty(e)) {
			let event = events[e];
			for (let p in commonProperties) {
				event[p] = commonProperties[p];
			}
		}
	}
	return events;
}

function mergeFragment(target, source) {
	for (let p in source) {
		if (source.hasOwnProperty(p)) {
			if (typeof target[p] === 'object' && typeof source[p] === 'object') {
				mergeFragment(target[p], source[p]);
			} else {
				target[p] = source[p];
			}
		}
	}
}

function getFragments() {
	const cmd = `rg --files-with-matches --glob "*.ts" --regexp "/\*\\s*__GDPR__FRAGMENT__"`;
	let filePaths = cp.execSync(cmd, { cwd: WORKSPACE_ROOT, encoding: 'ascii' });
	filePaths = filePaths.split(/(?:\r\n|\r|\n)/g);

	let fragmentDeclarations = {};
	filePaths.forEach(filePath => {
		if (filePath) {
			const cwdRelativePath = path.join(__dirname, `../${filePath}`);
			const fileContents = fs.readFileSync(cwdRelativePath, { encoding: 'utf8' });
			const fragmentMatcher = /\/\*\s*__GDPR__FRAGMENT__([^/]*)*\*\//mg;
			let m;
			while (m = fragmentMatcher.exec(fileContents)) {
				let jsonString = `{ ${m[1]} }`;
				let fragment = JSON.parse(jsonString);
				mergeFragment(fragmentDeclarations, fragment);
			}
		}
	}, this);

	return fragmentDeclarations;
}

function getEvents() {
	const cmd = `rg --files-with-matches --glob "*.ts" --regexp "/\*\\s*__GDPR__\\b"`;
	let filePaths = cp.execSync(cmd, { cwd: WORKSPACE_ROOT, encoding: 'ascii' });
	filePaths = filePaths.split(/(?:\r\n|\r|\n)/g);

	let fragmentDeclarations = [];
	filePaths.forEach(filePath => {
		if (filePath) {
			const cwdRelativePath = path.join(__dirname, `../${filePath}`);
			const fileContents = fs.readFileSync(cwdRelativePath, { encoding: 'utf8' });
			const fragmentMatcher = /\/\*\s*__GDPR__\b([^/]*)*\*\//mg;
			let m;
			while (m = fragmentMatcher.exec(fileContents)) {
				fragmentDeclarations.push(m[1]);
			}
		}
	}, this);

	const jsonString = `{ ${fragmentDeclarations.join(',')} }`;
	return JSON.parse(jsonString);
}

const referenceMatcher = /\${(.*)}/;
function getReferenceName(reference) {
	const match = reference.match(referenceMatcher);
	return match ? match[1] : null;
}

function resolveIncludes(target, fragments) {
	let includeClause = target['${include}'];
	if (includeClause) {
		let remainingIncludes = [];
		for (let reference of includeClause) {
			const referenceName = getReferenceName(reference);
			if (referenceName) {
				let fragment = fragments[referenceName];
				if (fragment) {
					mergeFragment(target, fragment);
				} else {
					remainingIncludes.push(reference);
				}
			}
		}
		if (remainingIncludes.length === 0) {
			delete target['${include}'];
		} else {
			target['${include}'] = remainingIncludes;
		}
	}
	for (let p in target) {
		if (target.hasOwnProperty(p) && typeof target[p] === 'object') {
			resolveIncludes(target[p], fragments);
		}
	}
	return target;
}


let fragments = getFragments();
fragments = resolveIncludes(fragments, fragments);

let commonProperties = getCommonProperties();
let events = resolveIncludes(getEvents(), fragments);
events = addCommonProperties(events, commonProperties);
console.log(events);

