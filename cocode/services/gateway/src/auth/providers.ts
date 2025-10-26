import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

export interface User {
	id: string;
	email: string;
	name: string;
	avatar?: string;
	provider: 'github' | 'google';
}

export function setupPassport() {
	// Serialize user to session
	passport.serializeUser((user: any, done) => {
		done(null, user);
	});

	// Deserialize user from session
	passport.deserializeUser((user: any, done) => {
		done(null, user);
	});

	// GitHub OAuth Strategy
	if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
		passport.use(new GitHubStrategy({
			clientID: process.env.GITHUB_ID,
			clientSecret: process.env.GITHUB_SECRET,
			callbackURL: `${process.env.CALLBACK_BASE_URL || 'http://localhost:8080'}/auth/callback/github`,
			scope: ['user:email']
		}, (accessToken: string, refreshToken: string, profile: any, done: any) => {
			const user: User = {
				id: `github_${profile.id}`,
				email: profile.emails?.[0]?.value || `${profile.username}@github.com`,
				name: profile.displayName || profile.username,
				avatar: profile.photos?.[0]?.value,
				provider: 'github'
			};
			return done(null, user);
		}));
	}

	// Google OAuth Strategy
	if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
		passport.use(new GoogleStrategy({
			clientID: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			callbackURL: `${process.env.CALLBACK_BASE_URL || 'http://localhost:8080'}/auth/callback/google`,
			scope: ['profile', 'email']
		}, (accessToken: string, refreshToken: string, profile: any, done: any) => {
			const user: User = {
				id: `google_${profile.id}`,
				email: profile.emails?.[0]?.value || '',
				name: profile.displayName,
				avatar: profile.photos?.[0]?.value,
				provider: 'google'
			};
			return done(null, user);
		}));
	}
}
