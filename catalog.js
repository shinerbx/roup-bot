// catalog.js
// Каталог предметов RoUP
// Картинки загружаются из отдельного репозитория через jsDelivr

const ITEMS_CDN =
  'https://cdn.jsdelivr.net/gh/shinerbx/roup-items@main/public/items/';

module.exports = [
  // --- АКСЕССУАРЫ ---
  {
    name: 'Baseball Cap',
    category: 'Аксессуары',
    price_stars: 5,
    image_url: `${ITEMS_CDN}baseball%20cap.webp`
  },
  {
    name: 'Black Wings',
    category: 'Аксессуары',
    price_stars: 300,
    image_url: `${ITEMS_CDN}black%20wings.webp`
  },
  {
    name: 'Bloxy Cola',
    category: 'Аксессуары',
    price_stars: 5,
    image_url: `${ITEMS_CDN}bloxy%20cola.webp`
  },
  {
    name: 'Blue Coil',
    category: 'Аксессуары',
    price_stars: 100,
    image_url: `${ITEMS_CDN}blue%20coil.webp`
  },
  {
    name: 'Blue Pumpkin',
    category: 'Аксессуары',
    price_stars: 6666,
    image_url: `${ITEMS_CDN}blue%20pumpkin.webp`
  },
  {
    name: 'Builder Hat',
    category: 'Аксессуары',
    price_stars: 250,
    image_url: `${ITEMS_CDN}builder%20hat.webp`
  },
  {
    name: 'Cheese',
    category: 'Аксессуары',
    price_stars: 25,
    image_url: `${ITEMS_CDN}cheese.webp`
  },
  {
    name: 'Classic Fedora',
    category: 'Аксессуары',
    price_stars: 1500,
    image_url: `${ITEMS_CDN}classic%20fedora.webp`
  },
  {
    name: 'Clock Headphones',
    category: 'Аксессуары',
    price_stars: 800,
    image_url: `${ITEMS_CDN}clock%20headphones.webp`
  },
  {
    name: 'Doge Head',
    category: 'Аксессуары',
    price_stars: 75,
    image_url: `${ITEMS_CDN}dog%20head.webp`
  },
  {
    name: 'Domino Hat',
    category: 'Аксессуары',
    price_stars: 10000,
    image_url: `${ITEMS_CDN}domino%20hat.webp`
  },
  {
    name: 'Ice Hair',
    category: 'Аксессуары',
    price_stars: 50,
    image_url: `${ITEMS_CDN}ice%20hair.webp`
  },
  {
    name: 'Money Hat',
    category: 'Аксессуары',
    price_stars: 15,
    image_url: `${ITEMS_CDN}money%20hat.webp`
  },
  {
    name: 'Red Coil',
    category: 'Аксессуары',
    price_stars: 100,
    image_url: `${ITEMS_CDN}red%20coil.webp`
  },
  {
    name: 'Red Hair',
    category: 'Аксессуары',
    price_stars: 10,
    image_url: `${ITEMS_CDN}red%20hair.webp`
  },
  {
    name: 'Red Sword',
    category: 'Аксессуары',
    price_stars: 500,
    image_url: `${ITEMS_CDN}red%20sword.webp`
  },
  {
    name: 'Teapot',
    category: 'Аксессуары',
    price_stars: 200,
    image_url: `${ITEMS_CDN}teapot.webp`
  },
  {
    name: 'Teddy',
    category: 'Аксессуары',
    price_stars: 75,
    image_url: `${ITEMS_CDN}teddy.webp`
  },
  {
    name: 'Valkirye',
    category: 'Аксессуары',
    price_stars: 8000,
    image_url: `${ITEMS_CDN}valkirye.webp`
  },
  {
    name: 'Ban Hammer',
    category: 'Аксессуары',
    price_stars: 3000,
    image_url: `${ITEMS_CDN}ban%20hammer.webp`
  },
  {
    name: 'Green Eye',
    category: 'Аксессуары',
    price_stars: 1337,
    image_url: `${ITEMS_CDN}green%20eye.webp`
  },
  {
    name: 'Red Head',
    category: 'Аксессуары',
    price_stars: 500,
    image_url: `${ITEMS_CDN}red%20head.webp`
  },

  // --- ЛИЦА ---
  {
    name: 'Blue Beast',
    category: 'Лица',
    price_stars: 2000,
    image_url: `${ITEMS_CDN}blue%20beast.webp`
  },
  {
    name: 'Crying Face',
    category: 'Лица',
    price_stars: 150,
    image_url: `${ITEMS_CDN}crying%20face.webp`
  },
  {
    name: 'Epic Face',
    category: 'Лица',
    price_stars: 15000,
    image_url: `${ITEMS_CDN}epic%20face.webp`
  },
  {
    name: 'Guy Face',
    category: 'Лица',
    price_stars: 15,
    image_url: `${ITEMS_CDN}guy%20face.webp`
  },
  {
    name: 'Happy Face',
    category: 'Лица',
    price_stars: 1000,
    image_url: `${ITEMS_CDN}happy%20face.webp`
  }
];
