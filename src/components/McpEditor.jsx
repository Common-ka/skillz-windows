import React, { useState, useEffect } from 'react';
import { Save, Trash, Plus, X, Globe, Terminal } from 'lucide-react';

export default function McpEditor({ server, onSave, onDelete, onCancel }) {
  const [name, setName] = useState('');
  const [isUrlType, setIsUrlType] = useState(false);
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState([]);
  const [env, setEnv] = useState([]); // [{ key: '', val: '' }]
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (server) {
      setName(server.name || '');
      const isUrl = !!server.url;
      setIsUrlType(isUrl);
      setUrl(server.url || '');
      setCommand(server.command || '');
      setArgs(Array.isArray(server.args) ? [...server.args] : []);
      
      const envList = [];
      if (server.env) {
        for (const [k, v] of Object.entries(server.env)) {
          envList.push({ key: k, val: v });
        }
      }
      setEnv(envList);
      setDisabled(server.disabled === true);
    } else {
      setName('');
      setIsUrlType(false);
      setUrl('');
      setCommand('');
      setArgs([]);
      setEnv([]);
      setDisabled(false);
    }
  }, [server]);

  // Argument helpers
  const handleAddArg = () => setArgs([...args, '']);
  const handleArgChange = (idx, value) => {
    const updated = [...args];
    updated[idx] = value;
    setArgs(updated);
  };
  const handleRemoveArg = (idx) => setArgs(args.filter((_, i) => i !== idx));

  // Env helpers
  const handleAddEnv = () => setEnv([...env, { key: '', val: '' }]);
  const handleEnvKeyChange = (idx, value) => {
    const updated = [...env];
    updated[idx].key = value;
    setEnv(updated);
  };
  const handleEnvValChange = (idx, value) => {
    const updated = [...env];
    updated[idx].val = value;
    setEnv(updated);
  };
  const handleRemoveEnv = (idx) => setEnv(env.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (!name.trim()) return;
    
    const envObj = {};
    env.forEach(item => {
      if (item.key.trim()) {
        envObj[item.key.trim()] = item.val;
      }
    });

    const payload = {
      name: name.trim(),
      disabled,
      ...(isUrlType ? {
        url: url.trim(),
        type: 'http'
      } : {
        command: command.trim(),
        args: args.map(a => a.trim()).filter(a => a.length > 0),
        env: envObj
      })
    };

    onSave(payload);
  };

  return (
    <div className="detail-col">
      <div className="detail-header">
        <h2 className="detail-title">{server ? `Edit Server: ${name}` : 'Add MCP Server'}</h2>
        <div className="action-row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          {server && (
            <button className="btn btn-danger" onClick={() => onDelete(server)}>
              <Trash size={16} /> Remove
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={16} /> Save Server
          </button>
        </div>
      </div>

      <div className="editor-pane" style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        <div className="form-group">
          <label className="form-label">Server ID / Name</label>
          <input 
            type="text" 
            className="form-input" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            disabled={!!server}
            placeholder="e.g. filesystem-server"
          />
        </div>

        <div className="switch-row" style={{ marginBottom: '18px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Active State</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Toggle to enable or disable this server.</div>
          </div>
          <label className="switch">
            <input 
              type="checkbox" 
              checked={!disabled} 
              onChange={(e) => setDisabled(!e.target.checked)} 
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* Server Connection Type Selection */}
        <div className="form-group">
          <label className="form-label">Connection Type</label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button 
              type="button"
              className="btn" 
              style={{ flex: 1, justifyContent: 'center', background: !isUrlType ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)', borderColor: !isUrlType ? 'var(--color-primary)' : 'var(--border-glass)' }}
              onClick={() => setIsUrlType(false)}
            >
              <Terminal size={16} /> Command Execution
            </button>
            <button 
              type="button"
              className="btn" 
              style={{ flex: 1, justifyContent: 'center', background: isUrlType ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)', borderColor: isUrlType ? 'var(--color-primary)' : 'var(--border-glass)' }}
              onClick={() => setIsUrlType(true)}
            >
              <Globe size={16} /> HTTP Endpoint
            </button>
          </div>
        </div>

        {isUrlType ? (
          /* URL Type Config */
          <div className="form-group" style={{ marginTop: '10px' }}>
            <label className="form-label">HTTP Server URL</label>
            <input 
              type="text" 
              className="form-input" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. http://localhost:8080/mcp"
            />
          </div>
        ) : (
          /* Command Execution Type Config */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
            <div className="form-group">
              <label className="form-label">Executable Command</label>
              <input 
                type="text" 
                className="form-input" 
                value={command} 
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. node, python, npx"
              />
            </div>

            {/* Arguments Section */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label">Arguments</label>
                <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={handleAddArg}>
                  <Plus size={12} /> Add Arg
                </button>
              </div>
              
              {args.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-glass)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No arguments configured
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {args.map((arg, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={arg} 
                        onChange={(e) => handleArgChange(idx, e.target.value)}
                        placeholder={`Argument #${idx + 1}`}
                      />
                      <button type="button" className="btn btn-danger" style={{ padding: '8px 10px' }} onClick={() => handleRemoveArg(idx)}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Env Variables Section */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="form-label">Environment Variables</label>
                <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={handleAddEnv}>
                  <Plus size={12} /> Add Env
                </button>
              </div>

              {env.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-glass)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No custom environment variables
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {env.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={item.key} 
                        onChange={(e) => handleEnvKeyChange(idx, e.target.value)}
                        placeholder="KEY"
                        style={{ flex: 1 }}
                      />
                      <input 
                        type="text" 
                        className="form-input" 
                        value={item.val} 
                        onChange={(e) => handleEnvValChange(idx, e.target.value)}
                        placeholder="VALUE"
                        style={{ flex: 2 }}
                      />
                      <button type="button" className="btn btn-danger" style={{ padding: '8px 10px' }} onClick={() => handleRemoveEnv(idx)}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
