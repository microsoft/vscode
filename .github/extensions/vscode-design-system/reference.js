/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, request, sourceLink } from './ui.js';
import { renderFoundations, renderSimplePage } from './foundations.js';
import { renderTypography } from './typography.js';
import { renderIcons } from './visuals.js';
import { renderThemeGallery } from './theme-gallery.js';
import { renderMotion, disposeMotion } from './motion.js';
import { renderComponents } from './components.js';
import { findTokens } from './token-lookup.mjs';
import { readingGuidance } from './page-content.mjs';
import { useEffect, useMemo } from 'storybook/preview-api';

function tokenRow(token) {
	const detail = node('details', undefined, 'token');
	const summary = node('summary');
	const sample = node('span', token.category === 'colors' ? '' : token.value);
	if (token.category === 'colors') {
		sample.className = 'swatch';
		sample.style.backgroundColor = token.value;
		sample.setAttribute('aria-hidden', 'true');
	}
	summary.append(node('code', token.id), sample, node('code', token.value));
	const body = node('div', undefined, 'detail');
	body.append(node('p', token.description ?? 'Explicit theme declaration, including inherited theme files.'),
		node('code', `var(${token.css})`), node('br'), sourceLink(token.source));
	if (token.deprecated) {
		body.append(node('p', `Deprecated alias. Prefer ${token.replacement}.`));
	}
	detail.append(summary, body);
	return detail;
}

