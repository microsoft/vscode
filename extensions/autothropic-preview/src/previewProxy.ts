import * as http from 'http';
import * as net from 'net';
import type { Duplex } from 'stream';

/**
 * Bridge script injected into HTML responses from the dev server.
 * Communicates scroll direction, page meta, and bottom-nav detection
 * back to the parent webview via postMessage.
 */
const BRIDGE_SCRIPT = `<style data-autothropic-bridge-css>
/* Hide native scrollbar — replaced by custom iOS-style indicator */
::-webkit-scrollbar{display:none!important;width:0!important;height:0!important;}
html,body,*{scrollbar-width:none!important;}
</style><script data-autothropic-bridge>
(function(){
if(window.__autothropicBridge)return;
window.__autothropicBridge=true;

/* ── iOS-style scroll indicator — thin bar, appears on scroll, fades after idle ── */
var scrollInd=document.createElement('div');
scrollInd.setAttribute('data-autothropic-scrollbar','');
scrollInd.style.cssText='position:fixed;right:2px;top:0;width:4px;border-radius:2px;background:rgba(128,128,128,0.45);opacity:0;transition:opacity 0.3s ease;z-index:2147483647;pointer-events:none;';
document.documentElement.appendChild(scrollInd);
var indTimer=null;
function updateScrollInd(){
  var docH=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
  var viewH=window.innerHeight;
  if(docH<=viewH){scrollInd.style.opacity='0';return;}
  var scrollTop=window.scrollY||document.documentElement.scrollTop||0;
  var trackH=viewH-8;
  var thumbH=Math.max(30,(viewH/docH)*trackH);
  var thumbTop=4+(scrollTop/(docH-viewH))*(trackH-thumbH);
  scrollInd.style.height=thumbH+'px';
  scrollInd.style.top=thumbTop+'px';
  scrollInd.style.opacity='1';
  if(indTimer)clearTimeout(indTimer);
  indTimer=setTimeout(function(){scrollInd.style.opacity='0';},1500);
}

/* ── Scroll watcher — exact copy from original PreviewComposite.tsx ── */
var lastY=window.scrollY||0,lastDir='',accumulated=0;
function checkScroll(){
  var y=window.scrollY||document.documentElement.scrollTop||document.body.scrollTop||0;
  var diff=y-lastY;lastY=y;
  updateScrollInd();
  if(y<=5){if(lastDir!=='up'){lastDir='up';accumulated=0;window.parent.postMessage({type:'__bridge_scroll',dir:'up'},'*');}return;}
  if((diff>0&&accumulated<0)||(diff<0&&accumulated>0))accumulated=0;
  accumulated+=diff;
  var dir='';
  if(accumulated>8)dir='down';
  else if(accumulated<-8)dir='up';
  if(dir&&dir!==lastDir){lastDir=dir;accumulated=0;window.parent.postMessage({type:'__bridge_scroll',dir:dir},'*');}
}
window.addEventListener('scroll',checkScroll,{passive:true});
document.addEventListener('scroll',checkScroll,{passive:true});

/* ── Page meta extraction ── */
function extractMeta(){
  var tc='';
  var m=document.querySelector('meta[name="theme-color"]');
  if(m){var c=m.getAttribute('content');if(c)tc=c.trim();}
  if(!tc){var bg=getComputedStyle(document.documentElement).backgroundColor;
    if(bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')tc=bg;
    else{bg=getComputedStyle(document.body).backgroundColor;
      if(bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')tc=bg;
      else tc='#ffffff';}}
  var title=document.title||'';
  var favicon='';
  var il=document.querySelector('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');
  if(il)favicon=il.href||'';
  if(!favicon)favicon=location.origin+'/favicon.ico';
  window.parent.postMessage({type:'__bridge_meta',bgColor:tc,title:title,favicon:favicon},'*');
}
setTimeout(extractMeta,300);

/* ── Bottom nav detection — exact criteria from original PreviewComposite.tsx ── */
var lastNav=null;
function detectNav(){
  var found=false;
  var vh=window.innerHeight,vw=window.innerWidth;
  var all=document.querySelectorAll('*');
  for(var i=0;i<all.length;i++){
    var el=all[i];
    if(el.hasAttribute('data-autothropic-scrollbar'))continue;
    var s;try{s=getComputedStyle(el);}catch(e){continue;}
    if(s.position!=='fixed'&&s.position!=='sticky')continue;
    if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')continue;
    var r=el.getBoundingClientRect();
    /* Original criteria: touching bottom, lower 40%, wider than 50%, 30-120px tall */
    if(r.bottom>=vh-10&&r.top>vh*0.6&&r.width>vw*0.5&&r.height>30&&r.height<120){
      found=true;break;
    }
  }
  if(found!==lastNav){lastNav=found;window.parent.postMessage({type:'__bridge_bottomnav',detected:found},'*');}
}
setTimeout(detectNav,800);
setInterval(detectNav,2000);
var navTimer=null;
var obs=new MutationObserver(function(){if(navTimer)clearTimeout(navTimer);navTimer=setTimeout(detectNav,300);});
if(document.body)obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});

/* ── Navigation commands from parent (back/forward) ── */
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='__bridge_command'){
    if(e.data.cmd==='back')history.back();
    else if(e.data.cmd==='forward')history.forward();
  }
});

/* ── SPA navigation detection (pushState/replaceState/popstate) ── */
var origPush=history.pushState;
var origReplace=history.replaceState;
history.pushState=function(){origPush.apply(this,arguments);notifyNav();};
history.replaceState=function(){origReplace.apply(this,arguments);notifyNav();};
window.addEventListener('popstate',function(){notifyNav();});
function notifyNav(){
  setTimeout(function(){
    window.parent.postMessage({type:'__bridge_nav',url:location.href,title:document.title},'*');
  },50);
}
})();
</script>`;

