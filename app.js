// ========================================
// COMPUTE ENGINE API v2.1.0 - SECURED
// Production Ready with Security Layer
// ========================================

const express = require('express');
const crypto = require('crypto');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================================
// SECURITY LAYER
// ========================================

class SecurityManager {
  constructor() {
    this.rateLimits = new Map();
    this.suspiciousIPs = new Set();
  }

  checkRateLimit(ip) {
    const now = Date.now();
    const limit = this.rateLimits.get(ip);

    if (!limit || now > limit.resetTime) {
      this.rateLimits.set(ip, {
        count: 1,
        resetTime: now + 60000 // 1 minute
      });
      return { allowed: true, remaining: 99 };
    }

    if (limit.count >= 100) {
      if (limit.count > 200) {
        this.suspiciousIPs.add(ip);
      }
      return { 
        allowed: false, 
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      };
    }

    limit.count++;
    return { allowed: true, remaining: 100 - limit.count };
  }

  isSuspicious(ip) {
    return this.suspiciousIPs.has(ip);
  }
}

const security = new SecurityManager();

// Rate limiting middleware
function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  
  if (security.isSuspicious(ip)) {
    return res.status(429).json({ 
      error: 'Too many requests',
      message: 'Your IP has been temporarily blocked'
    });
  }

  const check = security.checkRateLimit(ip);
  
  if (!check.allowed) {
    res.setHeader('Retry-After', check.retryAfter);
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      retryAfter: check.retryAfter
    });
  }

  res.setHeader('X-RateLimit-Remaining', check.remaining);
  next();
}

// ========================================
// SAFE EXECUTOR (No eval)
// ========================================

class SafeExecutor {
  constructor() {
    this.operations = {
      // Math operations
      add: (a, b) => a + b,
      subtract: (a, b) => a - b,
      multiply: (a, b) => a * b,
      divide: (a, b) => b !== 0 ? a / b : null,
      modulo: (a, b) => a % b,
      power: (base, exp) => exp <= 1000 ? Math.pow(base, exp) : null,
      sqrt: (x) => Math.sqrt(x),
      abs: (x) => Math.abs(x),
      
      // Trigonometry
      sin: (x) => Math.sin(x),
      cos: (x) => Math.cos(x),
      tan: (x) => Math.tan(x),
      
      // Algorithms
      fibonacci: (n) => {
        if (n < 0 || n > 50) return null;
        if (n <= 1) return n;
        let a = 0, b = 1;
        for (let i = 2; i <= n; i++) {
          [a, b] = [b, a + b];
        }
        return b;
      },
      
      factorial: (n) => {
        if (n < 0 || n > 20) return null;
        let result = 1;
        for (let i = 2; i <= n; i++) result *= i;
        return result;
      },
      
      isPrime: (n) => {
        if (n < 2 || n > 1000000) return null;
        if (n === 2) return true;
        if (n % 2 === 0) return false;
        for (let i = 3; i <= Math.sqrt(n); i += 2) {
          if (n % i === 0) return false;
        }
        return true;
      },
      
      // Crypto
      sha256: (data) => {
        if (typeof data !== 'string' || data.length > 10000) return null;
        return crypto.createHash('sha256').update(data).digest('hex');
      },
      
      md5: (data) => {
        if (typeof data !== 'string' || data.length > 10000) return null;
        return crypto.createHash('md5').update(data).digest('hex');
      }
    };
  }

  validate(op, params) {
    if (!this.operations[op]) {
      return { valid: false, error: 'Unknown operation' };
    }

    // Validate parameters
    const numericOps = ['add', 'subtract', 'multiply', 'divide', 'modulo', 'power'];
    if (numericOps.includes(op)) {
      const keys = op === 'power' ? ['base', 'exp'] : ['a', 'b'];
      if (!keys.every(k => typeof params[k] === 'number')) {
        return { valid: false, error: 'Invalid parameters' };
      }
    }

    return { valid: true };
  }

  execute(op, params) {
    const validation = this.validate(op, params);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const fn = this.operations[op];
    
    if (['add', 'subtract', 'multiply', 'divide', 'modulo'].includes(op)) {
      return fn(params.a, params.b);
    } else if (op === 'power') {
      return fn(params.base, params.exp);
    } else if (['sqrt', 'abs', 'sin', 'cos', 'tan', 'fibonacci', 'factorial', 'isPrime'].includes(op)) {
      return fn(params.n !== undefined ? params.n : params.x);
    } else if (['sha256', 'md5'].includes(op)) {
      return fn(params.data);
    }
  }
}

