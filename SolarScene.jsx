import { useState } from 'react';
import { useSolarStore } from '../store/useSolarStore.js';

const BILL_RANGES = ['< $100', '$100–200', '$200–300', '$300+'];
const TIMELINES = ['ASAP', '1–3 months', '3–6 months', 'Just exploring'];

function ChoiceRow({ label, options, value, onChange }) {
  return (
    <div>
      <div className="mb-1.5 text-sm text-ash">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? null : opt)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              value === opt
                ? 'border-brand bg-brandWash text-brandDeep'
                : 'border-hair bg-card text-ink hover:border-hairStrong'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ash">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-hair bg-card px-3 py-2.5 text-sm
                   text-ink placeholder:text-mist
                   focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      />
    </label>
  );
}

function DesignSummary({ snapshot }) {
  if (!snapshot) return null;
  const rows = [
    ['System size', `${snapshot.systemSizeKw} kW · ${snapshot.panelCount} panels`],
    ['Yearly production', `${snapshot.yearlyKwh.toLocaleString()} kWh`],
    snapshot.estYear1Savings != null
      ? ['Est. year-1 savings', `$${snapshot.estYear1Savings.toLocaleString()}`]
      : null,
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-brand/30 bg-brandWash p-3.5">
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-brand" />
        <div className="text-[11px] font-medium uppercase tracking-wider text-brandDeep">
          Attached to your request
        </div>
      </div>
      {snapshot.address && (
        <div className="mt-1.5 truncate font-num text-xs text-ink">
          {snapshot.address}
        </div>
      )}
      <div className="mt-2.5 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-ash">{k}</span>
            <span className="tabular font-num text-ink">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stepper({ step }) {
  return (
    <div className="mb-4 flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition ${
            i <= step ? 'bg-brand' : 'bg-hair'
          }`}
        />
      ))}
    </div>
  );
}

export default function LeadCaptureModal() {
  const open = useSolarStore((s) => s.leadModalOpen);
  const status = useSolarStore((s) => s.leadStatus);
  const error = useSolarStore((s) => s.leadError);
  const closeLeadModal = useSolarStore((s) => s.closeLeadModal);
  const submitLead = useSolarStore((s) => s.submitLead);
  const buildDesignSnapshot = useSolarStore((s) => s.buildDesignSnapshot);

  const [step, setStep] = useState(0);
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [qualification, setQualification] = useState({
    homeowner: null,
    monthlyBill: null,
    timeline: null,
  });

  if (!open) return null;

  const snapshot = buildDesignSnapshot();
  const contactValid =
    contact.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email);
  const done = status === 'done';
  const uiStep = done ? 2 : step;

  function handleClose() {
    closeLeadModal();
    setTimeout(() => {
      setStep(0);
      setContact({ name: '', email: '', phone: '' });
      setQualification({ homeowner: null, monthlyBill: null, timeline: null });
    }, 200);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-hair bg-card p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <Stepper step={uiStep} />

        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brandWash">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12.5 10 17l9-10" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">
              You're all set, {contact.name.split(' ')[0]}.
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-ash">
              A solar advisor will reach out within one business day with a full
              report for the system you designed. No obligation.
            </p>
            <button
              onClick={handleClose}
              className="mt-5 w-full rounded-2xl bg-dawn px-4 py-3 font-display
                         text-sm font-semibold text-white shadow-glow transition hover:brightness-105"
            >
              Back to my design
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  {step === 0
                    ? 'Get your full solar report'
                    : 'A couple quick questions'}
                </h2>
                <p className="mt-0.5 text-xs text-mist">
                  Step {step + 1} of 2
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1 text-mist transition hover:bg-cardSub hover:text-ink"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-ash">
                  We'll send a detailed breakdown of your{' '}
                  {snapshot ? `${snapshot.systemSizeKw} kW` : ''} design and what
                  it could save you.
                </p>
                <DesignSummary snapshot={snapshot} />
                <Field
                  label="Name"
                  placeholder="Jordan Rivera"
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                />
                <Field
                  label="Email"
                  type="email"
                  placeholder="jordan@email.com"
                  value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })}
                />
                <Field
                  label="Phone (optional)"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                />
                <button
                  disabled={!contactValid}
                  onClick={() => setStep(1)}
                  className="w-full rounded-2xl bg-dawn px-4 py-3 font-display
                             text-sm font-semibold text-white shadow-glow transition hover:brightness-105
                             disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-ash">
                  Optional, but it helps us tailor your report. Skip any you'd
                  rather not answer.
                </p>
                <ChoiceRow
                  label="Do you own the home?"
                  options={['Yes', 'No']}
                  value={qualification.homeowner}
                  onChange={(v) => setQualification({ ...qualification, homeowner: v })}
                />
                <ChoiceRow
                  label="Typical monthly electric bill"
                  options={BILL_RANGES}
                  value={qualification.monthlyBill}
                  onChange={(v) => setQualification({ ...qualification, monthlyBill: v })}
                />
                <ChoiceRow
                  label="When are you looking to go brand?"
                  options={TIMELINES}
                  value={qualification.timeline}
                  onChange={(v) => setQualification({ ...qualification, timeline: v })}
                />

                {status === 'error' && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => submitLead({ contact, qualification })}
                    disabled={status === 'saving'}
                    className="flex-1 rounded-2xl bg-dawn px-4 py-3 font-display
                               text-sm font-semibold text-white shadow-glow transition hover:brightness-105
                               disabled:opacity-50"
                  >
                    {status === 'saving' ? 'Sending…' : 'Send my report'}
                  </button>
                  <button
                    onClick={() => submitLead({ contact, qualification })}
                    disabled={status === 'saving'}
                    className="rounded-xl border border-hair bg-card px-4 py-2.5 text-sm
                               text-ash transition hover:border-hairStrong disabled:opacity-50"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
