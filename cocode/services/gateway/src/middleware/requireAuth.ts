import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
	user?: {
		id: string;
		email: string;
		name: string;
		avatar?: string;
		workspacePath: string;
	};
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
	const authReq = req as AuthRequest;

	console.log('[requireAuth] Checking authentication...');
	console.log('[requireAuth] isAuthenticated:', req.isAuthenticated ? req.isAuthenticated() : 'function not found');
	console.log('[requireAuth] session:', req.session);
	console.log('[requireAuth] user:', req.user);

	// Check if user is authenticated
	if (!req.isAuthenticated || !req.isAuthenticated()) {
		console.log('[requireAuth] Not authenticated - returning 401');
		return res.status(401).json({ error: 'Unauthorized' });
	}

	const user = req.user as any;

	if (!user || !user.id) {
		console.log('[requireAuth] No user or user.id - returning 401');
		return res.status(401).json({ error: 'Unauthorized' });
	}

	// Attach workspace path based on user ID
	authReq.user = {
		...user,
		workspacePath: `/workspaces/${user.id}/default`
	};

	console.log('[requireAuth] Authentication successful for user:', user.id);
	next();
}
