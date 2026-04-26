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
	const modeHint = document.getElementById('modeHint');
	const statusDot = document.getElementById('statusDot');
	const statusText = document.getElementById('statusText');
	const githubBadge = document.getElementById('githubBadge');
	const vercelBadge = document.getElementById('vercelBadge');
	const welcome = document.getElementById('welcome');

	let lastLoadingMessage = null;
	let currentPlan = null;
	let planCardElement = null;
	let currentMode = 'chat';

	const modeHints = {
		'chat': 'Chat mode: Have a conversation, ask questions, get explanations',
		'plan': 'Plan mode: Generate an execution plan with cost estimation before executing',
		'execute': 'Execute mode: Directly execute tasks with real-time progress',
		'agent': 'Agent mode: Autonomous AI agent that plans and executes multi-step tasks'
	};

	const buttonLabels = {
		'chat': 'Send',
		'plan': 'Generate Plan',
		'execute': 'Execute',
		'agent': 'Run Agent'
	};

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
		currentMode = modeSelect.value;
		sendBtnText.textContent = buttonLabels[currentMode] || 'Send';
		
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
					<span class="nx-resultIcon">${isSuccess ? '✓' : '!'}</span>
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

	modeSelect.onchange = updateModeUI;

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

			case 'backendStatus':
				updateStatus(data.connected);
				break;

			case 'authStatus':
				updateAuthStatus(data.github, data.vercel);
				break;

			case 'showPlanApproval':
				createPlanApprovalCard(data.plan);
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

	vscode.postMessage({ type: 'checkBackend' });
	vscode.postMessage({ type: 'checkAuthStatus' });
}());
