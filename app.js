// ========================================
// COMPUTE ENGINE API v2.0.0-beta
// REST + GraphQL + WebSocket + Documentation
// ========================================

const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ========================================
// CORE MODULES
// ========================================

class SimulatedRAM {
  constructor(sizeInBytes = 10 * 1024 * 1024) {
    this.memory = new Map();
    this.size = sizeInBytes;
    this.maxAddr = Math.floor(sizeInBytes / 4);
    this.writeCount = 0;
    this.readCount = 0;
  }

  write(addr, value) {
    if (addr < 0 || addr >= this.maxAddr) throw new Error(`Address ${addr} out of bounds`);
    this.memory.set(addr, value);
    this.writeCount++;
    return true;
  }

  read(addr) {
    if (addr < 0 || addr >= this.maxAddr) throw new Error(`Address ${addr} out of bounds`);
    this.readCount++;
    return this.memory.get(addr) || 0;
  }

  clear() {
    this.memory.clear();
    this.writeCount = 0;
    this.readCount = 0;
  }

  getStats() {
    return {
      totalSize: this.size,
      maxAddresses: this.maxAddr,
      usedAddresses: this.memory.size,
      writeOperations: this.writeCount,
      readOperations: this.readCount,
      memoryUsagePercent: ((this.memory.size / this.maxAddr) * 100).toFixed(2)
    };
  }
}

class Worker {
  constructor(id, ram) {
    this.id = id;
    this.ram = ram;
    this.busy = false;
    this.taskCount = 0;
    this.totalExecTime = 0;
    this.errors = 0;
  }

  async executeTask(task, targetAddr, taskId) {
    this.busy = true;
    this.taskCount++;
    const startTime = Date.now();

    try {
      const result = task();
      this.ram.write(targetAddr, result);
      const execTime = Date.now() - startTime;
      this.totalExecTime += execTime;
      this.busy = false;
      
      return { success: true, result, execTime, workerId: this.id };
    } catch (error) {
      this.errors++;
      this.busy = false;
      return { success: false, error: error.message, workerId: this.id };
    }
  }

  isFree() { return !this.busy; }

  getStats() {
    return {
      id: this.id,
      busy: this.busy,
      tasksCompleted: this.taskCount,
      avgExecTime: this.taskCount > 0 ? (this.totalExecTime / this.taskCount).toFixed(2) : 0,
      errors: this.errors
    };
  }
}

class MessageBus {
  constructor() {
    this.listeners = new Map();
    this.messageCount = 0;
  }

  subscribe(channel, callback) {
    if (!this.listeners.has(channel)) this.listeners.set(channel, []);
    this.listeners.get(channel).push(callback);
  }

  publish(channel, data) {
    this.messageCount++;
    const listeners = this.listeners.get(channel) || [];
    listeners.forEach(callback => {
      try { callback(data); } catch (error) {}
    });
  }

  getStats() {
    return {
      totalMessages: this.messageCount,
      channels: Array.from(this.listeners.keys()),
      totalListeners: Array.from(this.listeners.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }
}

class TaskScheduler {
  constructor(ram, messageBus, numWorkers = 8) {
    this.ram = ram;
    this.messageBus = messageBus;
    this.workers = Array.from({ length: numWorkers }, (_, i) => new Worker(i, ram));
    this.taskQueue = [];
    this.completedTasks = 0;
    this.failedTasks = 0;
    this.taskIdCounter = 0;
  }

  getFreeWorker() { return this.workers.find(w => w.isFree()); }

  async scheduleTask(task, targetAddr) {
    const taskId = ++this.taskIdCounter;
    const worker = this.getFreeWorker();
    
    if (!worker) {
      return new Promise(resolve => {
        this.taskQueue.push({ task, targetAddr, taskId, resolve });
      });
    }

    const result = await worker.executeTask(task, targetAddr, taskId);
    
    if (result.success) {
      this.completedTasks++;
      this.messageBus.publish('task.completed', result);
    } else {
      this.failedTasks++;
      this.messageBus.publish('task.failed', result);
    }
    
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift();
      this.scheduleTask(nextTask.task, nextTask.targetAddr).then(nextTask.resolve);
    }
    
    return result;
  }

  addWorkers(count) {
    const startId = this.workers.length;
    for (let i = 0; i < count; i++) {
      this.workers.push(new Worker(startId + i, this.ram));
    }
  }

  getStats() {
    return {
      totalWorkers: this.workers.length,
      freeWorkers: this.workers.filter(w => w.isFree()).length,
      busyWorkers: this.workers.filter(w => !w.isFree()).length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      queuedTasks: this.taskQueue.length,
      workerDetails: this.workers.map(w => w.getStats())
    };
  }
}

class ParallelEngine {
  constructor(config = {}) {
    this.ram = new SimulatedRAM(config.ramSize || 10 * 1024 * 1024);
    this.messageBus = new MessageBus();
    this.scheduler = new TaskScheduler(this.ram, this.messageBus, config.numWorkers || 8);
    this.startTime = Date.now();
  }

