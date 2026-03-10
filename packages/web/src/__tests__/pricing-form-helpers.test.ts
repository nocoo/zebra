import { describe, it, expect } from "vitest";
import {
  rowToForm,
  validatePricingForm,
  EMPTY_PRICING_FORM,
  type PricingFormData,
} from "@/lib/pricing-form-helpers";
import type { DbPricingRow } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// EMPTY_PRICING_FORM
// ---------------------------------------------------------------------------

describe("EMPTY_PRICING_FORM", () => {
  it("has all empty string fields", () => {
    expect(EMPTY_PRICING_FORM).toEqual({
      model: "",
      input: "",
      output: "",
      cached: "",
      source: "",
      note: "",
    });
  });
});

// ---------------------------------------------------------------------------
// rowToForm
// ---------------------------------------------------------------------------

describe("rowToForm", () => {
  const fullRow: DbPricingRow = {
    id: 1,
    model: "claude-sonnet-4-20250514",
    input: 3,
    output: 15,
    cached: 0.3,
    source: "claude-code",
    note: "Anthropic default",
    updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("converts a full DB row to form data", () => {
    const form = rowToForm(fullRow);
    expect(form).toEqual({
      model: "claude-sonnet-4-20250514",
      input: "3",
      output: "15",
      cached: "0.3",
      source: "claude-code",
      note: "Anthropic default",
    });
  });

  it("converts null cached to empty string", () => {
    const row: DbPricingRow = { ...fullRow, cached: null };
    expect(rowToForm(row).cached).toBe("");
  });

  it("converts null source to empty string", () => {
    const row: DbPricingRow = { ...fullRow, source: null };
    expect(rowToForm(row).source).toBe("");
  });

  it("converts null note to empty string", () => {
    const row: DbPricingRow = { ...fullRow, note: null };
    expect(rowToForm(row).note).toBe("");
  });

  it("converts numeric 0 values correctly", () => {
    const row: DbPricingRow = { ...fullRow, input: 0, output: 0, cached: 0 };
    const form = rowToForm(row);
    expect(form.input).toBe("0");
    expect(form.output).toBe("0");
    expect(form.cached).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// validatePricingForm
// ---------------------------------------------------------------------------

describe("validatePricingForm", () => {
  const validForm: PricingFormData = {
    model: "gpt-4o",
    input: "2.5",
    output: "10",
    cached: "1.25",
    source: "opencode",
    note: "Test",
  };

  it("returns null for a valid form", () => {
    expect(validatePricingForm(validForm)).toBeNull();
  });

  it("returns error for empty model", () => {
    expect(validatePricingForm({ ...validForm, model: "" })).toBe("Model is required.");
  });

  it("returns error for whitespace-only model", () => {
    expect(validatePricingForm({ ...validForm, model: "   " })).toBe("Model is required.");
  });

  it("returns error for non-numeric input price", () => {
    expect(validatePricingForm({ ...validForm, input: "abc" })).toBe(
      "Input price must be a non-negative number.",
    );
  });

  it("returns error for negative input price", () => {
    expect(validatePricingForm({ ...validForm, input: "-1" })).toBe(
      "Input price must be a non-negative number.",
    );
  });

  it("returns error for empty input price", () => {
    expect(validatePricingForm({ ...validForm, input: "" })).toBe(
      "Input price must be a non-negative number.",
    );
  });

  it("returns error for non-numeric output price", () => {
    expect(validatePricingForm({ ...validForm, output: "xyz" })).toBe(
      "Output price must be a non-negative number.",
    );
  });

  it("returns error for negative output price", () => {
    expect(validatePricingForm({ ...validForm, output: "-5" })).toBe(
      "Output price must be a non-negative number.",
    );
  });

  it("returns error for invalid cached price when provided", () => {
    expect(validatePricingForm({ ...validForm, cached: "bad" })).toBe(
      "Cached price must be a non-negative number.",
    );
  });

  it("returns error for negative cached price", () => {
    expect(validatePricingForm({ ...validForm, cached: "-0.5" })).toBe(
      "Cached price must be a non-negative number.",
    );
  });

  it("accepts empty cached price (optional field)", () => {
    expect(validatePricingForm({ ...validForm, cached: "" })).toBeNull();
  });

  it("accepts whitespace-only cached price (treated as empty)", () => {
    expect(validatePricingForm({ ...validForm, cached: "   " })).toBeNull();
  });

  it("accepts zero as a valid price", () => {
    const zeroForm = { ...validForm, input: "0", output: "0", cached: "0" };
    expect(validatePricingForm(zeroForm)).toBeNull();
  });

  it("accepts form without source or note (optional fields)", () => {
    const minimal: PricingFormData = {
      model: "test-model",
      input: "1",
      output: "2",
      cached: "",
      source: "",
      note: "",
    };
    expect(validatePricingForm(minimal)).toBeNull();
  });
});
