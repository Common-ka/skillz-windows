import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Search, Plus, RefreshCw, Folder, CheckCircle, 
  Settings, AlertCircle, FileText, Cpu, X, BookOpen, Layers
} from 'lucide-react';
import SkillEditor from './components/SkillEditor';
import McpEditor from './components/McpEditor';

const API_BASE = ''; // Same origin

export default function App() {
  const [platforms, setPlatforms] = useState([]);
  const [skills, setSkills] = useState([]);
  const [roots, setRoots] = useState([]);
  const [newRootInput, setNewRootInput] = useState('');
  
  // Selected navigation/filters
  const [activeSection, setActiveSection] = useState('all'); // 'all', 'skills', 'mcps'
  const [activePlatform, setActivePlatform] = useState(null); // platform ID or null
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'type'

  // Selected item state
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'skill'|'mcp', data, platformId }
  const [isCreatingNew, setIsCreatingNew] = useState(null); // 'skill' or 'mcp'
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  const addToast = (msg, type = 'info') => {
    const id = Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Load platforms
      const platRes = await fetch(`${API_BASE}/api/platforms`);
      const platData = await platRes.json();
      setPlatforms(platData);

      // Load skills
      const skillRes = await fetch(`${API_BASE}/api/skills`);
      const skillData = await skillRes.json();
      setSkills(skillData);

      // Load roots
      const rootRes = await fetch(`${API_BASE}/api/roots`);
      const rootData = await rootRes.json();
      setRoots(rootData);
    } catch (e) {
      addToast('Failed to load data from server', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // SSE EventSource setup for real-time filesystem synchronization
    const eventSource = new EventSource(`${API_BASE}/api/events`);
    
    eventSource.addEventListener('config-change', (e) => {
      const { platformId } = JSON.parse(e.data);
      addToast(`Configuration reloaded: ${platformId}`, 'info');
      loadData();
    });

    eventSource.addEventListener('skills-change', (e) => {
      const updatedSkills = JSON.parse(e.data);
      setSkills(updatedSkills);
      addToast('Skills database synchronized with disk', 'success');
    });

    eventSource.onerror = () => {
      console.warn('SSE connection failed. App will rely on manual refresh.');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Fetch servers for a specific platform when selected
  const [platformServers, setPlatformServers] = useState({}); // { [platId]: [servers] }
  useEffect(() => {
    platforms.forEach(async (p) => {
      if (p.exists) {
        try {
          const res = await fetch(`${API_BASE}/api/mcp/${p.id}`);
          const servers = await res.json();
          setPlatformServers(prev => ({ ...prev, [p.id]: servers }));
        } catch (e) {}
      }
    });
  }, [platforms]);

  // Aggregate all items
  const getAllItems = () => {
    const list = [];
    
    // Add skills
    if (activeSection === 'all' || activeSection === 'skills') {
      skills.forEach(s => {
        let skillPlatform = 'global';
        if (s.path.toLowerCase().includes('.codex')) {
          skillPlatform = 'codex';
        } else if (s.path.toLowerCase().includes('.agents') || s.path.toLowerCase().includes('.antigravity')) {
          skillPlatform = 'antigravity';
        }

        if (activePlatform && activePlatform !== skillPlatform) return;

        list.push({
          id: `skill-${s.path}`,
          type: 'skill',
          name: s.name,
          desc: s.description || s.body.slice(0, 100),
          tags: [...(s.tags || []), skillPlatform === 'codex' ? 'Codex' : skillPlatform === 'antigravity' ? 'Antigravity' : 'Global'],
          raw: s
        });
      });
    }

    // Add MCP servers
    if (activeSection === 'all' || activeSection === 'mcps') {
      platforms.forEach(p => {
        if (activePlatform && activePlatform !== p.id) return;
        const servers = platformServers[p.id] || [];
        servers.forEach(s => {
          list.push({
            id: `mcp-${p.id}-${s.name}`,
            type: 'mcp',
            name: s.name,
            platformId: p.id,
            platformLabel: p.label,
            desc: s.url ? `HTTP URL: ${s.url}` : `Cmd: ${s.command} ${Array.isArray(s.args) ? s.args.join(' ') : (typeof s.args === 'string' ? s.args : '')}`,
            tags: [p.label, s.url ? 'http' : 'command'],
            disabled: s.disabled === true,
            raw: s
          });
        });
      });
    }

    // Apply Search Filter
    const filtered = list.filter(item => {
      const matchText = `${item.name} ${item.desc} ${item.tags.join(' ')}`.toLowerCase();
      return matchText.includes(searchTerm.toLowerCase());
    });

    // Apply Sorting
    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        return a.type.localeCompare(b.type);
      }
    });
  };

  const handleAddRoot = async (e) => {
    e.preventDefault();
    if (!newRootInput.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/roots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roots: [...roots, newRootInput.trim()] })
      });
      const data = await res.json();
      if (data.success) {
        setRoots(data.roots);
        setNewRootInput('');
        addToast('Folder root added successfully', 'success');
        loadData();
      }
    } catch (e) {
      addToast('Failed to add folder root', 'error');
    }
  };

  const handleRemoveRoot = async (rootToRemove) => {
    try {
      const res = await fetch(`${API_BASE}/api/roots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roots: roots.filter(r => r !== rootToRemove) })
      });
      const data = await res.json();
      if (data.success) {
        setRoots(data.roots);
        addToast('Folder root removed', 'info');
        loadData();
      }
    } catch (e) {
      addToast('Failed to remove folder root', 'error');
    }
  };

  // CRUD actions for Skills
  const handleSaveSkill = async (skillData) => {
    try {
      const res = await fetch(`${API_BASE}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skillData)
      });
      if (res.ok) {
        addToast(skillData.path ? 'Skill updated successfully' : 'New skill created', 'success');
        setSelectedItem(null);
        setIsCreatingNew(null);
        loadData();
      } else {
        const err = await res.json();
        addToast(`Error: ${err.error}`, 'error');
      }
    } catch (e) {
      addToast('Failed to save skill', 'error');
    }
  };

  const handleDeleteSkill = async (skill) => {
    if (!confirm(`Are you sure you want to delete skill "${skill.name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/skills?path=${encodeURIComponent(skill.path)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addToast('Skill deleted', 'info');
        setSelectedItem(null);
        loadData();
      }
    } catch (e) {
      addToast('Failed to delete skill', 'error');
    }
  };

  // CRUD actions for MCP Servers
  const handleSaveMcp = async (mcpData) => {
    const targetPlatform = activePlatform || selectedItem?.platformId;
    if (!targetPlatform) {
      addToast('Please select a platform first', 'warning');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/mcp/${targetPlatform}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mcpData)
      });
      if (res.ok) {
        addToast('MCP Server config saved', 'success');
        setSelectedItem(null);
        setIsCreatingNew(null);
        loadData();
      }
    } catch (e) {
      addToast('Failed to save MCP server', 'error');
    }
  };

  const handleDeleteMcp = async (server) => {
    const targetPlatform = selectedItem?.platformId;
    if (!targetPlatform) return;
    if (!confirm(`Remove MCP server "${server.name}" from ${targetPlatform}?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/mcp/${targetPlatform}/${server.name}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        addToast('MCP server configuration removed', 'info');
        setSelectedItem(null);
        loadData();
      }
    } catch (e) {
      addToast('Failed to remove MCP server', 'error');
    }
  };

  const filteredItems = getAllItems();

  return (
    <div className="app-container">
      {/* 1. Sidebar */}
      <div className="column sidebar">
        <div className="sidebar-header">
          <h1 className="brand-title">
            <Sparkles size={20} className="glow-icon" style={{ color: 'var(--color-primary)' }} />
            Skillz Windows
          </h1>
        </div>

        {/* Section Navigation */}
        <div className="sidebar-section">
          <h3 className="section-label">Library</h3>
          <ul className="nav-list">
            <li 
              className={`nav-item ${activeSection === 'all' && !activePlatform ? 'active' : ''}`}
              onClick={() => { setActiveSection('all'); setActivePlatform(null); setSelectedItem(null); setIsCreatingNew(null); }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} /> All Assets
              </span>
            </li>
            <li 
              className={`nav-item ${activeSection === 'skills' ? 'active' : ''}`}
              onClick={() => { setActiveSection('skills'); setActivePlatform(null); setSelectedItem(null); setIsCreatingNew(null); }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} /> Skillz
              </span>
              <span className="pill">{skills.length}</span>
            </li>
            <li 
              className={`nav-item ${activeSection === 'mcps' && !activePlatform ? 'active' : ''}`}
              onClick={() => { setActiveSection('mcps'); setActivePlatform(null); setSelectedItem(null); setIsCreatingNew(null); }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={16} /> MCP Servers
              </span>
            </li>
          </ul>
        </div>

        {/* Platform Config List */}
        <div className="sidebar-section">
          <h3 className="section-label">Platforms</h3>
          <div className="platform-badge-list">
            {platforms.map(p => (
              <div 
                key={p.id}
                className={`platform-row nav-item ${activePlatform === p.id ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setActivePlatform(p.id);
                  setActiveSection('mcps');
                  setSelectedItem(null);
                  setIsCreatingNew(null);
                }}
              >
                <span className="platform-info">
                  <span className={`status-dot ${p.exists ? 'active' : ''}`}></span>
                  {p.label}
                </span>
                <span className="pill" style={{ opacity: p.exists ? 1 : 0.4 }}>
                  {(platformServers[p.id] || []).length}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Folder Roots Configuration */}
        <div className="sidebar-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border-glass)' }}>
          <h3 className="section-label" style={{ marginTop: '10px' }}>Indexed Folders</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', marginBottom: '10px' }}>
            {roots.map((r, i) => {
              const base = r.split('\\').pop();
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem', border: '1px solid var(--border-glass)' }} title={r}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Folder size={12} style={{ color: 'var(--color-primary)' }} />
                    {base}
                  </span>
                  <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => handleRemoveRoot(r)}>
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
          <form onSubmit={handleAddRoot} style={{ display: 'flex', gap: '6px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Absolute folder path (e.g. C:\MyProject\.agents\skills)" 
              value={newRootInput}
              onChange={(e) => setNewRootInput(e.target.value)}
              style={{ padding: '6px 8px', fontSize: '0.78rem' }}
            />
            <button className="btn btn-primary" style={{ padding: '6px 10px' }} type="submit">Add</button>
          </form>
        </div>
      </div>

      {/* 2. Items List Column */}
      <div className="column item-list-col">
        <div className="list-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.15rem' }}>
              {activePlatform ? `${platforms.find(p=>p.id===activePlatform)?.label} Configs` : activeSection === 'skills' ? 'Skills Catalog' : 'All Configurations'}
            </h2>
            <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={loadData} title="Refresh">
              <RefreshCw size={14} className={loading ? 'loading-spinner' : ''} />
            </button>
          </div>

          <div className="search-container">
            <Search className="search-icon" />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search by name, tags, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>{filteredItems.length} items found</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              <option value="name" style={{ background: 'var(--bg-main)' }}>Sort by Name</option>
              <option value="type" style={{ background: 'var(--bg-main)' }}>Sort by Type</option>
            </select>
          </div>
        </div>

        <div className="list-scroll">
          {/* Create Button */}
          {activeSection === 'skills' && (
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', justifyContent: 'center', marginBottom: '8px' }}
              onClick={() => { setIsCreatingNew('skill'); setSelectedItem(null); }}
            >
              <Plus size={16} /> New Skill
            </button>
          )}

          {activeSection === 'mcps' && activePlatform && (
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', justifyContent: 'center', marginBottom: '8px' }}
              onClick={() => { setIsCreatingNew('mcp'); setSelectedItem(null); }}
            >
              <Plus size={16} /> Add MCP Server
            </button>
          )}

          {filteredItems.map(item => (
            <div 
              key={item.id}
              className={`list-card ${selectedItem?.id === item.id ? 'active' : ''} ${item.disabled ? 'disabled-card' : ''}`}
              style={{ opacity: item.disabled ? 0.55 : 1 }}
              onClick={() => { setSelectedItem(item); setIsCreatingNew(null); }}
            >
              <div className="card-title-row">
                <span className="card-title">{item.name}</span>
                <span className="pill" style={{ textTransform: 'uppercase', fontSize: '0.62rem', fontWeight: 700 }}>
                  {item.type}
                </span>
              </div>
              <p className="card-desc">{item.desc}</p>
              <div className="card-footer">
                {item.tags.map((tag, idx) => (
                  <span key={idx} className={`pill ${idx === 0 && item.type === 'mcp' ? 'accent' : ''}`}>{tag}</span>
                ))}
              </div>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="empty-state" style={{ marginTop: '40px' }}>
              <AlertCircle size={32} />
              <p>No configurations or skills match your search filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Detail Pane */}
      <div style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
        {isCreatingNew === 'skill' ? (
          <SkillEditor 
            skill={null}
            onSave={handleSaveSkill}
            onCancel={() => setIsCreatingNew(null)}
          />
        ) : isCreatingNew === 'mcp' ? (
          <McpEditor 
            server={null}
            onSave={handleSaveMcp}
            onCancel={() => setIsCreatingNew(null)}
          />
        ) : selectedItem ? (
          selectedItem.type === 'skill' ? (
            <SkillEditor 
              skill={selectedItem.raw}
              onSave={handleSaveSkill}
              onDelete={handleDeleteSkill}
              onCancel={() => setSelectedItem(null)}
            />
          ) : (
            <McpEditor 
              server={selectedItem.raw}
              onSave={handleSaveMcp}
              onDelete={handleDeleteMcp}
              onCancel={() => setSelectedItem(null)}
            />
          )
        ) : (
          /* Default Empty State */
          <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
            <BookOpen size={48} style={{ color: 'var(--color-primary)', marginBottom: '16px' }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
              Skills & MCP Configuration Hub
            </h2>
            <p style={{ maxWidth: '400px', color: 'var(--text-secondary)' }}>
              Select a skill item to edit its instruction markdown, or browse a platform's MCP configuration list to add, remove, and toggle tools.
            </p>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' && <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />}
            {t.type === 'error' && <AlertCircle size={16} style={{ color: 'var(--color-danger)' }} />}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
