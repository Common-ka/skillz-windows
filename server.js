const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const { exec } = require('child_process');

const PORT = process.env.PORT || 4188;

// Path resolution helper
function getPlatformPaths() {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
  const appData = process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming');

  return {
    vscode: {
      label: 'VS Code',
      configPath: path.join(appData, 'Code', 'User', 'mcp.json'),
      format: 'json-servers'
    },
    'vscode-insiders': {
      label: 'VS Code Insiders',
      configPath: path.join(appData, 'Code - Insiders', 'User', 'mcp.json'),
      format: 'json-servers'
    },
    rider: {
      label: 'Rider',
      configPath: path.join(appData, 'JetBrains', 'Rider', 'mcp.json'),
      format: 'json-servers'
    },
    trae: {
      label: 'Trae',
      configPath: path.join(appData, 'Trae', 'User', 'mcp.json'),
      format: 'json-mcpServers'
    },
    codex: {
      label: 'Codex',
      configPath: path.join(userProfile, '.codex', 'config.toml'),
      format: 'toml-mcp_servers'
    },
    antigravity: {
      label: 'Antigravity',
      configPath: path.join(appData, '..', '.gemini', 'antigravity-ide', 'mcp_config.json'),
      format: 'json-mcpServers'
    },
    claude: {
      label: 'Claude Code',
      configPath: path.join(userProfile, '.claude.json'), // fallback local
      format: 'json-mcpServers'
    }
  };
}

// Security: Containment check for file operations
function isPathContained(targetPath) {
  const userProfile = process.env.USERPROFILE;
  const appData = process.env.APPDATA;
  const resolved = path.resolve(targetPath);

  // Allow inside user profile, appdata, or current process directory (for workspace files)
  const allowedRoots = [
    userProfile,
    appData,
    path.resolve(__dirname),
    path.resolve('.')
  ].filter(Boolean).map(p => p.toLowerCase());

  const resolvedLower = resolved.toLowerCase();
  return allowedRoots.some(root => resolvedLower.startsWith(root));
}

// Simple YAML Frontmatter Parser
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: content };
  }
  const yamlStr = match[1];
  const body = match[2];
  const metadata = {};
  yamlStr.split(/\r?\n/).forEach(line => {
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join(':').trim();
      let cleanVal = val.replace(/^['"]|['"]$/g, '');
      if (cleanVal.startsWith('[') && cleanVal.endsWith(']')) {
        cleanVal = cleanVal.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
      } else if (cleanVal === 'true') {
        cleanVal = true;
      } else if (cleanVal === 'false') {
        cleanVal = false;
      }
      metadata[key] = cleanVal;
    }
  });
  return { metadata, body };
}

function stringifyFrontmatter(metadata, body) {
  let yaml = '---\n';
  for (const [key, val] of Object.entries(metadata)) {
    if (Array.isArray(val)) {
      yaml += `${key}: [${val.map(v => `"${v}"`).join(', ')}]\n`;
    } else {
      yaml += `${key}: "${val}"\n`;
    }
  }
  yaml += '---\n';
  return yaml + body;
}

