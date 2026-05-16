import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const authRouter = Router();

// Simple local auth for MVP - expandable to full auth later
interface LocalUser {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: number;
}

const localUser: LocalUser = {
  id: uuidv4(),
  email: 'local@aistudio.dev',
  name: 'Local Developer',
  plan: 'free',
  createdAt: Date.now(),
};

authRouter.get('/me', (_req: Request, res: Response) => {
  res.json({ user: localUser });
});

authRouter.post('/login', (req: Request, res: Response) => {
  const { email, name } = req.body;
  const user: LocalUser = {
    ...localUser,
    email: email || localUser.email,
    name: name || localUser.name,
  };
  res.json({ user, token: `local-${uuidv4()}` });
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true });
});

authRouter.get('/subscription', (_req: Request, res: Response) => {
  res.json({
    plan: localUser.plan,
    features: {
      aiRequests: localUser.plan === 'free' ? 50 : -1,
      maxProjects: localUser.plan === 'free' ? 5 : -1,
      codeCompletion: true,
      aiChat: true,
      codeExplanation: true,
      codeGeneration: localUser.plan !== 'free',
    },
    billing: {
      status: 'active',
      nextBillingDate: null,
    },
  });
});