  async run(tasks) {
    const startTime = Date.now();
    const promises = tasks.map((task, index) => 
      this.scheduler.scheduleTask(task.fn, task.addr !== undefined ? task.addr : index)
    );
    
    const results = await Promise.all(promises);
    const execTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    return { results, execTime, successCount, totalTasks: tasks.length };
  }

  addWorkers(count) { this.scheduler.addWorkers(count); }
  
  reset() {
    this.ram.clear();
    this.scheduler.completedTasks = 0;
    this.scheduler.failedTasks = 0;
    this.scheduler.taskIdCounter = 0;
  }

  getFullStats() {
    return {
      uptime: Date.now() - this.startTime,
      ram: this.ram.getStats(),
      scheduler: this.scheduler.getStats(),
      messageBus: this.messageBus.getStats()
    };
  }
}

const engine = new ParallelEngine({ numWorkers: 8 });

// ========================================
// TEST SUITES
// ========================================
const TestSuite = {
  simple: () => [
    { fn: () => 10 + 5, addr: 0 },
    { fn: () => 20 * 3, addr: 1 },
    { fn: () => Math.pow(2, 10), addr: 2 },
    { fn: () => 100 - 25, addr: 3 }
  ],
  heavy: () => {
    const fib = (n) => n <= 1 ? n : fib(n - 1) + fib(n - 2);
    return [
      { fn: () => fib(20), addr: 10 },
      { fn: () => Array(15).fill(0).reduce((a, _, i) => a * (i + 1) || 1, 1), addr: 11 },
      { fn: () => Math.sqrt(987654321), addr: 12 },
      { fn: () => Math.PI * Math.E * 1000, addr: 13 }
    ];
  },
  massive: () => Array(100).fill(0).map((_, i) => ({
    fn: () => Math.sin(i) * Math.cos(i) * 1000,
    addr: 100 + i
  }))
};

// ========================================
// REST API
// ========================================
app.post('/api/v1/compute', async (req, res) => {
  try {
    const { tasks } = req.body;
    const parsedTasks = tasks.map(t => ({ fn: eval(`(${t.fn})`), addr: t.addr }));
    const result = await engine.run(parsedTasks);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/v1/compute/crypto/hash', async (req, res) => {
  try {
    const { data } = req.body;
    const crypto = require('crypto');
    const task = { fn: () => crypto.createHash('sha256').update(data).digest('hex') };
    const result = await engine.run([task]);
    res.json({ success: true, hash: result.results[0].result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/v1/compute/math', async (req, res) => {
  try {
    const { operations } = req.body;
    const tasks = operations.map((op, i) => ({ fn: eval(`(${op})`), addr: i }));
    const result = await engine.run(tasks);
    res.json({ success: true, results: result.results.map(r => r.result) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats', (req, res) => res.json(engine.getFullStats()));
app.post('/api/reset', (req, res) => { engine.reset(); res.json({ success: true }); });
app.post('/api/workers/add', (req, res) => {
  const count = req.body.count || 4;
  engine.addWorkers(count);
  res.json({ success: true, totalWorkers: engine.scheduler.workers.length });
});

app.post('/api/test/simple', async (req, res) => res.json(await engine.run(TestSuite.simple())));
app.post('/api/test/heavy', async (req, res) => res.json(await engine.run(TestSuite.heavy())));
app.post('/api/test/massive', async (req, res) => res.json(await engine.run(TestSuite.massive())));

app.get('/health', (req, res) => res.json({ 
  status: 'healthy',
  uptime: Date.now() - engine.startTime,
  version: '2.0.0-beta'
}));

// ========================================
// GRAPHQL
// ========================================
const schema = buildSchema(`
  type Query {
    stats: Stats
    health: Health
  }
  type Mutation {
    compute(tasks: [TaskInput!]!): ComputeResult!
  }
  type Stats {
    uptime: Float
    totalWorkers: Int
    completedTasks: Int
  }
  type Health {
    status: String
    uptime: Float
  }
  type ComputeResult {
    success: Boolean!
    results: [Float]
    execTime: Float
  }
  input TaskInput {
    fn: String!
    addr: Int
  }
`);

const root = {
  stats: () => {
    const s = engine.getFullStats();
    return { uptime: s.uptime, totalWorkers: s.scheduler.totalWorkers, completedTasks: s.scheduler.completedTasks };
  },
  health: () => ({ status: 'healthy', uptime: process.uptime() }),
  compute: async ({ tasks }) => {
    const parsed = tasks.map(t => ({ fn: eval(`(${t.fn})`), addr: t.addr }));
    const result = await engine.run(parsed);
    return { success: true, results: result.results.map(r => r.result), execTime: result.execTime };
  }
};

app.use('/graphql', graphqlHTTP({ schema, rootValue: root, graphiql: true }));

// ========================================
// WEBSOCKET
// ========================================
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'compute') {
        const tasks = data.tasks.map(t => ({ fn: eval(`(${t.fn})`), addr: t.addr }));
        for (const task of tasks) {
          const result = await engine.run([task]);
          ws.send(JSON.stringify({ type: 'result', result: result.results[0] }));
        }
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });
});

// ========================================
// DOCUMENTATION UI
// ========================================
app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Compute Engine API - Documentation</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;line-height:1.6;padding:20px}
.container{max-width:1200px;margin:0 auto}
.header{text-align:center;margin-bottom:50px}
h1{font-size:3em;margin-bottom:10px}
.beta-badge{display:inline-block;background:#ff6b6b;padding:8px 20px;border-radius:25px;font-weight:bold;margin:10px 0;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.8}}
.subtitle{font-size:1.2em;opacity:0.9;margin-top:15px}
.section{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:15px;padding:30px;margin-bottom:30px;border:2px solid rgba(255,255,255,0.2)}
h2{font-size:2em;margin-bottom:20px;border-bottom:3px solid rgba(255,255,255,0.3);padding-bottom:10px}
h3{font-size:1.5em;margin:25px 0 15px;color:#ffd700}
.code-block{background:#1a1a1a;color:#0f0;padding:20px;border-radius:10px;overflow-x:auto;font-family:'Courier New',monospace;font-size:14px;margin:15px 0;border-left:4px solid #38ef7d;position:relative}
.copy-btn{position:absolute;top:10px;right:10px;background:#38ef7d;color:#1a1a1a;border:none;padding:8px 15px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px}
.copy-btn:hover{background:#11998e}
.method{display:inline-block;padding:5px 12px;border-radius:5px;font-weight:bold;font-size:12px;margin-right:10px}
.post{background:#38ef7d;color:#1a1a1a}
.get{background:#4facfe;color:#fff}
.ws{background:#f093fb;color:#fff}
.endpoint{background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #667eea}
.endpoint-url{font-family:'Courier New',monospace;color:#ffd700;font-size:16px;margin:10px 0}
.use-case{background:rgba(255,255,255,0.05);padding:15px;border-radius:8px;margin:10px 0;border-left:4px solid #ffd700}
.feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin:20px 0}
.feature-card{background:rgba(255,255,255,0.08);padding:20px;border-radius:10px;text-align:center}
.feature-icon{font-size:3em;margin-bottom:10px}
.cta{display:inline-block;background:linear-gradient(135deg,#38ef7d 0%,#11998e 100%);color:#fff;padding:15px 40px;border-radius:50px;text-decoration:none;font-weight:bold;font-size:18px;margin:10px}
.cta:hover{transform:translateY(-3px)}
.info-banner{background:rgba(255,215,0,0.2);border-left:5px solid #ffd700;padding:15px 20px;margin:20px 0;border-radius:8px}
pre{margin:0;white-space:pre-wrap;word-wrap:break-word}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>⚡ Compute Engine API</h1>
<div class="beta-badge">BETA - FREE ACCESS</div>
<p class="subtitle">API de calcul distribué haute performance</p>
<p style="opacity:0.8;margin-top:10px">Infrastructure de calcul parallèle gratuite durant la phase beta</p>
</div>

<div class="section">
<h2>🚀 Démarrage Rapide</h2>
<div class="info-banner"><strong>Aucune clé API requise</strong> - Utilisez directement l'URL comme endpoint</div>
<h3>Premier appel en 30 secondes</h3>
<div class="code-block">
<button class="copy-btn" onclick="copyCode(this)">Copier</button>
<pre>// JavaScript
fetch('${baseUrl}/api/v1/compute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tasks: [
      { fn: "() => 10 + 5", addr: 0 },
      { fn: "() => Math.pow(2, 10)", addr: 1 }
    ]
  })
})
.then(res => res.json())
.then(data => console.log(data));</pre>
</div>

<div class="code-block">
<button class="copy-btn" onclick="copyCode(this)">Copier</button>
<pre># Python
import requests
response = requests.post(
    '${baseUrl}/api/v1/compute',
    json={'tasks': [{'fn': '() => 10 + 5', 'addr': 0}]}
)
print(response.json())</pre>
</div>

<div class="code-block">
<button class="copy-btn" onclick="copyCode(this)">Copier</button>
<pre># cURL
curl -X POST ${baseUrl}/api/v1/compute \\
  -H "Content-Type: application/json" \\
  -d '{"tasks":[{"fn":"() => 10 + 5","addr":0}]}'</pre>
</div>
</div>

<div class="section">
<h2>🔌 Méthodes de Consommation</h2>
<div class="feature-grid">
<div class="feature-card"><div class="feature-icon">🌐</div><h3>REST API</h3><p>Standard HTTP/JSON</p></div>
<div class="feature-card"><div class="feature-icon">📡</div><h3>GraphQL</h3><p>Queries flexibles</p></div>
<div class="feature-card"><div class="feature-icon">⚡</div><h3>WebSocket</h3><p>Temps réel</p></div>
</div>

<h3>1. REST API (Recommandé)</h3>
<div class="endpoint">
<span class="method post">POST</span>
<span class="endpoint-url">/api/v1/compute</span>
<p style="margin-top:10px">Endpoint principal pour calculs parallèles</p>
</div>

<h3>2. GraphQL</h3>
<div class="endpoint">
<span class="method post">POST</span>
<span class="endpoint-url">/graphql</span>
<p style="margin-top:10px">Interface GraphiQL disponible: <a href="/graphql" style="color:#ffd700">${baseUrl}/graphql</a></p>
</div>
<div class="code-block">
<button class="copy-btn" onclick="copyCode(this)">Copier</button>
<pre>mutation {
  compute(tasks: [{ fn: "() => 10 * 10", addr: 0 }]) {
    success
    results
    execTime
  }
}</pre>
</div>

<h3>3. WebSocket (Streaming)</h3>
<div class="endpoint">
<span class="method ws">WS</span>
<span class="endpoint-url">ws://${req.get('host')}</span>
</div>
<div class="code-block">
<button class="copy-btn" onclick="copyCode(this)">Copier</button>
<pre>const ws = new WebSocket('ws://${req.get('host')}');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'compute',
    tasks: [{ fn: '() => 100 * 2', addr: 0 }]
  }));
};
ws.onmessage = (e) => console.log(JSON.parse(e.data));</pre>
</div>
</div>

<div class="section">
<h2>📚 Tous les Endpoints</h2>
<div class="endpoint"><span class="method post">POST</span><span class="endpoint-url">/api/v1/compute</span><p>Compute principal</p></div>
<div class="endpoint"><span class="method post">POST</span><span class="endpoint-url">/api/v1/compute/crypto/hash</span><p>Hash SHA-256</p></div>
<div class="endpoint"><span class="method post">POST</span><span class="endpoint-url">/api/v1/compute/math</span><p>Opérations mathématiques</p></div>
<div class="endpoint"><span class="method get">GET</span><span class="endpoint-url">/api/stats</span><p>Statistiques système</p></div>
<div class="endpoint"><span class="method get">GET</span><span class="endpoint-url">/health</span><p>Health check</p></div>
</div>

<div class="section">
<h2>💡 Cas d'Usage</h2>
<div class="use-case"><h4>🔐 Cryptographie & Sécurité</h4><p>Hash de mots de passe, génération de tokens, vérification d'intégrité</p></div>
<div class="use-case"><h4>🧮 Calculs Scientifiques</h4><p>Simulations, analyses statistiques, traitement de données</p></div>
<div class="use-case"><h4>📊 Traitement de Données</h4><p>Agrégations, transformations, analyses parallèles</p></div>
<div class="use-case"><h4>🎮 Simulations & Gaming</h4><p>Physics engines, IA, pathfinding parallèle</p></div>
</div>

<div class="section">
<h2>⚠️ Limites Beta (Gratuit)</h2>
<div class="info-banner">Phase Beta - Ces limites sont temporaires</div>
<ul style="list-style:none;padding:0">
<li style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1)">✅ <strong>Workers:</strong> 8 cœurs parallèles</li>
<li style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1)">✅ <strong>RAM:</strong> 10 MB mémoire</li>
<li style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1)">✅ <strong>Tâches:</strong> Illimitées durant beta</li>
<li style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1)">✅ <strong>Timeout:</strong> 30s par tâche</li>
<li style="padding:10px 0">✅ <strong>Rate Limit:</strong> Aucune limite beta</li>
</ul>
</div>

<div class="section" style="text-align:center;background:linear-gradient(135deg,rgba(56,239,125,0.2) 0%,rgba(17,153,142,0.2) 100%)">
<h2>🎯 Programme Beta</h2>
<p style="font-size:1.2em;margin:20px 0">Testez gratuitement et aidez-nous à améliorer le produit</p>
<div style="margin:30px 0">
<p><strong>Ce que vous obtenez:</strong></p>
<ul style="list-style:none;padding:0;margin:20px 0">
<li style="padding:8px 0">✨ Accès gratuit illimité durant beta</li>
<li style="padding:8px 0">🎁 Réduction 50% à vie après lancement</li>
<li style="padding:8px 0">💬 Support prioritaire</li>
<li style="padding:8px 0">🚀 Nouvelles features en avant-première</li>
</ul>
</div>
<div><a href="/graphql" class="cta">Explorer GraphQL</a><a href="/api/stats" class="cta">Voir Stats</a></div>
</div>

<div style="text-align:center;margin-top:50px;opacity:0.7">
<p>Compute Engine API v2.0.0-beta</p>
<p style="margin-top:10px;font-size:0.9em">Questions ? Retours ? GitHub Issues</p>
</div>
</div>
<script>
function copyCode(btn){
const code=btn.parentElement.querySelector('pre').textContent;
navigator.clipboard.writeText(code).then(()=>{
const orig=btn.textContent;
btn.textContent='✓ Copié!';
btn.style.background='#11998e';
setTimeout(()=>{btn.textContent=orig;btn.style.background='#38ef7d'},2000);
});
}
</script>
</body>
</html>`);
});

// ========================================
// SERVER START
// ========================================
server.listen(PORT, () => {
  console.log(`\n🚀 Compute Engine API v2.0.0-beta`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`📍 Production: ${process.env.RENDER_EXTERNAL_URL || 'N/A'}`);
  console.log(`🌐 REST: /api/v1/compute`);
  console.log(`📡 GraphQL: /graphql`);
  console.log(`⚡ WebSocket: ws://localhost:${PORT}\n`);
});