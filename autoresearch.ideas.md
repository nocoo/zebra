# Autoresearch Ideas: Pre-commit Performance Optimization

## Completed ✅
- [x] Run L1 tests, G1a typecheck, and G1b lint-staged in parallel — overlaps all three processes
- [x] Skip bun install --frozen-lockfile when no package.json/bun.lock changes staged — saves ~0.2s on most commits
- [x] Enable vitest caching in node_modules/.cache/vitest — reduces variance
- [x] Parallel tsc via bash script with proper exit code handling — typecheck dropped from ~4s to ~1.3s

## Attempted but Not Viable ❌
- [x] Enable incremental tsc for cli/worker/worker-read — lockfile overhead negates typecheck gains
- [x] Limit vitest threads to 4-8 — doubled test time due to pool contention
- [x] Remove json+html coverage reporters — no measurable improvement, high variance
- [x] Text-only coverage reporter — actually slower than text+json+html (5.5s vs 4.8s)
- [x] Parallel tsc using & wait in npm script — doesn't propagate exit codes (typecheck passes with errors)
- [x] vitest --poolOptions.threads.isolate=false — 5 tests fail due to shared state

## Potential Future Optimizations (Not Yet Tried)

### Low Effort
- [ ] Use `vitest --reporter=basic` for CI output (less verbose)

### Medium Effort  
- [ ] Module mocking optimization — some tests import heavy modules
- [ ] Shared test fixtures — reduce per-test setup overhead for similar tests
- [ ] Pre-compute test data instead of generating inline

### High Effort / Risky
- [ ] Test sharding across CI workers (for CI, not local dev)
- [ ] Lazy module imports in test files  
- [ ] Pre-compile test files to reduce transform time

## Measurements Summary
| State | Duration |
|-------|----------|
| Baseline (sequential) | ~8.0s |
| Parallel L1+G1a | ~6.8s |
| +Parallel G1b | ~7.4s |
| +Skip lockfile check | ~5.7s |
| +Vitest caching | ~5.5s |
| +Parallel tsc script | **~4.9s** |

**Total improvement: 39% faster (8.0s → 4.9s)**

## Notes
- Tests are highly parallelized (Duration < tests time due to parallel execution)
- collect time (~7.5s) is dominated by module loading — hard to optimize
- transform time (~4s) is esbuild, already very fast
- The main wins came from:
  1. Running independent tasks in parallel
  2. Skipping unnecessary checks (lockfile when no deps changed)
  3. Parallel TypeScript compilation across packages
