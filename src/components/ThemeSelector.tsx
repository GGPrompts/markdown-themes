import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { themes, type ThemeId } from '../themes';

interface ThemeSelectorProps {
  currentTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
}

export function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentThemeData = themes.find((t) => t.id === currentTheme) ?? themes[0];

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      // Check if click is outside both the container and the portal dropdown
      const dropdownEl = document.getElementById('theme-dropdown-portal');
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownEl || !dropdownEl.contains(target))
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  function handleKeyDown(event: React.KeyboardEvent) {
    if (!isOpen) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        setIsOpen(true);
        setFocusedIndex(themes.findIndex((t) => t.id === currentTheme));
      }
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % themes.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + themes.length) % themes.length);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focusedIndex >= 0) {
          onThemeChange(themes[focusedIndex].id);
          setIsOpen(false);
          setFocusedIndex(-1);
          buttonRef.current?.focus();
        }
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(themes.length - 1);
        break;
    }
  }

  function handleThemeSelect(themeId: ThemeId) {
    onThemeChange(themeId);
    setIsOpen(false);
    setFocusedIndex(-1);
  }

  // Compute scrollbar colors for the portal (outside theme container, CSS vars don't inherit)
  const scrollbarColors = isOpen ? (() => {
    const root = document.querySelector('[class*="theme-"]') || document.documentElement;
    const style = getComputedStyle(root);
    const border = style.getPropertyValue('--border').trim() || '#404040';
    const bg = style.getPropertyValue('--bg-secondary').trim() || '#2a2a2a';
    return `${border} ${bg}`;
  })() : '';

  const dropdownMenu = isOpen && (
    <ul
      id="theme-dropdown-portal"
      role="listbox"
      aria-activedescendant={focusedIndex >= 0 ? `theme-option-${themes[focusedIndex].id}` : undefined}
      className="fixed max-h-[320px] overflow-y-auto overflow-x-hidden"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 9999,
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
        scrollbarColor: scrollbarColors,
      }}
    >
      {themes.map((theme, index) => {
        const isSelected = theme.id === currentTheme;
        const isFocused = index === focusedIndex;

        return (
          <li
            key={theme.id}
            id={`theme-option-${theme.id}`}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleThemeSelect(theme.id)}
            onMouseEnter={() => setFocusedIndex(index)}
            className="px-3 py-2 cursor-pointer flex items-center justify-between transition-all"
            style={{
              backgroundColor: theme.bg,
              opacity: isFocused ? 1 : 0.85,
              transform: isFocused ? 'scale(1.02)' : 'scale(1)',
            }}
          >
            <span
              style={{
                color: theme.accent,
                fontFamily: theme.font,
                fontWeight: 500,
                fontSize: theme.id === 'pixel-art' ? '0.875rem' : '1.125rem',
              }}
            >
              {theme.name}
            </span>
            {isSelected && (
              <svg
                className="w-4 h-4"
                style={{ color: theme.accent }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex items-center gap-2" ref={containerRef}>
      <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Theme:
      </label>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`Theme: ${currentThemeData.name}`}
          className="px-3 py-1.5 cursor-pointer focus:outline-none flex items-center gap-2 min-w-[180px] justify-between"
          style={{
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <span
            style={{
              color: currentThemeData.accent,
              fontFamily: currentThemeData.font,
              fontWeight: 500,
            }}
          >
            {currentThemeData.name}
          </span>
          <svg
            className="w-4 h-4 transition-transform"
            style={{
              color: 'var(--text-secondary)',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && createPortal(dropdownMenu, document.body)}
      </div>
    </div>
  );
}
