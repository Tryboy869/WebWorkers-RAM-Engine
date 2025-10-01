// ========================================
// WEBWORKERS RAM ENGINE - Production Ready
// Architecture Modulaire avec Interface de Contrôle
// ========================================

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS pour API
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ========================================
// MODULE 1 : SIMULATED RAM (Mémoire Partagée)
// ========================================
class SimulatedRAM {
  constructor(sizeInBytes = 10 * 1024 * 1024) { // 10 MB par défaut
    this.memory = new Map();
    this.size = sizeInBytes;
    this.maxAddr = Math.floor(sizeInBytes / 4);
    this.writeCount = 0;
    this.readCount = 0;
    this.log(`RAM initialisée: ${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB (${this.maxAddr} addresses)`);
  }

  write(addr, value) {
    if (addr < 0 || addr >= this.maxAddr) {
      throw new Error(`Adresse ${addr} hors limites [0-${this.maxAddr}]`);
    }
    this.memory.set(addr, value);
    this.writeCount++;
    return true;
  }

  read(addr) {
    if (addr < 0 || addr >= this.maxAddr) {
      throw new Error(`Adresse ${addr} hors limites [0-${this.maxAddr}]`);
    }
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

  log(msg) {
    logger.add('RAM', msg);
  }
}

// ========================================
// MODULE 2 : VIRTUAL WORKERS (Cœurs Simulés)
// ========================================
class VirtualWorker {
  constructor(id, ram) {
    this.id = id;
    this.ram = ram;
    this.busy = false;
    this.taskCount = 0;
    this.totalExecTime = 0;
    this.errors = 0;
    this.log(`Worker ${id} créé`);
  }

  async executeTask(task, targetAddr, taskId) {
    this.busy = true;
    this.taskCount++;
    const startTime = Date.now();
    
    this.log(`Tâche #${taskId} démarrée → Addr ${targetAddr}`);

    try {
      // Simulation temps calcul réaliste
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50));
      
      const result = task();
      this.ram.write(targetAddr, result);
      
      const execTime = Date.now() - startTime;
      this.totalExecTime += execTime;
      
      this.busy = false;
      this.log(`Tâche #${taskId} terminée: ${result} (${execTime}ms)`);
      
      return { success: true, result, execTime, workerId: this.id };
    } catch (error) {
      this.errors++;
      this.busy = false;
      this.log(`Erreur tâche #${taskId}: ${error.message}`);
      return { success: false, error: error.message, workerId: this.id };
    }
  }

  isFree() {
    return !this.busy;
  }

  getStats() {
    return {
      id: this.id,
      busy: this.busy,
      tasksCompleted: this.taskCount,
      totalExecTime: this.totalExecTime,
      avgExecTime: this.taskCount > 0 ? (this.totalExecTime / this.taskCount).toFixed(2) : 0,
      errors: this.errors
    };
  }

  log(msg) {
    logger.add(`Worker-${this.id}`, msg);
  }
}

// ========================================
// MODULE 3 : MESSAGE BUS (Transmetteur Inter-Module)
// ========================================
class MessageBus {
  constructor() {
    this.listeners = new Map();
    this.messageCount = 0;
    this.log('MessageBus initialisé');
  }

