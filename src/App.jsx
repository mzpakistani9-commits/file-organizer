import React, { useState, useCallback } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import './App.css';

const formatSize = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

const FileItem = ({ file }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'file',
    item: file,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div ref={drag} className={`file-item ${isDragging ? 'dragging' : ''}`} title={file.path}>
      <span className="file-icon">{file.isDirectory ? '📁' : '📄'}</span>
      <span className="file-name">{file.name}</span>
      {!file.isDirectory && <span className="file-size">{formatSize(file.size)}</span>}
    </div>
  );
};

/** A real drop target: an existing subfolder tile, or the "New folder" tile. */
const FolderTile = ({ name, isNew, onDropFile }) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'file',
    canDrop: (item) => !item.isDirectory, // keep v1 simple: files only, not nested folders
    drop: (item) => onDropFile(item, name),
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  return (
    <div
      ref={drop}
      className={`folder-tile ${isOver && canDrop ? 'over' : ''} ${isNew ? 'new-folder' : ''}`}
    >
      <span className="folder-tile-icon">{isNew ? '➕📁' : '📁'}</span>
      <span className="folder-tile-name">{name}</span>
    </div>
  );
};

export default function App() {
  const [folderPath, setFolderPath] = useState('');
  const [files, setFiles] = useState([]);
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({ type: 'extension', value: '', targetFolder: '' });
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'success'|'error', text }

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const loadFolderContents = useCallback(async (p) => {
    setLoading(true);
    const contents = await window.electronAPI.getFolderContents(p);
    setFiles(contents);
    setLoading(false);
  }, []);

  const loadConfig = useCallback(async () => {
    const config = await window.electronAPI.getConfig();
    if (config.rules) setRules(config.rules);
  }, []);

  const handleSelectFolder = async () => {
    const p = await window.electronAPI.selectFolder();
    if (p) {
      setFolderPath(p);
      await loadFolderContents(p);
      await loadConfig();
    }
  };

  const topLevelFiles = files.filter((f) => !f.isDirectory);
  const topLevelFolders = files.filter((f) => f.isDirectory);

  // Drag a file onto an existing or new folder tile
  const handleDropFile = async (file, targetFolderName) => {
    const destPath = `${folderPath}/${targetFolderName}/${file.name}`;
    const result = await window.electronAPI.moveFile(file.path, destPath);

    if (result.success) {
      if (result.renamed) {
        showStatus('success', `Moved (renamed to avoid overwrite): ${file.name}`);
      } else {
        showStatus('success', `Moved: ${file.name} → ${targetFolderName}/`);
      }
      await loadFolderContents(folderPath);
    } else {
      showStatus('error', `Failed to move ${file.name}: ${result.error}`);
    }
  };

  const handleCreateFolderTile = () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (topLevelFolders.some((f) => f.name === name)) {
      showStatus('error', `Folder "${name}" already exists.`);
      return;
    }
    // We don't create it on disk until something is dropped into it —
    // but show it as a live drop target immediately.
    setFiles((prev) => [...prev, { name, path: `${folderPath}/${name}`, isDirectory: true, isPending: true }]);
    setNewFolderName('');
  };

  const handleAddRule = () => {
    if (!newRule.value || !newRule.targetFolder) {
      showStatus('error', 'Fill in both the match value and target folder.');
      return;
    }
    if (newRule.type === 'namePattern') {
      try {
        // eslint-disable-next-line no-new
        new RegExp(newRule.value);
      } catch (e) {
        showStatus('error', `"${newRule.value}" is not a valid pattern.`);
        return;
      }
    }
    setRules([...rules, newRule]);
    setNewRule({ type: 'extension', value: '', targetFolder: '' });
  };

  const handleRemoveRule = (index) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleSaveConfig = async () => {
    const result = await window.electronAPI.saveConfig({ rules, positions: {} });
    showStatus(result.success ? 'success' : 'error', result.success ? 'Rules saved.' : 'Could not save rules.');
  };

  const handleApplyRules = async () => {
    if (!rules.length) {
      showStatus('error', 'Add at least one rule first.');
      return;
    }
    setLoading(true);
    const results = await window.electronAPI.organizeFolder(folderPath, rules);
    setLoading(false);

    if (results && results.error) {
      showStatus('error', results.error);
      return;
    }
    const moved = results.filter((r) => r.moved).length;
    const failed = results.filter((r) => !r.moved && r.error);
    if (failed.length) {
      showStatus(
        'error',
        `Moved ${moved} file(s). ${failed.length} failed — e.g. "${failed[0].file}": ${failed[0].error}`
      );
    } else {
      showStatus('success', `Moved ${moved} file(s).`);
    }
    await loadFolderContents(folderPath);
  };

  const autoSchemeOptions = [
    { value: 'named', label: 'Folder per type — Images, Documents, Videos…' },
    { value: 'numbered', label: 'Numbered + type — 01_Images, 02_Documents…' },
    { value: 'extension', label: 'Folder per extension — 01_png, 02_jpg…' },
  ];
  const [autoScheme, setAutoScheme] = useState('numbered');
  const [includeOthers, setIncludeOthers] = useState(true);

  const handleAutoOrganize = async () => {
    if (!folderPath) return;
    setLoading(true);
    const result = await window.electronAPI.autoOrganize(folderPath, {
      scheme: autoScheme,
      includeOthers,
    });
    setLoading(false);

    if (result && result.error) {
      showStatus('error', result.error);
      return;
    }
    const moved = (result.results || []).filter((r) => r.moved).length;
    const failed = (result.results || []).filter((r) => !r.moved && r.error);
    const folders = (result.folders || []).join(', ');
    const msg = `Automatically moved ${moved} file(s) into: ${folders || '—'}`;
    if (failed.length) {
      showStatus('error', `${msg}. ${failed.length} failed — e.g. "${failed[0].file}": ${failed[0].error}`);
    } else {
      showStatus('success', msg);
    }
    await loadFolderContents(folderPath);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="app-container">
        <header className="header">
          <h1>📁 File Organizer</h1>
          <button className="btn-primary" onClick={handleSelectFolder}>
            Select Folder
          </button>
        </header>

        {statusMsg && <div className={`status-banner ${statusMsg.type}`}>{statusMsg.text}</div>}

        {folderPath && (
          <div className="main-content">
            <div className="left-panel">
              <div className="section">
                <h2>📂 {folderPath.split(/[/\\]/).pop()}</h2>
                <p className="hint">Drag a file below onto a folder tile on the right to move it.</p>
                {loading ? (
                  <p>Working…</p>
                ) : (
                  <div className="files-list">
                    {topLevelFiles.length === 0 && <p className="empty-message">No loose files here.</p>}
                    {topLevelFiles.map((file) => (
                      <FileItem key={file.path} file={file} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="right-panel">
              <div className="section">
                <h2>🗂️ Drop Targets</h2>
                <div className="new-folder-input">
                  <input
                    type="text"
                    placeholder="New folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolderTile()}
                  />
                  <button className="btn-secondary" onClick={handleCreateFolderTile}>
                    Add tile
                  </button>
                </div>
                <div className="folder-tiles">
                  {topLevelFolders.map((f) => (
                    <FolderTile key={f.path} name={f.name} onDropFile={handleDropFile} />
                  ))}
                  {topLevelFolders.length === 0 && (
                    <p className="empty-message">No folders yet — add one above.</p>
                  )}
                </div>
              </div>

              <div className="section rules-section">
                <h2>⚡ Auto Organize (No Rules Needed)</h2>
                <div className="rule-input">
                  <label className="hint" htmlFor="auto-scheme">Folder naming option:</label>
                  <select
                    id="auto-scheme"
                    value={autoScheme}
                    onChange={(e) => setAutoScheme(e.target.value)}
                  >
                    {autoSchemeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={includeOthers}
                      onChange={(e) => setIncludeOthers(e.target.checked)}
                    />
                    Move everything else into "Others"
                  </label>
                  <button className="btn-success" onClick={handleAutoOrganize}>
                    Auto Organize Now
                  </button>
                </div>
              </div>

              <div className="section rules-section">
                <h2>⚙️ Organization Rules</h2>
                <div className="rule-input">
                  <select
                    value={newRule.type}
                    onChange={(e) => setNewRule({ ...newRule, type: e.target.value, value: '' })}
                  >
                    <option value="extension">File Extension</option>
                    <option value="namePattern">Name Pattern (Regex)</option>
                    <option value="fileType">File Type</option>
                  </select>

                  {newRule.type === 'extension' && (
                    <input
                      type="text"
                      placeholder=".pdf"
                      value={newRule.value}
                      onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                    />
                  )}
                  {newRule.type === 'namePattern' && (
                    <input
                      type="text"
                      placeholder="invoice|receipt"
                      value={newRule.value}
                      onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                    />
                  )}
                  {newRule.type === 'fileType' && (
                    <select
                      value={newRule.value}
                      onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                    >
                      <option value="">Select type</option>
                      <option value="image">Images</option>
                      <option value="document">Documents</option>
                      <option value="video">Videos</option>
                      <option value="audio">Audio</option>
                      <option value="archive">Archives</option>
                    </select>
                  )}

                  <input
                    type="text"
                    placeholder="Target folder name"
                    value={newRule.targetFolder}
                    onChange={(e) => setNewRule({ ...newRule, targetFolder: e.target.value })}
                  />

                  <button className="btn-secondary" onClick={handleAddRule}>
                    Add Rule
                  </button>
                </div>

                <div className="rules-list">
                  {rules.map((rule, idx) => (
                    <div key={idx} className="rule-item">
                      <span>
                        <strong>{rule.type}:</strong> {rule.value} → <strong>{rule.targetFolder}/</strong>
                      </span>
                      <button className="btn-delete" onClick={() => handleRemoveRule(idx)}>
                        ✕
                      </button>
                    </div>
                  ))}
                  {rules.length === 0 && <p className="empty-message">No rules yet.</p>}
                </div>

                <div className="button-group">
                  <button className="btn-success" onClick={handleApplyRules}>
                    Apply Rules Now
                  </button>
                  <button className="btn-secondary" onClick={handleSaveConfig}>
                    Save Rules
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
}
