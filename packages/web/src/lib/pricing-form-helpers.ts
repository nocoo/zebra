/**
 * Admin pricing form helpers extracted from admin/pricing/page.tsx.
 *
 * Pure validation and conversion functions for the pricing CRUD form.
 */

import type { DbPricingRow } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PricingFormData {
  model: string;
  input: string;
  output: string;
  cached: string;
  source: string;
  note: string;
}

export const EMPTY_PRICING_FORM: PricingFormData = {
  model: "",
  input: "",
  output: "",
  cached: "",
  source: "",
  note: "",
};

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/** Convert a DB pricing row to form data for editing. */
export function rowToForm(row: DbPricingRow): PricingFormData {
  return {
    model: row.model,
    input: String(row.input),
    output: String(row.output),
    cached: row.cached != null ? String(row.cached) : "",
    source: row.source ?? "",
    note: row.note ?? "",
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate pricing form data. Returns an error message or null if valid. */
export function validatePricingForm(form: PricingFormData): string | null {
  if (!form.model.trim()) return "Model is required.";
  const input = parseFloat(form.input);
  if (isNaN(input) || input < 0) return "Input price must be a non-negative number.";
  const output = parseFloat(form.output);
  if (isNaN(output) || output < 0) return "Output price must be a non-negative number.";
  if (form.cached.trim()) {
    const cached = parseFloat(form.cached);
    if (isNaN(cached) || cached < 0) return "Cached price must be a non-negative number.";
  }
  return null;
}
