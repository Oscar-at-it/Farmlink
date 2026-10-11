import Category from '../models/Category.js';
import Product from '../models/Product.js';

const COLORS = { Fertilizers: '#1D9E75', Pesticides: '#E24B4A', Seeds: '#BA7517', 'Animal Feeds': '#378ADD', 'Vet Products': '#D4537E', Equipment: '#6B7280', Hardware: '#7C5B2E' };
// [name, category, price, cost, unit]  (typical prices; every business edits its own)
const CATALOGUE = [
  ['DAP Fertilizer (50kg)', 'Fertilizers', 6500, 5500, 'bag'], ['CAN Fertilizer (50kg)', 'Fertilizers', 5200, 4300, 'bag'],
  ['Urea (50kg)', 'Fertilizers', 5800, 4900, 'bag'], ['NPK 17:17:17 (50kg)', 'Fertilizers', 5600, 4700, 'bag'],
  ['Foliar Feed (1L)', 'Fertilizers', 650, 450, 'bottle'],
  ['DAP Fertilizer (per kg)', 'Fertilizers', 135, 112, 'kg'], ['CAN Fertilizer (per kg)', 'Fertilizers', 108, 88, 'kg'],
  ['Urea (per kg)', 'Fertilizers', 120, 100, 'kg'], ['NPK 17:17:17 (per kg)', 'Fertilizers', 116, 96, 'kg'],
  ['Tilt Fungicide (50ml)', 'Pesticides', 450, 300, 'bottle'], ['Dithane M45 (1kg)', 'Pesticides', 650, 430, 'pack'],
  ['Lambda Cyhalothrin (1L)', 'Pesticides', 1800, 1250, 'bottle'], ['Glyphosate (1L)', 'Pesticides', 550, 370, 'bottle'],
  ['Bulldock (100ml)', 'Pesticides', 380, 250, 'bottle'], ['Ridomil (1kg)', 'Pesticides', 950, 680, 'pack'],
  ['Maize Seed (2kg)', 'Seeds', 780, 550, 'pack'], ['Tomato Seed (10g)', 'Seeds', 350, 220, 'sachet'],
  ['Onion Seed (25g)', 'Seeds', 280, 170, 'sachet'], ['Kales Seed (25g)', 'Seeds', 150, 90, 'sachet'],
  ['Sunflower Seed (1kg)', 'Seeds', 320, 210, 'pack'],
  ['Chicken Starter (50kg)', 'Animal Feeds', 4200, 3500, 'bag'], ['Chicken Grower (50kg)', 'Animal Feeds', 3900, 3200, 'bag'],
  ['Dairy Meal (50kg)', 'Animal Feeds', 3600, 3000, 'bag'], ['Pig Grower (50kg)', 'Animal Feeds', 3800, 3150, 'bag'],
  ['Newcastle Vaccine (100 doses)', 'Vet Products', 350, 220, 'vial'], ['Dewormer (250ml)', 'Vet Products', 450, 290, 'bottle'],
  ['Acaricide (1L)', 'Vet Products', 1200, 850, 'bottle'], ['Oxytocin Injection', 'Vet Products', 280, 170, 'vial'],
  ['Penicillin (100ml)', 'Vet Products', 320, 200, 'bottle'],
  ['Garden Fork', 'Equipment', 850, 600, 'piece'], ['Hand Sprayer (16L)', 'Equipment', 1800, 1300, 'piece'],
  ['Watering Can (10L)', 'Equipment', 650, 450, 'piece'],
  ['Wire Nails (per kg)', 'Hardware', 160, 120, 'kg'], ['Roofing Nails (per kg)', 'Hardware', 180, 135, 'kg'],
  ['Concrete Nails (per kg)', 'Hardware', 200, 155, 'kg'],
];

// Must run inside a business context. Stock starts at 0: the owner enters real quantities with Restock.
export async function installStarterCatalogue() {
  const ids = {};
  for (const [name, color] of Object.entries(COLORS)) ids[name] = (await Category.findOneAndUpdate({ name }, { name, color }, { upsert: true, new: true }))._id;
  await Product.insertMany(CATALOGUE.map(([name, c, price, cost, unit]) => ({
    name, category: ids[c], price, cost, unit, stockQty: 0, lowStockThreshold: unit === 'kg' ? 25 : 5,
  })));
  return CATALOGUE.length;
}
export const STARTER_COUNT = CATALOGUE.length;
