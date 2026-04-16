# Autoresearch: Unit Test Speed Optimization

## Objective
Optimize unit test execution speed while maintaining:
- Test validity and meaningfulness
- Test coverage ≥ 95%

## Constraints
- Do NOT cheat on benchmarks
- Do NOT overfit to benchmarks
- Atomic commits to local (no push)

## Primary Metric
- **test_time_seconds**: Total `bun run test` duration (lower is better)

## Secondary Metrics (monitored, not optimized directly)
- **test_count**: Number of passing tests (should remain stable ~3662)
- **coverage_pct**: Overall code coverage (must stay ≥ 95%)

## Benchmark Command
```bash
bun run test 2>&1 | grep -E "Duration|Tests"
```

## Current Progress
- 3662 tests, 211 test files
- **Baseline**: tests ~10.5s → **Current**: tests ~6.8-7.3s (**~35% improvement**)
- Coverage: **99.27%** (target ≥95%)

## Optimizations Applied
| Commit | Description | Impact |
|--------|-------------|--------|
| 777a639 | login.test.ts timeouts 500ms→50ms | -1.2s |
| bea8bbb | notify-command.test.ts delays 200/300ms→20/50ms | -0.4s |
| 80442e6 | sync.test.ts mtime delays 50ms→1ms | -0.3s |
| ab3c913 | upload.test.ts Retry-After 1s→0s | -1.0s |
| e2eec10 | login.test.ts server delays 100ms→10ms | -0.8s |
| 2068792 | coordinator-integration delays 50/100ms→10/20ms | -0.2s |
| b65a7b4 | session-sync + notify-command additional delays | -0.2s |

## Remaining Optimization Ideas
1. ~~Reduce fake timer timeouts~~ ✅ Done
2. Consider vitest thread pool configuration
3. Reduce module import overhead (large collect time)
4. Investigate sync.test.ts (still 700ms with 71 tests)

## Rules
- Every change must pass all tests
- Every change must maintain coverage ≥ 95%
- Commit atomically with descriptive messages
