import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const mediaDir = path.join(rootDir, 'extensions', 'scratchpad', 'media');
const PORT = 54321;

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  let file = urlPath === '/' ? 'scratchpad.html' : urlPath.replace(/^\//, '');
  const filePath = path.join(mediaDir, file);

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    const mime = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : ext === '.png' ? 'image/png' : 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    if (ext === '.html') {
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace('{{CSS_URI}}', './scratchpad.css').replace('{{JS_URI}}', './scratchpad.js');
      res.end(content);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('⚡ JS Studio (RunJS OSS) inicializado com sucesso!');
  console.log(`Servidor rodando em: http://localhost:${PORT}/`);
  console.log('Abrindo aplicativo em janela desktop...');

  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  let browserPath = edgePaths.find(p => fs.existsSync(p));
  const appUrl = `http://localhost:${PORT}/`;

  if (browserPath) {
    const child = spawn(browserPath, [`--app=${appUrl}`, '--window-size=1300,850'], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } else {
    // Fallback: open default browser
    spawn('cmd', ['/c', 'start', appUrl], { detached: true, stdio: 'ignore' }).unref();
  }
});
