/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* global acquireVsCodeApi */
(function () {
	const vscode = acquireVsCodeApi();

	const initial = (window.__NEXORA_INITIAL_STATE__ || { connected: false, auth: { github: false, vercel: false } });

	const messages = document.getElementById('messages');
	const input = document.getElementById('input');
	const sendBtn = document.getElementById('sendBtn');
	const sendBtnText = document.getElementById('sendBtnText');
	const modeSelect = document.getElementById('modeSelect');
	const modelSelect = document.getElementById('modelSelect');
	const modeDdRoot = document.getElementById('modeDd');
	const modelDdRoot = document.getElementById('modelDd');
	const modeHint = document.getElementById('modeHint');
	const statusDot = document.getElementById('statusDot');
	const statusText = document.getElementById('statusText');
	const githubBadge = document.getElementById('githubBadge');
	const vercelBadge = document.getElementById('vercelBadge');
	const welcome = document.getElementById('welcome');
	const sessionSelect = document.getElementById('sessionSelect');
	const newSessionBtn = document.getElementById('newSessionBtn');
	const deleteSessionBtn = document.getElementById('deleteSessionBtn');

	let lastLoadingMessage = null;
	let chatActivityCard = null;
	let currentPlan = null;
	let planCardElement = null;
	let currentMode = 'chat';
	let activeSessionId = null;
	let openDdRoot = null;
	let ddKbIndex = 0;
	let ddGlobalsBound = false;
	let messagesScrollBarTimer = null;

	const modeHints = {
		'chat': 'Chat mode: Have a conversation, ask questions, get explanations',
		'ask': 'Ask mode: Answer using indexed workspace memory (.mv2). Index the workspace first if needed.',
		'plan': 'Plan mode: Generate an execution plan with cost estimation before executing',
		'execute': 'Execute mode: Directly execute tasks with real-time progress',
		'agent': 'Agent mode: Autonomous AI agent that plans and executes multi-step tasks'
	};

	const buttonLabels = {
		'chat': 'Send',
		'ask': 'Ask',
		'plan': 'Generate Plan',
		'execute': 'Execute',
		'agent': 'Run Agent'
	};

	function getDdOptions(menu) {
		return Array.prototype.slice.call(menu.querySelectorAll('[role="option"]'));
	}

	function syncOneDd(root) {
		const hidden = root.querySelector('input[type="hidden"]');
		const textEl = root.querySelector('.nx-ddTriggerText');
		const menu = root.querySelector('.nx-ddMenu');
		if (!hidden || !textEl || !menu) {
			return;
		}
		const val = hidden.value;
		const opt = menu.querySelector('[role="option"][data-value="' + val + '"]');
		if (opt) {
			textEl.textContent = (opt.textContent || '').trim();
		}
		getDdOptions(menu).forEach(function (o) {
			const on = o.getAttribute('data-value') === val;
			o.classList.toggle('nx-ddItemSelected', on);
			o.setAttribute('aria-selected', on ? 'true' : 'false');
		});
	}

	function positionDdMenu(root) {
		const trigger = root.querySelector('.nx-ddTrigger');
		const menu = root.querySelector('.nx-ddMenu');
		if (!trigger || !menu) {
			return;
		}
		const rect = trigger.getBoundingClientRect();
		const gap = 4;
		const cap = 240;
		const minW = Math.max(rect.width, 148);
		let left = rect.left;
		if (left + minW > window.innerWidth - 6) {
			left = window.innerWidth - 6 - minW;
		}
		menu.style.left = Math.max(4, left) + 'px';
		menu.style.minWidth = minW + 'px';
		menu.style.maxHeight = '';

		const spaceBelow = window.innerHeight - rect.bottom - gap;
		const spaceAbove = rect.top - gap;
		let h = menu.getBoundingClientRect().height;

		function applyMax(px) {
			const m = Math.max(40, Math.min(cap, Math.floor(Math.max(0, px))));
			menu.style.maxHeight = m + 'px';
			return menu.getBoundingClientRect().height;
		}

		let topPx;
		if (h <= spaceBelow) {
			topPx = rect.bottom + gap;
		} else if (h <= spaceAbove) {
			topPx = rect.top - gap - h;
		} else if (spaceAbove >= spaceBelow) {
			h = applyMax(spaceAbove);
			topPx = Math.max(gap, rect.top - gap - h);
		} else {
			h = applyMax(spaceBelow);
			topPx = rect.bottom + gap;
			if (topPx + h > window.innerHeight - gap) {
				topPx = Math.max(gap, window.innerHeight - gap - h);
			}
		}
		menu.style.top = topPx + 'px';
	}

	function setDdKeyboardHighlight(menu, index) {
		const items = getDdOptions(menu);
		items.forEach(function (el, i) {
			el.classList.toggle('nx-ddItemKeyboard', i === index);
		});
		ddKbIndex = index;
	}

	function closeDd(root) {
		if (!root) {
			return;
		}
		const trigger = root.querySelector('.nx-ddTrigger');
		const menu = root.querySelector('.nx-ddMenu');
		if (trigger) {
			trigger.setAttribute('aria-expanded', 'false');
		}
		if (menu) {
			menu.hidden = true;
			menu.style.top = '';
			menu.style.left = '';
			menu.style.minWidth = '';
			menu.style.maxHeight = '';
			getDdOptions(menu).forEach(function (o) {
				o.classList.remove('nx-ddItemKeyboard');
			});
		}
		root.classList.remove('nx-ddOpen');
		if (openDdRoot === root) {
			openDdRoot = null;
		}
	}

	function openDd(root) {
		if (openDdRoot && openDdRoot !== root) {
			closeDd(openDdRoot);
		}
		const trigger = root.querySelector('.nx-ddTrigger');
		const menu = root.querySelector('.nx-ddMenu');
		const hidden = root.querySelector('input[type="hidden"]');
		if (!trigger || !menu || !hidden) {
			return;
		}
		openDdRoot = root;
		root.classList.add('nx-ddOpen');
		trigger.setAttribute('aria-expanded', 'true');
		menu.hidden = false;
		const items = getDdOptions(menu);
		const idx = Math.max(0, items.findIndex(function (i) {
			return i.getAttribute('data-value') === hidden.value;
		}));
		setDdKeyboardHighlight(menu, idx);
		positionDdMenu(root);
		requestAnimationFrame(function () {
			if (openDdRoot === root) {
				positionDdMenu(root);
			}
		});
		try {
			menu.focus({ preventScroll: true });
		} catch (_e) {
			menu.focus();
		}
	}

	function applyDdSelection(root, value) {
		const hidden = root.querySelector('input[type="hidden"]');
		if (!hidden) {
			return;
		}
		hidden.value = value;
		syncOneDd(root);
		closeDd(root);
		if (root.getAttribute('data-dd-kind') === 'mode') {
			updateModeUI();
		}
	}

	function wireDd(root) {
		if (!root || root.dataset.nxDdWired) {
			return;
		}
		root.dataset.nxDdWired = '1';
		const trigger = root.querySelector('.nx-ddTrigger');
		const menu = root.querySelector('.nx-ddMenu');
		if (!trigger || !menu) {
			return;
		}
		menu.setAttribute('tabindex', '-1');

		trigger.addEventListener('click', function () {
			if (root.classList.contains('nx-ddOpen')) {
				closeDd(root);
			} else {
				openDd(root);
			}
		});

		trigger.addEventListener('keydown', function (e) {
			if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !root.classList.contains('nx-ddOpen')) {
				e.preventDefault();
				openDd(root);
			}
		});

		menu.addEventListener('click', function (e) {
			const opt = e.target.closest('[role="option"]');
			if (!opt || !menu.contains(opt)) {
				return;
			}
			applyDdSelection(root, opt.getAttribute('data-value'));
			trigger.focus();
		});

		menu.addEventListener('keydown', function (e) {
			const items = getDdOptions(menu);
			if (!items.length) {
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				const next = Math.min(items.length - 1, ddKbIndex + 1);
				setDdKeyboardHighlight(menu, next);
				items[next].scrollIntoView({ block: 'nearest' });
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				const prev = Math.max(0, ddKbIndex - 1);
				setDdKeyboardHighlight(menu, prev);
				items[prev].scrollIntoView({ block: 'nearest' });
			} else if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const pick = items[ddKbIndex];
				if (pick) {
					applyDdSelection(root, pick.getAttribute('data-value'));
					trigger.focus();
				}
			}
		});
	}

	function wireMessagesScrollbarFlash() {
		if (!messages) {
			return;
		}
		function showThumb() {
			messages.classList.add('nx-scrollShow');
			window.clearTimeout(messagesScrollBarTimer);
			messagesScrollBarTimer = window.setTimeout(function () {
				messages.classList.remove('nx-scrollShow');
			}, 900);
		}
		messages.addEventListener('scroll', showThumb, { passive: true });
		messages.addEventListener('wheel', showThumb, { passive: true });
	}

	function wireComposerDropdowns() {
		if (modeDdRoot) {
			wireDd(modeDdRoot);
		}
		if (modelDdRoot) {
			wireDd(modelDdRoot);
		}
		if (ddGlobalsBound) {
			return;
		}
		ddGlobalsBound = true;
		document.addEventListener('mousedown', function (e) {
			if (!openDdRoot || !e.target || !e.target.closest) {
				return;
			}
			if (openDdRoot.contains(e.target)) {
				return;
			}
			closeDd(openDdRoot);
		}, true);
		document.addEventListener('keydown', function (e) {
			if (e.key !== 'Escape' || !openDdRoot) {
				return;
			}
			const tr = openDdRoot.querySelector('.nx-ddTrigger');
			closeDd(openDdRoot);
			if (tr) {
				tr.focus();
			}
		});
		window.addEventListener('resize', function () {
			if (openDdRoot) {
				positionDdMenu(openDdRoot);
			}
		});
		window.addEventListener('scroll', function () {
			if (openDdRoot) {
				positionDdMenu(openDdRoot);
			}
		}, true);
	}

	function updateStatus(connected) {
		statusDot.classList.remove('nx-dotOk', 'nx-dotBad');
		if (connected) {
			statusDot.classList.add('nx-dotOk');
			statusText.textContent = 'Backend connected';
		} else {
			statusDot.classList.add('nx-dotBad');
			statusText.textContent = 'Backend disconnected';
		}
	}

	function updateAuthStatus(github, vercel) {
		githubBadge.classList.toggle('nx-connected', !!github);
		githubBadge.title = github ? 'GitHub connected' : 'Click to connect GitHub';

		vercelBadge.classList.toggle('nx-connected', !!vercel);
		vercelBadge.title = vercel ? 'Vercel connected' : 'Click to connect Vercel';
	}

	function updateModeUI() {
		if (!modeSelect) {
			return;
		}
		if (modeDdRoot) {
			syncOneDd(modeDdRoot);
		}
		if (modelDdRoot) {
			syncOneDd(modelDdRoot);
		}
		currentMode = modeSelect.value;
		const label = buttonLabels[currentMode] || 'Send';
		if (sendBtnText) {
			sendBtnText.textContent = label;
		}
		if (sendBtn) {
			sendBtn.title = `${label} (Enter)`;
			sendBtn.setAttribute('aria-label', `${label}, press Enter`);
		}
		
		const hintEl = modeHint.querySelector('.nx-hintText');
		if (hintEl) {
			hintEl.textContent = modeHints[currentMode] || '';
		}
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = String(text);
		return div.innerHTML;
	}

	function formatContent(content) {
		let html = escapeHtml(content);

		const codeBlockRegex = /```([\s\S]*?)```/g;
		html = html.replace(codeBlockRegex, function (_match, code) {
			const trimmed = String(code).trim();
			const copyId = 'code-' + Math.random().toString(36).slice(2, 11);
			return (
				'<div class="nx-codeHeader">' +
				'<span class="nx-codeTitle">Code</span>' +
				'<button class="nx-copyBtn" data-copy-target="' + copyId + '">Copy</button>' +
				'</div>' +
				'<pre class="nx-codeBlock" id="' + copyId + '">' +
				trimmed +
				'</pre>'
			);
		});

		html = html.replace(/`([^`]+)`/g, '<code class="nx-inlineCode">$1</code>');
		html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		html = html.replace(/\n/g, '<br/>');
		return html;
	}

	function clearChatActivityCard() {
		if (chatActivityCard && chatActivityCard.parentNode) {
			chatActivityCard.remove();
		}
		chatActivityCard = null;
	}

	function renderChatActivity(items) {
		if (!messages) {
			return;
		}
		const list = Array.isArray(items) ? items : [];
		if (!chatActivityCard) {
			const card = document.createElement('div');
			card.className = 'nx-activityCard';
			const headerBtn = document.createElement('button');
			headerBtn.type = 'button';
			headerBtn.className = 'nx-activityCardHeader';
			headerBtn.setAttribute('aria-expanded', 'true');
			const chev = document.createElement('span');
			chev.className = 'nx-activityChevron';
			chev.setAttribute('aria-hidden', 'true');
			chev.textContent = 'v';
			const title = document.createElement('span');
			title.className = 'nx-activityCardTitle';
			title.textContent = 'Activity';
			headerBtn.appendChild(chev);
			headerBtn.appendChild(title);
			const body = document.createElement('div');
			body.className = 'nx-activityCardBody';
			card.appendChild(headerBtn);
			card.appendChild(body);
			headerBtn.addEventListener('click', function () {
				const collapsed = card.classList.toggle('nx-activityCardCollapsed');
				headerBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
				const c = headerBtn.querySelector('.nx-activityChevron');
				if (c) {
					c.textContent = collapsed ? '>' : 'v';
				}
			});
			chatActivityCard = card;
		}
		const bodyEl = chatActivityCard.querySelector('.nx-activityCardBody');
		if (!bodyEl) {
			return;
		}
		bodyEl.innerHTML = '';
		list.forEach(function (it) {
			const row = document.createElement('div');
			row.className = 'nx-activityRow' + (it.done ? ' nx-activityRowDone' : '');
			row.setAttribute('data-activity-id', it.id);
			const mark = document.createElement('span');
			mark.className = 'nx-activityMark';
			mark.textContent = it.done ? '+' : '.';
			const lab = document.createElement('span');
			lab.className = 'nx-activityLabel';
			lab.textContent = it.label || '';
			row.appendChild(mark);
			row.appendChild(lab);
			bodyEl.appendChild(row);
		});
		if (lastLoadingMessage && lastLoadingMessage.parentNode === messages) {
			messages.insertBefore(chatActivityCard, lastLoadingMessage);
		} else if (!chatActivityCard.parentNode) {
			messages.appendChild(chatActivityCard);
		}
		messages.scrollTop = messages.scrollHeight;
	}

	function addMessage(role, content, isLoading) {
		if (welcome) {
			welcome.style.display = 'none';
		}

		if (isLoading && lastLoadingMessage) {
			lastLoadingMessage.remove();
		}

		const div = document.createElement('div');
		div.className = 'nx-msg ' + (role === 'user' ? 'nx-user' : 'nx-assistant') + (isLoading ? ' nx-msgLoading' : '');

		const header = document.createElement('div');
		header.className = 'nx-msgHeader';
		header.textContent = role === 'user' ? 'You' : 'Nexora';

		const body = document.createElement('div');
		body.className = 'nx-msgBody';

		if (isLoading) {
			body.textContent = content;
		} else {
			body.innerHTML = formatContent(content);
		}

		div.appendChild(header);
		div.appendChild(body);

		messages.appendChild(div);
		messages.scrollTop = messages.scrollHeight;

		if (isLoading) {
			lastLoadingMessage = div;
		} else if (lastLoadingMessage) {
			lastLoadingMessage.remove();
			lastLoadingMessage = null;
		}
	}

	function clearMessagesUi() {
		if (!messages) {
			return;
		}
		// Clear everything except the welcome block (so it can be shown for empty sessions)
		Array.from(messages.children).forEach((child) => {
			if (welcome && child === welcome) {
				return;
			}
			child.remove();
		});
		lastLoadingMessage = null;
		clearChatActivityCard();
		currentPlan = null;
		planCardElement = null;
	}

	function renderSessions(sessions, activeId) {
		if (!sessionSelect) {
			return;
		}
		sessionSelect.innerHTML = '';
		(sessions || []).forEach(s => {
			const opt = document.createElement('option');
			opt.value = s.id;
			opt.textContent = s.name || 'Chat';
			sessionSelect.appendChild(opt);
		});
		if (activeId) {
			sessionSelect.value = activeId;
			activeSessionId = activeId;
		}
	}

	function loadSessionMessages(sessionId, msgs) {
		activeSessionId = sessionId;
		clearMessagesUi();
		const arr = (msgs || []);
		if (welcome) {
			welcome.style.display = arr.length === 0 ? 'flex' : 'none';
		}
		arr.forEach(m => addMessage(m.role, m.content, false));
	}

	function createPlanApprovalCard(plan) {
		if (welcome) {
			welcome.style.display = 'none';
		}

		if (planCardElement) {
			planCardElement.remove();
		}

		currentPlan = plan;

		const card = document.createElement('div');
		card.className = 'nx-planCard';
		card.id = 'plan-card-' + plan.plan_id;

		const header = document.createElement('div');
		header.className = 'nx-planHeader';
		header.innerHTML = `
			<div class="nx-planTitle">Execution Plan</div>
			<div class="nx-planMeta">
				<span class="nx-planId">${plan.plan_id}</span>
				<span class="nx-planCost">Est. $${(plan.estimated_cost || 0).toFixed(4)}</span>
			</div>
		`;
		card.appendChild(header);

		const taskList = document.createElement('div');
		taskList.className = 'nx-planTasks';
		taskList.id = 'plan-tasks-' + plan.plan_id;

		(plan.tasks || []).forEach((task, index) => {
			const taskEl = document.createElement('div');
			taskEl.className = 'nx-planTask';
			taskEl.id = 'task-' + task.task_id;
			taskEl.setAttribute('data-status', 'pending');

			const deps = task.dependencies && task.dependencies.length > 0
				? `<span class="nx-taskDeps">after ${task.dependencies.join(', ')}</span>`
				: '';

			taskEl.innerHTML = `
				<div class="nx-taskStatus">
					<span class="nx-taskDot"></span>
					<span class="nx-taskIndex">${index + 1}</span>
				</div>
				<div class="nx-taskInfo">
					<div class="nx-taskName">${escapeHtml(task.name)}</div>
					<div class="nx-taskDetails">
						<span class="nx-taskPlatform">${task.platform}</span>
						${deps}
					</div>
				</div>
				<div class="nx-taskCost">$${(task.estimated_cost || 0).toFixed(4)}</div>
			`;
			taskList.appendChild(taskEl);
		});
		card.appendChild(taskList);

		const actions = document.createElement('div');
		actions.className = 'nx-planActions';
		actions.id = 'plan-actions-' + plan.plan_id;
		actions.innerHTML = `
			<button class="nx-cancelBtn" data-plan-id="${plan.plan_id}">Cancel</button>
			<button class="nx-approveBtn" data-plan-id="${plan.plan_id}">Approve & Execute</button>
		`;
		card.appendChild(actions);

		messages.appendChild(card);
		messages.scrollTop = messages.scrollHeight;

		planCardElement = card;

		if (lastLoadingMessage) {
			lastLoadingMessage.remove();
			lastLoadingMessage = null;
		}
	}

	function updateTaskStatus(taskId, status, error, cost) {
		const taskEl = document.getElementById('task-' + taskId);
		if (!taskEl) {
			return;
		}

		taskEl.setAttribute('data-status', status);

		if (cost !== undefined && cost !== null) {
			const costEl = taskEl.querySelector('.nx-taskCost');
			if (costEl) {
				costEl.textContent = '$' + cost.toFixed(4);
			}
		}

		if (status === 'failed' && error) {
			let errorEl = taskEl.querySelector('.nx-taskError');
			if (!errorEl) {
				errorEl = document.createElement('div');
				errorEl.className = 'nx-taskError';
				taskEl.querySelector('.nx-taskInfo').appendChild(errorEl);
			}
			errorEl.textContent = error;
		}
	}

	function showTaskRetry(taskId, taskName, attempt, maxAttempts, platform) {
		const taskEl = document.getElementById('task-' + taskId);
		if (!taskEl) {
			return;
		}

		taskEl.setAttribute('data-status', 'retrying');

		let retryEl = taskEl.querySelector('.nx-taskRetry');
		if (!retryEl) {
			retryEl = document.createElement('div');
			retryEl.className = 'nx-taskRetry';
			taskEl.querySelector('.nx-taskInfo').appendChild(retryEl);
		}
		retryEl.textContent = `Retry ${attempt}/${maxAttempts} on ${platform}...`;
	}

	function showPlanExecuting(planId) {
		const actionsEl = document.getElementById('plan-actions-' + planId);
		if (actionsEl) {
			actionsEl.innerHTML = `
				<div class="nx-planExecuting">
					<span class="nx-spinner"></span>
					<span>Executing tasks...</span>
				</div>
			`;
		}
	}

	function showPlanComplete(planId, status, tasks, actualCost) {
		const actionsEl = document.getElementById('plan-actions-' + planId);
		if (actionsEl) {
			const isSuccess = status === 'completed';
			const successCount = tasks ? tasks.filter(t => t.status === 'success').length : 0;
			const failedCount = tasks ? tasks.filter(t => t.status === 'failed').length : 0;

			actionsEl.innerHTML = `
				<div class="nx-planResult ${isSuccess ? 'nx-planSuccess' : 'nx-planFailed'}">
					<span class="nx-resultIcon">${isSuccess ? 'ok' : '!'}</span>
					<span class="nx-resultText">
						${isSuccess ? 'Completed' : 'Completed with issues'}
						${successCount > 0 ? ` • ${successCount} succeeded` : ''}
						${failedCount > 0 ? ` • ${failedCount} failed` : ''}
					</span>
					<span class="nx-resultCost">$${(actualCost || 0).toFixed(4)}</span>
				</div>
			`;
		}

		if (tasks) {
			tasks.forEach(task => {
				updateTaskStatus(task.task_id, task.status, task.error, task.actual_cost);
			});
		}

		currentPlan = null;
	}

	function handleSend() {
		const text = input.value.trim();
		if (!text) {
			return;
		}

		const model = modelSelect.value;
		const mode = modeSelect.value;

		addMessage('user', text, false);

		switch (mode) {
			case 'chat':
				vscode.postMessage({ type: 'sendMessage', message: text, model: model });
				break;
			case 'ask':
				vscode.postMessage({ type: 'askWorkspace', message: text, model: model });
				break;
			case 'plan':
				vscode.postMessage({ type: 'generatePlan', request: text, model: model });
				break;
			case 'execute':
				vscode.postMessage({ type: 'executeRequest', request: text, model: model });
				break;
			case 'agent':
				vscode.postMessage({ type: 'runAgent', request: text, model: model });
				break;
			default:
				vscode.postMessage({ type: 'sendMessage', message: text, model: model });
		}

		input.value = '';
	}

	// Event listeners
	sendBtn.onclick = handleSend;

	input.onkeypress = (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	wireComposerDropdowns();
	wireMessagesScrollbarFlash();
	if (sessionSelect) {
		sessionSelect.onchange = () => {
			const id = sessionSelect.value;
			if (id) {
				vscode.postMessage({ type: 'switchSession', sessionId: id });
			}
		};
	}
	if (newSessionBtn) {
		newSessionBtn.onclick = () => vscode.postMessage({ type: 'newSession' });
	}
	if (deleteSessionBtn) {
		deleteSessionBtn.onclick = () => {
			const id = (sessionSelect && sessionSelect.value) ? sessionSelect.value : activeSessionId;
			if (!id) {
				return;
			}
			vscode.postMessage({ type: 'deleteSession', sessionId: id });
		};
	}

	githubBadge.onclick = () => vscode.postMessage({ type: 'connectGitHub' });
	vercelBadge.onclick = () => vscode.postMessage({ type: 'connectVercel' });

	// Quick action buttons
	document.querySelectorAll('.nx-quickBtn').forEach(btn => {
		btn.onclick = () => {
			const action = btn.getAttribute('data-action');
			if (action === 'platforms') {
				vscode.postMessage({ type: 'browsePlatforms' });
			} else if (action === 'history') {
				vscode.postMessage({ type: 'getHistory' });
			} else if (action === 'memory') {
				vscode.postMessage({ type: 'indexWorkspace' });
			}
		};
	});

	// Click handlers for plan approval/cancel
	window.addEventListener('click', (e) => {
		const target = e.target;
		if (!target || !target.classList) {
			return;
		}

		if (target.classList.contains('nx-copyBtn')) {
			const id = target.getAttribute('data-copy-target');
			if (!id) {
				return;
			}
			const el = document.getElementById(id);
			if (!el) {
				return;
			}
			navigator.clipboard.writeText(el.textContent || '');
			const old = target.textContent;
			target.textContent = 'Copied';
			setTimeout(() => (target.textContent = old), 800);
		}

		if (target.classList.contains('nx-approveBtn')) {
			const planId = target.getAttribute('data-plan-id');
			if (planId) {
				vscode.postMessage({ type: 'approvePlan', planId: planId });
			}
		}

		if (target.classList.contains('nx-cancelBtn')) {
			const planId = target.getAttribute('data-plan-id');
			if (planId) {
				vscode.postMessage({ type: 'cancelPlan', planId: planId });
				const card = document.getElementById('plan-card-' + planId);
				if (card) {
					card.remove();
				}
				addMessage('assistant', 'Plan cancelled.', false);
				currentPlan = null;
				planCardElement = null;
			}
		}
	});

	// Message handler from extension
	window.addEventListener('message', (e) => {
		if (!e || !e.data) {
			return;
		}
		const data = e.data;

		switch (data.type) {
			case 'addMessage':
				addMessage(data.role, data.content, data.isLoading);
				break;

			case 'chatActivity':
				renderChatActivity(data.items);
				break;

			case 'chatActivityClear':
				clearChatActivityCard();
				break;

			case 'backendStatus':
				updateStatus(data.connected);
				break;

			case 'authStatus':
				updateAuthStatus(data.github, data.vercel);
				break;

			case 'showPlanApproval':
				createPlanApprovalCard(data.plan);
				break;

			case 'updateSessions':
				renderSessions(data.sessions, data.activeSessionId);
				break;

			case 'loadSession':
				loadSessionMessages(data.sessionId, data.messages);
				break;

			case 'taskUpdate':
				updateTaskStatus(data.taskId, data.status, data.error, data.cost);
				break;

			case 'taskRetry':
				showTaskRetry(data.taskId, data.taskName, data.attempt, data.maxAttempts, data.platform);
				break;

			case 'planExecutionStarted':
				showPlanExecuting(data.planId);
				break;

			case 'planExecutionComplete':
				showPlanComplete(data.planId, data.status, data.tasks, data.actualCost);
				break;

			case 'planCompleted':
				showPlanComplete(data.planId, data.status, null, data.actualCost);
				break;
		}
	});

	// Initialize
	updateModeUI();
	updateStatus(!!initial.connected);
	updateAuthStatus(!!initial.auth.github, !!initial.auth.vercel);

	if (initial.sessions && initial.activeSessionId) {
		renderSessions(initial.sessions, initial.activeSessionId);
		loadSessionMessages(initial.activeSessionId, initial.messages || []);
	}

	vscode.postMessage({ type: 'checkBackend' });
	vscode.postMessage({ type: 'checkAuthStatus' });
	vscode.postMessage({ type: 'chatWebviewReady' });
}());