// Codex TOML Parser & Writer (RegExp/Block based to preserve file structure)
function parseCodexToml(content) {
  const servers = {};
  const lines = content.split(/\r?\n/);
  let currentServer = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('[mcp_servers.')) {
      // Check if it's a tool or env sub-section
      const headerMatch = line.match(/^\[mcp_servers\.([^\]\.]+)(?:\.(env|tools\.[^\]\s]+))?\]$/);
      if (headerMatch) {
        const serverName = headerMatch[1];
        const subSection = headerMatch[2];

        if (!servers[serverName]) {
          servers[serverName] = { name: serverName, env: {}, disabled: false };
        }

        if (subSection === 'env') {
          currentServer = { name: serverName, target: 'env' };
        } else if (subSection && subSection.startsWith('tools')) {
          currentServer = { name: serverName, target: 'tools' };
        } else {
          currentServer = { name: serverName, target: 'root' };
        }
      }
    } else if (line.startsWith('[') && !line.startsWith('[mcp_servers')) {
      currentServer = null; // outside mcp servers
    } else if (currentServer && line && !line.startsWith('#')) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const rawVal = parts.slice(1).join('=').trim();
        let val = rawVal.replace(/^['"]|['"]$/g, '');
        if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
          try {
            val = JSON.parse(rawVal.replace(/'/g, '"'));
          } catch (e) {
            val = rawVal;
          }
        } else if (rawVal === 'true') {
          val = true;
        } else if (rawVal === 'false') {
          val = false;
        }

        const server = servers[currentServer.name];
        if (currentServer.target === 'root') {
          if (key === 'command') server.command = val;
          else if (key === 'args') server.args = val;
          else if (key === 'url') server.url = val;
          else if (key === 'enabled') server.disabled = !val;
        } else if (currentServer.target === 'env') {
          server.env[key] = val;
        }
      }
    }
  }
  return servers;
}

function writeCodexToml(originalContent, updatedServers) {
  const lines = originalContent.split(/\r?\n/);
  const resultLines = [];
  const processedServers = new Set();

  let insideMcpSection = false;
  let currentServerName = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('[mcp_servers.')) {
      const match = trimmed.match(/^\[mcp_servers\.([^\]\.]+)(?:\.([^\]]+))?\]$/);
      if (match) {
        currentServerName = match[1];
        insideMcpSection = true;

        if (!processedServers.has(currentServerName)) {
          // If we have an update/existing server, write its new block
          const s = updatedServers[currentServerName];
          if (s) {
            resultLines.push(`[mcp_servers.${currentServerName}]`);
            if (s.url) {
              resultLines.push(`url = '${s.url}'`);
            } else {
              resultLines.push(`command = '${s.command || ''}'`);
              resultLines.push(`args = ${JSON.stringify(s.args || []).replace(/"/g, "'")}`);
              resultLines.push(`enabled = ${!s.disabled}`);
            }
            if (s.env && Object.keys(s.env).length > 0) {
              resultLines.push('');
              resultLines.push(`[mcp_servers.${currentServerName}.env]`);
              for (const [ek, ev] of Object.entries(s.env)) {
                resultLines.push(`${ek} = '${ev}'`);
              }
            }
            processedServers.add(currentServerName);
          } else {
            // Deleted server: skip writing anything
          }
        }
        // Skip original lines for this server block
        continue;
      }
    } else if (trimmed.startsWith('[') && !trimmed.startsWith('[mcp_servers')) {
      insideMcpSection = false;
      currentServerName = null;
    }

    if (insideMcpSection && currentServerName) {
      // Skip original lines of currently rewritten/deleted server
      continue;
    }

    resultLines.push(line);
  }

  // Write newly added servers at the end
  for (const [name, s] of Object.entries(updatedServers)) {
    if (!processedServers.has(name)) {
      resultLines.push('');
      resultLines.push(`[mcp_servers.${name}]`);
      if (s.url) {
        resultLines.push(`url = '${s.url}'`);
      } else {
        resultLines.push(`command = '${s.command || ''}'`);
        resultLines.push(`args = ${JSON.stringify(s.args || []).replace(/"/g, "'")}`);
        resultLines.push(`enabled = ${!s.disabled}`);
      }
      if (s.env && Object.keys(s.env).length > 0) {
        resultLines.push('');
        resultLines.push(`[mcp_servers.${name}.env]`);
        for (const [ek, ev] of Object.entries(s.env)) {
          resultLines.push(`${ek} = '${ev}'`);
        }
      }
      processedServers.add(name);
    }
  }

  return resultLines.join('\n');
}