/**
 * A reverse-proxy that forwards requests to a target dev-server
 * while stripping CSP/X-Frame-Options headers and injecting a
 * bridge script into HTML responses for scroll/meta detection.
 */
export class PreviewProxy {
	private server: http.Server | undefined;
	private port = 0;
	private targetOrigin = '';

	private static readonly REQUEST_TIMEOUT = 10_000;
	private static readonly RETRY_ATTEMPTS = 3;
	private static readonly RETRY_DELAY_MS = 500;

	async start(): Promise<number> {
		if (this.server) { return this.port; }

		this.server = http.createServer((req, res) => this.handleRequest(req, res));

		// WebSocket upgrade support — essential for HMR
		this.server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));

		return new Promise<number>((resolve, reject) => {
			this.server!.listen(0, '127.0.0.1', () => {
				const addr = this.server!.address();
				if (addr && typeof addr !== 'string') {
					this.port = addr.port;
					resolve(this.port);
				} else {
					reject(new Error('Failed to bind proxy'));
				}
			});
			this.server!.on('error', reject);
		});
	}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		if (!this.targetOrigin) {
			this.sendErrorPage(res, 'No target configured', 'Set a URL in the preview address bar.');
			return;
		}

		let targetUrl: URL;
		try {
			targetUrl = new URL(req.url || '/', this.targetOrigin);
		} catch {
			res.writeHead(400);
			res.end('Bad request');
			return;
		}

		this.proxyWithRetry(req, res, targetUrl, 0);
	}

	private proxyWithRetry(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		targetUrl: URL,
		attempt: number,
	): void {
		// Force identity encoding so we always receive uncompressed HTML.
		// Without this, gzip/brotli responses from the dev server would break
		// our bridge script injection (we do string manipulation on the body).
		const fwdHeaders = { ...req.headers, host: targetUrl.host };
		fwdHeaders['accept-encoding'] = 'identity';

		const proxyReq = http.request(
			{
				hostname: targetUrl.hostname,
				port: targetUrl.port,
				path: targetUrl.pathname + targetUrl.search,
				method: req.method,
				headers: fwdHeaders,
				timeout: PreviewProxy.REQUEST_TIMEOUT,
			},
			(proxyRes) => {
				const contentType = proxyRes.headers['content-type'] || '';
				const isHtml = contentType.includes('text/html');

				const headers: http.OutgoingHttpHeaders = {};
				for (const [key, value] of Object.entries(proxyRes.headers)) {
					const lower = key.toLowerCase();
					// Strip headers that block framing
					if (lower === 'content-security-policy' ||
						lower === 'content-security-policy-report-only' ||
						lower === 'x-frame-options') {
						continue;
					}
					// Remove content-length and content-encoding for HTML
					// (we modify the body and force identity encoding)
					if (isHtml && (lower === 'content-length' || lower === 'content-encoding')) {
						continue;
					}
					headers[key] = value;
				}

				if (!isHtml) {
					// Non-HTML: stream through directly
					res.writeHead(proxyRes.statusCode || 200, headers);
					proxyRes.pipe(res);
					return;
				}

				// HTML: buffer body, inject bridge script before </body> or at end
				const chunks: Buffer[] = [];
				proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
				proxyRes.on('end', () => {
					let body = Buffer.concat(chunks).toString('utf-8');
					const insertAt = body.lastIndexOf('</body>');
					if (insertAt !== -1) {
						body = body.slice(0, insertAt) + BRIDGE_SCRIPT + body.slice(insertAt);
					} else {
						body += BRIDGE_SCRIPT;
					}
					res.writeHead(proxyRes.statusCode || 200, headers);
					res.end(body);
				});
			},
		);

		proxyReq.on('timeout', () => {
			proxyReq.destroy();
		});

		proxyReq.on('error', (err: NodeJS.ErrnoException) => {
			if (res.headersSent) { return; }

			const retryable = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'EPIPE';
			if (retryable && attempt < PreviewProxy.RETRY_ATTEMPTS) {
				setTimeout(() => {
					this.proxyWithRetry(req, res, targetUrl, attempt + 1);
				}, PreviewProxy.RETRY_DELAY_MS * (attempt + 1));
				return;
			}

			this.sendErrorPage(
				res,
				'Dev server unreachable',
				`Could not connect to <b>${this.targetOrigin}</b>.<br>` +
				'Make sure your dev server is running.',
			);
		});

		req.pipe(proxyReq);
	}

	private handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
		if (!this.targetOrigin) {
			socket.destroy();
			return;
		}

		let targetUrl: URL;
		try {
			targetUrl = new URL(req.url || '/', this.targetOrigin);
		} catch {
			socket.destroy();
			return;
		}

		const port = parseInt(targetUrl.port, 10) || 80;
		const upstreamSocket = net.connect(port, targetUrl.hostname, () => {
			const reqLine = `${req.method} ${targetUrl.pathname + targetUrl.search} HTTP/1.1\r\n`;
			const headerLines: string[] = [];
			for (let i = 0; i < req.rawHeaders.length; i += 2) {
				const key = req.rawHeaders[i];
				const value = req.rawHeaders[i + 1];
				if (key.toLowerCase() === 'host') {
					headerLines.push(`Host: ${targetUrl.host}`);
				} else {
					headerLines.push(`${key}: ${value}`);
				}
			}
			upstreamSocket.write(reqLine + headerLines.join('\r\n') + '\r\n\r\n');
			if (head.length > 0) { upstreamSocket.write(head); }
			upstreamSocket.pipe(socket);
			socket.pipe(upstreamSocket);
		});

		upstreamSocket.on('error', () => { socket.destroy(); });
		socket.on('error', () => { upstreamSocket.destroy(); });
	}

	private sendErrorPage(res: http.ServerResponse, title: string, detail: string): void {
		const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111110;color:#a8a69e;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
.card{max-width:360px;padding:32px}
h2{color:#d97757;font-size:16px;margin-bottom:8px}
p{font-size:13px;line-height:1.6;margin-bottom:16px}
.retry{font-size:11px;color:#7a7870}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #35352f;border-top:2px solid #d97757;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="card">
<h2>${title}</h2>
<p>${detail}</p>
<div class="retry"><span class="spinner"></span>Retrying automatically\u2026</div>
</div>
<script>setTimeout(()=>location.reload(),3000)</script>
</body></html>`;
		res.writeHead(502, {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
		});
		res.end(html);
	}

	setTarget(url: string): void {
		try {
			const parsed = new URL(url);
			this.targetOrigin = parsed.origin;
		} catch {
			this.targetOrigin = url;
		}
	}

	getLocalUrl(): string {
		return `http://127.0.0.1:${this.port}`;
	}

	getPort(): number {
		return this.port;
	}

	dispose(): void {
		this.server?.close();
		this.server = undefined;
	}
}
