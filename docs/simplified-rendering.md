# Simplified rendering architecture

Lambda calculus remains the source of mathematical state; browser rendering is intentionally conventional.

- The VPS lambda evaluator computes clock/cube key states.
- The browser samples evaluator state at a bounded rate instead of following every reduction.
- Cube geometry is interpolated between lambda-produced keyframes with requestAnimationFrame/PixiJS.
- The lambda line display samples the active term at a low visual rate and holds it between samples.
- Raw reducer dumps are not part of the normal page.
- No animation history is retained; the client keeps only current/previous targets and a tiny term cache.

This preserves lambda-based mathematics while keeping timing, interpolation, drawing, and UI animation in the normal rendering layer.
