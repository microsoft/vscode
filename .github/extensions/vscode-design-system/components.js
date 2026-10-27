/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, sourceLink, request } from './ui.js';

export async function renderComponents(content, system, fixtureId, signal) {
	const control = system.controls.find(control => control.id === system.view.controlId);
	content.append(node('p', control.docs.summary));
	const example = node('section', undefined, 'control-stage');
	example.id = 'component-example';
	const status = node('p', 'Connecting to the live Component Explorer...', 'preview-status');
	status.setAttribute('role', 'status');
	const reconnectButton = () => {
		const retry = node('button', 'Reconnect Component Explorer');
		retry.type = 'button';
		retry.addEventListener('click', async () => {
			retry.disabled = true;
			try {
				await request('/api/fixtures?refresh=true', { signal });
				content.dispatchEvent(new Event('refresh-reference'));
			} catch (error) {
				if (!signal.aborted) {
					status.textContent = `Couldn't reconnect: ${error.message}`;
					status.setAttribute('role', 'alert');
					retry.disabled = false;
				}
			}
		});
		return retry;
	};
	example.append(status);
	content.append(example);
	if (!control.groups.length) {
		status.textContent = control.docs.preview;
	} else {
		try {
			const catalog = await request('/api/fixtures', { signal });
			if (signal.aborted) {
				return;
			}
			const variants = catalog.controls.find(item => item.id === control.id)?.variants ?? [];
			const selected = fixtureId ? variants.find(variant => variant.id === fixtureId) : variants[0];
			if (!selected) {
				throw new Error(fixtureId ? `The live catalog no longer contains ${fixtureId}. Select another story.` : 'No fixture variants were found for this control.');
			}
			const url = new URL(catalog.explorerUrl);
			url.searchParams.set('mode', 'embedded');
			url.searchParams.set('fixture', selected.id);
			const frame = node('iframe', undefined, 'component-preview');
			frame.title = `${control.name}: ${selected.name}, interactive fixture`;
			frame.src = url.href;
			frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
			const timeout = setTimeout(() => {
				status.textContent = 'The fixture has not become ready. Check Component Explorer, then reload the preview.';
				example.dataset.previewState = 'unavailable';
			}, 30000);
			signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
			window.addEventListener('message', event => {
				if (event.source !== frame.contentWindow || event.origin !== url.origin || !event.data || typeof event.data !== 'object') {
					return;
				}
				const data = event.data;
				if (data.type === 'component-explorer:embedded-loaded') {
					frame.contentWindow.postMessage({
						type: 'component-explorer:embedded-init',
						host: { kind: 'explorer-ui' },
						input: { overrideFocus: false, enableAnimations: true },
					}, url.origin);
				} else if (data.fixtureId === selected.id) {
					if (data.type === 'component-explorer:ready' || data.type === 'component-explorer:error') {
						clearTimeout(timeout);
						example.dataset.previewState = data.type === 'component-explorer:ready' ? 'ready' : 'unavailable';
						status.textContent = data.type === 'component-explorer:ready'
							? `Live fixture: ${selected.id}`
							: `Fixture couldn't render: ${data.error?.message ?? 'No details were provided'}`;
					} else if (data.type === 'component-explorer:resize' && Number.isFinite(data.height) && data.height > 0) {
						frame.style.height = `${Math.max(240, Math.min(800, data.height + 40))}px`;
					}
				}
			}, { signal });
			const actions = node('div', undefined, 'tools');
			const open = node('a', 'Open in Component Explorer');
			url.searchParams.delete('mode');
			open.href = url.href;
			open.target = '_blank';
			open.rel = 'noopener noreferrer';
			const reload = node('button', 'Reload preview');
			reload.type = 'button';
			reload.addEventListener('click', () => { frame.src = frame.src; });
			actions.append(open, reload, reconnectButton(), sourceLink({ file: control.owner }, 'Implementation'));
			if (control.file) {
				actions.append(sourceLink({ file: control.file }, 'Fixture source'));
			}
			example.append(frame, actions);
		} catch (error) {
			if (signal.aborted) {
				return;
			}
			status.textContent = `Couldn't load fixtures: ${error.message}`;
			status.setAttribute('role', 'alert');
			example.append(node('p', 'Start the repository Component Explorer Server task, then reconnect. Browsing does not create cloud sessions.'), reconnectButton());
		}
	}
	for (const [id, title, notes] of [
		['component-usage', 'Usage', control.docs.usage],
		['component-accessibility', 'Accessibility', control.docs.accessibility],
	]) {
		const section = node('section', undefined, 'component-doc-section');
		section.id = id;
		const list = node('ul');
		list.append(...notes.map(text => node('li', text)));
		section.append(node('h3', title), list);
		content.append(section);
	}
	const api = node('section', undefined, 'component-doc-section');
	api.id = 'component-api';
	api.append(node('h3', 'API'), node('p', 'Selected TypeScript construction options and public members from the source, not React props.'));
	const scroll = node('div', undefined, 'table-scroll');
	const table = node('table', undefined, 'component-api-table');
	table.append(node('caption', `${control.docs.className} API`));
	const head = node('thead');
	const header = node('tr');
	for (const name of ['Member', 'Type', 'Purpose']) {
		const cell = node('th', name);
		cell.scope = 'col';
		header.append(cell);
	}
	head.append(header);
	const body = node('tbody');
	for (const prop of control.docs.api) {
		const row = node('tr');
		const name = node('th');
		name.scope = 'row';
		name.append(sourceLink(prop.source, prop.name));
		const type = node('td');
		type.append(node('code', prop.type));
		row.append(name, type, node('td', prop.description));
		body.append(row);
	}
	table.append(head, body);
	scroll.append(table);
	api.append(scroll);
	content.append(api);
	const audit = node('details', undefined, 'scope');
	audit.append(node('summary', 'Curation notes and audit gaps'), node('p', control.reason));
	for (const gap of system.controlGaps) {
		audit.append(node('p', `${gap.name}: ${gap.note}`));
	}
	content.append(audit);
}
