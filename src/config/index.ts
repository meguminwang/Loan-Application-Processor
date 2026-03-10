export const config = {
  scoring: {
    weights: {
      incomeVerification: 0.30,
      incomeLevel: 0.25,
      accountStability: 0.20,
      employmentStatus: 0.15,
      debtToIncome: 0.10,
    },
    thresholds: {
      autoApprove: 75,    // score >= 75
      manualReview: 50,   // score 50-74
      // score < 50 = auto-deny
    },
    // Income verification: documented income must be within this tolerance of stated income.
    // Interpretation: 10% BELOW stated income is acceptable.
    // e.g., stated = $5000, documented = $4500 (10% below) → passes.
    // documented > stated is always fine (you earn more than you said).
    // documented < 90% of stated → fails.
    // Rationale: The lender cares if you OVERSTATED your income (risk of default).
    // Understating income is not a risk — it's conservative.
    incomeVerificationTolerance: 0.10,
  },
  deduplication: {
    windowMinutes: 5, // Same email + loan_amount within this window = duplicate
  },
  disbursement: {
    maxRetries: 3,                // Auto-retry up to 3 times before escalating
    webhookTimeoutMinutes: 30,    // Flag for manual review if no webhook within this window
  },
  admin: {
    username: "admin",
    password: "admin123", // Basic auth — fine per spec
  },
} as const;
