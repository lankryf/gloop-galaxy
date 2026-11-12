export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const BINARY_VERSION = 1;

export const MessageType = { input: 1, snapshot: 2 };

export const Kind = { ship: 1, bullet: 2, asteroid: 3, pickup: 4, well: 5 };
export const KindName = Object.fromEntries(Object.entries(Kind).map(([k, v]) => [v, k]));

export const EventType = {
  fired: 1,
  hit: 2,
  exploded: 3,
  scored: 4,
  pickup: 5,
  swallowed: 6,
  collapsed: 7,
};
export const EventName = Object.fromEntries(Object.entries(EventType).map(([k, v]) => [v, k]));

export const PICKUPS = ["shield", "rapid", "homing"];
export const WELL_TYPES = ["blackhole", "planet"];
export const SWALLOWED = ["bullet", "asteroid", "ship"];

export const ShipFlag = { thrust: 1, dead: 2, shield: 4, rapid: 8, homing: 16, bot: 32 };

const BUTTONS = ["thrust", "left", "right", "fire"];

export function packButtons(input) {
  let bits = 0;
  BUTTONS.forEach((name, i) => {
    if (input[name]) bits |= 1 << i;
  });
  return bits;
}

export function unpackButtons(bits) {
  const input = {};
  BUTTONS.forEach((name, i) => {
    input[name] = (bits & (1 << i)) !== 0;
  });
  return input;
}

export const MAX_BUTTONS = (1 << BUTTONS.length) - 1;