// Load configurations helper
function readMcpConfig(platformId) {
  const p = getPlatformPaths()[platformId];
  if (!p || !fs.existsSync(p.configPath)) return {};

  try {
    const raw = fs.readFileSync(p.configPath, 'utf8');
    if (p.format === 'toml-mcp_servers') {
      return parseCodexToml(raw);
    }

    const data = JSON.parse(raw);
    const servers = {};
    const configRoot = p.format === 'json-servers' ? (data.servers || {}) : (data.mcpServers || {});

    for (const [name, details] of Object.entries(configRoot)) {
      servers[name] = {
        name,
        command: details.command,
        args: details.args || [],
        env: details.env || {},
        disabled: details.disabled === true || details.enabled === false,
        url: details.url,
        type: details.type
      };
    }
    return servers;
  } catch (err) {
    console.error(`Error reading config for ${platformId}:`, err);
    return {};
  }
}

// Save configurations helper
function saveMcpConfig(platformId, servers) {
  const p = getPlatformPaths()[platformId];
  if (!p) return false;

  if (!isPathContained(p.configPath)) {
    throw new Error('Access denied: Path lies outside allowed boundaries.');
  }

  try {
    const dir = path.dirname(p.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (p.format === 'toml-mcp_servers') {
      const original = fs.existsSync(p.configPath) ? fs.readFileSync(p.configPath, 'utf8') : '';
      const updatedToml = writeCodexToml(original, servers);
      fs.writeFileSync(p.configPath, updatedToml, 'utf8');
      return true;
    }

    let originalData = {};
    if (fs.existsSync(p.configPath)) {
      try {
        originalData = JSON.parse(fs.readFileSync(p.configPath, 'utf8'));
      } catch (e) {}
    }

    const formattedRoot = {};
    for (const [name, s] of Object.entries(servers)) {
      const item = {};
      if (s.url) {
        item.url = s.url;
        if (s.type) item.type = s.type;
      } else {
        item.command = s.command;
        item.args = s.args || [];
        item.env = s.env || {};
        if (p.format === 'json-servers') {
          // VS Code style toggling
          item.disabled = s.disabled;
        } else {
          // Antigravity style toggling
          item.disabled = s.disabled;
        }
      }
      formattedRoot[name] = item;
    }

    if (p.format === 'json-servers') {
      originalData.servers = formattedRoot;
    } else {
      originalData.mcpServers = formattedRoot;
    }

    fs.writeFileSync(p.configPath, JSON.stringify(originalData, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error saving config for ${platformId}:`, err);
    return false;
  }
}

// Workspace Roots for SKILL.md scanning
let indexedRoots = [path.join(process.env.USERPROFILE, '.agents', 'skills')];

function scanSkills() {
  const skills = [];
  indexedRoots.forEach(root => {
    if (!fs.existsSync(root)) return;
    try {
      const files = fs.readdirSync(root);
      files.forEach(file => {
        if (file.toLowerCase() === 'skill.md' || file.endsWith('.md')) {
          const filePath = path.join(root, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            const content = fs.readFileSync(filePath, 'utf8');
            const { metadata, body } = parseFrontmatter(content);
            skills.push({
              name: metadata.name || path.basename(file, '.md'),
              fileName: file,
              path: filePath,
              description: metadata.description || '',
              tags: metadata.tags || [],
              lastModified: stat.mtime,
              body: body
            });
          }
        }
      });
    } catch (e) {
      console.error(`Error scanning skills in ${root}:`, e);
    }
  });
  return skills;
}

// SSE Connection pool for watching changes
const sseClients = [];
function notifyClients(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => client.write(message));
}

// Watchers for configurations
const watchers = [];
function setupWatchers() {
  // Clear old watchers
  watchers.forEach(w => w.close());
  watchers.length = 0;

  // Watch MCP configs
  const paths = getPlatformPaths();
  Object.entries(paths).forEach(([platformId, p]) => {
    if (fs.existsSync(p.configPath)) {
      try {
        const watcher = fs.watch(p.configPath, () => {
          console.log(`Config changed: ${platformId}`);
          notifyClients('config-change', { platformId });
        });
        watchers.push(watcher);
      } catch (e) {}
    }
  });

  // Watch Skill folders
  indexedRoots.forEach(root => {
    if (fs.existsSync(root)) {
      try {
        const watcher = fs.watch(root, () => {
          console.log(`Skills changed in: ${root}`);
          notifyClients('skills-change', scanSkills());
        });
        watchers.push(watcher);
      } catch (e) {}
    }
  });
}

// HTTP Server Logic
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Static files server (Vite builds)
  if (pathname === '/' || pathname.startsWith('/assets/')) {
    let filePath = path.join(__dirname, 'dist', pathname === '/' ? 'index.html' : pathname);
    
    // Fallback in development if dist folder doesn't exist
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Vite frontend has not been compiled yet. Run npm run build.');
      return;
    }

    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.css') contentType = 'text/css';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.png') contentType = 'image/png';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SSE Stream
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('\n');
    sseClients.push(res);
    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
    return;
  }

  // API Route: Platforms list
  if (pathname === '/api/platforms' && req.method === 'GET') {
    const paths = getPlatformPaths();
    const result = Object.entries(paths).map(([id, p]) => ({
      id,
      label: p.label,
      exists: fs.existsSync(p.configPath),
      configPath: p.configPath
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // API Route: Get servers for a platform
  if (pathname.startsWith('/api/mcp/') && req.method === 'GET') {
    const platformId = pathname.split('/')[3];
    const servers = readMcpConfig(platformId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Object.values(servers)));
    return;
  }

  // API Route: Save servers for a platform (create / edit / delete)
  if (pathname.startsWith('/api/mcp/') && (req.method === 'POST' || req.method === 'PATCH')) {
    const platformId = pathname.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body); // List or single server
        const current = readMcpConfig(platformId);

        if (Array.isArray(payload)) {
          // Full replacement
          const newMap = {};
          payload.forEach(s => { newMap[s.name] = s; });
          saveMcpConfig(platformId, newMap);
        } else {
          // Update / Add single server
          current[payload.name] = payload;
          saveMcpConfig(platformId, current);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        setupWatchers(); // update watcher triggers
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname.startsWith('/api/mcp/') && req.method === 'DELETE') {
    const parts = pathname.split('/');
    const platformId = parts[3];
    const serverName = parts[4];

    if (!platformId || !serverName) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    const current = readMcpConfig(platformId);
    if (current[serverName]) {
      delete current[serverName];
      saveMcpConfig(platformId, current);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    setupWatchers();
    return;
  }

  // API Route: Get skills list
  if (pathname === '/api/skills' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(scanSkills()));
    return;
  }

  // API Route: Save skill (create or edit)
  if (pathname === '/api/skills' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body); // { name, body, tags, description, path }
        let targetPath = payload.path;

        if (!targetPath) {
          // Create new skill in first root folder
          const root = indexedRoots[0];
          if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true });
          }
          const safeName = payload.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          targetPath = path.join(root, `${safeName}.md`);
        }

        if (!isPathContained(targetPath)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Access denied: Out of boundaries' }));
          return;
        }

        const metadata = {
          name: payload.name,
          description: payload.description || '',
          tags: payload.tags || []
        };

        const fileContent = stringifyFrontmatter(metadata, payload.body || '');
        fs.writeFileSync(targetPath, fileContent, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: targetPath }));
        setupWatchers();
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API Route: Delete skill
  if (pathname.startsWith('/api/skills/') && req.method === 'DELETE') {
    let rawPath = parsedUrl.query.path;
    if (!rawPath) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing file path');
      return;
    }

    if (!isPathContained(rawPath)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }

    if (fs.existsSync(rawPath)) {
      fs.unlinkSync(rawPath);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    setupWatchers();
    return;
  }

  // API Route: Manage indexed roots
  if (pathname === '/api/roots' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(indexedRoots));
    return;
  }

  if (pathname === '/api/roots' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body); // { roots: [...] }
        if (Array.isArray(payload.roots)) {
          indexedRoots = payload.roots.map(r => path.resolve(r)).filter(r => isPathContained(r));
          setupWatchers();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, roots: indexedRoots }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(e.message);
      }
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Start listening and initialize watchers
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Skills Windows backend running at http://127.0.0.1:${PORT}`);
  setupWatchers();
});
