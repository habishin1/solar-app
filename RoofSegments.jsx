import { useState, useEffect, useRef, useId } from 'react';
import { useSolarStore } from '../store/useSolarStore.js';
import { fetchAddressSuggestions } from '../lib/api.js';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;

function newSessionToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AddressSearch() {
  const status = useSolarStore((s) => s.status);
  const searchAddress = useSolarStore((s) => s.searchAddress);

  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const listId = useId();
  const wrapRef = useRef(null);
  const sessionRef = useRef(newSessionToken());
  // Set when the user picks a suggestion, so the resulting value change
  // doesn't immediately trigger a fresh lookup for text we just filled in.
  const skipNextFetch = useRef(false);

  // Debounced suggestion fetch.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await fetchAddressSuggestions(q, sessionRef.current);
      if (cancelled) return;
      setSuggestions(results);
      setOpen(results.length > 0);
      setHighlight(-1);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function choose(suggestion) {
    const label = suggestion.full || `${suggestion.main} ${suggestion.secondary}`.trim();
    skipNextFetch.current = true;
    setValue(label);
    setOpen(false);
    setSuggestions([]);
    searchAddress(label, suggestion.placeId);
    // A session ends at selection; the next search starts a fresh one.
    sessionRef.current = newSessionToken();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (highlight >= 0 && suggestions[highlight]) {
      choose(suggestions[highlight]);
    } else if (value.trim()) {
      setOpen(false);
      searchAddress(value.trim());
    }
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative flex w-full gap-2 md:max-w-md"
      ref={wrapRef}
    >
      <div className="relative flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 3 4.5 8.5 4.5 8.5S12.5 9 12.5 6A4.5 4.5 0 0 0 8 1.5Z"
            stroke="#8B92A0"
            strokeWidth="1.3"
          />
          <circle cx="8" cy="6" r="1.6" stroke="#8B92A0" strokeWidth="1.3" />
        </svg>

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Start typing an address"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlight >= 0 ? `${listId}-opt-${highlight}` : undefined
          }
          className="h-[46px] w-full rounded-xl border border-hair bg-card pl-9 pr-3
                     text-sm text-ink shadow-card placeholder:text-mist
                     focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />

        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-[60] mt-1.5 overflow-hidden
                       rounded-lg border border-hair bg-card shadow-lift"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.placeId || i}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // mousedown, not click: fires before the input blurs.
                  e.preventDefault();
                  choose(s);
                }}
                className={`cursor-pointer px-3 py-2.5 ${
                  i === highlight ? 'bg-brandWash' : 'bg-card'
                }`}
              >
                <div className="truncate text-sm text-ink">{s.main}</div>
                {s.secondary && (
                  <div className="truncate text-xs text-mist">{s.secondary}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="h-[46px] rounded-xl bg-dawn px-5 text-sm font-semibold text-white
                   shadow-glow transition hover:brightness-105 active:scale-[0.99]
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading' ? 'Loading…' : 'Analyze roof'}
      </button>
    </form>
  );
}
