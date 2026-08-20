import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { restaurants as seedRestaurants } from './seed.js';

const app = express();
// The hosted API reads and writes the shared restaurant database.
const secret = process.env.JWT_SECRET || 'menuqr-development-secret';
const localRestaurants = structuredClone(seedRestaurants);
const localOwners = new Map();
let pool;
app.use(cors()); app.use(express.json());
const normalise = restaurant => ({ ...restaurant, id: restaurant.id || restaurant.slug, itemCount: (restaurant.items || []).length });
const slugify = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `restaurant-${Date.now()}`;

async function startDatabase() {
  const databaseUrl = process.env.MENUQR_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) return;
  pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } });
  pool.on('error', (err) => { console.error('Unexpected error on idle pg client:', err.message); });
  await pool.query('CREATE TABLE IF NOT EXISTS menuqr_restaurants (id TEXT PRIMARY KEY, data JSONB NOT NULL)');
  await pool.query('CREATE TABLE IF NOT EXISTS menuqr_owners (email TEXT PRIMARY KEY, password_hash TEXT NOT NULL, restaurant_id TEXT NOT NULL)');
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM menuqr_restaurants');
  if (count.rows[0].count === 0) for (const restaurant of seedRestaurants) await pool.query('INSERT INTO menuqr_restaurants (id, data) VALUES ($1, $2)', [restaurant.id, restaurant]);
  console.log('PostgreSQL connected');
}
startDatabase().catch(error => { console.error('PostgreSQL unavailable; using temporary local data:', error.message); pool = undefined; });
async function allRestaurants() { if (!pool) return localRestaurants.map(normalise); const result = await pool.query('SELECT data FROM menuqr_restaurants ORDER BY id'); return result.rows.map(row => normalise(row.data)); }
async function restaurantById(id) { return (await allRestaurants()).find(r => r.id === id || r.slug === id); }
async function saveRestaurant(restaurant) { restaurant.itemCount = (restaurant.items || []).length; if (pool) await pool.query('INSERT INTO menuqr_restaurants (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [restaurant.id, restaurant]); else { const i = localRestaurants.findIndex(r => r.id === restaurant.id); if (i < 0) localRestaurants.push(restaurant); else localRestaurants[i] = restaurant; } return normalise(restaurant); }
async function ownerByEmail(email) { if (!pool) return localOwners.get(email); const result = await pool.query('SELECT email, password_hash AS "passwordHash", restaurant_id AS "restaurantId" FROM menuqr_owners WHERE email=$1', [email]); return result.rows[0]; }
async function saveOwner(email, password, restaurantId) { const passwordHash = await bcrypt.hash(password, 10); if (pool) await pool.query('INSERT INTO menuqr_owners (email, password_hash, restaurant_id) VALUES ($1, $2, $3)', [email, passwordHash, restaurantId]); else localOwners.set(email, { passwordHash, restaurantId }); }
const tokenFor = user => jwt.sign(user, secret, { expiresIn: '8h' });
const requireAuth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); next(); } catch { res.status(401).json({ message: 'Sign in is required' }); } };
const requireRestaurantOwner = (req, res, next) => { if (req.user.role === 'admin' || req.user.restaurantId === req.params.id) return next(); res.status(403).json({ message: 'You can only manage your own restaurant menu' }); };

app.get('/api/health', (_, res) => res.json({ status: 'ok', database: Boolean(pool) }));
app.post('/api/auth/login', async (req, res) => { const { email, password } = req.body; if (email === 'admin@menuqr.local' && password === 'MenuQR123!') return res.json({ token: tokenFor({ role: 'admin', email }), user: { email, role: 'admin' } }); const owner = await ownerByEmail(email); if (!owner || !(await bcrypt.compare(password || '', owner.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' }); res.json({ token: tokenFor({ role: 'owner', email, restaurantId: owner.restaurantId }), user: { email, role: 'owner', restaurantId: owner.restaurantId } }); });
app.post('/api/auth/register', async (req, res) => { const { restaurantName, email, password } = req.body; if (!restaurantName || !email || !password) return res.status(400).json({ message: 'Restaurant name, email, and password are required' }); if (await ownerByEmail(email)) return res.status(409).json({ message: 'An account already exists for this email' }); const slug = slugify(restaurantName); if (await restaurantById(slug)) return res.status(409).json({ message: 'Choose a different restaurant name' }); const restaurant = { id: slug, slug, name: restaurantName, tagline: 'Welcome to our digital menu.', address: 'Add your restaurant address', phone: 'Add your phone number', cuisine: 'Restaurant', categories: ['Mains'], items: [], ownerEmail: email }; await saveRestaurant(restaurant); await saveOwner(email, password, slug); res.status(201).json({ token: tokenFor({ role: 'owner', email, restaurantId: slug }), user: { email, role: 'owner', restaurantId: slug } }); });
app.get('/api/restaurants', async (req, res) => { let records = await allRestaurants(); try { const user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); if (user.role === 'owner') records = records.filter(r => r.id === user.restaurantId); } catch {} res.json(records.map(({ items, ...restaurant }) => restaurant)); });
app.get('/api/restaurants/:id/menu', async (req, res) => { const r = await restaurantById(req.params.id); if (!r) return res.status(404).json({ message: 'Restaurant not found' }); res.json({ restaurant: { id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, address: r.address, phone: r.phone }, categories: (r.categories || []).map(name => ({ name })), items: r.items || [] }); });
app.post('/api/restaurants', requireAuth, async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator access required' }); const slug = req.body.slug || slugify(req.body.name || ''); if (!req.body.name || await restaurantById(slug)) return res.status(400).json({ message: 'A unique restaurant name is required' }); const restaurant = { id: slug, slug, name: req.body.name, tagline: req.body.tagline || 'Welcome to our menu.', address: req.body.address || '', phone: req.body.phone || '', cuisine: req.body.cuisine || '', categories: [], items: [] }; res.status(201).json(await saveRestaurant(restaurant)); });
app.put('/api/restaurants/:id', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); if (!r) return res.status(404).json({ message: 'Restaurant not found' }); Object.assign(r, req.body, { id: r.id, slug: r.slug }); res.json(await saveRestaurant(r)); });
app.post('/api/restaurants/:id/items', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); if (!r) return res.status(404).json({ message: 'Restaurant not found' }); const item = { id: `${r.id}-${Date.now()}`, ...req.body, available: req.body.available !== false }; r.items.push(item); res.status(201).json({ item, restaurant: await saveRestaurant(r) }); });
app.put('/api/restaurants/:id/items/:itemId', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); const item = r?.items.find(entry => entry.id === req.params.itemId); if (!item) return res.status(404).json({ message: 'Dish not found' }); Object.assign(item, req.body, { id: item.id }); res.json(await saveRestaurant(r)); });
app.delete('/api/restaurants/:id/items/:itemId', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); if (!r) return res.status(404).json({ message: 'Restaurant not found' }); r.items = r.items.filter(item => item.id !== req.params.itemId); res.json(await saveRestaurant(r)); });
app.delete('/api/restaurants/:id', requireAuth, async (req, res) => { if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator access required' }); if (pool) { const result = await pool.query('DELETE FROM menuqr_restaurants WHERE id=$1', [req.params.id]); if (!result.rowCount) return res.status(404).json({ message: 'Restaurant not found' }); } else { const i = localRestaurants.findIndex(r => r.id === req.params.id); if (i < 0) return res.status(404).json({ message: 'Restaurant not found' }); localRestaurants.splice(i, 1); } res.status(204).end(); });
app.listen(process.env.PORT || 4000, () => console.log('MenuQR API running'));
