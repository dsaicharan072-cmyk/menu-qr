import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { restaurants as seedRestaurants } from './seed.js';
import { Restaurant, Owner } from './models.js';

const app = express();
const secret = process.env.JWT_SECRET || 'menuqr-development-secret';
const localRestaurants = structuredClone(seedRestaurants);
const localOwners = new Map();
let mongoReady = false;
app.use(cors()); app.use(express.json());
const normalise = restaurant => { const r = restaurant.toObject ? restaurant.toObject() : restaurant; return { ...r, id: r.id || r.slug, itemCount: (r.items || []).length }; };
const slugify = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `restaurant-${Date.now()}`;
async function startMongo() { if (!process.env.MONGODB_URI) return; await mongoose.connect(process.env.MONGODB_URI); if (await Restaurant.countDocuments() === 0) await Restaurant.insertMany(seedRestaurants); mongoReady = true; console.log('MongoDB connected'); }
startMongo().catch(error => { console.error('MongoDB unavailable; using temporary local data:', error.message); mongoReady = false; });
async function allRestaurants() { return mongoReady ? (await Restaurant.find().lean()).map(normalise) : localRestaurants.map(normalise); }
async function restaurantById(id) { return mongoReady ? Restaurant.findOne({ $or: [{ id }, { slug: id }] }) : (await allRestaurants()).find(r => r.id === id || r.slug === id); }
async function saveRestaurant(restaurant) { const record = normalise(restaurant); delete record.itemCount; delete record._id; delete record.__v; if (mongoReady) await Restaurant.findOneAndUpdate({ id: record.id }, record, { upsert: true, new: true, setDefaultsOnInsert: true }); else { const i = localRestaurants.findIndex(r => r.id === record.id); if (i < 0) localRestaurants.push(record); else localRestaurants[i] = record; } return normalise(record); }
async function ownerByEmail(email) { return mongoReady ? Owner.findOne({ email: email.toLowerCase() }).lean() : localOwners.get(email.toLowerCase()); }
async function saveOwner(email, password, restaurantId) { const owner = { email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), restaurantId }; if (mongoReady) await Owner.create(owner); else localOwners.set(owner.email, owner); }
const tokenFor = user => jwt.sign(user, secret, { expiresIn: '8h' });
const requireAuth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); next(); } catch { res.status(401).json({ message: 'Sign in is required' }); } };
const requireRestaurantOwner = (req, res, next) => req.user.role === 'admin' || req.user.restaurantId === req.params.id ? next() : res.status(403).json({ message: 'You can only manage your own restaurant menu' });
app.get('/api/health', (_, res) => res.json({ status: 'ok', database: mongoReady ? 'mongodb' : 'temporary' }));
app.post('/api/auth/login', async (req, res) => { const { email, password } = req.body; if (email === 'admin@menuqr.local' && password === 'MenuQR123!') return res.json({ token: tokenFor({ role: 'admin', email }), user: { email, role: 'admin' } }); const owner = await ownerByEmail(email || ''); if (!owner || !(await bcrypt.compare(password || '', owner.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' }); res.json({ token: tokenFor({ role: 'owner', email: owner.email, restaurantId: owner.restaurantId }), user: { email: owner.email, role: 'owner', restaurantId: owner.restaurantId } }); });
app.post('/api/auth/register', async (req, res) => { const { restaurantName, email, password } = req.body; if (!restaurantName || !email || !password) return res.status(400).json({ message: 'Restaurant name, email, and password are required' }); if (await ownerByEmail(email)) return res.status(409).json({ message: 'An account already exists for this email' }); const slug = slugify(restaurantName); if (await restaurantById(slug)) return res.status(409).json({ message: 'Choose a different restaurant name' }); const restaurant = { id: slug, slug, name: restaurantName, tagline: 'Welcome to our digital menu.', address: 'Add your restaurant address', phone: 'Add your phone number', cuisine: 'Restaurant', categories: ['Mains'], items: [], ownerEmail: email.toLowerCase() }; const savedRestaurant = await saveRestaurant(restaurant); await saveOwner(email, password, slug); res.status(201).json({ token: tokenFor({ role: 'owner', email: email.toLowerCase(), restaurantId: slug }), user: { email: email.toLowerCase(), role: 'owner', restaurantId: slug }, restaurant: savedRestaurant }); });
app.get('/api/restaurants', async (req, res) => { let records = await allRestaurants(); try { const user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); if (user.role === 'owner') records = records.filter(r => r.id === user.restaurantId); } catch {} res.json(records.map(({ items, ...restaurant }) => restaurant)); });
app.get('/api/restaurants/:id/menu', async (req, res) => { const restaurant = await restaurantById(req.params.id); if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' }); const r = normalise(restaurant); res.json({ restaurant: { id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, address: r.address, phone: r.phone }, categories: (r.categories || []).map(name => ({ name })), items: r.items || [] }); });
app.put('/api/restaurants/:id', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); if (!r) return res.status(404).json({ message: 'Restaurant not found' }); Object.assign(r, req.body, { id: r.id, slug: r.slug }); res.json(await saveRestaurant(r)); });
app.post('/api/restaurants/:id/items', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); if (!r) return res.status(404).json({ message: 'Restaurant not found' }); const item = { id: `${r.id}-${Date.now()}`, ...req.body, available: req.body.available !== false }; r.items.push(item); res.status(201).json({ item, restaurant: await saveRestaurant(r) }); });
app.put('/api/restaurants/:id/items/:itemId', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); const item = r?.items.find(entry => entry.id === req.params.itemId); if (!item) return res.status(404).json({ message: 'Dish not found' }); Object.assign(item, req.body, { id: item.id }); res.json(await saveRestaurant(r)); });
app.delete('/api/restaurants/:id/items/:itemId', requireAuth, requireRestaurantOwner, async (req, res) => { const r = await restaurantById(req.params.id); if (!r) return res.status(404).json({ message: 'Restaurant not found' }); r.items = r.items.filter(item => item.id !== req.params.itemId); res.json(await saveRestaurant(r)); });
app.listen(process.env.PORT || 4000, () => console.log('MenuQR API running'));
