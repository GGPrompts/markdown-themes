import { useState, useCallback, useMemo } from 'react';
import { Settings2, ChevronDown, ChevronUp, Plus, X, FolderOpen } from 'lucide-react';
import { FilePickerModal } from '../FilePickerModal';
import type { ChatSettings as ChatSettingsType } from '../../hooks/useAIChat';

interface ChatSettingsProps {
  settings: ChatSettingsType;
  onSettingsChange: (settings: ChatSettingsType) => void;
  disabled?: boolean;
}

const MODEL_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

const PERMISSION_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'plan', label: 'plan' },
  { value: 'acceptEdits', label: 'acceptEdits' },
];

/** Summarize active (non-default) settings as a compact string */
export function getSettingsSummary(settings?: ChatSettingsType): string | null {
  if (!settings) return null;
  const parts: string[] = [];
  if (settings.model) parts.push(settings.model);
  const dirCount = (settings.addDirs?.length || 0) + (settings.pluginDirs?.length || 0);
  if (dirCount > 0) parts.push(`${dirCount} dir${dirCount > 1 ? 's' : ''}`);
  if (settings.agent) parts.push(settings.agent);
  if (settings.appendSystemPrompt) parts.push('prompt');
  if (settings.permissionMode) parts.push(settings.permissionMode);
  return parts.length > 0 ? parts.join(' \u00b7 ') : null;
}

export function ChatSettings({ settings, onSettingsChange, disabled }: ChatSettingsProps) {
  const [expanded, setExpanded] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'addDirs' | 'pluginDirs' | null>(null);

  const summary = useMemo(() => getSettingsSummary(settings), [settings]);

  const update = useCallback((patch: Partial<ChatSettingsType>) => {
    onSettingsChange({ ...settings, ...patch });
  }, [settings, onSettingsChange]);

  const handleDirSelect = useCallback((path: string) => {
    if (!pickerTarget) return;
    const current = settings[pickerTarget] || [];
    if (!current.includes(path)) {
      update({ [pickerTarget]: [...current, path] });
    }
    setPickerTarget(null);
  }, [pickerTarget, settings, update]);

  const removeDir = useCallback((field: 'addDirs' | 'pluginDirs', path: string) => {
    const current = settings[field] || [];
    update({ [field]: current.filter(d => d !== path) });
  }, [settings, update]);

  return (
    <div
      className="border-b"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-secondary)' }}
        onClick={() => setExpanded(e => !e)}
        disabled={disabled}
      >
        <Settings2 size={13} />
        {summary ? (
          <span className="truncate" style={{ color: 'var(--text-primary)' }}>{summary}</span>
        ) : (
          <span>Settings</span>
        )}
        <span className="ml-auto shrink-0">
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3">
          {/* Row 1: Model + Permission + Teammate */}
          <div className="flex gap-2 flex-wrap">
            <SelectField
              label="Model"
              value={settings.model || ''}
              options={MODEL_OPTIONS}
              onChange={v => update({ model: v || undefined })}
            />
            <SelectField
              label="Permission"
              value={settings.permissionMode || ''}
              options={PERMISSION_OPTIONS}
              onChange={v => update({ permissionMode: v || undefined })}
            />
            <TextField
              label="Agent"
              value={settings.agent || ''}
              onChange={v => update({ agent: v || undefined })}
              placeholder="e.g. my-agent"
            />
          </div>

          {/* Directories */}
          <DirList
            label="Add directories"
            dirs={settings.addDirs || []}
            onAdd={() => setPickerTarget('addDirs')}
            onRemove={p => removeDir('addDirs', p)}
          />
          <DirList
            label="Plugin directories"
            dirs={settings.pluginDirs || []}
            onAdd={() => setPickerTarget('pluginDirs')}
            onRemove={p => removeDir('pluginDirs', p)}
          />

          {/* System prompt */}
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Append to system prompt
            </label>
            <textarea
              value={settings.appendSystemPrompt || ''}
              onChange={e => update({ appendSystemPrompt: e.target.value || undefined })}
              rows={2}
              className="w-full text-xs p-2 resize-y"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                outline: 'none',
              }}
              placeholder="Additional instructions..."
            />
          </div>
        </div>
      )}

      {/* File picker modal */}
      {pickerTarget && (
        <FilePickerModal
          mode="folder"
          title={pickerTarget === 'addDirs' ? 'Add directory' : 'Add plugin directory'}
          onSelect={handleDirSelect}
          onCancel={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-[11px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs px-1.5 py-1 cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          outline: 'none',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-[11px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-xs px-1.5 py-1 w-28"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          outline: 'none',
        }}
      />
    </div>
  );
}

function DirList({
  label,
  dirs,
  onAdd,
  onRemove,
}: {
  label: string;
  dirs: string[];
  onAdd: () => void;
  onRemove: (path: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</label>
        <button
          onClick={onAdd}
          className="p-0.5 rounded hover:opacity-80 transition-opacity"
          style={{ color: 'var(--accent)' }}
          title={`Add ${label.toLowerCase()}`}
        >
          <Plus size={12} />
        </button>
      </div>
      {dirs.length > 0 && (
        <div className="flex flex-col gap-1">
          {dirs.map(dir => (
            <div
              key={dir}
              className="flex items-center gap-1.5 text-xs px-1.5 py-0.5 group"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            >
              <FolderOpen size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                {dir}
              </span>
              <button
                onClick={() => onRemove(dir)}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
