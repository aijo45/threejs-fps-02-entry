// DUSTLINE look plan, in one place. A dusk compound: cold indigo night air against warm
// sand concrete, with one hot amber accent for the objective and one cyan for the second
// site. Lighting makes every shade the game needs; no other colour appears in the code.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#151824',
  surface: '#484d58',
  hairline: '#4b505c',
  ink: '#eae3d3',
  muted: '#8d94a3',
  accent: '#ff9a3c',
  siteB: '#57c8e8',
  crate: '#7a6a4f',
  crateDark: '#5d4f3a',
  enemy: '#c94b42',
  ground: '#2f333d',
  wallTop: '#3d414c',
};

export function shade(name) {
  return PALETTE[name];
}
