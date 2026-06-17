import React, { useState, useEffect } from 'react';
import { Save, Trash, Eye, Code, Plus, X } from 'lucide-react';
import { marked } from 'marked';

export default function SkillEditor({ skill, onSave, onDelete, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [body, setBody] = useState('');
  const [viewMode, setViewMode] = useState('split'); // 'split', 'edit', 'preview'

  useEffect(() => {
    if (skill) {
      setName(skill.name || '');
      setDescription(skill.description || '');
      setTagsInput(Array.isArray(skill.tags) ? skill.tags.join(', ') : '');
      setBody(skill.body || '');
    } else {
      setName('');
      setDescription('');
      setTagsInput('');
      setBody('');
    }
  }, [skill]);

  // Preprocess GitHub Alert blocks (e.g. > [!NOTE]) before passing to marked
  const renderMarkdown = (md) => {
    let html = md;
    
    // Convert > [!NOTE] blocks into html divs
    const alertRegex = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\r?\n((?:^>\s?.*\r?\n?)*)/gm;
    html = html.replace(alertRegex, (match, type, content) => {
      const cleanContent = content.split(/\r?\n/)
        .map(line => line.replace(/^>\s?/, ''))
        .join('\n');
      return `<div class="alert-box ${type.toLowerCase()}"><strong>${type}</strong><br/>${cleanContent}</div>\n`;
    });

    try {
      return { __html: marked.parse(html) };
    } catch (e) {
      return { __html: `<pre>${html}</pre>` };
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    onSave({
      ...skill,
      name,
      description,
      tags,
      body
    });
  };

  return (
    <div className="detail-col">
      <div className="detail-header">
        <h2 className="detail-title">{skill ? `Edit Skill: ${name}` : 'New Skill'}</h2>
        <div className="action-row">
          {/* View Mode Selector */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', marginRight: '10px' }}>
            <button 
              className="btn" 
              style={{ padding: '6px 12px', background: viewMode === 'edit' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none' }}
              onClick={() => setViewMode('edit')}
            >
              <Code size={16} />
            </button>
            <button 
              className="btn" 
              style={{ padding: '6px 12px', background: viewMode === 'split' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none' }}
              onClick={() => setViewMode('split')}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Split</span>
            </button>
            <button 
              className="btn" 
              style={{ padding: '6px 12px', background: viewMode === 'preview' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none' }}
              onClick={() => setViewMode('preview')}
            >
              <Eye size={16} />
            </button>
          </div>

          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          {skill && (
            <button className="btn btn-danger" onClick={() => onDelete(skill)}>
              <Trash size={16} /> Delete
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={16} /> Save Skill
          </button>
        </div>
      </div>

      <div className="editor-layout" style={{ gridTemplateColumns: viewMode === 'edit' ? '1fr' : viewMode === 'preview' ? '1fr' : '1fr 1fr' }}>
        {/* Left pane: Editor */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className="editor-pane">
            <div className="form-group">
              <label className="form-label">Skill Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. my-cool-agent-skill"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Description</label>
              <input 
                type="text" 
                className="form-input" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of what this skill does"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tags (comma-separated)</label>
              <input 
                type="text" 
                className="form-input" 
                value={tagsInput} 
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. git, debug, react"
              />
            </div>

            <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label className="form-label">Markdown Content</label>
              <textarea 
                className="form-input form-textarea code-editor" 
                value={body} 
                onChange={(e) => setBody(e.target.value)}
                placeholder="# Skill Instructions&#10;&#10;Explain what the agent should do here..."
              />
            </div>
          </div>
        )}

        {/* Right pane: Preview */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="preview-pane">
            <div className="form-label" style={{ marginBottom: '16px' }}>Live Markdown Preview</div>
            <div className="markdown-body" dangerouslySetInnerHTML={renderMarkdown(body || '*No content provided*')} />
          </div>
        )}
      </div>
    </div>
  );
}
