import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { buildCpp, runCpp } from './jobs/cpp';
import { buildC, runC } from './jobs/c';
import { runPython } from './jobs/python';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
	res.json({ status: 'ok', service: 'cocode-builder' });
});

// Build/Run endpoint
app.post('/jobs/run', async (req, res) => {
	const { lang, workspace, target = 'debug', cmd } = req.body;

	if (!lang || !workspace) {
		return res.status(400).json({ error: 'Missing lang or workspace' });
	}

	console.log(`[Builder] Running job: lang=${lang}, workspace=${workspace}, target=${target}`);

	try {
		let result;

		switch (lang) {
			case 'cpp':
				await buildCpp(workspace, target);
				result = await runCpp(workspace, cmd);
				break;
			case 'c':
				await buildC(workspace, target);
				result = await runC(workspace, cmd);
				break;
			case 'python':
				result = await runPython(workspace, cmd);
				break;
			default:
				return res.status(400).json({ error: `Unsupported language: ${lang}` });
		}

		res.json(result);
	} catch (error: any) {
		console.error('[Builder] Job failed:', error);
		res.status(500).json({
			error: error.message,
			logs: error.logs || '',
			exitCode: error.exitCode || 1
		});
	}
});

const port = process.env.PORT || 7070;
app.listen(port, () => {
	console.log(`[Builder] Running on port ${port}`);
});
