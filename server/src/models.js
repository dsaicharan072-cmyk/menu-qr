// MongoDB schemas kept ready for production persistence. The development API uses seed data when no database is configured.
import mongoose from 'mongoose';
export const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({name:String,slug:{type:String,unique:true},tagline:String,address:String,phone:String,cuisine:String,categories:[String],items:[mongoose.Schema.Types.Mixed]}, {timestamps:true}));
export const Category = mongoose.model('Category', new mongoose.Schema({restaurantId:{type:mongoose.Schema.Types.ObjectId,ref:'Restaurant'},name:String,sortOrder:Number}, {timestamps:true}));
export const MenuItem = mongoose.model('MenuItem', new mongoose.Schema({restaurantId:{type:mongoose.Schema.Types.ObjectId,ref:'Restaurant'},categoryId:{type:mongoose.Schema.Types.ObjectId,ref:'Category'},name:String,description:String,price:Number,image:String,vegetarian:Boolean,available:{type:Boolean,default:true},allergens:[String]}, {timestamps:true}));
