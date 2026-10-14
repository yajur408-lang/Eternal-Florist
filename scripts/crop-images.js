// Crops product photos out of the operator-supplied Instagram screenshots.
// All outputs are LOW RESOLUTION; replace with originals from the owner.
const sharp = require('sharp');
const path = require('path');
const SRC = process.argv[2];
const OUT = path.join(__dirname, '..', 'public', 'img');
const crops = [
  // [source file, output name, left, top, width, height]
  ['1.webp', 'hello-kitty-combo.webp', 356, 75, 338, 410],
  ['1.webp', 'melody-flower-bag.webp', 1040, 100, 338, 385],
  ['1.webp', 'lightup-plush-bouquets.webp', 356, 530, 338, 340],
  ['1.webp', 'red-roses.webp', 1062, 640, 200, 230],
  ['2.webp', 'blue-basket-teddy.webp', 717, 40, 338, 410],
  ['2.webp', 'tulip-bouquet.webp', 1059, 255, 338, 195],
  ['2.webp', 'butterfly-blue-bouquet.webp', 375, 505, 338, 300],
  ['2.webp', 'blue-lily-bouquet.webp', 717, 520, 338, 324],
  ['2.webp', 'sunflower-bouquet.webp', 1059, 600, 225, 244],
  ['2.webp', 'lightup-butterfly-bouquet.webp', 33, 500, 338, 344],
  ['3.png', 'logo.webp', 95, 21, 194, 194],
];
(async () => {
  for (const [f, out, left, top, width, height] of crops) {
    const meta = await sharp(path.join(SRC, f)).metadata();
    const w = Math.min(width, meta.width - left), h = Math.min(height, meta.height - top);
    await sharp(path.join(SRC, f)).extract({ left, top, width: w, height: h }).webp({ quality: 90 }).toFile(path.join(OUT, out));
    console.log(out, `${w}x${h}`, `(source ${meta.width}x${meta.height})`);
  }
})();
