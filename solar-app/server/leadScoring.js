/**
 * Lead scoring.
 *
 * WHY THIS IS RULES-BASED AND NOT A TRAINED MODEL (yet)
 * -----------------------------------------------------
 * A machine-learning model needs labelled examples: leads where you already
 * know the outcome ("became a customer" / "didn't"). Below roughly 300-500
 * labelled leads, a trained model doesn't beat sensible rules -- it just
 * overfits and produces confident nonsense. So this file does two jobs:
 *
 *   1. scoreLead()      -- usable from lead #1, using signals the solar
 *                          industry already knows predict conversion.
 *   2. extractFeatures() -- writes those same signals into a numeric vector
 *                          on every lead, so that once you HAVE volume you
 *                          can train a real model on your own history
 *                          without having to go back and re-derive data you
 *                          never recorded.
 *
 * Every stored lead also gets an `outcome` field (null until you fill it
 * in). That field is the training label. See "UPGRADE PATH" at the bottom.
 */

// ---------------------------------------------------------------------------
// 1. Scoring (usable immediately)
// ---------------------------------------------------------------------------

const BILL_POINTS = {
  '$300+': 26,
  '$200–300': 19,
  '$100–200': 10,
  '< $100': 2,
};

const TIMELINE_POINTS = {
  ASAP: 25,
  '1–3 months': 18,
  '3–6 months': 9,
  'Just exploring': 2,
};

export function scoreLead({ contact = {}, qualification = {}, design = {} }) {
  let score = 0;
  const reasons = [];

  // Homeownership is the single hardest gate in residential solar: a
  // non-owner usually cannot authorize an installation at all.
  if (qualification.homeowner === 'Yes') {
    score += 28;
    reasons.push('Homeowner');
  } else if (qualification.homeowner === 'No') {
    score -= 25;
    reasons.push('Not the homeowner — likely unqualified');
  }

  // Bigger bill = more to save = stronger economic case.
  const billPts = BILL_POINTS[qualification.monthlyBill];
  if (billPts != null) {
    score += billPts;
    reasons.push(`Bill ${qualification.monthlyBill}`);
  }

  // Purchase intent.
  const timePts = TIMELINE_POINTS[qualification.timeline];
  if (timePts != null) {
    score += timePts;
    reasons.push(`Timeline: ${qualification.timeline}`);
  }

  // Giving a phone number is a real friction signal -- it's optional in the
  // form, so volunteering it indicates willingness to be contacted.
  if (contact.phone) {
    score += 10;
    reasons.push('Gave phone number');
  }

  // Larger designed systems mean a larger deal and usually a more engaged
  // visitor. Capped so it can't dominate the qualifying answers.
  const kw = Number(design.systemSizeKw) || 0;
  if (kw >= 12) {
    score += 10;
    reasons.push(`Large system designed (${kw} kW)`);
  } else if (kw >= 7) {
    score += 6;
    reasons.push(`Mid-size system designed (${kw} kW)`);
  } else if (kw > 0) {
    score += 2;
  }

  // Someone who trimmed the array away from the default max layout actually
  // engaged with the tool rather than just hitting the button.
  if (
    design.panelCount != null &&
    design.maxPanelCount != null &&
    design.panelCount !== design.maxPanelCount
  ) {
    score += 5;
    reasons.push('Customized the panel layout');
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  let tier;
  if (clamped >= 70) tier = 'hot';
  else if (clamped >= 45) tier = 'warm';
  else tier = 'cold';

  return { score: clamped, tier, reasons };
}

// ---------------------------------------------------------------------------
// 2. Feature extraction (the groundwork for real ML later)
// ---------------------------------------------------------------------------

/**
 * Turns a lead into a flat numeric vector. Stored on every lead so that a
 * future training run has consistent inputs going back to day one.
 *
 * Keep the key order stable -- if you add a feature, append it to the end
 * rather than inserting in the middle, so older rows stay comparable.
 */
export function extractFeatures({ contact = {}, qualification = {}, design = {} }) {
  const billIndex = { '< $100': 1, '$100–200': 2, '$200–300': 3, '$300+': 4 };
  const timeIndex = {
    'Just exploring': 1,
    '3–6 months': 2,
    '1–3 months': 3,
    ASAP: 4,
  };

  return {
    is_homeowner: qualification.homeowner === 'Yes' ? 1 : 0,
    homeowner_known: qualification.homeowner ? 1 : 0,
    bill_bracket: billIndex[qualification.monthlyBill] ?? 0,
    timeline_bracket: timeIndex[qualification.timeline] ?? 0,
    gave_phone: contact.phone ? 1 : 0,
    system_size_kw: Number(design.systemSizeKw) || 0,
    yearly_kwh: Number(design.yearlyKwh) || 0,
    est_year1_savings: Number(design.estYear1Savings) || 0,
    payback_years: Number(design.paybackYears) || 0,
    panel_count: Number(design.panelCount) || 0,
    customized_layout:
      design.panelCount != null &&
      design.maxPanelCount != null &&
      design.panelCount !== design.maxPanelCount
        ? 1
        : 0,
  };
}

/**
 * UPGRADE PATH -- when you're ready for actual machine learning
 * -------------------------------------------------------------
 * 1. Keep collecting leads. Every one already stores `features` and an
 *    empty `outcome`.
 * 2. As deals close (or don't), set `outcome` to 1 (became a customer) or
 *    0 (didn't). This is the part no algorithm can do for you -- the
 *    labels have to come from your sales reality.
 * 3. At ~300-500 labelled leads, export them and train a simple model
 *    (logistic regression is the right first choice: it's interpretable,
 *    resistant to overfitting on small data, and tells you the weight of
 *    each signal). Gradient boosting is worth trying past ~2000 rows.
 * 4. Replace the body of scoreLead() with a call to the trained model,
 *    keeping the same inputs and the same {score, tier, reasons} output
 *    so nothing else in the app has to change.
 *
 * Do not skip step 2. Unlabelled leads cannot train anything, and a model
 * trained on a few dozen rows will be worse than the rules above while
 * appearing more authoritative.
 */
