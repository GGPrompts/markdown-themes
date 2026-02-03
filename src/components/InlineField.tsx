import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface InlineFieldProps {
  fieldId: string;
  hint?: string;
  options?: string[];
  value: string;
  onChange: (fieldId: string, value: string) => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
  isActive?: boolean;
}

export function InlineField({
  fieldId,
  hint,
  options,
  value,
  onChange,
  onNavigate,
  isActive,
}: InlineFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSelect = options && options.length > 0;

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
                ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                : 'color-mix(in srgb, var(--accent) 20%, transparent)',
              color: isEmpty ? 'var(--accent)' : 'var(--text-primary)',
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
              className="fixed min-w-[120px] rounded-lg shadow-xl py-1 max-h-48 overflow-auto"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                zIndex: 9999,
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
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
                        ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                        : 'transparent',
                    color: value === option ? 'var(--accent)' : 'var(--text-primary)',
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
                      ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                      : 'transparent',
                    color: isCustomValue ? 'var(--accent)' : 'var(--text-secondary)',
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
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={hint || fieldId}
        className="inline-block align-baseline px-2 py-0.5 mx-0.5 text-sm rounded focus:outline-none focus:ring-2"
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
    );
  }

  return (
    <span
      onClick={handleClick}
      className={`inline-block align-baseline px-2 py-0.5 mx-0.5 text-sm rounded cursor-pointer transition-all ${
        isEmpty ? 'border-dashed' : ''
      }`}
      style={{
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        backgroundColor: isEmpty
          ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
          : 'color-mix(in srgb, var(--accent) 20%, transparent)',
        color: isEmpty ? 'var(--accent)' : 'var(--text-primary)',
        border: isEmpty
          ? '1px dashed color-mix(in srgb, var(--accent) 40%, transparent)'
          : '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
      }}
      title={`Click to edit: ${fieldId}`}
    >
      {displayText}
    </span>
  );
}
