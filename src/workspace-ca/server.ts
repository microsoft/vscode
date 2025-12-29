/**
 * Logos Workspace Cognitive Architect Server
 * Per-workspace AI assistant for architecture and documentation
 */

import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8083;

// Middleware
app.use(cors());
app.use(express.json());

// Environment
const D3N_ENDPOINT = process.env.D3N_ENDPOINT || 'http://d3n-gateway:9090';
const MAX_INSTANCES = parseInt(process.env.CA_MAX_INSTANCES || '100');
const IDLE_TIMEOUT = parseInt(process.env.CA_IDLE_TIMEOUT || '3600');

// Active workspace instances
const workspaceInstances = new Map<string, {
  lastActivity: number;
  conventions: any;
  suggestions: any[];
}>();

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'logos-ca',
    activeInstances: workspaceInstances.size,
    maxInstances: MAX_INSTANCES,
    timestamp: new Date().toISOString(),
  });
});

// Ready check
app.get('/ready', (_req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

// Initialize workspace CA instance
app.post('/api/workspaces/:id/init', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { projectPath, files } = req.body;

  if (workspaceInstances.size >= MAX_INSTANCES) {
    // Evict oldest inactive instance
    let oldest: string | null = null;
    let oldestTime = Date.now();
    
    for (const [wsId, instance] of workspaceInstances) {
      if (instance.lastActivity < oldestTime) {
        oldestTime = instance.lastActivity;
        oldest = wsId;
      }
    }
    
    if (oldest) {
      workspaceInstances.delete(oldest);
    }
  }

  // Analyze project structure
  try {
    const response = await fetch(`${D3N_ENDPOINT}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'workspace-ca',
        action: 'analyze',
        context: { projectPath, files: files?.slice(0, 100) },
      }),
    });

    const analysis = await response.json();

    workspaceInstances.set(id, {
      lastActivity: Date.now(),
      conventions: analysis.conventions || {},
      suggestions: analysis.suggestions || [],
    });

    res.json({
      status: 'initialized',
      workspaceId: id,
      conventions: analysis.conventions,
      suggestions: analysis.suggestions,
    });
  } catch (error) {
    console.error('CA initialization failed:', error);
    
    // Initialize with defaults
    workspaceInstances.set(id, {
      lastActivity: Date.now(),
      conventions: {},
      suggestions: [],
    });

    res.json({
      status: 'initialized',
      workspaceId: id,
      conventions: {},
      suggestions: [],
    });
  }
});

// Get suggestions for workspace
app.get('/api/workspaces/:id/suggestions', (req: Request, res: Response) => {
  const { id } = req.params;
  const instance = workspaceInstances.get(id);

  if (!instance) {
    return res.status(404).json({ error: 'Workspace not initialized' });
  }

  instance.lastActivity = Date.now();
  res.json({ suggestions: instance.suggestions });
});

// Analyze file for suggestions
app.post('/api/workspaces/:id/analyze-file', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath, content, language } = req.body;

  const instance = workspaceInstances.get(id);
  if (!instance) {
    return res.status(404).json({ error: 'Workspace not initialized' });
  }

  instance.lastActivity = Date.now();

  try {
    const response = await fetch(`${D3N_ENDPOINT}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'workspace-ca',
        action: 'analyze-file',
        context: {
          filePath,
          content,
          language,
          conventions: instance.conventions,
        },
      }),
    });

    const analysis = await response.json();

    res.json({
      suggestions: analysis.suggestions || [],
      diagnostics: analysis.diagnostics || [],
      refactorings: analysis.refactorings || [],
    });
  } catch (error) {
    console.error('File analysis failed:', error);
    res.json({ suggestions: [], diagnostics: [], refactorings: [] });
  }
});

// Generate documentation
app.post('/api/workspaces/:id/generate-docs', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { filePath, content, docType } = req.body;

  const instance = workspaceInstances.get(id);
  if (!instance) {
    return res.status(404).json({ error: 'Workspace not initialized' });
  }

  instance.lastActivity = Date.now();

  try {
    const response = await fetch(`${D3N_ENDPOINT}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'workspace-ca',
        action: 'generate-docs',
        context: {
          filePath,
          content,
          docType: docType || 'jsdoc',
          conventions: instance.conventions,
        },
      }),
    });

    const result = await response.json();
    res.json({ documentation: result.documentation || '' });
  } catch (error) {
    console.error('Doc generation failed:', error);
    res.json({ documentation: '' });
  }
});

// Generate architecture diagram
app.post('/api/workspaces/:id/diagram', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { files, format } = req.body;

  const instance = workspaceInstances.get(id);
  if (!instance) {
    return res.status(404).json({ error: 'Workspace not initialized' });
  }

  instance.lastActivity = Date.now();

  try {
    const response = await fetch(`${D3N_ENDPOINT}/api/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'workspace-ca',
        action: 'generate-diagram',
        context: {
          files,
          format: format || 'mermaid',
        },
      }),
    });

    const result = await response.json();
    res.json({ diagram: result.diagram || '' });
  } catch (error) {
    console.error('Diagram generation failed:', error);
    res.json({ diagram: '' });
  }
});

// Cleanup idle instances periodically
setInterval(() => {
  const now = Date.now();
  const timeout = IDLE_TIMEOUT * 1000;
  
  for (const [id, instance] of workspaceInstances) {
    if (now - instance.lastActivity > timeout) {
      console.log(`Evicting idle workspace: ${id}`);
      workspaceInstances.delete(id);
    }
  }
}, 60000); // Check every minute

// Start server
app.listen(PORT, () => {
  console.log(`Logos Cognitive Architect Server running on port ${PORT}`);
  console.log(`D3N Endpoint: ${D3N_ENDPOINT}`);
  console.log(`Max Instances: ${MAX_INSTANCES}`);
  console.log(`Idle Timeout: ${IDLE_TIMEOUT}s`);
});