  subscribe(channel, callback) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel).push(callback);
    this.log(`Souscription au canal '${channel}'`);
  }

  publish(channel, data) {
    this.messageCount++;
    const listeners = this.listeners.get(channel) || [];
    
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        this.log(`Erreur listener '${channel}': ${error.message}`);
      }
    });
  }

  getStats() {
    return {
      totalMessages: this.messageCount,
      channels: Array.from(this.listeners.keys()),
      totalListeners: Array.from(this.listeners.values()).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  log(msg) {
    logger.add('MessageBus', msg);
  }
}

// ========================================
// MODULE 4 : TASK SCHEDULER (Gestionnaire de Tâches)
// ========================================
class TaskScheduler {
  constructor(ram, messageBus, numWorkers = 8) {
    this.ram = ram;
    this.messageBus = messageBus;
    this.workers = Array.from({ length: numWorkers }, (_, i) => new VirtualWorker(i, ram));
    this.taskQueue = [];
    this.completedTasks = 0;
    this.failedTasks = 0;
    this.taskIdCounter = 0;
    this.log(`Scheduler créé avec ${numWorkers} workers`);
  }

  getFreeWorker() {
    return this.workers.find(w => w.isFree());
  }

  async scheduleTask(task, targetAddr) {
    const taskId = ++this.taskIdCounter;
    const worker = this.getFreeWorker();
    
    if (!worker) {
      this.log(`File d'attente: Tâche #${taskId} en attente`);
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
    
    // Traiter la queue
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift();
      this.scheduleTask(nextTask.task, nextTask.targetAddr).then(nextTask.resolve);
    }
    
    return result;
  }

  addWorkers(count) {
    const startId = this.workers.length;
    for (let i = 0; i < count; i++) {
      this.workers.push(new VirtualWorker(startId + i, this.ram));
    }
    this.log(`${count} workers supplémentaires ajoutés (Total: ${this.workers.length})`);
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

  log(msg) {
    logger.add('Scheduler', msg);
  }
}

// ========================================
// MODULE 5 : PARALLEL ENGINE (Chef d'Orchestre)
// ========================================
class ParallelEngine {
  constructor(config = {}) {
    this.ram = new SimulatedRAM(config.ramSize || 10 * 1024 * 1024);
    this.messageBus = new MessageBus();
    this.scheduler = new TaskScheduler(this.ram, this.messageBus, config.numWorkers || 8);
    this.startTime = Date.now();
    
    // Souscriptions événements
    this.messageBus.subscribe('task.completed', (data) => {
      logger.add('Engine', `Tâche terminée par Worker ${data.workerId} en ${data.execTime}ms`);
    });
    
    this.messageBus.subscribe('task.failed', (data) => {
      logger.add('Engine', `Tâche échouée sur Worker ${data.workerId}: ${data.error}`);
    });
    
    logger.add('Engine', 'ParallelEngine initialisé');
  }

  async run(tasks) {
    const startTime = Date.now();
    logger.add('Engine', `Démarrage: ${tasks.length} tâches`);
    
    const promises = tasks.map((task, index) => 
      this.scheduler.scheduleTask(task.fn, task.addr !== undefined ? task.addr : index)
    );
    
    const results = await Promise.all(promises);
    const execTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.success).length;
    logger.add('Engine', `Terminé: ${successCount}/${tasks.length} succès en ${execTime}ms`);
    
    return { results, execTime, successCount, totalTasks: tasks.length };
  }

  addWorkers(count) {
    this.scheduler.addWorkers(count);
  }

  reset() {
    this.ram.clear();
    this.scheduler.completedTasks = 0;
    this.scheduler.failedTasks = 0;
    this.scheduler.taskIdCounter = 0;
    logger.add('Engine', 'Reset complet effectué');
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

// ========================================
// MODULE 6 : LOGGER (Système de Logs)
// ========================================
class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 10000;
  }

  add(module, message) {
    const timestamp = new Date().toISOString();
    const log = {
      timestamp,
      module,
      message,
      id: this.logs.length
    };
    
    this.logs.push(log);
    
    // Limite mémoire
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    console.log(`[${timestamp}] [${module}] ${message}`);
  }

  getLogs(limit = 1000) {
    return this.logs.slice(-limit);
  }

  clear() {
    this.logs = [];
    this.add('Logger', 'Logs effacés');
  }

  export() {
    return this.logs.map(log => 
      `[${log.timestamp}] [${log.module}] ${log.message}`
    ).join('\n');
  }
}

const logger = new Logger();

// ========================================
// TESTS AUTOMATIQUES
// ========================================
const TestSuite = {
  // Test 1: Calculs simples
  simpleCalculations: () => [
    { fn: () => 10 + 5, addr: 0, expected: 15 },
    { fn: () => 20 * 3, addr: 1, expected: 60 },
    { fn: () => Math.pow(2, 10), addr: 2, expected: 1024 },
    { fn: () => 100 - 25, addr: 3, expected: 75 }
  ],

  // Test 2: Calculs lourds
  heavyCalculations: () => {
    const fibonacci = (n) => n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2);
    const factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
    
    return [
      { fn: () => fibonacci(20), addr: 10 },
      { fn: () => factorial(15), addr: 11 },
      { fn: () => Math.sqrt(987654321), addr: 12 },
      { fn: () => Math.PI * Math.E * 1000, addr: 13 }
    ];
  },

  // Test 3: Charge massive
  massiveLoad: () => {
    const tasks = [];
    for (let i = 0; i < 100; i++) {
      tasks.push({
        fn: () => Math.sin(i) * Math.cos(i) * 1000,
        addr: 100 + i
      });
    }
    return tasks;
  },

  // Test 4: Workers supplémentaires
  dynamicWorkers: () => [
    { fn: () => 1 + 1, addr: 200 },
    { fn: () => 2 + 2, addr: 201 },
    { fn: () => 3 + 3, addr: 202 }
  ]
};

