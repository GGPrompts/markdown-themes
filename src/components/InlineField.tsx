import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FolderOpen } from 'lucide-react';

interface InlineFieldProps {
  fieldId: string;
  hint?: string;
  options?: string[];
  value: string;
  onChange: (fieldId: string, value: string) => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
  isActive?: boolean;
  onOpenFilePicker?: (mode: 'file' | 'folder', callback: (path: string) => void) => void;
}

// Detect if field should have a file/folder picker
function getPickerMode(fieldId: string, hint?: string): 'file' | 'folder' | null {
  const lower = fieldId.toLowerCase();
  const hintLower = hint?.toLowerCase() || '';

  // Check hint first for explicit indicators
  if (hintLower.includes('folder') || hintLower.includes('directory') || hintLower.includes('dir')) {
    return 'folder';
  }
  if (hintLower.includes('file') || hintLower.includes('path')) {
    return 'file';
  }

  // Then check field name
  if (lower.includes('folder') || lower.includes('directory') || lower === 'dir' || lower === 'project' || lower === 'workspace') {
    return 'folder';
  }
  if (lower.includes('file') || lower.includes('path')) {
    return 'file';
  }

  return null;
}

export function InlineField({
  fieldId,
  hint,
  options,
  value,
  onChange,
  onNavigate,
  isActive,
  onOpenFilePicker,
}: InlineFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSelect = options && options.length > 0;
  const pickerMode = getPickerMode(fieldId, hint);
  const hasFilePicker = pickerMode !== null && onOpenFilePicker;

  // Sync editValue when value prop changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Auto-focus when activated via tab navigation
  useEffect(() => {
    if (isActive && !isEditing) {
      if (isSelect) {
        handleClick();
      } else {
        setIsEditing(true);
      }
    }
  }, [isActive, isEditing, isSelect]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideTrigger = triggerRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);
      if (!isInsideTrigger && !isInsideDropdown) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleClick = () => {
    if (isSelect) {
      if (!showDropdown && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 4,
          left: rect.left,
        });
      }
      setShowDropdown(!showDropdown);
    } else {
      setIsEditing(true);
    }
  };

  const handleSelectOption = (option: string) => {
    onChange(fieldId, option);
    setShowDropdown(false);
    onNavigate?.('next');
  };

  const handleSave = () => {
    onChange(fieldId, editValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
      onNavigate?.('next');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(value); // Revert to original
      setIsEditing(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleSave();
      onNavigate?.(e.shiftKey ? 'prev' : 'next');
    }
  };

  const handleOpenPicker = () => {
    if (hasFilePicker && pickerMode) {
      onOpenFilePicker(pickerMode, (selectedPath) => {
        onChange(fieldId, selectedPath);
        setEditValue(selectedPath);
        setIsEditing(false);
      });
    }
  };

  // Calculate input width based on content
  const getWidth = () => {
    const content = editValue || hint || fieldId;
    const charWidth = 8;
    const padding = 24;
    const minWidth = 60;
    const maxWidth = 300;
    return Math.min(maxWidth, Math.max(minWidth, content.length * charWidth + padding));
  };

  const isEmpty = !value?.trim();
  const displayText = isSelect
    ? value?.trim() || fieldId
    : value?.trim() || hint || fieldId;

  // Select field with dropdown
  if (isSelect) {
    // Check if current value is a custom value (not in options)
    const isCustomValue = value && !options!.includes(value);

    return (
      <span
        className="relative inline-block align-baseline mx-0.5"
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
        }}
      >
        {/* Custom text input mode */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={fieldId}
            className="inline-block align-baseline px-2 py-0.5 text-sm rounded focus:outline-none focus:ring-2"
            style={{
              width: `${getWidth()}px`,
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
              color: 'var(--text-primary)',
            }}
          />
        ) : (
          <span
            ref={triggerRef}
            onClick={handleClick}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-sm rounded cursor-pointer transition-all ${
              isEmpty ? 'border-dashed' : ''
            }`}
            style={{
              backgroundColor: isEmpty
                ? 'var(--selection-bg, color-mix(in srgb, var(--accent) 10%, transparent))'
                : 'var(--selection-bg, color-mix(in srgb, var(--accent) 20%, transparent))',
              color: isEmpty ? 'var(--selection-text, var(--accent))' : 'var(--text-primary)',
              border: isEmpty
                ? '1px dashed color-mix(in srgb, var(--accent) 40%, transparent)'
                : '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
            title={`Select: ${fieldId}`}
          >
            {displayText}
            <ChevronDown
              size={12}
              className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            />
          </span>
        )}
        {showDropdown &&
          dropdownPos &&
          createPortal(
            <div
              ref={dropdownRef}
              className="fixed min-w-[120px] rounded-lg py-1 max-h-48 overflow-auto"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                zIndex: 9999,
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -4px rgba(0, 0, 0, 0.15)',
              }}
            >
              {options!.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(option)}
                  className="w-full text-left px-3 py-1.5 text-sm transition-colors"
                  style={{
                    backgroundColor:
                      value === option
                        ? 'var(--selection-bg, color-mix(in srgb, var(--accent) 20%, transparent))'
                        : 'transparent',
                    color: value === option ? 'var(--selection-text, var(--accent))' : 'var(--text-primary)',
                  }}
                  onMouseEnter={(e) => {
                    if (value !== option) {
                      e.currentTarget.style.backgroundColor =
                        'color-mix(in srgb, var(--accent) 10%, transparent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== option) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {option}
                </button>
              ))}
              <div
                className="mt-1 pt-1"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setIsEditing(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm transition-colors italic"
                  style={{
                    backgroundColor: isCustomValue
                      ? 'var(--selection-bg, color-mix(in srgb, var(--accent) 20%, transparent))'
                      : 'transparent',
                    color: isCustomValue ? 'var(--selection-text, var(--accent))' : 'var(--text-secondary)',
                    fontStyle: isCustomValue ? 'normal' : 'italic',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCustomValue) {
                      e.currentTarget.style.backgroundColor =
                        'color-mix(in srgb, var(--accent) 10%, transparent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCustomValue) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {isCustomValue ? `Custom: ${value}` : 'Custom...'}
                </button>
              </div>
            </div>,
            document.body
          )}
      </span>
    );
  }

  // Text input field
  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1 align-baseline mx-0.5">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={hint || fieldId}
          className="inline-block align-baseline px-2 py-0.5 text-sm rounded focus:outline-none focus:ring-2"
          style={{
            width: `${getWidth()}px`,
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
            backgroundColor: 'var(--selection-bg, color-mix(in srgb, var(--accent) 20%, transparent))',
            border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
            color: 'var(--text-primary)',
          }}
        />
        {hasFilePicker && (
          <button
            type="button"
            onClick={handleOpenPicker}
            className="p-1 rounded transition-colors"
            style={{
              color: 'var(--selection-text, var(--accent))',
              backgroundColor: 'var(--selection-bg, color-mix(in srgb, var(--accent) 10%, transparent))',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
            title={`Browse for ${pickerMode}`}
          >
            <FolderOpen size={14} />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 align-baseline mx-0.5">
      <span
        onClick={handleClick}
        className={`inline-block align-baseline px-2 py-0.5 text-sm rounded cursor-pointer transition-all ${
          isEmpty ? 'border-dashed' : ''
        }`}
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          backgroundColor: isEmpty
            ? 'var(--selection-bg, color-mix(in srgb, var(--accent) 10%, transparent))'
            : 'var(--selection-bg, color-mix(in srgb, var(--accent) 20%, transparent))',
          color: isEmpty ? 'var(--selection-text, var(--accent))' : 'var(--text-primary)',
          border: isEmpty
            ? '1px dashed color-mix(in srgb, var(--accent) 40%, transparent)'
            : '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
        }}
        title={`Click to edit: ${fieldId}`}
      >
        {displayText}
      </span>
      {hasFilePicker && (
        <button
          type="button"
          onClick={handleOpenPicker}
          className="p-1 rounded transition-colors"
          style={{
            color: 'var(--selection-text, var(--accent))',
            backgroundColor: 'var(--selection-bg, color-mix(in srgb, var(--accent) 10%, transparent))',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          }}
          title={`Browse for ${pickerMode}`}
        >
          <FolderOpen size={14} />
        </button>
      )}
    </span>
  );
}
