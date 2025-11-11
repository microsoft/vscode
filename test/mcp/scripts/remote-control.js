#!/usr/bin/env node
/**
 * 🎮 VS CODE REMOTE CONTROL DASHBOARD
 * Command-line interface to control VS Code through MCP
 * 
 * Usage:
 *   vscode-remote open <file>
 *   vscode-remote chat <message>
 *   vscode-remote terminal <command>
 *   vscode-remote screenshot <output>
 */

const readline = require('readline');
const { spawn } = require('child_process');

class VSCodeRemote {
	constructor() {
		this.mcpServer = null;
		this.requestId = 0;
		this.pendingRequests = new Map();
		
		this.commands = {
			help: this.showHelp.bind(this),
			start: this.startServer.bind(this),
			stop: this.stopServer.bind(this),
			status: this.showStatus.bind(this),
			open: this.openFile.bind(this),
			chat: this.sendChat.bind(this),
			terminal: this.runTerminal.bind(this),
			screenshot: this.takeScreenshot.bind(this),
			tools: this.listTools.bind(this),
			exit: this.exit.bind(this)
		};
	}

	/**
	 * Start the remote control dashboard
	 */
	async start() {
		console.log('🎮 ============================================');
		console.log('   VS CODE REMOTE CONTROL DASHBOARD');
		console.log('   Control VS Code through MCP Protocol');
		console.log('============================================\n');

		// Create readline interface
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: 'vscode> '
		});

		// Setup command handling
		this.rl.on('line', async (line) => {
			await this.handleCommand(line.trim());
			this.rl.prompt();
		});

		this.rl.on('close', () => {
			this.exit();
		});

		// Show help
		this.showHelp();
		
		// Start prompt
		this.rl.prompt();
	}

	/**
	 * Handle user command
	 */
	async handleCommand(line) {
		if (!line) return;

		const [cmd, ...args] = line.split(' ');
		const command = this.commands[cmd];

		if (command) {
			try {
				await command(args);
			} catch (error) {
				console.error(`❌ Error: ${error.message}`);
			}
		} else {
			console.log(`❌ Unknown command: ${cmd}`);
			console.log('💡 Type "help" for available commands');
		}
	}

	/**
	 * Show help information
	 */
	showHelp() {
		console.log('📚 Available Commands:\n');
		console.log('  help                    - Show this help message');
		console.log('  start [web]             - Start MCP server (desktop or web mode)');
		console.log('  stop                    - Stop MCP server');
		console.log('  status                  - Show server status');
		console.log('  open <file>             - Open a file in VS Code');
		console.log('  chat <message>          - Send message to Copilot Chat');
		console.log('  terminal <command>      - Run command in terminal');
		console.log('  screenshot <output>     - Take screenshot');
		console.log('  tools                   - List available MCP tools');
		console.log('  exit                    - Exit dashboard\n');
	}

	/**
	 * Start MCP server
	 */
	async startServer(args) {
		const mode = args[0] === 'web' ? 'web' : 'desktop';
		
		if (this.mcpServer) {
			console.log('⚠️  Server already running. Stop it first.');
			return;
		}

		console.log(`🚀 Starting MCP server in ${mode} mode...`);
		
		const npmArgs = mode === 'web'
			? ['run', 'start-stdio', '--', '--web']
			: ['run', 'start-stdio'];

		this.mcpServer = spawn('npm', npmArgs, {
			cwd: require('path').join(__dirname, '..'),
			stdio: ['pipe', 'pipe', 'pipe']
		});

		this.mcpServer.stdout.on('data', (data) => {
			const message = data.toString().trim();
			if (message.startsWith('{')) {
				// JSON-RPC response
				try {
					const response = JSON.parse(message);
					this.handleResponse(response);
				} catch (e) {
					console.log(`[MCP] ${message}`);
				}
			} else {
				console.log(`[MCP] ${message}`);
			}
		});

		this.mcpServer.stderr.on('data', (data) => {
			console.error(`[MCP ERROR] ${data.toString().trim()}`);
		});

		this.mcpServer.on('close', (code) => {
			console.log(`\n🛑 MCP server stopped (code ${code})`);
			this.mcpServer = null;
		});

		// Initialize connection
		await this.sendRequest('initialize', {
			protocolVersion: '2024-11-05',
			capabilities: {},
			clientInfo: { name: 'vscode-remote', version: '1.0.0' }
		});

		console.log('✅ MCP server started successfully!');
	}

	/**
	 * Stop MCP server
	 */
	async stopServer() {
		if (!this.mcpServer) {
			console.log('⚠️  No server running');
			return;
		}

		console.log('🛑 Stopping MCP server...');
		this.mcpServer.kill();
		this.mcpServer = null;
		console.log('✅ Server stopped');
	}

	/**
	 * Show server status
	 */
	showStatus() {
		if (this.mcpServer) {
			console.log('✅ Status: Server RUNNING');
			console.log(`📊 Pending requests: ${this.pendingRequests.size}`);
		} else {
			console.log('❌ Status: Server STOPPED');
		}
	}

	/**
	 * Open file in VS Code
	 */
	async openFile(args) {
		const filePath = args.join(' ');
		if (!filePath) {
			console.log('❌ Usage: open <file>');
			return;
		}

		console.log(`📂 Opening file: ${filePath}`);
		await this.sendRequest('tools/call', {
			name: 'vscode_automation_editor_open',
			arguments: { path: filePath }
		});
	}

	/**
	 * Send chat message
	 */
	async sendChat(args) {
		const message = args.join(' ');
		if (!message) {
			console.log('❌ Usage: chat <message>');
			return;
		}

		console.log(`💬 Sending to chat: ${message}`);
		await this.sendRequest('tools/call', {
			name: 'vscode_automation_chat_send_message',
			arguments: { message }
		});
	}

	/**
	 * Run terminal command
	 */
	async runTerminal(args) {
		const command = args.join(' ');
		if (!command) {
			console.log('❌ Usage: terminal <command>');
			return;
		}

		console.log(`⚡ Running in terminal: ${command}`);
		await this.sendRequest('tools/call', {
			name: 'vscode_automation_terminal_run',
			arguments: { command }
		});
	}

	/**
	 * Take screenshot
	 */
	async takeScreenshot(args) {
		const output = args[0] || 'screenshot.png';
		
		console.log(`📸 Taking screenshot: ${output}`);
		await this.sendRequest('tools/call', {
			name: 'vscode_automation_screenshot',
			arguments: { output }
		});
	}

	/**
	 * List available tools
	 */
	async listTools() {
		console.log('🔧 Listing available MCP tools...');
		await this.sendRequest('tools/list', {});
	}

	/**
	 * Send JSON-RPC request to MCP server
	 */
	async sendRequest(method, params) {
		if (!this.mcpServer) {
			console.log('❌ Server not running. Use "start" command first.');
			return;
		}

		const id = ++this.requestId;
		const request = {
			jsonrpc: '2.0',
			id,
			method,
			params
		};

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject, method });
			this.mcpServer.stdin.write(JSON.stringify(request) + '\n');
			
			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	/**
	 * Handle JSON-RPC response
	 */
	handleResponse(response) {
		const { id, result, error } = response;
		
		if (!id) return;

		const pending = this.pendingRequests.get(id);
		if (!pending) return;

		this.pendingRequests.delete(id);

		if (error) {
			console.error(`❌ ${pending.method}: ${error.message}`);
			pending.reject(new Error(error.message));
		} else {
			console.log(`✅ ${pending.method}: Success`);
			if (result && typeof result === 'object') {
				console.log(JSON.stringify(result, null, 2));
			}
			pending.resolve(result);
		}
	}

	/**
	 * Exit the dashboard
	 */
	exit() {
		console.log('\n👋 Goodbye!');
		if (this.mcpServer) {
			this.mcpServer.kill();
		}
		if (this.rl) {
			this.rl.close();
		}
		process.exit(0);
	}
}

// Start the remote control dashboard
if (require.main === module) {
	const remote = new VSCodeRemote();
	remote.start().catch(console.error);
}

module.exports = VSCodeRemote;