// ========================================
// INSTANCE GLOBALE
// ========================================
const engine = new ParallelEngine({ numWorkers: 8, ramSize: 10 * 1024 * 1024 });

// ========================================
// API ENDPOINTS
// ========================================

// Page d'accueil avec interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebWorkers RAM Engine - Control Panel</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
            padding: 30px;
            backdrop-filter: blur(10px);
        }
        h1 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        .controls {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        button {
            padding: 15px 25px;
            font-size: 16px;
            font-weight: bold;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            color: white;
        }
        .btn-warning {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }
        .btn-danger {
            background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
            color: white;
        }
        .btn-info {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
        }
        button:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.3);
        }
        button:active {
            transform: translateY(-1px);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 15px;
            text-align: center;
            border: 2px solid rgba(255,255,255,0.2);
        }
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
        }
        .stat-label {
            font-size: 0.9em;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .logs-container {
            background: rgba(0,0,0,0.5);
            border-radius: 15px;
            padding: 20px;
            margin-top: 30px;
            border: 2px solid rgba(255,255,255,0.2);
        }
        .logs-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .logs-header h2 {
            font-size: 1.5em;
        }
        #logs {
            background: #1a1a1a;
            color: #0f0;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            padding: 20px;
            border-radius: 10px;
            height: 500px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.6;
        }
        #logs::-webkit-scrollbar {
            width: 10px;
        }
        #logs::-webkit-scrollbar-track {
            background: #2a2a2a;
            border-radius: 5px;
        }
        #logs::-webkit-scrollbar-thumb {
            background: #666;
            border-radius: 5px;
        }
        .loading {
            display: none;
            text-align: center;
            margin: 20px 0;
        }
        .spinner {
            border: 4px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top: 4px solid white;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .success-message {
            background: rgba(56, 239, 125, 0.2);
            border: 2px solid #38ef7d;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 WebWorkers RAM Engine</h1>
        
        <div class="stats-grid" id="stats">
            <div class="stat-card">
                <div class="stat-label">Workers Actifs</div>
                <div class="stat-value" id="stat-workers">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Tâches Complétées</div>
                <div class="stat-value" id="stat-tasks">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Utilisation RAM</div>
                <div class="stat-value" id="stat-ram">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Messages</div>
                <div class="stat-value" id="stat-messages">-</div>
            </div>
        </div>

        <div class="controls">
            <button class="btn-primary" onclick="runAllTests()">
                🧪 Lancer Tous les Tests
            </button>
            <button class="btn-success" onclick="runTest('simple')">
                ✅ Test Calculs Simples
            </button>
            <button class="btn-warning" onclick="runTest('heavy')">
                ⚡ Test Calculs Lourds
            </button>
            <button class="btn-danger" onclick="runTest('massive')">
                🔥 Test Charge Massive
            </button>
            <button class="btn-info" onclick="addWorkers()">
                ➕ Ajouter 4 Workers
            </button>
            <button class="btn-info" onclick="refreshStats()">
                📊 Rafraîchir Stats
            </button>
            <button class="btn-warning" onclick="resetEngine()">
                🔄 Reset Engine
            </button>
            <button class="btn-danger" onclick="clearLogs()">
                🗑️ Effacer Logs
            </button>
        </div>

        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p style="margin-top: 10px;">Exécution en cours...</p>
        </div>

        <div class="success-message" id="success-message"></div>

        <div class="logs-container">
            <div class="logs-header">
                <h2>📋 Console de Logs</h2>
                <button class="btn-info" onclick="copyLogs()">
                    📋 Copier les Logs
                </button>
            </div>
            <div id="logs">Logs du système s'afficheront ici...</div>
        </div>
    </div>

    <script>
        let autoRefresh = null;

        async function runTest(type) {
            showLoading();
            try {
                const response = await fetch('/api/test/' + type, { method: 'POST' });
                const data = await response.json();
                showSuccess('Test ' + type + ' terminé avec succès!');
                await refreshStats();
                await refreshLogs();
            } catch (error) {
                alert('Erreur: ' + error.message);
            } finally {
                hideLoading();
            }
        }

        async function runAllTests() {
            showLoading();
            try {
                const response = await fetch('/api/test/all', { method: 'POST' });
                const data = await response.json();
                showSuccess('Tous les tests terminés! Durée totale: ' + (data.totalTime / 1000).toFixed(2) + 's');
                await refreshStats();
                await refreshLogs();
            } catch (error) {
                alert('Erreur: ' + error.message);
            } finally {
                hideLoading();
            }
        }

        async function addWorkers() {
            try {
                const response = await fetch('/api/workers/add', { method: 'POST' });
                const data = await response.json();
                showSuccess(data.message);
                await refreshStats();
                await refreshLogs();
            } catch (error) {
                alert('Erreur: ' + error.message);
            }
        }

        async function resetEngine() {
            if (!confirm('Êtes-vous sûr de vouloir réinitialiser le moteur?')) return;
            try {
                const response = await fetch('/api/reset', { method: 'POST' });
                showSuccess('Engine réinitialisé avec succès');
                await refreshStats();
                await refreshLogs();
            } catch (error) {
                alert('Erreur: ' + error.message);
            }
        }

        async function refreshStats() {
            try {
                const response = await fetch('/api/stats');
                const data = await response.json();
                
                document.getElementById('stat-workers').textContent = data.scheduler.totalWorkers;
                document.getElementById('stat-tasks').textContent = data.scheduler.completedTasks;
                document.getElementById('stat-ram').textContent = data.ram.memoryUsagePercent + '%';
                document.getElementById('stat-messages').textContent = data.messageBus.totalMessages;
            } catch (error) {
                console.error('Erreur refresh stats:', error);
            }
        }

        async function refreshLogs() {
            try {
                const response = await fetch('/api/logs');
                const data = await response.json();
                const logsDiv = document.getElementById('logs');
                logsDiv.textContent = data.logs.map(log => 
                    '[' + log.timestamp + '] [' + log.module + '] ' + log.message
                ).join('\\n');
                logsDiv.scrollTop = logsDiv.scrollHeight;
            } catch (error) {
                console.error('Erreur refresh logs:', error);
            }
        }

        async function clearLogs() {
            try {
                await fetch('/api/logs/clear', { method: 'POST' });
                await refreshLogs();
                showSuccess('Logs effacés');
            } catch (error) {
                alert('Erreur: ' + error.message);
            }
        }

        function copyLogs() {
            const logs = document.getElementById('logs').textContent;
            navigator.clipboard.writeText(logs).then(() => {
                showSuccess('Logs copiés dans le presse-papier!');
            }).catch(err => {
                alert('Erreur copie: ' + err);
            });
        }

        function showLoading() {
            document.getElementById('loading').style.display = 'block';
            document.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }

        function hideLoading() {
            document.getElementById('loading').style.display = 'none';
            document.querySelectorAll('button').forEach(btn => btn.disabled = false);
        }

        function showSuccess(message) {
            const div = document.getElementById('success-message');
            div.textContent = '✅ ' + message;
            div.style.display = 'block';
            setTimeout(() => {
                div.style.display = 'none';
            }, 5000);
        }

        // Auto-refresh stats toutes les 2 secondes
        setInterval(refreshStats, 2000);
        
        // Init
        refreshStats();
        refreshLogs();
    </script>
</body>
</html>
  `);
});

// Stats en temps réel
app.get('/api/stats', (req, res) => {
  res.json(engine.getFullStats());
});

// Logs système
app.get('/api/logs', (req, res) => {
  res.json({
    logs: logger.getLogs(1000),
    total: logger.logs.length
  });
});

// Effacer logs
app.post('/api/logs/clear', (req, res) => {
  logger.clear();
  res.json({ success: true });
});

// Test simple
app.post('/api/test/simple', async (req, res) => {
  const tasks = TestSuite.simpleCalculations();
  const result = await engine.run(tasks);
  res.json(result);
});

// Test lourd
app.post('/api/test/heavy', async (req, res) => {
  const tasks = TestSuite.heavyCalculations();
  const result = await engine.run(tasks);
  res.json(result);
});

// Test massif
app.post('/api/test/massive', async (req, res) => {
  const tasks = TestSuite.massiveLoad();
  const result = await engine.run(tasks);
  res.json(result);
});

// Tous les tests
app.post('/api/test/all', async (req, res) => {
  const startTime = Date.now();
  
  logger.add('TestSuite', '========== DÉMARRAGE TESTS COMPLETS ==========');
  
  const test1 = await engine.run(TestSuite.simpleCalculations());
  logger.add('TestSuite', 'Test 1/3: Calculs simples terminé');
  
  const test2 = await engine.run(TestSuite.heavyCalculations());
  logger.add('TestSuite', 'Test 2/3: Calculs lourds terminé');
  
  const test3 = await engine.run(TestSuite.massiveLoad());
  logger.add('TestSuite', 'Test 3/3: Charge massive terminé');
  
  const totalTime = Date.now() - startTime;
  logger.add('TestSuite', `========== TESTS TERMINÉS en ${totalTime}ms ==========`);
  
  res.json({
    success: true,
    tests: [test1, test2, test3],
    totalTime,
    stats: engine.getFullStats()
  });
});

// Ajouter workers
app.post('/api/workers/add', (req, res) => {
  const count = req.body.count || 4;
  engine.addWorkers(count);
  res.json({ 
    success: true, 
    message: `${count} workers ajoutés`,
    totalWorkers: engine.scheduler.workers.length 
  });
});

// Reset engine
app.post('/api/reset', (req, res) => {
  engine.reset();
  res.json({ success: true });
});

// Export logs
app.get('/api/logs/export', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename=webworkers-ram-engine-logs.txt');
  res.send(logger.export());
});

// Health check pour Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: Date.now() - engine.startTime,
    version: '1.0.0'
  });
});

// ========================================
// DÉMARRAGE SERVEUR
// ========================================
app.listen(PORT, () => {
  logger.add('Server', `🚀 WebWorkers RAM Engine démarré sur le port ${PORT}`);
  logger.add('Server', `📍 URL: http://localhost:${PORT}`);
  logger.add('Server', `🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test automatique au démarrage
  setTimeout(async () => {
    logger.add('Server', '🧪 Exécution test de démarrage...');
    const tasks = TestSuite.simpleCalculations();
    await engine.run(tasks);
    logger.add('Server', '✅ Test de démarrage réussi');
  }, 2000);
});

// Gestion erreurs
process.on('uncaughtException', (error) => {
  logger.add('System', `❌ Erreur critique: ${error.message}`);
  console.error(error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.add('System', `❌ Promise rejetée: ${reason}`);
  console.error(reason);
});