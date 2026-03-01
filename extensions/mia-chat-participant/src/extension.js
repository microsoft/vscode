// Chat Participant extension — VS Code Chat API three-universe participant
// Registers @mia in VS Code's native chat alongside Copilot.
const vscode = require('vscode');

let miaApi = null;

function activate(context) {
	const coreExt = vscode.extensions.getExtension('mia.three-universe');
	if (coreExt) {
		miaApi = coreExt.exports;
	}

	// Register the chat participant
	const participant = vscode.chat.createChatParticipant('mia', handleChatRequest);
	participant.iconPath = vscode.Uri.joinPath(context.extensionUri, '..', 'mia-three-universe', 'icons', 'three-universe.svg');

	// Register slash commands
	participant.followupProvider = {
		provideFollowups(result, context, token) {
			const followups = [];
			if (result.metadata?.hasAnalysis) {
				followups.push({ message: '@mia /chart Create a chart from this analysis' });
				followups.push({ message: '@mia /beat Log a beat from this insight' });
			}
			followups.push({ message: '@mia /analyze Analyze the current file' });
			return followups;
		},
	};

	context.subscriptions.push(participant);
}

function deactivate() {}

/**
 * @param {import('vscode').ChatRequest} request
 * @param {import('vscode').ChatContext} context
 * @param {import('vscode').ChatResponseStream} stream
 * @param {import('vscode').CancellationToken} token
 */
async function handleChatRequest(request, context, stream, token) {
	const command = request.command;
	const prompt = request.prompt;

	// Determine universe from command or prompt
	let universe = vscode.workspace.getConfiguration('mia').get('primaryUniverse', 'balanced');

	switch (command) {
		case 'analyze':
			return handleAnalyze(stream, token);
		case 'chart':
			return handleChart(stream, prompt, token);
		case 'beat':
			return handleBeat(stream, prompt, token);
		case 'explain':
			universe = 'balanced';
			break;
		case 'review':
			universe = 'balanced';
			break;
	}

	// Parse @mentions in prompt
	if (prompt.includes('@engineer')) universe = 'engineer';
	else if (prompt.includes('@ceremony')) universe = 'ceremony';
	else if (prompt.includes('@story')) universe = 'story';

	// Gather context
	const editor = vscode.window.activeTextEditor;
	const chatContext = {
		activeFile: editor?.document.uri.toString(),
		selection: editor?.selection && !editor.selection.isEmpty
			? editor.document.getText(editor.selection)
			: undefined,
	};

	if (miaApi && miaApi.isConnected()) {
		try {
			const client = miaApi.getHttpClient();
			stream.markdown(`**Three-Universe Response** (${universe})\n\n`);

			for await (const chunk of client.sendChatMessage({
				message: prompt,
				universe,
				context: chatContext,
			})) {
				if (token.isCancellationRequested) break;
				if (chunk.done) break;
				if (chunk.content) stream.markdown(chunk.content);
			}

			return { metadata: { hasAnalysis: true } };
		} catch (err) {
			stream.markdown(`⚠️ Error communicating with mia-code-server: ${err.message}\n\n`);
			stream.markdown(`Configure \`mia.serverUrl\` in settings to connect.\n`);
		}
	} else {
		stream.markdown(`## 🔌 Not Connected\n\n`);
		stream.markdown(`mia-code-server is not configured. Set \`mia.serverUrl\` to enable three-universe intelligence.\n\n`);
		stream.markdown(`**Your question**: ${prompt}\n\n`);
		stream.markdown(`### What @mia can do when connected:\n`);
		stream.markdown(`- **\`/analyze\`** — Three-universe analysis of current file\n`);
		stream.markdown(`- **\`/chart\`** — Create or review STC charts\n`);
		stream.markdown(`- **\`/beat\`** — Log narrative beats\n`);
		stream.markdown(`- **\`/explain\`** — Explain code through three lenses\n`);
		stream.markdown(`- **\`/review\`** — Review changes through three lenses\n`);
	}

	return { metadata: {} };
}

async function handleAnalyze(stream, token) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		stream.markdown('No active file to analyze. Open a file first.\n');
		return { metadata: {} };
	}

	stream.markdown(`Analyzing **${editor.document.fileName}** through three universes...\n\n`);

	if (miaApi && miaApi.isConnected()) {
		try {
			const result = await miaApi.analyzeFile(editor.document.uri.toString());
			if (result) {
				stream.markdown(`## 🔧 Engineer\n${result.engineer.summary}\n\n`);
				stream.markdown(`## 🌿 Ceremony\n${result.ceremony.summary}\n\n`);
				stream.markdown(`## 📖 Story\n${result.story.summary}\n\n`);
				stream.markdown(`**Overall significance**: ${'●'.repeat(result.overallSignificance)}${'○'.repeat(5 - result.overallSignificance)}\n`);
				return { metadata: { hasAnalysis: true } };
			}
		} catch (err) {
			stream.markdown(`Analysis error: ${err.message}\n`);
		}
	} else {
		stream.markdown(`Connect to mia-code-server to enable analysis.\n`);
	}

	return { metadata: {} };
}

async function handleChart(stream, prompt, token) {
	stream.markdown(`## 📐 STC Chart\n\n`);
	stream.markdown(`To create a chart, use the command palette: **Mia: Create STC Chart**\n\n`);
	if (prompt) {
		stream.markdown(`Your intent: *${prompt}*\n`);
	}
	return { metadata: {} };
}

async function handleBeat(stream, prompt, token) {
	stream.markdown(`## 📌 Story Beat\n\n`);
	if (prompt) {
		stream.markdown(`Beat: *${prompt}*\n\n`);
		vscode.commands.executeCommand('mia.createBeat');
	} else {
		stream.markdown(`Use **Mia: Create Story Beat** to log a beat.\n`);
	}
	return { metadata: {} };
}

module.exports = { activate, deactivate };