export function mountReference(root, props) {
	const lifetime = new AbortController();
	let rendering;
	let sequence = 0;
	let snapshot;
	let query = '';
	let tokenType = 'all';
	const content = node('section');
	content.id = 'content';
	content.setAttribute('aria-label', 'Design reference');
	const status = node('p');
	status.id = 'status';
	status.setAttribute('role', 'status');
	const problem = node('p');
	problem.id = 'problem';
	problem.setAttribute('role', 'alert');
	problem.hidden = true;
	const heading = node('h1');
	const identity = node('p', undefined, 'meta');
	const guidance = node('p', undefined, 'reading-guidance');
	const filters = node('div', undefined, 'filters');
	const retry = node('button', 'Reload sources');
	retry.type = 'button';
	const details = node('details', undefined, 'scope');
	details.append(node('summary', 'Source details'), retry);
	root.replaceChildren(heading, identity, guidance, filters, status, problem, content, details);
	root.classList.add('design-reference');
	const showProblem = error => {
		problem.hidden = false;
		problem.textContent = `Couldn't load the design reference: ${error.message}. Use Reload sources to retry.`;
	};
	const showAnchor = anchor => {
		if (!anchor) {
			return;
		}
		const target = content.querySelector(`#${CSS.escape(anchor)}`);
		if (target) {
			for (let element = target; element && element !== content; element = element.parentElement) {
				if (element.tagName === 'DETAILS') {
					element.open = true;
				}
			}
			target.tabIndex = -1;
			target.focus({ preventScroll: true });
			target.scrollIntoView({ block: 'start' });
		}
	};
	const drawContent = async () => {
		rendering?.abort();
		rendering = new AbortController();
		disposeMotion();
		content.replaceChildren();
		const system = { ...snapshot, view: { ...snapshot.view, ...props, query } };
		let count;
		if (props.section === 'components') {
			await renderComponents(content, system, props.fixtureId ?? snapshot.view.fixtureId, rendering.signal);
		} else if (props.section === 'typography') {
			count = renderTypography(content, system);
		} else if (['spacing', 'shape', 'size', 'colors', 'layout'].includes(props.section)) {
			count = renderFoundations(content, system);
		} else if (props.section === 'theming') {
			count = renderThemeGallery(content, system);
		} else if (props.section === 'motion') {
			count = renderMotion(content, system);
		} else if (props.section === 'iconography') {
			count = renderIcons(content, system);
		} else if (props.section === 'tokens') {
			const tokens = findTokens(tokenType === 'sizes' ? system.sizes : tokenType === 'colors' ? system.colors : [...system.sizes, ...system.colors], query);
			content.append(...tokens.map(tokenRow));
			count = tokens.length;
		} else {
			count = renderSimplePage(content, system);
		}
		status.textContent = count === undefined ? 'Live Component Explorer renderer' : `${count} source-backed entries`;
	};
	const refresh = async () => {
		const version = ++sequence;
		try {
			const system = await request('/api/system', { signal: lifetime.signal });
			if (version !== sequence || lifetime.signal.aborted) {
				return;
			}
			snapshot = system;
			problem.hidden = true;
			const section = system.sections.find(item => item.id === props.section);
			heading.textContent = props.section === 'components' ? system.controls.find(control => control.id === props.controlId).name : section.title;
			identity.textContent = `${system.provenance.kind}: ${system.provenance.branch} · ${system.provenance.commit.slice(0, 7)} · ${system.provenance.modified ? 'Modified' : 'Clean'} · Saved checkout files update automatically`;
			identity.title = system.provenance.worktreePath;
			const limitations = node('ul');
			limitations.append(...system.limitations.map(text => node('li', text)));
			details.replaceChildren(node('summary', 'Source details'),
				node('p', `${system.provenance.worktreePath} — ${system.provenance.deployment}`), retry, limitations);
			guidance.textContent = readingGuidance[props.section];
			filters.replaceChildren();
			if (['tokens', 'iconography'].includes(props.section)) {
				const label = node('label', props.section === 'tokens' ? 'Search tokens' : 'Search icons');
				const search = node('input');
				search.type = 'search';
				search.maxLength = 200;
				search.value = query;
				search.addEventListener('input', () => { query = search.value; void drawContent().catch(showProblem); });
				label.append(search);
				filters.append(label);
			}
			if (props.section === 'tokens') {
				const label = node('label', 'Token type');
				const select = node('select');
				for (const [value, text] of [['all', 'All tokens'], ['sizes', 'Size and typography'], ['colors', 'Colors']]) {
					const option = node('option', text);
					option.value = value;
					select.append(option);
				}
				select.value = tokenType;
				select.addEventListener('change', () => { tokenType = select.value; void drawContent().catch(showProblem); });
				label.append(select);
				filters.append(label);
			}
			if (['tokens', 'colors'].includes(props.section)) {
				const label = node('label', 'Theme');
				const select = node('select');
				for (const theme of system.themes) {
					const option = node('option', theme.id);
					option.value = theme.id;
					select.append(option);
				}
				select.value = system.view.theme;
				select.addEventListener('change', () => {
					void request('/api/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: select.value }) }).catch(showProblem);
				});
				label.append(select);
				filters.append(label);
			}
			await drawContent();
			if (system.view.section === props.section) {
				showAnchor(system.view.anchor);
			}
		} catch (error) {
			if (!lifetime.signal.aborted && version === sequence) {
				showProblem(error);
			}
		}
	};
	retry.addEventListener('click', refresh);
	content.addEventListener('refresh-reference', refresh);
	const events = new EventSource('/api/events');
	events.onmessage = event => {
		const { kind, view } = JSON.parse(event.data);
		if (kind === 'navigate' && view.section === props.section) {
			query = view.query;
		}
		void refresh();
	};
	events.onerror = () => {
		problem.hidden = false;
		problem.textContent = 'Live source updates are disconnected. The browser will reconnect automatically; restart npm run dev if the server stopped.';
	};
	void request('/api/system', { signal: lifetime.signal }).then(async system => {
		const matches = system.view.section === props.section
			&& (props.section !== 'components' || system.view.controlId === props.controlId)
			&& (props.fixtureId === undefined || system.view.fixtureId === props.fixtureId);
		if (matches) {
			query = system.view.query;
		} else {
			await request('/api/view', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ section: props.section, controlId: props.controlId ?? 'button', fixtureId: props.fixtureId ?? '', anchor: '', query: '' }),
				signal: lifetime.signal,
			});
		}
		await refresh();
	}).catch(error => {
		if (!lifetime.signal.aborted) {
			showProblem(error);
		}
	});
	return () => {
		sequence++;
		lifetime.abort();
		rendering?.abort();
		events.close();
		disposeMotion();
		root.replaceChildren();
	};
}

export function renderReference(props) {
	const root = useMemo(() => node('div', undefined, 'design-reference'), []);
	useEffect(() => mountReference(root, props), [root, props.section, props.controlId, props.fixtureId]);
	return root;
}
