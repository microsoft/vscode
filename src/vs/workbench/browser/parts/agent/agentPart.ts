import { Part } from '../../part.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { Parts, IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IAgentService } from '../../../../platform/agent/common/agent.js';

export class AgentManagerPart extends Part {

	static readonly ID = Parts.AGENT_PART;

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	private container: HTMLElement | undefined;
	private statusElement: HTMLElement | undefined;
	private outputElement: HTMLElement | undefined;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IAgentService private readonly agentService: IAgentService
	) {
		super(AgentManagerPart.ID, { hasTitle: true }, themeService, storageService, layoutService);
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.container = document.createElement('div');
		this.container.classList.add('agent-manager-part');
		this.container.style.height = '100%';
		this.container.style.width = '100%';
		this.container.style.display = 'flex';
		this.container.style.flexDirection = 'column';
		this.container.style.backgroundColor = 'var(--vscode-editor-background)';

		// Header
		const header = document.createElement('div');
		header.style.padding = '10px';
		header.style.fontWeight = 'bold';
		header.style.borderBottom = '1px solid var(--vscode-sideBar-border)';
		header.innerText = 'AGENT DECK (PROJECT IRWIN)';
		this.container.appendChild(header);

		// Status
		this.statusElement = document.createElement('div');
		this.statusElement.style.padding = '10px';
		this.statusElement.innerText = this.agentService.connected ? 'Status: Connected' : 'Status: Disconnected';
		this.statusElement.style.color = this.agentService.connected ? 'green' : 'red';
		this.container.appendChild(this.statusElement);

		// Controls
		const controls = document.createElement('div');
		controls.style.padding = '10px';

		const helloButton = document.createElement('button');
		helloButton.innerText = 'Send Hello';
		helloButton.onclick = () => this.sendHello();
		controls.appendChild(helloButton);

		this.container.appendChild(controls);

		// Output
		this.outputElement = document.createElement('pre');
		this.outputElement.style.padding = '10px';
		this.outputElement.style.flex = '1';
		this.outputElement.style.overflow = 'auto';
		this.outputElement.innerText = 'Waiting for interaction...';
		this.container.appendChild(this.outputElement);

		parent.appendChild(this.container);

		this._register(this.agentService.onDidChangeConnectionState(connected => {
			if (this.statusElement) {
				this.statusElement.innerText = connected ? 'Status: Connected' : 'Status: Disconnected';
				this.statusElement.style.color = connected ? 'green' : 'red';
			}
		}));

		return this.container;
	}

	private async sendHello() {
		if (this.outputElement) {
			this.outputElement.innerText += '\nSending "Hello"...';
		}
		await this.agentService.sendMessage('hello', { text: 'Hello from UI' });
		if (this.outputElement) {
			this.outputElement.innerText += '\nSent.';
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
	}

	toJSON(): object {
		return {
			type: Parts.AGENT_PART
		};
	}
}
