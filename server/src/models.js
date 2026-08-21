import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true }, slug: { type: String, unique: true, index: true }, name: String,
  tagline: String, address: String, phone: String, cuisine: String, categories: [String], items: [mongoose.Schema.Types.Mixed], ownerEmail: String
}, { timestamps: true });
const ownerSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true, trim: true }, passwordHash: String, restaurantId: String
}, { timestamps: true });

export const Restaurant = mongoose.models.Restaurant || mongoose.model('Restaurant', restaurantSchema);
export const Owner = mongoose.models.Owner || mongoose.model('Owner', ownerSchema);
