import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

const STRIP_PREFIXES = /^(PT\.?\s*|CV\.?\s*|UD\.?\s*|TBK\.?\s*|LTD\.?\s*|CO\.?\s*)/i;

function normalize(text: string): string {
  return text.replace(STRIP_PREFIXES, '').trim().toLowerCase();
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  const debouncedFilter = useDebounce(filter, 200);

  const filtered = useMemo(() => {
    if (!debouncedFilter) return options;
    const q = debouncedFilter.toLowerCase().trim();
    const normalizedQ = normalize(debouncedFilter);
    return options.filter(opt => {
      const raw = opt.label.toLowerCase();
      const stripped = normalize(opt.label);
      return raw.includes(q) || stripped.includes(normalizedQ);
    });
  }, [options, debouncedFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFilter('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
      if (value && !filter) {
        const idx = filtered.findIndex(o => o.value === value);
        if (idx !== -1) {
          setHighlightedIndex(idx);
          scrollToIndex(idx);
        }
      }
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filter]);

  const scrollToIndex = (index: number) => {
    if (listRef.current) {
      const el = listRef.current.children[index] as HTMLElement;
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setFilter('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setFilter('');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev < filtered.length - 1 ? prev + 1 : prev;
        scrollToIndex(next);
        return next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev > 0 ? prev - 1 : 0;
        scrollToIndex(next);
        return next;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        handleSelect(filtered[highlightedIndex].value);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setFilter('');
          }
        }}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-left flex items-center justify-between ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-500'
        } ${className}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type to search..."
                className="flex-1 py-1.5 text-sm bg-transparent border-0 outline-none focus:ring-0"
              />
              {filter && (
                <button type="button" onClick={() => setFilter('')} className="p-0.5">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
          </div>
          <div
            ref={listRef}
            className="max-h-56 overflow-y-auto"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400 text-center">No results found</div>
            ) : (
              filtered.map((option, index) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`px-3 py-2 cursor-pointer text-sm ${
                    index === highlightedIndex
                      ? 'bg-blue-500 text-white'
                      : option.value === value
                      ? 'bg-blue-50 text-blue-900'
                      : 'text-gray-800 hover:bg-gray-50'
                  }`}
                  role="option"
                  aria-selected={option.value === value}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
