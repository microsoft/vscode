import { Router } from 'express';
import passport from 'passport';

export const authRouter = Router();

interface AuthProvider {
	id: string;
	name: string;
	loginUrl: string;
}

// Get available providers
authRouter.get('/providers', (req, res) => {
	const providers: AuthProvider[] = [];

	if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
		providers.push({
			id: 'github',
			name: 'GitHub',
			loginUrl: '/auth/login/github'
		});
	}

	if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
		providers.push({
			id: 'google',
			name: 'Google',
			loginUrl: '/auth/login/google'
		});
	}

	res.json({ providers });
});

// GitHub login
authRouter.get('/login/github', passport.authenticate('github', { scope: ['user:email'] }));

authRouter.get('/callback/github',
	passport.authenticate('github', { failureRedirect: '/auth/failed' }),
	(req, res) => {
		console.log('[Auth] GitHub login successful:', req.user);
		// Ensure session is saved before redirect
		req.session.save((err) => {
			if (err) {
				console.error('[Auth] Session save error:', err);
				return res.status(500).json({ error: 'Session save failed' });
			}
			// Redirect to IDE with examples folder
			res.redirect('/ide/?folder=/workspaces/examples');
		});
	}
);

// Google login
authRouter.get('/login/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

authRouter.get('/callback/google',
	passport.authenticate('google', { failureRedirect: '/auth/failed' }),
	(req, res) => {
		console.log('[Auth] Google login successful:', req.user);
		// Ensure session is saved before redirect
		req.session.save((err) => {
			if (err) {
				console.error('[Auth] Session save error:', err);
				return res.status(500).json({ error: 'Session save failed' });
			}
			res.redirect('/ide');
		});
	}
);

// Logout
authRouter.post('/logout', (req, res) => {
	req.logout((err) => {
		if (err) {
			return res.status(500).json({ error: 'Logout failed' });
		}
		res.json({ success: true });
	});
});

// Auth failed
authRouter.get('/failed', (req, res) => {
	res.status(401).json({ error: 'Authentication failed' });
});

// Current user
authRouter.get('/me', (req, res) => {
	if (!req.isAuthenticated || !req.isAuthenticated()) {
		return res.status(401).json({ error: 'Not authenticated' });
	}
	res.json({ user: req.user });
});
