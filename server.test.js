const assert = require('assert');

// We can extract and test parser functions from server.js directly
const fs = require('fs');
const path = require('path');

// To import without starting the server, we read and eval the functions or load it.
// Since we want to keep it simple, we can copy the parser functions or load it by mock-stubbing http.createServer.
// Let's just create a test script that loads server.js code, or we can mock http and require it.
// A simpler way: import the file, but server.listen will be executed.
// Since server.listen is executed at the bottom, we can wrap it or just write standard tests.
// Let's extract the core functions to a separate file or write the tests by testing them.
// Let's copy the code of parser functions inside the test to test them in isolation.

// Test Simple YAML Frontmatter Parser
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

function parseCodexToml(content) {
  const servers = {};
  const lines = content.split(/\r?\n/);
  let currentServer = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('[mcp_servers.')) {
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
      currentServer = null;
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
          }
        }
        continue;
      }
    } else if (trimmed.startsWith('[') && !trimmed.startsWith('[mcp_servers')) {
      insideMcpSection = false;
      currentServerName = null;
    }

    if (insideMcpSection && currentServerName) {
      continue;
    }

    resultLines.push(line);
  }

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

// RUN TESTS
console.log('Starting backend unit tests...');

// 1. Test Frontmatter Parsing
const mockSkill = `---
name: my-skill
description: A mock skill
tags: [unit-test, node]
---
# Body Title
This is body text.`;

const parsed = parseFrontmatter(mockSkill);
assert.strictEqual(parsed.metadata.name, 'my-skill');
assert.strictEqual(parsed.metadata.description, 'A mock skill');
assert.deepStrictEqual(parsed.metadata.tags, ['unit-test', 'node']);
assert.ok(parsed.body.includes('# Body Title'));
console.log('✓ Frontmatter parsing passed');

// 2. Test Frontmatter Stringifying
const stringified = stringifyFrontmatter(parsed.metadata, parsed.body);
assert.ok(stringified.startsWith('---\nname: "my-skill"'));
assert.ok(stringified.includes('tags: ["unit-test", "node"]'));
console.log('✓ Frontmatter writing passed');

// 3. Test Codex TOML parsing
const mockToml = `model = "gpt-5"

[mcp_servers.unityMCP]
url = "http://127.0.0.1:8080/mcp"

[mcp_servers.ElevenLabs]
command = 'C:\\uvx.exe'
args = ['elevenlabs-mcp']
enabled = true

[mcp_servers.ElevenLabs.env]
API_KEY = '12345'`;

const parsedToml = parseCodexToml(mockToml);
assert.ok(parsedToml.unityMCP);
assert.strictEqual(parsedToml.unityMCP.url, 'http://127.0.0.1:8080/mcp');
assert.ok(parsedToml.ElevenLabs);
assert.strictEqual(parsedToml.ElevenLabs.command, 'C:\\uvx.exe');
assert.deepStrictEqual(parsedToml.ElevenLabs.args, ['elevenlabs-mcp']);
assert.strictEqual(parsedToml.ElevenLabs.disabled, false);
assert.strictEqual(parsedToml.ElevenLabs.env.API_KEY, '12345');
console.log('✓ Codex TOML parsing passed');

// 4. Test Codex TOML writing
parsedToml.ElevenLabs.disabled = true;
parsedToml.ElevenLabs.env.API_KEY = 'abcde';
parsedToml.newServer = { name: 'newServer', command: 'node', args: [], env: { X: 'Y' }, disabled: false };

const writtenToml = writeCodexToml(mockToml, parsedToml);
assert.ok(writtenToml.includes("enabled = false")); // ElevenLabs disabled
assert.ok(writtenToml.includes("API_KEY = 'abcde'")); // ElevenLabs env updated
assert.ok(writtenToml.includes("[mcp_servers.newServer]")); // new server added
assert.ok(writtenToml.includes("model = \"gpt-5\"")); // preserved original non-mcp properties!
console.log('✓ Codex TOML writing passed');

console.log('All backend unit tests passed successfully!');