const executor = new SafeExecutor();

// ========================================
// CORE ENGINE (Original)
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
    if (addr < 0 || addr >= this.maxAddr) throw new Error('Address out of bounds');
    this.memory.set(addr, value);
    this.writeCount++;
    return true;
  }

  read(addr) {
    if (addr < 0 || addr >= this.maxAddr) throw new Error('Address out of bounds');
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

class TaskScheduler {
  constructor(ram, numWorkers = 8) {
    this.ram = ram;
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
    } else {
      this.failedTasks++;
    }
    
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift();
      this.scheduleTask(nextTask.task, nextTask.targetAddr).then(nextTask.resolve);
    }
    
    return result;
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
    this.scheduler = new TaskScheduler(this.ram, config.numWorkers || 8);
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
      scheduler: this.scheduler.getStats()
    };
  }
}

const engine = new ParallelEngine({ numWorkers: 8 });

// ========================================
// SECURED API ENDPOINTS
// ========================================

app.post('/api/v1/compute', rateLimiter, async (req, res) => {
  try {
    const { tasks } = req.body;
    
    if (!Array.isArray(tasks) || tasks.length === 0 || tasks.length > 100) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'Tasks must be an array (1-100 items)'
      });
    }

    const safeTasks = [];
    
    for (const task of tasks) {
      if (!task.op || !task.params) {
        return res.status(400).json({ 
          error: 'Invalid task format',
          message: 'Each task must have op and params'
        });
      }

      try {
        const result = executor.execute(task.op, task.params);
        safeTasks.push({
          fn: () => result,
          addr: task.addr
        });
      } catch (error) {
        return res.status(400).json({ 
          error: 'Invalid operation',
          message: error.message
        });
      }
    }

    const result = await engine.run(safeTasks);
    res.json({ success: true, ...result });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Server error',
      message: 'Internal processing error'
    });
  }
});

app.get('/api/stats', rateLimiter, (req, res) => {
  res.json(engine.getFullStats());
});

app.post('/api/reset', rateLimiter, (req, res) => {
  engine.reset();
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    version: '2.1.0',
    uptime: Date.now() - engine.startTime
  });
});

// ========================================
// MINIMAL UI (No detailed docs)
// ========================================

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Compute API</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:monospace;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.container{max-width:600px;text-align:center}
h1{font-size:3em;margin-bottom:20px;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
.status{display:inline-block;width:12px;height:12px;background:#0f0;border-radius:50%;margin-right:8px;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.card{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:15px;padding:30px;margin:20px 0;border:2px solid rgba(255,255,255,0.2)}
.endpoint{background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;margin:10px 0;text-align:left;font-size:14px}
.method{display:inline-block;background:#38ef7d;color:#000;padding:4px 10px;border-radius:5px;font-weight:bold;margin-right:10px}
code{background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;font-size:13px}
a{color:#ffd700;text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
<h1>Compute API</h1>
<div class="card">
<p style="font-size:1.2em;margin-bottom:10px"><span class="status"></span>Service Online</p>
<p style="opacity:0.8;font-size:0.9em">High-performance compute engine</p>
</div>
<div class="card">
<h2 style="margin-bottom:15px">Quick Start</h2>
<div class="endpoint">
<span class="method">POST</span>
<code>/api/v1/compute</code>
</div>
<p style="margin-top:15px;opacity:0.8;font-size:0.9em">Contact for API documentation</p>
</div>
<div class="card">
<p style="opacity:0.7;font-size:0.9em">Rate limit: 100 requests/minute</p>
<p style="margin-top:10px"><a href="/health">Health Check</a> | <a href="/api/stats">Stats</a></p>
</div>
</div>
</body>
</html>`);
});

// ========================================
// SERVER START
// ========================================

server.listen(PORT, () => {
  console.log(`\n🔒 Compute Engine v2.1.0 - SECURED`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`✅ Rate Limiting: 100 req/min per IP`);
  console.log(`✅ No eval(): Whitelist-based execution`);
  console.log(`✅ Input Validation: Active`);
  console.log(`✅ Production Ready\n`);
});

process.on('uncaughtException', (error) => {
  console.error('Critical error:', error.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});