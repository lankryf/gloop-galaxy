const PI = Math.PI;
const HALF_PI = PI / 2;
const TAU = PI * 2;

const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;
const S15 = -1 / 1307674368000;
const S17 = 1 / 355687428096000;

export function sin(x) {
  let r = x - Math.round(x / TAU) * TAU;
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return (
    r *
    (1 +
      r2 *
        (S3 + r2 * (S5 + r2 * (S7 + r2 * (S9 + r2 * (S11 + r2 * (S13 + r2 * (S15 + r2 * S17))))))))
  );
}

export function cos(x) {
  return sin(x + HALF_PI);
}

function atanSmall(z) {
  const z2 = z * z;
  let term = z;
  let sum = z;
  for (let n = 1; n < 12; n++) {
    term *= -z2;
    sum += term / (2 * n + 1);
  }
  return sum;
}

export function atan(z) {
  if (z > 1) return HALF_PI - atan(1 / z);
  if (z < -1) return -HALF_PI - atan(1 / z);
  const once = z / (1 + Math.sqrt(1 + z * z));
  const twice = once / (1 + Math.sqrt(1 + once * once));
  return 4 * atanSmall(twice);
}

export function atan2(y, x) {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

export function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}
