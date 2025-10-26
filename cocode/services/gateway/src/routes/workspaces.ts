import { Router } from 'express';
import { AuthRequest } from '../middleware/requireAuth';

export const workspacesRouter = Router();

// Get current user's workspace
workspacesRouter.get('/me', (req, res) => {
	const authReq = req as AuthRequest;

	if (!authReq.user) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	res.json({
		path: authReq.user.workspacePath,
		user: {
			id: authReq.user.id,
			name: authReq.user.name,
			email: authReq.user.email,
			avatar: authReq.user.avatar
		}
	});
});
