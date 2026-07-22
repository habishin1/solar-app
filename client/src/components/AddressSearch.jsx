import { useState } from 'react';
import { useSolarStore } from '../store/useSolarStore.js';

export default function AddressSearch() {
  const [value, setValue] = useState('');
  const status = useSolarStore((s) => s.status);
  const searchAddress = useSolarStore((s) => s.searchAddress);

  function handleSubmit(e) {
    e.preventDefault();
    if (value.trim()) searchAddress(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2 md:max-w-md">
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
          placeholder="Enter a home address"
          className="w-full rounded-lg border border-hair bg-card py-2.5 pl-9 pr-3
                     text-sm text-ink shadow-card placeholder:text-mist
                     focus:border-solar focus:outline-none focus:ring-2 focus:ring-solar/25"
        />
      </div>
      <button
        type="submit"
        disabled={status === 'loading'}
        className="rounded-lg bg-solar px-4 py-2.5 text-sm font-medium text-ink
                   shadow-card transition hover:bg-solarBright
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading' ? 'Loading…' : 'Analyze roof'}
      </button>
    </form>
  );
}
