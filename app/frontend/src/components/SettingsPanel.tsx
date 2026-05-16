import { useSettingsStore } from '../stores/settingsStore';
import type { AppSettings } from '../types';

export default function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    updateSettings({ [key]: value });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Settings
        </span>
        <button
          className="text-xs text-text-muted hover:text-text-primary"
          onClick={resetSettings}
        >
          Reset
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
        {/* Editor Settings */}
        <SettingsGroup title="Editor">
          <NumberSetting
            label="Font Size"
            value={settings.fontSize}
            min={10}
            max={32}
            onChange={(v) => update('fontSize', v)}
          />
          <SelectSetting
            label="Tab Size"
            value={String(settings.tabSize)}
            options={['2', '4', '8']}
            onChange={(v) => update('tabSize', Number(v))}
          />
          <SelectSetting
            label="Word Wrap"
            value={settings.wordWrap}
            options={['on', 'off']}
            onChange={(v) => update('wordWrap', v as 'on' | 'off')}
          />
          <ToggleSetting
            label="Minimap"
            value={settings.minimap}
            onChange={(v) => update('minimap', v)}
          />
          <ToggleSetting
            label="Auto Save"
            value={settings.autoSave}
            onChange={(v) => update('autoSave', v)}
          />
        </SettingsGroup>

        {/* AI Settings */}
        <SettingsGroup title="AI">
          <TextSetting
            label="API Key"
            value={settings.aiApiKey}
            type="password"
            placeholder="sk-..."
            onChange={(v) => update('aiApiKey', v)}
          />
          <TextSetting
            label="Base URL"
            value={settings.aiBaseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(v) => update('aiBaseUrl', v)}
          />
          <SelectSetting
            label="Model"
            value={settings.aiModel}
            options={[
              'gpt-4o-mini',
              'gpt-4o',
              'gpt-4-turbo',
              'claude-3-5-sonnet-20241022',
              'deepseek-chat',
            ]}
            onChange={(v) => update('aiModel', v)}
          />
        </SettingsGroup>

        {/* Terminal Settings */}
        <SettingsGroup title="Terminal">
          <NumberSetting
            label="Font Size"
            value={settings.terminalFontSize}
            min={10}
            max={24}
            onChange={(v) => update('terminalFontSize', v)}
          />
        </SettingsGroup>
      </div>
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TextSetting({
  label,
  value,
  placeholder,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-text-muted block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field"
      />
    </div>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-text-muted">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input-field w-20 text-center"
      />
    </div>
  );
}

function SelectSetting({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-auto"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-text-muted">{label}</label>
      <button
        className={`w-9 h-5 rounded-full transition-colors ${
          value ? 'bg-accent-blue' : 'bg-bg-active'
        }`}
        onClick={() => onChange(!value)}
      >
        <div
          className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${
            value ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  );
}
