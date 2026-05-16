import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const projectsRouter = Router();

interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
  created: number;
}

// In-memory store for the REST API layer (SQLite handles persistence in Electron)
const projects: Map<string, Project> = new Map();

projectsRouter.get('/', (_req: Request, res: Response) => {
  const sorted = Array.from(projects.values()).sort(
    (a, b) => b.lastOpened - a.lastOpened
  );
  res.json(sorted);
});

projectsRouter.get('/recent', (_req: Request, res: Response) => {
  const sorted = Array.from(projects.values())
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .slice(0, 10);
  res.json(sorted);
});

projectsRouter.post('/', (req: Request, res: Response) => {
  const { name, path } = req.body;

  if (!name || !path) {
    res.status(400).json({ error: 'Name and path are required' });
    return;
  }

  // Check for existing project with same path
  for (const project of projects.values()) {
    if (project.path === path) {
      project.lastOpened = Date.now();
      res.json(project);
      return;
    }
  }

  const project: Project = {
    id: uuidv4(),
    name,
    path,
    lastOpened: Date.now(),
    created: Date.now(),
  };

  projects.set(project.id, project);
  res.status(201).json(project);
});

projectsRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (projects.has(id)) {
    projects.delete(id);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});
