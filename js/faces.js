// Ready-made pixel faces in a hacker LED-mask style: blocky emoticon eyes and
// mouths drawn as sprites on the mask's grid. Each face is drawn into a
// mask-sized canvas so it can be sent as-is or edited on the drawing pad.

const EYES = {
  caret: [
    '.....#.....',
    '....###....',
    '...##.##...',
    '..##...##..',
    '.##.....##.',
    '##.......##',
  ],
  vee: [
    '##.......##',
    '.##.....##.',
    '..##...##..',
    '...##.##...',
    '....###....',
    '.....#.....',
  ],
  x: [
    '##.......##',
    '.##.....##.',
    '..##...##..',
    '...##.##...',
    '....###....',
    '...##.##...',
    '..##...##..',
    '.##.....##.',
    '##.......##',
  ],
  gt: [
    '##.........',
    '.###.......',
    '...###.....',
    '.....###...',
    '.......###.',
    '.....###...',
    '...###.....',
    '.###.......',
    '##.........',
  ],
  dash: [
    '###########',
    '###########',
  ],
  ring: [
    '...#####...',
    '.#########.',
    '###.....###',
    '##.......##',
    '##.......##',
    '##.......##',
    '###.....###',
    '.#########.',
    '...#####...',
  ],
  heart: [
    '.###...###.',
    '#####.#####',
    '###########',
    '###########',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '.....#.....',
  ],
  slant: [
    '####.......',
    '######.....',
    '..######...',
    '....######.',
    '......#####',
    '........###',
  ],
  question: [
    '..#######..',
    '.##.....##.',
    '........##.',
    '......###..',
    '....###....',
    '....##.....',
    '...........',
    '....##.....',
    '....##.....',
  ],
  one: [
    '....##.....',
    '...###.....',
    '..####.....',
    '....##.....',
    '....##.....',
    '....##.....',
    '....##.....',
    '....##.....',
    '..######...',
  ],
  target: [
    '###########',
    '###########',
    '##.......##',
    '##..###..##',
    '##..###..##',
    '##.......##',
    '###########',
    '###########',
  ],
};

const MOUTHS = {
  grin: [
    '##...................##',
    '.##.................##.',
    '..###.............###..',
    '....###############....',
    '......###########......',
  ],
  frown: [
    '......###########......',
    '....###############....',
    '..###.............###..',
    '.##.................##.',
    '##...................##',
  ],
  flat: [
    '#######################',
    '#######################',
  ],
  short: [
    '.....#############.....',
    '.....#############.....',
  ],
  zigzag: [
    '##...##...##...##...##.',
    '.##.####.####.####.###.',
    '..###..###..###..###...',
    '...#....#....#....#....',
  ],
  smirk: [
    '...................###.',
    '................####...',
    '...........#####.......',
    '..##########...........',
    '.##....................',
  ],
  o: [
    '........#######........',
    '.......##.....##.......',
    '.......##.....##.......',
    '........#######........',
  ],
  teeth: [
    '#######################',
    '##...#...#...#...#...##',
    '##...#...#...#...#...##',
    '#######################',
  ],
};

const mirror = (sprite) => sprite.map((row) => [...row].reverse().join(''));

function drawSprite(ctx, sprite, centreX, top, colour) {
  const left = Math.round(centreX - sprite[0].length / 2);
  ctx.fillStyle = colour;
  sprite.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') ctx.fillRect(left + x, top + y, 1, 1);
    });
  });
}

/** Faces: left eye, right eye (mirrored unless `noMirror`), mouth and colour. */
export const FACES = [
  { name: 'Happy', left: 'caret', right: 'caret', mouth: 'grin', colour: '#3cf2ff' },
  { name: 'Angry', left: 'slant', right: 'slant', mouth: 'zigzag', colour: '#ff2a2a' },
  { name: 'Dead', left: 'x', right: 'x', mouth: 'flat', colour: '#ffffff' },
  { name: 'Huh?', left: 'question', right: 'question', mouth: 'o', colour: '#ffd400', noMirror: true },
  { name: 'Wink', left: 'caret', right: 'dash', mouth: 'smirk', colour: '#ff3cf0', eyeOffsetRight: 3 },
  { name: 'Love', left: 'heart', right: 'heart', mouth: 'grin', colour: '#ff4f9a' },
  { name: '>_<', left: 'gt', right: 'gt', mouth: 'short', colour: '#ffffff' },
  { name: 'Shock', left: 'ring', right: 'ring', mouth: 'o', colour: '#ffffff' },
  { name: '1 0', left: 'one', right: 'ring', mouth: 'short', colour: '#39ff6a', noMirror: true },
  { name: 'Lock on', left: 'target', right: 'target', mouth: 'teeth', colour: '#ff8a00' },
  { name: 'Sad', left: 'vee', right: 'vee', mouth: 'frown', colour: '#4f7bff' },
  { name: 'Glitch', left: 'x', right: 'caret', mouth: 'grin', colour: '#ffffff', glitch: true },
];

/** Draw a face into a mask-sized canvas. */
export function drawFace(canvas, face, { w, h }) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // Positions are tuned for the 46 × 58 oval and scale with other sizes.
  const eyeY = Math.round(h * 0.31);
  const mouthY = Math.round(h * 0.69);
  const leftX = w * 0.29;
  const rightX = w * 0.71;

  const paint = (colour, dx = 0) => {
    const left = EYES[face.left];
    const rightBase = EYES[face.right];
    const right = face.noMirror ? rightBase : mirror(rightBase);
    drawSprite(ctx, left, leftX + dx, eyeY, colour);
    drawSprite(ctx, right, rightX + dx, eyeY + (face.eyeOffsetRight || 0), colour);
    drawSprite(ctx, MOUTHS[face.mouth], w / 2 + dx, mouthY, colour);
  };

  if (face.glitch) {
    // Split colour channels and slice a few rows sideways for a corrupted look.
    ctx.globalCompositeOperation = 'lighter';
    paint('#ff0040', -1);
    paint('#00e5ff', 1);
    ctx.globalCompositeOperation = 'source-over';
    for (const [y, shift] of [[eyeY + 2, 3], [eyeY + 6, -2], [mouthY + 1, 4]]) {
      const row = ctx.getImageData(0, y, w, 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, y, w, 2);
      ctx.putImageData(row, shift, y);
    }
    ctx.fillStyle = '#39ff6a';
    ctx.fillRect(Math.round(w * 0.2), Math.round(h * 0.52), Math.round(w * 0.25), 1);
    ctx.fillRect(Math.round(w * 0.55), Math.round(h * 0.86), Math.round(w * 0.2), 1);
  } else {
    paint(face.colour);
  }
}
