(() => {
	const vscode = acquireVsCodeApi();
	const editor = document.getElementById('editor');
	const toolbar = document.querySelector('.toolbar');
	const source = document.getElementById('source');
	const splitToggle = toolbar ? toolbar.querySelector('[data-command="toggleSource"]') : null;
	const showError = (message) => {
		if (!editor) {
			return;
		}
		editor.innerHTML = '';
		const container = document.createElement('div');
		container.style.padding = '16px';
		const title = document.createElement('strong');
		title.textContent = 'Markdown editor failed to load.';
		const detail = document.createElement('div');
		detail.textContent = message;
		detail.style.marginTop = '8px';
		container.appendChild(title);
		container.appendChild(detail);
		editor.appendChild(container);
		vscode.postMessage({ type: 'webviewError', message });
	};
	let converter;
	let turndown;
	try {
		converter = new showdown.Converter({
			tables: true,
			strikethrough: true,
			simpleLineBreaks: true,
			tasklists: true
		});
		turndown = new TurndownService({
			codeBlockStyle: 'fenced'
		});
		const normalizeCodeText = (text) => text.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n');
		const wrapInlineCode = (text) => (text.includes('`') ? `\`\`${text}\`\`` : `\`${text}\``);
		turndown.addRule('fencedCodeBlock', {
			filter: (node) =>
				node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE',
			replacement: (_content, node) => {
				const codeNode = node.firstChild;
				const code = normalizeCodeText(codeNode?.textContent || '');
				return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
			}
		});
		turndown.addRule('inlineCode', {
			filter: (node) => node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE',
			replacement: (_content, node) => {
				const code = normalizeCodeText(node.textContent || '');
				return wrapInlineCode(code);
			}
		});
		turndown.addRule('lineBreak', {
			filter: (node) => node.nodeName === 'BR',
			replacement: () => '\n'
		});
		turndown.addRule('mermaidBlock', {
			filter: (node) => {
				return node.nodeName === 'DIV' && node.classList.contains('mermaid-container');
			},
			replacement: (_content, node) => {
				const source = node.getAttribute('data-mermaid-source') || '';
				return '\n\n```mermaid\n' + source + '\n```\n\n';
			}
		});
	} catch (error) {
		showError(`Initialization error: ${error?.message || String(error)}`);
	}

	let mermaidReady = false;
	let mermaidRenderCounter = 0;
	try {
		if (typeof mermaid !== 'undefined') {
			mermaid.initialize({
				startOnLoad: false,
				theme: 'default',
				securityLevel: 'strict',
				suppressErrorRendering: true
			});
			mermaidReady = true;
		}
	} catch (err) {
		console.warn('Mermaid initialization failed:', err);
	}

	let lastMarkdown = '';
	let isApplyingUpdate = false;
	let inputTimeout = null;
	let savedSelection = null;
	let basePath = '';
	let isSplitVisible = false;
	let isHighlighting = false;

	const modal = document.createElement('div');
	modal.className = 'modal hidden';
	modal.innerHTML = `
		<div class="modal-backdrop"></div>
		<div class="modal-dialog" role="dialog" aria-modal="true">
			<h2 class="modal-title">Insert link</h2>
			<label class="modal-label">
				<span>Text</span>
				<input class="modal-text" type="text" />
			</label>
			<label class="modal-label">
				<span>URL</span>
				<div class="modal-input-row">
					<input class="modal-input" type="text" placeholder="https://" />
					<button class="modal-browse" type="button" title="Browse">...</button>
				</div>
			</label>
			<div class="modal-actions">
				<button class="modal-cancel" type="button">Cancel</button>
				<button class="modal-ok" type="button">OK</button>
			</div>
		</div>
	`;
	document.body.appendChild(modal);

	const modalTitle = modal.querySelector('.modal-title');
	const modalInput = modal.querySelector('.modal-input');
	const modalText = modal.querySelector('.modal-text');
	const modalBrowse = modal.querySelector('.modal-browse');
	const modalTextLabel = modal.querySelector('.modal-text')?.closest('.modal-label')?.querySelector('span');
	const modalUrlLabel = modal.querySelector('.modal-input')?.closest('.modal-label')?.querySelector('span');
	const modalOk = modal.querySelector('.modal-ok');
	const modalCancel = modal.querySelector('.modal-cancel');
	const modalBackdrop = modal.querySelector('.modal-backdrop');

	let filePickerResolver = null;
	const showModal = (options) => new Promise((resolve) => {
		const {
			title,
			urlLabel = 'URL',
			textLabel = 'Text',
			initialUrl = '',
			initialText = '',
			showText = true
		} = options;

		modalTitle.textContent = title;
		modalInput.value = initialUrl || '';
		modalText.value = initialText || '';
		modalText.parentElement.style.display = showText ? 'flex' : 'none';
		if (modalTextLabel) {
			modalTextLabel.textContent = textLabel;
		}
		if (modalUrlLabel) {
			modalUrlLabel.textContent = urlLabel;
		}
		modal.classList.remove('hidden');
		if (showText) {
			modalText.focus();
			modalText.select();
		} else {
			modalInput.focus();
			modalInput.select();
		}

		const cleanup = (value) => {
			modal.classList.add('hidden');
			modalOk.removeEventListener('click', onOk);
			modalCancel.removeEventListener('click', onCancel);
			modalBackdrop.removeEventListener('click', onCancel);
			modalInput.removeEventListener('keydown', onKeyDown);
			modalText.removeEventListener('keydown', onKeyDown);
			modalBrowse.removeEventListener('click', onBrowse);
			filePickerResolver = null;
			resolve(value);
		};

		const onOk = () => cleanup({
			url: modalInput.value.trim(),
			text: modalText.value.trim()
		});
		const onCancel = () => cleanup({ url: '', text: '' });
		const onBrowse = () => {
			vscode.postMessage({ type: 'openFilePicker' });
		};
		const onKeyDown = (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				onOk();
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				onCancel();
			}
		};

		modalOk.addEventListener('click', onOk);
		modalCancel.addEventListener('click', onCancel);
		modalBackdrop.addEventListener('click', onCancel);
		modalInput.addEventListener('keydown', onKeyDown);
		modalText.addEventListener('keydown', onKeyDown);
		modalBrowse.addEventListener('click', onBrowse);
		filePickerResolver = (value) => {
			modalInput.value = value || '';
			modalInput.focus();
		};
	});

	const normalizePath = (value) => value.replace(/\\/g, '/');
	const stripFileScheme = (value) => value.replace(/^file:\/\//i, '');
	const isExternalUrl = (value) => /^(https?:|mailto:)/i.test(value);
	const isRelativePath = (value) => value.startsWith('./') || value.startsWith('../') || value.startsWith('#');
	const isAbsolutePath = (value) => /^([a-zA-Z]:\/|\\|\/)/.test(value);

	const toRelativePath = (fromDir, toPath) => {
		const from = normalizePath(stripFileScheme(fromDir)).replace(/\/+$/, '');
		const to = normalizePath(stripFileScheme(toPath));

		const fromParts = from.split('/').filter(Boolean);
		const toParts = to.split('/').filter(Boolean);

		if (/^[a-zA-Z]:$/.test(fromParts[0]) && /^[a-zA-Z]:$/.test(toParts[0])) {
			if (fromParts[0].toLowerCase() !== toParts[0].toLowerCase()) {
				return toPath;
			}
			fromParts.shift();
			toParts.shift();
		}

		let common = 0;
		while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
			common++;
		}

		const upMoves = fromParts.length - common;
		const relativeParts = [];
		for (let i = 0; i < upMoves; i++) {
			relativeParts.push('..');
		}
		relativeParts.push(...toParts.slice(common));
		const relative = relativeParts.join('/') || '.';
		return relative.startsWith('.') ? relative : `./${relative}`;
	};

	const normalizeLocalUrl = (value) => {
		if (!value) {
			return value;
		}
		if (isExternalUrl(value) || isRelativePath(value)) {
			return value;
		}
		if (!basePath || !isAbsolutePath(value)) {
			return value;
		}
		return toRelativePath(basePath, value);
	};

	const escapeHtml = (value) => value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	const insertTextAtSelection = (text) => {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return false;
		}
		const range = selection.getRangeAt(0);
		range.deleteContents();
		const node = document.createTextNode(text);
		range.insertNode(node);
		range.setStartAfter(node);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
		return true;
	};

	const highlightCodeText = (text) => {
		const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(["'`])(?:\\.|(?!\2)[^\\\n])*\2|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|class|new|import|from|export|default|try|catch|finally|throw|await|async|extends|super|this)\b|(<\/?[A-Za-z][^>]*>)/g;
		let result = '';
		let lastIndex = 0;
		let match;
		while ((match = pattern.exec(text)) !== null) {
			result += escapeHtml(text.slice(lastIndex, match.index));
			if (match[1]) {
				result += `<span class="hl-comment">${escapeHtml(match[1])}</span>`;
			} else if (match[2]) {
				result += `<span class="hl-string">${escapeHtml(match[0])}</span>`;
			} else if (match[4]) {
				result += `<span class="hl-number">${escapeHtml(match[4])}</span>`;
			} else if (match[5]) {
				result += `<span class="hl-keyword">${escapeHtml(match[5])}</span>`;
			} else if (match[6]) {
				result += `<span class="hl-tag">${escapeHtml(match[6])}</span>`;
			}
			lastIndex = match.index + match[0].length;
		}
		result += escapeHtml(text.slice(lastIndex));
		return result;
	};

	const renderMermaidBlocks = async () => {
		if (!editor || !mermaidReady) {
			return;
		}
		const codeBlocks = editor.querySelectorAll('pre code');
		for (const block of codeBlocks) {
			const classes = block.className || '';
			const isMermaid = classes.includes('mermaid') || classes.includes('language-mermaid');
			if (!isMermaid) {
				continue;
			}
			const source = (block.textContent || '').trim();
			if (!source) {
				continue;
			}
			const pre = block.parentElement;
			if (!pre || pre.nodeName !== 'PRE') {
				continue;
			}
			try {
				const id = 'mermaid-render-' + (++mermaidRenderCounter);
				const { svg } = await mermaid.render(id, source);
				const container = document.createElement('div');
				container.className = 'mermaid-container';
				container.setAttribute('contenteditable', 'false');
				container.setAttribute('data-mermaid-source', source);
				const diagramDiv = document.createElement('div');
				diagramDiv.className = 'mermaid-diagram';
				diagramDiv.innerHTML = svg;
				const overlay = document.createElement('div');
				overlay.className = 'mermaid-overlay';
				overlay.innerHTML = '<span class="mermaid-edit-hint">Click to edit diagram</span>';
				overlay.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					openMermaidEditor(container);
				});
				container.appendChild(diagramDiv);
				container.appendChild(overlay);
				pre.replaceWith(container);
			} catch (err) {
				console.warn('Mermaid render error:', err);
				const container = document.createElement('div');
				container.className = 'mermaid-container mermaid-error';
				container.setAttribute('contenteditable', 'false');
				container.setAttribute('data-mermaid-source', source);
				const errorDiv = document.createElement('div');
				errorDiv.className = 'mermaid-error-content';
				errorDiv.innerHTML = '<strong>Mermaid diagram error</strong><pre>' + escapeHtml(source) + '</pre>';
				const overlay = document.createElement('div');
				overlay.className = 'mermaid-overlay';
				overlay.innerHTML = '<span class="mermaid-edit-hint">Click to edit diagram</span>';
				overlay.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					openMermaidEditor(container);
				});
				container.appendChild(errorDiv);
				container.appendChild(overlay);
				pre.replaceWith(container);
			}
		}
	};

	const highlightCodeBlocks = () => {
		if (!editor || isHighlighting) {
			return;
		}
		isHighlighting = true;
		try {
			const blocks = editor.querySelectorAll('pre code');
			blocks.forEach((block) => {
				const classes = block.className || '';
				if (classes.includes('mermaid') || classes.includes('language-mermaid')) {
					return;
				}
				const rawText = block.textContent || '';
				block.innerHTML = highlightCodeText(rawText);
				block.setAttribute('data-highlighted', 'true');
			});
		} finally {
			isHighlighting = false;
		}
	};

	const updateSplitToggle = () => {
		if (!splitToggle) {
			return;
		}
		splitToggle.textContent = isSplitVisible ? 'Hide Source' : 'Show Source';
		splitToggle.setAttribute('aria-pressed', isSplitVisible ? 'true' : 'false');
		splitToggle.setAttribute('title', isSplitVisible ? 'Hide source pane' : 'Show source pane');
	};

	const setSplitVisible = (visible) => {
		isSplitVisible = visible;
		document.body.classList.toggle('split-visible', visible);
		updateSplitToggle();
	};

	const applyMarkdown = (text) => {
		isApplyingUpdate = true;
		try {
			lastMarkdown = text;
			if (converter) {
				editor.innerHTML = converter.makeHtml(text || '');
			}
			if (source) {
				source.value = text || '';
			}
		} finally {
			isApplyingUpdate = false;
		}
		highlightCodeBlocks();
		renderMermaidBlocks();
	};

	const sendUpdate = () => {
		if (isApplyingUpdate) {
			return;
		}
		if (!turndown) {
			return;
		}
		const markdown = turndown.turndown(editor.innerHTML || '');
		if (markdown === lastMarkdown) {
			return;
		}
		lastMarkdown = markdown;
		if (source) {
			source.value = markdown;
		}
		vscode.postMessage({ type: 'update', text: markdown });
	};

	const scheduleUpdate = () => {
		if (inputTimeout) {
			clearTimeout(inputTimeout);
		}
		inputTimeout = setTimeout(sendUpdate, 300);
	};

	const scheduleSourceUpdate = () => {
		if (isApplyingUpdate) {
			return;
		}
		if (!source || !converter) {
			return;
		}
		if (inputTimeout) {
			clearTimeout(inputTimeout);
		}
		inputTimeout = setTimeout(() => {
			const markdown = source.value || '';
			if (markdown === lastMarkdown) {
				return;
			}
			lastMarkdown = markdown;
			isApplyingUpdate = true;
			try {
				editor.innerHTML = converter.makeHtml(markdown);
			} finally {
				isApplyingUpdate = false;
			}
			highlightCodeBlocks();
			renderMermaidBlocks();
			vscode.postMessage({ type: 'update', text: markdown });
		}, 300);
	};

	editor.addEventListener('input', scheduleUpdate);
	editor.addEventListener('blur', sendUpdate);
	editor.addEventListener('keydown', (event) => {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
			sendUpdate();
		}
		if (event.key === 'Enter') {
			const selection = window.getSelection();
			const anchorNode = selection?.anchorNode;
			const container = anchorNode && anchorNode.nodeType === Node.TEXT_NODE
				? anchorNode.parentElement
				: anchorNode;
			const inCodeBlock = container && container.closest && container.closest('pre');
			if (inCodeBlock) {
				event.preventDefault();
				insertTextAtSelection('\n');
				scheduleUpdate();
			}
		}
	});
	editor.addEventListener('paste', (event) => {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return;
		}
		const anchorNode = selection.anchorNode;
		const container = anchorNode && anchorNode.nodeType === Node.TEXT_NODE
			? anchorNode.parentElement
			: anchorNode;
		const inCodeBlock = container && container.closest && container.closest('pre');
		if (!inCodeBlock) {
			return;
		}
		const text = event.clipboardData?.getData('text/plain');
		if (text === undefined) {
			return;
		}
		event.preventDefault();
		const normalized = text.replace(/\r\n/g, '\n');
		if (!document.execCommand('insertText', false, normalized)) {
			const range = selection.getRangeAt(0);
			range.deleteContents();
			range.insertNode(document.createTextNode(normalized));
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);
		}
		scheduleUpdate();
	});
	if (source) {
		source.addEventListener('input', scheduleSourceUpdate);
		source.addEventListener('blur', scheduleSourceUpdate);
		source.addEventListener('keydown', (event) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
				scheduleSourceUpdate();
			}
			if (event.key === 'Enter') {
				const start = source.selectionStart ?? 0;
				const end = source.selectionEnd ?? 0;
				const value = source.value ?? '';
				event.preventDefault();
				source.value = `${value.slice(0, start)}\n${value.slice(end)}`;
				const cursor = start + 1;
				source.setSelectionRange(cursor, cursor);
				scheduleSourceUpdate();
			}
		});
	}
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			sendUpdate();
		}
	});
	setSplitVisible(false);

	// Shared handler for editing a mermaid container
	let mermaidEditorOpen = false;
	const openMermaidEditor = async (container) => {
		if (mermaidEditorOpen) {
			return;
		}
		if (!container || !editor.contains(container)) {
			return;
		}
		if (typeof window.MermaidDiagramEditor === 'undefined') {
			console.error('MermaidDiagramEditor not loaded');
			return;
		}
		mermaidEditorOpen = true;
		try {
			const currentSource = container.getAttribute('data-mermaid-source') || '';
			const result = await window.MermaidDiagramEditor.show({
				source: currentSource,
				showDelete: true
			});

			if (result === '__delete__') {
				container.remove();
				scheduleUpdate();
				return;
			}

			if (result === null) {
				return;
			}

			container.setAttribute('data-mermaid-source', result);
			if (mermaidReady) {
				try {
					const id = 'mermaid-render-' + (++mermaidRenderCounter);
					const { svg } = await mermaid.render(id, result);
					const diagramDiv = container.querySelector('.mermaid-diagram');
					if (diagramDiv) {
						diagramDiv.innerHTML = svg;
					}
					container.classList.remove('mermaid-error');
				} catch (err) {
					const diagramDiv = container.querySelector('.mermaid-diagram');
					if (diagramDiv) {
						diagramDiv.innerHTML = '<strong>Mermaid diagram error</strong><pre>' + escapeHtml(result) + '</pre>';
					}
					container.classList.add('mermaid-error');
				}
			}
			scheduleUpdate();
		} catch (err) {
			console.error('Failed to open mermaid editor:', err);
		} finally {
			mermaidEditorOpen = false;
		}
	};

	// Click handler for editing existing mermaid diagrams (uses WYSIWYG editor)
	editor.addEventListener('click', async (event) => {
		const container = event.target.closest('.mermaid-container');
		if (!container || !editor.contains(container)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		await openMermaidEditor(container);
	});

	editor.addEventListener('click', async (event) => {
		// Skip if click is inside a mermaid container (handled above)
		if (event.target.closest('.mermaid-container')) {
			return;
		}
		const link = event.target.closest('a');
		if (!link || !editor.contains(link)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (event.ctrlKey || event.metaKey) {
			const href = link.getAttribute('href');
			if (href) {
				vscode.postMessage({ type: 'openLink', href });
			}
			return;
		}
		saveSelection();
		const result = await showModal({
			title: 'Edit link',
			initialUrl: link.getAttribute('href') || 'https://',
			initialText: link.textContent || ''
		});
		const normalizedUrl = normalizeLocalUrl(result.url);
		if (!normalizedUrl) {
			return;
		}
		link.setAttribute('href', normalizedUrl);
		link.textContent = result.text || normalizedUrl;
		scheduleUpdate();
	});

	const saveSelection = () => {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			savedSelection = null;
			return;
		}
		savedSelection = selection.getRangeAt(0).cloneRange();
	};

	const restoreSelection = () => {
		if (!savedSelection) {
			return;
		}
		const selection = window.getSelection();
		if (!selection) {
			return;
		}
		selection.removeAllRanges();
		selection.addRange(savedSelection);
	};

	editor.addEventListener('keyup', saveSelection);
	editor.addEventListener('mouseup', saveSelection);
	editor.addEventListener('focus', saveSelection);
	document.addEventListener('selectionchange', () => {
		if (document.activeElement === editor) {
			saveSelection();
		}
	});

	toolbar.addEventListener('mousedown', (event) => {
		if (event.target.closest('button')) {
			event.preventDefault();
			restoreSelection();
		}
	});

	toolbar.addEventListener('click', async (event) => {
		const target = event.target.closest('button');
		if (!target) {
			return;
		}
		event.preventDefault();
		restoreSelection();
		const command = target.getAttribute('data-command');
		if (!command) {
			return;
		}

		switch (command) {
			case 'bold':
				document.execCommand('bold');
				break;
			case 'italic':
				document.execCommand('italic');
				break;
			case 'h1':
				document.execCommand('formatBlock', false, 'h1');
				break;
			case 'h2':
				document.execCommand('formatBlock', false, 'h2');
				break;
			case 'ul':
				document.execCommand('insertUnorderedList');
				break;
			case 'ol':
				document.execCommand('insertOrderedList');
				break;
			case 'code': {
				const selection = window.getSelection();
				const selectedText = selection ? selection.toString() : '';
				const codeText = selectedText || 'code';
				const codeHtml = `<code>${codeText}</code>`;
				document.execCommand('insertHTML', false, codeHtml);
				break;
			}
			case 'codeBlock': {
				const selection = window.getSelection();
				const selectedText = selection ? selection.toString() : '';
				const codeText = selectedText || 'code block';
				const codeHtml = `<pre><code>${codeText}</code></pre>`;
				document.execCommand('insertHTML', false, codeHtml);
				break;
			}
			case 'link': {
				const selection = window.getSelection();
				const selectedText = selection ? selection.toString() : '';
				const result = await showModal({
					title: 'Insert link',
					initialUrl: 'https://',
					initialText: selectedText
				});
				const normalizedUrl = normalizeLocalUrl(result.url);
				if (!normalizedUrl) {
					break;
				}
				restoreSelection();
				const linkText = result.text || selectedText || normalizedUrl;
				const linkHtml = `<a href="${normalizedUrl}">${linkText}</a>`;
				document.execCommand('insertHTML', false, linkHtml);
				break;
			}
			case 'image': {
				const result = await showModal({
					title: 'Insert image',
					initialUrl: 'https://',
					showText: false
				});
				const normalizedUrl = normalizeLocalUrl(result.url);
				if (normalizedUrl) {
					document.execCommand('insertImage', false, normalizedUrl);
				}
				break;
			}
			case 'mermaid': {
				// Show diagram type picker
				const diagramTypes = [
					{ type: 'flowchart', label: 'Flowchart', source: 'graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Result 1]\n    B -->|No| D[Result 2]' },
					{ type: 'sequence', label: 'Sequence Diagram', source: 'sequenceDiagram\n    participant User\n    participant Server\n    User->>Server: Request\n    Server-->>User: Response' },
					{ type: 'state', label: 'State Diagram', source: 'stateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing : Start\n    Processing --> Done : Complete\n    Done --> [*]' },
					{ type: 'pie', label: 'Pie Chart', source: 'pie title Distribution\n    "Category A" : 40\n    "Category B" : 30\n    "Category C" : 20\n    "Category D" : 10' },					{ type: 'bar', label: 'Bar Chart', source: 'xychart-beta\n    title \"Sales Data\"\n    x-axis [Jan, Feb, Mar, Apr, May, Jun]\n    y-axis \"Revenue\" 0 --> 5000\n    bar [1000, 2000, 1500, 3000, 4500, 3500]' },				];

				// Create picker overlay
				const pickerOverlay = document.createElement('div');
				pickerOverlay.className = 'mw-editor';
				pickerOverlay.innerHTML = '';
				const backdrop = document.createElement('div');
				backdrop.className = 'mw-backdrop';
				const pickerDialog = document.createElement('div');
				pickerDialog.style.cssText = 'position:relative;width:400px;max-width:90%;margin:20vh auto;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);border:1px solid var(--vscode-widget-border,#444);border-radius:8px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,0.35);';
				pickerDialog.innerHTML = '<h3 style="margin:0 0 16px 0;font-size:15px;font-weight:600;">Insert Mermaid Diagram</h3>';
				const btnContainer = document.createElement('div');
				btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
				const selectedSource = await new Promise((resolve) => {
					for (const dt of diagramTypes) {
						const btn = document.createElement('button');
						btn.style.cssText = 'padding:10px 16px;border:1px solid var(--vscode-widget-border,#444);border-radius:6px;background:var(--vscode-button-secondaryBackground,#333);color:var(--vscode-button-secondaryForeground,#ccc);cursor:pointer;text-align:left;font-size:13px;';
						btn.textContent = dt.label;
						btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--vscode-button-background,#007acc)'; btn.style.color = 'var(--vscode-button-foreground,#fff)'; });
						btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--vscode-button-secondaryBackground,#333)'; btn.style.color = 'var(--vscode-button-secondaryForeground,#ccc)'; });
						btn.addEventListener('click', () => {
							pickerOverlay.remove();
							resolve(dt.source);
						});
						btnContainer.appendChild(btn);
					}
					pickerDialog.appendChild(btnContainer);
					backdrop.addEventListener('click', () => {
						pickerOverlay.remove();
						resolve(null);
					});
					pickerOverlay.appendChild(backdrop);
					pickerOverlay.appendChild(pickerDialog);
					document.body.appendChild(pickerOverlay);
				});

				if (!selectedSource) { break; }

				const mResult = await window.MermaidDiagramEditor.show({
					source: selectedSource,
					showDelete: false
				});
				if (mResult && mResult !== '__delete__') {
					restoreSelection();
					const placeholder = document.createElement('div');
					placeholder.className = 'mermaid-container';
					placeholder.setAttribute('contenteditable', 'false');
					placeholder.setAttribute('data-mermaid-source', mResult);
					placeholder.innerHTML = '<div class="mermaid-diagram">Rendering...</div><div class="mermaid-overlay"><span class="mermaid-edit-hint">Click to edit diagram</span></div>';
					const tempId = 'mermaid-insert-' + Date.now();
					placeholder.id = tempId;
					document.execCommand('insertHTML', false, placeholder.outerHTML);
					if (mermaidReady) {
						const inserted = editor.querySelector('#' + tempId);
						if (inserted) {
							inserted.removeAttribute('id');
							try {
								const rid = 'mermaid-render-' + (++mermaidRenderCounter);
								const { svg } = await mermaid.render(rid, mResult);
								const diagramDiv = inserted.querySelector('.mermaid-diagram');
								if (diagramDiv) {
									diagramDiv.innerHTML = svg;
								}
							} catch (err) {
								console.warn('Mermaid render error:', err);
							}
						}
					}
				}
				break;
			}
			case 'toggleSource':
				setSplitVisible(!isSplitVisible);
				break;
		}

		editor.focus();
		scheduleUpdate();
	});

	window.addEventListener('message', (event) => {
		const message = event.data;
		switch (message.type) {
			case 'update':
				applyMarkdown(String(message.text ?? ''));
				return;
			case 'basePath':
				basePath = String(message.basePath ?? '');
				return;
			case 'filePicked':
				if (filePickerResolver) {
					filePickerResolver(String(message.path ?? ''));
				}
				return;
		}
	});

	vscode.postMessage({ type: 'ready' });
})();
