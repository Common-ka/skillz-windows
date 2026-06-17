# Skills Manager for Windows (skillz-windows)

A local desktop web utility to view, edit, and manage local AI agent skills (`SKILL.md`) and MCP configuration files across VS Code, Rider, Cursor, Trae, Codex, Antigravity, and Claude Code on Windows.

## Features

- **Platform Scan:** Scans local paths for VS Code, Cursor, Rider, Trae, Codex, Claude Code, and Antigravity.
- **MCP Config Manager:** CRUD interface to add, toggle, edit, and delete tools from platform config files.
- **Skillz Editor:** WYSIWYG YAML frontmatter + Markdown editor with rich GFM previews.
- **Micro-animations & Theme:** Glassmorphic dark theme tailored with Outfit/Inter typography.

## Quick Start

Run the launcher from the repository root:

```bash
run-skills.bat
```

This will automatically:
1. Verify Node.js is installed.
2. Install npm dependencies (if not present).
3. Start the backend server on port `4188`.
4. Open the interface in your default browser.
